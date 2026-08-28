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

<a href="https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZUuw2CZC2AQrESIs0QdAn70gcaVmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYciWtHMepnijuzMdvvvkh-3gBZ_lwwto7t0BNlhu6wdTFSHPGp49_4fQci3__QawowjPpAArihKV3c0-Lo6Jf9PHaxcrYOSr2DBOwdMFE4yxrTG5QkdVHeHnN_gZuyVYsxchYMYgOBL-y0CZEslMG1c7OQUUflhas0VBd46B0Fk9l-RwU8XTpwvPy0QCcYGdmHVee4Tm4-poDaE7GhijQEprzoIRT9HFQGounsv0cZKeV8_j08e9ygHLjlA6UvUcDkNWIFWNCsXq8UWpJxksINRkNt4qY3BR9lCF6syyPUAYTGR8QomeOsM7HCrdlCicktNg4zGhKuv2_rMkirrwVcb9JW9o5X_TFqrWR9AzSal5TCJ0vc_Ka7VGRUHoXbRp_dKvAPXwogJU1MWCxKIC5Nxojhc6vjyX5mBIWQJ5xrBRiZaZXAwTJTjmrV6EqtyrXZLUQBYlKI1WgjXG1LABtFgG0krzWdQHcK0ZRIMts9LPmUkIDwOvI3jiPfLrlEDBUCh9woAbqEQ6ejFRa3O55M4X4sPfGLy_GI_UZRpbwYQbZ78sYDX-NRyZxv3clK-xS0fE-zt6nwzaKtLgPQ4r0f2AMO4EMW5gCuVOMfuYva3PN0mWZcDC_M8RxLWeipgnX6F2Ya2nkx3hl4rRi28MqcECdt6_ypqRfmgLaNTYhboKY0xIKjdGxwsmJkCukFnccUizp6GHn1O8oVj0xTIeJzV031mgZq45bbtyWY9vGBXLc0mnirC9n3tkIqey2JiliKMplnudKQeYcwzJ5hEg-IjRpntnokIXbQ2zrKtRGi1lCbvcE-8kW-_hMqWTGqHkW90BSTC2tVCYUMRpvXc-2tMRzn9CEdSEdXmbPUqZWQ_UV6zRPPv3xZ2aTOr3M53szr2KJwNLlaTqR5TqnUP4GV5s8lRP0hGvXpA-_0WLy7QZFuJRo3KrWILOAiYm2Ulgs8lSVuijfX_780_evXr69fPPudXm0H3ZbzW56xXE_-vO94Du001wxVrsmO7Q9KVqf7rQeKnXHbpcTScnGTj1gNzobbfHGn9m1M4kijkfbc8WsAGYrb00apDNv9JzbMbx3-7TM3WwWOEopA8buCmwHEaK73iA8BCExfwGi7dXLYOzVQxBDdQeij7cVw6_SdU4W717_8PLNxYtfB9CeGosJz5znXEKG821FUfrGapHJRKm6XFIzkqJIoJEmNcu1gWsTzKS-EdvolvAUK_YCYlHlhjIxPVPyPZ5fE4In7T1Aba4yzfRIyE8UrgOnd8oAVrZBmDrntbEU-WhPFwmsI_vmsTBxMbrFYeo1YzfpyZPqTKn1yWmqhh1OjqcDNGUbWdgmp-MTpdbnu1n1Vsx7-0kWeb5CJd3RLaHhqCV0rtQ6pW0D_oub0T52O1wSdlrvY6euuh9cKjuj76bsPrZ3E74PO7plJi2_PeyNkjIO1-MO8ffktcDdEaZyDfv2ABkXnQMy8-0BWz3O76SnmWInQAejK24X41Sp9ZM7GBMKxn4ZoytiwhgrtT4dpWkQTazlfbT07jeexs_eb6mVLic36L3w0-qC7LwHTZHRG6rh-FCdHR6Pe7gtbov_AA">
<img src="./examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `arch compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZUuw2CZC2AQrESIs0QdAn70gcaVmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYciWtHMepnijuzMdvvvkh-3gBZ_lwwto7t0BNlhu6wdTFSHPGp49_4fQci3__QawowjPpAArihKV3c0-Lo6Jf9PHaxcrYOSr2DBOwdMFE4yxrTG5QkdVHeHnN_gZuyVYsxchYMYgOBL-y0CZEslMG1c7OQUUflhas0VBd46B0Fk9l-RwU8XTpwvPy0QCcYGdmHVee4Tm4-poDaE7GhijQEprzoIRT9HFQGounsv0cZKeV8_j08e9ygHLjlA6UvUcDkNWIFWNCsXq8UWpJxksINRkNt4qY3BR9lCF6syyPUAYTGR8QomeOsM7HCrdlCicktNg4zGhKuv2_rMkirrwVcb9JW9o5X_TFqrWR9AzSal5TCJ0vc_Ka7VGRUHoXbRp_dKvAPXwogJU1MWCxKIC5Nxojhc6vjyX5mBIWQJ5xrBRiZaZXAwTJTjmrV6EqtyrXZLUQBYlKI1WgjXG1LABtFgG0krzWdQHcK0ZRIMts9LPmUkIDwOvI3jiPfLrlEDBUCh9woAbqEQ6ejFRa3O55M4X4sPfGLy_GI_UZRpbwYQbZ78sYDX-NRyZxv3clK-xS0fE-zt6nwzaKtLgPQ4r0f2AMO4EMW5gCuVOMfuYva3PN0mWZcDC_M8RxLWeipgnX6F2Ya2nkx3hl4rRi28MqcECdt6_ypqRfmgLaNTYhboKY0xIKjdGxwsmJkCukFnccUizp6GHn1O8oVj0xTIeJzV031mgZq45bbtyWY9vGBXLc0mnirC9n3tkIqey2JiliKMplnudKQeYcwzJ5hEg-IjRpntnokIXbQ2zrKtRGi1lCbvcE-8kW-_hMqWTGqHkW90BSTC2tVCYUMRpvXc-2tMRzn9CEdSEdXmbPUqZWQ_UV6zRPPv3xZ2aTOr3M53szr2KJwNLlaTqR5TqnUP4GV5s8lRP0hGvXpA-_0WLy7QZFuJRo3KrWILOAiYm2Ulgs8lSVuijfX_780_evXr69fPPudXm0H3ZbzW56xXE_-vO94Du001wxVrsmO7Q9KVqf7rQeKnXHbpcTScnGTj1gNzobbfHGn9m1M4kijkfbc8WsAGYrb00apDNv9JzbMbx3-7TM3WwWOEopA8buCmwHEaK73iA8BCExfwGi7dXLYOzVQxBDdQeij7cVw6_SdU4W717_8PLNxYtfB9CeGosJz5znXEKG821FUfrGapHJRKm6XFIzkqJIoJEmNcu1gWsTzKS-EdvolvAUK_YCYlHlhjIxPVPyPZ5fE4In7T1Aba4yzfRIyE8UrgOnd8oAVrZBmDrntbEU-WhPFwmsI_vmsTBxMbrFYeo1YzfpyZPqTKn1yWmqhh1OjqcDNGUbWdgmp-MTpdbnu1n1Vsx7-0kWeb5CJd3RLaHhqCV0rtQ6pW0D_oub0T52O1wSdlrvY6euuh9cKjuj76bsPrZ3E74PO7plJi2_PeyNkjIO1-MO8ffktcDdEaZyDfv2ABkXnQMy8-0BWz3O76SnmWInQAejK24X41Sp9ZM7GBMKxn4ZoytiwhgrtT4dpWkQTazlfbT07jeexs_eb6mVLic36L3w0-qC7LwHTZHRG6rh-FCdHR6Pe7gtbov_AA)** — it opens the
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
symbols for every catalogued furniture kind** — 59 words across 36 families, the bathroom and
kitchen fixtures and the room furniture beside them, each with the detail that makes it readable at
plan scale (see [Furniture & Fixtures](docs/furniture.md), or the
[`furnished-flat`](examples/furnished-flat.arch) example) — plus the two **drawing-only**
annotations a plan needs above and below the cut: `roof overhang 600` puts a dashed eaves line
around the building (an exact mitred offset of the wall ring, at any angle), and `void` puts a stair
well or an atrium on the floor plate. And `dims auto` synthesizes the dimension strings for you.

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

**The showpiece** — the whole language on one sheet: `site` orientation, a polygon reading
nook and an L-shaped master suite, a bowed arc bay, all five door kinds, a shared stair shaft, a
void over the double-height living room, a roof overhang, and a mirrored pair of ensuite bathrooms
composed from one `component`. Every room is reachable, every doorway clears, and the three
warnings `arch lint` still raises are left in on purpose and explained in the source.

<div align="center">

