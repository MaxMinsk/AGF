// S102 PROCBOMBER-PART-BUILDERS — per-part procedural mesh generators.
//
// Each builder returns ONE BufferGeometry sized by its slice of the
// bomber recipe and tinted from the corresponding palette channel. The
// mesh-tree spawner (PROCBOMBER-MESH-TREE-V0) assembles them into the
// 9-pivot + 10-mesh ECS hierarchy; the single-mesh `generateBomberMesh`
// path stays for tests + the v0 bench code path.
//
// Each part-builder writes its mesh in its OWN-LOCAL space — the
// spawner places the entity at the pivot point and the geometry sits
// centered there. So:
//   - torso: y range = [-torsoHeight/2 .. +torsoHeight/2]
//   - head:  y range = [-headSize/2 .. +headSize/2] (centered above neck)
//   - upperArm: y range = [-armLength .. 0] (hangs DOWN from the shoulder pivot)
//   - forearm:  y range = [-armLength .. 0] (hangs DOWN from the elbow pivot)
//   - upperLeg: y range = [-legLength .. 0]
//   - lowerLeg: y range = [-legLength .. 0]
//
// Hanging the arm + leg geometry below their pivot means a positive-X
// shoulder rotation lifts the arm forward like a real shoulder joint.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Matrix4
} from "three";

import type { BomberPalette } from "./bomber-palette";

export type BomberPartShape = "box" | "cylinder" | "capsule";

export type BomberPartShapes = {
  head: BomberPartShape;
  torso: BomberPartShape;
  limb: BomberPartShape;
};

export const DEFAULT_BOMBER_PART_SHAPES: BomberPartShapes = {
  head: "box",
  torso: "box",
  limb: "box"
};

/**
 * S109 KABOOM-PROCEDURAL-TEXTURING. Per-bomber procedural texturing
 * layer that sits on top of the 8-channel palette + 10-mesh tree.
 * Layer 1 is `panelSeams`: extreme-Y vertices (the 8 box corners or
 * the top+bottom rings of a cylinder/capsule) are darkened to a fixed
 * fraction of the base channel colour, reading as soft edge highlights.
 * Layer 2 (S112) adds `decals[]` — vertex-colour overrides at fixed
 * anchor faces on specific part-meshes.
 * Layer 3 (patterns) ships later.
 */
export const DECAL_KINDS = ["chestEmblem", "helmetStripe", "kneePad"] as const;
export type DecalKind = (typeof DECAL_KINDS)[number];

export const PATTERN_STYLES = ["solid", "stripes"] as const;
export type PatternStyle = (typeof PATTERN_STYLES)[number];

export type BomberPattern = {
  /** "solid" = no-op (current behaviour). "stripes" = alternating Y-bands painted with palette.accent. */
  style: PatternStyle;
  /** Number of stripe bands (clamped to STRIPE_SCALE_RANGE). Only meaningful when style==='stripes'. */
  scale: number;
};

/** Stripe count is also the number of vertex rows minus one. Bounded to keep the geometry cost sane. */
export const STRIPE_SCALE_RANGE = { min: 2, max: 6 } as const;

export type BomberTexturing = {
  /** Default true — corner / top-and-bottom edge vertices darkened by PANEL_SEAM_FACTOR. */
  panelSeams: boolean;
  /**
   * S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2 — 0..3 decals from the
   * fixed catalog. Each decal paints a specific face on a specific
   * part-mesh with the palette.accent (or part-specific) colour. NO
   * shader changes — pure vertex-colour overrides on top of the
   * panelSeams pass.
   */
  decals: ReadonlyArray<DecalKind>;
  /**
   * S113 KABOOM-PROCEDURAL-TEXTURING-LAYER-3 — body patterns via
   * vertex-color band painting. Only "stripes" is implemented; "spots"
   * is deferred because it needs shader-side procedural noise that
   * doesn't fit the vertex-color pipeline. Default "solid" = no-op.
   */
  pattern: BomberPattern;
};

