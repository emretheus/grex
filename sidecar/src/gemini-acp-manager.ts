// SessionManager for the Gemini CLI driven in ACP (Agent Client Protocol)
// mode: `gemini --experimental-acp`, JSON-RPC 2.0 over stdio (newline
// delimited). Mirrors the role `codex-app-server-manager.ts` plays for Codex —
// spawn the agent subprocess, speak its protocol, and bridge streaming +
// permission messages to the sidecar event model.
//
// ACP `session/update` notifications are normalized here into the
// `gemini/<...>` event contract the Rust pipeline's `accumulator/gemini.rs`
// consumes (text/thought deltas, tool_call + tool_call_update by id, plan, a
// terminal `gemini/turn_complete`). The discriminant is `update.sessionUpdate`
// (per the ACP schema), NOT `update.type`.
//
// Capabilities (validated against the bundled gemini-cli 0.46 ACP schema):
//   - Resume across restarts via `session/load` (agent advertises loadSession).
//   - Slash commands from streamed `available_commands_update`.
//   - Plan mode via `session/set_mode` + real permission round-trips (Auto mode
//     keeps the full-access auto-approve).
//   - Title generation via a throwaway session.
//   - Mid-turn steer via a follow-up `session/prompt`.
//   - Context usage forwarded from `usage_update` as `contextUsageUpdated`.

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
// 1. `GREX_GEMINI_BIN_PATH` — set by the Tauri host in release builds.
// 2. `@google/gemini-cli` resolved from node_modules — dev + `bun test`.
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
		if (msg.method && msg.id !== undefined && msg.id !== null) {
			void this.dispatchInboundRequest(msg.id, msg.method, msg.params);
			return;
		}
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

// ── ACP schema fragments we read ─────────────────────────────────────────────

interface AcpContentBlock {
	readonly type?: string;
	readonly text?: string;
}
interface AcpToolCallContent {
	readonly type?: string;
	readonly content?: AcpContentBlock;
	readonly path?: string;
	readonly oldText?: string;
	readonly newText?: string;
}
interface AcpUpdate {
	readonly sessionUpdate?: string;
	readonly content?: AcpContentBlock;
	readonly toolCallId?: string;
	readonly title?: string;
	readonly kind?: string;
	readonly status?: string;
	readonly rawInput?: unknown;
	readonly toolContent?: AcpToolCallContent[];
	readonly entries?: ReadonlyArray<{ content?: string; status?: string }>;
	readonly availableCommands?: ReadonlyArray<{
		name?: string;
		description?: string;
	}>;
	readonly currentModeId?: string;
	readonly used?: number;
	readonly size?: number;
	readonly [key: string]: unknown;
}
interface AcpUpdateEnvelope {
	readonly sessionId?: string;
	readonly update?: AcpUpdate;
}
interface AcpPermissionOption {
	readonly optionId?: string;
	readonly name?: string;
	readonly kind?: string;
}
interface AcpSessionMode {
	readonly id?: string;
	readonly name?: string;
	readonly description?: string;
}
interface AcpSessionModeState {
	readonly currentModeId?: string;
	readonly availableModes?: readonly AcpSessionMode[];
}
interface AcpNewSessionResult {
	readonly sessionId?: string;
	readonly modes?: AcpSessionModeState;
}

// ── Session bookkeeping ──────────────────────────────────────────────────────

interface GeminiSessionCtx {
	readonly grexSessionId: string;
	acpSessionId: string;
	cwd: string;
	activeRequestId: string | null;
	activeEmitter: SidecarEmitter | null;
	fullAccess: boolean;
	modes: AcpSessionModeState | null;
	availableCommands: SlashCommandInfo[];
	lastUsage: { used: number; size: number } | null;
	// Per-turn part-id sequencing so interleaved text/thought runs stay ordered.
	partSeq: number;
	currentTextPartId: string | null;
	currentThoughtPartId: string | null;
}

export class GeminiAcpManager implements SessionManager {
	private connection: AcpConnection | null = null;
	private initialized: Promise<void> | null = null;
	private loadSessionSupported = false;
	private readonly sessions = new Map<string, GeminiSessionCtx>();
	private readonly byAcpId = new Map<string, GeminiSessionCtx>();
	// Pending real permission round-trips (plan mode), keyed by permissionId.
	private readonly pendingPermissions = new Map<
		string,
		(behavior: "allow" | "deny") => void
	>();
	private permissionSeq = 0;

