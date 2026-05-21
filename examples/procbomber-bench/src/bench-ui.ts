// S101 PROCBOMBER-BENCH-UI-CONTROLS — plain HTML overlay.
//
// One absolute-positioned panel in the top-left of the screen with:
//   - Five sliders (head, torso H, torso W, arms, legs)
//   - One palette dropdown (8 named + "(seed)" auto)
//   - One reroll button (rotates the internal seed counter)
//
// Each control writes the bench's mutable state then schedules a mesh
// rebuild on the next animation frame (rAF-coalesced). The dropdown
// added in S101-8 mounts via `mountBenchAnimationControl` — kept as a
// separate file so the two stories diff cleanly.

import {
  BOMBER_MESH_DEFAULTS
} from "./generators/bomber-mesh";
import { isBomberPaletteName, type BomberPaletteName } from "./generators/bomber-palette";
import {
  BOMBER_SHAPE_OPTIONS,
  PALETTE_OPTIONS,
  isBomberShape,
  type BenchState,
  type BomberShape
} from "./bench-state";

export type BenchUiHandle = {
  dispose(): void;
};

type NumberField = keyof Pick<
  BenchState,
  | "headSize"
  | "torsoHeight"
  | "torsoWidth"
  | "upperArmLength"
  | "forearmLength"
  | "armWidth"
  | "upperLegLength"
  | "lowerLegLength"
  | "legWidth"
  | "forwardTilt"
  | "armRestAngle"
  | "shoulderMountY"
  | "shoulderMountZ"
  | "hipMountY"
  | "hipMountZ"
  | "shoulderSpread"
  | "hipSpread"
>;

type SliderConfig = {
  label: string;
  field: NumberField;
  min: number;
  max: number;
  step: number;
};

// Posture sliders store radians; rebuild loop + animation system convert
// to degrees on write (Transform.rotation is degrees per the AGF convention).
// Pi/2 ≈ 1.5708; we cap at ~1.5 = 86° for nearly-full-range posture.
const PI = Math.PI;
const SLIDERS: ReadonlyArray<SliderConfig> = [
  // Size
  { label: "Head",         field: "headSize",       min: 0.15, max: 0.6,  step: 0.01 },
  { label: "Torso H",      field: "torsoHeight",    min: 0.25, max: 0.7,  step: 0.01 },
  { label: "Torso W",      field: "torsoWidth",     min: 0.25, max: 0.7,  step: 0.01 },
  // S103 PROCBOMBER-LIMB-SEGMENT-SLIDERS: four independent segment lengths.
  { label: "Upper arm",    field: "upperArmLength", min: 0.04, max: 0.4,  step: 0.01 },
  { label: "Forearm",      field: "forearmLength",  min: 0.04, max: 0.4,  step: 0.01 },
  { label: "Arm W",        field: "armWidth",       min: 0.06, max: 0.3,  step: 0.01 },
  { label: "Upper leg",    field: "upperLegLength", min: 0.04, max: 0.4,  step: 0.01 },
  { label: "Lower leg",    field: "lowerLegLength", min: 0.04, max: 0.4,  step: 0.01 },
  { label: "Leg W",        field: "legWidth",       min: 0.08, max: 0.35, step: 0.01 },
  // Posture — S103 PROCBOMBER-POSTURE-RANGES widens to near-full -90..+90.
  { label: "Fwd tilt",     field: "forwardTilt",    min: -PI * 0.5, max: PI * 0.5, step: 0.02 },
  { label: "Arm rest",     field: "armRestAngle",   min: -PI * 0.5, max: PI * 0.5, step: 0.02 },
  // S103 PROCBOMBER-HIP-SPREAD-SLIDER
  { label: "Shldr spread", field: "shoulderSpread", min: 0.3, max: 1.6,  step: 0.02 },
  { label: "Hip spread",   field: "hipSpread",      min: 0.2, max: 1.6,  step: 0.02 },
  // Mount offsets.
  { label: "Shldr Y",      field: "shoulderMountY", min: -0.2, max: 0.2,  step: 0.01 },
  { label: "Shldr Z",      field: "shoulderMountZ", min: -0.15, max: 0.15, step: 0.01 },
  { label: "Hip Y",        field: "hipMountY",      min: -0.2, max: 0.2,  step: 0.01 },
  { label: "Hip Z",        field: "hipMountZ",      min: -0.15, max: 0.15, step: 0.01 }
];

type ShapeField = "headShape" | "torsoShape" | "limbShape";
const SHAPE_DROPDOWNS: ReadonlyArray<{ label: string; field: ShapeField }> = [
  { label: "Head shape",  field: "headShape" },
  { label: "Torso shape", field: "torsoShape" },
  { label: "Limb shape",  field: "limbShape" }
];

