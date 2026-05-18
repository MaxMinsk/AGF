# AGF Diagnostics + Logging Policy

This is the canonical reference for how AGF reports runtime state to
agents, humans and CI. Every emission path in `engine/**` MUST honour
the rules below. Project code (`examples/**/src/**`) follows the same
rules — the CI gate enforces them.

Source motivation: `notes/logging-policy-thinking.md` (S083 working
note from the Kaboom Crew restart bug-hunt). When this doc and that
note disagree, this doc wins — the note is frozen analysis, the doc
is the live contract.

## 1. Severity scale

| Level | When to use | Visibility |
|---|---|---|
| `error` | Broken invariant; ECS / renderer state is inconsistent and the next frame WILL misbehave. | Always logged + counted by `engine doctor`. Preflight fails on a non-empty post-boot tally. |
| `warning` | Degraded behaviour; the engine recovered but a project mistake or external service flake forced a fallback. | Always logged + counted. Preflight flags > 0 entries. |
| `info` | Lifecycle milestone: runtime start/stop, scene load, system register, bucket acquire/release, asset loaded, etc. Cheap to keep on. | Always logged. Helps reconstruct timelines from the buffer. |
| `debug` | Per-frame state diffs scoped to one named source. Opt-in by AGF_DEBUG. | OFF by default. |
| `trace` | Sub-frame detail (per-entity decisions inside a system tick). Strictly opt-in by AGF_DEBUG and only for the specific source being investigated. | OFF by default. |

`debug` and `trace` exist for the same reason: they let an agent
inspect ONE system at a time without flooding the bus with neighbour
noise. The split is just signal density — `debug` is one event per
tick, `trace` can be many.

## 2. Where to emit

| Surface | Use case | Notes |
|---|---|---|
| `runtime.diagnostics.emit(event)` | Primary surface for **everything** the engine wants to surface. Carries structured `severity`, `code`, `source`, `message`, `details`. | Visible via `__agf.diagnostics()`, `engine doctor`, the dev-bridge `/__agf/diagnostics` endpoint. |
| `createDebugLogger(name)` | Per-system named loggers gated by `AGF_DEBUG`. Internally calls `runtime.diagnostics.emit({ severity: "debug", source: name, ... })` when the flag matches. | Lands in S083 AGF-LOG-PER-SYSTEM-DEBUG. |
| `console.warn` / `console.error` | Only when the diagnostics bus is genuinely unavailable — very early bootstrap, dev-time invariants in plain JS scripts. Must include a structured `AGF_XXX_YYY` code in the message. | Each call site requires an `// agf-allow:console <reason>` marker. |
| `console.log` | **Forbidden** in `engine/**` and `examples/**/src/**`. Use `runtime.diagnostics.emit({ severity: "info", ... })` or `createDebugLogger`. | Enforced by `scripts/check-no-console-log.mjs` (S083 AGF-LOG-CI-GATE). |

The diagnostics bus is the single source of truth. Console is for
genuinely unbufferable edge cases — boot before runtime exists, plain
build scripts, tests. Anywhere else, console output is a regression.

## 3. Code naming

Format: `AGF_<DOMAIN>_<VERB>` — UPPER_SNAKE_CASE. Examples:

- `AGF_SCENE_LOAD_APPLIED`
- `AGF_BATCHING_SLOT_REUSED`
- `AGF_MESH_HANDLE_ACQUIRED`
- `AGF_ENTITY_RECREATED`
- `AGF_BOMB_FUSE_DETONATED`
- `AGF_BACKLOG_EPIC_UNKNOWN` (existing schema check error)

Stable across versions — agents grep on codes, not on free-form
prose. Add a new code rather than overloading an existing one when
the meaning shifts.

`<DOMAIN>` is the subsystem (`SCENE`, `BATCHING`, `MESH`, `ENTITY`,
`BOMB`, `BACKLOG`, …). `<VERB>` is the action / state transition
(`LOAD_APPLIED`, `SLOT_REUSED`, `HANDLE_ACQUIRED`, `RECREATED`,
`DETONATED`). The split is always at least one underscore between
domain and verb so the prefix is greppable.

## 4. Per-system debug toggle

Engine systems consume a logger via `createDebugLogger(name)`. The
factory returns a no-op when `AGF_DEBUG` does not match; otherwise
emissions land on the diagnostics bus at `severity: "debug"` /
`severity: "trace"`.

