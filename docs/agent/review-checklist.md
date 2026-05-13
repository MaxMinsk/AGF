# Agent Review Checklist

Use this before closing a task.

## Architecture

- [ ] Core code avoids Three.js, DOM, Vite and Playwright imports.
- [ ] Gameplay systems work through component data and commands.
- [ ] New project data has schema coverage.
- [ ] New runtime mutation is represented as a command when meaningful.
- [ ] Backend code is optional and does not become a client dependency.

## Tests

- [ ] Unit tests cover nontrivial core behavior.
- [ ] Browser behavior has Playwright coverage or a documented reason.
- [ ] Schema changes have valid and invalid fixtures.
- [ ] Network/protocol changes validate both TS and C# contract expectations.

## Agent Experience

- [ ] Repository docs, code comments, identifiers, diagnostics and in-app text are in English.
- [ ] Diagnostics include file/path/severity/message.
- [ ] Suggestions are concrete when the fix is guessable.
- [ ] Docs mention new commands or workflows.
- [ ] Generated files are not edited manually.

## Final Summary

- [ ] State what changed.
- [ ] State how it was verified.
- [ ] State residual risks or skipped checks.
