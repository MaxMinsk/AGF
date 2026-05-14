# examples/batch-bench/

Perf-only project. Not a game. Boots a camera + ambient + sun + ground; the agent (or dev-bridge) seeds N batchable entities and reads `__agf.rendererInfo()` to track draw calls / bucket sizes / per-frame timings.

## Run

```bash
npm run dev
# then open http://localhost:5173/?project=batch-bench
```

## Bench scenarios (agent-driven via `__agf.applyCommands`)

Each scenario writes a labelled JSON snapshot to `test-results/batch-bench-<label>.json` and a screenshot. Use it as a regression target when M17 internals change.

### N batchable boxes, single group

```js
const N = 500;
const cmds = [];
for (let i = 0; i < N; i++) {
  const id = `bench.${i}`;
  cmds.push({ kind: "entity.create", entityId: id });
  cmds.push({
    kind: "component.set", entityId: id, component: "Transform",
    data: { position: [(i % 25) * 0.7 - 8.5, 0.5, Math.floor(i / 25) * 0.7 - 7] }
  });
  cmds.push({
    kind: "component.set", entityId: id, component: "MeshRenderer",
    data: { mesh: "box", color: "#9ad3ff" }
  });
  cmds.push({
    kind: "component.set", entityId: id, component: "Batchable",
    data: { group: "bench" }
  });
}
__agf.applyCommands(cmds);
console.log(__agf.rendererInfo());
// expect: buckets=1, bucketInstances=500, drawCalls roughly 5-10 (sun
//         shadow + ground + bucket + UI overlay) regardless of N.
```

### Same N entities WITHOUT Batchable (control)

Strip the `Batchable` component → N draw calls. The delta is what
M17-bucketer saves.

## What this project is NOT

- Not a tutorial.
- Not a gameplay sample.
- Not a place to land project-specific systems — keep gameplay code out so
  the perf numbers stay reproducible across `M17-*` changes.