`AGF_DEBUG` accepts:
- Unset / `""` — debug + trace disabled.
- `*` — every source emits.
- `grid-movement` — only that source emits.
- `grid-movement,batching` — comma-separated allowlist.

In the browser, `AGF_DEBUG` is read from `?agf_debug=...` on the URL
(via `engine/runtime/start.ts`). In Node, from `process.env.AGF_DEBUG`.

```ts
import { createDebugLogger } from "../diagnostics/debug-logger";

const log = createDebugLogger("grid-movement");

const frameUpdate = (ctx) => {
  // … work …
  log.debug("AGF_GRIDMOVE_TICK", { moved: count, blocked: blockedCount });
};
```

## 5. Lifecycle events (auto-emitted)

The engine emits these without per-call-site opt-in. They are the
backbone agents rely on to reconstruct timelines:

| Event code | Severity | Source | Trigger |
|---|---|---|---|
| `AGF_RUNTIME_STARTED` | `info` | `runtime` | `startRuntime` resolves. |
| `AGF_RUNTIME_STOPPED` | `info` | `runtime` | `runtime.stop()` settles. |
| `AGF_SCHEDULER_SYSTEM_REGISTERED` | `info` | `scheduler` | `scheduler.register(name)` succeeds. |
| `AGF_SCHEDULER_SYSTEM_DEREGISTERED` | `info` | `scheduler` | `scheduler.deregister(name)` succeeds. |
| `AGF_SCENE_LOAD_APPLIED` | `info` | `scene` | `scene.load` command finishes — `details` carries entityCountBefore / After. |
| `AGF_ENTITY_RECREATED` | `warning` | `commands` | An `entity.create` lands a previously-deleted id in the same session. |
| `AGF_BUCKET_ACQUIRED` / `_RELEASED` | `info` | `renderer-pool` | Pool slot acquired / released. |
| `AGF_MESH_HANDLE_ACQUIRED` / `_RELEASED` | `info` | `mesh-handle-registry` | Renderer mesh handle lifecycle. |

Stories AGF-LOG-LIFECYCLE-TRACES (scheduler + scene + entity lifecycle)
and AGF-LOG-ENTITY-RECREATED (the warning code) ship the first wave.
Pool / mesh-handle events follow in a later sprint.

## 6. CI gates

| Gate | Story | What it checks |
|---|---|---|
| `npm run repo:hygiene` runs `check-no-console-log.mjs` | S083 AGF-LOG-CI-GATE | No bare `console.{log,warn,error}` in `engine/**` / `examples/**/src/**` without an `// agf-allow:console …` marker. |
| Engine audit pass | S083 AGF-LOG-AUDIT-ENGINE | Existing `console.*` call sites either route through diagnostics, become debug loggers, or carry an allow-marker with rationale. |
| Preflight smoke test | S083 AGF-LOG-BOOT-NOISE-BUDGET | Booting hello-3d emits ≤ N (small) info-level diagnostics before idle, and ZERO error/warning. Catches regressions where someone adds a per-frame log to a startup path. |
| `engine doctor` Diagnostics section | S083 AGF-LOG-DOCTOR-DIAGNOSTICS | Summarises events by severity + top codes since the most recent runtime start. Agent can pivot on `engine doctor --json`. |

## 7. Why not just dump more `console.log`

- Console is unstructured — agents have to parse free-form text, no
  stable codes.
- Console doesn't survive page navigation; the diagnostics bus does
  (snapshot-able).
- Console can't be filtered by source/severity programmatically
  without browser DevTools.
- Console has no "code" pivot — searching for `AGF_BATCHING_*` is
  impossible.
- CI can't reason about console; it CAN reason about structured
  diagnostics.

## 8. Migration playbook

Existing call sites get one of three treatments:

1. **Lift to diagnostics.** Replace `console.log("…")` with
   `runtime.diagnostics.emit({ severity, code, source, message,
   details })`. Pick the appropriate severity from §1.
2. **Lower to a debug logger.** If the message is only useful when
   actively investigating, switch to `createDebugLogger(name).debug(...)`.
3. **Allow with a rationale.** Boot-time JS that runs before
   `runtime.diagnostics` exists may keep `console.*` with a marker:
   `// agf-allow:console runtime-not-yet-initialised`.

When in doubt: lift first, allow only as a last resort.
