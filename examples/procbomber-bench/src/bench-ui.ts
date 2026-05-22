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
import { encodeRecipe, resolveRecipeFromSeed } from "./character-recipe";
import { applyRecipeToState, stateToRecipe } from "./recipe-url";
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
  // Sit on the right under .engine-dev-overlay (the renderer-info
  // stats line). Matches the .shadow-tuner precedent in styles.css:
  // top 76px clears the stats strip. The bench panel got tall after
  // S103's knob expansion, so right-side placement avoids covering
  // the project-selector menu on the left.
  panel.style.top = "76px";
  panel.style.right = "24px";
  panel.style.maxHeight = "calc(100vh - 100px)";
  panel.style.overflowY = "auto";
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

  // S103 PROCBOMBER-BENCH-PANEL-SECTIONS: group sliders into labelled
  // sections so the panel scans as Size / Posture / Spread / Mounts /
  // Shape / Palette / Animation instead of a single long flat list.
  const sliderByField = new Map(SLIDERS.map((s) => [s.field, s]));
  const renderSection = (label: string, fields: ReadonlyArray<string>): void => {
    panel.appendChild(buildSectionHeading(label));
    for (const f of fields) {
      const cfg = sliderByField.get(f as NumberField);
      if (cfg !== undefined) panel.appendChild(buildSlider(cfg, state, scheduleRebuild));
    }
  };
  renderSection("Size", [
    "headSize", "torsoHeight", "torsoWidth",
    "upperArmLength", "forearmLength", "armWidth",
    "upperLegLength", "lowerLegLength", "legWidth"
  ]);
  renderSection("Posture", ["forwardTilt", "armRestAngle"]);
  renderSection("Spread", ["shoulderSpread", "hipSpread"]);
  renderSection("Mounts", ["shoulderMountY", "shoulderMountZ", "hipMountY", "hipMountZ"]);

  panel.appendChild(buildSectionHeading("Shape"));
  for (const cfg of SHAPE_DROPDOWNS) {
    panel.appendChild(buildShapeSelect(cfg, state, scheduleRebuild));
  }
  panel.appendChild(buildSectionHeading("Accessories"));
  for (let slot = 0; slot < 3; slot += 1) {
    panel.appendChild(buildAccessorySelect(slot, state, scheduleRebuild));
  }
  panel.appendChild(buildSectionHeading("Texturing"));
  panel.appendChild(buildPanelSeamsToggle(state, scheduleRebuild));
  for (const decal of ["chestEmblem", "helmetStripe", "kneePad"] as const) {
    panel.appendChild(buildDecalToggle(decal, state, scheduleRebuild));
  }
  panel.appendChild(buildSectionHeading("Palette"));
  panel.appendChild(buildPaletteSelect(state, scheduleRebuild));
  panel.appendChild(buildRerollButton(state, scheduleRebuild));
  // S108 KABOOM-BENCH-EDIT-GAME-RECIPE — load game presets + export URL.
  panel.appendChild(buildSectionHeading("Game recipe"));
  panel.appendChild(buildPresetSelect(state, scheduleRebuild));
  panel.appendChild(buildCopyRecipeUrlButton(state));

  shell.appendChild(panel);

  return {
    dispose(): void {
      panel.remove();
    }
  };
}

function buildSectionHeading(label: string): HTMLElement {
  const row = document.createElement("div");
  row.dataset["procbomberSectionHeading"] = label.toLowerCase();
  row.textContent = label;
  row.style.marginTop = "10px";
  row.style.marginBottom = "4px";
  row.style.paddingBottom = "2px";
  row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.18)";
  row.style.fontSize = "11px";
  row.style.letterSpacing = "0.04em";
  row.style.textTransform = "uppercase";
  row.style.opacity = "0.7";
  return row;
}

