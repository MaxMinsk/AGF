// S81 KABOOM-PROJECT-SCAFFOLD. First Kaboom Crew procedural template:
// a 15×11 arena with a regular grid of indestructible walls, scattered
// destructible soft blocks, and one spawn for the player + one for a
// bot. Pure function over the RNG — same seed produces a byte-
// identical scene.
//
// Loader contract: `engine generate examples/kaboom-crew --template
// kaboom-arena-small --seed N --out <file>` imports this module's
// default export. Output is a scene file conforming to
// schemas/scene.schema.json + the kaboom-crew prefab manifest under
// examples/kaboom-crew/prefabs/.

const SIZE_X = 15;
const SIZE_Z = 11;

export default function kaboomArenaSmall(rng, params) {
  const softBlockChance = typeof params?.softBlockChance === "number" ? params.softBlockChance : 0.35;
  const playerSpawn = { gx: 1, gz: 1 };
  const botSpawn = { gx: SIZE_X - 2, gz: SIZE_Z - 2 };

  const entities = [
    {
      id: "camera.main",
      components: {
        Camera: { kind: "orthographic", active: true, orthographicSize: 8, near: 0.1, far: 100 },
        Transform: { position: [(SIZE_X - 1) / 2, 10, (SIZE_Z - 1) / 2 + 5], rotation: [-55, 0, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "light.sun",
      components: {
        Light: { kind: "directional", color: "#ffffff", intensity: 1.5 },
        Transform: { position: [0, 8, 4], rotation: [-45, 30, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "light.ambient",
      components: {
        Light: { kind: "ambient", color: "#ffffff", intensity: 0.3 },
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "grid.config",
      components: {
        Grid: { cellSize: 1, sizeX: SIZE_X, sizeZ: SIZE_Z, originX: 0, originZ: 0 },
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "floor",
      components: {
        Transform: {
          position: [(SIZE_X - 1) / 2, -0.05, (SIZE_Z - 1) / 2],
          rotation: [0, 0, 0],
          scale: [SIZE_X, 0.1, SIZE_Z]
        },
        MeshRenderer: { mesh: "box", color: "#1d2536" }
      }
    }
  ];

  const instances = [
    {
      id: "player.1",
      prefab: "player",
      components: {
        Transform: { position: [playerSpawn.gx, 0.4, playerSpawn.gz] },
        GridPosition: { gx: playerSpawn.gx, gz: playerSpawn.gz }
      }
    },
    {
      id: "bot.1",
      prefab: "bot",
      components: {
        Transform: { position: [botSpawn.gx, 0.4, botSpawn.gz] },
        GridPosition: { gx: botSpawn.gx, gz: botSpawn.gz }
      }
    }
  ];

  // Hard walls in a classic Bomberman-style grid: every (odd, odd) cell.
  let wallCount = 0;
  for (let gx = 2; gx < SIZE_X - 1; gx += 2) {
    for (let gz = 2; gz < SIZE_Z - 1; gz += 2) {
      wallCount += 1;
      instances.push({
        id: `wall.${gx}.${gz}`,
        prefab: "hard-block",
        components: {
          Transform: { position: [gx, 0.5, gz] },
          GridPosition: { gx, gz }
        }
      });
    }
  }

  // Soft blocks: scatter on free cells, but keep the four spawn corners
  // clear (player + bot spawn + the cells adjacent to them) so neither
  // side starts trapped.
  const reserved = new Set([
    keyOf(playerSpawn.gx, playerSpawn.gz),
    keyOf(playerSpawn.gx + 1, playerSpawn.gz),
    keyOf(playerSpawn.gx, playerSpawn.gz + 1),
    keyOf(botSpawn.gx, botSpawn.gz),
    keyOf(botSpawn.gx - 1, botSpawn.gz),
    keyOf(botSpawn.gx, botSpawn.gz - 1)
  ]);

  let softCount = 0;
  for (let gx = 1; gx < SIZE_X - 1; gx += 1) {
    for (let gz = 1; gz < SIZE_Z - 1; gz += 1) {
      // Skip hard-wall cells.
      if (gx % 2 === 0 && gz % 2 === 0) continue;
      if (reserved.has(keyOf(gx, gz))) continue;
      if (rng.next() > softBlockChance) continue;
      softCount += 1;
      instances.push({
        id: `soft.${gx}.${gz}`,
        prefab: "soft-block",
        components: {
          Transform: { position: [gx, 0.45, gz] },
          GridPosition: { gx, gz }
        }
      });
    }
  }

  void wallCount;
  void softCount;

  return {
    id: "kaboom-arena-small",
    entities,
    instances
  };
}

function keyOf(gx, gz) {
  return `${gx}|${gz}`;
}
