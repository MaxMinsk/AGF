# Sample Game Ideas

Date: 2026-05-13

This document proposes sample games for dogfooding the engine. The sample should be fun alone first, but the world should feel alive and shared. Players should enter and leave an existing world, not start a match or join only to help another player.

## Updated Selection Criteria

The ideal sample game should:

- Be enjoyable solo.
- Model a world that exists independently of player presence.
- Allow players to enter and leave at any time.
- Avoid match starts, ready checks, locked teams and queue-based matchmaking.
- Support 0-8 connected players conceptually, with 1-4 as the practical MVP target.
- Continue world simulation in a lightweight way when no players are online.
- Use server-owned world state when backend mode is enabled.
- Use both static scene data and runtime spawning.
- Exercise ECS systems, commands, validation and playtests.
- Need 3D first, with room for 2D UI/HUD and later 2D modes.
- Use simple but meaningful physics.
- Work with an authoritative C# backend later.
- Produce useful screenshots and robot-playtest metrics.
- Be visually readable with primitive shapes before real art exists.
- Allow shaders to matter without becoming an art-production trap.

## Multiplayer Model

Use a **persistent shared world**, not matchmaking.

- The world exists before a player connects.
- A player enters the current world state.
- A player can leave without ending anything.
- World events continue through server ticks, scheduled simulation or lazy catch-up.
- Players are presence in the world, not match participants.
- The client can run an offline local-world version in `static` mode.

Recommended backend shape:

- `static`: local offline world.
- `connected`: shared persistent world with optional account/presence.
- `authoritative`: C# server owns world state, objectives, spawning and important interactions.

## Recommendation

Start with **Beacon World**: a persistent floating ruin where salvage drones enter, collect energy, repair beacons, unlock paths and stabilize an ambient world signal. The world slowly drifts between stable and unstable states whether or not anyone is online.

Why this one:

- It is naturally fun alone: explore, collect, repair, unlock, stabilize.
- It supports organic multiplayer: other players are simply present in the same world.
- It does not need matchmaking, teams or synchronized match starts.
- It tests 3D movement, camera, physics, triggers, spawning, scoring, UI, shaders and backend state.
- It can start with cubes, capsules, glowing spheres and simple arenas.
- It gives agents clear objectives and measurable playtest goals.
- It scales from local single-player smoke test to persistent server-owned world.

## Idea 1: Beacon World

### Pitch

You enter a broken sky ruin as a small salvage drone. The world contains unstable beacons, drifting energy cores, locked gates and hazard zones. Anyone who connects appears in the same world and can explore, repair or move objects. The world keeps its state: repaired beacons stay repaired until they decay, cores respawn over time and hazards pulse on ambient cycles.

### Core Loop

1. Enter the current world state.
2. Explore nearby ruins and find energy cores.
3. Bring cores to damaged beacons.
4. Repaired beacons stabilize areas, unlock routes and increase world signal.
5. Hazards, decay and respawns keep the world changing.
6. Leave at any time; the world continues.

### Why It Is Good For The Engine

- **Solo-first:** one player can progress the world alone.
- **Persistent-world fit:** player join/leave is just presence, not match lifecycle.
- **Scene JSON:** beacons, gates, hazards, spawn points, repair zones and arena layout.
- **Prefabs:** player drone, energy core, beacon, hazard, gate, repair zone, world event marker.
- **ECS:** movement, repair, carry, hazard, decay, respawn, world signal, presence.
- **Commands:** spawn core, repair beacon, decay beacon, activate hazard, open gate, join world, leave world.
- **Physics:** player collisions, core pushing/carrying, trigger zones.
- **3D:** third-person or top-down 3D camera, modular floating ruin geometry.
- **2D/UI:** world signal meter, local objectives, nearby players, event feed.
- **Shaders:** glowing cores, beacon repair field, hazard pulse, world instability effect.
- **Audio:** positional beacon hum, warning pulses, repair complete sound, ambient world loop.
- **Hot reload:** move hazards/beacons without resetting the world.
- **Agent CLI/playtest tooling:** robot players can enter, collect cores, repair beacons and evaluate world stability through regular engine commands.
- **Backend:** authoritative world state, presence, interactions, ticks and snapshots.

### MVP Version

- One small world area.
- One player.
- Three energy cores.
- Two damaged beacons.
- One hazard type.
- Simple repair interaction.
- A world signal value.
- Core respawn timer.
- Beacon decay disabled or very slow for the first milestone.
- HUD with world signal and nearby objective status.

### Persistent Multiplayer Version

- Direct world URL, no lobby queue.
- Players appear in the current world state.
- Server owns beacon state, core state, hazard cycles and world signal.
- Leaving a player drops carried objects safely.
- Empty world can pause expensive simulation and catch up from timestamps later.
- No queue, no required ready check, no match reset.

### Stretch Features

- Ambient world events: storm pulse, core shower, gate malfunction.
- Beacon decay over real time.
- Area unlocks based on global signal.
- Personal lightweight goals layered over shared world state.
- Persistent best contribution stats.
- Replay file for world debugging.

### Robot Playtest Metrics

- Time to enter world and receive snapshot.
- Time to first core.
- Time to first beacon repair.
- World signal after N minutes.
- Core stuck time.
- Player fall/death count.
- Join/leave recovery time.
- Empty-world catch-up correctness.
- Snapshot size and update rate.

## Idea 2: Courier Outpost

### Pitch

A persistent floating outpost generates delivery requests, broken routes and repair tasks over time. Players enter the outpost, move packages, fix stations and leave whenever they want. The outpost continues producing tasks while idle.

### Core Loop

1. Enter the current outpost state.
2. Pick up packages and deliver them to stations.
3. Repair blocked routes or damaged station modules.
4. Deliveries and repairs improve outpost health.
5. New tasks appear over time.

