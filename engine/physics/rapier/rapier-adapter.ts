// M24-adapter: thin Rapier3D touchpoint. Only this file (and the future
// rapier-systems folder) imports `@dimforge/rapier3d-compat`. Lazy +
// async — `createRapierAdapter()` awaits the WASM init, so callers
// must hold a Promise. The static-build entry never imports this
// directly; `engine/runtime/start.ts` will gate it behind a
// `project.json#physics.enabled` flag at construction time so projects
// without physics pay zero bundle cost.

import type RAPIER_TYPES from "@dimforge/rapier3d-compat";

export type BodyHandle = number;
export type ColliderHandle = number;

export type BodyKind = "fixed" | "dynamic" | "kinematicPosition";

export type BodyAcquireSpec = {
  kind: BodyKind;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  mass?: number;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  lockRotations?: boolean;
  ccd?: boolean;
  canSleep?: boolean;
};

export type ColliderKind =
  | "box"
  | "sphere"
  | "capsule"
  | "cylinder"
  | "trimesh"
  | "heightfield";

export type ColliderAcquireSpec = {
  kind: ColliderKind;
  /** Box-only: full extent on each axis. */
  size?: readonly [number, number, number];
  /** Sphere/capsule/cylinder. */
  radius?: number;
  /** Capsule/cylinder. */
  halfHeight?: number;
  /** Trimesh-only: flat XYZ array; length must be a multiple of 3. */
  vertices?: ReadonlyArray<number>;
  /** Trimesh-only: triangle index array; length must be a multiple of 3. */
  indices?: ReadonlyArray<number>;
  /** Heightfield-only: row count along Z. */
  rows?: number;
  /** Heightfield-only: column count along X. */
  columns?: number;
  /** Heightfield-only: row-major Y samples (length = rows * columns). */
  heights?: ReadonlyArray<number>;
  /** Heightfield-only: world-space scale. Y component scales the height samples. */
  scale?: readonly [number, number, number];
  offset?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  sensor?: boolean;
  friction?: number;
  restitution?: number;
};

export type RapierAdapterInfo = {
  bodies: number;
  colliders: number;
  fixedDt: number;
  /** Number of fixed steps executed across the adapter's lifetime. */
  totalSteps: number;
};

/** M24-sensors: drained per fixed step. handle1/handle2 are AGF ColliderHandle ids; resolve via the registry. */
export type CollisionEvent = {
  kind: "collision" | "intersection";
  handle1: ColliderHandle;
  handle2: ColliderHandle;
  started: boolean;
};

/** M24-character: opaque handle to a Rapier KinematicCharacterController. */
export type CharacterControllerHandle = number;

export type CharacterControllerSpec = {
  /** Skin distance. Rapier's `offset` parameter. Default 0.01. */
  offset?: number;
  /** Max climbable slope in radians. Default ≈ 45°. */
  maxSlope?: number;
  /** Vertical snap distance for stairs / small steps. 0 disables. */
  snapToGround?: number;
  applyImpulsesToDynamicBodies?: boolean;
  characterMass?: number;
};

export type CharacterMoveResult = {
  /** Movement actually applied — may be shorter than the desired vector if the controller hit something. */
  movement: readonly [number, number, number];
  grounded: boolean;
  slidingDownSlope: boolean;
};