export const DEFAULT_BOMBER_TEXTURING: BomberTexturing = {
  panelSeams: true,
  decals: [],
  pattern: { style: "solid", scale: 4 }
};

/** Darken factor applied to extreme-Y vertices when panelSeams is on. */
export const PANEL_SEAM_FACTOR = 0.85;

function buildBoxLike(
  width: number,
  height: number,
  depth: number,
  shape: BomberPartShape,
  heightSegments = 2
): BufferGeometry {
  switch (shape) {
    case "box":
      // S109 KABOOM-PROCEDURAL-TEXTURING — heightSegments=2 splits each
      // box-side face into 2 vertical bands. The middle band's vertices
      // stay bright while the top + bottom edges get the panelSeams
      // darken pass — without subdivision every vertex of a box sits at
      // the extreme Y and the seam darkening reduces to "darken
      // everything", which is visually indistinguishable from picking a
      // slightly darker palette channel.
      // S113 KABOOM-PROCEDURAL-TEXTURING-LAYER-3 — stripes need MORE
      // Y subdivisions so alternating bands can be painted distinctly.
      // The caller passes a higher value (default 2, stripes bump to
      // scale × 2) and we wire it through.
      return new BoxGeometry(width, height, depth, 1, heightSegments, 1);
    case "cylinder": {
      const radius = Math.min(width, depth) / 2;
      return new CylinderGeometry(radius, radius, height, 16, heightSegments);
    }
    case "capsule": {
      const radius = Math.min(width, depth) / 2;
      const cylLength = Math.max(0.0001, height - 2 * radius);
      return new CapsuleGeometry(radius, cylLength, 4, 12);
    }
  }
}

/**
 * S113 — when the texturing pattern is "stripes", a higher Y
 * subdivision is required so distinct vertex rows can be painted with
 * alternating colours. heightSegments = stripeScale × 2 gives
 * `stripeScale` clear bands; cap to a reasonable max so we don't blow
 * vertex counts on extreme settings.
 */
function heightSegmentsFor(texturing: BomberTexturing): number {
  if (texturing.pattern.style === "stripes") {
    const scale = Math.max(STRIPE_SCALE_RANGE.min, Math.min(STRIPE_SCALE_RANGE.max, Math.round(texturing.pattern.scale)));
    return Math.max(2, scale * 2);
  }
  return 2;
}

export type BomberPartSizes = {
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  // S103 PROCBOMBER-LIMB-SEGMENT-SLIDERS: each limb is two segments
  // with independent length knobs.
  upperArmLength: number;
  forearmLength: number;
  armWidth: number;
  upperLegLength: number;
  lowerLegLength: number;
  legWidth: number;
};

export type BomberPartName =
  | "torso"
  | "head"
  | "upperArm"
  | "forearm"
  | "upperLeg"
  | "lowerLeg";

/** Procedural-mesh-registry key for a given body part. */
export function partKey(name: BomberPartName): string {
  return `procbomber-${name}`;
}

/** Color channel a part reads from the 8-channel palette. */
export function partColor(palette: BomberPalette, name: BomberPartName): string {
  switch (name) {
    case "torso":     return palette.torsoTop;
    case "head":      return palette.head;
    case "upperArm":  return palette.upperArm;
    case "forearm":   return palette.forearm;
    case "upperLeg":  return palette.upperLeg;
    case "lowerLeg":  return palette.lowerLeg;
  }
}

// ---- part builders ----

