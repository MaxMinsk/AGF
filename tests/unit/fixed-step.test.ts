import { describe, expect, it } from "vitest";
import { advanceFixedStep } from "../../engine/core/loop/fixed-step";

const FIXED_DT = 1 / 60;

describe("advanceFixedStep", () => {
  it("returns zero steps when the accumulator is below fixedDt", () => {
    const result = advanceFixedStep(0, FIXED_DT / 4, FIXED_DT);

    expect(result.steps).toBe(0);
    expect(result.accumulator).toBeCloseTo(FIXED_DT / 4, 10);
  });

  it("runs one step and keeps the remainder when frame dt slightly exceeds fixedDt", () => {
    const result = advanceFixedStep(0, FIXED_DT * 1.5, FIXED_DT);

    expect(result.steps).toBe(1);
    expect(result.accumulator).toBeCloseTo(FIXED_DT * 0.5, 10);
  });

  it("runs multiple steps when several fixed slices fit", () => {
    const result = advanceFixedStep(0, FIXED_DT * 3.25, FIXED_DT);

    expect(result.steps).toBe(3);
    expect(result.accumulator).toBeCloseTo(FIXED_DT * 0.25, 10);
  });

  it("preserves accumulator across calls deterministically", () => {
    let acc = 0;
    let totalSteps = 0;

    for (let frame = 0; frame < 10; frame += 1) {
      const out = advanceFixedStep(acc, FIXED_DT * 1.1, FIXED_DT);
      acc = out.accumulator;
      totalSteps += out.steps;
    }

    expect(totalSteps).toBe(11);
    expect(acc).toBeCloseTo(0, 8);
  });

  it("caps steps per frame and drops surplus time to avoid spiral of death", () => {
    const result = advanceFixedStep(0, FIXED_DT * 50, FIXED_DT, 8);

    expect(result.steps).toBe(8);
    expect(result.accumulator).toBe(0);
  });

  it("treats non-positive or non-finite frame dt as zero", () => {
    const fromNegative = advanceFixedStep(FIXED_DT * 0.4, -1, FIXED_DT);
    const fromNan = advanceFixedStep(FIXED_DT * 0.4, Number.NaN, FIXED_DT);

    expect(fromNegative.steps).toBe(0);
    expect(fromNegative.accumulator).toBeCloseTo(FIXED_DT * 0.4, 10);
    expect(fromNan.steps).toBe(0);
    expect(fromNan.accumulator).toBeCloseTo(FIXED_DT * 0.4, 10);
  });

  it("rejects non-positive fixedDt", () => {
    expect(() => advanceFixedStep(0, FIXED_DT, 0)).toThrow(/positive finite/);
    expect(() => advanceFixedStep(0, FIXED_DT, -1)).toThrow(/positive finite/);
  });
});
