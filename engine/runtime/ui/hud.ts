// S81 KABOOM-HUD-RUNTIME. Engine HUD primitive — a thin DOM-overlay
// surface so games don't keep rolling ad-hoc HTML (beacon-world's
// HP/SIG widget pattern). The runtime mounts a single
// `<div data-agf-hud>` adjacent to the canvas with 5 slot containers
// (`topLeft | topRight | bottomLeft | bottomRight | center`). Widgets
// register through `hud.add(spec)`, receive updates via `hud.update`,
// and are removed by `hud.remove`. The renderer is a pure function
// `(data) => string | HTMLElement` — strings go through textContent so
// no project-supplied data ever lands in innerHTML.
//
// Every DOM touchpoint in the engine that the HUD needs lives in this
// file: nothing else under engine/ may import the DOM directly for
// HUD purposes. Project code reaches the HUD through `runtime.hud`.

export type HudSlot = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "center";

export type HudWidgetSpec<TData = unknown> = {
  /** Stable id; `hud.update(id, ...)` and `hud.remove(id)` reference this. */
  id: string;
  /** Where the widget mounts. Slot order top→bottom, left→right. */
  slot: HudSlot;
  /**
   * Renderer. Return a string (rendered as plain text, escaped) or an
   * HTMLElement (replaces the previous content as-is — the project owns
   * sanitisation). Called once on add + once per `update`.
   */
  render: (data: TData) => string | HTMLElement;
  /** Initial data passed to `render`. Optional; default `undefined`. */
  initial?: TData;
};

export type HudHandle = {
  /** Add a new widget. Throws if `id` already exists. */
  add<TData>(spec: HudWidgetSpec<TData>): void;
  /** Re-run a widget's renderer with new data. No-op when `id` is unknown. */
  update<TData>(id: string, data: TData): void;
  /** Remove a widget. No-op when `id` is unknown. */
  remove(id: string): void;
  /** Listed widget ids in insertion order. Useful for diagnostics + tests. */
  widgets(): ReadonlyArray<string>;
  /** Tear down the root element + every widget child. Idempotent. */
  dispose(): void;
};

// Single source of truth for slot positioning. Inline styles keep the
// surface CSS-framework-free; projects that want their own look just
// return a styled HTMLElement from their renderer.
const SLOT_STYLES: Record<HudSlot, string> = {
  topLeft: "position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:4px;align-items:flex-start;",
  topRight: "position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:4px;align-items:flex-end;",
  bottomLeft: "position:absolute;bottom:8px;left:8px;display:flex;flex-direction:column;gap:4px;align-items:flex-start;",
  bottomRight: "position:absolute;bottom:8px;right:8px;display:flex;flex-direction:column;gap:4px;align-items:flex-end;",
  center: "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:4px;align-items:center;"
};

const ROOT_STYLE =
  "position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;";

const WIDGET_STYLE =
  "background:rgba(0,0,0,0.55);padding:4px 8px;border-radius:4px;font-size:12px;pointer-events:auto;";

/**
 * Create a HUD root next to `parent` (typically the canvas's parent).
 * The runtime calls this once during startRuntime and exposes the
 * handle as `runtime.hud`.
 */
export function createHud(parent: HTMLElement, options: { dataAttribute?: string } = {}): HudHandle {
  const dataAttribute = options.dataAttribute ?? "data-agf-hud";
  const doc = parent.ownerDocument;
  const root = doc.createElement("div");
  root.setAttribute(dataAttribute, "");
  root.setAttribute("style", ROOT_STYLE);
  const slots: Record<HudSlot, HTMLElement> = {} as Record<HudSlot, HTMLElement>;
  for (const slot of Object.keys(SLOT_STYLES) as HudSlot[]) {
    const el = doc.createElement("div");
    el.setAttribute("data-agf-hud-slot", slot);
    el.setAttribute("style", SLOT_STYLES[slot]);
    slots[slot] = el;
    root.appendChild(el);
  }
  parent.appendChild(root);

  type Entry = {
    id: string;
    slot: HudSlot;
    element: HTMLElement;
    render: (data: unknown) => string | HTMLElement;
  };
  const order: string[] = [];
  const entries = new Map<string, Entry>();
  let disposed = false;

  function paint(entry: Entry, data: unknown): void {
    const output = entry.render(data);
    // Clear previous content first; appending a string sets textContent
    // (escaped), appending an HTMLElement replaces children with the node.
    while (entry.element.firstChild !== null) {
      entry.element.removeChild(entry.element.firstChild);
    }
    if (typeof output === "string") {
      entry.element.textContent = output;
    } else {
      entry.element.appendChild(output);
    }
  }

  return {
    add<TData>(spec: HudWidgetSpec<TData>): void {
      if (disposed) throw new Error(`[agf:hud] cannot add(${spec.id}) — HUD is disposed.`);
      if (entries.has(spec.id)) {
        throw new Error(`[agf:hud] widget id "${spec.id}" already registered.`);
      }
      const element = doc.createElement("div");
      element.setAttribute("data-agf-hud-widget", spec.id);
      element.setAttribute("style", WIDGET_STYLE);
      slots[spec.slot].appendChild(element);
      const entry: Entry = {
        id: spec.id,
        slot: spec.slot,
        element,
        render: spec.render as (data: unknown) => string | HTMLElement
      };
      entries.set(spec.id, entry);
      order.push(spec.id);
      paint(entry, spec.initial);
    },
    update<TData>(id: string, data: TData): void {
      const entry = entries.get(id);
      if (entry === undefined) return;
      paint(entry, data);
    },
    remove(id: string): void {
      const entry = entries.get(id);
      if (entry === undefined) return;
      if (entry.element.parentNode !== null) {
        entry.element.parentNode.removeChild(entry.element);
      }
      entries.delete(id);
      const idx = order.indexOf(id);
      if (idx >= 0) order.splice(idx, 1);
    },
    widgets(): ReadonlyArray<string> {
      return [...order];
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      entries.clear();
      order.length = 0;
      if (root.parentNode !== null) {
        root.parentNode.removeChild(root);
      }
    }
  };
}
