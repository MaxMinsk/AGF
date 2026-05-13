import { describe, expect, it } from "vitest";
import {
  createDiagnosticsBus,
  type RuntimeDiagnostic
} from "../../engine/runtime/diagnostics/diagnostics-bus";

describe("DiagnosticsBus", () => {
  it("assigns monotonic ids and timestamps from the injected clock", () => {
    let now = 10;
    const bus = createDiagnosticsBus({ nowSeconds: () => now });

    const a = bus.emit({ severity: "warning", code: "X", source: "test", message: "a" });
    now = 11;
    const b = bus.emit({ severity: "error", code: "Y", source: "test", message: "b" });

    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.emittedAtSeconds).toBe(10);
    expect(b.emittedAtSeconds).toBe(11);
  });

  it("snapshot returns the retained list in emission order", () => {
    const bus = createDiagnosticsBus({ nowSeconds: () => 0 });
    bus.emit({ severity: "info", code: "A", source: "src", message: "first" });
    bus.emit({ severity: "warning", code: "A", source: "src", message: "second" });

    const items = bus.snapshot();
    expect(items.map((d: RuntimeDiagnostic) => d.message)).toEqual(["first", "second"]);
  });

  it("clear() empties the snapshot but keeps subscribers alive", () => {
    const bus = createDiagnosticsBus({ nowSeconds: () => 0 });
    const seen: string[] = [];
    bus.subscribe((d) => seen.push(d.message));

    bus.emit({ severity: "info", code: "A", source: "src", message: "first" });
    bus.clear();
    expect(bus.snapshot()).toEqual([]);
    bus.emit({ severity: "info", code: "A", source: "src", message: "second" });
    expect(seen).toEqual(["first", "second"]);
  });

  it("rolls older diagnostics off a fixed-size ring buffer", () => {
    const bus = createDiagnosticsBus({ retain: 3, nowSeconds: () => 0 });
    for (let i = 0; i < 5; i += 1) {
      bus.emit({ severity: "info", code: "A", source: "src", message: `m${i}` });
    }
    expect(bus.snapshot().map((d) => d.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("subscribe returns a disposer", () => {
    const bus = createDiagnosticsBus({ nowSeconds: () => 0 });
    const seen: string[] = [];
    const dispose = bus.subscribe((d) => seen.push(d.message));

    bus.emit({ severity: "info", code: "A", source: "src", message: "a" });
    dispose();
    bus.emit({ severity: "info", code: "A", source: "src", message: "b" });

    expect(seen).toEqual(["a"]);
  });

  it("propagates optional context fields verbatim", () => {
    const bus = createDiagnosticsBus({ nowSeconds: () => 0 });
    const out = bus.emit({
      severity: "error",
      code: "X",
      source: "src",
      message: "boom",
      entityId: "core.north",
      component: "MeshRenderer",
      assetRef: "runtime/models/core.glb",
      details: { reason: "fetch failed", status: 404 }
    });

    expect(out.entityId).toBe("core.north");
    expect(out.component).toBe("MeshRenderer");
    expect(out.assetRef).toBe("runtime/models/core.glb");
    expect(out.details).toEqual({ reason: "fetch failed", status: 404 });
  });

  it("isolates a misbehaving listener so the bus keeps delivering to others", () => {
    const bus = createDiagnosticsBus({ nowSeconds: () => 0 });
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error("rude");
    });
    bus.subscribe((d) => seen.push(d.message));

    expect(() => bus.emit({ severity: "info", code: "A", source: "src", message: "hello" })).not.toThrow();
    expect(seen).toEqual(["hello"]);
  });
});
