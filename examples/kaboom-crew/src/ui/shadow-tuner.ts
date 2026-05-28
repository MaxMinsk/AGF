// S180-tuner — temporary kaboom shadow tuner. Lives top-right on the
// page; lets the user scrub the directional light + shadow params
// at runtime without touching the scene JSON. Removed once the
// "shadows from blocks" question is resolved.
//
// Reads from `light.sun` + `light.ambient` entities; writes the
// updated components back via runtime.applyCommands. The engine's
// light-lifecycle-system re-applies the diff on the next tick.

import type { RuntimeHandle } from "../../../../engine/runtime/start";

export function mountKaboomShadowTuner(runtime: RuntimeHandle): () => void {
  if (typeof document === "undefined") return () => {};

  const panel = document.createElement("section");
  panel.id = "kaboom-shadow-tuner";
  panel.style.cssText = [
    "position:fixed",
    "top:60px",
    "right:8px",
    "z-index:9999",
    "padding:8px 10px",
    "background:rgba(0,0,0,0.78)",
    "color:#dde",
    "font:11px/1.3 ui-monospace,Menlo,monospace",
    "border:1px solid #345",
    "border-radius:6px",
    "min-width:240px"
  ].join(";");

  const rows: Array<{
    key: string;
    min: number;
    max: number;
    step: number;
    init: number;
    label: string;
    apply: (v: number) => void;
  }> = [
    {
      key: "dir",
      min: 0,
      max: 5,
      step: 0.05,
      init: 2.5,
      label: "directional",
      apply: (v) => patchLight("light.sun", { intensity: v })
    },
    {
      key: "amb",
      min: 0,
      max: 1,
      step: 0.02,
      init: 0.15,
      label: "ambient",
      apply: (v) => patchLight("light.ambient", { intensity: v })
    },
    {
      key: "bias",
      min: -0.002,
      max: 0,
      step: 0.00002,
      init: -0.0005,
      label: "bias",
      apply: (v) => patchLightShadow("light.sun", { bias: v })
    },
    {
      key: "nbias",
      min: 0,
      max: 0.5,
      step: 0.005,
      init: 0.02,
      label: "normalBias",
      apply: (v) => patchLightShadow("light.sun", { normalBias: v })
    },
    {
      key: "rad",
      min: 0,
      max: 10,
      step: 0.1,
      init: 2,
      label: "radius",
      apply: (v) => patchLightShadow("light.sun", { radius: v })
    },
    {
      key: "ly",
      min: 2,
      max: 30,
      step: 0.5,
      init: 8,
      label: "light Y",
      apply: (v) => patchTransform("light.sun", (pos) => [pos[0] ?? 0, v, pos[2] ?? 4])
    },
    {
      key: "lx",
      min: -15,
      max: 30,
      step: 0.5,
      init: 0,
      label: "light X",
      apply: (v) => patchTransform("light.sun", (pos) => [v, pos[1] ?? 8, pos[2] ?? 4])
    },
    {
      key: "lz",
      min: -15,
      max: 30,
      step: 0.5,
      init: 4,
      label: "light Z",
      apply: (v) => patchTransform("light.sun", (pos) => [pos[0] ?? 0, pos[1] ?? 8, v])
    },
    {
      key: "frust",
      min: 6,
      max: 40,
      step: 1,
      init: 18,
      label: "shadow ±extent",
      apply: (v) =>
        patchLightShadow("light.sun", {
          camera: { left: -v, right: v, top: v, bottom: -v, near: 0.5, far: 60 }
        })
    }
  ];

  const header = document.createElement("div");
  header.style.cssText = "font-weight:600;margin-bottom:6px;letter-spacing:.04em";
  header.textContent = "Shadow tuner (S180)";
  panel.appendChild(header);

  for (const row of rows) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:84px 1fr 44px;gap:6px;align-items:center;margin:2px 0";
    const label = document.createElement("label");
    label.textContent = row.label;
    label.style.cssText = "opacity:.85";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(row.step);
    input.value = String(row.init);
    input.style.cssText = "width:100%";
    const out = document.createElement("output");
    out.textContent = row.init.toFixed(row.step < 0.01 ? 5 : row.step < 0.5 ? 2 : 1);
    out.style.cssText = "text-align:right;opacity:.7";
    input.addEventListener("input", () => {
      const v = Number.parseFloat(input.value);
      out.textContent = v.toFixed(row.step < 0.01 ? 5 : row.step < 0.5 ? 2 : 1);
      row.apply(v);
    });
    wrap.append(label, input, out);
    panel.appendChild(wrap);
  }

  const note = document.createElement("div");
  note.style.cssText = "margin-top:6px;opacity:.55;font-size:10px";
  note.textContent = "applies to light.sun / light.ambient via component.set";
  panel.appendChild(note);

  document.body.appendChild(panel);

  function getComponent<T extends object>(entityId: string, component: string): T | undefined {
    const snap = runtime.snapshot();
    const ent = snap.entities.find((e) => e.id === entityId);
    return ent?.components[component] as T | undefined;
  }

  function patchLight(entityId: string, patch: { intensity?: number; color?: string; castShadow?: boolean }): void {
    const current = getComponent<Record<string, unknown>>(entityId, "Light") ?? {};
    runtime.applyCommands([
      { kind: "component.set", entityId, component: "Light", data: { ...current, ...patch } }
    ]);
  }

  function patchLightShadow(entityId: string, shadowPatch: Record<string, unknown>): void {
    const current = getComponent<Record<string, unknown>>(entityId, "Light") ?? {};
    const prevShadow = (current["shadow"] as Record<string, unknown>) ?? {};
    runtime.applyCommands([
      {
        kind: "component.set",
        entityId,
        component: "Light",
        data: { ...current, castShadow: true, shadow: { ...prevShadow, ...shadowPatch } }
      }
    ]);
  }

  function patchTransform(entityId: string, positionFn: (cur: ReadonlyArray<number>) => [number, number, number]): void {
    const current = getComponent<Record<string, unknown>>(entityId, "Transform") ?? {};
    const pos = (current["position"] as ReadonlyArray<number>) ?? [0, 0, 0];
    runtime.applyCommands([
      {
        kind: "component.set",
        entityId,
        component: "Transform",
        data: { ...current, position: positionFn(pos) }
      }
    ]);
  }

  return () => {
    panel.remove();
  };
}