<a href="https://playground.archlang.uk/#z=vVzdchs3lr7XU5ySLiKtKan5p7_EU-WMNbZrHDtlOcnF1BQJdoNsjJoNLoAWqaSyNQ-xz7CvsPf7KPMkW-ccoBts_khJOaMLu0k1PhwcHJx_6Ag-5xLu3n786ft3t3--hWkhZjZXC_jXP_8bBLilPrVOG_kIuSoKqzIJD6ooBCyVy0GUIJwTaS4zmAkjZrIDLpewKPA3B0cwVca6U6fmOMwqpw04Ta8UopxVYibB5roqMrBSnsHtgzSPLlflDGRhJagS5ErMF4W056As6FIeHAG_kOlSwlIWxdf4Bf0OX0HsZa6LaAZd0i9tLqU7g7vKTEUqLSgHciVNqqy0NwdHMLbKyTEcT9WDhEwa9SAzSPV8IayFUsylPYH_-18YL8RCmvGLsU1FIccvxmIlLX3MZVbRN4WcyTIbw7EAI0VxcMRze56BU66QMCl0es-IP-sSJy7Ugypn51aaB5XKc1tIucCVLlU5sx0wuihkBtUC2eJy5ESYE2w1cdqJwpNotJ7DQhePM10SGWku5lNpZAal1vegp1NilHVV9tgBUWb08f2pzcVCZgdHMBfWSQO2Uk4ypjDpGJaiKEBmM4mgE72UGUzEY43HKwCcngZJ3E_ItDZwr8oMhergCHD7ZHZuC5Xhehc6vZfufKKmusjOJ8KUHZAizWGZSyNBwKRSRSYNLElQROoqURSPsKgc7iHStlRlppcHR7jV3yCNfwLh4JuFtn8aw6KoLAgYT7UZQ6H1Amm3zkjpTqciJYLVZIJSMmWOAOMRM1EwCvkgC-iOz_1Tb0yzWieUGcOxFXMJKoOJdjnQG7bjJU5MHXPvQSsWiExXk0Ke5lLNcndwBDOxAP0gzVb-4UZO6de5KGdjOMaXpHiQtgOZEUsUbBpYLRa4W3RSA9UourqUpRvDCxgvCpFK-Nc__wfmyhhtYEXk8AeZwUIogwyQJe05TITLkQ6WqP_qJzCtTKlcZVDwpmKuCiUtiNRoa-FeuTSX5bkX4YnMcOw5cfOcNcO5k8YgDbiuTM0tiMppEEXht4gP91yUlSggU_Ozg6ODI1JPi0I7mBpdOuvFFjcvrP3Dx0-f33b8oYBSG5dLU0Iu58ouSIRQl1kN44lI78co7cge-Z-VcNqMUKeNQRhJw-9efXcLpOaOra5cftKBZa7SHFXLMn9s7xKrO2FSOgaMzELvWRCInAmTyRImdNTEPU9GM8BUpCKTzSn07PJqgIbgUXcivbcgCl3OIiacBbWF4mCh1KQcv8aDocvikfUWZMrI1Cld2rMD0s2Hb4M2_xG1-SH8cgBQlcpZmM8PAGZGZdBNkgMAUnfwqof6NLOpWMgDANJ90L0Z4hvEcqgWBwBr-0rveQVFonQAwKrxAH-FUvZL2EvGiPaMv_gV3zyCV42cfv_q3aetctrBeXN6R5epPAsi7188PgFh4RvkByoHgj1edR5P4G_hQPx9DKq0TpROCccGQliycVlmpLVigmpbr-AY-aSXJavDF7Q4eAEuN1IS8FI6mKoVHhZ78jWbRGFk6SCtnGXtRlR9xTikISePgOrBOZmBkaityxRNIBtMwmXyUhxGUx-PZdk7w8dxB8ay7PPzCUk8CQmqJlIEVuH-Q6pLZ0SKKyPEcW1f55WV1fyUjM2ZMGk-PoMPmklT1qubdx_u3r2-JehavaCILyqz0Fbe8GEh5HAAUBIXsrS8Em-hmRtfWchkqqzSqPJXInXFIxTKnw6k5CsLOS4UqTg7gGjSZltRdIH5obKX9P9CGMfrdblK70tpLUoz_ALHSSc5gePuVRI99C4SfA4PaaGthF8JlpeQvaT_hfPjrfpZAg5d4QgoxEQWcHjLJB1CZaUlwSSIIxir0koH3WEy7uARhfG0qGw-7gTt4Jaa1VgtNTdejZAMz3HBEzr_LheODLCH1shUAZ_fvvvzX28_Qa6tC6Jhc4m6tTdMYD6HqTYgy965LPsdGC9HRW-EmmUMvST6_Wh-4oFNVZao5SKFg7JUqFLiqSCXq94NL8ZdhqL5UQL9MtEJyqwXYsQupTDSoOKTpPVSXRQqk5YdJJxrKgzagzNS_zbXS2lgpqUFpxenn969efvZM8gjRgcjyB0JLumswOX3t3_57J2XsXBwOUySMUxkoZcnrH1FmAotSCCWvY4CrS7KcqnBLoP6P6N3asMYhquS5UaUaU4e7-LUoLkHgFoSWIauk2R1TWo2hpkIq0rYBlPIKaK0YS6SZDUYtmGWKfC7azAT7ZyeMxLtD71EMIMkWV0SNV7vvvwjfgj5_e2Pt--hS2IiS2ce2XG6qcMI75p6hyJTKIzn3s3ogPcl_lAivdcHh2-MrsoMpoXW5tCrmyM4PT09BTpj9Pglfjzyx1KyDsrAoKTh0UT5nQtVwoMuqrnshFii8cEL6Wpj4T2LY_Y6wpGmczmRufKORuTH-HAvrQwGPejP3L5-c8vKSoCVC2GEkz6wSJVJCznuNLD3MkP_bA7Hg0GSdLpJD_Wo03DcvWg-E8njdDlGZ0w5mFTFTFr4-MPnn159en22psaZsXLlpFG0_KDGUZ3xFkCtzPuszcO3_JknDd9FdPmvcJFr5BmRqcqiPkwgXTZTrI2ifaFnOiK4_s-Nz1Y5VShH8cPshv0BciYtO2PkN0x1hZ4NOV_eGtLG0opZkQbGSutISXaQYd61a2yxW6pUnqyzbTnCqUdlw7k26-D4dDj0xo_-_XUbwPJ5APzk-bcVyD4N5Icf7wRCrgJsN-ox0EXAufAwno9_wcjhlFzvGsPCsfc8cSM2uKinU5XKkdw1LfsSg8TzgR4GW4lf6GUmzWi5H-kqINFDbx_SEzR1kwDFT9uxOJh6SEf2SaoYwB-q7WikwEf2IYXnol3FDIu36RzdHA6T7EKV62FRJsv2NrY3ruiSWzNabqWkF3zAwRYytgPJfUDReM-gHWDqYZShSd8nxINmPD_vOA6ZKkf3yj1DoOJVXu3EQlu6l7BoPD_vIOxeOQ-29cwnG2DMsqt1MSC76iO6mdHVQmZs1ygywSjJ58t-q2H9mVIyPqo-vPMPiHpYW5Ta3R-xRgfy-WuFFxwl_LxCLRNc_zf09iGw689jNyCDdWggWVE1kKhHAuQP_LaPJvzYDUxWCkxmUCI1mWjKVr2IzO_p7UDmMt2EE-SLEVytSQJc_6oNR28HOMw-hWX73SSWezfj8D3_v85wNp_k7N0ApktTJ8pZIdlZQHt5dwupNqU0URJTcdSDcQVCYk4TFUWN-erDm_e3r3ldD0q0E6Lk7JQccaLPLilRIIwUHb804TjGRc2mVXa2wSg2EAHS_7r2SNYNQ39A0t7vNUfSP9TjPEPvkA9-x3mGjYnZWeYdGrQ2CD-vBr04IuX9CT8EzAg5J2jWwf1W-UCXaa3BcfcvIgHl_TxcB2eEDWD23z3VjZ5jseq1gF_Tyy1gRtgA9hFBI_8R8PCqdaT-yi8frgF7hA3kkK6ska9ayL0I-TO_fFhL4LfsZvOBO-eD0kGBpVoJ-cq0OSyeujGhLJ0z9SDJN1SGAlkLoobGkgLEuUWN4apPWgqOeyktMBFGdujN0wI1MAUwUGLcDEbOFGb4MS1TI1MuM03x3ZkRi7yDMTbOoasZHkbMnt9T6umecmF-fipunGyekaBraw729nAw6OO3oij8CaDMDwYbVSHQMq273WQniDc3lGynAgNlwZWr6H34fQEYZ7yylxl7SbUY4jIu_Ilbqszl0MWjRvaPwxUqbABF1pwjID3lz2wL2yuQCJtOM7IkwF8H9Mgf3TVFpC2aOYIN4x__iaxP73IYraOfNDNx_LAVaKSYG6wdtlIa84FTHs-lMnj5XAZC0fKOv3CA1AaWD5OkxmwBeRs5kivnqeR11uFni6k-QNmkVleuBR3MLP9wxYppjDxp4dD7CpReIaGY1mLoNqA3tPyDRa9tcP3rGu5697rR70q18eQRTOO9IvsaFJLYndsTq8IGvvE3a_jwFYI3K6bFPxMwaNfIc7nevku1i7pL9JtcUJspzSS-1sjU134qcrghvzeodwwnaeGxYRv5Oo4nel20uskT6gDlimAxIU4ryF7qOjjgjfMf1jmLVG4ObMIuGtp8XBdEzFPvGuzt8prMLHE8uqMRX9aUrq-O3pDy31E6xTTFWs31CaWLOS6Fqcrk7Kxfe4cMhuQxR5HtSNgLUPAf0O02vL_0a_Qxyea4LrIhkq7WzxHwidw5_DpZP0Qb44MnciyFz8Gf7ALrdb8kWCTC3cE2sHAMngHWvUz2cQmO0Bc3KtNmF1ptJdePxtX60ajhWAA7PmGJb6yJWpPM_oIZ1gY0k_a-bd87vUtye7nGc8EpcUqix-arwfCmOc2xgI4YuCEd1LknTXIeq0R7MCboV-WymAY6MFTot-not-hogZhqBhuLGSYNSJ_CwUFAiVz1qIKhp2JUxCiXiHLRoCDAiszwbpRUT6dSjhx5iRxMIlMuG_8PT8BqWHNlK4owc-ZqTQuFUMPLYUDB8snVMEGn02F-une5jyqsfK-7c0jUYNCsbX2rtoMoUep1PnNgN2jW1kcO9fdyyD2MsNwOYiawdhWMXW0LplMs8NDRjkHa8kunx_OZlCPu-cVVTQplALo1ig-iNnarKl3j3ayRxMfVyhnVILuBsAG5I_VGXoQJYoPfTOC_HVlV3j9zAowP9kFapx9ktA3PgLwY7ofMlM2XwuaeE8-BvOzuh5walTUO-PMgL_dDUqfPKBUTVUoHG_JT-31ho55YtLJYIl0T52s6ZJE4X3GRch_MRBjrtC4imKtrFMVhDTPgYBx-I8z18IvAdJPudpw1mHYBlaWhxWNfIAlSVQtqnKKLpMo8Un5uH8bloI2xtZJLb_hIZGcxt1XI3Swrb0GJC9QRSqgqt9WFYDt3Somcy3U5GdSqIEqCbhlLRvKpse0zX5WjQlflTDLINWVlYit5HVvrOC7YDdJFB8yj7AHhaEDN6ww4StLpn-paIwlWEIkkAYdBaEgLwfDsClbQO0tgfshQ1DtIhU4X_AbUqd75YN3dC7o7U4bbq_5NZfked8yF_lNfmccmFStTXWbCPHL7ku34-mXTLBo6KWaiKLg_46jpb1xrfozrz_-GQn4PDn-gLsk_vo5fV_I_6JB1oTYT7pqZau0WBnMpyKlSc-vgRFN_CSbBFwXWg0MHQMiId7hqbkNPUas1lCegqMsq7OiCuXLUDMdCSfn0UEP2dX4Mn-W0svK31N7bVff1entUxg1tVDGfo_rrl-R0U4OayKw3srC_A8z3e3HC7WJ7wa5Ef2UfzDDqHLvajTSRWf8Jgq4jJF9m3U4Ut2w9q7K5rxrpj-b-0ubuamRUTAsa4vAu7lXfVk7DfalTh75GFRUt4ja6b30DVy800vHnLcWKUpYMObwKhZBGc8aQ7_HVwybnH5eqWlT2g9-xDrmTyv5WKre0nsqyFxdt9r3YX6MgtKcerJXMYp17g9Ws96d3b199f_u6XexaGrGgrQlNq36y0Nhsg07hPjrfRO3SnLvNXa5M1oGqbDrF65ZEPW01mWIvIDbSUEHC5VFFbiJJ7wjSO1T-CHquVnCbBQS_xo0iWyybaL5bHzj-8Udg7UPQUYONBqG6BPcdz3nHnZw-AE46l2Tgn7vTI-4VjWiLaxeRCIuS0pI-o34RhZDoEHVjEeZXd5VG1nqR6HjfYMEG233R8aR9wjsIW-8asPHwBgbupVzYIC0ed1oVha8fYZl0rS4koH-WwAoGZz2YA1290RPrTJX6dv25yjL8cgrKnR20y-xE7FrFcXu58Q2_-QQDmqrQF7TmG4Uh1maUNQ0GJyRsn07Xs5IJg_u_bTArPZ8qZhtFyc1m8GU9OJQxjuB7KlhwOx_fvrnhJvTQRa8sp-iwexcT4KG7UGYdWAqTGT2RvhNHBQ8EiVqi64I7oecL6eJmRVIKdSewYJLYmxRTyAXeVeALPk5DWkhhzlpLRYUZ11pCqzux63LYWvHOSguq03WY_u-DmXP1A083A2wbv6N-xJqMqzS8ed6WU6p-uKeEwiM38_fh4GygDdcT_36zyPqUGRuXwmoC8_dCikeuF_treaSRjrn2jPbi7uMPn9_SVnag0Kkomg7x00KWM5fDsJ8kJ6Q_SKq431uQL5oLI7PzWYW9jNgSj18vKdtMVyu8AJ7h7YXRfBxESxZqIrHltHiM9NHHD7fE007T6OpNRHPbpmDFh1Yt3JPzFghvkfGVAuwu9z0l3i1mScX7EY1KCZGMnyIclVDDx6kOQt3c-Ao5W9j66oP1NyXKB1kipCggFVaGvtpMTmXquFUeb1xgd70b8x1MUOHwHo9_Gn376vPb0Y_vXo2-vX396ePH78Yn9WkMs9B1SGFIQuh7uuhDfevIiU50TWPLSatFsz5lWATq17K0T7hl2Y-G958evqWY9OW19bbqRq85rb5U0txT6XX8naNl6IzZWkW6aBdbGoT-LgRKxkf-R1xwXCuKHLVC6agq0oKj5EnwoyN6WnBeS3S4l_gPL69sKbFMZBan4XpYjx82GZthaAOhbAsa09b4EnUxXu7I6mpENH4w9NnAneNr6-ULK5hk6cdddysyfNH4_QtAbc0U7FhAf_8Cur2LJAaoV7BrfGsB3X53bQWDjRX09xSGSBIp9dbkd7E9LSoLRQYnymJS4gbReReQhsuL9fRdw4WtEC0-YCo2hmjt5HMgrnErfiNEi5vDpFW6uVqrAG2FiMpSBIG8uE6SjZrUBgTeY4xbFkO0Rf1bS2XlKXZsAdVVvXnyEdb7oAr852A1nypnkr7pXHab9fXi5ObW5W3UM8k_6VzuKmh6kM0ABIxQBXl81DWWoWWs7fbOTKBPZLHTyNema39T0gVXMDKrUslGDof422cUmByPM2lToyao0v5hMQA2cqGNo-ucVYlZb0K1f_v72PesUVykspcPa9EIKophw7l-6K2MV0rG9ab-YwEU135---7O38T2hPlMHmnlTp2WqxzKIi1UOb6-65E5Ldj8GYQOTPiqO3FgZiiRiMmbmazDqSYVSLa2MQO_M92ccexHESv-gQOf0lnh0KRD6ZAOUNoLuE-YQ1Z66dG_RJoOkGf4Uq-5WMZ_AIERF0b_A52g9o1k9jHwosto8giHr0yavxflzH-Pxd7DXtK7OE2uTnuXh4T868H_Aw">
<img src="./examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fifteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVvdchu3kr7nU3RJF7GrKGb4J5FO-UKJaVsVR_TKyvFunTrFAWdADqLhgAEworSpVJ2H2GfYB9hH2Ec5T7LV3cDMcEjJcTa-sEgO-kOj0Wj035zCbSZh_vPtm_n8Bla5WNtMbeFf__wvEOB2-sw6beQjrMRG5Y-Q6dJK0AUIGAzgAf_bgC2XpVmKAnLtupAasStAWBCdU_h0dTuDbS6KV-AyCctS5akq1qAsZCJfgV6Bcl0QRUrPtcuk4SfKwtroskh7ndPOKczupXl0GdLK3EpQBcgHsdnm0n5LU1rYZcIhmSqsSiXh7USeQ64K2YPbTFnQhcQR-AiZIhZ5ScqCSFwp8vwRlLWlTEHYLuwylWSBZJfpXMJWq8Ih4_jTfb837IMtzUok0r6C2Con4V___O_OKSyRe2EeY9iWjhFy7YgdlCB-t5mUrgsF_hTr0qVam9ivGzbCSaNEbsGKR16dRCl0TsH-WgojYSOdkaBLt7dgC1efuhCvZJHIGLba-sm3WucgiyTXtjSykrl1RkrXOYWV0YUTa8nb0R-HNQ764FmDlXpwSEvaoKSFVWkKZTMatxYmlYVn4xH_dk7hTrkkk0WgrClEeMT7ezO7fAO372efZnD7_mY2g7eXP9x-gu9nb-c3M3p6df0OB8Cbm8vPV9fvenAZBOXFj9t0Pb8FAUbrzStQqA2dUxBLKwuHy9tAnEqbGLWUcHb2i9VF_I2FGIfbv_8j7voxTjuR294q19oshJFisRnEJBR6jgskJe-cQmyTTKZlLmlOG4MTy9xLUDkLSA25KFJUywrZi7PGVoV1UqQ9uMKN0EvrTJk4Ws57XDcex2oLVZHkZSpT-tVqSJRJylw4pQvc_zuLWyrUOnMgEqOtV17Upu86p-D8MRFgnXAyhfs-WLXZ5mqlEkKpz2NQIpZzzYGthIAH0opHVaw7p6yj-GSjU5lDqqWFQrseXJI44N3N_PMn2sSPl-9mr_aPhLJsTSoZs2J2wWqEVi7TpYN4K7bSxHwSmHAnaa2KVY-P806XeQpLCTYRuUzB6YaK9uA9LstrKJ1BVkLk7N3lzeW7GVwxn_Pb97MbeH_54S3M39IvN7MPs8tPsx6rDR51KK20CC3WMmbJIgt3qkiR-TBNpShSpBZO3tH4ExJ1_HnB0y5u5_PF9eXNzfxzDBspLB0Z5V7BuDeGjd_PLoi1QJXx0IPeBWzItm2FuZMpxIkwMRRSphZVygIdXmUhpg-e1S5LWT24jJj1Rt_KBJVA5J1TyKVYscI4cSdRHyHJBa5OOBB53oWlTOi7cjS5hfnfZjfv8TAbQcbcZaIAi3qCqqINiiJXeAnUapYKm8kUjEycKNa5bJpwZpZVTjjQ99JkUqSwNfoX5rQHn9FKIzASISf8zOK2KwtvZjdXf5u96aIuws4o56S_j4y0Or-XBimWku8HujNcppK7QloLerXqnIIUSQZkZIhnEgZdWEigXAZkLHp0maZG3Uu0gMEwo-CDBQ0PY1p955StFMjNNhNOJXT_IJuEF9QHRGF30oRzxyJhlZ3fXM2uby9vr-bXPPsWDxSZcts4ReHCuZ7f3L7vhrNSaIN7VEAmN8puM2mkP26x_LUUTpsFLoCU2urSZZUhCgfp1huTXfbIp1nd4zbj0WD18kb-21QVbCNIfjsdLheXGSlhKVOynyRZZpumW4lEpI2rSpp7lUhY4g_WieTOgsg14dZr9YK5nsGb2Yer72c3l7cz-Hx5c311_a4LuVyRrdAFbEuz1Va-ovEAnxc38_lPi-v57WL2bz9f3s5vFm8vf0Dz-9CnhX_PXMIAXuTyXuYweBm2BPUgE0tF5p-Wz2pRaILm1exUkepdD-aF961oHeSIIL0XAmSCFLcWBe-gsFuZ1L4S4aIgWXBbqbe5BJtLucXloVSkdbCWrrVhEgyaIbRTBYj0XlltHtGWrxzvEEAmS6OsUwkfGQGpeMzJyHqbtJFFxQl6XCyERKDlRS0K18PKSUOIeGxxWjRmPYiFSTK4F7lKhWP1SnIpiu9aT-DszDqjEheDkVttSKXZjet1SG5oRtHpeI9W_wR-6wCUBV68m00HYG1UCv0o6gDQtQGXA76ME7GVHeDLAfqveAidBii3HYBUbSyI0mliXOQ5DW7e9B2AXK5lkXY6AKck1nCT9SDmLYu_jeuDFdN1ifIkJxZlpws87GIjIVWGbZn9DuLKbyTkhoJthSHHk5zMmO0huZaquAsHfIvG8oUgk3qWarKFW2ncY_A7CfSHs483848viQuRppYhe7l2tU-CGj-ajGDzv_8DbBmWj-hzJw5spmUuEtlDsaDDi3KHoKgkR_qhXn3jx7A8eBF1o5fwYjCIouYn-v8lPuVPHYDfWcifMpnnkMjCGYmrsazOzaBCFPDhFQjo93tjeIApbIJDgKdR0DX6AOew8UaUcHVBvhqzf0Yme5WL4q5Hm-zgFl7DMIog_DsF-YCuuTb1PdGhsWgU-nDyjv0lsuEnXjh0raj0taVFHALArR8I8GIwjqLuaExi6E8PvvQj_20UHX4b8jeC8F_Q45eE_fseK7tF1gfSKkXOY81LP4rgN3hxPqmnps8e8ABm8CzMdFDD0OcnYHbPc0NLmkY1N_y5jSL7X2ZmEjVENjkKsxbmKMyAYZh0dGQjSFmB7wCVvjaLDDEB0GVqShSs-k8Jg1EUPeBCAHKxlDmcvBd5fgL1P_IuCQMV_7Hp7rcmsq5MH_1EDRXiiUbDKHrAH6qJPuHwk9ZEerVSiWwB-1u9BmbJPwX8gYaf7AMzRgu4dKoSTUNLPPAkih6GTeCfncqVq3km4JJ_hF3SAg-hZwU-iVrg4yb4j95TeUOeygmDBwzvvuxP4F1TmqCpDzQBYj-cNzc2ePx73Hsz1GG7guaMfDfy2LtVmoANK3tD6L35cMZu8bohWvbw09fpgul1AWxphCNWYKdSl-EhiAAvIMmOEDnmDMiKWnFSh0KYGerBtYaYCGN0CiBGJ776jCj-s97Kgi8PDtHw4mJfb4PhOKPPFgi6-PHq-s3ihw-XP3-asTdBbraRq9IKijLRLGvMJpl1iT6HDxkpKjHiXuYWfv5ILivjOrprFEad8IvYLNGP4tViVFto79xrCkEk-440caFRCNJsZKrQ8dhq6w9-gMbb2_v3B9FKdQ0fjVrwUi5kHoKzEMF0PTBO7yGV929yUaxLsZbfcESS6OJeFsTOShsQhU-EiaW-5-mS0pEfeaAMng__p6kU_dFgHLRiGEVRp0XpjQnmFPCaEA4tXyCYRtG-6tDoFoK3Gg2E8_HTCA37cAqXsNXJnXS01bzp4Zhz7FVoSLQxKsVTEsIDFjNtrfXeHIH3e0PYeGS9giXe7Xx2WB9eKMfBMkzGEalu0LtJFME2LzGkJ3USea53okjky7agyZJ5pnnFA5LypFoxfmK1w5Pn2fFGB1XS71GIsDZlekamhubgsyScE-iFhrGZsEc2nOfHD_sMHIgcefZ8sMkmSVZm07DXabcU9taZpIbVwcNOgOlrXdnbxvLP69n750HH2Mxh6OIzhsi97fLhr863YL9OGp_L2ZaOjzcm_uKlWuk8jYkB4sojN-JP0MFMbvGy_A4EGy00VbAVytTEULPuSVKZ3PXgWiqc0mPbnZRbWx8_3ClKqHxCob54SXFMUeY5nVLeMcqrLDFvRWYojUPSLsQB_hLn-NVJY1DYPgJcSriTW0exkUHNFSSa9pbT8oAlAntnfNSvDxye3hYhLhJCNmaPcDga1BtXK67BGJA3kWNZcpVUUXkee5NPL_Y3_5AsXP9Nsin6abXGHqEK3sgew9PR3h13hKyhnjXZoEE2CApqHWoH-uqOnbZpFHXHg-pqn6JfggJKlcF40e_g2dnZGVzxHYCf6WdKd1POPJX2ji9-VQSLCaJIMowC9PaM7mOkyEub8UQotocLv5oaaan1HS5hdQRpqZ3TGwZrInlfqoWUZLjS4IENh1HUPY9qFwZdpCgCozFRjBiNCTstKKtXgoB8apIsKwvayjVe3oAVhZWVDga4x-z-Dtj9ZeDGHVADm3Jdc0jRQzSqWCR6FNMzAO5-gTkBAhiT9zqo_UDc9QdUgj2AFsIOr2fz7NqisLaLYWCmMq8NHTCPiPOHgCb9Z4CWwqriDwJNp88A7RLWyT8C1I_2kVpQ_oAtLKYj9vAoKPMg55Ws_fi2Hjl0auAIV02UesuPo6yMStfySygYyzyHwl7_gpN65OVHrICTSgHpiE6fh-FTxvRDou9_8Yx9Eanf_6uQmKf-5ADpaxj5EnmbXnjq8Qht67SWJxrXUXWGqizNnvKr5DEJOzIho1UbZ9yP_kWLvmmh0fnwhcPKSp_6AdfoE4ZqbhdrI3UVFkMgLlMJn98uKLapinXBMWiEMrqQjfCBam6YcjwTO_SuMuFwDNYfBDgVwputcA6T8j54sJggpKXNryks-_R-NrsFEVxISl9ivV25uuyFnt-rcVTXZ9gdSdVGFhYDCYU5L7AOPRq9WjXred-EKM3IlTRUKavpmlUdpNuoPFdUh7bkW_tcnHcPfdFDpa_XC6p8QF0d4ah5zLk_una98rSyCW88wckh5Fa4DDDbww4BQaL9DYhepUYe8hCAYuUccuxYqFI0fAk2eDrHDMdw1ODpLcXYSHbyBOiS4jFHTrWDF5NpA5UXOvKgTwDIfYA-elMBgZd1EQCOCkZpAP_HJ27OKfN20crcDIeNdX1EgiNLytGktwRNXtEe3iDgHdl8cjXB_2kkfPYZQi9lMD0GQHVn4Cp2AOiPGaG2HpiEeRg2ky4ftc6PLYh3fG_jx5ThvBg1nIMhWhP8r0ptHd_yR2FSwHoD5iT25N2EG0Ye7RBgKdOFhf0tJ4BBv9_gB-OphycBdi2A5oY3dGYSPQUgoa10kxqiNs-TaD-UazWWcBk5pmg8BuogaDTSUI-AYJqlMEZRXRODOhrpmzhCbgTzIdTVkL_CmL9Kw1IyZ6uTDNNhDjJqcil0FZBy_wX8olVBv4skwSQ9o66N2GZUWz1oB6nqTMpBWWD0yS0Q2B7CiSI0pOERddv8_R9xDy4DNF69ykKKptPIFGsmVOFp2s2VuOMnuXQsaw7KcBUcgirHBtSLJH294gPAGQ5KPzfS8S_60_PDb2gIX1Yj-RtVAnyqm_cupBar3h9fGuZOLOsec4ktBOiWbS1wPMx1dl_AJRscapLhrlP3zS3P9A53XFFyhJe0kZJuTMppY0LlYL2eMU_1G7xAR4EO04uLfvj4--HNzimFg5v9rVo5idGfLzvvZOEez-gCD71NvqcJ73mOzUMyMTby11IZaT-LPI9fBQrbiNy5bsAXtnxI5LbuoxFV15R1ouBCFct4o9I0lz6wR0ukmqmMQpuNyEEYI4o1VVz3lEhgeUk4jtyD-CoXKXQY1a7rAO-P_mh04Lk-QVl7eAM29JNnPM0vYgwv_v8YzMd41Mb4g5N_kbDcLI3McwHVjTCatmQ2PSqy5fLXRr3GW979i-nC2-12sFMWi1yXxVoyp3xyR_09uv7hjG26fvQkYZsS04cNTlmo05qQClL9I0kHVewtccBm5XzP8T7_Itnw_A-RJTkaIEs163q2SSPwH3Pc3qKT97jvZk3RelWWGURND-FheEC2ESpf6od6_5DL5sUZyNqpBSM2W11xOaVtv6i1fBj8kQM6KZvqQiFUszxFuzAYfYmQ3Ituf9LYPpTn4IhAdaFWteuEEsEzUQsGPz_0D09FJqtAuuGUDNpOySGhzUy5rAmn9Xzw3GE6RnYx-FNk09HXkg2ifks9v4Zs-ufIhrUs_9jaRjXVV5D1fQBwbLbf6_aFAZy8Vca6v6h74UiZ_Gs7FP6aBoW_pj_hL2lP-FPdCd4rOAlNaP0T7FElN0KoomoeC-WjqjGR2u5FnujikRw5rFGIjUypSKFccGKKcrOUZs_DwCKYoVKZbrTqYfsqdfeDlb4HzD_nEGmlqkqohw7FNFKo0HeJDjS1-pN7vsJwGrMIKrFd7ouisiaqRXq20mYD0jq1Ie86VExiJx_cmafqOcstlXDyU0MeJxRyqLT2mka9CWy4QERJkn4U9drtDt5NazVstPo1qoiQBp-Egn6zGzvjzrEm9lKmAzjs0Wh1UnjsquHQdyP4RR1CDvcgp9GXIYfPQ3Jipd2X0WrLCJDCZSxrDyl8p9cei_09vEm0jzc-wmK_xWLI0ena_pDjzucI-7foTRUqsEmui2OdXRostsmeD3fQKVzKXO8wB2mUbLrclGpTVdc22EysXBW0cjAZCvSkIaGtvNHv1a7O0YYfr6JP2gVZHHtIPnyihH6MfNgmx418ph69Rx72bW_2_hP13GOz95vdI99ffvhhfv0fjS5vTTeGcHBHhVSF5f21yPH1gLpB2tuqGIxQufV5S_RBPLRvq2WLilautqFLmSmO-1EHqj5Utlsr_A-tku1CKjFCTXFFmKb1yDjJN2yqNirl13wol8Ed-n49i-s5Na_EsFKU9ESj4pmumPNpiAbLCocdtJZTNyy9mRSqsFT7rprdGYbstsitxmZLSwnjRujZVD58mwVzbPFhwiWwWNrwktOBpvoRxwrCg-H4qwrCbOb2-k0u6rruE-VgtjpNosn4S8VgNn57rFK96_mJyBztETUq5XUheD9B5sUT_pItG7byYyOqR06axpFGn_yJynKqd0U4UPT6G1pCWONLNXGzpBVzl3bsK8D4RgpVfuNX1bjYqzwnKPDlMVfrUGkKeHsz_6lKZFT2D83nUmNuU-IbTOUW_Ps9OIqOLc-J2SyZ8rEOtQOM6_EOjEgBKWtGkQS_77AtKRB1uqGo8efF26t_v_35Zrb4_vKHHxe3c2rIj9u5jWWIYJ-pWdblxnEoNVO-Y1AVVclctcu8JsX3QOoBjfr8QV3-MMYq8DRQkqfhcE8bN-eYS831_H9iZcNqZRfVyihYjBrIgy-tbPDUykbHExVfxRnWAZ7ibPhUV0Q14Gs5Ey5z5dLTczKy6qkg-9Ruqrg43lThK-oHOM2OiibOOXtWT9TTn4JhjhowI89NIycrxb20VfMnysG7NuQYs4ePTgjGa2jxaRvi5outoXGQ_OdOq2fdeON--_7qE70v0OWGJM5nx-ENLwwUpExl2guJVd_RaBV2PQaXiTlDnQ_-VKF5Bf6Ng1UIACo3e8U9kKJYw7gOP51yeXiTwL_A1Xq9g-8rfPNysXyEk0uTZB9Esfa_Y2xwMogG52fR5GwwOSHc3zv_Bw">
<img src="./examples/garden-house.svg" alt="Garden House — a two-storey family house on a 22 x 22 m suburban lot, ground floor shown" width="620" />
</a>

