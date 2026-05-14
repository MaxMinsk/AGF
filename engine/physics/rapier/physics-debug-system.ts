// M24-debug: frame-update System that mirrors Rapier's debugRender()
// output into a LineSegments overlay in the renderer's scene. Toggling
// is owned by the caller — the system reads `state.enabled` each frame
// so __agf.physics.setDebugOverlay(true|false) flips it live without
// re-registering the system.

import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../../render/three-render-adapter";
import type { RapierAdapter } from "./rapier-adapter";

export type PhysicsDebugState = {
  /** Live toggle — flip it from __agf.physics.setDebugOverlay. */
  enabled: boolean;
};

export type PhysicsDebugSystemDeps = {
  physics: RapierAdapter;
  renderer: ThreeRenderAdapter;
  state: PhysicsDebugState;
};

export type PhysicsDebugSystemHandle = System;

export function createPhysicsDebugSystem(
  deps: PhysicsDebugSystemDeps,
  options: { name?: string } = {}
): PhysicsDebugSystemHandle {
  const name = options.name ?? "physics.debug";
  let overlayActive = false;

  const frameUpdate = (_context: SystemContext): void => {
    const wantOn = deps.state.enabled;
    if (wantOn !== overlayActive) {
      overlayActive = deps.renderer.setDebugOverlayEnabled(wantOn);
    }
    if (!overlayActive) return;
    const lines = deps.physics.getDebugLines();
    if (lines === undefined) return;
    deps.renderer.setDebugOverlayData(lines.vertices, lines.colors);
  };

  return { name, frameUpdate };
}
