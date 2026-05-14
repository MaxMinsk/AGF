// Transform hierarchy resolver.
//
// Given a flat set of entities, each optionally carrying `Transform.parent`,
// compute `{ local, world }` per entity. The world transform is composed by
// walking from the root down so each child sees its parent's world transform
// already resolved.
//
// The math uses 4x4 column-major matrices internally. Input rotations are
// Euler XYZ (radians) — matches Three.js's default. World rotations are
// decomposed back to Euler XYZ. This is correct for the common composition
// cases (cart+wheels, drone+carried, player+camera boom). Pathological
// cases like gimbal lock through extreme parent rotations should fall back
// to quaternion math; not needed for v0.

import type { ComponentName, EntityId } from "../ecs/types";
import type { World } from "../ecs/world";

export type Vec3 = readonly [number, number, number];

export type LocalTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type WorldTransform = LocalTransform;

export type ResolvedTransform = {
  parent: EntityId | undefined;
  local: LocalTransform;
  world: WorldTransform;
};

export type TransformInput = {
  id: EntityId;
  parent?: EntityId;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

const ZERO_VEC: Vec3 = [0, 0, 0];
const ONE_VEC: Vec3 = [1, 1, 1];

/**
 * Resolve a hierarchy from a flat array. Throws on cycles or missing parents
 * — engine check catches both before runtime, so this is a defensive guard
 * for direct callers (tests, future runtime systems).
 */
export function resolveHierarchy(inputs: ReadonlyArray<TransformInput>): Map<EntityId, ResolvedTransform> {
  const byId = new Map<EntityId, TransformInput>();
  for (const entry of inputs) {
    if (byId.has(entry.id)) {
      throw new Error(`resolveHierarchy: duplicate entity id "${entry.id}"`);
    }
    byId.set(entry.id, entry);
  }

  // Topological sort so each child sees its parent already resolved.
  const ordered: TransformInput[] = [];
  const visited = new Set<EntityId>();
  const inStack = new Set<EntityId>();

  const visit = (id: EntityId): void => {
    if (visited.has(id)) return;
    if (inStack.has(id)) {
      throw new Error(`resolveHierarchy: cycle detected at "${id}"`);
    }
    const node = byId.get(id);
    if (node === undefined) {
      throw new Error(`resolveHierarchy: missing entity "${id}"`);
    }
    inStack.add(id);
    if (node.parent !== undefined) {
      if (node.parent === id) {
        throw new Error(`resolveHierarchy: "${id}" lists itself as parent`);
      }
      if (!byId.has(node.parent)) {
        throw new Error(`resolveHierarchy: "${id}" references missing parent "${node.parent}"`);
      }
      visit(node.parent);
    }
    inStack.delete(id);
    visited.add(id);
    ordered.push(node);
  };

  for (const input of inputs) {
    visit(input.id);
  }

  const result = new Map<EntityId, ResolvedTransform>();
  for (const node of ordered) {
    const local: LocalTransform = {
      position: node.position ?? ZERO_VEC,
      rotation: node.rotation ?? ZERO_VEC,
      scale: node.scale ?? ONE_VEC
    };
    let world: WorldTransform = local;
    if (node.parent !== undefined) {
      const parentResolved = result.get(node.parent);
      if (parentResolved === undefined) {
        throw new Error(
          `resolveHierarchy: parent "${node.parent}" of "${node.id}" not resolved yet — topo order is broken`
        );
      }
      world = composeWorld(parentResolved.world, local);
    }
    result.set(node.id, {
      parent: node.parent,
      local,
      world
    });
  }

  return result;
}

/** Pull every entity's `Transform` from the ECS world and resolve. */
export function resolveWorldHierarchy(world: World): Map<EntityId, ResolvedTransform> {
  const inputs: TransformInput[] = [];
  const transformName: ComponentName = "Transform";
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, transformName)) {
      continue;
    }
    const t = world.getComponent<{
      position?: Vec3;
      rotation?: Vec3;
      scale?: Vec3;
      parent?: EntityId;
    }>(id, transformName);
    if (t === undefined) continue;
    const entry: TransformInput = { id };
    if (t.parent !== undefined) entry.parent = t.parent;
    if (t.position !== undefined) entry.position = t.position;
    if (t.rotation !== undefined) entry.rotation = t.rotation;
    if (t.scale !== undefined) entry.scale = t.scale;
    inputs.push(entry);
  }
  return resolveHierarchy(inputs);
}

