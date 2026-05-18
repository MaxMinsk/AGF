// M21-shadow-pcss: percentage-closer soft shadows.
//
// Three.js doesn't ship a PCSS shadow mode in core. The canonical
// approach (from three.js's `webgl_shadowmap_pcss.html` example) is to
// patch `THREE.ShaderChunk.shadowmap_pars_fragment` so every material
// that opts into shadow receiving (`USE_SHADOWMAP`) picks up the PCSS
// blocker-search + variable-penumbra filter.
//
// ShaderChunk is process-wide mutable state. `applyPcssShadowChunks`
// is idempotent — running it twice is a no-op — but it is one-way for
// this process. Toggling back to PCF requires a page reload. Adapters
// call this at construction time when `options.shadowAlgorithm === "pcss"`;
// no other call site should touch it.
//
// **Why `BasicShadowMap`:** PCSS does a blocker search + variable-penumbra
// filter, both of which need raw depth from the shadow map. Modern
// `PCFShadowMap` binds the shadow map as `sampler2DShadow` and uses
// hardware-comparison sampling — the GPU returns 0/1, not the depth value,
// so the substitution silently no-ops there. The S41 implementation
// chose this substitution path (matching three's own
// `webgl_shadowmap_pcss.html` example) which targets the BASIC variant
// of `getShadow` that reads `texture2D(shadowMap, ...).r`. To make the
// PCSS algorithm actually visible, `shadowAlgorithmType("pcss")` in
// `three-render-adapter.ts` returns `BasicShadowMap`, not
// `PCFShadowMap`. Plain `algorithm: "pcf"` stays on the modern
// PCFShadowMap path.
//
// **CSM coverage (M21-shadow-pcss-csm — S47):** `three/addons/csm/CSMShader.js`
// only overrides `lights_fragment_begin` and keeps calling the standard
// `getShadow(...)` symbol from `shadowmap_pars_fragment`. So once
// `applyPcssShadowChunks()` mutates the basic-variant getShadow inside
// the standard chunk, CSM cascades inherit PCSS for free — no separate
// CSMShader patch needed. Tests assert the substitution actually fires
// (a whitespace drift in three.js made the historical S41/S44 string
// match silently no-op until the regex-based replace landed in S47).

import { ShaderChunk } from "three";

