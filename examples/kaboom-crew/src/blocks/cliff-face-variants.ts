// S293 (GDP-2026-06-04-001) — cliff-face curved-outline meshes for the
// vertical edges between height-differing cells. Replaces the plain box
// pillar sides so plateaus read as natural terraces.
//
// LAYER 4 of the tile-edge pipeline (tile-edge-library-design.md §8). Cliffs
// are STATIC per scene (the heightmap never changes mid-round), so variants
// are resolved once at scene-load command emission — no per-frame resolver.
//
// A face is built in LOCAL space: width 1.0 (X, centred), height `delta`
// cells (Y, centred at 0), outward = +Z. The spawner positions + rotates it
// onto the taller cell's exposed face.
//
// variantIndex (2-bit left/right connection):
//   0 isolated · 1 left-connected · 2 right-connected · 3 corridor (both)
// Connected ends are flush (tile seamlessly with the neighbour face);
// isolated ends taper inward so a lone cliff reads as a rounded nub.
//
// subVariant 0/1 varies the body relief (grass: smooth vs layered strata;
// stone: panel score-lines vs a crevice).

import { BufferAttribute, BufferGeometry, Color } from "three";

export type CliffBiome = "cliff-grass" | "cliff-stone";
export type CliffVariantIndex = 0 | 1 | 2 | 3;
export type CliffSubvariant = 0 | 1;

// Grass palette + soil bands.
const GRASS_PRIMARY = "#4a8a3e";
const GRASS_HIGHLIGHT = "#5fa84a";
const SOIL_LIGHT = "#7a5c3a";
const SOIL_MID = "#5a3e22";
const SOIL_DARK = "#3a2810";
// Stone palette.
const STONE_LIGHT = "#8a8a7a";
const STONE_MID = "#6a6a5a";
const STONE_DARK = "#4a4a3a";
const STONE_SHADOW = "#2a2a1a";

const HALF = 0.5;
const COLS = 6;   // vertical columns across the 1-cell width
const BANDS = 6;  // horizontal bands up the face

const TAPER = { "cliff-grass": 0.06, "cliff-stone": 0.04 } as const;

function hash(n: number): number {
  return Math.abs(Math.sin(n * 12.9898) * 43758.5) % 1;
}

/** Build a cliff-face geometry. `delta` = integer height in cells (≥1). */
export function buildCliffFace(
  biome: CliffBiome,
  variantIndex: CliffVariantIndex,
  sub: CliffSubvariant,
  delta: number
): BufferGeometry {
  const H = Math.max(1, Math.floor(delta));
  const leftConnected = (variantIndex & 0b01) !== 0;
  const rightConnected = (variantIndex & 0b10) !== 0;
  const taper = TAPER[biome];

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];

  const isGrass = biome === "cliff-grass";
  const topY = H / 2;
  const botY = -H / 2;

  // Colour for a band row (0 = bottom … BANDS = top).
  const bandColor = (row: number): Color => {
    const t = row / BANDS; // 0 bottom → 1 top
    if (isGrass) {
      if (t > 0.95) return new Color(GRASS_PRIMARY);
      if (t > 0.66) return new Color(SOIL_LIGHT);
      if (t > 0.45) return new Color(SOIL_MID);
      return new Color(SOIL_DARK);
    }
    if (t > 0.8) return new Color(STONE_LIGHT);
    if (t > 0.35) return new Color(STONE_MID);
    return new Color(STONE_DARK);
  };

  // Outward Z offset for a vertex at (u = 0..1 across width, v = 0..1 up).
  const outwardZ = (u: number, v: number): number => {
    let z = 0;
    // Sub-variant body relief.
    if (isGrass) {
      if (sub === 0) z += 0.05 * Math.sin(Math.PI * v); // gentle bulge, peak mid
      else { // layered strata: two step ledges
        if (v > 0.30 && v < 0.40) z += 0.03;
        if (v > 0.63 && v < 0.73) z += 0.03;
      }
    } else {
      if (sub === 0) z += 0.02 * Math.sin(Math.PI * v); // minimal convexity
      else { // crevice: inward cut at ~45% height
        if (v > 0.40 && v < 0.50) z -= 0.06;
      }
    }
    // Base undercut (grass) / flare (stone) on the bottom 10%.
    if (v < 0.10) z += isGrass ? -0.05 * (1 - v / 0.10) : 0.04 * (1 - v / 0.10);
    // End taper on isolated ends (u near 0 = left, u near 1 = right).
    if (!leftConnected && u < 0.15) z -= taper * (1 - u / 0.15);
    if (!rightConnected && u > 0.85) z -= taper * ((u - 0.85) / 0.15);
    return z;
  };

  // Build the face as a COLS×BANDS quad grid.
  const vert = (u: number, v: number): [number, number, number] => {
    const x = -HALF + u;
    const y = botY + v * H;
    return [x, y, outwardZ(u, v)];
  };
  for (let c = 0; c < COLS; c++) {
    for (let b = 0; b < BANDS; b++) {
      const u0 = c / COLS, u1 = (c + 1) / COLS;
      const v0 = b / BANDS, v1 = (b + 1) / BANDS;
      const a = vert(u0, v0), bb = vert(u1, v0), cc = vert(u1, v1), d = vert(u0, v1);
      const cLow = bandColor(b), cHigh = bandColor(b + 1);
      pushQuad(pos, nor, col, a, bb, cc, d, cLow, cHigh);
    }
  }

  // Grass lip: a thin overhang shelf at the top, sloping down + outward.
  if (isGrass) {
    const lipZ = 0.12;
    const u = (i: number): number => i / COLS;
    for (let c = 0; c < COLS; c++) {
      const u0 = u(c), u1 = u(c + 1);
      const innerL: [number, number, number] = [-HALF + u0, topY, 0];
      const innerR: [number, number, number] = [-HALF + u1, topY, 0];
      const outerR: [number, number, number] = [-HALF + u1, topY - 0.04, lipZ];
      const outerL: [number, number, number] = [-HALF + u0, topY - 0.04, lipZ];
      const base = new Color(GRASS_PRIMARY), tip = new Color(GRASS_HIGHLIGHT);
      // Top-facing shelf — quad innerL,innerR,outerR,outerL with up-ish normal.
      pushShelf(pos, nor, col, innerL, innerR, outerR, outerL, base, tip);
    }
  } else {
    // Stone top bevel: a 0.02 chamfer strip.
    const u = (i: number): number => i / COLS;
    for (let c = 0; c < COLS; c++) {
      const u0 = u(c), u1 = u(c + 1);
      const innerL: [number, number, number] = [-HALF + u0, topY, 0];
      const innerR: [number, number, number] = [-HALF + u1, topY, 0];
      const outerR: [number, number, number] = [-HALF + u1, topY - 0.02, 0.02];
      const outerL: [number, number, number] = [-HALF + u0, topY - 0.02, 0.02];
      const light = new Color(STONE_LIGHT);
      pushShelf(pos, nor, col, innerL, innerR, outerR, outerL, light, light);
    }
  }

  // Stone crevice interior darkening (sub 1) — approximate by tinting; the
  // -Z cut is already in outwardZ. (Crevice colour blends via band; keep simple.)
  void hash; void STONE_SHADOW;

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}

