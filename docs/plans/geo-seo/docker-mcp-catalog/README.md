# Docker MCP Catalog entry (card G5)

Prepared, not submitted. The pull request to `docker/mcp-registry` is opened only on the owner's
word (GS-D1); the owner does the fork, any terms and the final submit, an agent may drive the rest.

## What is here

- `server.yaml`: the entry for `servers/archlang/server.yaml`, a local (containerised) server. The
  format is the repository's `CONTRIBUTING.md` and `pkg/servers/types.go`: `source.directory` is
  the build context (`<repo>#<commit>:packages/mcp`) and `Dockerfile` the default file name in it.
  Category `productivity`, one of the wizard's fixed list (`cmd/wizard/main.go`).
- The image is built from `packages/mcp/Dockerfile`: Node 22 Alpine, installs the published
  `@chanmeng666/archlang-mcp` at the version in `packages/mcp/package.json`, runs `archlang-mcp`
  on stdio as the `node` user. No environment variables, secrets or volumes, so the entry has no
  `config` block.
- No `tools.json`: the server lists its tools without configuration, so Docker's build can run it
  and call `tools/list`.

A remote entry for `https://mcp.archlang.uk/mcp` (`type: remote`, `remote.transport_type:
streamable-http`, a `readme.md` with the docs URL, `tools.json` `[]`) is the other shape the
catalog takes; one entry named `archlang` is proposed, the local one, because it is the one that
also writes PNG.

## Steps for the owner

1. Pick the release commit: a `v*` tag whose `packages/mcp/package.json` version is on npm
   (`npm view @chanmeng666/archlang-mcp version`). Put its full 40-character SHA in
   `source.commit`.
2. Build and run the image once on a machine with Docker running:
   `docker build -t archlang-mcp packages/mcp`, then send `initialize` and `tools/list` on stdin
   (`docker run -i --rm archlang-mcp`) and check that the tools come back.
3. Fork `docker/mcp-registry`, clone it, and copy `server.yaml` to `servers/archlang/server.yaml`
   (or run `task wizard` with `https://github.com/ChanMeng666/archlang` and compare the result).
4. In the fork: `task build -- --tools archlang`, `task catalog -- archlang`,
   `docker mcp catalog import $PWD/catalogs/archlang/catalog.yaml`; check the server in Docker
   Desktop's MCP Toolkit, then `docker mcp catalog reset`.
5. Open the pull request (title `Add archlang`), let its CI pass, and wait for the Docker team's
   review. Docker builds and hosts the image as `mcp/archlang`; after approval it appears in the
   catalog within about a day.
6. Record the PR and its state in `docs/seo.md` § 8.
