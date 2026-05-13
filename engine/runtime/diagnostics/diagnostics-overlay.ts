// DEV-only diagnostics overlay. Mounts a small panel that lists the last N
// warning / error events from a `DiagnosticsBus`. info events are filtered
// out to keep the panel quiet during normal play.

import type { DiagnosticsBus, RuntimeDiagnostic } from "./diagnostics-bus";

const PANEL_MAX_ITEMS = 8;

export type DiagnosticsOverlayHandle = {
  dispose(): void;
};

export function mountDiagnosticsOverlay(
  parent: HTMLElement,
  bus: DiagnosticsBus
): DiagnosticsOverlayHandle {
  const root = document.createElement("aside");
  root.setAttribute("data-testid", "diagnostics-overlay");
  root.style.cssText = [
    "position: absolute",
    "right: 24px",
    "bottom: 24px",
    "display: flex",
    "flex-direction: column",
    "gap: 4px",
    "padding: 10px 12px",
    "min-width: 220px",
    "max-width: 360px",
    "color: rgba(234, 244, 255, 0.92)",
    "background: rgba(24, 8, 8, 0.7)",
    "border: 1px solid rgba(255, 110, 110, 0.4)",
    "border-radius: 4px",
    "font-family: inherit",
    "font-size: 11px",
    "line-height: 1.35",
    "pointer-events: none",
    "backdrop-filter: blur(8px)",
    "display: none"
  ].join(";");

  const heading = document.createElement("div");
  heading.textContent = "DIAGNOSTICS";
  heading.style.cssText = "font-weight:600; letter-spacing:0.06em; opacity:0.75;";
  root.append(heading);

  const list = document.createElement("div");
  list.setAttribute("data-testid", "diagnostics-overlay-list");
  list.style.cssText = "display:flex; flex-direction:column; gap:3px;";
  root.append(list);

  parent.append(root);

  const render = (): void => {
    const items = bus
      .snapshot()
      .filter((entry) => entry.severity !== "info")
      .slice(-PANEL_MAX_ITEMS);
    if (items.length === 0) {
      root.style.display = "none";
      list.replaceChildren();
      return;
    }
    root.style.display = "flex";
    list.replaceChildren();
    for (const entry of items) {
      list.append(renderEntry(entry));
    }
  };

  const unsubscribe = bus.subscribe(() => render());
  render();

  return {
    dispose(): void {
      unsubscribe();
      root.remove();
    }
  };
}

function renderEntry(entry: RuntimeDiagnostic): HTMLElement {
  const line = document.createElement("div");
  line.setAttribute("data-testid", `diagnostics-overlay-entry-${entry.id}`);
  line.style.cssText = `color: ${
    entry.severity === "error" ? "rgba(255, 130, 130, 0.95)" : "rgba(255, 200, 120, 0.95)"
  };`;
  const tag = entry.severity.toUpperCase();
  const detail = entry.assetRef !== undefined ? ` (${entry.assetRef})` : "";
  line.textContent = `[${tag}] ${entry.code}${detail}\n${entry.message}`;
  return line;
}
