// S129 KABOOM-CREW ragdoll template. First consumer of the engine
// ragdoll module (engine/physics/ragdoll/). One template, 10 bodies +
// 9 joints, matching the procedural-character generator's 10 visible
// meshes from S102 (procbomber-bench).
//
// Bodies, mass distribution + anchors lifted verbatim from
// docs/game-design/ragdoll-module-design.md §9. Mass-balanced so the
// total mass ≈ 1.0 — Rapier integrates fine at that scale and the
// impulse numbers in death-animation are tuned to that mass.
//
// Joint types match the actuated pivot list:
//   * neck            ← spherical (head tilt)
//   * shoulder L/R    ← spherical (arm rotation)
//   * elbow L/R       ← revolute  (bends one direction)
//   * hip L/R         ← spherical (leg rotation)
//   * knee L/R        ← revolute  (bends one direction)
//
// Cone-limit / twist values from the design doc aren't yet exposed
// by the engine module (the Rapier adapter wraps the base
// spherical / revolute / fixed factories without limit args). When
// limits land in engine/physics/rapier/rapier-adapter.ts they can be
// re-introduced here. The current rest-pose tuning + body anchors
// keep the ragdoll plausible without limits for the death-fall
// duration.

import type { RagdollTemplate } from "../../../../engine/physics/ragdoll/template-registry";

export const KABOOM_BOMBER_RAGDOLL: RagdollTemplate = {
  linearDamping: 0.4,
  angularDamping: 0.6,
  bodies: [
    { name: "torso", shape: "box", dimensions: [0.45, 0.45, 0.29], anchor: [0, 0.0, 0], mass: 0.4 },
    { name: "head", shape: "sphere", dimensions: [0.18, 0, 0], anchor: [0, 0.4, 0], mass: 0.1 },
    { name: "upperArm.l", shape: "capsule", dimensions: [0.075, 0.1, 0], anchor: [-0.3, 0.25, 0], mass: 0.05 },
    { name: "forearm.l", shape: "capsule", dimensions: [0.07, 0.1, 0], anchor: [-0.3, 0.05, 0], mass: 0.05 },
    { name: "upperArm.r", shape: "capsule", dimensions: [0.075, 0.1, 0], anchor: [0.3, 0.25, 0], mass: 0.05 },
    { name: "forearm.r", shape: "capsule", dimensions: [0.07, 0.1, 0], anchor: [0.3, 0.05, 0], mass: 0.05 },
    { name: "upperLeg.l", shape: "capsule", dimensions: [0.09, 0.1, 0], anchor: [-0.1, -0.3, 0], mass: 0.08 },
    { name: "lowerLeg.l", shape: "capsule", dimensions: [0.08, 0.1, 0], anchor: [-0.1, -0.5, 0], mass: 0.06 },
    { name: "upperLeg.r", shape: "capsule", dimensions: [0.09, 0.1, 0], anchor: [0.1, -0.3, 0], mass: 0.08 },
    { name: "lowerLeg.r", shape: "capsule", dimensions: [0.08, 0.1, 0], anchor: [0.1, -0.5, 0], mass: 0.06 }
  ],
  joints: [
    // Neck — head sits 0.4m above the torso centre; anchorA in the
    // torso's top, anchorB in the head's bottom.
    {
      name: "neck",
      bodyA: "torso",
      bodyB: "head",
      type: "ball",
      anchorA: [0, 0.225, 0],
      anchorB: [0, -0.175, 0]
    },
    // Shoulders — anchored at the torso's outer edge + the upper-arm's top.
    {
      name: "shoulder.l",
      bodyA: "torso",
      bodyB: "upperArm.l",
      type: "ball",
      anchorA: [-0.225, 0.225, 0],
      anchorB: [0, 0.1, 0]
    },
    {
      name: "shoulder.r",
      bodyA: "torso",
      bodyB: "upperArm.r",
      type: "ball",
      anchorA: [0.225, 0.225, 0],
      anchorB: [0, 0.1, 0]
    },
    // Elbows — revolute around the X axis so the forearm bends
    // toward/away from the bomber body plane.
    {
      name: "elbow.l",
      bodyA: "upperArm.l",
      bodyB: "forearm.l",
      type: "revolute",
      anchorA: [0, -0.1, 0],
      anchorB: [0, 0.1, 0],
      axis: [1, 0, 0]
    },
    {
      name: "elbow.r",
      bodyA: "upperArm.r",
      bodyB: "forearm.r",
      type: "revolute",
      anchorA: [0, -0.1, 0],
      anchorB: [0, 0.1, 0],
      axis: [1, 0, 0]
    },
    // Hips — anchored at the torso's bottom outer edge + upper-leg top.
    {
      name: "hip.l",
      bodyA: "torso",
      bodyB: "upperLeg.l",
      type: "ball",
      anchorA: [-0.1, -0.225, 0],
      anchorB: [0, 0.1, 0]
    },
    {
      name: "hip.r",
      bodyA: "torso",
      bodyB: "upperLeg.r",
      type: "ball",
      anchorA: [0.1, -0.225, 0],
      anchorB: [0, 0.1, 0]
    },
    // Knees — revolute around X for natural bend.
    {
      name: "knee.l",
      bodyA: "upperLeg.l",
      bodyB: "lowerLeg.l",
      type: "revolute",
      anchorA: [0, -0.1, 0],
      anchorB: [0, 0.1, 0],
      axis: [1, 0, 0]
    },
    {
      name: "knee.r",
      bodyA: "upperLeg.r",
      bodyB: "lowerLeg.r",
      type: "revolute",
      anchorA: [0, -0.1, 0],
      anchorB: [0, 0.1, 0],
      axis: [1, 0, 0]
    }
  ]
};

export const KABOOM_BOMBER_RAGDOLL_KEY = "kaboom-bomber";