function buildAccessorySelect(
  slot: number,
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.dataset["procbomberAccessoryRow"] = String(slot);
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginBottom = "3px";

  const label = document.createElement("label");
  label.textContent = `Slot ${slot + 1}`;
  label.style.width = "78px";
  label.style.flex = "0 0 auto";

  const select = document.createElement("select");
  select.dataset["procbomberAccessorySelect"] = String(slot);
  select.style.flex = "1 1 auto";
  select.style.background = "rgba(255, 255, 255, 0.08)";
  select.style.color = "#f0f4ff";
  select.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  select.style.padding = "2px 4px";
  select.style.borderRadius = "3px";
  const noneOpt = document.createElement("option");
  noneOpt.value = "__none__";
  noneOpt.textContent = "(none)";
  select.appendChild(noneOpt);
  for (const kind of ["antennae", "visor", "backpack", "cap", "fins"] as const) {
    const opt = document.createElement("option");
    opt.value = kind;
    opt.textContent = kind;
    select.appendChild(opt);
  }
  const current = state.accessorySlots[slot];
  select.value = current ?? "__none__";
  select.addEventListener("change", () => {
    const v = select.value;
    const next = [...state.accessorySlots];
    next[slot] = v === "__none__" ? undefined : (v as AccessoryKindString);
    state.accessorySlots = next;
    scheduleRebuild();
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

type AccessoryKindString = "antennae" | "visor" | "backpack" | "cap" | "fins";

// S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2 — per-decal toggle. Adds /
// removes the decal from state.decals[] (deterministic order: the
// catalog order). Rebuild fires the geometry-paint pass.
function buildDecalToggle(
  decal: "chestEmblem" | "helmetStripe" | "kneePad",
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("label");
  row.dataset["procbomberDecalRow"] = decal;
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.padding = "4px 0";
  row.style.fontSize = "12px";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.decals.includes(decal);
  input.dataset["procbomberDecal"] = decal;
  input.addEventListener("change", () => {
    const set = new Set(state.decals);
    if (input.checked) set.add(decal);
    else set.delete(decal);
    // Preserve catalog order so the recipe encode is stable across UI clicks.
    const order: ReadonlyArray<"chestEmblem" | "helmetStripe" | "kneePad"> = ["chestEmblem", "helmetStripe", "kneePad"];
    state.decals = order.filter((d) => set.has(d));
    scheduleRebuild();
  });
  const text = document.createElement("span");
  text.textContent = `Decal: ${decal}`;
  row.appendChild(input);
  row.appendChild(text);
  return row;
}

// S109 KABOOM-PROCEDURAL-TEXTURING — Panel-seams toggle. Single boolean
// in the recipe; the geometry-rebuild pass picks up the new value via
// texturingOf(state).
function buildPanelSeamsToggle(state: BenchState, scheduleRebuild: () => void): HTMLElement {
  const row = document.createElement("label");
  row.dataset["procbomberPanelSeamsRow"] = "panel-seams";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.padding = "4px 0";
  row.style.fontSize = "12px";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.panelSeams;
  input.dataset["procbomberPanelSeams"] = "input";
  input.addEventListener("change", () => {
    state.panelSeams = input.checked;
    scheduleRebuild();
  });
  const text = document.createElement("span");
  text.textContent = "Panel seams (corner darken)";
  row.appendChild(input);
  row.appendChild(text);
  return row;
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

// S108 KABOOM-BENCH-EDIT-GAME-RECIPE.
// Preset list — owners actually used by Kaboom Crew. Easy to grow when
// more characters get registered for the game (just append).
const GAME_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "__custom__", label: "(custom — keep sliders)" },
  { value: "player.1", label: "player.1 (Kaboom Crew)" },
  { value: "bot.1", label: "bot.1 (Kaboom Crew)" }
];

function buildPresetSelect(
  state: BenchState,
  scheduleRebuild: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.dataset["procbomberPresetRow"] = "true";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginBottom = "4px";

  const label = document.createElement("label");
  label.textContent = "Preset";
  label.style.width = "78px";

  const select = document.createElement("select");
  select.dataset["procbomberPresetSelect"] = "true";
  select.style.flex = "1 1 auto";
  select.style.background = "rgba(255, 255, 255, 0.08)";
  select.style.color = "#f0f4ff";
  select.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  select.style.padding = "2px 4px";
  select.style.borderRadius = "3px";
  for (const opt of GAME_PRESETS) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  select.value = "__custom__";
  select.addEventListener("change", () => {
    const v = select.value;
    if (v === "__custom__") return; // user picked the no-op label
    const recipe = resolveRecipeFromSeed(v);
    applyRecipeToState(state, recipe);
    scheduleRebuild();
    // Reset back to custom so picking the same preset later still
    // triggers a re-load. Custom = "current sliders own the state."
    select.value = "__custom__";
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function buildCopyRecipeUrlButton(state: BenchState): HTMLElement {
  const row = document.createElement("div");
  row.style.marginTop = "4px";

  const button = document.createElement("button");
  button.textContent = "Copy recipe URL";
  button.dataset["procbomberCopyRecipeUrl"] = "true";
  button.style.width = "100%";
  button.style.padding = "5px 8px";
  button.style.background = "rgba(255, 255, 255, 0.12)";
  button.style.color = "#f0f4ff";
  button.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  button.style.borderRadius = "3px";
  button.style.cursor = "pointer";
  button.style.font = "inherit";
  button.addEventListener("click", () => {
    const recipe = stateToRecipe(state);
    const encoded = encodeRecipe(recipe);
    const url = `?project=kaboom-crew&recipe=${encoded}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== undefined) {
      navigator.clipboard.writeText(url).then(
        () => flashLabel(button, "Copied!"),
        () => flashLabel(button, "Copy failed — open console")
      );
    } else {
      // agf-allow:console clipboard API unavailable; expose the URL via the dev console as a fallback.
      console.log(`[procbomber-bench] recipe URL: ${url}`);
      flashLabel(button, "Logged to console");
    }
  });

  row.appendChild(button);
  return row;
}

function flashLabel(button: HTMLElement, message: string): void {
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}
