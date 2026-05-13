# Test Fixtures

These projects are intentionally tiny so agents can inspect and repair them quickly.

- `valid-project`: a minimal valid AGF project with source asset metadata.
- `valid-asset-reference`: a valid project with external runtime mesh and material references.
- `invalid-project`: an invalid scene with an unknown component and duplicate entity id.
- `missing-start-scene`: a project manifest that points to a missing start scene.
- `missing-asset-reference`: a project with missing runtime mesh and material references.
- `invalid-asset-metadata`: a project with malformed `assets/_sources/asset-sources.json`.

All diagnostics produced from these fixtures must use the shared shape: `severity`, `code`, `file`, `path`, `message` and optional `suggestion`.