/**
 * Compose a child's local transform with its parent's already-resolved world
 * transform. Exposed for the M16-cache partial-walk path so we can avoid
 * calling the full `resolveHierarchy` when only a subset of subtrees are
 * dirty. The math here is the same as the inline path inside
 * `resolveHierarchy`; keep them in sync if either changes.
 */
export function composeWorld(parentWorld: WorldTransform, local: LocalTransform): WorldTransform {
  const parentMat = composeMatrix(parentWorld);
  const localMat = composeMatrix(local);
  const combined = multiplyMatrix(parentMat, localMat);
  return decomposeMatrix(combined);
}

// ---- 4x4 column-major matrix helpers ----

type Matrix = Float64Array;

function composeMatrix(t: LocalTransform): Matrix {
  const [tx, ty, tz] = t.position;
  const [rx, ry, rz] = t.rotation;
  const [sx, sy, sz] = t.scale;
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);

  // XYZ Euler: R = Rx * Ry * Rz
  const r00 = cy * cz;
  const r01 = -cy * szr;
  const r02 = syr;
  const r10 = cx * szr + sxr * syr * cz;
  const r11 = cx * cz - sxr * syr * szr;
  const r12 = -sxr * cy;
  const r20 = sxr * szr - cx * syr * cz;
  const r21 = sxr * cz + cx * syr * szr;
  const r22 = cx * cy;

  const m = new Float64Array(16);
  // column-major
  m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx; m[3] = 0;
  m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy; m[7] = 0;
  m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz; m[11] = 0;
  m[12] = tx; m[13] = ty; m[14] = tz; m[15] = 1;
  return m;
}

function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let v = 0;
      for (let k = 0; k < 4; k += 1) {
        v += (a[row + k * 4] as number) * (b[k + col * 4] as number);
      }
      out[row + col * 4] = v;
    }
  }
  return out;
}

function decomposeMatrix(m: Matrix): WorldTransform {
  const tx = m[12] as number, ty = m[13] as number, tz = m[14] as number;
  // Scale = lengths of the basis vectors.
  const sx = Math.hypot(m[0] as number, m[1] as number, m[2] as number);
  const sy = Math.hypot(m[4] as number, m[5] as number, m[6] as number);
  const sz = Math.hypot(m[8] as number, m[9] as number, m[10] as number);

  // Normalised rotation matrix.
  const r00 = (m[0] as number) / sx;
  const r10 = (m[1] as number) / sx;
  const r20 = (m[2] as number) / sx;
  const r01 = (m[4] as number) / sy;
  const r11 = (m[5] as number) / sy;
  const r21 = (m[6] as number) / sy;
  const r02 = (m[8] as number) / sz;
  const r12 = (m[9] as number) / sz;
  const r22 = (m[10] as number) / sz;

  // XYZ Euler recovery — matches the same convention as composeMatrix.
  let rx: number;
  let ry: number;
  let rz: number;
  ry = Math.asin(clamp(r02, -1, 1));
  if (Math.abs(r02) < 1 - 1e-7) {
    rx = Math.atan2(-r12, r22);
    rz = Math.atan2(-r01, r00);
  } else {
    rx = Math.atan2(r21, r11);
    rz = 0;
  }

  return {
    position: [tx, ty, tz],
    rotation: [rx, ry, rz],
    scale: [sx, sy, sz]
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
