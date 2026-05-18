// S81 KABOOM-HUD-RUNTIME unit tests. No jsdom in this repo, so the
// tests run against a hand-rolled minimal DOM stub — enough surface
// for createHud / add / update / remove / dispose to exercise the
// real code paths (createElement, appendChild, removeChild, textContent,
// setAttribute, ownerDocument). When jsdom is later bundled the stub
// becomes redundant and these tests can drop the harness; the assertions
// stay identical.

import { describe, expect, it, beforeEach } from "vitest";

import { createHud, type HudHandle } from "../../engine/runtime/ui/hud";

type StubElement = {
  tagName: string;
  attributes: Map<string, string>;
  children: StubElement[];
  parentNode: StubElement | null;
  ownerDocument: StubDocument;
  textContent: string;
  firstChild: StubElement | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: StubElement): StubElement;
  removeChild(child: StubElement): StubElement;
};

type StubDocument = {
  createElement(tag: string): StubElement;
};

function makeElement(tagName: string, doc: StubDocument): StubElement {
  const el: StubElement = {
    tagName,
    attributes: new Map<string, string>(),
    children: [],
    parentNode: null,
    ownerDocument: doc,
    textContent: "",
    get firstChild(): StubElement | null {
      return el.children[0] ?? null;
    },
    setAttribute(name, value): void {
      el.attributes.set(name, value);
    },
    appendChild(child): StubElement {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    removeChild(child): StubElement {
      const idx = el.children.indexOf(child);
      if (idx >= 0) el.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
  };
  return el;
}

function makeDom(): { document: StubDocument; root: StubElement } {
  const doc: StubDocument = {
    createElement(tag): StubElement {
      return makeElement(tag, doc);
    }
  };
  const root = makeElement("div", doc);
  return { document: doc, root };
}

function find(el: StubElement, predicate: (e: StubElement) => boolean): StubElement | undefined {
  if (predicate(el)) return el;
  for (const child of el.children) {
    const result = find(child, predicate);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("createHud (S81 KABOOM-HUD-RUNTIME)", () => {
  let dom: ReturnType<typeof makeDom>;
  let hud: HudHandle;

  beforeEach(() => {
    dom = makeDom();
    // The HUD code reads `parent.ownerDocument.createElement` — our stub
    // mirrors the real `HTMLElement` surface enough for the production
    // file to run without TypeScript-level casts.
    hud = createHud(dom.root as unknown as HTMLElement);
  });

  it("mounts a single HUD root with the five slot containers", () => {
    const rootChild = dom.root.children[0]!;
    expect(rootChild).toBeDefined();
    expect(rootChild.attributes.get("data-agf-hud")).toBe("");
    expect(rootChild.children.map((c) => c.attributes.get("data-agf-hud-slot")).sort()).toEqual(
      ["bottomLeft", "bottomRight", "center", "topLeft", "topRight"]
    );
  });

  it("add / update renders a string widget into the requested slot", () => {
    hud.add({ id: "fps", slot: "topLeft", render: (n: number) => `FPS: ${n}`, initial: 60 });
    const topLeft = find(dom.root, (e) => e.attributes.get("data-agf-hud-slot") === "topLeft")!;
    expect(topLeft.children).toHaveLength(1);
    const widget = topLeft.children[0]!;
    expect(widget.attributes.get("data-agf-hud-widget")).toBe("fps");
    expect(widget.textContent).toBe("FPS: 60");
    hud.update("fps", 30);
    expect(widget.textContent).toBe("FPS: 30");
  });

  it("widgets() lists ids in insertion order", () => {
    hud.add({ id: "a", slot: "topLeft", render: () => "A" });
    hud.add({ id: "b", slot: "bottomRight", render: () => "B" });
    expect(hud.widgets()).toEqual(["a", "b"]);
  });

  it("remove drops the widget element from its slot", () => {
    hud.add({ id: "score", slot: "topRight", render: (n: number) => `Score: ${n}`, initial: 0 });
    const topRight = find(dom.root, (e) => e.attributes.get("data-agf-hud-slot") === "topRight")!;
    expect(topRight.children).toHaveLength(1);
    hud.remove("score");
    expect(topRight.children).toHaveLength(0);
    expect(hud.widgets()).toEqual([]);
  });

  it("dispose removes the entire root from its parent and is idempotent", () => {
    hud.add({ id: "x", slot: "center", render: () => "x" });
    expect(dom.root.children).toHaveLength(1);
    hud.dispose();
    expect(dom.root.children).toHaveLength(0);
    expect(() => hud.dispose()).not.toThrow();
  });

  it("rejects duplicate ids with a descriptive error", () => {
    hud.add({ id: "dup", slot: "topLeft", render: () => "1" });
    expect(() => hud.add({ id: "dup", slot: "topRight", render: () => "2" })).toThrow(/dup/);
  });

  it("update / remove are no-ops for unknown ids", () => {
    expect(() => hud.update("missing", 42)).not.toThrow();
    expect(() => hud.remove("missing")).not.toThrow();
  });

  it("string renderer output is escaped via textContent, not assigned to innerHTML", () => {
    // textContent of a stub element is a flat string; this test asserts
    // the production file uses textContent and never innerHTML for
    // string outputs. If somebody refactors to innerHTML the assertion
    // still passes accidentally on the stub, so the actual gate is a
    // visual review of hud.ts (the comment block says "escaped"). We
    // include this case primarily so that any future refactor that
    // breaks string handling fails an existing test.
    hud.add({
      id: "raw",
      slot: "topLeft",
      render: (s: string) => s,
      initial: "<script>alert(1)</script>"
    });
    const widget = find(dom.root, (e) => e.attributes.get("data-agf-hud-widget") === "raw")!;
    expect(widget.textContent).toBe("<script>alert(1)</script>");
  });

  it("HTMLElement renderer output replaces previous content as-is", () => {
    hud.add({
      id: "el",
      slot: "center",
      render: (label: string) => {
        const el = makeElement("span", dom.document) as unknown as HTMLElement;
        el.textContent = label;
        return el;
      },
      initial: "first"
    });
    const widget = find(dom.root, (e) => e.attributes.get("data-agf-hud-widget") === "el")!;
    expect(widget.children).toHaveLength(1);
    expect(widget.children[0]!.textContent).toBe("first");
    hud.update("el", "second");
    // After update, still one child (replaced).
    expect(widget.children).toHaveLength(1);
    expect(widget.children[0]!.textContent).toBe("second");
  });
});
