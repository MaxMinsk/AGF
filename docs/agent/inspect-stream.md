# `engine inspect --watch --json` Stream

A small but stable wire contract: `engine inspect` in watch + json mode emits one **line-delimited JSON object** (NDJSON / JSON Lines) per refresh on `stdout`. Status / log lines go to `stderr`. Agents can `tail -f` the stream or pipe it through a parser without re-running the tool.

## Invocation

```bash
npm run engine:inspect -- <projectDir> --watch --json [other flags]
```

`--watch` is required for the streaming behaviour. Without it, `--json` keeps its existing pretty-printed one-shot shape.

All other inspect flags (`--component`, `--query`, `--entity`, `--tail`, `--exclude-component`, `--components-only`, `--save`) compose with `--watch --json` the same way they compose with the one-shot form.

## Line shape

Each line is a JSON object matching `InspectResult` (from `engine/tools/inspect/project-inspect.ts`):

```jsonc
{
  "ok": boolean,
  "projectDir": string,
  "diagnostics": Diagnostic[],
  "filter": { "components": string[], "entityIds": string[] } | undefined,
  "project": {
    "id": string,
    "name": string,
    "startScene": string,
    "assetRoot": string,
    "profiles": string[]
  } | undefined,
  "scene": {
    "id": string,
    "entityCount": number,
    "matchedEntityCount": number,
    "entities": Array<{
      "id": string,
      "order": number,
      "componentNames": string[],
      "components": Record<string, unknown>
    }>
  } | undefined
}
```

`Diagnostic` is the same shape as `engine check --json`:

```jsonc
{
  "severity": "error" | "warning",
  "code": string,             // see "Stable diagnostic codes" below
  "file": string,
  "path": string,             // JSONPath into the offending file
  "message": string,
  "suggestion": string?       // optional human-friendly fix hint
}
```

## Stream framing

- **One object per line.** Lines end with `\n`. Whitespace inside a line is allowed (it's the result of `JSON.stringify(payload)`).
- **No event delimiters.** A consumer should split on `\n`, parse each non-empty line, and ignore parse errors that point at lines starting with non-JSON characters (the stream is `stdout`-only; status logs from the tool always go to `stderr`).
- **No back-pressure semantics.** The watcher debounces filesystem events at ~120 ms; consumers should expect bursts of refreshes within that window to collapse into one line.
- **Process exit.** SIGINT / SIGTERM stop the stream cleanly. There is no terminator line — consumers should treat EOF on `stdout` as end-of-stream.

## Stable diagnostic codes

The `code` field is part of the wire contract. Current values are exported as the `DiagnosticCode` TypeScript enum from `engine/tools/check/diagnostic-codes.ts`. Treat unknown codes as forward-compatible additions.

## Example

Pipe the stream through `jq` to extract the entity count after every refresh:

```bash
npm run engine:inspect -- examples/beacon-world --watch --json \
  | jq -r '"\(.scene.entityCount) entities"'
```

Or watch for any warning the moment it appears:

```bash
npm run engine:inspect -- examples/beacon-world --watch --json \
  | jq -r '.diagnostics[]? | select(.severity=="warning") | "\(.code) \(.file) \(.message)"'
```
