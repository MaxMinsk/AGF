// GDP-2026-06-04-003/004 — shared curved-outline tile builder for all
// floor-overlay biomes (grass / path / stone / dirt).
//
// One pipeline (6 canonical Wang shapes A–F × 3 sub-variants = 18 meshes,
// per-cell Y rotation applied on the entity Transform). Per-biome character
// is supplied via a BiomeTileConfig: outline Bezier shapes, convex-corner
// push, top height, palette, and an interior-detail callback.
//
// Quality contract (tile-edge-library-design.md §4.4):
//   C-1 SEAM-PIN  — flush-edge + corner verts pinned to the exact cell
//                   boundary at nominal Y; interior displacement uses a
//                   smoothstep(0,0.25,distToBoundary) falloff so adjacent
//                   cells join crack-free.
//   C-3 SHADING   — top + side faces use separate verts (merge without weld)
//                   → crisp rim.
//   C-4 CONVEX-CORNER — corners between two open edges pushed out along the
//                   diagonal (per-sub amount) so islands round, not pinch.

import { BufferAttribute, BufferGeometry, Color, Vector2 } from "three";

export type TileShape = "A" | "B" | "C" | "D" | "E" | "F";
export type TileSubvariantIndex = 0 | 1 | 2;

export type BezierCfg =
  | { kind: "single"; outward: number; lateral: number }
  | { kind: "double"; a: [number, number]; b: [number, number]; valley: number };

export interface BiomeTileConfig {
  /** Nominal top-face height (cell units). */
  topHeight: number;
  /** Outline Bezier control per sub-variant. */
  bezier: Record<TileSubvariantIndex, BezierCfg>;
  /** C-4 convex-corner push per sub-variant. */
  cornerPush: Record<TileSubvariantIndex, number>;
  primary: string;
  highlight: string;
  shadow: string;
  side: string;
  /** Interior surface detail; caller applies the C-1 boundary falloff. */
  interior: (x: number, z: number, sub: TileSubvariantIndex) => { dy: number; t: number };
}

const HALF = 0.5;
const BEZIER_PTS = 6;
const GRID_N = 6;

// ── Canonical shape flush sets ──────────────────────────────────────────
type EdgeKey = "N" | "E" | "S" | "W";
interface EdgeDef { key: EdgeKey; start: Vector2; end: Vector2; out: Vector2; }

const NW = new Vector2(-HALF, -HALF);
const NE = new Vector2( HALF, -HALF);
const SE = new Vector2( HALF,  HALF);
const SW = new Vector2(-HALF,  HALF);

const EDGES: EdgeDef[] = [
  { key: "N", start: NW, end: NE, out: new Vector2(0, -1) },
  { key: "E", start: NE, end: SE, out: new Vector2(1,  0) },
  { key: "S", start: SE, end: SW, out: new Vector2(0,  1) },
  { key: "W", start: SW, end: NW, out: new Vector2(-1, 0) }
];

const SHAPE_FLUSH: Record<TileShape, Record<EdgeKey, boolean>> = {
  A: { N: false, E: false, S: false, W: false },
  B: { N: true,  E: false, S: false, W: false },
  C: { N: true,  E: true,  S: false, W: false },
  D: { N: true,  E: false, S: true,  W: false },
  E: { N: true,  E: true,  S: true,  W: false },
  F: { N: true,  E: true,  S: true,  W: true  }
};

// ── Bitmask → (shape, rotationY) — biome-agnostic ────────────────────────
const BITMASK_SHAPE: Record<number, { shape: TileShape; rotationYDeg: number }> = {
  0:  { shape: "A", rotationYDeg: 0   },
  8:  { shape: "B", rotationYDeg: 0   },
  1:  { shape: "B", rotationYDeg: 90  },
  2:  { shape: "B", rotationYDeg: 180 },
  4:  { shape: "B", rotationYDeg: 270 },
  12: { shape: "C", rotationYDeg: 0   },
  9:  { shape: "C", rotationYDeg: 90  },
  3:  { shape: "C", rotationYDeg: 180 },
  6:  { shape: "C", rotationYDeg: 270 },
  10: { shape: "D", rotationYDeg: 0   },
  5:  { shape: "D", rotationYDeg: 90  },
  14: { shape: "E", rotationYDeg: 0   },
  13: { shape: "E", rotationYDeg: 90  },
  11: { shape: "E", rotationYDeg: 180 },
  7:  { shape: "E", rotationYDeg: 270 },
  15: { shape: "F", rotationYDeg: 0   }
};

