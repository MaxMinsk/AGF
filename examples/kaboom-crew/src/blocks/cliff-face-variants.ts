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

// Grass cliff: thin green crown over warm soil strata, darkening to a deep
// shadowed base — reads as an earthy bank.
const GRASS_PRIMARY = "#4a8a3e";
const GRASS_HIGHLIGHT = "#6bbf52";
const SOIL_LIGHT = "#8a6740";
const SOIL_MID = "#664a2a";
const SOIL_DARK = "#3e2c18";
// Stone cliff: weathered warm-grey rock with clear sedimentary layers,
// deliberately cooler + darker than the beige plateau top so the face reads
// as rock, not an extension of the box.
const STONE_LIGHT = "#9a9488";
const STONE_MID = "#6b665b";
const STONE_DARK = "#494438";
const STONE_SHADOW = "#2c2820";

const HALF = 0.5;
const COLS = 6;   // vertical columns across the 1-cell width
const BANDS = 14; // horizontal bands up the face (fine → crisp strata lines)

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

  // Smooth vertical gradient (0 = bottom … 1 = top): a weathered crown fading
  // through a mid tone to a deep, contact-shadowed base. Clean 3-stop ramp —
  // no discrete bands / panel grid (those read as a checkerboard).
  const lo = new Color(isGrass ? "#241a0e" : STONE_SHADOW);
  const md = new Color(isGrass ? SOIL_MID : STONE_MID);
  const hi = new Color(isGrass ? SOIL_LIGHT : STONE_LIGHT);
  const grassCrown = new Color(GRASS_PRIMARY);
  const ramp3 = (t: number): Color =>
    t < 0.5 ? lo.clone().lerp(md, t * 2) : md.clone().lerp(hi, (t - 0.5) * 2);
  // Faint sedimentary strata — thin darker lines at a few irregular heights.
  // Colour-only (no geometry), no vertical component → no checkerboard. The
  // line set varies per (sub, delta) so stacked cliffs don't look stamped.
  const strataSeed = sub * 0.37 + (H % 3) * 0.11;
  const strataAt = [0.30, 0.52, 0.71, 0.85].map((s, i) => (s + ((strataSeed * (i + 1)) % 0.06) - 0.03));
  const strataDarken = (v: number): number => {
    for (const s of strataAt) {
      const d = Math.abs(v - s);
      if (d < 0.018) return 0.78;       // crisp dark seam
      if (d < 0.035) return 0.90;       // soft shoulder
    }
    return 1.0;
  };
  const colorAtV = (v: number): Color => {
    let c: Color;
    if (isGrass) {
      if (v > 0.88) return grassCrown.clone(); // thin green turf crown (no strata)
      c = ramp3(Math.min(1, v / 0.88));        // soil ramp below the crown
    } else {
      c = ramp3(v);
    }
    return c.multiplyScalar(strataDarken(v));
  };

  // Outward Z offset for a vertex at (u = 0..1 across width, v = 0..1 up).
  const outwardZ = (u: number, v: number): number => {
    let z = 0;
    // The face is a FLAT vertical plane flush at the cell boundary (z≈0) —
    // it recolours the pillar side with biome banding rather than bulging out
    // (earlier outward lip/convexity/flare read as lumpy growths from the
    // top-down camera). The only departure from flat is a small inward taper
    // on isolated ends so a lone cliff rounds off instead of a hard slab edge.
    if (!leftConnected && u < 0.15) z -= taper * (1 - u / 0.15);
    if (!rightConnected && u > 0.85) z -= taper * ((u - 0.85) / 0.15);
    // A hair outward so the face sits just proud of the 0.96-scaled pillar box
    // (avoids z-fighting) without visibly protruding.
    return z + 0.01;
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
      const cLow = colorAtV(v0);
      const cHigh = colorAtV(v1);
      pushQuad(pos, nor, col, a, bb, cc, d, cLow, cHigh);
    }
  }

  // No protruding lip / bevel shelf — the flat banded face IS the cliff side.
  // (The grass top-edge highlight already comes from the top band colour.)
  void hash; void STONE_SHADOW; void GRASS_HIGHLIGHT; void STONE_LIGHT; void pushShelf;

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
