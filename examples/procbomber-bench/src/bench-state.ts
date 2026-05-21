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
  // --- 7 size knobs ---
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legLength: number;
  legWidth: number;
  // --- S102 PROCBOMBER-RECIPE-PARAMS-16 ---
  // Posture (radians)
  forwardTilt: number;
  armRestAngle: number;
  // Mount offsets (cell units). Y is along torso vertical (negative = toward bottom),
  // Z is depth (positive = forward). All four default to 0; non-zero values shift
  // the pivot away from the default outer-edge top/bottom anchor.
  shoulderMountY: number;
  shoulderMountZ: number;
  hipMountY: number;
  hipMountZ: number;
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
    armLength: BOMBER_MESH_DEFAULTS.armLength,
    armWidth: BOMBER_MESH_DEFAULTS.armWidth,
    legLength: BOMBER_MESH_DEFAULTS.legLength,
    legWidth: BOMBER_MESH_DEFAULTS.legWidth,
    forwardTilt: 0,
    armRestAngle: 0,
    shoulderMountY: 0,
    shoulderMountZ: 0,
    hipMountY: 0,
    hipMountZ: 0,
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

export function shapesOf(state: BenchState): BomberPartShapes {
  return { head: state.headShape, torso: state.torsoShape, limb: state.limbShape };
}

/** Extract the part-sizes slice from the bench state. */
export function sizesOf(state: BenchState): BomberPartSizes {
  return {
    headSize: state.headSize,
    torsoHeight: state.torsoHeight,
    torsoWidth: state.torsoWidth,
    armLength: state.armLength,
    armWidth: state.armWidth,
    legLength: state.legLength,
    legWidth: state.legWidth
  };
}

export function resolvePalette(state: BenchState): BomberPalette {
  return state.paletteOverride !== undefined
    ? paletteByName(state.paletteOverride)
    : pickBomberPalette(state.seed);
}

export function buildBomberGeometry(state: BenchState): BufferGeometry {
  return generateBomberMesh({
    palette: resolvePalette(state),
    headSize: state.headSize,
    torsoHeight: state.torsoHeight,
    torsoWidth: state.torsoWidth,
    armLength: state.armLength,
    armWidth: state.armWidth,
    legLength: state.legLength,
    legWidth: state.legWidth
  });
}

export const PALETTE_OPTIONS: ReadonlyArray<BomberPaletteName> = BOMBER_PALETTES.map((p) => p.name);
