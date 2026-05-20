# Characters and Visual Direction — Kaboom Crew

> **Status: living.** First pass: 2026-05-20.
> Companion to `gdd.md`. This doc owns the "what should it LOOK like"
> question for Kaboom Crew avatars. When the GDD and this doc disagree,
> this doc is the more specific source.
>
> Constraints baked into every choice here:
> - **No artist on the team.** Anything that requires hand-authored
>   meshes, textures, or animation clips is rejected.
> - **Engine sample first.** Visual choices should showcase what AGF can
>   do (shaders, IK, springs, deterministic seeds), not what a content
>   pipeline can produce.
> - **Readable from a 55–65° top-down camera.** Silhouette and colour
>   identity carry the gameplay information — not face detail.

---

## 1. Decision summary

| Question | Decision | Why |
|---|---|---|
| Authored vs procedural mesh | **Procedural** | No artist; consistency with the rest of the AGF showcase. |
| Authored vs procedural animation | **Procedural** | Same reason. Also lets the same animation system drive arbitrary generated body proportions. |
| Mixamo / Adobe pipeline | **Out of scope** | See §3 below for the full trade-off — short version: Mixamo locks the rig, makes generated body variation painful, and adds an external dependency that contradicts the "framework with no art deps" pillar. |
| CC0 character packs (Kenney, Quaternius, etc.) | **Out of scope for the player avatar.** Allowed for **arena props** (crates, decorative blocks). | The avatar IS the procedural-character showcase. Importing a CC0 mesh defeats the point. |
| Rigged GLB humanoid skeleton (without Mixamo, hand-authored) | **Out of scope** | Same reason as Mixamo — fixes the rig, fights the generator. |

If a future story tries to violate any of these, push back and ask the
user to amend this doc first.

---

## 2. The procedural character pipeline (target shape)

This is the design intent, not implementation. Dev will turn it into
schemas + systems in the right MVP.

### 2.1 Inputs

A character is fully described by a `CharacterRecipe`:

```text
CharacterRecipe {
  seed: u32,                  // deterministic — same seed, same character
  archetype: "humanoid" | "drone" | "puffball",
  proportions: {              // continuous, generator-clamped
    torsoHeight: 0.7..1.3,
    headSize:    0.7..1.3,
    legLength:   0.7..1.3,
    armLength:   0.7..1.3
  },
  palette: {                  // derived from seed if absent
    primary:   "#hex",
    secondary: "#hex",
    accent:    "#hex"
  },
  accessories: ["antennae" | "visor" | "backpack" | "cap" | "fins" | ...]  // 0..3 slots
}
```

That's the entire surface. Twelve values + an accessory list. Easy to
serialize, easy for an agent to mutate, easy to spawn at runtime.

### 2.2 Output (per-character)

Generation produces a **node tree**, not a single mesh:

```text
character.root
├── torso       (capsule mesh, primary colour)
├── head        (sphere or rounded-box mesh, primary + secondary stripe)
├── armL, armR  (two short cylinders + small sphere "fist" each)
├── legL, legR  (two short cylinders + small sphere "foot" each)
└── accessories (one mesh node per accessory, parented to torso / head)
```

Each node is a regular Three.js Mesh under a parent Object3D — i.e. the
existing `MeshRenderer` / `Transform` ECS surface. The animation system
mutates each node's local `Transform.position` / `Transform.rotation` —
no rig, no bones, no `SkinnedMesh`.

This is the key trick: by composing the body out of separate nodes
instead of one skinned mesh, we get rig-free animation. There's no
weight-painting step, no bone hierarchy to author, no .anim files. The
"rig" is the parent-child tree the generator already produces.

### 2.3 Variation budget

Order-of-magnitude variation from the recipe alone:

- 3 archetypes × 4 proportion dimensions (3 buckets each) × 3 palette
  hue families × 5 accessory slots (3 of 8 chosen) ≈ **a few thousand
  visibly distinct silhouettes**.

That's more than enough for Kaboom Crew's lifetime — it's a 1–4 player
arena, not an MMO.

