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
const GROUND_TOP_Y = -0.75; // ground plinth at y=-0.8, scale.y=0.1 → top = -0.75

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
