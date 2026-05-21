// S103 PROCBOMBER-IK-REACH-TARGET — analytic two-bone IK solver.
//
// Given a shoulder anchor at the origin, an end-effector (hand) target
// position in shoulder-local space, and two segment lengths (upperArm
// + forearm), solve the shoulder pitch + yaw + elbow bend so the hand
// reaches the target — assuming the elbow bends only in the plane the
// upper arm + forearm define.
//
// The math is pure trig (cosine rule), not an iterative CCD pass:
//   d         = distance from shoulder to target
//   d_clamped = min(d, L1 + L2 - eps)              // can't reach further
//   elbow    = π − acos((L1² + L2² − d_clamped²) / (2·L1·L2))
//   alpha    = acos((L1² + d_clamped² − L2²) / (2·L1·d_clamped))
//
// `alpha` is the angle BETWEEN the upper arm and the line shoulder→target.
// The shoulder pitch (X-rotation) + yaw (Y-rotation) then orient the upper
// arm so that arm + bend together reach the target.
//
// Convention: the upper arm REST pose hangs straight down (-Y) from the
// shoulder. The solver returns rotations that the bench-animation-system
// writes to the shoulder + elbow pivots' Transform.rotation in radians.

export type IkTarget = Readonly<[number, number, number]>;

export type IkSolution = {
  shoulderPitchRad: number;
  shoulderYawRad: number;
  elbowBendRad: number;
  /** True when the target was outside the reach envelope and got clamped to L1 + L2. */
  clamped: boolean;
};

const EPS = 1e-4;

export function solveTwoBoneIk(
  target: IkTarget,
  upperArmLength: number,
  forearmLength: number
): IkSolution {
  const [tx, ty, tz] = target;
  const dRaw = Math.hypot(tx, ty, tz);
  const maxReach = upperArmLength + forearmLength - EPS;
  const clamped = dRaw > maxReach;
  const d = Math.min(dRaw, maxReach);
  const safeD = Math.max(d, Math.abs(upperArmLength - forearmLength) + EPS);
  const L1 = upperArmLength;
  const L2 = forearmLength;

  // Elbow bend: 0 = straight, π = fully folded. We want positive bend
  // to correspond to "forearm curls forward of the upper arm", matching
  // the walk-cycle elbow sign convention.
  const cosElbow = clamp((L1 * L1 + L2 * L2 - safeD * safeD) / (2 * L1 * L2), -1, 1);
  const elbowFold = Math.acos(cosElbow);           // 0 = straight, π = collapsed
  const elbowBendRad = Math.PI - elbowFold;        // 0 = straight, +π = fully bent forward

  // Alpha: angle between the upper arm and the shoulder→target line.
  const cosAlpha = clamp((L1 * L1 + safeD * safeD - L2 * L2) / (2 * L1 * safeD), -1, 1);
  const alpha = Math.acos(cosAlpha);

  // Direction from shoulder to target in XZ + Y components.
  // Shoulder pitch is the angle of the target vector around X.
  // With rest pose at -Y, pitch=0 means hanging down. Positive pitch
  // (around X-axis) swings the upper arm forward (+Z).
  // pitch toTarget = atan2(target.z, -target.y) — when target is
  // directly below (y<0, z=0), pitch = 0.
  const pitchToTarget = Math.atan2(tz, -ty);
  // Yaw around Y: tilt the arm sideways (towards +X for right side, -X for left side).
  // yaw = atan2(target.x, sqrt(y² + z²)).
  const horizontalDist = Math.hypot(ty, tz);
  const shoulderYawRad = Math.atan2(tx, horizontalDist);

  // The elbow bend reduces the effective reach of the upper arm in the
  // direction of the target. We subtract alpha so the upper arm
  // points OFF the direct line and the forearm closes the gap.
  const shoulderPitchRad = pitchToTarget - alpha;

  return { shoulderPitchRad, shoulderYawRad, elbowBendRad, clamped };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * S103 PROCBOMBER-IK-REACH-TARGET — animated target for the bench's
 * "reach" demo. The target circles around the bomber's left shoulder
 * in the XZ plane plus a slow vertical oscillation, so the user can
 * see the arm tracking through a continuous motion.
 */
export function reachDemoTarget(elapsed: number, radius = 0.35): IkTarget {
  // 0.5 Hz circle in XZ, slow vertical wobble at 0.2 Hz.
  const phase = elapsed * 0.5 * Math.PI * 2;
  const verticalPhase = elapsed * 0.2 * Math.PI * 2;
  const tx = Math.sin(phase) * radius;
  const tz = Math.cos(phase) * radius * 0.5;
  const ty = -radius * 0.5 + Math.sin(verticalPhase) * radius * 0.3;
  return [tx, ty, tz];
}
