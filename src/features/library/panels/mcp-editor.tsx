import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	CheckCircle2,
	PlugZap,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	deleteMcpServer,
	type McpServer,
	type McpServerInput,
	type McpTransport,
	testMcpServer,
	upsertMcpServer,
} from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { grexQueryKeys } from "@/lib/query-client";
import { MCP_AGENTS } from "../mcp-agents";

function parseLines(text: string): string[] {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
}

function parseKeyVals(text: string, sep: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of parseLines(text)) {
		const i = line.indexOf(sep);
		if (i === -1) continue;
		const key = line.slice(0, i).trim();
		if (key) out[key] = line.slice(i + sep.length).trim();
	}
	return out;
}

function stringifyKeyVals(obj: Record<string, string>, sep: string): string {
	return Object.entries(obj)
		.map(([k, v]) => `${k}${sep} ${v}`)
		.join("\n");
}

/** Prefill for a brand-new server (e.g. chosen from the catalog). */
export type McpEditorDraft = {
	name?: string;
	transport?: McpTransport;
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
};

/** Create / edit form for a single MCP server. */
export function McpEditor({
	server,
	draft,
	onDone,
}: {
	server: McpServer | null;
	/** Seed values for a new server (ignored when `server` is set). */
	draft?: McpEditorDraft;
	onDone: () => void;
}) {
	const { t } = useTranslation("library");
	const queryClient = useQueryClient();
	const [name, setName] = useState(server?.name ?? draft?.name ?? "");
	const [transport, setTransport] = useState<McpTransport>(
		server?.transport ?? draft?.transport ?? "stdio",
	);
	const [command, setCommand] = useState(
		server?.command ?? draft?.command ?? "",
	);
	const [argsText, setArgsText] = useState(
		(server?.args ?? draft?.args ?? []).join("\n"),
	);
	const [url, setUrl] = useState(server?.url ?? draft?.url ?? "");
	const [envText, setEnvText] = useState(
		stringifyKeyVals(server?.env ?? draft?.env ?? {}, "="),
	);
	const [headersText, setHeadersText] = useState(
		stringifyKeyVals(server?.headers ?? draft?.headers ?? {}, ":"),
	);
	const [providers, setProviders] = useState<string[]>(server?.providers ?? []);
	const [enabled, setEnabled] = useState(server?.enabled ?? true);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: grexQueryKeys.libraryMcpServers,
		});

	const buildInput = (): McpServerInput => ({
		id: server?.id ?? null,
		name: name.trim(),
		transport,
		command: transport === "stdio" ? command.trim() || null : null,
		args: transport === "stdio" ? parseLines(argsText) : [],
		url: transport === "http" ? url.trim() || null : null,
		headers: transport === "http" ? parseKeyVals(headersText, ":") : {},
		env: parseKeyVals(envText, "="),
		providers,
		enabled,
	});

	const save = useMutation({
		mutationFn: () => upsertMcpServer(buildInput()),
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	const test = useMutation({ mutationFn: () => testMcpServer(buildInput()) });

	const remove = useMutation({
		mutationFn: () => deleteMcpServer(server?.id ?? ""),
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	const nameValid = /^[\w.-]+$/.test(name.trim());
	const hasTarget =
		transport === "stdio" ? command.trim().length > 0 : url.trim().length > 0;
	const canSave = nameValid && hasTarget && !save.isPending;
	const canTest = hasTarget && !test.isPending;

	const toggleProvider = (id: string) =>
		setProviders((prev) =>
			prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
		);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-border/40 px-8 py-3">
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onDone}
					aria-label={t("mcp.editor.back")}
				>
					<ArrowLeft className="size-4" />
				</Button>
				<span className="text-ui font-medium text-foreground">
					{server ? t("mcp.editor.editTitle") : t("mcp.editor.newTitle")}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{server ? (
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground hover:text-destructive"
							disabled={remove.isPending}
							onClick={() => remove.mutate()}
						>
							<Trash2 className="size-4" />
							{t("mcp.editor.delete")}
						</Button>
					) : null}
					<Button
						variant="outline"
						size="sm"
						disabled={!canTest}
						onClick={() => test.mutate()}
					>
						<PlugZap className="size-4" />
						{test.isPending ? t("mcp.editor.testing") : t("mcp.editor.test")}
					</Button>
					<Button size="sm" disabled={!canSave} onClick={() => save.mutate()}>
						{t("mcp.editor.save")}
					</Button>
				</div>
			</div>

			{test.data || test.isError ? (
				<TestResultBanner
					ok={Boolean(test.data?.ok)}
					serverName={test.data?.serverName ?? null}
					toolCount={test.data?.toolCount ?? null}
					message={
						test.isError
							? t("mcp.editor.testFailed")
							: (test.data?.error ?? null)
					}
				/>
			) : null}

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-8 py-5">
				<Field label={t("mcp.editor.nameLabel")}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t("mcp.editor.namePlaceholder")}
						autoFocus={!server}
					/>
					{name.length > 0 && !nameValid ? (
						<p className="text-nano text-destructive">
							{t("mcp.editor.nameError")}
						</p>
					) : null}
				</Field>

				<Field label={t("mcp.editor.transportLabel")}>
					<ToggleGroup
						type="single"
						value={transport}
						onValueChange={(v) => v && setTransport(v as McpTransport)}
						className="justify-start"
					>
						<ToggleGroupItem value="stdio">stdio</ToggleGroupItem>
						<ToggleGroupItem value="http">http</ToggleGroupItem>
					</ToggleGroup>
				</Field>

				{transport === "stdio" ? (
					<>
						<Field label={t("mcp.editor.commandLabel")}>
							<Input
								value={command}
								onChange={(e) => setCommand(e.target.value)}
								placeholder="npx"
								className="font-mono text-small"
							/>
						</Field>
						<Field label={t("mcp.editor.argsLabel")}>
							<Textarea
								value={argsText}
								onChange={(e) => setArgsText(e.target.value)}
								placeholder={"-y\n@playwright/mcp"}
								className="min-h-[72px] resize-y font-mono text-small"
							/>
						</Field>
					</>
				) : (
					<>
						<Field label={t("mcp.editor.urlLabel")}>
							<Input
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://example.com/mcp"
								className="font-mono text-small"
							/>
						</Field>
						<Field label={t("mcp.editor.headersLabel")}>
							<Textarea
								value={headersText}
								onChange={(e) => setHeadersText(e.target.value)}
								placeholder="Authorization: Bearer …"
								className="min-h-[60px] resize-y font-mono text-small"
							/>
						</Field>
					</>
				)}

				<Field label={t("mcp.editor.envLabel")}>
					<Textarea
						value={envText}
						onChange={(e) => setEnvText(e.target.value)}
						placeholder="API_TOKEN=…"
						className="min-h-[60px] resize-y font-mono text-small"
					/>
				</Field>

				<Field label={t("mcp.editor.syncLabel")}>
					<div className="flex flex-col gap-2">
						{MCP_AGENTS.map((agent) => {
							const unsupported = transport === "http" && !agent.http;
							const id = `mcp-agent-${agent.id}`;
							return (
								<label
									key={agent.id}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-2 text-ui text-foreground"
								>
									<Checkbox
										id={id}
										checked={providers.includes(agent.id)}
										disabled={unsupported}
										onCheckedChange={() => toggleProvider(agent.id)}
									/>
									<span className={unsupported ? "text-muted-foreground" : ""}>
										{agent.label}
									</span>
									{unsupported ? (
										<span className="text-nano text-muted-foreground">
											{t("mcp.editor.stdioOnly")}
										</span>
									) : null}
								</label>
							);
						})}
					</div>
				</Field>

				<div className="flex items-center justify-between">
					<span className="text-small font-medium text-foreground">
						{t("mcp.editor.enabled")}
					</span>
					<Switch
						aria-label={t("mcp.editor.enabled")}
						checked={enabled}
						onCheckedChange={setEnabled}
					/>
				</div>

				{save.isError ? (
					<p className="text-small text-destructive">
						{t("mcp.editor.saveError")}
					</p>
				) : null}
			</div>
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<span className="text-small font-medium text-foreground">{label}</span>
			{children}
		</div>
	);
}

/** Result of a "Test connection" run, shown under the editor header. */
function TestResultBanner({
	ok,
	serverName,
	toolCount,
	message,
}: {
	ok: boolean;
	serverName: string | null;
	toolCount: number | null;
	message: string | null;
}) {
	if (ok) {
		const tools =
			typeof toolCount === "number"
				? i18n.t("library:mcp.editor.tools", { count: toolCount })
				: "";
		const target = serverName
			? i18n.t("library:mcp.editor.connectedTarget", { name: serverName })
			: "";
		return (
			<div className="flex items-center gap-2 border-border/40 border-b bg-emerald-500/10 px-8 py-2 text-emerald-700 text-small dark:text-emerald-400">
				<CheckCircle2 className="size-4 shrink-0" />
				<span>{i18n.t("library:mcp.editor.connected", { target, tools })}</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-2 border-border/40 border-b bg-destructive/10 px-8 py-2 text-destructive text-small">
			<XCircle className="size-4 shrink-0" />
			<span>{message ?? i18n.t("library:mcp.editor.connectError")}</span>
		</div>
	);
}
