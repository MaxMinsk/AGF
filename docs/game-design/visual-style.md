# Visual Style — Kaboom Crew

> **Status: investigation.** First pass: 2026-05-20.
> Companion to `gdd.md` (which sets direction) and
> `characters-and-visual.md` (which owns the character-specific bits).
> This doc is the **broader visual language** — materials, lighting,
> VFX, camera, environment, UI — for everything that ISN'T a bomber.
>
> Constraints baked in (same as the character doc):
> - **No artist on the team.** Every visual choice must be reachable
>   via code, shaders, parameters, or CC0 building blocks.
> - **AGF showcase first.** Visuals should highlight engine
>   primitives — instancing, shaders, particles, IK, Tween — not hide
>   them behind borrowed art.
> - **Readable from a 55–65° top-down camera.** Composition assumes
>   the player never sees a bomber from below.

---

## 1. Pillars

Three pillars rank-ordered. When they conflict, the higher one wins.

1. **Gameplay readability.** Every game-important element — bomb,
   blast, player, pickup, hazard, hard block — must be readable in
   under 200 ms of gaze. Aesthetics that fight readability lose.
2. **Identity at a glance.** A frame of Kaboom Crew should be
   instantly recognisable as Kaboom Crew, not as "yet another
   low-poly arcade game". Colour ring + silhouette + emissive accent
   carry the brand.
3. **Cheap to author, deep to extend.** Every visual must be reachable
   in code (shaders, generators) or via tiny CC0 building blocks
   (kenney.nl primitives). No expensive AAA pipeline, no light
   baking, no per-asset hand polish.

---

## 2. Art direction overview

The frozen phrase is **"toy-scale industrial diorama."** That
expands to:

- **Toy-scale**: world objects feel ~10× smaller than their real-world
  referents. A bomb is a fist-sized lump, not a person-sized
  munition. Blocks look like cardboard crates the size of a brick,
  not concrete bunkers. The implication: chunky proportions everywhere,
  no thin features, no detail at < 5 cm world scale.
- **Industrial**: rivets, exposed bolts, panel seams, hazard stripes,
  galvanised steel, painted plywood. NOT clean sci-fi (no neon-noir),
  NOT fantasy (no carved stone). Think "warehouse converted into a
  game arena."
- **Diorama**: the camera always looks down at a contained playspace.
  The world doesn't extend off-camera infinitely — it ends at a
  visible boundary (wall, drop-off, glass dome). This frames every
  match as "we are watching this miniature unfold" and helps with
  the persistent-world transition (each chunk = one diorama box).

### 2.1 Five things the art direction explicitly is NOT

If a proposed visual change moves us toward any of these, push back:

1. **Realistic / photogrammetric**. We're not going to look like Call
   of Duty. Stay readable, stay chunky.
2. **Anime / cel-shaded character-focused**. We're not Genshin Impact
   either. The flat-shaded characters are READABLE, not "anime
   style."
3. **Procedurally-generated noise textures everywhere**. Procedural
   yes, noise-as-decoration no. Every texture should be flat-coloured
   or have intentional pattern (stripes, panels), never "looks
   busy."
4. **Heavy post-processing**. No SSAO, no SSR, no SSGI, no DoF, no
   motion blur. (Light bloom on emissives is OK — see §5.)
5. **Studio Ghibli / hand-painted softness**. We're industrial, not
   pastoral. Hard edges, hard lighting, primary colours.

---

## 3. Materials and shaders (broader than the character doc)

`characters-and-visual.md §4.3` listed three shader profiles for
bombers. This section completes the catalogue for the rest of the
world.

