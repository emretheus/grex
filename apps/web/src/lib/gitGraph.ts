/**
 * Git graph layout engine — faithful port of VS Code Git Graph (MIT).
 * https://github.com/mhutchie/vscode-git-graph/blob/develop/web/graph.ts
 *
 * Algorithm is a direct translation of Graph.determinePath() from the original.
 * No React or DOM dependency — pure data transformation.
 */

// ── config ────────────────────────────────────────────────────────────────────

export interface GraphConfig {
  readonly gridX: number;
  readonly gridY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly dotRadius: number;
  readonly strokeWidth: number;
  readonly colours: readonly string[];
  readonly style: "rounded" | "angular";
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  gridX: 16,
  gridY: 28,
  offsetX: 10,
  offsetY: 14,
  dotRadius: 4,
  strokeWidth: 1.5,
  style: "rounded",
  colours: [
    "#0158FD",
    "#01CCA4",
    "#a78bfa",
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#8b5cf6",
    "#06b6d4",
    "#84cc16",
    "#ef4444",
    "#64748b",
  ],
};

// ── internal types ────────────────────────────────────────────────────────────

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Line {
  readonly p1: Point;
  readonly p2: Point;
  readonly lockedFirst: boolean;
}

interface UnavailablePoint {
  readonly connectsTo: Vertex | null;
  readonly onBranch: Branch;
}

// ── Branch ────────────────────────────────────────────────────────────────────

class Branch {
  readonly colour: number;
  private end = 0;
  readonly lines: Line[] = [];

  constructor(colour: number) {
    this.colour = colour;
  }

  addLine(p1: Point, p2: Point, lockedFirst: boolean): void {
    this.lines.push({ p1, p2, lockedFirst });
  }

  getEnd(): number {
    return this.end;
  }

  setEnd(end: number): void {
    this.end = end;
  }
}

// ── Vertex ────────────────────────────────────────────────────────────────────

const NULL_VERTEX_ID = -1;

class Vertex {
  readonly id: number;
  private _x = 0;
  private nextX = 0;
  private nextParentIdx = 0;
  private onBranch: Branch | null = null;
  private readonly _parents: Vertex[] = [];
  private readonly _children: Vertex[] = [];
  private readonly connections: UnavailablePoint[] = [];

  constructor(id: number) {
    this.id = id;
  }

  addParent(v: Vertex): void {
    this._parents.push(v);
  }
  addChild(v: Vertex): void {
    this._children.push(v);
  }

  getParents(): readonly Vertex[] {
    return this._parents;
  }

  hasParents(): boolean {
    return this._parents.length > 0;
  }

  isMerge(): boolean {
    return this._parents.length > 1;
  }

  getNextParent(): Vertex | null {
    return this.nextParentIdx < this._parents.length
      ? (this._parents[this.nextParentIdx] ?? null)
      : null;
  }

  registerParentProcessed(): void {
    this.nextParentIdx++;
  }

  isNotOnBranch(): boolean {
    return this.onBranch === null;
  }

  isOnThisBranch(b: Branch): boolean {
    return this.onBranch === b;
  }

  getBranch(): Branch | null {
    return this.onBranch;
  }

  addToBranch(b: Branch, x: number): void {
    if (this.onBranch === null) {
      this.onBranch = b;
      this._x = x;
    }
  }

  getPoint(): Point {
    return { x: this._x, y: this.id };
  }

  getNextPoint(): Point {
    return { x: this.nextX, y: this.id };
  }

  // Returns a point on this vertex that connects to the given vertex via the given branch,
  // or null if none exists.
  getPointConnectingTo(target: Vertex | null, onBranch: Branch): Point | null {
    for (let i = 0; i < this.connections.length; i++) {
      const c = this.connections[i]!;
      if (c.connectsTo === target && c.onBranch === onBranch) {
        return { x: i, y: this.id };
      }
    }
    return null;
  }

  registerUnavailablePoint(x: number, connectsTo: Vertex | null, onBranch: Branch): void {
    if (x === this.nextX) {
      this.nextX = x + 1;
      this.connections[x] = { connectsTo, onBranch };
    }
  }

  getColour(): number {
    return this.onBranch !== null ? this.onBranch.colour : 0;
  }
}

// ── layout engine — direct port of Graph.determinePath() ─────────────────────

class GraphLayoutEngine {
  private readonly vertices: Vertex[];
  private readonly branches: Branch[] = [];
  private readonly availableColours: number[] = [];

