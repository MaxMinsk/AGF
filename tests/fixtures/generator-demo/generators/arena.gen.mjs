// S81 KABOOM-GENERATOR-FRAMEWORK test fixture. A tiny generator that
// emits a 5×5 grid + a camera + a single block whose position is
// chosen by the rng. Deterministic per seed.

export default function arena(rng, _params) {
  const sizeX = 5;
  const sizeZ = 5;
  const entities = [
    {
      id: "camera.main",
      components: {
        Camera: { kind: "perspective", active: true, fov: 60 },
        Transform: { position: [0, 5, 5], rotation: [-30, 0, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "grid.config",
      components: {
        Grid: { cellSize: 1, sizeX, sizeZ, originX: 0, originZ: 0 },
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
    },
    {
      id: "block.random",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        GridPosition: { gx: rng.nextInt(0, sizeX), gz: rng.nextInt(0, sizeZ) },
        GridOccupant: { blocksMovement: true }
      }
    }
  ];
  return { id: "generated-arena", entities };
}
