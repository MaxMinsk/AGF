# Security Policy

AGF is a pre-alpha browser game framework. It is **not** a production-ready engine and has not been audited. This document explains what is currently in scope, how to report issues, and where the trust boundary sits today.

## Supported Versions

Only `main` is supported. There are no LTS branches yet.

## Threat Model (today)

AGF ships:

- A browser runtime (`engine/runtime/`, `engine/render/`, etc.) loaded by Vite.
- CLI tools (`engine check`, `engine doctor`, `engine inspect`, etc.) that read project JSON / glTF / wasm and emit diagnostics.
- A **DEV-only** agent bridge exposed by Vite at `/__agf/*` plus a `window.__agf` global.
- A reference Node backend (`examples/backends/node-world-server/`) with an optional `--serve` WebSocket transport.
- A reference .NET backend skeleton (no transport, smoke-test only).

What is intentionally NOT inside the trust boundary today:

- **`window.__agf` and the `/__agf/*` HTTP/WS bridge are DEV-only.** They are not stripped out automatically yet in production builds. Do **not** deploy a build that exposes them to untrusted networks.
- **Reference backends have no authentication.** `playerId` is a contract field, not a security boundary. The Node `--serve` mode is meant for local-network playtests only.
- **CLI tools read user-supplied JSON.** `engine check` validates against schemas, but agent-authored project trees are not sandboxed — running an untrusted project's `bootstrap.ts` executes its code.

If you intend to deploy an AGF-built game publicly, treat the production bundle as untrusted client code and put server-authoritative state on your own backend. AGF does not pretend to solve that today.

## Reporting a Vulnerability

Please **do not** file public GitHub issues for security reports. Instead:

1. Email the maintainer at `maxvideo74@gmail.com` with subject prefix `[AGF security]`.
2. Include reproduction steps, affected files / commit, observed vs expected behaviour, and your contact.

Expected response time:

- Acknowledgement within 7 days.
- Triage decision (accept / dispute / out-of-scope) within 14 days.

There is no bug bounty programme.

## What counts as a vulnerability

In scope:

- Code injection or privilege escalation reachable from a published AGF build (after `npm run build`), assuming the host page is otherwise trusted.
- Path traversal / arbitrary file write from CLI tools given a path under the project directory.
- Reference Node backend transport bugs that allow an unauthenticated client to corrupt world state for another client (within `--serve` localhost scope).
- Memory-disclosure or sandbox-escape bugs in CLI parsers.

Out of scope (file as a normal GitHub issue):

- DEV-mode bridge being exposed if a user runs `npm run dev` on a public IP.
- Untrusted project JSON triggering noisy diagnostics instead of clean rejection.
- Performance / DoS concerns under uncapped client counts on the reference backend.
- Vendored third-party CVEs already disclosed upstream (Draco, Basis Universal, Three.js, Rapier) — please link the upstream advisory.

## Disclosure

If a fix is shipped, it lands as a normal commit on `main`. There is no separate security advisory pipeline yet. Once AGF has tagged releases, advisories will be published through GitHub Security Advisories.
