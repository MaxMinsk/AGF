import { describe, expect, it } from "vitest";
import {
  ALL_DIAGNOSTIC_CODES,
  DIAGNOSTIC_CODES,
  type DiagnosticCode
} from "../../engine/tools/check/diagnostic-codes";

describe("DIAGNOSTIC_CODES", () => {
  it("exposes every known engine check code as a typed string constant", () => {
    const expected: ReadonlyArray<string> = [
      "AGF_FILE_MISSING",
      "AGF_JSON_PARSE_FAILED",
      "AGF_PROJECT_START_SCENE_MISSING",
      "AGF_PROJECT_ASSET_ROOT_MISSING",
      "AGF_ASSET_SOURCES_MISSING",
      "AGF_ASSET_RUNTIME_UNDECLARED",
      "AGF_ASSET_SOURCE_RUNTIME_MISSING",
      "AGF_ASSET_REFERENCE_INVALID",
      "AGF_ASSET_REFERENCE_MISSING",
      "AGF_SCENE_DUPLICATE_ENTITY_ID",
      "AGF_SCHEMA_UNKNOWN_COMPONENT",
      "AGF_SCHEMA_UNKNOWN_PROPERTY",
      "AGF_SCHEMA_REQUIRED_PROPERTY",
      "AGF_SCHEMA_VALIDATION_FAILED",
      "AGF_FORMAT_VERSION_MISSING",
      "AGF_FORMAT_VERSION_TOO_OLD",
      "AGF_FORMAT_VERSION_UNSUPPORTED"
    ];
    expect([...ALL_DIAGNOSTIC_CODES].sort()).toEqual([...expected].sort());
    for (const code of expected) {
      expect(DIAGNOSTIC_CODES[code as keyof typeof DIAGNOSTIC_CODES]).toBe(code);
    }
  });

  it("DiagnosticCode type narrows to a known code at compile time", () => {
    const code: DiagnosticCode = DIAGNOSTIC_CODES.AGF_ASSET_RUNTIME_UNDECLARED;
    expect(code).toBe("AGF_ASSET_RUNTIME_UNDECLARED");
  });
});
