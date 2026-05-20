// S091 AGF-RENDER-DEBUG-OVERLAY-HUD. Companion to the
// AGF-RENDER-DEBUG-MODE-AGENT renderer override toggle. While the
// renderer's debug mode is not "off", we surface a topRight HUD pill
// labelled `DEBUG: <mode>` so the player / agent can't accidentally
// leave the override on. Flipping back to "off" removes the pill.

import type { HudHandle } from "./hud";
import type { RenderDebugMode } from "../../render/debug-mode";

export const RENDER_DEBUG_PILL_WIDGET_ID = "agf:render-debug-pill";

/** Mount / update / unmount the debug pill based on the current render
 *  debug mode. Idempotent — safe to call every flip. */
export function syncRenderDebugPill(hud: HudHandle, mode: RenderDebugMode): void {
  const widgetIds = hud.widgets();
  const mounted = widgetIds.includes(RENDER_DEBUG_PILL_WIDGET_ID);
  if (mode === "off") {
    if (mounted) hud.remove(RENDER_DEBUG_PILL_WIDGET_ID);
    return;
  }
  if (!mounted) {
    hud.add<RenderDebugMode>({
      id: RENDER_DEBUG_PILL_WIDGET_ID,
      slot: "topRight",
      render: (data) => `DEBUG: ${data}`,
      initial: mode
    });
    return;
  }
  hud.update<RenderDebugMode>(RENDER_DEBUG_PILL_WIDGET_ID, mode);
}
