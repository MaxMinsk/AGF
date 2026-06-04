// GDP-2026-06-04-003 — grass curved-outline mesh (6 canonical shapes).
//
// Architecture per tile-edge-library-design.md §4.4 + §6:
//   6 canonical shapes A–F × 3 sub-variants = 18 cached meshes.
//   The Wang resolver maps each cell's bitmask → (shape, rotationY) via
//   grassShapeForBitmask(); rotation is applied per-cell on the entity
//   Transform (cache stays at 18 meshes, not 60).
//
// Shape table (canonical orientation — flush edges have a same-family
// neighbour, open edges face base floor and curve outward):
//   A — isolated   : flush none          (all 4 edges curve)
//   B — edge       : flush N             (E,S,W curve)
//   C — corner     : flush N,E           (S,W curve; SW convex corner rounded)
//   D — strip      : flush N,S           (E,W curve)
//   E — T-junction : flush N,E,S         (W curves)
//   F — filler     : flush all           (1×1 square, no curves)
//
// Quality contract (§4.4):
//   C-1 SEAM-PIN  — flush-edge + cell-corner vertices sit EXACTLY on the
//                   cell boundary at nominal Y. No displacement there, so
//                   adjacent cells join crack-free.
//   C-3 SHADING   — top face and side faces use SEPARATE vertices (we merge
//                   without welding) so the top↔side rim stays crisp under
//                   computeVertexNormals-equivalent manual normals.
//   C-4 CONVEX-CORNER — a corner shared by two OPEN edges is pushed out
//                   along its diagonal by CORNER_PUSH so the silhouette
//                   rounds instead of pinching to the grid corner.
//
// The top face is flat at TOP_HEIGHT (uniform up-normal → clean lighting,
// no triangulation facets); the curved silhouette lives in the XZ outline.
// Open edges bulge outward by the per-sub Bezier control offset + overhang.

import { BufferAttribute, BufferGeometry, Color, Vector2 } from "three";

// ── Palette ────────────────────────────────────────────────────────────────
export const GRASS_PRIMARY   = "#4a8a3e";
export const GRASS_SHADOW    = "#3a6a30";
export const GRASS_HIGHLIGHT = "#5fa84a";

export type GrassShape = "A" | "B" | "C" | "D" | "E" | "F";
export type GrassSubvariantIndex = 0 | 1 | 2;
// Legacy alias kept so older imports type-check.
export type GrassVariantIndex = 0 | 1 | 2 | 3;

// ── Geometry constants ───────────────────────────────────────────────────
const TOP_HEIGHT  = 0.20;
const HALF        = 0.5;
const BEZIER_PTS  = 6;     // samples per Bezier segment
const GRID_N      = 6;     // filler interior grid resolution (GDP-006 §A)
const TUFT_LIFT   = 0.04;  // raised-tuft Y for sub 1 (GDP-006 §A)

// GDP-2026-06-04-006 §B — per-sub convex-corner push. Spread WIDE so corner
// cells of different sub-variants are obviously round vs tight vs scalloped.
const CORNER_PUSH_BY_SUB: Record<GrassSubvariantIndex, number> = { 0: 0.24, 1: 0.06, 2: 0.15 };

// Per-sub-variant Bezier control config (outward, lateral) in cell units.
// GDP-006 §B — the 3 outline shapes are CLEARLY different in character:
//   sub 0 — big smooth round bulge
//   sub 1 — small, strongly asymmetric (lopsided) bulge
//   sub 2 — scalloped double-lobe with a deep valley
type BezierCfg =
  | { kind: "single"; outward: number; lateral: number }
  | { kind: "double"; a: [number, number]; b: [number, number]; valley: number };

const GRASS_BEZIER: Record<GrassSubvariantIndex, BezierCfg> = {
  0: { kind: "single", outward: 0.22, lateral: 0.0  },                   // big smooth round
  1: { kind: "single", outward: 0.11, lateral: 0.18 },                  // small, lopsided
  2: { kind: "double", a: [0.20, 0.16], b: [0.20, -0.16], valley: 0.08 } // deep scalloped double-lobe
};

// Edge order N, E, S, W with their cell corners + outward normal.
// Corners (XZ): NW(-0.5,-0.5) NE(0.5,-0.5) SE(0.5,0.5) SW(-0.5,0.5)
const NW = new Vector2(-HALF, -HALF);
const NE = new Vector2( HALF, -HALF);
const SE = new Vector2( HALF,  HALF);
const SW = new Vector2(-HALF,  HALF);

