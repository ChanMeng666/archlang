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
- `packages/mcp`: version-bump and lockstep rules are in `.claude/rules/mcp.md`. Never relax the
  lockstep dep-range pin.
- Build and package the VS Code extension and the shim in the PRIMARY checkout, after root
  `npm run build`. The CI job map is `docs/agents/commands.md`.
- Before a tag, follow `.claude/commands/release-check.md` (it holds the human steps).

## Traps

- **`actions/setup-node` takes the runner's tool cache, which lags a Node security release by
  days**; every setup-node step carries `check-latest: true`, so a new one must too (the job log
  prints `Attempting to download` when it bites).
- **vsce rejects an SVG image from a host outside its badge allow-list** (raw.githubusercontent.com
  included): the VS Code README uses PNGs.
- **A version bump reddens CI's `npm run check` until `editors/vscode/dist/server.js` is rebuilt**:
  `editors/vscode/test/stdio.test.ts` compares the bundle's stamped core version with the
  workspace's. Release gate order is in `docs/agents/commands.md`.
- **`@chanmeng666/arch-plan`'s `prepack` refuses a stale root `dist/`**: run `npm run build` at the
  root before packing or publishing it.
