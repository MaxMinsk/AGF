// S102 PROCBOMBER-MESH-TREE-V0 — spawner that builds the 9-pivot +
// 10-mesh ECS tree under a given root entity.

import { describe, expect, it } from "vitest";

import type { EngineCommand } from "../../../../engine/core/commands/types";
import { buildPivotRepositionCommands, spawnBomberTree } from "../../src/bomber-tree-spawner";
import { BOMBER_MESH_DEFAULTS } from "../../src/generators/bomber-mesh";
import { LIMB_PIVOT_NAMES } from "../../src/limb-pivots";

const SIZES = {
  headSize: BOMBER_MESH_DEFAULTS.headSize,
  torsoHeight: BOMBER_MESH_DEFAULTS.torsoHeight,
  torsoWidth: BOMBER_MESH_DEFAULTS.torsoWidth,
  armLength: BOMBER_MESH_DEFAULTS.armLength,
  armWidth: BOMBER_MESH_DEFAULTS.armWidth,
  legLength: BOMBER_MESH_DEFAULTS.legLength,
  legWidth: BOMBER_MESH_DEFAULTS.legWidth
};

function spawn(rootId = "bomber") {
  const captured: EngineCommand[] = [];
  const result = spawnBomberTree((cmds) => captured.push(...cmds), { rootId, sizes: SIZES });
  return { result, commands: captured };
}

describe("spawnBomberTree structure (S102)", () => {
  it("creates exactly 10 mesh entities + 9 pivot entities = 19 children", () => {
    const { result } = spawn();
    expect(result.meshEntities).toHaveLength(10);
    expect(result.pivotEntities).toHaveLength(9);
  });

  it("mesh entity names cover torso/head/upperArmL+R/forearmL+R/upperLegL+R/lowerLegL+R", () => {
    const { result } = spawn();
    const ids = result.meshEntities.map((m) => m.id).sort();
    expect(ids).toEqual(
      [
        "bomber.forearmL", "bomber.forearmR",
        "bomber.head",
        "bomber.lowerLegL", "bomber.lowerLegR",
        "bomber.torso",
        "bomber.upperArmL", "bomber.upperArmR",
        "bomber.upperLegL", "bomber.upperLegR"
      ].sort()
    );
  });

  it("each mesh entity points at the right per-part procedural ref", () => {
    const { result } = spawn();
    const byId = new Map(result.meshEntities.map((m) => [m.id, m.partName]));
    expect(byId.get("bomber.torso")).toBe("torso");
    expect(byId.get("bomber.head")).toBe("head");
    expect(byId.get("bomber.upperArmL")).toBe("upperArm");
    expect(byId.get("bomber.forearmR")).toBe("forearm");
    expect(byId.get("bomber.lowerLegL")).toBe("lowerLeg");
  });

  it("pivot entity names cover neck + shoulder.l/r + elbow.l/r + hip.l/r + knee.l/r", () => {
    const { result } = spawn();
    const ids = [...result.pivotEntities].sort();
    expect(ids).toEqual(
      [
        "bomber.elbowL", "bomber.elbowR",
        "bomber.hipL", "bomber.hipR",
        "bomber.kneeL", "bomber.kneeR",
        "bomber.neck",
        "bomber.shoulderL", "bomber.shoulderR"
      ].sort()
    );
  });
});

