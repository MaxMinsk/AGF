import type { FixedStepResult } from "./types";

const DEFAULT_MAX_STEPS_PER_FRAME = 8;

export function advanceFixedStep(
  accumulator: number,
  frameDt: number,
  fixedDt: number,
  maxStepsPerFrame: number = DEFAULT_MAX_STEPS_PER_FRAME
): FixedStepResult {
  if (!Number.isFinite(fixedDt) || fixedDt <= 0) {
    throw new Error(`fixedDt must be a positive finite number, received ${fixedDt}.`);
  }
  if (maxStepsPerFrame < 0 || !Number.isFinite(maxStepsPerFrame)) {
    throw new Error(`maxStepsPerFrame must be a non-negative finite number, received ${maxStepsPerFrame}.`);
  }

  const safeFrameDt = Number.isFinite(frameDt) && frameDt > 0 ? frameDt : 0;
  let nextAccumulator = accumulator + safeFrameDt;
  const wantedSteps = Math.floor(nextAccumulator / fixedDt);
  const steps = Math.min(wantedSteps, maxStepsPerFrame);

  if (wantedSteps > maxStepsPerFrame) {
    // Avoid spiral of death: drop the time we cannot catch up on this frame.
    nextAccumulator = 0;
  } else {
    nextAccumulator -= steps * fixedDt;
  }

  return { steps, accumulator: nextAccumulator };
}
