// Contract between the root demo app (`src/app.ts`) and project-specific
// modules under `examples/<id>/bootstrap.ts`. Anything Beacon-World-shaped
// (system registration, HUD mount, keyboard handlers, multiplayer hints)
// lives behind this interface, so `src/app.ts` does not import from any
// example folder.

import type { SystemScheduler } from "../core/systems/scheduler";
import type { RuntimeHandle } from "./start";
import type { WsNetworkAdapterHandle } from "./network/ws-network-adapter";

export type ProjectBootstrapContext = {
  scheduler: SystemScheduler;
  /** Player id resolved at app boot — stable across system construction. */
  playerId: string;
  /** True when `?server=...&networked=1` activated the WS path. */
  networked: boolean;
  /** Late-bound — the network adapter is created after `registerSystems`. */
  getNetwork: () => WsNetworkAdapterHandle | undefined;
};

export type ProjectUiContext = {
  shell: HTMLElement;
  runtime: RuntimeHandle;
  playerId: string;
  networked: boolean;
};

export type ProjectUiHandle = {
  dispose(): void;
};

export type ProjectConnectivityHintInput = {
  serverUrl: string | undefined;
  playerId: string | undefined;
  networked: boolean;
};

export type ProjectBootstrap = {
  /**
   * Called before `startRuntime`. Project-specific systems register here so
   * they are available the moment the world starts ticking.
   */
  registerSystems(context: ProjectBootstrapContext): void;
  /**
   * Optional. Called after `startRuntime` succeeds. Mount HUDs, keyboard
   * handlers, or any DOM that needs the live runtime. Returned `dispose` is
   * invoked on app teardown.
   */
  attachUi?(context: ProjectUiContext): ProjectUiHandle;
  /**
   * Optional. Implement to handle the global "restart round" gesture. The
   * root app binds `KeyR` and calls this. Return the number of world
   * mutations applied (`0` for no-op projects).
   */
  resetRound?(runtime: RuntimeHandle): number;
  /**
   * Optional HTML fragment appended to the dev status panel. Used by Beacon
   * World to surface the `Play multiplayer` hint / connection state.
   */
  renderConnectivityHint?(input: ProjectConnectivityHintInput): string;
};
