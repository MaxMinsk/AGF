// S61 WEBGPU-spike-project. Hello-3d-shaped scene that opts into the
// WebGPU adapter via `project.json#render.mode: "webgpu"`. Holds AGF's
// continuous WebGPU smoke trail — `engine:check` + e2e + manual
// inspection all run against this project to catch three.js WebGPU
// regressions between minor versions.
//
// Deliberately small: no PMREM probes, no Reflector, no post-processing
// — those features don't yet have WebGPU implementations and the
// `WebGpuRenderAdapter` either skips or warns. Lands when the
// `M21-webgpu-feature-parity` epic (S62 / S63) ports them.

import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

export const webgpuSpikeBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // Intentionally empty — the engine's built-in systems (Spin /
    // MeshLifecycle / LightLifecycle / TransformResolve / CameraSync /
    // MeshTransformSync) cover everything this scene needs.
  }
};
