// M19-particle-preset: emit + advance particles via an additive
// InstancedMesh pool on the renderer adapter.
//
// Each entity with `ParticleEmitter { preset, lifetime, elapsed, rate,
// maxParticles, offset }` and a sibling `Transform` participates. The
// system:
//   1. Acquires a ParticlePool handle on the adapter on first sight.
//   2. Each frame: advances the particle pool (age, position, scale),
//      spawns new particles at `rate * dt` until `maxParticles`, removes
//      dead particles, uploads matrices via setParticleInstances.
//   3. Increments emitter.elapsed; when lifetime > 0 and elapsed exceeds
//      lifetime AND all particles have died, releases the pool + removes
//      the ECS component.
//
// Built-in presets (color + base radius + particle lifetime + gravity):
//   * "spark"  — bright orange, small, short-lived
//   * "glow"   — pale cyan, medium, soft fall
//   * "pulse"  — warm magenta, larger, slower
//
// Particle state lives in the system (not in ECS) for v0 — the cost of
// snapshotting 64 particles per emitter per frame is not worth the
// replay-determinism benefit yet. (Tween covers the deterministic case;
// particles are purely visual feedback.)

import { Matrix4, Quaternion, Vector3 } from "three";
import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ParticlePoolHandle, ThreeRenderAdapter } from "../three-render-adapter";

export const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";
const TRANSFORM: ComponentName = "Transform";

type Vec3 = ReadonlyArray<number>;

type ParticleEmitterComponent = {
  preset: string;
  lifetime?: number;
  elapsed?: number;
  rate?: number;
  maxParticles?: number;
  offset?: Vec3;
};

type TransformComponent = { position?: Vec3 };

type PresetConfig = {
  color: string;
  radius: number;
  particleLifetime: number;
  spreadXZ: number;
  upVelocity: number;
  gravity: number;
};

const PRESETS: Record<string, PresetConfig> = {
  spark: { color: "#ffaa44", radius: 0.05, particleLifetime: 0.5, spreadXZ: 1.0, upVelocity: 1.8, gravity: -3.0 },
  glow: { color: "#7fd6ff", radius: 0.08, particleLifetime: 1.0, spreadXZ: 0.5, upVelocity: 0.6, gravity: -0.6 },
  pulse: { color: "#ff5588", radius: 0.12, particleLifetime: 0.8, spreadXZ: 1.4, upVelocity: 0.9, gravity: -1.4 }
};

function getPreset(id: string): PresetConfig {
  return PRESETS[id] ?? PRESETS["spark"]!;
}

type Particle = {
  age: number;
  lifetime: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  startRadius: number;
};

type EmitterRuntime = {
  handle: ParticlePoolHandle;
  particles: Particle[];
  capacity: number;
  /** Seeded rng-ish counter for deterministic-ish spawn variance. */
  spawnTick: number;
};

