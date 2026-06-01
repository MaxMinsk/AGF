// S216 ENGINE-POSTFX-VIGNETTE (GDP-2026-05-29-002 part 3). A
// fragment-shader pass for `EffectComposer` that darkens the screen
// edges into a configurable colour, reinforcing the diorama framing
// that's central to AGF's top-down camera look.
//
// Shape mirrors the bloom / fxaa / lut entries already on the
// chain: this module exports a pure shader-spec builder. The
// adapter wraps the spec in a Three.js `ShaderPass` from
// `three/examples/jsm/postprocessing/ShaderPass.js`. WebGL only —
// the WebGPU backend still rejects ShaderMaterial-based passes per
// the standing engine note in `render-adapter.ts`.

import { Color } from "three";

/** Pure helper — emits the ShaderPass spec (`uniforms` + `vertex` +
 *  `fragment`) for a radial-falloff vignette. Edges darken toward
 *  `color` by `intensity`; `smoothness` controls how soft the
 *  falloff is from screen centre to corner. Exported as a builder
 *  so unit tests can lock the GLSL surface + the uniform defaults
 *  without spinning a renderer. */
export function buildVignetteShader(params: {
  intensity?: number;
  smoothness?: number;
  color?: string;
} = {}): {
  uniforms: {
    tDiffuse: { value: null };
    intensity: { value: number };
    smoothness: { value: number };
    color: { value: Color };
  };
  vertexShader: string;
  fragmentShader: string;
} {
  const intensity = clamp01(params.intensity ?? 0.4);
  const smoothness = clamp01(params.smoothness ?? 0.45);
  const colorHex = params.color ?? "#000000";
  return {
    uniforms: {
      tDiffuse: { value: null },
      intensity: { value: intensity },
      smoothness: { value: smoothness },
      color: { value: new Color(colorHex) }
    },
    vertexShader: VIGNETTE_VERT,
    fragmentShader: VIGNETTE_FRAG
  };
}

const VIGNETTE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Radial falloff with corner-normalised distance. `d` is 0 at the
// centre and 1 at the corner of a 16:9 frame (sqrt(0.5^2 + 0.5^2) ≈
// 0.707; we divide by that). `falloff` ramps from 0 at the centre
// to 1 past the smoothstep edge, then mixes the source colour
// toward `color` by `intensity * falloff`.
const VIGNETTE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float intensity;
uniform float smoothness;
uniform vec3 color;
varying vec2 vUv;
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec2 centred = vUv - vec2(0.5);
  float d = length(centred) / 0.7071;
  // Falloff begins at (1 - smoothness) of the way out; fully on at d=1.
  float edgeStart = max(0.0, 1.0 - smoothness);
  float falloff = smoothstep(edgeStart, 1.0, d);
  vec3 mixed = mix(src.rgb, color, intensity * falloff);
  gl_FragColor = vec4(mixed, src.a);
}
`;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
