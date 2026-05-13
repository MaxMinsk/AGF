# Dotnet World Server (skeleton)

C#/.NET reference backend stub. **No network transport yet.** Mirrors the Node skeleton's smoke-test contract: load `schemas/protocol.schema.json` (existence check), parse a small set of representative protocol messages with `System.Text.Json`, exit cleanly.

## Run

From the repo root:

```bash
dotnet run --project examples/backends/dotnet-world-server/GameServer.csproj
```

Expected output:

```
[dotnet-world-server] starting...
[dotnet-world-server] protocol schema loaded; smoke-test mode (no transport).

Smoke test:
  player.join: parsed
  player.leave: parsed
  intent.move: parsed
  world.snapshot: parsed
```

## Scope (v0)

- Confirm `schemas/protocol.schema.json` exists relative to the repo root.
- Parse a representative `player.join` / `player.leave` / `intent.move` / `world.snapshot` set with the standard library.
- Exit non-zero if any sample fails parsing.

## Out of scope (v0)

- No JSON Schema validator dependency — parity-with-Node smoke is the v0 bar; AJV-equivalent validation comes when this skeleton gets a real transport.
- No HTTP / WebSocket / SignalR transport — picked when the first interactive use case appears.
- No persistence — world state will live in memory when it eventually lands.
- No authentication or account model.

## Layout

```
dotnet-world-server/
  GameServer.csproj   # .NET 9 console project
  Program.cs          # smoke-test entrypoint (the file you actually run)
  README.md           # this file
```

Future additions land alongside `Program.cs`: `TransportWs.cs` (WebSocket adapter), `World.cs` (server-owned world mirror), and so on. Keep new files small so agents can load any one of them as context.
