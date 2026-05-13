import type { RuntimeHandle } from "../../../../engine/runtime/start";

type HealthComponent = { current: number; max: number };
type InvulnerableComponent = { until: number };
type RepairableComponent = { accepts: string; repaired?: boolean; lastRepairedBy?: string };
type WorldSignalComponent = { health?: number; target?: number };
type RoundStateComponent = {
  phase: "active" | "complete";
  holdProgress?: number;
  holdSeconds: number;
  completedAt?: number;
  scores?: Record<string, number>;
};

const REFRESH_MS = 100;

export type HealthHudHandle = {
  dispose(): void;
};

/**
 * Beacon-world-only HUD. Reads the live world snapshot every {@link REFRESH_MS}
 * milliseconds and renders a minimal Health / Invulnerable indicator. The DOM
 * is the secondary surface — the canonical state lives in the entity's
 * `Health` and `Invulnerable` components, which a non-browser agent can read
 * through `window.__agf.snapshot()` without ever seeing this HUD.
 */
export function createHealthHud(parent: HTMLElement, runtime: RuntimeHandle): HealthHudHandle {
  const root = document.createElement("aside");
  root.setAttribute("data-testid", "beacon-world-hud");
  root.style.cssText = [
    "position: absolute",
    "left: 24px",
    "bottom: 24px",
    "display: flex",
    "flex-direction: column",
    "gap: 6px",
    "padding: 10px 12px",
    "min-width: 140px",
    "color: rgba(234, 244, 255, 0.92)",
    "background: rgba(8, 18, 28, 0.65)",
    "border: 1px solid rgba(150, 212, 255, 0.28)",
    "border-radius: 4px",
    "font-family: inherit",
    "font-size: 12px",
    "line-height: 1.2",
    "pointer-events: none",
    "backdrop-filter: blur(8px)"
  ].join(";");

  const hpLine = document.createElement("div");
  hpLine.style.cssText = "display:flex; align-items:center; gap:8px;";
  const hpLabel = document.createElement("strong");
  hpLabel.textContent = "HP";
  const hpCells = document.createElement("span");
  hpCells.setAttribute("data-testid", "hud-hp");
  hpCells.style.cssText = "display:flex; gap:4px;";
  hpLine.append(hpLabel, hpCells);

  const signalLine = document.createElement("div");
  signalLine.style.cssText = "display:flex; align-items:center; gap:8px;";
  const signalLabel = document.createElement("strong");
  signalLabel.textContent = "SIG";
  const signalValue = document.createElement("span");
  signalValue.setAttribute("data-testid", "hud-world-signal");
  signalValue.style.cssText = "font-variant-numeric: tabular-nums;";
  const signalBar = document.createElement("span");
  signalBar.setAttribute("data-testid", "hud-world-signal-bar");
  signalBar.style.cssText = "display:flex; gap:4px;";
  signalLine.append(signalLabel, signalValue, signalBar);

  const scoreboard = document.createElement("div");
  scoreboard.setAttribute("data-testid", "hud-scoreboard");
  scoreboard.style.cssText = "display:none; flex-direction:column; gap:2px; font-size:11px; opacity:0.92;";

  const status = document.createElement("div");
  status.setAttribute("data-testid", "hud-status");
  status.style.cssText = "font-variant-numeric: tabular-nums; min-height: 14px;";

  const summary = document.createElement("div");
  summary.setAttribute("data-testid", "hud-round-summary");
  summary.style.cssText = [
    "margin-top: 4px",
    "font-weight: 600",
    "letter-spacing: 0.05em",
    "color: rgba(74, 240, 168, 0.92)",
    "min-height: 14px",
    "display: none"
  ].join(";");

  root.append(hpLine, signalLine, scoreboard, status, summary);
  parent.append(root);

  let lastKey = "";
  let lastScoreByPlayer = new Map<string, number>();

  const refresh = (): void => {
    const snapshot = runtime.snapshot();
    const drone = snapshot.entities.find((entity) => entity.id === "player.drone");
    if (drone === undefined) {
      return;
    }
    const health = drone.components["Health"] as HealthComponent | undefined;
    const invulnerable = drone.components["Invulnerable"] as InvulnerableComponent | undefined;
    const now = snapshot.time.elapsed;
    const invulnerableActive = invulnerable !== undefined && invulnerable.until > now;

    let repairedCount = 0;
    let repairableTotal = 0;
    let signalHealth: number | undefined;
    let round: RoundStateComponent | undefined;
    for (const entity of snapshot.entities) {
      const repairable = entity.components["Repairable"] as RepairableComponent | undefined;
      if (repairable !== undefined) {
        repairableTotal += 1;
        if (repairable.repaired === true) {
          repairedCount += 1;
        }
      }
      const worldSignal = entity.components["WorldSignal"] as WorldSignalComponent | undefined;
      if (worldSignal !== undefined && typeof worldSignal.health === "number") {
        signalHealth = worldSignal.health;
      }
      const roundState = entity.components["RoundState"] as RoundStateComponent | undefined;
      if (roundState !== undefined) {
        round = roundState;
      }
    }

    const scoreByPlayer = new Map<string, number>();
    if (round?.scores !== undefined) {
      for (const [playerId, count] of Object.entries(round.scores)) {
        if (typeof count === "number" && count > 0) {
          scoreByPlayer.set(playerId, count);
        }
      }
    }

    const signalPct = signalHealth !== undefined ? Math.round(signalHealth * 100) : undefined;
    const roundKey =
      round === undefined
        ? "-"
        : `${round.phase}|${Math.round((round.holdProgress ?? 0) * 10)}/${Math.round(round.holdSeconds * 10)}`;
    const scoreKey = [...scoreByPlayer.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, count]) => `${id}:${count}`)
      .join(",");
    const key = `${health?.current ?? "-"}/${health?.max ?? "-"}|${invulnerableActive ? "1" : "0"}|${repairedCount}/${repairableTotal}|${signalPct ?? "-"}|${roundKey}|${scoreKey}`;
    if (key === lastKey) {
      return;
    }
    lastKey = key;

    renderCells(hpCells, health);
    renderSignal(signalValue, signalBar, repairedCount, repairableTotal, signalPct);
    renderScoreboard(scoreboard, scoreByPlayer, lastScoreByPlayer);
    lastScoreByPlayer = new Map(scoreByPlayer);
    status.textContent = invulnerableActive ? "INVULN" : "";
    status.style.color = invulnerableActive ? "rgba(74, 240, 168, 0.92)" : "rgba(234, 244, 255, 0.6)";
    renderRound(summary, round);
  };

  refresh();
  const intervalId = window.setInterval(refresh, REFRESH_MS);

  return {
    dispose(): void {
      window.clearInterval(intervalId);
      root.remove();
    }
  };
}

