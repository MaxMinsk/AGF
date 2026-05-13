/**
 * Shared palette used to colour drones (both local and remote) by a stable
 * hash of `playerId`. The remote-presence-decorator system applies it to
 * incoming server-owned `player.<id>` entities; the bootstrap's `attachUi`
 * applies it to the local `player.drone` so a player's own tab visually
 * agrees with what the other tab renders.
 */

export const DRONE_MATERIAL_PALETTE: ReadonlyArray<string> = [
  "runtime/materials/drone-orange.material.json",
  "runtime/materials/drone-cyan.material.json",
  "runtime/materials/drone-violet.material.json",
  "runtime/materials/drone-amber.material.json"
];

export function pickDroneMaterialFor(
  playerId: string,
  palette: ReadonlyArray<string> = DRONE_MATERIAL_PALETTE
): string | undefined {
  if (palette.length === 0 || playerId.length === 0) {
    return undefined;
  }
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}
