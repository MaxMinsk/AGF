# Three.js References Analysis — Visual Tricks + Performance Adoptions for Kaboom Crew / AGF

> **Status: investigation.** First pass: 2026-05-29.
> Companion to `visual-style.md` + `terrain-design.md` + the
> pending visual-fidelity batch (GDP-2026-05-28-001..015).
> Question asked: what's in the canonical Three.js examples + ecosystem
> that we should adopt for visual richness or performance, given our
> no-artist + perf-budget constraints?

---

## 1. Scope + methodology

The Three.js examples gallery (threejs.org/examples) catalogues ~250
demos across rendering, postprocessing, animation, geometry,
materials, lights, physics, and WebGPU. This doc reviews the
**relevant subset for our project** — arcade-top-down, grid-based,
no-artist, web-deployed — and ranks adoption candidates by
impact-to-cost.

Sources surveyed (high-confidence from training knowledge, not live
WebFetch in this session):
- `webgl_*` classic example set
- `webgpu_*` newer renderer demos
- `webgl_postprocessing_*` post-FX pipeline
- Three.js core API additions in r150+ era (InstancedMesh,
  BatchedMesh, MeshOptDecoder, shadow map cascade, etc.)
- Common community patterns (kenney CC0 packs, sfxr, jsfxr already
  referenced in voice-synth-research.md)

Things this analysis is NOT:
- Live URL crawling — references cited by name, not live-verified.
- Endorsement of patterns banned by `visual-style.md` (PBR / HDR
  IBL / skinned-mesh / heavy post-process).

---

## 2. Visual effects worth adopting (ranked)

Each effect is ranked by **impact** (visible quality lift) and **cost**
(implementation + perf budget hit), against our existing pending
stories.

### 2.1 ⭐⭐⭐ Atmospheric fog (`webgl_fog*`, `webgl_fog_exp2.html`)

- **What it is**: Three.js built-in `scene.fog = new Fog(...)` or
  `FogExp2`. Adds linear/exponential distance-tinted fog.
- **Cost**: Single config line + maybe a shader-uniform inclusion.
  Zero runtime cost on modern GPUs (built into vertex/fragment
  pipeline).
- **Impact**: Strong. Adds depth perception to top-down camera —
  far-away cells visually receding. Pairs with diorama identity
  beautifully (the world fades into theme-colour fog at the boundary).
- **Per-theme fog**: each arena theme from GDP-2026-05-28-013 picks
  its own fog colour (warehouse = grey, factory = warm smoke, dock =
  cool blue mist, lab = white haze, bunker = dark drab).
- **Adoption recommendation**: ADD as part of GDP-2026-05-28-013
  (theme system) — single field per theme.

### 2.2 ⭐⭐⭐ Cascaded Shadow Maps (CSM, `webgl_shadowmap_csm.html`)

- **What it is**: divides the directional-light shadow frustum into 2-3
  cascades, each rendering its own shadow map. Near cascade = high
  res, far cascade = low res. Result: sharp shadows close to camera,
  blurry-acceptable shadows far away — without one giant 4K shadow
  map.
- **Cost**: implementation extension on the lighting engine module
  (GDP-2026-05-28-001). CSM in Three.js requires the `CSM` addon
  class (lives in three/examples/jsm/csm/). Perf: similar or better
  than one giant shadow map for the same effective quality.
- **Impact**: shadow quality boost without doubling resolution.
  Especially valuable when variable height (GDP-010) ships — tall
  cliffs cast long shadows, single-pass shadow map distorts at
  arena edges.
- **Adoption recommendation**: extend GDP-2026-05-28-001 to use CSM
  for the directional light (instead of single shadow map). Note as
  acceptance hint addition — single line of config diff in story
  payload.

### 2.3 ⭐⭐⭐ Decal projection (`webgl_decals.html`)

- **What it is**: `DecalGeometry` projects a small mesh onto existing
  geometry, conforming to the underlying surface. Three.js example
  shows decals on a head model.
- **Application**: scorch marks after blasts. Currently `BlastTile`
  is a full mesh entity (one per blast cell). Decals could be cheaper
  + visually richer — blast leaves a darker spot on the floor
  conforming to the cell's terrain. Persists 1-3 seconds, fades out.
- **Cost**: medium. Decal recompute on every blast event. Floor mesh
  needs to be the projection target (works fine with cuboid cells
  from GDP-010 — projection adapts to height).
- **Impact**: arena starts to feel ACCUMULATED — repeated blasts
  leave a visual history that fades over time. Makes the world feel
  used.
- **Adoption recommendation**: new story candidate — see §5.1.

### 2.4 ⭐⭐ Point light shadows (`webgl_shadowmap_pointlight.html`)

- **What it is**: shadow maps for point lights — bomb point lights
  (from GDP-2026-05-28-001) cast their own shadows.
