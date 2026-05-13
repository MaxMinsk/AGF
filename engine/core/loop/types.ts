export type TimeContext = {
  /** Time elapsed since runtime start, in seconds. */
  elapsed: number;
  /** Delta for this callback in seconds: real frame dt for render, fixed dt for fixedUpdate. */
  dt: number;
  /** Fixed timestep currently used by the runtime, in seconds. */
  fixedDt: number;
  /** Total render frames since runtime start. */
  frameCount: number;
  /** Total fixed steps performed since runtime start. */
  fixedStepCount: number;
};

export type FixedStepResult = {
  /** Fixed steps the caller should run this frame. */
  steps: number;
  /** Accumulator value after consuming the steps. */
  accumulator: number;
};