### 2.4 Engine consumption

The generator is just another `engine generate` template (same shape as
the existing `kaboom-arena-small.gen.mjs`). At runtime, the bootstrap
spawns the recipe → mesh tree → mounts it under the bomber entity. No
binary asset pipeline. No `.fbx`/`.glb` import step for characters.

---

## 3. Animation: procedural vs Mixamo

The user asked specifically whether Mixamo is worth considering. It
isn't, but the reasoning should be on the record so we don't relitigate.

### 3.1 What Mixamo would buy us

- A library of ~200 motion clips (walk, run, idle, hit, death, jump,
  dance) for free.
- Studio-quality timing — humans choreographed each clip.
- A standard humanoid rig that lots of online tutorials assume.

### 3.2 What Mixamo would cost us

| Cost | Detail |
|---|---|
| **Fixed humanoid skeleton** | Mixamo only animates the Adobe humanoid rig. Every character must be a `SkinnedMesh` bound to that exact rig. The proportions sliders in §2.1 become risky: stretching limbs warps the skin. Drone and puffball archetypes don't fit at all. |
| **Authored mesh + weight paint required** | Mixamo can auto-rig a humanoid GLB, but we'd still need the GLB. A procedural mesh generator producing skinned humanoids is harder than producing a node-tree of primitives — and we'd be writing it just to feed Mixamo. |
| **External-pipeline dependency** | Mixamo is an Adobe product. The repo would have a "drop GLBs into Mixamo, download .fbx, convert to GLB" step that no automated agent can run. The whole AGF philosophy is "an agent can edit, validate, run" — Mixamo breaks that. |
| **Aesthetic monoculture** | Every Mixamo game looks like a Mixamo game. The same 200 clips, the same humanoid timing. The flagship sample should look distinct. |
| **Doesn't solve the 4 non-locomotion moments** | Bomb-place arm reach, kick contact, remote-detonate gesture, slapstick death — these are gameplay-specific. Mixamo's generic clips don't have them. We'd still write custom animation for the moments that matter. |

### 3.3 What procedural buys us

A small set of ECS systems covers every animation Kaboom Crew needs:

| Motion | System | Cost |
|---|---|---|
| **Idle bob** | `IdleAnimationSystem` — sine wave on `torso.position.y`, period ~1 s, amplitude ~2 cm. Plus a slow `head.rotation.y` sway. | ~30 LOC |
| **Walk cycle** | `WalkAnimationSystem` — when GridMover.speed > 0, drive `legL` / `legR` rotation around X with opposing sine waves; `armL` / `armR` opposite to legs; `torso.rotation.y` sways toward walk direction. Phase advances with movement velocity, not wall clock — slow-walking bot animates slowly. | ~80 LOC |
| **Bomb-place reach** | `BombPlaceAnimationSystem` — on `PlaceBombRequest`, Tween the chosen arm's rotation toward a "drop" pose over 0.18 s, hold 0.05 s, return to neutral. | ~40 LOC (Tween already exists) |
| **Hit recoil** | `HitRecoilSystem` — on `BlastEvent` that hits this bomber, Tween `torso.rotation.x` by −0.4 rad over 0.1 s and back. | ~30 LOC |
| **Slapstick death** | `DeathAnimationSystem` — on `alive` flip, the launch + spin tween from `GDP-2026-05-20-004`. Optionally scatter limb nodes with spring physics for the ragdoll feel. | ~80 LOC (Tween + a tiny spring helper) |
| **Backpack / antenna sway** | `SpringSwaySystem` — generic two-tap spring on any node tagged "soft-attached". One system covers every dangly accessory across every character variant. | ~60 LOC |

Total: ~300 lines of code, six small systems. Each is independently
testable. No external assets. No Mixamo round-trip. No rig binding.

**Bonus**: every one of these systems is also a useful engine
showcase. Spring physics for accessories, IK for legs, Tween for
events — these are reusable primitives that AGF can promote out of
`examples/kaboom-crew/` into `engine/` once a second project asks.

