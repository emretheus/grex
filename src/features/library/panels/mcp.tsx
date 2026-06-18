import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { McpServer } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { libraryMcpServersQueryOptions } from "@/lib/query-client";
import { mcpAgentLabel } from "../mcp-agents";
import { BrandIcon } from "../mcp-brand-icon";
import { MCP_CATALOG, type McpCatalogEntry } from "../mcp-catalog";
import { McpEditor, type McpEditorDraft } from "./mcp-editor";
import { McpSyncDialog } from "./mcp-sync-dialog";

type EditorState = { server: McpServer | null; draft?: McpEditorDraft };

/** Brand icon for a server name, reusing the catalog's icon when it matches. */
function iconKeyForName(name: string): string | undefined {
	return MCP_CATALOG.find((e) => e.key === name)?.iconKey;
}

function entryToDraft(entry: McpCatalogEntry): McpEditorDraft {
	return {
		name: entry.key,
		transport: entry.transport,
		command: entry.command,
		args: entry.args,
		url: entry.url,
		env: Object.fromEntries((entry.envKeys ?? []).map((k) => [k, ""])),
		headers: Object.fromEntries((entry.headerKeys ?? []).map((k) => [k, ""])),
	};
}

function matches(query: string, ...fields: string[]): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return fields.some((f) => f.toLowerCase().includes(q));
}

/** Translated catalog description for a server, falling back to the English source. */
function mcpDescription(entry: McpCatalogEntry): string {
	return i18n.t(`library:catalog.mcp.${entry.key}`, {
		defaultValue: entry.description,
	});
}

/** Library → MCP Servers: a catalog of recommended servers + your own. */
export function LibraryMcpPanel() {
	const { t } = useTranslation("library");
	const { data: servers = [] } = useQuery(libraryMcpServersQueryOptions());
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [syncOpen, setSyncOpen] = useState(false);
	const [search, setSearch] = useState("");

	const addedNames = useMemo(
		() => new Set(servers.map((s) => s.name)),
		[servers],
	);
	const addedFiltered = useMemo(
		() =>
			servers.filter((s) =>
				matches(search, s.name, s.command ?? "", s.url ?? ""),
			),
		[servers, search],
	);
	const recommended = useMemo(
		() =>
			MCP_CATALOG.filter(
				(e) =>
					!addedNames.has(e.key) && matches(search, e.name, mcpDescription(e)),
			),
		[addedNames, search],
	);

	if (editor) {
		return (
			<McpEditor
				server={editor.server}
				draft={editor.draft}
				onDone={() => setEditor(null)}
			/>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 px-8 py-3">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("mcp.searchPlaceholder")}
						className="pl-8"
					/>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={servers.length === 0}
					onClick={() => setSyncOpen(true)}
				>
					<RefreshCw className="size-4" />
					{t("mcp.sync")}
				</Button>
				<Button size="sm" onClick={() => setEditor({ server: null })}>
					<Plus className="size-4" />
					{t("mcp.custom")}
				</Button>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-5 px-6 pb-6">
					{addedFiltered.length > 0 ? (
						<Section title={t("sectionTitles.added")}>
							{addedFiltered.map((server) => (
								<AddedCard
									key={server.id}
									server={server}
									onClick={() => setEditor({ server })}
								/>
							))}
						</Section>
					) : null}

					{recommended.length > 0 ? (
						<Section title={t("sectionTitles.recommended")}>
							{recommended.map((entry) => (
								<CatalogCard
									key={entry.key}
									entry={entry}
									onAdd={() =>
										setEditor({ server: null, draft: entryToDraft(entry) })
									}
								/>
							))}
						</Section>
					) : null}

					{addedFiltered.length === 0 && recommended.length === 0 ? (
						<p className="px-2 py-8 text-center text-small text-muted-foreground">
							{t("mcp.noSearchMatch", { query: search })}
						</p>
					) : null}
				</div>
			</ScrollArea>

			<McpSyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<h3 className="px-2 text-small font-medium text-muted-foreground">
				{title}
			</h3>
			<div className="grid grid-cols-2 gap-2">{children}</div>
		</div>
	);
}

function AddedCard({
	server,
	onClick,
}: {
	server: McpServer;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:border-border hover:bg-muted/40"
		>
			<BrandIcon iconKey={iconKeyForName(server.name)} name={server.name} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-ui font-medium text-foreground">
						{server.name}
					</span>
					<Badge variant="secondary" className="shrink-0 text-nano">
						{server.transport}
					</Badge>
					{!server.enabled ? (
						<Badge variant="outline" className="shrink-0 text-nano">
							{i18n.t("library:mcp.off")}
						</Badge>
					) : null}
				</div>
				<span className="truncate text-small text-muted-foreground">
					{server.transport === "http"
						? server.url
						: [server.command, ...server.args].join(" ")}
				</span>
				<div className="flex flex-wrap gap-1 pt-0.5">
					{server.providers.length === 0 ? (
						<span className="text-nano text-muted-foreground">
							{i18n.t("library:mcp.notSynced")}
						</span>
					) : (
						server.providers.map((p) => (
							<Badge key={p} variant="outline" className="text-nano">
								{mcpAgentLabel(p)}
							</Badge>
						))
					)}
				</div>
			</div>
		</button>
	);
}

function CatalogCard({
	entry,
	onAdd,
}: {
	entry: McpCatalogEntry;
	onAdd: () => void;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3">
			<BrandIcon iconKey={entry.iconKey} name={entry.name} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-ui font-medium text-foreground">
						{entry.name}
					</span>
					<Badge variant="secondary" className="shrink-0 text-nano">
						{entry.transport}
					</Badge>
				</div>
				<span className="line-clamp-2 text-small text-muted-foreground">
					{mcpDescription(entry)}
				</span>
			</div>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={i18n.t("library:mcp.addAria", { name: entry.name })}
				onClick={onAdd}
			>
				<Plus className="size-4" />
			</Button>
		</div>
	);
}
