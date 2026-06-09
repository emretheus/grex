/**
 * Git graph layout engine — ported from VS Code Git Graph (MIT).
 * https://github.com/mhutchie/vscode-git-graph/blob/master/web/graph.ts
 *
 * Produces a list of SVG path strings + dot positions from a flat commit list.
 * No React or DOM dependency — pure data transformation.
 */

// ── config ────────────────────────────────────────────────────────────────────

export interface GraphConfig {
  readonly gridX: number; // px per column
  readonly gridY: number; // px per row
  readonly offsetX: number; // left padding
  readonly offsetY: number; // centre of first row
  readonly dotRadius: number;
  readonly strokeWidth: number;
  readonly colours: readonly string[];
  readonly style: "rounded" | "angular";
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  gridX: 16,
  gridY: 28,
  offsetX: 10,
  offsetY: 14, // gridY / 2 → centre of first row
  dotRadius: 4,
  strokeWidth: 1.5,
  style: "rounded",
  colours: [
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
    "#ef4444", // red
    "#64748b", // slate
  ],
};

// ── internal types ────────────────────────────────────────────────────────────

/** Logic-space coordinate (column × row indices, not pixels). */
interface Point {
  x: number; // column index
  y: number; // row (commit) index
}

/** A logical line segment between two points on potentially different columns. */
interface Line {
  p1: Point;
  p2: Point;
  /** true → horizontal transition anchored at p1 side; false → anchored at p2 side */
  lockedFirst: boolean;
}

interface UnavailablePoint {
  x: number;
  connectsTo: Vertex | null;
  onBranch: Branch;
}

// ── Vertex ────────────────────────────────────────────────────────────────────

class Vertex {
  readonly id: number; // row index
  x = -1; // column (assigned by determinePath)
  nextX = 0; // next free column on this vertex
  readonly parents: Vertex[] = [];
  readonly children: Vertex[] = [];
  onBranch: Branch | null = null;
  readonly connections: UnavailablePoint[] = [];
  isExpanded = false;

  constructor(id: number) {
    this.id = id;
  }

  getPoint(): Point {
    return { x: this.x, y: this.id };
  }

  /** Returns the next available column slot on this vertex, marking it used. */
  getNextPoint(onBranch: Branch): Point {
    while (this.connections.some((c) => c.x === this.nextX)) {
      this.nextX++;
    }
    const pt: Point = { x: this.nextX, y: this.id };
    this.connections.push({ x: this.nextX, connectsTo: null, onBranch });
    this.nextX++;
    return pt;
  }

  isConnectedTo(other: Vertex): boolean {
    return this.connections.some((c) => c.connectsTo === other);
  }

  connectTo(other: Vertex, onBranch: Branch): void {
    this.connections.push({ x: other.x, connectsTo: other, onBranch });
  }
}

// ── Branch ────────────────────────────────────────────────────────────────────

class Branch {
  readonly colourIdx: number;
  readonly lines: Line[] = [];
  end = 0; // last vertex row index on this branch

  constructor(colourIdx: number) {
    this.colourIdx = colourIdx;
  }

  addLine(p1: Point, p2: Point, lockedFirst: boolean): void {
    this.lines.push({ p1, p2, lockedFirst });
  }
}

// ── layout algorithm (determinePath) ─────────────────────────────────────────

class GraphLayoutEngine {
  private readonly vertices: Vertex[];
  private readonly branches: Branch[] = [];
  /** availableColours[i] = last row index when colour i was freed (0 = never used). */
  private readonly availableColours: number[] = [];

  constructor(shas: string[], parentShasMap: Map<string, string[]>) {
    const shaToIdx = new Map<string, number>();
    shas.forEach((sha, i) => shaToIdx.set(sha, i));

    this.vertices = shas.map((_, i) => new Vertex(i));

    // Wire parent–child relationships (only within the visible window).
    for (let i = 0; i < shas.length; i++) {
      const sha = shas[i]!;
      const parentShas = parentShasMap.get(sha) ?? [];
      for (const pSha of parentShas) {
        const pIdx = shaToIdx.get(pSha);
        if (pIdx !== undefined) {
          const child = this.vertices[i]!;
          const parent = this.vertices[pIdx]!;
          child.parents.push(parent);
          parent.children.push(child);
        }
      }
    }
  }