  constructor(shas: string[], parentShasMap: Map<string, string[]>) {
    const shaToIdx = new Map<string, number>();
    shas.forEach((sha, i) => shaToIdx.set(sha, i));

    this.vertices = shas.map((_, i) => new Vertex(i));

    // Null sentinel for parents outside the visible window.
    const nullVertex = new Vertex(NULL_VERTEX_ID);

    for (let i = 0; i < shas.length; i++) {
      const sha = shas[i]!;
      const parentShas = parentShasMap.get(sha) ?? [];
      for (const pSha of parentShas) {
        const pIdx = shaToIdx.get(pSha);
        if (pIdx !== undefined) {
          this.vertices[i]!.addParent(this.vertices[pIdx]!);
          this.vertices[pIdx]!.addChild(this.vertices[i]!);
        } else {
          // Parent is outside the visible window — use null sentinel.
          this.vertices[i]!.addParent(nullVertex);
        }
      }
    }
  }

  private getAvailableColour(startAt: number): number {
    for (let i = 0; i < this.availableColours.length; i++) {
      if (startAt > (this.availableColours[i] ?? 0)) {
        return i;
      }
    }
    this.availableColours.push(0);
    return this.availableColours.length - 1;
  }

  // Direct port of Graph.determinePath() from vscode-git-graph/web/graph.ts
  private determinePath(startAt: number): void {
    let i = startAt;
    const startVertex = this.vertices[i]!;
    let vertex = startVertex;
    let parentVertex = vertex.getNextParent();

    let lastPoint: Point = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();

    // Case 1: merge between two vertices already on branches → draw connecting line only
    if (
      parentVertex !== null &&
      parentVertex.id !== NULL_VERTEX_ID &&
      vertex.isMerge() &&
      !vertex.isNotOnBranch() &&
      !parentVertex.isNotOnBranch()
    ) {
      let foundPointToParent = false;
      const parentBranch = parentVertex.getBranch()!;
      for (i = startAt + 1; i < this.vertices.length; i++) {
        const curVertex = this.vertices[i]!;
        let curPoint = curVertex.getPointConnectingTo(parentVertex, parentBranch);
        if (curPoint !== null) {
          foundPointToParent = true;
        } else {
          curPoint = curVertex.getNextPoint();
        }
        parentBranch.addLine(
          lastPoint,
          curPoint,
          !foundPointToParent && curVertex !== parentVertex ? lastPoint.x < curPoint.x : true,
        );
        curVertex.registerUnavailablePoint(curPoint.x, parentVertex, parentBranch);
        lastPoint = curPoint;
        if (foundPointToParent) {
          vertex.registerParentProcessed();
          break;
        }
      }
      return;
    }

    // Case 2: normal branch
    const branch = new Branch(this.getAvailableColour(startAt));
    vertex.addToBranch(branch, lastPoint.x);
    vertex.registerUnavailablePoint(lastPoint.x, vertex, branch);

    for (i = startAt + 1; i < this.vertices.length; i++) {
      const curVertex = this.vertices[i]!;

      // If this vertex IS the next parent and it's already on a branch, land on its exact point;
      // otherwise take the next free slot on curVertex.
      const curPoint =
        parentVertex === curVertex && !parentVertex.isNotOnBranch()
          ? curVertex.getPoint()
          : curVertex.getNextPoint();

      branch.addLine(lastPoint, curPoint, lastPoint.x < curPoint.x);
      curVertex.registerUnavailablePoint(curPoint.x, parentVertex, branch);
      lastPoint = curPoint;

      if (parentVertex === curVertex) {
        vertex.registerParentProcessed();
        const parentWasAlreadyOnBranch = !parentVertex.isNotOnBranch();
        parentVertex.addToBranch(branch, curPoint.x);
        vertex = parentVertex;
        parentVertex = vertex.getNextParent();
        if (parentVertex === null || parentWasAlreadyOnBranch) {
          break;
        }
      }
    }

    // Handle the case where vertex is the last in the graph (parent outside window).
    if (i === this.vertices.length && parentVertex !== null && parentVertex.id === NULL_VERTEX_ID) {
      vertex.registerParentProcessed();
    }

    branch.setEnd(i);
    this.branches.push(branch);
    this.availableColours[branch.colour] = i;
  }

  run(): void {
    let i = 0;
    while (i < this.vertices.length) {
      const v = this.vertices[i]!;
      if (v.getNextParent() !== null || v.isNotOnBranch()) {
        this.determinePath(i);
      } else {
        i++;
      }
    }
  }

  getBranches(): readonly Branch[] {
    return this.branches;
  }

