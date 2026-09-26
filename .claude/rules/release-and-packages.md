---
paths:
  - ".github/workflows/**"
  - "package.json"
  - "CHANGELOG.md"
  - "packages/mcp/**"
  - "editors/vscode/**"
---

# Release, CI and the published packages

- Tokenless OIDC only: a `v*` tag runs `release.yml`. An auth failure means redo the npmjs trusted
  publisher, never add a token. `repository.url`'s owner is `ChanMeng666` byte-for-byte.
- Any `packages/mcp` change ships only with a version bump in `package.json` AND both `server.json`
  version fields; its baked resources refresh only on a bump. Never relax the lockstep dep-range pin.
- Build and package the VS Code extension and the shim in the PRIMARY checkout, after root
  `npm run build`. The CI job map is `docs/agents/commands.md`.
- Before a tag, run `/release-check` (it holds the human steps).
