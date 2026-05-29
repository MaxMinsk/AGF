// S196 KABOOM-BOMB-FUSE-COLOR. Visual telegraph: in the final
// FUSE_TELEGRAPH_S seconds of a bomb's fuse, lerp the bomb's
// MeshRenderer.color from its authored dark hex toward bright
// orange so the player can read "about to blow" without having to
// count the wiggle frequency.
//
// Pairs with the existing S90 scale wiggle — wiggle communicates
// urgency through motion, this system through colour. Two channels
// = more readable at a glance.
//
// Pure presentation; no gameplay state touched.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";

/** Begin tinting this many seconds before detonation. */
const FUSE_TELEGRAPH_S = 0.6;
/** Hot colour reached at fuseRemaining == 0. */
const HOT_HEX = "#ff5500";

type BombComponent = { fuseRemaining: number; carriedBy?: EntityId; airborne?: boolean };
type MeshRendererComponent = { mesh?: string; color?: string };

export function createKaboomBombFuseColorSystem(): System {
  const name = "kaboom.bomb-fuse-color";
  // Authored bomb colour per entity — captured the first time we see
  // it. Used as the cool endpoint of the lerp + as the value we snap
  // back to if the bomb's fuse rewinds (e.g. throw-glove carry).
  const authoredColor = new Map<EntityId, string>();
  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB, MESH_RENDERER]);
      cachedWorld = world;
      authoredColor.clear();
    }
    for (const id of bombs!.run()) {
      const bomb = world.getComponent<BombComponent>(id, BOMB);
      if (bomb === undefined) continue;
      // S144: carried / airborne bombs have paused fuses — skip the
      // telegraph until they land.
      if (bomb.carriedBy !== undefined || bomb.airborne === true) continue;
      const mr = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
      if (mr === undefined) continue;
      let baseColor = authoredColor.get(id);
      if (baseColor === undefined) {
        baseColor = mr.color ?? "#1a1a1a";
        authoredColor.set(id, baseColor);
      }
      const t = Math.max(0, Math.min(1, 1 - bomb.fuseRemaining / FUSE_TELEGRAPH_S));
      const next = t === 0 ? baseColor : lerpHex(baseColor, HOT_HEX, t);
      if (next !== mr.color) {
        world.setComponent(id, MESH_RENDERER, { ...mr, color: next });
      }
    }
    // GC entries for despawned bombs.
    for (const id of [...authoredColor.keys()]) {
      if (!world.hasEntity(id)) authoredColor.delete(id);
    }
  };

  return { name, fixedUpdate };
}

/** Pure helper — lerp two `#rrggbb` hex strings by `t` ∈ [0,1].
 *  Exported for unit tests. */
export function lerpHex(lo: string, hi: string, t: number): string {
  const a = parse(lo);
  const b = parse(hi);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return "#" + r.toString(16).padStart(2, "0")
            + g.toString(16).padStart(2, "0")
            + bl.toString(16).padStart(2, "0");
}

function parse(hex: string): { r: number; g: number; b: number } {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(s.slice(0, 2), 16),
    g: Number.parseInt(s.slice(2, 4), 16),
    b: Number.parseInt(s.slice(4, 6), 16)
  };
}