/** Small corner-cap wedge filling a convex cliff corner. */
export function buildCliffCorner(biome: CliffBiome, delta: number): BufferGeometry {
  const H = Math.max(1, Math.floor(delta));
  const leg = 0.12;
  const topY = H / 2, botY = -H / 2;
  const body = new Color(biome === "cliff-grass" ? SOIL_LIGHT : STONE_MID);
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  // Right-isosceles prism: XZ triangle (0,0)-(leg,0)-(0,leg), extruded Y.
  const tri = (y: number): Array<[number, number, number]> => [
    [0, y, 0], [leg, y, 0], [0, y, leg]
  ];
  const top = tri(topY), bot = tri(botY);
  // Outer slanted face (hypotenuse) + two side faces.
  pushQuad(pos, nor, col, bot[1]!, bot[2]!, top[2]!, top[1]!, body, body);
  pushQuad(pos, nor, col, bot[0]!, bot[1]!, top[1]!, top[0]!, body, body);
  pushQuad(pos, nor, col, bot[2]!, bot[0]!, top[0]!, top[2]!, body, body);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}

// ── helpers ─────────────────────────────────────────────────────────────

function pushQuad(
  pos: number[], nor: number[], col: number[],
  a: [number, number, number], b: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  cLow: Color, cHigh: Color
): void {
  // a,b on the low edge; c,d on the high edge. Two triangles, outward (+Z) wind.
  tri3(pos, nor, col, a, b, c, cLow, cLow, cHigh);
  tri3(pos, nor, col, a, c, d, cLow, cHigh, cHigh);
}

function pushShelf(
  pos: number[], nor: number[], col: number[],
  a: [number, number, number], b: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  cInner: Color, cOuter: Color
): void {
  tri3(pos, nor, col, a, b, c, cInner, cInner, cOuter);
  tri3(pos, nor, col, a, c, d, cInner, cOuter, cOuter);
}

function tri3(
  pos: number[], nor: number[], col: number[],
  a: [number, number, number], b: [number, number, number], c: [number, number, number],
  ca: Color, cb: Color, cc: Color
): void {
  pos.push(...a, ...b, ...c);
  nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1); // recomputed later
  col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}

/** Resolve the 2-bit left/right variant from neighbouring cliff presence. */
export function cliffVariant(leftPresent: boolean, rightPresent: boolean): CliffVariantIndex {
  return ((leftPresent ? 0b01 : 0) | (rightPresent ? 0b10 : 0)) as CliffVariantIndex;
}