- **Cost**: Three.js handles natively, just enable `castShadow` on
  the point light. Shadow map cost ~256-512 per light × 4 lights
  = manageable.
- **Impact**: bomb's red final-fuse glow CASTS shadows of nearby
  blocks. Dramatic last-0.6s tension.
- **Adoption recommendation**: covered by GDP-2026-05-28-001
  (lighting/shadow primitive). Reinforce in acceptance.

### 2.5 ⭐⭐ Soft shadows via PCSS (`webgl_shadowmap_pcss.html`)

- **What it is**: Percentage-Closer Soft Shadows — shadows get softer
  as the occluder is further from the shadow receiver. Realistic
  shadow falloff.
- **Cost**: shader-uniform extension on the shadow material. Modest
  perf cost (~0.5ms / frame).
- **Impact**: subtle. Mostly noticeable on tall objects — cliffs from
  GDP-010 have nicer soft-edged shadows on the floor far from them.
- **Adoption recommendation**: covered by GDP-2026-05-28-001 as
  default (PCFSoftShadowMap is the baseline) — already noted in
  acceptance hints.

### 2.6 ⭐⭐ Outline post-pass (`webgl_postprocessing_outline.html`)

- **What it is**: Three.js' `OutlinePass` from postprocessing addon.
  Renders selected meshes with a coloured outline.
- **Cost**: medium. Adds a postprocessing pass; per-frame cost
  ~1-2ms.
- **Impact**: outline-occluder visibility from GDP-2026-05-28-014.
- **Adoption recommendation**: covered by GDP-2026-05-28-014 — story
  already proposes shader-based outline. The Three.js `OutlinePass`
  is a heavier alternative; our planned single-material dual-pass
  approach is cheaper. NO change to existing story.

### 2.7 ⭐⭐ Atmospheric sky (`webgl_shaders_sky.html`)

- **What it is**: Hosek-Wilkie atmospheric sky model — proper sky
  with sun position, turbidity, mie/rayleigh scattering.
- **Cost**: medium. ~50 LOC of shader + half a dozen uniforms.
- **Impact**: high for outdoor arenas (grassland, dock). Less so for
  indoor (warehouse, lab, bunker). With our diorama framing the sky
  is at the top edge of view — partial benefit.
- **Adoption recommendation**: per-arena option, NOT default.
  Possible follow-up to GDP-2026-05-28-013 (theme) — themes that
  declare 'outdoor' use the atmospheric sky; indoor themes use the
  current sky-colour flat.

### 2.8 ⭐⭐ Vignette (`webgl_postprocessing_filter*`)

- **What it is**: post-process darken at screen edges.
- **Cost**: trivial — one fragment-shader fade.
- **Impact**: gentle framing — reinforces the diorama. Pairs with
  the existing visual-style.md §4.2 'low-health vignette' but as a
  permanent subtle layer.
- **Adoption recommendation**: small story candidate — see §5.2.

### 2.9 ⭐ Tonemapping (ACES Filmic, `webgl_tonemapping.html`)

- **What it is**: maps HDR-ish render output to LDR display range
  with filmic curve. Visually nicer highlights, less clipping.
- **Cost**: trivial — Three.js setting (`renderer.toneMapping =
  ACESFilmicToneMapping`).
- **Impact**: emissive accents (cyan pickups, red bomb-pulse, theme
  accents from GDP-013) no longer clip to pure white. Sells the
  glow.
- **Adoption recommendation**: include in GDP-2026-05-28-001 setup
  (one line). Already mentioned as 'allowed' in visual-style.md
  §4.2.

### 2.10 ⭐ SMAA / FXAA antialiasing (`webgl_postprocessing_smaa.html`)

- **What it is**: post-process anti-aliasing. Improves edge quality
  without expensive MSAA.
- **Cost**: ~0.5ms / frame. SMAA is higher quality than FXAA at
  same cost roughly.
- **Impact**: smoother edges on bomber meshes + block edges.
  Noticeable on low-DPI displays.
- **Adoption recommendation**: include in eventual Post-FX pipeline
  story (currently not filed; could be `GDP-2026-05-XX` follow-up
  after lighting+shadow ships).

### 2.11 ⭐ SSAO (Screen-Space Ambient Occlusion, `webgl_postprocessing_ssao.html`)

- **What it is**: cheap fake ambient occlusion via screen-space
  depth analysis.
- **Cost**: ~1-2ms / frame.
- **Impact**: subtle darkening in corners + creases. Adds depth to
  the toy-scale diorama; corners of cuboid cells (heights) get
  pronounced.
- **Adoption recommendation**: visual-style.md §4.2 moved SSAO from
  'banned' to 'allowed' on 2026-05-28. Should be part of Post-FX
  pipeline story.

### 2.12 ⭐ Pixelation (`webgl_postprocessing_pixel.html`)