### 3.4 Hybrid? (No, but here's the consideration that closed it)

A reasonable middle path is "procedural body + Mixamo locomotion
clips". It loses cleanly:

- The Mixamo clips are for the Adobe humanoid skeleton; you'd still
  need to skin the procedural body to that skeleton. We're back to
  point 2 of §3.2.
- The procedural body's proportions sliders distort the skin.
  Mixamo's clips weren't designed for variable proportions.
- One of the cited Mixamo wins ("studio-quality timing") evaporates
  the moment the skin distorts.

The hybrid sounds nice in the abstract but every concrete attempt
collapses back into "actually it's a Mixamo project with a body
randomiser". Skip.

### 3.5 What we lose by going procedural

Honest list — these are the costs we're accepting:

- No **realistic** locomotion. The bombers will look "toy-like", not
  human. That's consistent with the GDD's "chunky toy-scale industrial
  diorama" art direction, so it's a feature not a bug — but if the
  user later asks for "realistic", the answer is "we'd have to revisit
  this whole doc."
- Animation quality is **linear in code we write**, not in clip
  libraries we import. Polish takes engineer-time, not artist-time.
- No upper-body acting (subtle face expressions, finger curls). The
  characters communicate through silhouette, colour and motion only.

---

## 4. Visual direction (without an artist)

### 4.1 Silhouette

The single most important visual property. The bomber must be readable
from a 55–65° camera angle as one of N possible silhouettes — and the
exact accessory matters less than the overall shape.

Rules:

1. **Vertical bias, no thin parts.** Everything readable from above
   must be at least 0.15 m thick. Antenna is the only exception, and
   it gets emissive material so it reads as a glow point.
2. **Three readable masses.** Head, torso, backpack. A bomber without
   one of those reads as "missing chunk" from above. Legs are NOT in
   this list — at top-down 55°, legs are ~10% of pixel area.
3. **Asymmetry is information.** Anything asymmetric on the silhouette
   (backpack on one side, antenna at one angle) is a gameplay tell
   the player will learn to read. Use this sparingly and only when
   you want the player to learn it.
4. **No silhouette overlap between bombers.** Two bombers in the same
   round must not share an accessory set. The generator should enforce
   this — different seeds → different silhouettes by construction.

### 4.2 Colour language

The hardest single thing to get right without an artist, and the
cheapest to debug because it's all hex codes in data.

| Element | How colour is chosen |
|---|---|
| **Primary** (torso) | One of 8 fixed hues at fixed saturation/value (HSL `h = 0/45/90/135/180/225/270/315, s = 70%, l = 50%`). Each bomber in a round picks a different one. |
| **Secondary** (head trim, accent stripes) | Primary's complement (180°). |
| **Accent** (emissive — antennae, eyes, backpack core) | Always the same project-wide colour: bright cyan `#33ffff`. This is the "energy" colour and signals "interactable / important". |
| **Material darkening** | Bottom edge of every mesh gets a darker variant of the primary (multiply by 0.6). Reads as occlusion-shadow without needing a shadow pass. |
| **Death** | A 0.2 s desaturation tween — Primary → grayscale — fires alongside the slapstick death (GDP-004). Makes "I died" instantly readable. |

The 8-hue ring also drives the minimap marker colour and the
particle-burst colour on that bomber's blast — visual identity is
**consistent** across HUD, world, and feedback events.

### 4.3 Materials and shaders

Three shader profiles cover everything:

1. **`character-toon`** — character meshes. Two-step toon shading:
   light hemisphere + shadow hemisphere, hard step between them. Rim
   light around the silhouette (fresnel * accent colour, low intensity)
   so bombers pop against the floor. Costs: trivial, runs on WebGL +
   WebGPU.
2. **`block-solid`** — arena blocks. Flat colour with a darker bottom
   strip (same multiply trick as 4.2). One material variant per block
   type (hard / soft).
