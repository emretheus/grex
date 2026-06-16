import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getMaterialFileIcon,
	getMaterialFolderIcon,
} from "file-extension-icon-js";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import {
	createContext,
	memo,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	type DetectedEditor,
	type DirEntry,
	openFileInEditor,
	revealPathInFinder,
} from "@/lib/api";
import { useComposerInsert } from "@/lib/composer-insert-context";
import type { InspectorFileItem } from "@/lib/editor-session";
import {
	detectedEditorsQueryOptions,
	directoryListingQueryOptions,
	workspaceChangesQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";

const INDENT_STEP = 12;
const BASE_INDENT = 8;

type GitStatus = "M" | "A" | "D";

type ExplorerContextValue = {
	workspaceRootPath: string;
	selectedRelPath: string | null;
	onOpenFile: (relPath: string) => void;
	expandedPaths: Set<string>;
	toggle: (path: string) => void;
	/** path → git status for changed FILES. */
	statusByPath: Map<string, GitStatus>;
	/** dir paths that (transitively) contain a changed file. */
	dirtyDirs: Set<string>;
	/** Editors found on the machine, for the "Open with" submenu. */
	detectedEditors: DetectedEditor[];
	/** Append a file to the active workspace composer as agent context. */
	addToChat: (relPath: string) => void;
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);
const useExplorer = () => {
	const ctx = useContext(ExplorerContext);
	if (!ctx) throw new Error("ExplorerContext missing");
	return ctx;
};

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 260;

export type FileExplorerProps = {
	workspaceRootPath: string;
	/** Selected workspace id, used to scope git-status decorations. */
	workspaceId?: string | null;
	/** Workspace-relative path of the currently-open file, for highlighting. */
	selectedRelPath: string | null;
	/** Called with a workspace-relative path when the user clicks a file. */
	onOpenFile: (relPath: string) => void;
	/** Sidebar width in px (persisted by the parent). Defaults to 260. */
	width?: number;
	/** When provided, a drag handle on the right edge resizes the sidebar. */
	onWidthChange?: (width: number) => void;
};

/** Left-sidebar codebase browser for the editor surface. Loads one directory
 *  level at a time via the `list_directory` backend command (lazy, cached per
 *  folder), so it scales to large repos without ever walking the whole tree.
 *  Decorates changed files with git status, and auto-reveals the open file. */
export function FileExplorer({
	workspaceRootPath,
	workspaceId,
	selectedRelPath,
	onOpenFile,
	width = DEFAULT_WIDTH,
	onWidthChange,
}: FileExplorerProps) {
	const queryClient = useQueryClient();
	const expandedKey = `grex.explorer.expanded:${workspaceRootPath}`;
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
		const persisted = readStringSet(expandedKey);
		for (const dir of ancestorDirs(selectedRelPath)) persisted.add(dir);
		return persisted;
	});

	// Persist expanded folders per workspace so the tree restores its shape.
	useEffect(() => {
		writeStringSet(expandedKey, expandedPaths);
	}, [expandedKey, expandedPaths]);

	// Auto-reveal: when the open file changes, expand every ancestor folder so
	// the file becomes visible (lazy levels load as they mount). Keyed on the
	// path only, so a manual collapse isn't undone until a different file opens.
	useEffect(() => {
		const ancestors = ancestorDirs(selectedRelPath);
		if (ancestors.length === 0) return;
		setExpandedPaths((prev) => {
			let changed = false;
			const next = new Set(prev);
			for (const dir of ancestors) {
				if (!next.has(dir)) {
					next.add(dir);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [selectedRelPath]);

	const changesQuery = useQuery({
		...workspaceChangesQueryOptions(workspaceRootPath, workspaceId ?? null),
		enabled: Boolean(workspaceRootPath),
	});

	const { statusByPath, dirtyDirs } = useMemo(
		() => buildGitDecorations(changesQuery.data ?? []),
		[changesQuery.data],
	);

	const editorsQuery = useQuery(detectedEditorsQueryOptions());
	const insertIntoComposer = useComposerInsert();
	const addToChat = useMemo(
		() => (relPath: string) =>
			insertIntoComposer({
				items: [{ kind: "file", path: relPath }],
				behavior: "append",
			}),
		[insertIntoComposer],
	);

	const toggle = useMemo(
		() => (path: string) =>
			setExpandedPaths((prev) => {
				const next = new Set(prev);
				if (next.has(path)) next.delete(path);
				else next.add(path);
				return next;
			}),
		[],
	);

	const detectedEditors = editorsQuery.data ?? [];
	const ctx = useMemo<ExplorerContextValue>(
		() => ({
			workspaceRootPath,
			selectedRelPath,
			onOpenFile,
			expandedPaths,
			toggle,
			statusByPath,
			dirtyDirs,
			detectedEditors,
			addToChat,
		}),
		[
			workspaceRootPath,
			selectedRelPath,
			onOpenFile,
			expandedPaths,
			toggle,
			statusByPath,
			dirtyDirs,
			detectedEditors,
			addToChat,
		],
	);

	const refreshTree = () => {
		void queryClient.invalidateQueries({
			predicate: (query) =>
				(query.queryKey[0] === "directoryListing" &&
					query.queryKey[1] === workspaceRootPath) ||
				query.queryKey[0] === "workspaceChanges",
		});
	};

	const startResize = (event: React.MouseEvent) => {
		if (!onWidthChange) return;
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = width;
		const onMove = (move: MouseEvent) => {
			const next = Math.min(
				MAX_WIDTH,
				Math.max(MIN_WIDTH, startWidth + (move.clientX - startX)),
			);
			onWidthChange(next);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			document.body.style.removeProperty("cursor");
		};
		document.body.style.cursor = "ew-resize";
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<aside
			aria-label="File explorer"
			style={{ width }}
			className="relative flex h-full shrink-0 flex-col border-r border-border/65 bg-[var(--sidebar)]"
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
				<ExplorerContext.Provider value={ctx}>
					<DirChildren
						workspaceRootPath={workspaceRootPath}
						relPath=""
						depth={0}
					/>
				</ExplorerContext.Provider>
			</div>
			{onWidthChange ? (
				<button
					type="button"
					aria-label="Resize file explorer"
					tabIndex={-1}
					onMouseDown={startResize}
					className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-ew-resize bg-transparent transition-colors hover:bg-primary/40"
				/>
			) : null}
		</aside>
	);
}

function readStringSet(key: string): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? new Set(parsed.filter(isString)) : new Set();
	} catch {
		return new Set();
	}
}

function writeStringSet(key: string, set: Set<string>) {
	try {
		localStorage.setItem(key, JSON.stringify([...set]));
	} catch {
		// Best-effort; private mode / quota exceeded just skips persistence.
	}
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** Fetches + renders one directory level. Only mounted when its parent folder
 *  is expanded, so the query fires lazily on first expand. */
function DirChildren({
	workspaceRootPath,
	relPath,
	depth,
}: {
	workspaceRootPath: string;
	relPath: string;
	depth: number;
}) {
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
				/>
			))}
		</>
	);
}

