# Backend Multiplayer Best Practices

Sprint 0 note. Focus: backend-agnostic persistent-world contracts without slowing down the single-player MVP. C#/.NET is a reference backend path, not an engine dependency.

## Rules We Will Follow

- Backend is optional and profile-based.
- Browser runtime stays TypeScript.
- Server code must not depend on Three.js, DOM or browser input APIs.
- AGF core must not depend on any specific backend implementation.
- Protocol schemas are the source of truth for client/server network messages.
- A C# reference backend can use SignalR first.
- A Node.js backend or other implementation should be possible through the same contracts.
- Raw WebSocket can be added later for binary, low-overhead action games.
- gRPC-Web is useful for typed service APIs in a C# reference backend, not browser bidirectional gameplay streaming.
- HTTP/REST is fine for auth, profiles, saves, leaderboards and manifests.

## Minimal Reference Backend Shape

```text
examples/
  backends/
    dotnet-world-server/
      GameServer.csproj
      Program.cs
      World/
      Transport/
      Persistence/
      Tests/
```

## Multiplayer MVP Assumptions

- 1-4 practical MVP players, with 0-player idle world support later.
- Direct world entry, no match queue.
- Shared world state and simple server-owned objectives.
- Simulated clients in tests.
- No competitive anti-cheat beyond basic impossible input validation.
- No large-scale MMO features.

## Open Questions

- JSON Schema to C# and Node.js contract generation paths.
- Hosting model for local dev: direct `dotnet run` first for C# reference, Aspire later only if useful.
- Whether SignalR JSON protocol is enough for the C# reference spike.

## Sources

- ASP.NET Core SignalR: https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction
- ASP.NET Core WebSockets: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/websockets
- ASP.NET Core gRPC-Web: https://learn.microsoft.com/en-us/aspnet/core/grpc/grpcweb
- .NET Aspire: https://learn.microsoft.com/en-us/dotnet/aspire
