// S161 KABOOM-HUD-TOOLTIPS (GDP-2026-05-28-007).
//
// Shared singleton tooltip element + event-delegated hover wiring for
// HUD icons. Power-up grid cells + opponent badge cells opt in by
// stamping `data-tooltip-name` / `data-tooltip-desc` / optional
// `data-tooltip-state` attributes; the overlay reads them on hover
// after a configurable delay (default 400 ms) and renders a small
// dark bubble above the icon.
//
// Touch / aria-describedby / prefers-reduced-motion are deferred —
// v1 covers mouse hover + keyboard focus only (the two paths every
// browser supports without polyfills).

const TOOLTIP_ID = "kaboom-hud-tooltip-overlay";
const TOOLTIP_NAME_ATTR = "data-tooltip-name";
const TOOLTIP_DESC_ATTR = "data-tooltip-desc";
const TOOLTIP_STATE_ATTR = "data-tooltip-state";

export type IconTooltipOverlayOptions = {
  /** Hover delay before show (ms). Default 400. */
  delayMs?: number;
  /** Set to false to disable the overlay (e.g. ?hudTooltips=off). */
  enabled?: boolean;
  /** Optional DOM root to scope hover-event listening. Defaults to document.body. */
  root?: HTMLElement | Document;
};

export type IconTooltipOverlayHandle = {
  /** Manually show the tooltip for a target element (useful for tests). */
  show(target: HTMLElement): void;
  /** Manually hide. */
  hide(): void;
  /** Removes listeners + the overlay element. Safe to call multiple times. */
  destroy(): void;
  /** True when the overlay is currently visible. */
  isVisible(): boolean;
};

export function installIconTooltipOverlay(options: IconTooltipOverlayOptions = {}): IconTooltipOverlayHandle {
  const enabled = options.enabled !== false;
  const delayMs = Math.max(0, options.delayMs ?? 400);
  const root = options.root ?? document;

  // Reuse an existing overlay if HMR re-runs the install path.
  const existing = document.getElementById(TOOLTIP_ID);
  if (existing !== null) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = TOOLTIP_ID;
  overlay.setAttribute(
    "style",
    [
      "position:fixed",
      "z-index:9999",
      "max-width:240px",
      "padding:8px 10px",
      "background:rgba(15,15,18,0.92)",
      "color:#f4ede0",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "font-size:13px",
      "line-height:1.35",
      "border:1px solid #3a3a3f",
      "pointer-events:none",
      "opacity:0",
      "transition:opacity 0.15s ease-out",
      "white-space:pre-line",
      "display:none"
    ].join(";")
  );
  document.body.appendChild(overlay);

  let pendingTimer: number | undefined;
  let pendingTarget: HTMLElement | null = null;
  let visible = false;

  function clearPending(): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
    pendingTarget = null;
  }

  function placeOverlay(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    overlay.style.display = "block";
    // Render to measure size, then position.
    overlay.style.left = "-9999px";
    overlay.style.top = "-9999px";
    requestAnimationFrame(() => {
      const ow = overlay.offsetWidth;
      const oh = overlay.offsetHeight;
      const gap = 8;
      let top = rect.top - oh - gap;
      // Flip below if off-screen top.
      if (top < gap) top = rect.bottom + gap;
      // Centre horizontally on the target; clamp to viewport.
      const desiredLeft = rect.left + (rect.width - ow) / 2;
      const minLeft = gap;
      const maxLeft = (window.innerWidth || 1024) - ow - gap;
      const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      overlay.style.left = `${Math.round(left)}px`;
      overlay.style.top = `${Math.round(top)}px`;
    });
  }

  function setBody(target: HTMLElement): boolean {
    const name = target.getAttribute(TOOLTIP_NAME_ATTR);
    const desc = target.getAttribute(TOOLTIP_DESC_ATTR);
    if (name === null || desc === null) return false;
    const state = target.getAttribute(TOOLTIP_STATE_ATTR);
    const body = state === null || state.length === 0
      ? `${name} — ${desc}`
      : `${name} — ${desc}\n${state}`;
    overlay.textContent = body;
    return true;
  }

  function show(target: HTMLElement): void {
    if (!setBody(target)) return;
    placeOverlay(target);
    overlay.style.opacity = "1";
    visible = true;
  }

  function hide(): void {
    overlay.style.opacity = "0";
    visible = false;
    // After fade-out, hide entirely so layout queries can't trip.
    setTimeout(() => {
      if (!visible) overlay.style.display = "none";
    }, 160);
  }

  function findTooltipTarget(el: EventTarget | null): HTMLElement | null {
    // Real pointer events fire on the deepest hit node, which inside
    // each cell is the inner <svg> / <path> — those are SVGElement,
    // NOT HTMLElement, so we must use the broader Element base.
    if (!(el instanceof Element)) return null;
    const ancestor = el.closest(`[${TOOLTIP_NAME_ATTR}]`);
    return ancestor instanceof HTMLElement ? ancestor : null;
  }

  function onPointerOver(ev: Event): void {
    const target = findTooltipTarget(ev.target);
    if (target === null) {
      // Pointer moved out of an icon entirely.
      if (visible) hide();
      clearPending();
      return;
    }
    if (target === pendingTarget && pendingTimer !== undefined) return;
    if (visible && pendingTarget === target) return;
    clearPending();
    pendingTarget = target;
    if (visible) {
      // Already showing — instant transition to the new target.
      show(target);
      return;
    }
    pendingTimer = window.setTimeout(() => {
      pendingTimer = undefined;
      if (pendingTarget !== null) show(pendingTarget);
    }, delayMs);
  }

  function onPointerOut(ev: Event): void {
    const target = findTooltipTarget(ev.target);
    if (target === null) return;
    // FromTarget cleared; but `mouseout` fires when moving to inner
    // children too — guard via relatedTarget.
    const evt = ev as MouseEvent;
    const next = findTooltipTarget(evt.relatedTarget as EventTarget | null);
    if (next !== null) return;
    clearPending();
    if (visible) hide();
  }

  function onFocus(ev: Event): void {
    const target = findTooltipTarget(ev.target);
    if (target === null) return;
    clearPending();
    pendingTarget = target;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = undefined;
      if (pendingTarget !== null) show(pendingTarget);
    }, delayMs);
  }

  function onBlur(_ev: Event): void {
    clearPending();
    if (visible) hide();
  }

  function onWindowBlur(): void {
    clearPending();
    if (visible) hide();
  }

  let attached = false;
  if (enabled) {
    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", onBlur);
    window.addEventListener("blur", onWindowBlur);
    attached = true;
  }

  return {
    show,
    hide,
    isVisible: () => visible,
    destroy(): void {
      clearPending();
      if (attached) {
        root.removeEventListener("pointerover", onPointerOver);
        root.removeEventListener("pointerout", onPointerOut);
        root.removeEventListener("focusin", onFocus);
        root.removeEventListener("focusout", onBlur);
        window.removeEventListener("blur", onWindowBlur);
        attached = false;
      }
      overlay.remove();
    }
  };
}

export const TOOLTIP_ATTRS = {
  NAME: TOOLTIP_NAME_ATTR,
  DESC: TOOLTIP_DESC_ATTR,
  STATE: TOOLTIP_STATE_ATTR
};
