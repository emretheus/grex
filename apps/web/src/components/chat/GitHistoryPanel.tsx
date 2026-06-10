// FILE: GitHistoryPanel.tsx
// Purpose: Commit history — VS Code Git Graph–style layout.
//          Row height 24px, font 13px, badge height 18px — exact spec match.
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

// ── layout constants — exact VS Code Git Graph values ────────────────────────

const EMPTY_COMMITS: GitLogCommit[] = [];
const ROW_H = 24; // line-height from #commitTable td
const HEADER_H = 30; // th line-height 18 + 2×6 padding
const GRAPH_CFG = {
  ...DEFAULT_GRAPH_CONFIG,
  gridY: ROW_H,
  offsetY: ROW_H / 2,
  gridX: 14,
  offsetX: 8,
  dotRadius: 4,
};

// ── continuous graph SVG ──────────────────────────────────────────────────────

const GraphSvg = memo(function GraphSvg({ layout }: { layout: GraphRenderData }) {
  const { paths, dots, svgWidth, svgHeight } = layout;
  // Shadow path underneath each line for legibility, as VS Code does
  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {/* Shadow paths */}
      {paths.map((p) => (
        <path
          key={`s:${p.d}`}
          d={p.d}
          stroke="var(--color-sidebar,#1e1e1e)"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.75}
        />
      ))}
      {/* Coloured lines */}
      {paths.map((p) => (
        <path
          key={`l:${p.d}`}
          d={p.d}
          stroke={p.colour}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Dots */}
      {dots.map((dot) =>
        dot.isCurrent ? (
          <circle
            key={`${dot.cx},${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r={4}
            fill="var(--color-sidebar,#1e1e1e)"
            stroke={dot.colour}
            strokeWidth={2}
          />
        ) : (
          <circle
            key={`${dot.cx},${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r={4}
            fill={dot.colour}
            stroke="var(--color-sidebar,#1e1e1e)"
            strokeWidth={1}
            strokeOpacity={0.75}
          />
        ),
      )}
    </svg>
  );
});

// ── ref badge — exact VS Code Git Graph style ─────────────────────────────────
// Height 18px, border-radius 5px, font-size 12px, dynamic per-branch colour icon bg

function RefBadge({ label, branchColor }: { label: string; branchColor: string }) {
  const isHead = label === "HEAD" || label.startsWith("HEAD -> ");
  const isRemote = !label.startsWith("tag: ") && !isHead && label.includes("/");
  const isTag = label.startsWith("tag: ");
  const text = label.replace(/^HEAD -> /, "").replace(/^tag: /, "");

  // VS Code uses an SVG icon box with branch colour bg + editor-bg fill
  const iconBg = branchColor;
  // Branch icon path
  const BranchPath =
    "M5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm.75 2.67c-1.03.02-2 .53-2 2.08v1.12c0 .39-.23.65-.52.84C3.69 10.2 3 10.84 3 12a.75.75 0 0 0 1.5 0c0-.23.1-.36.24-.42.14-.06.4-.2.4-.58v-1.12c0-.8.51-1.14 1-1.36V10a.75.75 0 0 0 1.5 0V5.93c.49.22 1 .56 1 1.36v1.12c0 .38.26.52.4.58.14.06.24.19.24.42a.75.75 0 0 0 1.5 0c0-1.16-.69-1.8-1.48-2.25C8.77 6.9 8.5 6.64 8.5 6.25V5.12c-.5.23-1.5.56-2.75.8z";
  // Tag icon path
  const TagPath =
    "M1 7.775V2.75C1 2.37 1.37 2 1.75 2h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25v5.025zM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        lineHeight: "18px",
        fontSize: 12,
        borderRadius: 5,
        border: `1px solid ${isHead ? iconBg : "rgba(128,128,128,0.75)"}`,
        background: "rgba(128,128,128,0.15)",
        marginRight: 5,
        verticalAlign: "middle",
        overflow: "hidden",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {/* Icon box */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          background: iconBg,
          flexShrink: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="var(--color-sidebar,#1e1e1e)">
          <path d={isTag ? TagPath : BranchPath} />
        </svg>
      </span>
      {/* Label text */}
      <span
        style={{
          padding: "0 5px",
          fontWeight: isHead ? 700 : 400,
          color: "var(--foreground, #cccccc)",
          fontStyle: isRemote ? "italic" : "normal",
        }}
      >
        {text}
      </span>
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

// ── file tree ─────────────────────────────────────────────────────────────────

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

const FileTreeNode = memo(function FileTreeNode({
  node,
  depth,
}: {
  node: FileNode;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const fileColor =
    node.status === "A"
      ? "#4ec9b0"
      : node.status === "D"
        ? "#f48771"
        : node.status === "R" || node.status === "C"
          ? "#9cdcfe"
          : "#dcdcaa";

  return (
    <li style={{ listStyle: "none", marginTop: node.isDir ? 4 : 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: depth * 16 + 4,
          lineHeight: "20px",
          cursor: node.isDir ? "pointer" : "default",
        }}
        className="hover:bg-white/5 rounded"
        onClick={node.isDir ? () => setOpen((o) => !o) : undefined}
      >
        {node.isDir ? (
          <>
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="currentColor"
              style={{
                color: "#cccccc",
                flexShrink: 0,
                transform: open ? "rotate(90deg)" : "none",
                transition: "transform 0.1s",
              }}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="#e8ab53"
              style={{ flexShrink: 0 }}
            >
              <path d="M1.75 4.5a.25.25 0 0 1 .25-.25h3.5l1.75 1.75H14a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25H2a.25.25 0 0 1-.25-.25V4.5z" />
            </svg>
            <span style={{ fontSize: 13, color: "#cccccc" }}>{node.name}</span>
          </>
        ) : (
          <>
            <span style={{ width: 8, flexShrink: 0 }} />
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="#cccccc"
              style={{ opacity: 0.6, flexShrink: 0 }}
            >
              <path d="M2 1.75A.75.75 0 0 1 2.75 1h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A.75.75 0 0 1 13.25 16H2.75A.75.75 0 0 1 2 15.25Zm1.5.75v13h9V6H9.25A.75.75 0 0 1 8.5 5.25V2.5H3.5zm6.5.44V5h2.06Z" />
            </svg>
            <span
              style={{
                fontSize: 13,
                color: fileColor,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.name}
            </span>
            {(node.additions > 0 || node.deletions > 0) && (
              <span style={{ fontSize: 12, flexShrink: 0, paddingRight: 6 }}>
                {node.additions > 0 && <span style={{ color: "#4ec9b0" }}>+{node.additions}</span>}
                {node.additions > 0 && node.deletions > 0 && (
                  <span style={{ color: "rgba(128,128,128,0.6)" }}> | </span>
                )}
                {node.deletions > 0 && <span style={{ color: "#f48771" }}>-{node.deletions}</span>}
              </span>
            )}
          </>
        )}
      </div>
      {node.isDir && open && (
        <ul style={{ padding: 0, margin: 0 }}>
          {node.children.map((child) => (
            <FileTreeNode key={child.fullPath} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
});

// ── commit detail view (CDV) — VS Code Git Graph inline style ─────────────────

const CommitDetailView = memo(function CommitDetailView({
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
  const d = q.data;

  return (
    <div
      style={{
        background: "rgba(128,128,128,0.1)",
        borderTop: "1px solid rgba(128,128,128,0.2)",
        borderBottom: "1px solid rgba(128,128,128,0.2)",
        fontSize: 13,
        lineHeight: "18px",
        position: "relative",
        minHeight: 120,
      }}
    >
      {/* Controls — top-right, like VS Code */}
      <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 2, zIndex: 10 }}>
        <button
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 3,
            color: "rgba(204,204,204,0.6)",
          }}
          className="hover:bg-white/10"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
          </svg>
        </button>
      </div>

      {q.isPending && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 120,
            color: "rgba(128,128,128,0.8)",
            fontSize: 13,
          }}
        >
          Loading…
        </div>
      )}
      {q.error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 120,
            color: "#f48771",
            fontSize: 13,
          }}
        >
          {q.error instanceof Error ? q.error.message : "Failed to load commit details."}
        </div>
      )}
      {d && (
        <div style={{ display: "flex", minHeight: 120 }}>
          {/* Left: summary — accent border matches branch colour */}
          <div
            style={{
              flex: "0 0 50%",
              padding: 10,
              borderLeft: `3px solid ${accentColor}`,
              borderRight: "1px solid rgba(128,128,128,0.2)",
              overflowY: "auto",
              maxHeight: 320,
              userSelect: "text",
            }}
          >
            <CdvRow
              label="Commit"
              value={
                <span
                  style={{
                    fontFamily: "monospace",
                    color: "var(--vscode-textLink-foreground, #4fc3f7)",
                  }}
                >
                  {d.sha}
                </span>
              }
            />
            {d.parentShas.length > 0 && (
              <CdvRow
                label={d.parentShas.length === 1 ? "Parent" : "Parents"}
                value={
                  <>
                    {d.parentShas.map((p) => (
                      <span
                        key={p}
                        style={{
                          fontFamily: "monospace",
                          color: "var(--vscode-textLink-foreground, #4fc3f7)",
                          marginRight: 8,
                        }}
                      >
                        {p.slice(0, 12)}
                      </span>
                    ))}
                  </>
                }
              />
            )}
            <CdvRow
              label="Author"
              value={
                <span>
                  {d.authorName}
                  {d.authorEmail ? (
                    <span style={{ color: "rgba(128,128,128,0.8)" }}> &lt;{d.authorEmail}&gt;</span>
                  ) : null}
                </span>
              }
            />
            {d.committerName && d.committerName !== d.authorName && (
              <CdvRow
                label="Committer"
                value={
                  <span>
                    {d.committerName}
                    {d.committerEmail ? (
                      <span style={{ color: "rgba(128,128,128,0.8)" }}>
                        {" "}
                        &lt;{d.committerEmail}&gt;
                      </span>
                    ) : null}
                  </span>
                }
              />
            )}
            <CdvRow label="Date" value={fmtDate(d.authorDate)} />
            {d.body && (
              <div
                style={{
                  marginTop: 8,
                  color: "var(--foreground, #cccccc)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {d.body}
              </div>
            )}
            {!d.body && (
              <div style={{ marginTop: 8, color: "rgba(204,204,204,0.6)", fontStyle: "italic" }}>
                {d.subject}
              </div>
            )}
          </div>

          {/* Right: file tree */}
          <div
            style={{ flex: "0 0 50%", padding: "4px 0 8px 0", overflowY: "auto", maxHeight: 320 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 8px 6px 8px",
                fontSize: 11,
                color: "rgba(128,128,128,0.7)",
              }}
            >
              <span>
                {d.files.length} file{d.files.length !== 1 ? "s" : ""} changed
              </span>
              <span>
                <span style={{ color: "#4ec9b0" }}>+{d.totalAdditions}</span>
                <span style={{ color: "rgba(128,128,128,0.5)", margin: "0 3px" }}>/</span>
                <span style={{ color: "#f48771" }}>-{d.totalDeletions}</span>
              </span>
            </div>
            <ul style={{ padding: "0 0 0 4px", margin: 0 }}>
              {buildFileTree(d.files).map((node) => (
                <FileTreeNode key={node.fullPath} node={node} depth={0} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
});

function CdvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
      <b style={{ color: "var(--foreground, #cccccc)", minWidth: 60 }}>{label}:</b>
      <span style={{ color: "var(--foreground, #cccccc)", flex: 1, wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

// ── commit row ────────────────────────────────────────────────────────────────

const CommitRow = memo(function CommitRow({
  commit,
  isExpanded,
  graphColWidth,
  colTemplate,
  dotColor,
  onToggle,
}: {
  commit: GitLogCommit;
  isExpanded: boolean;
  graphColWidth: number;
  colTemplate: string;
  dotColor: string;
  onToggle: () => void;
}) {
  const headRef = commit.refs.find((r) => r === "HEAD" || r.startsWith("HEAD -> "));
  const otherRefs = commit.refs.filter((r) => r !== "HEAD" && !r.startsWith("HEAD -> "));
  const allRefs = headRef ? [headRef, ...otherRefs] : otherRefs;

  return (
    <div
      onClick={onToggle}
      style={{
        display: "grid",
        gridTemplateColumns: colTemplate,
        height: ROW_H,
        alignItems: "center",
        cursor: "pointer",
        userSelect: "none",
        background: isExpanded ? "rgba(128,128,128,0.25)" : undefined,
        fontSize: 13,
        lineHeight: `${ROW_H}px`,
      }}
      className={cn(!isExpanded && "hover:bg-white/10")}
    >
      {/* Graph placeholder */}
      <div style={{ width: graphColWidth }} />

      {/* Description */}
      <div style={{ display: "flex", alignItems: "center", overflow: "hidden", paddingRight: 4 }}>
        {allRefs.map((ref) => (
          <RefBadge key={ref} label={ref} branchColor={dotColor} />
        ))}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--foreground, #cccccc)",
          }}
        >
          {commit.subject || (
            <span style={{ color: "rgba(128,128,128,0.6)", fontStyle: "italic" }}>no message</span>
          )}
        </span>
      </div>

      {/* Date */}
      <div
        style={{
          textAlign: "right",
          padding: "0 4px",
          color: "rgba(204,204,204,0.8)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {shortDate(commit.authorDate)}
      </div>

      {/* Author */}
      <div
        style={{
          padding: "0 4px",
          color: "rgba(204,204,204,0.8)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {commit.authorName}
      </div>

      {/* SHA */}
      <div style={{ padding: "0 4px", fontFamily: "monospace", color: "rgba(204,204,204,0.6)" }}>
        {commit.shortSha}
      </div>
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
  const rawCommits = logQuery.data?.commits;
  const commits = rawCommits ?? EMPTY_COMMITS;
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

  const graphColWidth = Math.max(layout.svgWidth + GRAPH_CFG.offsetX, 28);
  const colTemplate = `${graphColWidth}px 1fr 124px 124px 72px`;

  const dotColorForSha = useMemo(() => {
    const map = new Map<string, string>();
    commits.forEach((c, i) => {
      map.set(c.sha, layout.dots[i]?.colour ?? "#0158FD");
    });
    return map;
  }, [commits, layout.dots]);

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
    <div
      className="h-full min-h-0 w-full overflow-auto"
      style={{
        fontSize: 13,
        lineHeight: `${ROW_H}px`,
        background: "var(--color-sidebar, #1e1e1e)",
        color: "var(--foreground, #cccccc)",
      }}
    >
      {/* Sticky header — VS Code style: bold, small caps */}
      <div
        className="sticky top-0 z-10 border-b"
        style={{
          display: "grid",
          gridTemplateColumns: colTemplate,
          height: HEADER_H,
          alignItems: "center",
          background: "var(--color-sidebar, #1e1e1e)",
          borderColor: "rgba(128,128,128,0.35)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(128,128,128,0.8)",
        }}
      >
        <div style={{ padding: "6px 4px 6px 8px" }}>Graph</div>
        <div style={{ padding: "6px 4px" }}>Description</div>
        <div style={{ padding: "6px 12px 6px 4px", textAlign: "right" }}>Date</div>
        <div style={{ padding: "6px 4px" }}>Author</div>
        <div style={{ padding: "6px 4px" }}>Commit</div>
      </div>

      {/* Rows + graph overlay */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: graphColWidth,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <GraphSvg layout={layout} />
        </div>

        {commits.map((commit) => {
          const isExpanded = commit.sha === expandedSha;
          const dotColor = dotColorForSha.get(commit.sha) ?? "#0158FD";
          return (
            <div key={commit.sha}>
              <CommitRow
                commit={commit}
                isExpanded={isExpanded}
                graphColWidth={graphColWidth}
                colTemplate={colTemplate}
                dotColor={dotColor}
                onToggle={() => setExpandedSha((p) => (p === commit.sha ? null : commit.sha))}
              />
              {isExpanded && (
                <CommitDetailView
                  cwd={cwd}
                  sha={commit.sha}
                  accentColor={dotColor}
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
