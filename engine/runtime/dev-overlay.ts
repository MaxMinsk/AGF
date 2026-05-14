export type DevOverlayMetrics = {
  fps: number;
  fixedStepsPerSecond: number;
  entityCount: number;
  /**
   * Three.js `WebGLRenderer.info.render.calls` from the previous frame.
   * Exposed so the agent + dev can spot batching regressions at a
   * glance — `examples/batch-bench` ought to show ~5 draws regardless
   * of seed count; spikes here mean a system is breaking the bucketer.
   */
  drawCalls?: number;
};

export type DevOverlayHandle = {
  readonly element: HTMLElement;
  update(metrics: DevOverlayMetrics): void;
  dispose(): void;
};

export function createDevOverlay(parent: HTMLElement): DevOverlayHandle {
  const element = document.createElement("aside");
  element.className = "engine-dev-overlay";
  element.setAttribute("aria-label", "Engine debug metrics");
  element.setAttribute("data-testid", "engine-dev-overlay");
  element.innerHTML = renderMetrics({ fps: 0, fixedStepsPerSecond: 0, entityCount: 0 });
  parent.append(element);

  return {
    element,
    update(metrics: DevOverlayMetrics): void {
      element.innerHTML = renderMetrics(metrics);
    },
    dispose(): void {
      element.remove();
    }
  };
}

function renderMetrics(metrics: DevOverlayMetrics): string {
  const parts = [
    `<span class="metric"><strong>${metrics.fps.toFixed(0)}</strong> fps</span>`,
    `<span class="metric"><strong>${metrics.fixedStepsPerSecond.toFixed(0)}</strong> steps/s</span>`,
    `<span class="metric"><strong>${metrics.entityCount}</strong> entities</span>`
  ];
  if (metrics.drawCalls !== undefined) {
    parts.push(
      `<span class="metric"><strong>${metrics.drawCalls}</strong> draws</span>`
    );
  }
  return parts.join("");
}
