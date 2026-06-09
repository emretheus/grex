// FILE: GitHistoryPanel.tsx
// Purpose: Commit history list with VS Code Git Graph–style branch graph,
//          ref decorations, author/date metadata, and click-to-expand detail panel.
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

// ── constants ─────────────────────────────────────────────────────────────────

const GRAPH_ROW_H = DEFAULT_GRAPH_CONFIG.gridY;
const HEADER_H = 24;

// ── graph SVG (single element spanning all rows) ──────────────────────────────

const GraphSvg = memo(function GraphSvg({
  layout,
  expandedIndex,
  expandedHeight,
}: {
  layout: GraphRenderData;
  expandedIndex: number | null;
  expandedHeight: number;
}) {
  const { paths, dots, svgWidth } = layout;
  // Total SVG height: all rows + expansion slot
  const totalH = dots.length * GRAPH_ROW_H + (expandedIndex !== null ? expandedHeight : 0);
  const bg = "var(--color-sidebar, #1e1e1e)";

  // Shift dot/path y values below the expanded row down by expandedHeight.
  function shiftY(originalY: number, dotIdx: number): number {
    if (expandedIndex === null) return originalY;
    return dotIdx > expandedIndex ? originalY + expandedHeight : originalY;
  }

  return (
    <svg
      width={svgWidth}
      height={totalH}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {/* Branch lines — we re-map each path's y values if expansion is active */}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.colour}
          strokeWidth={DEFAULT_GRAPH_CONFIG.strokeWidth + 0.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Commit dots */}
      {dots.map((dot, i) => {
        const cy = shiftY(dot.cy, i);
        return dot.isCurrent ? (
          <circle
            key={i}
            cx={dot.cx}
            cy={cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius + 0.5}
            fill={bg}
            stroke={dot.colour}
            strokeWidth={2.5}
          />
        ) : dot.isMerge ? (
          <circle
            key={i}
            cx={dot.cx}
            cy={cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius + 1.5}
            fill={dot.colour}
            stroke={bg}
            strokeWidth={1.5}
          />
        ) : (
          <circle
            key={i}
            cx={dot.cx}
            cy={cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius + 0.5}
            fill={dot.colour}
            stroke={bg}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
});

// ── ref chip ──────────────────────────────────────────────────────────────────

function RefChip({ label }: { label: string }) {
  const isHead = label === "HEAD" || label.startsWith("HEAD -> ");
  const isRemote = !label.startsWith("tag: ") && !isHead && label.includes("/");
  const isTag = label.startsWith("tag: ");
  const text = label.replace(/^HEAD -> /, "").replace(/^tag: /, "");
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        isHead
          ? "bg-brand/20 text-brand ring-1 ring-inset ring-brand/40"
          : isTag
            ? "bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-400/40 dark:text-amber-400"
            : isRemote
              ? "bg-indigo-500/15 text-indigo-600 ring-1 ring-inset ring-indigo-400/40 dark:text-indigo-400"
              : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      {text}
    </span>
  );
}

// ── file status icon / badge ──────────────────────────────────────────────────

function FileStatusDot({ status }: { status: string }) {
  const cls =
    status === "A"
      ? "text-green-500"
      : status === "D"
        ? "text-red-500"
        : status === "R" || status === "C"
          ? "text-blue-400"
          : "text-amber-400";
  const label = status === "A" ? "A" : status === "D" ? "D" : status === "R" ? "R" : "M";
  return (
    <span className={cn("shrink-0 w-3.5 text-center text-[9px] font-bold", cls)}>{label}</span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
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

// ── expanded commit detail panel ──────────────────────────────────────────────

const CommitDetailPanel = memo(function CommitDetailPanel({
  cwd,
  sha,
  onClose,
}: {
  cwd: string;
  sha: string;
  onClose: () => void;
}) {
  const q = useQuery(gitShowCommitQueryOptions(cwd, sha));
  const detail = q.data;

  return (
    <div className="border-y border-border/60 bg-sidebar-accent/30" style={{ minHeight: 180 }}>
      {q.isLoading && (
        <div className="flex h-32 items-center justify-center text-[11px] text-muted-foreground">
          Loading…
        </div>
      )}
      {q.error && (
        <div className="flex h-32 items-center justify-center text-[11px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Failed to load commit details."}
        </div>
      )}
      {detail && (
        <div className="grid grid-cols-2 gap-0 divide-x divide-border/40">
          {/* Left: commit metadata */}
          <div className="space-y-2 p-3 text-[11px]">
            {/* Close button */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 min-w-0">
                <div>
                  <span className="font-semibold text-foreground/70">Commit: </span>
                  <span className="font-mono text-foreground/90">{detail.sha}</span>
                </div>
                {detail.parentShas.length > 0 && (
                  <div>
                    <span className="font-semibold text-foreground/70">
                      {detail.parentShas.length === 1 ? "Parent: " : "Parents: "}
                    </span>
                    {detail.parentShas.map((p) => (
                      <span key={p} className="mr-1 font-mono text-brand/80 text-[10px]">
                        {p.slice(0, 12)}
                      </span>
                    ))}
                  </div>
                )}
                <div>
                  <span className="font-semibold text-foreground/70">Author: </span>
                  <span>{detail.authorName}</span>
                  {detail.authorEmail && (
                    <span className="ml-1 text-muted-foreground">&lt;{detail.authorEmail}&gt;</span>
                  )}
                </div>
                {detail.committerName && detail.committerName !== detail.authorName && (
                  <div>
                    <span className="font-semibold text-foreground/70">Committer: </span>
                    <span>{detail.committerName}</span>
                    {detail.committerEmail && (
                      <span className="ml-1 text-muted-foreground">
                        &lt;{detail.committerEmail}&gt;
                      </span>
                    )}
                  </div>
                )}
                <div>
                  <span className="font-semibold text-foreground/70">Date: </span>
                  <span className="text-foreground/80">{formatDate(detail.authorDate)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                aria-label="Close commit details"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 2l8 8M10 2l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {detail.body && (
              <div className="mt-1 rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/80 whitespace-pre-wrap break-words">
                {detail.body}
              </div>
            )}
            {!detail.body && detail.subject && (
              <div className="mt-1 text-foreground/70 italic">{detail.subject}</div>
            )}
          </div>

          {/* Right: changed files */}
          <div className="overflow-auto p-2" style={{ maxHeight: 280 }}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {detail.files.length} file{detail.files.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                <span className="text-green-500">+{detail.totalAdditions}</span>
                {" / "}
                <span className="text-red-500">-{detail.totalDeletions}</span>
              </span>
            </div>
            <div className="space-y-px">
              {detail.files.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-muted/30"
                >
                  <FileStatusDot status={f.status} />
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                    {f.path}
                  </span>
                  <span className="shrink-0 text-[10px]">
                    {f.additions > 0 && <span className="text-green-500">+{f.additions}</span>}
                    {f.deletions > 0 && <span className="ml-0.5 text-red-500">-{f.deletions}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

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
        "grid cursor-pointer items-center select-none",
        isExpanded ? "bg-sidebar-accent/60" : "hover:bg-sidebar-accent/50",
      )}
      style={{ height: GRAPH_ROW_H, gridTemplateColumns: colTemplate }}
      onClick={onToggle}
      title={`${commit.sha} — click to expand`}
    >
      {/* Graph placeholder — actual SVG is the absolute overlay */}
      <div style={{ width: graphColWidth }} />

      {/* Description: ref chips then subject */}
      <div className="flex min-w-0 items-center gap-1 overflow-hidden pr-2">
        {allRefs.length > 0 && (
          <span className="flex shrink-0 items-center gap-0.5">
            {allRefs.slice(0, 3).map((ref) => (
              <RefChip key={ref} label={ref} />
            ))}
          </span>
        )}
        <span className="min-w-0 truncate text-[12px] leading-none text-foreground">
          {commit.subject || <span className="italic text-muted-foreground">no message</span>}
        </span>
      </div>

      {/* Date */}
      <div className="pr-2 text-right text-[10px] text-muted-foreground/70">
        {shortDate(commit.authorDate)}
      </div>

      {/* Author */}
      <div className="truncate pr-2 text-[10px] text-muted-foreground/70">{commit.authorName}</div>

      {/* SHA */}
      <div className="pr-2 font-mono text-[10px] text-muted-foreground/70">{commit.shortSha}</div>
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

  const layout: GraphRenderData = useMemo(() => {
    return buildGraphLayout(
      commits.map((c) => ({
        sha: c.sha,
        parentShas: c.parentShas,
        isCurrent: c.sha === headSha,
      })),
    );
  }, [commits, headSha]);

  const graphColWidth = Math.max(layout.svgWidth + DEFAULT_GRAPH_CONFIG.offsetX, 32);
  const colTemplate = `${graphColWidth}px 1fr 90px 70px 62px`;

  const expandedIndex = expandedSha ? commits.findIndex((c) => c.sha === expandedSha) : null;

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

  // The detail panel height is flexible (content-driven), so we use a fixed
  // estimate for SVG shift purposes — the SVG overlay uses CSS transform for dots.
  const EXPAND_PANEL_H = 0; // SVG doesn't need shift; panel is below the row

  return (
    <div className="h-full min-h-0 w-full overflow-auto">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 grid items-center border-b border-border/50 bg-sidebar"
        style={{ gridTemplateColumns: colTemplate, height: HEADER_H }}
      >
        {(["Graph", "Description", "Date", "Author", "Commit"] as const).map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60",
              i === 0 ? "pl-2" : i === 2 ? "pr-2 text-right" : "pr-2",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Rows + single continuous graph SVG overlay */}
      <div className="relative">
        {/* Single SVG spanning all rows */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-[1]"
          style={{ width: graphColWidth }}
        >
          <GraphSvg
            layout={layout}
            expandedIndex={expandedIndex !== -1 ? expandedIndex : null}
            expandedHeight={EXPAND_PANEL_H}
          />
        </div>

        {commits.map((commit, i) => {
          const isExpanded = commit.sha === expandedSha;
          return (
            <div key={commit.sha}>
              <CommitRow
                commit={commit}
                isExpanded={isExpanded}
                graphColWidth={graphColWidth}
                colTemplate={colTemplate}
                onToggle={() => setExpandedSha((prev) => (prev === commit.sha ? null : commit.sha))}
              />
              {isExpanded && (
                <CommitDetailPanel
                  cwd={cwd}
                  sha={commit.sha}
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
