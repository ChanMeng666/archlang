# `arch-render` — render `arch` fences in Markdown (GitHub Action)

A composite GitHub Action that renders every ` ```arch ` fenced code block in your
Markdown into an SVG (or PNG) floor-plan image and rewrites each fence to an image
link — the CI counterpart of the [`arch md`](../../../README.md) CLI command.

It writes files but **does not commit**. Commit the rendered output yourself (an
[auto-commit example](#commit-the-output) is below).

## Usage

Pin the action to a git ref on this repo. There is **no floating `@v1` tag** — use a
release tag (recommended) or `@main`:

```yaml
# .github/workflows/render-plans.yml
name: Render floor plans
on:
  push:
    paths: ["**/*.md"]

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 20

      - name: Render arch fences
        uses: ChanMeng666/archlang/.github/actions/arch-render@v1.11.0 # or @main
        with:
          files: "**/*.md"
          format: svg
```

Each source `foo.md` produces `foo.out.md` (fences rewritten to `![Floor plan N](foo.out-N.svg)`)
plus the image files alongside it. The originals are left untouched.

### Commit the output

The action never commits. Pair it with
[`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action):

```yaml
      - name: Render arch fences
        uses: ChanMeng666/archlang/.github/actions/arch-render@v1.11.0
        with:
          files: "docs/**/*.md"

      - name: Commit rendered plans
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "docs: render arch floor plans"
          file_pattern: "*.out.md *.svg"
```

(Give the job `permissions: { contents: write }` so it can push.)

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `files` | `**/*.md` | Glob or space-separated Markdown paths. Generated `*.out.md` files and `node_modules` are skipped automatically. |
| `format` | `svg` | `svg` (zero dependency) or `png`. See the [PNG note](#png-output) below. |
| `out-dir` | `""` (alongside each source) | Directory for the rewritten `*.out.md` and images. Files sharing a basename collide here — leave empty for per-directory output. |
| `error-svg` | `true` | On a block that fails to compile, still render a self-describing error-card image and rewrite the block to it (the job stays green). Set `false` to leave failing fences in place and **fail the job**. |
| `version` | `latest` | npm version or dist-tag of `@chanmeng666/archlang` to run via `npx`. Ignored when `use-local` is `true`. |
| `use-local` | `false` | Run the CLI from the checked-out repo (`node --import tsx src/cli.ts`) instead of npm. For developing/self-testing **this** repo; requires `npm ci` first. |

## Outputs

| Output | Description |
|--------|-------------|
| `rendered` | Total number of `arch` blocks that rendered successfully. |
| `failed` | Total number of `arch` blocks that failed to compile. |

## Exit-code policy

`arch md` exits `0` (ok), `2` (a block failed to compile), `1` (IO), or `3` (usage).
The action maps those to job status:

- **`error-svg: true` (default)** — a failing block still produces an error-card image
  and is rewritten to it, so exit `2` is **tolerated**: the job stays green and the
  failure is reflected in the `failed` output. Only IO/usage errors fail the job.
- **`error-svg: false`** — a failing block is left as a fence; exit `2` **fails the job**
  so the broken plan is noticed.

## PNG output

`format: svg` is the zero-friction default (no native dependency). `format: png`
rasterizes via the optional `@resvg/resvg-js` dependency; `npx` installs optional
dependencies by default, so it usually works out of the box, but SVG is recommended
for the most reliable, dependency-free CI.

## Pinning

`ChanMeng666/archlang` tags every release as `vX.Y.Z`, so pin to a release
(e.g. `@v1.11.0`) for reproducible builds, or `@main` to track the tip. There is no
maintained `@v1` alias — use a concrete tag or `@main`.
