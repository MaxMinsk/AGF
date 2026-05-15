// examples/shadows-bench — strategy-style showcase for M21-shadow-csm.
// Procedural "village" scattered across a large field so cascade
// shadow maps have something interesting to cover at any camera
// distance: WASD pans, mouse wheel (or Q/E) zooms.

import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../../engine/core/commands/types";
import { createRtsCameraSystem } from "./src/systems/rts-camera-system";
import { mountShadowTuner, type ShadowTunerDefaults } from "./src/ui/shadow-tuner";

const SHADOW_DEFAULTS: ShadowTunerDefaults = {
  cascades: 3,
  maxFar: 120,
  shadowMapSize: 1024,
  shadowBias: -0.000005,
  shadowNormalBias: 0.12,
  lightIntensity: 1.55,
  lightDirection: [-0.45, -1, -0.35],
  mode: "practical",
  algorithm: "pcss"
};

const PALETTE_BUILDINGS: ReadonlyArray<string> = [
  "#c7b893",
  "#a89373",
  "#8a7656",
  "#cdb079",
  "#9d8862"
];
const PALETTE_ROOFS: ReadonlyArray<string> = ["#7a3b2e", "#5a2a20", "#a85440"];
const PALETTE_TREES: ReadonlyArray<string> = ["#3a6b3c", "#4f7a4a", "#2f5530"];
const PALETTE_ROCKS: ReadonlyArray<string> = ["#7d7972", "#8e8a82", "#6a665f"];

// Deterministic pseudo-random — no Math.random so replays stay stable.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

type SeedSpec = {
  buildings: number;
  trees: number;
  rocks: number;
};

const DEFAULT_SEED: SeedSpec = { buildings: 28, trees: 80, rocks: 50 };

function resolveSeed(): SeedSpec {
  if (typeof window === "undefined") return DEFAULT_SEED;
  const params = new URLSearchParams(window.location.search);
  const b = Number.parseInt(params.get("buildings") ?? "", 10);
  const t = Number.parseInt(params.get("trees") ?? "", 10);
  const r = Number.parseInt(params.get("rocks") ?? "", 10);
  return {
    buildings: Number.isFinite(b) && b >= 0 ? Math.min(b, 200) : DEFAULT_SEED.buildings,
    trees: Number.isFinite(t) && t >= 0 ? Math.min(t, 600) : DEFAULT_SEED.trees,
    rocks: Number.isFinite(r) && r >= 0 ? Math.min(r, 400) : DEFAULT_SEED.rocks
  };
}