export type RapierAdapter = {
  init(): Promise<void>;
  acquireBody(spec: BodyAcquireSpec): BodyHandle;
  releaseBody(handle: BodyHandle): void;
  acquireCollider(body: BodyHandle, spec: ColliderAcquireSpec): ColliderHandle | undefined;
  releaseCollider(handle: ColliderHandle): void;
  setBodyTransform(handle: BodyHandle, position: readonly [number, number, number], rotation?: readonly [number, number, number]): void;
  getBodyTranslation(handle: BodyHandle): readonly [number, number, number] | undefined;
  getBodyRotation(handle: BodyHandle): readonly [number, number, number, number] | undefined;
  /** Advance the world by `dt` seconds. Pass exactly `fixedDt` from the runtime loop. */
  step(dt?: number): void;
  /** Drain queued collision + intersection events from the most recent step. Pass-through map onto our handles. */
  drainEvents(): CollisionEvent[];
  /** M24-character: create a kinematic character controller (one per character). */
  acquireCharacterController(spec?: CharacterControllerSpec): CharacterControllerHandle;
  releaseCharacterController(handle: CharacterControllerHandle): void;
  /** Run the controller's collide-and-slide pass against a kinematic body's collider; returns the resolved movement + grounded flag. */
  computeCharacterMovement(
    controller: CharacterControllerHandle,
    collider: ColliderHandle,
    desired: readonly [number, number, number]
  ): CharacterMoveResult | undefined;
  /** Apply a kinematic translation to a body — used by characters to advance after computeCharacterMovement. */
  setBodyNextKinematicTranslation(handle: BodyHandle, position: readonly [number, number, number]): void;
  setGravity(gravity: readonly [number, number, number]): void;
  /**
   * M24-debug: Rapier's debugRender returns a flat `Float32Array` of
   * line-segment vertices (every 3 floats = one point, every 2
   * consecutive points = one line) plus a matching `Float32Array` of
   * per-vertex RGBA colors. Returns undefined when the world isn't
   * ready yet. The caller is responsible for not retaining the arrays
   * across frames — they back into Rapier's internal buffers.
   */
  getDebugLines(): { vertices: Float32Array; colors: Float32Array } | undefined;
  /**
   * M24-raycast: cast a ray and return the first solid hit, or
   * undefined if nothing was hit within `maxDistance`. The returned
   * `collider` is the adapter's `ColliderHandle` (the registry can
   * map that to an `EntityId`). `point = origin + direction * distance`.
   * `direction` should be normalised; non-unit vectors scale distance
   * accordingly per Rapier's `Ray` semantics.
   */
  castRay(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number
  ): RaycastHit | undefined;
  info(): RapierAdapterInfo;
  dispose(): void;
};

export type RaycastHit = {
  collider: ColliderHandle;
  distance: number;
  point: readonly [number, number, number];
  normal: readonly [number, number, number];
};

export type RapierAdapterOptions = {
  /** Fixed timestep in seconds. Default 1/60. */
  fixedDt?: number;
  /** Gravity vector. Default earth-like (0, -9.81, 0). */
  gravity?: readonly [number, number, number];
};

export async function createRapierAdapter(
  options: RapierAdapterOptions = {}
): Promise<RapierAdapter> {
  const RAPIER = await import("@dimforge/rapier3d-compat");
  await RAPIER.init();
  return createAdapterFromModule(RAPIER, options);
}

