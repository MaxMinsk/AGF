# Hello 3D — Template Context

Smallest renderer fixture. One perspective camera at `(0, 1, 3)` and one box at the origin with a `Spin` component so it visibly animates.

## Vocabulary

- **cube** — a single entity with `Transform` + `MeshRenderer { mesh: "box", color: ... }` + `Spin { axis, speed }`.
- **camera** — perspective camera; the only one in the scene.

## How To Extend

| Goal | Pattern |
|---|---|
| Add another mesh | Append an entity to `scenes/start.scene.json`. Use `box`, `sphere`, or `plane` primitives, or reference a `.glb` under `assets/runtime/models/`. |
| Add a new built-in system | Engine ships `SpinSystem` and `PlayerInputSystem`; both can be registered via the project bootstrap if needed. |
| Promote to a real game | Copy the directory, rename `templateId`, add project-local schemas + systems. |

## Verify Before Shipping

```bash
npm run engine:check -- examples/hello-3d
npm run engine:summarize -- examples/hello-3d
npm run test
```