export function generateTorso(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  // S112 — torso bumps depthSegments to 2 so the FRONT face has a mid
  // vertex row + column where the chestEmblem decal can land crisply.
  // S113 — heightSegments scales with the stripe pattern when active.
  const heightSegs = heightSegmentsFor(texturing);
  const g = shape === "box"
    ? new BoxGeometry(s.torsoWidth, s.torsoHeight, s.torsoWidth * 0.65, 2, heightSegs, 2)
    : buildBoxLike(s.torsoWidth, s.torsoHeight, s.torsoWidth * 0.65, shape, heightSegs);
  paintVertexColors(g, palette.torsoTop);
  paintBottomShadow(g, palette.torsoBottom, s.torsoHeight);
  applyTexturing(g, texturing, "torso", palette);
  return g;
}

export function generateHead(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  const g = buildBoxLike(s.headSize, s.headSize, s.headSize, shape, heightSegmentsFor(texturing));
  paintVertexColors(g, palette.head);
  applyTexturing(g, texturing, "head", palette);
  return g;
}

function generateLimbSegment(
  width: number,
  length: number,
  color: string,
  shape: BomberPartShape,
  texturing: BomberTexturing,
  partName: BomberPartName,
  palette: BomberPalette
): BufferGeometry {
  const g = buildBoxLike(width, length, width, shape, heightSegmentsFor(texturing));
  // Hang the segment below the pivot — pivot at the TOP of the segment.
  g.applyMatrix4(new Matrix4().makeTranslation(0, -length / 2, 0));
  paintVertexColors(g, color);
  applyTexturing(g, texturing, partName, palette);
  return g;
}

export function generateUpperArm(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.upperArmLength, palette.upperArm, shape, texturing, "upperArm", palette);
}

export function generateForearm(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.forearmLength, palette.forearm, shape, texturing, "forearm", palette);
}

export function generateUpperLeg(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.upperLegLength, palette.upperLeg, shape, texturing, "upperLeg", palette);
}

export function generateLowerLeg(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.lowerLegLength, palette.lowerLeg, shape, texturing, "lowerLeg", palette);
}

/** Dispatcher used by the mesh-tree spawner. */
export function generatePart(
  name: BomberPartName,
  s: BomberPartSizes,
  palette: BomberPalette,
  shapes: BomberPartShapes = DEFAULT_BOMBER_PART_SHAPES,
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  switch (name) {
    case "torso":     return generateTorso(s, palette, shapes.torso, texturing);
    case "head":      return generateHead(s, palette, shapes.head, texturing);
    case "upperArm":  return generateUpperArm(s, palette, shapes.limb, texturing);
    case "forearm":   return generateForearm(s, palette, shapes.limb, texturing);
    case "upperLeg":  return generateUpperLeg(s, palette, shapes.limb, texturing);
    case "lowerLeg":  return generateLowerLeg(s, palette, shapes.limb, texturing);
  }
}

// ---- vertex paint helpers ----

function paintVertexColors(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const count = position.count;
  const colorAttr = new Float32Array(count * 3);
  const c = new Color(hex);
  for (let i = 0; i < count; i += 1) {
    colorAttr[i * 3] = c.r;
    colorAttr[i * 3 + 1] = c.g;
    colorAttr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colorAttr, 3));
}

/**
 * S109 KABOOM-PROCEDURAL-TEXTURING — Layer 1 (panel seams).
 *
 * Multiplies the existing vertex colour at extreme-Y vertices by
 * PANEL_SEAM_FACTOR. For a `BoxGeometry` this hits exactly the 8 corner
 * vertices (4 top + 4 bottom); for cylinder + capsule it darkens the
 * top + bottom rings (the equivalent "edges"). Reads as a soft panel
 * seam without any shader work — purely a vertex-colour pass.
 *
 * Idempotent (a second call darkens twice — callers should run it
 * once per geometry, after every other colour pass).
 */
function applyPanelSeamDarken(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY;
  if (span <= 0) return;
  // 0.5% epsilon — captures the top/bottom rings of cylinders without
  // sweeping any side-wall verts on tall boxes.
  const eps = span * 0.005;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= minY + eps || y >= maxY - eps) {
      const r = color.getX(i) * PANEL_SEAM_FACTOR;
      const g = color.getY(i) * PANEL_SEAM_FACTOR;
      const b = color.getZ(i) * PANEL_SEAM_FACTOR;
      color.setXYZ(i, r, g, b);
    }
  }
  color.needsUpdate = true;
}

