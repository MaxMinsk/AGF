// Project-local shadow tuner for shadows-bench. Lives under the engine
// dev overlay on the top-right of the screen. Lets you scrub CSM cascades
// + maxFar + shadow map size + shadowBias + shadowNormalBias + light
// intensity at runtime, swap the filter algorithm (PCF / VSM / PCSS), and
// reset back to the project.json defaults.
//
// All shadow controls call `runtime.renderer.adapter.setCsm(...)` /
// `setShadowAlgorithm(...)`. PCSS is one-way — once the chunk is mutated,
// switching back to PCF/VSM in the same page leaves materials with stale
// sampler bindings. The picker surfaces that with a "reload required"
// note + disables the toggle once you've picked PCSS in-session.

import type { RuntimeHandle } from "../../../../engine/runtime/start";

type Algorithm = "pcf" | "vsm" | "pcss";

export type ShadowTunerDefaults = {
  cascades: number;
  maxFar: number;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  shadowBias: number;
  shadowNormalBias: number;
  lightIntensity: number;
  lightDirection: readonly [number, number, number];
  mode: "practical" | "uniform" | "logarithmic";
  algorithm: Algorithm;
};

export type ShadowTunerHandle = {
  element: HTMLElement;
  dispose(): void;
};

type FieldState = {
  cascades: number;
  maxFar: number;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  shadowBias: number;
  shadowNormalBias: number;
  lightIntensity: number;
};

