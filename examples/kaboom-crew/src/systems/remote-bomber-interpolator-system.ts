// S109 KABOOM-MULTIPLAYER-FOUNDATION.
//
// Frame-phase interpolation for remote bombers. The WS network adapter
// records every inbound world.snapshot into a per-entity buffer of
// (receivedAt, position) samples. This system reads that buffer each
// frame and writes a smoothed Transform.position at
// `now - renderDelay`, lerping between the two samples that bracket
// the render time. Smooth across jittery / dropped packets.
//
// Copy of beacon-world's remote-presence-interpolator with a kaboom-
// crew name + the kaboom-specific RemoteBomberOwned filter — we only
// touch entities the decorator system has already spawned a bomber
// tree under. Local-player entities (Presence.playerId === local) are
// skipped because the local bomber's Transform is owned by
// grid-movement-system + death-animation-system. Eventually the
// interpolator logic should move to engine/core/systems/ so beacon +
// kaboom share one file — out of scope for this story.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { SnapshotSample } from "../../../../engine/runtime/network/ws-network-adapter";

const PRESENCE: ComponentName = "Presence";
const TRANSFORM: ComponentName = "Transform";
const REMOTE_BOMBER_OWNED: ComponentName = "RemoteBomberOwned";

const DEFAULT_RENDER_DELAY_S = 0.1;
const DEFAULT_EXTRAPOLATION_LIMIT_S = 0.2;

type Presence = { playerId: string };
type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

export type KaboomRemoteBomberInterpolatorOptions = {
  localPlayerId: string;
  /** Read-only handle to the adapter's per-entity sample buffer. */
  getSnapshotBuffer: () => ReadonlyMap<string, ReadonlyArray<SnapshotSample>>;
  /** Monotonic clock in seconds — must match the clock the adapter timestamps with. */
  nowSeconds: () => number;
  /** How far behind real time to render. Default 100 ms. */
  renderDelaySeconds?: number;
  /** Cap on velocity-based extrapolation past the newest sample. Default 200 ms. */
  extrapolationLimitSeconds?: number;
  name?: string;
};

/**
 * Pure helper — given a sorted sample buffer + a render time, returns
 * the interpolated position OR the held last-known position once we
 * pass the extrapolation cap. Exported for unit tests.
 */
export function interpolateRemotePosition(
  samples: ReadonlyArray<SnapshotSample>,
  renderTime: number,
  extrapolationLimit: number
): [number, number, number] | undefined {
  if (samples.length === 0) return undefined;
  if (samples.length === 1) {
    const only = samples[0]!;
    return [only.position[0], only.position[1], only.position[2]];
  }

  const last = samples[samples.length - 1]!;
  if (renderTime >= last.receivedAtSeconds) {
    const lag = renderTime - last.receivedAtSeconds;
    if (lag > extrapolationLimit) {
      return [last.position[0], last.position[1], last.position[2]];
    }
    const previous = samples[samples.length - 2]!;
    const span = last.receivedAtSeconds - previous.receivedAtSeconds;
    if (span <= 0) return [last.position[0], last.position[1], last.position[2]];
    const k = lag / span;
    return [
      last.position[0] + (last.position[0] - previous.position[0]) * k,
      last.position[1] + (last.position[1] - previous.position[1]) * k,
      last.position[2] + (last.position[2] - previous.position[2]) * k
    ];
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (renderTime >= a.receivedAtSeconds && renderTime <= b.receivedAtSeconds) {
      const span = b.receivedAtSeconds - a.receivedAtSeconds;
      const k = span > 0 ? (renderTime - a.receivedAtSeconds) / span : 0;
      return [
        a.position[0] + (b.position[0] - a.position[0]) * k,
        a.position[1] + (b.position[1] - a.position[1]) * k,
        a.position[2] + (b.position[2] - a.position[2]) * k
      ];
    }
  }

  const first = samples[0]!;
  return [first.position[0], first.position[1], first.position[2]];
}

export function createKaboomRemoteBomberInterpolatorSystem(
  options: KaboomRemoteBomberInterpolatorOptions
): System {
  const name = options.name ?? "kaboom.remote-bomber-interpolator";
  const renderDelay = options.renderDelaySeconds ?? DEFAULT_RENDER_DELAY_S;
  const extrapolationLimit = options.extrapolationLimitSeconds ?? DEFAULT_EXTRAPOLATION_LIMIT_S;
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  return {
    name,
    frameUpdate({ world }: SystemContext): void {
      if (world !== cachedWorld) {
        query = world.createQuery([PRESENCE, REMOTE_BOMBER_OWNED, TRANSFORM]);
        cachedWorld = world;
      }
      const buffer = options.getSnapshotBuffer();
      const renderTime = options.nowSeconds() - renderDelay;

      for (const id of query!.run()) {
        const presence = world.getComponent<Presence>(id, PRESENCE);
        if (presence === undefined || presence.playerId === options.localPlayerId) continue;
        const samples = buffer.get(id);
        if (samples === undefined || samples.length === 0) continue;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform === undefined) continue;

        const next = interpolateRemotePosition(samples, renderTime, extrapolationLimit);
        if (next === undefined) continue;

        world.setComponent(id, TRANSFORM, { ...transform, position: next });
      }
      // Silence unused-id lint if no entities matched.
      void (cachedWorld as World | undefined);
      void (undefined as EntityId | undefined);
    }
  };
}