  getVertices(): readonly Vertex[] {
    return this.vertices;
  }
}

// ── SVG path generation ───────────────────────────────────────────────────────

function pxOf(logical: number, gridPx: number, offsetPx: number): number {
  return logical * gridPx + offsetPx;
}

function branchToPathD(branch: Branch, cfg: GraphConfig): string {
  const { gridX, gridY, offsetX, offsetY, style } = cfg;
  const d = gridY * (style === "rounded" ? 0.8 : 0.38);

  // Convert to pixel lines, merge consecutive verticals (same as original).
  interface PixLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    lockedFirst: boolean;
  }

  const pixLines: PixLine[] = [];
  for (const line of branch.lines) {
    const x1 = pxOf(line.p1.x, gridX, offsetX);
    const y1 = pxOf(line.p1.y, gridY, offsetY);
    const x2 = pxOf(line.p2.x, gridX, offsetX);
    const y2 = pxOf(line.p2.y, gridY, offsetY);
    const prev = pixLines.at(-1);
    if (
      prev &&
      prev.x1 === prev.x2 &&
      x1 === x2 &&
      prev.x2 === x1 &&
      Math.abs(prev.y2 - y1) < 0.5
    ) {
      prev.y2 = y2;
    } else {
      pixLines.push({ x1, y1, x2, y2, lockedFirst: line.lockedFirst });
    }
  }

  let path = "";
  let prevX: number | null = null;
  let prevY: number | null = null;

  for (const { x1, y1, x2, y2, lockedFirst } of pixLines) {
    const needsMove = prevX === null || Math.abs(prevX - x1) > 0.5 || Math.abs(prevY! - y1) > 0.5;
    if (needsMove) path += `M${x1.toFixed(0)},${y1.toFixed(1)}`;

    if (Math.abs(x1 - x2) < 0.5) {
      path += `L${x2.toFixed(0)},${y2.toFixed(1)}`;
    } else if (style === "angular") {
      if (lockedFirst) {
        path += `L${x2.toFixed(0)},${(y2 - d).toFixed(1)}L${x2.toFixed(0)},${y2.toFixed(1)}`;
      } else {
        path += `L${x1.toFixed(0)},${(y1 + d).toFixed(1)}L${x2.toFixed(0)},${y2.toFixed(1)}`;
      }
    } else {
      path +=
        `C${x1.toFixed(0)},${(y1 + d).toFixed(1)}` +
        ` ${x2.toFixed(0)},${(y2 - d).toFixed(1)}` +
        ` ${x2.toFixed(0)},${y2.toFixed(1)}`;
    }

    prevX = x2;
    prevY = y2;
  }

  return path;
}

// ── public output types ───────────────────────────────────────────────────────

export interface GraphBranchPath {
  colour: string;
  d: string;
}

export interface GraphDot {
  cx: number;
  cy: number;
  colour: string;
  isCurrent: boolean;
  isMerge: boolean;
}

export interface GraphRenderData {
  paths: GraphBranchPath[];
  dots: GraphDot[];
  svgWidth: number;
  svgHeight: number;
}

export interface CommitForGraph {
  sha: string;
  parentShas: readonly string[];
  isCurrent?: boolean;
}

// ── public entry point ────────────────────────────────────────────────────────

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
  engine.run();
  const branches = engine.getBranches();
  const vertices = engine.getVertices();

  // Build SVG paths
  const paths: GraphBranchPath[] = [];
  for (const branch of branches) {
    const d = branchToPathD(branch, cfg);
    if (d) {
      paths.push({
        colour: cfg.colours[branch.colour % cfg.colours.length]!,
        d,
      });
    }
  }

  // Build dots
  const dots: GraphDot[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    const commit = commits[i]!;
    const pt = v.getPoint();
    dots.push({
      cx: pxOf(pt.x, cfg.gridX, cfg.offsetX),
      cy: pxOf(pt.y, cfg.gridY, cfg.offsetY),
      colour: cfg.colours[v.getColour() % cfg.colours.length]!,
      isCurrent: commit.isCurrent === true,
      isMerge: commit.parentShas.length > 1,
    });
  }

  // SVG dimensions: width = max nextX across all vertices
  let maxCol = 0;
  for (const v of vertices) {
    const np = v.getNextPoint();
    if (np.x > maxCol) maxCol = np.x;
  }
  const svgWidth = cfg.offsetX * 2 + Math.max(0, maxCol - 1) * cfg.gridX;
  const svgHeight = commits.length * cfg.gridY;

  return { paths, dots, svgWidth, svgHeight };
}