| Shader | Used by | Surface |
|---|---|---|
| `character-toon` | Bombers | Two-step toon shading + rim light. Already covered. |
| `block-solid` | Hard blocks, soft blocks, arena walls | Flat colour + darker bottom strip. Already covered. |
| `pickup-glow` | Pickups, accents on bombers | Bright fresnel + pulsing emissive. Already covered. |
| **`floor-grid`** | Arena floor | Flat colour + thin grid lines aligned to the cell grid. Lines are emissive so they survive low light. The grid is a gameplay readability tool — players need to see cells. |
| **`hazard-stripes`** | Arena boundaries, dangerous tiles, conveyor belts | Diagonal yellow/black stripes scrolling along a direction vector. One uniform sets the scroll speed (0 for static boundary, non-zero for conveyor). |
| **`bomb-pulse`** | Bomb mesh | Emissive intensity pulses with fuse remaining. Pulse frequency ramps from ~1 Hz at full fuse to ~8 Hz in the last 0.6 s. Pairs with the existing fuse-wiggle scale animation. |
| **`blast-flash`** | Blast tile flash (the orange overlay on cells in a blast) | Additive blend, bright orange, fades over the tile's lifetime via the existing Tween machinery. |
| **`dissolve`** | Soft blocks destroyed | A short (~0.3 s) dissolve effect — alpha-cutoff sweeps across the mesh via a noise texture. Reveals the pickup underneath, if any. |
| **`shield-bubble`** | Future Shield power-up | Translucent fresnel-edge sphere around a protected bomber. Disappears in a tween when consumed. Owned by GDP for Shield power-up if/when it lands. |
| **`outline-occluder`** | Bombers behind tall blocks | When a bomber is occluded from the camera by a wall, draw a flat-coloured outline through the geometry. Tiny pixel-shader pass, uses the bomber's primary colour. Already named in `gdd.md §UX`. |

That's nine shader profiles. All of them are 10–80 lines of GLSL each.
None of them need PBR, HDRI, light baking, or texture art beyond a
single noise pattern for `dissolve`.

### 3.1 Material variant strategy

Every shader exposes ~3 uniforms that DRIVE the variation, not a new
shader per variation. Example: `block-solid` takes `baseColor`,
`bottomShadowFactor`, `panelSeamStrength`. A "hard block" sets
`bottomShadowFactor = 0.6, panelSeamStrength = 0.0`; a "soft block"
sets the same with `panelSeamStrength = 0.4` to suggest "wooden
crate." One shader, two visible materials.

This is the same pattern the procedural character pipeline uses for
palette derivation. Drive variation through parameters, not through
new authored content.

---

## 4. Lighting strategy

The hard constraint: **no light baking, no HDRI, no PBR.** Everything
has to look right with one directional light and ambient, in a
browser, on a laptop.

Approach: **lean on shader stylisation, not on light fidelity.**

### 4.1 Light setup

- One **directional light** (key light) coming from the upper-left of
  the arena at ~60° elevation. Fixed across all arenas — consistent
  lighting is a readability anchor.
- One **hemispheric ambient light** (sky / ground tint) at low
  intensity. Sky is a warm beige tint (matches the diorama frame),
  ground is a cool dark teal.
- **No point lights, no spot lights, no shadow maps in MVP-1/MVP-2.**
  Real-time shadow maps are expensive on WebGL and inconsistent
  across browsers. The `block-solid` shader's bottom-strip darkening
  fakes contact shadows convincingly enough for top-down play.
- Emissive materials (pickup-glow, bomb-pulse, blast-flash) are the
  ONLY light sources visible to the player. They don't actually
  illuminate other geometry — they just glow. Plays well with a
  later post-fx bloom pass if we add one.

### 4.2 Post-fx — what we allow, what we don't

