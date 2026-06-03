# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S177 — Bot AI nuance + arena polish — finish GDP-2026-05-29-010 Layer 3, push visible cues + onboarding-grade touch-ups

Status: **active** (started 2026-06-02). Source: `backlog/sprints/S177.sprint.json`.

### Stories

- **S262-KABOOM-HUNTER-FAKE-FLEE-BLUFF** — Hunter fake-flee bluff (GDP-2026-05-29-010 Layer 3 hunter slice) _(implemented)_
  New bot-ai-bluff.ts module + BotBluffState component + integration into bot-ai-system. Hunter rolls 10% per brain tick when player is 4..10 cells away; phases are fleeing (1.5s) → approaching (until manhattan ≤ 3) → committing (forces PlaceBombRequest) → done. State drops on round-edge.
- **S263-KABOOM-COWARD-DECOY-BOMB-BLUFF** — Coward decoy-bomb bluff (GDP-2026-05-29-010 Layer 3 coward slice) _(implemented)_
  BotBluffState union widens to kind='decoy-bomb'. Phases placing-decoy → retreating (1.5s) → placing-real → done. bluffForcesBomb predicate centralises the bomb-commit edges (committing | placing-decoy | placing-real). bluffPreferredDirection adds the 'retreating' branch (vector away from player, mirrors 'fleeing'). Coward 15%/tick gate at the same 4..10 cell distance band as the hunter.
- **S264-KABOOM-MINER-FEIGN-CORNER-BLUFF** — Miner feign-corner bluff (GDP-2026-05-29-010 Layer 3 miner slice) _(implemented)_
  BotBluffKind widens to 'feign-corner'. Phases feigning (1.5s, dir={0,0}) → slipping (1.5s, dir=away) → done. Most subtle of the three bluffs — no bomb commit, pure psychological misdirection. Also fixes a dt-unit bug that was applying to all bluff kinds: the bluff advance lived inside the brain-tick cooldown gate, so passing fixedDt (1/60s) made elapsed accumulate ~12× too slowly. Switched to DECISION_INTERVAL (0.2s) so wall-clock durations match the GDP's intended timings.
- **S265-KABOOM-BLUFF-HUD-TELEGRAPH** — HUD tag shows active bluff per bot _(implemented)_
  api.status() now surfaces BotBluffState per bomber (filtered to phase != done); the kaboom.stats HUD widget appends a compact tag to each bot line — '[bait]' for fake-flee, '[decoy]' for decoy-bomb, '[feint]' for feign-corner. Lets the player read the bluff in flight without digging into devtools.
- **S266-KABOOM-PERSONALITY-SHIFT-HUD** — HUD telegraph for L2 personality shifts (complete the GDP mapping + render labels) _(implemented)_
  personalityTallyBias extended from 2 to 6 mappings (Pure Coward / Reckless Hunter / Combat Miner / Pure Miner added). New tallyBiasForDiff + shiftedPersonalityLabel pure helpers in bot-ai-tactical. api.status() surfaces shiftedLabel per bomber; the kaboom.stats HUD widget appends [reckless]/[patient]/[brave]/[fearful]/[combat]/[calm] when the bot is shifted. Bluff tag dominates when both could fire; shift falls through when there's no bluff in flight.
- **S267-KABOOM-STEP-JUMP-AUDIO** — Step-jump audio — whoosh on launch + thud on landing _(implemented)_
  audio-binding-system tracks per-bomber step-jump-tween state; false→true edge fires 'step-jump-launch', true→false fires 'step-jump-land'. audio-fx adds matching procedural synths — 80ms sine ramp-up for the launch whoosh, 70ms square low-thud for the land. Both pan via the existing positional bus. URL `?stepJumpAudio=off` suppresses the kind at the binding layer.