  private getAvailableColour(startAt: number): number {
    for (let i = 0; i < this.availableColours.length; i++) {
      if (startAt > (this.availableColours[i] ?? 0)) {
        this.availableColours[i] = 0; // mark as in use
        return i;
      }
    }
    this.availableColours.push(0);
    return this.availableColours.length - 1;
  }

  private freeColour(colourIdx: number, atRow: number): void {
    this.availableColours[colourIdx] = atRow;
  }

  /**
   * Recursive layout pass.  Mirrors VS Code Git Graph's `determinePath`.
   * Assigns column positions (vertex.x) and creates Branch/Line objects.
   */
  private determinePath(startAt: number): void {
    const vertex = this.vertices[startAt];
    if (!vertex || vertex.onBranch !== null) return;

    // Create a new branch for this starting vertex.
    const colourIdx = this.getAvailableColour(startAt);
    const branch = new Branch(colourIdx);
    this.branches.push(branch);

    let current: Vertex = vertex;
    current.onBranch = branch;

    // Assign a column to this vertex if it doesn't have one yet.
    if (current.x === -1) {
      const pt = current.getNextPoint(branch);
      current.x = pt.x;
    }

    // Walk down the primary parent chain.
    while (true) {
      branch.end = current.id;

      if (current.parents.length === 0) break;

      const primaryParent = current.parents[0]!;

      // Handle extra parents (merge commits) — they branch off to new columns.
      for (let p = 1; p < current.parents.length; p++) {
        const extraParent = current.parents[p]!;
        if (extraParent.onBranch !== null) {
          // Already on a branch — draw a converging line.
          if (!current.isConnectedTo(extraParent)) {
            const p1 = current.getPoint();
            const p2 = extraParent.getPoint();
            branch.addLine(p1, p2, true);
            current.connectTo(extraParent, branch);
          }
        } else {
          // New branch for this extra parent.
          extraParent.onBranch = branch; // temporarily reuse colour? No — own branch.
          extraParent.onBranch = null; // reset; determinePath will assign
          // Instead: open a new column for extraParent on *this* vertex.
          const branchPt = current.getNextPoint(branch);
          extraParent.x = branchPt.x;
          // Draw branching line from current down-right to extraParent's column.
          const halfwayY = current.id + 0.5;
          branch.addLine(current.getPoint(), { x: branchPt.x, y: halfwayY }, true);
          // Now kick off a new branch for this extra parent.
          const newColIdx = this.getAvailableColour(current.id);
          const newBranch = new Branch(newColIdx);
          this.branches.push(newBranch);
          extraParent.onBranch = newBranch;
          newBranch.addLine(
            { x: branchPt.x, y: halfwayY },
            { x: branchPt.x, y: primaryParent.id },
            false,
          );
          newBranch.end = extraParent.id;
          // Continue determinePath from extraParent later (it now has onBranch set).
        }
      }

      if (primaryParent.onBranch !== null) {
        // Primary parent already claimed — draw converging line and stop.
        const p1 = current.getPoint();
        const p2 = primaryParent.getPoint();
        branch.addLine(p1, p2, true);
        break;
      }

      // Primary parent is unclaimed — continue this branch down to it.
      const p1 = current.getPoint();

      if (primaryParent.x === -1) {
        // Assign same column as current (straight line).
        primaryParent.x = current.x;
      }
      primaryParent.onBranch = branch;

      const p2 = primaryParent.getPoint();
      branch.addLine(p1, p2, p1.x === p2.x);

      current = primaryParent;
    }

    this.freeColour(colourIdx, branch.end);
  }

  run(): Branch[] {
    for (let i = 0; i < this.vertices.length; i++) {
      if (this.vertices[i]!.onBranch === null) {
        this.determinePath(i);
      }
    }
    return this.branches;
  }

  getVertices(): Vertex[] {
    return this.vertices;
  }
}

// (GraphLayoutEngine ends here)

// ── SVG path generation ───────────────────────────────────────────────────────

function px(logical: number, gridPx: number, offsetPx: number): number {
  return logical * gridPx + offsetPx;
}