3. **`pickup-glow`** — pickups and emissive accents. Bright fresnel +
   a slow pulsing emissive bump. Reuses the existing Tween system to
   modulate the emissive intensity.

That's it. Three shaders, all small enough to live in
`examples/kaboom-crew/src/shaders/`. No HDRI, no PBR, no light baking.

### 4.4 Particles and VFX

Already covered in MVP-1 — blast particles ship. The procedural
character side adds:

- **Footstep puff** — when a leg's down-phase lands during walk
  animation, emit a tiny 0.1 s ground puff. Reuses the existing
  ParticleEmitter. Adds liveliness for almost no cost.
- **Backpack jiggle particles** — every ~1 s while moving, emit a
  single dust particle from any accessory tagged "soft-attached".
- **Pickup-collect sparkle** — already-planned blast particle preset
  reused with a different colour.

### 4.5 Asset budget (compared with an authored pipeline)

| Resource | Authored game (typical) | Kaboom Crew (procedural) |
|---|---|---|
| Character meshes | 4–8 `.glb` files (~5–20 MB each) | 0 |
| Character textures | 4–8 albedo + normal + roughness (~5 MB each) | 0 |
| Animation clips | ~30 `.anim` / clips per character (~1 MB each) | 0 |
| Rig file | 1 per archetype | 0 |
| **Total per-character footprint** | ~50–100 MB | **~3 KB** (the recipe JSON) |

That table is the strongest single argument for procedural. The
character footprint becomes negligible — the limiting factor on
character variation is generator code, not asset hosting.

---

## 5. What this enables for proposed-stories

Concrete game-design proposals this doc unlocks (do not promote yet,
this is just the option set):

1. **Starter procedural character generator** — capsule + sphere +
   accessory composition, 3 archetypes, recipe schema, palette
   derivation. Replaces the current static `player.prefab.json` /
   `bot.prefab.json` meshes with generator output.
2. **Procedural animation systems pack** — the 6 systems listed in §3.3.
   Lands as one sprint after the generator (animation needs the node
   tree to exist first).
3. **Customisable bomber recipe** — `?recipe=<base64-json>` URL param
   so a player can fork-and-share their bomber. Low cost once #1 ships.
4. **Bot-vs-player visual distinction** — bots always pull from a
   subset of the accessory pool (e.g. only "antennae" and "visor"),
   players from the rest. Gameplay-meaningful silhouette: the player
   instantly knows which bombers are AI.

Items 1 and 2 are the right size for next-sprint proposals once the
multiplayer foundation (GDP-2026-05-20-007) has a landing date. Until
then, the prototype's capsule + sphere bombers are fine.

---

## 6. Resolved questions (2026-05-20)

The four open visual questions are answered. Recording the decision +
the reasoning so future sessions don't have to re-derive them.

### 6.1 Archetypes — humanoid first, others reserved

**Decision: humanoid only in the starter generator.** Drone and
puffball stay in the schema as future enum values but the generator
does not produce them yet. User position: "not finally decided" —
this is a "ship one, evaluate, then expand" call.

Consequence for the generator:
- Recipe schema keeps the `archetype` field with the full enum.
- Starter generator implements `archetype: "humanoid"` only and
  throws / falls back on the others.
- When a non-humanoid bot is needed (e.g. the "Monster" bot from
  `notes/DynaBomber.md §13.1`), the relevant archetype lands as a
  follow-up story — same recipe schema, different mesh composer
  function.

### 6.2 Recipe URL — debug + agent-probe only, NOT a user share-feature

**Decision: `?recipe=<base64-json>` works for debug and agent control,
does not appear in UI, is not covered by user-facing acceptance
tests.** User left the call to me; this is the recommendation.

Reasoning:
- Agent-driven testing: `?recipe=...` lets a Playwright probe or QA
  test pin a specific bomber appearance deterministically. That's
  unambiguously valuable today.
- Schema stability: if `?recipe=...` is advertised as "share your
  bomber with friends", every recipe-format change becomes a breaking
  change for that user surface. We're not paying that cost before
  there's a player base.