/**
 * S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2 — body decals.
 *
 * Maps each decal kind to a per-vertex predicate + colour. The
 * predicate is geometry-local: we use the geometry's bounding box +
 * the part's known shape to identify the right faces.
 *
 *   chestEmblem  → torso FRONT face (+Z), mid-Y mid-X. Painted with palette.accent.
 *   helmetStripe → head TOP half (Y > 0). Painted with palette.accent.
 *   kneePad      → lowerLeg FRONT face (+Z), upper third. Painted darker palette.lowerLeg.
 *
 * Each decal is independent — applying multiple decals just stacks
 * the per-vertex overrides.
 *
 * Idempotent in the sense that running the function twice produces
 * the same buffer.
 */
function applyDecals(
  geometry: BufferGeometry,
  partName: BomberPartName,
  palette: BomberPalette,
  decals: ReadonlyArray<DecalKind>
): void {
  if (decals.length === 0) return;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  // Bounding box per axis — cheaper than BufferGeometry.computeBoundingBox()
  // since we already walk every vertex.
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const eps = Math.max(spanX, spanY, spanZ) * 0.005;
  const accent = new Color(palette.accent);
  const darkerLeg = new Color(palette.lowerLeg).multiplyScalar(0.55);

  const onFrontFace = (i: number): boolean => position.getZ(i) >= maxZ - eps;
  const inMidY = (i: number): boolean => {
    const y = position.getY(i);
    return y >= minY + spanY * 0.35 && y <= minY + spanY * 0.65;
  };
  const inMidX = (i: number): boolean => {
    const x = position.getX(i);
    return x >= minX + spanX * 0.25 && x <= minX + spanX * 0.75;
  };
  // "Upper third" of a limb that hangs DOWN from the pivot — Y near
  // the top of the segment (the pivot end, i.e. near maxY).
  const inUpperThirdY = (i: number): boolean => {
    const y = position.getY(i);
    return y >= minY + spanY * 0.66;
  };
  const inUpperHalfY = (i: number): boolean => position.getY(i) > minY + spanY * 0.5;

  const paint = (i: number, c: Color): void => {
    color.setXYZ(i, c.r, c.g, c.b);
  };

  for (const decal of decals) {
    if (decal === "chestEmblem" && partName === "torso") {
      for (let i = 0; i < position.count; i += 1) {
        if (onFrontFace(i) && inMidY(i) && inMidX(i)) paint(i, accent);
      }
    } else if (decal === "helmetStripe" && partName === "head") {
      for (let i = 0; i < position.count; i += 1) {
        if (inUpperHalfY(i)) paint(i, accent);
      }
    } else if (decal === "kneePad" && partName === "lowerLeg") {
      // Drop the mid-X constraint — the limb's front face only has
      // X verts at the extremes (no widthSegments=2 on limbs), so we
      // paint the full upper-third front strip. Reads as a knee pad
      // on the narrow lowerLeg geometry.
      for (let i = 0; i < position.count; i += 1) {
        if (onFrontFace(i) && inUpperThirdY(i)) paint(i, darkerLeg);
      }
    }
  }
  color.needsUpdate = true;
}

/**
 * S113 KABOOM-PROCEDURAL-TEXTURING-LAYER-3 — stripe band painter.
 *
 * Paints alternating Y-row bands with `palette.accent`. The Y range
 * is split into `2 × scale` bands (every other one painted), giving
 * `scale` visible stripes. Skips top + bottom rows so the panelSeams
 * darken at the rim stays intact, and skips already-decal-painted
 * vertices (the accent-coloured ones from chestEmblem / helmetStripe)
 * by checking the current vertex colour against the base channel
 * colour — if the vertex was already decal-painted, leave it alone.
 *
 * Idempotent.
 */
