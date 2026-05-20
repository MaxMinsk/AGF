// S100 KABOOM-BOT-PERSONALITY-VARIANTS — URL parser + behavior.

import { describe, expect, it } from "vitest";

import { readBotPersonalityFromUrl, isBotPersonality } from "../../src/difficulty";

describe("readBotPersonalityFromUrl (S100 KABOOM-BOT-PERSONALITY-VARIANTS)", () => {
  it("defaults to 'hunter' when no search param is supplied", () => {
    expect(readBotPersonalityFromUrl(undefined)).toBe("hunter");
    expect(readBotPersonalityFromUrl("")).toBe("hunter");
  });

  it("parses each canonical value", () => {
    expect(readBotPersonalityFromUrl("?botPersonality=hunter")).toBe("hunter");
    expect(readBotPersonalityFromUrl("?botPersonality=coward")).toBe("coward");
    expect(readBotPersonalityFromUrl("?botPersonality=miner")).toBe("miner");
  });

  it("falls back to 'hunter' on unknown values", () => {
    expect(readBotPersonalityFromUrl("?botPersonality=ninja")).toBe("hunter");
    expect(readBotPersonalityFromUrl("?botPersonality=")).toBe("hunter");
  });

  it("survives multi-param search strings", () => {
    expect(readBotPersonalityFromUrl("?difficulty=hard&botPersonality=miner")).toBe("miner");
    expect(readBotPersonalityFromUrl("?botPersonality=coward&map=wide")).toBe("coward");
  });

  it("isBotPersonality narrows correctly", () => {
    expect(isBotPersonality("hunter")).toBe(true);
    expect(isBotPersonality("coward")).toBe(true);
    expect(isBotPersonality("miner")).toBe(true);
    expect(isBotPersonality("ninja")).toBe(false);
    expect(isBotPersonality("")).toBe(false);
  });
});