/** Generate a single SVG path `d` attribute string for one branch's lines. */
function branchToPathD(branch: Branch, cfg: GraphConfig): string {
  const { gridX, gridY, offsetX, offsetY, style } = cfg;
  // Control-point offset: 80% of row height for rounded, 38% for angular.
  const d = gridY * (style === "rounded" ? 0.8 : 0.38);

  let pathD = "";
  let lastX: number | null = null;
  let lastY: number | null = null;

  // Sort lines top-to-bottom so we can optimise consecutive vertical segments.
  const lines = [...branch.lines].sort((a, b) => a.p1.y - b.p1.y || a.p2.y - b.p2.y);

  // Merge consecutive vertical segments into single line commands.
  const merged: Line[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.p1.x === prev.p2.x &&
      line.p1.x === line.p2.x &&
      prev.p1.x === line.p1.x &&
      Math.abs(prev.p2.y - line.p1.y) < 0.01
    ) {
      prev.p2 = line.p2;
    } else {
      merged.push({ ...line, p1: { ...line.p1 }, p2: { ...line.p2 } });
    }
  }

  for (const line of merged) {
    const x1 = px(line.p1.x, gridX, offsetX);
    const y1 = px(line.p1.y, gridY, offsetY);
    const x2 = px(line.p2.x, gridX, offsetX);
    const y2 = px(line.p2.y, gridY, offsetY);

    const needsMove = lastX === null || Math.abs(lastX - x1) > 0.5 || Math.abs(lastY! - y1) > 0.5;
    if (needsMove) {
      pathD += `M${x1.toFixed(1)},${y1.toFixed(1)}`;
    }

    if (Math.abs(x1 - x2) < 0.5) {
      // Vertical segment.
      pathD += `L${x2.toFixed(1)},${y2.toFixed(1)}`;
    } else if (style === "angular") {
      if (line.lockedFirst) {
        pathD += `L${x1.toFixed(1)},${(y2 - d).toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
      } else {
        pathD += `L${x2.toFixed(1)},${(y1 + d).toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
      }
    } else {
      // Rounded: cubic bezier S-curve.
      pathD +=
        `C${x1.toFixed(1)},${(y1 + d).toFixed(1)}` +
        ` ${x2.toFixed(1)},${(y2 - d).toFixed(1)}` +
        ` ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }

    lastX = x2;
    lastY = y2;
  }

  return pathD;
}

// ── public output types ───────────────────────────────────────────────────────

export interface GraphBranchPath {
  colour: string;
  d: string; // SVG path data
}

export interface GraphDot {
  cx: number;
  cy: number;
  colour: string;
  isCurrent: boolean; // HEAD — rendered as ring
  isMerge: boolean; // merge commit — slightly larger
}

export interface GraphRenderData {
  paths: GraphBranchPath[];
  dots: GraphDot[];
  svgWidth: number;
  svgHeight: number;
}

// ── public entry point ────────────────────────────────────────────────────────

export interface CommitForGraph {
  sha: string;
  parentShas: readonly string[];
  /** True when this commit is the current HEAD. */
  isCurrent?: boolean;
}

export function buildGraphLayout(
  commits: readonly CommitForGraph[],
  cfg: GraphConfig = DEFAULT_GRAPH_CONFIG,
): GraphRenderData {
  if (commits.length === 0) {
    return { paths: [], dots: [], svgWidth: cfg.gridX, svgHeight: cfg.gridY };
  }

  const shas = commits.map((c) => c.sha);
  const parentShasMap = new Map(commits.map((c) => [c.sha, [...c.parentShas]]));

  const engine = new GraphLayoutEngine(shas, parentShasMap);
  const branches = engine.run();
  const vertices = engine.getVertices();

  // Build SVG paths per branch.
  const paths: GraphBranchPath[] = [];
  for (const branch of branches) {
    const d = branchToPathD(branch, cfg);
    if (d) {
      paths.push({
        colour: cfg.colours[branch.colourIdx % cfg.colours.length]!,
        d,
      });
    }
  }

  // Build dot positions per vertex.
  const dots: GraphDot[] = [];
  let maxX = 0;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    const col = Math.max(v.x, 0);
    maxX = Math.max(maxX, col);
    const cx = px(col, cfg.gridX, cfg.offsetX);
    const cy = px(i, cfg.gridY, cfg.offsetY);
    const colour = v.onBranch
      ? cfg.colours[v.onBranch.colourIdx % cfg.colours.length]!
      : cfg.colours[0]!;
    dots.push({
      cx,
      cy,
      colour,
      isCurrent: commits[i]?.isCurrent ?? false,
      isMerge: (commits[i]?.parentShas.length ?? 0) > 1,
    });
  }

  const svgWidth = px(maxX, cfg.gridX, cfg.offsetX) + cfg.offsetX;
  const svgHeight = commits.length * cfg.gridY;

  return { paths, dots, svgWidth, svgHeight };
}