export function mountShadowTuner(
  parent: HTMLElement,
  runtime: RuntimeHandle,
  defaults: ShadowTunerDefaults
): ShadowTunerHandle {
  const panel = document.createElement("section");
  panel.className = "shadow-tuner";
  panel.setAttribute("data-testid", "shadow-tuner");
  panel.innerHTML = `
    <header>Shadow tuner</header>
    <div class="row" data-row="cascades">
      <label>cascades</label>
      <input type="range" min="2" max="4" step="1" />
      <output></output>
    </div>
    <div class="row" data-row="maxFar">
      <label>maxFar</label>
      <input type="range" min="40" max="240" step="10" />
      <output></output>
    </div>
    <div class="row" data-row="shadowMapSize">
      <label>shadowMap</label>
      <input type="range" min="0" max="3" step="1" />
      <output></output>
    </div>
    <div class="row" data-row="shadowBias">
      <label>bias</label>
      <input type="range" min="-0.0005" max="0" step="0.000005" />
      <output></output>
    </div>
    <div class="row" data-row="shadowNormalBias">
      <label>normalBias</label>
      <input type="range" min="0" max="0.4" step="0.005" />
      <output></output>
    </div>
    <div class="row" data-row="lightIntensity">
      <label>intensity</label>
      <input type="range" min="0.3" max="3" step="0.05" />
      <output></output>
    </div>
    <div class="row" data-row="algorithm">
      <label>algorithm</label>
      <select>
        <option value="pcf">PCF</option>
        <option value="vsm">VSM</option>
        <option value="pcss">PCSS</option>
      </select>
    </div>
    <p class="pcss-warning" hidden>PCSS is one-way — reload to switch back.</p>
    <button type="button" class="reset">Reset to defaults</button>
  `;

  const state: FieldState = {
    cascades: defaults.cascades,
    maxFar: defaults.maxFar,
    shadowMapSize: defaults.shadowMapSize,
    shadowBias: defaults.shadowBias,
    shadowNormalBias: defaults.shadowNormalBias,
    lightIntensity: defaults.lightIntensity
  };
  let algorithm: Algorithm = defaults.algorithm;
  let pcssEverPicked = algorithm === "pcss";

  const sizeSteps: ShadowTunerDefaults["shadowMapSize"][] = [512, 1024, 2048, 4096];

  const rangeRow = <K extends keyof FieldState>(name: K, format: (v: number) => string): void => {
    const row = panel.querySelector<HTMLElement>(`[data-row="${name}"]`);
    if (row === null) return;
    const input = row.querySelector<HTMLInputElement>("input");
    const output = row.querySelector<HTMLOutputElement>("output");
    if (input === null || output === null) return;
    const writeFromState = (): void => {
      if (name === "shadowMapSize") {
        input.value = String(sizeSteps.indexOf(state.shadowMapSize));
      } else {
        input.value = String(state[name]);
      }
      output.textContent = format(state[name] as number);
    };
    writeFromState();
    input.addEventListener("input", () => {
      const raw = Number(input.value);
      if (name === "shadowMapSize") {
        const next = sizeSteps[Math.max(0, Math.min(3, Math.round(raw)))] ?? defaults.shadowMapSize;
        state.shadowMapSize = next;
      } else if (name === "cascades") {
        state.cascades = Math.max(2, Math.min(4, Math.round(raw)));
      } else {
        (state as Record<string, number>)[name as string] = raw;
      }
      output.textContent = format(state[name] as number);
      handleFieldChanged(name);
    });
  };

  let applyTimer: number | undefined;
  function handleFieldChanged(name: keyof FieldState): void {
    // Cascades count actually changes the number of DirectionalLights
    // inside CSM — only a full setCsm() rebuild can do that, and the
    // rebuild recompiles every material's shader (~100 ms + GPU
    // compile stalls on a real GPU because the scene has 250+ meshes).
    // Debounce so drags don't fire the rebuild on every tick, and apply
    // on `change` (slider release) too via the timer-flush below.
    if (name === "cascades") {
      scheduleStructuralApply();
      return;
    }
    // Everything else has a cheap in-place setter on the adapter — no
    // material recompile, no light recreation. Apply on every input tick.
    if (name === "shadowBias") {
      runtime.renderer.adapter.setCsmShadowBias(state.shadowBias);
    } else if (name === "shadowNormalBias") {
      runtime.renderer.adapter.setCsmShadowNormalBias(state.shadowNormalBias);
    } else if (name === "lightIntensity") {
      runtime.renderer.adapter.setCsmLightIntensity(state.lightIntensity);
    } else if (name === "shadowMapSize") {
      runtime.renderer.adapter.setCsmShadowMapSize(state.shadowMapSize);
    } else if (name === "maxFar") {
      runtime.renderer.adapter.setCsmMaxFar(state.maxFar);
    }
  }
  function scheduleStructuralApply(): void {
    if (applyTimer !== undefined) return;
    applyTimer = window.setTimeout(() => {
      applyTimer = undefined;
      applyCsm();
    }, 120);
  }

  rangeRow("cascades", (v) => String(Math.round(v)));
  rangeRow("maxFar", (v) => `${v.toFixed(0)} u`);
  rangeRow("shadowMapSize", (v) => `${v} px`);
  rangeRow("shadowBias", (v) => v.toExponential(2));
  rangeRow("shadowNormalBias", (v) => v.toFixed(3));
  rangeRow("lightIntensity", (v) => v.toFixed(2));

  const select = panel.querySelector<HTMLSelectElement>('[data-row="algorithm"] select');
  const pcssWarning = panel.querySelector<HTMLParagraphElement>(".pcss-warning");
  if (select !== null) {
    select.value = algorithm;
    if (algorithm === "pcss" && pcssWarning !== null) pcssWarning.hidden = false;
    select.addEventListener("change", () => {
      const next = select.value as Algorithm;
      if (pcssEverPicked && next !== "pcss") {
        // Switching back after picking PCSS = reload required (the chunk
        // substitution is process-wide). Reflect that in the picker.
        select.value = "pcss";
        return;
      }
      algorithm = next;
      if (algorithm === "pcss") {
        pcssEverPicked = true;
        if (pcssWarning !== null) pcssWarning.hidden = false;
      }
      runtime.renderer.adapter.setShadowAlgorithm(algorithm);
    });
  }

  const resetBtn = panel.querySelector<HTMLButtonElement>(".reset");
  resetBtn?.addEventListener("click", () => {
    state.cascades = defaults.cascades;
    state.maxFar = defaults.maxFar;
    state.shadowMapSize = defaults.shadowMapSize;
    state.shadowBias = defaults.shadowBias;
    state.shadowNormalBias = defaults.shadowNormalBias;
    state.lightIntensity = defaults.lightIntensity;
    for (const name of [
      "cascades",
      "maxFar",
      "shadowMapSize",
      "shadowBias",
      "shadowNormalBias",
      "lightIntensity"
    ] as const) {
      const row = panel.querySelector<HTMLElement>(`[data-row="${name}"]`);
      const input = row?.querySelector<HTMLInputElement>("input");
      const output = row?.querySelector<HTMLOutputElement>("output");
      if (input === null || input === undefined || output === null || output === undefined) continue;
      if (name === "shadowMapSize") {
        input.value = String(sizeSteps.indexOf(state.shadowMapSize));
      } else {
        input.value = String(state[name]);
      }
      output.textContent = formatFor(name, state[name] as number);
    }
    // Reset is an explicit user action — apply immediately, don't wait
    // for the debounce.
    if (applyTimer !== undefined) {
      window.clearTimeout(applyTimer);
      applyTimer = undefined;
    }
    applyCsm();
    runtime.renderer.adapter.setCsmShadowBias(state.shadowBias);
    runtime.renderer.adapter.setCsmShadowNormalBias(state.shadowNormalBias);
    runtime.renderer.adapter.setCsmLightIntensity(state.lightIntensity);
  });

  function formatFor(name: keyof FieldState, value: number): string {
    switch (name) {
      case "cascades":
        return String(Math.round(value));
      case "maxFar":
        return `${value.toFixed(0)} u`;
      case "shadowMapSize":
        return `${value} px`;
      case "shadowBias":
        return value.toExponential(2);
      case "shadowNormalBias":
        return value.toFixed(3);
      case "lightIntensity":
        return value.toFixed(2);
    }
  }

  function applyCsm(): void {
    runtime.renderer.adapter.setCsm({
      cascades: state.cascades,
      maxFar: state.maxFar,
      shadowMapSize: state.shadowMapSize,
      shadowBias: state.shadowBias,
      shadowNormalBias: state.shadowNormalBias,
      lightIntensity: state.lightIntensity,
      lightDirection: defaults.lightDirection,
      mode: defaults.mode
    });
    // shadows-bench runs with `shadows.autoUpdate: false` (static scene
    // optimisation) — after a CSM rebuild the new cascades sit dark
    // until something explicitly re-renders them. Trigger a one-shot
    // re-render so the tuner change is immediately visible.
    runtime.renderer.adapter.invalidateShadowMap();
  }

  parent.appendChild(panel);

  return {
    element: panel,
    dispose(): void {
      panel.remove();
    }
  };
}
