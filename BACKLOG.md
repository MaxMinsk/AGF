# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S088 — Render-pool warmup + unification + Kaboom Crew polish r3

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S088.sprint.json`.

### Stories

- **AGF-POOL-INVENTORY-API** — runtime.pools.inventory() lists every render pool's live/peak/capacity _(pending)_
  Surface a programmatic accessor on the runtime handle so an agent can ask which pools exist + how loaded they are. Mirrors AssetRegistry.inventory() shape. The adapter (`ThreeRenderAdapter`) already owns three RenderPoolRegistry instances (instanced, batched, particle); add a `pools(): ReadonlyArray<{ name; live; capacity; peak }>` method on the adapter and plumb it through RuntimeHandle. Includes a programmatic test that confirms peak increases as buckets are acquired and stays high after release.
- **AGF-POOL-INVENTORY-PROBE** — GET /__agf/pool-inventory exposes the same shape over the dev bridge _(pending)_
  Mirror the S86 asset-inventory probe: dev bridge route `/__agf/pool-inventory` returns JSON identical to runtime.pools.inventory(). Lets the live-debug Playwright skill grab pool state in a single curl. Documented in docs/agent-probes.md.
- **AGF-PARTICLE-PREWARM-SYSTEM** — ParticleEmitterSystem accepts `preWarmPresets` for engine-level warmup _(pending)_
  S85 AGF-POOL-WARMUP-PARTICLES shipped as a project-local hack (kaboom-crew spawns a hidden offscreen ParticleEmitter on attachUi to force shader compile). Promote it: the engine ParticleEmitterSystem factory accepts `preWarmPresets?: ReadonlyArray<string>` and on the first frame creates + destroys a single tiny emitter per requested preset, so the shader compile + GPU buffer upload happens before any gameplay emit. No more project-local warmup entities; kaboom-crew passes `["spark", "glow"]` instead.
- **AGF-POOL-DOCTOR-SECTION** — engine doctor surfaces a Pools: section _(pending)_
  Read the project's render-pool inventory at doctor-run time and print a 'Pools:' section: per pool, `name live/capacity (peak N)`. Recommendation when a particle preset has `peak === 0` after >1 s of runtime (warmup ran but the project never emitted that preset — dead preset). Doctor unit test confirms the section renders for a fixture inventory.
- **AGF-POOL-INVENTORY-TEST** — Unit test for RenderPoolRegistry peak + capacity tracking _(pending)_
  RenderPoolRegistry ships acquire/release but no test covers the peak-tracking invariant introduced by AGF-POOL-INVENTORY-API. Add: acquire bumps peak; release does NOT decrease peak; reset() drops to 0; capacity reflects the underlying Map.size before peak retention.
- **KABOOM-DROP-LOCAL-WARMUP** — kaboom-crew drops the project-local warmup entity _(pending)_
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
