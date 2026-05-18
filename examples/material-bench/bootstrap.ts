// examples/material-bench — PBR material showcase. A large chrome sphere
// in the centre with 12 smaller spheres orbiting it on a ring, every sphere
// standing on a short cement cylinder pedestal. The whole group is parented
// to `spheres.root` which carries a `Spin` component, so the ring slowly
// rotates around the Y axis once the runtime ticks.
//
// Each outer sphere uses a different material manifest under
// `assets/runtime/materials/` so an agent can compare PBR parameters
// side-by-side: rough/glossy plastic, brushed steel + polished gold,
// clearcoat car paint, transmissive glass + ice, sheen velvet,
// iridescent dark, textured hardwood + brick + copper.

import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../../engine/core/commands/types";

// Outer ring material refs (paths relative to the project's assetRoot).
// Slot 0 is angle 0 rad, then counter-clockwise.
const MATERIAL_DIR = "runtime/materials";
const CENTRE_MATERIAL = `${MATERIAL_DIR}/m0-chrome.material.json`;
const CEMENT_MATERIAL = `${MATERIAL_DIR}/cement.material.json`;
const STONE_MATERIAL = `${MATERIAL_DIR}/stone.material.json`;
const OUTER_MATERIALS: ReadonlyArray<string> = [
  `${MATERIAL_DIR}/m1-plastic-rough.material.json`,
  `${MATERIAL_DIR}/m2-plastic-glossy.material.json`,
  `${MATERIAL_DIR}/m3-steel-brushed.material.json`,
  `${MATERIAL_DIR}/m4-gold-polished.material.json`,
  `${MATERIAL_DIR}/m5-car-paint.material.json`,
  `${MATERIAL_DIR}/m6-glass.material.json`,
  `${MATERIAL_DIR}/m7-velvet.material.json`,
  `${MATERIAL_DIR}/m8-iridescent.material.json`,
  `${MATERIAL_DIR}/m9-hardwood.material.json`,
  `${MATERIAL_DIR}/m10-brick.material.json`,
  `${MATERIAL_DIR}/m11-ice.material.json`,
  `${MATERIAL_DIR}/m12-copper.material.json`
];

const RING_RADIUS = 4.0;
const GROUND_TOP_Y = -0.75; // grounded skybox y; pedestals + columns rest on this line.

// Stonehenge perimeter. Tall stone columns at a distance, evenly spaced
// in a ring around the orbit so the centre chrome sphere's reflection
// probe has something interesting to capture.
const STONE_RING_RADIUS = 11.0;
const STONE_COLUMN_COUNT = 12;
const STONE_HEIGHT = 4.0;
const STONE_RADIUS = 0.55;

// Two extra reflection probes flanking the centre on the camera axis:
// one toward the camera (visible in outer spheres on the camera side
// of the ring), one behind (visible in outer spheres on the far side).
// Camera sits at (0, 1.4, 8.5); the front probe goes ~5 units in front
// of the centre sphere, the back one symmetric behind.
const SIDE_PROBE_OFFSET_Z = 5.0;
const SIDE_PROBE_Y = 1.0;

// Centre column dimensions
const CENTRE_PEDESTAL_HEIGHT = 0.6;
const CENTRE_PEDESTAL_SCALE_XZ = 2.0; // radius 1.0
const CENTRE_SPHERE_SCALE = 2.0; // sphere primitive radius 0.5 × scale 2 = radius 1.0

// Outer column dimensions
const OUTER_PEDESTAL_HEIGHT = 0.35;
const OUTER_PEDESTAL_SCALE_XZ = 1.1; // radius 0.55
const OUTER_SPHERE_SCALE = 1.0; // radius 0.5

const ROOT = "spheres.root";

function setComponent(
  commands: EngineCommand[],
  entityId: string,
  component: string,
  data: unknown
): void {
  commands.push({ kind: "component.set", entityId, component, data: data as never });
}