function applyStripes(
  geometry: BufferGeometry,
  texturing: BomberTexturing,
  palette: BomberPalette,
  partName: BomberPartName
): void {
  if (texturing.pattern.style !== "stripes") return;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY;
  if (span <= 0) return;
  const scale = Math.max(
    STRIPE_SCALE_RANGE.min,
    Math.min(STRIPE_SCALE_RANGE.max, Math.round(texturing.pattern.scale))
  );
  // 2*scale total bands; we paint the ODD-indexed ones with accent.
  const bandCount = scale * 2;
  const bandHeight = span / bandCount;
  const accent = new Color(palette.accent);
  const eps = bandHeight * 0.1;
  // Pre-compute the base/expected vertex colour: a stripe overrides
  // verts that hold the base channel colour OR the panelSeam-darkened
  // base. Verts already mutated by decals are LEFT ALONE (they hold
  // either palette.accent or the kneePad-darker shade — neither of
  // which matches the base channel comparison).
  const baseHex =
    partName === "torso" ? palette.torsoTop
    : partName === "head" ? palette.head
    : partName === "upperArm" ? palette.upperArm
    : partName === "forearm" ? palette.forearm
    : partName === "upperLeg" ? palette.upperLeg
    : palette.lowerLeg;
  const baseColor = new Color(baseHex);
  const isCloseToBase = (i: number): boolean => {
    const dr = color.getX(i) - baseColor.r;
    const dg = color.getY(i) - baseColor.g;
    const db = color.getZ(i) - baseColor.b;
    return Math.abs(dr) < 0.05 && Math.abs(dg) < 0.05 && Math.abs(db) < 0.05;
  };
  // Also allow the panelSeam-darkened base (× 0.85) to be re-painted.
  const isCloseToSeam = (i: number): boolean => {
    const f = PANEL_SEAM_FACTOR;
    const dr = color.getX(i) - baseColor.r * f;
    const dg = color.getY(i) - baseColor.g * f;
    const db = color.getZ(i) - baseColor.b * f;
    return Math.abs(dr) < 0.05 && Math.abs(dg) < 0.05 && Math.abs(db) < 0.05;
  };
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // Skip top + bottom extreme rows so panel seam darken stays.
    if (y <= minY + eps || y >= maxY - eps) continue;
    if (!isCloseToBase(i) && !isCloseToSeam(i)) continue;
    const bandIndex = Math.floor((y - minY) / bandHeight);
    if (bandIndex % 2 === 1) {
      color.setXYZ(i, accent.r, accent.g, accent.b);
    }
  }
  color.needsUpdate = true;
}

/**
 * Apply every enabled procedural-texturing layer in the canonical
 * order: panel seams first, then stripes (paints over base/seam but
 * not over decals — decals override stripes at their anchor verts),
 * then decals (so decals always end up on top).
 */
function applyTexturing(
  geometry: BufferGeometry,
  texturing: BomberTexturing,
  partName: BomberPartName,
  palette: BomberPalette
): void {
  if (texturing.panelSeams) {
    applyPanelSeamDarken(geometry);
  }
  if (texturing.pattern.style === "stripes") {
    applyStripes(geometry, texturing, palette, partName);
  }
  if (texturing.decals.length > 0) {
    applyDecals(geometry, partName, palette, texturing.decals);
  }
}

/**
 * Overpaint the bottom band of the geometry with a darker hex value.
 * Used by the torso so the lower third reads as a contact-shadow.
 * `heightExtent` is the geometry's Y range (Y centered at 0).
 */
function paintBottomShadow(
  geometry: BufferGeometry,
  hex: string,
  heightExtent: number,
  bandFraction = 0.3
): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute;
  const c = new Color(hex);
  const lowY = -heightExtent / 2;
  const bandTop = lowY + heightExtent * bandFraction;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= bandTop) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