- **What it is**: post-process pixelation for retro feel.
- **Adoption recommendation**: SKIP. Conflicts with our toy-scale
  industrial-diorama identity. Retro-pixel look is a different
  aesthetic genre.

---

## 3. Performance optimisations worth adopting

### 3.1 ⭐⭐⭐ BatchedMesh (newer than InstancedMesh)

- **What it is**: Three.js r151+ ships `BatchedMesh` — like
  `InstancedMesh` but supports varied geometries (different vertex
  counts per instance) in one draw call. Per-instance Transform
  uniform + per-instance geometry slot in a shared GPU buffer.
- **Use case**: Wang autotile (GDP-2026-05-28-002 + GDP-028-012)
  has 16-48 variant meshes per family. If each variant gets ~10
  cells using it, we get ~10 mesh instances per variant × 16
  variants = 160 mesh draws per family. BatchedMesh collapses
  these into ~1 draw call per family.
- **Cost**: replacement of per-cell `Mesh` spawning with
  BatchedMesh entries. ~100 LOC change in Wang resolver.
- **Impact**: significant draw-call reduction in heavy-Wang scenes.
  Likely pays off when grassland prototype lands.
- **Adoption recommendation**: extend GDP-2026-05-28-002 (Wang
  engine) acceptance to USE BatchedMesh for variant rendering. Add
  as acceptance hint.

### 3.2 ⭐⭐⭐ InstancedBufferGeometry per-instance attributes

- **What it is**: per-instance attribute streaming for InstancedMesh
  — e.g. per-instance color, per-instance time-offset.
- **Use case**: per-bomber outline colour (GDP-2026-05-28-014),
  per-pickup glow intensity (GDP-027-005), per-bomb fuse remaining
  (the bomb-pulse shader from visual-style.md §3).
- **Cost**: small. Each instance gets a Float32Array of additional
  per-instance state.
- **Impact**: avoid per-bomber material clone; share one material
  across all bomber meshes with per-instance hue overrides.
- **Adoption recommendation**: include in GDP-2026-05-28-001
  (lighting/shadow primitive — passes through per-instance attribs).

### 3.3 ⭐⭐ Frustum culling tuning

- **What it is**: Three.js auto-culls offscreen meshes via bounding
  spheres. Default behaviour usually correct.
- **Use case**: with closer camera follow (S163), many cells +
  blocks at edges of the arena are offscreen. Verify culling fires
  efficiently. If bounding spheres are pessimistic (large arena
  bound), culling might keep more on-frame than needed.
- **Cost**: minimal — usually just a tighter bounding sphere
  computation.
- **Adoption recommendation**: verification step in GDP-2026-05-28-004
  (integration story) — ensure offscreen cells aren't rendered.

### 3.4 ⭐⭐ Object pool for particles + accessory debris

- **What it is**: reuse particle / debris entity objects instead of
  spawning fresh.
- **Use case**: accessory debris from GDP-2026-05-27-012 (up to 12
  bodies per multi-bomber death). Per-frame allocation +
  garbage-collection churn.
- **Cost**: small. Pool data structure + reuse pattern.
- **Impact**: smoother frame times on multi-bomber chain reactions.
- **Adoption recommendation**: optimisation pass after accessory
  detach ships — likely captured by dev's `engine doctor` budget
  warnings.

### 3.5 ⭐⭐ WebGPU renderer migration

- **What it is**: Three.js' newer WebGPU backend (`webgpu_*`
  examples). Better perf, future-proof, but WebGPU still spotty in
  consumer browsers.
- **Use case**: AGF S70-era had partial WebGPU support; status
  unclear post-S100. May be worth a status check.
- **Cost**: large if not already done. Some Three.js features have
  feature-parity gaps between WebGL and WebGPU.
- **Adoption recommendation**: status question for dev retrospective
  (GDP-2026-05-28-009). Not in scope for THIS analysis.

### 3.6 ⭐ Texture atlas / sprite sheet

- **What it is**: combine many small textures into one large atlas
  for fewer texture binds.
- **Use case**: we use procedural vertex-colours, NOT textures.
  Atlas pattern doesn't directly apply.
- **Adoption recommendation**: SKIP for now — relevant only if we
  start using CC0 textures or icon sets via image files.

### 3.7 ⭐ DracoLoader / MeshOptDecoder

- **What it is**: GLB compression for smaller download payloads.
- **Use case**: we don't ship GLB assets (procedural mesh).
- **Adoption recommendation**: SKIP — relevant when CC0 asset usage
  expands, which we'd still avoid per no-artist constraint.

### 3.8 ⭐ OcclusionCulling (`webgl2_occlusion.html`)

- **What it is**: GPU-side occlusion queries — don't render objects
  behind other opaque objects.
- **Use case**: minimal at our current scale (small arena, few
  bombers). Worth revisiting for future chunked maps (MVP-3 stretch).
