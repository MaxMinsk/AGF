# Asset Sources And Workflow

Date: 2026-05-13

This document defines how this project should create, source, track and ship assets. It also answers the subscription question: **do we need another image or texture generator right now?**

## Short Answer

Do **not** buy another asset-generation subscription yet.

For the first implementation milestones, the best stack is:

- **Meshy.ai** for custom 3D props, drone/blockout models, AI texturing and occasional reference images.
- **Blender** for cleanup, scale/origin fixes, decimation, UV checks and export validation.
- **CC0 libraries** for placeholder and production-safe textures, HDRIs, simple props and UI/audio starter assets.
- **Procedural materials and shaders** inside the engine for the Beacon World visual identity.

If we later hit a real material-production bottleneck, the first paid tool to consider is **Adobe Substance 3D Texturing**, not a generic image generator. If we later need lots of 2D concept/key art, use Meshy's included image generation first; if that is not enough, consider Adobe Firefly or Leonardo/Midjourney based on the specific need and licensing risk tolerance.

## Asset Goals

Assets should support the engine, not slow it down.

- Early assets should be small, readable and replaceable.
- Every asset should have a source and license trail.
- Runtime assets should be optimized for web delivery.
- Source assets should be preserved separately from runtime exports.
- Generated assets should include prompts/settings where possible.
- The sample game should look coherent with simple shapes before any serious art pass.

## Recommended Source Stack

### Primary: Meshy.ai

Use Meshy for:

- custom low-poly props;
- Beacon World drones, cores, beacons, gates and hazard modules;
- image-to-3D when a reference silhouette matters;
- text-to-3D for quick ideation;
- AI texturing on generated models;
- PBR texture maps when needed;
- agent CLI/API experiments later.

Why Meshy is enough for now:

- Meshy supports Text to 3D and Image to 3D.
- Meshy can generate textures and PBR maps.
- Meshy exports engine-friendly formats including `glb`.
- Meshy Pro includes private licensing, model downloads, image generation and agent/API integrations according to its current pricing page.

Rules:

- Prefer `glb` for engine runtime imports.
- Export `fbx` or `blend` only for Blender cleanup when needed.
- Use low-poly mode or decimation targets for web runtime assets.
- Enable PBR maps only when the object needs them.
- Keep generated prompts and settings in the asset manifest.
- Do not ship raw Meshy output blindly; inspect in Blender or a glTF viewer first.

### Primary Free Libraries

Use CC0 sources whenever they fit the style.

| Source | Best For | License Notes | Use In This Project |
| --- | --- | --- | --- |
| Poly Haven | HDRIs, PBR textures, realistic props | CC0, commercial use allowed | Lighting tests, neutral materials, HDRIs |
| ambientCG | PBR materials and texture sets | CC0, commercial use allowed | Ground, metal, stone, panels, utility textures |
| Kenney | Game-ready 2D/3D/UI/audio packs | Public domain / CC0 on asset pages | Placeholder UI, simple icons, primitives, audio starters |
| Quaternius | Low-poly game models | Check each pack/source page | Placeholder props and style references |

Rules:

- Prefer CC0 assets for anything committed to the repo.
- Keep source URL and license in `assets/_sources/`.
- Do not assume every marketplace asset is safe just because it is free.
- Avoid mixed-license sites for Sprint 1 unless the exact asset license is saved.

### Procedural And Engine-Native Assets

Use engine-native assets for the first visual identity:

- primitive meshes;
- generated grid/striped materials;
- shader-driven glows;
- animated hazard fields;
- simple particle-like instanced meshes;
- CSS/DOM HUD before custom UI art.

This keeps Beacon World coherent while the asset pipeline is still young.

## Subscription Recommendation

### Buy Nothing Now

For Sprint 1 and Sprint 2, no additional subscription is needed.

Reason:

- The first playable engine features need primitives, simple materials, screenshots and validation more than polished art.
- Meshy already covers custom 3D generation and texturing.
- CC0 PBR libraries cover most early material needs.
- A generic image generator can produce nice concepts, but it will not solve runtime optimization, scale, UVs, LODs or shader integration.

### First Paid Upgrade If Needed: Adobe Substance 3D Texturing

Buy this only when we repeatedly need:

- controllable PBR material authoring;
- texture cleanup and channel packing;
- hand-painted or mask-driven material work;
- text/image-to-texture workflows with Substance tools;
- a more professional bridge between generated models and production-ready textures.

Why this before a generic image generator:

- It solves actual game-asset production problems.
- It fits PBR/runtime material workflows.
- Substance 3D Texturing includes Painter, Sampler, Designer and Substance 3D Assets according to Adobe's current plan page.
- Sampler has generative workflows such as Text-to-Texture, Text-to-Pattern and Image-to-Texture in beta.

### Generic Image Generator: Delay

Only buy a generic image generator when we need:

- consistent concept sheets;
- marketing/key art;
- UI illustration style exploration;
- 2D icons or moodboards at scale.

Recommended order:

1. Try Meshy's included image generation first if the current plan includes it.
2. If legal/commercial safety is the priority, consider Adobe Firefly.
3. If style exploration speed is the priority, consider Midjourney or Leonardo, but record licensing status and keep generated work private where possible.