<b><a href="examples/garden-house.arch">garden-house</a></b>

</div>

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=jVfbjts4En33Vxy4H9pG3B3Z7UvSQRbIJD2YwQZYIJnZeUxoqWRxmyYFkmq7dxBgn_YL5l_2fT5lvmRQRcmW3VlM-qVpieewLqeKpQu8Qe62tcojQmwK7aBq5eOWbMQf__kNsSLkyjqrc2XwxufVe2U3oL3a1oauBxeDC3mqI-Wx8cqYRwTX2AKjWoVAAZ-VzysYbePn8S3ogfwjvHNbuJpsgCtLKORko1cGlTJmMrhAcHLyWsUKOsAyDJ5UXlGBWHnXbKq0gwome3WyvWzYDLK5cYEKKFsMLlDqGKnATseKmQxKvY-Np_CKN8A6FM55GFIlwo6oDnA2OpSNt5o3XuMjmfIqdzYqbYk5R9ZBb2vnYxizzTpKNLWhgNK7LRSCthtDKDVHqzbKYvgxBXr63Ychfh0AjdUxYLsdABuvCyyyARByZQjTW_lhnY8VmnowAC5wt4_ktfMIFRmDZ-CM6aidDdf4qSLsX8-zLEOhH3TBcWtskPh8__P796hIb6rYj7CQ6oCdMoYKyYgYz--NftB2g1CrnFKQvcBzZ5qtRagN2645UG0q8FyyiOfCfT2A8II6oxErnd9bCgGzLMOvGGWTbIzRKst6i2WW8bpbSCbxpSM7ONwjmyayeUczP9J8M-4mnbo6rr8ZOp8foWn9hbMlEdHFa_-pjaSKrcPpL-h_E5hgz6bCqDUZDN-nvc_xdx3ziuwQDZdSS3GfHp6wr6lgOmbvItCxsyP7mx77dylRQxz_hL5N4AmvpLLHm6Jy5J3Oj7w_KGP6pC0tU5zaymXa40zh6nEue7aqWH2FU2SbioEbh80pafDrkhUnjLb3gSu03dbJlYu_q4RroWyj_8d_f0tIHbhDKW4l3LP43SjXPm-MEkFYoiKcNJDxq_4RQsrHiOPcxLChCJXakIC45jpL2Qh5CHC8ik9bpW0br5ujqHe6iBVLMDsvsErbDcFQGYGwY3M1i6WzXRevXV-NKa-rI-fLLDsX_blJPbkt5wdZJPiLp_DWpNQ6kkmuiU9Ie7pYHnTxV6R9P5mUC1bbwu3aUpuJaUAXsMV5wE4BUsC86RDh2TcAFrMjYHUw9QAQBbS1zO0Yyji7kYyn1s7bb_muuMfv_0PuGhvJ8zJE90C8KL0uNoRR4dXOQgWEx-3amTBmuRzuqK43fBKqVjGT2YIjIAX2InWaE0x3HLqUsssJJJjlVzDJLvQwLxd_hWldOGJmq6fnLLJBvwifHer0wDPBPdURuSHFhSNRFB2JBsJpPIIrVYrDIpvMbw6NhlWxF6G3jeajK9XwBCoaFzHeJIW3UBbHfnbaT4fJaO5Wydh2tvh_tl4G8MTziJo1PzpzgXUs_UxIu74wvkWo3I48tJWHpfLInbfkJ1iroC3URmkborw91MkEv7yFS5Dgmva-F4F2E57UUKy0LzojxYsQ1WOQvsHjwqNreBSEymOT5rxINbQNuqDUOHn2-OWt9EubV87zrOYOdJchHQ8qNjRJ41KAdzF10dH0RSYG5TpE8raFCnHCscljZn939-HHf969e4XPpWlC9RlbUoHD3c0tKsrmS55MLHmUKid4FSvy_NYeiMVNT3lUPKVdBhlEyRtt6WgmOzDLsu02DVyXcqWVV8c54DChWrWl4kyAKWXSKaVTHC_Ql50E-XroZe4Oz_BRHAgYpQSPT5UpyRZObjyT-fykhuaLxLlW-X2XgOq8nR_ZdrkUpLZor-aUPKxdjCxlDvFhTtmvsrZA3-kt2cCZC9Gzam9TNKUJBqi1e6AJ3AP5rhXaGKA8fxykMdVTSZ5snlIx2unI0Ryjdpq3Bh072a4bbQptN5cB__j5p7sPktCA0f711TTLnq-mWTbBY_qx5KmslC59cZ66cZdOMUeM51QHVrqPHFB-KaUhkuFL25MquCB3yhcTIU25rt09NygJ8mH26AwVIe8qbSiVXa0sH6KN6bTaV1pb6L0ncilz279p_6_a_3L3y4Sgt-3VzV6Pr_42alecS1eWgSJmiwyR9hFD3jjsUKs-6kjxFHXTR2WTZQtJA_rZWXytJtTq5KxpN7AwcHqYTJ-gloIaAFFHQ_JdBNTe_YvyePhketN9mw7ltdyFn9aPGPIn6FtlH1Ro36hIGM6y2fIqW17NVvz0y-DL4E8"><img src="./examples/studio.svg" width="270" alt="Studio one-bedroom flat" /></a><br/>
<b><a href="examples/studio.arch">studio</a></b><br/>
<sub>The flagship: fitted kitchen and bath,<br/>an enclosed bath off a central hall.<br/><b>Lint-clean, and import-free.</b></sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=lZfbbuM2EIbv_RQD78UmgJ3S8iHuFltgW7Qo0Ba96N7HI3EkspFJgxxFyS4C9CEK9IH6Jn2SgqSkWDl4U99Yljmf5viTegMfgFs7z0k6a_eAB3S8J8PQalaAUJBhhzUU1jktrbuYHGo0MP3Y2vl3ndGPNfIUPk8AGqPZw34_AaiclrAQYgLgC6wJFu_SL2MdK3C6UjyZALRY16Dl-_bKK6prAKBbJqetA2Cli2tD3kO2FvAZzsRMnMPZQghxfLUVIvzoL4raeoL7Efs6h_gJ4WnW1hyxFyKyVz00XqwjagzJ1esgybZz7jnQdZ59CTRQXvYGWV21r_Zm9ZCpMUdhzPopzuUR5_KYMwGIHaDle3d1rblQZAC5K1T38foTQXj8bUBAjTnVMP25W_0V_KJvtKmmI1ZOchFsA6svzMDaPGb9ip7JQdePT0hZT-qDGHu1PCL1LZ09giCrkTsdJ0KWTyDI6qkjfZ4D4_KLjJ-wrqchv9JaFwDyqnTWcDTfrocatFqyCnUSqaT9GCltKoKaSgbfalOBNmwhedFTh2iydfQksb4WomuPh454hjZyLSbZGkitjQxZdGjgJfs482N3guGxO-v1Q2KS-fb_uTNkd_O6mMY-RUHSRto2grKjzkugbEh0r1Jji-1Ti9VpCzFbDj3ZFXN92iLpyvK4_CcsklaE-gwRjTpn9ahzQgrewEdFsE9TlZN860ERStAesHaE8g6iTFAn5tH-zFlGJhDnFzCM0VsPXqEjD8ZGcHpU2FuCeb-rzMBbCFtHfExlyQPbuMLbpn-ANp4J5cUEoGyc0dw4Ct6lxulycp7mabEV4jZbjAZ7-qzhMjTc9sFwFQzHijCFLrTFVowYLTrpbE6gDXSahaZQ1gHbwzy1Vlk3XnXsTIjbjXiBgRWGCPtidPJuy9ITpwr3T8lSjXoFdY0BrK2pYsJa6hgzKGpCB7ZM95-03Dfxfh3VFxTWJdgygsPtWD7Ga_KA4G2JgEaGy31wjzGvaVyI0mlZUSf5j2JJkuSpiieLZR_U5RBUt3WMgJ7tTc97JXCzPQXs7l15ba5fC1yc9DCkJY3Vdi1mm6GJtutY576FfrclTuFlTsxmP56zZTZwLtM-13M-hnXTMWfskLItudOdFHs7dRKyGrdi8eVcZz1ntX6Rk6PX5rWc5WrEGdSH8Ib8O9h1hrsgPqExw_HzrQdrKB305MN50WlTRSUxFnbhqTsoamw8gfaRa4gkySAtUnvc57pqwlhrvkg7dQn2hpxCU8FaiOTLbzfkemU17GdgG_ZaEpRYUEAd_34Hu_Dld3BovCIPhIUCMvJgteGwNDKt6dQt6RqHEfZxS4zuxzCdNkwS_AFNHzq7hmAhlkLAP3_DNnyzokjMG13LMMd7Qt8Evf33z7-iUdwt4vrwHcc6Hs0PdePT1EeZjcVBHhyeRWyYeWOZjtZoHw4r4W48lCuKWlrENO_6Q_8OvMFD53V_mryIyB9useD6Lv6FTrPaE-sCEBQaOW-dZiYDO6Zb3kFF7KF1QdvONEPjU_U83qW4zgNT6n1Mvh9eAebfjt4MermJyjtaHZc-s2wCwJprii81AAdn_6CCn3nriX9Lh625yu9g-sEV6ns0N-i7f0J7TTORbeZiM8_W4e795H7yHw"><img src="./examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=pVrNchs3Er7zKbqkQ6RaUktSkSIr5QMt0TbLDpmVqNWRBGdADiIQYACMKCaVqjxEnmEfLE-y1d3AzJCO4-zGB5c4HHxo9O_XDR7DALwyKy07Plgnd-DLRekWwsCiNCuh7RZ-__U3CIWEyd1oOJ4OpqPJuDMY33Ym3w_Ho_G7e5AvYr3REk6ee2f9i9Oz1nHrGKaFhI22AZbOmuAJwQcnZQBr6NP95GH6HoTJ6dNKuFya9N14cjd93wbFn7wtQyGdaR1DIdfKbwrp5BlMC4FgEpYiC5DLTOWSN9oWVkvQYmfL0AZv6eFGCwM-iCA9qHBNUgJ4FST8nESjnRqbxAe_0MtzfHcOuRNbD8aGQpnVGYwCGLGWHpbqWUKunMyCssbjUebCZQXk0mdOLSR0Oj94a6DT8VLLLNDe82tCpu3ncHJ_2ob5QmRPczgZV6pn5eBX8sdSBOtmXuUSX2nDQmai9ElSu6QF8bXWcfMTaCVRcBeKrXA5wvnSOOVlghuekj3wsZchPX08PYP3qIwomDA5yrwvinCSrTr4bgj4qA3bQmUFKI8OkgW9g22xo3cKiwKH0hkPYit26CNr_KZ1DM6K_Jre0upZmRU4a9ck1cKGAhYyxwcegnjiDek86AIC90zu5KV7VpmEBT74_dffWscgTXC7NhRC6zYsRCjaoEVpcnz4pEJWSEMKVx69JHuSOQhtzarhumcwMRJE_qy8dTvQygQUudQSnBQ5-lUb5o-zu8nku9l4Mp0N__UwmE7uZm8HN6Pxu_m3oKV4liDSOWCrQpF8CRZlABU8SOERd6tMbrd0JBVgq7QGL3bgbRVhXpLeb-8Gb6ej8Tt4P3y4G91PRzf38HZyB4MxDO6_H95M27gFCMjFTqtVEWAthS-dXEsTzmDgsuKjMCsohG8dg7HgSwNrm0uNC0GLoEKZS5LEWMhFkBRVBy7gxc5Ho6NRRTqAtvYJgXk5H3VbiCCfpQOxsGWAwm5hXWYFsHiZXVMkO1uuClChTikWEwHacJlcncJacdzn1jr4MBrf3p_BAHW9xG_o7HqL0uHeMq_chOLDSXQi08nlUpQ6wJMyuQeKflSuFHge_giLUulcOtjaUucgslAKrXewKSkRVTlFqxwP2UxsJFqK52WpdaeQdFZ8WTqwJnCaymX2RCgbmz3JAIzC_mqXSxDQu-h2Yb2GzDqncuuuyUh0WM6X7OIGU2N8gssJdKGWVucRtHJ_fIYCKxQCPdBuDdiNNBSAgnQeCmHAPtNfEtYiK5SRnk48IP2xblkQv5VyUyVJdhbUwP1WmdXJ6Ryc5PA3pdawtA6E1tEWMb08zu4fR-N3s8mb--ndw810eDuHTBgy5majd8D6WpNSrdGcWsLWVrGFG_qUhlK-aB1DMvScJZ7DYgdbpwIe1liyPwh0Gd2GTDiHruxRcBAuO2uRwx29ieXxCH5uAZQGtbZetwCOYb5yKoeL7rzKzejpO9gIFxTWBnYu5aHX7UIoVPZU5a3kzR7rJKYDQ5Do8J21DE56qjillzkqYIFO-Ti5-zC4mzyMb0F42Eqtr0HAUr2E0hFiJnOYL3XpizmIlVDGBxCEiwLUYmmBnm8NCN6QRDPSezj5_df_XHRPIbPW5cpQAkgiO-mtRr-IQhEwqqDjjdig3wS4Hd6N_j28bawHrZ7Q1iDKUFgncwwgdhRSX6_bnYOzpcklpT8sPYQ8Gk8nXOTRZVAIJxTuPH-cvX24G4-mD3fD2ePg48fZzeTjx9H9aDKe86EwYLDuopIxQeTSqWeZE2xDMkoZgKlfOsAzbDBlRBZBwikPS3JVVGaKai_BlOuFdB7zBoGWJitEnXG8pWpIzrDYBfRHRFJaMqk4awFE32kBbMRGOhics1kysUFMnwktoXfd6-IrXPvKTQsgV2uPurTot_RiIXMqTFguW62_zHRI8E6n0wFfSK3hH7iizMiXOv_HPw6J7cxvlJFzcKXxVQ6ErcpDQbrJ1XNF32LKpNpN1IBUFmukLBQVxG8rYC71c8htXO_FWlJSaZBOBDuDN8ghMKsjZcur-Ey1w8NCarslZNGIHWvmnGsWO7h7GMPt6H46GN8MK-JCzvgV2tL5ABurTGCTxx1Y1sfZ95ObD8Pp7O5hPE81mEXeCCMRIBPPKuwi8cAEzoJ6uaJa3QJ2e5W_ZuvgP_kSpFPWAdQB2-924Wc46ba7p3DS63e7zb-uLrr4If2Raesl_NLA3s4WMu8hdp0cauweY18mUPrj6yuE-gSk_wWQVwnk1edAyG_-HCQtjMf7I5RE8P4E5bxey3-zdg6kibzySziX5w2B-MOBbkQovqCbi6saiP7-I4FiDf8znKuGQFfNg9Whzpy68zf_Ed67RvCeUII6ZT7Pe2ykxV7Rq8ApUUu5AWXaMS2iyzOxW8dekEAj0ewsRYZJgNn-GdzXsQ0nlMD29qLSk1sigEZSHcEIInKg8tduFlsMrPYcKvzPq58koFe_oDuAFgup4egjv_xPuFXIi46w3vnUpeT0bA88hRCCp1hJ4OeH4G8iZ-kdRRkIPDKZQ9h-gn31V2H7X4RNAcKq4DDYgz3_pob9wC8n0AgbIfZgkYomaRsBRrAo_QuR2Qj7XmhdYyZYgsiUy0psROw-fgqjCp_9nPD7V93uS7_f0IYIxaf4xI33vCKGFGI2YpAx-weYH_nlA1WUQWkVdnuw1H9GUa8ORP26ewA7xJePDkUliEbYUs26pqAh1oqEwatQkp7gfwpbbK5oVMOdivJpFBPrZ7PBViE1XMS7q_rT6AAwzhgof53PGBgP3uvWCYiLPz7hfMYVjUBAy2WIpFuZViVho5lCAhd7J-Wpn8QGV2ZPVeNStWfKN-WOUwjCbM4YMsE9T2RlwsUOI7Is7NSRkQvucKSgfoGYjEZxuMSTRCR9g-pQcScGC8Hi6KVJGXwQLsQmJm7orVY5bJR0BLqQYSuTXNXhIvvmHjs2-JmzPlIoLbzfN0LUXWpO0RoYjO3KEv0DS9RnYQO8SbOXJ8zZ3KtSJ3Vdt1LJFDtbwgpT8-dbK-zzEJapMzZuaYZEXsV8LPav1BbRrKTRiqF97ILZ6f5RKfVaA4k9iADfYJ6JB8UE2XCz2s8OMPoHGL0ughxiOG7jP_FVzCvopM2-mJh2IbDB4JHCylpq5Fb2Gvs9cg7sdrTNnnzd68cWhft9nIumF5e21D62-F5RVxPnBnQSYfwWGxKcnbXjbE_TsIbnIhHXr2VQGUuHnthk1WhRoXEatpU-oKw4nuJOjT2EFIBzUfXcZLOErZJPU3Jbr7G4s3uTo-259g9ivaj8OiVhDvVmXBFuHMCoNSpBBFqSWWcwGxgfpMjbcWhDdKCkpjrOTVILjN9cXfAjbrOv-AWOV2QMMXEcMHfe3MmNdTiwg3MG8YV1h46I5SkahH0p8kcRsPw1fKmhytqFqgENZnhKUsvS0TSmMZnEZgeVibaP4x38z-9Ncwgy5g6ynYou68FIRZCVqZKfYeL7dOKzf8Bkprjx4RnP9w7JB7sR2K1HWfx1s7SzztM4C3dK6U7lr-0eR8HASDQlpq-vU_qKIXu4vMn2vv5kee9LyzeCC3hFNS4uLurlryi98PKaCO0BNAkA10FmAHH_fmN_1mCj0nOa_7sUnfDGPDDHTvU6su5CLFQQizgtwMTtmxcHiXYLv5FZaAz2KdVjNfCpwf3c5Bt-LBXOz6eF5IwuDQZXSB_TVELlkppcnhyr_LVJZot8t2Lph1ajmnWwNFJwXIr5P62NSy-_sLRf2ape--Wlcm8p9X_omZ-aOTXwxxBvYej0aYQHIl7VHIBHQl2DsxceOmENzhP1g9D-Crlkvge9nXllniA1Q5eX3X1t_bHcPhqtXScKhNlD9omlU-RcVvwvIl_uC91w-jjC_JteH52-GohSVeArOxw_LrzVZZDNAWA1IyWx2vHiwkiiMriMvd1ZvEyck1NXN0hYalw1yaITfeW5dMYhDpdOu1x6vPFTWOVz5YMwGXPSwcfJ-B33rnEFnMRZURyHYU7fmzSlUc5pfVFGZdh6FTum46qw_lgKF6Tr4PydGFecgu7Psr6NpvxJxsuY6ttMBKHtqpRnVZnywqgg3K42GOIKk_Fgl31PudgL7ZfnNJdO0zACrTZDzkzXRcyVlcEC_3ZwMyQlGns4p8ac5FQI1CNsDdLPAgd_LcDKaRQ5QDQV-3uydZP3Rq2fAxsJehhXykDdJdNsN48Oz56-t4UP9lmm1u0vbdE72GIPbulUvpL_AxyR3T24PTziivEFik22VaTDQCaJjelF9-WSZs316m1GcnyyemFDQIrSWN3tvnxzsNoXdkts42A10-jm6lfd7ssrZg318syWJqT1Vaf-OQGwPJD8-yLYpajmMu0-Z7q6vacsGvvwe7sUR3uLuU5WqaxXzzNos-biKb66v3oh8zQS6uPe9dZIaF6oBatnN59b--ovra0TKRVc8fw3Mylnp_qHIcrD2nq82HfWLjlN8uWRDfzbj3pQQNfenNMKkbJjqm_H2K7-dHjXKMwutrF0666xCePfXqjAUz5bBnqqfHXBtMDLWF_wLA77cYyP-VceHMJj_04pQS8pidaJY6NLj5WoDWsVMGmJwDe_3FQkyry2zzFFqWWVKz3OGGN6den6yMvM4nwTif-yUVw8psMnHnqCD3JzloQE5VM_zB0wzeVzmKf5ypxDHjdJ8lR82Yg1HhCbNypSqULZJRVmvIWCfdIyxyOIJKdlNfKVfJ7jjVW8P6HWGxkhQw6R4r2dDb57M3r3MHm4n-_bDFal5MHDMd_WhWiz5uX_2jpJl9bz9NMYvBJ-kjv-uYEygX5TQZ8a91jbM3gsBPesKvB1D9-vJS_7fvBuWF2y4764G6rPBOy4QZlMl8n7KCCqez1fSBni1SUS7WChwI4GJ9FxaLyvSgyvoIKWdAEMsHH2B7xcPLpPv6CqrojpexTHzBY7OMLfW9wI8yx8_AY5x1G_27_sdK86vXN8-kvrl9Z_AQ"><img src="./examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=rVrrbhs5sv7vpyg4WIy9I2lbkuVLZjaAxxYmxskNtjM5i4MDi-quVnNNNTUkO5IyO4vzEPuE-yQHVWTfJFt2JpsfsWSTXxXrXkW-gHP45yiCFQwHMIdFMVUyBiWnRpg1CKOLPAEBsTRxoYQBgyKR-QyM1nP49__9C1yGcPN6PL7tnr-77N6e__RmfAO4EvOFwt7ei70X0O_BxcfrX8aX8PP4_dvx7fXfenCbYRtKWhCQmGL-EgRM-FdEU-EEUm2YSqq0NiCIn70XAACTpVBqAjqFiTDxBDCZoa2WYx4rbQuDHf66ENLAJDBm_yJ-LYSRxbwnTJxNQObO6KSI0fY8NjFI7BBjV-9uLq6vfhpfgswZq38MK_pvDjHmzggFU7HugNUgHW1wIp9h7sBpEEpBqgtDKzwyMW35GPgZzbpavNAyd14OLjNoM62SH_zBaX-sTY4G7ELkiUFliZRC8Rmthz34Z_8I5gNAEWeHMEWl8xkxkGsvYCIYC2PW9BsbZ5gUCsHopVeGFzaRXxrpHOYgAvD46ufXtyBMbMEIlyFJV3g5uKUGi3PpN1v-nc3EAiFHTGwHElRyikY4VOuX_GeRC7W2MmDPjExgipnME5gkaGMjpwjd7t-tziffWZgEu3NS5xMwwjo00iLJiMQIU3RLxByks_DL-Pr26mJ80_HQVm-xp8QaBCwykTsyr0ybBKwzQs4yByI22vojVPIyuNDG8e-WQt2D0x5bOhAORium60yBoDCfuawHY8a6R1zYoF5PRuZWJui1KWIkBOtEnrC5doiYR6YFl9fnn67e_Uy6kAnmTsZCAUoW_VKs2es8todiiyEmhIk7xJjI1_BF67l3v0EPbl-PvY_2YLIQCzRwPgBF5GOxwAl8DxMbC4XQfzmIogmkcoUl_yLPtWMFMDRY-QXh_bvgJSUwHdChSMgZBaRGxLyDv40imMO0kIq8nc9K5CoD1HPLHCicYZ5MPHAqlWJhzIWZybwHP2mXgRNT0qMwCGmh1BoSNPIzJh3ItcukN_hY56mcFQa9wXlYUNK6YHQ6Z7uHBctTKciEizN4e347vr46fwOFxQQOJrHOY4OuEYBshkr5aJJgKgpFThuzg5pafQthnKTT20M-K5EjUgslYkxItq4wCBfnt-Of31__jbzJQSZIiwslcrDr-VQr1vIy7sBUWJkHm76XLs4wv7Myv-9ArIvcoelAamQyww5Ypz9jDz5a8j9vL8QAeypJDmI9Rwu6cIDzhVt7-xh6-xj_94c3VxdXtz5Ww8X5mzfd9x9vb0jrPghpR_rkz1JhDyaJnIMRiSws_EiCvEpegcXZnKLZj_mroErWNy1NpJijQwM_ktKvklcTcOIe4af3t69hhnqOju0tAYcrB6nRcx_IFTKky3ANuZjTSYMjXp9GUVQdkoMxsnnkZLxg0K0XmHhWLYjC6QkIRYlnDXaduwzJnC3r6Jq05GEvr25ur95dcNSDgwSTYqFkLBwmMF0HMt_7k3PUd5m0gOT6XdoRYql1ZMQzdIx_WEuDLSKTbBV1YtV63qEE491urhOEaeF8krMTtgcmhTYEXiccC4YdIuSWLGjLZogOlrpQSeDDx_6ldFlLGnbJNkWOm3ZKSa4h1taVTlVCS4Uhv-nSIUnUX9Dork5Ti46loykjxq5DO-KMluNKxE6tYZmtK8OMKYUYuQiZ_NPd5dXbu6t3N1eX4wloU_7m_S_j6zfnHyZUFTQJkT1Zir7v3_lDSwdzFJTurTfrSyRHrOQDky86x4llOSYYK2E4brCdyDxFY8g5yeYW2rL_duqcSaGFyO-9KA1VxpRaBEVn6wPNzS8csqdrh906bpPAyeFchvMenPuotgaRJLSYmbL_878T0Pnei-0UWJm2LaZOO6FgZnSxIHZCKcK5qoymvT2OIPvXobK6pj--8bXcPvy2B1DkJLT5fA_gBUw4_Y6iCcdP6EfRy40IxpIbRBFZeHxfc0OBEIZRxNYvypjGoCHMTVJV2GwCYiYoNTS2cd4BSifQ6_VGEcRam0TmwiEcDAfk0F3oj6LDHpz7AkGnjNyPaC1ZNHGLq4VBTtjC-URI3AWLz8UiBCofbKcivqcaT5e5XPX2QvUxivYAtpPiHkAjJe4B5Nq4DIrFHkDlPlTd8cJmMtuDkHP2mOtut9ulKqOIHeckLwSZw2QuqJoRCqpM02mKPii4nWm6_G_PV5Egk796OFwRFKcpGd_nJJdhFMEWBfgNDqJOdAgHoyiKmp9Y8If01_CJimeE3_0hbstibyFzLz_7EpZoHSzJzv7RrIPhH4Ai_KXX4HR5xxuqEzZ4JQv7DQ76JyVP_lPg5PcWCGPvABkOSxD_qQKpDjIV6-8s-HKPj1LFvVDx594Jk6q8LIv49nEMpncWnj7QqZesZ-f0gSNlQqm7_GmgwVETKXwLBxtz1viMxuGKq_8lF4a5D75s6t1RFJoM4ULm5Hh3MCAT6PSPGY_i49FpFP3l-CiKQFpGFzDsHnVHHLEps5FnJI2U5JOfbxK84YSS1KfCHnwS6r6Mr7R-fH5z68MFM9Q09EkcLydgitx6O-q-Cr7XfeVNrvsKrC5cVmaYReF83V61TYFpB4PRn-CAdx92YBT9CQ4IwddlJ_Q3Bjos6xpSyXcWrj---4FEx7mc0pmcFg6p4wrAJg4FP1z_2WXoBHBkEY7YrpKKs774b1sNm9ijqt7jVs4r2CuEf8N1yODsNIo6Z8ekpbLuIi02VoxqE3tkRTR4AsObWjCGHRgDsr_DXXwEA314BZ9lF0ZTBhsrgslzBUJRxobiRsAQ5iCkVQg6rxyanN1XhkrmXDxykwxzpNLM93KibMM3IhaD7fbNqNM_GkV11Arffn8IyD4BdNICOhlVDl4jxSLFO4SdcefoqIyB_tODLOEzzhaUEM7nM8UuMPsMsJMW2MkDYNaJ9KnQ2oqBAayKiE0wpafT9fPATlpgJw-ALeMly34n2FkTzH97MJMt4_mTYEejJpj_1s5oXF-IFZZV6O31OQ9sypKDa0YqonK1_oEmeYX5jN_Z0qUkhzUqaTC3xEKoLwgxhKMVOUjUAW-V4IUF3rKAhcXL1uUy4pJW84-BXzYIewctD2beuWjq-MLWN1hJVbqHeucZ__YAvnBf5QeY-x_45344gh8xJn81nGuBg4zbSKs82OB4s-LcCEpMUcH-mCqbPEZ4LZTa5700IrBAMWUNma8BmzTKwWbZCBKpVo5thLOSSrNk32_uOBnQDib4AKk4kyoxyLOZOoDw_IuPQwdcsUZKQhdhx3e27gwYXcnP1Oy18X3cCuKqfH8Df9gU1ydK0ee0K8iqFFdjlLd5CJFipZOqfquJ9LcPIdIGfINIIvPtQ2DzEK2Q9tghxuKrD8Fxpn2IlmE9IKkLeEOb9jcP8TiRZXy33JBUiA1MhI13xDQaRD7pOeZbRJbxNva8xj57HvbbNnITm32cfdI6Ed9b2L_hn9s-Gf7uTewJ832_wBxKINpxSmGm7wsJJm6dNmKGWz6Ztr1-h8dfY4oGyeVLQhvAraOlKZ8sTR88WJq27e5k0-6ORw3KjAOftLk3HAeYrk5TGW-eJ4wCGbpK95Xgjmu5NV0G_svv2i8VFVA2sGmI4ALbrQTE2KNtQ_jAG3zoqoygcFJJt96I9nWN_vzY_mC0f9G6omncuHBtR30oZ1rh_LiN2owwrahYoIRpkGevTsMUIS4cI7vM6GKW-ckkzRZsddVFtWk1BinvDnxOJ-pFnIXFYWbs23bfXzC2xViHGaAfzIV7gLLd19osxboHYzoGX1pV3ZyfG64tD5b0AvPQYYePpDzN_QWVOzqH0GywIqnbAVjKxGU0Gog2t4Ue1G8LX-iOI9q9janlW9QGT1ALrbPfFr48l9pyi1pzGwWCzW3U8931j_02biF5G3t-c1tlVYbWhJ4wFBRGFw5J2KQggk3u5kLmjUwdyrIaz5uFH9DYpZ_ZOQ2-BnlQ_lU2rzklYZ7WfD6quir98FZunFkPo51bWfQ--pZbS6pH7OGPC9Vvuwup1W8tO4qgk8fplge9q5q1Rov09G5qgcqcXh64QXr3mX13UW5v7mbSp6MHjMLHZfJ7i-azjL2f2nB1SpG1jMf-6k-Q39_TnJqsRafelDxNy3eyCoWfalrfwbJp-AY21sbIJFwLcnWul3mLMOhylMmKXgs_ZKhNs-QmcLElov5RbVJUXYFVdD1pKJq1gFjUJRrDhP6zpSQP0TTxOrHUWOUJyGVC9zdsuEx_8JDL6KLNkNeet3bmp2wW2do3DtXkiLe0oHwxxSBlk0iiGdV2v41CezZB5tsgJ0-BzFsgPuFucTKslXRGeC0Q3tNIrDMlvtCfu9_0jxpUmSd6yVo6btQVgRFvOJWW2utJhdWGZ6wf9LfWD3euP_u69UMuDp_PT9Tx_dlz8auGrl4_2L0-tATP5Cd4STRqeMnxk-sHzfU7-T9u5K3n67eV6HbrN9pav1tfX7v-eGv9RhRprz8aPLm-diiapXOl1WjHOsDPOKZr_zPUbDxT2FWpnoOV-Uxhl1oIXId7fq7-EiOWFqY0yvQX__YHuvu8uT2_ur77-O7t-e3F6_HlxL_ymBfKyQDCwL8WaP3TjDwJY-dUGhoVoOFqxTqqIOmeyDXqFXaLwXGjFTmKohW3C4k0_pILFX4WzkcoJdPG9mHE20_rlmAwiKIV_dcQXypdly4-vzkevYByNhKef5jyJU053OUXNjTbtR1-EsVr6_cAU77GVShM9ZJjkUlGjoVSzGVZ0nP1UzUIJMG0MLnkS0T_hsLHLZIAjbAPQ8MVGtXteQ5v2n8MJ_LN66CS5Nm34JwefSsOn2sQnVY4T52LgMhGyBWiXm8UWuAanLwqrYJBx6fX70HCn6FxbE51q-OaTGi8uXlskzjaQaJ_WqOTl3fYvesBhm9bN7v8h6gMt6g0pFQTCaPOs9qT6JSrQYPMbSnwZ4INhl8L1hZxG-y0BhuGvr1q2mXs78a1fljS28pM0N77EHDUELTXa4MS5SiaqJSULtHe7z8fajCInoT6Gn09QGGD1_7xs_W1DXb8HDAegTRUplNRjqMGfsAyqoMJFQmrs6YzaLOGKeZxtv8oTP-Uc1vUiMqbMCiczGePQ_hy7Kshwju06qkHZ9NqiBAe7HCdwJj0aXVSY47zXwtpJNp90mXVHdf4zXFU36eus6gZoRjt4b2P8BaamMDb8FHebtDQvXrgjHb5DHchnFB6VtTv-Sw_eaXObkJIk5fVo7mF4dGTv-JeuKxqB5mX6uVKOR-id8kOTdcVxj88oEd79cW5H2qVD95KNh5LVGF61wgCx22FfjC42N-5-ej4KzY3Hyi2ZR56uvA6sF-KniMWC7fuGLe158fSz4AjDh-H8-8k4flwo8EuOH5uCV8Bd3y6CdfCW8ZPAA1KoD5nUUYKDekfQhlG_wmUo8d54berm77HI4tS_afRN2w-a1P-gwcYNVHmfxDkJPoPgJw-zsmDwvC30aUeom_YPGhTbo7rkV7aKRlL56-Oq5rZwoFFX4hn4eV3-Tb4ELaq-MZb4TC6LY8fhb9Wz4OrC1Tiw0mnMCT3hdF_x9g98r6Rl1A7ld9N17B_buLsjfC5CiCh14X7g2hw3I1Ou_1jn5N_3_t_"><img src="./examples/library.svg" width="270" alt="Public library on an A2 sheet at 1:200" /></a><br/>
<b><a href="examples/library.arch">library</a></b><br/>
<sub>A public building on a real sheet:<br/>A2 at 1:200, axes, schedule and legend.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVprchu5Ef7PU3RRP1ZKSO7wTSlrV8mysquK1nHZclypVIoEZ0ANVhhgFsCI5CauyiFyhhwsJ0m6geEMH6KsTfSHGhL9daMb_cScwCWcR7CCQQQZZNwZDbFWsS6M5WBzKRzM1yCchXvmOEihOPz7H_8El3J4c_N9-_2nN7c3V-03n25u3968-x74imW55J3GSeME_qg4LFjsQJt7poTlluiWqZYccsnUBTBwhikrHKRMShAW3FLDvBAyEeoe1zMHNmWGAwOj9aIDdylvnMCnd-8vb96CFQlHKusM564FTCXA1ForDhlbg3X4hVDw332g2DbVuW3B5yvbAifiB-4gY3EqFLcEDAjaONnA5pK5hTaZB0bhtZJrWLI1sNhoa0nilFfa6cBHTd8khi2FuscFDKxQ9xLF7kcRZBnkzDjhhFYtmC2nSDxrgSmUQgqkXhRSomUyWIrEpS1YCpeCQvXPdM5x3cxCXqg45bjBxgl4UzGYLbSZgdQ6vwAu7lMHE88U2VjaCKqn2_PfLnGrTFjJO_BOuxQl4NJy-EkLRZtrnJBRUiYfud1Y33DHhETFi3yjHcvNo4g50M7n2qVgnc4h4SwB5rw1l0xKfz7uUsM5EEtkJGx5fEqt2lQvY2Y5LLS5IBKA2S9a8RnQH67JmUjgWyhU-KcUwR9eYeHt9dXt5Yfrty1Q_JEbEGrBjeEJLIzOCLL-l2tLhunAjSMbWlBBK6fI7uOfvkfQ-drxtki4ciJmkqyjCwfCnbVgXrigtu0_o3UGFg1WSA73Rhe59d7lrcvAFnOnHZOQcwO4T3_uZgm3sRFzDu32T1ar2T40z7Vx1ivH_uWvM3_aNTRTvYSsiNNSQQuptQn6Nbzpj6fhLGnhPkmGrOMVTaadbRS90IUprV4oDAnolXiU5lLHD56eFqVMJe1cspgntGnbgWtGIgj3jd0TXi8WlrvS5qUX2CIDvQg-999zN-cLbTgI18J9xSlT97iMkU9_YyHhuUv3sDONZxbtvib2MOdSL1HlqFhVO-9-09zGTDKnjQWYbR7g3__4FyTCQJH_PdFLNfNm4ZI_4s-zjSZsyhYOOIvTFh0e5S176DTEKX80WtmN73x6_-3bd8CM0csO_FFtokbbOm34mgImLsSoJqQkfCTeQ_Y_67l1pogdxMLEhWR4qH8Hs8_Tj3eXNx-mn979eHl39cP125k_AlkhnShZ_Vxwi-v3oElp5EULYbgFPEMdeIOOrkhy4CqxaDemKl2SerhyRnBbej6HWMsiU-UpIhV0e5CBF7swTMK9EV43M7bidgbzYj6X3IJiGW-BxPM8X4eAhwdeK9SzdczxjCtHbmT00h9NioWcK4i1NolQGA07DdJq8y4koR-YlE34WwPCCc-yBsAJzEiQYTS7qCK3FxyDqEtF_FCFwJRLCYMoonPKYCFWrjCU79Af2D0TyjpgBLxgMQfJSGdo8U6nM4xqAgKDbhR5PcS6kInfySo33NpOAyAI1gDIGe72sufhYpbzBgBagEP3ohfhEqWNS6HIGwCJyCywwmlgUtLCEJbIXxsNAMkdvLn8M7yiTBGR-U_qxpmzdZUW2UpYEiZQfn95d42kg0B6AuvSmzepskEqaLfb7aC0EqwqNdov-msAJRcQySsPyFeOG6GNN5Hi1qJhIGP4NZNU6hjuOPwNTqNWdAan51EU1f9D-fFp818steXwpcbK5-_qYNSYYbYnaFTHBtM_fKltP8RmrDouthPr6ZJbd3Y4v55yhr8d2v5y6lGmh-XqebnIsKVs_iHscnt_pnsMJWr1oiEpyUOEpx2I3jMQ46gOMT4kRf84RL9flyI8kZYrDNTbdHkMZzyq6cQ_HNQJIR3V7qRm7PBwGCleTi08j9TrehWd1592obKvg5psQU0OQrGvgur36lDhaRvKOrZYTO1XYI22sEbRxoIY_iksA6ywkIxaPiq1oDegD1rcgsGEPkYEAGO_hOCIdl3SeiI6Zi0YhN_rHklh8IXh52BAOoHf79VNlLg4urSmDywpfGfErQOe3PML32fwqmqCt9fv734AYQlzaYRzXG2XQr4A0flLip5NlYdFAEG_v7181769_tP1ra_rKLEKBzFTmHsUiigUNUisLMZPr6cf7z7cvJ--u_54d1bWnrijB6Htg0-VWAQhAxSTil8f0crEI4V1lAVRQ3qpWsAWjhta5KhRQF4J1nnMOEzvlAB9mCQNMleF2nuWQ-R7p5C__OmhGlwkr8wUNdUFK37hMBpGEUg25xKaf0CBoduEAttVvViImB-g7D1F2XuOsv8UZf85ysFTlINdSjrJqC7fHTXfM5E09zRAv3mlRWcem1xl5bN2YIG0cFXOBAInatZrheUWz5DNmp_oc59v-B051zOQ3xyyXvVGNQE8zPMi7HCRej4nf98K6cRkn8ctLm5uylxisL29OvQyni6BoOsxnqC7pMBxDfrzFXzWGVfNGvQy3kfM6oghuj8N-eMG8GlEtoU42UWsG_kyjrm1Yi45fL5q1iArq5alR_MNix-wlkt1gcbY8yuM9lBnHZLCE6w_0voPWmfNcjMHPSDWyhkt67ijY7hXYb1HPuAfIdL_LwXnTqSfaQXfYd57jVJ-l2v7egaOPeDUBW5v7q4_XN5uBgyhPbjnihvmsFMuFKrVT2mKMCwjXDa3WhaOxiAZBl_HWXLhpx9aKGqdQwdFO0ERvrEQY8vFaVvzNda6vnj35_kETtfwiur0szBloIwdplHUYvmGPNXWdeCaJkk0T2Mm8VK28PeQuaopUgNQThA4dos6nUk4IWFqRfbro7XgtyDgN5TAW16OEK9xXFWThexV0Yvklabvp8RTq7AMgQfnWE9UUX_HzAZzV-hCjEaF_gozJzQ_SV4l04wJn3QGw1px57nTSaRN-E7E-lmgchrKANjY3ZTPSLShTfXOHPR7wwgCLCrrEFlvn-x8_DxZf5-sO0J2x8kG-2S93nibbJeOwvFUecpQhqPFqD_0dP1on50ns7tkPUrp2-wqw1B8rii8FocVIwwW2xZBil2IbBeii43NMYhsF4LtQYwqubvdAxDMH9mtGBtCSK5pXo0MLA7OB5CBT3I0wPm54EWYFyoucLoHkrOFH4MvOc8JmDgJh3WfFAmfYdSxwKQOc-cQOpxhj9xYJuHUDw2cBqsLl9LE54xiFxWnOVNcEnJiBFadxIAKOy2FD2pz7pY8xAkcJNMOwDCS0aWMnIhBrI3iprOlwzKZhL3vaLMXVdo8R2XilsBgpNpCKVPHEyiDQyiSL9y-KFMMqb6qCE3KZFg5PY3U95xeF64Wh-4l-wW__T80FleFcUyoNnGcs_UmCfhy2V-J4IiJJRirQ88AzIYFZPqaGQjU8keuaEy2GaPh-JZ6CZ9QatmGtnk00-xmg0HIBkuhEr30NeCwlgx847bR6GgnjIYpFIbPNrUg_nT6Pe4CY6M3rrBHNUv1D-GG3gTHaNS2tHw_tgH_srOX_oG9TCp-51Vz-fR2ToJbeSaBY0hRqFSm4r19DQf_IxOcGx1gQl17XX3j6EmNbS_1vvDC5d3x065zaH1v8LL1_UFNnu5we33lkI_c-DucWr0fOnIfyMo7wKPjgEbt6gDjBbfxdNOUDrokT61aHUTRCqWkSwVcd4i-yEMZPRgcpaeBbnkXAUgtxcJNUW5_XjBv1ckx4q3KtFlOYMNgl0YPfGeG7kf1OEqHZ-NS3UNGwUMCPQqDI2V_dN9c_rkF40qqSRStJmEQsw0z3IfpeYA6VO8JrNoemRKOmXU5k_91Ax5f6pdzfDpT34nkdXmN9V2WvZ5BXjhfPeeCx_wbC1fX7-4-XG8uQROBpXTMq9Tr5zpMyt_562O8zkJMf_fGYk7VNvxcMOO4abvCKEr2p6gpBjFzTOr7Au81_e7ONqgLrV1usFGge3S8O-KYrRPK40pvXTjQhAi760W7GtMJu0kfdOXzRFRfFEYJuu1YxrCloXLMGZRE7uhtR_8KVRVhz8Fkz8Nk5SHaAM2ZxWJ9G4vahhJrQqmiLsiLqCfDl1FvqWOLdfZC4snwSeJlTJd2u8RsR4MlMfsazjXi_jZx5WjVKyQL4dp4Mf6rHe1u-y0NmFNlXBaZm3a3rEhqNyk0hpx5UWfl7XLpd76v3ip7N_F-y2NDb4xRZUZ3dGrj-zO_lG7PbQ1w5Z23Vc5AR5DBnKkHsDlTFrrjdq8PGeFSP22p7Ky7emfLELEuFE5CD52_YAlfCfsJWuRzQzkH2VFg0xsstKAvZDP61Wz8lS-ztox7CbcPYHHW-1OBQ-9aSUJ9PbJtQSw5M_i9H2b7Pj_PjWZxuq0kwgv5ckhTxa4v-KqJH9UM5cBrI0nTN1wc36Sx_nUVm2pTFUhlWv4Ws2qYiZ-u4PUroLxenrzNuTt7PjrOkdveJMRfYYSypUrU40pqkrL5JFi9-vRgQ8J6BuzLviJpyNarVVGE0N-x-VtuH4KhqTs6ijP5KpzQqtViiaTBk9NFnF5U76GU9wrhXvTzVWiFlxzfJsCWZiksxjAThjxbsmENuPAq8ydlENUm4Kt-bTqZcvko1H25TRzRbEHh-wMuQPUIa7zBGkXRalSGyH3SHSl6vfMXSNE7KkUPZ65PSdE7KsX5S3TRPy7F-RFd9I9J0R--RBeDo1L0R0d0MWg0DvvSeDypeg4fQ4YhhBAxHbcn-I4nk-oenGiHUbSiAVSNtgHghJM8RIfc6J947KD5I72FeYOxmK72fCKrUqrkj1z6IECvGE3na2hemji9Zeo-fI9xstmLeqN2NGl3R97LvzT-Aw"><img src="./examples/transit-hall.svg" width="270" alt="Station concourse on an A2 sheet at 1:200" /></a><br/>
<b><a href="examples/transit-hall.arch">transit-hall</a></b><br/>
<sub>A concourse: paid and unpaid sides,<br/>a generated run of gates and kiosks.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVn_bhs3Ev5fTzGwEUQ-SMpKluzUvQZQEycNmsaAorR3KHoWtTvSMqbILcn1Sr3roQ_RZ7gH65McZri_5F9N2uqPRJLJb4fDmW--GR3CFP57EsEWxiewgSxfKhmD-DEXVuYb-O2XX8GnCM_fz749f9F_dX7xzfl89k9YKbF2qcygez0cjMZHg85h5xDOr9HufCr1GlA5BKkBt2KTKXRPQDqwGHuppEZhe7DEWOQOIddeKmAYfpQSep2LNUIh3ACmunPYmCMdL1nmUiX0FL_LEHwqPP3l7cX8DKR3EKP2FjOJMdL3AuKdkjqxMhYKvNBXsDN55xAKoa5AWJPrpAdCJ7y59MDKGu3JiqUp3ADmqXSQKUEHQhtLhw6WxqcQ5_YaYWXsxhFE5xC0aXmgsk1jccYuAhA2hu62tzsCKxKZO5jB93HxnzgufoDvN-KDsT_QqtLl8N30zRs4f_HqvEc2bfj8mcVraXIH12g9bsEbRv64l6ejGI0glNFr8o60sUIwq9qgAbzAlcgVmf5JyAgbqY3lM_rcavLDIo6LBQgHiRWFHjCeNWZTPVd46MbbXtx2SHgJeP569vz9m-kMXr65uJgN4LV3ICwKcukGhcstJhRisVe7TzC0m8nZv0ZHPdB4jbbxq0fnUCnhpdH8xdrK5BNwKYZE8kHEqOMdKLFD6yB3GLJjXhjg0HDgDVgUCZjVip9DrpF6PYDu8AjmKYawSmAlYuQTw3z2_pzc6jgl3337ChbTRecQYrPZCJ24Hrz4x0tYTGfPF4DaSy8xLHWGn2CNz3UiyhMrY64co3tM6AaE3sFPxmzoerqjI1gkkgI692YBsdDaeIhTITWFC5nWI1zpIZEb1E4a7cqn5DqpD5lSDu_g1ZdP5p1DmETDaAyJQXcGQsNitgCFIkELGVpIpPNSx55Dh_0IiyyV9HSl-ib3IGJrXEClyMmVsJ1DjqQeFKlUGNiD2SUY68B5sYPyLp23Qq5TT8cWCTooUrS8aQdLpFwI1_TauRwT2jUdkWuGZ6Mo6oXnGn1NzjVaKD4WZaJD7UPErCjyKwJpOCrlJHLyJ-xBIX0aUtg4SZtohdiiu2Wl8zaPfW6F4igEo9Vu0GEKOvhK2KXJLUxLXjyAf3cAck38tdl0IOwYRlEHIBPk3umIeDVxsciwA-BioTCcrAOgjfUp5FkHoL52EErxwhSTXCH72XU6AIfQ7_f74FJU6gx8avEO19IFEsWUYUxv-3e9CI8xKeadyX3aR-E8xMZqtEz3udUUokTjdFqPtkVYs-EoiiKwwqdoiWw1bKQnUvjtl18Z2DfJdJPZVyIO94OQBocOYEFcleW-jDMuJNXVzF6_-moOZhVwrbhGBd0Q5EqRrVRPMIHuSRRFUW_0NIqiI-g_g-6Y3vbG9PVRD1IUHBjhvAU6f8QRHKeMXNY4qZ1M-JDtiter8jl4mqsTXLyffzedvRjAu0JklJXeVKzL2YiM68QGwRcGUCeZkdo7WMtrrAI7FtdY-107jyIZdKA8W_IF3zfg1qOVhlwt4yuNzsFxFHH0AXSjXnQU3gUP7H8K_uBvuAS2nVIxf7jOuKjwwl_5U6yMo4P83ApCNv1GbT_jaFvlSlVxEui9MOBwIyvqCFx6KwgtKwZN_qPnLfpC98laKvAUB1luM-PwjHiQFiSlAKDbt9J71BSqXEsKw6CpUNfo6FakK68ZrhAzB8TEO8BkjY9d5YBr6eRSsXLyISVsjAP4kqSGCGzFqElZn_ma66C4EYicSv1nIdDoDcUa_R8Svv-MV_T2omRB3I2LJwtHBWlB8ScgMcbS6aXnsuVArIlePcy_ms4hkazrjOZgbeWFF3qN2jOu8KHQGWMLsTvqVVWb3CU9FCZXzLmiIROb68EeQZT3SQkSkCnQq_A1uXUsJogEw4k5yqF7HMJvxIHGZzX1cYlPfZAj5dbgm72tJyFvnalcITygZMphUg12WxSKMRltSZVQ2B0_MDZaY0ykQlGYUVFv51ZVmzNhvSy1R5Veoya9jjlhhuP9NOJzld9WUUQLmxXtfTdWtJPpVuW5h7MffrWOVd_Kpb7_aJTl5dV0R8PWRf18N9LoIajjz1oAFe08BOceNuw4aiOVn2qkB7aGk9x_pt89A23dO83HP_Uk2Bx2n9w6_Mrs0F4WD-K0j1t-Gkf3IOFDSOM9pPE-UhN6LC7-SLTdEhN7wrWu41kqGx158TYwkRQb9GhJ2VmTr9N2xSfhHKhaljqRwVnyFYJKp_Sc2bWGDFmvqcaWXEb8UEiHsMQBfGOuK63xdvrNeVnkAzPmPjX2sYMPZhl4MzabTCq0pVi3qEwsPMmqRm8TiW3EVfncoDyVWKJioiqlT9noUesqNcuopakqfjgoyeUgShe8G3775X8g_ILoiZEberq07Y4tMONtUglGwMFFjELDLGw9aG-JJrQlpw46DSKzfhDiqmykPKVfCF5-kXoGju_t8KT1mBlteSWUQrs7oIWMqyR5u4V8hSprkNupcS_y17TlpbHoPAPfgxwKSIVc531t85CcsmXgCvmlVN5yxxCAA3JOkxG_a0HvVbWGJmtoZqXt0zb082pLiRygS81DT2zBc_o2lrczNfiE4elAtU_OtbdCxwgvae9BCU-R1LbbpSZrX2MJ2lzjbeB3qckO2p00A5vVSsbY9ohYYYM8_hiTn4sV3kZOJDVeLQYyGWpuWv80AzEm67WqrJNkcOBkTT0sGQewMLpeIzz8PYv9swVrN9eoueUOZu_fMqhCvfYpc5PQXNpjo72Vy9yzwHT8Xblq9jefohc9GkeFoVhqbFJNBEaTRzwZY9yqrSpbDWrZQx9fz0XIksfcTVtfKbnz6bt5kEkDFmd7ijTooFy7WoPWkrPSoCzRei1jCHRPfIV2WKxWQXRJ7QOvNfkT5Nzp5FElln3KhMdby3YvaNdyzlLnxxERXIBNvkgurfGXGvbvg8wqZOJT7kpuLXc3lp82y59GUacWrRuammCVOLJu9MvxXujjejxomDyq7oC7LeoKct3Mueg6Qofoq7to6lQtRPeHCOwSur7PQyEUku-57Hf73GIWUiemcAxNg5CCY7WEopCS3qFa8QhEWsiEplLEw8OWyq-6CGnhg9gsQ0cj1L6f2RlNLSilQHDbaBxFIeZDr8kNCEiirGAhQRSXwsZDMi4sEh7Gp5XjR0HU3lg92ls9ie5eTUYNy661XEA2tgzaXzv5hLV1nfyItSftunr3-g5UdEVnNJfMty0On9zp1FL33dzMlNpi04c2483NoYQ093ncvs9xbXZLb99E4JIffD9pxO7Nc7f0_00Aruxs_2cfBzBqsf5KepaEf4ny_BJ1nKIDWwm9FjnwxIYmdj_mIrEsIGNFc8oy32NhE0lDRa4VDNcdTR49IVJhTnxSkVs5Ls43RwOYgpfxFXpI0F1R0rpqbsAXs9_Y80WvkaoErLAAL5aqHBFfYeYDL1fmhIFZayBX0VStd8NIqaSpcua2EDZeVDMkGvSG4qO9zZN6ika1_HH4KUjotUIiiBX9VMAd55KcGCJqPJ5Evc8mk1qkEQ1vx5OIDllr0nt2jyaTP717-HQ8qZTFp-wOlv_-7r3tfIWlFOOO_vi40TVUUUjoVaJm3lz7AWHyde_B0fzblnDjEcONarhJFG0npBrv3FoqWj7JKVsyaiw5jaLt6d7Wvb0cVCEdj29uJU7b0j_1KWgx20-xeR_O6V-EE-yZTP4QTvAJ47DCP37a4JwEfQ9Q72wI5uaU_4xT4N18NuVZ8l0zfriHXqblpDEVPJ9MhM833L5VP8XEwlrJOafxc9YIZVsmgzisW0fKOP7JIcyVtnSuqHnLPUzzkZul5iPXJ_64a_bx29Fo7y_H-wvHUTVx-rnzfw"><img src="./examples/aquarium.svg" width="270" alt="Aquarium with a curved drum on an A2 sheet" /></a><br/>
<b><a href="examples/aquarium.arch">aquarium</a></b><br/>
<sub>True arcs, a circular room, and exact<br/>πR² areas — never faceted at any zoom.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVltbxs3Ev6uXzGwgUPcSM7qXTaaAxw3lwZIk0PjIuinmtodaXnmkguSa9ktcrgfcb_wfslhhlxp15Jlq6k-CPsy88wLh8OZ2WO4gH_3kwTuYJJAAU7qpcKewltUUFQOqwL-95__gs8RPlz8_O5t780v7z_88P7jO1gosXS5LE87x51j-JILDz6XDvBOFKVCkA4Wxp4D3qK997nUS0DlEKSuSdwrIhKQrVApqZddWOVokYUZlXWO4YiZwcnfMZAurEi9NBrMgskyK1ZSL4_AVgohF2WJ2oE3oIy5ASuXuT-FCw9kYgHSQ2bQdY5BG892WWMKUGKOykFqCgRTeSjQW3TghVKn8NkEs0olNGSYKkHvBHz-8e3bq3O2HaAUJVq46IMSOnOpKBGgqR8pL52rMAOjQYBFoWA26sMdjM9GUBTgckTPWC4VCqF_PkgSWP9WuUxzKMQNuuBQEFobL9gXAhbyDrPgpk8f4erHi6ugHwPu_L0Yno5JbsMBXUjCs5VQCpTU6LrQ5yeFsEup3Qmbe9EH4aOC0rGZqdG3qEkZoeDdm1dXUFp0qKOCC2NBQFnNlUxhXkmVkU94CaVjtc87xwzUCMWFMb60UvvgVJI55rdDWsuC2KW-gZX0ebCCpBCGzy1i5xgyWaB2JD_NhdQOhM4CgfQKYa5MenMKP1hT8tNrdvw1G74m5WUBUXnTW0jvopYL8o0nDfrn4wReQf-cFH8VnfKKHyfgaU8QG4cahXY3gIoiLvBph8Pq6FL6e_iJt9sR_NEBqDSxFUUHYGllRn7p7AqzTiteOgDaWJ9DVXaA7HesOgilOh2AY-j1ej2ySSl4Cc7bKvWVRX586K8DIU5k9joA4p1HK3kNZHqj0TleqT_gRdJNTuBFP6Ff83JC_yf0Pl6lyjiEr0HXK_JUKTWeg9EIEyggNdbKLC7zolIKVjLzeZ0M6sjqhqDYJB7GMyXqEHYLkP4U3nsHfmVgIVLa0HXe0eqeDQuBvRRKoZXoQCNmp02jSbXfNJTCeslRvrF7UNs9mAQLo8Hx9usWjNsPMxy0YOJt9NNHXnFrVpDJW5mhdfBirTYHnA5Rh_ZWpgicjzhZI6BwHlBnJ2vL9ujB2vP6hauH1uxhHQ9q1nB1AOt0VrOGq4NZ-6OW8-JtdN5nU-1zHmpvhU7pZFEqbN4vl-C8SG_WKSIVC3yW_4bNxYt3MfCfY81o1mQPdwewT1vSpzuly-z1Kv1tRbltH9KkhTQ5UJFZi302eVSR1f5tEQSPWjijwQ6c4jk44xbOuLXDOGvq9TbrfcOvA-GsktnrJR-jITnyyc2Rfcf_4USGo3ccivfQP2oyDphxvR2fYh60mIfMvN6QTzEPm8zOG4vMv96VgZ_Q7nhn1fyfifQIKocOiE0ssQFkFgtKRRukuCubaIMG2iemdxEvcDfWxtdHxV-1NgEsLE9MOKxayCF3TUddGp2ayrra2FTatFKh7skfHLzrZPNXhdAo6hh3E-vIieVuMNuxmKPmYpJyzN7KS8HM2RbE2zoT_iiUiqZSdrwPRjZ0GjNoK1s1lnWnXuOmXoqqOo6MLb0mWwgfzHx-v-35BtwqXQW0yZaV7Cj-r-G-XMIXU6COiKu0BVQ0gEZPAv20G4YKPt8AGm8BNe37J1FHmMpLJf19A4uOHoaabRs32vLVpVjUQZpJKoUaoRmLI3fOeylW6tZU_qAtxXg_Cerw6nB5EYJ-IVKR4QlI7Q2LWB-o1L6sZBbKdpcblUEk4U1IB2tmqH-gSD1rHBah9OMs4bimMZXvwLrM29BHtwR6ckuw-926tLMoMi4LN3nE59ZUyxxS4ahni97pct9I6rjTB6L6w0ZxEkTRk50KPUU1GT-Hqj_eMm4H1fjsOVTT4XOozoZ73Pm5UV6exxTt2l6N3Q8fIrWDueYOxF0uqajvMSvNmOuWoq5dORJMqGfDgRwCqxUls20n90Nz9IAkHjr7SFqvG3G27lDW5eBLCDub9yZ5bW27ohzV0jDmouke8THLPE0y3rJzs6uXSvxOGvd633jgrKTOzKoR6O0AaBEMz54gCOG9hyDpspAHkdgiGE32EtT9VvIcqtH4YUC3qcZbSWebaHy2m6hx-Nfd9nlsKu8hNaoqNMzFvYNDMuw_TGUjswOaCIStEGG79QaZi3uqdm3WK43UnjobK7Oe0zQlCy2fQg9vLn6F1zCbskk0Q5E0oktOT4c8iQhEdwm8BgnfhVKRH0ftyfq7BF4STpdhNoc1FUo7aQfw3UH0TNufjg4D383wdb13qfvPEMtYmG16_VRYS75DaSkX8QqdPvDOIHqnIT1UAC_ZT3zdhVE_eUrnHVzjp7nGowbX4LmydnDtltXsfJzQ0gt7T1NGCmD3Z-dFx3AtljSJ86E7-15mf7-mtEknBYo0h1JiivDmV7j89PHz1c-_XF69__TxvD4kHHqwFQ3ylNFLHq8x6mrdnGdY-pwHuS7OeRzPd8JbWw9MpYMMrbzFDBbWFHG66qgKkXHcGEZGGl5cSw3fU1InVWV6E-ZCRHsSDiwBqfBCmSVNd6OLeFrkQBu4Jsde8xhZUOkfcBfw5dKF4anF2rYwJtQGUmNsJrXwyBUH1UqL3qZvFVb6vEAv06CANgxai04FlV8ZVCUslBGejyxLbuBBdDhe2Wcc0pXVkvlWKbRWJzTg0e2UBCnwV-nq-UyUOA9mmj0iaS6c1G2-enYWOadnyZ9lnQ0brE_oWuzySvF8po1XDmCaPSJph2ktbw6TP8c3bfBtMgH3Gwvpe_SV5FvqiY0iqam0R7t3dc44Q246wFljzICWprxHpCtp18L2Yq6wUczFgz70R5Tr6K9GuiLip3BCBXwIzsZ5FlMsOf18YzG2USxDdwOh6Aql-azdwzc99fNaPHGxgrFzbyxGLmTstKgt7Q7PBmu8cZLcxSDcxxcclIyfxbfphUcjrmUbjp0myd20wdeoamP55DAkt78FnEMLXQb8pBHmqNOcMyl9Zwg6UVVVy6Gs7EphHfZQ4VJoH_pALEof3t5g6SFVKCyYBePW9VddpYm5ucV2vo1iqQI4axSrm8WLXlv2H_HZYFiznUDbZzvYNtJG473SBo-t0NleaYNHpE37e6UNH5E2He-VNnxE2iCE0WPSRo95MvRjO6JvB9tGGpf7raBtSRvv9eSj0sYU6uET5R9QWvMvTP2DL4T0VVn_Nr-Howub5h8EfQDPhEc4GiSDSS-Z9gaTI_ja-dr5Pw"><img src="./examples/museum.svg" width="270" alt="City Museum" /></a><br/>
<b><a href="examples/museum.arch">museum</a></b><br/>
<sub>The largest sheet in the corpus:<br/>A1 at 1:200, galleries, reception and cafe.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVXBbhs3EL3vVzzIKCyjksCV7UQNkIPRGkEBIQ2KXHqyqOVIy5giNyTXK8UIkI8o0D_oueil9_RP8iXFkCtFaeoiRXXiQnxv3gzfzJzghTO7tbPSwDu3CRjelZPp-dkTSKyMcx5d7QIhNLKiAOkJ1kV4qqK0a0NhUpwUJ1gwGE3mwnA72p3hw7tfF1jrO4YlckgL2jZGVzqOoDf5ZHbjyrhACl7bNbQNkaSCWzGtjAt8jUXQb2gxwcvOIdSyyYx7CaikZU20bTyFrFF52VnU5OlJ0ge8_wNraQz5HT68-5mlzEfovGwajhprAtnopa0ItTQGziJyOK0oTPB9TLwSw_J8is3738-gA6MSN0BbWUWE2pGRFeWrbpVoOatRKpqOAeUUf_6C8gIbLF1rFQdfuu1kr9G45XIHZI2IXjb0xmk1QnCJbdlqk0C1DJxEqoBCcG2sxx2FiJWspKIJXtaEV07b2EvsuBqItdxfwYYopiQyHB3nrQMuxPvfRuhqXdX82TGEb6X_XRuNtnQaetqNjp6foOkL4gkr57Mrru_I72LNcskE4hvOK22l3z05MIZROirnPGeksFB6EyDb6BawpJkTt9Z1sM4XJ6jkPo3eVTrsjSfNpGiMtBg86596PsB9AbSWa7_ZFMDaa4VSiAJoZEMeV-cw0qpQyYYKcJBYo20KsKwNgU1FNsqonS2AgzhIY_iSjoZwj8a7V1RFDPqGyu00yE68We4wuPJVPZd2PcDbokCuJm0jee08Yq2rW8v2PRciaQaGYiTOMCynQhyfvhGCPx7xubzIH4dTaqUCeLuPoNXT0GhLaKSPmpM4ilVeCtz3VLPPaY9JUl1uVuzuL2TKamc9U4H-tdTTfR8exsU_53ksaPYvOadaGbkkc3j3wVG03FGHWA8pfLC4x_Rz5hpARgxnU74hpny9DRTS-Nhxmiep9Q7TJLD1Uq0IV8-fza-_-7xbU3vrCNeQDdA25mY_tH9izYnkwcDdwqQyv09qBx3SlJFbHcbS6LUlNULtQiSV2Path07uJuxk5tDqaRLOZAczyojL8it0WsWaX1YgdHk2H8G0tZQ0ZHsxRhwwUyHAfU8wtIrH8E5b5bqPjjJ6Xce_R58emM6FELmo4_F4jJWOY9fG9PF_fonxk06Fp1UbKFVK2qp2nucYL8Trmxfzq2-vb178MP-pL7_VlsYND9f-buKzROqTzXSW3pXuktk18Wrh-ajz5F4GZ9pIacmNcEtNRGVI-n5xJMr5acBGh8Dle91K5aWNGG7B_hxnx2KHWfpit_ZDOHvlNOS9syfr--40nKU52-8n3nJp-J72z_S6lT6SHysdqsBGWbXe6th6wpJsVSf7p9DT1CwAr2eUMyG27BVt95EewM7-M5aHekzYUlwKMXp0mcAJ-1iI7WMh8CVYbtnp7MuxisItPuZbluIjNmmeCbGfDT9SRU2aiowaPERZ1VInjw8v0gQpj1K57KtwjH1b_AU"><img src="./examples/gallery-l.svg" width="270" alt="Gallery L" /></a><br/>
<b><a href="examples/gallery-l.arch">gallery-l</a></b><br/>
<sub>The polygon-room flagship, furnished<br/>and tried against `theme presentation`.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVnbjhs3En3vryhID3GwkqLLjDIexAEUZ7IO1jfYBoxFEIyo7mo1IzbZS7KnR7EN7EfsF-6XLKrIVrc0M_FuvHoYSS3ysHjq1IWcIaxgtoRbuIASSrFDO3aVSBGawjiERijlQFgEX_AzFZ6NS-HRSqGgEgq9xxEYjVChBScznCTDZAivTVogSAfaeMgwNVZ4afQEXmkQYFEoyKxopN4yeiF8WoDUBACCl4Gf3_JPrsJU5jLl-ZfJEKQHJ_YOUqNTix6hQIsj2FiZ7hpjdzSLHghNgLUSHjNQKHKQGnwhPOQiFRmOwEtFBlhT6ywZhm2iB2tMSdMzEJBbUaJC52CrxO-YgUstooaG1ggrhV0Gm4UHodQEVjYtngu9TYZkP_HICwvHVJmK9iIUpErUDsFoWNP09SVzB9AxTDR-bHf6kff4Me5KGv3RS4UfNWH-4lKhEL7T3_8Kvwi9pc8Zbr__lSFXSoGTtyCqCoWFDSrTjABFWtDitHFUWKL2IGBTS5WhhcbUKgOR-lootYcMvZAq7KMReyYoGR4wotOU0VtAbeptAd6QozP49z__BSK6eG9qSIUmVThk6sSxh3lEIW4wGbJ2Giu9R90yc3A6wGI6BWDbfWPCwsGxjldk7Xhbp762QoErUKngVZ5SyHSHztMHdtM9LxmYYT5IJxtM2V1MgXTQ0HsqrJXoeKQ1Jmco9lMAmS9aK1E4D1uxUTiCdfDWbHIOwVePp-tL1gZPHQudjcV4Iz1RWymhR_eb2EhfMHhqauvIjNpqzJj6WsPq-auXfw26JudI7Tw5xOQgUmucA-kZt1MUzA-sNkRPYPQrdxJKI45eTYKW3oFpdFjBmcCOL_B-gzkOyT3kW1pFOIflRu0prEmWeuvIehpyH8WsIoYm6UfQ2ZES3j-FSlgvaTtuxI-NVvuYz06dyuZu0TNexsgcT6fIJs9lijH8L2M2GNGGKR95UzlwlEdYYSxvuS18EJz07n42qjZLZqjkBq3wqPZw9eL1u7-DFZRdyD4NGeaiVj7a98iUFBPZ1wCz8_7OHdobMrK__aaQaQFe7EIaj0hx5chmMoR3z67g7bOrq3eUdt8_W72DF6u_Xb2Fd89-fgtvrlY_rn54ftXuhizm8MLUcDwFIqWDnJxC78ZOkiGsK0FlYbUAJXTmUlHhGv5yUP_l-XTNKUCDqWj38oaMl_YS8AbtHjhRBF1uMDUlOhDJEHJ5ixnoutygJTGXUilZorfo4NVL3svr1eurN_BoMTmHsgQlNqjcCKbxq9TovgYvy6gqticZQobalFILb2zYa5tIKiO150ITsxkJoyw7ptmJHBJzet5wHeMKsuCRZDWHEiyhLCfwTKibmEm8gdkl4bWLidqbcS79V8SMa2iPlF9dKZSiIlsg-mBGSGb7ZBjpgRktTo8XUJaXh8h34Lzk7Gx2YDth3im9vsCStrI1mgo5rLpS5ERZ0fKcsrvaLTwUgkN2Q553NWZcBQOnXZ0MiqN6WNsbeYNuFJJFJJ-DPaR6yCid9OWvMGea-uSENmOtcIs6Wx9yBbUx0afRXoVbuVEIuTVl-IH5E8poDCnXNUwBKbXdbTLsCl_tMER12-Xk8tbXFiEVHreGZNoOrZRIKStQKszQyhs8SIj7hFDTQrgYqmW53BJSzBntDzvEihKV81jBZg-F0NkEVlnWVlnJesAb1J6S4cFHh-pGVQa21jTkLGsaUlBM1BMKvwKzWnHBKt0aNsjOD4Hd2h1SuBMlSWh_ydNfvpp883L14uqb1ZurFQT4kN_AG08GRGczcNtmtDJtf21hQwA7WAubFpChS63cIIzHvzmj12CxMtY7qDV1Iwejf_l1PUmoJMLgvbE7V5hqAB8SgFqTHWWZAAxhNh1xFj6fXoLgIhxqMtNHghUwm51DIVQ-5l5Ao3NdULx_2no5dMDBsYy8zlXtijWIraB6GhB_Wj29esuujqLeWpn1AoP94Q3gbWWpmRQnK4PJGTykvdBKHnS2EemOGkdvRmBs0LAWFVS1K6LYK4kpgtQxSIJIyJ2M6uqqMi60BU761vRJAsHO2TQBuJuqE4AuUSdUF60voK4SgEyWjkORpM7j-opKqM5TXCb0k9_HgwN8oIbM7PASBsNZPhfzswF8OgyhqfCBSoiiAfkyP8OcBvAexuPxODRxl5Cb2oa8NgqfjzpIx2MffiUQ-cmeNNdhT3hLAcTctg7htN3G1aHr_ACPpqPp1_BotpxO-dOnIzhn6v8Z7mI67RDDl2NQbhzvAyVZH0CDvu_2lbTIwdo_WIXbvXtX6Zve6xQPXHR4nadCexDaEeetrD7jlAddNYSfQlfQ7-gsnpwLHUX58QkthkLo2yhwMqmF3TPkRpn2rBhrkDe2OxDGh--fTnoMVdcRuKv5HUezPkfcPxLr88g69Wzhy-IO8dW1qyT1m_fCcnvXf304Rmq_nV_cxW3S6wbg8-ZyI_3hGCl-ubjHXJPn1-7Pm7t8iIYmvdZ_3txln4VOhqEOjb_wlUBITjJ7Yq-p4ABQj_OodS69nPwdgW26JdZCy9kvUTUdz2pSmN8fAcaTBQH2FcOAZ4RHbEEL-IpHDwACYJh8bCBpGXp4ge0Ob37Rw3tLowku4NFksT0GbFLeYQcYeO4BznuA758OIiUM2KQ9d5gKtaQT3pe6YwjvuJMzFWTGWHBKZshJYD45gzIcM40G6qjICL7KcA31VQL-UQvrw8mBO0rpFMb7nlAuleSjIYPwJHfozsIFD_eu2oDjJthS4RNVpfiQSgdCyhtsl8yeZEExLajR0JYJ4YFd28jMFzA_m07DPrjfPUKoMCNCj-cul4e5M4IJxnAPEFR6BBFVRtcJbSITniK2xXh8CnGQVm8nQVoBJKQtAjl7GIRnHGFENTFGTFGEMTtgXJxiBAk1Umem4Vol9bWeBTZC_RaeqlSfybsT5icTlp-bsDiZQCT_4YwmeihUUuE5OFoPXdwzwcQJocAfu4My2t0V0pMJy8eHCTS-i7Rc-rGpPYy_PNKuuCdNhRfKbOl4d7cvbc8lmz31NuHWjW5r2wrs6Fa11q67kGJkLUrMeOYoXk5UvoBwzjd5zueKXKTY9eUxdMd0zdU_rLSHuxC_FENrqeE7ymHfr6GS6c5N4GWMYT6M0WGTmntITWgNPFJzTaelcONAMZzXVkveq8ye5NdO6h1nZn47PgG0Qom7PSfXS91F4gnUBnVazOjaTlMqOoEKCopQrGxOtpQtbr_tissPBDL47DLz_2qZ5bxdZn7-p5ZZPLTMETGPz79wN2cPLRMS4_9hGSvS3QyA3mLK5_5idL48lL35cjq9XXagb8LYQXdz_BB4OJrHEzpBL86oRC-OoWeLDnvV3pDynD-03AlKpz3wb9nusw6cyJhNT9gAJ5rBZy3P0JHswxuTsriYTkffHsCJpNt-b_Ejut3g-EK9V1ZO4E1aCGljQ3MdvvAqZ7SHWbcMqfO8ja6H0Gy9pRXDWzA2tkItE4-pcTn7LA7nuGMtzBfHHiMPPiyGwCiXwbvwoRiGvzywSUHotDAWNsZ7U475tg74zuHQcZGc74kO4aSG8PcEy5sqAgH0schhZ-dcN7z01FcnfC1tzW-Yehi86P9TsO1keQjfdV5v9jBo_9UVn1MeHcyn8-V4ejGeLenpp-RT8h8"><img src="./examples/materials.svg" width="270" alt="Workshop (materials)" /></a><br/>
<b><a href="examples/materials.arch">materials</a></b><br/>
<sub>Per-element `style` overrides — wall<br/>materials and hatch fills, furnished.</sub>
</td>
</tr>
</table>