- **S268-KABOOM-STEP-JUMP-LANDING-POP** — Step-jump landing pop — brief Transform.scale impulse on landing (in addition to the S182 squash arc) _(implemented)_
  bomber-height-lift-system tracks per-bomber step-jump-tween state; the TRUE→FALSE edge starts a landPopElapsedS timer at 0. The squash function multiplies the existing S182 symmetric squash by (1 - 0.18 × (1 - t)^2) over 120ms after touchdown. Pure helper landingPopScaleY exported for testing.
- **S269-KABOOM-CHAIN-REACTION-PUFF-TINT** — Distinct puff tint when a bomb is chain-triggered (vs its own fuse) _(implemented)_
  chainBombsAt sets bomb.chained=true; bomb-fuse-system copies it onto the BlastEvent; blast-propagation passes color='#7fd6ff' (cyan, matches the glow preset) to spawnPuff for every blast tile whose source event was chained. Default orange spark for normal detonations stays unchanged.
- **S270-KABOOM-BOMB-FUSE-CRITICAL-PULSE** — Bomb fuse critical-pulse — red flash on the bomb cell at fuse < 0.4s _(implemented)_
  BombComponent gains criticalPulseFired sticky flag. bomb-fuse-system fires a one-shot spawnPuff (preset spark, color #ff3030, lifetime 0.15s) the first tick fuse drops at/below 0.4s. The flag persists on the bomb to avoid re-spawning every frame between threshold + detonation.
- **S271-KABOOM-BLUFF-MESH-TINT** — Subtle accent on the bomber mesh while a bluff is active _(deferred)_
  Brief MeshRenderer.color shift on the hunter / coward / miner during their bluff phase. Picks up the bomber's palette accent so the bot LOOKS 'switched on' (visually distinct from baseline cruising). Cosmetic, not gameplay.
- **S271B-KABOOM-FLOOR-WANG-PATH** — Second terrain family — path (earth tones) — on top of S176 grass infrastructure _(implemented)_
  Closes a slice of GDP-2026-05-28-012 (5 terrain families). path-variants.ts builds 4 thin earth-tone slabs mirroring grass-variants. wang-family-lookup adds pathBitmaskToVariant (re-uses the 16→4 table). register-wang-families adds PATH_WANG_FAMILY='kaboom-path'. register-block-builders adds PATH_VARIANT_KEYS + builder registration. bootstrap-helpers' FloorTerrainFamily union widens to include 'path' + wangFamilyFor returns kaboom-path. scene-extensions schema enum gains 'path'. Authors can now use 'path' alongside 'grass' in any scene's terrainmap[][] field.
- **S272-KABOOM-FLOOR-WANG-STONE-DIRT** — Two more floor terrain families — stone (grey) + dirt (rust) _(implemented)_
  Continuation of GDP-2026-05-28-012. After S176 grass + S271b path, ships the third + fourth families. stone-variants.ts (cool grey #777a82) + dirt-variants.ts (rust #8a5a3a) follow the exact shape of grass-variants/path-variants. wang-family-lookup gains stoneBitmaskToVariant + dirtBitmaskToVariant. register-wang-families adds STONE_WANG_FAMILY + DIRT_WANG_FAMILY. register-block-builders adds STONE/DIRT_VARIANT_KEYS + 8 builder registrations. bootstrap-helpers' FloorTerrainFamily widens to all 5 families. Schema enum gets 'stone' + 'dirt'. With this slice authors can use all 5 floor families authored via `terrainmap`.
- **S273-KABOOM-OUTLINE-OCCLUDER** — Outline-occluder shader for bombers (GDP-2026-05-28-014 V0) _(implemented)_
  Schema extension: MeshRenderer gains optional depthFunc/depthWrite/transparent/opacity/polygonOffset fields exposing the S184 ThreeRenderAdapter outline plumbing. material-binding-system forwards them through setMeshMaterialPatch. New kaboom system bomber-outline-system spawns a `<root>.torso-outline` duplicate per bomber parented to the torso, using the same procedural mesh ref + the bomber's palette colour + depthFunc='greater' + depthWrite=false + transparent + opacity 0.85 + polygonOffset {-1,-1}. Result: each bomber's torso renders a coloured silhouette when occluded by hard / soft blocks. URL `?occluderOutline=off` disables.
- **S273B-KABOOM-SPRINT-CLOSE-HOUSEKEEPING** — Sprint S177 close — archive proposals + render backlog views _(pending)_
  Mark S177 archived, set archivedAt + prUrl, archive any proposal files closed by the sprint slices (e.g. GDP-2026-05-29-010 once all three bluff types ship; GDP-2026-05-28-012 with 4/5 families shipped; GDP-2026-05-28-014 V0), and re-run backlog:render so BACKLOG.md / BACKLOG_ARCHIVE.md regenerate from the JSON.
- **S277-OUTLINE-OCCLUDER-V2-VIEWPORT-LINEAR-DEPTH** — Outline-occluder V2 — WebGPU viewport-depth NodeMaterial + linear-depth smoothstep (replaces S273-275 stencil attempts) _(implemented)_
  S273/S274/S275/S276 tried stencil-based outline-occluders on the WebGL path — none worked because kaboom-crew runs on WebGPU where the WebGL stencil buffer never activates. S277 rewires the feature: a new engine `render.outline-occluder` system swaps the existing WebGPU TSL `createOutlineOccluderViewportMaterial` (S187) onto every entity with `OutlineOccluder { color, opacity, softEdge }`. Material now compares LINEAR depth (`viewportLinearDepth` + `linearDepth()`) instead of NDC so a fixed `softEdge` reads in metres-equivalent units and works the same near the camera and at the far plane — the original NDC-units variant returned ~0 opacity for typical cross-wall deltas, which is why the silhouette was invisible. NodeMaterials are de-duplicated by (color, opacity, softEdge) → 4 WebGPU pipelines for a 4-bomber match instead of 40, fixing the FPS regression. Kaboom-side: `bomber-outline-system` spawns 10 `<part>.outline-occluder` duplicates per bomber (LimbPivots root); `bomb-outline-system` spawns one `<bombId>.outline-occluder` per placed bomb tinted in the placer's palette colour. URL gate: `?occluderOutline=off` disables.

### Out of scope

- Outline-occluder shader (GDP-2026-05-28-014) — sketched in proposals but the shader pass is a meaty separate slice; lands in a future sprint
- Engine billboard primitive (GDP-2026-05-27-008) — foundation work, deferred until a concrete consumer needs it
- Wang 2-corner tiles / cliff-face Wang / per-biome geometry (GDP-2026-05-29-005..007, GDP-2026-05-30-003) — visual-heavy, separate sprint
- Multi-bot in connected mode (GDP-2026-05-27-003) — networked, separate sprint
- Multiplayer parity sweep (GDP-2026-05-27-010) — networked, separate sprint
- Step-jump pathfinding cost adjustment (1.2× hop cost in GDP-2026-05-28-015) — the visible animation is what the user feels; tuning bot pathing for steps stays a stretch slice for after Player UX work

### Notes

- Closes the remaining slices of GDP-2026-05-29-010 Layer 3 (Coward decoy bomb, Miner feign-corner) on top of the S262 Hunter fake-flee. Then a polish wave: HUD telegraph for the personality-shift state (Layer 2 already wired, but no visible signal yet), audio + landing-pop for the S181/S182 step jump, and a chain-reaction cue distinct from the regular S243 bomb-place puff so bombers can read 'this was triggered by another bomb' at a glance.
- Single sprint branch (`sprint/177-bot-ai-nuance`) — stories ship as atomic commits, single PR at sprint close. Each story keeps its own commit body + acceptance line so the QA terminal can match a verification line per slice.
- Sprint size 10 (matches the post-2026-05-13 doubled default per feedback-sprint-size). Mix is ~5 gameplay-mechanic + ~5 polish so the bot-AI nuance work has a clear visible payoff in the same release window.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