### Why It Is Good For The Engine

- Very clear solo objectives.
- Strong persistent-world model.
- Great for commands, triggers, carrying and UI.
- Backend-owned tasks and world health are straightforward.
- Easier MVP than Beacon World.

### Risks

- Less visually exciting unless movement and hazards feel good.
- Can become too UI/task-list heavy.

### Best Use

Best fallback if Beacon World needs a tighter first sample.

## Idea 3: Kitchen Station

### Pitch

A persistent space kitchen receives orders from passing ships. Ingredients drift in, machines break and completed meals launch through delivery tubes. Players enter the kitchen world, work on whatever is currently happening and leave anytime.

### Core Loop

1. Orders appear over time.
2. Ingredients spawn and drift through the kitchen.
3. Players catch, combine and cook ingredients.
4. Completed dishes are delivered for points.
5. Mistakes create hazards like smoke clouds or bouncing burnt food.

### Why It Is Good For The Engine

- Strong co-op loop but still playable solo.
- Persistent task generation makes sense.
- Great for physics and triggers.
- Easy to add 2D order UI.
- Fun with positional audio and particles.
- Backend can own orders, score and machine state.

### Risks

- More complex interaction design than Beacon World.
- Needs better UI earlier.
- Recipe logic can sprawl if not scoped tightly.

### Best Use

Good second sample after the engine has stronger UI and interaction systems.

## Idea 4: Glitch Garden

### Pitch

A persistent tiny 3D garden where unstable plants, water channels and repair nodes evolve over time. Players enter, redirect energy, collect resources and stabilize zones.

### Core Loop

1. Enter the garden.
2. Collect energy seeds.
3. Deliver seeds to unstable nodes.
4. Redirect water/energy paths.
5. Stabilized zones produce resources or unlock paths.

### Why It Is Good For The Engine

- Calm solo loop.
- Strong persistent-state fantasy.
- Great for shaders: water, growth, energy lines, outlines.
- Lower pressure than action games.
- Good for agent tests because objectives are spatial and measurable.

### Risks

- Less immediate action.
- Needs charming visuals to feel interesting.
- Physics coverage may be lighter.

### Best Use

Good visual/shader sample later.

## Idea 5: Tiny Siege World

### Pitch

A persistent workshop world where players place small devices to protect a shared core from ambient hazard waves. Anyone can enter, build, repair or leave. The world records current defenses and damage.

### Core Loop

1. Enter the workshop world.
2. Place blocks, shields and launchers.
3. Ambient hazard waves approach the core.
4. Repair or rebuild damaged pieces.
5. Surviving waves upgrades the workshop.

### Why It Is Good For The Engine

- Excellent for prefabs and inspector editing.
- Tests runtime creation/destruction.
- Good for server authority.
- Shaders and particles matter.
- Persistent world state is meaningful.

### Risks

- Build mode adds editor-like complexity.
- Destruction and physics can grow quickly.
- Balancing persistent damage can distract from engine goals.

### Best Use

Great long-term dogfood game after the inspector exists.

## Comparison

| Idea | Solo Fit | Persistent Fit | Engine Coverage | MVP Scope | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Beacon World | Very high | Very high | Very high | Medium | Best first sample |
| Courier Outpost | Very high | Very high | High | Low-medium | Best fallback |
| Kitchen Station | High | High | High | Medium-high | Strong second sample |
| Glitch Garden | High | High | Medium | Medium | Shader/world-state sample |
| Tiny Siege World | High | Very high | Very high | High | Later dogfood target |

## Proposed Sample Roadmap

### Phase 1: Local World Prototype

- Static world scene.
- One player controller.
- Energy cores and beacons.
- Repair interaction.
- World signal value.
- Core respawn timer.
- HUD with signal strength and nearby objectives.
- Playwright screenshot and robot route.

### Phase 2: Local Presence Simulation

- Multiple simulated players in one runtime.
- Enter/leave events.
- Dropped carried objects on leave.
- Robot policies.
- World metrics.
- Command log and replay JSON.

### Phase 3: Backend World Integration

- C# world server owns beacons, cores, hazards, world signal and presence.
- TS client sends input frames and interaction commands.
- Server sends snapshots and world events.
- Simulated clients enter and leave the world.
- Empty-world catch-up uses timestamps instead of full live simulation.

### Phase 4: Real Persistent Feel

- Direct world URL.
- Presence list.
- Prediction/interpolation.
- Reconnect.
- Latency/jitter tests.
- Snapshot budget.
- Idle world lifecycle.

### Phase 5: Visual Identity

- Glowing core material.
- Beacon repair field shader.
- Hazard pulse shader.
- World instability effect.
- Positional audio.
- Objective/event feed UI.

## Minimal Asset Style

Use a clean toy-like sci-fi salvage style:

- Capsule or drone players.
- Glowing sphere cores.
- Boxy floating ruin modules.
- Color-coded beacons.
- Flat materials plus a few shader accents.
- No production art dependency in the first month.

## Backend Implications

The backend should model a **world**, not a match or temporary session.

Core server concepts:

- `WorldId`
- `PlayerPresence`
- `EnterWorld`
- `LeaveWorld`
- `WorldSnapshot`
- `WorldEvent`
- `ObjectiveState`
- `CarriedObject`
- `WorldSignal`
- `ServerOwnedInteraction`

Important behaviors:

- Players enter the current world state.
- Players can leave while carrying objects.
- Server preserves world state independently of current player count.
- Expensive simulation can pause when empty.
- Empty worlds can catch up from timestamps when a player returns.
- Solo offline mode should use the same world rules without networking.

## Final Choice

Pick **Beacon World** as the main sample game. Keep **Courier Outpost** as the reduced fallback if the first implementation needs a tighter scope.