type EdgeKey = "N" | "E" | "S" | "W";
interface EdgeDef { key: EdgeKey; start: Vector2; end: Vector2; out: Vector2; }
const EDGES: EdgeDef[] = [
  { key: "N", start: NW, end: NE, out: new Vector2(0, -1) },
  { key: "E", start: NE, end: SE, out: new Vector2(1,  0) },
  { key: "S", start: SE, end: SW, out: new Vector2(0,  1) },
  { key: "W", start: SW, end: NW, out: new Vector2(-1, 0) }
];

// Flush-edge set per canonical shape.
const SHAPE_FLUSH: Record<GrassShape, Record<EdgeKey, boolean>> = {
  A: { N: false, E: false, S: false, W: false },
  B: { N: true,  E: false, S: false, W: false },
  C: { N: true,  E: true,  S: false, W: false },
  D: { N: true,  E: false, S: true,  W: false },
  E: { N: true,  E: true,  S: true,  W: false },
  F: { N: true,  E: true,  S: true,  W: true  }
};

// ── Bitmask → (shape, rotationY) ─────────────────────────────────────────
// Canonical orientations chosen so +90° Y rotation maps N→W→S→E→N.
const BITMASK_SHAPE: Record<number, { shape: GrassShape; rotationYDeg: number }> = {
  0:  { shape: "A", rotationYDeg: 0   },
  8:  { shape: "B", rotationYDeg: 0   }, // flush N
  1:  { shape: "B", rotationYDeg: 90  }, // flush W
  2:  { shape: "B", rotationYDeg: 180 }, // flush S
  4:  { shape: "B", rotationYDeg: 270 }, // flush E
  12: { shape: "C", rotationYDeg: 0   }, // flush N,E
  9:  { shape: "C", rotationYDeg: 90  }, // flush N,W
  3:  { shape: "C", rotationYDeg: 180 }, // flush S,W
  6:  { shape: "C", rotationYDeg: 270 }, // flush E,S
  10: { shape: "D", rotationYDeg: 0   }, // flush N,S
  5:  { shape: "D", rotationYDeg: 90  }, // flush E,W
  14: { shape: "E", rotationYDeg: 0   }, // flush N,E,S (open W)
  13: { shape: "E", rotationYDeg: 90  }, // flush N,E,W (open S)
  11: { shape: "E", rotationYDeg: 180 }, // flush N,S,W (open E)
  7:  { shape: "E", rotationYDeg: 270 }, // flush E,S,W (open N)
  15: { shape: "F", rotationYDeg: 0   }
};

/** Map a Wang bitmask (0-15) to its canonical shape + Y rotation. */
export function grassShapeForBitmask(bitmask: number): { shape: GrassShape; rotationYDeg: number } {
  const m = clampMask(bitmask);
  return BITMASK_SHAPE[m] ?? { shape: "F", rotationYDeg: 0 };
}

// ── Public builder ────────────────────────────────────────────────────────

/** Build a grass tile geometry for a canonical shape + sub-variant. */
export function buildGrassShape(shape: GrassShape, sub: GrassSubvariantIndex): BufferGeometry {
  const flush = SHAPE_FLUSH[shape];
  const outline = buildOutline(flush, GRASS_BEZIER[sub], CORNER_PUSH_BY_SUB[sub]);
  return assembleGeometry(outline, shape, sub);
}

// ── Legacy compat wrappers ────────────────────────────────────────────────

export function buildGrassMesh(bitmask: number, sub: GrassSubvariantIndex): BufferGeometry {
  return buildGrassShape(grassShapeForBitmask(bitmask).shape, sub);
}

export function buildGrassVariant(index: GrassVariantIndex, _bitmask?: number): BufferGeometry {
  const repShape: Record<number, GrassShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildGrassShape(repShape[index] ?? "F", 0);
}

export function buildGrassSubvariant(role: GrassVariantIndex, sub: GrassSubvariantIndex): BufferGeometry {
  const repShape: Record<number, GrassShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildGrassShape(repShape[role] ?? "F", sub);
}

// ── Outline construction ──────────────────────────────────────────────────

