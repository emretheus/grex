// FILE: GitHistoryPanel.tsx
// Purpose: Commit history — VS Code Git Graph–style layout with branch graph,
//          ref chips, and click-to-expand commit detail panel.
// Layer: Chat right-dock UI

import {
  type GitLogCommit,
  gitLogQueryOptions,
  gitShowCommitQueryOptions,
} from "~/lib/gitReactQuery";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";
import { buildGraphLayout, DEFAULT_GRAPH_CONFIG, type GraphRenderData } from "~/lib/gitGraph";

// ── layout constants (match reference screenshot) ─────────────────────────────

const ROW_H = 32; // px — taller rows like the reference
const HEADER_H = 28;
const GRAPH_CFG = { ...DEFAULT_GRAPH_CONFIG, gridY: ROW_H, offsetY: ROW_H / 2 };

// ── continuous graph SVG ───────────────────────────────────────────────────────

const GraphSvg = memo(function GraphSvg({ layout }: { layout: GraphRenderData }) {
  const { paths, dots, svgWidth, svgHeight } = layout;
  const bg = "var(--color-sidebar, #18181b)";
  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.colour}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {dots.map((dot, i) =>
        dot.isCurrent ? (
          // HEAD: hollow ring
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={5.5}
            fill={bg}
            stroke={dot.colour}
            strokeWidth={2.5}
          />
        ) : dot.isMerge ? (
          // Merge: diamond shape via rotated rect
          <g key={i} transform={`translate(${dot.cx},${dot.cy}) rotate(45)`}>
            <rect x={-4.5} y={-4.5} width={9} height={9} fill={dot.colour} rx={1} />
          </g>
        ) : (
          // Regular: solid dot
          <circle key={i} cx={dot.cx} cy={dot.cy} r={5} fill={dot.colour} />
        ),
      )}
    </svg>
  );
});

// ── ref chip ──────────────────────────────────────────────────────────────────

function RefChip({ label }: { label: string }) {
  const isHead = label === "HEAD" || label.startsWith("HEAD -> ");
  const isRemote = !label.startsWith("tag: ") && !isHead && label.includes("/");
  const isTag = label.startsWith("tag: ");
  const text = label.replace(/^HEAD -> /, "").replace(/^tag: /, "");

  // Icon paths (mini SVG)
  const BranchIcon = (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 1.734a2.25 2.25 0 1 1 0-3.468V8A2.25 2.25 0 0 1 10 10.25H6a.75.75 0 0 0-.75.75v1.016a2.25 2.25 0 1 1-1.5 0V4.5a2.25 2.25 0 1 1 1.5 0v5.5H10a.75.75 0 0 0 .75-.75V4.234z" />
    </svg>
  );
  const TagIcon = (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <path d="M2.5 7.775V2.75a.25.25 0 0 1 .25-.25h5.025a.25.25 0 0 1 .177.073l6.25 6.25a.25.25 0 0 1 0 .354l-5.025 5.025a.25.25 0 0 1-.354 0l-6.25-6.25a.25.25 0 0 1-.073-.177zm1.5.025 5.5 5.5 4.146-4.146-5.5-5.5H4zm1.75-2.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
    </svg>
  );

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        isHead
          ? "bg-blue-600 text-white"
          : isTag
            ? "bg-amber-600/90 text-white"
            : isRemote
              ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-400/40"
              : "bg-zinc-600/60 text-zinc-200 ring-1 ring-inset ring-zinc-500/40",
      )}
    >
      {(isHead || !isRemote) && !isTag ? BranchIcon : isTag ? TagIcon : null}
      {text}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function shortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

// ── file-tree builder for detail panel ───────────────────────────────────────

interface FileNode {
  name: string;
  fullPath: string;
  status: string;
  additions: number;
  deletions: number;
  children: FileNode[];
  isDir: boolean;
}

