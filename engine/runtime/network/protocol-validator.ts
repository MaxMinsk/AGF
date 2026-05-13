// Browser-side AJV validator for `schemas/protocol.schema.json`.
//
// The protocol schema is imported as a static JSON module so Vite bundles it
// with the dev / production runtime. AJV is already a project dependency
// (used by `engine check`). The compiled validator is cached at module scope
// so creating multiple adapters does not re-compile the schema.

import Ajv, { type ValidateFunction } from "ajv";
import protocolSchema from "../../../schemas/protocol.schema.json";

export type ProtocolValidator = (message: unknown) => true | string;

let cached: ValidateFunction | undefined;

function getCompiled(): ValidateFunction {
  if (cached === undefined) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    cached = ajv.compile(protocolSchema as object);
  }
  return cached;
}

/**
 * Returns a validator that, given a parsed JSON message, returns `true` when
 * the message conforms to the protocol schema, or a human-readable error
 * string suitable for logging when it does not.
 */
export function createProtocolValidator(): ProtocolValidator {
  const validate = getCompiled();
  return (message) => {
    if (validate(message)) {
      return true;
    }
    const errors = validate.errors ?? [];
    if (errors.length === 0) {
      return "unknown validation error";
    }
    return errors
      .map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`.trim())
      .join("; ");
  };
}