/** Build the closed XZ outline polygon walking N,E,S,W. */
function buildOutline(flush: Record<EdgeKey, boolean>, cfg: BezierCfg, cornerPush: number): Vector2[] {
  // C-4: a corner is convex (pushed out) when BOTH its adjacent edges are open.
  const cornerPushed = (a: Vector2, eA: EdgeKey, eB: EdgeKey): Vector2 => {
    if (flush[eA] || flush[eB]) return a.clone(); // pinned at exact corner (C-1)
    const diag = new Vector2(Math.sign(a.x), Math.sign(a.y)).normalize();
    return new Vector2(a.x + diag.x * cornerPush, a.y + diag.y * cornerPush);
  };

  // Adjacent-edge map for each corner.
  const pNW = cornerPushed(NW, "W", "N");
  const pNE = cornerPushed(NE, "N", "E");
  const pSE = cornerPushed(SE, "E", "S");
  const pSW = cornerPushed(SW, "S", "W");
  const pushedByCorner = new Map<Vector2, Vector2>([
    [NW, pNW], [NE, pNE], [SE, pSE], [SW, pSW]
  ]);

  const pts: Vector2[] = [];
  for (const e of EDGES) {
    const start = pushedByCorner.get(e.start)!;
    const end   = pushedByCorner.get(e.end)!;
    if (flush[e.key]) {
      // Straight flush edge — push start only (end handled by next edge).
      pts.push(start.clone());
    } else {
      // Open edge — Bezier bulge outward, skip the final point (next edge's start).
      appendBezier(pts, start, end, e.out, cfg, /* skipLast */ true);
    }
  }
  return pts;
}

function appendBezier(out: Vector2[], p0: Vector2, p2: Vector2, outward: Vector2, cfg: BezierCfg, skipLast: boolean): void {
  const along = new Vector2(p2.x - p0.x, p2.y - p0.y).normalize();
  if (cfg.kind === "single") {
    const ctrl = midOffset(p0, p2, outward, cfg.outward, along, cfg.lateral);
    sampleQuad(out, p0, ctrl, p2, BEZIER_PTS, skipLast);
  } else {
    // Double-lobe: pull the shared mid point INWARD by `valley` so the two
    // bumps read as distinct lobes with a dip between them (GDP-006 §B).
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

// ── Interior detail (GDP-006) — per-sub-variant top-face pattern ──────────

const C_PRIMARY   = new Color(GRASS_PRIMARY);
const C_HIGHLIGHT = new Color(GRASS_HIGHLIGHT);
const C_SIDE      = new Color(GRASS_SHADOW);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance from (x,z) to the nearest unit-cell boundary (±0.5). 0 at edge. */
function distToBoundary(x: number, z: number): number {
  return Math.max(0, Math.min(0.5 - Math.abs(x), 0.5 - Math.abs(z)));
}

function gauss(dx: number, dz: number, radius: number): number {
  const d2 = (dx * dx + dz * dz) / (radius * radius);
  return Math.exp(-d2);
}

/**
 * Interior surface detail at (x,z) for a sub-variant. Returns a raw Y bump
 * + a highlight blend t∈[0,1]. The CALLER applies the C-1 boundary falloff,
 * so this can return full-strength values everywhere.
 */
function interiorDetail(x: number, z: number, sub: GrassSubvariantIndex): { dy: number; t: number } {
  switch (sub) {
    case 0: {
      // 'calm' — one soft off-centre highlight blotch, near-flat.
      const t = 0.7 * gauss(x - 0.15, z + 0.10, 0.28);
      return { dy: 0, t };
    }
    case 1: {
      // 'tufted' — 3 raised tufts at deterministic spots, ringed with highlight.
      const tufts: Array<[number, number]> = [[-0.18, -0.12], [0.16, 0.04], [-0.02, 0.20]];
      let dy = 0, t = 0;
      for (const [tx, tz] of tufts) {
        const g = gauss(x - tx, z - tz, 0.16);
        dy += TUFT_LIFT * g;
        // ring highlight: bright on the tuft slope, not dead centre.
        const d = Math.hypot(x - tx, z - tz);
        t = Math.max(t, smoothstep(0.16, 0.06, d) * 0.85);
      }
      return { dy, t };
    }
    case 2: {
      // 'grained' — diagonal alternating bands, flat.
      const band = 0.5 + 0.5 * Math.sin((x + z) * 14);
      const t = band > 0.55 ? 0.6 : 0;
      return { dy: 0, t };
    }
  }
}

interface TopVert { x: number; y: number; z: number; c: Color; }

/** Sample a top-face vertex. Pinned perimeter verts (C-1) get nominal Y + primary. */
function sampleTop(x: number, z: number, sub: GrassSubvariantIndex, pinned: boolean): TopVert {
  if (pinned) return { x, y: TOP_HEIGHT, z, c: C_PRIMARY };
  const { dy, t } = interiorDetail(x, z, sub);
  const w = smoothstep(0, 0.25, distToBoundary(x, z)); // C-1 falloff
  const c = C_PRIMARY.clone().lerp(C_HIGHLIGHT, t * w);
  return { x, y: TOP_HEIGHT + dy * w, z, c };
}

// ── Geometry assembly — interior-subdivided top + vertical sides ───────────

function assembleGeometry(outline: Vector2[], shape: GrassShape, sub: GrassSubvariantIndex): BufferGeometry {
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const p of outline) { cx += p.x; cz += p.y; }
  cx /= n; cz /= n;

  const positions: number[] = [];
  const normals:   number[] = [];
  const colors:    number[] = [];

  if (shape === "F") {
    buildFillerTop(positions, normals, colors, sub);
  } else {
    buildRingTop(positions, normals, colors, outline, cx, cz, sub);
  }

  // Side faces — vertical wall per outline segment, separate verts (C-3).
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    let nx = (b.y - a.y), nz = -(b.x - a.x);
    const mx = (a.x + b.x) / 2 - cx, mz = (a.y + b.y) / 2 - cz;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const len = Math.hypot(nx, nz) || 1; nx /= len; nz /= len;
    const aT: TopVert = { x: a.x, y: TOP_HEIGHT, z: a.y, c: C_SIDE };
    const bT: TopVert = { x: b.x, y: TOP_HEIGHT, z: b.y, c: C_SIDE };
    const aB: TopVert = { x: a.x, y: 0, z: a.y, c: C_SIDE };
    const bB: TopVert = { x: b.x, y: 0, z: b.y, c: C_SIDE };
    pushSideTri(positions, normals, colors, aT, bT, bB, nx, nz);
    pushSideTri(positions, normals, colors, aT, bB, aB, nx, nz);
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("normal",   new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute("color",    new BufferAttribute(new Float32Array(colors), 3));
  return geo;
}

/** Filler (Shape F): GRID_N×GRID_N grid over the unit square. Perimeter pinned. */
function buildFillerTop(pos: number[], nor: number[], col: number[], sub: GrassSubvariantIndex): void {
  const grid: TopVert[][] = [];
  for (let i = 0; i <= GRID_N; i++) {
    grid[i] = [];
    for (let j = 0; j <= GRID_N; j++) {
      const x = -HALF + i / GRID_N;
      const z = -HALF + j / GRID_N;
      const pinned = i === 0 || j === 0 || i === GRID_N || j === GRID_N;
      grid[i]![j] = sampleTop(x, z, sub, pinned);
    }
  }
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const a = grid[i]![j]!, b = grid[i + 1]![j]!, c = grid[i + 1]![j + 1]!, d = grid[i]![j + 1]!;
      pushTopTri(pos, nor, col, a, b, c);
      pushTopTri(pos, nor, col, a, c, d);
    }
  }
}

