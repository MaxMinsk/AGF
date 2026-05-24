# Physics Ragdoll Module — AGF engine spec

> **Status: design intent.** First pass: 2026-05-24.
> Owner: dev terminal once promoted. First consumer: Kaboom Crew
> (replaces the S105-shipped procedural-spring ragdoll).
> Companion stories: `GDP-2026-05-24-001` (engine module) +
> `GDP-2026-05-24-002` (Kaboom Crew adoption).
> Memory: [project-ragdoll-physics-module] — design pivot from
> procedural spring → engine physics module.

---

## 1. Why an engine module, not a project feature

S105 shipped a procedural-spring ragdoll inside
`examples/kaboom-crew/` — 9 limb pivots driven by spring math, no real
physics, the body kept inside arena bounds via S108 ground-clamp +
wall-collision. It works visually. It is also the wrong place for
this code to live.

Three reasons to lift it into the engine:

1. **AGF is engine showcase first, game second.** A ragdoll primitive
   built on Rapier is exactly the kind of reusable system the framework
   exists to deliver. Spring math living in `examples/kaboom-crew/src/`
   is a project-specific shortcut — every future game that wants
   ragdoll would either duplicate it or upgrade it.
2. **Rapier already in the engine.** `physics-bench` and the Beacon
   World character controller consume it. Adding a ragdoll module on
   top is a natural next engine surface, not a new dependency.
3. **Cross-project reuse is real, not speculative.** Beacon World
   drones could fall apart on destruction. Any future arena-brawler /
   RPG / co-op sample with humanoid characters benefits for free. The
   primitive should ship once.

Per CLAUDE.md: *"Engine ships only generic primitives + reusable
systems. Project-specific gameplay code lives under
`examples/<project>/`."* The S105 spring path violates this. This doc
is the correction.

---

## 2. Scope of the module

**The engine module owns:**

- `RagdollTemplate` schema — bodies + joints config shape.
- `RagdollTemplateRegistry` — register-by-key, lookup-by-key API.
- ECS components: `RagdollSpawnRequest`, `RagdollState`,
  `RagdollBody`, `RagdollJoint`.
- Systems: `RagdollSpawnSystem` (consumes request → spawns Rapier
  bodies + joints), `RagdollSyncSystem` (copies Rapier transforms
  back to ECS Transform per fixedUpdate), `RagdollTeardownSystem`
  (disposal on entity remove or explicit despawn).
- Generic test fixtures: a `unit-test`-ready ragdoll scene with a
  primitive 3-body skeleton (so the module is testable without a
  full humanoid).
- `doctor` integration: a section listing registered ragdoll
  templates + active ragdoll bodies count.

**The project owns:**

- Its own `RagdollTemplate` definition (body sizes, joint placements,
  mass distribution, damping) — registered at bootstrap.
- Trigger logic: when to fire `RagdollSpawnRequest` (in Kaboom Crew,
  on `BomberStats.alive` → false; in other games, on whatever
  game-specific event).
- Impulse vector at activation (in Kaboom Crew, derived from blast
  direction; in other games, whatever direction makes sense).
- Visual styling on top of physics (e.g. dissolve-on-despawn shader,
  blood-or-not, slapstick exaggerations).

This split is the rule of every engine module: data describes intent,
the engine simulates, the project tells it WHEN.

---

## 3. RagdollTemplate schema

A template fully describes one ragdoll skeleton. Bodies + joints, all
specified anatomically (per-body anchor relative to root, per-joint
anchor relative to its two bodies). Same template can spawn an
unlimited number of ragdolls (each gets its own Rapier rigid bodies);
template itself is data only, no per-instance state.

### 3.1 RagdollBodyDef

