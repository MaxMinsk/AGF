import { describe, expect, it } from "vitest";
import { SystemScheduler } from "../../engine/core/systems/scheduler";
import type { System, SystemContext } from "../../engine/core/systems/types";
import { World } from "../../engine/core/ecs/world";
import type { TimeContext } from "../../engine/core/loop/types";

function makeContext(): SystemContext {
  const time: TimeContext = {
    elapsed: 0,
    dt: 1 / 60,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  return { time, world: new World() };
}

function recordingSystem(name: string, log: string[]): System {
  return {
    name,
    fixedUpdate(): void {
      log.push(name);
    }
  };
}

describe("SystemScheduler", () => {
  it("registers and runs systems in registration order", () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];

    scheduler.register(recordingSystem("a", log));
    scheduler.register(recordingSystem("b", log));
    scheduler.register(recordingSystem("c", log));
    scheduler.runFixedStep(makeContext());

    expect(log).toEqual(["a", "b", "c"]);
    expect(scheduler.systemNames()).toEqual(["a", "b", "c"]);
    expect(scheduler.size()).toBe(3);
  });

  it("rejects duplicate system names", () => {
    const scheduler = new SystemScheduler();
    scheduler.register({ name: "movement" });

    expect(() => scheduler.register({ name: "movement" })).toThrow(/already registered/);
  });

  it("skips systems without a fixedUpdate hook", () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];

    scheduler.register({ name: "no-op" });
    scheduler.register(recordingSystem("hit", log));
    scheduler.runFixedStep(makeContext());

    expect(log).toEqual(["hit"]);
  });

  it("unregisters a system and re-indexes remaining ones", () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];
    scheduler.register(recordingSystem("a", log));
    scheduler.register(recordingSystem("b", log));
    scheduler.register(recordingSystem("c", log));

    scheduler.unregister("b");

    expect(scheduler.has("b")).toBe(false);
    expect(scheduler.systemNames()).toEqual(["a", "c"]);

    scheduler.runFixedStep(makeContext());
    expect(log).toEqual(["a", "c"]);

    scheduler.register(recordingSystem("b", log));
    expect(scheduler.systemNames()).toEqual(["a", "c", "b"]);
  });

  it("unregister on an unknown name is a no-op", () => {
    const scheduler = new SystemScheduler();
    scheduler.register({ name: "only" });

    expect(() => scheduler.unregister("missing")).not.toThrow();
    expect(scheduler.systemNames()).toEqual(["only"]);
  });

  it("runs frame-update hooks in registration order", () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];

    scheduler.register({
      name: "input",
      frameUpdate(): void {
        log.push("input");
      }
    });
    scheduler.register({
      name: "spin",
      fixedUpdate(): void {
        log.push("spin-fixed");
      }
    });
    scheduler.register({
      name: "camera",
      frameUpdate(): void {
        log.push("camera");
      }
    });

    scheduler.runFixedStep(makeContext());
    scheduler.runFrame(makeContext());

    expect(log).toEqual(["spin-fixed", "input", "camera"]);
  });

  it("passes a consistent context to each system", () => {
    const scheduler = new SystemScheduler();
    const seen: SystemContext[] = [];
    scheduler.register({
      name: "snapshot",
      fixedUpdate(context): void {
        seen.push(context);
      }
    });

    const context = makeContext();
    scheduler.runFixedStep(context);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(context);
  });
});
