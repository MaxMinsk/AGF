# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S083 — Engine observability — logging policy + CI gate + motion smoothness

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S083.sprint.json`.

### Stories

- **AGF-MOTION-SMOOTHNESS-PROBE** — Motion smoothness — frame-time probe + GridMover stutter fix _(pending)_
  Build a deterministic Playwright probe that measures frame-delta jitter while the player walks across the Kaboom Crew arena. Capture a histogram of frame durations + per-cell tween dt deltas. Investigate whether GridMover's cell-tween + lane-assist introduce visible micro-stutters (cell boundary snaps, recompute order, BatchingSystem invalidation churn). Land a targeted fix if root cause is in the renderer/scheduler/tween path; if it turns out to be macOS PSU/throttling, document the workaround.
- **AGF-LOG-POLICY-DOC** — Logging policy doc — severity scale + diagnostics-vs-console rules _(pending)_
  Write `docs/diagnostics-policy.md` capturing the severity scale (fatal/error/warn/info/debug/trace), when-to-use-diagnostics-vs-console, the structured-payload schema (domain_verb code + JSON context), and the rules for engine vs example code. Source: notes/logging-policy-thinking.md.
- **AGF-LOG-CI-GATE** — CI gate: ban raw console.log in engine/** + examples/**/src/** _(pending)_
  scripts/check-no-console-log.mjs walks the configured globs and rejects bare console.{log,warn,error}. Allowlist via `// agf-allow:console <reason>` markers. Wire into `npm run repo:hygiene` (already part of preflight) so CI fails when someone slips a log in.
  Depends on: AGF-LOG-POLICY-DOC.
- **AGF-LOG-AUDIT-ENGINE** — Audit + purge existing console.* in engine/** under the new policy _(pending)_
  Walk every `console.*` call site inside engine/** and either route it through the diagnostics channel, downgrade to debug-flag gated, or add an `agf-allow:` marker with a one-line rationale. Goal: a clean baseline before the CI gate flips on.
  Depends on: AGF-LOG-CI-GATE.
- **AGF-LOG-PER-SYSTEM-DEBUG** — Named per-system debug loggers + AGF_DEBUG flag _(pending)_
  Engine adds a `createDebugLogger(name)` factory that returns a logger gated by a project-wide `AGF_DEBUG` env / query-param. Systems opt-in (`const log = createDebugLogger('grid-movement')`) so debug output can be filtered by name and stays silent by default.
  Depends on: AGF-LOG-POLICY-DOC.
- **AGF-LOG-LIFECYCLE-TRACES** — Structured lifecycle traces — scene load / system register / runtime stop _(pending)_
  Emit one structured trace per lifecycle event (scene load start/end with entity counts, system register/unregister, runtime stop) through the existing diagnostics channel. No console.log path. Helps post-mortems on hangs + ghost-entity bugs.
  Depends on: AGF-LOG-POLICY-DOC.
- **AGF-LOG-DOCTOR-DIAGNOSTICS** — engine doctor reports diagnostics noise summary _(pending)_
  Add a `diagnostics` section to `engine doctor` that summarises total events by severity + top-N codes since boot. Helps spot a system that's spam-warning every frame without grep-ing console.
  Depends on: AGF-LOG-LIFECYCLE-TRACES.
- **AGF-LOG-BOOT-NOISE-BUDGET** — Boot noise budget — fail when startup emits more than N logs _(pending)_
  Preflight smoke test asserts that booting hello-3d emits ≤ N (small, e.g. 5) info-level diagnostics before idle. Catches regressions where someone adds a per-frame log to a startup path.
  Depends on: AGF-LOG-AUDIT-ENGINE.
- **AGF-LOG-ENTITY-RECREATED** — Detect + log entity recreation regressions _(pending)_
  When `entity.create` lands an id that was deleted earlier in the same session, emit a `agf.entity.recreated` warning with both call stacks (when stack traces are cheap). Root-cause aid for ghost-entity bugs like the S082 restart issue.
  Depends on: AGF-LOG-LIFECYCLE-TRACES.
- **AGF-AGENT-RENDERER-PROBE** — Engine renderer probe — `runtime.renderer.inspect()` + CLI _(pending)_
  First-class engine tool: `runtime.renderer.inspect()` returns a compact JSON dump of the Three.js scene tree (Mesh/InstancedMesh/Light counts + visibility), BatchingSystem bucket records (key, capacity, live, lastWorld memo) and MeshHandleRegistry entries. `engine probe <projectDir>` exposes the same via the CLI. The ad-hoc probe used during the S082 restart bug becomes a one-curl primitive.
- **AGF-WEBGPU-CHUNK-SPLIT** — Investigate why Vite manualChunks doesn't split three.webgpu _(pending)_
  The S70 WEBGPU-lazy-import story split `three/webgpu` into a dynamic import + manualChunks rule for `three-webgpu-*`. The split never produces a separate chunk in practice — Vite folds the WebGPU code straight back into the main `three-*` chunk (~520 KB). Investigate why (dynamic import shape, module specifier, manualChunks ordering) and ship a fix that actually code-splits, then tighten the budget back from 560 KB toward the original 340 KB.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
