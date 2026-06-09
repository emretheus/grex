// FILE: GitHistoryPanel.tsx
// Purpose: Commit history list with a topology-order branch graph column,
//          ref decorations, and author/date metadata. Displayed as a tab
//          inside GitPanel ("History") when the user wants to see the log.
// Layer: Chat right-dock UI

import { type GitLogCommit, gitLogQueryOptions } from "~/lib/gitReactQuery";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";

// ── graph layout ─────────────────────────────────────────────────────────────

const GRAPH_COL_W = 14; // px per column
const GRAPH_ROW_H = 28; // px per row — must match row height in CSS
const DOT_R = 4;

interface GraphCell {
  // column index for this commit's dot
  col: number;
  // total columns used up through this row (drives SVG width)
  totalCols: number;
  // edges from parent row columns to child row columns
  edges: Array<{
    fromCol: number;
    toCol: number;
    // "straight" | "bend-right" | "bend-left"
    style: "straight" | "merge" | "branch";
  }>;
}

function buildGraphCells(commits: readonly GitLogCommit[]): GraphCell[] {
  // columns[i] = sha of the commit that "owns" column i (ongoing branch line)
  let columns: Array<string | null> = [];

  const cells: GraphCell[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]!;
    const sha = commit.sha;
    const parents = commit.parentShas;

    // Find which column owns this commit
    let col = columns.indexOf(sha);
    if (col === -1) {
      // Start a new column (first commit in a new branch)
      col = columns.indexOf(null);
      if (col === -1) {
        col = columns.length;
        columns.push(sha);
      } else {
        columns[col] = sha;
      }
    }

    const edges: GraphCell["edges"] = [];

    // Build edges: each active column continues unless it IS this commit's col
    // and we replace it with the first parent.
    const nextColumns: Array<string | null> = [];

    let primaryParentAssigned = false;
    for (let c = 0; c < columns.length; c++) {
      const occupant = columns[c] ?? null;
      if (occupant === sha) {
        // This column was owned by us — hand it to our first parent
        if (!primaryParentAssigned && parents.length > 0) {
          const p0 = parents[0]!;
          // Check if p0 already has a column
          const existingCol = columns.indexOf(p0, c + 1);
          if (existingCol !== -1) {
            // Merge edge: current col bends to existing parent col
            edges.push({ fromCol: c, toCol: existingCol, style: "merge" });
            nextColumns.push(null);
          } else {
            nextColumns.push(p0);
            edges.push({ fromCol: c, toCol: c, style: "straight" });
          }
          primaryParentAssigned = true;
        } else {
          nextColumns.push(null);
        }
      } else if (occupant !== null) {
        // Continuing branch line — check for merge target
        const existingInNext = nextColumns.indexOf(occupant);
        if (existingInNext !== -1) {
          edges.push({ fromCol: c, toCol: existingInNext, style: "merge" });
          nextColumns.push(null);
        } else {
          nextColumns.push(occupant);
          edges.push({ fromCol: c, toCol: c, style: "straight" });
        }
      } else {
        nextColumns.push(null);
      }
    }

    // Additional parents (merge commits) open new columns
    for (let p = 1; p < parents.length; p++) {
      const parentSha = parents[p]!;
      const existingCol = nextColumns.indexOf(parentSha);
      if (existingCol !== -1) {
        edges.push({ fromCol: col, toCol: existingCol, style: "merge" });
      } else {
        // Find free slot
        let freeSlot = nextColumns.indexOf(null);
        if (freeSlot === -1) {
          freeSlot = nextColumns.length;
          nextColumns.push(parentSha);
        } else {
          nextColumns[freeSlot] = parentSha;
        }
        edges.push({ fromCol: col, toCol: freeSlot, style: "branch" });
      }
    }

    // Trim trailing nulls
    while (nextColumns.length > 0 && nextColumns[nextColumns.length - 1] === null) {
      nextColumns.pop();
    }

    const totalCols = Math.max(col + 1, nextColumns.length, 1);
    cells.push({ col, totalCols, edges });
    columns = nextColumns;
  }

  return cells;
}

// ── colour palette (10 colours, cycles) ────────────────────────────────────

const BRANCH_COLORS = [
  "#0158FD", // brand blue
  "#01CCA4", // brand green
  "#a78bfa", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
];

function branchColor(col: number): string {
  return BRANCH_COLORS[col % BRANCH_COLORS.length]!;
}

// ── SVG graph strip ──────────────────────────────────────────────────────────