**And one that is here for its furniture** — the drawn symbol catalogue in a single plan,
from the WC's seat ring to the wardrobe's hanger scallops. Twenty-six kinds; not one of them
carries a `label`, and most carry no `size` either:

<div align="center">

<a href="https://playground.archlang.uk/#z=rZjbciO3EUDf-RVd0kO0VUPu8Cppy3aVvJbjrSi7Lq32wXkhwZkeDkIQmAAYkczWVvkj8g35MH9J0gDmJoqUb3yiKOCg7-jGOTzkCN9_un__7uHT_S1kgq1Mzgv45ef_AAO7Vf0lplqpDf3LRpCVWnKTYwpbbnOwOcI2VwLB7DdLJSBhlgm1KnHQO--dw-0j6j0om6MG3LFNIRBSzbYGGGR8Z0uNoDSdA1xCwYzhcjWAh5wbUBKBG8hRI2S0KPd7Ze88nGbot41B8YjmDdgtSrvvSy4RVOaW25xru-8bvmsES2HNZWoiYIlWxgATAjL-iL1zSNWGcWngYslsHsGa2yRH-bq0XHC7jyCYIgLBH7lcvU655HIVgcoynuDrDTfJK6_3Q67RHS9XBqwCjSylZU4qo0qdIGjmzGJzJt3PBU_IHm8cAGA4gPcf4O7m29u7jwO48apXZuYrqTQaWAi2RLFw7nK-UDqlw5Kc_pmiSTRf4sWrBTCZOiwASOUEAxQG3U6j3GYlxR4s7iz5wpIL6ExamagNGsi02riFZAQzcLjRAP7-4eMD_Pju9u3tR3h7c3__E8n98d0_bgewYCsyqIUtWfkrnn4Dv_z8X8J_RYxvFmDZGp0bWw6q5MyUsoXm0sIFg0zzdOUCYhbHwISSK68xkZd7mE1jSBGLV6QppKj5YwBrZZnlStbYSg3aGpHyFIvWushwHo-AQSHKzRJToFBw8U9YRiHgI59bUwFzZOlSMZ2C8p7UfJUHnZlG2GqiS7dPlRYYUJQLhJzJtJ-oTVHS4ZIO1IOKulBZZtAuSOWtSwIfJJjgXwy8vX3_cH8LgsnUPLWGLmVQK-hDv1RYogV5GGWhwX-VKBOXMglKq9FEFCH030RpidrUIn1wAZIjZBqxbyyTKUWHk8nUMXjXNypjETC9SXLGdQSJyjJKB7YUGIHPmvBXIxapEkGKZl0lFITthWDSRqDLVQQFZ1I5XwhVyhVqd2yKiSBLM1gY_m9c1NglJqw06F0mlbePddbkpk4Eq8CiELBwhlz4CFmkWNh84ZUfD-Dhh1u4__RXePcRbt7Dp_ff3d7f3fw0gHfW2ZSJNboAaKe1ViUpFfIr2KmyWyWjksAtaMYNkojqEbVgBWyZdnYiXV1-cJ2UwkUyZEKptJ9xIcAVMTTA7QDuy5WpVSddENimCo1QMiMXkr6YlJIQ_w9ysmFtjBz3nbBlmUUNCZONUSHnaYqS8o4q8KBHLoKz7-vL4XvB7Bl87gGUklsDm00PYKV5CtO4B1CwAjXcjKFQ2mrGbQ_AJEwgDN-4BVJpm0NZ9ABSvjHASustw4Rwa3NMSxEqUa8H3rE8_Xo791sBdxY1VxqokiVricbAKI7hM1zEUfwKLq4msfvypbMbmbFwcne1z38ZxlfxAcSo8kURwsYTlC2-JIqXo7W9s3_NaTsUTFvuoqbZP_T7p3FQxX2Zzg5loKvvVzDGLV3Gz6iSMyHm8hSmOt4znhPFMcxpxqwlx-wZOah6n1ZnPKu3-u_PuoYuhdOcWSOC_972kbtPePq1ngv-iC5ZbfCm_1ARA7LsjiwB7pKHszvXdcBr-M5V0DMoKfF9L9KhVmWfqJWPK-p4Esc78lFF_ZtffAbVx1EDooMNwdBgvasb7LCF_eSbprMOgXzYqOu9XAl25QijhvADE6KRqhIs9xWgYS4xHTZMb_Ja2Vkc7yZxw_w2NLPDszYz9HVPsaMK2woKhx1dHcGOXsb6yHHYVox4bPwUy2x-aAFCUBSlSmmCpvNMK2npHqnrF7MwI1NueWpzuI5joNqOIJFpuoC0BeM6Oy6pO50HqzZIH5gOGZKXWcf51UgidJA-fJ4gp5e1lFcvIonQQXrfN0hDyMtGypeRRHiKHB0gp5PfICURukjn80MpfwOSXA6gCnQtQfVxyFDmmYXhrEZSHrnbgMtUbf1CfzEyC-Nxs24Sx8eWzailbuG6y_ztRKdenaLVyybj-ATN35jMwmh2ilYvm0y6y3oA59Dv9-FJjaTfftfHAWk21uWK-jsm65bvjW_HWj1t3aP51td3eL6vC80fs1Vf58DcTyZMayZXuEFpO20jg0QJwQ1XNIoEdqvno2aT-kjN3KBBZOr_HNq3o0y0Z7owNLq213d-VT9MuAi2OU9yP2fsqRdNmKQJIOepGzoc1ynGbWd-oMaQTnWPAm6WJ2vVH6pxIypxviT7GncZx7sReY_Lpkg0APs4p44xANrTYxWZfiyie_YYg0Sdi5YQY7p_x04KL4S7aqZx7GdDpBg-wvJungc3W7i4juPosqXQ0N3SR2WphqBGFifMsC7613G8u5rWklwfVaqU82rkcaDh9TSOhtNaKcqD3WX8MsmNU20fUWpGLfPQpTl7otE53ITZK2FaczQ05LfeVJpZXUkoSl0ogy72m3Ba1iOF43XeBqoXDGbpqWcDW1WKaooHVo_w3dndpUbGkiZI17j3g7irmzQS_ShYQlP83g3b9HKzxhDGihJNIxPVM0c3lL227VCextF4FHcNPjweyn7ObYUOxX40Hjf3_ZByoRvHdSELbdmb5nFCl7I1pLeGfp8XziLPV7J2OJeSprmX82tK1d_rOWrHQ9MYNtTw29xwuT5NdXfKUY6xyrfDL0p3OT7FSbnJt8zkXtGTnOtTnPDm9Lw8vtM6qEbPccqiQD1P2JJLtKc5V6c4_pGkHZPTqziOKIRCSFELsLt-yqiDKjTlv_tWfDamgqWfUytoNamTJHRwLVfpvStoxzdP487mWpe6lYc_UZdUlUuBbk58IlKYxoNQ1zTmealCB9kwJF3KvgU4ybi8Hk3_KGMYjy6nRxhbplOtlngYuqELDQzXcrUYBxYe_ZkWDiP4synlGuVKKsrMWqpR10to1kcZxG9nZVPDLqtAOgD698a5v6ndlTiZxtHVqM6rzpV4sH2p1NrkKLIX5BnXVcshGkOT3v0__ukW01xtn0mtMIwEAzUC-QmjpRMzXL5Q9S7ranWwfZu8XDSvR_Hx021uy-XT7b7_r06fdITvAVhuBcJnKLT6Jyb28EHSNb_z5R7ObnSS3zF6REmpWTobxaNZP77qj2Zn8KX3pfc_">
<img src="./examples/furnished-flat.svg" alt="A furnished two-bedroom flat — twenty-nine drawn furniture symbols across five room domains" width="440" />
</a>