const ExplorerNode = memo(function ExplorerNode({
	entry,
	depth,
	workspaceRootPath,
}: {
	entry: DirEntry;
	depth: number;
	workspaceRootPath: string;
}) {
	const {
		selectedRelPath,
		onOpenFile,
		expandedPaths,
		toggle,
		statusByPath,
		dirtyDirs,
	} = useExplorer();
	const indent = depth * INDENT_STEP + BASE_INDENT;

	if (entry.isDir) {
		const open = expandedPaths.has(entry.path);
		const dirty = dirtyDirs.has(entry.path);
		return (
			<>
				<NodeContextMenu relPath={entry.path} isDir>
					<button
						type="button"
						aria-expanded={open}
						title={entry.name}
						onClick={() => toggle(entry.path)}
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
						<img
							src={getMaterialFolderIcon(entry.name)}
							alt=""
							aria-hidden="true"
							className="size-4 shrink-0"
						/>
						<span className="truncate">{entry.name}</span>
						{dirty ? (
							<span
								aria-hidden="true"
								className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500/80"
							/>
						) : null}
					</button>
				</NodeContextMenu>
				{open ? (
					<DirChildren
						workspaceRootPath={workspaceRootPath}
						relPath={entry.path}
						depth={depth + 1}
					/>
				) : null}
			</>
		);
	}

	const selected = selectedRelPath === entry.path;
	const status = statusByPath.get(entry.path);
	const statusInfo = status ? GIT_STATUS_INFO[status] : null;
	return (
		<NodeContextMenu relPath={entry.path} isDir={false}>
			<button
				type="button"
				ref={selected ? scrollSelectedIntoView : undefined}
				title={entry.name}
				aria-current={selected ? "true" : undefined}
				onClick={() => onOpenFile(entry.path)}
				style={{ paddingLeft: indent + 16 }}
				className={cn(
					"flex w-full cursor-interactive items-center gap-1.5 py-1 pr-2 text-left text-small transition-colors hover:bg-accent/60",
					statusInfo ? statusInfo.text : "text-foreground/80",
					selected && "bg-accent text-foreground",
				)}
			>
				<img
					src={getMaterialFileIcon(entry.name)}
					alt=""
					aria-hidden="true"
					className="size-4 shrink-0"
				/>
				<span className="truncate">{entry.name}</span>
				{statusInfo ? (
					<span
						aria-hidden="true"
						className={cn(
							"ml-auto shrink-0 font-mono text-mini font-semibold",
							statusInfo.text,
						)}
					>
						{statusInfo.letter}
					</span>
				) : null}
			</button>
		</NodeContextMenu>
	);
});

