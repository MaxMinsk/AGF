import type { System, SystemContext } from "./types";
import type { DiagnosticsBus } from "../../runtime/diagnostics/diagnostics-bus";

export type SystemRegistrationOptions = {
  /**
   * Active-profile filter. The system registers only if at least one profile
   * in this list is also in the scheduler's active set. Omit to always
   * register.
   */
  profiles?: ReadonlyArray<string>;
};

export type SystemSchedulerOptions = {
  /** Profile names that systems can opt into. Defaults to an empty set. */
  activeProfiles?: ReadonlyArray<string>;
  /**
   * Optional diagnostics bus for AGF-LOG-LIFECYCLE-TRACES — emits
   * `AGF_SCHEDULER_SYSTEM_REGISTERED` / `_DEREGISTERED` info events when
   * supplied. Stays optional so unit tests can use the scheduler
   * without wiring a bus.
   */
  diagnostics?: DiagnosticsBus;
};

export class SystemScheduler {
  private readonly order: System[] = [];
  private readonly index = new Map<string, number>();
  private readonly activeProfiles: ReadonlySet<string>;
  private readonly diagnostics: DiagnosticsBus | undefined;
  // S89 AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE. Systems whose per-tick
  // `AGF_SYSTEM_TICK` info trace is currently enabled. Empty by
  // default; toggled via setDebugSystem(name, enabled).
  private readonly debugSystems = new Set<string>();

  constructor(options: SystemSchedulerOptions = {}) {
    this.activeProfiles = new Set(options.activeProfiles ?? []);
    this.diagnostics = options.diagnostics;
  }

  /**
   * Register a system. With `options.profiles` set, registration is skipped
   * unless at least one of those profiles is in the active set; the call still
   * succeeds quietly so callers don't have to branch.
   */
  register(system: System, options: SystemRegistrationOptions = {}): boolean {
    if (options.profiles !== undefined) {
      const matchesAny = options.profiles.some((profile) => this.activeProfiles.has(profile));
      if (!matchesAny) {
        return false;
      }
    }
    if (this.index.has(system.name)) {
      throw new Error(`System "${system.name}" is already registered.`);
    }
    this.index.set(system.name, this.order.length);
    this.order.push(system);
    this.diagnostics?.emit({
      severity: "info",
      code: "AGF_SCHEDULER_SYSTEM_REGISTERED",
      source: "scheduler",
      message: `system "${system.name}" registered`,
      details: { name: system.name, total: this.order.length }
    });
    return true;
  }

  /** Returns the active-profile set (test/diagnostics helper). */
  getActiveProfiles(): ReadonlySet<string> {
    return this.activeProfiles;
  }

  unregister(name: string): void {
    const position = this.index.get(name);
    if (position === undefined) {
      return;
    }
    this.order.splice(position, 1);
    this.index.delete(name);
    this.debugSystems.delete(name);
    for (let i = position; i < this.order.length; i += 1) {
      const remaining = this.order[i];
      if (remaining !== undefined) {
        this.index.set(remaining.name, i);
      }
    }
    this.diagnostics?.emit({
      severity: "info",
      code: "AGF_SCHEDULER_SYSTEM_DEREGISTERED",
      source: "scheduler",
      message: `system "${name}" deregistered`,
      details: { name, total: this.order.length }
    });
  }

  has(name: string): boolean {
    return this.index.has(name);
  }

  systemNames(): string[] {
    return this.order.map((system) => system.name);
  }

  size(): number {
    return this.order.length;
  }

  /**
   * S89 AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE. Flip per-tick debug emission
   * for a registered system. Returns true when the toggle landed,
   * false when the name doesn't match a registered system. Disabled
   * systems are scrubbed on unregister so a stale toggle never fires.
   */
  setDebugSystem(name: string, enabled: boolean): boolean {
    if (!this.index.has(name)) return false;
    if (enabled) this.debugSystems.add(name);
    else this.debugSystems.delete(name);
    return true;
  }

  /** S89 AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE. Inspect the live toggle set (for tests + doctor). */
  debugSystemNames(): ReadonlyArray<string> {
    return [...this.debugSystems];
  }

  runFixedStep(context: SystemContext): void {
    for (const system of this.order) {
      if (system.fixedUpdate !== undefined) {
        system.fixedUpdate(context);
      }
      if (this.debugSystems.has(system.name) && this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "info",
          code: "AGF_SYSTEM_TICK",
          source: "scheduler",
          message: `system "${system.name}" tick`,
          details: { name: system.name, tick: context.time.fixedStepCount, phase: "fixed" }
        });
      }
    }
  }

  runFrame(context: SystemContext): void {
    for (const system of this.order) {
      if (system.frameUpdate !== undefined) {
        system.frameUpdate(context);
      }
      if (this.debugSystems.has(system.name) && this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "info",
          code: "AGF_SYSTEM_TICK",
          source: "scheduler",
          message: `system "${system.name}" tick`,
          details: { name: system.name, tick: context.time.frameCount, phase: "frame" }
        });
      }
    }
  }
}