	resolveUserInput(
		_userInputId: string,
		_resolution: UserInputResolution,
	): boolean {
		return false;
	}

	resolvePermission(permissionId: string, behavior: "allow" | "deny"): void {
		const resolve = this.pendingPermissions.get(permissionId);
		if (resolve) {
			this.pendingPermissions.delete(permissionId);
			resolve(behavior);
		}
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
		const result = (await conn.sendRequest("initialize", {
			protocolVersion: ACP_PROTOCOL_VERSION,
			clientCapabilities: {
				fs: { readTextFile: true, writeTextFile: true },
			},
			clientInfo: { name: "grex_desktop", version: "0.1.0" },
		})) as { agentCapabilities?: { loadSession?: boolean } } | undefined;
		this.loadSessionSupported = Boolean(result?.agentCapabilities?.loadSession);
	}

	private handleConnectionExit(reason: string): void {
		logger.debug(`[gemini-acp] connection exited: ${reason}`);
		for (const ctx of this.sessions.values()) {
			if (ctx.activeEmitter && ctx.activeRequestId) {
				ctx.activeEmitter.error(ctx.activeRequestId, `gemini: ${reason}`);
			}
		}
		for (const [, resolve] of this.pendingPermissions) resolve("deny");
		this.pendingPermissions.clear();
		this.connection = null;
		this.initialized = null;
		this.sessions.clear();
		this.byAcpId.clear();
	}

	// Inbound agent → client requests: permission prompts + proxied fs.
	private async onAgentRequest(
		method: string,
		params: unknown,
	): Promise<unknown> {
		switch (method) {
			case "session/request_permission":
				return this.handlePermission(params);
			case "fs/read_text_file":
				return this.readTextFile(params);
			case "fs/write_text_file":
				return this.writeTextFile(params);
			default:
				throw new Error(`unsupported client method: ${method}`);
		}
	}

