import type { System, SystemContext } from "./types";

export class SystemScheduler {
  private readonly order: System[] = [];
  private readonly index = new Map<string, number>();

  register(system: System): void {
    if (this.index.has(system.name)) {
      throw new Error(`System "${system.name}" is already registered.`);
    }
    this.index.set(system.name, this.order.length);
    this.order.push(system);
  }

  unregister(name: string): void {
    const position = this.index.get(name);
    if (position === undefined) {
      return;
    }
    this.order.splice(position, 1);
    this.index.delete(name);
    for (let i = position; i < this.order.length; i += 1) {
      const remaining = this.order[i];
      if (remaining !== undefined) {
        this.index.set(remaining.name, i);
      }
    }
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

  runFixedStep(context: SystemContext): void {
    for (const system of this.order) {
      if (system.fixedUpdate !== undefined) {
        system.fixedUpdate(context);
      }
    }
  }

  runFrame(context: SystemContext): void {
    for (const system of this.order) {
      if (system.frameUpdate !== undefined) {
        system.frameUpdate(context);
      }
    }
  }
}
