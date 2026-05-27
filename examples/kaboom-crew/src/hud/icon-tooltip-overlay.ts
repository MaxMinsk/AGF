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

/**
 * Pure helper — derive a stable identity key for a tooltip-stamped
 * element from its name + state attributes. The HUD re-renders icon
 * DOM every frame, so reference-equality (`target === pendingTarget`)
 * fails every tick even when the user is hovering the SAME icon. The
 * fix in S161-c was to compare by key.
 *
 * Exposed for unit-test coverage of the hover-state logic without a
 * full DOM environment.
 */
export function tooltipIdentityKey(name: string | null, state: string | null | undefined): string | null {
  if (name === null) return null;
  return `${name}::${state ?? ""}`;
}

/**
 * Pure hover-state reducer. Takes the current pending key + whether a
 * timer is already armed + whether the overlay is visible, and the
 * incoming target's key. Returns the action the caller should take.
 *
 * Returning "skip" means the caller should leave pending state alone
 * (it's the same icon, timer already armed or overlay already showing
 * for it). Returning "schedule" means clear-pending + new timer.
 * Returning "instant" means overlay already up but for a different
 * icon — swap content immediately.
 */
export type HoverAction = "skip" | "schedule" | "instant";

export function hoverActionFor(
  incomingKey: string | null,
  pendingKey: string | null,
  timerArmed: boolean,
  visible: boolean
): HoverAction {
  if (incomingKey === null) return "skip";
  if (incomingKey === pendingKey && timerArmed) return "skip";
  if (visible && incomingKey === pendingKey) return "skip";
  if (visible) return "instant";
  return "schedule";
}

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
  let pendingKey: string | null = null;
  let visible = false;

  // The HUD widgets re-render their DOM every frame (powerup-grid +
  // opponent-badges + dash-cell all return fresh elements on each
  // tick), so comparing `target === pendingTarget` by reference fails
  // every frame, cancelling the pending timer before it can fire.
  // Use the icon's tooltip name as a stable identity key + refresh
  // pendingTarget to the latest live element on each pointerover.
  function targetKey(el: HTMLElement | null): string | null {
    if (el === null) return null;
    return tooltipIdentityKey(el.getAttribute(TOOLTIP_NAME_ATTR), el.getAttribute(TOOLTIP_STATE_ATTR));
  }

  function clearPending(): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
    pendingTarget = null;
    pendingKey = null;
  }

  function placeOverlay(target: HTMLElement): void {
    overlay.style.display = "block";
    // Render to measure size, then position.
    overlay.style.left = "-9999px";
    overlay.style.top = "-9999px";
    requestAnimationFrame(() => {
      // The HUD re-renders icons every frame; the original target may
      // already be detached. Re-resolve the live wrapper by stable key.
      const live = resolveLiveTarget(target);
      const rect = live.getBoundingClientRect();
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

  function resolveLiveTarget(target: HTMLElement): HTMLElement {
    if (document.body.contains(target)) return target;
    const name = target.getAttribute(TOOLTIP_NAME_ATTR);
    if (name === null) return target;
    // Match name + state if state was set (state-bearing icons can
    // exist with two near-identical attribute sets, e.g. dash slot's
    // 'READY' vs 'COOLDOWN ...').
    const state = target.getAttribute(TOOLTIP_STATE_ATTR);
    const candidates = document.querySelectorAll(`[${TOOLTIP_NAME_ATTR}="${cssEscape(name)}"]`);
    for (const el of Array.from(candidates)) {
      if (!(el instanceof HTMLElement)) continue;
      if (state === null) return el;
      if (el.getAttribute(TOOLTIP_STATE_ATTR) === state) return el;
    }
    // Fall back to first by name.
    const first = document.querySelector(`[${TOOLTIP_NAME_ATTR}="${cssEscape(name)}"]`);
    return first instanceof HTMLElement ? first : target;
  }

  function cssEscape(s: string): string {
    return s.replace(/"/g, '\\"');
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
    overlay.style.display = "block";
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
      // Pointer moved out of any tooltip-stamped element. Don't clear
      // pending — the HUD's per-frame DOM replacement also triggers
      // pointerover/out churn; rely on pointerout to hide explicitly.
      return;
    }
    const key = targetKey(target);
    const action = hoverActionFor(key, pendingKey, pendingTimer !== undefined, visible);
    if (action === "skip") {
      // Same icon — refresh DOM reference (old node is detached after
      // the last HUD render) so placeOverlay can read live bounds.
      pendingTarget = target;
      return;
    }
    clearPending();
    pendingTarget = target;
    pendingKey = key;
    if (action === "instant") {
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
    // Guard via relatedTarget: pointerout fires when moving to inner
    // children too. Crucially also fires when the HUD re-renders the
    // current cell — in that case `relatedTarget` is null but the new
    // DOM element will get a fresh pointerover, so we should NOT
    // immediately hide. Defer the hide until pointer hasn't been seen
    // on ANY tooltip target for one frame.
    const evt = ev as MouseEvent;
    const next = findTooltipTarget(evt.relatedTarget as EventTarget | null);
    if (next !== null) return;
    // Soft hide: schedule via rAF; pointerover on the replacement DOM
    // (re-rendered same icon) will cancel it.
    if (typeof requestAnimationFrame !== "function") {
      clearPending();
      if (visible) hide();
      return;
    }
    requestAnimationFrame(() => {
      // If pointerover landed on a target meanwhile, pendingTarget got
      // refreshed and we should leave the timer running.
      if (pendingTarget !== null && document.body.contains(pendingTarget)) return;
      // Stale pointer state — actually hide.
      clearPending();
      if (visible) hide();
    });
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