function buildSeedCommands(): EngineCommand[] {
  const commands: EngineCommand[] = [];

  // Centre pedestal — cement cylinder under the chrome sphere.
  const centrePedestalId = "pedestal.centre";
  const centrePedestalY = GROUND_TOP_Y + CENTRE_PEDESTAL_HEIGHT / 2;
  commands.push({ kind: "entity.create", entityId: centrePedestalId });
  setComponent(commands, centrePedestalId, "Transform", {
    parent: ROOT,
    position: [0, centrePedestalY, 0],
    scale: [CENTRE_PEDESTAL_SCALE_XZ, CENTRE_PEDESTAL_HEIGHT, CENTRE_PEDESTAL_SCALE_XZ]
  });
  setComponent(commands, centrePedestalId, "MeshRenderer", {
    mesh: "cylinder",
    material: CEMENT_MATERIAL
  });
  setComponent(commands, centrePedestalId, "ShadowFlags", { cast: true, receive: true });

  // Centre sphere — chrome. Sphere primitive has radius 0.5 at scale 1, so at
  // scale 2 the sphere has radius 1.0 and sits on the pedestal top
  // (GROUND_TOP_Y + CENTRE_PEDESTAL_HEIGHT) plus the sphere radius.
  const centreSphereId = "sphere.centre";
  const centrePedestalTop = GROUND_TOP_Y + CENTRE_PEDESTAL_HEIGHT;
  const centreSphereY = centrePedestalTop + (0.5 * CENTRE_SPHERE_SCALE);
  commands.push({ kind: "entity.create", entityId: centreSphereId });
  setComponent(commands, centreSphereId, "Transform", {
    parent: ROOT,
    position: [0, centreSphereY, 0],
    scale: [CENTRE_SPHERE_SCALE, CENTRE_SPHERE_SCALE, CENTRE_SPHERE_SCALE]
  });
  setComponent(commands, centreSphereId, "MeshRenderer", {
    mesh: "sphere",
    material: CENTRE_MATERIAL
  });
  setComponent(commands, centreSphereId, "ShadowFlags", { cast: true, receive: true });
  // S57 REFLECTION-cube-probe + S59 REFLECTION-prefilter: the centre
  // chrome sphere both hosts the probe and reads its own reflection
  // (cube camera at the sphere's position, sphere itself auto-excluded).
  // Pedestals + outer spheres stay visible in the cube so the chrome
  // reflects the whole arrangement. `prefilter: "pmrem"` runs the
  // capture through PMREMGenerator after every cubeCam update so the
  // chrome at the v1 roughness (0.35) reads as a plausibly blurry
  // mirror (vs. mip-cube's box-filtered blur).
  setComponent(commands, centreSphereId, "ReflectionProbe", {
    size: 128,
    near: 0.1,
    far: 60,
    updateRate: 15,
    prefilter: "pmrem",
    excludeEntities: [centreSphereId, centrePedestalId]
  });
  setComponent(commands, centreSphereId, "EnvmapBinding", { probe: centreSphereId });

  // Outer ring — 12 sphere + pedestal pairs around a circle of radius
  // RING_RADIUS. Each outer entity is parented to ROOT so they orbit when
  // ROOT spins.
  const outerPedestalY = GROUND_TOP_Y + OUTER_PEDESTAL_HEIGHT / 2;
  const outerPedestalTop = GROUND_TOP_Y + OUTER_PEDESTAL_HEIGHT;
  const outerSphereY = outerPedestalTop + (0.5 * OUTER_SPHERE_SCALE);

  for (let i = 0; i < OUTER_MATERIALS.length; i += 1) {
    const material = OUTER_MATERIALS[i]!;
    const angle = (i / OUTER_MATERIALS.length) * Math.PI * 2;
    const x = Math.cos(angle) * RING_RADIUS;
    const z = Math.sin(angle) * RING_RADIUS;
    const slot = String(i + 1).padStart(2, "0");

    const pedestalId = `pedestal.${slot}`;
    commands.push({ kind: "entity.create", entityId: pedestalId });
    setComponent(commands, pedestalId, "Transform", {
      parent: ROOT,
      position: [x, outerPedestalY, z],
      scale: [OUTER_PEDESTAL_SCALE_XZ, OUTER_PEDESTAL_HEIGHT, OUTER_PEDESTAL_SCALE_XZ]
    });
    setComponent(commands, pedestalId, "MeshRenderer", {
      mesh: "cylinder",
      material: CEMENT_MATERIAL
    });
    setComponent(commands, pedestalId, "ShadowFlags", { cast: true, receive: true });

    const sphereId = `sphere.${slot}`;
    commands.push({ kind: "entity.create", entityId: sphereId });
    setComponent(commands, sphereId, "Transform", {
      parent: ROOT,
      position: [x, outerSphereY, z],
      scale: [OUTER_SPHERE_SCALE, OUTER_SPHERE_SCALE, OUTER_SPHERE_SCALE]
    });
    setComponent(commands, sphereId, "MeshRenderer", {
      mesh: "sphere",
      material
    });
    setComponent(commands, sphereId, "ShadowFlags", { cast: true, receive: true });
    // Reflection routing by INITIAL angle around the orbit ring. Front
    // half (camera-side, sin(angle) > 0) reads probe.front; back half
    // reads probe.back. Bindings are static, so as the orbit spins each
    // sphere keeps its probe — visible reflection difference between
    // sphere groups regardless of where they happen to be at the
    // moment.
    const probeRef = Math.sin(angle) >= 0 ? "probe.front" : "probe.back";
    setComponent(commands, sphereId, "EnvmapBinding", {
      probe: probeRef,
      intensity: 0.85
    });
  }

  const sideProbes: Array<{ id: string; pos: [number, number, number] }> = [
    { id: "probe.front", pos: [0, SIDE_PROBE_Y, SIDE_PROBE_OFFSET_Z] },
    { id: "probe.back", pos: [0, SIDE_PROBE_Y, -SIDE_PROBE_OFFSET_Z] }
  ];
  for (const probe of sideProbes) {
    commands.push({ kind: "entity.create", entityId: probe.id });
    setComponent(commands, probe.id, "Transform", { position: probe.pos });
    setComponent(commands, probe.id, "ReflectionProbe", {
      size: 128,
      near: 0.1,
      far: 60,
      updateRate: 15,
      excludeEntities: [probe.id]
    });
  }

  // Stonehenge perimeter — STATIC entities at the world root (NOT
  // children of `spheres.root`), so they don't orbit. Tall cement
  // cylinders evenly spaced around the orbit give the centre chrome
  // sphere's reflection probe something to capture besides the sky.
  const stoneY = GROUND_TOP_Y + STONE_HEIGHT / 2;
  for (let i = 0; i < STONE_COLUMN_COUNT; i += 1) {
    const angle = (i / STONE_COLUMN_COUNT) * Math.PI * 2 + Math.PI / STONE_COLUMN_COUNT;
    const x = Math.cos(angle) * STONE_RING_RADIUS;
    const z = Math.sin(angle) * STONE_RING_RADIUS;
    const slot = String(i + 1).padStart(2, "0");
    const stoneId = `stone.${slot}`;
    commands.push({ kind: "entity.create", entityId: stoneId });
    setComponent(commands, stoneId, "Transform", {
      position: [x, stoneY, z],
      scale: [STONE_RADIUS * 2, STONE_HEIGHT, STONE_RADIUS * 2]
    });
    setComponent(commands, stoneId, "MeshRenderer", {
      mesh: "cylinder",
      material: STONE_MATERIAL
    });
    setComponent(commands, stoneId, "ShadowFlags", { cast: true, receive: true });
  }

  return commands;
}

export const materialBenchBootstrap: ProjectBootstrap = {
  registerSystems(_context: ProjectBootstrapContext): void {
    // No project-specific systems — the engine's built-in Spin system
    // drives `spheres.root` rotation each fixed tick.
  },
  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    runtime.applyCommands(buildSeedCommands());
    return {
      dispose(): void {
        // Procedural entities live in the world; world teardown reclaims them.
      }
    };
  }
};