```text
RagdollBodyDef {
  name: string                   // 'torso', 'head', 'upperArm.l', ...
                                 // matches the skeleton mesh/pivot
                                 // naming convention from
                                 // characters-and-visual.md §2.2

  shape: 'box' | 'capsule' | 'sphere'
  dimensions: [number, number, number]
                                 // box:    [width, height, depth]
                                 // capsule:[radius, halfHeight, _]
                                 // sphere: [radius, _, _]

  mass: number                   // kg-equivalent; relative scale only
                                 // (Rapier doesn't care about unit
                                 // system, just consistency)
  linearDamping?: number         // default 0.4
  angularDamping?: number        // default 0.6

  // Anchor of the body in skeleton-root-local space.
  // The spawn system reads this + the entity's current Transform
  // to compute world-space spawn pose.
  anchor: [number, number, number]

  // Initial orientation (Euler XYZ in radians, default 0/0/0).
  // Useful for limbs that hang at an angle in T-pose.
  rotation?: [number, number, number]
}
```

### 3.2 RagdollJointDef

```text
RagdollJointDef {
  parent: string          // body name (must exist in bodies[])
  child:  string          // body name (must exist in bodies[])

  type: 'spherical' | 'revolute' | 'fixed'

  // Anchor of the joint in each body's LOCAL space.
  parentAnchor: [number, number, number]
  childAnchor:  [number, number, number]

  // Revolute joints need an axis; spherical + fixed ignore it.
  axis?: [number, number, number]

  // Angular limits in radians.
  // - spherical: limits the cone half-angle around parentAnchor
  //   plus a twist limit around the axis from parent → child.
  // - revolute: { min, max } around the axis (0 = T-pose).
  // - fixed: ignored (no rotation allowed).
  limits?: {
    cone?: number       // spherical only — radians; default π/2 (90°)
    twist?: number      // spherical only — radians; default π/4 (45°)
    min?: number        // revolute only
    max?: number        // revolute only
  }

  // Optional spring back-to-neutral force. Default 0 (free).
  // Non-zero values pull the joint toward its rest angle — useful
  // for slightly-stiff joints (e.g. corpse with rigor).
  springStiffness?: number
  springDamping?: number
}
```

### 3.3 RagdollTemplate

```text
RagdollTemplate {
  agfFormatVersion: 1
  name: string                          // 'kaboom-bomber', 'beacon-drone', ...
  bodies: RagdollBodyDef[]
  joints: RagdollJointDef[]

  // Optional defaults applied to ALL bodies/joints unless
  // overridden per-entry. Saves repetition in dense templates.
  defaults?: {
    linearDamping?: number
    angularDamping?: number
    coneLimit?: number
    twistLimit?: number
  }
}
```

---

## 4. ECS components

Three component shapes — request, state, per-body tag. All
schema-backed, all small.

### 4.1 RagdollSpawnRequest (transient — consumed same tick)

```text
RagdollSpawnRequest {
  templateKey: string             // registered template name

  // Optional initial impulse. Applied as linear + angular impulse
  // to the ROOT body in the template (typically 'torso'); other
  // bodies inherit via the constraints + their own mass.
  impulse?: {
    linear:  [number, number, number]    // velocity in cell/sec
    angular?: [number, number, number]   // angular velocity in rad/sec
  }
}
```

Written on the skeleton-root entity. The spawn system consumes it,
deletes it, and writes `RagdollState` in its place.

### 4.2 RagdollState (persistent until teardown)

```text
RagdollState {
  templateKey: string                   // for debugging + teardown
  spawnedAt: number                     // fixedUpdate elapsed timestamp
  bodyEntities: { [bodyName: string]: EntityId }
                                        // 'torso' → 'kaboom.player.1.ragdoll.torso'
  jointEntities: EntityId[]             // engine-owned joint records
}
```

Written by `RagdollSpawnSystem` once spawn completes. Acts as the
canonical handle for downstream systems to query "is this entity in
ragdoll mode?".

### 4.3 RagdollBody (per body entity)

```text
RagdollBody {
  ownerRoot: EntityId             // back-reference to the skeleton root
  bodyName: string                // 'torso', 'head', ...
  rapierBodyHandle: number        // opaque Rapier handle
}
```