export function mountBenchControls(
  shell: HTMLElement,
  state: BenchState,
  scheduleRebuild: () => void
): BenchUiHandle {
  const panel = document.createElement("div");
  panel.dataset["procbomberControls"] = "true";
  panel.style.position = "absolute";
  // Sit well below the dev shell's project-selector + status panel that
  // occupy the top strip of the page. 220 px clears both the selector
  // dropdown's expanded list and the status / freecam controls.
  panel.style.top = "220px";
  panel.style.left = "12px";
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(12, 16, 24, 0.78)";
  panel.style.color = "#f0f4ff";
  panel.style.font = "12px/1.4 system-ui, sans-serif";
  panel.style.borderRadius = "6px";
  panel.style.minWidth = "220px";
  panel.style.userSelect = "none";
  panel.style.zIndex = "10";

  const heading = document.createElement("div");
  heading.textContent = "Procbomber bench";
  heading.style.fontWeight = "600";
  heading.style.marginBottom = "6px";
  panel.appendChild(heading);

  for (const cfg of SLIDERS) {
    panel.appendChild(buildSlider(cfg, state, scheduleRebuild));
  }
  for (const cfg of SHAPE_DROPDOWNS) {
    panel.appendChild(buildShapeSelect(cfg, state, scheduleRebuild));
  }
  panel.appendChild(buildPaletteSelect(state, scheduleRebuild));
  panel.appendChild(buildRerollButton(state, scheduleRebuild));

  shell.appendChild(panel);

  return {
    dispose(): void {
      panel.remove();
    }
  };
}

function buildShapeSelect(
  cfg: { label: string; field: ShapeField },
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginBottom = "3px";
  row.dataset["procbomberShapeRow"] = cfg.field;

  const label = document.createElement("label");
  label.textContent = cfg.label;
  label.style.width = "78px";
  label.style.flex = "0 0 auto";

  const select = document.createElement("select");
  select.dataset["procbomberShapeSelect"] = cfg.field;
  select.style.flex = "1 1 auto";
  select.style.background = "rgba(255, 255, 255, 0.08)";
  select.style.color = "#f0f4ff";
  select.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  select.style.padding = "2px 4px";
  select.style.borderRadius = "3px";
  for (const opt of BOMBER_SHAPE_OPTIONS) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  }
  select.value = state[cfg.field];
  select.addEventListener("change", () => {
    const v = select.value;
    if (isBomberShape(v)) {
      state[cfg.field] = v as BomberShape;
      scheduleRebuild();
    }
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function buildSlider(
  cfg: SliderConfig,
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginBottom = "3px";
  row.dataset["procbomberSliderRow"] = cfg.field;

  const label = document.createElement("label");
  label.textContent = cfg.label;
  label.style.width = "62px";
  label.style.flex = "0 0 auto";

  const value = document.createElement("span");
  value.textContent = state[cfg.field].toFixed(2);
  value.style.width = "32px";
  value.style.textAlign = "right";
  value.style.flex = "0 0 auto";
  value.style.fontFeatureSettings = "'tnum' on";
  value.dataset["procbomberSliderValue"] = cfg.field;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(cfg.min);
  input.max = String(cfg.max);
  input.step = String(cfg.step);
  input.value = String(state[cfg.field]);
  input.style.flex = "1 1 auto";
  input.dataset["procbomberSlider"] = cfg.field;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    const fallback = (BOMBER_MESH_DEFAULTS as Record<string, number>)[cfg.field] ?? 0;
    state[cfg.field] = Number.isFinite(next) ? next : fallback;
    value.textContent = state[cfg.field].toFixed(2);
    scheduleRebuild();
  });

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(value);
  return row;
}

function buildPaletteSelect(
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginTop = "8px";
  row.style.marginBottom = "4px";
  row.dataset["procbomberPaletteRow"] = "true";

  const label = document.createElement("label");
  label.textContent = "Palette";
  label.style.width = "62px";

  const select = document.createElement("select");
  select.dataset["procbomberPaletteSelect"] = "true";
  select.style.flex = "1 1 auto";
  select.style.background = "rgba(255, 255, 255, 0.08)";
  select.style.color = "#f0f4ff";
  select.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  select.style.padding = "2px 4px";
  select.style.borderRadius = "3px";
  const seedOption = document.createElement("option");
  seedOption.value = "__seed__";
  seedOption.textContent = "(seed-driven)";
  select.appendChild(seedOption);
  for (const name of PALETTE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = state.paletteOverride ?? "__seed__";
  select.addEventListener("change", () => {
    const v = select.value;
    if (v === "__seed__") {
      state.paletteOverride = undefined;
    } else if (isBomberPaletteName(v)) {
      state.paletteOverride = v as BomberPaletteName;
    }
    scheduleRebuild();
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function buildRerollButton(
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.style.marginTop = "6px";

  const button = document.createElement("button");
  button.textContent = "Reroll seed";
  button.dataset["procbomberReroll"] = "true";
  button.style.width = "100%";
  button.style.padding = "5px 8px";
  button.style.background = "rgba(255, 255, 255, 0.12)";
  button.style.color = "#f0f4ff";
  button.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  button.style.borderRadius = "3px";
  button.style.cursor = "pointer";
  button.style.font = "inherit";
  let counter = 0;
  button.addEventListener("click", () => {
    counter += 1;
    state.seed = `reroll-${counter}-${Date.now().toString(36)}`;
    scheduleRebuild();
  });

  row.appendChild(button);
  return row;
}
