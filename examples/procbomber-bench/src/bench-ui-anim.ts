// S101 PROCBOMBER-BENCH-ANIM-DROPDOWN — DOM dropdown for the
// animation switcher. Kept separate from bench-ui.ts so each story's
// diff stays focused.

import type { BenchAnimationKind } from "./systems/bench-animation-system";

export type BenchAnimationUiHandle = {
  dispose(): void;
};

const KINDS: ReadonlyArray<BenchAnimationKind> = ["none", "idle-bob", "walk-swing"];

export function mountAnimationControl(
  panel: HTMLElement,
  initial: BenchAnimationKind,
  onChange: (kind: BenchAnimationKind) => void
): BenchAnimationUiHandle {
  const row = document.createElement("div");
  row.dataset["procbomberAnimRow"] = "true";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginTop = "8px";

  const label = document.createElement("label");
  label.textContent = "Animation";
  label.style.width = "62px";

  const select = document.createElement("select");
  select.dataset["procbomberAnimSelect"] = "true";
  select.style.flex = "1 1 auto";
  select.style.background = "rgba(255, 255, 255, 0.08)";
  select.style.color = "#f0f4ff";
  select.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  select.style.padding = "2px 4px";
  select.style.borderRadius = "3px";
  for (const kind of KINDS) {
    const opt = document.createElement("option");
    opt.value = kind;
    opt.textContent = kind;
    select.appendChild(opt);
  }
  select.value = initial;
  select.addEventListener("change", () => {
    const v = select.value as BenchAnimationKind;
    if (KINDS.includes(v)) onChange(v);
  });

  row.appendChild(label);
  row.appendChild(select);
  panel.appendChild(row);

  return {
    dispose(): void {
      row.remove();
    }
  };
}

export function isBenchAnimationKind(value: unknown): value is BenchAnimationKind {
  return typeof value === "string" && (KINDS as ReadonlyArray<string>).includes(value);
}

export function readBenchAnimationFromUrl(): BenchAnimationKind | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("bomberAnim");
    if (raw === null) return undefined;
    return isBenchAnimationKind(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}
