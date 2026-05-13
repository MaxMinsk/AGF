import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { SnapshotSample } from "../../../../engine/runtime/network/ws-network-adapter";

type PresenceComponent = { playerId: string };
type NetworkedComponent = { authority?: "server" | "client" };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

const DEFAULT_RENDER_DELAY_SECONDS = 0.1;
const DEFAULT_EXTRAPOLATION_LIMIT_SECONDS = 0.2;

export type RemotePresenceInterpolatorOptions = {
  /** Local player's id — these entities are owned by the local drone and skipped. */
  localPlayerId: string;
  /** Read-only handle to the adapter's per-entity sample buffer. */
  getSnapshotBuffer: () => ReadonlyMap<string, ReadonlyArray<SnapshotSample>>;
  /** Monotonic clock in seconds. Must match the clock used by the adapter. */
  nowSeconds: () => number;
  /**
   * Render this many seconds behind the most-recent sample so we usually have
   * two samples to interpolate between. Defaults to 100 ms.
   */
  renderDelaySeconds?: number;
  /**
   * Cap how far past the newest sample we are willing to extrapolate using
   * the last segment's velocity. Defaults to 200 ms. Past this we hold the
   * last known position.
   */
  extrapolationLimitSeconds?: number;
};

/**
 * Frame-phase interpolation system for the `"connected"` Beacon profile.
 *
 * The WS adapter records every inbound `world.snapshot` into a per-entity
 * buffer of `(receivedAt, position)` samples. This system reads that buffer
 * each frame and writes a smoothed `Transform.position` at
 * `now - renderDelay`, lerping between the two samples that bracket the
 * render time. This stays smooth across jittery / dropped packets, which is
 * the standard interpolation approach used by modern multiplayer games.
 *
 * The local player is skipped (the `network-drone-sync` system already
 * reconciles `player.drone` against the server snapshot with prediction).
 */
export function createRemotePresenceInterpolatorSystem(
  options: RemotePresenceInterpolatorOptions
): System {
  const renderDelay = options.renderDelaySeconds ?? DEFAULT_RENDER_DELAY_SECONDS;
  const extrapolationLimit = options.extrapolationLimitSeconds ?? DEFAULT_EXTRAPOLATION_LIMIT_SECONDS;
  let cachedWorld: World | undefined;
  let presenceQuery: QueryHandle | undefined;
  return {
    name: "remote-presence-interpolator",
    frameUpdate({ world }: SystemContext): void {
      if (world !== cachedWorld) {
        presenceQuery = world.createQuery(["Presence", "Networked", "Transform"]);
        cachedWorld = world;
      }
      const buffer = options.getSnapshotBuffer();
      const renderTime = options.nowSeconds() - renderDelay;

      for (const id of presenceQuery!.run()) {
        const networked = world.getComponent<NetworkedComponent>(id, "Networked");
        if (networked?.authority !== "server") {
          continue;
        }
        const presence = world.getComponent<PresenceComponent>(id, "Presence");
        if (presence === undefined || presence.playerId === options.localPlayerId) {
          continue;
        }
        const samples = buffer.get(id);
        if (samples === undefined || samples.length === 0) {
          continue;
        }
        const transform = world.getComponent<TransformComponent>(id, "Transform");
        if (transform === undefined) {
          continue;
        }

        const next = interpolatePosition(samples, renderTime, extrapolationLimit);
        if (next === undefined) {
          continue;
        }

        world.setComponent(id, "Transform", { ...transform, position: next });
      }
    }
  };
}

function interpolatePosition(
  samples: ReadonlyArray<SnapshotSample>,
  renderTime: number,
  extrapolationLimit: number
): [number, number, number] | undefined {
  if (samples.length === 0) {
    return undefined;
  }
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
    if (span <= 0) {
      return [last.position[0], last.position[1], last.position[2]];
    }
    const k = lag / span;
    const dx = last.position[0] - previous.position[0];
    const dy = last.position[1] - previous.position[1];
    const dz = last.position[2] - previous.position[2];
    return [last.position[0] + dx * k, last.position[1] + dy * k, last.position[2] + dz * k];
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