/** Map a Wang bitmask (0-15) to its canonical shape + Y rotation. */
export function shapeForBitmask(bitmask: number): { shape: TileShape; rotationYDeg: number } {
  return BITMASK_SHAPE[clampMask(bitmask)] ?? { shape: "F", rotationYDeg: 0 };
}

// ── Public builder ────────────────────────────────────────────────────────

export function buildBiomeTile(cfg: BiomeTileConfig, shape: TileShape, sub: TileSubvariantIndex): BufferGeometry {
  const flush = SHAPE_FLUSH[shape];
  const outline = buildOutline(flush, cfg.bezier[sub], cfg.cornerPush[sub]);
  return assemble(outline, shape, sub, cfg);
}

// ── Outline ────────────────────────────────────────────────────────────────

function buildOutline(flush: Record<EdgeKey, boolean>, cfg: BezierCfg, cornerPush: number): Vector2[] {
  const pushedCorner = (a: Vector2, eA: EdgeKey, eB: EdgeKey): Vector2 => {
    if (flush[eA] || flush[eB]) return a.clone();
    const diag = new Vector2(Math.sign(a.x), Math.sign(a.y)).normalize();
    return new Vector2(a.x + diag.x * cornerPush, a.y + diag.y * cornerPush);
  };
  const byCorner = new Map<Vector2, Vector2>([
    [NW, pushedCorner(NW, "W", "N")],
    [NE, pushedCorner(NE, "N", "E")],
    [SE, pushedCorner(SE, "E", "S")],
    [SW, pushedCorner(SW, "S", "W")]
  ]);

  const pts: Vector2[] = [];
  for (const e of EDGES) {
    const start = byCorner.get(e.start)!;
    const end   = byCorner.get(e.end)!;
    if (flush[e.key]) pts.push(start.clone());
    else appendBezier(pts, start, end, e.out, cfg, true);
  }
  return pts;
}

function appendBezier(out: Vector2[], p0: Vector2, p2: Vector2, outward: Vector2, cfg: BezierCfg, skipLast: boolean): void {
  const along = new Vector2(p2.x - p0.x, p2.y - p0.y).normalize();
  if (cfg.kind === "single") {
    const ctrl = midOffset(p0, p2, outward, cfg.outward, along, cfg.lateral);
    sampleQuad(out, p0, ctrl, p2, BEZIER_PTS, skipLast);
  } else {
    const mid = new Vector2(
      (p0.x + p2.x) / 2 - outward.x * cfg.valley,
      (p0.y + p2.y) / 2 - outward.y * cfg.valley
    );
    const c1 = midOffset(p0, mid, outward, cfg.a[0], along, cfg.a[1]);
    const c2 = midOffset(mid, p2, outward, cfg.b[0], along, cfg.b[1]);
    sampleQuad(out, p0, c1, mid, BEZIER_PTS, true);
    sampleQuad(out, mid, c2, p2, BEZIER_PTS, skipLast);
  }
}

function midOffset(a: Vector2, b: Vector2, outward: Vector2, outAmt: number, along: Vector2, latAmt: number): Vector2 {
  return new Vector2(
    (a.x + b.x) / 2 + outward.x * outAmt + along.x * latAmt,
    (a.y + b.y) / 2 + outward.y * outAmt + along.y * latAmt
  );
}

function sampleQuad(out: Vector2[], p0: Vector2, p1: Vector2, p2: Vector2, n: number, skipLast: boolean): void {
  const count = skipLast ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const t = i / n, mt = 1 - t;
    out.push(new Vector2(
      mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    ));
  }
}

// ── Shared math ────────────────────────────────────────────────────────────

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function gauss(dx: number, dz: number, radius: number): number {
  return Math.exp(-(dx * dx + dz * dz) / (radius * radius));
}

function distToBoundary(x: number, z: number): number {
  return Math.max(0, Math.min(0.5 - Math.abs(x), 0.5 - Math.abs(z)));
}

// ── Assembly ────────────────────────────────────────────────────────────────

interface TopVert { x: number; y: number; z: number; c: Color; }

