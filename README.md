<!-- AGENT-FIRST NOTICE -->
> [!IMPORTANT]
> ### 🤖 Read this with your AI agent — don't read it by hand.
> This repo is written agent-first. Point Claude Code, GitHub Copilot, Cursor, or any agent at it:
> *"Read the README and AGENTS.md, then help me run / extend this."*
> Structure + [`AGENTS.md`](AGENTS.md) are optimized for agent comprehension.
<!-- /AGENT-FIRST NOTICE -->

<div align="center">

# ArchLang

A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

[![License](https://img.shields.io/github/license/chanmeng666/archlang?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/chanmeng666/archlang?style=flat-square)](https://github.com/chanmeng666/archlang/issues)
[![Stars](https://img.shields.io/github/stars/chanmeng666/archlang?style=flat-square)](https://github.com/chanmeng666/archlang/stargazers)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-EA4AAA?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/ChanMeng666)

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
**Node and the browser** — so the [playground](playground/index.html) is fully client-side.

> ArchLang is the floor-plan engine behind [ArchCanvas](https://github.com/chanmeng666/archcanvas),
> an AI design agent — but it stands alone and is useful in any app or script.

## ✨ Features

- **Code → professional drawing.** Poché-hatched walls (by material), door swing arcs, window
  glazing, computed room areas, dimension lines, layers, line weights/types, a north arrow, a
  scale bar, and a title block.
- **Four export formats.** **SVG** and **DXF** with zero dependencies; **PDF** (vector,
  selectable text) and **PNG** (deterministic raster) via optional, lazily-loaded add-ons that
  the default install never pulls.
- **Parametric + scriptable.** Values, arithmetic, arrays, `for`/`if`/`while`, and pure
  functions — plus **relational placement** (`right-of` / `below` / …) resolved by deterministic
  topological arithmetic. All expand-time: no runtime, no clock, no I/O.
- **Explicit + deterministic.** Integer-millimetre coordinates with optional **grid snapping**;
  byte-for-byte stable output, so renders are cacheable and visually regression-tested.
- **Zero-dependency core, isomorphic.** Hand-written lexer + recursive-descent parser; the SVG
  path runs in Node and the browser with no native binaries.
- **Errors as data.** `compile()` *returns* `diagnostics`/`errors`/`warnings` with byte spans — it
  never throws on bad source — making a tight authoring or LLM self-correction loop trivial.
- **IDE-grade tooling.** A full LSP (hover, completion, go-to-definition, rename, signature
  help), an `arch fmt` formatter, an `arch explain <CODE>` error catalog, and a VS Code extension.
- **Library + CLI + playground + docs.** Use the `compile()` API, the `arch` CLI, the live
  editor, or the documentation site.

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
arch compile floorplan.arch -o floorplan.svg   # compile once (SVG, default)
arch compile floorplan.arch -f dxf             # also: dxf · pdf · png
arch compile floorplan.arch -w 1000            # set output width (px)
arch watch   floorplan.arch                     # recompile on save
arch fmt     floorplan.arch --write             # format source in place
arch explain E_LAYOUT_CYCLE                      # explain a diagnostic
```

**A taste of the language** (see [`examples/`](examples) and the
[Language Reference](docs/language-reference.md)):

```
plan "Studio 1BR" {
  units mm
  grid 50
  scale 1:50
  north up

  wall exterior thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }

  room id=r_living at (0,0)    size 4000x6000 label "Living / Kitchen"
  room id=r_bed    at (4000,0) size 3000x4000 label "Bedroom"

  door   id=d_main at (1000,6000) width 1000 wall exterior  hinge left swing in
  window at (2500,0) width 1800 wall exterior

  dim (0,6000)->(7000,6000) offset 600 text "7000"
  title { project "Studio Apartment" drawn_by "ArchLang" date "2026" }
}
```

### Try it live

The [`playground/`](playground) is a Vite + CodeMirror 6 app — a client-side editor with syntax
highlighting, inline lint (fed by the compiler's `diagnostics`), live SVG preview, example plans,
and **SVG / PNG / DXF / PDF download**. From the repo root (npm workspaces):

```bash
npm install            # bootstraps all workspaces
npm run playground:dev # builds the core, then opens the playground dev server
```

## 📚 Documentation

- **[Language Reference](docs/language-reference.md)** — every statement, with syntax and defaults.
- **[Error catalog](docs/error-codes.md)** — every `E_*`/`W_*` code with a cause and a fix.
- **[Architecture Decision Records](docs/adr)** — the key design decisions and their trade-offs.
- **[Examples](examples)** — `studio`, `two-bed`, `parametric`, `themed`, `relational`.
- **[AGENTS.md](AGENTS.md)** — orientation for AI agents working in this repo.
- **Docs site** — `npm run docs:build` builds the VitePress site in `docs-site/`.

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
