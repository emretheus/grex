// FILE: GitHistoryPanel.tsx
// Purpose: Commit history list with VS Code Git Graph–style branch graph,
//          ref decorations, and author/date metadata.
// Layer: Chat right-dock UI

import { type GitLogCommit, gitLogQueryOptions } from "~/lib/gitReactQuery";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";
import { buildGraphLayout, DEFAULT_GRAPH_CONFIG, type GraphRenderData } from "~/lib/gitGraph";

// ── graph SVG (single element spanning all rows) ──────────────────────────────

const GRAPH_ROW_H = DEFAULT_GRAPH_CONFIG.gridY;

const GraphSvg = memo(function GraphSvg({ layout }: { layout: GraphRenderData }) {
  const { paths, dots, svgWidth, svgHeight } = layout;
  const bg = "var(--color-sidebar, #ffffff)";

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {/* Branch lines */}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.colour}
          strokeWidth={DEFAULT_GRAPH_CONFIG.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Commit dots */}
      {dots.map((dot, i) =>
        dot.isCurrent ? (
          // HEAD: hollow ring
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius}
            fill={bg}
            stroke={dot.colour}
            strokeWidth={2}
          />
        ) : dot.isMerge ? (
          // Merge: slightly larger filled dot with ring
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius + 1}
            fill={dot.colour}
            stroke={bg}
            strokeWidth={1.5}
          />
        ) : (
          // Regular: filled dot with thin bg border so it sits above lines
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={DEFAULT_GRAPH_CONFIG.dotRadius}
            fill={dot.colour}
            stroke={bg}
            strokeWidth={1}
          />
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
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[10px] font-medium leading-none",
        isHead
          ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
          : isTag
            ? "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-400/30 dark:text-amber-400"
            : isRemote
              ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-inset ring-indigo-400/30 dark:text-indigo-400"
              : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      {text}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
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

// ── commit row ────────────────────────────────────────────────────────────────

const CommitRow = memo(function CommitRow({
  commit,
  graphColWidth,
  colTemplate,
}: {
  commit: GitLogCommit;
  graphColWidth: number;
  colTemplate: string;
}) {
  const headRef = commit.refs.find((r) => r === "HEAD" || r.startsWith("HEAD -> "));
  const otherRefs = commit.refs.filter((r) => r !== "HEAD" && !r.startsWith("HEAD -> "));
  const allRefs = headRef ? [headRef, ...otherRefs] : otherRefs;

  return (
    <div
      className="grid cursor-default items-center hover:bg-sidebar-accent/50"
      style={{ height: GRAPH_ROW_H, gridTemplateColumns: colTemplate }}
      title={`${commit.sha}\n${commit.authorName} <${commit.authorEmail}>\n${commit.authorDate}`}
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
        {formatDate(commit.authorDate)}
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
  /** SHA of the current HEAD commit (to render as hollow ring). */
  headSha?: string;
}

export function GitHistoryPanel({ cwd, headSha }: GitHistoryPanelProps) {
  useWorkspaceFileWatch(cwd);
  const logQuery = useQuery(gitLogQueryOptions(cwd));
  const commits = logQuery.data?.commits ?? [];

  const layout: GraphRenderData = useMemo(() => {
    return buildGraphLayout(
      commits.map((c) => ({
        sha: c.sha,
        parentShas: c.parentShas,
        isCurrent: c.sha === headSha,
      })),
    );
  }, [commits, headSha]);

  // Graph column width derived from the SVG width the engine computed.
  const graphColWidth = Math.max(layout.svgWidth + DEFAULT_GRAPH_CONFIG.offsetX, 32);
  const colTemplate = `${graphColWidth}px 1fr 80px 70px 60px`;

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
    <div className="h-full min-h-0 w-full overflow-auto">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 grid items-center border-b border-border/50 bg-sidebar"
        style={{ gridTemplateColumns: colTemplate, height: 24 }}
      >
        {(["Graph", "Description", "Date", "Author", "Commit"] as const).map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70",
              i === 0 ? "pl-2" : i === 2 ? "pr-2 text-right" : "pr-2",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Rows + single continuous graph SVG overlay */}
      <div className="relative">
        <div
          className="pointer-events-none absolute left-0 top-0 z-[1]"
          style={{ width: graphColWidth, height: commits.length * GRAPH_ROW_H }}
        >
          <GraphSvg layout={layout} />
        </div>

        {commits.map((commit) => (
          <CommitRow
            key={commit.sha}
            commit={commit}
            graphColWidth={graphColWidth}
            colTemplate={colTemplate}
          />
        ))}
      </div>
    </div>
  );
}

export default GitHistoryPanel;
