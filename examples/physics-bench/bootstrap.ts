// examples/physics-bench/ — perf-only project, sibling of batch-bench.
// Scene boots camera + ambient + sun + a 24×24 fixed ground plus four
// fixed walls; bootstrap seeds N dynamic primitive bodies floating
// above the floor that fall, collide, and settle.
//
// URL params:
//   ?count=N            number of dynamic bodies (clamped 0..2048, default 200)
//   ?shape=box|sphere|capsule   primitive shape (default mixed across the palette)
//
// Read `__agf.rendererInfo()` for draw-call / bucket counters and
// `__agf.snapshot().entities` to inspect resting positions once the
// stack settles.

import type {
  ProjectBootstrap,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../../engine/core/commands/types";

type Shape = "box" | "sphere" | "capsule" | "mixed";

const DEFAULT_COUNT = 200;
const MAX_COUNT = 2048;
const COLUMNS = 8;
const ROWS = 8;
const SPACING = 1.4;
const DROP_HEIGHT = 6;
const STACK_LAYER_GAP = 1.6;
const PALETTE: ReadonlyArray<string> = ["#ff8c5a", "#ffd76a", "#7bd6a0", "#7aa8ff"];

type Spec = { count: number; shape: Shape };

function resolveSpec(): Spec {
  if (typeof window === "undefined") {
    return { count: DEFAULT_COUNT, shape: "mixed" };
  }
  const params = new URLSearchParams(window.location.search);
  const rawCount = params.get("count");
  const rawShape = params.get("shape");
  let count = DEFAULT_COUNT;
  if (rawCount !== null) {
    const parsed = Number.parseInt(rawCount, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      count = Math.min(parsed, MAX_COUNT);
    }
  }
  let shape: Shape = "mixed";
  if (rawShape === "box" || rawShape === "sphere" || rawShape === "capsule") {
    shape = rawShape;
  }
  return { count, shape };
}

function shapeFor(index: number, requested: Shape): Exclude<Shape, "mixed"> {
  if (requested !== "mixed") return requested;
  const mod = index % 3;
  if (mod === 0) return "box";
  if (mod === 1) return "sphere";
  return "capsule";
}

function colliderFor(shape: Exclude<Shape, "mixed">): Record<string, unknown> {
  if (shape === "box") return { kind: "box", size: [0.5, 0.5, 0.5] };
  if (shape === "sphere") return { kind: "sphere", radius: 0.3 };
  return { kind: "capsule", radius: 0.25, halfHeight: 0.25 };
}

function meshFor(shape: Exclude<Shape, "mixed">): string {
  if (shape === "sphere") return "sphere";
  return "box";
}

function buildSeedCommands(spec: Spec): EngineCommand[] {
  const { count } = spec;
  const commands: EngineCommand[] = [];
  const perLayer = COLUMNS * ROWS;
  const xOffset = ((COLUMNS - 1) * SPACING) / 2;
  const zOffset = ((ROWS - 1) * SPACING) / 2;
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / perLayer);
    const within = i % perLayer;
    const col = within % COLUMNS;
    const row = Math.floor(within / COLUMNS);
    // Slight jitter so bodies don't land in a perfectly aligned grid —
    // produces a more interesting stack and exercises contact resolution.
    const jitterX = ((i * 1664525 + 1013904223) % 100) / 100 - 0.5;
    const jitterZ = ((i * 22695477 + 1) % 100) / 100 - 0.5;
    const id = `bench.body.${i}`;
    const shape = shapeFor(i, spec.shape);
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: {
        position: [
          col * SPACING - xOffset + jitterX * 0.15,
          DROP_HEIGHT + layer * STACK_LAYER_GAP,
          row * SPACING - zOffset + jitterZ * 0.15
        ]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: meshFor(shape), color: PALETTE[i % PALETTE.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Batchable",
      data: { group: `bench-${shape}` }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "RigidBody3D",
      data: { type: "dynamic", mass: 1, canSleep: true }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Collider3D",
      data: { ...colliderFor(shape), friction: 0.7, restitution: 0.1 }
    });
  }
  return commands;
}

export const physicsBenchBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // No project-specific systems. PhysicsSyncSystem is auto-registered
    // by startRuntime because project.physics.enabled === true.
  },
  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    const spec = resolveSpec();
    if (spec.count > 0) {
      runtime.applyCommands(buildSeedCommands(spec));
    }
    return {
      dispose(): void {
        // Seeded entities live in the world; world teardown reclaims them.
      }
    };
  }
};