<b><a href="examples/furnished-flat.arch">furnished-flat</a></b>

</div>

**Two more, drawn on a smaller sheet** — the same language, laid out to a fixed scale inside a
titled A3 border rather than sized to its own drawing:

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVvbchs5kn3nV2RQD5YiSG6REmVZXu-G2lZ3K8ZjdUjyendeRLAqyUILLFQDKFGcjo6Yj5hv2A-bL9nNTNSF1MX2zurFZBE4lTfkDek9OIPx8egQHmA8Hp3ACrwulgaHPliHG8ht5RHWufUIztqVB6eLJagCbIkFpLZyYaNcNurt9fbgJsf2EWgPIefNBqG0ughgF_yoNKoYgCoy_rbQzgcIOQEHC1WRofOBflVzW4XeHuggYCrAxQ1cXMOnyxs4g6vLyz-P4JOVrdpDhqlRDjNQAfanSZIMDqdJcjDcH4_py-skSQ5OBa23x-9m2ujDvNImizBrp8qSUJytimwgrAbL6_zdRihPlTG8PoCCGclmBmsd8t4efa88-hmsbWUyKKsAkzGsJsT-GlXI0YEuIuDCWOvApzlmlcERfCEusUiN9egj56q3F_UCIXeIQ4_LFRYBSuWCDtoWA5itb1n0MyEP79FtokwJ0aHKfCN8-Mff_k5fCDe-eQCzDH3q9Bz3D0bBBmX8bMA7Uu3Syih6D5ObDRfaGMbwelWaDXhED4WNzBCDGC3i53P48ez9xaef4Orzx_MRnD02EJ-rEoXKuUN1J08Lpe8R1mpDUlOFXyNZXm8P-utcpzn_klmkxaQyXWR2Dcbau3_vj-BG3WEjkdt15CMusoVwVdPxiozhy_n1DayVMSO4IUroI9sC-sZsmx0D8BYUuMpEulO7KtnwOq-JxkBPVjrLDNYwjamJeaT8psBvGi5UqovlCC5Y74UNp7xlqYxBt3nlo4TZfiMfTKHXWcSvaa9PFxuv0rSn3oHKB2ahQy1JjkDPz65vRnDm0vyj4oNOgmc7nG-gdHZOhNsC5SUh1-ldgd6DXSwAVZrDQqUNp4LN8rXrAnJLlEbTZfrUnRgoCgOFZScDNk2rUqMfgOhae8AHlQZiQLVqoKNWZPLQG0tHdqFSlSEoo-9wBFeoMiZdpXesj1M2SgDl0hxqcyfsVWnQ_0uDPGS_N-Jlw-Gv3hYwHHo0mIbIlGcken3HzMBhaV3wMOuLIvun0Cdp92ftAb3Fp9eRHvszOlW9PREl6YTkc_b-6vL6etcEG9GsSeferpDUwo6TXTS5VFzx0ZSz-JfLT-fXI5j9ldYZfU-rfod__O2_4Q8ijx-XTt-rgM1z4ZB_8ujuddr5aelsVUYvwmrzQQUk5Xpxb2tdLD0ded6fKw9_Ob-6hCXaFQa3ORUn1W4DXbAZOPTW3COZDavdbEB50NGm2Dk7WKNDyNBgQDqPakXCsS7ThQpkOfxEZ34A803Aoc6wCDpVprcHmVNrPmV_xtUcnc91SXL8cP7-49nV-YcBFEQY6GKBjg71wtkVrMmp0aEnTnOiofAUFPz_2pforKOQjdh0dK0wR2PXkKoCUuXchsy1mrOLBWal8dKFBbWyFUfK3l5jAKLLmm4yApNBru5JAE7fYzaC2bZJ7xotacDPwFlj6tCnHCoPVfkWZsNhV_mzGCz4lMtxBx08HeE2zEePJF4F4ZfLj__10-Unls6A_JYEKnCYBkWBy5-Cgs-ivfrMt5HAFiQ_FLdUhVxCmPJhBF-cDoFcmK8hOQ0hh8liKJDdLv1Cro5MDuYY1oiEWWpM0df-KFqJczqzrk1AGj0JotE-sJuRdRE86BV6cswkvxSL4Kwmf2MMWfsOPxQaid2tCCdZlLpHp5Z1QkTiqwJbfWNH0TEbNUcOQaVRKWbkf3OiOL4sysmtRCdnxlsgEz2FmcFFGNpFPLxqbu8xRsCwtuBQQrkykGnSj7YFB2_LiUl0hkAZzNveHsy80eRQZpBZ6_z2ObB8Cmydy7QC2FdgUMV45NkRwJskgdWKXQMnSeOpPOiYUtwVWVyrzcHb6OIRZqVN7zAIHbCQPENUSpZsi1GPU5v--4aKn8mL9-H3HkBVkAmvVj2APZgtnc5gmsxO2wzK04GAcZJIUIshfrYwlc9nsNAPoXKklIJPBigYjUbThMPdqAcQEXsApaIzfXYoa1NVYg_Ap8ogjE_HCS0prAs5VGUPINMrD6oKFpQxvDDaIpt5D8DgEousx3TfcPpmA3kk8rIsgOAQQx3aKY0ZwcxrOsbkLziJoDTwLRlYoVboYaHvkfE6-rdFm_898h4Cx_mevG3_y8FAour--cEA8LdKBetuyY4ZeP96EJmMJy-uOBiArwqnPfJa2e2rwmOID74cUAKGG9aGgg9XZz_eXHz6iVF_Pv98dXF9c_Geta_IJ5SYhtM2XaEYU1hChJXN0BAVQOYeKsoKioy-Zyqwyogr-L1midOoHFfal2zhQv4fIvjhcDgEn6MxxDaZQO07WpPnhGj41b8exNwye8eAgA8BnWZzrpOpwySB32E_GSQHsD8-ptql_TSmc3NAv8ZPXCrUlN6sLSwqY4ZrnYW8a96ZhZVtk9m1dXenfLDmmOvIjTA95yO3EBMcMCyt04XYXeNN2QPVi-eY8foRnCsJg6quWZjfOaaKakl2bboQO9EeUlsEXVS28pQOkBXbaplLUqMpXSyVo4gOaa6KJXpQxnLZNepIcn1LZNwWLb8daU5qaR6K4ESM8uWPxyD-ZZCTLshJBGlOZ6e4CR7N4rTJlQcxjsT81w9gpUOsVec25BRvCnR-my3Ge4mgtsqNn7nIhW7FW3857BI7niYSp8dJQqFZnKv4VgqppL6d1wIWrBpKeohCu-a0oFQFmm2ql8rcruFJssdTJptoqcnmzydPqINg8BkY4X486eDIl6eAKFpvXgRiGhpinrKNTFNu8RLGm_qcvnnOvu50SPNvYKjl5mkrDTl8A8px0rFU-bIDhNn4ZaBpK1H5HF3OI5zJVwgat6clfmmQWgcr_kbqCsw6NQTlPlyEzL7NwXYrnP5H-ZeAJBUAyV109s7dxkXUL6pNwOu_IhCzD_QkpmERpQ-cF0Vsxtrr5FucqUlYFpNTS6ULH6LT41fRu1_FvgLXypKkGb2kHlM5i6DkIhlJu-iVMSPvV5UchynIYWqpD9UUPdK64mxZctuVvY-pdgPakEA_bpFK5XH0ql0BxaMTWYRWYjXBIq_DXXmd076-SEswcklwuuDxTJH068PzNNoHXhjhZFcv8tQpRqTEkK7ddnDmvL3N2nWTstfdkbodUguKX9uk6EtNkQkfSqNTTeXoPufKa-0RZl9uqQ95-_Hsh_OPt5efb64vPpzPDnblWCe5pTWbpS34V9j2g9_rymuMZ51gx7PGtVGcPwkxfZb8CaO_niYHIt5uty_qjA_pVn-g_0v88PSxYs9C4DUp9Nc5WEmr2h8kb4Bx1G7MIx4DTqSr27L3FcDJ1wAPGbDrmgQweQbw8AnAvbq-qks9KaIKXLfJ9WnM06tsQzmnj7-YDSfttuxkTzAeRNhYcEOGJZcK0oSQVq54kNYrDMSbiIPgg4nZrv3J65lWqPXDR5hOdufUTTuMX9OeyLRdLHSKW7ZQN4T61_HD07bAQY9OWeiEt9ocHp30P8nqPkRPG3fvak9CYAfzsFUgY046mD-okNPe2nvT7h3AKmizDSgB82nAz0EbHTYNkZV8r6UTw5nUy8N_8k8KVi6hQRezWMSE9lGwEN30jBxgW96bzTC2DoRPuh8xeo6UTpsN49I9iupCzSAot8QwaPJ1MsSmiyNtsquL_zj_UF8hcO9bG25jGUOkMXLs4XGVVoXcUqabGkasgyIlnV4SBi0t9CpQt8062NhqBJcF7a7LI0aNTWdsfDGVMc1FQmmULjjhVsVmrTanMCOJNU0YNOYVef415ed14c4Zr87eZbdS3IjXGrM_lBqKHIS8WQo2qqYxnpsoONH65aM-CDU_qX-CrmnUKinPctTLPMBSuQyLunMFKg0VKQ605xDOsEremElvhItTaVT5NWIJqNnldK4JIPZG2mKESg-fW5Ntcyz9aAOxxUP-qKmkVIBjZlxkcJIkwgkz_gTKchtFChdGmTYok6RBccR-WzexexrwLYJq2SjMBsaHU-4SrWlXbOyx8rizHMuWO8TSSxlFbQTPuKlB5d5KAyu-kHoius57uHCJVSwfo8lYGlLkj40q7kTp-9Q3oYqIQU-mCVt-7Z9JLqWpqFz6Va3mB4PYIJu1wqrvAZVe8W1hiMqhcm9bH-KkI08sRqmkVIBJK8WTx0JsIcQzNnuRVfB6mgB0d3ddR_SGLYT4wh2II1LdcxC0YwtCCh2GiDWPCjBmMgTizS5E6-c7vHB90hqlZ0KmyfMotGMXYvII4iR5GWKyC3H4CGLMzDwPcSim_V55zJq-tCQCZTU3Oq1v0_mGiraJ25L0gXNx6lzRgSefYbjArr2Ezt7ZOjFvKhfxWPVxndYuKxa_u7t3M-_t3cft7phs72yPBT5tP5pM6-hbb5-028WZPLUdY7ClN8f9z25vY2q8fDulrjm6eN3n4wjB98TUeO2ps3dFXdIwPXWzjf86Xqv1_zuboySFmYSYibt3ZfnU5q3ciCW5vfno-c24vfn4kRbfsJE_t3krg-LNR93Nxy9u3sqWePPryTdu9nXXgTdPSF6xE_ANAvN1q0EKl8n3bz5syD7stDO-vnkdfTPE_ECyw29UVTyDtyZunryZbm8-2RFYa--j0SjkWDzRav6ezLIOsz7Oj3BznYdP-PYZMlzZwgfHieNo60Zbe762x-ypsQmCbQYnODPlwMxDBG-3Lrxl-ICCJt3q7a4njLdyxVm7m726zKkb7dvtk44sxCMwS5FEbklvvQKuLz_f_Cyt7Oaatrk-ipcTMoPAALGXTQMKWFdeuOVzRjsarlOppqL-ukt8vH3dDi5Nuwequ51XPrkbO_WsbP-e3Vn0YC3tj4PBI3e8qFyh-WLsnyxxWiBvFwqoPdO2moo0p4zWlsC3cVKUTY6S5OFNp1i1C9XfQgpqbnALiRpASJUIIxBnXYQbWt_vPYcRHf3LGNKokm39Nr2tXbWrCnCUoG5VJFLJx4uBtzCzi4Wni85oo5mmoQ6ZqqG5EEbli-1XHt6ff7q5Om8uRcRY-eaoM2BnbSidphvD1K46Bp2qoIxdVmzNLdOR2luvi7umWusUQPUITwJCKYwPKXNmKbV5XEelgboO8e_b8E5ewktpQgLdd-AdHb2Et3A6W-L30Mddki28LUAKrqGaywqOtK0NDzlppzd1jHn8OkkeXvPdcIuyToWiRyhzG4JdDbkC7aIcPQEyV14XL4AINR0QMuijadJ7UuKMwtH_6UNJZeLDMZOwxwnIAycDdkE10mpOt11laTRb81xtBnFvLJub0FDPv9EFdsE46_pmuW5LqHY-QlZdfKLGa1OXNTbfnAKHNFiKrr4kphkknUoQoyut3JG5y9BLyE85yz-VeQCUNkP_i_I5uj699GQypVKRj10MOzR9MJJ2jbM00wRvkhlNf8oxXqk01wWd2R_O3v-Ji0gpFYlkX5U0RymBywdkT0FLOiN7bQeE7kWDXEOLtVLMZtrYaTTHOqOpGcV7hg5_qzQP79azDIq6egx6Px5NTrgFblDd11Ot1GlkNpI4EERgRUeDtU6lfqFOOk8nygTAl9sfL_7z5vPV-S2xe3tzyW1yud3vaEd78L9VyuFQ-7zRFXs3uUPmpk5sKcUuFFNa1GO_xdZsFF9rbLszkUxM-47eTJPB68Omt_dGDLb237WGGwXutCg68zjdRhtTxJehMm_EeYOae2uqEEd9PDgVGzVK-JEj5JtGWkxtyHq3Gm5xxkv8OV2CsxIb9qRnEhcxMDWCY88hp5RGMp54a08jQDz-xV25tuO0QlWEbcFl6O9ihUlJwetGaBz1XneiHvq77dg7t_YuVT6mJNyzb_up7CWOOv3ZuLgR-_hkx4lhkbbVCtWLSXsBQOnNFhot3gnjZKUdX8rd75d96Zh7vp1m-AdbcUzftiyXOTsXLo_kVrPD5pH0tlvbktUvsLlD5eRrzvqbqHwEe_h_hm0OA98F8SGtexUzXcC_kgn_2yy2LNiwO2MfDmWmWdrRwfI00gjOJJ8xiiNMM7_6aKZO-w5Pj67vmpn3dipb_KW03vxdPAXSCg88kkk3yzzByTPsPExOnXXFrjjYeBvavrSmkbRNBW8smVuRjTt3BL_I4n4nWxZHTu3H_5crAcpNZp3ed_FKZjF5Hihr54rWtS6iM229y2h7ZqUZyal42ltRUL05v7q4vHrmPxqw04vTspwWx2n8mCaJGbyVCMsvKlIaWq37uzKs7lTZ_D8HUU-8I5X5FBWnZ_ia3Fm6Zqe-sDg6enH7PxuYUQpxpDZaCvYeHXlMykJIEUEHg_GGqnT2VxpuezQvyL9yUnE730C_Hi6Lz_n2c5JMjofJyXB83OdLnz96_wM"><img src="./examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7VpfTxtLsn_3pyiZh4BkfMcmkIQjHghhD-wmcBS8F62urnB7puzpw7h7trsH4z1aaT_EfsL9JFdV1fPHhpBkT3SflgcEnp5fV1f9qurX3d6BUzgcHsIjjEawhJA7xH0frMM1BHROpQi5rTzCv_7xT7AGIXNqpc0CSnQgAwcwd3YJ0wIfsJjCrLDpvR_2dno7cLoFoj2EHGFW6SIjkLAuEUKuAlhTrGGp7tGDR0NDDXhMg7ZmAMpkDbz2vR3I7QoUlIUy4NXag7dDOFdpLpPTNMqAdZk2yq1l3MxmawaaYWqX6EEHD3ZloFQLPO7twFS5NIfULktd4BRWTgf0EOzKsO3Dj6Ohf1gMup-Mn3xyIJ8okxFihj51eoawv_-rt2YKC2dXHlRcjP-f_50O4fwB3Trk5A5bBa8zFB-xG9nt08ro4KcDmC6czqYDgi5ViY4-8qkqkP7I9NKDqoKd8kvagw8qYAbWpMgrV2VZaF4TIE3axG-GqaLwWIO9nTY62oP2vmIIjr3PEQNwtBB4Ygnz5OIcbianl5_h8gaur87h-v0fz88mcPv5cjI5v4LJxefzc5hcfjq_GcJl5kE5hMrov1YIt5eTi8srUMAuGYC3vHyvlmTLVGcnPkzJAFUUws9oNhkHxgZQkBbK57LqUHMsw7RQThGBhGEhR488syzT52oehjChZ16bRYEwVym_v6LPhIwEVZVE9nlhrfNQ4EIVx_T5GnL1gGAs8d8EyKx1vR2wc3qoHZGrpq42YQo-6KIAhyoT2Ll2PuwzLBTKsMuVpwFpjpkkVWQEhbwOUsOq3b3hA7qgU1VMIbXGYBqI1hRfdqGk8QwLuxrCWa7MAiVy_OCVB00sJQvXtoIFBpje3nEc7_589el0cnZx_mEKToUcHfnQgAKvCzShWEOmfZyTbKVFCBemmXaUpTEAmHUqBc8Vo5ZhaiU8x-KNQi_yAK4yHlRhiX7Bw9zaUDptwitK-4_XVz-DetQ--jXTDqqSZ0MTkCbjQKvAo155KJRboNtPrRSDgIAmG8IFOskymoh88Mhch3XDv4WzlclidKJtnWk4OJymKr2PIYecKEqGpYVezsjgYFfKZTEaDjH81JC7XRowQxGCLcWRkCrnKFF5gZldmemgs0DCzRFsWVqv6xUxjanuFd4Kf2mMUQ9ANSOyjjJEUVkgds58cBUxJtUurQoORW9HKsMqJwfhY4pl4DigCW4NmC1wAKtcp7mkybobOh9s6WE0HB3CEnxuXagdQ07q7cBKFUWdcMHpsk5Vrv3OVgFbv7YpVdP5Xoc0x5hSRGOZtrcDBZpFyGFeOWaqt1XIKQ-WqHxFPjs4TGC5JGuothH3yiD14iBJavfXvhqAWihtfADV24E3SQJLbfSyWjI3Yi47nFceJbLcXlY65JQ-v5xOLu4m19d3V6efP1_fTofwyT5wq2sdxS1MKsDjgJNhpTM0nP-85GP6UDqC2CbOofCCUUvMAAtcouFU53cl924v_sK1-JfTz5PLyeX11Q18uL56NYFP1_99Tp5H8KU2yJGgVHk8ORgnyYDnWGHYd9Yum4frk9dHSRJ7GY1InfW-8_hNkiTEJo7Hc_XZtGwvC5Vik123ZzwnVTUVcp6VUHh0blfogD_zWlqNmtkHyVfLEbZSibhm-6DS-5b_xhIjUluu90vlAx6TFaqRIaFxQZ1jEhcu7bUJmVPaUHDi4xUGtsdTGa7TS9U1TXuY06qDhVRqrPZCaR5H2cMvc-tJVVFQEpssPq29tIyddGWF9PfaZB5QORO7CTtwoxjroqh8cFTUCMBj8YBeorxRvW7PqCuVaDzY-RyU1KnR8A3lKbFHyFsXBm1AB44UmV6gmgvxpqVN7zFMj7nFcHM0ln3tnM6s40UZClfM-jfDN7AcQ1pYdU8eiEXbFzRlgfMwhczph-jkUhkswFhHuWsCIY-HR2QipW2hzH2Xu7s6gEHMPLw9TGLnFzn3NkmgLCqy-Fe1nO1FhyiXoRHXcvopMUSbxZTXuFHWOLwlVUR5Q6WhUkVBsR7CKVBmotQgT1qYtZKBla0KShVJEyaS5qQOalbgT-BXlWg8ciAPBr9CLOPyuUpwha5pqJdoPOmXNCdCqlqbUXo0KoIbEBb4IFKHCugQrixFYj8ayjHkqYjjojWPYUpLuyH7d_emvR1wGCpnPJiqKGBuXdSIRESYVQGmgjaVMnh7d3N7efXz3fX7m8nnP59NSCmkylAxwwc0rDXXwGHUgZzWujsGgXcShhSPgvd_-eX05gZK4h-5IKwsWU3coAq4shCcIjmsTS2Q2eIHVEWkaqSDsZEsTJNgoVTungtG4ApVO1hoOJVE5T2ExF-4SwVvZev-RJWAw30MU0cVnBVH011ErbAAsD7wxK88GfyAzpN9bWlDesRFhFqUqwzzTRX3VNKVl3qOPjSFkv5BZ5o0FFNqQHqFnhITeb7CD3vcjvqTek_Sh996ALyDgOWyB7Aj2wg4TKbHnXpYKhc0U0h7GEvd36r6HkbULHy9fZjOi8rnU8ac68dQOWQh66VAD4fDwwSsoz-ShMS17CJbMUbu1V4USqoM4GPp0HvAR5WGYj3sAURTewC844HTAyitC07p0APZg8DomAdI7ajKHkCzF6KY99jA6yqQiFcpejg8TBLe8iZJ8hO8fpckkBaoHMwwrBBNzEgX1rLuYWcjqz3MCs0tj3FnlqQHUc53XLPSJrOrugM2m9_YzkXckLSpE5j80hQgIiBBd3clLGp9rsq6XBYqCueMSshSZ1nBlZd2D1FGhmYHI5U9RpSx657WspMIjxQ8ei2qDmpbJdqS-ixtrQyFpMAAt3ACh8SS-LMj5IaUZWqhDfo48gOcwCh5kyTx_wmcsOpq38THgE6zN3R6b9DXr978cnl1TsPjRDtRsqtshspRuWTqDqI_gyU37JNnaivPJwBwAqxjGoBNocPlplYpZPizWiYCvj89-xMBsvJpADu6SJs6uK3yZT_2GOEBCxhB_2duzxIlyU-Ir2cn4kdovdK6BWg1v8FuMkj2YPc2_v6wR5982KNG6xH-vonGuQ2d7G7RyKu_wS57mbHkL1rj3hbM6o748jzMSGCSwe35pAHhv7cx2BkvY8jku7eNFQzB0dLZibtj6QJA1bw1HLz-G9JykkcOTKFmWED_QhVFH9qfyqMX7SO7me6-Z3OWQnMz5lnY2fzDsxAXH5lPcZaPPLa_OYsAbKGuUhkhqOyhDdTx6xb1rBZN_Q7qKt1CjFuiiCgui4iUnI8Hb1rEP8nY__rAmqQviDWACBVxtrTn7CS7EyYz-mvaJiR7JBdDTuFKJK7CVlYGLOlEELGAA4nWFmZ0rTWx7agAYyoHAkyVeAOh48gdFnIiQoebMpIPDVoRyTzrbr1ppldeDlygtNqEQYTcPYgLozLADWQgU3tb6KytEKRrpGl3cFPrDDpWnMslqJXijtVd7SqNBm8s-PBts2D6q11Jd52sPvmRO-baPFuXyvtaFmnp-qPhGJaNEKp3jX6FZWj-jagkhOQoj4sg78WjF1tRQ3oDaPP_RQWyIYi218uej0Kv5c2HhjfjTd50Zhfu0S6Fo5-d2A12M44QfBtK6oq8X7fd7MRsJPHoaIO-RxtmbL3pNyYevZYFfOFVfndeOaNZ_Swx04pi09QQZdKczzDKfc4PlkySoiMuJW2GfqKX-1uI3s4VPIc4syHYJQ9uIbkG0o4oQt7YuepvGyl1iCFX6Sac2NhFfC1FdQtipjxtE5-F4HB2IY5omYdJr8Pu2sOkgJ3OapUi-hhuz28m4HHBJxy72mT4CAeDWifzEdFuMmBRsRdBOXUpMfdke2Lnc49CaUVHlUHxIXhU6iSlIjzfCJCE4_JBB2rUmejMo-3vf62UC-j2aX9EFwSdYyqigpzpNcd5fmtIqoIq7KKKydI6MTrhzmtz35w5dbMjmngAshrhPDs9vrrNlUDHJPHnWwDHo5cB505nC_wewHcvA_JOeGNAVIyYxZwgvr1rc2JCL0QGx-MJuhCQmjA6TAbjoyTZk3ffUccjF8mxcA9EPojqGkP_D1z-XxJdP1Rz_RjJ9QMU1-8SXM3FxDcIro8ytl_rlY7AgkYKtNAzzEatHnpZZb3HjF8cReEyk_-3EVXIv1VhvY8Hj_1oLL371MBxC_eyvKoNHG8ZGMvIlW3Jxe1SouHjzYkczTK_-bpm43SSdyZ0Lh07skpT2SMR8MKpMo93RnE7XYeM1lct8lha6bJru1tTABphQsscbSmTrhSj0U_afcg3AXhP-CWA2sMbFowJIDJVBXg9ftGC8dM-36XR9_R5s8HtLYE7flkhdJlBFairEN6-qBBmmAnPuQiy7V_pwFwSx500-2ArLopbXV25zNkZfhH4SV9m_cE74wh8GyH63VYt2-BSIx2cLCzI1jU0T-RgiA8i4rkeaWW6tY90ZeEYj5_pXFegZ3QazuQ_5tSDymTYORAh2AHcnsEM-cRPN9dkcc8vEmQmN1ASm-ETlRLyUM2iR2iSr7n6zbNqp964fQnniWdfEk3PwDTicEvNbQinFyg0fm5d3WUd_nsMGj9n4DYznyfQJjLVplDny-vDw2Twbty0bTJu1DHujAb3WyN-QPM_gP4NpvYrRy7_6f4_qvt_owDwocrW3ygAbmhsf-OQxc7nOsXfIQFu2qvGF1TAkg_Zv00FfKJ7mtj6nxMCbeeLa__m7svjn2u_8LsacFzcl1rwk_MYGf-0CXdD-f_VhLuB-b4mnKG_byuo2P6VUnckbG8qKPr77So3s_Y-VR6fQf1SYX67eQLwPiJsNGCWf91eq-qLv3hzzopRzvFVfX0uX-Coh1FXjufcEZivuOXe_6HeBjc9nP0W1LqDEu-6mya9hLIK8d56axMqBnxzz30nG77nW-6P6bg_tuFG2n0lsgTF2-vvaLmbyF9i4tt_u-m-PXzadOG5ttvN8u9qvPRdpS53-axy0P2CUyQSX7vydxudtXM-pynR7Uu7LvQ9yj2aHGdi4WveytGksJW2OjT-lYcpp_m0Pp-kK6BXng9IuUVnbW938fR5cnF50xyMLuS401iYUopN6QuF8caObpUxG9Y9YQ72AR19zYMoV6uMoEOBUVSUzv6KaYD-pPtd2oncHkqM-OL7braG_qlL84_KLOLn9FWO_jgZH-0nb_dHR33G_3vv_wA"><img src="./examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
<b><a href="examples/townhouse.arch">townhouse</a></b><br/>
<sub>Three storeys in one file (ground floor<br/>shown) — <code>level</code> blocks, one stair<br/>shaft, one drawing per page.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=zZdfb-O4EcDf9SkG9kMS1E5lb5LLLpCHbHPtBl3sAo0P-1AU65E4knihSZWk7LiHBfoh7hPeJymGpCzbSQ6L9qV5CCyJ8-MM5w9nxnALpVm1WHrwGzN13ljaQmM6R_Dbv38FowmExY3UNbRkIS6YQGXNCpaK1qSWUChTPrrzbJyN4YG8l7p2gFqAbwhahXpaK1OgYgG_dKDkmuDzT4uH-7sfw5rAiSLYtmoL3gCtyW7D_qbKxrxs9S48Fp1UgvWRDqRzHQkwOnxxDZEH9PGhREXn8COWTeSfOCiM2LIYajBWSI12m42DhuHTJGgghQO0BJ2W_-wIvtwvPtx_AoyQcCjOBK2XzqO0SyhImQ3Qk3TesSqF8Q1UyhjrsjGrw4sdrghKE7f15CbpgNCDa9AS78uqbfiNoFKhJZeswsq_g6UgV1pZEEynPzujl9kYLLXGegfSQ6cFWViuyXpZojovjdZUemm0Wya7fORvgz6VtM5HLUETCQfasFe1z8Yg-K2pQLJBG83uUFJ7KBWhPs_CgY0WR_Eygl8y4FPzDlarDKC2UsBlngG0yLFz-wYUauFKbCkD0Mb6Bro2AxBy5QA7bwCVyjIARR6-wA1c53kO6W8MpvNkYSOFb-B0g0pBSdqTVVKTO0tid3ADP7wgJqj1TVqzgBuYD0tgDPTkyUpjIWB9I8tHTc6l9R9uP35kkV5mHF3K7oeGBf4YLOOgtJ128YA7peKmHBMxyisfjeNAmsHoL9Z0WkQnxNODuL8UN64hpQa1dhrBAn6B03ySn8Hpl_T_7ozf3J1BqYwj-HYAYv2-bqBF6yWHwx5qlucMY-sCKfy4OzsCPEpfNqS_g_HmKo8KxR_fssCxxqx6RTgbovJO_ovCgT4FZyksSMHoAyo1gs6RC-d6IK_kmg-YCSy3g1xe5_kT79hDPoaFCROlDkDJoIEU1d2DXQywv8bFiZZEo2EhS6S4CVnDTo4-Qw_z2ds8T4E6Y_NcKKBSezPY1YuLr8kyoyE5Cz3MrneEt4eAPYsGRG_TAePyzWuMAzs2UguzYc5mT5WdMZf5YMt1nj8T2dt6JzN7M2w9m-d53KjqrJa-swTOVAhSQ-9TXTYc5KaFSnWuAakdeWBGjJM8z5-uL3dOeTAVjo6QfZg6qR8Ba5Ta-RjDQwCbqmIua8S796fAoJjMnHjhB8fGLM8ns8tdaLzN86c5h5mQNpatb0M2z2H056Gi_v8mc4G--X1APrmIaRwAFymTDxgk_udi0JfLF-rBxX4qx2Up-0ppy04hb3oAY6MS6WJI5QCb76Xye_RNIrHEIYLE7DtKy3sSQWLWc-LzMWr-fbWlp82PaFm8Yz6ZIWRCpnctNGTp3QvdR4nWSnJDqyEFYHyswy2TmCE8T9yk72GwLNlxtcW2AUsooszOPY5flg2J2PGZzjspCNYSeV2Cpi4gaHIOp--pMpagb0X23QYbdLAygpQi7n6k22tBSAAm4goFTbsWClSl0dto_mEXcnZUAYMHv7OE8trn4vND8YvZ74jPj8Ux3vMpv3j3Qfz6SJyD71kZ7fV_se5evlB3e41fL7rPJJKSwz11Md9JXD2v0gV3pRpibuxK9NTKuvEvF2pW9Gm-d6Hfma5QNHoVPO_BhfHerF6h5kfUB6nr59RNGaChGOxDp9x4JXLgXcSu41gpdFK_Qtg3OSCuuFBd5v_N1SHMRvcpvtjLNWXMowtfY5hwHoaeKWa4WZMF5IzonLcoYhmwxE09t-6cRonKr3cZHpp1h1sHzpzDLSzXRoolS_Fcp-FUoOP8tlR65GOFP8QJRkisjUblzhI2DRGf3z8s_vbTnxYPB4nNc9HWdFCi1iZcvI-ApTXOAUJjVBwnN9I3QSv-joXqK0iDyoDr2taSc3Ggi_MfiZomUFCJPJGmDfjEeVSMk5VFqaSuz-HegzDk4NPnRcKWZsXjY7Vf007CdIfv4uylu1VBlk8joIxZnfQliVcdDE7os73mn4tipyiseDabxROM41nwhOsKb7Hk0TjazxkY3LcxneqrsyJcU_jez9z9FO35sEBIh7UlCuY-31SFCbQfBhMz-Nv9_R_L4fDjTeWhQqUcSD2BTSPLJlrJOiFo8lDJmvOCD9GF8n8ekMzjaK9RKXZRH-_zg3Dn8rcf5WyZm_SjEHd66dYwWm1DbITboJ_Ul6FGLXvHcBCfhHG49yw3R2K4H23qWhcf7h-gxTrGvzaw5K5lCaUKAcS5Em6a8_7KrkJiNahrLgt9U-elV5SauNaan6n0Lwy88Q7gLPpabGF0a8vmI-o6vUdPMJrn86tp_sN0fjUK7G_ZfwA"><img src="./examples/two-storey.svg" width="270" alt="Two-storey house" /></a><br/>
<b><a href="examples/two-storey.arch">two-storey</a></b><br/>
<sub>A void over the ground-floor gallery,<br/>and eaves on the storey above.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVnvbtzGEf9-TzGQUFhO7i6ULMmy0rhQbCUxasiArMLoJ3FJDo_bI3evu0vdXYIAeYg-Qx8sT9LMzC6PJ7tB00SfTvwzO39_85vhIVzB8_kJbODZPIMOOl06O2tsh2ANWIPQ4gO28PNP_4LQILx-9-529tc3N6_fz65uXs9evb2-ur26eXUNuFHdqsX55HByCFcQtNlCY3uPoD2_WfS6rbRZwLpBh4AP6LbQ6bbVHQbHjym36LEC-4BuCt6CDullpxdNmBzCqlUGggXf2DXfCI1DhFaZRa8WCLV1Hb2hAiiHoArbB_is1uEzcCo06OieAd-oFV6yqgCVtQ4K5QwA_PzTv8Gu0EA2PwcABS2qWuQ1yiw8OYWO_ebq1TXYmn-vVduCNj6gquiaNqDDSLKubVux5LWuQgPH51kGYW1J9gNGbfkZbYIlkdqBXRtWRJuFiNIdlC0qBwBH6uns5VHxFIBVrHSHxmtrYNW3LZIYEDl8ypubm-tbUbJWJXq2-kOzBSVGs5LKVGBsAAWNNguKgcG_wB1ZhwGctR1F4nh-dgYdmYFzuEqPkosmh-DX2iwovtpAbftWAvfh1Ze7OxQMHcCvEVdy25p2S7ot12rLejcoWUPySb3JoYQgvmNsoFOB4ttKVuZkwHs64uhpDg5D74wH05O91sU8M9bMorpLbSrKrskh5B_u3394c_Pt_buv39_d_u3V3fXrHEplyBP4gAbUatVuyZk68FnkppVyyyEPJPYBStUh1M52cxLrW13FnM3Bo6k8PRPsWrlqeO2Jh1o5QFPBEV3zJKLFOnzBL0JpzQOaoC35IGflc-g9-ik4yjTVWrMYS6OUCU49oPOqhUo7LOntp1NYN7psgMsuFWOrzJKCZvvQzFB5Os8ZdCmpW_1AfubIjyunUOWSC1SesnWAVlUVOin8PBVPTie9vr0i987e3bz9-xxuYuw6VL53WLEZ5JlL9iDVF3qgwia_DOZNDsXLdN5KGWxJcuXU2qSsZanYUtK8YcRYOx0CGrG4wFIRDI3TnV8n85ueX9Cm0j5os-i1b1TRSiz3qoEivlIrQiY6lrWx2oTkMBLJ2e8nhwNCCdSxpyiJFxY9XTMR2chZ4jeuNOUqZwtBQobLMNMGHJbo_TSWJweEUzHA8fwFbMjZVJQikTzXm0rCMzmEU-hOoG7J5rzVJuSAmxWWwZPaIk3sKVXbsvqBjV3b_hfMKshrteY0ir4lp-mOq2JtqRaCpruehSjIBe1ydvPlCOWmgIpyULXiLgbBCHDTySHjX4KIAVe3Y1gdUOQiy6DrBCwVLFTb4lZAlCHqYoCo6Fn2FF-l1KB_8wFNCTBW1gU_hysD1lXaKLflB_KUqB4KDGtEkyCV-hCF3sPW9rB2NuCXkEd5hMFejEVTSYpo6qQRkrWhKvuof0i44okdmgCuN16MpHAPiRTtJSjfCYiJUztrwpCechI9ODlMjxrrQgO-wQieXpQyfVegG3fqELsNt6wpVOj0A1ZTMMi1v11hRVB3p5YI5xIQW8PaumWwqxRFLcocn5wNDySo9wx1CZo4MNvohNrpaoG7vrRnYuyZJUGRDQ2lKEOOorwtcT5hhnBwR_TjO2okB_DDBKA3OnjougnAIeQLpys4y3IpquMsu4xtYsjnASyPqVc3ulwyIaFq2ITeIRGREivI67b3Tc5i1UJRugppUgT61hCEqLaesQiD3sPRfD4_y55CaSXbAk5j7dBRrJkUnzdqxXJ_6T2Mum9u7t4NCTOfAEQzJhDD2q8m_MJsNpvFGH8-0ICVJhyhGPzDakPGCksqAygPPri-ZMNm-38s8PlJlhFDzKhmE_bbPsT08l_C-QU_cUKpoI1ngkCYJloQ1BmEsrUeK5Zo-9Bqg0LyfOw9HjodXPRHxAZ2ohY2l2A9VwGONtPtUykdPkNCID2auGgZoEQTHPIxXIYp2Sh3jIXOcnMAW9ezWILKQG4NUzUV4M8r618yHyBnS6evvhKLcBPQaetgF1jy0Q9wlE2zp3D0PMtGP04uMvqdfrAf4EcJ1phjURMnQjSk4RxuVEdll5oYl-fQxrSHpifQZBcVW8IMFkrdTJkytjHycK2dD8kPR2fPWL2xXet70mJXADvDjsWw-E78IZaMbYgVeklFMuCQioRsDtdUYNKqQ4NbQCNu0JR8um0j45iRH1iodC0lPU0JMnFxa8oXU6IzWEnEH_VIv1KEBHu2EfOCXzMvm55kHKUTjlgm5j2WcY-_JmP0avw99hKXJZnnHxfZb_5jee8MCh2oiFaI-6bgW8QVU2Tq6tYu-eoIZqn_EY1MFG-pQ9mgkQLyausvI5dQ6RbzaHJ_Aj_Xt5g6_pgoDnx7RMkmEMeH6it33ynNUC1VAgBef49ACbUhV0GrCmzh4K3I_ALekzEH8Al198RS5rLYlKMs9vj5I7EfYpkdgPyx2EKFZhQfqqs_KD5UFVIJqViHiWc0Oe1NPTtuyY8xE9OhoZwm9iNtxpXEL5eIK-nRl_BiaMD_7JUL6GaV9uUebRkaqNTjcE6BpmwoSKJj9VV1H6s3wNHJ8yGHZXSlg3aYK2ZwIxf9QJuPQW0OOd_MpR2OSDilLVVsh8qwiWRSXDRI9zXkAbqiA8s1qkO_G8AHYp1mc_Ffrk2e3B1no8-NdZ1qgTrT5WjAYanCggeuHhv_jtXwsBQn6FgJMogEZsBLsNwh9qYfGgf86NHz7E9jXpumGxVkZGv3Q0C-Y0dZAwLMRGLPyPscB0rq5HEYTZvD7uJjXOaBmsn5Ez_ePvDiYTSapmAxwSTX89Ae2StLFQa615NStKTuC2y0pFdHLhpWG49spBPjckTMpAuK-Vg2XpWIobYPozJda1PZ9e8tVIJ3FkQamftIrSnzn2cJoUaZP059JjGJCnltlo9kFVjxdibA0bOdsGjVyX4Z7ckqmCHtRK3vFzyQRtg8Ps3Goh6ptfemv-filjdPnz0q5UdK7L2JgqiQXJFNKffSm-ePztxFRRx4GZdypQqqtbzRi42DO_SI-X46frGU6tpjGOp4YDSxiJjOPvHw6vrm7vY61pO40-OCB6hsWFoyPZZS782UhxBSiriRdKK02-EmZ21YOR7vShu3OnxjsIdHAWPjbCSEC1ehAet2e7bxHqLi1cxaCyupe2c099HYy-4pf4bxYZQYO0vEG0AIQCUvnXRPlg_2AWNj-59kcQJ8WlacwH6DrIs9WaM6TdvD399Or0zZWFobxUGaxTLcywzGUeG5m3NjN70PAaQpihfQ3BNkthpm5L0tV9r-7I9u3nYoyxFH-UPAWGyp91T7YaXVD03T5A_GbtYcgl3NuFcCAKssNOVFlm1eZNmehHXJrn8sobAh2E6EjCScZtnmeZbtML9QXpsd4cDHU2ux_Wj8ZBCvbVwy0Dtx6e0hWKGGQQXkWYKyORENIfe5s3w346WJ8XDAE2uMFJffAccnPfgio01JkCCERnvR-YmPC0bDB11fvb8DpFTkAo2JGNJcOU3c6eMtZupVMRQD1QhqibyJFDsrLFtFOZWTIxlsVLtW2920MVMbWqslTLiMCiP4bVfYFmTbLCMv6DCV1MQyKLNocTh4P0EkPgSu56dn2fTkOEuc9fQs2xC-Dm4acmBUVG2ixwPX_z-LaqSRtCtBfJrip6yTKEWjzIYaTyLSX2MVOfSn8SP2ndj-TrM9E6mVsI07aaZsDv67tIG6krRjEvbsbNCNkGfz7Gwn7UN8-iD58PhiH-akREab6yceGhXKZhprKmbtGgMPo-Np_FyYyXipzMcKlqS19Jub929eXw-lskseOHjLJx7sErKm3QY8kwVZYTdDNUq7QtrlouM6pJ0FBqdLL_tlR11DB5kQhCSn1ZFsaF1vZBOXuEVaHO18Kx6IkTo9P9uL-7ngCgy-TdrDJ7F--A71u2gZy_uOh9eG6n0Pl2kv60H1weaXMk7IB0ECEN-lrwR0v1NBl_Dt11_cgUcZHsQ3tg8zCtPeN8k5XKdd7bvb19e3sNLl0kduV-FAJHiZRNssbnsyjg2fYd5ef3MHcc6wNfeQ2cu4vk2tSdiL32MHEcSGDzYRYmg0aByRXNrJj0g4dMottJEFm2xpeZ-tnNOcVZAH3IRc5px1Y9u4AEtZyrKPL84y-mf4GmPrelgW7r4Wyk6F972kaLFNHm6sYz4_fJekjcc0oy-TJ8MWJNKDc25v9CjLHDZhs5fj_diO4-w_vHskPb__8C4DSTWZav6A8T2XvWJqo5RoT8Z7zN0O0MnihTlhTq7LoWxV_PRtECsmLWkxp7pCL3rppTSUjb64r1E5z7jhrK3lnEtq79B1MRCNrNsV-L7oXaEkW4reLFRr1_Rhu0IRsWjV98x2dGjiFqZmKKBhmYSS44IOLfKGHGDl7D-wDHvLc77BqHZfbOHgypXNW2UW8ToZcXCSnZzPsovZ8Tld_XHy4-Q_"><img src="./examples/tiny-house.svg" width="270" alt="Tiny House" /></a><br/>
<b><a href="examples/tiny-house.arch">tiny-house</a></b><br/>
<sub>Barn and bifold doors on a 7.2 x 3 m<br/>shell, now with eaves — <code>roof overhang</code>.</sub>
</td>
</tr>
</table>

**Also in [`examples/`](examples)** — the whole corpus, by what it is there to show:

- **Showpiece** — [`hillside-villa`](examples/hillside-villa.arch) (the whole language on one sheet).
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
