// S63 WEBGPU-light-investigation. Diagnostic project — five identical
// white spheres in a row, each lit by a different `Light.kind` so we
// can eyeball which light types contribute on three.js's WebGPU adapter
// in r0.184.

import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

export const webgpuLightTestBootstrap: ProjectBootstrap = {
  registerSystems(): void {}
};