| Effect | Verdict | Reason |
|---|---|---|
| Bloom (on emissive only) | Allowed | Sells the "industrial neon" identity. Cheap on WebGPU. |
| Tonemapping (ACES or simple) | Allowed | Stops emissive bloom from clipping to pure white. |
| Vignette (subtle, only on low-health) | Allowed | Reuses the GDD's "low-health vignette" idea. Not on by default. |
| Chromatic aberration | **Banned** | Visual noise that hurts readability. |
| Motion blur | **Banned** | Hides bomb trajectories. |
| Depth of field | **Banned** | Hides off-camera danger. |
| SSAO / SSGI / SSR | **Banned** | Performance cost not paid back at this art bar. |
| Film grain | **Banned** | Contradicts the toy-scale identity (toys aren't film). |
| Outline post-pass | Allowed | Pairs with `outline-occluder` for behind-wall visibility. |

### 4.3 Shadows

Real shadow maps are explicitly **out of MVP-1/MVP-2**. The
substitute is the `block-solid` bottom-strip trick plus a small
soft-circle "contact shadow" decal painted under each bomber and
bomb. The decal moves with the entity, scales with its motion (slight
squash when the bomber jumps in the death animation, slight stretch
when the bomb wiggles).

If a future story wants real shadows (probably MVP-3 polish), it
should ship as a single shadow-mapping pass on the bomber + bomb +
pickup layer only — never on the static arena. Static shadows are
faked by the shader.

---

## 5. Colour language (project-wide)

`characters-and-visual.md §4.2` defined the per-bomber 8-hue ring.
That ring is also the project palette. Everything in the world
either picks from the ring or from the **neutral palette** below.

### 5.1 The 8-hue ring (bomber identity)

| Slot | HSL | Hex (approx) |
|---|---|---|
| H0  | h=0,   s=70%, l=50% | `#d94040` |
| H1  | h=45,  s=70%, l=50% | `#d99440` |
| H2  | h=90,  s=70%, l=50% | `#a4d940` |
| H3  | h=135, s=70%, l=50% | `#40d960` |
| H4  | h=180, s=70%, l=50% | `#40d9d9` |
| H5  | h=225, s=70%, l=50% | `#4080d9` |
| H6  | h=270, s=70%, l=50% | `#9040d9` |
| H7  | h=315, s=70%, l=50% | `#d940a4` |

Used for: bomber torso, bomber minimap marker, bomber blast-particle
colour, bomber vocal-synth UI marker. The same slot is used
everywhere a bomber needs to be identified.

### 5.2 Neutral palette (world / UI)

- **Floor**: cool dark teal `#1e3540` — sits behind the bomber colours
  without competing.
- **Hard block**: warm grey `#7a7570` with bottom strip `#494744`.
- **Soft block**: warm tan `#a08055` with bottom strip `#604830`.
- **Arena frame / hazard boundary**: yellow `#f0c020` + black `#181818`
  stripe.
- **UI panel background**: near-black `#0f0f12` at 85% opacity.
- **UI text primary**: cream `#f4ede0`.
- **UI text muted**: warm grey `#8a8580`.
- **Win banner background**: H3 (green) at 70% opacity.
- **Lose banner background**: H0 (red) at 70% opacity.
- **Draw banner background**: H1 (orange) at 70% opacity.

### 5.3 Reserved colours

- **Energy accent**: bright cyan `#33ffff`. RESERVED for "interactable,
  important, attention-grabbing." Pickups glow it, bomber accents glow
  it, the round-resolve banner edge flashes it. Used sparingly.
- **Imminent-danger red**: `#ff4040`. RESERVED for "this is about to
  kill you" — bomb-pulse final-fuse colour, low-health vignette
  tint, network-error indicator. NOT for routine warnings; saving
  the colour for the actual danger moment makes it land harder.

### 5.4 Forbidden palettes

- **Pure white `#ffffff`** — competes with bloom on emissive accents.
  Use cream `#f4ede0` instead.
- **Pure black `#000000`** — too harsh on browsers without
  tonemapping. Use `#181818` (the stripe black) or `#0f0f12` (the UI
  panel) instead.
- **Saturated neon greens / pinks outside the ring** — these will
  read as "the bomber colour" and confuse identity. The ring owns
  saturated hues; the world is desaturated.

---

## 6. VFX vocabulary

Particles and short-lived emitters carry the moment-to-moment "this
just happened" feedback. The vocabulary is small and consistent.

### 6.1 Existing particle effects (MVP-1, shipped)

- **Blast burst**: a quick radial puff at each blast cell, in the
  bomber's primary hue. Already lives in `examples/kaboom-crew/`.

### 6.2 Planned VFX (priority-ordered)

| VFX | Trigger | Lifetime | Description |
|---|---|---|---|
| **Bomb-place puff** | Bomb spawn | 0.2 s | Small dust ring at the bomb's cell. Communicates "a bomb appeared here." Same colour as floor (cool dark teal), low contrast — it's a placement tell, not a danger cue. |
| **Pickup glint** | Pickup spawn | 0.5 s (looping until collected) | Pickup pulses a thin emissive ring around itself. Reuses `pickup-glow` shader uniform. |
| **Pickup-collect sparkle** | Pickup collected | 0.4 s | Upward-rising sparkle in the bomber's hue + cyan accent dots. |
| **Bomb-final-fuse pulse particles** | Bomb < 0.6 s remaining | continuous, 0.1 s each | Tiny red sparks emitting from the bomb. Pair with `bomb-pulse` shader. |
| **Block-destroy dissolve dust** | Soft block destroyed | 0.4 s | Brown dust cloud at the cell as the dissolve shader does its thing. |
| **Chain-reaction ping** | Bomb triggered by another bomb | 0.3 s | A short cyan ring at the triggered bomb's cell, before it detonates. Communicates "chain incoming." |
| **Footstep puff** | Bomber walk-cycle leg-down phase | 0.1 s | Tiny ground puff at the foot's cell. Adds liveliness. Already mentioned in characters-and-visual §4.4. |
| **Off-screen blast ping (minimap)** | Blast off-camera | 0.5 s | A flash on the minimap at the blast's cell, in the bomber's hue. NOT a world-space effect — minimap only. Pairs with §UX in GDD. |
| **Death plume** | Bomber killed | 0.6 s | Vertical smoke column in the bomber's hue + cyan accent + a "*" burst. Reads as slapstick, not horror. Pairs with the death tween from GDP-009. |
| **Spawn flash** | Bomber spawn (round start, multiplayer join) | 0.4 s | Bright vertical column of light in the bomber's hue, fades out from above. Telegraphs "new player landed here." |

### 6.3 Anti-patterns for VFX

- **No persistent decals on the floor showing imminent blast cells.**
  Hard-line decision from feedback memory (2026-05-20): blast
  prediction stays in audio, bomb wiggle, minimap, and particle
  pulse. Never a "this cell will be on fire" decal.
- **No screen-shake for routine bombs.** Screen-shake is reserved
  for the bomber's OWN bomb killing them (slapstick death cue) and
  for the round-resolve moment. Routine blasts that don't affect
  the local player shake the *bomb*, not the camera.
- **No bloom on bomber primary hues.** Bloom is for emissive accents
  (cyan, imminent-danger red, blast-flash orange) only. If the
  bomber's torso bloomed, the colour ring would smear.
- **No more than 2 simultaneous VFX layers on a single cell.** Stack
  cap. The `blast-flash` shader + a particle burst is the maximum;
  adding a third (dissolve, plume, chain-ping) means one of the
  existing two has to drop first.

---

## 7. Camera and framing

### 7.1 Today (MVP-0/1)

- `PerspectiveCamera`, pitch ~60°, fixed yaw, fixed FOV ~50°.
- Locked to the arena centre — no follow, no zoom, no rotation.
- The whole 15×11 arena fits on screen.

### 7.2 Target (MVP-2 / MVP-3 chunked world)

- **Orthographic projection** when the world becomes larger than one
  screen. The `dynabomber-readiness-analysis.md` already flagged this
  as a gap: `OrthographicCamera` path doesn't exist in the adapter.
  When chunked maps land, we need that. Per the design note in
  `notes/DynaBomber.md §4.1`, orthographic is preferred for grid
  reads — blast ranges stay constant on screen regardless of vertical
  distance.
- **Damped follow** with small look-ahead. Pitch stays in the 55–65°
  band. Yaw stays locked (no orbit). Zoom stays data-driven.
- **View size**: ~12–18 tiles across on desktop.
- **Look-ahead cap**: never push so far ahead of the bomber that the
  bomber's own bombs leave the frame.
- **Edge bias**: near chunk boundaries, the camera biases away from
  the boundary so the player doesn't see an empty half-frame.

### 7.3 Composition rules

Within whatever frame the camera produces:

- **Centre 60%** of the frame is the gameplay focus. Bombers stay
  here whenever possible; HUD never overlaps this region.
- **Outer 40%** carries minimap (bottom-right), tally HUD
  (bottom-left), banner overlay (centre during round-end). Permanent
  HUD elements are at the corners; transient overlays (banner,
  pause) are centre.
- **Vertical thirds**: foreground (bomber + bombs + pickups) in the
  bottom two-thirds; sky / dome / out-of-play space in the top
  third. The diorama frame lives at the very top of the view.
- **No rotation** of the world to match camera direction. The world
  is the source of truth; the camera adapts.

### 7.4 Special camera moments

- **Round-resolve moment**: the camera slowly zooms in on the
  winning bomber (or the centre on draw) over 1.0 s, from the start
  of round-end to the banner display. Mild, not cinematic — players
  shouldn't lose track of the auto-restart timer.
- **Spawn moment** (multiplayer): a 0.3 s flicker-in from above the
  spawn cell. Reuses the spawn-flash VFX.
- **No cinematic cutscenes ever.** The game is short-session arcade;
  every camera move that takes control from the player is a cost.

---

## 8. UI / HUD visual language

The HUD's current shape lives in `gdd.md §UX`. Visual language for it:

### 8.1 Typography

- **One typeface**, monospaced. The HUD numbers (round number,
  tally, bomb counts) need to align in columns. A monospaced font
  also reads as "industrial readout," reinforcing the diorama
  identity.
- **Recommended**: Inter Mono, IBM Plex Mono, or JetBrains Mono.
  All CC-licensed, free for the repo. Pick one and stick with it.
- **Sizes**: 14 px for the standard HUD; 18 px for the centre
  banner; 24 px for the round-end title ("YOU WIN" / "YOU LOST" /
  "DRAW"). Three sizes total — no smooth typographic scale.

### 8.2 Layout primitives

- **Panel**: rectangular, near-black `#0f0f12` at 85% alpha, no
  rounded corners (industrial = hard edges), 8 px padding.
- **Divider**: 1 px line in `#3a3a3f` between sections of a panel.
- **Pill** (for tally counts): squared rectangle with a 2 px
  coloured left edge in the bomber's hue. Inside text is cream.
- **Banner** (round-end): full-width centre overlay, banner colour
  from §5.2 (H3/H0/H1 per outcome), 70% alpha, no border.
- **Minimap**: square Canvas2D element, 200×200 px, bottom-right,
  16 px from edge. Inside: floor tint as background, bombers as
  triangle markers, bombs as dark dots, pickups as small coloured
  rects.

### 8.3 Icon set

Minimum needed icons:
- **Bomb** (next to the per-bomber bomb count).
- **Fire** (next to the per-bomber range count).
- **Speed** (next to the per-bomber speed count, when shown).
- **Shield** (when Shield power-up exists).
- **Kick** / **Remote** / **Pierce** (when those exist).
- **Skull** (dead state on tally).
- **Connection** (multiplayer indicator: green = connected, yellow =
  lagging, red = disconnected).

All icons are **monochrome cream silhouettes** rendered from CC0
sources OR generated procedurally from primitives via a small SVG
generator (the visualisation parallel to the procedural-character
generator).

**No emoji**. Emoji rendering is inconsistent across browsers and
operating systems, breaks the industrial identity, and contradicts
the `feedback-language.md` "no emoji unless explicitly requested"
rule for the repo.

### 8.4 Animation in the UI

- Tally numbers tick up with a 0.2 s count-up tween when a round
  resolves. Not on every digit — just the field that changed.
- Banner fades in over 0.15 s, fades out over 0.15 s.
- Minimap pings (off-screen blast) pulse 3 times over 0.5 s, then
  vanish.
- **No flashing-rapid UI elements.** The bomb-pulse is the only
  rapid pulse and it's in the world, not the HUD. The HUD stays
  calm — it's the readout layer.

---

## 9. Environment / arena dressing without an artist

Beyond bombers, the arena needs visual variety so each match doesn't
look identical. The bar: each new arena variant should land in one
sprint with no new authored assets.

### 9.1 Layer 1 — Procedural geometry

The arena generator (already shipped at
`examples/kaboom-crew/generators/kaboom-arena-small.gen.mjs`) is the
primary lever. Variations land as new generator templates:

- **Open plaza**: fewer soft blocks, wider lanes, encourages bomb
  chains.
- **Long corridor**: 21×7 instead of 15×11, forces commit decisions.
- **Cross arena**: two corridors meeting in a centre plaza,
  bottlenecks at the cross.
- **Pit**: hard-block ring around a smaller play space; the dome
  frame is visible just outside.

All four use the same hard-block / soft-block / spawn-cell schema —
no new mesh types.

### 9.2 Layer 2 — Surface theming via shader uniforms

Each arena ships a `theme.json` that drives shader uniforms:

```text
{
  "name": "warehouse",
  "floorColor": "#1e3540",
  "wallColor": "#7a7570",
  "stripeColor": "#f0c020",
  "stripeBlack": "#181818",
  "ambientWarmth": 0.4
}
```

Five themes for free: `warehouse`, `factory`, `dock`, `lab`,
`bunker`. Each is ~10 hex codes. Zero authored assets.

### 9.3 Layer 3 — CC0 prop dressing

When the arena needs visual variety beyond colour — barrels, crates,
pipes, fans — pull from CC0 libraries (Kenney, Quaternius, Poly
Haven). The asset pipeline (see `asset-pipeline` skill / agent
description) already supports this for the rest of the engine.

Rules for prop usage:
- **Props are decorative only.** They never block movement, never
  block blasts, never interact with gameplay. If a player learns
  "the red barrel blocks bombs," we have failed at readability.
  Gameplay-affecting objects are blocks, full stop.
- **Props sit OUTSIDE the play grid** — on the diorama frame, in the
  ceiling, against the wall. Inside the play area, only generated
  geometry lives.
- **One prop pack per theme**, max ~20 props. Crowding props inside
  the play area would fight readability.

### 9.4 Layer 4 — Sky / dome / frame

The diorama frame is the visible boundary of the playspace:

- For warehouse / factory themes: a translucent corrugated dome
  above the play area, mild colour tint.
- For dock / lab themes: a glass cylinder.
- For bunker: a low concrete ring with rivets.

Each is a single procedural mesh (cylinder, dome, ring) with a
theme-coloured `block-solid` shader. The dome / ring is non-blocking
(camera and ECS ignore it) — pure decoration.

---

## 10. Audio-visual coupling

Visuals don't live in a vacuum — most of them are paired with audio
events. Naming this explicitly so dev doesn't ship a visual without
its sound partner.

| Visual event | Audio event | Notes |
|---|---|---|
| Bomb-place puff | `bomb-place` clip + place-bomb vocal | shipped MVP-1 + GDP-010 |
| Bomb-pulse shader | (none — silent) | the wiggle IS the warning |
| Bomb-final-fuse particles | `bomb-tick` (loop, frequency rises) | not shipped yet |
| Blast burst + blast-flash shader | `blast` clip | shipped MVP-1 |
| Block-destroy dissolve | `block-break` clip | not shipped yet |
| Pickup-collect sparkle | `pickup` clip + pickup vocal | shipped MVP-1 + GDP-010 |
| Death plume + death tween | `death` clip + death vocal | partial (clip shipped, vocal pending GDP-010) |
| Chain-reaction ping | `chain` clip (subtle stinger) | not shipped yet |
| Win banner + zoom-in | `win-fanfare` clip + victory vocal | not shipped yet |
| Lose banner | `lose-stinger` clip + (no vocal) | not shipped yet |

When a visual event ships without its audio partner, file a
follow-up story rather than leaving the gap silently. The whole
"local chaos, global clarity" pillar depends on audio doing half
the lifting.

---

## 11. Performance budget

Visual choices that survive only because we don't enforce a budget
will quietly destroy framerate. Hard targets:

- **60 fps** on a normal laptop browser (M1 MacBook Air baseline).
- **< 200 draw calls per frame** with instancing applied. Currently:
  arena blocks are instanced via S70 `InstancedMesh`; characters
  are individual meshes. With procedural characters (GDP-008), each
  bomber adds ~10 nodes — at 4 bombers that's ~40 draw calls,
  acceptable.
- **< 4 ms per frame** spent in JS systems (animation +
  vocal-synth + spring-sway combined). The animation systems are
  designed to fit this; if vocal-synth grows past it, the synth
  drops first.
- **No texture > 2048 × 2048** in the project. The `dissolve` noise
  pattern is 512 × 512; everything else is solid colour.
- **No mesh > 5k triangles** in the project. Characters are
  primitive-composed and well under this; bombs / blocks are far
  under.

When a visual proposal would break one of these, the proposal must
either justify the break (rare) or scope back. Examples that have
ALREADY been scoped against this budget:

- Real shadow maps → deferred to MVP-3, never enforced in MVP-1/2.
- SSAO / SSGI → banned outright.
- Per-bomber unique materials → folded into shader uniforms
  driven from the recipe, single shader pipeline.

---

## 12. References and moodboard

We can't include images in the repo without a licence, but we can
name CC0 / freely-browsable references so a future agent can build
a moodboard without guessing.

### 12.1 Aesthetic references

- **Boomerang Fu** — the chunky toy bomber language. Cute proportions,
  flat shading, readable from above.
- **Untitled Goose Game** — the diorama framing, the calm muted
  background palette against a bright character.
- **Sea of Stars** (top-down sections) — the industrial-but-readable
  colour discipline. Not the pixel art; the colour choices.
- **Bombergrounds: Reborn** — the modern-arcade bomberman direction.
  Useful for power-up VFX and HUD pacing.
- **Donut County** — for the warm beige + cyan accent combination
  and the toy-scale feel.

### 12.2 CC0 / free asset sources

- **Kenney.nl** — the gold standard for CC0 game props. Kenney's
  "blocky" pack and "platformer" pack are appropriate for the prop
  dressing layer.
- **Quaternius** — low-poly nature and industrial packs, CC0.
- **Poly Haven** — HDRIs (we're not using them) and CC0 textures
  (we are: floor noise, dissolve noise).
- **Google Fonts** — for the monospaced UI font (Inter Mono / JetBrains
  Mono / IBM Plex Mono are all there).

### 12.3 Shader / VFX references (technique, not visual)

- **Three.js examples → `webgpu_postprocessing_outline`** — the
  outline-occluder shader.
- **Shadertoy → "Toon shading"** searches — `character-toon`
  reference implementations.
- **Catlike Coding tutorials** — Unity-shaped but the lighting
  techniques translate.

When a visual story lands in a sprint, pull from this list before
inventing a new aesthetic direction.

---

## 13. Open questions (visual)

Things this doc deliberately doesn't answer yet:

1. **Time-of-day variation**. Do arenas have a "day / night" variant,
   driven by ambient light alone? Cheap to implement, adds variety
   for free. Probably yes, but unclear if MVP-2 or MVP-3.
2. **Weather effects**. Rain / dust / sparks falling from above. CC0
   particle textures exist; the cost is keeping them readable in
   top-down. Probably MVP-3 polish only.
3. **Bomber "skins"** beyond the recipe palette — patterns (stripes,
   polkadots) on the torso. Easy as a shader uniform, but pulls on
   the cosmetic-unlocks decision (GDD §Cosmetic unlocks, MVP-3+).
   Wait for that to land.
4. **Persistent-world ambient state visualisation** — when an empty
   sector "catches up" from a timestamp, do players see anything?
   E.g. a "wear" gradient on blocks that were destroyed and regrew
   while no one was there. Open question for the persistent-world
   epic.
5. **Spectator mode aesthetic**. When a player joins mid-round and
   spectates until next round (per GDP-007 hint), does spectator
   view look identical to player view, or does it desaturate?
   Recommend desaturation; resolve when the network story lands.

None of these block anything in MVP-2.