- Cheap to upgrade later: when multiplayer lands and there's a real
  share-with-friends moment, promoting the URL to a marketed
  share-link is a docs-and-UI change, not a re-architecture.

Implementation hint:
- Bootstrap parses `?recipe=...` on attach; if present, applies to
  `player.1` after the static prefab loads.
- Agent surface: `window.__agf.kaboom.spawnWithRecipe(entityId, recipe)`
  parallel to the existing `gotoCell` / `placeBomb` probes.
- No HUD button to copy/share the recipe. No README section about
  recipe URLs in the MVP-2 docs.

### 6.3 Cosmetic unlocks — yes, but MVP-3+ scope

**Decision: cosmetic unlocks are in the long-term plan, NOT in
MVP-2.** User confirmed "yes". This unlocks a tier of design work:
unlock conditions, achievement tracking, persistent player profile.

Critical scope guardrails:
- **Cosmetic ≠ live-service.** No daily challenges, no battle pass,
  no monetisation. The Brawl-Stars-line in §3 of the GDD ("no
  live-service progression economy") still stands. Unlocks are
  "play X games → an accessory becomes available in your recipe
  pool", full stop.
- Requires a **persistent player profile** to exist first. Local
  storage works for offline play; the connected / authoritative
  profile (GDP-2026-05-20-007) lets unlocks cross devices.
- Reasonable first set of unlock conditions: "won 1 round", "won 10
  rounds", "killed yourself with your own bomb 5 times" (achievement
  for the slapstick death animation), "survived a chain reaction".
- Each unlock adds an accessory to the recipe pool — it doesn't
  change stats. Cosmetic-only is non-negotiable; stats-on-cosmetics
  drift into pay-to-win territory and the GDD's "agent-friendly
  rules" pillar wants gameplay decided by data, not by accumulated
  hidden modifiers.

This is **not promoted into a proposed-story right now** — it depends
on multiplayer + persistent profile landing first. The decision is
captured here so dev sees the intent before designing the profile
schema.

### 6.4 Procedural vocal synth — yes, ships as its own story

**Decision: a small procedural vocal synthesiser drives a tiny
vocabulary of bomber grunts.** User confirmed "yes". Promoted into
proposal GDP-2026-05-20-010.

Design intent:
- Five emotional slots: `place-bomb`, `hit`, `pickup`, `death`,
  `victory`. (Victory fires when the round resolves in this
  bomber's favour.)
- Each bomber has a "voice colour" derived from their recipe seed —
  a base pitch + a base timbre (sine vs saw vs triangle) + an
  envelope shape. Same seed → same voice, always.
- Slot expressions are short (< 0.4 s) and procedurally generated by
  the synth at play time; no pre-rendered audio assets.
- Implementation surface: a `VocalSynthesisSystem` that subscribes
  to existing audio-event triggers (`bomb-place`, `blast`, etc.)
  and emits one synth note alongside the existing clip. Doesn't
  replace the clip — adds the voice on top.
- Out of scope: speech, longer-form taunts, custom voice slots per
  player. The synth's job is "the bomber has a tiny vocal
  personality". Talking bombers are a separate creative direction.

See `GDP-2026-05-20-010.story-proposal.json` for the dev-facing
breakdown.

---

## 7. Future open questions (visual)

The §6 set is closed. New ones, lower priority:

1. **Bot vocal vs player vocal — same synth or different?** Probably
   same synth, different seed pool — bot voices skew toward harsher
   timbres so the player can hear "an AI bomber is near" without
   looking. Decide when GDP-010 lands.
2. **Slapstick death intensity vs procedural-character variant
   readability.** A ragdoll body of separate primitive nodes scatters
   well; a one-piece body doesn't. GDP-009 (animation pack) needs to
   confirm the ragdoll-friendly composition.
3. **Recipe migration story.** When the schema changes in v2 of the
   generator, what happens to a v1 recipe? Cheap: silently fall back
   to defaults for unknown fields. Expensive: write a migrator. Don't
   solve until v2 actually arrives.
