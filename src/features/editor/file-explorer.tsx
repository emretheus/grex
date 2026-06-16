import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	File,
	Folder,
	FolderOpen,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { memo, useState } from "react";
import type { DirEntry } from "@/lib/api";
import { directoryListingQueryOptions } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const INDENT_STEP = 12;
const BASE_INDENT = 8;

export type FileExplorerProps = {
	workspaceRootPath: string;
	/** Workspace-relative path of the currently-open file, for highlighting. */
	selectedRelPath: string | null;
	/** Called with a workspace-relative path when the user clicks a file. */
	onOpenFile: (relPath: string) => void;
};

/** Left-sidebar codebase browser for the editor surface. Loads one directory
 *  level at a time via the `list_directory` backend command (lazy, cached per
 *  folder), so it scales to large repos without ever walking the whole tree. */
export function FileExplorer({
	workspaceRootPath,
	selectedRelPath,
	onOpenFile,
}: FileExplorerProps) {
	const queryClient = useQueryClient();

	const refreshTree = () => {
		void queryClient.invalidateQueries({
			predicate: (query) =>
				query.queryKey[0] === "directoryListing" &&
				query.queryKey[1] === workspaceRootPath,
		});
	};

	return (
		<aside
			aria-label="File explorer"
			className="flex h-full w-60 shrink-0 flex-col border-r border-border/65 bg-[var(--sidebar)]"
		>
			<div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
				<span className="truncate text-mini font-medium uppercase tracking-wide text-muted-foreground/80">
					Explorer
				</span>
				<button
					type="button"
					aria-label="Refresh file tree"
					title="Refresh"
					onClick={refreshTree}
					className="inline-flex size-5 cursor-interactive items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
				>
					<RefreshCw className="size-3" strokeWidth={2} />
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-gutter:stable]">
				<DirChildren
					workspaceRootPath={workspaceRootPath}
					relPath=""
					depth={0}
					selectedRelPath={selectedRelPath}
					onOpenFile={onOpenFile}
				/>
			</div>
		</aside>
	);
}

type LevelProps = {
	workspaceRootPath: string;
	relPath: string;
	depth: number;
	selectedRelPath: string | null;
	onOpenFile: (relPath: string) => void;
};

/** Fetches + renders one directory level. Only mounted when its parent folder
 *  is expanded, so the query fires lazily on first expand. */
function DirChildren({
	workspaceRootPath,
	relPath,
	depth,
	selectedRelPath,
	onOpenFile,
}: LevelProps) {
	const query = useQuery(
		directoryListingQueryOptions(workspaceRootPath, relPath),
	);

	if (query.isLoading) {
		return <LeafMessage depth={depth} icon="spinner" label="Loading…" />;
	}
	if (query.isError) {
		return (
			<button
				type="button"
				onClick={() => void query.refetch()}
				style={{ paddingLeft: depth * INDENT_STEP + BASE_INDENT }}
				className="flex w-full cursor-interactive items-center gap-1.5 py-1 pr-2 text-left text-mini text-destructive/80 hover:underline"
			>
				Couldn't load — retry
			</button>
		);
	}

	const entries = query.data ?? [];
	if (entries.length === 0) {
		return <LeafMessage depth={depth} label="empty" />;
	}

	return (
		<>
			{entries.map((entry) => (
				<ExplorerNode
					key={entry.path}
					entry={entry}
					depth={depth}
					workspaceRootPath={workspaceRootPath}
					selectedRelPath={selectedRelPath}
					onOpenFile={onOpenFile}
				/>
			))}
		</>
	);
}

const ExplorerNode = memo(function ExplorerNode({
	entry,
	depth,
	workspaceRootPath,
	selectedRelPath,
	onOpenFile,
}: {
	entry: DirEntry;
	depth: number;
	workspaceRootPath: string;
	selectedRelPath: string | null;
	onOpenFile: (relPath: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const indent = depth * INDENT_STEP + BASE_INDENT;

	if (entry.isDir) {
		return (
			<>
				<button
					type="button"
					aria-expanded={open}
					title={entry.name}
					onClick={() => setOpen((prev) => !prev)}
					style={{ paddingLeft: indent }}
					className="flex w-full cursor-interactive items-center gap-1 py-1 pr-2 text-left text-small text-foreground/90 transition-colors hover:bg-accent/60"
				>
					<ChevronRight
						className={cn(
							"size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
							open && "rotate-90",
						)}
						strokeWidth={2}
					/>
					{open ? (
						<FolderOpen
							className="size-3.5 shrink-0 text-sky-500/90"
							strokeWidth={2}
						/>
					) : (
						<Folder
							className="size-3.5 shrink-0 text-sky-500/90"
							strokeWidth={2}
						/>
					)}
					<span className="truncate">{entry.name}</span>
				</button>
				{open ? (
					<DirChildren
						workspaceRootPath={workspaceRootPath}
						relPath={entry.path}
						depth={depth + 1}
						selectedRelPath={selectedRelPath}
						onOpenFile={onOpenFile}
					/>
				) : null}
			</>
		);
	}

	const selected = selectedRelPath === entry.path;
	return (
		<button
			type="button"
			title={entry.name}
			aria-current={selected ? "true" : undefined}
			onClick={() => onOpenFile(entry.path)}
			style={{ paddingLeft: indent + 16 }}
			className={cn(
				"flex w-full cursor-interactive items-center gap-1.5 py-1 pr-2 text-left text-small text-foreground/80 transition-colors hover:bg-accent/60",
				selected && "bg-accent text-foreground",
			)}
		>
			<File
				className={cn("size-3.5 shrink-0", fileAccentClass(entry.name))}
				strokeWidth={2}
			/>
			<span className="truncate">{entry.name}</span>
		</button>
	);
});

function LeafMessage({
	depth,
	label,
	icon,
}: {
	depth: number;
	label: string;
	icon?: "spinner";
}) {
	return (
		<div
			style={{ paddingLeft: depth * INDENT_STEP + BASE_INDENT + 16 }}
			className="flex items-center gap-1.5 py-1 pr-2 text-mini text-muted-foreground/55"
		>
			{icon === "spinner" ? (
				<Loader2 className="size-3 animate-spin" strokeWidth={2} />
			) : null}
			<span className="italic">{label}</span>
		</div>
	);
}

/** A light extension→accent tint so the tree reads at a glance. Falls back to
 *  a neutral muted color for anything unmapped. */
function fileAccentClass(name: string): string {
	const ext = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
		: "";
	switch (ext) {
		case "ts":
		case "tsx":
			return "text-blue-500/80";
		case "js":
		case "jsx":
		case "mjs":
		case "cjs":
			return "text-yellow-500/80";
		case "rs":
			return "text-orange-500/80";
		case "css":
		case "scss":
			return "text-sky-500/80";
		case "json":
		case "toml":
		case "yaml":
		case "yml":
			return "text-amber-600/70";
		case "md":
		case "mdx":
			return "text-muted-foreground";
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "svg":
		case "webp":
			return "text-emerald-500/80";
		default:
			return "text-muted-foreground/70";
	}
}