	private async handlePermission(params: unknown): Promise<{
		outcome:
			| { outcome: "selected"; optionId: string }
			| { outcome: "cancelled" };
	}> {
		const p = params as
			| {
					sessionId?: string;
					options?: AcpPermissionOption[];
					toolCall?: AcpUpdate;
			  }
			| undefined;
		const options = Array.isArray(p?.options) ? p.options : [];
		const ctx = p?.sessionId ? this.byAcpId.get(p.sessionId) : undefined;

		// Auto mode (full access): approve without prompting. Plan mode: route a
		// real permission prompt to the user and await their decision.
		if (!ctx || ctx.fullAccess || !ctx.activeEmitter || !ctx.activeRequestId) {
			return { outcome: { outcome: "selected", optionId: pickAllow(options) } };
		}

		const permissionId = `${GEMINI_PERMISSION_PREFIX}${++this.permissionSeq}`;
		const tool = p?.toolCall;
		const behavior = await new Promise<"allow" | "deny">((resolve) => {
			this.pendingPermissions.set(permissionId, resolve);
			ctx.activeEmitter?.permissionRequest(
				ctx.activeRequestId!,
				permissionId,
				tool?.title || tool?.kind || "Gemini tool",
				(tool?.rawInput as Record<string, unknown>) ?? {},
				tool?.title,
				undefined,
			);
		});
		const optionId =
			behavior === "allow" ? pickAllow(options) : pickReject(options);
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

	// ── Streaming notifications (session/update) ───────────────────────────────
	private onAgentNotification(method: string, params: unknown): void {
		if (method !== "session/update") return;
		// Feed any active title collectors first (throwaway sessions aren't in
		// the live session maps).
		for (const c of this.titleCollectors) c.collector(method, params);
		const env = params as AcpUpdateEnvelope;
		const acpSessionId = env?.sessionId;
		if (!acpSessionId) return;
		const ctx = this.byAcpId.get(acpSessionId);
		if (!ctx?.activeEmitter || !ctx.activeRequestId) return;
		const update = env.update ?? {};
		const variant = update.sessionUpdate;
		const emit = (message: object) =>
			ctx.activeEmitter?.passthrough(ctx.activeRequestId!, {
				...message,
				session_id: acpSessionId,
			});

		switch (variant) {
			case "agent_message_chunk": {
				if (!ctx.currentTextPartId) {
					ctx.currentTextPartId = `text:${++ctx.partSeq}`;
					ctx.currentThoughtPartId = null;
				}
				emit({
					type: "gemini/agent_message_chunk",
					part_id: ctx.currentTextPartId,
					delta: update.content?.text ?? "",
				});
				return;
			}
			case "agent_thought_chunk": {
				if (!ctx.currentThoughtPartId) {
					ctx.currentThoughtPartId = `thought:${++ctx.partSeq}`;
					ctx.currentTextPartId = null;
				}
				emit({
					type: "gemini/agent_thought_chunk",
					part_id: ctx.currentThoughtPartId,
					delta: update.content?.text ?? "",
				});
				return;
			}
			case "tool_call": {
				ctx.currentTextPartId = null;
				ctx.currentThoughtPartId = null;
				emit({
					type: "gemini/tool_call",
					tool_call_id: update.toolCallId,
					title: update.title ?? "",
					kind: update.kind ?? "other",
					status: update.status ?? "pending",
					input: update.rawInput ?? {},
				});
				return;
			}
			case "tool_call_update": {
				const { output, diffs } = foldToolContent(update.toolContent);
				emit({
					type: "gemini/tool_call_update",
					tool_call_id: update.toolCallId,
					...(update.status ? { status: update.status } : {}),
					...(update.title ? { title: update.title } : {}),
					...(output ? { output } : {}),
					...(diffs.length > 0 ? { diffs } : {}),
				});
				return;
			}
			case "plan": {
				emit({
					type: "gemini/plan",
					entries: (update.entries ?? []).map((e) => ({
						content: e.content ?? "",
						status: e.status ?? "pending",
					})),
				});
				return;
			}
			case "available_commands_update": {
				ctx.availableCommands = (update.availableCommands ?? []).map((c) => ({
					name: c.name ?? "",
					description: c.description ?? "",
					argumentHint: undefined,
					source: "builtin" as const,
				}));
				return;
			}
			case "current_mode_update": {
				if (ctx.modes && update.currentModeId) {
					ctx.modes = { ...ctx.modes, currentModeId: update.currentModeId };
				}
				return;
			}
			case "usage_update": {
				if (
					typeof update.used === "number" &&
					typeof update.size === "number"
				) {
					ctx.lastUsage = { used: update.used, size: update.size };
					ctx.activeEmitter?.contextUsageUpdated(
						ctx.activeRequestId,
						acpSessionId,
						JSON.stringify({
							usedTokens: update.used,
							maxTokens: update.size,
						}),
					);
				}
				return;
			}
			default:
				// user_message_chunk (prompt echo), config_option_update,
				// session_info_update — nothing to render.
				return;
		}
	}

	// `toolContent` is the ACP `content[]` of a tool_call_update: text blocks
	// fold into `output`; diff blocks become `{path, diff}` for the apply_patch
	// view (a whole-file replacement hunk synthesized from old/new text).
	// (helper at module scope: foldToolContent)

	private async ensureSession(
		ctx: GeminiSessionCtx | undefined,
		params: SendMessageParams,
		conn: AcpConnection,
	): Promise<GeminiSessionCtx> {
		if (ctx) return ctx;
		const cwd = params.cwd ?? process.cwd();
		const fullAccess = params.permissionMode !== "plan";

		// Resume an existing ACP session across sidecar restarts when the agent
		// advertises loadSession and we have a provider session id.
		if (params.resume && this.loadSessionSupported) {
			try {
				const loaded = (await conn.sendRequest("session/load", {
					cwd,
					mcpServers: [],
					sessionId: params.resume,
				})) as { modes?: AcpSessionModeState } | undefined;
				const created: GeminiSessionCtx = {
					grexSessionId: params.sessionId,
					acpSessionId: params.resume,
					cwd,
					activeRequestId: null,
					activeEmitter: null,
					fullAccess,
					modes: loaded?.modes ?? null,
					availableCommands: [],
					lastUsage: null,
					partSeq: 0,
					currentTextPartId: null,
					currentThoughtPartId: null,
				};
				this.sessions.set(params.sessionId, created);
				this.byAcpId.set(params.resume, created);
				return created;
			} catch (error) {
				logger.debug(
					"gemini session/load failed, creating new",
					errorDetails(error),
				);
			}
		}

		const result = (await conn.sendRequest("session/new", {
			cwd,
			mcpServers: [],
			...(params.additionalDirectories &&
			params.additionalDirectories.length > 0
				? { additionalDirectories: [...params.additionalDirectories] }
				: {}),
		})) as AcpNewSessionResult;
		const acpSessionId = result?.sessionId;
		if (!acpSessionId) throw new Error("session/new returned no sessionId");
		const created: GeminiSessionCtx = {
			grexSessionId: params.sessionId,
			acpSessionId,
			cwd,
			activeRequestId: null,
			activeEmitter: null,
			fullAccess,
			modes: result?.modes ?? null,
			availableCommands: [],
			lastUsage: null,
			partSeq: 0,
			currentTextPartId: null,
			currentThoughtPartId: null,
		};
		this.sessions.set(params.sessionId, created);
		this.byAcpId.set(acpSessionId, created);
		return created;
	}

	// Switch the ACP session into a plan-ish read-only mode when Grex is in plan
	// mode, or back to a default mode for Auto. Best-effort: only acts when the
	// agent advertised a matching mode id.
	private async applyPermissionMode(
		ctx: GeminiSessionCtx,
		conn: AcpConnection,
	): Promise<void> {
		const modes = ctx.modes?.availableModes ?? [];
		if (modes.length === 0) return;
		const want = ctx.fullAccess
			? findMode(modes, ["default", "auto", "accept", "yolo"])
			: findMode(modes, ["plan", "read", "review", "ask"]);
		if (!want || want === ctx.modes?.currentModeId) return;
		try {
			await conn.sendRequest("session/set_mode", {
				sessionId: ctx.acpSessionId,
				modeId: want,
			});
			if (ctx.modes) ctx.modes = { ...ctx.modes, currentModeId: want };
		} catch (error) {
			logger.debug("gemini session/set_mode failed", errorDetails(error));
		}
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
			ctx.fullAccess = params.permissionMode !== "plan";
			ctx.activeRequestId = requestId;
			ctx.activeEmitter = emitter;
			// Fresh part-id sequencing per turn.
			ctx.partSeq = 0;
			ctx.currentTextPartId = null;
			ctx.currentThoughtPartId = null;

			await this.applyPermissionMode(ctx, conn);

			// Synthetic init so Rust persists the ACP session id as the
			// provider_session_id (parity with the other managers).
			emitter.passthrough(requestId, {
				type: "gemini/session_init",
				session_id: ctx.acpSessionId,
				...(params.model ? { model: params.model } : {}),
			});

			const turnStart = Date.now();
			await conn.sendRequest("session/prompt", {
				sessionId: ctx.acpSessionId,
				prompt: [{ type: "text", text: params.prompt }],
			});

			// Terminal marker so the Rust accumulator finalizes the turn; the
			// duration drives the "Ns • ago" footer.
			emitter.passthrough(requestId, {
				type: "gemini/turn_complete",
				session_id: ctx.acpSessionId,
				duration_ms: Date.now() - turnStart,
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
		userMessage: string,
		_branchRenamePrompt: string | null,
		emitter: SidecarEmitter,
		_timeoutMs?: number,
		_options?: GenerateTitleOptions,
	): Promise<void> {
		// Throwaway ACP session that asks for a short title, mirroring Codex.
		try {
			const conn = this.ensureConnection();
			await this.initialized;
			const result = (await conn.sendRequest("session/new", {
				cwd: process.cwd(),
				mcpServers: [],
			})) as AcpNewSessionResult;
			const sessionId = result?.sessionId;
			if (!sessionId) throw new Error("session/new returned no sessionId");

			let title = "";
			const collector: NotificationHandler = (method, params) => {
				if (method !== "session/update") return;
				const env = params as AcpUpdateEnvelope;
				if (env.sessionId !== sessionId) return;
				if (env.update?.sessionUpdate === "agent_message_chunk") {
					title += env.update.content?.text ?? "";
				}
			};
			this.titleCollectors.push({ sessionId, collector });
			try {
				await conn.sendRequest("session/prompt", {
					sessionId,
					prompt: [
						{
							type: "text",
							text: `Write a 3-6 word title (no quotes, no punctuation at the end) summarizing this request:\n\n${userMessage}`,
						},
					],
				});
			} finally {
				this.titleCollectors = this.titleCollectors.filter(
					(c) => c.sessionId !== sessionId,
				);
				conn.sendNotification("session/cancel", { sessionId });
			}
			const clean = title
				.trim()
				.split("\n")[0]
				?.trim()
				.replace(/^["']|["']$/g, "");
			if (!clean) throw new Error("gemini returned an empty title");
			emitter.titleGenerated(requestId, clean, undefined);
		} catch (error) {
			throw new Error(
				`gemini title generation failed (request ${requestId}): ${errorMessage(error)}`,
			);
		}
	}

	// Active title collectors are consulted from onAgentNotification.
	private titleCollectors: Array<{
		sessionId: string;
		collector: NotificationHandler;
	}> = [];

	async listSlashCommands(
		params: ListSlashCommandsParams,
	): Promise<readonly SlashCommandInfo[]> {
		// Return the most recently streamed command list across known sessions
		// whose cwd matches; ACP pushes `available_commands_update` per session.
		for (const ctx of this.sessions.values()) {
			if (
				ctx.availableCommands.length > 0 &&
				(!params.cwd || ctx.cwd === params.cwd)
			) {
				return ctx.availableCommands;
			}
		}
		return [];
	}

	async listModels(): Promise<readonly ProviderModelInfo[]> {
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
		sessionId: string,
		prompt: string,
		_files: readonly string[],
		_images: readonly string[],
	): Promise<boolean> {
		const ctx = this.sessions.get(sessionId);
		if (!ctx?.activeRequestId || !this.connection) return false;
		// Inject a follow-up prompt on the same ACP session. NOTE: validated
		// against the ACP schema but not yet against a live mid-turn agent;
		// fire-and-forget so the active turn's promise is unaffected.
		try {
			void this.connection.sendRequest("session/prompt", {
				sessionId: ctx.acpSessionId,
				prompt: [{ type: "text", text: prompt }],
			});
			if (ctx.activeEmitter && ctx.activeRequestId) {
				ctx.activeEmitter.passthrough(ctx.activeRequestId, {
					type: "user_prompt",
					session_id: ctx.acpSessionId,
					text: prompt,
					steer: true,
				});
			}
			return true;
		} catch {
			return false;
		}
	}

	async shutdown(): Promise<void> {
		this.connection?.kill();
		this.connection = null;
		this.initialized = null;
		this.sessions.clear();
		this.byAcpId.clear();
		this.pendingPermissions.clear();
	}
}

// ── Module-scope helpers ─────────────────────────────────────────────────────

function pickAllow(options: readonly AcpPermissionOption[]): string {
	const pick =
		options.find((o) => o.kind === "allow_always") ??
		options.find((o) => o.kind === "allow_once") ??
		options[0];
	return pick?.optionId ?? "allow";
}

function pickReject(options: readonly AcpPermissionOption[]): string {
	const pick =
		options.find((o) => o.kind === "reject_once") ??
		options.find((o) => o.kind === "reject_always") ??
		options[options.length - 1];
	return pick?.optionId ?? "reject";
}

function findMode(
	modes: readonly AcpSessionMode[],
	needles: readonly string[],
): string | undefined {
	for (const needle of needles) {
		const hit = modes.find(
			(m) =>
				(m.id ?? "").toLowerCase().includes(needle) ||
				(m.name ?? "").toLowerCase().includes(needle),
		);
		if (hit?.id) return hit.id;
	}
	return undefined;
}

function foldToolContent(content: AcpToolCallContent[] | undefined): {
	output: string;
	diffs: Array<{ path: string; diff: string }>;
} {
	let output = "";
	const diffs: Array<{ path: string; diff: string }> = [];
	for (const item of content ?? []) {
		if (item.type === "content" && item.content?.type === "text") {
			output += item.content.text ?? "";
		} else if (item.type === "diff" && item.path) {
			diffs.push({
				path: item.path,
				diff: synthesizeUnifiedDiff(
					item.path,
					item.oldText ?? "",
					item.newText ?? "",
				),
			});
		}
	}
	return { output, diffs };
}

// ACP diff blocks carry old/new file text, not a unified diff. Synthesize a
// whole-file replacement hunk so the frontend's apply_patch view renders the
// red/green change. (A line-level diff is a future refinement.)
function synthesizeUnifiedDiff(
	path: string,
	oldText: string,
	newText: string,
): string {
	const oldLines = oldText === "" ? [] : oldText.split("\n");
	const newLines = newText === "" ? [] : newText.split("\n");
	const header = `--- a/${path}\n+++ b/${path}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
	const body = [
		...oldLines.map((l) => `-${l}`),
		...newLines.map((l) => `+${l}`),
	].join("\n");
	return `${header}${body}\n`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { GEMINI_PERMISSION_PREFIX };