Each body entity ALSO has:
- `Transform` (synced from Rapier each tick by `RagdollSyncSystem`)
- `MeshRenderer` (or whatever the project's rendering surface uses)
  attached at spawn time — the visible mesh hands over from the
  animated skeleton to the physics-driven body.

### 4.4 RagdollJoint (per joint entity)

Engine-internal bookkeeping; project code generally doesn't read it.

```text
RagdollJoint {
  ownerRoot: EntityId
  parentBody: EntityId
  childBody: EntityId
  rapierJointHandle: number
}
```

---

## 5. Systems

Four systems, all registered by the engine. Project bootstraps
declare them in their scheduler (same pattern as
`physics-step-system`).

### 5.1 `RagdollSpawnSystem`

Consumes `RagdollSpawnRequest` on any entity in the world.

Per request:
1. Look up template by `templateKey` in the registry. If missing,
   log error + drop the request (same pattern as missing-mesh
   fallback).
2. For each `RagdollBodyDef`: spawn a Rapier rigid body
   (`RigidBodyType.Dynamic`) with the configured shape + dimensions
   + mass + damping. Compute world transform from
   (root-entity-Transform × body-anchor × body-rotation).
3. For each `RagdollJointDef`: spawn the corresponding Rapier joint
   between the named parent + child bodies. Apply limits and optional
   spring.
4. Re-parent the visible meshes on the original skeleton (torso,
   head, limb meshes) from animation pivots to the corresponding
   ragdoll body entities. The renderer keeps drawing them; only the
   Transform source switched from animation-systems to Rapier.
5. Apply the optional initial impulse to the root body.
6. Disable animation systems for this entity by writing a
   `RagdollActive` marker the animation systems' queries already
   filter on (matches the existing convention).
7. Write `RagdollState` on the skeleton root.
8. Delete the `RagdollSpawnRequest`.

### 5.2 `RagdollSyncSystem`

Runs every fixedUpdate after the Rapier step. For each entity with
`RagdollState`, copy each body's Rapier transform back to the
matching body entity's `Transform`. Meshes inherit.

This is the only system that touches Rapier-side transforms; the
animation systems no longer write to the body entities (the
`RagdollActive` marker filters them out).

### 5.3 `RagdollTeardownSystem`

Triggers:
- The skeleton root entity is despawned (game-specific — Kaboom Crew
  despawns 0.6 s after alive-flip; future games may keep ragdolls
  around longer).
- An explicit `RagdollTeardownRequest` component is written
  (rare — useful for reverse-from-ragdoll scenarios, e.g. revives).

Action: dispose all Rapier bodies + joints belonging to this
`RagdollState`. Remove the body + joint ECS entities. Remove
`RagdollState`, `RagdollActive` markers from the root. The root
itself + its visible meshes may also be despawned (project decides
in its own teardown flow).

### 5.4 `RagdollDoctorSystem` (optional, registered if `engine doctor`
project surface is consumed)

Adds a doctor section: "Ragdoll registry: N templates registered
([keys]). Active ragdolls: M". Surfaces when an active ragdoll
exceeds a budget (e.g. > 16 simultaneous) so projects can spot leaks.

---

## 6. Integration with animated skeleton

The interface point between the existing animation pipeline (idle-bob,
walk-cycle, bomb-place IK, hit-recoil) and the ragdoll module is
clean. Pre-activation: animation systems own the pivot rotations.
Post-activation: physics owns the body transforms. The visible meshes
are re-parented at spawn time.

### 6.1 Handover sequence (per skeleton entity)

```
Animation phase                 Spawn boundary                 Physics phase
────────────────────────        ──────────────                 ────────────────
idle / walk / hit-recoil         RagdollSpawnSystem fires       RagdollSyncSystem
                                                                 writes Transform
animation systems write   ──→   meshes re-parent       ──→     Rapier owns body
pivot rotations                  from pivots to                  transforms;
                                 ragdoll body entities          meshes inherit
                                                                
                                 RagdollActive marker
                                 set; animation
                                 queries skip
```

### 6.2 What pre-spawn pose is preserved?

