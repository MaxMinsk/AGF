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
// **Current scope (v0):** the substitution targets the BASIC-shadowmap
// variant of `getShadow` (the one that calls `texture2D(...)` rather
// than `texture(...)` with `sampler2DShadow`). Default three.js shadow
// mode `PCFShadowMap` uses the modern Vogel-disc / sampler2DShadow
// path, so the substitution silently no-ops there. A proper fix that
// rewrites the modern PCF variant + a CSM-shader patch are tracked as
// `M21-shadow-pcss-modern` + `M21-shadow-pcss-csm`. Until they land,
// `algorithm: "pcss"` is only visibly different from PCF when paired
// with `BasicShadowMap` (which AGF doesn't currently expose).

import { ShaderChunk } from "three";

// Free parameters baked into the GLSL. Reasonable defaults for outdoor
// scenes with a sun-like directional light + a 10–30m world.
const PCSS_PARS = `
#define LIGHT_WORLD_SIZE 0.005
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
  // Replace the inner getShadow flow's first read so it routes through
  // PCSS() instead of the default texture2D fetch. Pattern is taken
  // straight from three's `webgl_shadowmap_pcss.html` example; if the
  // upstream chunk text changes the match falls through silently and
  // the project falls back to PCF.
  source = source.replace(
    "\t\t\tif ( frustumTest ) {\n\t\t\t\tfloat depth = texture2D( shadowMap, shadowCoord.xy ).r;",
    `\t\t\tif ( frustumTest ) {\n${PCSS_GET_SHADOW}\n\t\t\t\tfloat depth = texture2D( shadowMap, shadowCoord.xy ).r;`
  );
  ShaderChunk.shadowmap_pars_fragment = source;
  applied = true;
}

/** Test helper — exposed so a unit test can assert the substitution was idempotent. */
export function pcssChunksApplied(): boolean {
  return applied;
}