function buildSeedCommands(spec: SeedSpec): EngineCommand[] {
  const commands: EngineCommand[] = [];
  const rand = lcg(0xcafef00d);

  // Buildings — varied-height boxes arranged loosely along two crossing
  // streets, with random jitter so the layout doesn't feel grid-locked.
  for (let i = 0; i < spec.buildings; i++) {
    const id = `building.${i}`;
    const street = i % 2 === 0 ? "ns" : "ew";
    const axisOffset = (i - spec.buildings / 2) * 3.5 + (rand() - 0.5) * 1.4;
    const sideOffset = (Math.floor(i / 6) % 4 < 2 ? -1 : 1) * (3 + rand() * 3);
    const x = street === "ns" ? sideOffset : axisOffset;
    const z = street === "ns" ? axisOffset : sideOffset;
    const w = 2 + rand() * 1.5;
    const h = 2 + rand() * 5;
    const d = 2 + rand() * 1.5;
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { position: [x, h / 2, z], scale: [w, h, d] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: "box", color: PALETTE_BUILDINGS[i % PALETTE_BUILDINGS.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });

    // Pitched roof — a smaller offset box on top, slight tilt by scaling Y.
    const roofId = `${id}.roof`;
    commands.push({ kind: "entity.create", entityId: roofId });
    commands.push({
      kind: "component.set",
      entityId: roofId,
      component: "Transform",
      data: { position: [x, h + 0.35, z], scale: [w + 0.3, 0.7, d + 0.3] }
    });
    commands.push({
      kind: "component.set",
      entityId: roofId,
      component: "MeshRenderer",
      data: { mesh: "box", color: PALETTE_ROOFS[i % PALETTE_ROOFS.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: roofId,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
  }

  // Trees — vertical box trunk + sphere canopy. Scattered uniformly with
  // a deterministic offset so two seeds produce the same layout. Kept
  // away from the central streets so buildings stay legible. Each tree
  // sways gently via a Tween on the trunk's X rotation; the canopy is
  // attached as a child so it follows the trunk's sway.
  //
  // Note on canopy y offset: AGF's `sphere` primitive is a SphereGeometry
  // with radius 0.5 (not 1.0). With scale = canopyR the canopy's actual
  // radius is 0.5 * canopyR. To seat the canopy bottom flush with the
  // trunk top we put the canopy center at `trunkH + 0.5*canopyR - small
  // overlap` so it visually sinks into the trunk by a few %.
  for (let i = 0; i < spec.trees; i++) {
    const id = `tree.${i}`;
    const angle = rand() * Math.PI * 2;
    const radius = 12 + rand() * 26;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const trunkH = 0.8 + rand() * 0.8;
    const canopyR = 0.7 + rand() * 0.7;
    const swayAmp = 1.6 + rand() * 1.2; // degrees
    const swayDur = 2.4 + rand() * 1.8; // seconds per cycle
    const trunkId = `${id}.trunk`;
    commands.push({ kind: "entity.create", entityId: trunkId });
    commands.push({
      kind: "component.set",
      entityId: trunkId,
      component: "Transform",
      data: { position: [x, trunkH / 2, z], scale: [0.2, trunkH, 0.2] }
    });
    commands.push({
      kind: "component.set",
      entityId: trunkId,
      component: "MeshRenderer",
      data: { mesh: "box", color: "#5a3a23" }
    });
    commands.push({
      kind: "component.set",
      entityId: trunkId,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
    // S47 — tween trunk rotation around X by a few degrees; `pulse` ease
    // with `loop: "loop"` gives a smooth back-and-forth oscillation.
    commands.push({
      kind: "component.set",
      entityId: trunkId,
      component: "Tweens",
      data: [
        {
          component: "Transform",
          property: "rotation",
          from: [-swayAmp, 0, 0],
          to: [swayAmp, 0, 0],
          duration: swayDur,
          ease: "pulse",
          loop: "loop",
          // Stagger the phase so the forest doesn't sway in lockstep.
          elapsed: (i * 0.137) % swayDur
        }
      ]
    });
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: {
        position: [x, trunkH + canopyR * 0.4, z],
        scale: [canopyR, canopyR, canopyR]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: "sphere", color: PALETTE_TREES[i % PALETTE_TREES.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
  }

  // Rocks — squashed spheres of varied size at the field edges.
  for (let i = 0; i < spec.rocks; i++) {
    const id = `rock.${i}`;
    const angle = rand() * Math.PI * 2;
    const radius = 8 + rand() * 30;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const s = 0.4 + rand() * 0.9;
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { position: [x, s * 0.35, z], scale: [s, s * 0.6, s] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: "sphere", color: PALETTE_ROCKS[i % PALETTE_ROCKS.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
  }

  return commands;
}

export const shadowsBenchBootstrap: ProjectBootstrap = {
  registerSystems(context: ProjectBootstrapContext): void {
    if (!context.scheduler.has("rts-camera")) {
      context.scheduler.register(createRtsCameraSystem());
    }
  },
  attachUi({ runtime, shell }: ProjectUiContext): ProjectUiHandle {
    runtime.applyCommands(buildSeedCommands(resolveSeed()));
    const tuner = mountShadowTuner(shell, runtime, SHADOW_DEFAULTS);
    return {
      dispose(): void {
        tuner.dispose();
        // Procedural entities live in the world; world teardown reclaims them.
      }
    };
  }
};
