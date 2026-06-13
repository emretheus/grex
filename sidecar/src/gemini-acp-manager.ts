// SessionManager for the Gemini CLI driven in ACP (Agent Client Protocol)
// mode: `gemini --acp`, JSON-RPC 2.0 over stdio (newline-delimited). Mirrors
// the role `codex-app-server-manager.ts` plays for Codex — spawn the agent
// subprocess, speak its protocol, and bridge streaming + permission messages
// to the sidecar event model.
//
// ⚠️ FIRST CUT — needs runtime validation against a live `gemini --acp`.
// Known boundaries (intentional, tracked):
//   - Streamed `session/update` events are forwarded as namespaced
//     `gemini/<type>` passthrough. The Rust pipeline has no Gemini adapter yet,
//     so rich rendering (tool cards, plan, thoughts) is a follow-up; plain
//     assistant text rides `gemini/agent_message_chunk`.
//   - Permission requests are AUTO-APPROVED (Grex runs full-access by
//     default; Gemini's plan mode is disabled in the capability matrix).
//   - Resume across sidecar restarts is not reattached (new ACP session each
//     process); within a process, session continuity holds.
//   - title generation / slash commands / steer / context usage are not
//     implemented (capability flags are off).

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createInterface, type Interface } from "node:readline";
import type { SidecarEmitter } from "./emitter.js";
import { errorDetails, logger } from "./logger.js";
import type {
	GenerateTitleOptions,
	ListSlashCommandsParams,
	ProviderModelInfo,
	SendMessageParams,
	SessionManager,
	SlashCommandInfo,
	UserInputResolution,
} from "./session-manager.js";

const GEMINI_PERMISSION_PREFIX = "gemini-";
/** ACP protocol version Grex speaks. */
const ACP_PROTOCOL_VERSION = 1;

// ── Spawn resolution ─────────────────────────────────────────────────────────
// 1. `GREX_GEMINI_BIN_PATH` — set by the Tauri host in release builds,
//    pointing at the staged Gemini CLI launcher under the app's vendor tree.
// 2. `@google/gemini-cli` resolved from node_modules, run under the current
//    runtime (bun) — dev + `bun test`.
// 3. Fall back to `gemini` on PATH.
export function resolveGeminiSpawn(): { command: string; args: string[] } {
	const override = process.env.GREX_GEMINI_BIN_PATH;
	if (override) {
		return { command: override, args: ["--experimental-acp"] };
	}
	try {
		const require = createRequire(import.meta.url);
		const entry = require.resolve("@google/gemini-cli");
		if (existsSync(entry)) {
			return {
				command: process.execPath,
				args: [entry, "--experimental-acp"],
			};
		}
	} catch {
		// package not present — fall through to PATH.
	}
	return { command: "gemini", args: ["--experimental-acp"] };
}

// ── JSON-RPC framing ─────────────────────────────────────────────────────────

interface JsonRpcMessage {
	readonly jsonrpc?: string;
	readonly id?: number | string | null;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: { code: number; message: string; data?: unknown };
}

type RequestHandler = (
	method: string,
	params: unknown,
) => Promise<unknown> | unknown;
type NotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
}

/**
 * Minimal newline-delimited JSON-RPC 2.0 peer over a child process's stdio.
 * Handles outbound requests/notifications and inbound
 * requests/notifications/responses.
 */
class AcpConnection {
	private readonly child: ChildProcess;
	private readonly reader: Interface;
	private readonly pending = new Map<number, PendingRequest>();
	private nextId = 1;
	private closed = false;