/** Test-friendly factory — accepts an already-init'd RAPIER module. */
export function createAdapterFromModule(
  RAPIER: typeof RAPIER_TYPES,
  options: RapierAdapterOptions = {}
): RapierAdapter {
  const fixedDt = options.fixedDt ?? 1 / 60;
  const gravity = options.gravity ?? ([0, -9.81, 0] as const);

  const world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  world.timestep = fixedDt;
  const eventQueue = new RAPIER.EventQueue(true);

  let nextBodyHandle = 1;
  let nextColliderHandle = 1;
  const bodies = new Map<BodyHandle, RAPIER_TYPES.RigidBody>();
  const colliders = new Map<ColliderHandle, RAPIER_TYPES.Collider>();
  /** Reverse map from Rapier's internal collider handle (a u32) to ours. */
  const rapierToHandle = new Map<number, ColliderHandle>();
  /** body → collider handles. Lets `releaseBody` purge children from `colliders`. */
  const bodyColliders = new Map<BodyHandle, Set<ColliderHandle>>();
  /** Reverse — collider → body. Needed for `releaseCollider` to update `bodyColliders`. */
  const colliderBody = new Map<ColliderHandle, BodyHandle>();
  const characterControllers = new Map<CharacterControllerHandle, RAPIER_TYPES.KinematicCharacterController>();
  let nextCharacterHandle = 1;
  let totalSteps = 0;

  const eulerToQuat = (rotation: readonly [number, number, number]): { x: number; y: number; z: number; w: number } => {
    const c1 = Math.cos(rotation[0] / 2);
    const c2 = Math.cos(rotation[1] / 2);
    const c3 = Math.cos(rotation[2] / 2);
    const s1 = Math.sin(rotation[0] / 2);
    const s2 = Math.sin(rotation[1] / 2);
    const s3 = Math.sin(rotation[2] / 2);
    return {
      x: s1 * c2 * c3 + c1 * s2 * s3,
      y: c1 * s2 * c3 - s1 * c2 * s3,
      z: c1 * c2 * s3 + s1 * s2 * c3,
      w: c1 * c2 * c3 - s1 * s2 * s3
    };
  };

  const quatToEuler = (q: { x: number; y: number; z: number; w: number }): readonly [number, number, number] => {
    // XYZ Euler from quaternion (matches scene-authoring convention).
    const ysqr = q.y * q.y;
    const t0 = 2 * (q.w * q.x + q.y * q.z);
    const t1 = 1 - 2 * (q.x * q.x + ysqr);
    const roll = Math.atan2(t0, t1);
    let t2 = 2 * (q.w * q.y - q.z * q.x);
    t2 = t2 > 1 ? 1 : t2 < -1 ? -1 : t2;
    const pitch = Math.asin(t2);
    const t3 = 2 * (q.w * q.z + q.x * q.y);
    const t4 = 1 - 2 * (ysqr + q.z * q.z);
    const yaw = Math.atan2(t3, t4);
    return [roll, pitch, yaw];
  };

  return {
    async init(): Promise<void> {
      // Already initialised by `createRapierAdapter`. Kept for symmetry.
    },
    acquireBody(spec): BodyHandle {
      let desc: RAPIER_TYPES.RigidBodyDesc;
      switch (spec.kind) {
        case "fixed":
          desc = RAPIER.RigidBodyDesc.fixed();
          break;
        case "dynamic":
          desc = RAPIER.RigidBodyDesc.dynamic();
          if (spec.mass !== undefined) desc.setAdditionalMass(spec.mass);
          break;
        case "kinematicPosition":
          desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
          break;
      }
      desc.setTranslation(spec.position[0], spec.position[1], spec.position[2]);
      if (spec.rotation !== undefined) {
        const q = eulerToQuat(spec.rotation);
        desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      if (spec.gravityScale !== undefined) desc.setGravityScale(spec.gravityScale);
      if (spec.linearDamping !== undefined) desc.setLinearDamping(spec.linearDamping);
      if (spec.angularDamping !== undefined) desc.setAngularDamping(spec.angularDamping);
      if (spec.lockRotations === true) desc.lockRotations();
      if (spec.ccd !== undefined) desc.setCcdEnabled(spec.ccd);
      if (spec.canSleep !== undefined) desc.setCanSleep(spec.canSleep);

      const body = world.createRigidBody(desc);
      const handle = nextBodyHandle;
      nextBodyHandle += 1;
      bodies.set(handle, body);
      bodyColliders.set(handle, new Set());
      return handle;
    },
    releaseBody(handle): void {
      const body = bodies.get(handle);
      if (body === undefined) return;
      // Rapier removes attached colliders when the body is dropped — mirror
      // that in our registry so handle counts stay honest.
      const owned = bodyColliders.get(handle);
      if (owned !== undefined) {
        for (const cid of owned) {
          colliders.delete(cid);
          colliderBody.delete(cid);
        }
        bodyColliders.delete(handle);
      }
      world.removeRigidBody(body);
      bodies.delete(handle);
    },
    acquireCollider(bodyHandle, spec): ColliderHandle | undefined {
      const body = bodies.get(bodyHandle);
      if (body === undefined) return undefined;
      let desc: RAPIER_TYPES.ColliderDesc | null;
      switch (spec.kind) {
        case "box":
          if (spec.size === undefined) return undefined;
          desc = RAPIER.ColliderDesc.cuboid(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2);
          break;
        case "sphere":
          if (spec.radius === undefined) return undefined;
          desc = RAPIER.ColliderDesc.ball(spec.radius);
          break;
        case "capsule":
          if (spec.radius === undefined || spec.halfHeight === undefined) return undefined;
          desc = RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius);
          break;
        case "cylinder":
          if (spec.radius === undefined || spec.halfHeight === undefined) return undefined;
          desc = RAPIER.ColliderDesc.cylinder(spec.halfHeight, spec.radius);
          break;
        case "trimesh": {
          if (spec.vertices === undefined || spec.indices === undefined) return undefined;
          if (spec.vertices.length === 0 || spec.vertices.length % 3 !== 0) return undefined;
          if (spec.indices.length === 0 || spec.indices.length % 3 !== 0) return undefined;
          desc = RAPIER.ColliderDesc.trimesh(
            new Float32Array(spec.vertices),
            new Uint32Array(spec.indices)
          );
          break;
        }
        case "heightfield": {
          if (
            spec.heights === undefined ||
            spec.rows === undefined ||
            spec.columns === undefined ||
            spec.scale === undefined
          ) {
            return undefined;
          }
          if (spec.rows < 2 || spec.columns < 2) return undefined;
          if (spec.heights.length !== spec.rows * spec.columns) return undefined;
          // Rapier signature: heightfield(nrows, ncols, heights, scale).
          // `nrows`/`ncols` are sample counts MINUS one (Rapier counts
          // quads, not samples). The full world-space size is the
          // `scale` vector applied to the unit grid.
          desc = RAPIER.ColliderDesc.heightfield(
            spec.rows - 1,
            spec.columns - 1,
            new Float32Array(spec.heights),
            { x: spec.scale[0], y: spec.scale[1], z: spec.scale[2] }
          );
          break;
        }
      }
      if (desc === null) return undefined;
      if (spec.offset !== undefined) desc.setTranslation(spec.offset[0], spec.offset[1], spec.offset[2]);
      if (spec.rotation !== undefined) {
        const q = eulerToQuat(spec.rotation);
        desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      if (spec.sensor === true) desc.setSensor(true);
      if (spec.friction !== undefined) desc.setFriction(spec.friction);
      if (spec.restitution !== undefined) desc.setRestitution(spec.restitution);

      // M24-sensors: enable active events so EventQueue collects
      // collision + intersection starts/stops.
      desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const collider = world.createCollider(desc, body);
      const handle = nextColliderHandle;
      nextColliderHandle += 1;
      colliders.set(handle, collider);
      rapierToHandle.set(collider.handle, handle);
      colliderBody.set(handle, bodyHandle);
      bodyColliders.get(bodyHandle)?.add(handle);
      return handle;
    },
    releaseCollider(handle): void {
      const collider = colliders.get(handle);
      if (collider === undefined) return;
      rapierToHandle.delete(collider.handle);
      world.removeCollider(collider, true);
      colliders.delete(handle);
      const bid = colliderBody.get(handle);
      if (bid !== undefined) bodyColliders.get(bid)?.delete(handle);
      colliderBody.delete(handle);
    },
    setBodyTransform(handle, position, rotation): void {
      const body = bodies.get(handle);
      if (body === undefined) return;
      body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      if (rotation !== undefined) {
        const q = eulerToQuat(rotation);
        body.setRotation(q, true);
      }
    },
    getBodyTranslation(handle): readonly [number, number, number] | undefined {
      const body = bodies.get(handle);
      if (body === undefined) return undefined;
      const t = body.translation();
      return [t.x, t.y, t.z];
    },
    getBodyRotation(handle): readonly [number, number, number, number] | undefined {
      const body = bodies.get(handle);
      if (body === undefined) return undefined;
      const r = body.rotation();
      const euler = quatToEuler(r);
      return [euler[0], euler[1], euler[2], 0];
    },
    step(dt): void {
      if (dt !== undefined && dt !== fixedDt) {
        world.timestep = dt;
      }
      world.step(eventQueue);
      totalSteps += 1;
      if (dt !== undefined && dt !== fixedDt) {
        world.timestep = fixedDt;
      }
    },
    drainEvents(): CollisionEvent[] {
      const out: CollisionEvent[] = [];
      eventQueue.drainCollisionEvents((h1, h2, started) => {
        const a = rapierToHandle.get(h1);
        const b = rapierToHandle.get(h2);
        if (a === undefined || b === undefined) return;
        out.push({ kind: "collision", handle1: a, handle2: b, started });
      });
      eventQueue.drainContactForceEvents(() => {
        // ContactForceEvents — unused for v0; drain to keep the queue tidy.
      });
      // Rapier intersection (sensor) events ride the same drainCollisionEvents
      // callback in current API; v0 collapses them under "collision". Future
      // M24-sensors story splits sensor pairs via collider.isSensor() probe.
      return out;
    },
    setGravity(g): void {
      world.gravity = { x: g[0], y: g[1], z: g[2] };
    },
    getDebugLines(): { vertices: Float32Array; colors: Float32Array } | undefined {
      // world.debugRender() returns a DebugRenderBuffers — `vertices` is
      // a flat XYZ-per-point Float32Array; `colors` is RGBA-per-vertex.
      // Rapier owns the underlying buffers; do not retain across calls.
      const buffers = world.debugRender();
      return { vertices: buffers.vertices, colors: buffers.colors };
    },
    castRay(origin, direction, maxDistance): RaycastHit | undefined {
      const ray = new RAPIER.Ray(
        { x: origin[0], y: origin[1], z: origin[2] },
        { x: direction[0], y: direction[1], z: direction[2] }
      );
      // `solid: true` lets the ray hit a collider it starts inside —
      // matches the common pick-from-camera-into-scene semantics.
      const hit = world.castRayAndGetNormal(ray, maxDistance, true);
      if (hit === null) return undefined;
      const handle = rapierToHandle.get(hit.collider.handle);
      if (handle === undefined) return undefined;
      const distance = hit.timeOfImpact;
      return {
        collider: handle,
        distance,
        point: [
          origin[0] + direction[0] * distance,
          origin[1] + direction[1] * distance,
          origin[2] + direction[2] * distance
        ],
        normal: [hit.normal.x, hit.normal.y, hit.normal.z]
      };
    },
    acquireCharacterController(spec = {}): CharacterControllerHandle {
      const handle = nextCharacterHandle;
      nextCharacterHandle += 1;
      const controller = world.createCharacterController(spec.offset ?? 0.01);
      if (spec.maxSlope !== undefined) controller.setMaxSlopeClimbAngle(spec.maxSlope);
      if (spec.snapToGround !== undefined && spec.snapToGround > 0) {
        controller.enableSnapToGround(spec.snapToGround);
      }
      if (spec.applyImpulsesToDynamicBodies !== undefined) {
        controller.setApplyImpulsesToDynamicBodies(spec.applyImpulsesToDynamicBodies);
      }
      if (spec.characterMass !== undefined) controller.setCharacterMass(spec.characterMass);
      characterControllers.set(handle, controller);
      return handle;
    },
    releaseCharacterController(handle): void {
      const controller = characterControllers.get(handle);
      if (controller === undefined) return;
      world.removeCharacterController(controller);
      characterControllers.delete(handle);
    },
    computeCharacterMovement(controllerHandle, colliderHandle, desired): CharacterMoveResult | undefined {
      const controller = characterControllers.get(controllerHandle);
      const collider = colliders.get(colliderHandle);
      if (controller === undefined || collider === undefined) return undefined;
      // EXCLUDE_SENSORS keeps pickups / hazards / trigger volumes from
      // pushing the character. Without this filter, the controller
      // treats Beacon's 1.6m core sensor like a 1.6m wall and the
      // drone can't approach anything.
      controller.computeColliderMovement(
        collider,
        { x: desired[0], y: desired[1], z: desired[2] },
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
      );
      const movement = controller.computedMovement();
      return {
        movement: [movement.x, movement.y, movement.z],
        grounded: controller.computedGrounded(),
        slidingDownSlope: false
      };
    },
    setBodyNextKinematicTranslation(handle, position): void {
      const body = bodies.get(handle);
      if (body === undefined) return;
      body.setNextKinematicTranslation({ x: position[0], y: position[1], z: position[2] });
    },
    info(): RapierAdapterInfo {
      return {
        bodies: bodies.size,
        colliders: colliders.size,
        fixedDt: world.timestep,
        totalSteps
      };
    },
    dispose(): void {
      for (const handle of [...characterControllers.keys()]) {
        const controller = characterControllers.get(handle);
        if (controller !== undefined) world.removeCharacterController(controller);
      }
      characterControllers.clear();
      bodies.clear();
      colliders.clear();
      eventQueue.free();
      world.free();
    }
  };
}
