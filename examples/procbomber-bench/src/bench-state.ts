// S101 PROCBOMBER-BENCH-UI-CONTROLS — local bench state machine.
//
// The bench keeps its current generator spec in one mutable object.
// DOM controls write here; an update tick (debounced via rAF) reads it
// and rebuilds the bomber mesh via runtime.renderer.adapter.setMeshGeometry.
// Plays the role a project-local ECS system would — but the bench is a
// sandbox, not gameplay, so keeping the state in module scope is the
// simplest path that doesn't require new engine surface area.

import type { BufferGeometry } from "three";

import {
  BOMBER_MESH_DEFAULTS,
  generateBomberMesh
} from "./generators/bomber-mesh";
import type { BomberPartShapes, BomberPartSizes } from "./generators/bomber-parts";
import {
  BOMBER_PALETTES,
  paletteByName,
  pickBomberPalette,
  type BomberPaletteName,
  type BomberPalette
} from "./generators/bomber-palette";

export type BomberShape = "box" | "cylinder" | "capsule";

export const BOMBER_SHAPE_OPTIONS: ReadonlyArray<BomberShape> = ["box", "cylinder", "capsule"];

export function isBomberShape(value: unknown): value is BomberShape {
  return typeof value === "string" && (BOMBER_SHAPE_OPTIONS as ReadonlyArray<string>).includes(value);
}

export type BenchState = {
  // --- size knobs (S103 expanded to 4 segment lengths) ---
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  upperArmLength: number;
  forearmLength: number;
  armWidth: number;
  upperLegLength: number;
  lowerLegLength: number;
  legWidth: number;
  // --- S102 PROCBOMBER-RECIPE-PARAMS-16 ---
  // Posture (radians; converted to degrees at the Transform write boundary)
  forwardTilt: number;
  armRestAngle: number;
  // Mount offsets (cell units). Y is along torso vertical (negative = toward bottom),
  // Z is depth (positive = forward). All four default to 0; non-zero values shift
  // the pivot away from the default outer-edge top/bottom anchor.
  shoulderMountY: number;
  shoulderMountZ: number;
  hipMountY: number;
  hipMountZ: number;
  // --- S103 PROCBOMBER-HIP-SPREAD-SLIDER ---
  // Multiplier on the default leg + arm X anchor. 1.0 = current default;
  // <1 narrows the stance; >1 widens it. Useful for stocky vs stick-figure builds.
  shoulderSpread: number;
  hipSpread: number;
  // Per-part shape style.
  headShape: BomberShape;
  torsoShape: BomberShape;
  limbShape: BomberShape;
  /** When undefined, the seed-driven picker chooses a palette. */
  paletteOverride: BomberPaletteName | undefined;
  /** Seed string. Reroll bumps this so the seed-picker may flip palettes. */
  seed: string;
};

export function defaultBenchState(initialPalette?: BomberPaletteName): BenchState {
  return {
    headSize: BOMBER_MESH_DEFAULTS.headSize,
    torsoHeight: BOMBER_MESH_DEFAULTS.torsoHeight,
    torsoWidth: BOMBER_MESH_DEFAULTS.torsoWidth,
    upperArmLength: BOMBER_MESH_DEFAULTS.upperArmLength,
    forearmLength: BOMBER_MESH_DEFAULTS.forearmLength,
    armWidth: BOMBER_MESH_DEFAULTS.armWidth,
    upperLegLength: BOMBER_MESH_DEFAULTS.upperLegLength,
    lowerLegLength: BOMBER_MESH_DEFAULTS.lowerLegLength,
    legWidth: BOMBER_MESH_DEFAULTS.legWidth,
    forwardTilt: 0,
    armRestAngle: 0,
    shoulderMountY: 0,
    shoulderMountZ: 0,
    hipMountY: 0,
    hipMountZ: 0,
    shoulderSpread: 1,
    hipSpread: 1,
    headShape: "box",
    torsoShape: "box",
    limbShape: "box",
    paletteOverride: initialPalette,
    seed: "default"
  };
}

export type BenchPosture = { forwardTilt: number; armRestAngle: number };
export type BenchMounts = {
  shoulderMountY: number;
  shoulderMountZ: number;
  hipMountY: number;
  hipMountZ: number;
};

export function postureOf(state: BenchState): BenchPosture {
  return { forwardTilt: state.forwardTilt, armRestAngle: state.armRestAngle };
}

export function mountsOf(state: BenchState): BenchMounts {
  return {
    shoulderMountY: state.shoulderMountY,
    shoulderMountZ: state.shoulderMountZ,
    hipMountY: state.hipMountY,
    hipMountZ: state.hipMountZ
  };
}

export type BenchSpread = { shoulderSpread: number; hipSpread: number };

export function spreadOf(state: BenchState): BenchSpread {
  return { shoulderSpread: state.shoulderSpread, hipSpread: state.hipSpread };
}

export function shapesOf(state: BenchState): BomberPartShapes {
  return { head: state.headShape, torso: state.torsoShape, limb: state.limbShape };
}

/** Extract the part-sizes slice from the bench state. */
export function sizesOf(state: BenchState): BomberPartSizes {
  return {
    headSize: state.headSize,
    torsoHeight: state.torsoHeight,
    torsoWidth: state.torsoWidth,
    upperArmLength: state.upperArmLength,
    forearmLength: state.forearmLength,
    armWidth: state.armWidth,
    upperLegLength: state.upperLegLength,
    lowerLegLength: state.lowerLegLength,
    legWidth: state.legWidth
  };
}

export function resolvePalette(state: BenchState): BomberPalette {
  return state.paletteOverride !== undefined
    ? paletteByName(state.paletteOverride)
    : pickBomberPalette(state.seed);
}

export function buildBomberGeometry(state: BenchState): BufferGeometry {
  // Legacy single-mesh path retained for tests; it sums the segment
  // lengths so the resulting silhouette matches the multi-mesh tree.
  return generateBomberMesh({
    palette: resolvePalette(state),
    headSize: state.headSize,
    torsoHeight: state.torsoHeight,
    torsoWidth: state.torsoWidth,
    armLength: state.upperArmLength + state.forearmLength,
    armWidth: state.armWidth,
    legLength: state.upperLegLength + state.lowerLegLength,
    legWidth: state.legWidth
  });
}

export const PALETTE_OPTIONS: ReadonlyArray<BomberPaletteName> = BOMBER_PALETTES.map((p) => p.name);