Current notes:

- Midjourney paid plans include general commercial terms, and Pro/Mega are required for companies above a stated revenue threshold.
- Leonardo states paid subscribers retain ownership for private generations, while public generations have broader platform/user rights.
- Adobe Firefly is marketed around commercially safe generation; Substance 3D uses Firefly-powered generative workflows for texture work.

This is not legal advice. Re-check terms before shipping commercial assets.

## Asset Pipeline

### Folder Layout

Target layout:

```text
assets/
  _sources/
    asset-sources.json
    licenses/
  source/
    blender/
    meshy/
    references/
    raw-textures/
  runtime/
    models/
    textures/
    audio/
    ui/
  generated/
    previews/
    thumbnails/
```

For examples:

```text
examples/beacon-world/
  assets/
    _sources/
    source/
    runtime/
```

### Asset Manifest

Every nontrivial asset should have source metadata.

Example:

```json
{
  "id": "beacon-world.energy-core.v1",
  "type": "model",
  "runtimeFiles": [
    "runtime/models/energy-core.glb"
  ],
  "sourceFiles": [
    "source/meshy/energy-core/source.glb",
    "source/blender/energy-core.blend"
  ],
  "source": {
    "kind": "ai-generated",
    "tool": "Meshy",
    "toolVersion": "unknown",
    "prompt": "low-poly glowing energy core, clean toy-like sci-fi style",
    "sourceUrl": null,
    "license": "Project-owned generated asset under active Meshy plan; verify before commercial release"
  },
  "processing": [
    "Generated in Meshy",
    "Checked in Blender",
    "Set origin to center",
    "Exported as GLB"
  ],
  "notes": "Runtime material glow is applied by engine shader."
}
```

### Import Rules

3D models:

- Prefer `glb`.
- Keep scale consistent: 1 unit = 1 meter.
- Put origin in a predictable place: center for pickups, bottom-center for props/characters.
- Keep collision shapes simple and author them separately when possible.
- Keep object names stable and English.
- Avoid huge texture sizes in runtime exports.

Textures:

- Prefer PBR sets when using realistic materials.
- Start with PNG/WebP; evaluate KTX2/Basis later.
- Use power-of-two sizes where mipmapping matters.
- Keep original high-resolution textures in `source/raw-textures/`.
- Generate runtime-sized versions under `runtime/textures/`.

Audio:

- Start with short CC0 SFX or generated placeholder tones.
- Use compressed runtime formats later.
- Store source/license metadata.

UI:

- Start with DOM/CSS and simple SVG/icon primitives.
- Avoid committing AI-generated UI images until the style is stable.

## Beacon World Asset Plan

### Phase 1: Primitive-First

Use engine primitives:

- player drone: capsule or simple stacked primitives;
- energy core: glowing sphere;
- beacon: cylinder/box stack;
- gate: two columns plus shader plane;
- hazard: translucent pulse field;
- world modules: boxes/planes.

Goal: prove engine features without asset blocking.

### Phase 2: Meshy Pass

Generate a small consistent kit:

- drone body;
- energy core shell;
- beacon tower;
- gate frame;
- hazard emitter;
- floating ruin block set.

Keep all assets low-poly and modular.

### Phase 3: Texture/Material Pass

Use:

- ambientCG/Poly Haven for base rough surfaces;
- procedural shader glows for gameplay elements;
- Meshy AI texturing for custom props;
- Substance only if we need repeatable PBR authoring.

## Quality Checklist

Before committing an asset:

- It has a manifest entry.
- Its license/source is recorded.
- It is in English-named folders/files.
- Runtime file size is reasonable.
- Scale and origin are checked.
- It loads in a glTF viewer or Three.js test scene.
- It does not rely on a missing external texture.
- It has a placeholder fallback if it is optional.

Before using AI-generated assets commercially:

- Re-check the current tool terms.
- Avoid prompts that reference protected characters, brands, games or living artists.
- Keep prompts and generated dates.
- Prefer private generations when the tool supports it.
- Modify/curate important assets rather than shipping raw generations unchanged.

## Sources

- Meshy Image to 3D API: https://docs.meshy.ai/api/image-to-3d
- Meshy Text to 3D API: https://docs.meshy.ai/api/text-to-3d
- Meshy pricing: https://www.meshy.ai/pricing
- Meshy export format guidance: https://help.meshy.ai/en/articles/9991793-how-to-use-meshy
- Poly Haven license: https://polyhaven.com/license
- ambientCG license: https://docs.ambientcg.com/license/
- Kenney support/license note: https://kenney.nl/support
- Adobe Substance 3D plans: https://www.adobe.com/products/substance3d/plans.html
- Adobe Substance 3D Sampler generative workflows: https://experienceleague.adobe.com/en/docs/substance-3d-sampler/using/features-and-workflows/generative-workflows
- Midjourney plans: https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans
- Midjourney commercial usage note: https://docs.midjourney.com/hc/en-us/articles/27870375276557-Using-Images-Videos-Commercially
- Leonardo commercial usage note: https://intercom.help/leonardo-ai/en/articles/8044018-commercial-usage
