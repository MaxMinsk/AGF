// S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013).
//
// Project-local system that applies the active arena theme to the
// scene at scene-load. v1 scope (MVP): re-tint the floor entity's
// MeshRenderer.color from the theme's `floorPrimaryHex`.
//
// Source of truth:
//   - Theme key:  kaboom.game-state singleton's ArenaTheme.themeKey.
//                 Seeded by bootstrap.ts from `?theme=` URL flag or the
//                 per-arena default in theme-table.ts.
//   - Theme data: examples/kaboom-crew/src/themes/theme-table.ts.
//
// Behaviour:
//   - Runs at most once per world (cachedWorld swap pattern). The
//     restart path re-applies on the next scene.load because a fresh
//     scene.load swaps the world reference, which resets `cachedWorld`.
//   - Missing ArenaTheme component → falls back to "warehouse".
//   - Unknown themeKey → falls back to "warehouse" (defensive).
//   - Missing floor entity → no-op (avoids breaking scenes that pre-
//     date the floor entity convention).
//
// OUT OF SCOPE for the MVP (per GDP "OUT OF SCOPE" list):
//   - Directional / ambient lighting tint (no lighting module yet).
//   - Hard / soft block palette re-tinting.
//   - Wang family floor-colour re-tinting.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import {
  ARENA_THEMES,
  isArenaThemeKey,
  type ArenaTheme,
  type ArenaThemeKey
} from "../themes/theme-table";

const KABOOM_GAME_STATE_ID = "kaboom.game-state";
const FLOOR_ENTITY_ID = "floor";
const ARENA_THEME_COMPONENT = "ArenaTheme";
const MESH_RENDERER_COMPONENT = "MeshRenderer";

const DEFAULT_THEME_KEY: ArenaThemeKey = "warehouse";

type ArenaThemeComponent = { themeKey?: string };
type MeshRendererComponent = { mesh?: string; color?: string };

export type ArenaThemeApplySystemOptions = {
  name?: string;
};

/**
 * Pure helper — resolve a (possibly-undefined / possibly-unknown)
 * themeKey to a registered theme. Falls back to warehouse for the two
 * defensive paths (missing key + unknown key). Exposed for tests.
 */
export function resolveArenaTheme(themeKey: unknown): ArenaTheme {
  if (isArenaThemeKey(themeKey)) return ARENA_THEMES[themeKey];
  return ARENA_THEMES[DEFAULT_THEME_KEY];
}

/**
 * Apply the resolved theme to the world's floor entity (id="floor"). No-
 * op when the floor entity is missing. Pure given (world, theme); used
 * by both the system below + the tests.
 */
export function applyArenaThemeToWorld(world: World, theme: ArenaTheme): void {
  if (!world.hasEntity(FLOOR_ENTITY_ID)) return;
  const current = world.getComponent<MeshRendererComponent>(
    FLOOR_ENTITY_ID,
    MESH_RENDERER_COMPONENT
  );
  const next: MeshRendererComponent = {
    ...(current ?? {}),
    color: theme.floorPrimaryHex
  };
  world.setComponent(FLOOR_ENTITY_ID, MESH_RENDERER_COMPONENT, next);
}

/**
 * S189 — start a project-local rAF poller that watches the active
 * arena theme key and pushes its `skyColor` into the renderer's
 * scene background. Mirrors startVertexColorsPoller: cheap snapshot
 * read each rAF, idempotent — only writes when the tracked themeKey
 * actually changes. Mount once from `attachUi`.
 */
