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
import type { BomberPartSizes } from "./generators/bomber-parts";
import {
  BOMBER_PALETTES,
  paletteByName,
  pickBomberPalette,
  type BomberPaletteName,
  type BomberPalette
} from "./generators/bomber-palette";

export type BenchState = {
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legLength: number;
  legWidth: number;
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
    paletteOverride: initialPalette,
    seed: "default"
  };
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