/** Open shapes: outline ring (pinned) + 2 inner scaled rings + centroid. */
function buildRingTop(pos: number[], nor: number[], col: number[], outline: Vector2[], cx: number, cz: number, sub: GrassSubvariantIndex): void {
  const n = outline.length;
  const scales = [1.0, 0.62, 0.30];
  const rings: TopVert[][] = scales.map((s, ri) =>
    outline.map((p) => {
      const x = cx + (p.x - cx) * s;
      const z = cz + (p.y - cz) * s;
      return sampleTop(x, z, sub, /* pinned */ ri === 0);
    })
  );
  // Strips between consecutive rings.
  for (let r = 0; r < rings.length - 1; r++) {
    const outer = rings[r]!, inner = rings[r + 1]!;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      pushTopTri(pos, nor, col, outer[i]!, outer[i2]!, inner[i2]!);
      pushTopTri(pos, nor, col, outer[i]!, inner[i2]!, inner[i]!);
    }
  }
  // Fan the innermost ring to the centroid.
  const innerMost = rings[rings.length - 1]!;
  const centre = sampleTop(cx, cz, sub, false);
  for (let i = 0; i < n; i++) {
    pushTopTri(pos, nor, col, innerMost[i]!, innerMost[(i + 1) % n]!, centre);
  }
}

/** Push a top-face triangle, auto-oriented so it is front-facing (CCW) from
 *  above (+Y). THREE culls back faces by default, so the winding — not the
 *  normal attribute — decides visibility. cross(b-a, c-a).y > 0 ⇒ CCW from
 *  above ⇒ front face points up. */
function pushTopTri(pos: number[], nor: number[], col: number[], a: TopVert, b: TopVert, c: TopVert): void {
  const crossY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const tri = crossY >= 0 ? [a, b, c] : [a, c, b];
  for (const v of tri) {
    pos.push(v.x, v.y, v.z);
    nor.push(0, 1, 0);
    col.push(v.c.r, v.c.g, v.c.b);
  }
}

function pushSideTri(pos: number[], nor: number[], col: number[], a: TopVert, b: TopVert, c: TopVert, nx: number, nz: number): void {
  for (const v of [a, b, c]) {
    pos.push(v.x, v.y, v.z);
    nor.push(nx, 0, nz);
    col.push(v.c.r, v.c.g, v.c.b);
  }
}

function clampMask(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 15) return 15;
  return v | 0;
}