function renderScoreboard(
  target: HTMLElement,
  scores: Map<string, number>,
  previousScores: Map<string, number>
): void {
  target.replaceChildren();
  if (scores.size === 0) {
    target.style.display = "none";
    return;
  }
  target.style.display = "flex";
  const heading = document.createElement("div");
  heading.textContent = "SCORE";
  heading.style.cssText = "font-weight:600; letter-spacing:0.05em; opacity:0.75;";
  target.append(heading);
  const sorted = [...scores.entries()].sort(([aId, aCount], [bId, bCount]) => {
    if (bCount !== aCount) {
      return bCount - aCount;
    }
    return aId.localeCompare(bId);
  });
  for (const [playerId, count] of sorted) {
    const previous = previousScores.get(playerId) ?? 0;
    const pulsed = count > previous;
    const row = document.createElement("div");
    row.setAttribute("data-testid", `hud-score-${playerId}`);
    row.style.cssText = `display:flex; justify-content:space-between; gap:8px; transition: color 600ms ease-out;${
      pulsed ? " color: rgba(74, 240, 168, 1);" : ""
    }`;
    if (pulsed) {
      row.setAttribute("data-pulse", "true");
    }
    const label = document.createElement("span");
    label.textContent = playerId;
    label.style.cssText = "overflow:hidden; text-overflow:ellipsis; max-width:88px;";
    const value = document.createElement("span");
    value.textContent = String(count);
    value.style.cssText = "font-variant-numeric: tabular-nums; font-weight:600;";
    row.append(label, value);
    target.append(row);
  }
}

function renderRound(target: HTMLElement, round: RoundStateComponent | undefined): void {
  if (round === undefined) {
    target.style.display = "none";
    target.textContent = "";
    return;
  }
  if (round.phase === "complete") {
    target.style.display = "block";
    target.style.color = "rgba(74, 240, 168, 0.92)";
    target.replaceChildren();
    const title = document.createElement("div");
    title.textContent = "ROUND COMPLETE";
    title.setAttribute("data-testid", "hud-round-complete");
    const hint = document.createElement("div");
    hint.textContent = "Press R to restart";
    hint.setAttribute("data-testid", "hud-round-restart-hint");
    hint.style.cssText = "font-weight: 400; opacity: 0.8; letter-spacing: 0.02em; margin-top: 2px;";
    target.append(title, hint);
    return;
  }
  if ((round.holdProgress ?? 0) > 0) {
    target.style.display = "block";
    target.style.color = "rgba(234, 244, 255, 0.6)";
    const progress = (round.holdProgress ?? 0).toFixed(1);
    const total = round.holdSeconds.toFixed(1);
    target.textContent = `HOLD ${progress}/${total}s`;
    return;
  }
  target.style.display = "none";
  target.textContent = "";
}

function renderSignal(
  valueEl: HTMLElement,
  barEl: HTMLElement,
  repaired: number,
  total: number,
  smoothedPct: number | undefined
): void {
  if (total > 0) {
    const ratioText = `${repaired}/${total}`;
    valueEl.textContent = smoothedPct !== undefined ? `${ratioText} (${smoothedPct}%)` : ratioText;
  } else {
    valueEl.textContent = "—";
  }
  valueEl.style.color = repaired === total && total > 0
    ? "rgba(74, 240, 168, 0.92)"
    : "rgba(234, 244, 255, 0.92)";

  barEl.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const cell = document.createElement("span");
    const filled = index < repaired;
    cell.style.cssText = [
      "display: inline-block",
      "width: 10px",
      "height: 10px",
      "border-radius: 2px",
      `background: ${filled ? "rgba(74, 240, 168, 0.92)" : "rgba(255, 255, 255, 0.18)"}`,
      `border: 1px solid ${filled ? "rgba(74, 240, 168, 1)" : "rgba(255, 255, 255, 0.32)"}`
    ].join(";");
    barEl.append(cell);
  }
}

function renderCells(container: HTMLElement, health: HealthComponent | undefined): void {
  container.replaceChildren();
  if (health === undefined) {
    const placeholder = document.createElement("span");
    placeholder.textContent = "—";
    container.append(placeholder);
    return;
  }
  for (let index = 0; index < health.max; index += 1) {
    const cell = document.createElement("span");
    const filled = index < health.current;
    cell.style.cssText = [
      "display: inline-block",
      "width: 10px",
      "height: 10px",
      "border-radius: 2px",
      `background: ${filled ? "rgba(248, 96, 88, 0.92)" : "rgba(255, 255, 255, 0.18)"}`,
      `border: 1px solid ${filled ? "rgba(248, 96, 88, 1)" : "rgba(255, 255, 255, 0.32)"}`
    ].join(";");
    container.append(cell);
  }
}