	constructor(
		command: string,
		args: string[],
		private readonly onRequest: RequestHandler,
		private readonly onNotification: NotificationHandler,
		private readonly onExit: (reason: string) => void,
	) {
		this.child = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});
		this.child.on("error", (err) => this.fail(`spawn failed: ${err.message}`));
		this.child.on("exit", (code) =>
			this.fail(`gemini --acp exited (code ${code ?? "null"})`),
		);
		this.child.stderr?.on("data", (chunk: Buffer) => {
			logger.debug(`[gemini-acp stderr] ${chunk.toString().trimEnd()}`);
		});
		this.reader = createInterface({ input: this.child.stdout! });
		this.reader.on("line", (line) => this.handleLine(line));
	}

	private fail(reason: string): void {
		if (this.closed) return;
		this.closed = true;
		for (const [, p] of this.pending) p.reject(new Error(reason));
		this.pending.clear();
		this.onExit(reason);
	}

	private handleLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;
		let msg: JsonRpcMessage;
		try {
			msg = JSON.parse(trimmed) as JsonRpcMessage;
		} catch {
			logger.debug(
				`[gemini-acp] non-JSON line dropped: ${trimmed.slice(0, 200)}`,
			);
			return;
		}
		// Response to one of our requests.
		if (
			msg.id !== undefined &&
			msg.id !== null &&
			msg.method === undefined &&
			typeof msg.id === "number"
		) {
			const pending = this.pending.get(msg.id);
			if (!pending) return;
			this.pending.delete(msg.id);
			if (msg.error) {
				pending.reject(new Error(msg.error.message || "gemini ACP error"));
			} else {
				pending.resolve(msg.result);
			}
			return;
		}
		// Inbound request from the agent (has method + id).
		if (msg.method && msg.id !== undefined && msg.id !== null) {
			void this.dispatchInboundRequest(msg.id, msg.method, msg.params);
			return;
		}
		// Notification (method, no id).
		if (msg.method) {
			try {
				this.onNotification(msg.method, msg.params);
			} catch (error) {
				logger.debug(
					"gemini ACP notification handler threw",
					errorDetails(error),
				);
			}
		}
	}

	private async dispatchInboundRequest(
		id: number | string,
		method: string,
		params: unknown,
	): Promise<void> {
		try {
			const result = await this.onRequest(method, params);
			this.write({ jsonrpc: "2.0", id, result });
		} catch (error) {
			this.write({
				jsonrpc: "2.0",
				id,
				error: {
					code: -32603,
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	sendRequest(method: string, params: unknown): Promise<unknown> {
		if (this.closed)
			return Promise.reject(new Error("gemini ACP connection closed"));
		const id = this.nextId++;
		return new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}

	sendNotification(method: string, params: unknown): void {
		if (this.closed) return;
		this.write({ jsonrpc: "2.0", method, params });
	}

	private write(message: object): void {
		try {
			this.child.stdin?.write(`${JSON.stringify(message)}\n`);
		} catch (error) {
			logger.debug("gemini ACP write failed", errorDetails(error));
		}
	}

	kill(): void {
		this.closed = true;
		for (const [, p] of this.pending) p.reject(new Error("shutdown"));
		this.pending.clear();
		try {
			this.reader.close();
			this.child.kill("SIGTERM");
		} catch {
			// best-effort
		}
	}
}

// ── Session bookkeeping ──────────────────────────────────────────────────────

interface GeminiSessionCtx {
	readonly grexSessionId: string;
	acpSessionId: string;
	cwd: string;
	activeRequestId: string | null;
	activeEmitter: SidecarEmitter | null;
}

interface AcpUpdateEnvelope {
	readonly sessionId?: string;
	readonly update?: { readonly type?: string; readonly [key: string]: unknown };
}

interface AcpPermissionOption {
	readonly optionId?: string;
	readonly name?: string;
	readonly kind?: string;
}

export class GeminiAcpManager implements SessionManager {
	private connection: AcpConnection | null = null;
	private initialized: Promise<void> | null = null;
	private readonly sessions = new Map<string, GeminiSessionCtx>();
	private readonly byAcpId = new Map<string, GeminiSessionCtx>();

	// First cut: permissions are auto-approved, so there is no pending-permission
	// round-trip to resolve. Kept to satisfy the dispatcher fan-out in index.ts.
	resolveUserInput(
		_userInputId: string,
		_resolution: UserInputResolution,
	): boolean {
		return false;
	}

	resolvePermission(_permissionId: string, _behavior: "allow" | "deny"): void {
		// No-op in the first cut (permissions auto-approve in `onAgentRequest`).
	}

	private ensureConnection(): AcpConnection {
		if (this.connection) return this.connection;
		const { command, args } = resolveGeminiSpawn();
		logger.debug(`[gemini-acp] spawning: ${command} ${args.join(" ")}`);
		this.connection = new AcpConnection(
			command,
			args,
			(method, params) => this.onAgentRequest(method, params),
			(method, params) => this.onAgentNotification(method, params),
			(reason) => this.handleConnectionExit(reason),
		);
		this.initialized = this.initialize(this.connection);
		return this.connection;
	}

	private async initialize(conn: AcpConnection): Promise<void> {
		await conn.sendRequest("initialize", {
			protocolVersion: ACP_PROTOCOL_VERSION,
			clientCapabilities: {
				fs: { readTextFile: true, writeTextFile: true },
			},
			clientInfo: { name: "grex_desktop", version: "0.1.0" },
		});
	}

	private handleConnectionExit(reason: string): void {
		logger.debug(`[gemini-acp] connection exited: ${reason}`);
		for (const ctx of this.sessions.values()) {
			if (ctx.activeEmitter && ctx.activeRequestId) {
				ctx.activeEmitter.error(ctx.activeRequestId, `gemini: ${reason}`);
			}
		}
		this.connection = null;
		this.initialized = null;
		this.sessions.clear();
		this.byAcpId.clear();
	}

	// Inbound agent → client requests: permission prompts + the proxied file
	// system the ACP client must service.
	private async onAgentRequest(
		method: string,
		params: unknown,
	): Promise<unknown> {
		switch (method) {
			case "session/request_permission":
				return this.autoApprovePermission(params);
			case "fs/read_text_file":
				return this.readTextFile(params);
			case "fs/write_text_file":
				return this.writeTextFile(params);
			default:
				throw new Error(`unsupported client method: ${method}`);
		}
	}

	private autoApprovePermission(params: unknown): {
		outcome: { outcome: "selected"; optionId: string };
	} {
		const options = (params as { options?: AcpPermissionOption[] } | undefined)
			?.options;
		const list = Array.isArray(options) ? options : [];
		// Prefer a persistent allow, then a one-shot allow, then anything.
		const pick =
			list.find((o) => o.kind === "allow_always") ??
			list.find((o) => o.kind === "allow_once") ??
			list[0];
		const optionId = pick?.optionId ?? "allow";
		return { outcome: { outcome: "selected", optionId } };
	}

	private async readTextFile(params: unknown): Promise<{ content: string }> {
		const p = params as { path?: string; line?: number; limit?: number };
		if (!p?.path) throw new Error("fs/read_text_file: missing path");
		const raw = await readFile(p.path, "utf8");
		if (p.line == null && p.limit == null) return { content: raw };
		const lines = raw.split("\n");
		const start = Math.max(0, (p.line ?? 1) - 1);
		const end = p.limit == null ? lines.length : start + p.limit;
		return { content: lines.slice(start, end).join("\n") };
	}

	private async writeTextFile(params: unknown): Promise<Record<string, never>> {
		const p = params as { path?: string; content?: string };
		if (!p?.path) throw new Error("fs/write_text_file: missing path");
		await writeFile(p.path, p.content ?? "", "utf8");
		return {};
	}

	// Streaming notifications (session/update) from the agent.
	private onAgentNotification(method: string, params: unknown): void {
		if (method !== "session/update") return;
		const env = params as AcpUpdateEnvelope;
		const acpSessionId = env?.sessionId;
		if (!acpSessionId) return;
		const ctx = this.byAcpId.get(acpSessionId);
		if (!ctx?.activeEmitter || !ctx.activeRequestId) return;
		const update = env.update ?? {};
		const type = typeof update.type === "string" ? update.type : "unknown";

		// Plain assistant text: lift the content block's text so at least prose
		// renders before the full Gemini pipeline adapter lands in Rust.
		if (type === "agent_message_chunk") {
			const content = (update as { content?: { text?: string } }).content;
			const text = typeof content?.text === "string" ? content.text : "";
			ctx.activeEmitter.passthrough(ctx.activeRequestId, {
				type: "gemini/agent_message_chunk",
				text,
				session_id: acpSessionId,
			});
			return;
		}

		// Everything else (tool_call, tool_call_update, plan, thoughts, …) is
		// forwarded verbatim under a `gemini/<type>` namespace for the future
		// Rust adapter; harmless to the current accumulator.
		ctx.activeEmitter.passthrough(ctx.activeRequestId, {
			...update,
			type: `gemini/${type}`,
			session_id: acpSessionId,
		});
	}

	private async ensureSession(
		ctx: GeminiSessionCtx | undefined,
		params: SendMessageParams,
		conn: AcpConnection,
	): Promise<GeminiSessionCtx> {
		if (ctx) return ctx;
		const cwd = params.cwd ?? process.cwd();
		const result = (await conn.sendRequest("session/new", {
			cwd,
			mcpServers: [],
			...(params.additionalDirectories &&
			params.additionalDirectories.length > 0
				? { additionalDirectories: [...params.additionalDirectories] }
				: {}),
		})) as { sessionId?: string };
		const acpSessionId = result?.sessionId;
		if (!acpSessionId) throw new Error("session/new returned no sessionId");
		const created: GeminiSessionCtx = {
			grexSessionId: params.sessionId,
			acpSessionId,
			cwd,
			activeRequestId: null,
			activeEmitter: null,
		};
		this.sessions.set(params.sessionId, created);
		this.byAcpId.set(acpSessionId, created);
		return created;
	}

	async sendMessage(
		requestId: string,
		params: SendMessageParams,
		emitter: SidecarEmitter,
	): Promise<void> {
		try {
			const conn = this.ensureConnection();
			await this.initialized;

			const ctx = await this.ensureSession(
				this.sessions.get(params.sessionId),
				params,
				conn,
			);
			ctx.cwd = params.cwd ?? ctx.cwd;
			ctx.activeRequestId = requestId;
			ctx.activeEmitter = emitter;

			// Synthetic init so Rust persists the ACP session id as the
			// provider_session_id (parity with the other managers).
			emitter.passthrough(requestId, {
				type: "gemini/session_init",
				session_id: ctx.acpSessionId,
				...(params.model ? { model: params.model } : {}),
			});

			await conn.sendRequest("session/prompt", {
				sessionId: ctx.acpSessionId,
				prompt: [{ type: "text", text: params.prompt }],
			});
			emitter.end(requestId);
		} catch (error) {
			emitter.error(requestId, `gemini: ${errorMessage(error)}`);
			emitter.end(requestId);
		} finally {
			const ctx = this.sessions.get(params.sessionId);
			if (ctx) {
				ctx.activeRequestId = null;
				ctx.activeEmitter = null;
			}
		}
	}

	async generateTitle(
		requestId: string,
		_userMessage: string,
		_branchRenamePrompt: string | null,
		_emitter: SidecarEmitter,
		_timeoutMs?: number,
		_options?: GenerateTitleOptions,
	): Promise<void> {
		// First cut: not implemented — throw so the title cascade in index.ts
		// falls through to another provider instead of emitting an empty title.
		throw new Error(
			`gemini title generation not implemented (request ${requestId})`,
		);
	}

	async listSlashCommands(
		_params: ListSlashCommandsParams,
	): Promise<readonly SlashCommandInfo[]> {
		return [];
	}

	async listModels(): Promise<readonly ProviderModelInfo[]> {
		// Picker is driven by the Rust static catalog (`gemini_section`); the
		// sidecar list is unused for Gemini in the first cut.
		return [];
	}

	async stopSession(sessionId: string): Promise<void> {
		const ctx = this.sessions.get(sessionId);
		if (!ctx || !this.connection) return;
		this.connection.sendNotification("session/cancel", {
			sessionId: ctx.acpSessionId,
		});
	}

	async steer(
		_sessionId: string,
		_prompt: string,
		_files: readonly string[],
		_images: readonly string[],
	): Promise<boolean> {
		// Mid-turn steer is not wired in the first cut (capability flag off).
		return false;
	}

	async shutdown(): Promise<void> {
		this.connection?.kill();
		this.connection = null;
		this.initialized = null;
		this.sessions.clear();
		this.byAcpId.clear();
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { GEMINI_PERMISSION_PREFIX };
