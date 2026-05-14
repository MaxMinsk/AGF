// M23-tuner — ad-hoc agent-spawnable sliders bound to specific component
// fields. Agent calls `__agf.dev.tuner.add({ ... })` to surface a slider
// for, say, `Light.shadow.bias` on `light.sun`. Every drag goes through
// `applyCommands([{ kind: "component.set", entityId, component, data: ... }])`
// patching the parent component — so the tuner reuses every existing
// pipeline (snapshot visibility, network replication, HMR, recording,
// persistence) without growing a parallel state model.
//
// The slider panel is DOM, NOT an ECS entity. `__agf.snapshot()` never
// sees it, satisfying the "one ECS source of truth; derived structures
// are not authored state" rule from CLAUDE.md.
//
// Lifecycle:
//   __agf.dev.tuner.add({ name, target: { entityId, component, path },
//                         min, max, step?, value?, label? })
//   __agf.dev.tuner.remove(name)
//   __agf.dev.tuner.removeAll()
//   __agf.dev.tuner.list()  // for diagnostics + agent introspection
//   __agf.dev.tuner.dispose() // drop everything + remove the panel

import type { EngineCommand } from "../core/commands/types";
import type { World } from "../core/ecs/world";

export type TunerTarget = {
  entityId: string;
  component: string;
  /** Dot-path inside the component, e.g. "shadow.bias". Omit / empty for a top-level numeric component. */
  path?: string;
};

export type TunerSpec = {
  /** Unique name. Used to remove later. Must match `^[a-zA-Z0-9._:-]+$`. */
  name: string;
  target: TunerTarget;
  min: number;
  max: number;
  /** Default = (max - min) / 100, clamped to a sensible minimum. */
  step?: number;
  /** Override initial value (default: read current value from world). */
  value?: number;
  /** Display label (default: `${entityId}.${component}.${path}`). */
  label?: string;
};

export type DevTuner = {
  add(spec: TunerSpec): void;
  remove(name: string): void;
  removeAll(): void;
  list(): ReadonlyArray<{ name: string; target: TunerTarget; value: number }>;
  /** Drop everything; remove the floating panel. */
  dispose(): void;
};

export type DevTunerDeps = {
  world: World;
  applyCommands: (cmds: ReadonlyArray<EngineCommand>) => void;
  /** Parent for the floating panel. Defaults to `document.body`. */
  container?: HTMLElement;
};

type TunerEntry = {
  spec: TunerSpec;
  row: HTMLElement;
  slider: HTMLInputElement;
  numberInput: HTMLInputElement;
  /** Last value pushed to the DOM, used to detect external updates without re-rendering on every frame. */
  lastDisplayed: number;
};

const NAME_RE = /^[A-Za-z0-9._:-]+$/;

