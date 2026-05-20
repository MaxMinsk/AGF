# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S088 — Render-pool warmup + unification + Kaboom Crew polish r3

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S088.sprint.json`.

### Stories

- **AGF-POOL-INVENTORY-API** — runtime.renderer.pools() lists every render pool's live + peak _(implemented)_
  Surface a programmatic accessor on the renderer so an agent can ask which pools exist + how loaded they are. Mirrors AssetRegistry.inventory() shape. The adapter (`ThreeRenderAdapter`) already owns three RenderPoolRegistry instances (instanced, batched, particle); add a `pools(): ReadonlyArray<{ name; live; peak }>` method on the adapter and forward via `ThreeRenderer.pools()`. Includes peak-tracking on RenderPoolRegistry so the value survives release.
- **AGF-POOL-INVENTORY-PROBE** — GET /__agf/pool-inventory exposes the same shape over the dev bridge _(implemented)_
  Mirror the S86 asset-inventory probe: dev bridge route `/__agf/pool-inventory` returns JSON identical to runtime.renderer.pools(). Lets the live-debug Playwright skill grab pool state in a single curl. Documented in docs/agent-probes.md.
- **AGF-PARTICLE-PREWARM-SYSTEM** — ParticleEmitterSystem accepts `preWarmPresets` for engine-level warmup _(implemented)_
  S85 AGF-POOL-WARMUP-PARTICLES shipped as a project-local hack (kaboom-crew spawns a hidden offscreen ParticleEmitter on attachUi to force shader compile). Promote it: ParticleEmitterSystem now takes `preWarmPresets?: ReadonlyArray<string>` + `preWarmFrames?: number`; on the first frame of every world it acquires a 1-capacity offscreen pool per preset (forcing shader compile + GPU buffer upload), then releases them after `preWarmFrames` (default 4) frames so they don't linger in the live count. RuntimeOptions exposes `particlePreWarmPresets`, plumbed from project.json's `render.particlePreWarmPresets`.
- **AGF-POOL-DOCTOR-SECTION** — engine doctor surfaces a Pools: section _(implemented)_
  Read a /__agf/pool-inventory dump from disk (via `--pool-inventory-from <path>`, mirroring the existing `--renderer-inspect-from`) and print a 'Pools:' section: per pool, `name live N, peak N`. Recommendation when any pool has `peak === 0` — warmed but never emitted into (dead preset).
- **AGF-POOL-INVENTORY-TEST** — Unit test for RenderPoolRegistry peak + reset tracking _(implemented)_
  RenderPoolRegistry ships acquire/release but no test covers the peak-tracking invariant introduced by AGF-POOL-INVENTORY-API. Add: acquire bumps peak; release does NOT decrease peak; reset() drops to 0; drain() does NOT touch peak.
- **KABOOM-DROP-LOCAL-WARMUP** — kaboom-crew drops the project-local warmup entity _(implemented)_
  Once AGF-PARTICLE-PREWARM-SYSTEM lands the project-local kaboom.warmup-particles entity is redundant. Delete the entity creation + the runtime.applyCommands hack from attachUi; kaboom-crew now relies entirely on the engine-level preWarmPresets option. Smaller bootstrap.ts; one less moving part.
- **KABOOM-WIN-CHIME** — Short procedural chime on match win/lost/draw _(pending)_
  When matchPhase flips from in-progress to won/lost/draw, audio-binding-system fires a new `match-end` AudioEventKind. audio-fx.ts adds three short procedural chimes (triumph triad / descending minor / neutral perfect-fifth). Inherits the existing volume dial. Defaults to one play per match resolution.
- **KABOOM-BOT-DANGER-AVOID** — Bot pathfinding penalises cells covered by live blasts + about-to-explode bombs _(pending)_
  Today's BotAISystem treats BlastTile cells as walkable, so the bot regularly suicides into its own blast on the wide map. Extend the cost function in agent-goto-system (or a small wrapper inside bot-ai-system) so cells containing a BlastTile OR a Bomb with fuseRemaining < 0.6 are treated as high-cost (e.g. cost 10 vs. 1). Pure cost bump — keeps the existing BFS; no new components.
- **AGF-LOG-LIFECYCLE-SCHEDULER** — scheduler.register emits an info-level AGF_SCHEDULER_REGISTER diagnostic _(pending)_
  Engine lifecycle traces follow-up from S082 — partially shipped via AGF_SCENE_LOAD_APPLIED + AGF_ENTITY_RECREATED. Closes the loop by making scheduler.register emit `info` AGF_SCHEDULER_REGISTER { systemName, phase, profile } so a snapshot reconstructs the boot-time system list without inspecting the scheduler object. No-ops in production via the diagnostics severity filter (info-level diagnostics already dropped under the default warning gate).

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