function buildFileTree(
  files: ReadonlyArray<{
    readonly path: string;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
  }>,
): FileNode[] {
  const root: FileNode = {
    name: "",
    fullPath: "",
    status: "",
    additions: 0,
    deletions: 0,
    children: [],
    isDir: true,
  };

  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: parts.slice(0, i + 1).join("/"),
          status: isLast ? f.status : "",
          additions: isLast ? f.additions : 0,
          deletions: isLast ? f.deletions : 0,
          children: [],
          isDir: !isLast,
        };
        node.children.push(child);
      } else if (isLast) {
        child.additions = f.additions;
        child.deletions = f.deletions;
        child.status = f.status;
      }
      node = child;
    }
  }

  return root.children;
}

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const statusColor =
    node.status === "A"
      ? "text-green-400"
      : node.status === "D"
        ? "text-red-400"
        : node.status === "R" || node.status === "C"
          ? "text-blue-400"
          : "text-yellow-400";

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-[2px] hover:bg-white/5 rounded cursor-default",
          node.isDir ? "cursor-pointer" : "",
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={node.isDir ? () => setOpen((o) => !o) : undefined}
      >
        {node.isDir ? (
          <>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              className={cn("shrink-0 text-zinc-400 transition-transform", open ? "rotate-90" : "")}
            >
              <path d="M3 2l4 3-4 3V2z" />
            </svg>
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="shrink-0 text-zinc-400"
            >
              <path d="M1.75 4.5a.25.25 0 0 1 .25-.25h3.5l1.5 1.5H14a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25H2a.25.25 0 0 1-.25-.25V4.5z" />
            </svg>
            <span className="text-[11px] text-zinc-300">{node.name}</span>
          </>
        ) : (
          <>
            <span className="w-[10px] shrink-0" />
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="shrink-0 text-zinc-500"
            >
              <path d="M2 1.75A.75.75 0 0 1 2.75 1h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A.75.75 0 0 1 13.25 16H2.75A.75.75 0 0 1 2 15.25Zm1.5.75v13h9V6H9.25A.75.75 0 0 1 8.5 5.25V2.5H3.5zm6.5.44V5h2.06Z" />
            </svg>
            <span className={cn("flex-1 min-w-0 truncate text-[11px]", statusColor)}>
              {node.name}
            </span>
            {(node.additions > 0 || node.deletions > 0) && (
              <span className="shrink-0 text-[10px] pr-2">
                {node.additions > 0 && <span className="text-green-400">+{node.additions}</span>}
                {node.additions > 0 && node.deletions > 0 && (
                  <span className="text-zinc-500"> | </span>
                )}
                {node.deletions > 0 && <span className="text-red-400">-{node.deletions}</span>}
              </span>
            )}
          </>
        )}
      </div>
      {node.isDir && open && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.fullPath} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── expanded commit detail panel ──────────────────────────────────────────────

