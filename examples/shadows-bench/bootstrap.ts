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
    const rawX = Math.cos(angle) * radius;
    const rawZ = Math.sin(angle) * radius;
    const [x, z] = clearRoadCorridor(rawX, rawZ);
    const trunkH = 0.8 + rand() * 0.8;
    const canopyR = 0.7 + rand() * 0.7;
    const swayAmp = 1.8 + rand() * 1.5; // degrees
    const swayDur = 2.6 + rand() * 2.0; // seconds per cycle

    // S47 → S48 — restructure as a parented hierarchy so the canopy
    // sways together with the trunk. Root sits at the ground with no
    // mesh; rotation tween on the root pivots both children from the
    // base. The previous flat layout left the canopy stationary even
    // though the trunk was tilting.
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { position: [x, 0, z] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
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
          // Stagger phase so the forest doesn't sway in lockstep.
          elapsed: (i * 0.137) % swayDur
        }
      ]
    });

    const trunkId = `${id}.trunk`;
    commands.push({ kind: "entity.create", entityId: trunkId });
    commands.push({
      kind: "component.set",
      entityId: trunkId,
      component: "Transform",
      data: {
        parent: id,
        position: [0, trunkH / 2, 0],
        scale: [0.2, trunkH, 0.2]
      }
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

    // Canopy y offset: AGF's `sphere` primitive is SphereGeometry(0.5)
    // (radius 0.5 not 1). At scale = canopyR the actual radius = 0.5 *
    // canopyR. Center at trunkH + 0.5*canopyR seats the canopy bottom
    // flush with the trunk top; trunkH + 0.4*canopyR sinks it by a few %
    // so the join looks natural.
    const canopyId = `${id}.canopy`;
    commands.push({ kind: "entity.create", entityId: canopyId });
    commands.push({
      kind: "component.set",
      entityId: canopyId,
      component: "Transform",
      data: {
        parent: id,
        position: [0, trunkH + canopyR * 0.4, 0],
        scale: [canopyR, canopyR, canopyR]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: canopyId,
      component: "MeshRenderer",
      data: { mesh: "sphere", color: PALETTE_TREES[i % PALETTE_TREES.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: canopyId,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
  }

  // Roads — two long thin boxes laid along the two main street axes
  // (EW street at z=0, NS street at x=0). Ground top sits at y=0
  // (Transform.position.y = -0.25 with scale.y = 0.5), so roads need
  // to sit at y ≈ 0.01 — slightly above ground — to avoid z-fighting +
  // looking like they're sunk underground. Widened to ~4 m so the 3
  // lanes per direction below have room.
  const roadDefs: ReadonlyArray<{ id: string; pos: [number, number, number]; scale: [number, number, number] }> = [
    { id: "road.ew", pos: [0, 0.011, 0], scale: [88, 0.02, 4.0] },
    { id: "road.ns", pos: [0, 0.011, 0], scale: [4.0, 0.02, 88] }
  ];
  for (const road of roadDefs) {
    commands.push({ kind: "entity.create", entityId: road.id });
    commands.push({
      kind: "component.set",
      entityId: road.id,
      component: "Transform",
      data: { position: road.pos, scale: road.scale }
    });
    commands.push({
      kind: "component.set",
      entityId: road.id,
      component: "MeshRenderer",
      data: { mesh: "box", color: "#2f3135" }
    });
    commands.push({
      kind: "component.set",
      entityId: road.id,
      component: "ShadowFlags",
      data: { cast: false, receive: true }
    });
  }

  // Cars — small vehicles that ping-pong along the streets. Each car is
  // a parent entity (WaypointMover + Transform) with child body / cabin /
  // wheels parts so the car can have proper shape + a subtle roll wobble
  // on the body without fighting WaypointMover for the root rotation.
  //
  // Three.js convention: local -Z = forward. `faceForward: true` writes
  // yaw so local -Z lines up with the velocity vector — bodies must be
  // scaled with length along Z (`[width, height, length]`) regardless
  // of which world axis the street runs along.
  const carPalette: ReadonlyArray<{ body: string; cabin: string }> = [
    { body: "#d44a4a", cabin: "#7e2424" },
    { body: "#3a8fdb", cabin: "#1f5582" },
    { body: "#e7c44b", cabin: "#a87f1d" },
    { body: "#7adf6a", cabin: "#3f8534" },
    { body: "#b46cd6", cabin: "#6c3a86" },
    { body: "#ec7a30", cabin: "#8c421a" }
  ];
  // 6 cars, 3 per street, each on its own lane (≈ 1.1 m apart) so
  // ping-pong traffic never collides. Roads are 4.0 m wide; lanes at
  // ±1.2 and ±0.0 leave clearance on the shoulders.
  const carConfigs: ReadonlyArray<{
    axis: "x" | "z";
    lane: number;
    speed: number;
    startPhase: number;
  }> = [
    { axis: "x", lane: -1.2, speed: 7.5, startPhase: 0 },
    { axis: "x", lane: 0.0, speed: 6.0, startPhase: 0.5 },
    { axis: "x", lane: 1.2, speed: 5.0, startPhase: 0.25 },
    { axis: "z", lane: -1.2, speed: 7.0, startPhase: 0 },
    { axis: "z", lane: 0.0, speed: 5.5, startPhase: 0.3 },
    { axis: "z", lane: 1.2, speed: 8.0, startPhase: 0.7 }
  ];
  const ROAD_HALF_LENGTH = 40;
  const CAR_LENGTH = 2.6;
  const CAR_WIDTH = 1.2;
  const CAR_BODY_HEIGHT = 0.55;
  const CAR_CABIN_HEIGHT = 0.45;
  const WHEEL_RADIUS = 0.28;
  for (let i = 0; i < carConfigs.length; i += 1) {
    const cfg = carConfigs[i]!;
    const id = `car.${i}`;
    const palette = carPalette[i % carPalette.length]!;
    const distance = ROAD_HALF_LENGTH * 2;
    const duration = distance / cfg.speed;
    const a: [number, number, number] =
      cfg.axis === "x" ? [-ROAD_HALF_LENGTH, 0, cfg.lane] : [cfg.lane, 0, -ROAD_HALF_LENGTH];
    const b: [number, number, number] =
      cfg.axis === "x" ? [ROAD_HALF_LENGTH, 0, cfg.lane] : [cfg.lane, 0, ROAD_HALF_LENGTH];

    // Root: WaypointMover-driven position + yaw. No mesh.
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { position: a }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "WaypointMover",
      data: {
        waypoints: [
          { position: a, duration: 0.01 },
          { position: b, duration },
          { position: a, duration }
        ],
        loop: true,
        elapsed: cfg.startPhase * duration * 2,
        faceForward: true
      }
    });

    // Body (chassis) — main coloured block. Local -Z = forward.
    const bodyId = `${id}.body`;
    const bodyY = WHEEL_RADIUS + CAR_BODY_HEIGHT / 2;
    commands.push({ kind: "entity.create", entityId: bodyId });
    commands.push({
      kind: "component.set",
      entityId: bodyId,
      component: "Transform",
      data: {
        parent: id,
        position: [0, bodyY, 0],
        scale: [CAR_WIDTH, CAR_BODY_HEIGHT, CAR_LENGTH]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: bodyId,
      component: "MeshRenderer",
      data: { mesh: "box", color: palette.body }
    });
    commands.push({
      kind: "component.set",
      entityId: bodyId,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });
    // Subtle lateral roll wobble (~0.6° each way). Stagger the phase per
    // car so the fleet doesn't wobble in lockstep.
    commands.push({
      kind: "component.set",
      entityId: bodyId,
      component: "Tweens",
      data: [
        {
          component: "Transform",
          property: "rotation",
          from: [0, 0, -0.6],
          to: [0, 0, 0.6],
          duration: 1.8 + (i * 0.13) % 0.7,
          ease: "pulse",
          loop: "loop",
          elapsed: (i * 0.31) % 1.5
        }
      ]
    });

    // Cabin — smaller box sitting on the back half of the body.
    const cabinId = `${id}.cabin`;
    const cabinY = WHEEL_RADIUS + CAR_BODY_HEIGHT + CAR_CABIN_HEIGHT / 2;
    commands.push({ kind: "entity.create", entityId: cabinId });
    commands.push({
      kind: "component.set",
      entityId: cabinId,
      component: "Transform",
      data: {
        parent: id,
        position: [0, cabinY, CAR_LENGTH * 0.12],
        scale: [CAR_WIDTH * 0.88, CAR_CABIN_HEIGHT, CAR_LENGTH * 0.55]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: cabinId,
      component: "MeshRenderer",
      data: { mesh: "box", color: palette.cabin }
    });
    commands.push({
      kind: "component.set",
      entityId: cabinId,
      component: "ShadowFlags",
      data: { cast: true, receive: true }
    });

    // 4 wheels — spheres at the corners of the chassis. Local axes:
    // +X = right, +Z = backward (three -Z forward convention).
    const wheelOffsets: ReadonlyArray<{ tag: string; x: number; z: number }> = [
      { tag: "fl", x: -CAR_WIDTH / 2, z: -CAR_LENGTH * 0.35 },
      { tag: "fr", x: CAR_WIDTH / 2, z: -CAR_LENGTH * 0.35 },
      { tag: "bl", x: -CAR_WIDTH / 2, z: CAR_LENGTH * 0.35 },
      { tag: "br", x: CAR_WIDTH / 2, z: CAR_LENGTH * 0.35 }
    ];
    for (const wheel of wheelOffsets) {
      const wheelId = `${id}.wheel.${wheel.tag}`;
      commands.push({ kind: "entity.create", entityId: wheelId });
      commands.push({
        kind: "component.set",
        entityId: wheelId,
        component: "Transform",
        data: {
          parent: id,
          position: [wheel.x, WHEEL_RADIUS, wheel.z],
          scale: [WHEEL_RADIUS * 2, WHEEL_RADIUS * 2, WHEEL_RADIUS * 2]
        }
      });
      commands.push({
        kind: "component.set",
        entityId: wheelId,
        component: "MeshRenderer",
        data: { mesh: "sphere", color: "#1c1c1f" }
      });
      commands.push({
        kind: "component.set",
        entityId: wheelId,
        component: "ShadowFlags",
        data: { cast: true, receive: true }
      });
    }
  }

  // Rocks — squashed spheres of varied size at the field edges.
  for (let i = 0; i < spec.rocks; i++) {
    const id = `rock.${i}`;
    const angle = rand() * Math.PI * 2;
    const radius = 8 + rand() * 30;
    const rawX = Math.cos(angle) * radius;
    const rawZ = Math.sin(angle) * radius;
    const [x, z] = clearRoadCorridor(rawX, rawZ);
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

/**
 * Roads run along x=0 and z=0, each 4 m wide. Trees + rocks must not
 * spawn on top of them — shift their positions away from the nearest
 * road centreline so the props sit just off the kerb instead of in the
 * middle of traffic.
 */
function clearRoadCorridor(x: number, z: number): [number, number] {
  const HALF_ROAD = 2.5; // road half-width + small buffer
  let ax = x;
  let az = z;
  if (Math.abs(az) < HALF_ROAD) az = (az === 0 ? 1 : Math.sign(az)) * HALF_ROAD;
  if (Math.abs(ax) < HALF_ROAD) ax = (ax === 0 ? 1 : Math.sign(ax)) * HALF_ROAD;
  return [ax, az];
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