/** Right-click menu for a tree row: copy paths, reveal in Finder, open in an
 *  external editor (files), and add the file to the chat composer as context. */
function NodeContextMenu({
	relPath,
	isDir,
	children,
}: {
	relPath: string;
	isDir: boolean;
	children: ReactNode;
}) {
	const { workspaceRootPath, detectedEditors, addToChat } = useExplorer();
	const absPath = `${workspaceRootPath.replace(/\/+$/, "")}/${relPath}`;
	const copy = (text: string) => {
		void navigator.clipboard?.writeText(text);
	};
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onSelect={() => copy(absPath)}>
					Copy path
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => copy(relPath)}>
					Copy relative path
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => void revealPathInFinder(absPath)}>
					Reveal in Finder
				</ContextMenuItem>
				{!isDir && detectedEditors.length > 0 ? (
					<ContextMenuSub>
						<ContextMenuSubTrigger>Open with</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							{detectedEditors.map((editor) => (
								<ContextMenuItem
									key={editor.id}
									onSelect={() => void openFileInEditor(absPath, editor.id)}
								>
									{editor.name}
								</ContextMenuItem>
							))}
						</ContextMenuSubContent>
					</ContextMenuSub>
				) : null}
				{!isDir ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={() => addToChat(relPath)}>
							Add to chat
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}

/** Scroll the open file into view when its row mounts (auto-reveal). */
function scrollSelectedIntoView(el: HTMLElement | null) {
	el?.scrollIntoView({ block: "nearest" });
}

const GIT_STATUS_INFO: Record<GitStatus, { letter: string; text: string }> = {
	M: { letter: "M", text: "text-amber-500" },
	A: { letter: "A", text: "text-emerald-500" },
	D: { letter: "D", text: "text-rose-500/90" },
};

/** Build the path→status map (for files) and the set of folders containing a
 *  change (for the folder dot), from the workspace changes list. */
function buildGitDecorations(changes: InspectorFileItem[]): {
	statusByPath: Map<string, GitStatus>;
	dirtyDirs: Set<string>;
} {
	const statusByPath = new Map<string, GitStatus>();
	const dirtyDirs = new Set<string>();
	for (const item of changes) {
		const status = normalizeStatus(item);
		statusByPath.set(item.path, status);
		for (const dir of ancestorDirs(item.path)) dirtyDirs.add(dir);
	}
	return { statusByPath, dirtyDirs };
}

function normalizeStatus(item: InspectorFileItem): GitStatus {
	const raw = item.unstagedStatus ?? item.stagedStatus ?? item.status;
	return raw === "A" || raw === "D" ? raw : "M";
}

/** Ancestor directory paths of a workspace-relative file path, e.g.
 *  `a/b/c.ts` → [`a`, `a/b`]. Returns [] for a root-level path or null. */
function ancestorDirs(relPath: string | null): string[] {
	if (!relPath) return [];
	const parts = relPath.split("/");
	parts.pop(); // drop the file segment
	const dirs: string[] = [];
	let acc = "";
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		dirs.push(acc);
	}
	return dirs;
}

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
