export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error(`Invalid clamp range: min ${min} is greater than max ${max}.`);
  }

  return Math.min(Math.max(value, min), max);
}

