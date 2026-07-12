<!-- AGENT-FIRST NOTICE -->
> [!IMPORTANT]
> ### 🤖 Read this with your AI agent — don't read it by hand.
> This repo is written agent-first. Point Claude Code, GitHub Copilot, Cursor, or any agent at it:
> *"Read the README and AGENTS.md, then help me run / extend this."*
> Structure + [`AGENTS.md`](AGENTS.md) are optimized for agent comprehension.
<!-- /AGENT-FIRST NOTICE -->

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./brand/archlang-wordmark.svg" />
  <img src="./brand/archlang-wordmark-black.svg" alt="ArchLang" width="440" />
</picture>

A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

[![License](https://img.shields.io/github/license/chanmeng666/archlang?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/chanmeng666/archlang?style=flat-square)](https://github.com/chanmeng666/archlang/issues)
[![Stars](https://img.shields.io/github/stars/chanmeng666/archlang?style=flat-square)](https://github.com/chanmeng666/archlang/stargazers)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-EA4AAA?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/ChanMeng666)

**[▶ Live Playground](https://archlang-playground.vercel.app)** · **[📖 Docs](https://archlang-docs.vercel.app)** · **[📦 npm](https://www.npmjs.com/package/@chanmeng666/archlang)** · **[🧩 VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)**

</div>

## 🌟 Introduction

**ArchLang** is a tiny language for floor plans. You write a `.arch` source file that
*declares* a plan — walls, rooms, doors, windows, dimensions — and the compiler renders
it to a clean, professional **SVG**. Think of it as **Typst/LaTeX for architecture**:
text in, a precise drawing out.

It is **explicit and parametric**. Every element has exact coordinates and sizes in
millimetres, so the output is **deterministic** (the same source always produces the same
drawing) and **editable** (changing one number changes exactly one thing). That makes it
ideal both for humans and for AI agents that author or tweak plans and re-render — e.g.
*"make the bedroom 1 m wider"* becomes a one-number diff, not a re-roll of a raster image.

The compiler is **pure TypeScript with zero runtime dependencies** and runs identically in
**Node and the browser** — so the **[live playground](https://archlang-playground.vercel.app)**
is fully client-side.

> ArchLang is the floor-plan engine behind [ArchCanvas](https://github.com/chanmeng666/archcanvas),
> an AI design agent — but it stands alone and is useful in any app or script.

## ✨ Features

- **Code → professional drawing.** Poché-hatched walls (by material), door swing arcs, window
  glazing, computed room areas, dimension lines, layers, line weights/types, a north arrow, a
  scale bar, and a title block. **Drawn fixture symbols** for WC, basin, shower, bathtub, sink,
  counter, fridge and stove (with a `lib/fixtures.arch` component library), and `dims auto` to
  synthesize dimension strings for you.
- **Architectural soundness, not just syntax.** `arch lint` checks habitability *and* tacit
  professional knowledge: a bathroom reachable only through a bedroom, a wet room that isn't fully
  walled in, a door whose swing hits furniture or another door, a bath/kitchen with no fixtures, a
  windowless bedroom, an unenterable room, a too-narrow door, and a room whose use was only *inferred*
  from an indirect label alias (`W_ALIAS_MATCH`, with a fix that pins the explicit `uses`). All tunable
  via the ruleset.
- **Human circulation as facts.** `arch describe` models how a person actually *walks* the plan on a
  clearance-eroded nav grid — per-room walk distance, the narrowest pinch on the way in, and how
  circuitous the route is — with advisory lint for a too-tight (`W_PATH_TOO_NARROW`) or roundabout
  (`W_CIRCUITOUS_PATH`) walk, and an opt-in `arch compile --overlay circulation` that draws the
  routes on top of the plan. Facts and advice, never an auto-arranger. `arch repair` is the one
  *explicit* corrector — it pushes furniture out of walls/doorways/swings and won't pinch a walkway.
- **Four export formats.** **SVG** and **DXF** with zero dependencies; **PDF** (vector,
  selectable text) and **PNG** (deterministic raster) via optional, lazily-loaded add-ons that
  the default install never pulls.
- **Parametric + scriptable.** Values, arithmetic, arrays, `for`/`if`/`while`, and pure
  functions — plus **relational placement** (`right-of` / `below` / …) resolved by deterministic
  topological arithmetic. All expand-time: no runtime, no clock, no I/O.
- **Explicit + deterministic.** Integer-millimetre coordinates with optional **grid snapping** and
  optional metric **unit suffixes** (`4m` / `40cm` / `20mm` fold exactly to millimetres at lex time;
  bare numbers are unchanged); byte-for-byte stable output, so renders are cacheable and visually
  regression-tested.
- **Zero-dependency core, isomorphic.** Hand-written lexer + recursive-descent parser; the SVG
  path runs in Node and the browser with no native binaries.
- **Errors as data.** `compile()` *returns* `diagnostics`/`errors`/`warnings` with byte spans — it
  never throws on bad source — making a tight authoring or LLM self-correction loop trivial.
- **AI-agent-native, CLI-first.** `arch context` prints the whole bundled agent context
  ([`llms-full.txt`](https://archlang-docs.vercel.app/llms-full.txt) — spec, skill, CLI reference and
  error catalog) in one call; `arch spec` teaches just the language in one page; `arch describe
  --json` returns the plan as **facts** (rooms, areas, adjacency, what doors connect, and a
  `freedom` degrees-of-freedom report of which positions are hand-authored vs resolver-derived) so a
  text-only agent verifies without an image; `arch lint --json` flags unsound plans. Every command is
  `--json` with deterministic exit codes and `fix`-carrying diagnostics, and `--error-svg` renders a
  self-describing error card when a plan won't compile — visual feedback for an agent loop. The CLI
  stays primary; an optional [MCP server](#mcp-server-optional) exists for MCP-native hosts. See
  [`SKILL.md`](SKILL.md).
- **Accessible output.** `arch compile --accessible` stamps the SVG with `<title>`/`<desc>` +
  `role="img"` (a derived one-sentence caption, also readable as `describe().caption`), and the
  `accTitle` / `accDescr` keywords let a plan override that metadata — opt-in, default output
  unchanged.
- **IDE-grade tooling.** A full LSP (hover, completion, go-to-definition, rename, signature
  help), an `arch fmt` formatter, an `arch explain <CODE>` error catalog, and a VS Code extension.
- **Library + CLI + playground + docs.** Use the `compile()` API, the `arch` CLI, the live editor
  (with a **Copy-for-LLM** button), or the documentation site — where plain ` ```arch ` fences render
  as live, editable plans and a [GitHub Action](.github/actions/arch-render) renders the fences in
  any repo's Markdown.

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 18** to use the CLI or build from source. The library itself is dependency-free
  and also runs in any modern browser.

### Install

```bash
npm install @chanmeng666/archlang
```

### Build from source / develop

```bash
npm install        # install dev dependencies
npm run build      # build the library + CLI (dist/)
npm test           # run the test suite (vitest)
npm run cli -- compile examples/studio.arch -o studio.svg   # run the CLI from source
```

## 📖 Usage

**As a library:**

```ts
import { compile } from "@chanmeng666/archlang";

const source = `
plan "Tiny" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Studio"
  door at (2000,3000) width 900 wall exterior hinge left swing in
  window at (0,1500) width 1200 wall exterior
}`;

const { svg, errors, warnings } = compile(source);
if (errors.length) console.error(errors);
else writeFileSync("tiny.svg", svg); // a finished floor plan
```

**As a CLI:**

```bash
arch compile  floorplan.arch -o floorplan.svg  # compile once (SVG, default)
arch compile  floorplan.arch -f dxf            # also: dxf · pdf · png
arch compile  floorplan.arch -w 1000           # set output width (px)
arch compile  floorplan.arch --overlay circulation   # draw the walkability routes on top (opt-in)
arch preview  floorplan.arch -o floorplan.png  # render a viewable PNG (1600px; --install fetches resvg if missing)
arch describe floorplan.arch --json            # semantic facts: rooms, areas, adjacency, circulation
arch lint     floorplan.arch --json            # architectural-soundness warnings (--profile to tune)
arch validate floorplan.arch --strict          # parse + lint, no render; --strict fails on warnings (ship gate)
arch validate floorplan.arch --graph g.json    # also check interior-door adjacency against an intended graph
arch fix      floorplan.arch --dry-run         # preview the machine-applicable diagnostic fixes (drop --dry-run to apply)
arch suggest  floorplan.arch --json            # advisory door/window statements to fix reachability / windowless rooms
arch repair   floorplan.arch -o fixed.arch     # explicit geometric corrector: furniture out of walls/doorways/swings + change log
arch compile  floorplan.arch -f txt            # zero-dependency ASCII text plan (also `preview --ascii`)
arch batch    a.arch b.arch -o out/            # render many files/variants at once
arch md       notes.md -o out.md               # render fenced arch blocks in Markdown → image links
arch watch    floorplan.arch                    # recompile on save
arch fmt      floorplan.arch --write            # format source in place
arch new      -o floorplan.arch                 # scaffold a starter plan
arch spec                                       # print the whole language in one page
arch manifest                                   # the whole CLI API as structured data (for agents)
arch explain  E_LAYOUT_CYCLE                     # explain a diagnostic
```

### 🤖 Use it from an AI agent (CLI-first, MCP optional)

ArchLang's agent interface is its CLI — token-cheap, runs in any harness, nothing to configure.
**Cold start with one command:** `arch context` prints the entire bundled agent context —
the language spec, the workflow skill, the CLI reference and every diagnostic code in one
system-prompt-ready document (the same
[`llms-full.txt`](https://archlang-docs.vercel.app/llms-full.txt) the docs site serves). From there,
every command takes `--json` (structured result on stdout, messages on stderr) with deterministic
exit codes (`0` ok · `2` user-source error · `1` IO · `3` usage), and every diagnostic carries a
`fix` (and, where the edit is mechanical, machine-applicable `fixes` that `arch fix` applies —
deterministically ordered by the exported `rankFixes`, so the top-ranked alternative is picked per
diagnostic), so the self-correction loop needs no docs lookup; `--error-svg` even turns a plan that won't compile into a
self-describing image an agent can look at. *(The CLI stays primary because a
[CLI costs nothing in context until called](https://www.firecrawl.dev/blog/mcp-vs-cli), where an MCP
schema sits in the window permanently — but an optional [MCP server](#mcp-server-optional) now exists
so MCP-native hosts can discover ArchLang through the registry.)* Point your agent at
[`SKILL.md`](SKILL.md), or:

```bash
npx @chanmeng666/archlang context              # EVERYTHING in one call: spec + skill + CLI reference + error catalog
npx @chanmeng666/archlang spec                 # just the language in one page (~2k tokens)
npx @chanmeng666/archlang manifest --json      # the whole CLI API as data: commands, flags, formats, lint rules, error codes
npx @chanmeng666/archlang compile plan.arch -o out.svg --json   # render; JSON: { ok, diagnostics, summary }
echo '<source>' | npx @chanmeng666/archlang compile - -o - -f svg   # stdin → SVG on stdout
npx @chanmeng666/archlang preview plan.arch -o out.png --json  # render a PNG you can SHOW the user (--install fetches resvg if missing)
npx @chanmeng666/archlang describe plan.arch --json            # verify: rooms, areas, adjacency, door connections, circulation
npx @chanmeng666/archlang lint plan.arch --json                # architectural soundness warnings
npx @chanmeng666/archlang validate plan.arch --strict --json   # parse + lint, no render; --strict fails on warnings (the ship gate)
npx @chanmeng666/archlang fix plan.arch --dry-run --json       # preview machine-applicable diagnostic fixes (drop --dry-run to apply)
npx @chanmeng666/archlang suggest plan.arch --json             # advisory door/window statements for unreachable rooms / windowless bedrooms
npx @chanmeng666/archlang repair plan.arch -o fixed.arch       # explicit geometric corrector: furniture out of walls/doorways/swings + change log
npx @chanmeng666/archlang compile plan.arch -f txt             # zero-dependency ASCII text plan you can read straight from stdout
npx @chanmeng666/archlang compile plan.json --from-json -o out.svg   # compile structured Plan JSON (see /plan.schema.json) instead of .arch
npx @chanmeng666/archlang batch a.arch b.arch -f svg --json    # render many variants at once → results[]
npx @chanmeng666/archlang md notes.md -o out.md -f svg         # render fenced arch blocks in Markdown → image links
```

The loop: `spec` → write `.arch` → `compile --json` → on `ok:false`, apply each
`diagnostics[].fix` (or run `arch fix` for the machine-applicable ones) → `describe --json` to confirm
intent (room count, areas, adjacency) **without rendering an image** → `validate --strict` as the ship
gate, `preview` (or `-f txt`) to see the plan. `manifest --json` is the one-call API map; `batch`/`md`
cover variant exploration and embedding plans in docs. Two machine-native artifacts help structured
generation: **[`/plan.schema.json`](https://archlang-docs.vercel.app/plan.schema.json)** (the Plan-JSON
schema for `--from-json`) and **[`/archlang.gbnf`](https://archlang-docs.vercel.app/archlang.gbnf)** (a
GBNF grammar to constrain a local model to parseable output).

<a id="mcp-server-optional"></a>

**MCP server (optional).** For MCP-native hosts, the
[`@chanmeng666/archlang-mcp`](packages/mcp) package is a stdio Model Context Protocol shim over the
**library** (tools `compile`/`describe`/`lint`/`validate`/`repair`/`fix`/`suggest`/`complete`;
resources `archlang://spec`/`context`/`schema`/`grammar`). The core stays zero-dependency — the SDK
lives only in that package. It is listed on the official MCP registry as
`io.github.ChanMeng666/archlang-mcp`. Prefer the CLI when your agent has a shell (it costs nothing in
context until called); use the server for discoverability. Add it to Claude Code with:

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

See the [package README](packages/mcp/README.md) for Claude Desktop / Cursor / VS Code config.

**In CI:** the in-repo composite Action
[`.github/actions/arch-render`](.github/actions/arch-render) renders every ` ```arch ` fence in your
Markdown to images in one step — `uses: ChanMeng666/archlang/.github/actions/arch-render@v1.13.0`
(pin a release tag or `@main`). See its [README](.github/actions/arch-render/README.md) for inputs
and an auto-commit example.

**A taste of the language** (see [`examples/`](examples) and the
[Language Reference](docs/language-reference.md)):

```
plan "One-bed" {
  units mm
  grid 50
  scale 1:50
  north up
  dims auto overall

  wall exterior  thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }   # full-height: bath stays enclosed

  room id=r_living at (0,0)    size 4000x4000 label "Living / Kitchen"
  room id=r_bath   at (4000,0) size 2000x4000 label "Bath"

  door   id=d_main at (1000,4000) width 1000 wall exterior  hinge left swing in
  door   id=d_bath at (4000,1500) width 800  wall partition hinge left swing in
  window at (2000,0) width 1800 wall exterior

  furniture kitchen_sink at (300,300) size 800x600   # draws a real sink symbol
  furniture wc           at (5300,300) size 400x700  # …and a WC

  title { project "One-bed" drawn_by "ArchCanvas" date "2026" }
}
```

> The full, lint-clean flagship example (enclosed bath off a central hall, fitted kitchen + bath,
> dimension strings) is [`examples/studio.arch`](examples/studio.arch).

### Try it live

**▶ [archlang-playground.vercel.app](https://archlang-playground.vercel.app)** — a client-side
Vite + CodeMirror 6 editor with syntax highlighting, **autocomplete**, inline lint (fed by the
compiler's `diagnostics`), and a live SVG preview with **pan / zoom / fit**. Load examples, save
named **snapshots**, share a plan via a **compressed permalink**, and **copy** or **download**
the drawing as **SVG / PNG / DXF / PDF**. It surfaces the core's own tooling too: a **Format**
button, a **Repair furniture** panel (review the deterministic corrector's change log, then apply
it), **clickable diagnostics** that jump to the offending source and show the error catalog's
cause / fix / example, and a **Copy-for-LLM** button that bundles the source, `describe()` facts and
diagnostics into one paste-ready prompt. Two floor-plan-specific touches: **click any element to jump the editor caret
to its source**, and **hover a room to see its area & size**. Everything runs in the browser —
nothing is sent to a server.

To run it locally from the repo root (npm workspaces):

```bash
npm install            # bootstraps all workspaces
npm run playground:dev # builds the core, then opens the playground dev server
```

### Embed a plan

Drop a **live, self-contained floor plan** into any blog, doc, or wiki with a single `<iframe>` —
no build step, nothing sent to a server. The playground's **Embed** button generates the snippet;
the URL carries the source in a compressed hash:

```html
<iframe src="https://archlang-playground.vercel.app/embed.html#z=…" width="720" height="480"></iframe>
```

The embed page reads the same `#z=` share hash the playground writes, plus optional `&`-joined
params: `editable=1` (show a compact editor that re-renders live), and `theme=blueprint|dark|mono|presentation`.

### Editor support

Install the **[ArchLang VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)**
(`ext install ChanMeng.archlang`) for syntax highlighting and full language support — live
diagnostics, hover, completion, go-to-definition, rename, and signature help — on `.arch` files.

## 📚 Documentation

- **[📖 Docs site](https://archlang-docs.vercel.app)** — the hosted guide, reference, error catalog, ADRs, and a **live, editable examples gallery** (edit the source and the SVG recompiles in-browser); every ` ```arch ` fence on a docs page is itself a live, editable plan.
- **[spec.llm.md](spec.llm.md)** — the **whole language in one page** (~2k tokens) for AI agents; also `arch spec`.
- **[SKILL.md](SKILL.md)** — the agent Skill: how to author plans via the CLI (`spec → compile → describe → lint`).
- **[Language Reference](docs/language-reference.md)** — every statement, with syntax and defaults.
- **[Error catalog](docs/error-codes.md)** — every `E_*`/`W_*` code with a cause and a fix.
- **[Architecture Decision Records](docs/adr)** — the key design decisions and their trade-offs.
- **[Examples](examples)** — `studio`, `two-bed`, `parametric`, `themed`, `relational`, `attached`, `accessible`.
- **[🤗 Dataset — `ChanMeng666/archlang-repair-trajectories`](https://huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories)** — a fully synthetic, self-verifying corpus of floor-plan **repair trajectories** (broken source + diagnostics → deterministically healed source) plus **authoring** pairs (brief → golden + intent), for training and experimentation. CC0-1.0; the generator + seed are open source in [`dataset/`](dataset).
- **[AGENTS.md](AGENTS.md)** — orientation for AI agents working in this repo (current status + architecture).
- Build the docs site locally with `npm run docs:build` (VitePress, in `docs-site/`).

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Use the issue and pull-request templates when you open one.

## ❤️ Support & Sponsor

- Questions? Open a [Discussion](https://github.com/chanmeng666/archlang/discussions) or see [SUPPORT.md](SUPPORT.md).
- Found a security issue? Follow [SECURITY.md](SECURITY.md).
- If this project helps you, consider [sponsoring](https://github.com/sponsors/ChanMeng666) ☕.

## 📄 License

Released under the [MIT](LICENSE) license.

---

<!-- CHAN MENG PERSONAL BRAND -->
<div align="center">
  <a href="https://github.com/ChanMeng666" target="_blank">
    <img src="./.github/brand/chan-meng-logo.svg" alt="Chan Meng" width="160" />
  </a>

  <p><strong>Chan Meng</strong><br/>Need a custom app like this one? I build them — let's talk.</p>

  <a href="mailto:chanmeng.dev@gmail.com"><img src="https://img.shields.io/badge/Email-chanmeng.dev@gmail.com-EA4335?style=flat-square&logo=gmail&logoColor=white" alt="Email Chan Meng"/></a>
  <a href="https://github.com/ChanMeng666"><img src="https://img.shields.io/badge/GitHub-ChanMeng666-181717?style=flat-square&logo=github&logoColor=white" alt="Chan Meng on GitHub"/></a>
</div>
<!-- /CHAN MENG PERSONAL BRAND -->
