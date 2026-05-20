# Agent debug recipes

This is the **cookbook** for the `/__agf/*` dev-bridge probes. See `docs/agent-probes.md` for the **reference** — every route, every payload shape, every error code.

Each recipe below is a real debugging flow an agent hits while developing or QA'ing a game project. Copy the curl, sub in the right ids, read the response.

Default base URL is `http://localhost:5173`; substitute whatever Vite picked when it booted.

---

## 1. Grab browser logs FIRST when a live bug is reported

Before forming any theory, pull the captured `console.*` ring. WebGPU validation surfaces here as `console.warn` and is invisible to `pageerror`-only tools.

```bash
curl -s http://localhost:5173/__agf/console-log | jq '.payload.lines[-30:]'
```

**See also:** [`GET /__agf/console-log`](agent-probes.md#get-__agfconsole-log).

---

## 2. "Did this component change in the last tick?"

Diff the live snapshot against the previous fixedUpdate's snapshot. Empty diff means nothing relevant changed; the entries point at every entity / component that did.

```bash
curl -s 'http://localhost:5173/__agf/snapshot?at=-1&diff=1' | jq '.payload.entries'
```

If you want a wider window, go further back: `?at=-5&diff=1` is "what's changed in the last 5 fixed-update steps."

**See also:** [`GET /__agf/snapshot?at=-N&diff=1`](agent-probes.md#get-__agfsnapshot--get-__agfsnapshotat-n) (S096).

---

## 3. "What's the value of one specific component RIGHT NOW?"

Skip the full snapshot — fetch a single component on a single entity.

```bash
curl -s 'http://localhost:5173/__agf/component/player.1/BomberStats' | jq '.payload.value'
```

Add `?at=-N` to read the historical value at the same lookup index used by `/snapshot?at=`.

```bash
curl -s 'http://localhost:5173/__agf/component/player.1/BomberStats?at=-3' | jq '.payload.value'
```

Error codes worth recognising:

- `404 AGF_PROBE_ENTITY_NOT_FOUND` — entity id is unknown (typo, despawned, never spawned).
- `404 AGF_PROBE_COMPONENT_NOT_FOUND` — entity exists but doesn't carry the component (e.g. pickups don't carry BomberStats).
- `400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE` — `?at=-N` exceeds the 32-entry ring.

**See also:** [`GET /__agf/component/<entityId>/<componentName>`](agent-probes.md#get-__agfcomponententityidcomponentname) (S096).

---

## 4. "Did a one-shot event fire? Footstep / blast / pickup?"

One-shot gameplay events drop transient components (e.g. `BlastEvent`) for a single frame. Easiest way to confirm one fired during the last tick is to diff:

```bash
curl -s 'http://localhost:5173/__agf/snapshot?at=-1&diff=1' \
  | jq '.payload.entries | map(select(.kind == "entity.added" or .kind == "entity.removed")) '
```

For events the audio-binding-system handles (S091 KABOOM-AUDIO-POSITIONAL-ADOPT covers footstep / blast / death), the captured browser log (recipe #1) also shows the synth path.

---

## 5. Look at the scene from a god view without changing the project

Use the renderer's free-fly camera override to inspect blast aftermath, off-screen entities, prefab layouts. Toggle off when done; the project's normal camera takes over again.

```bash
# Bird's-eye view of the arena.
curl -X POST 'http://localhost:5173/__agf/render/freecam' \
  -H 'Content-Type: application/json' \
  -d '{"position":[5, 18, 5], "lookAt":[5, 0, 5]}'

# Take a screenshot here via your harness (Playwright, etc.).

# Release the override.
curl -X POST 'http://localhost:5173/__agf/render/freecam' \
  -H 'Content-Type: application/json' \
  -d '{"off":true}'
```

**See also:** [`POST /__agf/render/freecam`](agent-probes.md#get-__agfrenderfreecam--post-__agfrenderfreecam) (S095).

---

## 6. "Why is this geometry / material wrong?"

Flip the renderer's debug material override. The next frame is rendered with the chosen substitute material; flipping back to `off` restores every original material exactly.

```bash
# Reveal over-tessellation.
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"wireframe"}'

# Find flipped triangles.
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"normals"}'

# Catch UV / atlas packing bugs.
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"uv"}'

# Restore.
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"off"}'
```

A topRight HUD pill labelled `DEBUG: <mode>` stays visible while a mode other than `off` is active, so the override doesn't quietly stay on.

**See also:** [`POST /__agf/render/debug-mode`](agent-probes.md#get-__agfrenderdebug-mode--post-__agfrenderdebug-mode) (S091).

---

## 7. "I want to capture this run for a regression artifact"

Start a recording, exercise the bug, stop, save. The returned blob is the canonical input to `engine replay`.

```bash
# Start.
curl -X POST 'http://localhost:5173/__agf/recording/start'

# (Reproduce the bug — drive inputs, fire commands, whatever.)

# Confirm the recorder is live.
curl -s 'http://localhost:5173/__agf/recording/list' | jq '.payload.recordings'

# Stop, save the JSON.
curl -X POST 'http://localhost:5173/__agf/recording/stop' > /tmp/repro.json
```

**See also:** [`POST /__agf/recording/start`](agent-probes.md#post-__agfrecordingstart--post-__agfrecordingstop) (Sprint 28), [`GET /__agf/recording/list`](agent-probes.md#get-__agfrecordinglist) (S096).

---

## 8. "Slow / freeze the simulation so I can step through this"

The time-scale dial multiplies the wallclock dt before any system tick. `0.05` is slow-mo; `0` is paused; `4` is fast-forward. Clamped to `[0.05, 4]`.

```bash
# Pause-like behaviour (slowest allowed).
curl -X POST 'http://localhost:5173/__agf/runtime/timescale' \
  -H 'Content-Type: application/json' \
  -d '{"value":0.05}'

# Normal speed.
curl -X POST 'http://localhost:5173/__agf/runtime/timescale' \
  -H 'Content-Type: application/json' \
  -d '{"value":1}'

# Read the current scale.
curl -s 'http://localhost:5173/__agf/runtime/timescale' | jq '.payload.scale'
```

Pair with recipe #2 (snapshot diff at slow speed) to see exactly what changes between any two consecutive fixed steps.

**See also:** [`POST /__agf/runtime/timescale`](agent-probes.md#get-__agfruntimetimescale--post-__agfruntimetimescale) (S090).

---

## 9. "Mute / dial down audio while I debug"

The master dial multiplies per-call volume on every subsequent `play()`.

```bash
# Silence subsequent plays (clips already playing keep their volume).
curl -X POST 'http://localhost:5173/__agf/audio/master-volume' \
  -H 'Content-Type: application/json' \
  -d '{"value":0}'

# Half volume.
curl -X POST 'http://localhost:5173/__agf/audio/master-volume' \
  -H 'Content-Type: application/json' \
  -d '{"value":0.5}'

# Restore.
curl -X POST 'http://localhost:5173/__agf/audio/master-volume' \
  -H 'Content-Type: application/json' \
  -d '{"value":1}'
```

**See also:** [`POST /__agf/audio/master-volume`](agent-probes.md#get-__agfaudiomaster-volume--post-__agfaudiomaster-volume) (S095).

---

## 10. "Are there any rendering pool leaks?"

The renderer reports live + peak counts per pool. Live should track what you expect on screen; peak should be sane (a leak shows as peak >> live over time).

```bash
curl -s 'http://localhost:5173/__agf/pool-inventory' | jq '.payload'
```

For mesh-handle leaks specifically:

```bash
curl -s 'http://localhost:5173/__agf/renderer-inspect' | jq '.payload.info.handleLeak, .payload.handles'
```

`handleLeak > 0` means there are mesh handles the renderer is holding for which the corresponding `RenderMeshHandle` ECS component is gone. `payload.handles.entityIds` is the explicit list — grep against it to find the orphan.

**See also:** [`GET /__agf/pool-inventory`](agent-probes.md#get-__agfpool-inventory) (S088), [`GET /__agf/renderer-inspect`](agent-probes.md#get-__agfrenderer-inspect) (S083).

---

## 11. Filing a feature proposal (game-design agent)

S097 GAME-DESIGN-AGENT epic. The game-design / product-owner agent loop is:

1. Re-read [`docs/game-design/gdd.md`](game-design/gdd.md) (the Game Design Document) and the last archived sprint in `BACKLOG_ARCHIVE.md`. Reconcile intent against what actually shipped.
2. Scaffold a ticket — auto-allocates the next free GDP-YYYY-MM-DD-NNN slot:

   ```bash
   npm run propose:new -- "Bombs leave a scorch decal for 5s" --kind feature --priority should
   ```

   `--kind` is one of `feature | mechanic | balance | content`. `--priority` is `must | should | could`. Omit either and the ticket lands as a `TODO:` placeholder that fails `npm run backlog:check` until filled in.

3. Open the printed file and replace the `TODO:` lines: `intent` (markdown body, minLength 20), `rationale` (why now), `acceptanceHints` (one-line acceptance cases the dev terminal will tighten into real verification[]).

4. Verify the ticket:

   ```bash
   npm run backlog:check
   ```

   AGF_PROPOSED_STORY_SCHEMA points at the field if anything is off.

5. **Wait.** You don't open PRs. You don't merge. The dev terminal will pick proposals up at sprint-plan time:

   ```bash
   # (run by dev) — promotes proposals into a target sprint
   npm run propose:promote -- --into S097
   ```

   `--min-priority must` filters out lower-priority entries. Promoted source files move under `backlog/proposed-stories/archive/S<NN>/`.

See [`docs/game-design/agent.md`](game-design/agent.md) for the full role + file-ownership table.

---

## See also

- [`docs/agent-probes.md`](agent-probes.md) — reference for every probe, every payload, every error code.
- [`docs/agent/debug-protocol.md`](agent/debug-protocol.md) — broader debugging workflow (when to reach for what).
- [`docs/diagnostics-policy.md`](diagnostics-policy.md) — severity scale + diagnostic code conventions.