const CommitDetailPanel = memo(function CommitDetailPanel({
  cwd,
  sha,
  accentColor,
  onClose,
}: {
  cwd: string;
  sha: string;
  accentColor: string;
  onClose: () => void;
}) {
  const q = useQuery(gitShowCommitQueryOptions(cwd, sha));
  const detail = q.data;

  return (
    <div
      className="relative border-b border-border/40 bg-[#1c1c1e]"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 1.5l7 7M8.5 1.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {q.isLoading && (
        <div className="flex h-28 items-center justify-center text-[11px] text-zinc-500">
          Loading…
        </div>
      )}
      {q.error && (
        <div className="flex h-28 items-center justify-center text-[11px] text-red-400">
          {q.error instanceof Error ? q.error.message : "Failed to load commit details."}
        </div>
      )}
      {detail && (
        <div className="grid grid-cols-2 divide-x divide-border/30" style={{ minHeight: 160 }}>
          {/* Left: metadata */}
          <div className="space-y-1.5 p-3 pr-4 text-[11px] leading-relaxed">
            <MetaRow
              label="Commit"
              value={<span className="font-mono text-zinc-200">{detail.sha}</span>}
            />
            {detail.parentShas.length > 0 && (
              <MetaRow
                label={detail.parentShas.length === 1 ? "Parent" : "Parents"}
                value={
                  <>
                    {detail.parentShas.map((p) => (
                      <span key={p} className="mr-2 font-mono text-blue-400">
                        {p.slice(0, 12)}
                      </span>
                    ))}
                  </>
                }
              />
            )}
            <MetaRow
              label="Author"
              value={
                <span className="text-zinc-200">
                  {detail.authorName}
                  {detail.authorEmail && (
                    <span className="ml-1 text-zinc-500">&lt;{detail.authorEmail}&gt;</span>
                  )}
                </span>
              }
            />
            {detail.committerName && detail.committerName !== detail.authorName && (
              <MetaRow
                label="Committer"
                value={
                  <span className="text-zinc-200">
                    {detail.committerName}
                    {detail.committerEmail && (
                      <span className="ml-1 text-zinc-500">&lt;{detail.committerEmail}&gt;</span>
                    )}
                  </span>
                }
              />
            )}
            <MetaRow
              label="Date"
              value={<span className="text-zinc-300">{fmtDate(detail.authorDate)}</span>}
            />
            {detail.body && (
              <div className="mt-2 rounded-sm bg-zinc-800/60 px-2.5 py-2 text-[11px] text-zinc-300 whitespace-pre-wrap break-words leading-relaxed border border-white/5">
                {detail.body}
              </div>
            )}
            {!detail.body && (
              <div className="mt-2 text-[11px] text-zinc-400 italic">{detail.subject}</div>
            )}
          </div>

          {/* Right: file tree */}
          <div className="overflow-auto py-2" style={{ maxHeight: 320 }}>
            <div className="mb-1.5 flex items-center justify-between px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {detail.files.length} file{detail.files.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px]">
                <span className="text-green-400">+{detail.totalAdditions}</span>
                <span className="mx-1 text-zinc-600">/</span>
                <span className="text-red-400">-{detail.totalDeletions}</span>
              </span>
            </div>
            {buildFileTree(detail.files).map((node) => (
              <FileTreeNode key={node.fullPath} node={node} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <span className="w-16 shrink-0 font-semibold text-zinc-500">{label}:</span>
      <span className="min-w-0 flex-1 break-all">{value}</span>
    </div>
  );
}

// ── commit row ────────────────────────────────────────────────────────────────

const CommitRow = memo(function CommitRow({
  commit,
  isExpanded,
  graphColWidth,
  colTemplate,
  onToggle,
}: {
  commit: GitLogCommit;
  isExpanded: boolean;
  graphColWidth: number;
  colTemplate: string;
  onToggle: () => void;
}) {
  const headRef = commit.refs.find((r) => r === "HEAD" || r.startsWith("HEAD -> "));
  const otherRefs = commit.refs.filter((r) => r !== "HEAD" && !r.startsWith("HEAD -> "));
  const allRefs = headRef ? [headRef, ...otherRefs] : otherRefs;

  return (
    <div
      className={cn(
        "grid cursor-pointer select-none items-center border-b border-transparent",
        isExpanded ? "bg-zinc-800/70" : "hover:bg-zinc-800/40",
      )}
      style={{ height: ROW_H, gridTemplateColumns: colTemplate }}
      onClick={onToggle}
    >
      <div style={{ width: graphColWidth }} />

      {/* Description */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pr-3">
        {allRefs.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            {allRefs.slice(0, 3).map((ref) => (
              <RefChip key={ref} label={ref} />
            ))}
          </span>
        )}
        <span className="min-w-0 truncate text-[12.5px] leading-none text-zinc-100">
          {commit.subject || <span className="italic text-zinc-500">no message</span>}
        </span>
      </div>

      {/* Date */}
      <div className="pr-3 text-right text-[11.5px] tabular-nums text-zinc-400">
        {shortDate(commit.authorDate)}
      </div>

      {/* Author */}
      <div className="truncate pr-3 text-[11.5px] text-zinc-400">{commit.authorName}</div>

      {/* SHA */}
      <div className="pr-3 font-mono text-[11px] text-zinc-500">{commit.shortSha}</div>
    </div>
  );
});

// ── main panel ────────────────────────────────────────────────────────────────

export interface GitHistoryPanelProps {
  cwd: string;
  headSha?: string;
}

export function GitHistoryPanel({ cwd, headSha }: GitHistoryPanelProps) {
  useWorkspaceFileWatch(cwd);
  const logQuery = useQuery(gitLogQueryOptions(cwd));
  const commits = logQuery.data?.commits ?? [];
  const [expandedSha, setExpandedSha] = useState<string | null>(null);

  const layout: GraphRenderData = useMemo(
    () =>
      buildGraphLayout(
        commits.map((c) => ({
          sha: c.sha,
          parentShas: c.parentShas,
          isCurrent: c.sha === headSha,
        })),
        GRAPH_CFG,
      ),
    [commits, headSha],
  );

  const graphColWidth = Math.max(layout.svgWidth + GRAPH_CFG.offsetX, 36);
  const colTemplate = `${graphColWidth}px 1fr 90px 72px 68px`;

  // Find the accent color for the expanded commit's dot
  const expandedDotColor = useMemo(() => {
    if (!expandedSha) return "#0158FD";
    const idx = commits.findIndex((c) => c.sha === expandedSha);
    return layout.dots[idx]?.colour ?? "#0158FD";
  }, [expandedSha, commits, layout.dots]);

  if (logQuery.isLoading && commits.length === 0) {
    return <PanelStateMessage density="compact">Loading history…</PanelStateMessage>;
  }
  if (logQuery.error) {
    return (
      <PanelStateMessage density="compact">
        {logQuery.error instanceof Error ? logQuery.error.message : "Failed to load history."}
      </PanelStateMessage>
    );
  }
  if (commits.length === 0) {
    return <PanelStateMessage density="compact">No commits yet.</PanelStateMessage>;
  }

  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-[#18181b] text-zinc-100">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 grid items-center border-b border-zinc-700/60 bg-[#1c1c1e]"
        style={{ gridTemplateColumns: colTemplate, height: HEADER_H }}
      >
        {(["Graph", "Description", "Date", "Author", "Commit"] as const).map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-[10.5px] font-bold uppercase tracking-wider text-zinc-500",
              i === 0 ? "pl-3" : i === 2 ? "pr-3 text-right" : "pr-3",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Rows + graph SVG overlay */}
      <div className="relative">
        <div
          className="pointer-events-none absolute left-0 top-0 z-[1]"
          style={{ width: graphColWidth }}
        >
          <GraphSvg layout={layout} />
        </div>

        {commits.map((commit) => {
          const isExpanded = commit.sha === expandedSha;
          return (
            <div key={commit.sha}>
              <CommitRow
                commit={commit}
                isExpanded={isExpanded}
                graphColWidth={graphColWidth}
                colTemplate={colTemplate}
                onToggle={() => setExpandedSha((p) => (p === commit.sha ? null : commit.sha))}
              />
              {isExpanded && (
                <CommitDetailPanel
                  cwd={cwd}
                  sha={commit.sha}
                  accentColor={expandedDotColor}
                  onClose={() => setExpandedSha(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GitHistoryPanel;