export function createParticleEmitterSystem(deps: {
  adapter: Pick<
    ThreeRenderAdapter,
    "acquireParticlePool" | "setParticleInstances" | "releaseParticlePool"
  >;
  name?: string;
}): System {
  const name = deps.name ?? "render.particle-emitter";
  const adapter = deps.adapter;
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  const runtimes = new Map<EntityId, EmitterRuntime>();
  const scratchMatrix = new Matrix4();
  const scratchScale = new Vector3();
  const scratchPos = new Vector3();
  const scratchRot = new Quaternion();
  const matrixBuffer: Matrix4[] = [];

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([PARTICLE_EMITTER, TRANSFORM]);
      cachedWorld = world;
      // Drop runtimes from the previous world; pools were also wiped when
      // the adapter rebuilt its scene, so do not call releaseParticlePool.
      runtimes.clear();
    }
    const dt = context.time.dt;
    const seen = new Set<EntityId>();
    for (const entityId of query!.run()) {
      seen.add(entityId);
      advanceEmitter(entityId, world, dt);
    }
    // Release runtimes for emitters whose component is gone.
    for (const [entityId, runtime] of runtimes) {
      if (!seen.has(entityId)) {
        adapter.releaseParticlePool(runtime.handle);
        runtimes.delete(entityId);
      }
    }
  };

  function advanceEmitter(entityId: EntityId, world: World, dt: number): void {
    const emitter = world.getComponent<ParticleEmitterComponent>(entityId, PARTICLE_EMITTER);
    if (emitter === undefined) return;
    const preset = getPreset(emitter.preset);
    const rate = emitter.rate ?? 20;
    const maxParticles = emitter.maxParticles ?? 64;
    const lifetime = emitter.lifetime ?? 0.5;
    const elapsed = (emitter.elapsed ?? 0) + dt;
    const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);
    const basePos = transform?.position ?? [0, 0, 0];
    const offset = emitter.offset ?? [0, 0, 0];
    const spawnX = (basePos[0] ?? 0) + (offset[0] ?? 0);
    const spawnY = (basePos[1] ?? 0) + (offset[1] ?? 0);
    const spawnZ = (basePos[2] ?? 0) + (offset[2] ?? 0);

    let runtime = runtimes.get(entityId);
    if (runtime === undefined) {
      const handle = adapter.acquireParticlePool({
        color: preset.color,
        capacity: maxParticles,
        radius: preset.radius
      });
      runtime = { handle, particles: [], capacity: maxParticles, spawnTick: 0 };
      runtimes.set(entityId, runtime);
    }

    // Advance existing particles.
    const surviving: Particle[] = [];
    for (const particle of runtime.particles) {
      const age = particle.age + dt;
      if (age >= particle.lifetime) continue;
      particle.age = age;
      particle.px += particle.vx * dt;
      particle.py += particle.vy * dt;
      particle.pz += particle.vz * dt;
      particle.vy += preset.gravity * dt;
      surviving.push(particle);
    }
    runtime.particles = surviving;

    // Spawn new particles when the emitter is still alive.
    const emitterAlive = lifetime <= 0 || elapsed < lifetime;
    if (emitterAlive) {
      const want = Math.floor(rate * dt + (runtime.spawnTick % 1));
      runtime.spawnTick += rate * dt;
      const free = runtime.capacity - runtime.particles.length;
      const toSpawn = Math.max(0, Math.min(want, free));
      for (let i = 0; i < toSpawn; i += 1) {
        // Pseudo-random spread based on spawnTick + index — deterministic
        // for replay because spawnTick is purely a function of rate * dt
        // and i is sequential.
        const seed = runtime.spawnTick * 12.9898 + i * 78.233;
        const r1 = Math.abs((Math.sin(seed) * 43758.5453) % 1);
        const r2 = Math.abs((Math.sin(seed + 1.0) * 23421.631) % 1);
        const angle = r1 * Math.PI * 2;
        const speed = preset.spreadXZ * (0.6 + r2 * 0.8);
        runtime.particles.push({
          age: 0,
          lifetime: preset.particleLifetime,
          px: spawnX,
          py: spawnY,
          pz: spawnZ,
          vx: Math.cos(angle) * speed,
          vy: preset.upVelocity * (0.7 + r2 * 0.6),
          vz: Math.sin(angle) * speed,
          startRadius: preset.radius
        });
      }
    }

    // Upload matrices.
    matrixBuffer.length = runtime.particles.length;
    for (let i = 0; i < runtime.particles.length; i += 1) {
      const particle = runtime.particles[i]!;
      const t = particle.age / particle.lifetime;
      const scale = Math.max(0.001, 1 - t);
      scratchPos.set(particle.px, particle.py, particle.pz);
      scratchScale.set(scale, scale, scale);
      scratchRot.identity();
      scratchMatrix.compose(scratchPos, scratchRot, scratchScale);
      const slot = matrixBuffer[i] ?? new Matrix4();
      slot.copy(scratchMatrix);
      matrixBuffer[i] = slot;
    }
    adapter.setParticleInstances(runtime.handle, matrixBuffer, runtime.particles.length);

    // Update or remove the component.
    if (!emitterAlive && runtime.particles.length === 0) {
      adapter.releaseParticlePool(runtime.handle);
      runtimes.delete(entityId);
      world.removeComponent(entityId, PARTICLE_EMITTER);
    } else {
      world.setComponent(entityId, PARTICLE_EMITTER, { ...emitter, elapsed });
    }
  }

  return { name, frameUpdate };
}
