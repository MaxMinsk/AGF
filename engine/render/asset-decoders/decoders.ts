// ASSET-decoder-paths: process-wide singletons for the GLTF decoder
// helpers (Draco geometry + KTX2 texture transcoding + Meshopt
// decompression). Constructed lazily on first request; reused by every
// `createGlbLoader` (and any future asset loader) so we never end up
// with N copies of the same wasm module / N copies of the runtime
// transcoder path table.
//
// Why singletons matter:
//   - DRACOLoader builds a Web Worker pool the first time `setDecoderPath`
//     + `preload()` runs. A second instance starts a SECOND pool.
//   - KTX2Loader.detectSupport(renderer) registers GPU capabilities;
//     calling it once vs once-per-loader is a real bandwidth saving on
//     scenes that load assets in parallel.
//   - Meshopt decompression is shared state — re-importing the decoder
//     creates another async worker on each invocation.

import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { WebGLRenderer } from "three";

let dracoInstance: DRACOLoader | undefined;
let ktx2Instance: KTX2Loader | undefined;
let lastKtx2Renderer: WebGLRenderer | undefined;

export type DecoderOptions = {
  /**
   * Public-path prefix where Draco's wasm decoder files live. Defaults
   * to the three/examples CDN; for offline / production builds copy
   * `node_modules/three/examples/jsm/libs/draco/` into `/draco/` and
   * pass that path here.
   */
  dracoDecoderPath?: string;
  /**
   * Public-path prefix where Basis transcoder files live. Defaults to
   * the three/examples CDN; for offline / production builds copy
   * `node_modules/three/examples/jsm/libs/basis/` into `/basis/`.
   */
  ktx2TranscoderPath?: string;
};

const DEFAULT_DRACO_PATH = "https://unpkg.com/three/examples/jsm/libs/draco/";
const DEFAULT_KTX2_PATH = "https://unpkg.com/three/examples/jsm/libs/basis/";

/**
 * Return the process-wide DRACOLoader. The first call wires
 * `setDecoderPath` from `options.dracoDecoderPath` (or the three/examples
 * CDN default). Subsequent calls reuse the same instance.
 */
export function getDracoLoader(options: DecoderOptions = {}): DRACOLoader {
  if (dracoInstance === undefined) {
    const loader = new DRACOLoader();
    loader.setDecoderPath(options.dracoDecoderPath ?? DEFAULT_DRACO_PATH);
    dracoInstance = loader;
  }
  return dracoInstance;
}

/**
 * Return the process-wide KTX2Loader. `detectSupport(renderer)` is
 * called the first time AND whenever the renderer instance changes (HMR
 * reattach, multi-window dev) so the GPU caps reflect the active
 * context.
 */
export function getKtx2Loader(
  renderer: WebGLRenderer,
  options: DecoderOptions = {}
): KTX2Loader {
  if (ktx2Instance === undefined) {
    const loader = new KTX2Loader();
    loader.setTranscoderPath(options.ktx2TranscoderPath ?? DEFAULT_KTX2_PATH);
    ktx2Instance = loader;
  }
  if (lastKtx2Renderer !== renderer) {
    ktx2Instance.detectSupport(renderer);
    lastKtx2Renderer = renderer;
  }
  return ktx2Instance;
}

/**
 * Return the process-wide Meshopt decoder. Three.js exposes a single
 * `MeshoptDecoder` object whose `ready` promise must resolve before
 * use; we hand it back as-is and let GLTFLoader.setMeshoptDecoder
 * handle the await.
 */
export function getMeshoptDecoder(): typeof MeshoptDecoder {
  return MeshoptDecoder;
}

/** Test / HMR helper — forget the cached instances so the next call rebuilds. */
export function resetDecoderSingletonsForTest(): void {
  dracoInstance?.dispose();
  dracoInstance = undefined;
  ktx2Instance?.dispose();
  ktx2Instance = undefined;
  lastKtx2Renderer = undefined;
}