const GraphStrip = memo(function GraphStrip({
  cells,
  index,
}: {
  cells: readonly GraphCell[];
  index: number;
}) {
  const cell = cells[index];
  if (!cell) return null;
  const { col, totalCols, edges } = cell;
  const w = totalCols * GRAPH_COL_W + GRAPH_COL_W / 2;
  const cx = col * GRAPH_COL_W + GRAPH_COL_W / 2;
  const cy = GRAPH_ROW_H / 2;

  // Lines from this row to next
  const lines = edges.map((edge, ei) => {
    const x1 = edge.fromCol * GRAPH_COL_W + GRAPH_COL_W / 2;
    const x2 = edge.toCol * GRAPH_COL_W + GRAPH_COL_W / 2;
    const color = branchColor(edge.fromCol);
    if (edge.style === "straight") {
      return (
        <line
          key={ei}
          x1={x1}
          y1={cy}
          x2={x2}
          y2={GRAPH_ROW_H}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      );
    }
    // Curved merge/branch line
    const midY = GRAPH_ROW_H * 0.75;
    return (
      <path
        key={ei}
        d={`M ${x1} ${cy} Q ${x1} ${midY} ${x2} ${GRAPH_ROW_H}`}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
    );
  });

  // Lines from previous row (coming in)
  const incomingLines = edges.map((edge, ei) => {
    const x1 = edge.fromCol * GRAPH_COL_W + GRAPH_COL_W / 2;
    const x2 = edge.toCol * GRAPH_COL_W + GRAPH_COL_W / 2;
    const color = branchColor(edge.fromCol);
    if (edge.style === "straight") {
      return (
        <line
          key={`in-${ei}`}
          x1={x1}
          y1={0}
          x2={x1}
          y2={cy}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      );
    }
    const midY = GRAPH_ROW_H * 0.25;
    return (
      <path
        key={`in-${ei}`}
        d={`M ${x2} 0 Q ${x2} ${midY} ${x1} ${cy}`}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
    );
  });

  return (
    <svg width={w} height={GRAPH_ROW_H} style={{ flexShrink: 0, overflow: "visible" }} aria-hidden>
      {incomingLines}
      {lines}
      <circle cx={cx} cy={cy} r={DOT_R} fill={branchColor(col)} />
    </svg>
  );
});

// ── ref chip ─────────────────────────────────────────────────────────────────

function RefChip({ label }: { label: string }) {
  const isHead = label === "HEAD" || label.startsWith("HEAD -> ");
  const isRemote = !label.startsWith("tag: ") && !isHead && label.includes("/");
  const isTag = label.startsWith("tag: ");
  const isBranch = !isTag && !isHead && !isRemote;
  const text = label.replace(/^HEAD -> /, "").replace(/^tag: /, "");
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[10px] font-medium leading-none",
        isHead
          ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
          : isTag
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-400/30"
            : isRemote
              ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-400/30"
              : isBranch
                ? "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                : "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}

// ── formatted date ────────────────────────────────────────────────────────────

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

// ── max active columns across all cells ──────────────────────────────────────

function maxActiveCols(cells: readonly GraphCell[]): number {
  return cells.reduce((max, c) => Math.max(max, c.totalCols), 1);
}

// ── commit row ────────────────────────────────────────────────────────────────

const CommitRow = memo(function CommitRow({
  commit,
  cells,
  index,
  colTemplate,
}: {
  commit: GitLogCommit;
  cells: readonly GraphCell[];
  index: number;
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
      {/* Graph column */}
      <div className="flex items-center overflow-visible pl-1">
        <GraphStrip cells={cells} index={index} />
      </div>

      {/* Description column: ref chips BEFORE subject */}
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

      {/* Date column */}
      <div className="pr-2 text-right text-[10px] text-muted-foreground/70">
        {formatDate(commit.authorDate)}
      </div>

      {/* Author column */}
      <div className="truncate pr-2 text-[10px] text-muted-foreground/70">{commit.authorName}</div>

      {/* Commit SHA column */}
      <div className="pr-2 font-mono text-[10px] text-muted-foreground/70">{commit.shortSha}</div>
    </div>
  );
});

// ── main panel ────────────────────────────────────────────────────────────────

export interface GitHistoryPanelProps {
  cwd: string;
}

export function GitHistoryPanel({ cwd }: GitHistoryPanelProps) {
  useWorkspaceFileWatch(cwd);
  const logQuery = useQuery(gitLogQueryOptions(cwd));
  const commits = logQuery.data?.commits ?? [];
  const cells = useMemo(() => buildGraphCells(commits), [commits]);

  // Compute graph column width from the max active lanes
  const graphColWidth = useMemo(() => {
    const cols = maxActiveCols(cells);
    return Math.max(cols * GRAPH_COL_W + GRAPH_COL_W / 2, 40);
  }, [cells]);

  // CSS grid template: Graph | Description | Date | Author | Commit
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
      {/* Sticky header row */}
      <div
        className="sticky top-0 z-10 grid border-b border-border/50 bg-sidebar"
        style={{ gridTemplateColumns: colTemplate, height: 24 }}
      >
        <div className="pl-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center">
          Graph
        </div>
        <div className="pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center">
          Description
        </div>
        <div className="pr-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center justify-end">
          Date
        </div>
        <div className="pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center">
          Author
        </div>
        <div className="pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center">
          Commit
        </div>
      </div>

      {/* Commit rows */}
      {commits.map((commit, i) => (
        <CommitRow
          key={commit.sha}
          commit={commit}
          cells={cells}
          index={i}
          colTemplate={colTemplate}
        />
      ))}
    </div>
  );
}

export default GitHistoryPanel;