// Free parameters baked into the GLSL. Tuned for outdoor scenes with a
// sun-like directional light + a 10–30 m world. `LIGHT_WORLD_SIZE`
// controls the penumbra: 0.005 = mid-soft (the three.js example default),
// 0.0025 = a tighter penumbra closer to PCF that still preserves
// distance-aware blur. Future work: expose this as a project config
// (`shadows.pcss.lightWorldSize`) so per-project scenes can opt back into
// softer penumbras.
const PCSS_PARS = `
#define LIGHT_WORLD_SIZE 0.0025
#define LIGHT_FRUSTUM_WIDTH 3.75
#define LIGHT_SIZE_UV (LIGHT_WORLD_SIZE / LIGHT_FRUSTUM_WIDTH)
#define NEAR_PLANE 9.5

#define NUM_SAMPLES 17
#define NUM_RINGS 11
#define BLOCKER_SEARCH_NUM_SAMPLES NUM_SAMPLES

vec2 poissonDisk[NUM_SAMPLES];

void initPoissonSamples( const in vec2 randomSeed ) {
  float ANGLE_STEP = PI2 * float( NUM_RINGS ) / float( NUM_SAMPLES );
  float INV_NUM_SAMPLES = 1.0 / float( NUM_SAMPLES );
  float angle = rand( randomSeed ) * PI2;
  float radius = INV_NUM_SAMPLES;
  float radiusStep = radius;
  for( int i = 0; i < NUM_SAMPLES; i ++ ) {
    poissonDisk[i] = vec2( cos( angle ), sin( angle ) ) * pow( radius, 0.75 );
    radius += radiusStep;
    angle += ANGLE_STEP;
  }
}

float penumbraSize( const in float zReceiver, const in float zBlocker ) {
  return (zReceiver - zBlocker) / zBlocker;
}

float findBlocker( sampler2D shadowMap, const in vec2 uv, const in float zReceiver ) {
  float searchRadius = LIGHT_SIZE_UV * ( zReceiver - NEAR_PLANE ) / zReceiver;
  float blockerDepthSum = 0.0;
  int numBlockers = 0;
  for( int i = 0; i < BLOCKER_SEARCH_NUM_SAMPLES; i++ ) {
    float shadowMapDepth = texture2D(shadowMap, uv + poissonDisk[i] * searchRadius).r;
    if ( shadowMapDepth < zReceiver ) {
      blockerDepthSum += shadowMapDepth;
      numBlockers ++;
    }
  }
  if( numBlockers == 0 ) return -1.0;
  return blockerDepthSum / float( numBlockers );
}

float PCF_Filter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius ) {
  float sum = 0.0;
  float depth;
  #pragma unroll_loop_start
  for( int i = 0; i < 17; i ++ ) {
    depth = texture2D( shadowMap, uv + poissonDisk[ i ] * filterRadius ).r;
    if( zReceiver <= depth ) sum += 1.0;
  }
  #pragma unroll_loop_end
  #pragma unroll_loop_start
  for( int i = 0; i < 17; i ++ ) {
    depth = texture2D( shadowMap, uv + -poissonDisk[ i ].yx * filterRadius ).r;
    if( zReceiver <= depth ) sum += 1.0;
  }
  #pragma unroll_loop_end
  return sum / ( 2.0 * float( 17 ) );
}

float PCSS ( sampler2D shadowMap, vec4 coords ) {
  vec2 uv = coords.xy;
  float zReceiver = coords.z;
  initPoissonSamples( uv );
  float avgBlockerDepth = findBlocker( shadowMap, uv, zReceiver );
  if( avgBlockerDepth == -1.0 ) return 1.0;
  float penumbraRatio = penumbraSize( zReceiver, avgBlockerDepth );
  float filterRadius = penumbraRatio * LIGHT_SIZE_UV * NEAR_PLANE / zReceiver;
  return PCF_Filter( shadowMap, uv, zReceiver, filterRadius );
}
`;

const PCSS_GET_SHADOW = `
return PCSS( shadowMap, shadowCoord );
`;

let applied = false;

export function applyPcssShadowChunks(): void {
  if (applied) return;
  let source = ShaderChunk.shadowmap_pars_fragment;
  // Insert the PCSS helpers right after `#ifdef USE_SHADOWMAP`. The
  // pcss helper functions become visible to every material that
  // includes the shadow_pars chunk (i.e. anything with USE_SHADOWMAP).
  source = source.replace(
    "#ifdef USE_SHADOWMAP",
    `#ifdef USE_SHADOWMAP\n${PCSS_PARS}`
  );
  // Replace the BASIC-variant getShadow's first read so it routes through
  // PCSS() instead of the default texture2D fetch. We match the
  // `if ( frustumTest ) {` block tolerating any whitespace before the
  // `float depth = texture2D(...)` line — three.js bumps the surrounding
  // whitespace between releases (the r184 source has an empty line
  // between `{` and the assignment, the r170 source doesn't).
  const before = source;
  source = source.replace(
    /(if \( frustumTest \) \{)([\s\S]{0,80}?)(float depth = texture2D\( shadowMap, shadowCoord\.xy \)\.r;)/,
    (_match, openBrace: string, gap: string, depthLine: string) =>
      `${openBrace}${gap}${PCSS_GET_SHADOW}\n${depthLine}`
  );
  if (source === before) {
    // The upstream chunk text drifted out from under us. Surface a
    // console warning so an agent triaging "PCSS looks like PCF" finds
    // the cause quickly instead of guessing.
    // agf-allow:console pre-runtime shader-patch path; no diagnostics bus reachable from this module.
    console.warn(
      "[agf:shadow-pcss] BASIC-variant `getShadow` substitution did not match `shadowmap_pars_fragment` — PCSS will silently no-op. Check three.js version drift."
    );
  }
  ShaderChunk.shadowmap_pars_fragment = source;
  applied = true;
}

/** Test helper — exposed so a unit test can assert the substitution was idempotent. */
export function pcssChunksApplied(): boolean {
  return applied;
}