- **Adoption recommendation**: SKIP for now.

---

## 4. Things to skip explicitly

| Three.js feature | Why skip |
|---|---|
| **IBL / Environment maps** | Banned per visual-style.md §4.1. Toy-scale aesthetic doesn't need realistic reflection. |
| **Skinned mesh + bones** | Banned per characters-and-visual.md §3 — procedural node-tree animation is the design. |
| **Cubemap reflections / mirror** | Same as IBL — visual cost not paid back. |
| **MorphTargets** | No facial features on bombers — out per characters-and-visual.md §11. |
| **Particle physics via Rapier** | Particles use existing ParticleEmitter (S47), not Rapier. Rapier reserved for ragdoll + arena physics. |
| **WebXR (VR/AR)** | Out of scope per AGF being web-deployed top-down game. |
| **GPGPU compute via shader** | Overkill for grid game; CPU-side suffices. |
| **VR / AR controllers** | Out per platform. |
| **HDRI bokeh / DoF** | Banned per visual-style.md §4.2. |
| **GLTF / loaded models** | Procedural-only per characters-and-visual.md memory. |
| **DDS / KTX textures** | Procedural-vertex-colour-only. |

---

## 5. Concrete recommendations

### 5.1 NEW STORY CANDIDATE: Decal-based blast scorch + footsteps

A new story to ship blast scorch decals (cells darkened after blast
fades, decay over 3s) + bomber footstep decals (light scuff marks
behind walking bombers, persistent until cell destroyed).

Source: `webgl_decals.html` pattern. Decals projected onto floor
mesh (variable-height-aware via GDP-010). Decals fade out via
opacity tween + despawn via existing despawn timer machinery.

Visual: world feels USED — blasts leave history, bomber paths
visible. Strong arcade-history feel.

Cost: medium story (~150 LOC). Engine primitive: `engine/render/
decals/` module — reusable for any project. First consumer: Kaboom.

Suggested file: `GDP-2026-05-29-001` — see §6.

### 5.2 NEW STORY CANDIDATE: Atmospheric extras bundle — fog + tonemap + vignette

Bundle: scene atmospheric fog (per-theme colour), ACES filmic
tonemap, subtle persistent vignette. Three small effects bundled
as one story — each negligible cost, combined impact is "the game
suddenly looks polished".

Suggested file: `GDP-2026-05-29-002` — see §6.

### 5.3 EXTEND EXISTING STORIES (acceptance hint additions)

These don't need new stories — just acceptance hints added to
already-pending ones:

- **GDP-2026-05-28-001 (lighting/shadow)**:
  - Add `renderer.toneMapping = ACESFilmicToneMapping` to setup.
  - Use Three.js `CSM` (Cascaded Shadow Maps) for the directional
    light when 1+ point shadows enabled.
  - Per-instance attribute streaming for per-bomber palette.
- **GDP-2026-05-28-002 (Wang autotile)**:
  - Use Three.js `BatchedMesh` for variant rendering (instead of
    per-cell Mesh).
- **GDP-2026-05-28-013 (per-arena themes)**:
  - Each theme JSON gains `fogColor` + `fogDensity` fields.
- **GDP-2026-05-28-004 (integration showcase)**:
  - Frustum-culling verification step (verify offscreen cells skip
    render).

I can file the small acceptance-hint updates by editing the existing
proposed-story JSONs — or leave them as suggestions here and let
dev incorporate at promotion time.

---

## 6. Suggested new stories to file (this batch)

Based on the analysis, the highest-impact NEW adoptions:

1. **GDP-2026-05-29-001 — Decal-based blast scorch + footstep
   marks** (engine module `engine/render/decals/` + Kaboom consumer).
2. **GDP-2026-05-29-002 — Atmospheric extras bundle — fog + ACES
   tonemap + persistent vignette** (small story, per-theme tunable).

Other Three.js patterns either:
- Already covered by existing stories.
- Banned by our constraints.
- Worth as acceptance-hint additions only (not new stories).

---

## 7. Open questions

1. **WebGPU status** — currently using WebGL? WebGPU available on
   most arenas? Worth checking dev retrospective (GDP-009 if shipped).
2. **Post-FX pipeline architecture** — when SSAO + SMAA + bloom
   land, do we use Three.js EffectComposer or a custom pass chain?
   Defer to lighting+shadow story ship.
3. **Decal projection on procedural cell geometry** — Three.js
   DecalGeometry was designed for static authored meshes; how robust
   is it on dynamic cuboid cells from GDP-010? Possibly needs a
   custom projection step; flagged in decal story.
4. **Per-theme atmospheric sky vs flat colour** — outdoor themes
   (grassland, dock) benefit from atmospheric sky; indoor themes
   (lab, bunker) don't. Per-theme opt-in flag needed?
