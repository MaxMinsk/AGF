# Dev tuner — ad-hoc sliders for visual-judgment values

When you (the agent) need a human to dial in a numeric value visually — shadow bias, light intensity, camera FOV, a tween duration — don't iterate by Playwright screenshot. Spawn slider(s), let the user feel the values, then remove the sliders.

**Available since M23-tuner.** Implementation: `engine/runtime/dev-tuner.ts`. Surface: `window.__agf.dev.tuner`.

## API

```ts
window.__agf.dev.tuner.add({
  name: "sun-bias",                                          // unique slug
  target: {
    entityId: "light.sun",
    component: "Light",
    path: "shadow.bias"                                      // dot-path inside the component
  },
  min: -0.02,
  max: 0,
  step: 0.0005,                                              // default = 1% of span
  value: -0.008,                                             // optional — overrides initial; default reads current
  label: "sun shadow bias"                                   // optional display label
});

window.__agf.dev.tuner.remove("sun-bias");
window.__agf.dev.tuner.removeAll();
window.__agf.dev.tuner.list();                               // [{ name, target, value }, ...]
```

## Workflow

1. **You detect a visual-judgment value.** Examples: "shadow bias for low-poly meshes," "key light intensity," "FOV for the cinematic camera," "particle decay rate."
2. **You spawn sliders.** Pick 1–3 sliders that bound the relevant axes. Default ranges should be wide enough to find the right value but narrow enough that drag feel is good (rule of thumb: span ≈ 10–100× the expected value).
3. **The user reports the values.** They say "0.008 and 0.22" or paste back what they see. They're looking at the same number on-screen as you'd see in `tuner.list()`.
4. **You remove the sliders.** `removeAll()` is fine. Then bake the values into the scene JSON / material manifest / project config.

## Why not just edit the JSON in a loop?

JSON edits don't have a visceral feedback loop. Screenshot grids are a 6× tax: write spec → playwright run → read images → guess next values → repeat. Sliders give the user a 60 FPS feedback loop and a single number to copy back. Reserve screenshot grids for invariants the user can't eyeball (CI regressions, allocation counts, perf budgets).

## What this is NOT

- **Not** a state surface. The slider panel is DOM, not ECS. `__agf.snapshot()` does not see it.
- **Not** persistent. Reload the page → sliders are gone. Bake the values into source before reloading.
- **Not** for gameplay values an end user should see. This is dev-time tuning only — in production builds (`import.meta.env.DEV === false`), `__agf` itself is never installed.
- **Not** a replacement for the existing inspector / snapshot tooling. Use `__agf.snapshot()` to read state; use the tuner to *write* one numeric field with visual feedback.

## Common patterns

### Shadow tuning across hazard pulse range

```ts
__agf.dev.tuner.add({
  name: "sun-bias",
  target: { entityId: "light.sun", component: "Light", path: "shadow.bias" },
  min: -0.02, max: 0, step: 0.0005
});
__agf.dev.tuner.add({
  name: "sun-normal",
  target: { entityId: "light.sun", component: "Light", path: "shadow.normalBias" },
  min: 0, max: 0.5, step: 0.01
});
```

### Camera framing

```ts
__agf.dev.tuner.add({
  name: "fov",
  target: { entityId: "camera.main", component: "Camera", path: "fov" },
  min: 30, max: 110, step: 1
});
```

### Material roughness on a hero asset

```ts
__agf.dev.tuner.add({
  name: "hero-roughness",
  target: { entityId: "cube.hero", component: "MeshRenderer", path: "color" }, // hex strings won't work — pick numeric fields only
  min: 0, max: 1, step: 0.02
});
```

(Only numeric fields are valid targets. Strings, arrays, and booleans need a different UI — file a follow-up.)

## When the user reports values

After the user reports the dialed-in values, you should:

1. Edit the scene JSON / project config to bake the values.
2. Run `engine:check` on the example to confirm the scene still validates.
3. Run `npm run test:e2e` if the value affects visual or behavioral invariants.
4. Call `__agf.dev.tuner.removeAll()` from your verification spec, or wait for the next reload to clear it.