export function createDevTuner(deps: DevTunerDeps): DevTuner {
  const entries = new Map<string, TunerEntry>();
  let panel: HTMLElement | undefined;
  let rafHandle = 0;
  let disposed = false;

  const ensurePanel = (): HTMLElement => {
    if (panel !== undefined) return panel;
    const parent = deps.container ?? document.body;
    const el = document.createElement("aside");
    el.className = "engine-dev-tuner";
    el.setAttribute("aria-label", "AGF dev tuner");
    el.setAttribute("data-testid", "engine-dev-tuner");
    el.style.cssText = [
      "position: fixed",
      "right: 16px",
      "top: 80px",
      "z-index: 9999",
      "min-width: 240px",
      "max-width: 360px",
      "padding: 10px 12px",
      "background: rgba(12, 16, 24, 0.92)",
      "color: #d8e1ec",
      "font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      "border: 1px solid rgba(255,255,255,0.08)",
      "border-radius: 8px",
      "backdrop-filter: blur(6px)",
      "pointer-events: auto",
      "user-select: none"
    ].join(";");
    const heading = document.createElement("header");
    heading.textContent = "dev tuner";
    heading.style.cssText = [
      "font-weight: 600",
      "color: #9ab1cc",
      "margin: 0 0 8px",
      "letter-spacing: 0.06em",
      "text-transform: uppercase",
      "font-size: 10px"
    ].join(";");
    el.append(heading);
    parent.append(el);
    panel = el;
    return el;
  };

  const renderRow = (spec: TunerSpec, initial: number): TunerEntry => {
    const row = document.createElement("div");
    row.className = "engine-dev-tuner-row";
    row.setAttribute("data-tuner", spec.name);
    row.style.cssText = "margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;";

    const labelText = spec.label ?? `${spec.target.entityId}.${spec.target.component}${spec.target.path !== undefined && spec.target.path !== "" ? "." + spec.target.path : ""}`;
    const label = document.createElement("label");
    label.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:8px;";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelText;
    labelSpan.style.cssText = "opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.value = formatValue(initial, spec.step ?? defaultStep(spec.min, spec.max));
    numberInput.step = String(spec.step ?? defaultStep(spec.min, spec.max));
    numberInput.style.cssText = "width: 88px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e6efff; font: inherit; padding: 1px 4px; border-radius: 3px;";
    label.append(labelSpan, numberInput);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(spec.min);
    slider.max = String(spec.max);
    slider.step = String(spec.step ?? defaultStep(spec.min, spec.max));
    slider.value = String(initial);
    slider.style.cssText = "width: 100%;";

    row.append(label, slider);

    return { spec, row, slider, numberInput, lastDisplayed: initial };
  };

  const pushValue = (entry: TunerEntry, raw: number): void => {
    const clamped = clamp(raw, entry.spec.min, entry.spec.max);
    const currentComp = deps.world.getComponent(entry.spec.target.entityId, entry.spec.target.component);
    if (currentComp === undefined) return;
    const patched = setByPath(structuredClone(currentComp as Record<string, unknown>), entry.spec.target.path ?? "", clamped);
    deps.applyCommands([
      {
        kind: "component.set",
        entityId: entry.spec.target.entityId,
        component: entry.spec.target.component,
        data: patched as Record<string, unknown>
      }
    ]);
    entry.lastDisplayed = clamped;
  };

  const tick = (): void => {
    if (disposed) return;
    for (const entry of entries.values()) {
      const comp = deps.world.getComponent(entry.spec.target.entityId, entry.spec.target.component);
      const live = getByPath(comp, entry.spec.target.path ?? "");
      if (typeof live === "number" && live !== entry.lastDisplayed) {
        entry.slider.value = String(live);
        entry.numberInput.value = formatValue(live, Number(entry.slider.step));
        entry.lastDisplayed = live;
      }
    }
    rafHandle = (globalThis.requestAnimationFrame ?? defaultRaf)(tick);
  };

  rafHandle = (globalThis.requestAnimationFrame ?? defaultRaf)(tick);

  return {
    add(spec: TunerSpec): void {
      if (!NAME_RE.test(spec.name)) {
        throw new Error(`dev-tuner: invalid name "${spec.name}". Must match ${NAME_RE}.`);
      }
      if (entries.has(spec.name)) {
        throw new Error(`dev-tuner: tuner "${spec.name}" already exists. Remove it first or pick a unique name.`);
      }
      if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || spec.max <= spec.min) {
        throw new Error(`dev-tuner: bad range [${spec.min}, ${spec.max}] for "${spec.name}".`);
      }
      const initial = spec.value ?? readNumericValue(deps.world, spec.target) ?? (spec.min + spec.max) / 2;
      const entry = renderRow(spec, initial);
      entries.set(spec.name, entry);
      ensurePanel().append(entry.row);

      const onSlider = (): void => {
        const raw = Number(entry.slider.value);
        entry.numberInput.value = formatValue(raw, Number(entry.slider.step));
        pushValue(entry, raw);
      };
      const onNumber = (): void => {
        const raw = Number(entry.numberInput.value);
        if (!Number.isFinite(raw)) return;
        entry.slider.value = String(raw);
        pushValue(entry, raw);
      };
      entry.slider.addEventListener("input", onSlider);
      entry.numberInput.addEventListener("change", onNumber);

      // Push the initial value through so the world matches the slider on first render.
      pushValue(entry, initial);
    },
    remove(name: string): void {
      const entry = entries.get(name);
      if (entry === undefined) return;
      entry.row.remove();
      entries.delete(name);
      if (entries.size === 0 && panel !== undefined) {
        panel.remove();
        panel = undefined;
      }
    },
    removeAll(): void {
      for (const entry of entries.values()) entry.row.remove();
      entries.clear();
      if (panel !== undefined) {
        panel.remove();
        panel = undefined;
      }
    },
    list(): ReadonlyArray<{ name: string; target: TunerTarget; value: number }> {
      const out: Array<{ name: string; target: TunerTarget; value: number }> = [];
      for (const [name, entry] of entries) {
        out.push({ name, target: entry.spec.target, value: entry.lastDisplayed });
      }
      return out;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      entries.clear();
      if (panel !== undefined) {
        panel.remove();
        panel = undefined;
      }
      (globalThis.cancelAnimationFrame ?? defaultCancelRaf)(rafHandle);
    }
  };
}

function defaultRaf(cb: FrameRequestCallback): number {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}
function defaultCancelRaf(handle: number): void {
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

function defaultStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0.001;
  const raw = span / 100;
  // Round to a "nice" step — first significant digit, e.g. 0.0012 → 0.001.
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.max(mag, Number.EPSILON);
}

function formatValue(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(decimals);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function readNumericValue(world: World, target: TunerTarget): number | undefined {
  const comp = world.getComponent(target.entityId, target.component);
  const value = getByPath(comp, target.path ?? "");
  return typeof value === "number" ? value : undefined;
}

export function getByPath(obj: unknown, path: string): unknown {
  if (path === "" || path === undefined) return obj;
  const keys = path.split(".");
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur === undefined || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function setByPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  if (path === "" || path === undefined) {
    // Cannot replace whole component via setByPath without losing shape — caller must pass full object.
    return value as T;
  }
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i] as string;
    const next = cur[k];
    if (typeof next !== "object" || next === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1] as string] = value;
  return obj;
}
