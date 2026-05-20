// S091 AGF-RENDER-DEBUG-OVERLAY-HUD — verifies the pill mounts on
// non-off modes, updates on mode change, and unmounts on 'off'.
// Uses the same hand-rolled DOM stub the hud.test.ts already proves out
// (no jsdom in this repo).

import { describe, expect, it, beforeEach } from "vitest";

import { createHud, type HudHandle } from "../../engine/runtime/ui/hud";
import {
  RENDER_DEBUG_PILL_WIDGET_ID,
  syncRenderDebugPill
} from "../../engine/runtime/ui/render-debug-pill";

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

describe("syncRenderDebugPill (S091 AGF-RENDER-DEBUG-OVERLAY-HUD)", () => {
  let dom: ReturnType<typeof makeDom>;
  let hud: HudHandle;

  beforeEach(() => {
    dom = makeDom();
    hud = createHud(dom.root as unknown as HTMLElement);
  });

  it("starts un-mounted when mode is 'off'", () => {
    syncRenderDebugPill(hud, "off");
    expect(hud.widgets()).not.toContain(RENDER_DEBUG_PILL_WIDGET_ID);
  });

  it("mounts a topRight pill with 'DEBUG: <mode>' when mode flips on", () => {
    syncRenderDebugPill(hud, "wireframe");
    expect(hud.widgets()).toContain(RENDER_DEBUG_PILL_WIDGET_ID);
    const pill = find(
      dom.root,
      (e) => e.attributes.get("data-agf-hud-widget") === RENDER_DEBUG_PILL_WIDGET_ID
    );
    expect(pill).toBeDefined();
    expect(pill?.textContent).toBe("DEBUG: wireframe");
    expect(pill?.parentNode?.attributes.get("data-agf-hud-slot")).toBe("topRight");
  });

  it("updates the label when the mode changes while mounted", () => {
    syncRenderDebugPill(hud, "wireframe");
    syncRenderDebugPill(hud, "normals");
    const pill = find(
      dom.root,
      (e) => e.attributes.get("data-agf-hud-widget") === RENDER_DEBUG_PILL_WIDGET_ID
    );
    expect(pill?.textContent).toBe("DEBUG: normals");
    expect(hud.widgets().filter((w) => w === RENDER_DEBUG_PILL_WIDGET_ID).length).toBe(1);
  });

  it("unmounts when flipped back to 'off'", () => {
    syncRenderDebugPill(hud, "uv");
    expect(hud.widgets()).toContain(RENDER_DEBUG_PILL_WIDGET_ID);
    syncRenderDebugPill(hud, "off");
    expect(hud.widgets()).not.toContain(RENDER_DEBUG_PILL_WIDGET_ID);
    expect(
      find(dom.root, (e) => e.attributes.get("data-agf-hud-widget") === RENDER_DEBUG_PILL_WIDGET_ID)
    ).toBeUndefined();
  });

  it("toggling off→off is a no-op", () => {
    syncRenderDebugPill(hud, "off");
    syncRenderDebugPill(hud, "off");
    expect(hud.widgets()).not.toContain(RENDER_DEBUG_PILL_WIDGET_ID);
  });
});
