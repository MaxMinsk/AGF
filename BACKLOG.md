# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S100 — Promote GDP power-ups + bot personality + MVP-2 epic kickoff

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S100.sprint.json`.

### Stories

- **CHORE-MVP2-EPIC-KICKOFF** — Create the MVP-2 / NETWORK / CHARACTERS epic JSONs referenced by GDP-003..010 _(implemented)_
  Game-design terminal filed 8 proposals (GDP-003 through GDP-010) referencing three epics that didn't exist yet: KABOOM-CREW-MVP-2 (mechanic depth), KABOOM-CREW-MVP-NETWORK (planned, multi-sprint), KABOOM-CREW-CHARACTERS (planned, procedural-everything pipeline). Created all three with summaries + doneCriteria + dependency notes so backlog:check stays clean once the proposals promote into stories with those epic refs. Epic statuses chosen to reflect S100's plan: MVP-2 active (4 stories landing this sprint), NETWORK + CHARACTERS planned (no work in S100).
- **KABOOM-KICK-POWER-UP** — Bumping into your own bomb kicks it one cell forward (GDP-003) _(implemented)_
  Promoted from GDP-2026-05-20-003. Power-up: collect a 'kick' pickup (4th kind, yellow boot-shaped cylinder) and BomberStats.canKick=true. Once enabled, every fixedUpdate the bomb-kick-system checks the cell ahead of each PlayerControlled bomber. If that cell contains a bomb the bomber owns AND the cell beyond is unblocked, the bomb slides one cell forward (GridPosition + Transform.position both update). The bomber continues their walk normally — the bomb just clears their path. Kick is gated on canKick + alive + currentLerp=0 + non-zero queuedDirection. Pickup, schema (BomberStats.canKick + Pickup.kind enum extended to include 'kick'), and the kick-system all ship under examples/kaboom-crew/src/.
- **KABOOM-SLAPSTICK-DEATH** — Death launch-up + spin-out tween before despawn (GDP-004) _(implemented)_
  Promoted from GDP-2026-05-20-004. Extend the existing DeathAnim tween (S90 KABOOM-DEATH-FALL — tips bomber to 90°) with a +Y launch + Y-axis spin for a more slapstick feel. Modify the death-animation-system to add a vertical hop component (Transform.position.y arcs up by ~1.5 cells over 0.4 s, then falls; gravity feel via easeOutQuad up + easeInQuad down) AND a Y-axis rotation that completes ~1 full revolution during the fall. Existing color + falling-pitch behavior stays.
- **KABOOM-BOT-PERSONALITY-VARIANTS** — Bot personality variants — Hunter / Coward / Miner (GDP-005) _(pending)_
  Promoted from GDP-2026-05-20-005. Today's bot AI has a single difficulty axis (easy/normal/hard) tuning decision cadence + aggression. Add a `personality` dial on top: 'hunter' biases bot toward shortest path to player + bomb-when-adjacent; 'coward' biases toward distance-from-bombs + place-bombs-when-cornered; 'miner' biases toward destroying soft blocks for pickups + ignores the player unless adjacent. URL: ?botPersonality=hunter|coward|miner (defaults to 'hunter' for backwards-compat with the current behavior). Implementation: extend the BotBrain component with a 'personality' field; bot-ai-system reads it + applies the corresponding decision weights.
- **KABOOM-REMOTE-DETONATE-PUP** — Remote-detonate power-up — fuse pauses, player triggers blast on command (GDP-006) _(pending)_
  Promoted from GDP-2026-05-20-006. Add a 4th pickup kind 'remote-detonate' alongside bomb-up / fire-up / speed-up. While the player carries any remote-detonate charges, newly-placed bombs spawn with `Bomb.fuseRemaining = Infinity` (paused). A new keyboard binding (F key, or InputAction 'remote-detonate') decrements the charge counter + sets every paused bomb owned by the player to fuseRemaining=0, detonating them all at once. Cap charges at 3. Lays groundwork for combo plays (4 bombs in a corridor, detonate together).
- **AGF-DOCTOR-REJECTED-INBOX** — engine doctor reports the rejected-QA-ticket count too _(implemented)_
  Companion to S099 AGF-DOCTOR-PROPOSED-STORIES + S093 QA-DOCTOR-INBOX. Today's doctor surfaces the live QA inbox + the proposed-story inbox. Add a one-line summary of `backlog/qa-tickets/archive/rejected/` (which exists per S98's DOC-QA-INVALID-TICKET-FLOW) so dev sees the size of the rejected pile at a glance — useful when triaging if dev is rejecting too many QA tickets in a row (signal of disagreement). Just the count + a hint to read the rejected/README.md if non-zero.
- **FEAT-NETWORKED-KABOOM-CREW-CON-001** — Networked Kaboom Crew (connected profile) — two browser tabs share one arena _(deferred)_
  Two browser tabs hitting the same room id share one Kaboom Crew arena via the AGF backend-agnostic protocol. First implementable shape: lockstep + input rollback on top of the fixed-step simulation, served by the Node reference backend. (GDP-007)
- **FEAT-PROCGEN-CHARACTERS-008** — Starter procedural character generator (humanoid-only) — GDP-008 _(deferred)_
  Seeded humanoid mesh generator for Kaboom Crew avatars. Replaces the primitive sphere/box bomber meshes. No Mixamo / rigged GLBs — everything generates from code (per project-procedural-characters memory). (GDP-008)
- **FEAT-PROCGEN-ANIM-SYSTEMS-009** — Procedural animation systems pack — six small ECS systems (GDP-009) _(deferred)_
  Six small ECS animation systems for character motion: idle bob, walk swing, place-bomb wind-up, hit reaction, victory pose, death rag-doll. Each lives in engine/core/systems/ + reads a generic AnimationState component. (GDP-009)
- **FEAT-PROCGEN-VOCAL-010** — Procedural vocal synthesiser — each bomber gets a tiny seed-derived voice (GDP-010) _(deferred)_
  Each bomber's BomberStats grows a `voiceSeed`. A vocal synth (new audio-fx path or extension to the existing Kaboom audio-fx) plays a short seed-derived snippet on bomb-place / hit / victory. (GDP-010)

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