The ragdoll spawns at the current world-space transform of the
skeleton root and each named limb pivot. So a bomber killed
mid-stride spawns with their leg already raised — physics takes
over from where animation left off. This is what makes the
ragdoll read as continuous with the death moment, not as a hard
cut.

### 6.3 Reverse handover (Kaboom Crew: never; future games: maybe)

Not in this story's scope. Sketched here so the API doesn't lock it
out:

- A `RagdollTeardownRequest` with a `restoreToAnimation: true` flag
  would dispose Rapier bodies, re-attach meshes to animation pivots,
  clear `RagdollActive`, and let animation resume. Useful for revives
  / pickup-the-corpse mechanics. Out of MVP scope.

### 6.4 Mesh-handover contract (S131)

The "meshes re-parent" line in §6.1 is concrete. The project drives the
handover by adding a `meshMap` to its `RagdollSpawnRequest`:

```ts
world.setComponent(bomberId, "RagdollSpawnRequest", {
  templateKey: "kaboom-bomber",
  impulse: [...],
  meshMap: {
    torso: "bomber.42.torso",
    head: "bomber.42.head",
    "upperArm.l": "bomber.42.upperArm.l",
    // ...one entry per body name the project wants to follow physics
  }
});
```

Lifecycle:

1. **Spawn.** `RagdollSpawnSystem` reads `meshMap`. For each
   `[bodyName, meshEntityId]` it writes
   `RagdollMeshBinding { ragdollRoot, bodyName, bodyEntity }` on the
   mesh entity, and appends the mesh id to `RagdollState.meshEntities`.
   Unknown body names + missing mesh entities are skipped silently
   (partial maps are valid).
2. **Sync.** `RagdollSyncSystem` queries `[RagdollMeshBinding,
   Transform]` after the body-readback pass and copies each bound
   body's Transform onto its mesh — position + rotation. No extra
   Rapier round-trip; it reads the body's just-refreshed Transform
   from the ECS.
3. **Teardown.** `RagdollTeardownSystem` iterates
   `state.meshEntities` and removes the `RagdollMeshBinding`
   component. **Mesh entities themselves are NOT removed** — the
   project keeps ownership of them and decides what to do next
   (hide the corpse, swap to a static "downed" model, re-attach to
   animation pivots, etc.). The mesh's last Transform is left as-is.

What the contract **doesn't** do:

- It doesn't detach the meshes from their pre-spawn parents (animation
  pivots, skeleton root). Projects either accept the visual seam at
  the spawn frame, or detach before writing `RagdollSpawnRequest`.
- It doesn't restore meshes to their original parent on teardown.
  Reverse handover (§6.3) would add that flag later.
- It doesn't scale, parent, or otherwise reshape the meshes — just
  position + rotation tracking. Mesh scale stays whatever the project
  set pre-spawn.

---

## 7. Determinism + multiplayer behaviour

### 7.1 Determinism

Rapier is **deterministic given identical inputs**: same body specs +
same joint specs + same dt + same impulse + same world seed → same
trajectory. This matters for replay fixtures + bot-vs-bot regression
tests.

The bot-vs-bot test runs SERVER-SIDE (per gameplay-systems.md §12.1)
and uses fixed dt. As long as the test seeds the world consistently,
ragdoll outcomes are reproducible.

Visual determinism across clients is NOT guaranteed (per
gameplay-systems.md §12.1 — visual divergence is acceptable). Two
clients watching the same death may see slightly different ragdoll
trajectories due to floating-point drift. Gameplay state stays
authoritative server-side.

### 7.2 Multiplayer

After Sprint B of multiplayer (GDP-2026-05-22-011) lands, the server
will be authoritative on bomber alive-flips. The ragdoll spawn is a
CLIENT presentation effect, fired from a server snapshot's
`bomberDied` event (which carries the blast origin). Each client
runs its own local ragdoll sim; small visual drift is acceptable.

The server itself does NOT run ragdolls. Server treats the bomber as
"despawned 0.6 s after alive-flip"; the corpse is purely client-side
spectacle. Saves server CPU + sidesteps the network-sync question
(no need to replicate ragdoll body positions).

