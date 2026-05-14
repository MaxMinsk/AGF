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
  /**
   * Fraction of `fixedDt` already consumed since the last fixed step
   * completed — value in [0, 1]. Frame-update systems use this to
   * interpolate physics results between fixed steps so visuals stay
   * smooth on >60 Hz displays (M24-interpolation). 0 immediately after
   * a fixed step, approaches 1 just before the next step fires.
   *
   * Always 0 inside fixedUpdate callbacks — the accumulator hasn't
   * advanced for the next frame yet.
   *
   * Optional in the type so unit-test scaffolds + bench harnesses can
   * keep ignoring it; the runtime tick always sets it.
   */
  physicsAlpha?: number;
};

export type FixedStepResult = {
  /** Fixed steps the caller should run this frame. */
  steps: number;
  /** Accumulator value after consuming the steps. */
  accumulator: number;
};