describe("spawnBomberTree command shape (S102)", () => {
  it("emits entity.create + component.set commands", () => {
    const { commands } = spawn();
    const kinds = new Set(commands.map((c) => c.kind));
    expect(kinds.has("entity.create")).toBe(true);
    expect(kinds.has("component.set")).toBe(true);
  });

  it("each mesh entity gets Transform + MeshRenderer; each pivot gets only Transform", () => {
    const { commands } = spawn();
    const compsByEntity = new Map<string, Set<string>>();
    for (const cmd of commands) {
      if (cmd.kind !== "component.set") continue;
      const set = compsByEntity.get(cmd.entityId) ?? new Set<string>();
      set.add(cmd.component);
      compsByEntity.set(cmd.entityId, set);
    }
    for (const meshId of ["bomber.torso", "bomber.head", "bomber.upperArmL", "bomber.forearmR", "bomber.lowerLegL"]) {
      const s = compsByEntity.get(meshId);
      expect(s).toBeDefined();
      expect(s!.has("Transform")).toBe(true);
      expect(s!.has("MeshRenderer")).toBe(true);
    }
    for (const pivotId of ["bomber.neck", "bomber.shoulderL", "bomber.elbowR", "bomber.hipL", "bomber.kneeR"]) {
      const s = compsByEntity.get(pivotId);
      expect(s).toBeDefined();
      expect(s!.has("Transform")).toBe(true);
      expect(s!.has("MeshRenderer")).toBe(false);
    }
  });

  it("Transform.parent wires the hierarchy correctly", () => {
    const { commands } = spawn();
    const parents = new Map<string, string | undefined>();
    for (const cmd of commands) {
      if (cmd.kind === "component.set" && cmd.component === "Transform") {
        const parent = (cmd.data as { parent?: string }).parent;
        parents.set(cmd.entityId, parent);
      }
    }
    // Top-level children of the root entity.
    expect(parents.get("bomber.torso")).toBe("bomber");
    // Inside the torso.
    expect(parents.get("bomber.neck")).toBe("bomber.torso");
    expect(parents.get("bomber.shoulderL")).toBe("bomber.torso");
    expect(parents.get("bomber.shoulderR")).toBe("bomber.torso");
    expect(parents.get("bomber.hipL")).toBe("bomber.torso");
    // Chained limbs.
    expect(parents.get("bomber.head")).toBe("bomber.neck");
    expect(parents.get("bomber.upperArmL")).toBe("bomber.shoulderL");
    expect(parents.get("bomber.elbowL")).toBe("bomber.upperArmL");
    expect(parents.get("bomber.forearmL")).toBe("bomber.elbowL");
    expect(parents.get("bomber.upperLegL")).toBe("bomber.hipL");
    expect(parents.get("bomber.kneeL")).toBe("bomber.upperLegL");
    expect(parents.get("bomber.lowerLegL")).toBe("bomber.kneeL");
  });

  it("mesh ref uses procedural:procbomber-<part> by default", () => {
    const { commands } = spawn();
    const refByEntity = new Map<string, string>();
    for (const cmd of commands) {
      if (cmd.kind === "component.set" && cmd.component === "MeshRenderer") {
        refByEntity.set(cmd.entityId, (cmd.data as { mesh: string }).mesh);
      }
    }
    expect(refByEntity.get("bomber.torso")).toBe("procedural:procbomber-torso");
    expect(refByEntity.get("bomber.head")).toBe("procedural:procbomber-head");
    expect(refByEntity.get("bomber.upperArmR")).toBe("procedural:procbomber-upperArm");
    expect(refByEntity.get("bomber.lowerLegL")).toBe("procedural:procbomber-lowerLeg");
  });

  it("keyPrefix option namespaces the procedural refs", () => {
    const captured: EngineCommand[] = [];
    spawnBomberTree((cmds) => captured.push(...cmds), {
      rootId: "p1",
      sizes: SIZES,
      keyPrefix: "kaboomBomber"
    });
    for (const cmd of captured) {
      if (cmd.kind === "component.set" && cmd.component === "MeshRenderer") {
        const ref = (cmd.data as { mesh: string }).mesh;
        expect(ref.startsWith("procedural:kaboomBomber-")).toBe(true);
      }
    }
  });
});

describe("buildPivotRepositionCommands mount offsets (S102 RECIPE-PARAMS-16)", () => {
  it("zero offsets reproduce the default pivot positions", () => {
    const baseline = buildPivotRepositionCommands("bomber", SIZES);
    const withZero = buildPivotRepositionCommands("bomber", SIZES, {
      shoulderMountY: 0,
      shoulderMountZ: 0,
      hipMountY: 0,
      hipMountZ: 0
    });
    expect(JSON.stringify(withZero)).toEqual(JSON.stringify(baseline));
  });

  it("positive shoulderMountY shifts shoulderL/R Y upward; positive shoulderMountZ shifts forward", () => {
    const cmds = buildPivotRepositionCommands("bomber", SIZES, {
      shoulderMountY: 0.1,
      shoulderMountZ: 0.05
    });
    const shoulderL = cmds.find(
      (c) => c.kind === "component.set" && c.entityId === "bomber.shoulderL"
    );
    const pos = (shoulderL as { data: { position: ReadonlyArray<number> } }).data.position;
    // Baseline shoulderY = torsoTopY - armWidth/2.
    const baseY = SIZES.torsoHeight / 2 - SIZES.armWidth / 2;
    expect(pos[1]).toBeCloseTo(baseY + 0.1, 5);
    expect(pos[2]).toBeCloseTo(0.05, 5);
  });

  it("hipMountY + hipMountZ adjust hipL/R analogously", () => {
    const cmds = buildPivotRepositionCommands("bomber", SIZES, {
      hipMountY: -0.05,
      hipMountZ: -0.03
    });
    const hipR = cmds.find(
      (c) => c.kind === "component.set" && c.entityId === "bomber.hipR"
    );
    const pos = (hipR as { data: { position: ReadonlyArray<number> } }).data.position;
    const baseY = -SIZES.torsoHeight / 2 + SIZES.legWidth / 2;
    expect(pos[1]).toBeCloseTo(baseY - 0.05, 5);
    expect(pos[2]).toBeCloseTo(-0.03, 5);
  });
});

describe("spawnBomberTree.limbPivots result (S102)", () => {
  it("returns LimbPivots with every name resolved to the matching entity id", () => {
    const { result } = spawn();
    for (const n of LIMB_PIVOT_NAMES) {
      expect(result.limbPivots[n]).toBe(`bomber.${n}`);
    }
  });

  it("writes the LimbPivots component on the root entity (as a component.set command)", () => {
    const { commands } = spawn();
    const limbPivotsCmd = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "bomber" && c.component === "LimbPivots"
    );
    expect(limbPivotsCmd).toBeDefined();
  });
});