---

## 8. Performance budget

Per-ragdoll cost (9 bodies + 9 joints):
- ~9 Rapier rigid-body updates per fixedUpdate.
- ~9 Rapier constraint solves per fixedUpdate.
- ~9 Transform writes per fixedUpdate (RagdollSyncSystem).

At 4 simultaneous bombers (Kaboom Crew arena worst case): 36 bodies +
36 joints. Well under Rapier's bench-tested limits (`physics-bench`
runs 200 Rapier rigid-bodies at 60 fps).

Ragdoll bodies don't collide with each other by default (collision
group `RAGDOLL_BODY` excludes itself). They DO collide with
`ARENA_WALL` and `ARENA_FLOOR`. They DON'T collide with bombs,
pickups, or live bombers (collision groups separate). This matches
the S108 wall-collision + ground-clamp behaviour the procedural
ragdoll already established.

Despawn after 0.6 s (project-controlled) bounds the simulation
window. No long-running ragdoll piles up.

---

## 9. First consumer: Kaboom Crew adoption

Shipped across S126–S132. Migration plan from `GDP-2026-05-24-002`
complete:

- S126–S128 — engine ragdoll module (schemas + registry + Rapier
  adapter joints/impulse + spawn/sync/teardown systems).
- S129 — kaboom-bomber template registered at bootstrap.
- S131 — engine mesh-handover primitive (`meshMap` on the spawn
  request + `RagdollMeshBinding` + sync mirroring).
- S132 — kaboom-crew death-trigger swap. The project's
  `createKaboomDeathTriggerSystem` watches BomberStats.alive
  transitions, detaches the 10 procedural meshes from their pivot
  parents, builds a `meshMap`, reads `DeathImpulse` (blast direction),
  and writes the `RagdollSpawnRequest`. The legacy S105 spring path
  (`createKaboomDeathAnimationSystem` + `createSpringPivotSystem`)
  is de-registered; source files remain as a one-sprint soft archive
  before deletion in S133.

The Kaboom Crew `RagdollTemplate` lives at
`examples/kaboom-crew/src/characters/kaboom-bomber-ragdoll-template.ts`
and is registered at bootstrap. Its body list maps 1:1 to the 10
visible meshes from the procedural character generator (S102):

| Body name | Shape | Dimensions (cells) | Mass | Anchor (root-local) |
|---|---|---|---|---|
| torso       | box     | [0.45, 0.45, 0.29] | 0.40 | (0, 0.0, 0)   |
| head        | sphere  | [0.18, _, _]       | 0.10 | (0, 0.40, 0)  |
| upperArm.l  | capsule | [0.075, 0.10, _]   | 0.05 | (-0.30, 0.25, 0) |
| forearm.l   | capsule | [0.07, 0.10, _]    | 0.05 | (-0.30, 0.05, 0) |
| upperArm.r  | (mirror)| ...                | 0.05 | (+0.30, 0.25, 0) |
| forearm.r   | (mirror)| ...                | 0.05 | (+0.30, 0.05, 0) |
| upperLeg.l  | capsule | [0.09, 0.10, _]    | 0.08 | (-0.10, -0.30, 0) |
| lowerLeg.l  | capsule | [0.08, 0.10, _]    | 0.06 | (-0.10, -0.50, 0) |
| upperLeg.r  | (mirror)| ...                | 0.08 | (+0.10, -0.30, 0) |
| lowerLeg.r  | (mirror)| ...                | 0.06 | (+0.10, -0.50, 0) |
|             |         |                    | Σ ≈ 1.0 mass | |

Joints (9, matching the actuated pivot list from
characters-and-visual.md §2.2):

