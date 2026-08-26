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

### Floor plans as code — like Typst/LaTeX, but for architecture.

**Text in, a precise architectural drawing out.** Deterministic, zero-dependency,
and built so an **AI agent can verify its own plan without ever looking at an image**.

[![npm](https://img.shields.io/npm/v/@chanmeng666/archlang?style=flat-square&logo=npm&color=CB3837)](https://www.npmjs.com/package/@chanmeng666/archlang)
[![CI](https://img.shields.io/github/actions/workflow/status/chanmeng666/archlang/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/chanmeng666/archlang/actions/workflows/ci.yml)
[![Node](https://img.shields.io/node/v/@chanmeng666/archlang?style=flat-square&logo=nodedotjs&color=339933)](https://nodejs.org)
[![Runtime deps](https://img.shields.io/badge/runtime%20deps-0-2e7d32?style=flat-square)](#-why-it-is-different)
[![License](https://img.shields.io/github/license/chanmeng666/archlang?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/chanmeng666/archlang?style=flat-square)](https://github.com/chanmeng666/archlang/stargazers)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-EA4AAA?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/ChanMeng666)

**[▶ Live Playground](https://playground.archlang.uk)** · **[📖 Docs](https://archlang.uk)** · **[⌨ CLI reference](https://archlang.uk/cli)** · **[📦 npm](https://www.npmjs.com/package/@chanmeng666/archlang)** · **[🧩 VS Code](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)**

</div>

## 👀 See it

Here is a **whole program**, and below it **the actual drawing it compiles to** — not a mock-up.
Not one coordinate in it places a door, a window or a piece of furniture: every opening is pinned to
a distance along a *named wall*, every fixture resolves against a room or a wall, and the bath and
bedroom are laid out by a `strip`. `site { street north }` names the two facades the plan turns
on — the front door faces the lane, the glazing faces the garden.

```arch
# A one-bedroom laneway cottage — 49 m² that reads as one program.
#
# Nothing here is positioned by hand. Every opening is pinned to a run distance along a
# named wall (`on <wall> at <pos>`), every fixture resolves against a room or a wall
# (`in <room> anchor …`, `against wall …`), and the bath/bedroom pair is laid out by
# `strip`. `site { street north }` names the two facades the plan turns on: the door
# faces the lane, the glass faces the garden.
plan "Laneway House" {
  units mm
  grid 50            # partitions are 100 thick, so a `flush` fixture lands on a …50
  north up
  dims auto all
  site { street north }

  wall id=w_lane   exterior  thickness 200 { (0,0) (7500,0) }
  wall id=w_east   exterior  thickness 200 { (7500,0) (7500,6500) }
  wall id=w_garden exterior  thickness 200 { (0,6500) (7500,6500) }
  wall id=w_west   exterior  thickness 200 { (0,0) (0,6500) }
  wall id=w_hall   partition thickness 100 { (4200,0) (4200,6500) }
  wall id=w_bath   partition thickness 100 { (4200,2500) (7500,2500) }

  room id=r_live at (0,0) size 4200x6500 label "Living / Kitchen" uses living kitchen
  strip down at (4200,0) gap 0 width 3300 {
    room id=r_bath size 2500 label "Bath"    uses bath
    room id=r_bed  size 4000 label "Bedroom" uses bedroom
  }

  door id=d_front  on w_lane at 2100 width 900 hinge near start swing into r_live
  door id=d_garden sliding on w_garden at 2700 width 1800 slide left
  door id=d_bed    on w_hall at 5600 width 800 hinge left swing into r_bed
  # `w_hall` is walked lane→garden, so `slide right` sends the panel down the solid wall
  # below the jamb; `slide left` would aim it at 500 mm and trip `W_POCKET_RUN`.
  door id=d_bath   pocket on w_hall at 900 width 800 slide right

  window on w_west   at 2400 width 1200
  window on w_garden at 700  width 1000
  window on w_garden at 5850 width 1600
  window on w_east   at 1500 width 600

  furniture fridge       against wall w_west offset 400  in r_live
  furniture stove        against wall w_west offset 1200 in r_live
  furniture kitchen_sink against wall w_west offset 2000 in r_live
  furniture table  in r_live centered size 1300x900 label "Table"
  furniture sofa   in r_live anchor bottom-left flush inset 250 size 900x2000  label "Sofa"
  furniture bed    in r_bed  anchor bottom-right flush inset 250 size 1500x2000 label "Bed"
  furniture robe   in r_bed  anchor top-left     flush inset 200 size 1800x600  label "Wardrobe"
  furniture shower in r_bath anchor top-right    flush size 900x900
  furniture wc     in r_bath anchor bottom-left  flush size 400x700
  furniture basin  in r_bath anchor bottom-right flush size 600x450

  title { project "Laneway House" drawn_by "ArchLang" date "2026-08-16" }
}
```

<div align="center">

<a href="https://playground.archlang.uk/#z=jZZfbhs3EMbf9xQfpBcHsB1asRy7TQKkRYACMdKiTZFH7aw40jJekQJJeeUGBvLUAxQ9Qw_QI_QoOUkx5EpaObZbPVGrmR-_-bsa4jWc5aOKtXdugYYst3SDqYuR5owvn__E6QUW__yNWFOEZ9IBFMQJS-_mnhbHxbAY4p2LtbFz1OwZJmDpgonGWdaoblCT1cd4c83-Bm7JVizFyFgxiA4Ev7LQJkSyUwY1zs5BxRCWFqzRUtPgoHQWL-T4ChTxYunCq_LJIThhZ2YdV57hObjmmgNoTsaGKGgJzXlQ4hRDHJTG4oU8fgWy09p5fPn8V3mIcuOULpRnTw5BViPWjIpi_XSTqSUZLyE0ZDTcKqK6KYYoQ_RmWR6jDCYyPiFEzxxhnY81bssUTki02DrMaEq6-75syCKuvJXkfpMeaed8MRSrzkbKc5hO84ZC6P0yJ6_ZHheJMrjsyviDWwUe4FMBrKyJAYtFAcy90Rgr9D5DLMnHVLAA8owTpRBrM706RJDqlLNmFepym-WGrBahIMnSWBXoYlwtC0CbRQCtpK5NUwD3JqMokNNs9Mt2IqEB4HVkb5xHvt1yCBgphU84UIfqCQ6ej1U63O55M4X4uPfGLx_OxuorRk7h4wqy38OMlv9LRxZxv3ctJ-xK0fM-yd6noy6KdLiPIU36PxijXiCjDlMgT4rRL_2kMdcsU5YFB_MbQxzXcicaqrjB4NJcyyA_xVsTpzXbAVaBA5r8-Co_lPLLUEC71ibiJog5LaHQGh1rPHsm4grpxZ2GFEu6etS79TuK9UAM02Vic9eNNTrFqueWB7fT2I1xgRy3TJo468nMOxshnd31JEWMJHNZ54VSkD3HsEweIZKPCG3aZzY65MTtEbu-Co3RYpbI3TNhP9-yT86VSmaMhmdxD5Ji6mSlNqGI8dnW9XwrSzz3BVWsC5nwMnuWsrVaaq5Yp33y5fc_spo06WW-35t5HUsElilP24ksN7mE8jW4xuStnNAVN65NP3ykRfXthiJaSrRu1WiQWcDEJFspLBZ5q0pflB8mP_34_ds37yc___quPN4Pu-tmN73iuB_9xV7wPdlprxirXZsdupmUXJ_ucj1S6o7driZSko2desRufD7e8s6-sut2EkWcjLf3ilkBzFbemrRIZ97oOXdreO_t0yl3s1ngKK0MGLtrsB0iRHe9ITyGkJgfQHSzOgnGXj2GGKkHEZGqhnsSMWUb2bPOo3jyTKn1xW4c34v5YD8ONyP0Cd2ruXIxusVR6uz0GoKxScxYZfaFUuukbAP_xc1on93NT2Kn8z47Nc79cClepu8WyT7bu4rvY0e3zKLls8dWG_a5bNSe8A_kteDuJKZ2LfvuApmI3gVZ-faCbT4uUj_uGO0UuwT0GP3k9hmnSq2f32FUFIx9mNFPYmKcKbU-HaeGjyY28hdg6d1Hnsav_qJoT62dVDcYvPbT-pLsfABNkTEYqdHZkTo_Ojkb4La4Lf4F">
<img src="./examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `arch compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jZZfbhs3EMbf9xQfpBcHsB1asRy7TQKkRYACMdKiTZFH7aw40jJekQJJeeUGBvLUAxQ9Qw_QI_QoOUkx5EpaObZbPVGrmR-_-bsa4jWc5aOKtXdugYYst3SDqYuR5owvn__E6QUW__yNWFOEZ9IBFMQJS-_mnhbHxbAY4p2LtbFz1OwZJmDpgonGWdaoblCT1cd4c83-Bm7JVizFyFgxiA4Ev7LQJkSyUwY1zs5BxRCWFqzRUtPgoHQWL-T4ChTxYunCq_LJIThhZ2YdV57hObjmmgNoTsaGKGgJzXlQ4hRDHJTG4oU8fgWy09p5fPn8V3mIcuOULpRnTw5BViPWjIpi_XSTqSUZLyE0ZDTcKqK6KYYoQ_RmWR6jDCYyPiFEzxxhnY81bssUTki02DrMaEq6-75syCKuvJXkfpMeaed8MRSrzkbKc5hO84ZC6P0yJ6_ZHheJMrjsyviDWwUe4FMBrKyJAYtFAcy90Rgr9D5DLMnHVLAA8owTpRBrM706RJDqlLNmFepym-WGrBahIMnSWBXoYlwtC0CbRQCtpK5NUwD3JqMokNNs9Mt2IqEB4HVkb5xHvt1yCBgphU84UIfqCQ6ej1U63O55M4X4uPfGLx_OxuorRk7h4wqy38OMlv9LRxZxv3ctJ-xK0fM-yd6noy6KdLiPIU36PxijXiCjDlMgT4rRL_2kMdcsU5YFB_MbQxzXcicaqrjB4NJcyyA_xVsTpzXbAVaBA5r8-Co_lPLLUEC71ibiJog5LaHQGh1rPHsm4grpxZ2GFEu6etS79TuK9UAM02Vic9eNNTrFqueWB7fT2I1xgRy3TJo468nMOxshnd31JEWMJHNZ54VSkD3HsEweIZKPCG3aZzY65MTtEbu-Co3RYpbI3TNhP9-yT86VSmaMhmdxD5Ji6mSlNqGI8dnW9XwrSzz3BVWsC5nwMnuWsrVaaq5Yp33y5fc_spo06WW-35t5HUsElilP24ksN7mE8jW4xuStnNAVN65NP3ykRfXthiJaSrRu1WiQWcDEJFspLBZ5q0pflB8mP_34_ds37yc___quPN4Pu-tmN73iuB_9xV7wPdlprxirXZsdupmUXJ_ucj1S6o7driZSko2desRufD7e8s6-sut2EkWcjLf3ilkBzFbemrRIZ97oOXdreO_t0yl3s1ngKK0MGLtrsB0iRHe9ITyGkJgfQHSzOgnGXj2GGKkHEZGqhnsSMWUb2bPOo3jyTKn1xW4c34v5YD8ONyP0Cd2ruXIxusVR6uz0GoKxScxYZfaFUuukbAP_xc1on93NT2Kn8z47Nc79cClepu8WyT7bu4rvY0e3zKLls8dWG_a5bNSe8A_kteDuJKZ2LfvuApmI3gVZ-faCbT4uUj_uGO0UuwT0GP3k9hmnSq2f32FUFIx9mNFPYmKcKbU-HaeGjyY28hdg6d1Hnsav_qJoT62dVDcYvPbT-pLsfABNkTEYqdHZkTo_Ojkb4La4Lf4F)** — it opens the
live playground with **this exact plan already loaded**. Change a number and watch it redraw;
the compiler runs in your browser, nothing is sent to a server.

</div>

> **Why a link and not a live embed?** ArchLang *does* ship an embeddable viewer — but
> **GitHub's markdown sanitizer strips `<iframe>`** (it comes back as escaped text, exactly like
> `<script>`), so no README on GitHub can host one. The embed works everywhere GitHub isn't:
> see [Embed a plan anywhere](#embed-a-plan-anywhere). Source:
> [`examples/laneway-house.arch`](examples/laneway-house.arch).

## 🌟 Introduction

**ArchLang** is a small declarative language for floor plans. You *declare* a plan — walls, rooms,
doors, windows, furniture — and the compiler renders a clean, professional **SVG** (also DXF, PDF,
PNG, and a zero-dependency ASCII plan).

Coordinates are integer **millimetres**, so output is **deterministic**: the same source always
produces byte-identical bytes, and changing one number changes exactly one thing. *"Make the bedroom
1 m wider"* is a one-number diff — not a re-roll of a raster image that silently redraws the kitchen
too.

The compiler is **pure TypeScript with zero runtime dependencies** and is isomorphic — the same code
runs in Node and in the browser, which is why the [playground](https://playground.archlang.uk)
is fully client-side.

> ArchLang is the floor-plan engine behind [ArchCanvas](https://github.com/chanmeng666/archcanvas),
> an AI design agent — but it stands alone and is useful in any app or script.

## 💡 Why it is different

Most "AI floor plan" tools generate a **picture**. A picture cannot be checked, diffed, or reasoned
about — and neither the model nor you can tell whether the bathroom is actually reachable.

ArchLang generates a **program**, and then lets you interrogate it as **facts**:

| | Raster image generation | **ArchLang** |
|---|---|---|
| Output | pixels | a `.arch` program → SVG / DXF / PDF / PNG / TXT |
| Edit "widen the bedroom" | re-roll the whole image | change one number |
| Same input twice | different image | **byte-identical** output |
| "Is the bath reachable?" | look at it and guess | `arch describe --json` → access graph |
| "Does it match the brief?" | eyeball it | `arch validate --intent` → exit code |
| Wrong syntax | — | **errors returned as data, each carrying its own `fix`** |

That last row is the whole design: **`compile()` never throws.** It *returns* `diagnostics` with byte
spans and a machine-applicable fix, which is what makes a tight self-correction loop possible.

## 🤖 The agent loop

An agent can author a plan, correct itself, and **confirm the plan matches the brief without
rendering an image at all** — which is what makes ArchLang cheap to drive from a text-only model.

```mermaid
flowchart TD
    B([Brief]) --> S["<b>arch context</b> — the whole language, one call"]
    S --> W["Write <b>.arch</b>"]
    W --> C{"<b>arch compile --json</b>"}
    C -->|"ok: false"| F["<b>arch fix</b><br/><i>each diagnostic carries its own fix</i>"]
    F --> C
    C -->|"ok: true"| D["<b>arch describe --json</b><br/><i>rooms · areas · adjacency · access graph</i>"]
    D --> V{"<b>arch validate --intent</b><br/><i>does it meet the brief?</i>"}
    V -->|"no"| G["<b>arch suggest</b><br/><i>candidate door / window statements</i>"]
    G --> W
    V -->|"yes"| O([SVG · DXF · PDF · PNG])

    style B fill:#ede7f6,stroke:#6b3ae0,color:#1a1a1a
    style O fill:#e8f5e9,stroke:#2e7d32,color:#1a1a1a
    style C fill:#fff8e1,stroke:#7a6000,color:#1a1a1a
    style V fill:#fff8e1,stroke:#7a6000,color:#1a1a1a
    style D fill:#e8f5e9,stroke:#2e7d32,color:#1a1a1a
    style F fill:#fdecea,stroke:#b3261e,color:#1a1a1a
    style G fill:#fdecea,stroke:#b3261e,color:#1a1a1a
```

**Cold start in one command.** `arch context` prints the entire agent context — language spec,
workflow skill, CLI reference and every diagnostic code — as one system-prompt-ready document (the
same [`llms-full.txt`](https://archlang.uk/llms-full.txt) the docs site serves).

```bash
npx @chanmeng666/archlang context                       # EVERYTHING: spec + skill + CLI + error catalog
npx @chanmeng666/archlang context --section errors      # …or one section of it (the catalog alone: 60 KB → 13 KB)
npx @chanmeng666/archlang spec                          # just the language, one page (~2k tokens)
npx @chanmeng666/archlang help describe                 # one command, with worked examples
npx @chanmeng666/archlang compile plan.arch --json      # render → { ok, diagnostics, summary }
npx @chanmeng666/archlang fix plan.arch --dry-run       # the exact unified diff it would write, applying nothing
npx @chanmeng666/archlang describe plan.arch --json     # VERIFY, without an image
npx @chanmeng666/archlang validate plan.arch --strict   # the ship gate
```

Every command takes `--json` (result on stdout, messages on stderr) with deterministic exit codes
(`0` ok · `2` user-source error · `1` IO · `3` usage) — and a typo *earns* that `3`: `arch lint
--jsn` exits 3 with `did you mean --json?` rather than quietly reading `--jsn` as a filename, and
`arch comple` suggests `compile`.

**One manifest, no drift.** The per-command help (`arch <cmd> --help`), the flag parser, and the
generated **[CLI reference](https://archlang.uk/cli)** are all rendered from the same
manifest — which is why they cannot advertise a flag a command doesn't take. `arch manifest --json`
is that manifest as data, and `arch <cmd> --help` is the cheap way to read one row of it.

Reads are bounded, so a big plan can't flood a context window: `describe --select`/`--room`,
`lint|validate --code`/`--severity`, `context --section`. Filtering what you *read* never changes
what *gates* — the exit code always weighs every diagnostic. And because `arch fix` rewrites your
source, it prints the unified diff first and takes `--backup`.

See [`SKILL.md`](SKILL.md).

<details>
<summary><b>Machine-native artifacts</b> — Plan JSON, a GBNF grammar, an intent schema, and an optional MCP server</summary>

<br/>

| Artifact | Use |
|---|---|
| [`/plan.schema.json`](https://archlang.uk/plan.schema.json) | Emit structured JSON, compile it with `arch compile --from-json` |
| [`/archlang.gbnf`](https://archlang.uk/archlang.gbnf) | Constrain a local model to parseable output |
| [`/intent.schema.json`](https://archlang.uk/intent.schema.json) | Write the brief down as a contract; gate on it with `validate --intent` |
| [`/llms-full.txt`](https://archlang.uk/llms-full.txt) | The whole context bundle (`arch context`) |

**MCP server (optional).** [`@chanmeng666/archlang-mcp`](packages/mcp) is a stdio Model Context
Protocol shim over the library, listed on the official registry as `io.github.ChanMeng666/archlang-mcp`:

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

Prefer the **CLI** when your agent has a shell — a CLI costs nothing in the context window until it
is called, whereas an MCP tool schema sits there permanently. The server exists so MCP-native hosts
can *discover* ArchLang. The core stays zero-dependency; the SDK lives only in that package
([ADR 0012](docs/adr/0012-mcp-shim-discoverability.md)).

**In CI:** [`.github/actions/arch-render`](.github/actions/arch-render) renders every ` ```arch `
fence in your Markdown to images in one step.

</details>

## ✨ Features

<details open>
<summary><b>It draws like an architect, not like a plotter</b></summary>

<br/>

Poché-hatched walls (by material), door **swing arcs**, window glazing, computed room areas,
dimension lines, layers, line weights, a north arrow, a scale bar and a title block. **Real drawn
symbols for every catalogued furniture kind** — the bathroom and kitchen fixtures, and the room
furniture beside them, each with the detail that makes it readable at plan scale (see
[Furniture & Fixtures](docs/furniture.md), or the
[`furnished-flat`](examples/furnished-flat.arch) example) — plus `dims auto` to synthesize
dimension strings for you.

</details>

<details>
<summary><b>It checks architectural soundness, not just syntax</b></summary>

<br/>

`arch lint` encodes tacit professional knowledge: a bathroom reachable only *through* a bedroom, a
wet room that isn't fully walled in, a door whose swing hits furniture or another door, a windowless
bedroom, an unenterable room, a too-narrow door, a bath/kitchen with no fixtures, and a room whose use
was merely *inferred* from an indirect label (`W_ALIAS_MATCH` — with a fix that pins the explicit
`uses`). All tunable via the ruleset.

</details>

<details>
<summary><b>It models how a person actually walks the plan</b></summary>

<br/>

`arch describe` runs a clearance-eroded nav grid: per-room walk distance, the **narrowest pinch on
the way in**, and how circuitous the route is — with advisory lint for a too-tight
(`W_PATH_TOO_NARROW`) or roundabout (`W_CIRCUITOUS_PATH`) walk, and an opt-in
`arch compile --overlay circulation` that draws the routes on top of the plan.

**Facts and advice — never an invisible auto-arranger** ([ADR 0005](docs/adr/0005-no-invisible-architect.md)).
`arch repair` is the one *explicit* corrector: it pushes furniture out of walls, doorways and swing
arcs, and emits a change log you review.

</details>

<details>
<summary><b>Errors are data, and many carry a machine-applicable fix</b></summary>

<br/>

`compile()` **never throws** on bad source — it *returns* `diagnostics` with byte spans, a catalogued
`E_*`/`W_*` code, and a `fix`. Where the edit is mechanical, the diagnostic also carries applicable
`fixes` that `arch fix` applies for you. `--error-svg` even turns a plan that *won't* compile into a
self-describing error card an agent can look at.

</details>

<details>
<summary><b>Parametric, scriptable, and still deterministic</b></summary>

<br/>

Values, arithmetic, arrays, `for`/`if`/`while` and pure functions — plus **relational placement**
(`right-of` / `below` / …) and room **strips**, resolved by deterministic topological arithmetic, not
an optimizer. All of it expands at compile time: no runtime, no clock, no I/O. Optional metric unit
suffixes (`4m` / `40cm` / `20mm`) fold exactly to millimetres at lex time.

</details>

<details>
<summary><b>Five output formats · accessible SVG · IDE-grade tooling</b></summary>

<br/>

**SVG**, **DXF** and a **TXT** ASCII plan with zero dependencies; **PDF** (vector, selectable text)
and **PNG** (deterministic raster) via optional, lazily-loaded add-ons the default install never
pulls. `arch compile --accessible` stamps the SVG with `<title>`/`<desc>` + `role="img"`.

A full **LSP** (hover, completion, go-to-definition, rename, signature help), an `arch fmt`
formatter, an `arch explain <CODE>` catalog, a self-documenting CLI (`arch <cmd> --help`, rendered
from the manifest, worked examples included), and a
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang).

</details>

## 🚀 Quick start

```bash
npx @chanmeng666/archlang new -o plan.arch          # scaffold a starter plan
npx @chanmeng666/archlang compile plan.arch -o plan.svg
```

Or install it:

```bash
npm install @chanmeng666/archlang
```

**As a library** (zero dependencies, runs in Node *and* the browser):

```ts
import { compile } from "@chanmeng666/archlang";

const { svg, diagnostics } = compile(`
plan "Tiny" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Studio"
  door at (2000,3000) width 900 wall exterior hinge left swing in
  window at (0,1500) width 1200 wall exterior
}`);

// compile() never throws — errors come back as data, each with a span and a fix.
if (diagnostics.some((d) => d.severity === "error")) console.error(diagnostics);
else writeFileSync("tiny.svg", svg);
```

**Also exported, all pure:** `describe()` (facts), `lint()` (soundness), `validateIntent()` +
`projectSubscores()` (does it match the brief?), `repair()`, `applyFixes()`, `suggestTopology()`,
`renderAscii()`, `toDxf()`, and the LSP core (`completion`, `hover`, …).

<details>
<summary><b>Develop this repo</b></summary>

<br/>

```bash
npm install          # one install bootstraps every workspace
npm run build        # build the library + CLI into dist/
npm run check        # typecheck + lint + the full test suite
npm run check:drift  # every generated artifact must match its source
npm run playground:dev   # build the core, then open the playground
```

</details>

## 🖼️ Gallery

Every one of these is a real, compiled example from [`examples/`](examples) — and every drawing on
this page is **generated from its source by `npm run gen:example-svgs`**, so a picture here can
never drift from the compiler that made it. Click a drawing to open it in the playground, or the
name for the source.

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=jVfbjts4En33Vxy4H9pG3B3Z7UvSQRbIJD2YwQZYIJnZeUxoqWRxmyYFkmq7dxBgn_YL5l_2fT5lvmRQRcmW3VlM-qVpieewLqeKpQu8Qe62tcojQmwK7aBq5eOWbMQf__kNsSLkyjqrc2XwxufVe2U3oL3a1oauBxeDC3mqI-Wx8cqYRwTX2AKjWoVAAZ-VzysYbePn8S3ogfwjvHNbuJpsgCtLKORko1cGlTJmMrhAcHLyWsUKOsAyDJ5UXlGBWHnXbKq0gwome3WyvWzYDLK5cYEKKFsMLlDqGKnATseKmQxKvY-Np_CKN8A6FM55GFIlwo6oDnA2OpSNt5o3XuMjmfIqdzYqbYk5R9ZBb2vnYxizzTpKNLWhgNK7LRSCthtDKDVHqzbKYvgxBXr63Ychfh0AjdUxYLsdABuvCyyyARByZQjTW_lhnY8VmnowAC5wt4_ktfMIFRmDZ-CM6aidDdf4qSLsX8-zLEOhH3TBcWtskPh8__P796hIb6rYj7CQ6oCdMoYKyYgYz--NftB2g1CrnFKQvcBzZ5qtRagN2645UG0q8FyyiOfCfT2A8II6oxErnd9bCgGzLMOvGGWTbIzRKst6i2WW8bpbSCbxpSM7ONwjmyayeUczP9J8M-4mnbo6rr8ZOp8foWn9hbMlEdHFa_-pjaSKrcPpL-h_E5hgz6bCqDUZDN-nvc_xdx3ziuwQDZdSS3GfHp6wr6lgOmbvItCxsyP7mx77dylRQxz_hL5N4AmvpLLHm6Jy5J3Oj7w_KGP6pC0tU5zaymXa40zh6nEue7aqWH2FU2SbioEbh80pafDrkhUnjLb3gSu03dbJlYu_q4RroWyj_8d_f0tIHbhDKW4l3LP43SjXPm-MEkFYoiKcNJDxq_4RQsrHiOPcxLChCJXakIC45jpL2Qh5CHC8ik9bpW0br5ujqHe6iBVLMDsvsErbDcFQGYGwY3M1i6WzXRevXV-NKa-rI-fLLDsX_blJPbkt5wdZJPiLp_DWpNQ6kkmuiU9Ie7pYHnTxV6R9P5mUC1bbwu3aUpuJaUAXsMV5wE4BUsC86RDh2TcAFrMjYHUw9QAQBbS1zO0Yyji7kYyn1s7bb_muuMfv_0PuGhvJ8zJE90C8KL0uNoRR4dXOQgWEx-3amTBmuRzuqK43fBKqVjGT2YIjIAX2InWaE0x3HLqUsssJJJjlVzDJLvQwLxd_hWldOGJmq6fnLLJBvwifHer0wDPBPdURuSHFhSNRFB2JBsJpPIIrVYrDIpvMbw6NhlWxF6G3jeajK9XwBCoaFzHeJIW3UBbHfnbaT4fJaO5Wydh2tvh_tl4G8MTziJo1PzpzgXUs_UxIu74wvkWo3I48tJWHpfLInbfkJ1iroC3URmkborw91MkEv7yFS5Dgmva-F4F2E57UUKy0LzojxYsQ1WOQvsHjwqNreBSEymOT5rxINbQNuqDUOHn2-OWt9EubV87zrOYOdJchHQ8qNjRJ41KAdzF10dH0RSYG5TpE8raFCnHCscljZn939-HHf969e4XPpWlC9RlbUoHD3c0tKsrmS55MLHmUKid4FSvy_NYeiMVNT3lUPKVdBhlEyRtt6WgmOzDLsu02DVyXcqWVV8c54DChWrWl4kyAKWXSKaVTHC_Ql50E-XroZe4Oz_BRHAgYpQSPT5UpyRZObjyT-fykhuaLxLlW-X2XgOq8nR_ZdrkUpLZor-aUPKxdjCxlDvFhTtmvsrZA3-kt2cCZC9Gzam9TNKUJBqi1e6AJ3AP5rhXaGKA8fxykMdVTSZ5snlIx2unI0Ryjdpq3Bh072a4bbQptN5cB__j5p7sPktCA0f711TTLnq-mWTbBY_qx5KmslC59cZ66cZdOMUeM51QHVrqPHFB-KaUhkuFL25MquCB3yhcTIU25rt09NygJ8mH26AwVIe8qbSiVXa0sH6KN6bTaV1pb6L0ncilz279p_6_a_3L3y4Sgt-3VzV6Pr_42alecS1eWgSJmiwyR9hFD3jjsUKs-6kjxFHXTR2WTZQtJA_rZWXytJtTq5KxpN7AwcHqYTJ-gloIaAFFHQ_JdBNTe_YvyePhketN9mw7ltdyFn9aPGPIn6FtlH1Ro36hIGM6y2fIqW17NVvz0y-DL4E8"><img src="./examples/studio.svg" width="270" alt="Studio one-bedroom flat" /></a><br/>
<b><a href="examples/studio.arch">studio</a></b><br/>
<sub>The flagship: fitted kitchen and bath,<br/>an enclosed bath off a central hall.<br/><b>Lint-clean, and import-free.</b></sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=lZXBjts2EIbveoofziG7gL2h5PWuGyABkqJFgbboJfeYFscmG5o0yNHK22CBPkSBPlDfpE9SkJLWVrxNt7pIIuf_ODMccl7gHbj1szWp4P0Oci8D78gxWsMaEjU5DtKi9iEY5cNVsbfSYfKh9bP3veh7K3mCzwXQOMMRu10BbINRKIUogFhLSyhfd3_OB9YIZqu5KIBWWgs6MAXjA1ib-pOjGFEtBD7jQkzFJS5KIcTp11KI9DN81NZHwsNASzEYNt6d4EqRcdcDJ38ssvrZus68d-H52tsT7e3R-4cUfc6fUW_Cx0-Ga00Okvug-yea3whp-UNCwMo1WUx-7K1f4SdzZ9x2MmKtSZVJm1hDxI-smy9ZP8vIFNDv5hmpGkhDEGOv5iekoSCqLyCS9cidnpMh8zOIZH3uiE5J7hm3_8n4QVo7SflV3ofjutUia1qjWOMbIc72Thu3JVjaMGJr3BbGnUIWi-PCHWT5_yHZ-5vneZJPyZGSis045dsMqk52tgOlkfGBGiuW54rrryvEdP64552iXHxd0Z2OTvWvigJ4gQ-asOtqb03qZYQmqWAipA0k1T3yYaL-wsiAi-BZMkFcXuGx2F5GRC0DRTifwdk0319JPtxcU0SPdD3lZbaeIthni-ibYQHjIpNUVwWwaYIz3ARK3nXb30d22VVduRTiUJWj8p88KZynslkehddJOD43E_ShlUvRpeeXOwpD0hzHKXzD0SjCRtaUXD_9f41VesUV9k3UFEGy1iCn9t44TqaZ6V0fchcsIzQuwjj2OTtpZh-MY1KIe-nSZqQxDg2hFHMh8NefWKY3a8rEdWOsSuW5IxmbtAl___5HFuVCyPbpnbcq94S9bSK0tJsu95qsTUkaHJ5mrHQKzjOd2JiYznkazb1BU05wLZtIWA3dZoXo5L73eriIrzLyu4Os2d7nKRkM6x2xqSGhpVOzNhhmclgxHXiFLXFEG7zb4sIwmkgqpTzK-y6uy8RUZpeTHx870eztqEH5zSYS4zb3vZF1Nn3CrADYsKXcTYF98L9SzU-02zytgmzdx_U9Ju9Crb-V7k7GfiaV0qQS1c1M3MyqRRp9KB6KfwA"><img src="./examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
<b><a href="examples/two-bed.arch">two-bed</a></b><br/>
<sub>A larger dwelling: central corridor,<br/>five rooms, windows on three exterior walls.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=hVXbaiNHEH2frzjIhJWIJUZeLSHBNnhDAoE8JXm3StMlTZOZrqG7xuNcDH7aDwj5gjzsh_lLQnePbibBTx7aVadOnao6usAdxPF8w8aLtNg2pKBea_FsMFitoTXjYblYvkfXUMUtO0Xod-Tx8vw3nKAmZ-aVtF2vbIoLVCLeWEfKAVvxkI6ddbsA8dj23lntPS_wg4If2Vc2cLiEyo61Zv9NcQHg5fkfrIN6261TFYKXAbJFJBnQkDWQXsHOQCX-OaQdqpEqVTWnAMJATYPNb-gkWLXiMF0bEf_nYJ2RAS_PnyEO1zHsFqS47iTcrmcHWEIMh9akqUSAykDegOCoZZOYYboOg3U7WKeynqG2bscmwo0ETokepMi6GnhuSO0DZ8IjnnW4jp-3IFfVEkX_nGh9K21nGw6oGiYHcgYdhcABa_JVjcY6XS-KriGHyd1ei-XHnyb4owB6ZzWgbQtg563BsiwLwInXGn1XFMAFfrQPsZkvsd-OpHvDW52rzL3d1RolJaRJXSLU5GMCYYUWhjutFwXyf5HDSTEtL8sZdtShRM3pdVWWZWKF3LY1N_6-ydWD_Z1zQEMbbjDJrCZAH5vNUa9SN2ziQ0p9f5L6MfcxyaljVwXwlPv97lHZW_EINTcNKK5v7yN_SjTjCAOmTFUNGnUPSl5fPv01bmJeOohTmSXMrulDOqGOvObN27AOzC696iB5p6NQaUWsuRnu8xx4zwda2-pXxyHgKio1ajj9qizTx9NZcpD-reSo5z4_f59DDBwUb9f_72SmN5L3tP-_fhQLJ5IdIZYZYrWHWJ1C5Ck69eQqjtVKtC2oEbdLamdlYpnLk9tMNx0f34U8zmQr5EyCG_0knXQCGfcyTm2BX2o-XEcyCHGvpp3NwrpoFnHIKcqaG3PfknUxfj8x0kx5sEbr2GiZScIx-ZHZ0V6wv5AzzLT5CTNLeI75dVniHGLDJqt2h9EJK3YavV8c0qLH1t6F4zijUGlZc3iqldaFFB_KL_bsV8lPToPSWpwHXZVlrv79ay-MtpL9zrpgDR-5YOr4gT1ku41HePitmUVSR08NsiVYd1BpD6fSzaODRVzW6A7ZJqJKj0mf0St-li1NziCTtgly9JcTyOxurzCXH8ry8ercfybFU_Ev"><img src="./examples/attached.svg" width="270" alt="Attached one-bedroom flat" /></a><br/>
<b><a href="examples/attached.arch">attached</a></b><br/>
<sub>No hand-computed coordinates at all:<br/>strips, on-wall openings, anchors.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrNchs3Er7zKbqkQ6RaUktSliIr5QMtyTbLCpmVqNWRBGeaHEQgwAAYUUzKVXmIPMM-WJ5kqxvAzJCO4-xGBxfnBx8awNfdX_f4EAbgpF4q7DhvLG7BlfPSzoWGeamXQpkN_P7rb-ALhPHd8GY0GUyG41FnMLrujH-4GQ1H7-8BX8RqrRCOnnsn_bPjk9Zh6xAmBcJaGQ8La7R3jOC8RfRgNF_djx8mH0DonK-Wwuao07PR-G7yoQ0yXDlT-gKtbh1CgSvp1gVaPIFJIQgMYSEyDzlmMscw0aYwCkGJrSl9G5zhm2slNDgvPDqQ_pKtBHDSI_ySTOOZGpPEG5_45Rm9O4Pcio0DbXwh9fIEhh60WKGDhXxGyKXFzEujHS1lJmxWQI4us3KO0On86IyGTsehwszz3LNLRubpZ3B0f9yG2VxkTzM4GlVbHzaHHuFPpfDGTp3MkV5pwxwzUbpkqVnwgPha67B5BUoiGW59sRE2JzhXaisdJribYz4Puu3Qp7uPxyfwgTYjGiZ0TjbvmiIshlMdfH8DdKsNm0JmBUhHBMm82sKm2PI7hSGDfWm1A7ERW-LIip60DsEakV_yW0o-S70Ea8yKrZobX8Acc7rhwIunMCGvhyggaM5EJ4f2WWYIc7rx-6-_tQ4BtbfbNhRCqTbMhS_aoESpc7r5JH1WoOYNl45Ykj1hDkIZvWxQ9wTGGkHkz9IZuwUltSeTS4VgUeTEqzbMHqd34_H309F4Mr3518NgMr6bvhtcDUfvZ9-BQvGMINI6YCN9kbgE89KD9A5QOMLdSJ2bDS9JethIpcCJLThTeZhD3vfru8G7yXD0Hj7cPNwN7yfDq3t4N76DwQgG9z_cXE3aNAUIyMVWyWXhYYXClRZXqP0JDGxW3Aq9hEK41iFoA67UsDI5KhoISnjpyxzZEm0gFx7Zq_Yo4MTWxUOnQxVpAcqYJwIOw8NSN4Xw-IwWxNyUHgqzgVWZFRDMy8yKPdmaclmA9HVIMRQI6AwXiers1jL4fW6MhY_D0fX9CQxorxf0hNeuNmQdzY15RRP2D4tEIt3JcSFK5eFJ6twBez9tLgpaT7iEeSlVjhY2plQ5iMyXQqktrEsORFVMUTKnRTYDG5uW_HlRKtUpkNdKL6MFo30IUzlmT4yyNtkTeggoga9msQABvbNuF1YryIy1Mjf2kg-JFxviZaC4ptAY79BwBp3LhVF5BK3oT_fIYElGEAPNRoNZo2YHFLznvhAazDP_QliJrJAaHa94wPsX9jYY4jaI6ypIBrLQDtxvpF4eHc_AYnB_XSoFC2NBKBXPIoaXx-n943D0fjp-ez-5e7ia3FzPIBOaD3O9VlsI-7XiTTVahdDiN6byLZrQpTCU4kXrENJBz4LFM5hvYWOlp8Vqw-cPgiij2pAJa4nKjgwHYbOTFhPu4G1MjwfwSwug1LRrq1UL4BBmSytzOOvOqthMTN_CWlgvKTcEckkHvW4XfCGzpypuJTY7ypMUDjRDEuE7K_QWHWec0mFOGzAnUj6O7z4O7sYPo2sQDjao1CUIWMgXX1pGzDCH2UKVrpiBWAqpnQfBuGRAbZYSxHyjQYQJ2TSNzsHR77_-56x7DJkxNpeaA0Ay2aIzingRjWJg2oKO02JNvPFwfXM3_PfNdWM8KPlEZw2i9IWxmJMDBaLw9vW63RlYU-ocOfxR6mHk4WgyDkmeKENGWCFp5tnj9N3D3Wg4ebi7mT4Obm-nV-Pb2-H9cDyahUWRw1DepU2mAJGjlc-YM2zDMg4ZQKEfLdAa1hQyoopg46SDBVOVNjN5tUPQ5WqO1lHcYNBSZ4WoI44znA2ZDPOtJz4SklQYRMVJCyBypwXgMqEQepe9Ll2FNFeuWwC5XDnaNkMUbbX-soZhkzqdTgdcgUrBP2hEmTFLOv_HXyD7ZurWUuMMbKldFd1gI3Nf8Kpz-VwJsxgMOStz0ufNiNkPC8mp7rsKOCTxGeQmjndihRwuGnKSwE7gLakDitckxvLK81JWcDBHZTaMLBpeYfQsRJH5Fu4eRnA9vJ8MRlc3lSRhmn1Dp2Sdh7WR2ofDjDMEWx-nP4yvPt5MpncPo1nKrsHktdBIAJl4ln4bJQWF5mCowyVn4RYEQsv8TTgd-sMXj1YaC1C7Yr_bhV_gqNvuHsNRr9_tNn9dnHXpIv3IlHEInxrYm-kc8x5h125fY_cC9nkC5R-vLgjqM5D-V0BeJ5DXXwJh3vw5SBoYl_dHKEm6_QnKaT02_A67s2dNVIxfwzk_bRgULvb2RvjiK3tzdlED8e8_Mihm5z_DuWgYdNFcWO3qQS13_uYf471vOO8Rx6PjoNTDHGs0VAU66UOwU4hrkLodAx5RPki2VazyGDRKyM5CZBQEgo4_gfvat-GIA9jOXJxUcsPSTiNnCPIgTvsyf2OnsXigPB5cJfw5-TMCsfqF6ABKzFHBwW14-Z9wLUnxHFAmc6n-yPneDnhyIQJPvpLAT_fB30Y10juINjB41Cj7sP0E-_qvwva_CpscJGxFcIMd2NNva9iP4eUEGmEjxA4sicxkbcPBGJasf2GZGmE_CKVqzATLEJm0WUklhtnFT25U4QeeM37_ott96fcbuyF88Tk-q94dVkSXIsyGDwbM_h7mbXh5bytKL5X02x1YriyjqRd7pr7q7sHe0MsH-6YyRMNtOWddstOwHl2TFJG-5H2C_8ltqWziJkyoQaRLTZaYP5uls_SplGJFXeWfhrYnPwtA-Zt8GoBp4b1uHYBC8qc7IZ6FjMYgoHDho5yWulVZ2CiTSJrFqkg6rhSpdMXsqSpJqsJLuqbdsb_AmM3uQSZCNRP1lrCxdoiiimpw0toi1C4ouBJgJaPInJDi2SK2viF1OLmzNgVvqKnSlAzOC-tjeRIndEbJHNYSLYPO0W8w2VUtLurqUD3H0j2zxkUJpYRzu4cQ9y6VnXQa5Izt6iT6eydRryUcwNvUVXmimB2qUK6RLusiKR3F1pSwpND85aKJKjiCDaKYSrLUHWJWBT0WK1MueLgL0iiy6HzMPKjT3aVy6DUaknoQHr6lOBMXSgGyQbOaZ3sY_T2MXpdA9jFsKNA_4yrFFSJps-JlpV0IKh1Cs2BpDJdoS3NJlRyTg-oYZbInV1fxsfgIlTx1PNOLC1MqF4t3J7leiR0BXonQbkOlBnXF2rFrp7gNEzoeEdet0MssWEdMbKpqOlGhqM-1QefJVmo8hRosMIQ3gDqe8rmpZhlbJk5zcFutKLkHejPRdqj9o1jNK16nIBxcvelXjBtbK3JFmyA8D8mM1RQNtPMo8nZsx7AcKLlcjh2RVNzSk4uzcCsU0BfhheCvpBhi4NhT7mFyi2tjqRUHpwHEFcbuE5HSUzyQwKWoH4Wn9NfgUmMrawpVrReK8BykFqXlPkuj50jFDm0mnX1s3NA_bqdPw5AxdvDZyUhZBxolQ1ZHlXhGge_zXs7uAtMxxYn313i6s8iwsCtBdXi0xV02U3vY89SooplSuJP5G7OjUcgxkkyJ4etVCl_RZfeHN9Xeq8-G9742fC1CAq-kxtnZWT38NYeXMLwWQjsATQEQ8mBQAHH-fmP-sIONTB_C_N-V6Iw3Cq1wqlQvo-ouxFx6MVeRZEuMn2L2ZLdwa8x8o2XPoZ6ygUsF7pd62vBTKakzPikwRHTU5Fw-XaauhMyRi9zQE5b5G52OLerdSqXvnxrnrL2hUYLTUIr_aWwcev6Vof3qrOqxXx-KO0O5_iNmfn7MqYA_hPh9hVefmnMg4keYPfAoqGvwwMJ9EtbgoVe-59rfkJbMd6A3Uyf1E6Ri6Py8u7tbf2y3i4fWrgMFwewgu6TS2XPOK_0Xkc93jW6QPjYn_ybrI-mrVidnhfAxjhqLc2dU6bHZ2qu6n2xWO36S0MhShoYFtltDnwlnTOrq2xClGlt1snhF37iQOmMTJ6ROs1g4-pYnKcvn0nmhs6BJB7fj0ftQu8YRcBR7RbEdRjF9p9OUWjnH9ScwTsPGyVgxHVaJ9adSWI-2Q511Vlyxv7nby_ouHuXPGD-zVE8z4YUyyxJPqjTlhJZe2G19YIQrdBZatoF70sZaaDc9p45z6oYxaDUZaWb-EBS0stSU4N8Nrm54E7XZ70BTTLLSe64RNprkZ0GNvxZQ5tSSCRCPKvA9nXVT98ZdP4VwSNAjv5Ia6iqZu7Z5JHxg-s4UzptnTKXbX5qitzfFDtzCynyJ_wMci90duB081orxBfbNcFZRDgMfSSxMz7ov59xarkdvMrbjs9Fz4z1JlMbobvfl273RrjAbVht7o4OMbo5-3e2-vA6qoR6emVL7NL6q1L9kAKUHtn_XBLMQVV-m3Q-Rri7vOYrGOvzeLMTBzuCQJ6tQ1qv7GTxZc_CEXt0dPcc8tYT6NHc9NQmaFy7B6t7Nl8a-_ktjWwBeeoX87Qlgbc2P9F3j4D79543q6xQ_p48LejrfwgF96r0S-lm4-ISC4kG_2z_vdC86vVO6-6n1qfVf"><img src="./examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
<b><a href="examples/bungalow.arch">bungalow</a></b><br/>
<sub>The door vocabulary: sliding, pocket<br/>and bifold leaves — panels, not arcs.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrvcttGkv_Op-iSKmX7jmRIUbRk7TlVdETb2tNKLkk5J19OGgJNYlbDGezMQCCzlao8xD7DPlie5Kp7ZgBQkp29LD_YItDof9N_f-A-zKDAjVgZLRSshM1RQykepJJGn4CTG_BWlPizkTkTKIVWogMr9UrqFQjIpM0qJSxY4yudi2Fvv7cP8we0WzC-QAu4EetSIUid_nTfgnSwqKTysLRmDRYzL_RKoevDAjNROQRfCE9kNf0vevuwVMZYKJXQULlKKLUF6YZwU0gHRiPRauMTL9ZpdvHT54_zq3kfhM5BesCNdN6BN-AKU_f2gxRfIPjagDZ6QI9LJTWySWYNS2PXDjKzLo1DqKUvyOrKPmAOtVDqhA2GQPzbr_-E0qjtymh4uelvX_GVzkeQE0olM-nZifDbr_8gt2SeNEIlMgRhUfRBiQUqEJ6Z__6HbMhQe2tk3gdtYGEqnZOEhdmA0Nu6QMuHQJRCuxrtrt50kgpBeHiZbfrZ9hVYkcvKkdZgiVs4gj4rCGsUrrKYg3DBALWFUl797wFzFTaLDohMrh4r3Djx8-z8HOanH-Z9yK2oNTEU4G2FcP0_H749_fE9cWMv33ycw8f5j7MPlxdwdg0XlzdwNf_ww_nsqg-zi1O4-Ti7oRtE9-ny7OJmCDOwGIIhBjqYZQjaddKstw-ZsBzXS1NZIpDewQNaLzN05JEtvIX__HYAV__h_mb9y8mrbw_45IQGaa3wkhNIV-sFWnL-ysocMqF7-3TcFp1jcmeYs1OmxByWIhM5OtD4gDb5s_G10FtfSL06AYeeA9xUnnS5grdwNB2NevtgNAiYjmC9DhIpylFkBWizlqQR0QHmK6QARgcLkd3TxUNyDHmbAoRzIBNKOf6ztx8ekw7UVupVSB5SoEMoPbMBZcy9AyXvSfG1dF7c4xCuDXhKS1egUk2uJ4Ung8PBFLyVnPIgtfMo8mEsGjvOAeexdHBI-ojMGudYmdej0QhyU-s-1IXMit4-CUlRSNoHpZE50kHiBpTQOVUKTgByV8pcgJdj4tg_Go1Gr-DleEwMxuHLtPP3uEMUrk92nuBvzPQ9xVE6X7OMKlGNMUvWvg_0yAg2MD6g_80DWqFUDKqkeQyoqLMrEH0wVUBdGIWwlkrJNXqOG3JyjpbiLsRM5VO98qLEUJln4DAzOm_SQfjGcYVQS3CZUAiO4lRqJ3ME6anKIreDtgUISwGBVENTi3Dwbn7zeT6_SBX1JCRUaaT2jiMzOqHyaDsJpvOmBkut2WJ0vX1YYCHDvTV7huPS2HD-0SvBy_2gPEdovBG078OEgwWxHMK13HA9Eqq3D64099TKKg1CGc4DhL8aqV0IHgFr4Yy2W8httYalDAlCTs9zFd1JfuHbMtwrhfVQG-sLsCi4_vpaZjiEs9DNrPQeucZdXsy5gVBIkOUO1zJ1094-3Amb3XHuOnjpQ_GmDgeZMg4HQg-oxlJ3OqFaShfzUFKTLsS0EOoBOV2le9UHQxVJhEaB1OVIeKyD7CcynCKS8je7H4aLsbMKWFpEyAojMzwJPKOnNTeTGFIvHJxdXM1Oz3647lPJ89FHL1xXcHw2dh2pXWblAvPQoYRPzPoUYKbKCh43lOIoJI9REqdgfBHDhr1FwdoZHRT6ICkOKLCgmL3jtheFU_frOOGOY40zTqyxo3OsNkl1Y3Ophd3CzGbFudAraiRGP6CmfhCsENxfX7jQjolYOu4BdPI7Duk3aWCR4i4U8mDiljlXlETCwez0z7Pv5xc3NMZ0DbOC5y1fCE12UFdwhbE-NLSQwyHzljRmcD2kcPAweU0VqRTOt-fZOc3MWI2WG-FkMj3cOVRwZImp3aMToTrVnEmq8aSJQvEQR0eLjuynq5UmNhhHjJT40rNX6LxyuYZcijWS_tHiu9iMuDHGtlkWkstDW7IyQZlhStRSr0LdKo2TdEbIrI0OlggP_1Vm_ru7dM61UPfBLs7TxRZmV9_D-fziw83H1M-Ph5PJ5Bs61QlVmZVFGmLd3yphkRtePKRQNMhUkQ41VRBKKm71VNdTWfZ0_FQbF2Td7OLi8mZ2c3Z5MYxNazxknzgQlTepfdw1oanVNtxZmxxjQSqC46mUcPauJJUGIufOITmA-UPNvpkfs0JI3edrV3R61GJKtJBL56XOPM96aUQg99PNzlpg1sPE94aj1ayZnH3KzB2phlTbxEbydK4kxqIcRpzJILi2qfYhAhPfMLyTjann0innco3a8THDu5_g4-zidAhznXM7gsur0_lVUyXKKjYooFxs_FD50EPapYSOcEnd1VbadRrH-fz9DemwFlzQaa0ZfOcNhwkVfQSUlJ6JdSmk5XGsFjZvW2AqjWES9oU11arYOSN4eff59vTsL7dnF9dnp3MKVu7xifFaUK3EgShpzRALaua1KF8NYRZlXL5_fz2_gUKwqxcIC7lapcIhfZjpTkJpqVTjjDigupj6pB9p-8JRbAefihWdpt_R94XjIx_gxiMVsHeXP_LxcSuKm4Arldi2Q1-mUFgZHcthEjsQanYH-XR8HBqT85Luh0mlExLNStlvehglUtx_1sKupIawE4k2UmCBdKIuROzBEC7CqUFBB0Q1KG0KAu48bvwdp57lICESHek1Ig-beNIZUlrd4vYa50IO5k7LSg4mFzixjdpMaGZPyyVnEa-I3E5QLal8UWOhznB1eXYa9GEDu7thqhC1sa7ZLcuwdz4IqThgeAplvw1ocGonPBo7XVPMWN8kgEvoolI0r1AnSbylDzlQSBUIqURQ3R7weaRQvwxDYyrx_WYobSXEqv_CNelZa9DUomtTqRxWhjePMDqzg0qqLeQUplpswzFyvtyF_Xrvt1__ucc7Ly2rd_1O5qc5Mk4GfEIL6TDzgSdJr6m79ckftdjCAn2NqFt3cJ-NqZ04h1Boh5RQrjGeAcendDRtYsd0UfnCWLjX1GidWSP3iy7b5nxzg5ws7XxaCoXeh7KCVtLOzaiLACd5A8uMojE9-IWGbQwEe_sHy9fLQ9wLExFpWeAGHoSqkKfzsFRyOPE6wlvHklO2D6XJCuzHhs4DtdbG864MUt-7YY-xnL2PseN9irjTHvy9B1Bp8vF63YOw2k5HPYi7yfiEv4SCX5U9gCeNsNdjROSJIXR9HwaDwSDspiE7w1CUOu_g__Nhfp-Fuk9OJX5Ig1TcOjNlsvtaOkzhVIpV0794Pkkty1aauY0GvOaweQNi1ecyMRhPmst94C-DA9pII2WNRMlXBgfHROpMla4zY746mBw29_rAXwaHvIIGchIYR8U0MVFNrB_NTSFQjUPm3K6hbmcKLdFSXIpVF9gTXSSGOjdPiAr1yheOu5I2zDVGZ8sk5OAahXaw93ioCm7cG_Ygtoz8bYAfqPFYaWxYaTRhMTQdU5Dtbv7xQrv9hwvTR9_Hjx7oIAE7HNorvJz1AH7phF-qESecVsuKZiHeRvrdHZFyoLPGPRd-yVguOLR-yrh9JGN5nft7V7VWeYbpps217hbU3u889IjgsUEUznGtHvyxD_Ob0xzG81WoU3p3I0mpRTU6TtctoIAbWODWxOUhjonEtLMs8qwQNutYnF2YMxpUI2x-ZA6NOG4nqMi-W4Rnfc2uhpfjg4NpCyd1sKVfnjDS-FVGI3r28Cku9Qyj-muMjlo-O5jWUz71Vy07PGoM28HDnvJxv68PW_cIS3uG0b_gocSpm3o70UnjwB8Oym508lwh87dp6e6g5sfPpkkE8veuwgN7LenxhEgrh1T1Qs9K3FccF-lFwpfRyd34aKOOkzcJDjhUEBxoqOBHyUrSUrgrGjqiv4SFHnUFt1p0BV_7KpemY_BBa7BZLmWGu2LrVuyXUNdO-HU06Aq9QQFXxqyDWKbvWJtL_dha1xH7RYB3J1xbJXatNRY7Ut8cN1KdN1asdq118NjaZ7Dkx-HdUaMreq69FTqL0o8IzBmPjxrxNBlud4XjkxOePC1Wj8rY6HnhHwKY0Q2vjukxvNpELI31QrmT56CZOCEFEPP3EjE-RQaVlC0dFCdiMlDL3BcwPuRetUsPXfqD6Tc8Q3-Fvu7SH46Hr18fffMVerdDP40KfYV-R5-j39XH7dj75qk-rcMxBge3upUSPxOTP9aXaSps2DklcwJbZ4QJLUkdWknQxWXM1bQ4ChgPD2ENBId5tINcuiy9yEmNuR3i0irEgRpA4IBROC-2ARX4Ey3eJFrq1V2QzJJ45QkYsSeYOEy8jmAhcLxIE5QBDIog85S-AV0am-6ZU1rueHOh1p_TBkMj1u1aSA1RPJkcJkzCRSmLOgcQ3AMKl57OopY6NzXxqKWO0do-ezQdpcM-CIf9iB526MejVtbz9PUu_dHB9Kv0bpf-gOrXV-kf6X_8iH8bfA2w8m_13rDhPYF_4-VuzRp8t9OxIlQXp1UmbjsL0bbFDnaIWwuUIcBjWVktPb2e_TfG2k8d7MaBxWVCFIXOaLsPvzR4Ob_9dD77fn776fL8p4jEaAL0IsQWaAO-JJhvA3W94oE34B_0qmbgvAgYbikxQ0gvkYQGsXBGVR7hTvi7sO_RnhFADpHdM2MGr1u0gdS9SxAfzWgNUE756UDhisBPAmx3YKq0-Ekf8j3hiM2-zL8AYPTM-PZqQI4B9vmpmWZweCCUXNH-GSySJIxBmASqd2DN9A40qSzg-vzy0_w04hP0YoE4U7ovhY1vORoQzkYAnl3CE-lSWhfALNKTHiPBQ3hnfAEL1EwelmUngq1j3tv5VUyEKEXg5YySOVTaSwV3n2_f_3B1cXbzw9X8lnxx-_3l-fnZ9dnlBZc4S_YSlJ9-IcCsmU2CDfn1XMc9f2rKYSHCy2TICszuMR_CfzOiR69UCRpgvCbhTNvAmV8QLG_ZpFB2A8gTX823QEEDxy9vHdJvAwJtmtvp9NrMkfnb5W2O7h7Cuyy00A2mWE8crtb0TmjczUdw8mfkvzbTdqL-bOx98PseBcLqVj-VR0yXX5AX150oJ1RtkkML8-Z1K-e6QNq-oxBXP5VCr3oBPGOnPAZRO-hPp1MqLMzzzWi0eTMatWMq0Sa18SlHjwK6HCfHLcMvcESxR3Arc3xGx3Ca4d8wqr2ZjvrHh62O5IHN4bSx-13Hte4ZHfnIOxzfHE5Hff45w7_EkTE66RVGcKK05q-Y-WcAQb7NMPHtYgt76XVrvC48wt7B6OD1YHQ8GL_eY1zil97_AQ"><img src="./examples/hexagon-pavilion.svg" width="270" alt="Hexagonal pavilion of six wedge-shaped galleries" /></a><br/>
<b><a href="examples/hexagon-pavilion.arch">hexagon-pavilion</a></b><br/>
<sub>Six polygon rooms round a circular rotunda:<br/><code>room … polygon</code> meets <code>room circle</code>.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVnbbhs5En3XVxTsh9iIpGnJl3E8cQBtosTGJHJga2EPBoOI6q5Wc0KRGpLttjYIkI_Yb8iH5Ut2q8huXeLJZHb1YMlU87CqWHXqol0YgDUVmBxyU1rwaK1IEbIKlZJ65mCGGq3wmEFuzRwuR0NIzXxhNGrfhoUSKWYgdAZzaa2xmHVbu61dGDRQ0oEvEJyYIz2u40Fyjq4NzoD04ApTqgymCJWV3qMGo1PswqQ5aQKPW7sw4eMmBFmYCgY2LV4LPQMnlnSI8G2WxBfSQS7V6uy5UAqdZ8kVegS8F_QJTN7a5UcWwnu0-pSFh5WKUGrp96o2ZG2YianCffgAXz59ho8QX0avzNUGUfqCrBCstZe0k32QGqR3jPvdr8ubEaTG2Exq4clSC2HFHD1a6TCD6RIqmfmCQdkqQdCbXhteDN-Oz9vQ2wfhoOyB8LD35dPnfYIVGkSWWXSOdIGL0fV4MHo-hC-f_g14h3YJMgOpnczw78k7xdTM0cGk7HWfyuzZhE1hOjJzYNF5YT0s0P49UKmdFzpF9hO6JXYdYRGMzdB2pM5wgTpD7RmY7oV07q90Dl4J91-DC7AoFFjMFaZeGn0KmTEWXEV-34ZC6hk6cqi_JzTJWRVGIeTSd0zJXodAH4IwHTkXM2RHGxcWkfyVIk1M6RnaThFJWlbG-oLEzKSeQaqMQ7UM8fXm4urq8upi9AreDi6urmF8PoR_ji7G112Y1DpPauXWsesrf-TAVBqMlTOp2cCitdsEMXsThU8d4J5cGF4OruAeMJshe0zZp0eODpOEvBE5-FYbeslJkrShKmRKfroovaNgN5p3fPn0mR_owkBR5AlPOpKEUXzpoCqEh7l4T9fQ8Enz6ZSdm6-n7MMc0YMyqVCd-7MKvFn9U7uPtDAVvrDGzPle4b30aYEabKkdTEX6Hoz2hiPaFcIiQS-E9UuohFKBXMi56O1g88Rk_cSkC-MCITXa4R8l6hTpW228rPlQ-Mg71lSPHPjKwMur4TBQjOPLnxpf8COMCnQEScGGZ5sGCy1hwpuYFXuQGwtlr7UbhDzkt4RXCYrOkTpaOcsUBp0IhdYmMp_E6Of_VyzIlycg8kIldUZJQ7MmQSzC0aYq0CKgchjclNzy8uXL6-H4GgZXQxhcXYzP3wzHF8_bMLocw_iXtxejV12YMJs5VoI4ylqxZMjb_g-3Bz_cHrJJBN2UlnrW2gVXzilrSd9t0kIqtDYeZqbWQcAkN3YCe6yccPBUizk-C6eQpxIzE3vIXKJt0w2x5UBqj3ZhlCBe2N-kHyV1vKFSW6PUf9mYrmRKgV4IPaNjWRuWP5AqRRMh5x4txcDc3KEj-1FQmUqvjHU9Hrx6NbyCi2tOtc8vL69eXIwG4-EqTgLVO3DSw3GSQF5aX6ANGYfTnbeIPkYeGM2uJh24gjx2jkK7xo2DYVdBu4QzSMJXvdrR4_L1cPyPwfOfg29zWJArCKUcOC-VgtRInZLdzR3aoDlTG9uGPeWYCMEZQJEW8HupmXchs6KKibowlgyF95TojAWLvrSaPE9U3nBE1DSQ-lIotYRCuGC-m_Nf2IRvXw9GZL_x-cU1_9PdKnKk4yOpymAjs12aS2bmY2ldae_kHVLmjoUEMUNVGEdxyyRiMequcCYpowoPAv4ohaWbNnnIBuwNG3ErWILgyUQT3gpJ9RT5L_t_WkiPqS-tUHRqiNNAySErTJEsWxhNdQ2LKz1k1txx6LZ2QYmlKX0XXpLKLG6Az-UdnoKSd7R_nQU5r2okP9Ked0AlIwfNqIBaUvi1dkPc4wYzspoUsnDUPYR5wBAzZrvmpqalVL4LI0GFgsmDNY3NujAy7CitXdDCWlMh0ZXQ0OuewDw4nCc9pWMVdjKDnEuIoKTCHfawsBoCjqUPN-PEMpZflO-IAGp6iMEXfHiHL8gZmJDxIUOXWjlF6HR-d0ZTKl0YyzkqbwxKFU0T21x4IrwdvSI3prsFJ-89ooZSm6nztkypjFZiiiq4TlMXpwWm79tkXqboSixdNxQHJHa-Ih_Ntot7LebGIry9GI2GL8JdTRgddr58-rzDRdB9e7k_aTd1dSD_1i48v3zz9nI0HI1jHbBWa54SN0qta1kjWxqpPSj5ntL8EgydzzGzYl9rZQgWckhrylnwnZwK13ZjIFJwo8ygHsOvZX7MYGGcZGqgxJVbxC68wjpl8hVaOSs8qUNOxCG7CpDmOzJZ4IaJL3COMFUlLqykfoKVGg3eDF9A_E64UNWIWL6lS6GNXy7I0xV6j4Fha69ts8XJZU0NHzuDCUyVSd9Tzp9TWAupuy1ufXbGkb2uTLUDH1oQDTCftwB24SgJIdpLktMmxNgQ4c57SUJMnr5vjFmXmJw209B5THJVumIC3jBoKHzoPi3kIqVeItCQEjrjJFQIlXcYV6Nz667QbQHMrMzgKGkBaCaectECyCSxX0nF0h1aoVSrBbBlY1pS6EM_AgBn8CRJkvVSeXctPW70iRkufPETGK2Wawx6J9jBAmrMRnDGOXATNeCEhHEKYjtvelyEam8rY0bkUIqQvL9SodqG8Pc4qT__Vmt204Oz-PivyW_1Yn-12GsWD1aL_WbxcLV4wKC7cBUKnLq8aZR37JpcDmLuQwlu8pBIg_l06K63bo_OuSUxk_ofEu-2B4_hplcvkXC3fVrq10sk2u0BLR0EwTqdTmej1-WV_-nV-ov-ukW3SFLwBcMZHH7lN3xpCnHB5YXQWZvYjlZDGR8st1DGN2Dng9evX8AZ9E4eAkutcY4iQcEUfUWsXZMVwbs1mcbnN3AG_X6SrBaHL25I0Ao64YHmm5dXl6MxnEHG3zz_GTpBkBY_wZWzzM5cgUrRQlP4wCoe-0cJfIijhL0q_s32aSXbD10hfNyAq95Rn0OTgZo_1uCIRD7AHonMWPyBRNv_CoXM8U5_CyWJO_eqb0G4v4aAx8EuDdRq4WOwFad0mZ1NMeP23UeTrL2c_BeGu7iPvhPT4T8w26k39SiaT5LVztKhgylmdMDmScGItKm21uZJ7ArxqPok4YudtU3wGHq9JGn3e3RiOIpgSy-V9MuN89j7as2COTfOq-A-ejE0mp0LpXZqJRgglTYtQ-eygV5XfP5rkzfowVtX6K95T6gkKvgB-u3jJ7Xl-MQImkkmrVhJhvvahZdcSPJQxeT5GtFSfxU7qqbW_CnWmTZDHfZwhnZKZrHQ0CbiKhQ5uApxEVJGvDvIlTG2yw8FgOws4PO1_5hwvIRU8uQodtMh8njmE6QKGm2AWBSWBant1-sn7HoBq8fzjzUwEplpurWCoWlWdpa9Y-81GprgEh76B2GA4gsgbloTZopZ1HliNDylQ57RjqcL455NwMfRiJKeknBTNjW9DPG1WSBfTuhbMhlGahE2zM9cXdJzJrm5eDE-50YjFo1iVf_F5zhJkzSPHKSovUXqirsPqEu-Hrynw4aKfr3Slg3XWGNdd-ELBqwVkNmZ4efW7OcI_Eljvl6SJJFZw4iCOEjqd0rehbg6Dk4QX9EXKB-s7u_h7f1GiycNxOrMb2_nO28IoQOHR2vec_KXp2_Y8CipSS9sP9raHu_1sq6cKIGFsof7A8HVdMi0XHaHmU59Yl1jcHXPewtxhyAi6qrjC-1HKOpFIy816mvPxG6t_j64h8zj6Wdn0Iu5flvj8EBgqkCc0dT9r039sWGbWApPl7EUPo3V5UJiGLvNUbiymc2TTYg2HoXRH4cIQb8cPB9GyL1YSu9H_gnTDB5xUWxw7K3qLTAWxFYxHXTOS6ulLy0yJQV_iGmMhtz8OchMUz9v5h0u8vhwalaRW4JA0xRE9z3y2bXc9tAplbAZ0B9rprh1SuiQ4iscw-DHhN2vY2gLkLpatBDfCJAdMyB6swhCbyE-SZL7J7FS2jaDcFIDxLcH8BoptyQ8PHoQr0qDK6WNWdfwol0D5BoeWfPHP1PY5AIg_JV6NTL5k4tivBOy4Mnqdq5NLnZqFx1vTFLAygzd1ijlFCZiJuiHjwlkaGn8tEbr3BfVzV8EjcOmDg_Kmo5mNbDmFiEVXigzK8n55T2rOLX8q0M9BMmN8dy2PeiyTur3AHWCD_9GOTdSH87mVNT3KOGT2x5Tamts9yCyp5EVxLf408x3IP_Y_yvk3ErqkuLb9yOf9LaQP651QPXPM53_68V4g9W8o_6h61u_uDAHlX1IqeN2cNv_8unzbf_xTTPIDV8w9O0hfXn4-Oaw28xxD3lCs4xlFhFsrsTsp7VJMJUTG73zI9cUaMze3_FD422vXbfm-1s7-s2OZH_tZ7rYePJq_cvV1s6D7Z0HYefBn551uC3dYdhxSGcdbp5FkwvpFcZktLDmd0w97NDgtBOmwWFqE2iWR8fvpkvYqX9_juuUAnb6Sf-4k5x0esc77DkfW_8B"><img src="./examples/terrace-row.svg" width="270" alt="A terrace of four mirrored houses" /></a><br/>
<b><a href="examples/terrace-row.arch">terrace-row</a></b><br/>
<sub>One <code>component</code>, <code>place</code>d four times —<br/>mirrored in pairs, widths from a <code>let</code> array.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrbhs5sv7vpyg4WIy9I2lbkuVLZjaAxxYmxskNtjM5i4MDi-quVnNNNTUkO5IyO4vzEPuE-yQHVWTfJFt2JpsfsWSTXxXrXkW-gHP45yiCFQwHMIdFMVUyBiWnRpg1CKOLPAEBsTRxoYQBgyKR-QyM1nP49__9C1yGcPN6PL7tnr-77N6e__RmfAO4EvOFwt7ei70X0O_BxcfrX8aX8PP4_dvx7fXfenCbYRtKWhCQmGL-EgRM-FdEU-EEUm2YSqq0NiCIn70XAACTpVBqAjqFiTDxBDCZoa2WYx4rbQuDHf66ENLAJDBm_yJ-LYSRxbwnTJxNQObO6KSI0fY8NjFI7BBjV-9uLq6vfhpfgswZq38MK_pvDjHmzggFU7HugNUgHW1wIp9h7sBpEEpBqgtDKzwyMW35GPgZzbpavNAyd14OLjNoM62SH_zBaX-sTY4G7ELkiUFliZRC8Rmthz34Z_8I5gNAEWeHMEWl8xkxkGsvYCIYC2PW9BsbZ5gUCsHopVeGFzaRXxrpHOYgAvD46ufXtyBMbMEIlyFJV3g5uKUGi3PpN1v-nc3EAiFHTGwHElRyikY4VOuX_GeRC7W2MmDPjExgipnME5gkaGMjpwjd7t-tziffWZgEu3NS5xMwwjo00iLJiMQIU3RLxByks_DL-Pr26mJ80_HQVm-xp8QaBCwykTsyr0ybBKwzQs4yByI22vojVPIyuNDG8e-WQt2D0x5bOhAORium60yBoDCfuawHY8a6R1zYoF5PRuZWJui1KWIkBOtEnrC5doiYR6YFl9fnn67e_Uy6kAnmTsZCAUoW_VKs2es8todiiyEmhIk7xJjI1_BF67l3v0EPbl-PvY_2YLIQCzRwPgBF5GOxwAl8DxMbC4XQfzmIogmkcoUl_yLPtWMFMDRY-QXh_bvgJSUwHdChSMgZBaRGxLyDv40imMO0kIq8nc9K5CoD1HPLHCicYZ5MPHAqlWJhzIWZybwHP2mXgRNT0qMwCGmh1BoSNPIzJh3ItcukN_hY56mcFQa9wXlYUNK6YHQ6Z7uHBctTKciEizN4e347vr46fwOFxQQOJrHOY4OuEYBshkr5aJJgKgpFThuzg5pafQthnKTT20M-K5EjUgslYkxItq4wCBfnt-Of31__jbzJQSZIiwslcrDr-VQr1vIy7sBUWJkHm76XLs4wv7Myv-9ArIvcoelAamQyww5Ypz9jDz5a8j9vL8QAeypJDmI9Rwu6cIDzhVt7-xh6-xj_94c3VxdXtz5Ww8X5mzfd9x9vb0jrPghpR_rkz1JhDyaJnIMRiSws_EiCvEpegcXZnKLZj_mroErWNy1NpJijQwM_ktKvklcTcOIe4af3t69hhnqOju0tAYcrB6nRcx_IFTKky3ANuZjTSYMjXp9GUVQdkoMxsnnkZLxg0K0XmHhWLYjC6QkIRYlnDXaduwzJnC3r6Jq05GEvr25ur95dcNSDgwSTYqFkLBwmMF0HMt_7k3PUd5m0gOT6XdoRYql1ZMQzdIx_WEuDLSKTbBV1YtV63qEE491urhOEaeF8krMTtgcmhTYEXiccC4YdIuSWLGjLZogOlrpQSeDDx_6ldFlLGnbJNkWOm3ZKSa4h1taVTlVCS4Uhv-nSIUnUX9Dork5Ti46loykjxq5DO-KMluNKxE6tYZmtK8OMKYUYuQiZ_NPd5dXbu6t3N1eX4wloU_7m_S_j6zfnHyZUFTQJkT1Zir7v3_lDSwdzFJTurTfrSyRHrOQDky86x4llOSYYK2E4brCdyDxFY8g5yeYW2rL_duqcSaGFyO-9KA1VxpRaBEVn6wPNzS8csqdrh906bpPAyeFchvMenPuotgaRJLSYmbL_878T0Pnei-0UWJm2LaZOO6FgZnSxIHZCKcK5qoymvT2OIPvXobK6pj--8bXcPvy2B1DkJLT5fA_gBUw4_Y6iCcdP6EfRy40IxpIbRBFZeHxfc0OBEIZRxNYvypjGoCHMTVJV2GwCYiYoNTS2cd4BSifQ6_VGEcRam0TmwiEcDAfk0F3oj6LDHpz7AkGnjNyPaC1ZNHGLq4VBTtjC-URI3AWLz8UiBCofbKcivqcaT5e5XPX2QvUxivYAtpPiHkAjJe4B5Nq4DIrFHkDlPlTd8cJmMtuDkHP2mOtut9ulKqOIHeckLwSZw2QuqJoRCqpM02mKPii4nWm6_G_PV5Egk796OFwRFKcpGd_nJJdhFMEWBfgNDqJOdAgHoyiKmp9Y8If01_CJimeE3_0hbstibyFzLz_7EpZoHSzJzv7RrIPhH4Ai_KXX4HR5xxuqEzZ4JQv7DQ76JyVP_lPg5PcWCGPvABkOSxD_qQKpDjIV6-8s-HKPj1LFvVDx594Jk6q8LIv49nEMpncWnj7QqZesZ-f0gSNlQqm7_GmgwVETKXwLBxtz1viMxuGKq_8lF4a5D75s6t1RFJoM4ULm5Hh3MCAT6PSPGY_i49FpFP3l-CiKQFpGFzDsHnVHHLEps5FnJI2U5JOfbxK84YSS1KfCHnwS6r6Mr7R-fH5z68MFM9Q09EkcLydgitx6O-q-Cr7XfeVNrvsKrC5cVmaYReF83V61TYFpB4PRn-CAdx92YBT9CQ4IwddlJ_Q3Bjos6xpSyXcWrj---4FEx7mc0pmcFg6p4wrAJg4FP1z_2WXoBHBkEY7YrpKKs774b1sNm9ijqt7jVs4r2CuEf8N1yODsNIo6Z8ekpbLuIi02VoxqE3tkRTR4AsObWjCGHRgDsr_DXXwEA314BZ9lF0ZTBhsrgslzBUJRxobiRsAQ5iCkVQg6rxyanN1XhkrmXDxykwxzpNLM93KibMM3IhaD7fbNqNM_GkV11Arffn8IyD4BdNICOhlVDl4jxSLFO4SdcefoqIyB_tODLOEzzhaUEM7nM8UuMPsMsJMW2MkDYNaJ9KnQ2oqBAayKiE0wpafT9fPATlpgJw-ALeMly34n2FkTzH97MJMt4_mTYEejJpj_1s5oXF-IFZZV6O31OQ9sypKDa0YqonK1_oEmeYX5jN_Z0qUkhzUqaTC3xEKoLwgxhKMVOUjUAW-V4IUF3rKAhcXL1uUy4pJW84-BXzYIewctD2beuWjq-MLWN1hJVbqHeucZ__YAvnBf5QeY-x_45344gh8xJn81nGuBg4zbSKs82OB4s-LcCEpMUcH-mCqbPEZ4LZTa5700IrBAMWUNma8BmzTKwWbZCBKpVo5thLOSSrNk32_uOBnQDib4AKk4kyoxyLOZOoDw_IuPQwdcsUZKQhdhx3e27gwYXcnP1Oy18X3cCuKqfH8Df9gU1ydK0ee0K8iqFFdjlLd5CJFipZOqfquJ9LcPIdIGfINIIvPtQ2DzEK2Q9tghxuKrD8Fxpn2IlmE9IKkLeEOb9jcP8TiRZXy33JBUiA1MhI13xDQaRD7pOeZbRJbxNva8xj57HvbbNnITm32cfdI6Ed9b2L_hn9s-Gf7uTewJ832_wBxKINpxSmGm7wsJJm6dNmKGWz6Ztr1-h8dfY4oGyeVLQhvAraOlKZ8sTR88WJq27e5k0-6ORw3KjAOftLk3HAeYrk5TGW-eJ4wCGbpK95Xgjmu5NV0G_svv2i8VFVA2sGmI4ALbrQTE2KNtQ_jAG3zoqoygcFJJt96I9nWN_vzY_mC0f9G6omncuHBtR30oZ1rh_LiN2owwrahYoIRpkGevTsMUIS4cI7vM6GKW-ckkzRZsddVFtWk1BinvDnxOJ-pFnIXFYWbs23bfXzC2xViHGaAfzIV7gLLd19osxboHYzoGX1pV3ZyfG64tD5b0AvPQYYePpDzN_QWVOzqH0GywIqnbAVjKxGU0Gog2t4Ue1G8LX-iOI9q9janlW9QGT1ALrbPfFr48l9pyi1pzGwWCzW3U8931j_02biF5G3t-c1tlVYbWhJ4wFBRGFw5J2KQggk3u5kLmjUwdyrIaz5uFH9DYpZ_ZOQ2-BnlQ_lU2rzklYZ7WfD6quir98FZunFkPo51bWfQ--pZbS6pH7OGPC9Vvuwup1W8tO4qgk8fplge9q5q1Rov09G5qgcqcXh64QXr3mX13UW5v7mbSp6MHjMLHZfJ7i-azjL2f2nB1SpG1jMf-6k-Q39_TnJqsRafelDxNy3eyCoWfalrfwbJp-AY21sbIJFwLcnWul3mLMOhylMmKXgs_ZKhNs-QmcLElov5RbVJUXYFVdD1pKJq1gFjUJRrDhP6zpSQP0TTxOrHUWOUJyGVC9zdsuEx_8JDL6KLNkNeet3bmp2wW2do3DtXkiLe0oHwxxSBlk0iiGdV2v41CezZB5tsgJ0-BzFsgPuFucTKslXRGeC0Q3tNIrDMlvtCfu9_0jxpUmSd6yVo6btQVgRFvOJWW2utJhdWGZ6wf9LfWD3euP_u69UMuDp_PT9Tx_dlz8auGrl4_2L0-tATP5Cd4STRqeMnxk-sHzfU7-T9u5K3n67eV6HbrN9pav1tfX7v-eGv9RhRprz8aPLm-diiapXOl1WjHOsDPOKZr_zPUbDxT2FWpnoOV-Uxhl1oIXId7fq7-EiOWFqY0yvQX__YHuvu8uT2_ur77-O7t-e3F6_HlxL_ymBfKyQDCwL8WaP3TjDwJY-dUGhoVoOFqxTqqIOmeyDXqFXaLwXGjFTmKohW3C4k0_pILFX4WzkcoJdPG9mHE20_rlmAwiKIV_dcQXypdly4-vzkevYByNhKef5jyJU053OUXNjTbtR1-EsVr6_cAU77GVShM9ZJjkUlGjoVSzGVZ0nP1UzUIJMG0MLnkS0T_hsLHLZIAjbAPQ8MVGtXteQ5v2n8MJ_LN66CS5Nm34JwefSsOn2sQnVY4T52LgMhGyBWiXm8UWuAanLwqrYJBx6fX70HCn6FxbE51q-OaTGi8uXlskzjaQaJ_WqOTl3fYvesBhm9bN7v8h6gMt6g0pFQTCaPOs9qT6JSrQYPMbSnwZ4INhl8L1hZxG-y0BhuGvr1q2mXs78a1fljS28pM0N77EHDUELTXa4MS5SiaqJSULtHe7z8fajCInoT6Gn09QGGD1_7xs_W1DXb8HDAegTRUplNRjqMGfsAyqoMJFQmrs6YzaLOGKeZxtv8oTP-Uc1vUiMqbMCiczGePQ_hy7Kshwju06qkHZ9NqiBAe7HCdwJj0aXVSY47zXwtpJNp90mXVHT-JHxqRgD98FP8GDd2NB3Ta5bPUhXBC6VlRv8mz_GyVurMJIU1eVg_fFobHR_6aeuGyqqVjXqrXJ-WMh94WOzRdVxj_eIAe3tWX334wVT5aK9l4LNmECVzDkY_bSvlgcLG_c_PR8Vdsbj4ybMs89GXhhV-_FD1HHRZu3fVta8-Plp8BRxw-DuffOsLz4UaDXXD8ZBK-Au74dBOuhbeMnwAalEB9zoSMFJrKP4QyjP4TKEeP88LvTzd9j8cOpfpPo2_YfNam_AcPMGqizP8gyEn0HwA5fZyTB4Xhb5RLPUTfsHnQptwcuSO9llMyls5f_1Z1r4UDi76YzsLr7fJ97yFsVeKN975h_FoePwp_rZ74VpegxIeTTmFI0Auj_46xe-SNIi-hlii_m65h_9zE2Rvh8w1AQi8E9wfR4LgbnXb7xz6v_r73_w"><img src="./examples/library.svg" width="270" alt="Public library on an A2 sheet at 1:200" /></a><br/>
<b><a href="examples/library.arch">library</a></b><br/>
<sub>A public building on a real sheet:<br/>A2 at 1:200, axes, schedule and legend.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVprchu5Ef7PU3RRP1ZKSO7woYedtatkWdlVReu4bDmuVCpFgjNNDVYYYBbAiNImrsohcoYcLCdJuoHhDB-SrE34hxwS_XWju9EvcA9O4UUCdzBJoIACvTWQGp2ayjoEVyrpYX4P0ju4Fh5BSY3w73_8E3yO8Obi-_77T28uL876bz5dXL69ePc94J0oSoWDzl5nD_6oERYi9WDstdDSoWO6ZW4UQqmEfgkCvBXaSQ-5UAqkA780MK-kyqS-pvXCg8uFRRBgjVkM4CrHzh58evf-9OItOJkhUTlvEX0PhM5A6HujEQpxD87TF1LDf_dBYrvclK4Hn89cD7xMb9BDIdJcanQMDATa2VvBlkr4hbFFACbhjVb3sBT3IFJrnGOJc2y0M4CPhr_JrFhKfU0LBDiprxWJPU4SKAoohfXSS6N7MFtOiXjWA1tpTRREvaiUIssUsJSZz3uwlD4HTeqfmRJp3cxBWek0R9pgZw-CqQTMFsbOQBlTvgSU17mHk8CU2DjeCKlnOArfLmmrQjqFA3hnfE4SoHIIPxmpeXOdPTZKLtQtupX1LXohFSlelivtOLS3MkXgnc-Nz8F5U0KGIgPhgzWXQqngH1e5RQRmSYykq92n1qrLzTIVDmFh7EsmAZj9YjTOgF-0phQyg2-h0vFDLUJwXung7fnZ5emH87c90HiLFqReoLWYwcKagiHbr9I4NswALjzb0IGOWtkndh__9D2Bzu899mWG2stUKLaOqTxIf9CDeeWj2tZf1pgCHBmsUgjX1lSlC6crWFeAq-beeKGgRAu0z-B3swxdauUcod__yRk924bG0ljvgnLcX_46C95uoJubJRRVmtcKWihjbNSvxW5wT4si69E-WYZiEBTNpp2tFL0wla2tXmkKCXQqyZXmyqQ3gZ4X5UJn_VKJFDPetBvAuWARpP_GbQlvFguHvrZ5fQpcVYBZxDP3X7-b48JYBOl7tK80F_qalgk-0984yLD0-RZ2Ychnye73zB7mqMySVE6K1S1_D5tGlwolvLEOYLZ6gH__41-QSQtV-ffMLPUsmAUV3tLPs5UmXC4WHlCkeY-dRwfL7vKGNMdba7RbnZ1P7799-w6EtWY5gD_qVdToO28s3nPApIUU1aRSjE_EW8jhZzN33laph1TatFKCnPp3MPs8_Xh1evFh-undj6dXZz-cv50FFygq5WXN6ucKHa3fgmal8SlaSIsOyIcG8IYOumbJAXXmyG5CN7pk9aD2VqKrTz5CalRV6NqLWAXDERQQxK6sUHBtZdDNTNyhm8G8ms8VOtCiwB4o8uf5fQx45PBGk56dFx4L1J6PkTXL4JocCxE1pMbYTGqKhoMOa7V7FZPQD0KpLvytA9HDi6IDsAczFuQwmb1sIncQnIKoz2V604TAHJWCSZKwnwpYyDtfWc53dB7EtZDaeRAMvBApghKsM7L4YDA4TFoCgoBhkgQ9pKZSWdjJXWnRuUEHIArWASgF7fZ0FOBSUWIHgCyAMHw5SmiJNtbnUJUdgEwWDkTlDQileGEMS3xeOx0AhR7enP4ZXnGmSNj8e23jzMV9kxbFnXQsTKT8_vTqnEgnkXQP7uvTvEqVHVZBv9_vR6XVYE2p0X_WqwOcXEBmrwIg3nm00thgIo3OkWGgEPS1UFzqWPQIf4P9pJccwP6LJEnan0h-elp9SpVxCF9arEL-bhyjxYyyPUOTOlaY4eFLa_sxNlPV8XI9se4v0fmD3fl1HwX9tmv7y2lAme6WaxTkYsPWsoWHuMv1_dnhYyhJb5QcspICRHzagBg9AXGctCGOd0kxfhxiPG5LEZ9Yyw0G6W26fAzn-Kilk_CwUyeM9Kh2T1rGjg-7kdLl1MHTSKNhUNGL9tMmVPF1UCdrUCc7ocRXQY1Hbaj4tA7lvFgspu4rsI7WsI6SlQUp_HNYBrijQjLphajUg9GE33hxDyYn_HbEAHAcljAc097XtIGI3awHk_h7-0RyGHxm-NkZkPbg91t1EycupCNt-I1KitAZofOA2TW-DH0GNlUTvD1_f_UDSMeYSyu9R71eCoUCxJTPKXpWVR4VAQz9_vL0Xf_y_E_nl6Gu48QqPaRCU-7RJKLU3CCJuhjfP59-vPpw8X767vzj1UFde9KObqRxNyFVUhFEDEhMLn5DRKsTj5LOcxYkDZml7oFYeLS8yHOjQLwyqvOE9ZTeOQGGMMkaFL4JtdeihCT0TjF_Be_hGlxmr-yUNDUEJ39BODpMElBijgq6fyCBYdiFitpVs1jIFHdQjh6iHD1FOX6IcvwU5eQhyskmJXsyqSt0R933QmbdLQ3wb0FpyUHA5qNyF7J2ZEG0cFbPBCInbtZbheUaz5jNup_4fZtv_J04tzNQ2ByxvhsdtQQIME-LsMFFmfmcz_taSGcm2zwuaXF3VeYyg_XttaGX6XQJDN2O8Qw9ZAUet6A_n8FnU6DutqCX6TZi0UaM0f1hyB9XgA8jijXEk03EtpFP0xSdk3OF8Pms24JsrFqXHt03Ir2hWi43FRlj61xRtIc265gUHmD9kdd_MKbo1pvZeQJSo701qo179BjuWVwfkHecjxjp_5eCcyPSz4yG7yjvvSYpvyuNez0DL25o6gKXF1fnH04vVwOG2B5co0YrPHXKlSa1hilNFYdljCvmzqjK8xikoODrUWQvw_TDSM2tc-ygeCckwjcOUmq5kLc1v6daNxTvwZ_3YP8eXnGdfhCnDJyx4zSKW6zQkOfG-QGc8ySJ52nCZkHKHv0eM1czReoAyQmSxm7JYHASPSROrdh-Y7IW_BYk_IYTeC_IEeM1jatasrC9GnqZvTL8_ZR5Gh2XEfDkBdUTTdTfMLOl3BW7EGtIob_CzBnPT7JX2bQQMiSdyWGruAvc2RN5E6ETcWEWqL2BOgB2NjcVMhJvaFW9Cw_j0WECEZaUtYtstE324vhpsvE22fCI2D1ONtkmG42O18k26TgcT3WgjGU4WYz7w0A3TrbZBTK3STbilL7OrjEMx-eGImjxsGFEwWLdIkSxCVFsQgypsXkMotiEEFsQR43cw-EOCBFcdi3GxhBSGp5XEwNHg_MJFBCSHA9wfq6wivNCjZKme6BQLMIYfIlYMjBzkp7qPiUznFHUcSCUiXPnGDq8FbdonVCwH4YG3oAzlc954nPAsYuL01JoVIycWUlVJzPgws4oGYLaHP0SY5ygQTLvAKxgGX0u-BAJSI3VaAdrOqyTSdz7hjZHSaPNF6RM2hJYilRrKHXqeABlsgtF4cJvizKlkBqqitiknBw2h55H6luH3lS-FYeulfiFvv0_NBZnlfVC6j5znIv7VRII5XK4EqERk8goVseeAYSLC9j0LTMwqMNb1DwmW43RaHzLvURIKK1sw9t8NNNsZoNJzAZLqTOzDDXgYSsZhMZtpdGjjTAap1AUPvvcggTvDHvcBKZG77jBPmpZarwLN_YmNEbjtqUX-rEV-JeNvYx37OWk4feiaS4f3s5ePFaBSeQYUxQpVeh0a1-Hk_-RCc2NdjDhrr2tvuPkQY2tLw1n4ZnLh8cPH51d60eT560fT1ryDA_X1zcH8hZtuMNp1fuxIw-BrL4DfHQc0GldHVC8QJdOV03pZMjytKrVSZLckZR8qUDrdtFXZSyjJ5NH6XmgW99FAFErufBTkjv4C-WtNjlFvLs6bdYT2DjY5dEDbszQw6ieRunwZFxqn5CjeEIiPQlDI-Xgum9O_9yD40aqkyS5O4mDmHWYw22YUQBoQ40ewGrtUWjphb2vZ_K_bsATSv16js8-9Z3MXtfXWN8VxesZlJUP1XMpMcVvHJydv7v6cL66BM0kldIpNqk3zHWEUr8L18d0nUWY4e5NpMjVNvxcCevR9n1lNSf7fdKUgFR4ocx1RfeaYXcHK9SFMb601CjwPTrdHSFl64zzuDZrFw48IaLuetFvxnTSrdIHX_k8ENUXldWSbzuWKaxpqB5zRiXxcQy2449SN0XYUzDF0zBF7UQroLlwVKyvY3HbUGOdcKpoC_Is6pPD51GvqWONdfFM4pPDB4mXKV_abRKLDQ3WxOJrOLeIx-vEzUFr_kKykL5PF-O_-qBdrf9LA-ZcGddF5qrdrSuS1k0KjyFnQdRZfbtcn7vQV6-Vvat4v3ZiY29MUWXGd3R6dfZnYSnfnrsW4F04vL16BnoEBcyFvgFXCu1geNwfjaFgXO6nHZed7aM-WDNEaipNk9Bd_hctESrhMEFLQm6o5yAbCuwGg8UW9Jlsjn41m3DlK5yr416G7gYczXp_qmjo3SpJuK8ntj1IFQpL34dhdujzy9IakebrSmK8mC8Peao4DAVfM_HjmqEeeK0k6YaGC-mfNC78XcXlxjYFUp2Wv6WsGmfi-3fw-hVwXq89b-V3B09Hxzlx25qEhCuMWLY0ifq4kZql7D4I1q4-A9ghYz0B9mVbkTxkG7WqKEYYb9j8LbqbaGjujh7FOfkqnNiqUSzx0iuMqiut-QlTD90f-S9qF-SofO8RTnkTbxTeogoa4v9fTOf30D21aX4p9HX8npyoO0pGR_3kpD88Cir40vkP"><img src="./examples/transit-hall.svg" width="270" alt="Station concourse on an A2 sheet at 1:200" /></a><br/>
<b><a href="examples/transit-hall.arch">transit-hall</a></b><br/>
<sub>A concourse: paid and unpaid sides,<br/>a generated run of gates and kiosks.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVj_bhvHEf6fTzGQEEQqSOZEUUqiNAYYW3aMOhZAy0mLIBWHd0PeWsvdy-6eTkybIg-RZ-iD5UmKmb1flCzVbvmPeNTudzOzM998s_swg3-dJnAL01PYQFEutUoBfy7RqXIDf_z2O4Sc4Onb-ffnz0Yvzi--O7-c_w1WGtc-VwUc3ByNJ9PD8WB_sA_nN-S2IVdmDaQ9gTJAt7gpNPnPQHlwlAallSF0Q1hSiqUnKE1QGgRGXqXRrEtcE1ToxzAzg_3OHOVlybJUOuO3hG1BEHIM_J_XF5dnoIKHlExwVChKiX9HSLdamcypFDUENNewteVgHyrU14DOliYbAppMNtcRWDlrAluxtJUfw2WuPBQa2SFyqfLkYWlDDmnpbghW1m08Qwz2wdheBBrbDFVnEiIAdCkc3A63h-AwU6WHOfyYVv9M0-on-HGD76z7iVfVIYcfZq9ewfmzF-dDtmkj_heObpQtPdyQC3QLwQryh30Cu2INAWpr1hwd5VJNYFetQWN4RissNZv-UcgEG2WsEx9D6QzHYZGm1QLQQ-awMmPBc9ZumvdigIP0dpj2AxI_CE9fzp--fTWbw_NXFxfzMbwMHtARckg3hL50lHGKpUFvP8LQg0LN_z45HIKhG3JdXAN5T1pjUNbID2unso_A5RzC7B2mZNItaNyS81B6itVxWVmQ1PAQLDjCDOxqJe_h0CizHsPB0SFc5hTTKoMVpiQew-X87TmH1UtJvvn-BSxmi8E-pHazQZP5ITz763NYzOZPF0AmqKAoLvVW3uBsKE2Gtcfa2msv6IEyPgE0W_jF2g0fz8HkEBaZ4oQug11AisbYAGmOynC6sGlDxlUBMrUh45U1vn5LabLWyZxreAsvvvnscrAPJ8lRMoXMkj8DNLCYL0ATZuSgIAeZ8kGZNEjqSBxhUeSK3671yJYBMHXWR1TOnFKjG-xLJg2hypWmyB7CLtFYDz7gFuqz9MGhWueB3caMPFQ5Odm0hSVxLcRjeul9SRnvmk04NEdnkyQZxvdac8PBtQa1uMWV6MmEmDErzvyGQDqOyqWIvPqFhlCpkMcStl7xJl6Bt-TvWemDK9NQOtSShWCN3o4HQkF736Jb2tLBrObFPfjHAKA0zF-bzQDijqMkGQAUyOGdTZhXM59iQQMAn6Km6NkAwFgXciiLAUB77IBay8KcslKTxNkPBgD7MBqNRuBz0voMQu7oPaHlA2SKqdOYv47e92E8weSc97YM-YjQB0itM-SE7ktnOEWZxtnbQK5HWPOjSZIk4DDk5JhsDWxUYFL447ffBTh0xXSX2VeYxvMhyGNAx7BgrirKUOeZNJLmaOYvX3x7CXYVcR3ekIaDmORas63cTyiDg9MkSZLh5IskSQ5h9AQOpvx1OOWfD4eQE0piRH8r8uFQMjjNBbnuccp4lYmT_Y43bOo5Rlq6E1y8vfxhNn82hjcVFlyVwTasK9VIgutxQxAqC2SywioTPKzVDTWJneINtXE3PhBm4wHUvmVfy3kD3QZyynKoVXptyHs4ThLJPoCDZJgcxm8xArtPMR7yi7TAflAa5o_HmVYNXvyvPKXaenbk114Siul3evuZZNuq1LrJk0jvlQVPG9VQR-TSe0noRDEYjh-_bzFCM2JrucFzHhSlK6ynM-ZBXpDVAoBP36kQyHCqSi-prIDmqG_I86koXx8zXBMVHpiJt0DZmj71TQBulFdLLcopxJJwKY3hG5YaGNlKULO6P8sxt0lxJxGllEZPYqLxF841_hsLfvREVgx3smTB3E2LzxaeG9KC8w8hs9ax9ypI2_KAa6bXAJffzi4hU6LrrJFk7dVFQLMmEwQXQ2x01roKt4fDpmtzuFSAypZaOBc7MnGlGe8QRH2eXCARmRO9SV9bOi9igkkweixZDgfHMf0mkmjiq23dZT4NUY7UW2Nsdraexrr1tgkFBiAllCOkGu12hFowBW3JnRDdVl6YWmMoZVLhLCy4qfdrq-nNBbqgau3RlNekK69jKZij6W4ZiV_1r00W8cJuRX_fnRX9YrrXeR7g7Mc_PbfaU7kyD7vGVV4fzcHkqHdQv74fafIY1PGXPYCGdh6D848bdpz0keqnFumRrdGTh336rz7w1h1vPvytp9HmuPv0nvMruyV3VT2K03e3fpomDyDRY0jTHaTpLlKXeiIu_pdsuycmdoRr28eLXHU68uJ1ZCKFGwrkWNk5W67zfsdn4RypWtU6UcBF8lXIrVMFqexWQ8aqN9xjay5jfqiUJ1jSGL6zN43WeD377rxu8pEZy5Bb96mHd3YZeTO1m0JpcrVYd6RtioFlVae3mcQ2eF2_NypPjUvSQlS19KkHPR5dlREZtbRNx4-OslyOonQhu-GP3_4NGBZMT4Lc0dOV609skRnvk0o0AvYuUkID87h1r78lOeEtJU_QeRSZ7YuIVvUgFbj8YvLKh9UzSH7fHp32XjPnLS9Qa3LbPV4ouFpxtHvI16SLDrlfGg8i_4W3PLeOfBDgB5BjA2mQ27pvbT7ioNwKcIP8XOngZGKIwBG55JuRsO1B73S1jiZbaGGl2y_60E-bLTVyhK41D7-xBy_l21ner9QYE4Fnh9qYnJvg0KQEz3nvXg3PmdS32-e26B9jDdod433gN7kt9vqTtADb1Uql1I8IrqhDnn6IyU9xRfeRM8WDV4-BbEFGhtb_m4EEU_Ra09ZZMnjwqqUekYxjWFjTrsEAfy7S8GQh2s13am65hfnb1wKqyaxDLtyERlp7ak1walkGEZhefqtXzf8Ucgo45OuoeCmWW5c1NwKTk0_kZkxwm7GqHjV4ZI9zfHsvwpZ8KtO0C42SO5-9uYwyaSzibEeRRh1UGt9q0FZyNhpUJNqwZwyD7oivOA7jahVFlzIh8lpXP1HOfX7ySSOWQy6EJ1vrcS9q1_qepa2PQya4CJt9nV05G64M7J4Hm1WpLOQyldxb7u8s_7xb_kWSDFrRuuFbE2oKR7WDfn29F-e4oVw0nHzSnIFMWzwVlKa75-LjiBNiaM6i61OtEN29RJCQ8PF9FRshKjnnet4dyYhZKZPZygs0X4RUkqs1FKeUCp70Sq5AlIMCDbciuTzsqfxmilAO3uFmGSca1LtxlmB0vaCWAjFsk2mSxJyPs6YMIKCYsqKFDFFdoUuP2Li4CANMP28CP4mi9s7qyc7qk-T9q9moo3pqrRewjT2DdteefMTatk9-wNrTfl99__oBNHTFPtor4dseh5-8N6i17ru7WSi1x6aPbaa7m2ML6c7zuH-e09bsnt6-iyAtP8b-pBO7d_3u6f-7ANLZxf4vPwxg0mP9u5dwZ5LQby7nM7nqed8VHDygO2f1RUCOcn2QYSg3oq6am9IUneM7WWMNfSUlXKsmFbm7VXZcMXIjGMe-W_Yu6b6KxOgeRct0j5I-8rjt9snXyWTnP8e7C6dJMxD-OvgP"><img src="./examples/aquarium.svg" width="270" alt="Aquarium with a curved drum on an A2 sheet" /></a><br/>
<b><a href="examples/aquarium.arch">aquarium</a></b><br/>
<sub>True arcs, a circular room, and exact<br/>πR² areas — never faceted at any zoom.</sub>
</td>
</tr>
</table>

**And one that is here for its furniture** — the drawn symbol catalogue in a single plan,
from the WC's seat ring to the wardrobe's hanger scallops. Twenty-six kinds; not one of them
carries a `label`, and most carry no `size` either:

<div align="center">

<a href="https://playground.archlang.uk/#z=rZjbciO3EUDf-RVd0kO0VUPu8Cpqy3aVvJbjrSi7Lq32wXkhwZkeDkIQYACMSGZrq_wR-YZ8mL8kaQBzEy_ybZ6oEXDQd3TPJTzmCN9_enj_7vHTwx1kgi1Nzjfwy8__AQZ2q7oLTLVSa_qXjSArtOQmxxS23OZgc4RtrgSC2a8XSkDCLBNqWWCvc9m5hLsn1HtQNkcNuGPrjUBINdsaYJDxnS00gtJ0DnAJG2YMl8sePObcgJII3ECOGiGjRbnfKzuX4TRD79YGxROaN2C3KO2-K7lEUJlbbnOu7b5r-K4WLIUVl6mJgCVaGQNMCMj4E3YuIVVrxqWBqwWzeQQrbpMc5evCcsHtPoJgiggEf-Jy-TrlkstlBCrLeIKv19wkr7zej7lGd7xcGrAKNLKUljmpjCp0gqCZM4vNmXSvNzwhe7xxAIB-D95_gPvbb-_uP_bg1qtempkvpdJoYC7YAsXcucv5QumUDkty-meKJtF8gVev5sBk6rAAIJUTDFAYdDuNcpuVFHuwuLPkC0suoDNpZaLWaCDTau0WkhFMz-EGPfj7h4-P8OO7u7d3H-Ht7cPDTyT3x3f_uOvBnC3JoBa2ZOWvePoN_PLzfwn_FTG-mYNlK3RubDiolDNTym40lxauGGSap0sXEJM4BiaUXHqNibzYw2QcQ4q4eUWaQoqaPwWwVpZZrmSFLdWgrREpT7ForYsM5_EIGGxEsV5gChQKLv4JyygEfORza0pgjixdKKZTUN6Tmi_zoDPTCFtNdOn2qcICA4pygZAzmXYTtd4UdLikA3WvpM5Vlhm0c1J565LABwkm-BcDb-_ePz7cgWAyNc-toQsZ1Ar60JsSS7QgD6MsNPivAmXiUiZBaTWaiCKE_psoLVGbSqQPLkByhEwjdo1lMqXocDKZKgbvu0ZlLAKm10nOuI4gUVlG6cAWAiPwWRP-qsUiVSJI0azKhIKwfSOYtBHoYhnBhjOpnC-EKuQStTs2xUSQpRnMDf83zivsAhNWGPQuk8rbxzprclMlglVgUQiYO0POfYTMU9zYfO6VH_bg8Yc7ePj0V3j3EW7fw6f339093N_-1IN31tmUiRW6AGimtVYFKRXyK9iptFspo5LALWjGDZKI6gm1YBvYMu3sRLq6_OA6KYSLZMiEUmk340KAK2JogNsePBRLU6lOuiCwdRkaoWRGLiR9MSkkIf4f5GTDyhg57lthyzKLGhIma6NCztMUJeUdVeBeh1wEF99Xl8P3gtkL-NwBKCS3BtbrDsBS8xTGcYcqkLY5FJsOQMrXBlhhveJMiE4HvJt4-vV25lcC7ixqrjRQXUpWEo2BQRzDZ7iKo_gVXE1HsfvxpbUbmbFwdne5z__ox9P4AGJU8aIIYeMZyhZfEsXL0dje2r_itB02TFvuYqDe3_f7x3FQxf0YTw5loIvsVzCGDV2GR1TJmRAzeQ5THu8Zx0RxDHOeMWnIMTkiB9Xi8-oMJ9VW__uoa6jEn-dMahH876aP3O3A06_1TPAndKlngzf9QyUJyLI7sgS4Kxsu7l0PAa_hO1cPL6CgNPadRYtaFnGilj4uqcNRHO_IRyX1b37xBZSPowZECxuCocZ6V9fYfgP7ybdAFy0C-bBW13u5FGzqCIOa8AMTopaqFIwQLeYC037N9CavlJ3E8W4U18xvQ2vav2gyQ5f2HDsosY2gcNjB9AR28DLWR47DNmLEY-PnWGbzQwsQgqIoVUoTNJ1lWklLt0JVv5iFCZlyy1Obw00cA1VqBIlM03WiLRjXp3FJveYsWLVG-sB0yJC8zDrOr0YSoYX04fMMOb6upJy-iCRCC-l9XyMNIa9rKV9GEuE5cnCAHI9-g5REaCOdzw-l_A1IcjmA2qC74MvHIUOZZxb6kwpJeeRuAy5TtfUL_cXILAyH9bpRHJ9aNqEGuYFrL_O3E506PUerlo2G8RmavzGZhcHkHK1aNhq1l3UALqHb7cKzGknvftfjgDTp6mJJ3RqTVQP3xjdXjQ616rh8I-v7Nd-lhVaO2bJLc2Du5wymNZNLXKO0rSaQQaKE4IYrGiwCu9HBUetIXaFmbmwgMnVzDu2bSyaaE1oYAV0T6_u4srslXATbnCe5nxr21FkmTFI_n_PUjRCO6xTjtjUNUJtHp7oR303mZK3qoRo3oBLnS7KvcddxvBuQ97isi0QNsE8z6v8CoDkLlpHphxy6Z08xSNSZaAgxpPt36KTwQrirZhzHftJDiuETLO_mWXCzhaubOI6uGwr13S19UpZypKllccL0q6J_E8e76biS5OakUoWclQOMA_VvxnHUH1dKUR7sruOXSW44avqIUjNqmIcuzckzjS7hNkxSCdOao6GRvfGFpJ68lYRNoTfKoIv9OpwW1YDgeK1Jv_wewSx9uFnDVhWinMmBVQN5exJ3qZGxpA7SFe79WO3qJg04PwqW0Ey-d6MzfYdZYQhjRYmmkYnyo0U7lL22zVAex9FwELcN3j8dyn5qbYQOxX40HNb3fZ9yoR3HVSELbdmb-lODLmRj5G6M8D4vnEWOV7JmOBeSZrOX82tM1d_rOWjGQ90Y1tTwbma4XJ2nujvlJMdY5dvhF6W7Hp7jpNzkW2Zyr-hZzs05TviCdFwe32kdVKNjnGKzQT1L2IJLtOc503Mc_8mjGZPjaRxHFEIhpKgF2N08Z1RBFZry330rHo2pYOljagWtRlWShA6u4Sq9dwXt9OZx3Npc6VK18vAn6pKqYiHQzYnPRArTeBDqhsY8L1XoIGuGpEvZtwBnGdc3g_EfZfTjwfX4BGPLdKrVAg9DN3ShgeFargbjwMKDP9PCYQQ_mlKuUS6losyspBq0vYRmdZJB_GZW1jXsugykA6D_ejjzN7W7EkfjOJoOqrxqXYkH2xdKrUyOIntBnmFVtRyiNjTp3f3jT7uY5mp7JLXCMBIMVAvkJ4yGTsxw-ULVu66q1cH2bfJy0bwZxKdPt7ktFs-3-_6_PH3UEr4DYLkVCJ9ho9U_MbGHnxdd8ztb7OHiVif5PaOPKCk1SxeDeDDpxtPuYHIBXzpfOv8D">
<img src="./examples/furnished-flat.svg" alt="A furnished two-bedroom flat — twenty-nine drawn furniture symbols across five room domains" width="440" />
</a>

<b><a href="examples/furnished-flat.arch">furnished-flat</a></b>

</div>

**Two more, drawn on a smaller sheet** — the same language, laid out to a fixed scale inside a
titled A3 border rather than sized to its own drawing:

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVpdchs5kn7nKTKoB0sRJKdIibIsr3dDbau7FeOxOiR5vDsvIliVZKEFFqoBlChOR0fMIfYMe7A5yW5mon5I_dje0YvIIvKrzET-A3twBuPj0SE8wHg8OoEVeF0sDQ59sA43kNvKI6xz6xGctSsPThdLUAXYEgtIbeXCRrls1Nvr7cFNju0j0B5CzsQGobS6CGAX_Kg0qhiAKjL-ttDOBwg5AQcLVZGh84F-VXNbhd4e6CBgKsDFDVxcw6fLGziDq8vLv4zgkxVS7SHD1CiHGagA-9MkSQaH0yQ5GO6Px_TldZIkB6eC1tvjdzNv9GFeaZNFmLVTZUkozlZFNhBRg-V1_m4jnKfKGF4fQMGMdDODtQ55b4--Vx79DNa2MhmUVYDJGFYTEn-NKuToQBcRcGGsdeDTHLPK4Ai-kJRYpMZ69FFy1duL-wIhd4hDj8sVFgFK5YIO2hYDmK1vWfUzYQ_v0W2iTgnRocp8o3z45z_-m74QbnzzAGYZ-tTpOe4fjIINyvjZgClS7dLKKHoPs5sNF9oYxvB6VZoNeEQPhY3CkIAYLeLnc_jx7P3Fp5_g6vPH8xGcPTYQn6sShcu5Q3UnTwul7xHWakNaU4VfI1lebw_661ynOf-SWaTFtGW6yOwajLV3_9EfwY26w0Yjt-soR1xkC5Gq5uMVGcOX8-sbWCtjRnBDnNBHtgX0jdk2FAPwFhS4ykS-U7sq2fA6r4nGQE9WOssM1jCNqYl5pPymwG8aLlSqi-UILnjfCxtOmWSpjEG3eeWjhtl-oxzModdZxK95r72LjVdpoqkpUPnAInS4Jc0R6PnZ9c0Izlyaf1Ts6KR4tsP5Bkpn58S4LVBeEnKd3hXoPdjFAlClOSxU2kgq2Kxfuy4gt8RpNF3mT92JgaIIUFgOMmDTtCo1-gHIXmsP-KDSQAKodhvI1YpMHnpjyWUXKlUZgjL6DkdwhSpj1lV6x_txykYJoFyaQ23uhL0qDfo_NchDjnsjXjYc_uptAcOhR4NpiEJ5RqLXd8wMHJbWBQ-zvmxk_xT6pO3-rHXQW3x6He1jf0Ze1dsTVdKekH7O3l9dXl_vmmCjmjXtubcrpG3hwMkhmkIqrtg1xRf_dvnp_HoEs7_TOqPvadXv8M9__A_8Qezx49LpexWweS4S8k8e3b1OOz8tna3KGEV423xQAWlzvYS3tS6Wnlye6XPl4W_nV5ewRLvC4DanEqRaMtAFm4FDb809ktnwtpsNKA862hQHZwdrdAgZGgxI_qhWpBzrMl2oQJbDT3TmBzDfBBzqDIugU2V6e5A5tWYv-wuu5uh8rkvS44fz9x_Prs4_DKAgxkAXC3Tk1AtnV7CmoEZOT5LmxEPhKSn4_7Mv2bPOhmzEpmNohTkau4ZUFZAq5zZkrtWcQyywKE2ULiyola04U_b2GgOQvaz5JiMwGeTqnhTg9D1mI5htm_Su0dIO-Bk4a0yd-pRD5aEq38JsOOxu_iwmC_ZycXfQwZMLt2k-RiSJKgi_XH78r58uP7F2BhS3JFGBwzQoSlz-FBR8lt2rfb7NBLYg_aGEpSrkksKUDyP44nQIFMJ8DcllCAVMVkOBHHbpFwp1ZHIwx7BGJMxSY4q-jkfRSpzTmXVtAdLskyAa7QOHGVkXwYNeoafATPpLsQjOaoo3xpC178hDqZHE3cpwUkWpe3RqWRdEpL4qsNU3dhQDs1Fz5BRUGpViRvE3J47jy6Ke3Er25Mx4C2SipzAzuAhDu4jOq-b2HmMGDGsLDiWVKwOZpv3RtuDkbbkwicEQqIJ529uDmTeaAsoMMmud3_YDy15g61qmVcC-AoMq5iPPgQDeJAmsVhwauEgaT-VBx5QiVRRxrTYHb2OIR5iVNr3DIHzAQuoM2VKyZFuMelza9N83XPxMUbwPv_cAqoJMeLXqAezBbOl0BtNkdtpWUJ4cAsZJIkktpvjZwlQ-n8FCP4TK0aYU7BmgYDQaTRNOd6MeQETsAZSKfPrsUNamqsQegE-VQRifjhNaUlgXcqjKHkCmVx5UFSwoY3hhtEU28x6AwSUWWY_5vuHyzQaKSBRlWQHBIYY6tVMZM4KZ1-TGFC-4iKAy8C0ZWKFW6GGh75HxOvtvi7b-exQ9BI7rPXnb_peDgWTV_fODAeBvlQrW3ZIdM_D-9SAKGT0vrjgYgK8Kpz3yWqH2VeExxAdfDqgAww3vhoIPV2c_3lx8-olRfz7_fHVxfXPxnndfUUwoMQ2nbblCOaawhAgrm6EhLoDMPVRUFRQZfc9U4C0jqeD3WiQuo3JcaV-yhQv7f4jih8PhEHyOxpDYZAJ17GhNngui4Vf_ehBry-wdAwI-BHSazbkupg6TBH6H_WSQHMD--Jh6l_bTmPzmgH6Nn7hVqDm9WVtYVMYM1zoLede8Mwsr2xaza-vuTtmx5pjrKI0IPWeXW4gJDhiW1ulC7K6JphyB6sVzzHj9CM6VpEFV9yws7xxTRb0khzZdiJ1oD6ktgi4qW3kqB8iKbbXMpajRVC6WylFGhzRXxRI9KGO57Rp1NLm-JTZui1bejjYntTYPRXGiRvnyx2MQ_zLISRfkJII03tlpboJHszhtauVBzCOx_vUDWOkQe9W5DTnlmwKd3xaL8V5iqO1y42ducqHb8dZfDrvMjqeJ5OlxklBqluAqsZVSKm3fzmsBC94aKnqIQ7vmsqBUBZptrpfK3K7hSbbHU2abeKnZ5s8nT2wHweAzMCL9eNLBkS9PAVG23rwIxDw0zDxlG5mm2uIljDe1n755zr7udEjzbxColeZpKw05fAPKcdKxVPmyA4TZ-GWgaatR-RxDziOcyVcYGrfeEr80SG2AlXgjfQVmnR6Cah9uQmbfFmC7HU7_o_wnICkFQGoXnb1zt3ERzYtqE_D67wgk7AM9iWVYROkD10URm7H2OvUWV2qSlsXk1FLpwocY9PhV9O5Xca7AvbIUaUYvacZUziIohUhG0i5GZcwo-lUl52FKcphamkM1TY-Mrrhaltp2Ze9jqd2ANizQj1usUnsco2pXQdF1oojQaqxmWPR1uKuvc6Lri7YEI5cCpwsefYq0XzvP02gfeGGEE6pelKnTjEiLIVO77eTMdXtbteumZK-nI_U4pFYUv7Yp0ZeaMhM-lEanmtrRfa6V19ojzL7c0hzy9uPZD-cfby8_31xffDifHezqsS5yS2s2S1vwr7AdB783lNcYzwbBTmSNa6M6fxJm-qz5E0Z_PU0ORL3daV_cM3bSrflA_5f44Wm34shC4DUr9NdxrKTd2h-kboBx3N1YRzwGnMhUtxXvK4CTrwEeMmA3NAlg8gzg4ROAe3V_Vbd60kQVuG6L69NYp1fZhmpOH38xGy7abdmpnmA8iLCx4YYMS24VZAgho1yJIG1UGEg0kQDBjonZrv3J65lXqPeHXZg8u-N1047g10QThbaLhU5xyxbqgVD_On542hY46ZGXhU56q83hkaf_WVb3IUbaSL27e5ICO5iH7QYy5qSD-YMKOdHW0ZuodwCroM02oCTMpwE_B2102DRMVvK91k5MZ9IvD__FP2lYuYUGXcxiExPaR8FCDNMzCoBte282wzg6EDnpfMToOVI5bTaMS-coqgs1g6DcEsOgqdfJEJspjozJri7-ev6hPkLg2bc2PMYyhlhj5DjD4y6tCrmlSjc1jFgnRSo6vRQMWkboVaBpm3WwsdUILguirtsjRo1DZ2xiMbUxzUFCaZQuuOBWxWatNqcwI401Qxg05hVF_jXV53XjzhWvzt5lt9LcSNQaczyUHooChLxZGjbqpjH6TVSc7PrlozkIDT9pfoKuGdQqac9y1Ms8wFK5DIt6cgUqDRVtHGjPKZxhlbwxk9kIN6cyqPJrxBJQc8jpHBNAnI20zQi1Hj63JtuWWObRBuKIh-JR00mpAMcsuOjgJElEEhb8CZTlNoo0LowybVAmSYPiSPy2b-LwNOBTBNWKUZgNjA-nPCVaE1Uc7PHm8WQ5ti13iKWXNorGCJ5xU4PKvZUBVnwhzUR0Xfdw4xK7WHajyVgGUhSPjSruZNP3aW5CHRGDnkwTtvw6PpNeSlNRu_SrWs0PBnFANmuVVZ8DKr3i08IQN4fave39kCAdZWI1SielAkxaLZ48VmILIZGxoUXegtfTBKBL3Q0dMRq2EBILdyCOaOuegyCKLQhpdBgi9jwqwJjZEIg3uxBtnO_Iwv1Ja5SeGZkmz6MQxS7E5BHESfIyxGQX4vARxJiFeR7iUEz7vfKYNXNpKQTKam50Wp-m8wkVkUnYkvKBa3GaXJHDU8ww3GDXUUJn72xdmDedi0Ss2l2ndciKze8u9W7lvU193FLHYnuHPDb4RH40mdbZtyaftOQSTJ4ix5hs6c2R_lnyNqfGw7dTmpqji8d9Pl4h-J6cGo89dfauqFsa5qcetvFfJ2q18X-HOGpShElImEi9q8uniLdqI9bkNvHR88S4TXz8aBffsJE_R7xVQTHxUZf4-EXirWqJiV9PvpHY11MHJp6QvuIk4BsU5utRgzQuk-8nPmzYPuyMM75OvI6xGWJ9INXhN25V9MFbE4knb6bbxCc7CmvtfTQahRyLJ0bN31NZ1mnWx_sjPFznyyd8-gwZrmzhg-PCcbR1oq09H9tj9tS1CYJtLk5wZcqJmS8RvN068JbLB5Q06VRvdz1hvJUjzjrc7NVtTj1o3x6fdHQhEYFFiizySHrrFXB9-fnmZxllN8e0zfFRPJyQOwgMEGfZdEEB684Lt2LOaGeH61Kq6ai_HhIfk6_bi0vTrkN1yXnlk9TY6WeF_HuosxjBWt4fJ4NH4XhRuULzwdi_2OK0QN4uFNB4ph01FWlOFa0tgU_jpCmbHCXJw5tOs2oXqr-FFNTc4BYSDYCQOhFGIMm6CDe0vt97DiMG-pcxZFAlZP22vK1DtasKcFSgbnUk0snHg4G3MLOLhaeDzmijmaZLHXKrhu6FMCofbL_y8P78083VeXMoIsbKJ0edC3bWhtJpOjFM7apj0KkKythlxdbcCh25vfW6uGu6tU4DVF_hSUA4hfEhVc6spbaO62xpoKlD_Ps2vJOX8FK6IYHuO_COjl7CWzidLfF7-OMpyRbeFiAl11DNZQVn2taGh1y005s6xjx-nSQPr_lsuEVZp8LRI5S5DcGuhtyBdlGOngCZK6-LF0CEmw4IGfTRNOk9qXFG4ez_tFNSm_hwzCzscQHywMWAXVCPtJrTaVdZGs3WPFebQaSNbXOTGur7b3SAXTDOuj5ZrscSqr0fIasuPtHgtenLGptvvMAhXSxFVx8S0x0knUoSoyOt3JG5y6WXkJ9ylX8q9wFQxgz9L8rn6Pr00pPJlFpFdruYduj2wUjGNc7SnSZ4k8zo9qe48UqluS7IZ384e_9nbiKlVSSWfVXSPUpJXD4gRwpa0rmy105A6Fw0yDG0WCvlbOaNg0bj1hndmlFMM3T4W6X58m59l0HRVI9B78ejyQmPwA2q-_pWK00aWYwkXggisKKzg_WeSv9Ck3S-nSg3AL7c_njxnzefr85vSdzbm0sek8vpfmd3tAf_W6UcDrXPm73i6CZnyDzUiSOlOIViTov62m-xdTeKjzW2w5loJpZ9R2-myeD1YTPbeyMGW8fveoebDdwZUXTu43QHbcwRH4bKfSOuG9TcW1OFeNXHg1NxUKNEHnEh3wzSYmlD1rs1cIt3vCSe0yE4b2IjnsxM4iIGpkFwnDnkVNJIxRNP7ekKEF__4qlcO3FaoSrCtuIy9Hexw6Si4HWjNM56rztZD_3ddu6dW3uXKh9LEp7Zt_NUjhJHnflsXNyofXyyE8SwSNtuhfrFpD0AoPJmC40W76RxstJOLOXp98uxdMwz384w_IOtOKdvW5bLnJ2LlEdyqtkR80hm261tyeoXxNzhcvK1YP1NXD6CPfx_wzbOwGdB7KT1rGKmC_g3MuF_n8WRBRt259qHQ7nTLOPoYPk20gjOpJ4xijNMc3_10Z067TsyPTq-a-68t7eyJV7K6M3fRS-QUXjgK5l0ssw3OPkOO18mp8m64lAcbDwNbV9a80i7TQ1vbJlblY07ZwS_yGLWWdDBYDwYKZ39le5UPbqmxr9yLrudb6Bf32mKz_nQbZJMjofJyXB83Oezhj96_ws"><img src="./examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7VrNbhvJEb7zKQrUwRJAMUPKkm0tdJBlZa3ElhYWEyEIArE5U-T0atg9290jilkEyEPkCfMkQVX1_JCSZTtr5BQfDIns-bq66quqr3q0A6dwODyEBxiNYAkhd4j7PliHawjonEoRclt5hH__819gDULm1EqbBZToQBYOYO7sEqYF3mMxhVlh0zs_7O30duB0C0R7CDnCrNJFRiBhXSKEXAWwpljDUt2hB4-GlhrwmAZtzQCUyRp47Xs7kNsVKCgLZcCrtQdvh3Cu0lw2p22UAesybZRby7qZzdYMNMPULtGDDh7sykCpFnjc24GpcmkOqV2WusAprJwO6CHYlWHbhx9GQ3-_GHQ_GT_65EA-USYjxAx96vQMYX__Z2_NFBbOrjyoeBj_179Nh3B-j24dcnKHrYLXGYqP2I3s9mlldPDTAUwXTmfTAUGXqkRHH_lUFUg_ZHrpQVXBTvkh7cEHFTADa1Lkk6uyLDSfCZA2beI3w1RReKzB3k4bHe1Be18xBMfe54gBOFoIvLGEefL-HK4npxef4OIari7P4ertH87PJnDz6WIyOb-EyftP5-cwufh4fj2Ei8yDcgiV0b9UCDcXk_cXl6CAXTIAb_n4Xi3JlqnOTnyYkgGqKISf0WwyDowNoCAtlM_l1KHmWIZpoZwiAgnDQo4eeWc5ps_VPAxhQt95bRYFwlyl_PyKPhMyElRVEtnnhbXOQ4ELVRzT52vI1T2CscR_EyCz1vV2wM7pS-2IXDV1tQlT8EEXBThUmcDOtfNhn2GhUIZdrjwtSHPMJKkiIyjkdZAaVu3uDe_RBZ2qYgqpNQbTQLSm-LILJY1nWNjVEM5yZRYokeMvXnjQxFKycG0rWGCA6c0tx_H2T5cfTydn78_fTcGpkKMjHxpQ4HWBJhRryLSPe5KtdAjhwjTTjrI0BgCzTqXgvWLUMkythOdYvFHoRR7AVcaDKizRL3iYWxtKp014QWn_4eryR1AP2ke_ZtpBVfJuaALSZhxoFXjVCw-Fcgt0-6mVYhAQ0GRDeI9Osow2Ih88MNdh3fBv4WxlshidaFtnGw4Op6lK72LIISeKkmFpoZczMjjYlXJZjIZDDD805G6PBsxQhGBLcSSkyjlKVD5gZldmOugckHBzBFuW1uv6RExjqnuFt8JfWmPUPVDNiKyjDFFUFoidMx9cRYxJtUurgkPR25HKsMrJQfiQYhk4DmiCWwNmCxzAKtdpLmmy7obOB1t6GA1Hh7AEn1sXaseQk3o7sFJFUSdccLqsU5Vrv7NVwNavbUrVdL7TIc0xphTRWLbt7UCBZhFymFeOmeptFXLKgyUqX5HPDg4TWC7JGqptxL0ySL04SJLa_bWvBqAWShsfQPV24FWSwFIbvayWzI2Yyw7nlUeJLLeXlQ45pc9Pp5P3t5Orq9vL00-frm6mQ_ho77nVtY7iFiYV4GHAybDSGRrOfz7yMX0oHUFsE-dQeMGoJWaABS7RcKrzs5J7N-__wrX4p9NPk4vJxdXlNby7unwxgY9Xfz4nzyP4UhvkSFCqPJwcjJNkwHusMOw7a5fNl-uTl0dJEnsZrUid9b7z9askSYhNHI-n6rNp2V4WKsUmu27OeE-qairkvCuh8OrcrtABf-a1tBo1s_eSr5YjbKUScc32QaV3Lf-NJUaktlzvl8oHPCYrVCNDQuOCOsckLlzaaxMyp7Sh4MSvVxjYHk9luE4vVdc07WFOpw4WUqmx2guleR1lDz_MrSdVRUFJbLL4be2lZeykKyukv9Mm84DKmdhN2IEbxVgXReWDo6JGAB6Le_QS5Y3qdXNGXalE48HO56CkTo2GryhPiT1C3rowaAM6cKTI9ALVXIg3LW16h2F6zC2Gm6Ox7GvndGYdH8pQuGLWvxq-guUY0sKqO_JALNq-oC0LnIcpZE7fRyeXymABxjrKXRMIeTw8IhMpbQtl7rrc3dUBDGLm4fVhEju_yLnXSQJlUZHFP6vlbC86RLkMjbiW00-JIdospnzGjbLG4S2pIsoTKg2VKgqK9RBOgTITpQZ50sKslQysbFVQqkiaMJE0J3VQswJ_AL-qROORA3kx-BViGY_PVYIrdE1DvUTjSb-kORFS1dqM0qNREdyAsMB7kTpUQIdwaSkS-9FQjiFvRRwXrXkMUzraNdm_uzft7YDDUDnjwVRFAXProkYkIsKsCjAVtKmUwZvb65uLyx9vr95eTz796WxCSiFVhooZ3qNhrbkGDqMO5LTW3TEIPEkYUjwK3v7lp9PrayiJf-SCsLJkNXGDKuDKQnCK5LA2tUBmi-9RFZGqkQ7GRrIwTYKFUrk7LhiBK1TtYKHhVBKVZwiJv3CXCt7K1v2JKgGH-ximjio4K46mu4haYQFgfeCNX3gy-B6dJ_va0ob0FRcRalGuMsw3VdxRSVde6jn60BRK-gWdadJQTKkB6RH6lpjI-xV-2ON21J_UM0kffu0B8AQBy2UPYEfGCDhMpsedelgqFzRTSHsYS93fqvoeRtQsfD0-TOdF5fMpY871Q6gcspD1UqCHw-FhAtbRD0lC4lqmyFaMkXu1F4WSKgP4UDr0HvBBpaFYD3sA0dQeAE88cHoApXXBKR16IDMIjI55gdSOquwBNLMQxbzHBl5VgUS8StHD4WGS8MibJMkP8PJNkkBaoHIww7BCNDEjXVjLuYedQVZ7mBWaWx7jzixJD6Kc77hmpU1mV3UHbIbf2M5F3JC0qROY_NIUICIgQXenEha1PldlXS4LFYVzRiVkqbOs4MpL00OUkaGZYKSyx4gydt3TWnYS4ZGCR49F1UFtq0RbUp-l0cpQSAoMcAMncEgsif92hNyQskwttEEfV76DExglr5Ik_j6BE1Zd7ZP4ENBp9oZO7wz6-tHrny4uz2l53GgnSnaVzVA5KpdM3UH0Z7Dkhn3yTG3l-QQAToB1TAOwKXS43NQqhQx_UstEwLenZ38kQFY-DWBHF2lTB7dVvuzHHiPcYwEj6P_I7VmiJPkJ8fHsRPwIrVdatwCd5lfYTQbJHuzexP_f7dEn7_ao0XqEf2yicW5DJ7tbNPLqr7DLXmYs-YnOuLcFs7olvjwNMxKYZHBzPmlA-OdtDHbG8xiy-e5NYwVDcLR0duJuWboAUDVvDQev_450nOSBA1OoGRbQf6-Kog_tv8qjF-0j00x37tncpdDcjHkXdjb_412Iiw_Mp7jLB17b39xFALZQV6msEFT20Abq-GWLelaLpn4HdZVuIcaRKCKKyyIiJefDwasW8Y-y9nfvWJP0BbEGEKEizpb2nJ1kt8JkRn9JY0KyR3Ix5BSuROIqbGVlwJJOBBELOJBobWFG11oT244KMKZyIMBUiTcQOo7cYSEnInS4KSP50qAVkcyz7uhNO73wcuECpdUmDCLk7kE8GJUBbiAD2drbQmdthSBdI027g5taZ9Cx4lwuQa0Ud6zuaVdpNHjjwIevmwPTT-1Juudk9clfuWOuzbN1qbyvZZGWrj8ajmHZCKF6avQrLEPza0QlISRXeVwEeRaPXmxFDekNoOH_swpkQxBtn5c9H4Vey5t3DW_Gm7zp7C7coymFo5-d2A12M44QfBtK6oo8X7fd7MRsJPHoaIO-RxtmbD3pNzYevZQDfOZRfnZeOaNZ_Swx04pi09QQZdKc7zDKfc4PlkySoiMuJW2GfqSH-1uI3s4VPIU4syHYJS9uIbkG0kQUIa_tXPW3jZQ6xJCrdBNObOwivpSiugUxU57GxCchOJxdiCM65mHS67C79jApYKezWqWIPoab8-sJeFzwDceuNhk-wMGg1sl8RbSbDFhU7EVQTl1KzD0ZT-x87lEoreiqMii-BI9KnaRUhOc3AiThuHzQhRp1JrrzaPv7L5VyAd0-zUf0gqBzTUVUkDu95jrPby1JVVCFXVQxWVonRifcem3umjunbnZEEw9ATiOcZ6fHR7e5EuiaJP77GsDx6HnAudPZAr8F8M3zgDwJbyyIihGzmBPEtzdtTkzogcjgeD1BLwSkJowOk8H4KEn25Nk31PHIRXIt3AORD6K6xtD_PZf_50TXd9Vc30dyfQfF9ZsEV_Ni4isE1wdZ26_1SkdgQSMFWugZZqNWDz2vst5ixg-OonCZye_biCrkX6uw3saLx340lp59bOC4hXteXtUGjrcMjGXk0rbk4nYp0fDxzYlczTK_-XXNxu0kTyZ0Lx07skpTmZEIeOFUmcd3RnGcrkNG56sWeSyt9LJru1tTABphQsccbSmTrhSj1Y_afcg3AXgm_BxA7eENC8YEEJmqArwcP2vB-HGf79LoW_q82eD2lsAdP68QusygCtRVCK-fVQgzzITnXATZ9i90YC6J406avbMVF8Wtrq5c5uwMPwv8qC-z_uDJOALfRIh-t1XLGFxqpIuThQUZXUPzjVwM8UVEvNcjrUxv7SNdWTjG62e61xXoGd2GM_mPOfWgMhl2LkQIdgA3ZzBDvvHTzWuyOPOLBJnJGyiJzfCRSgl5qGbRI7TJl1z96km1Uw9un8N55NnnRNMTMI043FJzG8LpGQqNnzpX91iH_x2Dxk8ZuM3Mpwm0iUy1KdT58vLwMBm8GTdtm4wbdYw7o8X91ojv0PwPoH-Nqf3Clcv_u__36v5fKQB8qLL1VwqAa1rb37hksfO5TvE3SIDr9lXjMypgyZfsX6cCPtJ7mtj6nxICbeeLZ__q7svrn2q_8JsacDzc51rwo_sYWf-4CXdD-b9qwt3AfFsTztDftRVUbP9CqTsStjcVFP3ddpWbWXuXKo9PoH6uML_evAF4GxE2GjDLv26vVfWLv_jmnBWj3OOr-vW5_AFHvYy6crznjsD8ilve-9_XY3DTw9lvQa07KPFdd9Okl1BWIb633hpCxYCv7rlvZOB7uuV-n477fRtupN0XIktQPF5_Q8vdRP4cE1__10339eHjpgtPtd1uln9T46W_Vapbb9ChwNhpS2d_xjRAf9L9A9OJvFITw_lt8O1sDf1Tl-YflFnEz-nvG_rjZHy0n7zeHx31Gf8fvf8A"><img src="./examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
<b><a href="examples/townhouse.arch">townhouse</a></b><br/>
<sub>Three storeys in one file (ground floor<br/>shown) — <code>level</code> blocks, one stair<br/>shaft, one drawing per page.</sub>
</td>
</tr>
</table>

**Also in [`examples/`](examples)** — the whole corpus, by what it is there to show:

- **Start here** — [`one-room`](examples/one-room.arch) (the smallest plan that draws anything),
  [`studio`](examples/studio.arch) (the lint-clean flagship),
  [`attached`](examples/attached.arch) (nothing positioned by hand).
- **Homes** — [`laneway-house`](examples/laneway-house.arch),
  [`tiny-house`](examples/tiny-house.arch), [`garden-loft`](examples/garden-loft.arch),
  [`two-bed`](examples/two-bed.arch), [`bungalow`](examples/bungalow.arch),
  [`furnished-flat`](examples/furnished-flat.arch) (the furniture flagship),
  [`courtyard-house`](examples/courtyard-house.arch),
  [`townhouse`](examples/townhouse.arch) (three storeys),
  [`terrace-row`](examples/terrace-row.arch) (one component, placed four times),
  [`two-storey`](examples/two-storey.arch), [`accessible`](examples/accessible.arch)
  (`accTitle`/`accDescr`).
- **Public buildings** — [`library`](examples/library.arch),
  [`transit-hall`](examples/transit-hall.arch), [`clinic`](examples/clinic.arch),
  [`museum`](examples/museum.arch) (A1 at 1:200),
  [`hexagon-pavilion`](examples/hexagon-pavilion.arch).
- **Geometry & experiments** — [`gallery-l`](examples/gallery-l.arch) (polygon rooms),
  [`aquarium`](examples/aquarium.arch) (arcs and circles).
- **Scripting & composition** — [`parametric`](examples/parametric.arch) (a `for` loop that
  generates units), [`relational`](examples/relational.arch) (`right-of` / `below`),
  [`imports`](examples/imports.arch), [`museum-wing`](examples/museum-wing.arch) +
  [`museum-wings`](examples/museum-wings.arch) (one wing, imported and placed twice).
- **Style** — [`themed`](examples/themed.arch) (a custom theme + brick hatch),
  [`materials`](examples/materials.arch) (per-element `style` overrides and wall materials).

The [docs gallery](https://archlang.uk/examples) renders all of them **live and
editable** in the browser.

## 🎬 Showcase

The examples above teach the language. The **[Showcase](https://archlang.uk/showcase)** is what
happens when you point it at real buildings and famous fictional ones — the West Wing (whose Oval
Office is a true `arc`, not a faceted polygon), Palladio's Villa La Rotonda (one quarter, `place`d
four times), Bag End, de_dust2, The Skeld, 742 Evergreen Terrace, the Dunder Mifflin annex. Every one
is a few dozen lines of source you can open in the playground and recompile.

They are worth a look for what the compiler *says* about them as much as for the drawings:
`arch lint` reports a real `W_NO_ENTRANCE` on de_dust2 — a quarter century of continuous occupancy,
achieved entirely by spawning — and it reviews a $2,950-a-month railroad apartment in twelve
warnings across nine codes.

<table>
<tr>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/west-wing/plan.png" width="270" alt="The West Wing, first floor" />
</td>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/villa-rotonda/plan.png" width="270" alt="Villa La Rotonda, piano nobile" />
</td>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/dust2/plan.png" width="270" alt="de_dust2 drawn as a building" />
</td>
</tr>
</table>

**[archlang.uk/showcase](https://archlang.uk/showcase)** for the curated set ·
**[ChanMeng666/archlang-showcase](https://github.com/ChanMeng666/archlang-showcase)** for every
plan's source and the story behind it.

## 🏗️ How it works

ArchLang is a compiler pipeline. Source text becomes a backend-neutral **Scene IR**, and every
backend is a pure serializer of that scene — which is why adding a format never touches the language.

```mermaid
flowchart TD
    SRC["<b>.arch</b> source"] --> LEX["<b>lexer</b><br/><i>hand-written → tokens with byte spans</i>"]
    LEX --> PAR["<b>parser</b><br/><i>recursive descent → AST · recovers, never throws</i>"]
    PAR --> IR["<b>resolve()</b><br/><i>expand scripting · grid-snap<br/>relational placement · host openings</i>"]

    IR -->|"render"| SCN["<b>toScene()</b><br/><i>wall union · hatches · page</i>"]
    IR -->|"read back"| DESC["<b>describe() · lint() · validateIntent()</b><br/><i>the SAME resolved plan, as FACTS —<br/>no rendering required</i>"]

    SCN --> SVG["<b>SVG</b><br/><sub>zero-dep</sub>"]
    SCN --> DXF["<b>DXF</b><br/><sub>zero-dep</sub>"]
    SCN --> TXT["<b>TXT</b><br/><sub>zero-dep</sub>"]
    SCN --> PDF["<b>PDF</b><br/><sub>optional</sub>"]
    SCN --> PNG["<b>PNG</b><br/><sub>optional</sub>"]

    DESC --> FACTS(["rooms · areas · adjacency<br/>access graph · intent score"])

    style SRC fill:#ede7f6,stroke:#6b3ae0,color:#1a1a1a
    style IR fill:#eceef2,stroke:#464d59,color:#1a1a1a
    style SCN fill:#eceef2,stroke:#464d59,color:#1a1a1a
    style DESC fill:#e8f5e9,stroke:#2e7d32,color:#1a1a1a
    style FACTS fill:#e8f5e9,stroke:#2e7d32,color:#1a1a1a
    style SVG fill:#fbfbfc,stroke:#464d59,color:#1a1a1a
    style DXF fill:#fbfbfc,stroke:#464d59,color:#1a1a1a
    style TXT fill:#fbfbfc,stroke:#464d59,color:#1a1a1a
    style PDF fill:#fbfbfc,stroke:#8a8f98,color:#1a1a1a
    style PNG fill:#fbfbfc,stroke:#8a8f98,color:#1a1a1a
```

The dotted branch is the point: **`describe`, `lint` and the intent check read the same resolved
plan the renderer does** — so what an agent verifies is exactly what gets drawn, and it costs no
pixels to check.

`compile()` is **pure, synchronous and deterministic** — no I/O, no `Date.now()`, no `Math.random()`.
The only place Node APIs are allowed is the CLI; everything else gets its environment through a
`World` seam. See [AGENTS.md](AGENTS.md) and the [ADRs](docs/adr).

## 📦 Ecosystem

| Package / surface | What it is |
|---|---|
| **[`@chanmeng666/archlang`](https://www.npmjs.com/package/@chanmeng666/archlang)** | The core: compiler, CLI, analysis. Zero runtime deps, isomorphic. |
| **[`@chanmeng666/archlang-mcp`](packages/mcp)** | Optional stdio MCP server (the SDK is quarantined here). |
| **[VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)** | Syntax + live diagnostics, hover, completion, rename. |
| **[Playground](https://playground.archlang.uk)** | Client-side editor: preview, describe, lint, **intent scoring**, apply-fix, embed. |
| **[Docs site](https://archlang.uk)** | Guide, reference, [CLI reference](https://archlang.uk/cli), ADRs, live examples. |
| **[🤗 Dataset](https://huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories)** | Synthetic, self-verifying **repair trajectories** + authoring pairs. CC0. |
| **[GitHub Action](.github/actions/arch-render)** | Render ` ```arch ` fences in any repo's Markdown. |

### Embed a plan anywhere

A **live, editable** plan in any blog, wiki or docs page — one `<iframe>`, no build step, nothing
sent to a server (the source rides in the compressed `#z=` hash, so the page is self-contained):

```html
<iframe src="https://playground.archlang.uk/embed.html#z=…" width="720" height="480"></iframe>
```

The playground's **Embed** button generates the snippet. Optional params: `editable=1` (show a
compact editor that re-renders as you type) and `theme=blueprint|dark|mono|presentation`.

> **Not on GitHub, though.** GitHub's markdown sanitizer strips `<iframe>` — it renders as escaped
> text, the same way `<script>` does — so a README (here or anywhere on github.com) *cannot* host a
> live embed, no matter how it's written. The honest substitutes GitHub does allow are what this
> README uses: a **static SVG the compiler really produced**, linked to a **playground permalink
> that opens the same plan live**. On the [docs site](https://archlang.uk/examples),
> where the sanitizer doesn't apply, every plan *is* live and editable in place.

## 📚 Documentation

- **[📖 Docs site](https://archlang.uk)** — guide, reference, error catalog, ADRs, and a **live, editable** examples gallery. Every ` ```arch ` fence on a docs page is itself an editable plan.
- **[⌨ CLI reference](https://archlang.uk/cli)** — every command, flag and exit code (generated from the manifest, so it can't fall behind).
- **[spec.llm.md](spec.llm.md)** — the **whole language in one page** (~2k tokens) for AI agents; also `arch spec`.
- **[SKILL.md](SKILL.md)** — the agent Skill: the `spec → compile → fix → describe → validate` loop.
- **[Language Reference](docs/language-reference.md)** · **[Error catalog](docs/error-codes.md)** · **[The intent contract](docs/intent.md)** · **[ADRs](docs/adr)**
- **[AGENTS.md](AGENTS.md)** — orientation for AI agents working *in* this repo.

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
