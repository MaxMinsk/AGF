# TypeScript Best Practices

Sprint 0 note. Focus: strict, agent-friendly TypeScript.

## Baseline Compiler Options

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client"]
  }
}
```

## Rules We Will Follow

- External data enters as `unknown`.
- Scene, material, shader and protocol data must pass runtime validation.
- Avoid `any`; prefer `unknown` plus narrowing.
- Prefer ESM imports/exports.
- Public APIs are explicit and small.
- Systems should be easy to unit test without DOM or renderer setup.
- Avoid global mutable singletons for gameplay state.
- Use discriminated unions for command and diagnostic types.

## Component Pattern

Components should be data contracts:

```ts
type Transform = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
};
```

Authorable component data must have a schema counterpart.

## Open Questions

- Use Ajv-generated validators or Zod-first schemas for Sprint 1.
- Whether JSONC is accepted in project files or only strict JSON.
- Type generation path from JSON Schema.

## Sources

- TypeScript `strict`: https://www.typescriptlang.org/tsconfig/strict.html
- TypeScript `noUncheckedIndexedAccess`: https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html
- TypeScript modules: https://www.typescriptlang.org/docs/handbook/modules/theory.html
- TypeScript do's and don'ts: https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html