| Parent | Child | Type | Cone limit | Twist | Notes |
|---|---|---|---|---|---|
| torso      | head       | spherical | π/4 (45°) | π/4 | neck — limited tilt |
| torso      | upperArm.l | spherical | π/2 (90°) | π/3 | shoulder — wide |
| torso      | upperArm.r | spherical | π/2       | π/3 | shoulder mirror |
| upperArm.l | forearm.l  | revolute  | min=0, max=π*0.9 | _ | elbow — bend one direction |
| upperArm.r | forearm.r  | revolute  | (mirror)  | _ | elbow mirror |
| torso      | upperLeg.l | spherical | π/2.5     | π/4 | hip — somewhat limited |
| torso      | upperLeg.r | spherical | π/2.5     | π/4 | hip mirror |
| upperLeg.l | lowerLeg.l | revolute  | min=0, max=π*0.85 | _ | knee — bends one way |
| upperLeg.r | lowerLeg.r | revolute  | min=0, max=π*0.85 | _ | knee mirror |

Impulse on death:
- `direction` = normalized vector from blast origin to bomber cell.
- `linear magnitude` = base 2.5 cell/sec, clamped to 4.0 on chain
  reactions (matches the S105 procedural-spring magnitude clamp).
- `angular` = `cross(direction, worldUp) × π` rad/sec — natural
  tumble.

Replaces the S105 spring-based DeathAnim system + S108 ground-clamp /
wall-collision systems. Real Rapier physics handles all three
(launch, ground, walls) natively.

---

## 10. Future consumers (forward-looking, NOT in scope)

These are noted so the API doesn't lock them out:

- **Beacon World drones** — could fall apart on destruction. Drone
  template would have fewer body parts (maybe 4: body, two
  prop-arms, antenna) and lower mass.
- **Future arena brawler / RPG sample** — full humanoid + held
  weapon (an extra body fixed-jointed to a hand). Same template
  shape, extended.
- **Vehicle ragdoll** — wheels-fall-off when destroyed. Different
  topology but same primitive (bodies + joints).

The module API stays generic enough for these without changes.

---

## 11. Out of scope

Explicit non-goals for the engine module + its first consumer:

- **Skinned-mesh ragdolls.** Our meshes are primitive node-trees (per
  characters-and-visual.md §2.2). Skinned-mesh + bone-mapping is a
  separate, larger feature.
- **Soft-body / cloth physics.** Ragdoll is rigid-body chains.
  Capes, hair, banners — out of scope.
- **Active ragdoll** (motor-driven joints that try to maintain a
  pose). All joints are passive. Active ragdoll is a wholly
  different control problem.
- **Inverse kinematics back from physics state.** Once in ragdoll
  mode, no IK runs on top. Reverse handover (§6.3) is a future
  add-on.
- **Collision callbacks for gameplay** (e.g. "ragdoll head hit
  another bomber → ricochet"). Ragdoll is dead-body presentation
  only; it does not interact with gameplay objects.
- **Audio coupling** (e.g. limb-impact sounds when ragdoll hits
  ground). Punt — single death audio event fires at alive-flip;
  per-impact sounds is a fidelity layer for later.
- **Configurable ragdoll despawn timer per template.** Despawn is
  project-controlled (the project despawns the ROOT entity, which
  cascades to ragdoll teardown). Engine doesn't need to know.
- **Dismemberment** (joint break under stress). Future possibility;
  not v1.

---

## 12. Open questions (resolved later, in playtest)

1. **Tuning the impulse magnitude.** The S105 spring numbers were
   tuned by eye. Rapier physics will respond differently — the
   ragdoll may feel too light or too heavy. Expect 1–2 rounds of
   tuning in the kaboom-bomber-ragdoll-template.
2. **Friction between ragdoll body and floor.** Too low → corpse
   slides forever. Too high → unnatural stop. Start at 0.6 (Rapier
   default), tune in playtest.
3. **Ragdoll-vs-arena-block collision.** Should a ragdoll launched
   into a soft block knock it (visually) or just stop? Recommend
   stop (gameplay-affecting interactions stay grid-authoritative).
4. **Z-fighting between ragdoll meshes and floor.** When a body part
   lies on the floor, the contact point may flicker. Mitigation: tiny
   floor-offset of 0.005 cells on dead-body meshes. Punt to playtest.

None block the v1 module; all are tuning levers within the existing
template API.