function assemble(outline: Vector2[], shape: TileShape, sub: TileSubvariantIndex, cfg: BiomeTileConfig): BufferGeometry {
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const p of outline) { cx += p.x; cz += p.y; }
  cx /= n; cz /= n;

  const C = {
    primary: new Color(cfg.primary),
    highlight: new Color(cfg.highlight),
    side: new Color(cfg.side)
  };
  const top = cfg.topHeight;

  const sampleTop = (x: number, z: number, pinned: boolean): TopVert => {
    if (pinned) return { x, y: top, z, c: C.primary };
    const { dy, t } = cfg.interior(x, z, sub);
    const w = smoothstep(0, 0.25, distToBoundary(x, z));
    return { x, y: top + dy * w, z, c: C.primary.clone().lerp(C.highlight, t * w) };
  };

  const pos: number[] = [], nor: number[] = [], col: number[] = [];

  if (shape === "F") {
    buildGridTop(pos, nor, col, sampleTop);
  } else {
    buildRingTop(pos, nor, col, outline, cx, cz, sampleTop);
  }

  // Side walls.
  for (let i = 0; i < n; i++) {
    const a = outline[i]!, b = outline[(i + 1) % n]!;
    let nx = (b.y - a.y), nz = -(b.x - a.x);
    const mx = (a.x + b.x) / 2 - cx, mz = (a.y + b.y) / 2 - cz;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const len = Math.hypot(nx, nz) || 1; nx /= len; nz /= len;
    const aT: TopVert = { x: a.x, y: top, z: a.y, c: C.side };
    const bT: TopVert = { x: b.x, y: top, z: b.y, c: C.side };
    const aB: TopVert = { x: a.x, y: 0, z: a.y, c: C.side };
    const bB: TopVert = { x: b.x, y: 0, z: b.y, c: C.side };
    pushSide(pos, nor, col, aT, bT, bB, nx, nz);
    pushSide(pos, nor, col, aT, bB, aB, nx, nz);
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal",   new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute("color",    new BufferAttribute(new Float32Array(col), 3));
  return geo;
}

function buildGridTop(pos: number[], nor: number[], col: number[], sample: (x: number, z: number, pinned: boolean) => TopVert): void {
  const grid: TopVert[][] = [];
  for (let i = 0; i <= GRID_N; i++) {
    grid[i] = [];
    for (let j = 0; j <= GRID_N; j++) {
      const x = -HALF + i / GRID_N;
      const z = -HALF + j / GRID_N;
      const pinned = i === 0 || j === 0 || i === GRID_N || j === GRID_N;
      grid[i]![j] = sample(x, z, pinned);
    }
  }
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const a = grid[i]![j]!, b = grid[i + 1]![j]!, c = grid[i + 1]![j + 1]!, d = grid[i]![j + 1]!;
      pushTop(pos, nor, col, a, b, c);
      pushTop(pos, nor, col, a, c, d);
    }
  }
}

function buildRingTop(pos: number[], nor: number[], col: number[], outline: Vector2[], cx: number, cz: number, sample: (x: number, z: number, pinned: boolean) => TopVert): void {
  const n = outline.length;
  const scales = [1.0, 0.62, 0.30];
  const rings = scales.map((s, ri) =>
    outline.map((p) => sample(cx + (p.x - cx) * s, cz + (p.y - cz) * s, ri === 0))
  );
  for (let r = 0; r < rings.length - 1; r++) {
    const outer = rings[r]!, inner = rings[r + 1]!;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      pushTop(pos, nor, col, outer[i]!, outer[i2]!, inner[i2]!);
      pushTop(pos, nor, col, outer[i]!, inner[i2]!, inner[i]!);
    }
  }
  const innerMost = rings[rings.length - 1]!;
  const centre = sample(cx, cz, false);
  for (let i = 0; i < n; i++) pushTop(pos, nor, col, innerMost[i]!, innerMost[(i + 1) % n]!, centre);
}

function pushTop(pos: number[], nor: number[], col: number[], a: TopVert, b: TopVert, c: TopVert): void {
  const crossY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const tri = crossY >= 0 ? [a, b, c] : [a, c, b];
  for (const v of tri) { pos.push(v.x, v.y, v.z); nor.push(0, 1, 0); col.push(v.c.r, v.c.g, v.c.b); }
}

function pushSide(pos: number[], nor: number[], col: number[], a: TopVert, b: TopVert, c: TopVert, nx: number, nz: number): void {
  for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); nor.push(nx, 0, nz); col.push(v.c.r, v.c.g, v.c.b); }
}

function clampMask(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 15) return 15;
  return v | 0;
}