export function startArenaSkyApplyPoller(runtime: {
  snapshot(): { entities: ReadonlyArray<{ id: string; components: Record<string, unknown> }> };
  renderer: { adapter: { setBackgroundColor(hex: string): void } };
}): void {
  if (typeof requestAnimationFrame === "undefined") return;
  let lastApplied: string | undefined;
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const game = snap.entities.find((e) => e.id === KABOOM_GAME_STATE_ID);
      const comp = game?.components[ARENA_THEME_COMPONENT] as
        | ArenaThemeComponent
        | undefined;
      const theme = resolveArenaTheme(comp?.themeKey);
      if (theme.skyColor !== lastApplied) {
        runtime.renderer.adapter.setBackgroundColor(theme.skyColor);
        lastApplied = theme.skyColor;
      }
    } catch {
      // best-effort
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * S201 — start a project-local rAF poller that watches the active
 * arena theme and pushes its atmospheric extras to the renderer:
 * (1) FogExp2 colour + density (`adapter.setSceneFog`);
 * (2) tonemap exposure scalar (`adapter.setToneMappingExposure`).
 *
 * URL flag `?fog=off` clears scene fog regardless of theme (useful
 * for screenshots + bot-vs-bot regression tests where distance haze
 * is undesirable).
 */
export function startArenaAtmosphericApplyPoller(runtime: {
  snapshot(): { entities: ReadonlyArray<{ id: string; components: Record<string, unknown> }> };
  renderer: {
    adapter: {
      setSceneFog(hex: string, density: number): void;
      setToneMappingExposure(exposure: number): void;
    };
  };
}): void {
  if (typeof requestAnimationFrame === "undefined") return;
  const fogDisabled = readFogDisabledFromUrl();
  let lastFogColor: string | undefined;
  let lastFogDensity: number | undefined;
  let lastExposure: number | undefined;
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const game = snap.entities.find((e) => e.id === KABOOM_GAME_STATE_ID);
      const comp = game?.components[ARENA_THEME_COMPONENT] as
        | ArenaThemeComponent
        | undefined;
      const theme = resolveArenaTheme(comp?.themeKey);
      const effectiveDensity = fogDisabled ? 0 : theme.fogDensity;
      if (theme.fogColor !== lastFogColor || effectiveDensity !== lastFogDensity) {
        runtime.renderer.adapter.setSceneFog(theme.fogColor, effectiveDensity);
        lastFogColor = theme.fogColor;
        lastFogDensity = effectiveDensity;
      }
      if (theme.tonemapExposure !== lastExposure) {
        runtime.renderer.adapter.setToneMappingExposure(theme.tonemapExposure);
        lastExposure = theme.tonemapExposure;
      }
    } catch {
      // best-effort
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function readFogDisabledFromUrl(): boolean {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return false;
  try {
    return new URLSearchParams(search).get("fog") === "off";
  } catch {
    return false;
  }
}

/**
 * S190 — start a project-local rAF poller that watches the active
 * arena theme and pushes its lighting tint onto light.sun (directional)
 * and light.ambient (ambient) via runtime.applyCommands. Re-uses the
 * existing engine light-lifecycle-system as the application path — the
 * poller just stamps the Light component's `color` field, the system
 * propagates it to the underlying Three.js light next tick.
 *
 * Idempotent — only emits commands when the resolved themeKey changes.
 */
export function startArenaLightApplyPoller(runtime: {
  snapshot(): { entities: ReadonlyArray<{ id: string; components: Record<string, unknown> }> };
  applyCommands(commands: ReadonlyArray<unknown>): void;
}): void {
  if (typeof requestAnimationFrame === "undefined") return;
  let lastApplied: string | undefined;
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const game = snap.entities.find((e) => e.id === KABOOM_GAME_STATE_ID);
      const comp = game?.components[ARENA_THEME_COMPONENT] as
        | ArenaThemeComponent
        | undefined;
      const theme = resolveArenaTheme(comp?.themeKey);
      if (theme.key === lastApplied) {
        requestAnimationFrame(tick);
        return;
      }
      const sun = snap.entities.find((e) => e.id === "light.sun");
      const sunLight = sun?.components["Light"] as { color?: string; intensity?: number } | undefined;
      const ambient = snap.entities.find((e) => e.id === "light.ambient");
      const ambientLight = ambient?.components["Light"] as { color?: string; intensity?: number } | undefined;
      const commands: unknown[] = [];
      if (sunLight !== undefined) {
        commands.push({
          kind: "component.set",
          entityId: "light.sun",
          component: "Light",
          data: { ...sunLight, color: tintToHex(theme.directionalLightTint) }
        });
      }
      if (ambientLight !== undefined) {
        commands.push({
          kind: "component.set",
          entityId: "light.ambient",
          component: "Light",
          data: { ...ambientLight, color: theme.ambientHemisphericSky }
        });
      }
      if (commands.length > 0) runtime.applyCommands(commands);
      lastApplied = theme.key;
    } catch {
      // best-effort
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Convert a directionalLightTint (r/g/b in [0,1]) to a #rrggbb hex
 *  string by treating it as a multiplier against pure white. */
export function tintToHex(tint: { r: number; g: number; b: number }): string {
  const c = (v: number): string => {
    const clamped = Math.max(0, Math.min(1, v));
    return Math.round(clamped * 255).toString(16).padStart(2, "0");
  };
  return "#" + c(tint.r) + c(tint.g) + c(tint.b);
}

/**
 * Read the active arena theme key from the kaboom.game-state singleton.
 * Returns "warehouse" when the entity / component / key is missing.
 */
export function readActiveThemeKey(world: World): ArenaThemeKey {
  if (!world.hasEntity(KABOOM_GAME_STATE_ID)) return DEFAULT_THEME_KEY;
  const comp = world.getComponent<ArenaThemeComponent>(
    KABOOM_GAME_STATE_ID,
    ARENA_THEME_COMPONENT
  );
  const raw = comp?.themeKey;
  return isArenaThemeKey(raw) ? raw : DEFAULT_THEME_KEY;
}

/**
 * Create the arena-theme apply system. Registers on the scheduler in
 * the static + connected profiles. Runs in fixedUpdate so its writes
 * settle before the mesh-render pass sees the floor entity.
 *
 * Cached-world swap: scene.load (restart, map switch) creates a fresh
 * World instance; the system re-applies on the first tick against the
 * new world. Within a single world it applies exactly once.
 */
export function createArenaThemeApplySystem(
  options: ArenaThemeApplySystemOptions = {}
): System {
  const name = options.name ?? "kaboom.arena-theme-apply";
  let cachedWorld: World | undefined;
  let appliedThisWorld = false;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      cachedWorld = world;
      appliedThisWorld = false;
    }
    if (appliedThisWorld) return;
    const themeKey = readActiveThemeKey(world);
    const theme = resolveArenaTheme(themeKey);
    applyArenaThemeToWorld(world, theme);
    appliedThisWorld = true;
  };

  return { name, fixedUpdate };
}
