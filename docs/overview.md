<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../brand/archlang-wordmark.svg" />
  <img src="../brand/archlang-wordmark-black.svg" alt="ArchLang" width="440" />
</picture>

### Floor plans as code — text in, a precise architectural drawing out.

**A deterministic DSL and compiler for floor plans: write (or have an LLM write) `.arch` source and
it compiles to SVG/DXF/PDF with linting and geometric validation — diffable, version-controllable,
reproducible.** Open source (MIT). Zero-dependency, and built so an
**AI agent can verify its own plan without ever looking at an image**.


**[▶ Live Playground](https://playground.archlang.uk)** · **[📖 Docs](https://archlang.uk)** · **[⌨ CLI reference](https://archlang.uk/cli)** · **[📦 npm](https://www.npmjs.com/package/@chanmeng666/archlang)** · **[🧩 VS Code](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)**

</div>

## Use it from your coding agent

```bash
npx skills add ChanMeng666/archlang                      # the ArchLang skills, for any agent that reads skills
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp   # or the MCP server (Claude Code shown)
/plugin marketplace add ChanMeng666/archlang                # or, inside Claude Code: the skills + MCP server as one plugin (plugins/archlang)
/plugin install archlang@archlang
```

Claude Desktop: each [GitHub Release](https://github.com/ChanMeng666/archlang/releases) carries the MCP server as a one-click `.mcpb` extension (`archlang-mcp-<version>.mcpb`), built by `npm run build:mcpb`.

Then ask in plain language; the agent writes the `.arch`, compiles it, and checks it with `lint` and `describe`:

- *"Design a one-bedroom flat of about 54 m²: a 32 m² living/kitchen, a 10 m² bedroom and a 10 m² bathroom, with the front door on the north wall."*
- *"Draw a two-storey, two-bedroom house, 8 m × 6 m, with a stair linking the floors, and give me one SVG per storey."*
- *"Export that plan as DXF."*

See [floor plans agents wrote from one-paragraph briefs](https://archlang.uk/gallery), each with its brief and source.

<!-- AGENT-FIRST NOTICE -->
> [!IMPORTANT]
> ### 🤖 Read this with your AI agent — don't read it by hand.
> This repo is written agent-first. Point Claude Code, GitHub Copilot, Cursor, or any agent at it:
> *"Read the README and AGENTS.md, then help me run / extend this."*
> Structure + [`AGENTS.md`](../AGENTS.md) are optimized for agent comprehension.
<!-- /AGENT-FIRST NOTICE -->

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

  furniture fridge       against wall w_west offset 3600 in r_live
  furniture stove        against wall w_west offset 1200 in r_live
  furniture kitchen_sink against wall w_west offset 2000 in r_live
  furniture counter      against wall w_west offset 400  in r_live
  furniture table  in r_live centered size 1300x900 label "Table"
  furniture sofa   in r_live anchor bottom-left flush inset 250 size 900x2000  label "Sofa"
  furniture bed    in r_bed  anchor bottom-right flush inset 250 size 1500x2000 label "Bed"
  furniture robe   in r_bed  anchor top-left     flush inset 200 size 1800x600  label "Wardrobe"
  furniture shower in r_bath anchor top-right    flush size 900x900
  furniture wc     against r_bath.bottom offset 750 size 400x700
  furniture basin  in r_bath anchor bottom-right flush size 600x450

  title { project "Laneway House" drawn_by "ArchLang" date "2026-08-16" }
}
```

<div align="center">

<a href="https://playground.archlang.uk/#z=jVZLbhtHEN3PKR7IjQ1QdIsS9UlsA05iIIAFJ3BsGFlpiuwip6NhN9Hd1FAxBHiVAwQ5Qw6QI-QoPklQ3TP8SLYcroY9Va_eq990Hy_gLB9MWHvnFqjJckM3mLoYac749PEvHJ9j8e8_iBVFeCYdQEGcsPRu7mkxLPpFH69drIydo2LPMAFLF0w0zrLG5AYVWT3Ey2v2N3BLtmIpRsaKQXQg-JWFNiGSnTKodnYOKvqwtGCNhuoaj0pn8VQen4Mini5deF4-HoAT7Mys48ozPAdXX3MAzcnYEAVapDkPSjhFH49KY_FUjp-D7LRyHp8-_l0OUHZOKaCcPR6ArEasGBOK1ZMuU0syXiTUZDTcKmJyU_RRhujNshyiDCYyPiBEzxxhnY8VbsskJyS02DjMaEq6_b-sySKuvJXkfpOOtHO-6ItVayPlGaSneU0h7LyZk9dsh0VC6V20ZfzRrQL38KEAVtbEgMWiAObeaIwVdn59LMnHVLAA8oxDpRArM70aIEh1ylm9ClW5yXJNVgtRkGRprAq0GlfLAtBmEUArqWtdF8Bnk1EUyGk2-llzKdIA8DqyN84jR7ccAkZK4QMeqYF6jEenY5Uebve8mUJ82Lvzyw8nY3UPI6fwYQbZ78sYDX-NRybxee9KnrAtxY73YfY-HrUq0sPnMKRJ_wfGaEfIqIUpkCfF6Gf-sjbXLFOWCQfzO0Mc1xITNU24Ru_CXMsgP8ErE6cV2x5WgQPqfHyVD6X8MhTQrrEJsRMxpyUUGqNjhaMjIVdIL245JC0p9Ggn6ncUq54YpmBic9eNNVrGasctD27LsR3jAlm3TJo468uZdzZCOrvtSYoYSeYyz3OlIHuOYZk8QiQfEZq0z2x0yInbQ2z7KtRGi1lCbs8E-3SDfXimVDJj1DyLeyBJU0srtQlFjE82rmcbWuK5T2jCupAJL7NnKVurofqKddonn_74M7NJk17m-N7Mq1gisEx52k5kuc4llL_B1SZv5QQ94do16cVvtJh826EIlxKNW9UaZBYwMdFWCotF3qrSF-X7y59_-v7Vy7eXb969Lof7sttudtMrjvvqz_fE79BOe8VY7Zrs0M6k5Pp4m-uRUnfstjWRknR26gG78dl4g3dyz67dSRRxON7EFbMCmK28NWmRzrzRc27X8N7Xp2XuZrPAEUdSbGO3DbaFCNFddwgPQYjmL0C0s3oZjL16CGKkvggxdSsb2X-VhdRgD6KPtxXDr9KNgCzevf7h5ZuLF78OoD01FhOeOc-5Cw3nDx5FGT2rJdMmSuPmrpyR9FUCjTSpWb48uDbBTOobsY1uCU-xYi8gFlWeSRPTTSdfBfKFRPBkQwxQm6tMM90z8i2H68DpqjOAlWMQps55bSxFHu7lRYTtCO7uGxMXo1scpHE1tktMXnZnSq2PjlNDbXGynh2gKUu-WWenwyOl1ufbdfdWzHv7fSLp-QqV9JlvCY3GLaFzpdap8h34L25G-9jtfurqnrbOMI1jS2_cYWzX8T6CdxPu2CW0ll10y0xNfnv0unzJ3lyf7NB7T14L3B35lWvYtwFkr-wEyEw3ATaqz-8UoZnijkyK1TAnsGvw0y5tx0qtT-8ATCgYi_sk2hpkHjskTpRaH4_Tzogm1nKLWnr3G0_jvVtempbLyQ16L_y0uiA770FTZPRGanRyoM4ODk96uC1ui_8A">
<img src="../examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `archlang compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jVZLbhtHEN3PKR7IjQ1QdIsS9UlsA05iIIAFJ3BsGFlpiuwip6NhN9Hd1FAxBHiVAwQ5Qw6QI-QoPklQ3TP8SLYcroY9Va_eq990Hy_gLB9MWHvnFqjJckM3mLoYac749PEvHJ9j8e8_iBVFeCYdQEGcsPRu7mkxLPpFH69drIydo2LPMAFLF0w0zrLG5AYVWT3Ey2v2N3BLtmIpRsaKQXQg-JWFNiGSnTKodnYOKvqwtGCNhuoaj0pn8VQen4Mini5deF4-HoAT7Mys48ozPAdXX3MAzcnYEAVapDkPSjhFH49KY_FUjp-D7LRyHp8-_l0OUHZOKaCcPR6ArEasGBOK1ZMuU0syXiTUZDTcKmJyU_RRhujNshyiDCYyPiBEzxxhnY8VbsskJyS02DjMaEq6_b-sySKuvJXkfpOOtHO-6ItVayPlGaSneU0h7LyZk9dsh0VC6V20ZfzRrQL38KEAVtbEgMWiAObeaIwVdn59LMnHVLAA8oxDpRArM70aIEh1ylm9ClW5yXJNVgtRkGRprAq0GlfLAtBmEUArqWtdF8Bnk1EUyGk2-llzKdIA8DqyN84jR7ccAkZK4QMeqYF6jEenY5Uebve8mUJ82Lvzyw8nY3UPI6fwYQbZ78sYDX-NRybxee9KnrAtxY73YfY-HrUq0sPnMKRJ_wfGaEfIqIUpkCfF6Gf-sjbXLFOWCQfzO0Mc1xITNU24Ru_CXMsgP8ErE6cV2x5WgQPqfHyVD6X8MhTQrrEJsRMxpyUUGqNjhaMjIVdIL245JC0p9Ggn6ncUq54YpmBic9eNNVrGasctD27LsR3jAlm3TJo468uZdzZCOrvtSYoYSeYyz3OlIHuOYZk8QiQfEZq0z2x0yInbQ2z7KtRGi1lCbs8E-3SDfXimVDJj1DyLeyBJU0srtQlFjE82rmcbWuK5T2jCupAJL7NnKVurofqKddonn_74M7NJk17m-N7Mq1gisEx52k5kuc4llL_B1SZv5QQ94do16cVvtJh826EIlxKNW9UaZBYwMdFWCotF3qrSF-X7y59_-v7Vy7eXb969Lof7sttudtMrjvvqz_fE79BOe8VY7Zrs0M6k5Pp4m-uRUnfstjWRknR26gG78dl4g3dyz67dSRRxON7EFbMCmK28NWmRzrzRc27X8N7Xp2XuZrPAEUdSbGO3DbaFCNFddwgPQYjmL0C0s3oZjL16CGKkvggxdSsb2X-VhdRgD6KPtxXDr9KNgCzevf7h5ZuLF78OoD01FhOeOc-5Cw3nDx5FGT2rJdMmSuPmrpyR9FUCjTSpWb48uDbBTOobsY1uCU-xYi8gFlWeSRPTTSdfBfKFRPBkQwxQm6tMM90z8i2H68DpqjOAlWMQps55bSxFHu7lRYTtCO7uGxMXo1scpHE1tktMXnZnSq2PjlNDbXGynh2gKUu-WWenwyOl1ufbdfdWzHv7fSLp-QqV9JlvCY3GLaFzpdap8h34L25G-9jtfurqnrbOMI1jS2_cYWzX8T6CdxPu2CW0ll10y0xNfnv0unzJ3lyf7NB7T14L3B35lWvYtwFkr-wEyEw3ATaqz-8UoZnijkyK1TAnsGvw0y5tx0qtT-8ATCgYi_sk2hpkHjskTpRaH4_Tzogm1nKLWnr3G0_jvVtempbLyQ16L_y0uiA770FTZPRGanRyoM4ODk96uC1ui_8A)** — it opens the
live playground with **this exact plan already loaded**. Change a number and watch it redraw;
the compiler runs in your browser, nothing is sent to a server.

</div>

> **Why a link and not a live embed?** ArchLang *does* ship an embeddable viewer — but
> **GitHub's markdown sanitizer strips `<iframe>`** (it comes back as escaped text, exactly like
> `<script>`), so no README on GitHub can host one. The embed works everywhere GitHub isn't:
> see [Embed a plan anywhere](#embed-a-plan-anywhere). Source:
> [`examples/laneway-house.arch`](../examples/laneway-house.arch).

## 🌟 Introduction

**ArchLang** is a small declarative language for floor plans. You *declare* a plan — walls, rooms,
doors, windows, furniture — and the compiler renders a clean, professional **SVG** (also DXF, PDF,
PNG, and a zero-dependency ASCII plan). It works the way Typst and LaTeX work for documents: the
source is the thing you keep, and the drawing is what the compiler makes of it.

Coordinates are integer **millimetres**, so output is **deterministic**: the same source always
produces byte-identical bytes, and changing one number changes exactly one thing. *"Make the bedroom
1 m wider"* is a one-number diff — not a re-roll of a raster image that silently redraws the kitchen
too.

The compiler is **pure TypeScript with zero runtime dependencies** and is isomorphic — the same code
runs in Node and in the browser, which is why the [playground](https://playground.archlang.uk)
is fully client-side.

> [ArchCanvas](https://github.com/archcanvas/archcanvas) is a hosted app built on ArchLang; ArchLang
> stands alone and is useful in any app or script.

## 💡 Why it is different

Most "AI floor plan" tools generate a **picture**. A picture cannot be checked, diffed, or reasoned
about — and neither the model nor you can tell whether the bathroom is actually reachable.

ArchLang generates a **program**, and then lets you interrogate it as **facts**:

| | Raster image generation | **ArchLang** |
|---|---|---|
| Output | pixels | a `.arch` program → SVG / DXF / PDF / PNG / TXT |
| Edit "widen the bedroom" | re-roll the whole image | change one number |
| Same input twice | different image | **byte-identical** output |
| "Is the bath reachable?" | look at it and guess | `archlang describe --json` → access graph |
| "Does it match the brief?" | eyeball it | `archlang validate --intent` → exit code |
| Wrong syntax | — | **errors returned as data, each carrying its own `fix`** |

That last row is the whole design: **`compile()` never throws.** It *returns* `diagnostics` with byte
spans and a machine-applicable fix, which is what makes a tight self-correction loop possible.

## 🤖 The agent loop

An agent can author a plan, correct itself, and **confirm the plan matches the brief without
rendering an image at all** — which is what makes ArchLang cheap to drive from a text-only model.

```mermaid
flowchart TD
    B([Brief]) --> S["<b>archlang context</b> — the whole language, one call"]
    S --> W["Write <b>.arch</b>"]
    W --> C{"<b>archlang compile --json</b>"}
    C -->|"ok: false"| F["<b>archlang fix</b><br/><i>each diagnostic carries its own fix</i>"]
    F --> C
    C -->|"ok: true"| D["<b>archlang describe --json</b><br/><i>rooms · areas · adjacency · access graph</i>"]
    D --> V{"<b>archlang validate --intent</b><br/><i>does it meet the brief?</i>"}
    V -->|"no"| G["<b>archlang suggest</b><br/><i>candidate door / window statements</i>"]
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

**Cold start in one command.** `archlang context` prints the entire agent context — language spec,
workflow skill, CLI reference and every diagnostic code — as one system-prompt-ready document (the
same [`llms-full.txt`](https://archlang.uk/llms-full.txt) the docs site serves). After
`npm i -g @chanmeng666/archlang` the command is `archlang <cmd>`; never a bare `arch`, which is the
coreutils command on Linux, macOS and Git Bash.

```bash
npx -y @chanmeng666/archlang context                       # EVERYTHING: spec + skill + CLI + error catalog
npx -y @chanmeng666/archlang context --section errors      # …or one section of it (about 160 KB in all; the catalog alone is about 67 KB)
npx -y @chanmeng666/archlang context --level starter       # one screen for a small model: the lead example, the loop, the commonest errors
npx -y @chanmeng666/archlang spec                          # just the language, one page
npx -y @chanmeng666/archlang help describe                 # one command, with worked examples
npx -y @chanmeng666/archlang compile plan.arch --json      # render → { ok, diagnostics, summary }
npx -y @chanmeng666/archlang fix plan.arch --dry-run       # the exact unified diff it would write, applying nothing
npx -y @chanmeng666/archlang describe plan.arch --json     # VERIFY, without an image
npx -y @chanmeng666/archlang validate plan.arch --strict   # the ship gate
```

Every command takes `--json` (result on stdout, messages on stderr) with deterministic exit codes
(`0` ok · `2` user-source error · `1` IO · `3` usage) — and a typo *earns* that `3`: `archlang lint
--jsn` exits 3 with `did you mean --json?` rather than quietly reading `--jsn` as a filename, and
`archlang comple` suggests `compile`.

**One manifest, no drift.** The per-command help (`archlang <cmd> --help`), the flag parser, and the
generated **[CLI reference](https://archlang.uk/cli)** are all rendered from the same
manifest — which is why they cannot advertise a flag a command doesn't take. `archlang manifest --json`
is that manifest as data, and `archlang <cmd> --help` is the cheap way to read one row of it.

Reads are bounded, so a big plan can't flood a context window: `describe --select`/`--room`,
`lint|validate --code`/`--severity`, `context --section`. Filtering what you *read* never changes
what *gates* — the exit code always weighs every diagnostic. And because `archlang fix` rewrites your
source, it prints the unified diff first and takes `--backup`.

See [`skills/archlang/SKILL.md`](../skills/archlang/SKILL.md).

<details>
<summary><b>Machine-native artifacts</b> — Plan JSON, a GBNF grammar, an intent schema, and an optional MCP server</summary>

<br/>

| Artifact | Use |
|---|---|
| [`/plan.schema.json`](https://archlang.uk/plan.schema.json) | Emit structured JSON, compile it with `archlang compile --from-json` |
| [`/archlang.gbnf`](https://archlang.uk/archlang.gbnf) | Constrain a local model to parseable output |
| [`/intent.schema.json`](https://archlang.uk/intent.schema.json) | Write the brief down as a contract; gate on it with `validate --intent` |
| [`/llms-full.txt`](https://archlang.uk/llms-full.txt) | The whole context bundle (`archlang context`) |

**MCP server (optional).** [`@chanmeng666/archlang-mcp`](../packages/mcp) is a stdio Model Context
Protocol shim over the library, listed on the official registry as `io.github.ChanMeng666/archlang-mcp`:

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

Prefer the **CLI** when your agent has a shell — a CLI costs nothing in the context window until it
is called, whereas an MCP tool schema sits there permanently. The server exists so MCP-native hosts
can *discover* ArchLang. The core stays zero-dependency; the SDK lives only in that package
([ADR 0012](../docs/adr/0012-mcp-shim-discoverability.md)).

**In CI:** [`.github/actions/arch-render`](../.github/actions/arch-render) renders every ` ```arch `
fence in your Markdown to images in one step.

</details>

## ✨ Features

<details open>
<summary><b>It draws like an architect, not like a plotter</b></summary>

<br/>

Poché-hatched walls (by material), door **swing arcs**, window glazing, computed room areas,
dimension lines, layers, line weights, a north arrow, a scale bar and a title block. **Real drawn
symbols for every catalogued furniture kind** — 202 words across 119 families, the bathroom and
kitchen fixtures, the room furniture and the garden beside them, each with the detail that makes it
readable at plan scale (see [Furniture & Fixtures](../docs/furniture.md), or the
[`furnished-flat`](../examples/furnished-flat.arch) and
[`garden-house`](../examples/garden-house.arch) examples) — plus the two **drawing-only**
annotations a plan needs above and below the cut: `roof overhang 600` puts a dashed eaves line
around the building (an exact mitred offset of the wall ring, at any angle), and `void` puts a stair
well or an atrium on the floor plate. And `dims auto` synthesizes the dimension strings for you.

</details>

<details>
<summary><b>It checks architectural soundness, not just syntax</b></summary>

<br/>

`archlang lint` encodes tacit professional knowledge: a bathroom reachable only *through* a bedroom, a
wet room that isn't fully walled in, a door whose swing hits furniture or another door, a windowless
bedroom, an unenterable room, a too-narrow door, a bath/kitchen with no fixtures, and a room whose use
was merely *inferred* from an indirect label (`W_ALIAS_MATCH` — with a fix that pins the explicit
`uses`). All tunable via the ruleset.

</details>

<details>
<summary><b>It models how a person actually walks the plan</b></summary>

<br/>

`archlang describe` runs a clearance-eroded nav grid: per-room walk distance, the **narrowest pinch on
the way in**, and how circuitous the route is — with advisory lint for a too-tight
(`W_PATH_TOO_NARROW`) or roundabout (`W_CIRCUITOUS_PATH`) walk, and an opt-in
`archlang compile --overlay circulation` that draws the routes on top of the plan.

**Facts and advice — never an invisible auto-arranger** ([ADR 0005](../docs/adr/0005-no-invisible-architect.md)).
`archlang repair` is the one *explicit* corrector: it pushes furniture out of walls, doorways and swing
arcs, and emits a change log you review. `archlang finish` is the explicit completion step: it
furnishes the rooms that hold no furniture
([ADR 0025](../docs/adr/0025-furnish-as-explicit-transform.md)), then adds the `paper`, `scale`,
`dims auto`, `title`, `schedule rooms` and `legend` a plan lacks
([ADR 0024](../docs/adr/0024-finish-as-explicit-transform.md)). It deletes nothing.

</details>

<details>
<summary><b>Errors are data, and many carry a machine-applicable fix</b></summary>

<br/>

`compile()` **never throws** on bad source — it *returns* `diagnostics` with byte spans, a catalogued
`E_*`/`W_*` code, and a `fix`. Where the edit is mechanical, the diagnostic also carries applicable
`fixes` that `archlang fix` applies for you. `--error-svg` even turns a plan that *won't* compile into a
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
<summary><b>It counts quantities, remodels and hands over a plan</b></summary>

<br/>

Each of these is a short section, with an example, on [What is new in 1.44 to 1.59](https://archlang.uk/whats-new).

- **Quantities.** `archlang takeoff plan.arch --format csv --waste 10` (or `describe --facts quantities`) prints wall lengths, room perimeters, net floor area and door and window counts, each figure named for its convention. [More](https://archlang.uk/whats-new#quantities-and-takeoff).
- **Locks.** `archlang impact new.arch --against old.arch --lock shell,front` exits 2 with `E_LOCKED_ELEMENT_CHANGED` when a locked element moved, resized or vanished. [More](https://archlang.uk/whats-new#locked-elements).
- **Remodels.** `wall … status existing|demolish|new`: a demolished wall is drawn dashed, with no poché, and counts in no area. [More](https://archlang.uk/whats-new#wall-status).
- **Feet and inches.** `12ft6in`, `12ft`, `6in` and `12ftx10ft` are lengths; the quote forms are refused with `E_IMPERIAL_FORM`. [More](https://archlang.uk/whats-new#imperial-lengths).
- **Review sheet.** `archlang preview plan.arch --review -o review.png` rings every warning on the plan, numbered, with close-ups. [More](https://archlang.uk/whats-new#review-sheet).
- **Walking routes.** `archlang compile plan.arch --overlay circulation` draws them, and the narrowest point, on the plan. [More](https://archlang.uk/whats-new#circulation-overlay).
- **Stacked storeys.** `keep stacked core on levels 1 2`, with `W_STAIR_UNMATCHED` and `W_SHAFT_FOOTPRINT_MISMATCH` beside it. [More](https://archlang.uk/whats-new#stacked-storeys).
- **Winders.** A quarter-turn landing of a block `stair` may end `winders 4`: tapered steps fanning from its inner corner. [More](https://archlang.uk/whats-new#winders).
- **Lint sources.** `archlang lint --rules` prints every threshold with its value, units and the document it comes from, and `--theme rendered` draws any plan in a named theme. [More](https://archlang.uk/whats-new#lint-rules-and-their-sources).

</details>

<details>
<summary><b>Five output formats · accessible SVG · IDE-grade tooling</b></summary>

<br/>

**SVG**, **DXF** and a **TXT** ASCII plan with zero dependencies; **PDF** (vector, selectable text)
and **PNG** (deterministic raster) via optional, lazily-loaded add-ons the default install never
pulls. `archlang compile --accessible` stamps the SVG with `<title>`/`<desc>` + `role="img"`
(`--acc-id-prefix` renames those ids, so several plans can share one page). Add the
library's `annotate` beside it — `compile(src, { annotate: true, accessible: true })`, an
option the CLI does not expose — and every room, opening and fixture becomes a named,
focusable control (`data-arch-primary`, `role="button"`, `aria-label`). What the embedder
still owns — the roving tab stop, selection state, and taking the controls back off for a
read-only render — is in
[the language reference](../docs/language-reference.md#keyboard-and-screen-reader-operability-annotate--accessible),
with the known screen-reader limitations beside it.

A full **LSP** (hover, completion, go-to-definition, rename, signature help), an `archlang fmt`
formatter, an `archlang explain <CODE>` catalog, a self-documenting CLI (`archlang <cmd> --help`, rendered
from the manifest, worked examples included), and a
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang).

</details>

## 🚀 Quick start

```bash
npx -y @chanmeng666/archlang new -o plan.arch          # scaffold a starter plan
npx -y @chanmeng666/archlang compile plan.arch -o plan.svg
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

Every one of these is a real, compiled example from [`examples/`](../examples) — and every drawing on
this page is **generated from its source by `npm run gen:example-svgs`**, so a picture here can
never drift from the compiler that made it. Click a drawing to open it in the playground, or the
name for the source.

**The showpiece** — the whole language on one sheet: `site` orientation, a polygon reading
nook, a bowed arc bay, all five door kinds, a shared stair shaft, a
void over the double-height living room, a roof overhang, and a mirrored pair of ensuite bathrooms
composed from one `component`. Every room is reachable, every doorway clears, and
`archlang validate` reports no warnings.

<div align="center">

<a href="https://playground.archlang.uk/#z=vVxrciM3kv6vU2RIP0xtk1KREvWy2xE9bk13x_TYDnd7vBETEyywCmRhVCxwAJQo2eGNOcSeYa-w__coc5KNzATqxSIlj9vWj24-gK8SiUS-wSP4mEn48PabH759d_vVLSxysbSZWsO__vnfIMBt9Mg6beQjZCrPrUol3Ks8F7BRLgNRgHBOJJlMYSmMWMohuEzCOsdvDo5goYx1I6dWOM0qpw04TUNyUSxLsZRgM13mKVgpT-D2XppHl6liCTK3ElQB8kGs1rm0p6As6EIeHAEPSHUhYSPz_HP8gL7DIYi9yXTeeIIu6EubSelO4ENpFiKRFpQD-SBNoqy0NwdHEFvlZAyDhbqXkEqj7mUKiV6thbVQiJW0x_B__wvxWqyliV_ENhG5jF_E4kFaepvJtKRPcrmURRrDQICRIj844md7noFTLpcwz3Vyx4g_6gIfnKt7VSxPrTT3KpGnNpdyjSvdqGJph2B0nssUyjWyxWXIifBMsOXcaSdyT6LRegVrnT8udUFkJJlYLaSRKRRa34FeLIhR1pXpI08RJolhI_IcZLpE7IGAud7IFObisZrAJALi0zQc_-Hdf0KqtYE7VaQWBYf2SAIx0mXCQSbwlYa5JEamMLC5SnGxa53cSXc6Vwudp6dzYYpTFqTjIazzkvczxg2XaXxwBKlciDJ3uKf4jZHWDUGKJINNJo0EAfNS5ak0sCGxEokrRZ4_wrp0oNwJiXuM5MaQq0JalL8NSeq9HMJcJqK09RNRogp5j3BGOSeLz4lTGaTSJkbNJYxGf7fIZCPX2jimFxkBujg4Apz6yNxBJm9UkeoNEv8FsvpLEA6-WGv7ZcyLFRAviDKt17gB1hkp3WghEuK6ms9Rlhe487hzwHh-03N5L3MYx6f-1SSmj60TysQwsGIlQaUw1y4DGmGH_lyIhWOIe62IywMBqS7nuRxlUi0zB0uxBo1s6BMCFLcFfZ2JYhnDAAdJcS_tEFIjNkXYrXK9loaIR43Cc_GA6UIWLoYXEK9zkUj41z__B1bKGG3ggcSX38gU1kIZ0AuQhS2VkzAXLkM6mAX_dRbhTpamUK40EhZipXIlLYjEaGvhTrkkk8WpP2hzmeLcU-KlF7tTJ41BGpC2VK0siNJplHPkC0vkRsNKFKXIAQecHBwdHJFYrXPtYGF04cWAdy8s_utvvvv4dujPLhTauEyaAjK5UnZNsosq12qI5yK5i0EUKSol-Y9SOG1mqHpjEEbS9A-v_nwLpI0HVpcuOx7CJlNJhvK6yR6728RaWZiEDjMjkxx4Flhw4o6RCQ4WIhGpHOJQ-tQzx6smmDOEdSK5syByXSwbKz4JqhQ330KhSWF_jgpXF_kj61JIlZGJU7qwJwdkLw7fBgvzF7Qwh_DTAUBZKGdhtToAWBqVwjiKDgBIBcOrMer41CZiLQ8ASB_D-GaKI4i_UK4PAFq7SOO80qSVHwCwuj7Ar1CmfgobxxiNDeIPfsaRR_CqlspvX737rlcqh_jcjMboIpEnQcD9wMExCAtfID9QFRDs4GH4eAx_DeL_txhUYZ0onBKOjZawZHfT1EhrxRxNiX6AAfJJbwrW4S9ocfACXGakJOCNdLBQD3gw7PHnbKaFkYWDpHSWdShR9RnjkNKaPwKqAudkCkaiBSkSNMtsxAmXyUtwGj16EMticoIv4yHEspit-M0xyTdJCWoiOvdWoQBAogtnRIJLI8i4Mvqr0spyNSILeIKKNz6BrzXTpqzXLu--_vDu9S1BV9oET926NGtt5Q0fDUL28k6iuJaF5aV4t4HZ8ZmFVCbKKl0M0ftIXP4IufLHAyn5zEKGK0UqTg6g8dB6X1F2gRmi0pf0_1oYx-t1mUruCmktijP8BINoGB3DYHwVNV5MLiJ8HV4kubYSfiZYXkL6kv4Xzs-36kcJOPUBZ0Au5jKHw1sm6RBKKy1JJkEcQawKKx2Mp1E8xDMK8SIvbRYPg8JCPUdKqxKbG2_PSIhXuOA5KQCy8eQ2MLRGpgr4-PbdV3-6_Q4ybV2QDZvJPI_hLIpgtYKFNiCLyRDizSyfzFCtxDCpvyNpQfLtsYc2ZVGgVmvoHJQmNOV4MMgTrPbDS_KYAYkClEG_UPTNUuvlGLELKYw0qPskKb5E57lKpWW_jTwaYdBksheBjoM0sNTSgtPr0Xfv3rz9eNM6SB44SB2JLamswOP3t3_8SJyDQSwcXE6jKIa5zPXmmJWvCI9BaxEIZdcmRxOLklxosJug6pm2H75CXWYZihUvPe_21YePxIhh4Ap6dgM8pRW1tEV8JlRyJ83xCX1Rm1VPkSpYEEWRZOTXr0eGnAWASrRYKK-j6OGaFHcTZi6sKqAPJpcLROnCXETRw3QLZpPgezoGtH6mYYQPHTJHnF7DCxifR-GQXEbRw3kUgdFOOCQvEHEAQbu__C3-CPn97V9u38OYJFEWzjyyM3ZTBVDkjgy9-T5NFcr7qXddhuD9k9-USO9JwuEbo8sihUWutTn0Ou0IRqPRyEvJ6BP9eeRvCsmKLgWDAh10wEqoAu51Xq7kMERRdXCSS1eZJO-_DJbCpLIIWoOO_lxmyrszDdfIB7pJaTDcQxfp9vWbW9aIAqxcC4MywiFVokySy3hYw97JFF2-FQzOz6NoOI4mKGVOw2B8Ub8nkuNkE6N_pxzMy3wpLXzz_ccfXn33-qRlK5ix8sFJo2j5wVagzuQtgMpinLHJCJ_ye35o-KxBl_8IF9kiz4hUlRYVbwTJpn5EaxbtC72mI4Lr_1h7hqVTuXIUkSxv2Osg_9Syy0feyUKX6D-Ri-dNLm0srZh1dWCstI708BAZ5h3I2uC7jUrkcZttmxk-elbUnOuyDgaj6dRbWPr35z6AzfMA-JXnXy-QfRrITx_sBEKuAvR6DpMm0EXAufAwno9_xGBkhGa1xrAw8P4tbsQWF_VioRI5kzse6x2W88jzgV6c9xK_1ptUmtlmP9JVQKIXk31IT9A0jgIUv-rH4vjsPpnZJ6liAH-o-tFIgc_sfQLPRbtqMqy5TafoS1FkBXatinbwlcqiu43djcvH5D_NNvvEJTy6TUY_kNwH1JjvGbQDTN3PUjTz-8DO6_n8esdxSFUxu1PuGQLVXOXVTiy0pfDkKq8aWDsIu1POg_Wd-R4wZtlVWwzIrvq4cWl0uZYp2zUKfzAW85nCX2pYf6Q0j4_dDz_4F4h6WFmUKqaYsUZnj6pSeADsOuH7B9QyIb54Q6MPgeMLnrsFGaxDDcmKqoZEPRIgv-fRPmTxc7cwWSkwmUGJVGSiKXuYNMj8lkYHMjfJNpwgX4zgKk0S4M6uunA0OsBhPiss2-8msdy7GYfv-f82w9l8krN3A5goTpwolrlkZwHt5YdbSLQppGmkbxWHVhi6ICRmc1FRVJivvn7z_vY1r-teiW4qmJydgsNa9OMlpSOEkWLolyYcB9Ko2bRKT7YYxQYiQPqvK4-kbRjOyOcenE3qI-lfVPM8Qz8gH_yO8xO2HszOMu_QeWeD8P3D-aQZ9vL-hD8CZoSM00BtcL9VPppmWitw3P2LhoDyfh62wRlhC5j9d091redYrCYd4Nc0uAPMCFvAPiKo5b8BPL3qHKk_8eDDFrBH2EIOKdAK-aqDPGkgf-TBh5UE_oHdbD5wp3xQhiiwVCUiX5k2h8VT1yY0Rr9RKkNhMqbd0R8PYVlILJBwagyGffpTcFRNKQccO8pR5VLE4jP3snDSsLspkgS_XRqxzo63RTuoyGrhkz0LD2r0rchzL7iUFcIYocwFGpS2t0zqndZ2Q3l3qhKsaSGupPHw78VNnA1LX6bs3FTSg8u48Adlo1KXwRhPCJktjjKoygEUbnMGgdSLP2odbH_uG9h0CJElAf46oDfcyF2PaBzyI_i40ZAIY8ndr2oPDGo5Syw43-YPESWn5uIRlQVMSMtwtiTFsh3nESmQQBkRtpHDBl26UIP06erOQoP94z__jizX5LLJTCQkLJdjj16gmeItYc1yedHDLt6MFnuaVm8L0YcFXDTDQ-EjBeFgcjmNwmZPo6gC7QB5-Jl8cJ40XlwVr3a200c0vJmcYWFkXboOdLDL_Mf1Paax4XoLh-5aoBQZiQVBD90F9JaZ_7BE2Ad3dl3BXe9eNzpqiTaePIKp3V1kX41CZ2V7wX5_mrqzhq8d1Ao-fITg9Ypp8c8EDOq44epc9-9S5dPuOnR18qjLlPohvjLL1FeOLXK4Jh9PnN8xfEgHjy3hjMOWQHRbtHjz9ygilCuCxTQ9rSB9qatogjfOv2lzFqncnljHaTS1ftsWREyK7JrsDXlLZjY4n7zhmi8tde8LtDdcrA7123b1FvMarcLvE-oek2IKM5bRyclZ5U7WpWXmKLL9MorgBSj4DxiPa95f-jX6IGZ73nh81TpLnb8j4BO5c_p11D5EW_OD6zKQwlcGjneBTaLz9qH5VWANEcZ08DZYOAbPABtfRvu4BEfovBuVos3qR6vsc_toXLWPRgXHAjj0Gc5N8GJ7SDs7v25ZgZZI1pnzT5i6rUFTae-6HsgQbcux96bxjD2gZGLOvekG1BjeeUgyrPYjBm7cEHXzcV0JwBpXJ4PfjzbX-g5ZswgUYTRy1qXorENRB8SUS9ha1nRcg5xRxFmhNKKBRuFEL8Qsb6KgzZ1e1CioQB7IcO9GSfRiIeXMUemX41Vkz2Xtq-JBwUoJ7EERZsX8rWihKG16OQ0ovmpTMXlyuY8qLOG3XU8k6vy8Xlu1aXtAlCg0dFGi4dVlvTaEIbXyLLLc_QxbCEAsBRaqg6WsDMligSUm0gtNkK5Q09HzLEeqcM-GF1cVVZRvGFcoPmTb2rgSQ5FqdU2SvAsol1RWHQfCzsmXqfb0Ijyg6S3UD_Cfzqwq7p75AAxr9kFap-9lY0eeAXl5vh8yVTbbCJt5TjwH8uKJhS-MSmuXfWuzKw8vcPVyPxz1Kc0SMVeFdM-Am-6HUxZrvi2pvqazVlckqWx_vR9mLox1WucNmCsscl5MK5hzX9j8hTDX008CM47G_TgtmG75liWhw2NfignbXwlpMyxqSJR5pEzgPoxaKgNGbx05YIT84gn5pB6DvfawsssdFW16iI-Cemrj1HzQLmizy1m64EIvZxzG0r8b0cybjs6iduL0rJk-wvGHW2pHsBEdUeR82Za58-pkNVK3PXPJAj81t6s7ymKW67JYSga5rlW5R7luugLN4GQ3yBh1f8sg9IJwSKJWVd4epXL0ZVUhJSEN4hVF4DASDsksmJ5cwQNMTiJYHdZIOO-KYc4Y9KqBchY2khouqZLrgv8ypvzcWW0ukGYU6lQZblL7ndoOJtxkGDqLfecBV2It2iZuYPOdJzLRWI2ij3zqzQd1mHsbgiBkDmb8FFemSofBjTpj6GZZijzHFqKqmbTdZ9oozP8OHQ4TOPweVf3v0OBQtTh8rUNKiXtzqGNpobVbG0wUIZcKzW2ac039PVgdWOdYKA-tEaFUMOR2gpDs6vbh-uYfjC6twn46WClHvYgssVRoCMV13wCBaQK5KK38JU0J3XaEdiNCo74dmtiafG4Upj8lp-viHMnn_nJv1W3HKc2L_kpmga7VPphpo2_v6ikk-Quq4r0wfNZm9hml54tmIbufJu6-e1bteF-915_v_cXj59Z7ufXv6fWxI763QkvNsvt3bzyunXq_Rn7TLOlVqvPwQ_N6Rl8dlfVi3Z_ZqlU1WzR97SuUZXaUv0hqGG7qjxnbkkkH7j0OrOGaxckueUq3yqeNQkeHPKUPe8nraWeWxaRZojuoC0P9Defeovg-9qrznO90hFIotnH6p9R9EW6jK3D_JS4Xv6ZeCrxwgv_7-z_YAI0CcUNdyfNJTJ3Uvj_btyrHlTolhVpfQnAbVXBrZctQKhtWhFcdpLVVWxlS4Ym6qXpMKY3TGlZdrBFFyhaZelJ1o87lNnq7VDWX6eR5NcU_-ObTSWgB5vf7NnA2n3TKittlTVyFd_vp3DRI2JLI137Jh_sl0nO2ejKfvoZUYjk5YP6ZB39oNjc_Y2WrLZLDHjeLdY1T5_eFTzHrTnY7qSdg3Dx3PHRXLbDVM0dK8gZbAbH3HUMO2nC8f9N7z4Ztubf3cCfl2oZz4XEXZZ77sieW87FTG3WcLpfYLHl2EsEDnJ9MYAV0OU7PrTNl4m-qrFSa4ocLvCJ10G0HYY-tWRnvL4u_4ZFPMKAug35C52qrEuqVL2XrgwOAmdFJb5WIiiM0rAdGaWgAscVtlw16oZTeKouQAve1C3YmKNveroPtKKvRgQ-zvbHG4sP5bipwSreexMe2izLGBO0uGJrTwfFHlStc3rS217IFw1OCqyqLSRyaQOma1mN1a-aGJbuQ1TUPH06Es0jNpHUWfFhfDRjlsli6DKYYavneUS_K6AVjKI3PwDOBdwG_peIk9_ryhb8hUxsa9ic3HlvgR0OCMKnRc-mNELakam0QGG8dSCfrewt4LwHp69aXZTHhGqRGm8ZXZZB5SPQzBEEW80mntEoau8LBSwTPKqzKYlUVKqt7On0I_dLQqpFVcV1XsqJpq7jWUxz79Gqgr1pDhaidpZ-j0HXPV7z2FVfIdjyFpPQuKKodNFrF91R96osjk11VH0qrXD0Trem57ANEXnWLUhe_CpCc6em0SeGkD7DlG6EP6LN5XUBKRfl-v-ZWbAF6sRxyRzlB_Za1sJ56mEpfLmaWqmL0z550d1TlGSdV1v-8mdyqLdSeWhmmhLcrZf4KcSBlJ1xdLNtD6FkgFNNwfTU0Ru6pfj1ZRah5QCJXF1eum9jetvZVHTtJ4Mpke9jJdDdrt1B3MGMb9Xy6mw9KB5G7xZBmLlO8PyhF2rBsHLt8hlex-ZZzCFK9LaGDQIwa-qa2sqD0ctXmhEeje09rLtMdFREfKwVW17s4DU1uRH7lQNSYBdoRjrH2YiKk99ybRYAexMqiblFZ5xLC5lX59_FVsxpGqF2JoLwifvXsxV-1Ft_wV3758qfT3uX_KszJVbgI9zTmLqbuqK9dj_sZ24vdqBxzLBWxxunWjZsI28EPGKFyinjxkEGKEX51iWtnUtjnNPnOlv-5Am868BomOnJGpmUi2TfDKf4SKAVFg3jn7zYo588Uodq__i32DaIUk6n05X0rErquyv919R9jo-ZK6ScQbqqfEqHW149v333wv3_gCfNJXX-6Q4a2dLiFtFDl-CJ9cEUpQ1z_SMoQ5vTTFsyBpaGcMqbflrIK5eqsMB3MWhT-vYpFymEnBcv46yc--fWAM6MhJbiGQCE8cCs9R8s06NEPwlB6CMgyHDShbwmQfx2FEddG_10mbuunAdiRxbtgs_kjHL4ySfZeFEv_OXYFHE6iycUouhpNLg8J-eeD_wc">
<img src="../examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="../examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fourteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVvdchu3kr7nU3RJF3GqKGb4J5FO-UKJaVsVR_TK8vFunTrFAWdADqLhgAEworSpVJ2H2GfYB9hH2Ec5T7Lb3cDMcEjJTiq-sPgz_aHR6P8GT-E2kzD_dPt6Pr-BVS7WNlNb-Nc__wsEuJ0-s04b-QgrsVH5I2S6tBJ0AQIGA3jA_zZgy2VplqKAXLsupEbsChAWROcUPl7dzmCbi-IluEzCslR5qoo1KAuZyFegV6BcF0SR0vfaZdLwN8rC2uiySHud084pzO6leXQZ0srcSlAFyAex2ebSfkdLWthlwiGZKqxKJeHtRJ5DrgrZg9tMWdCFxCfwK2SKWOQtKQsicaXI80dQ1pYyBWG7sMtUkgWSXaZzCVutCoeM40f3_d6wD7Y0K5FI-xJiq5yEf_3zvzunsETuhXmMYVs6Rsi1I3ZQgvjeZlK6LhT4UaxLl2ptYr9v2AgnjRK5BSseeXcSpdA5BftrKYyEjXRGgi7d3oYtXH3sQrySRSJj2GrrF99qnYMsklzb0shK5tYZKV3nFFZGF06sJR9HfxT2OOiDZw1W6sEhLWmDkhZWpSmUzei5tTCpLDwbj_i3cwp3yiWZLAJlTSHCV3y-N7PL13D7bvZxBrfvbmYzeHP54-1H-GH2Zn4zo2-vrt_iA_D65vLz1fXbHlwGQXnx4zFdz29BgNF68xIUakPnFMTSysLh9jYQp9ImRi0lnJ39YnURf2Mhxsft3_8Rd_0zTjuR294q19oshJFisRnEJBT6HjdISt45hdgmmUzLXNKaNgYnlrmXoHIWkBpyUaSolhWyF2eNrQrrpEh7cIUHoZfWmTJxtJ13uG80x-oIVZHkZSpT-tRqSJRJylw4pQs8_zuLRyrUOnMgEqOtV17Upu87p-C8mQiwTjiZwn0frNpsc7VSCaHU9hiUiOVcc2ArIaBBWvGoinXnlHUUv9noVOaQammh0K4HlyQOeHsz__yRDvHD5dvZy32TUJa9SSVjVswuWI3QymW6dBBvxVaamC2BCXeS9qpY9dicd7rMU1hKsInIZQpON1S0B-9wW15DyQZZCZGzt5c3l29ncMV8zm_fzW7g3eX7NzB_Q5_czN7PLj_Oeqw2aOpQWmkRWqxlzJJFFu5UkSLzYZlKUaRILZy8pedPSNTx5wUvu7idzxfXlzc3888xbKSwZDLKvYRxbwwbf55dEGuBKuOhB70L2JBv2wpzJ1OIE2FiKKRMLaqUBTJeZSGmF57VLktZPbiMmPVO38oElUDknVPIpVixwjhxJ1EfIckF7k44EHnehaVM6L1ytLiF-d9mN-_QmI0gZ-4yUYBFPUFV0QZFkSsMArWapcJmMgUjEyeKdS6bLpyZZZUTDvS9NJkUKWyN_oU57cFn9NIIjETICX9n8diVhdezm6u_zV53URdhZ5Rz0scjI63O76VBiqXk-EAxw2UquSuktaBXq84pSJFkQE6GeCZhUMBCAuUyIGfRo2CaGnUv0QMGx4yCDx40fBnT7jun7KVAbraZcCqh-INsEl5QHxCF3UkT7I5Fwio7v7maXd9e3l7Nr3n1LRoUuXLbsKIQcK7nN7fvusFWCm3wjArI5EbZbSaN9OYWy19L4bRZ4AZIqa0uXVY5omBIt96Z7LJHtmZ1j8eMpsHq5Z38d6kq2Eeg_Jb6_6GWMiWfSdJkVmmJlUhE2ghP0tyrRMISP7BOJHcWRK4Jq96ft9_q_RkJniy03FonlLHB55XpI2uCwFM2aWDkpU94aCHKDjJh8ZPOqd9uDWphKw1watR9ZksbPhODdk_qa8UjirKLIv68uJnPf15cz28Xs3_7dHk7v1m8ufzx6vpt3GVeUyNWDsWZydIo61QSTEZZ5nAjpUP_0DQ2DCD30pgyp0TLMQs-VJJafWMPpeRVS69WKpFo1pUBki6RB-l1aFF0XRjo36GnPYHfOgBlgcFus-kArI1KoR9FHQBy1XAZcQBMxFZ2gB0y9F_yI6SBUG47AKnaWBCl08S-yHN6uBldOwC5XMsi7XQA-LRD9OhBzFuKv4trZY4pROFhU-KIstMFGpjYSEiVYf9hv4e4ytUIWdXGvRWGkj1K7GI-RErnVHEXjGqLDuqFIDd2lmryP1tp3GPI9Qj0x7MPN_MP3xIXIk0tQ_Zy7eo8AM1rNBnB5n__B9gal4-Y5yYObKZlLhLZQ7Fgkolyh2DeJEf6oN5948OwPXgRdaNv4cVgEEXNV_T_t_gtv-oA_M5C_pjJPIdEFs5I3I1ldWom8qKA92g8_X5vDA8whU0IwugYBYWuBziHjXdchKsLyo-aerjKRXHXo0N2cAuvYBhFEP6dgnzAdFib2jd36Nl7mUMfTt42FPzEC4dcuUpfWdrEIQDc-gcBXgzGUdQdjUkM_enBm37k342iw3dDfkcQ_g1m2ZKwf99jZbfI-kBapShhq3npRxH8Bi_OJ_XS9NoDHsAMnoWZDmoYev0EzO55bmhL06jmhl-3UWT_y8xMoobIJkdh1sIchRkwDJOOjhwEKSt4T5a-MosMMQEwTWlKFKz6TwmDURQ94EYAcrGUOZy8E3l-AvU_yugIAxX_sZlitxaieOIXaqgQLzQaRtEDflAtNCf_erK_EDvdFrCPpDUwS_4p4Pf0eAuYMVrApVOVaBpa4oEnUfQwbAJ_cipX7vFkD7jkD2GXtMBDuVeBT6IW-LgJ_pPPDl5TdnDC4AHDpwz7C_h0kBZo6gMtgNgP582DDVn2HvfeDXXYr9zuxbhuVZqzY-VsBDMmX0LYLYYbouWsOn2VLpheF8CeRjhiBXYqdRkaQQQYgCTkcuU4GWZAVtSKk7r8wG5MD641xEQYY8YCMSbO1WtE8a_1VhYcPLgswsDFxTsGdo8-WyDo4qer69eLH99ffvo442yCUlsjV6UVVNmhW9bYwTHrciML58s0qgSMuJe5hU8fKE1kXEexRmGlB7-IzRKTbt4tVpKF9gm1prRfcu5GCxcahSDNRqZKOCwtrTf8AI3R2-fUBxVCFYaPVgoYlAuZh4IoVA1dD4zLe0h6XFnMUdalWMtvuApIdHEvC2JnpQ2IwjefxFLf83JJ6SgJO1AGz4f_01SK_mgwDloxjKKo06L0zgTreAwTwqHnCwTTKNpXHXq6heC9RgPhfPw0QsM_nMIlbHVyJx0dNR96MHOudwoNiTZGpWglIT1nMdPRWp_NEXi_N4SNR9YrWGJsZ9thfXihHBeoMBlHpLpB7yZRBNu8xASY1Enkud6JIpHftgVNnswzzTsekJQn1Y7xFasdWp5nxzsdVEl_RqGq2ZTpGbkaWoNtSTgnMAsNz2bCHjlwXh9fCAeji_GTIvfOzbPCXpuEWXlOw4mn3VK1WTdwGo4H7Z0w01e6crkNCZzXEuifBzVjT-d2OjTqcAO2y_Zfmbjg1E4a30LZlo4tHPtt8VKtdJ7GxABx5ZEbZR_o4Cm3GC-_B8F-C70VbIUyNTHUrHuSVCZ3PbiWCpf02HYn5dbWFoiHRX2MjyjXF99SdVqUeU6GyodG7YwltovIE6Vx6JWFUkAXtfcCJ41BYVO9p7FrdCe3DpJc4sGiTFA07VOn7QFLBPbMfNSvbQ4NuEWIm4TQBNkjHI4G9cHVumuwv8WHuFNFqneULamiSj72Fp9e7B_-IVnIAJpkU0zVaqU9QhUSkj2Gp6O9MHeErKGeNdmgQTYICkplOqXrjsL7xXkUdcfnVXSn1AQFlCqDJaM_wbOzszO44jCAr-lj6jJTqzqV9o5jvyqC0wRRJBkWAnp7RiEZKfLSZrwQiu3hwu-mRlpqfYdbWB1BWmrn9IbBmkjI8-gAKclwpyEJGw6jqHse1VkMZklRBEZjfxYxGgt2WlBWrwQB-Y4gOVcWtJVrjN8wxgTTSgcDPGPOgAecATNwIwzUwKZc1xxSARGNKhaJHsX0DIC7X2BbgADGlMAO6lQQTx0FA3sALYQdRmjz7N6isLeLYWAGtbutA-YRcb4KaNJ_BmgprCq-Emg6fQZol7BOfg1QP9pHakF5A1tY7Ejs4VFd5kHOK1k3I1BDjxzmNXCEqyZKfeTHUVZGpWv5JRQy4mdQEl1iXvgFFCyKnkPh8mFBAxkuFyJW40mlxmTo0zZMmxsO6i_64xH6o2lNPUUdrvSuam7sKYxKHpOw_oQMfVAB4Or9ixZ906s1GneVZzv1D1xjKhUGj11s49cDQ6wceKIifCu2oJKgmiuFYNqoAHQhG1k3tUqxU3cmdpiRZMLhM9gqF-BUqAq2wjnsH_uc22JfjbY2v6Zq5uO72ewWRMi8qOuHo2Hl6gkNZmwvx1E9SuAQnqqNLCzm3wpbRWAdZgF6tWqOnr4JxY2RK2loqFPTNQcQSLdRea5oZGopJfUtLJ9S-f68Sl-tF9Skh7qRz8XmmFtmFKq8n24V4a89wckh5Fa4DLBJwkGUA9ywRvQqNfKQhwBUYuaQ43C96mxw4GjwdI6NgeGowdMbKk2R7OQJ0CWVMdRoRtDJtIHKGx150CcA5D5AHzOQgMDbuggARwWjNID_4_sd59Swumg1PIbDxr4-IMGRLeXoBluCPp-28QYB78jhU3oG_k-jT7LPEEb2wbR5-DK5O3bwODAFHr8GuP6Y8Wpfgp2Mh2Gzc_FB6_zY9vj899RgTG3Ci1EjvA7Rt-B_VX_ouAI8CpMCNu2xsN-TfhNuGHm0Q4ClTBcW9hWAAAb9foMfrEgengTYtQCax9_QoEn0FICEtgpOaojaWU-i_WKodSOC558xlbQx0Oi7cQOEhtuCaZbCGEUDOSyL6El_-yA0GLCpQOP4_CUWzlUvkzoiW51k2FNykNHtjEJXJR1fHIBftCroc5Ek2Olm1LUR24yGggf3GMDIrTY8DCoLrN94do_3Grjbgm41fEXXRP7-j7gHlwEaU01lIUVHamSKgwcakzS96Erc8Te5dCxrLmtwF1zEKcfu1IskfbViA-A2AfVwGz3tF_3p-eE7dIvfVk_yO2qn-35xc87XuLTiZ5p8hci6x1zi7BsTm60Frih5QOyvtZBH9m2MKvKp--aRZ3qHJ66ow8Bb4ombKKgxjF2Jg_16xjzVb_AC0wYyphcX_fDy98M4z0X5QZx_o0vjJBZQzLbbycI9nlE8D7dy_G0cDPtc3oaWXGzkr6Uy0n4WeR6_DBS2Ufxy953jt3xI5La-ASKq-z7WiYLHPSzkjUrTXPraGF2RanYDCm02IgdhjCjWkpLZphYJHNIIx8VvkF-VMYW7MXXeNsBw0h-NDtK2FmW5WRqZ5wIqxziatiinRwmXy18bvX_vgPb984V3X-2suSwWuS6LteQckRV41N-j6x-u2KbrR08StimxFdXgdEBbnNaENNzoH6leVbG3xQFb1_leNnr-RbLh-VeRJTnaoaX5Z73apFFBjo9WxvJ-kWTCrKnsq1r8g6gZKB-GB2QbofKlfqjPD7lsxo9A1q5RjdhsdcXllI79oi4QhiEsH9BJ2VSXPu0uao2YBqMvEVKU7fYnjeNDeQ6OCFQXalVnECiRqIt9psooUKD98QFhJquKrBGbB-3YfEhoM1Mua8JpvR48Z0zHyC4Gf4psOvqjZIOo31LPP0I2_XNkw1qWX7e3UU31B8j6Pis-ttrv9Sh8ACdvlLHuL5qEHxm5_tFp918z7P5rZt1_yaj7T026fWw8-YHvCEH_BO8YUjAVqghXh6pRRHWxjK5NizzRxSPlM9jsFhuZUrdbuRDKi3KzlGYvzuJAxdDYRfvMQdPlQ7qbDVb6e9f-W64TVqqaqXngMJYhdQq35jCLpIvalKOusMLEwloltss3bGhAhkqRnq202YC0Tm0oxQyN99jJB3fmqXrO8oU4OPm5IY0TyrtVWmcOo94ENjxnoL5BP4p67cG5T1Vao__W5L8qi-jhkzAabt6lzfgO0sG0f3Aw7W_N5D32R3z45Atj_qVMBwAHY_7jiEF3Bn5S7sXUhuRWQ3vA35rvB0jhMha1hxT-ytAei_09vEm0jzc-wmK_xWLoWuna-VDuykZk_V06HtNIHrDiwFYaHNnInk_5sW2-lLneYVfOKNnMOqn5pKort2AzsXJV4cYFVZj0koKEO8GNi0O9YwPZwRMD2cnRgeygBUEHfHweewCAz7bJ8TCfGW7ukYez21u9_8Rk8Njq_eZVhB8u3_84v_6PxjVdTSFDOLijkZzCWfFa5Hi_u77h6p1VDEao3PpuHiYhHpq8WrgWgG6udqJLmSmuf1EPqIghx5Vh1rTC_9Ax2S6kEiu1FHeEzUuPjIt8w95qo1L-nQbV9HzF2u9ncT2nmxAxrBS1AtGveKYr5nw53mBZ4WMHd4P9_UpUYD_PoylqdVuZYchxi9xqvLlnqY3aqMBaVzNj7DzFh42HwGJpw69Uege6wk8cGy0OhuM_MVrcu7xwUU8InxgssudpEk3GXxorsgPcY5UmJ88vRC5pj6gxc61HivuNIi-e8Jf82bDVJxrRZGvSdJD09MmfmFGmelcEg6LfL6E3hDX-KiJujjVivo8c-1ki_qSAZojxy-q52Ks81-n46x9X61BpCnhzM_-5qucrH4gudKmxxyfxJyjlFvwPNPApMlteU9ItaDbr0FHH6SOGwYgUkLpHVErwhfVtSZWo0w1FjT8v3lz9--2nm9nih8sff1rczumGc9wu8ZehhH1m-lUPrsZhaEll_6Aaz5G7ag8MTYoX-esHGpPegwnvYZFVoDVQr6ORcU_He5PZ0d76f2Jnw2qANax2RtVi1EAePDXFrh54amej452Kegz-NaydX-wJvZpRNSLc83PxJntn5GQOmBwdMon-w5VLv0nuz7VQWpP6i-OTej-mPcBpjumbOOdHK-D2kJaxegwSREVXNqoew8V-g1mKe2mrK4V4VD7PoSSZc33MSLByQ9dPxxE3f6IYrqNRLt1p3YQ23svfvrv6SLfQu3zHhRu8cfitDpYMUqYy7YVOo78nZxXepQv5E3OGyh-Sq0LzDvw99lUoBqqUe8U360SxhnFdiDrl8nA_3f8Up_WjAQ5c-Bu6xfIRTi5Nkr0Xxdp_jnXCySAanJ9Fk7PB5IRwf-_8Hw">
<img src="../examples/garden-house.svg" alt="Garden House — a two-storey family house on a 22 x 22 m suburban lot, ground floor shown" width="620" />
</a>

<b><a href="../examples/garden-house.arch">garden-house</a></b>

</div>

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=jVfbbhtHEn3nVxxQDyJhSh5SvPgCL-DYWuxilRVgOfGj3Jyp4XTU0010N0UqgYE87RfkX_KeT8mXBFU9Qw4lL2K9aDjsc7q66tTp4gneInf1WuURIW4K7aDWyseabMSfv_6GWBFyZZ3VuTJ46_PqStkVaKfqtaHz3knvBO-pVBsTYbSN8LR2PgZYh63yVtvVa3ze3J15CrogG7UyZ6q418H5h8_71c4SPt1-uL7-_vbj9fXtzfdvr64wiBX1TrCkwjtXD8_xsSKU3tmIwjkPtyYboG10EqbR99quwGtHUMhVoELW8NufnOa1EWlx7wSVMuZ1Sw5lCyxVrEAqr1Cpe4JqdilLoef15_ivS2_DlmjNcUeHcuOtjhvP6cANmfIsdzYqbanAwDroWg45PO-tjbLo36REj7_70McvPWBjdQyo6x6w8rrALOsBIVeGMH4lH6zzscJm3esBJ7jcRfKag6jIGDwDV0xH7WxIOdq9mWZZhkLf64I8_MYGOcI_f7i6QkV6VUWElDQ-s5DqgK0yhlNWlpzlupvUsFY5vZY3XuC5M5vaIqwNxy41aFP5XFKF58J93oPwgtqgESud31kKAZMswy8YZKNsiMEiyzoP8yzj5_YhNy4QvrRk-wN3yMaJbNrSTA8034y7SLsuDs_fDJ1OD9D0_IWrJRnRxRt_22RSxebA6S_onwlMsONQYdSSDPpXae1z_EfHvCLbxyZQaItxl14esS-pYDpmbzPQsvNBdhcd9u9Sofo4_Al9U8AjXillhzdl5cA7nh54_6WM6ZI2tExxHCv3WYczpavDOe_EqmL1FU6RbWoGG72yOT3xgY5k5RBG27uOAxx1ftsJ50LZZP_P__2WkDo8sZNBrn2-MUoEYYkKMTxxBkOqHL7ubiGkxwazoggFT8p8xWR6SC8BzldxWyttm3xdHES91UWsWILZ4wartF0RDJURCFsOV7NY2th18cZ11Zjqujhwvsyyx6J_HFJHbvPpXhYJ_uIpvAkpWUcKyW3iE9KOLuZ7XfwdafecTMoNq23htk2rTSQ0oE3Y7HHCjgHSwLxon-HJNwBmkwNgsQ91DxAFNL3MdgxlnF1JxZO18_JXCNre4Y_fEaK7J37I3cZG8vxYel2sCIPCq62FCggP9dIZvlVwuIFab7gVqkYxo8mMMyAN9iI5zRGm3QVtSccvZw1IMPOvYFKI6GAm2d9hmiMcMJPFU8ws63Wb8Nm-T_c8I9zROiI3pLhxJIvNnaztKhznI7hSpTzMstH0Ym80rIqdCL0xmhtXqv4RVDQuYrxICm-gLI7d5NhP-ylodqsUrN4xR_h_sZ4GkI3-AWvW_ODREVjH4mdC2vrC8BVC5bbkoa28LJVH7rwlP8JSBW2hVkrbEOXbfZ-M8OkdXIIEt2nuexGo5bDazUfHYSbG4LCYZahrdsHSE_tsM4M169bKJtvkyePTO4SobBHwuYnlcxoanKtPQ9oeVKxoxMw8OngXk4sOxi8yGTlzHSJ5205qTJ1wHPKQ43h_-eHfP16-F09ljqXK7xC0zJGIlYqy9JTnEksepcoJXsWK-LDK7mmlVJ7yqOzK0GlATtwIRls6BMnhT7KsrtO4dSoXWnl2mAJ0gKV78rCqpuKR_FLBxCfFJw7X58tWgHw5dOp2iWe4kQMEDFJ5h8e6lMIIJ9vOaDo96qDpLHFKUpq7rnps5ge2bZ7asYkg3c7nSxejq_laChTF0dpBZbfImg59r2uygUsXomfZvkoJFRcMUEt3TyO4e_KtF9oYoLzb2CLNqZ5K8mTzVI3BVkdO6BBrp3lp0LHV7XKjTaHt6jTg-oePlx-kpgGD3ZuzcZY9X4yzbISH9GHOY1kpNn3yuHrDtqISjgTP1Q6sWh85p_yl9IaohhXmSRXckVvli5GQpnKv3R07lOR5P3y0gYqSt5U2lPpurSxvoo1BTSqI7R7E1nR6543cyuz7F83_RfNfLn8ZEXTd3N186uHZPwbNE5ezKdxkliHSLqLPC_statFFHSieoi66qGw0byBpQn-0F9-rCbU42mvcTiwMHO9H0yeouaB6QNTRkPwwAtbe_UR53P9metv-OO3L13IZ3i4f0Odfpu-UvVeh-UZFQn-STeZn2fxssuC3X3pfen8B"><img src="../examples/studio.svg" width="270" alt="Studio one-bedroom flat" /></a><br/>
<b><a href="../examples/studio.arch">studio</a></b><br/>
<sub>The flagship: fitted kitchen and bath,<br/>an enclosed bath off the hall.<br/><b>Lint-clean, and import-free.</b></sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=lVfbbttGEH3XVxwoD7EBWaVoS1GcJkBStCjQFn1o3qMROSI3oXaF3aVptwjQjyjQD-qf9EuKmSV1sV23ebJF7py5nrPDZ3iL2LmLNZfeuS1oRz5u2UZ0JtYgFGyjpwaF896Uzk_QeRMjW8j5gI3xIV6PngGYTRFrTs8n-u9gBNo6W8mjLc7o8NgEkJ4_f6UI-RSrjpomYOPdNiGtJuhqU9Qo2ZsbDgocam4aOCs_jIdrY2Msg2wJgqRgonEWziosAL5hf4dQk-cSXFY8QXCwDuIOBVlUDlsTgrFViuUyZeN2bI2twgRMRY3ahcgl1neHVGEiPjpjA85WpXMea44ds11NsHIWX8uhN9OvxembVZ_oVQLftN6a2Hqejp7hWw1RuyBOA9xmo6dqapohXH1tArxEwyVi7V1bSaOGDjqvRmuK9XS0a8hi_L5zF-_61981FMf4bQS01sSA7XYEVN6UmGXZCAgFNYzZdfplnY81vKnqOBqh916-9h8ac2NsBYo4yybZeSoygvmVcZVl2e0yyzI0tOYG4x9MLGq2-Ao_qtUYbeCAT_3jBHWCvuZyBii6oPUOFH0h6JeLA_pPFCJ79PmNT3Ckcsc4Ynd-hDO7OuB8T01zai0lPLaeZ3vr_EqiOMrxHUkn7vtfc5kDqX4XboMekxpTWUS3S2AS1SlY36t8LEV_hvf9EMC3NsDY6LTFfQ_CjgpOdLUOOoEN0-YaZIfpBRXehUSdrnYNK-wpGyLJYHuKNcsEkUXDmwgSila0m46A-9QE30b2xnlcZtkR7WZZht_U98AF9L0Qgu6H5_Mhu413NqbYKe6H_nkAU4hgW77qGew0vDToR_SY4m2yDnQXFLWr2bNQM0SypXCTogSWpfhDJB9X1xAKqMTxJL1QWrf2eUDHyfW5pK7gpnxdfkihuiGlqTZXohYY9uhMGWu8zDLUxlYMy-STO4RO0tb-JeMB-NEqKQkeBn3k4ARPjj-Np6P3b3jLB3gU6_-KL_-y-HJpeGds6bpUwDQIU2FCssozlZ1HzqRhjJjPH_M2mz-wk3ooMkXki8GIbTm4unrMJJ-uXYxuO-DKIZ2nd1yGRLJ05dRMZRAzUlq8wmrTtKFeYcsUWs_hME5dGmVjLXtsqGAZqL30i3An9TR233Vb1KLjbneheSs0jA0clWoqG7Nllt3msxPZGJ8gd-RL79b8OHIa3ASdAPMsu11oVZ6ILn8aQ4Qxz74kqD1gqvxxxoNS30po8E40CvmLviXDveJbC2r6BSPRVm_1M-WysdXzgMCVbjWXwzahUqotOssmS1X2dofoFFnvtPMJikbI65LOpEl5dSy9NTWb4bVqUqRPLIIZ3Ib6bSTSurnX8Y03ZcX9nUkVGTuEvBfUfbwic9L2FzL35kCIE8AQ3c2A938B55dPAPZ384dg7Kf_C7iYPQFYuFbV8UsiXCyfSlkqrHdzvpxnk_nV_m5-eW8Cf3EbGuNfgbQ_CrSUO34pOEd8WB6A3svJ8QnQaUi169j3c61i--RcS5wv77GtK04KlHAGSerLMlsMCiBce3GfrxSMxcMgHjB13pN9fwcz3XC41llOq3bZr9kmLQ6ySz4XyWMUjQuyOQytE5JN0-azgbthX5OtxENC__mG_dBqG8NE9vVgSlYxRHQnv6-xkj9hhV0bag5p72Zb7pyRi7eNiumGLUiHyMTDbqSrsgbsjZWdJuzIDklE3zJmmcz-X39iKX9jndahdWuaUli9V_C_f_9DjeSGS-czlSG3TRvzrmlD0gA5pcKsBaO4D3qq0N_eUhGb9M1A3sR6y9EUINRky4vhg2oV-TauUHEM6LxLJS3NVssS9jp18eZMA-pVa9AHnYOT03r0kWMjIJrYsH4FADvvPnIRH_lM0Nelp85-WN9h_NYX9Tdkbyj0b0SNx3mWLy6yxUU-l6efR59H_wA"><img src="../examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
<b><a href="../examples/two-bed.arch">two-bed</a></b><br/>
<sub>A larger dwelling: every room off a central<br/>corridor, its walls derived from the rooms.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=hVXbaiNHEH2frzjIhJWIJUZeLSHBNnhDAoE8JXm3StMlTZOZrqG7xuNcDH7aDwj5gjzsh_lLQnePbibBTx7aVadOnao6usAdxPF8w8aLtNg2pKBea_FsMFitoTXjYblYvkfXUMUtO0Xod-Tx8vw3nKAmZ-aVtF2vbIoLVCLeWEfKAVvxkI6ddbsA8dj23lntPS_wg4If2Vc2cLiEyo61Zv9NcQHg5fkfrIN6261TFYKXAbJFJBnQkDWQXsHOQCX-OaQdqpEqVTWnAMJATYPNb-gkWLXiMF0bEf_nYJ2RAS_PnyEO1zHsFqS47iTcrmcHWEIMh9akqUSAykDegOCoZZOYYboOg3U7WKeynqG2bscmwo0ETokepMi6GnhuSO0DZ8IjnnW4jp-3IFfVEkX_nGh9K21nGw6oGiYHcgYdhcABa_JVjcY6XS-KriGHyd1ei-XHnyb4owB6ZzWgbQtg563BsiwLwInXGn1XFMAFfrQPsZkvsd-OpHvDW52rzL3d1RolJaRJXSLU5GMCYYUWhjutFwXyf5HDSTEtL8sZdtShRM3pdVWWZWKF3LY1N_6-ydWD_Z1zQEMbbjDJrCZAH5vNUa9SN2ziQ0p9f5L6MfcxyaljVwXwlPv97lHZW_EINTcNKK5v7yN_SjTjCAOmTFUNGnUPSl5fPv01bmJeOohTmSXMrulDOqGOvObN27AOzC696iB5p6NQaUWsuRnu8xx4zwda2-pXxyHgKio1ajj9qizTx9NZcpD-reSo5z4_f59DDBwUb9f_72SmN5L3tP-_fhQLJ5IdIZYZYrWHWJ1C5Ck69eQqjtVKtC2oEbdLamdlYpnLk9tMNx0f34U8zmQr5EyCG_0knXQCGfcyTm2BX2o-XEcyCHGvpp3NwrpoFnHIKcqaG3PfknUxfj8x0kx5sEbr2GiZScIx-ZHZ0V6wv5AzzLT5CTNLeI75dVniHGLDJqt2h9EJK3YavV8c0qLH1t6F4zijUGlZc3iqldaFFB_KL_bsV8lPToPSWpwHXZVlrv79ay-MtpL9zrpgDR-5YOr4gT1ku41HePitmUVSR08NsiVYd1BpD6fSzaODRVzW6A7ZJqJKj0mf0St-li1NziCTtgly9JcTyOxurzCXH8ry8ercfybFU_Ev"><img src="../examples/attached.svg" width="270" alt="Attached one-bedroom flat" /></a><br/>
<b><a href="../examples/attached.arch">attached</a></b><br/>
<sub>No hand-computed coordinates at all:<br/>strips, on-wall openings, anchors.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrfciK30r_nKbrsi9h1wB_g2PE6tResze5S2UCOjY8vQcwIRrGQiKQxJqlU5SHyDN-D5Um-6m5pmGGzcc6Xvdgyw-inVv_9dYtjGIBXZqVlxwfr5A58uSjdQhhYlGYltN3CH7_9DqGQMLkbDcfTwXQ0GXcG49vO5IfheDT-cA_yRaw3WsLJc--sf3F61jpuHcO0kLDRNsDSWRM8IfjgpAxgDX26nzxMP4IwOX1aCZdLk74bT-6mH9ug-JO3ZSikM61jKORa-U0hnTyDaSEQTMJSZAFymalc8kbbwmoJWuxsGdrgLT3caGHABxGkBxWuSUoAr4KEX5JotFNtk_jgV3p5ju_OIXdi68HYUCizOoNRACPW0sNSPUvIlZNZUNZ4PMpcuKyAXPrMqYWETudHbw10Ol5qmQXae35NyLT9HE7uT9swX4jsaQ4n40r1rBz8Sv5UimDdzKtc4ittWMhMlD5Jape0IL7WOq5_Aq0kCu5CsRUuRzhfGqe8THDDU7IHPvYypKePp2fwEZURBRMmR5mboggn2aqD74eAj9qwLVRWgPLoIFnQO9gWO3qnsChwKJ3xILZihz6yxm9ax-CsyK_pLa2elVmBs3ZNUi1sKGAhc3zgIYgn3pDOgy4gcM_kTl66Z5VJWOCDP377vXUM0gS3a0MhtG7DQoSiDVqUJseHTypkhTSkcOXRS7InmYPQ1qxqrnsGEyNB5M_KW7cDrUxAkUstwUmRo1-1Yf44u5tMvp-NJ9PZ8N8Pg-nkbvZ-cDMaf5h_C1qKZwkinQO2KhTJl2BRBlDBgxQecbfK5HZLR1IBtkpr8GIH3lYR5iXp_fZu8H46Gn-Aj8OHu9H9dHRzD-8ndzAYw-D-h-HNtI1bgIBc7LRaFQHWUvjSybU04QwGLis-CbOCQvjWMRgLvjSwtrnUuBC0CCqUuSRJjIVcBElRdeACXux8NDoaVaQDaGufEJiX81G3hQjyWToQC1sGKOwW1mVWAIuX2TVFsrPlqgAV9inFYiJAGy6Tq1NYK4773FoH343Gt_dnMEBdL_EbOrveonS4t8wrN6H4cBKdyHRyuRSlDvCkTO6Boh-VKwWehz_ColQ6lw62ttQ5iCyUQusdbEpKRFVO0SrHQ9YTG4mW4nlZat0pJJ0VX5YOrAmcpnKZPRHKxmZPMgCjsL_a5RIE9C66XVivIbPOqdy6azISHZbzJbu4wdQYn-ByAl2opdV5BK3cH5-hwAqFQA-0WwN2Iw0FoCCdh0IYsM_0l4S1yAplpKcTD0h_rFsWxG-l3FRJkp0FNXC_VWZ1cjoHJzn8Tak1LK0DoXW0RUwvj7P7x9H4w2zy7n5693AzHd7OIROGjLnZ6B2wvtakVGs0p5awtVVs4YY-paGUL1rHkAw9Z4nnsNjB1qmAhzWW7A8CXUa3IRPOoSt7FByEy85a5HBH72J5PIJfWgClQa2t1y2AY5ivnMrhojuvcjN6-g42wgWFtYGdS3nodbsQCpU9VXkrebPHOonpwBAkOnxnLYOTnipO6WWOCligUz5O7r4b3E0exrcgPGyl1tcgYKleQukIMZM5zJe69MUcxEoo4wMIwkUB9mJpgZ5vDQjekEQz0ns4-eO3_73onkJmrcuVoQSQRHbSW41-EYUiYFRBxxuxQb8JcDu8G_1neFtbD1o9oa1BlKGwTuYYQOwopL5etzsHZ0uTS0p_WHoIeTSeTrjIo8ugEE4o3Hn-OHv_cDceTR_uhrPHwadPs5vJp0-j-9FkPOdDYcBg3UUlY4LIpVPPMifYmmSUMgBTv3SAZ9hgyogsgoRTHpbkqqjMFNVeginXC-k85g0CLU1WiH3G8ZaqITnDYhfQHxFJacmk4qwFEH2nBbARG-lgcM5mycQGMX0mtITeda-Lr3DtKzctgFytPerSot_Si4XMqTBhuWy1_jbTIcE7nU4HfCG1hn_hijIjX-r8P_5xSGxnfqOMnIMrja9yIGxVHgrSTa6eK_oWUybVbqIGpLJYI2WhqCB-WwFzqZ9DbuN6L9aSkkqNdCLYGbxDDoFZHSlbXsVnqh0eFlLbLSGLWuxYM-dcs9jB3cMYbkf308H4ZlgRF3LGr9CWzgfYWGUCmzzuwLI-zn6Y3Hw3nM7uHsbzVINZ5I0wEgEy8azCLhIPTOAsqJcrqtUtYLdX-Vu2Dv6TL0E6ZR3APmD73S78AifddvcUTnr9brf-19VFFz-kPzJtvYRfa9jb2ULmPcTeJ4c9do-xLxMo_fH1FUJ9BtJ_BeRNAnnzJRDym78GSQvj8f4MJRG8v0A536_lv1k7B9JEXvkazuV5TSD-cKAbEYpXdHNxtQeiv_9MoFjD_wrnqibQVf1g-1BnTt35h_8I70MteE8oQZ0yn-c9NtJir-hV4JSopdyAMu2YFtHlmditYy9IoJFodpYiwyTAbP8M7vexDSeUwBp7UenJLRFAI6mOYAQROVD5WzeLLQZWew4V_ufVzxLQq1_QHUCLhdRw9Ilf_h-4VciLjrDe-dSl5PSsAZ5CCMFTrCTw80Pwd5Gz9I6iDAQemcwhbD_Bvvm7sP1XYVOAsCo4DBqw59_sYb_jlxNohI0QDVikoknaWoARLEr_QmQ2wn4UWu8xEyxBZMplJTYitomfwqjCZz8n_P5Vt_vS79e0IULxOT5x44ZXxJBCzFoMMmb_APMTv3ygijIorcKuAUv9ZxT16kDUr7sHsEN8-ehQVIKohS3VrGsKGmKtSBi8CiXpCf6rsMXmikY13Kkon0YxsX7WG2wVUsNFvLuqP7UOAOOMgfK3-YyB8eC97j4BcfHHJ5zPuKIRCGi5DJF0K9OqJKw1U0jgYu-kPPWT2ODK7KlqXKr2TPm63HEKQZj1GUMmuOeJrEy42GFEloWdOjJywR2OFNQvEJPRKA6XeJKIpK9RHSruxGAhWBy91CmDD8KF2MTEDb3VKoeNko5AFzJsZZKrOlxk39xjxwY_c9ZHCqWF900jRN2l5hStgcHYrizRP7DE_ixsgHdp9vKEOZt7VeqkrvetVDLFzpawwtT85dYK-zyEZeqMjVuaIZFXMR-L_Su1RTQrqbViaB-7YHbaPCqlXmsgsQcR4BvMM_GgmCBrbrb3swOM_gFGr4sghxiO2_jPfBXzCjppvS8mpl0IbDB4pLCylhq5lb3Gfo-cA7sdbbMnv-_1Y4vC_T7ORdOLS1tqH1t8r6iriXMDOokwfosNCc7O2nG2p2lYw3ORiOvXMqiMpUNPrLNqtKjQOA3bSh9QVhxPcafGHkIKwLmoeq6zWcJWyacpua3XWNzZvcnRGq79o1gvKr9OSZhDvR5XhBsHMGqNShCBlmTWGcwGxgcp8nYc2hAdKKmpjnOT1ALjN1cX_Ijb7Ct-geMVGUNMHAfMnTd3cmMdDuzgnEF8Yd2hI2J5igZhX4r8UQQsfzVfqqly70LVgAYzPCWpZeloGlObTGKzg8pE28fxDv7nG9Mcgoy5g2ynost6MFIRZGWq5GeY-D6f-DQPmMwUNz4843njkHywG4HdepTFX9dLO-s8jbNwp5TuVP7WNjgKBkaiKTF9fZ3SVwzZw-V1tvf1Z8t7ry3fCC7gFdW4uLjYL39D6YWX74lQA6BOALgOMgOI-_dr-7MGa5We0_w_peiEN-aBOXaq15F1F2KhgljEaQEmbl-_OEi0W_iNzEJtsE-pHquBTw3ulybf8FOpcH4-LSRndGkwuEL6mKYSKpfU5PLkWOVvTTJb5LsVSz-0GtWsg6WRguNSzP9pbVx6-crSfmWr_drXl8rGUur_0DM_N3Nq4I8h3sLQ6dMID0S8qjkAj4R6D85eeOiEe3CeqB-E9lfIJfMG9HbmlXmC1AxdXnab2vpzuX00WnufKBCmgewTS6fIuaz4X0S-bApdc_o4wvyHXh-dvhqIUlXgKzscPy681WWQ9QFgNSMlsdrx4sJIojK4jL3dWbxMnJNTVzdIWGpcNcmiE33luXTGIQ6XTrtcerzxU1jlc-WDMBlz0sGnyfgD965xBZzEWVEch2FOb0ya0ijndH9RRmXYehU7puOqsP5UChek6-D8nRhXnII2Z1nfRlP-LONlTPVtJoLQdlXKs6pMeWFUEG63NxjiCpPxYJd9T7nYCzXLc5pLp2kYgVabIWem6yLmyspggX8_uBmSEo09nFNjTnIqBOoRtgbpZ4GDvxZg5TSKHCCaiv092brOe6PWz4GNxMRYGdh3yTTbzaPDs6c3tvDBPsvUuv2tLa4OtmjALZ3KV_K_gCOy-0W4zJYmSPf34Xq9Q-kaeEQ9434U6mz6yK6BLBz73IvuyyWNrvertxnJ8dnqhQ0BGU9tdbf78s3Bal_YLZGXg9XMyuur33S7L2-YhHyuClpfNf5fEgCrDcnfFMEuRTXmafc5ce6nBZSUY1t_b5fiqLGYy26VGXv78QhtVl88xVebqxcyr5mQZ05n3DsTxAWOFbqNedCrAP1XAfYZmiq5eP6HKZrT3v4XJ8rD2nr8xYCzdsn5l2-lbOAflewnEHSfzsmyECntpsJ5jH3wz4eXmMLsYn9M1_kauzv-UYcKPD60ZaCnylc3Vwu85fUFD_mw0cdImX_lwSE8DgYo1-glZed9Rtro0mOJa8NaBcyGIvCVMncriYuv7XPMfWpZJWGPw8uYt126l_Iyszg4xY5iWataHvPsE09TwQe5OUtCgvKp0ebWmgb-OczT4GbOwY-bJHkqIm7EGg-IXSFVv1T67JIqPl5vQZMNzfEIIslpWY1815_neBUWL2aop0eqyZBD5I7vZ4Pv340-PEwe7udNm8GqlDzROOZrwBBtVv9Vwdo6Sbfh8_SbG7xrfpI7_h2DMoF-rEGfahdk2zN4LAQ3wyrwPRJf3CUv-2HwYVjd3uO-uBuqzwRs5UGZTJfJ-yggqgtDX0gZ4p0oMvhgocBWCUfccRrdVCWGV1BBS7pZBtg4-yPeWh7dp59mVXfP9D2KY2aLHRzhDzluhHkWPn6DZOao3-1fdrpXnd45Pv219Wvr_wA"><img src="../examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
<b><a href="../examples/bungalow.arch">bungalow</a></b><br/>
<sub>The door vocabulary: sliding, pocket<br/>and bifold leaves — panels, not arcs.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrvcttGkv_Op-iSKmX7jmRIUbRk7TlVdETb2tNKLkk5J19OGgJNYlbDGezMQCCzlao8xD7DPlie5Kp7ZgBQkp29LD_YItDof9N_f-A-zKDAjVgZLRSshM1RQykepJJGn4CTG_BWlPizkTkTKIVWogMr9UrqFQjIpM0qJSxY4yudi2Fvv7cP8we0WzC-QAu4EetSIUid_nTfgnSwqKTysLRmDRYzL_RKoevDAjNROQRfCE9kNf0vevuwVMZYKJXQULlKKLUF6YZwU0gHRiPRauMTL9ZpdvHT54_zq3kfhM5BesCNdN6BN-AKU_f2gxRfIPjagDZ6QI9LJTWySWYNS2PXDjKzLo1DqKUvyOrKPmAOtVDqhA2GQPzbr_-E0qjtymh4uelvX_GVzkeQE0olM-nZifDbr_8gt2SeNEIlMgRhUfRBiQUqEJ6Z__6HbMhQe2tk3gdtYGEqnZOEhdmA0Nu6QMuHQJRCuxrtrt50kgpBeHiZbfrZ9hVYkcvKkdZgiVs4gj4rCGsUrrKYg3DBALWFUl797wFzFTaLDohMrh4r3Djx8-z8HOanH-Z9yK2oNTEU4G2FcP0_H749_fE9cWMv33ycw8f5j7MPlxdwdg0XlzdwNf_ww_nsqg-zi1O4-Ti7oRtE9-ny7OJmCDOwGIIhBjqYZQjaddKstw-ZsBzXS1NZIpDewQNaLzN05JEtvIX__HYAV__h_mb9y8mrbw_45IQGaa3wkhNIV-sFWnL-ysocMqF7-3TcFp1jcmeYs1OmxByWIhM5OtD4gDb5s_G10FtfSL06AYeeA9xUnnS5grdwNB2NevtgNAiYjmC9DhIpylFkBWizlqQR0QHmK6QARgcLkd3TxUNyDHmbAoRzIBNKOf6ztx8ekw7UVupVSB5SoEMoPbMBZcy9AyXvSfG1dF7c4xCuDXhKS1egUk2uJ4Ung8PBFLyVnPIgtfMo8mEsGjvOAeexdHBI-ojMGudYmdej0QhyU-s-1IXMit4-CUlRSNoHpZE50kHiBpTQOVUKTgByV8pcgJdj4tg_Go1Gr-DleEwMxuHLtPP3uEMUrk92nuBvzPQ9xVE6X7OMKlGNMUvWvg_0yAg2MD6g_80DWqFUDKqkeQyoqLMrEH0wVUBdGIWwlkrJNXqOG3JyjpbiLsRM5VO98qLEUJln4DAzOm_SQfjGcYVQS3CZUAiO4lRqJ3ME6anKIreDtgUISwGBVENTi3Dwbn7zeT6_SBX1JCRUaaT2jiMzOqHyaDsJpvOmBkut2WJ0vX1YYCHDvTV7huPS2HD-0SvBy_2gPEdovBG078OEgwWxHMK13HA9Eqq3D64099TKKg1CGc4DhL8aqV0IHgFr4Yy2W8httYalDAlCTs9zFd1JfuHbMtwrhfVQG-sLsCi4_vpaZjiEs9DNrPQeucZdXsy5gVBIkOUO1zJ1094-3Amb3XHuOnjpQ_GmDgeZMg4HQg-oxlJ3OqFaShfzUFKTLsS0EOoBOV2le9UHQxVJhEaB1OVIeKyD7CcynCKS8je7H4aLsbMKWFpEyAojMzwJPKOnNTeTGFIvHJxdXM1Oz3647lPJ89FHL1xXcHw2dh2pXWblAvPQoYRPzPoUYKbKCh43lOIoJI9REqdgfBHDhr1FwdoZHRT6ICkOKLCgmL3jtheFU_frOOGOY40zTqyxo3OsNkl1Y3Ophd3CzGbFudAraiRGP6CmfhCsENxfX7jQjolYOu4BdPI7Duk3aWCR4i4U8mDiljlXlETCwez0z7Pv5xc3NMZ0DbOC5y1fCE12UFdwhbE-NLSQwyHzljRmcD2kcPAweU0VqRTOt-fZOc3MWI2WG-FkMj3cOVRwZImp3aMToTrVnEmq8aSJQvEQR0eLjuynq5UmNhhHjJT40rNX6LxyuYZcijWS_tHiu9iMuDHGtlkWkstDW7IyQZlhStRSr0LdKo2TdEbIrI0OlggP_1Vm_ru7dM61UPfBLs7TxRZmV9_D-fziw83H1M-Ph5PJ5Bs61QlVmZVFGmLd3yphkRtePKRQNMhUkQ41VRBKKm71VNdTWfZ0_FQbF2Td7OLi8mZ2c3Z5MYxNazxknzgQlTepfdw1oanVNtxZmxxjQSqC46mUcPauJJUGIufOITmA-UPNvpkfs0JI3edrV3R61GJKtJBL56XOPM96aUQg99PNzlpg1sPE94aj1ayZnH3KzB2phlTbxEbydK4kxqIcRpzJILi2qfYhAhPfMLyTjann0innco3a8THDu5_g4-zidAhznXM7gsur0_lVUyXKKjYooFxs_FD50EPapYSOcEnd1VbadRrH-fz9DemwFlzQaa0ZfOcNhwkVfQSUlJ6JdSmk5XGsFjZvW2AqjWES9oU11arYOSN4eff59vTsL7dnF9dnp3MKVu7xifFaUK3EgShpzRALaua1KF8NYRZlXL5_fz2_gUKwqxcIC7lapcIhfZjpTkJpqVTjjDigupj6pB9p-8JRbAefihWdpt_R94XjIx_gxiMVsHeXP_LxcSuKm4Arldi2Q1-mUFgZHcthEjsQanYH-XR8HBqT85Luh0mlExLNStlvehglUtx_1sKupIawE4k2UmCBdKIuROzBEC7CqUFBB0Q1KG0KAu48bvwdp57lICESHek1Ig-beNIZUlrd4vYa50IO5k7LSg4mFzixjdpMaGZPyyVnEa-I3E5QLal8UWOhznB1eXYa9GEDu7thqhC1sa7ZLcuwdz4IqThgeAplvw1ocGonPBo7XVPMWN8kgEvoolI0r1AnSbylDzlQSBUIqURQ3R7weaRQvwxDYyrx_WYobSXEqv_CNelZa9DUomtTqRxWhjePMDqzg0qqLeQUplpswzFyvtyF_Xrvt1__ucc7Ly2rd_1O5qc5Mk4GfEIL6TDzgSdJr6m79ckftdjCAn2NqFt3cJ-NqZ04h1Boh5RQrjGeAcendDRtYsd0UfnCWLjX1GidWSP3iy7b5nxzg5ws7XxaCoXeh7KCVtLOzaiLACd5A8uMojE9-IWGbQwEe_sHy9fLQ9wLExFpWeAGHoSqkKfzsFRyOPE6wlvHklO2D6XJCuzHhs4DtdbG864MUt-7YY-xnL2PseN9irjTHvy9B1Bp8vF63YOw2k5HPYi7yfiEv4SCX5U9gCeNsNdjROSJIXR9HwaDwSDspiE7w1CUOu_g__Nhfp-Fuk9OJX5Ig1TcOjNlsvtaOkzhVIpV0794Pkkty1aauY0GvOaweQNi1ecyMRhPmst94C-DA9pII2WNRMlXBgfHROpMla4zY746mBw29_rAXwaHvIIGchIYR8U0MVFNrB_NTSFQjUPm3K6hbmcKLdFSXIpVF9gTXSSGOjdPiAr1yheOu5I2zDVGZ8sk5OAahXaw93ioCm7cG_Ygtoz8bYAfqPFYaWxYaTRhMTQdU5Dtbv7xQrv9hwvTR9_Hjx7oIAE7HNorvJz1AH7phF-qESecVsuKZiHeRvrdHZFyoLPGPRd-yVguOLR-yrh9JGN5nft7V7VWeYbpps217hbU3u889IjgsUEUznGtHvyxD_Ob0xzG81WoU3p3I0mpRTU6TtctoIAbWODWxOUhjonEtLMs8qwQNutYnF2YMxpUI2x-ZA6NOG4nqMi-W4Rnfc2uhpfjg4NpCyd1sKVfnjDS-FVGI3r28Cku9Qyj-muMjlo-O5jWUz71Vy07PGoM28HDnvJxv68PW_cIS3uG0b_gocSpm3o70UnjwB8Oym508lwh87dp6e6g5sfPpkkE8veuwgN7LenxhEgrh1T1Qs9K3FccF-lFwpfRyd34aKOOkzcJDjhUEBxoqOBHyUrSUrgrGjqiv4SFHnUFt1p0BV_7KpemY_BBa7BZLmWGu2LrVuyXUNdO-HU06Aq9QQFXxqyDWKbvWJtL_dha1xH7RYB3J1xbJXatNRY7Ut8cN1KdN1asdq118NjaZ7Dkx-HdUaMreq69FTqL0o8IzBmPjxrxNBlud4XjkxOePC1Wj8rY6HnhHwKY0Q2vjukxvNpELI31QrmT56CZOCEFEPP3EjE-RQaVlC0dFCdiMlDL3BcwPuRetUsPXfqD6Tc8Q3-Fvu7SH46Hr18fffMVerdDP40KfYV-R5-j39XH7dj75qk-rcMxBge3upUSPxOTP9aXaSps2DklcwJbZ4QJLUkdWknQxWXM1bQ4ChgPD2ENBId5tINcuiy9yEmNuR3i0irEgRpA4IBROC-2ARX4Ey3eJFrq1V2QzJJ45QkYsSeYOEy8jmAhcLxIE5QBDIog85S-AV0am-6ZU1rueHOh1p_TBkMj1u1aSA1RPJkcJkzCRSmLOgcQ3AMKl57OopY6NzXxqKWO0do-ezQdpcM-CIf9iB526MejVtbz9PUu_dHB9Kv0bpf-gOrXV-kf6X_8iH8bfA2w8m_13rDhPYF_4-VuzRp8t9OxIlQXp1UmbjsL0bbFDnaIWwuUIcBjWVktPb2e_TfG2k8d7MaBxWVCFIXOaLsPvzR4Ob_9dD77fn776fL8p4jEaAL0IsQWaAO-JJhvA3W94oE34B_0qmbgvAgYbikxQ0gvkYQGsXBGVR7hTvi7sO_RnhFADpHdM2MGr1u0gdS9SxAfzWgNUE756UDhisBPAmx3YKq0-Ekf8j3hiM2-zL8AYPTM-PZqQI4B9vmpmWZweCCUXNH-GSySJIxBmASqd2DN9A40qSzg-vzy0_w04hP0YoE4U7ovhY1vORoQzkYAnl3CE-lSWhfALNKTHiPBQ3hnfAEL1EwelmUngq1j3tv5VUyEKEXg5YySOVTaSwV3n2_f_3B1cXbzw9X8lnxx-_3l-fnZ9dnlBZc4S_YSlJ9-IcCsmU2CDfn1XMc9f2rKYSHCy2TICszuMR_CfzOiR69UCRpgvCbhTNvAmV8QLG_ZpFB2A8gTX823QEEDxy9vHdJvAwJtmtvp9NrMkfnb5W2O7h7Cuyy00A2mWE8crtb0TmjczUdw8mfkvzbTdqL-bOx98PseBcLqVj-VR0yXX5AX150oJ1RtkkML8-Z1K-e6QNq-oxBXP5VCr3oBPGOnPAZRO-hPp1MqLMzzzWi0eTMatWMq0Sa18SlHjwK6HCfHLcMvcESxR3Arc3xGx3Ca4d8wqr2ZjvrHh62O5IHN4bSx-13Hte4ZHfnIOxzfHE5Hff45w7_EkTE66RVGcKK05q-Y-WcAQb7NMPHtYgt76XVrvC48wt7B6OD1YHQ8GL_eY1zil97_AQ"><img src="../examples/hexagon-pavilion.svg" width="270" alt="Hexagonal pavilion of six wedge-shaped galleries" /></a><br/>
<b><a href="../examples/hexagon-pavilion.arch">hexagon-pavilion</a></b><br/>
<sub>Six polygon rooms round a circular rotunda:<br/><code>room … polygon</code> meets <code>room circle</code>.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVnrbhNJFv7vpzhKfkCE7Wk7F0KGIHnBkGjAQYlXyWg0wuXu0-4aylWequp0vAiJh9hn4MF4kt1zqrp9IQPMrn_ETrnrO_erd2EA1lRgcshNacGjtSJFyCpUSuqZgxlqtMJjBrk1c7gYDSE184XRqH0bFkqkmIHQGcyltcZi1m3ttnZh0EBJB75AcGKO9LiOhOQcXRucAenBFaZUGUwRKiu9Rw1Gp9iFSUNpAo9auzBhchOCLEwFA5sWr4WegRNLIiJ8mznxhXSQS7WiPRdKofPMuUKPgHeCPoHJW7v8yEJ4j1afMPOwEhFKLf3Dqg1ZG2ZiqnAPPsCXT5_hI8SX0St1tUGUviAtBG09TNrJHkgN0jvG_eHXxfUIUmNsJrXwpKmFsGKOHq10mMF0CZXMfMGgrJXA6HWvDS-Gb8dnbejtgXBQ9kB4ePjl0-c9ghUaRJZZdI5kgfPR1Xgwej6EL5_-DXiLdgkyA6mdzPDv8TvF1MzRwaTsdZ_K7NmEVWE6MnNg0XlhPSzQ_j1QqZ0XOkX2E7ISu46wCMZmaDtSZ7hAnaH2DEx2IZn7K5mDV8Ld1-ACLAoFFnOFqZdGn0BmjAVXkd-3oZB6ho4c6u8xTXxWhVEIufQdU7LXIdCHwExHzsUM2dHGhUUkf6VIE1N6hq5TRJKUlbG-IDYzqWeQKuNQLUN8vTm_vLy4PB-9greD88srGJ8N4Z-j8_FVFya1zJNauHXs2uQPHJhKg7FyJjUrWLR2myBmb6LwqQPckwvDy8El3AFmM2SPKfv0yOFBkpA3Igff6kIvOU6SNlSFTMlPF6V3FOxG840vnz7zA10YKIo84UlG4jCyLx1UhfAwF-_JDE0-aT6dsHOzeco-zBE9KJMK1bk7rcCb1T-1-0gLU-ELa8yc7QrvpU8L1GBL7WAq0vdgtDcc0a4QFgl6IaxfQiWUCsmFnIve9jcpJusUky6MC4TUaId_lqhTpG-18bLOh8LHvGNN9cCBrwy8vBwOQ4pxbPyp8QU_wqhAJIgLVjzrNGhoCRO-xFmxB7mxUPZau4HJA35L-JSgiI7UUctZpjDIRCh0NpH5JEY__7_Kgmw8ATEvVFJnVDQ0SxLYIhxtqgItAiqHwU3JLS9evrwajq9gcDmEweX5-OzNcHz-vA2jizGMf317PnrVhQlnM8dCUI6yViwZ8qb_083-TzcHrBJBltJSz1q74Mo5VS3pu01ZSIXWxsPM1DIImOTGTuAhCyccPNVijs8CFfJUysyUPWQu0bbJQqw5kNqjXRglKC_sbaYfJXW0UKmtUeq_2ZhMMqVAL4SeEVmWhvkPSZWiiZBzj5ZiYG5u0ZH-KKhMpVfKuhoPXr0aXsL5FZfa5xcXly_OR4PxcBUnIdU7cNLDUZJAXlpfoA0Vh8udt4g-Rh4Yza4mHbiCPHaOQrvGjYNiV0G7hFNIwle92tHj8dVw_I_B81-Cb3NYkCsIpRw4L5WC1Eidkt7NLdogOac21g17yhElBGcARVrAH6XmvAuZFVUs1IWxpCi8o0JnLFj0pdXkeaLyhiOiTgOpL4VSSyiEC-q7PvuVVfj29WBE-hufnV_xP92tJkc6JkldBiuZ9dIYmTMfc-tKeytvkSp3bCQoM1SFcRS3nEQsRtkVziRVVOFBwJ-lsGRpk4dqwN6wEbeCOQieTGnCWyGpnyL_Zf9PC-kx9aUViqiGOA0pOVSFKZJmC6Opr2F2pYfMmlsO3dYuKLE0pe_CSxKZ2Q3wubzFE1Dylu6vZ0GuqxrJj7TnG1DJmINm1EAtKfxauyHucSMzspgUsnDYPYB5wBAzznaNpaalVL4LI0GNgsmDNo3NujAy7CitXdDCWlMhpSuhodc9hnlwOE9ySsci7GQGuZZQgpIKd9jDwmkIOOY-WMaJZWy_qN5RAqjTQwy-4MM7bCBnYELKhwxdauUUodP5wxlNpXRhLNeovFEodTRNbHPjifB29IrcmGwLTt55RA2lNlPnbZlSG63EFFVwnaYvTgtM37dJvZyiK7F03dAcENv5Kvlo1l28azE3FuHt-Wg0fBFsNWF02Pny6fMON0F37eXepN301SH5t3bh-cWbtxej4Wgc-4C1XvOEcqPUuuY1ZksjtQcl31OZX4Ih-hwzq-xrrQzBQg5pTTkLvpNT49puFEQCbrQZNGP4tcqPGSyMk5waqHDlFrELr7AumWxCK2eFJ3HIiThkVwHSfEcqC7lh4gucI0xViQsraZ5goUaDN8MXEL8TLnQ1IrZv6VJo45cL8nSF3mPIsLXXtlnj5LKmho-TwQSmyqTvqebPKayF1N0Wjz4745i9Lk21Ax9aEBUwn7cAduEwCSHaS5KTJsRYEcHmvSShTJ6-b5RZt5hcNtMweUxyVbpiAt4waGh8yJ4WcpHSLBHSkBI64yJUCJV3GFejc-uu0G0BzKzM4DBpAWhOPOWiBZBJyn4lNUu3aIVSrRbAlo7pSKEP8wgAnMKTJEnWW-XdtfK4MSdmuPDFz2C0Wq5l0FvBDhZQYzWCU66Bm6gBJxSMExDbddPjInR7WxUzIodWhPj9jRrVNoS_R0n9-fdasusenMbHf0t-rw_7q8Nec7i_Ouw3hwerw30G3YXL0ODU7U0jvGPX5HYQcx9acJOHQhrUp8N0vWU9onNDbCb1P8TeTQ8ewXWvPiLmbvp01K-PiLWbfTraD4x1Op3OxqzLJ__Tq_Wd-bpFViQu2MBwCgdf-Q0bTSEuuL0QOmtTtqPT0MYHzS2U8Q3Y2eD16xdwCr3j-8BSa5yjSFAwRV9R1q6TFcG7NZ7GZ9dwCv1-kqwOhy-uidEKOuGB5puXlxejMZxCxt88_wU6gZEWP8Gds8xOXYFK0UHT-MAqHvuHCXyIq4SHVfyb7dFJthemQvi4AVe9ozmHNgN1_liDoyTyAR4Sy4zFH4i1va9QSB3v9LdQknjzYfUtCPd9CHgU9NJArQ4-Bl1xSZfZ6RQzHt99VMnay8l_YbDFXfSdWA7_gdlOfalH0XycrG6WDh1MMSMCm5SCEulSra1NSuwKkVRNSfhiZ-0SPIJeL0na_R5RDKQItvRSSb_coMfeV0sW1LlBr4K76MXQSHYmlNqphWCAVNq0DJPLBnrd8fmvVd6gB29dob_mO6GTqOAn6LePntSaY4oRNLaQwVC78JI7SN6mmDxfy7A0WMVRqmkyf44Nps1Qhztcmp2SWewwtIm4CkUOrkJchFoRjQa5MsZ2-aEAkJ0GfLb344QDJdSQJ4dxjA4hx8uewFUQZQPEorDMSK24Xj9hnwtYPV58rIERy5yfWysYWmNlp9k7dlujoYkq4aG_HzYnvgBKSmvMTDGLMk-MhqdE5BndeLow7tkEfNyJKOmp-jb9UjPEUKI2C-RSEgaWTIZdWoQNizNX9_JcQq7PX4zPeMKI3aJYNX7xOa7OxM0DBylqb5HG4e494pKTB7fpsKKiQ6-kZcU12liXXfiCAWsBZHZq-Lk1_TkCf9Kor5ckSUypYTdByUfqd0rehoA6OmQniK8VF2v2u_96v5HiSVJDrGh--zrbvMkEHR5_k70fpr6hw8dJne3C9cOt69GuF3XLRJUr9Ds8GAhuo0OJ5X47LHNqinVzwW093y3ELYKIqKtRL8wdoZsXDb80oa89E8e0-vvgHjKP1E9PoReL_LbE4YGQokLGjKruf63qj022iT3wdBl74JPYVi4khn3bHIUrm6U86YTSxoOw8-MQIeiXg-fDCPkw9tB7Mf-ENQbvtig2OPZWjRYYC2Kriw4y56XV0pcWOSUFf4j1i7bb_DnwTOs-b-Yd7u6YOE2pyLNAyM8URHc9cvm1onYflUrYDOiPNVPcohJGo_gKZBj8iLD7dQxtAdI4ixbiGwGyYwZEbxaB6S3EJ0ly9yS2SNtqEE5qgPh2D17D5RaHB4f34lVpcKXwJmaCfjdg0G7QKlUh1uVR_zCgkS4f_5W4JhcA4a_Uq03JX5iJ8Y5Jf8cr21yZXOzUDjreWKCAlRm6rQ3KCUwi3xPI0NLWaS2p8zhUz3wRNO6YOrwfawaZ1Z6aJ4NUeKHMrCTXl3cs4tTyjw317iM3xvO0dq_DOqnfA9TlPfxb63e98OFsTr18r1b0ERW2Rnf3InvaVEF8gw3LfQv5cf97yLmVNBzFtx9HPu4dfgc5NSXthaF-_8o5vFlsu-wRh8DHtRmq_oGn83-9GG-w2pjUP5V96zcbTmZlH1Ka2R3c9L98-nzTf3TdrILDFwx9c0BfHjy6Pug2m-AD3vEsY79GmTpXYvbz2i6Z-pKN6fuBazo9LgM_8FPlTa9dD_d7Wzf6zY1kb-2Hvji68mn929fWzf3tm_vh5v5f0jrY5u4g3DggWgebtGj3Ib3CWNUW1vyBqYcdWr12wj457H1Cvubl87vpEnbqX7DjOdWSnX7SP-okx53e0Q57zsfWfwA"><img src="../examples/terrace-row.svg" width="270" alt="A terrace of four mirrored houses" /></a><br/>
<b><a href="../examples/terrace-row.arch">terrace-row</a></b><br/>
<sub>One <code>component</code>, <code>place</code>d four times —<br/>mirrored in pairs, widths from a <code>let</code> array.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrbhs5sv7vpyg4WIy9I2lbV9uZ2QAaW5gYJzfYzuQsDg4sqrtazXWrqSHZkZTZWZyH2CfcJzmoIvsmybIz2fyIJZv8qlj3KvIFjOGfwwDW0O_BApb5LJUhpHKmhd6A0CrPIhAQSh3mqdCgUUQym4NWagH__r9_gU0Qbl9PJnft8bur9t34pzeTW8C1WCxT7By9OHoB3Q5cfrz5ZXIFP0_ev53c3fytA3cJNqGkAQGRzhcvQcCUf0U0U5xCrDRTiVOlNAji5-gFAMB0JdJ0CiqGqdDhFDCaoymXYxamyuQaW_x1KaSGqWfM_EX8mgst80VH6DCZgsysVlEeouk4bGKQ2CHGrt_dXt5c_zS5ApkxVncEa_pvASFmVosUZmLTAqNAWtpgRTbHzIJVINIUYpVrWuGQiWnDx8DPqDfl4qWSmXVysIlGk6g0-sEdnPaHSmeowSxFFmlMDZFKUXxG42BP_tkdwKIHKMLkFGaYqmxODGTKCZgIhkLrDf3GhAlGeYqg1copwwmbyK-0tBYzEB54cv3z6zsQOjSghU2QpCucHOxKgcGFdJsN_84kYomQIUamBRGmcoZaWEw3L_nPIhPpxkiPPdcyghkmMotgGqEJtZwhtNt_Nyqbfmdg6u3OSpVNQQtjUUuDJCMSI8zQrhAzkNbAL5Obu-vLyW3LQRu1w14qNiBgmYjMknklSkdgrBZynlgQoVbGHaGUl8al0pZ_txLpA1jlsKUFYWG4ZrpW5wgpZnObdGDCWA-IS-PV68jIzMgInTZFiIRgrMgiNtcWEXPItODqZvzp-t3PpAsZYWZlKFJAyaJfiQ17ncN2UGwxxITQYYsYE9kGvii1cO7X68Dd64nz0Q5Ml2KJGsY9SIl8KJY4he9hakKRInRf9oJgCrFcY8G_yDJlWQEMDUZ-QXj_zntJAUwHtCgickYBsRYh7-BvwwAWMMtlSt7OZyVypQGqhWEOUpxjFk0dcCzTlIWxEHousw78pGwCVsxIj0IjxHmabiBCLT9j1IJM2UQ6gw9VFst5rtEZnIOFVBrrjU5lbPewZHmmKSTChgm8Hd9Nbq7HbyA3GMHJNFRZqNHWApBJME1dNIkwFnlKThuyg-pKfUuhraTTm1M-K5EjUstUhBiRbG2uES7Hd5Of39_8jbzJQiJIi8tUZGA2i5lKWcursAUzYWTmbfpB2jDB7N7I7KEFocozi7oFsZbRHFtgrPqMHfhoyP-cvRAD7KkkOQjVAg2o3AIulnbj7KPv7GPy3x_eXF9e37lYDZfjN2_a7z_e3ZLWXRBSlvTJn2WKHZhGcgFaRDI38CMJ8jp6BQbnC4pmP2avvCpZ37Q0kmKBFjX8SEq_jl5NwYoHhJ_e372GOaoFWra3CCyuLcRaLVwgT5EhbYIbyMSCTuod8eY8CILykByMkc0jI-MFjXazxMixakDkVk1BpJR4NmA2mU2QzNmwjm5ISw726vr27vrdJUc9OIkwypepDIXFCGYbT-Z7d3KO-jaRBpBcv007fCw1lox4jpbxTytpsEUkkq2iSqxKLVqUYJzbLVSEMMutS3JmyvbApND4wGuFZcGwQ_jcknhtmQTRwkrlaeT5cLF_JW3SkIZZsU2R48atQpIbCJWxhVMV0DJFn99U4ZAk6i-oVVvFsUHL0lGUEUPboh1hQstxLUKbbmCVbErDDCmFaLn0mfzT_dX12_vrd7fXV5MpKF385v0vk5s34w9TqgrqhMieDEXf9-_coaWFBQpK98aZ9RWSI5bygekXleHUsBwjDFOhOW6wncgsRq3JOcnmlsqw_7aqnEmhhcgfvSgMVYaUWgRFZ-MCze0vHLJnG4vtKm6TwMnhbIKLDoxdVNuAiCJazEyZ__nfKajs6MVuCixN2-Qzq6xIYa5VviR2fCnCuaqIpp0jjiDHN76yuqE_vnG13DH8dgSQZyS0xeII4AVMOf0OgynHT-gGwcutCMaS6wUBWXj4UHFDgRD6QcDWL4qYxqA-zE3jNDfJFMRcUGqobeO8A5ROoNPpDAMIldKRzIRFOOn3yKHb0B0Gpx0YuwJBxYzcDWgtWTRxi-ulRk7YwrpESNx5i8_E0gcqF2xnInygGk8VuTztHPnqYxgcAewmxSOAWko8AsiUtgnkyyOA0n2ouuOF9WR2BD7nHDHX7Xa7TVVGHlrOSU4IMoPpQlA1I1IoM02rLnqv4GamafO_I1dFgoz-6uBwTVCcpmT4kJFc-kEAOxTgNzgJWsEpnAyDIKh_YsGf0l_9JyqeEX53h7grir2lzJz8zEtYobGwIjv7R70Ohn8ACv-XTo3T1T1vKE9Y45Us7Dc46Z4VPLlPnpPfGyCMfQCk3y9A3KcSpDzITGy-M-DKPT5KGfd8xZ85J4zK8rIo4pvH0RjfG3j6QOdOso6d8z1HSkSa3mdPA_UGdST_zR9swlnjM2qLa67-V1wYZi74sqm3h4FvMoT1mZPj3UmPTKDVHTEexcfBeRD8ZTQIApCG0QX024P2kCM2ZTbyjKiWklzyc02CMxxfkrpU2IFPIn0o4iutn4xv71y4YIbqhj4Nw9UUdJ4ZZ0ftV9732q-cybVfgVG5TYoMs8ytq9vLtskzbaE3_BOc8O7TFgyDP8EJIbi67Iz-xkCnRV1DKvnOwM3Hdz-Q6DiXUzqTs9widVweWIe-4IebP9sErQCOLMIS22VSscYV_02rYRN7VNVH3Mo5BTuF8G-4DuldnAdB62JEWirqLtJibcWwMrFHVgS9JzCcqXljOIDRI_s7PcSHN9D9K_gshzDqMtha4U2eKxCKMsYXNwL6sAAhTYqgstKhydldZZjKjItHbpJhgVSauV5OFG34VsRisMO-GbS6g2FQRS3_7fd9QOYJoLMG0NmwdPAKKRQx3iMcjDuDQRED3ae9LOEzzuaV4M_nMsUhMPMMsLMG2NkeMGNF_FRobcRAD1ZGxDpYqmazzfPAzhpgZ3vAVuGKZX8Q7KIO5r7tzWSrcPEk2GBYB3PfmhmN6wuxxqIKvbsZ88CmKDm4ZqQiKks3P9AkL9ef8TtTuJTksEYlDWaGWPD1BSH6cLQmBwla4KwSnLDAWRawsHjZplhGXNJq_tFzy3p-b6_hwcw7F00tV9i6BisqS3df7zzj3xHAF-6r3ADz-AP_PPZHcCPG6K-acy1wkLFbaZUHGxxv1pwbIRUzTOF4QpVNFiK8Fml6zHtpRGCAYsoGElcD1mkUg82iESRSjRxbC2cFlXrJflzfcdajHUxwD6kwkWmkkWczVQDh-Rcfhw64Zo0UhC79ju9M1Rkweio_U7PXxHdxy4ur9P0t_H5dXJ8oRY9pl5dVIa7aKG_7ECLGUidl_VYR6e4eQsQ1-BqRSGa7h8D6IRoh7bFDTMRXH4LjTPMQDcPaI6lLeEObjrcP8TiRVXi_2pKUjw1MhI13yDRqRD6pBWY7RFbhLvaiwr54HvbbJvIBbFFiN2IaYw93scdhiMZImlp9ujzexub4wf5urAgfDBzf8s9df_d_d-b7hGu8X2IGBRDtOKcQ1nVFChM3Vmkxxx1_j5sR5UA0ucEYNVI4qRNyvn7W3UOocdQ45pPG8d6DxnHTxs-2bXw0rHHCOPBJ6QfNMYfpqjiW4fb5_NjRKW-w7Z6jSo5194T_cruOC8V5lK3oX9Xsz4_1e6P_i8aVTe0Ghms96ks58wrrxm_UdvjpRckCJVCNPIu1CmYIYW4Z2SZa5fPETSpp1mDKqy-qVcuxSHGX4HI8Uc_DxC_2M2TXxrt-g7ENhsrPBN2gzt8LFO2_UnolNh2Y0DH4Eqvs7twccWN40KSWmPmO238k5SnuN6j8URn45oNthLofgJWMbEKjgmB7m-9J3Tb_he48gsPbmFq2Q633BDXfSrtt_stzqa12qNW3kfNub6Me8L47ctu4peRt7K31baVVaVrje0RfYGiVWyRhk4IINrpfCJlBpPJZI-X7aq2Cddbh5jZm5UZ5VoErTfaqoUzyFcMk0_OK3Uc1WGYl3sr9NKtjWJ109Ig6XOAsthZUBxzMHpet23bvM67bWjQaXjWPs1wc9L7s4Wqd09O7qTMqUn1x4Brp4UFxuaaj2F7fzaTPh3tsw4VQcn-D-rMMnbsaf6NKQbAIne5GUJD7P9D4moxGxc6iHE3DV7UpCjfsNK6xZdNwfW2otJaRvy3kol2tsgZhUMWEkxW9EW72UFlowY3nYkdE3UFlUlR0gUnp1lJTUGsAsagLNIbxbWlDSQ6ibuJVDqiwihOQy_imsF9zmW5vn8uovMkQrqW9b2CMvhrDWYDzGD5T0Yeyx2wJpn4q3tKAcnUagxT9J4l3WPnOLgrt2QZZ7IKcPQWy2AYRezjpBwfOQ3tqKXqeii_01_Y3_aPWV2aRWrGSRrUqwvPhbK9UUnM9abDc8Iz1ve7O-v7B9Rdft77PpeHz-Qlazh6fi18acLW-d3i9bzaeyY93kmBYc5LRk-t79fUH-R_VUt_z9dvIlYf1G-ysP6yvr10_2lm_FUSa6we9J9dXDkVTeq7Zao1eC_iByGzjfvrqj6cVh2reMRiZzVNsU8OAG_-CgOvISIuVgRkNSd2TAvMD3are3o2vb-4_vns7vrt8Pbmauvcjizy10oMw8K85GvfoI4v8QDuWmoYQqLnuMZZqUbqBsq7yYbWwW3B5UTQegyBYc3MQSe2uzzDFz8K6AJXKuLa9H_D286oz7PWCYE3_1cQXS9umK9VvjkcvoJi6-IclunijU4yN-e0OTY1Nix9b8drqpcGML4hTFLp8I7JMJCOHIk2Zy6I54AKqbDVIgnGuM8nXk-51hotbJAEajp_69sq3qbuTIt50_BhO4FrXXinJi2_BOR98Kw6fqxeclzhPnYuAyEbIFYJOZ-gb3gqcvCoug0HLZdfvQcKfoXZsznTrUUXGt93chjZJDA6Q6J5X6OTlLXbvajTiphfbPf4-Kv0dKjUpVUT8EPWi8iQ65bpXI3NXCPyZYL3-14I1RdwEO6_A-n58U2B9kKG7dVdqv6R3lRmheXAhYFATtNNrjRLlKJqnFJSu0DwcPx-q1wuehPoafe2hsMVrd_Rsfe2CjZ4DxsOUmspULIphVM_N2YZVMKEiYX1RdwalNzDDLEyOH4XpnnNuC2pReRsGhZXZ_HEIV459NYR_4VY-IuFsWo4j_FMgrhMYkz6tzyrMSfZrLrVEc0y6LBvsCp-ypS1PyRHqIqhHKEbbv_cR3nwf5HnrP8rbLWq6sfec0S6X4S6FFama59VLQcOPaak5nBLS9GX5HG-peYjlLs-XNik7SualfBNTTJroxbNF3ba5dk8a6DlgdSXvxmPFU7qCjccSlR_i1oLAqKnQDxqXxwc3D0Zfsbn-9LEpc9_S-XeH3UL0HLFYuFXTuas9N5R-Bhxx-Dice4EJz4cb9g7B8UNO-Aq40fk2XANvFT4B1CuAupxFGcn3o38IpR_8J1AGj_PCr2K3fY-nHoX6z4Nv2HzRpPwHDzCsoyz-IMhZ8B8AOX-ck73CcPfchR6Cb9jca1L-g_yPhhWIeA4Hi1oMrnMgGlcPSK8IUxlK667Fy6rdwIlB1wok_lV78e75FHb6iNo7aD-GLg4Q-L-WT5_Ly2Hiw0qboi8vllr9HUP7yNtNXkINXXY_28DxWIfJG-GyJUBELyePe0Fv1A7O292Rqwp-P_p_"><img src="../examples/library.svg" width="270" alt="Public library on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/library.arch">library</a></b><br/>
<sub>A public building on a real sheet:<br/>A2 at 1:200, axes, schedule and legend.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVprchu5Ef7PU3RRP1ZKSO7wTSlrV8mysquK4rhsOa5UKkWCM6AGKwwwC2BEcjeuyiFyhhwsJ0m6geEMH6KsTfiHHBL9daMb_QRP4BLOI1jBIIIMMu6MhlirWBfGcrC5FA7maxDOwj1zHKRQHP79j3-CSzm8ufm-_f7Tm9ubq_abTze3b2_efQ98xbJc8k7jpHECf1IcFix2oM09U8JyS3TLVEsOuWTqAhg4w5QVDlImJQgLbqlhXgiZCHWP65kDmzLDgYHRetGBu5Q3TuDTu_eXN2_BioQjlXWGc9cCphJgaq0Vh4ytwTr8Qij47z5QbJvq3Lbg85VtgRPxA3eQsTgVilsCBgRtnGxgc8ncQpvMA6PwWsk1LNkaWGy0tSRxyivtdOCjpm8Sw5ZC3eMCBlaoe4li96MIsgxyZpxwQqsWzJZTJJ61wBRKIQVSLwop0TIZLEXi0hYshUtBofpnOue4bmYhL1Scctxg4wS8qRjMFtrMQGqdXwAX96mDiWeKbCxtBNXT7flvl7hVJqzkHXinXYoScGk5_KiFos01TsgoKZOP3G6sb7hjQqLiRb7RjuXmUcQcaOdz7VKwTueQcJYAc96aSyalPx93qeEciCUyErY8PqVWbaqXMbMcFtpcEAnA7Get-AzohWtyJhL4FgoVPpQi-MMrLLy9vrq9_HD9tgWKP3IDQi24MTyBhdEZQdZfubZkmA7cOLKhBRW0corsPv75ewSdrx1vi4QrJ2ImyTq6cCDcWQvmhQtq234ZrTOwaLBCcrg3usit9y5vXQa2mDvtmIScG8B9-nM3S7iNjZhzaLd_tFrN9qF5ro2zXjn2r3-b-dOuoZnqJWRFnJYKWkitTdCv4U1_PA1nSQv3STJkHa9oMu1so-iFLkxp9UJhSECvxKM0lzp-8PS0KGUqaeeSxTyhTdsOXDMSQbhv7J7werGw3JU2L73AFhnoRfC5_567OV9ow0G4Fu4rTpm6x2WMfPobCwnPXbqHnWk8s2j3NbGHOZd6iSpHxaraefeb5jZmkjltLMBs8wD__se_IBEGivzviV6qmTcLl_wRf55tNGFTtnDAWZy26PAob9lDpyFO-aPRym5859P7b9--A2aMXnbgT2oTNdrWacPXFDBxIUY1ISXhI_Eesv9Zz60zRewgFiYuJMND_TuYfZ5-vLu8-TD99O6Pl3dXP1y_nfkjkBXSiZLVTwW3uH4PmpRGXrQQhlvAM9SBN-joiiQHrhKLdmOq0iWphytnBLel53OItSwyVZ4iUkG3Bxl4sQvDJNwb4XUzYytuZzAv5nPJLSiW8RZIPM_zdQh4eOC1Qj1bxxzPuHLkRkYv_dGkWMi5glhrkwiF0bDTIK0270IS-oFJ2YRfGhBOeJY1AE5gRoIMo9lFFbm94BhEXSrihyoEplxKGEQRnVMGC7FyhaF8h_7A7plQ1gEj4AWLOUhGOkOLdzqdYVQTEBh0o8jrIdaFTPxOVrnh1nYaAEGwBkDOcLeXPQ8Xs5w3ANACHLoXvQiXKG1cCkXeAEhEZoEVTgOTkhaGsET-2mgASO7gzeVf4BVliojMf1I3zpytq7TIVsKSMIHy-8u7ayQdBNITWJfevEmVDVJBu91uB6WVYFWp0X7RqwGUXEAkrzwgXzluhDbeRIpbi4aBjOHXTFKpY7jj8AucRq3oDE7Poyiqf0L58WnzKZbacvhSY-Xzd3Uwasww2xM0qmOD6R--1LYfYjNWHRfbifV0ya07O5xfTznD3w5tfzn1KNPDcvW8XGTYUjb_EHa5vT_TPYYStXrRkJTkIcLTDkTvGYhxVIcYH5Kifxyi369LEZ5IyxUG6m26PIYzHtV04h8O6oSQjmp3UjN2eDiMFC-nFp5H6nW9is7rT7tQ2ddBTbagJgeh2FdB9Xt1qPC0DWUdWyym9iuwRltYo2hjQQz_FJYBVlhIRi0flVrQG9AbLW7BYEJvIwKAsV9CcES7Lmk9ER2zFgzC73WPpDD4wvBzMCCdwO_36iZKXBxdWtMblhS-M-LWAU_u-YXvM3hVNcHb6_d3P4CwhLk0wjmutkshX4Do_CVFz6bKwyKAoN_fXr5r317_-frW13WUWIWDmCnMPQpFFIoaJFYW46fX0493H27eT99df7w7K2tP3NGD0PbBp0osgpABiknFr49oZeKRwjrKgqghvVQtYAvHDS1y1CggrwTrPGYcpndKgD5MkgaZq0LtPcsh8r1TyF_-9FANLpJXZoqa6oIVP3MYDaMIJJtzCc0_oMDQbUKB7apeLETMD1D2nqLsPUfZf4qy_xzl4CnKwS4lnWRUl--Omu-ZSJp7GqDfvNKiM49NrrLyWTuwQFq4KmcCgRM167XCcotnyGbNT_S-zzf8jpzrGchvDlmveqOaAB7meRF2uEg9n5O_b4V0YrLP4xYXNzdlLjHY3l4dehlPl0DQ9RhP0F1S4LgG_fkKPuuMq2YNehnvI2Z1xBDdn4b84wbwaUS2hTjZRawb-TKOubViLjl8vmrWICurlqVH8w2LH7CWS3WBxtjzK4z2UGcdksITrD_S-g9aZ81yMwc9INbKGS3ruKNjuFdhvUc-4B8h0v8vBedOpJ9pBd9h3nuNUn6Xa_t6Bo494NQFbm_urj9c3m4GDKE9uOeKG-awUy4UqtVPaYowLCNcNrdaFo7GIBkGX8dZcuGnH1ooap1DB0U7QRG-sRBjy8VpW_M11rq-ePfn-QRO1_CK6vSzMGWgjB2mUdRi-YY81dZ14JomSTRPYybxUrbw95C5qilSA1BOEDh2izqdSTghYWpF9uujteC3IOA3lMBbXo4Qr3FcVZOF7FXRi-SVpu-nxFOrsAyBB-dYT1RRf8fMBnNX6EKMRoX-CjMnND9JXiXTjAkFVoqk3NZgWCvyvBR0Imkz1JE0djfisxBtYlOxMwf93jCCAIEKOkTW2yc7Hz9P1t8n646Q3XGywT5ZrzfeJtuloxA8VZ4ylN5oJeoJPV0_2mfnyewuWY_S-Da7yhgUkysKr8VhxQgDBFg_kVVOg4_iuxDZLkQXm5ljENkuBNuDGFVyd7sHIJg_pltxNYSNXNOMGhlYHJYPIAOf2Gho81PBizAjVFzgRA8kZws_-l5ynhMwcRIOaz0pEj7DSGOBSR1mzSFcOMMeubFMwqkfFDgNVhcupSnPGcUrKkhzprgk5MQIrDSJARVzWgofyObcLXmIDTg8ph2AYSSjSxlVawxibRQ3nS0dlgkk7H1Hm72o0uY5KhO3BAaj0xZKmS6eQBkcQpF84fZFmWIY9ZVEaEwmw8rBaYxeOXgwri5cLfbcS_Yzfvt_aCauCuOYUG3iOGfrTeD3JbK_BsGxEkswPoc-AZgNC8j0NTMQqOWPXNFobDM6w5Et9Q8-idQyDG3zaHbZzQCDkAGWQiV66eu-YS0B-GZto9HRdsiEMHnCIrBNbYc_nX6Pu8DY3I0r7FHNUv1DuKEfwdEZtSot34NtwL_s7KV_YC-Tit951VA-vZ2T4FaeSeAY0hIqlal4b1_Dwf_IBGdFB5hQp15X3zh6UmPbS70vvHB5d_y06xxa3xu8bH1_UJOnO9zLvcEhH7nx9za1Gj904T6Qlfd-R0cAjdp1AcYLbuPpphEddEmeWoU6iKIVSkkXCbjuEH2Rh9J5MDhKT0Pc8v4BkFqKhZui3P68YN6qk2PEW5Vps5y6hmEujRv4ztzcj-dxfA7PxqW6h4yChwR6FAbHyP7ovrn8SwvGlVSTKFpNwvBlG2a4D9PzAHWo3hNYtT0yJRwz63IO_-uGOr68L2f3dKa-E8nr8urquyx7PYO8cL5izgWP-TcWrq7f3X243lx8JgLL55hXqdfPcpiUv_NXxniFhZj-vo3FnCps-KlgxnHTdoVRlOxPUVMMYuaY1PcF3mX63Z1tUBdau9xgc0B353hfxDFbJ5THld66ZKCpEHbUi3Y1mhN2kz7omueJqL4ojBJ0w7GMYUtD5WgzKInc0duOPgpVFWHPwWTPw2TlIdoAzZkVaheLWoUSa0Kpoi7Ii6gnw5dRb6lji3X2QuLJ8EniZUwXdbvErCI-79eI2ddwrhFPulvElaNVfxtZCNfGy_Bf7Wh32__MgDlVxmWRuWlxy4qkdntCo8eZF3VW3iiXfud76a2ydxPvtzw29MMYVWZ0L6c2vj_zS-nG3NYAV955W-XccwQZzJl6AJszZaE7bvf6kBEu9dCWys66q3e2DBHrQuH089D5C5bwlbCfmkU-N5Szjx0FNr3BvJ5eymb0q9n4a15mbRn3Em4fwOJ898cCB921koR6eWTbglhyZvB7P8D2vX2eG83idFtJhBfy5ZAmiV1f8FVTPqoZyiHXRpKmb7g4_nvG-r-o2FSbqkAq0_K3mFXDHPx0Ba9fAeX18uRtzt3Z89Fxjtz2ph_-2iKULVWiHldSk5TNJ8Hq1acHGxLWM2Bf9hVJg7VerYoihP6Ozd9y-xAMTd3RUZzJV-GEVq0WSyQNm5wu4vSi-u9JeZcQ7kI_X4VWeMnxHwTY0iyFxRhmwmBnSzasARdeZf6kDKLa1HvVr00kUy4fhbovt4kjmi0o_M-AC1A9whpvsEZRtBqVIXKfdEeKXu_8BVL0jkrRwznrU1L0jkpx_hJd9I9LcX5EF_1jUvSHL9HF4KgU_dERXQwajcO-NB5Pqp7Dx5BhCCFETMftCb7jyaS6-ybaYRStaABVo20AOOEkD9EhN_pHHjto3mAUpos8XiVS7_T0N6LpfA3NSxOnt0zdh-8xLjZ7UW_Ujibt7sh79ZfGfwA"><img src="../examples/transit-hall.svg" width="270" alt="Station concourse on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/transit-hall.arch">transit-hall</a></b><br/>
<sub>A concourse: paid and unpaid sides,<br/>a generated run of gates and kiosks.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrctvIlf7Ppzgl1dRQWxANggQpanZcpbFkWxVb2qLpOKlUVmwCTaEtsBvpbohkdmdrHiLPsL9TeYQ8yjxJ6pxu3HTxjJPoh00Q3R_63L9zwEM4g_-bhLCDcQgbKMpVLhJgfyqZFuUGfv7pL2AzDq8-zn97cX785uL6_cVi_ntY5-zWZKKA_v1wEI2PBr3D3iFc3HO9t5mQt8Bzw0FI4Du2KXJuXoAwoHliRS4kZzqAFU9YaTiU0oocCIYelTN5W7JbDltmBnAme4fNcYShJatS5Ck-xe4LDjZjFu9cXS9OQVgDCZdW80LwhOP3DJJ9LmSqRcJysEzewV6VvUPYsvwOmFalTANgMqXNXgNrraTFU6zU1gxgkQkDRc5QIK4TYbiBlbIZJKW-57BWemMQoncIUrU0UJ1N8u0pqQiA6QT6u2B_BJqlojQwhz8k2_9Nku0f4Q8b9lnpP-Iqr3L4dPbuHVycv7kI8Ewbkr_Q_F6o0sA915bvwCpC_nV_FkVRkgPLlbxF7Qid5BzUuj7QAM75mpU5Hv2rkDlshFSaZLSllqiHZZJsl8AMpJpt5YDwtFKb6rnMQj_ZBUlbIe6PwavL-auP787m8Prd9fV8AJfWANOcoUo3nJlS8xRdLLH5_isO2i_E_L-jowAkv-e60avlxvA8Z1YoSV_capF-BS76EEs_s4TLZA8523NtoDTcRcdiq4Bcw4BVoDlLQa3X9BxUjZC3A-gPj2CRcedWKaxZwkliWMw_XqBaDYXkh9--geXZsncIidpsmExNAOe_ew3Ls_mrJXBphRXcLTWKnqCVLWXKvMS5UneG0C1P0QJM7uHPSm3QPP3oCJapQIcurVpCwqRUFpKMCYnugkcLEFdYSMWGSyOUNP4ppUxrITOM4T28-eHFoncIcTgMx5Aqbk6BSVjOl5BzlnINBdeQCmOFTCy5DukRlkUm8Ol5fqxKCyzRyjhU9JwyZ7p3SJ4UwDYTOXfZg7KLO6wBY9kevC2N1UzcZhbFZik3sM24pk17WHGMBWemS2NKnuKuswhVMzyNwjBwz1XyHpWrJMtJLIxEw6V1HrNGz68SSJOjMgoiI_7MA9gKm7kQVkbgJlzBdtw8OqWxukxsqVlOXghK5vtBj1LQwVumV6rUcObz4gH8Tw-glJi_NpseuB3DMOwBFAzVexZhXk1NwgreAzAJy7mTrAcglbYZlEUPoDY7sDynhRlPy5yTnk2vB3AIx8fHx2AynuenYDPNn1AtGhBTjHdj_Hj81B_iESb6vFGlzY45MxYSpSXXlO5LLdFFMY2jtJbrVsKaD6MwDEEzm3GNyVbCRlhMCj__9BcCtk0wPczsa5Y4-3DInEIHsMRcVZTW-xkVkso088s3bxeg1g5Xs3ueQ985eZ7jWbGe8BT6kzAMwyA6CcPwCI5fQn-MH4Mxfn0UQMYZOYaTd8uNPSIPTjJC9jVOSCNSErJd8YIqnp2mqTrB9cfFp7P5-QA-bFmBUWlVlXUpGjnhGrbhYLcKuEwLJaQ1cCvueeXYCbvntd6lsZylgx542dLvyd7Ad5ZroVDVIrmT3BgYhSF5H0A_DMIj98lpoHvl9EHfUAlsK6XK_M6cybbCc3fpKsmVQUF-bDkhHf1BbT8lb1uXeV75iUvvWwWGb0SVOlwufeSEmhiDRP3h85bHTB7jabHAox8UpS6U4aeYB3FB6gkAWl8La7lEV6VaslUEmrH8nhu0ijDezHDHeWEAM_EeeHrLvzWVAu6FEaucmJN1IaETPoAfkGowl60INfX1mcxcO8UDR6RQOn7pHA0_oK_h_y7gj1_SiqDjJUvM3Xz5YmmwIC3R_xikSmmUXlgqWwbYLaZXC4u3ZwtIBfE6JclZW3Fhmbzl0hIus67QKaW3bH8UVFUb1SUsbFWZU85lTTLRpRx0EoS3JwaIQ0ZHr9xXldoQmcAk6CQmL4f-yLlfRI5GsqpaXMyn1tERv9XpprN14uLWqEoVzAIXlHIoqbpza85ywiS0FVZCpvf0wERJyRNMKuiFBRb1dmxVtblg2grPParwiprwGlHADMfdMCK5_LeVF-HCZkV734MV7WB6VHmeydlf_muJVVvlRj4vGka5N00_GrYM9ePTSNGXoEazFkCVdr4EZ758sFHYRvJXNdIXtjpJnpfpF2XArR1pfv1TJ-7MbvfkkfBrtef6ZvtFnLa4_mocPoPEv4Q07iCNu0iN6xG5-Ge87RGZ6BDXuo4XmWh45PWVy0SCbbjlGpmdVuVt1q74SJxdqhaeJxI4Ub4tw9IpLEV2zSFd1EussT6XYX7YCsNhxQfwXt1XXOPq7P2FL_IuM5Y2U_pbA5_VyuXNRG0KkXPtybrmuUqYRVrV8G1MYht255_rmGfOVjynROWpj2_0sHUVEmnUDxfvrj-1BUW67EjpknbDzz_9PzC7PAW2UljXrGO-yzlmjIqxE3yf-rmmefKIZVFlZaaTbw1shGMbpK6cW8uRnmUsX2MdgEILiT2IQkmFxbRIEjVp8Ua3O0WXkR8nMyc8HFwnnEmYu60H7S1T2lJi5545cls_iPO1b-CsYzF1R4esHSiudhSI1WPmuOUNy3Ou9we4kHBzgVZuId_xvGiQ69D-EvJvcMtrpbmxBPwMsitcFXKdb2rkISplh-EPFfJrkVtNnYoDdsglTmTsvi6yWKJcPFZFnvin2vL0CYa-Vnmutg3LbsY6zNVCnmCtds2ZrmIjyZnYwDrHWnr9cfHh8vyiw3JPHSBbIzPyW1TpmQSmls3f_-Z8foURPZzMBnAGS9JNofL9rZJ122oxSLDfZDpZEtvyvaup-gLk2RXzZsg6kMfgZEVg8-3TBdNJ4BnbdBD__a8BGMmKgqcg5JbpilRg0wWbDTVgRF7gUppEixUtbOvJgXKG56TmDrjGIF5r5shUKbE37g8nJwMSuBpXECqGy8CRopr7EEiSi8K0wm8ttLEQwYakxmzgZ0bYiPuAO4RLCyxHEsnuuNvtjFP189xTazISw37ZbjmXfnZRbioKSbXBoEvunG-7DCdTIN9HDauCy0e8rRonCNN856Y9aLDWMehhreRJTY03GdmlNlxjIN8euXxoxaZ-mkuvXFoc0zTjC01zkCoeKKXjHKFOot6OKxQLBwfb-mSBrwcCSZRSeHutfH1AtX1WQvK0neMa63m_fZYPdat7dDJrXUzpIqp4YT-a0BcTdxdXBVO_NB7ihb8zHoVhcDJyF6NJGAazob-glNl0X_0IYYJhOHP38VDBcFhd0eqoczUO21fxsL1vMnyIO-089yRsHWl4MmuddjibtgSJwnFLRtJQRwXRcNzSUITAtfIqvXbag_5oOGxfRcN6nyfho2ELdzRunotXs9aZRvG0dd7RZNySZTRt5PS403FLD6PpSa2nmsDHnSuvX38Vzdr7yC4d3LDzXM_H3Jm8yd1xvTM4SbybOCGn4QMdePdyKiLnq7T3BAP9AjV_PCOAfjw7afHG6hOt9MXsVRU47RofxbO6xvtGH1NpK96IszZls01PXUHGzztSUPWkC2k1kwmH17j3wJdNJDv7FrDJVNHmEB60qfSPgT9kqjhoj48JWK3XIuHtFMHWrezQZdRdPcUztOdo6AwTn9C9kb93gpYZjce1xuMpfRM7_4wndDVxERKPae_UX41ivDrxuGTw0cxZPA7pHnm5wx2TpUcz53GdKU-nA-hYk635gZM_FTgTbTUHWDBonvwvNweESaOUquPGbt6AEXVXQMV5AEsl6zXMwn8WiX25pLGKaQYtqz3MP14RaM7lrc2obWCSuu5ESavFqrRUZQ1951fN_8Nm3LIA3xQ5HpIpnVbD-ij-hogI4VYTTz8FxGm6q1E168aTfEuDbm2rIcvF2YeFm2A4itAZFjlaVkpTj4fqaVA1HiKaF7QOg6CduYibVLP12s1DhLSu5Wgoppu0TONvqjmWzYh90FY_iXVjJf8KpA7oI6yPDjb9Pr3Ryt4gQWrbA4-1FanNaGD4aLmBVJU4Revumta7MBh7dYXf4HsNXkW5qEfx_gWcm7QG9Cog_qYyBc1DcW5XyuZNFFrFMUlbmaTpJOtRUXfMT5pBK37nWlUmyNx-In1MQ-CtkKnaGoJ2jANd1kOhZwlreL4mUik0FExis0iv91pzuIqkCQ2f2WblZo4s76qblOHV1yRWH79ee-MwdBHghsI0KQSBadYdFJG2N0wnQzyjW8QsjKcd_T9aHXVWx-GD1Ydwpaqxt3sXhczZiuQOY85nCTeKa15RLXMh7RI0L5RGNskSckPXwH66uf6vi6vLqzc3V9eLm_PL9xdXHy6vry7Oj_xLacdI656bpxjzGZMpxZUhAu9ea_r84bi5T1gBqRm5Lv3vzeUD1nXL1H731XptuAWcMaKJjGXWcUYnPxmyfplB78fqaTP2PbUvNcMB75Eucl-9vZ6fQ384m00HkxPsTpCk-oGm8ymU4wD1fFC3WxgPqUhchlJb6UYF_U-op5vFxe8WN-8vP7w_W7x6e_QdHESDcHPgh8PDWRweR2EcBgTuvD9TeepfmVOepZRXdQ3U_zb-Sr0W3lvjs9u9BlqbRqep2GC9G45ng3EUjKLxaDoYnRwdv-zHs-loOAinwSiMo8kgio-g0i9YvrP-rDVGPB3PBnEcjKbDSTQYRoThP2N1pLvPYngXxkgZ-nce3moYOK0o6a6Nv2JtzfWeW9sEL98Je1PtiiatXZgnH8esKm33WZP2dOXp5_WgjjWRfq9uiPi0yFT8ZKbwU8eHm4nb4ObxL2_mDzc7LtckqVE7SY3rY7emvQ8RaPDjbBc37PSh3K3p80MAmu_Q-We_DiBqEZu1sDSQ_LfMPX_gMsm4AV2NGVuFj_p5fF_8p5KlmsaXSY5vyX0tS5hOBb7SJjrkcmMUf_MCCyaV_RdV_a473SNMPBiN3ELKzR0WJFN1xmSY7mslMvQtRyIEa74Fy1Y59uh3vLCOd1Rn8TOZZtLkU37VWRs3miBUybTGn-f0ANb4axN6abFCTTi3GI_jMJjFMRJxNxWLwnAX4yCiZgY3-pndURz_y7uHJ-O4ai2-Zrc7-S_v7mwnO_jGhrpuz_3reeDupGk-Fo3tDhCTbNaBwxqrPdw4Iriohov9afAsWK1m4dMgfkxJMlHvOYqaM03DcDdFkHprZy_5iIuu0cOtmKJ2-E8tDy4mSdDVnsOZ_ptw3Hni-J_CcTohHBrpjE4anIkb2gLUO5t88fAnI24c92ExP6MfJjz1gxF4Jluc-dfWGaOX3Smz5YYKfDUaS5jW-AsiqST_jqLOz9qFa2dqqoGxR79fcS8pdyhX2HyshoD-kqYAzSWVG7rcN_voYxR17oy6C8dh9fryx94_AA"><img src="../examples/aquarium.svg" width="270" alt="Aquarium with a curved drum on an A2 sheet" /></a><br/>
<b><a href="../examples/aquarium.arch">aquarium</a></b><br/>
<sub>True arcs, a circular room, and exact<br/>πR² areas — never faceted at any zoom.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrvbhs3Ev-upxjYwCFuLGX1ZyXZaA5w3FwaIE0OjYugn2pql9LyzCUXJNeSW-RwD3FPeE9ymCFX4lqyZDXVB0NazfzmD2eGMyOfwhX8u58ksIJxAiVYoRaSdyW_5xLK2vK6hP_957_gCg4frn5-97b75pf3H354__EdzCVb2EJUvc5p5xS-FMyBK4QFvmJlJTkIC3NtLoHfc_PgCqEWwKXlIFRDYl8hEYN8yaUUanEOy4IbTsK0zDuncELMYMXv3JPODcuc0Ar0nMhyw5ZCLU7A1JJDwaqKKwtOg9T6DoxYFK4HVw7QxBKEg1xz2zkFpR3ZZbQuQbIZlxYyXXLQtYOSO8MtOCZlDz5rb1YlmYKcZ5Lhdww-__j27c0l2Q5QsYobuOqDZCq3Gas4QKwfKi-srXkOWgEDw5mE6agPK0gvRlCWYAvOHWHZjEkO_ctBksD6tSxEVkDJ7rj1DgWmlHaMfMFgLlY892769BFufry68foR4M7Xi2EvRbmRA84h8c-WTEqQQnF7Dn16UjKzEMqekblXfWAuKCgsmZlpdc8VKsMkvHvz6gYqwy1XQcG5NsCgqmdSZDCrhczRJ3SEwpLal51TAopCca61q4xQzjsVZab07RDPskR2oe5gKVzhrUApiOEKw3nnFHJRcmVRflYwoSwwlXsC4SSHmdTZXQ9-MLqip7fk-FsyfE1KxwKsdro7F84GLefoG4ca9C_TBF5B_xIVfxWc8ooeJ-AwJ5CNQg1D-9yDsjIccK9DYXVyLdwD_ETpdgJ_dABqhWxl2QFYGJGjXzq7wqzTipcOgNLGFVBXHUD7LakOTMpOB-AUut1uF22SEl6CdabOXG04PT721QEfJyJ_7QH5ynEj6AxEdqe4tXRSf8CL5Dw5gxf9BF_x2zH-PcPvw7tMasvhq9f1Bj1VCcUvQSsOYygh08aIPBzzvJYSliJ3RVMMmsg690GxKTyEpyuufNjNQbgevHcW3FLDnGWY0E3dUfKBDPOBvWBSciO4BcV53ouNRtV-U1Ax4wRF-cbuQWP3YOwtDAaHj1-3YOx-mOGgBRM-Bj99pBM3egm5uBc5NxZerNWmgFM-6ri5FxkHqkdUrDlwZh1wlZ-tLdujB2lP5-ffPbZmD2s6aFj9uyNYJ9OG1b87mrU_ajkvfAzO-6zrfc7jyhmmMrxZpPTJ--UarGPZ3bpEZGzOn-W_YXx44VMI_OdYM5rG7P7TEeyTlvTJTukif73MfltibduHNG4hjY9UZNpin46fVGS5Py284FELZzTYgVM-Bydt4aS7cNj-bPcuTSexW8Knr1H1Vet07X7DqwP-zhP56wVdx77IUgdAGbKiv_5mh5N3FNIP0D-JGQfEuE7rQ8yDFvOQmNeJfYh5GDNbpw0n_nV2e35EW1GGNvyfkfQEasstIBtb8AhIz-dY0jZIIbtjtEGE9onobcDz3NHZuObK-avOxoP54wmFi1TztWgVO-paq0zXxjbGZsJktfT9U_HoAl8Xrb8qhEZBx5CVpCMVqNVguuMwR_FhonLE3qpv3szpFsTbpqL-yKQMpmKVffBGRjqlBNqqetGx7tQrjfWS2B1SZGzp5cM0jRA-6NnsYdvzEdwyYxFaSOwN2jACu8oybq2YSbwtAugya2EtPdZ4y2PkdPrboH25hi-65Go3UBkBjQ4C_bQbBptQFwGlW0Cxt_-J1AGmdkIK9xBh4XVIUNNt40ZbJ3fN5k3A5wLbsyjMQ8NmLykvw_RgdO2OSk_C-4nh1NmE3gufQHOWsZyfgVBOk4j1JY8j1VLkfpSwhZY5BBJKaLzsc60N5LrGQ6bgv4juMd-VUuGx1G7p2jU8oRhcRIRYolqETau6AQ5u9PToRu-nd-v21HCWU2u7qWGuMLpeFJAxi3Nn8OY5zb6oiu09EtUfRg2WF4VPdip0iGqcPoeqn24Zt4MqvXgO1WT4HKqL4R53fo5a5MtwPdi2V8MERxdY42CaGzzxObWFOLvppSLM9VjU9N8UBdr35L4Z8IHYiyNkuu3kvh_wHpGEC28fyVNxtp6y1i3tS_CVgHIZvba2XWJ9bGkYatdkj_hQlQ6TpPvs9OeatlA2mUXJu8xYVDcWkv2OX3W733g9LoXK9TJKjXbItAiGFwcIfELsIUjOScij2G0RjMZ7CZopM3kO1Sh9nAJtqnSrnm0TpRe7iaJWpdkxXIZR-gEyLetSwYw9WDimhv9D1yYwW8A9iE-eAHvepNSMPWBvbvJupYVyOM8ZkXetwt2gH3Qld_Dm6ld4DdMJmYSbI4GLyaTXG9L-xROtEngNAr7zjS09Dtqj9asEXiLOOcFsmgFs63bSDuC7o-iJtj8ZHQe-m-HrOttx55FzXoU2crPhyJgx6DsuDFYvOqHeI-8Mgnci6b7HeEl-ovfnMOonh3TewZUe5kpHEdfgubJ2cO2WFc9plinhmHnA3SoGsP2zW7JTuGUL3D86P0t-L_K_32KhxbuFs6yASvCMw5tf4frTx883P_9yffP-08fL5lqx3IGpcX0ptVrQUpFQl-uVRM4rV9D62obtlqWtlv_WNGtiYSHnRtzzHOZGl2GnbLHPEWHJ6hdlCl7cCgXf4zWAqorszm_DkPbMX3EMMuaY1AvcaQcX0Y7MgtJwi469peU5w0HF487hy7X1K2PDG9v8clRpyLQ2uVDMcepRsBubdzdTNjPCFSV3IvMKKE2gjeiMYYOXQ13BXGrm6JIz6Aa6JfyFTD6jkK6NEsS3zKB1On7tENyORRADf5ktn89EY8WxTNMnJM2YFarN12wMA-fkIvmzrNNhxHpA13KXV8rnM228cgTT9AlJO0xreXOY_Dm-ScR3QEtcBjWmpYGJHRYWseFw3PBtyg6NT3PhuvhD1Lc0LxtFMl0rx83eULigcrwZZ6fRBoYbXKSfoK6oXQvbsWYA8r1m6Cr8uIeFFf80SDdIfAjHN-jH4GycZ3jGK6p139j5bRTLub0D3-H5yWHaXm_Envp5LR65SMGw1IgOo2DC97XD0RDxLgZrvDRJVhjxVLEJ_hCE91WSbkHs4ttM-aMRtdSRjydJsppEfFE3Hdo2y31R_ZvHObbBJsBPisOMq6ygCo6_6nidsJtr5OBtYCtmLO9yyRdMOT-x8rJy_ts7XjnIJGcG9Jxwm76v6Q7ZTN_zdp0PYrHzuIia5M05Bq8t-k_4bDBs2M6g7bMdbBtpo3SvtMFTJ3SxV9rgCWmT_l5pwyekTdK90oZPSBv4MHpK2ugpT_rJcUf07WDbSBsnj4O2JS3d68knpaUY6v4H4T-gMvpfPHOPfo_F3_DVb7MHOLkyWfGB4b8b5JigJ4NkMO4mk-5gfAJfO187_wc"><img src="../examples/museum.svg" width="270" alt="City Museum" /></a><br/>
<b><a href="../examples/museum.arch">museum</a></b><br/>
<sub>The largest sheet in the corpus:<br/>A1 at 1:200, galleries, reception and cafe.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVbbbhs3EH3XVxzIKCyhksCVL5FdpIDRGIEB1TbaAEWfLGp3pGVMkRuS65USBMhHFOgf9LnoS9_TP8mXFEOuZLVpihT1i3dtzpkzwzNn9gC3Vm-W1kgNZ-3Ko_eQjcZH_XNILLS1Dk1pPcFXMicP6QjGBjjKgzRLTX7UOegcYMbBqBIWeuvBpo8P736ZYakeOCyCQxrQutIqV2EAtUpPejPMtfVUwCmzhDI-kCxgFwwrwwxfYubVa5qN8KKx8KWsEuKWAnJpmBOtK0c-cSycbAxKcnQe-QHvf8dSak1ugw_vfmIq0wEaJ6uKs4aSQCY4aXJCKbWGNQicThXkR7gKEVeilx2NsXr_Wx_Kc1TEBmgt8wBfWtIyp3TULiIsVzWITVPBIxvjj5-RHWOFua1Nwcnndj3actR2Pt8AiSOCkxW9tqoYwNuINq-VjkGl9FxE7EABb-tQDhvyAQuZy4JGeFESXlplQkux4W4glHJ7BCuiEItI4Wi4buVxLN7_OkBTqrzk14ZD-FT8v62DVoYOfQu7UsHxFVRtQxxhYV1SxeUDuU0omS5pT3zCukIZ6TbnO0Q_iI-FtY4rKjAr1MpD1sHOYEgxJu6NbWCs6xwgl9syWlUpvxWe1KNOpaVB93l71dMu3nSA2nDvV6sOsHSqQCZEB6hkRQ4XR9DSFD6XFXXASUKJuuqAaa0ILCoyQQZlTQfYkYPUmg-poAlvUDn7kvKAbjtQaZy6SYl38w26Fy4vp9Isu3jb6SB1k9aBnLIOoVT5vWH5HgkROQM9MRB99LKxEPtPZ0Lwyyk_Z8fpZfcUR6kDvN1mUMVTXylDqKQLiovYyzXmXC3U5GPYfZDYl7sFq_szkRLbSYvUQXtbxdPtHO7s4p_r3Cc0-ZeaY6-0nJPe3Xt3L1uaqF2uTzH8ZHP34aeM1YUM6E3GfEKM-XjtyUf72HCZB3H0dm7iWXqxV4SL6-fTy2cfT2scbxVgKzIeyoQ07Lvxj6ipkGQMPC0MKtP9xHFQPrqMXCs_lFotDRUDlNYHKiLadvTQyM2IlcwYqngaiaOw9VwTY-40KQNOsi_QqCKUfMECvkkWvauydZK8lMp4rEj62hGktmaJdZzmTazNWBN9GkHl93v8mVdrYSytryLwTCsTZnBUWRc896X3w93N7eX11fXzu-ubF3fPrr69vP7-6ub68lkftQlK8yHleTjJeGUNFZhvUEpTsBEqH3GZAx-Ku-HmOjWlIhMN-qVczRFs-t2zi4WnANE_Z68QWK3QOhEvhK21cxWHCTvnLhJ6Z1E42QnLIrWBD56en-zfNP-JTZS3qkkOHNubitAUAjmKzCmCV1I5_k881DCBOeWy9gSJipy3BpX0LMJQOlsvy1iqJrl4pK9JPvC2jg7G8j3KRk8mg2ycHYtRNukPv-6dPTmdjMbjQSYmJ2ejybiPbRsQaB3Q5fzdPeUoYyheY3IY1ovY6oXHCWz9TGQR9qXTKFPY5tFUtFqW4e_KG--QjoQQaa6Gw-EQCxWGtg7x5f_8RMQLgymCvKd2mebldq7iPfcu726nF99c3t3eTH-E4r8bG_IyTqGhB3JpKdt1fxDx5nVIWk8K4Q-nwMslbcZ4-STTWuV8c291HSh-5wxwT1VArkm6NjxCTg89Vsp7bt-rWhZOmoDeGmxRw2Ra2GAS346jipKiol0c-vTpsQVrrffQ9-NwtjrmD524fw_ba3pVSxfIDQvl86iZRe2MCjzbczJ5GR0wph5HvwT4Cw3ZRIj1CVMw20yfiJ3851je6yHGZuJEiMFpHLEU-0SI9RMh8DmxPJ7jyefHFuTv8VhvlonH2Mh5IsR2PXxHOVVxMXJU91OQ7JZR473j8aNbJMiTtgtwNshAOPtLQ952_gQ"><img src="../examples/gallery-l.svg" width="270" alt="Gallery L" /></a><br/>
<b><a href="../examples/gallery-l.arch">gallery-l</a></b><br/>
<sub>The polygon-room flagship, furnished<br/>and tried against `theme presentation`.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVltbxu5Ef6uXzGwPiRBJZ3erHPcywG6nK45NImDOKhRBIFF7c5qeeKSW5LrtS4J0B_RX9hfUsxw3yTbSXupPljSinw4fGbmmSHdhyVMFnALZ5BBJnZohy4XEUKZGodQCqUcCIvgU36mwrNhJjxaKRTkQqH3OACjEXK04GSMo16_14c3JkoRpANtPMQYGSu8NHoEFxoEWBQKYitKqbeMngofpSA1AYDgZeDXS_7J5RjJREY8_7zXB-nBib2DyOjIokdI0eIANlZGu9LYHc2iB0ITYKGExxgUigSkBp8KD4mIRIwD8FKRAdYUOu71wzbRgzUmo-kxCEisyFChc7BV4neMwUUWUUNJa4SVwi6DzcKDUGoESxulL4Xe9vpkP_HICwvHVJmc9iIUREoUDsFoWNP09TlzB9AyTDR-qnf6iff4qdqVNPqTlwo_acJ87yKhEH7QP36A90Jv6XOM2x8_MORSKXDyFkSeo7CwQWXKAaCIUlqcNo4KM9QeBGwKqWK0UJpCxSAiXwil9hCjF1KFfZRizwT1-g1G5TRl9BZQm2Kbgjfk6Bj-_c9_gahcvDcFREJTVDhk6sShh3lEKm6w1-fYKa30HnXNTON0gNl4DMC2-9KEhYNjHa_IseNtEfnCCgUuRaWCV3lKKqMdOk8f2E33vGRghvmgONlgxO5iCqSDkt4jYa1ExyOtMQlDsZ8CyHRWW4nCediKjcIBrIO3JqNTCL56Ol6fc2zw1KHQ8VAMN9ITtbkSenC_iaX0KYNHprCOzCisxpipLzQsX168_kuIa3KO1M6TQ0wCIrLGOZCecduIgmnDakn0BEYfuaNUGnD2agpo6R2YUocVnAns-BTvN5jzkNxDvqVVhHOYbdSe0prCUm8dWU9D7qOYo4ihKfQr0MlBJFw9h1xYL2k7bsCPjVb7Ss-OncrmbtEzXszInE_HyCZJZIRV-p9XajCgDZMeeZM7cKQjHGEc3nKb-hBw0rv72chrlYxRyQ1a4VHtYfXqzbu_gxWkLmSfhhgTUShf2ffYZJQT8ROAyWl35w7tDRnZ3X6ZyigFL3ZBxiukauWKzV4f3r1YweWL1eodye7Vi-U7eLX86-oS3r349RLerpY_L396uap3QxZzemFkOJ8CkdJBQk6hd2NHvT6sc0FlYTkFJXTsIpHjGv7URP_56XjNEqDB5LR7eUPGS3sOeIN2DywUIS43GJkMHYheHxJ5izHoItugpWDOpFIyQ2_RwcVr3sub5ZvVW3g8G51CloESG1RuAOPqq9TonoCXWRVVbE-vDzFqk0ktvLFhr7WQ5EZqz4WmUjMKjCxrmWYnckpM6XnJdYwryIxHktWcSrCALBvBC6FuKiXxBibnhFcvJgpvhon0j4gZV9IeSV9dJpSiIpsi-mBGELN9r1_RAxNanB7PIMvOm8x34LxkdTY7sG1g3im9PsWMtrI1mgo5LNtS5ESW0_Is2W3tFh5SwSm7Ic-7AmOugoHTtk6GiKN6WNgbeYNuEMSiIp-TPUg9xCQn3fBXmDBNXXJCm7FWuEUdrxutoDam8mllr8Kt3CiExJos_MD8CWU0Bsl1JVNAkVrvttdvC1_hMGR13eUk8tYXFiESHreGwrQemisRkSqQFMZo5Q02IcR9QqhpIV0M1bJEbgmp0oz6hx1iTkLlPOaw2UMqdDyCZRzXVVZyPOANak9i2PioqW5UZWBrTUnOsqakCKqEekTpl2JcKC5YmVvDBtn5IbFru4OEO5FRCO3Pefrri9F3r5evVt8t366WEOCDvoE3ngyonM3AdZtRh2n9aw0bEtjBWtgohRhdZOUGYTj8zRm9Bou5sd5BoakbaYx-_2EdfP-u8aV0sJwOWHWXs3MKP5KWQ51_PFlQJt7CWUjIhpHCk0tFRIqQq8Jxh-kglhlqx8pD0kXNolcIG2WiXctzaSATdktFhSh3YG7QWqFhOXvkmiwRFkm2Hq-vri-fL1-uri_-tnr7y8uLq_WTESybSCW3h3oaUoJXaeJZCbuts__PFY2xFFttnJfRIweGE8ZihjF1ZxAZYR3NILBB1c6hFQ7bvGfsWrddako36lG7ASdXxu5cavIT-NgDKDSZlWU9gD5MxoHr0_E5CG5wQr_DoUliIGAyOYVUqGTIfZZG51rBuXpeZ1A4XYSkYeR1ogqXrkFsBfUqAfGX5fPVJadRJRhbK-OO6HCsewN4m1tq1MXRymASBg8lJbTpTQ5vRLSjptybARgb9EGLHPLCpRXxucQIQepKgEICUtAxqivy3LjQcjnpa9NHPQh2TsY9gLtlsAfQFsEe9RzWp1DkPaDIcyxzJCM8rputPeqhSPN69JPfV4cy-EjNrtnhOZz0J8lUTOcn8LkZQlPhI7lZ0YBkkcwxoQG8h-FwOAwN8jkkprChZgzC54Pu3PHYh189qPiJn5XXYU94S-LE3NYO4QysNavp6D_C4_Fg_IQydTzmT58P4Jwp_me4s_G4RQxfDkG5Kb8PlMK6AQ3xfbdnp0Uaa7-wCrfS967SNb3ThTdctHitp0LrFVo9563Mv-KUB13Vh19Cx9Xtli0enbkdZfnh6bdKhdATU-LEUgu7Z0hWyHAOr-q7N7Y9bFcPr56POgzl1xVw20-1HE26HHFvTqxPK9apHw5fZneIz69dLqmXvxeWW-fu6-MhUv3t9OwubhldlwBfN5cPKR8PkaovZ_eYa5Lk2v1xcxcP0VBG1_qPm7vostCGYajxw2989SCIk4yf2WsqOABUwB_XzqWXk78jsE23xFpo57slqqCjb0ER5vcHgNWpjQC7EcOAc8IjtqAGvODRJwABMEw-NJBiGTp4ge0Wb3rWwbuk0QQX8Giy2B4ClhHvsAUMPHcApx3Aq-cnFSUMWEYdd5gctaTT87e6o-6sTA6xMRackjGyCExHc8jCEd5ooG6VjOC-wpXUswr4RyGsD6cy7talU1jdpYVyqSS3YwzCk1zT-YbLMz4XaAOOWydLhU_kueILADpsk26wXTJ-FoeIqUGNhrpMCA_s2lLGPoXpfDwO--CzxAFCjjERejh3sWjmTggmGMM9QIjSA4gqyuiqphYy6kFPG4ynxxBNaHV2EkIrgATZIpD5wyA84wCjiibGqCSKMCYNxtkxRgihUurYlFyrpL7Wk8BGqN_CU5XqMnl3wvRowuJrE2ZHE4jkL84oKw-FSio8J0ftobN7JphqQijwh-4gRbu7QnQ0YfG0mUDj20xLpB-awsPw2zNtxT1pJLxQZktH57t9aX3m2-yptwk3mnQTXldgRzfWhXbtZR8ja5FhzDMH1cVP7lMIdygmSfiYQaeeti-vUndIV4jdg2B9cA75Szm0lhp-IA37cQ25jHZuBK-rHOaDLh3kqbmHyITWwCM113QSDbc5lMNJYbXkvcr4WXLtpN6xMvPb4QmgDpRqt6fkeqnbTDyC2qCO0gldiWqSoiOoEEEVFEc2iy2pxe33bXH5iUBOvrrM9L9aZjGtl5me_qFlZg8tc0DM09Nv3M38oWWCMP4flrEi2k0A6K2SfO4vBqeLpuxNF-Px7aIFfRvGnrS38g-Bh2uP6vaDoGdzKtGzQ-jJrMVe1rfPPOeLljtBctoB_57tnrfgRMZkfMQGOFGefNXyGB2FfXhjUmZn4_Hg-wacSLrt9hY_o9udHP6zolNWjuBNlAppq4bmOnzhVea0h0m7DEUneTcREbmnMuyL2LbY0vrhLZheNUY1L0-pjZnXOfsgDiveYWRMZ4f-I38-HBqBXy6Kd-FDaQx_6-Cm8jfaGO9NVsf2bF7H9jyE9j2ZIpykWyH6y0uWEQgdpXSwM_mQr1dpFb7LCFjkvPkp15BwjUR3KgC5Nb9h5OHkVfefr3VXy0P4Tvl6s4eT-l-K1XPS1JPpeLoYjs-GkwU9_dz73PsP"><img src="../examples/materials.svg" width="270" alt="Workshop (materials)" /></a><br/>
<b><a href="../examples/materials.arch">materials</a></b><br/>
<sub>Per-element `style` overrides — wall<br/>materials and hatch fills, furnished.</sub>
</td>
</tr>
</table>

**And one that is here for its furniture** — the drawn symbol catalogue in a single plan,
from the WC's seat ring to the wardrobe's hanging rail. Twenty-six kinds; not one of them
carries a `label`, and most carry no `size` either:

<div align="center">

<a href="https://playground.archlang.uk/#z=rVnrbiJHFv7PUxzZP8YjAdOAwRclkZyE2YzWOxN5ZlbK_oGi-0DXuqhiq6qN2ShSHmKfYR8sT7J7TlVfuDo3_hhw11fn8p0r5_ApR3j7-eH9u0-fH8YwV2LhcrmCX37-Dwjwa9OZYWaNWdK_fBvmhdXS5ZjBWvocfI6wzo1CcJvlzChIhRfKLArsts5b5zB-QrsB43O0gM9iuVIImRVrBwLm8tkXFsFYugekhpVwTupFFz7l0oHRCNJBjhZhTg_l4axuncfbHH23dKie0N2Cz6X1mw7KRe7BzPl5_rDp-Nwi1rJl8Ch15togUmucA6EUzOUTts5B6swYC5lZCqkdXMyEz9vwKH2ao35TeKmk37QhGqUNSj5JvXiTSS31og1mPpcpvllKl77uwjtPCojW-Z4hwQq2ic-FBgEuN-uA5wzLnaJUUi_AaHrEgy6WM7SERv99e__hw0PrHO4exndt0MaHM6V6t4Bs9pXEFIP9pANnlrjmDwIsCsX2XZtCZbAwbRA6I5TWOSipfbhrTVc7saHD0OmANhFzrozwjrQF6R2shVJtmIn0kbzmgwpBn5ky9C3ZgAzbBqSDAlKFwgqdsvtTo5TM0AVOCb3xOVuTZJoKm-bwJJTMhEfodJy3MvVTko9AdCDaW1OQNaVeOPCGFMxYPJLEmcKmuGVy-nolU-LfLZ8H6HXh_Qe4v_t6fP-xC3eBaiWt5UIbiw6mSsxQTTk8mPvGZnRZmtM_M3SplTO8eD0l2RkWgBxEggEqh3wyOtlotQGPz56474nydCc9mZolOphbs6xM6boM1-_C3z58_ATfvxt_M_4I39w9PPxAcn98949xF6ZiQbT17BH4QmZfwS8__5fgvyCMr6bgxSO6bbpUcs6N8SsrtYcLAXMrswUTZ5QkIJTRi6AxIc82MBomkCGuXrOXMrTyKQJb44WXRlewpRqBJs5w7HvPYchx1QYBK0UUz4ACjsOEYAUFWmCF9K4EzFFkMyNsFsIDwXLIs2TCIqwtoWs-ZwpP8SX1QiHkQmed1CxXBV0eYqpbok7NfO4wECvESSAJpvjKwTfj958exqCEztyuNWyho1pRH_qmhCW0KI8g4jv8V4HM-zmkqL1FF0JYOEiN1WhdJdIHJkiOMLeIHeeFzogdLJOrOHjfcWYu2iDsMs2FtG1IzXyOCF7MFLYh5Kb4qRaLVGlDhu6xTFsQj6-U0L4Ntli0YSWFNuwLZQq9QMvXZpgqwZlk6uS_cVrBzjAVhcPgMm2CfXyZgspAoAyBSsGUDTkNDJlmuPL5NCg_6MKn78bw8Pkv8O4j3L2Hz--_HT_c3_1QJtW1UI_IBGiGtTUFKRXjK9qptFspo9EgKQFLhySieUKrxArWwrKdYiKEVNq0UMxkyncm68ylUsAVAx1I34WHYuEq1UkXBLEsqRFLVJspGZJJoQni_yQnG1bGyHGzRVsxp_SbCl0bFXKZZagp7qjiBRtdko0exuMyF9w9jOHD38cP343vvq3yeZVSyjQeUixkgou4KbySGm9j6ueXFXqBkBuTgaPsTgYKGnnzhCBCtXFiSRymkGnzF0tprbH10zPhpAbhS9i9Q6WEzJFUzKRGH47TrQr1wudVHRcxqVFmZrtVZp-RUOywwjN1MaaOYN4ZKrMmh6dCU5jFWhNJYhzCSkjrKj5ULNmhBblsVngotJKP4UJbNLznPLHDzJwXqUIuQoJZ2q6CQlQONdmGa7lQqm4C2A6Flv6Vg0JnaJ3MkHoh4cvCH1qtTM7naDmJzNCvEXXTxtRLcRsXLCxDuOSbUGHIQGQK5kUjY_l4i0h9IZTaxAzdbfGBs7dV2_dWCX8GP7aARXWwXLYAFlZmMExaACuxQgt3A1gZ662QvgXgUqEQerf8gDbW51CsWgCZXDoQhQ8xKJTiZ3PMChVrXqsFwSwy-3I9CUcBnz1aaSypK9NHjc5BP0ngR7hI2slruLi-TPjNT1unmUInT5fnwptecp3sgThTvChCPHgCZY0viRLkaBzfOv8o6TishPWS81N9vhfOD5OoCr8ZjvZloFb2V2AMGroMDqiSC6Um-hRMeX3AOCQKY7jTGKOGHKMDclCfcFqdwag6Gt4fdA21H6dxRrUI4X3TR9y5yOxLO1HyCTk_-ejN8KJyCWTZZ7IEcDsJZ_c8RcAb-JZr9RkUVGLCbLGFWoYroZY-LlEHl0nyTD4qUf8aHj6D8sWoEWILNpKhhg2urmF7DdjPYQg620IgH9bqBi-Xgl0zQr9G-E4oVUtVCpaHDFBjzjDr1ZjB5JWyoyR5vkxqzK_jdNU7a2LGmWsXtl_CNkjBsP3rI7D9l2EDcxi2wZEAm-zCCp_vW4AgiEU8gsrsy2wyt0Z76liq_CU8jMiUa5n5HG6SBKjMIWgUllod68FxwZc0iAXHtADOedAPjAr4XNtjMaeHXlXUAGw0UVTC6hY-yMPnw5jH0OW5C2rdi0VYC8S7yECvHJgVErNfQ2aQG0HITDFTyFMjZGatK0G6WxYIccQWiLlGeLjs_QYLEMIWZGD7DuTwqoK8fhGSELYgA1VrSLYsIf5qSELYhezvQQ4vf4OUhLANyRTdl_I3QBJDofRmxV6GjFVJeOiNKkgKey5etFhZhwdDHRceBoP6ucskOfbYiGbNBtz2Y6GY0q3Xp9Cqxy4HyQm0UOCFh_7oFFr12OXlcOsxjodOpwM7KZ2--12vKnap26QGTVez0G1oexvDXtVTh5kwjD5h4IkBLXzZ2TJw7CuF5aZ_iXp3M8XtspNG1_16Yxii5EADlhVh6Raa9y5Dx-WXai474jaF58EwEpWDIsG1YZ3LNC_71bpnz2WGVbJhxWJX25yY6FbeTvJSkaxVvSgl9ykjhwoSUvJVkjz3KZykrpNEDeCfJtTgRoDmWqVkZphjqC04hkGiTlRDiAG1CwOWIgjBlXGYJGFpgsThI1jBzZPoZg8XN0nSvmoo1OOm4qgs5XagloWF6VU16iZJnq-HlSQ3R5Uq9KTcBTBQ72aYtHvDSimKg-er5GUk3jM0fUSh2W6Yh2r8aEejc7iLS4lUWCvR0farsdmtl1hGw6qwK-PCsFfTaVbN2oy3tTQrV3vC0855GRekYb1Fi9O429peanFozEVak_QRN2FDxXmTdgXfK5HSemvDWyhaHD9ipLHR5Uo2DuvbVA7aNqk8TNqDfrJt8N7lAUM5-dxxWObG58DVuBaib5bLsIgtx2wi7G0M193Szx2eN4xMn8uiX9YCWt5za8QTadxTNPUIe6gGg_tE4cGoYiAJ-XwinKzIpPDGHgpJTu8xIjnD1xBVSo798G29f7SFbuzhGnu9EOGMfTgnNwOz4H35y5liSHUsaNpvMrvuyGvU-N3ESf14GpWr41GcsLOBXyHd1c0pHK4PE14KvYQzOIWTSZevafdk_xhOXE8f1iu0ynv5-RBOsVqhnZTbp5M416dwljK1Zi2irU_h9E_6Pexlm9E-vE6SNg0QZZRQVrzZxahIHqez391vHOR47bEjypWRVyWh2CE3HG83FcIpiGFyFEKJQmd2E2JiB4J7-tJTg6MQa-HRTnKkP6cgqI42ICrrVlMm_InWDZMQrzAOZbWKOTe9Sqo4LdQYmhqw0O6dxLi66Q__KEYv6V8Nj2Cshc2smeG-k-PE0YyCIxhPQhODDxAlbnkqQa6Og2QWnTuYZXZABv3hFsier_t_pq_Lyw9qJ-rs179pStXfVg3d41EMwm9mvrreXJVRsQcYfv6ZhP6QG7HLYdK-rnNO2YjtdHR7QDNjHl2Oav6CZIPeliy1yckCnT_-2i6BuVlzr3rA2nXKKItNnHAbOvHvGKdz-lVVG_aOx59Ffu_xdfpyhbvpJ8eF97kvZrvHw_ha3n55XHeZoX_h9uvh1u0tAC-9QvgRVtb8E1O__-sBj36T2QbO7mya3wvaePKv-2f9pD_qJNed_ugMfmr91Pof">
<img src="../examples/furnished-flat.svg" alt="A furnished two-bedroom flat — twenty-nine drawn furniture symbols across five room domains" width="440" />
</a>

<b><a href="../examples/furnished-flat.arch">furnished-flat</a></b>

</div>

**Two more, drawn on a smaller sheet** — the same language, laid out to a fixed scale inside a
titled A3 border rather than sized to its own drawing:

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVtdchs5kn7nKTKoB0sRJLdIibYsb--G2lZ3K8ZjdUjyeHdeRLAqyUILLFQDKNGcjo6YQ-wZ9mBzkt3MRP1RktveWb2IP8BXmYlE_vMAzmH6cnIMn2E6nZzCBrwu1gbHPliHO8ht5RG2ufUIztqNB6eLNagCbIkFpLZyYadcNhkcDA7gNsf2I9AeQs6bDUJpdRHArvij0qhiBKrI-N1KOx8g5AQcLFRFhs4H-lYtbRUGB6CDgKkAl7dweQMfrm7hHK6vrv48gQ9WtmoPGaZGOcxABTicJ0kyOp4nydH4cDqlN6-SJDk6E7TBAT-baaMXy0qbLMJsnSpLQnG2KrKRsBosr_P3O6E8Vcbw-gAKFiSbBWx1yAcH9L7y6BewtZXJoKwCzKawmRH7W1QhRwe6iIArY60Dn-aYVQYn8Im4xCI11qOPnKvBQTwXCLlDHHtcb7AIUCoXdNC2GMFie8eiXwh5-IBuF2VKiA5V5hvhwz_-_l_0hnDjk0ewyNCnTi_x8GgSbFDGL0a8I9UurYyi5zC52XiljWEMrzel2YFH9FDYyAwxiFEjfrqAH87fXn74Ea4_vr-YwPljBfG5KlGoXDpU9_JpofQDwlbtSGqq8FskzRscwHCb6zTnbzKLtJiOTBeZ3YKx9v7fhxO4VffYSORuG_mIi2whXNV0vCBl-HRxcwtbZcwEbokSesm6gL5R22bHCLwFBa4yke7UbkpWvM5jojLQJxudZQZrmEbVRD1SflLgJ41XKtXFegKXfO6FDWe8Za2MQbd74aOEWX8jH0yh11nEr2mvbxcrr9K0p96BygdmoUMtSY5AL85vbidw7tL8veKLToJnPVzuoHR2SYTbAuUhIdfpfYHeg12tAFWaw0qlDaeCzfK12wJyS5RG1WX61L0oKAoDhWUjAzZNq1KjH4GctfaAn1UaiAHVHgNdtSKTD72xdGVXKlUZgjL6HidwjSpj0lV6z-dxxkoJoFyaQ63uhL0pDfp_aZDHbPcmvGw8_sXbAsZjjwbTEJnyjESP76gZOCytCx4WQznI4RkMSdrDRXtB7_DpdXSOwwXdqsGBiJLOhORz_vb66uZmXwUb0WzpzL3dIB0LG0420WRSccNXU-7iX68-XNxMYPE3Wmf0A636Df7x9_-G34k8_rh0-kEFbD4XDvkrj-5Bp52v1s5WZbQifGw-qIB0uF7M21YXa09XnvfnysNfL66vYI12g8HtzsRItdtAF6wGDr01D0hqw8dudqA86KhTbJwdbNEhZGgwIN1HtSHhWJfpQgXSHP5EZ34Ey13Asc6wCDpVZnAAmVNbvmV_xs0Snc91SXJ8d_H2_fn1xbsRFEQY6GKFji71ytkNbMmo0aUnTnOiofDkFPz_6pecWedAdqLT0bTCEo3dQqoKSJVzO1LXaskmFpiVxkoXFtTGVuwpBweNAshZ1nSTEpgMcvVAAnD6AbMJLPoqva-0dAJ-Ac4aU7s-5VB5qMo3sBiPu4e_iM6Cb7lcd9DB0xVu3Xy0SGJVEH6-ev-fP159YOmMyG6JowKHaVDkuPwZKPgop1ff-dYT2ILkh2KWqpCLC1M-TOCT0yGQCfM1JIchZDBZDAWy2aVvyNSRysESwxaRMEuNKfraHkUtcU5n1rUBSHNOgmi0D2xmZF0ED3qDngwzyS_FIjiryd4YQ9q-xw-5RmK35-EkilIP6NS6DohIfFVgrW_0KBpmo5bILqg0KsWM7G9OFMeHRTm5jZzJufEWSEXPYGFwFcZ2FS-vWtoHjB4wbC04FFeuDGSazkfbgp235cAkGkOgCObN4AAW3mgyKAvIrHW-fw8s3wJbxzKtAA4VGFTRH3k2BPA6SWCzYdPAQdJ0Lh90VCnuiixu1e7oTTTxCIvSpvcYhA5YSZwhR0qabIvJgEOb4duGip_Iig_htwFAVZAKbzYDgANYrJ3OYJ4sztoIytOFgGmSiFOLLn6xMpXPF7DSn0Pl6FAKvhmgYDKZzBN2d5MBQEQcAJSK7vT5saxNVYkDAJ8qgzA9mya0pLAu5FCVA4BMbzyoKlhQxvDCqIus5gMAg2sssgHTfcvhmw1kkcjKsgCCQwy1a6cwZgILr-kak73gIILCwDekYIXaoIeVfkDG65y_Ldr475H1EDiO9-Rph5-ORuJVDy-ORoC_VipYd0d6zMCHN6PIZLx5ccXRCHxVOO2R18puXxUeQ_zg0xEFYLjj01Dw7vr8h9vLDz8y6k8XH68vb24v3_LpK7IJJabhrA1XyMcUlhBhYzM0RAWQuoeKooIio_eZCnxkxBX8VrPEYVSOG-1L1nAh_3cR_Hg8HoPP0Rhim1Sgth2tynNANP7DvwHE2DL7jgEBPwd0mtW5DqaOkwR-g8NklBzB4fQl5S7tqyndmyP6Nr7iVKGm9HZrYVUZM97qLORd9c4sbGwbzG6tuz_ji7XEXEduhOklX7mVqOCIYWmdLkTvGmvKFqhevMSM10_gQokbVHXOwvwuMVWUS7Jp04XoifaQ2iLoorKVp3CAtNhW61yCGk3hYqkceXRIc1Ws0YMyltOuSUeS2zsi465o-e1Ic1ZL81gEJ2KUN78_BvFfBjntgpxGkOZ2dpKb4NGszppYeRT9SIx__Qg2OsRcdWlDTv6mQOf7bDHelwhqs9z4mpNc6Ga89ZvjLrHTeSJ-epok5JrFuIptJZdKx7f3WMCCj4aCHqLQbjksKFWBpk_1Wpm7LTxJ9nTOZBMtNdn8-vSJ4yAYfAZGuJ_OOjjy5ikg8ta7LwIxDQ0xT-lGpim2-BLG6_qevn5Ov-51SPOvYKjl5mktDTl8BcrLpKOp8mYPCLPpl4HmrUTldTQ5j3Bmf0DQtL0t8U2D1BpYsTeSV2DWySEo9uEkZPF1Brab4Qzfy38CklAAJHbR2XfuLi6ielGtAl7_DYGY_UyfxDAsogyB46KIzVgHnXiLIzVxy6Jyaq104UM0evwoevaLWFfgXFmCNKPXVGMqFxGUTCQjaRetMmZk_aqS_TA5OUwt1aGapEdKVxwtS2y7sQ8x1G5AGxLoyx6plB5Hq9oVULw6kUVoJVYTLPI63pfXBe0birQEI5cApwse7xRJv748T6O944URTnYNIk-dZERSDKna9Z0zx-1t1K6bkL2ujtTlkFpQ_NgmRF9r8kz4uTQ61ZSOHnKsvNUeYfHpjuqQd-_Pv794f3f18fbm8t3F4mhfjnWQW1qzW9uCv4W-HfxWU15jPGsEO5Y1ro3i_FGIGbLkTxn91Tw5EvF2q33xzPiS9uoDw5_ji6evFVsWAq9Job_OxUrao_1e4gaYxtONccRjwJlUdVv2_gBw9keAxwzYNU0CmDwDePwE4EGdX9WpniRRBW7b4PosxulVtqOY08dvzI6Ddlt2oieYjiJsTLghw5JTBSlCSClXLEhrFUZiTcRA8MXEbF__5PFMK9Tnw1eYbnbn1s07jN_Qnsi0Xa10ij1dqAtCw5v44mldYKdHtyx03FutDo9u-p9k9RCipY27909PXGAH87g9QMacdTC_VyGnvbX1pt17gFXQpg8oDvNpwI9BGx12DZGVvK-lE92Z5Mvjf_JPElZOoUEXi5jEhPajYCGa6QUZwDa9N7txLB0In9QfMXqJFE6bHeNSH0V1oRYQlFtjGDXxOiliU8WRMtn15V8u3tUtBK59a8NlLGOINEaONTzO0qqQW4p0U8OItVOkoNNLwKClhF4FqrZZBztbTeCqoN11esSoseiMjS2mNKZpJJRG6YIDblXstmp3BguSWFOEQWNekOXfUnxeJ-4c8ersu-xOkhuxWlO2h5JDkYGQJ0vCRtk0xnsTBSenfvWoDkLFT6qfoGsKtUrSsxz1Og-wVi7Doq5cgUpDRQcH2rMLZ1glT8ykNsLJqRSq_BaxBNRscjptAoi1kTYZodTD59ZkfY6lHm0glnjIHjWZlArwkqK3KIPTJBFOmPEnUNZ9FElcGGXeoMySBsUR-23exOZpxF0E1bJRmB1Mj-dcJdrSrljY48PjynJMW-4RSy9pFJURPOOmBpV7IwWs-ECqieg67uHEJWaxfI1mUylIkT02qriXQz-kugllRAx6Ok9Y82v7THIpTUXp0i9qszwaxQLZohVW3QdUesPdwhAPh9K9_nmIkY48sRglk1IBZq0UTx8LsYUQy9jsRT6CV_MEoLu7azqiNWwhxBbuQZzQ0T0HQTt6EJLoMETMeVSAKZMhEK_3IVo73-GF85NWKT0TMk-eR6Ed-xCzRxCnyZchZvsQx48gpszM8xDHotpvlcesqUtLIFBWS6PTupvOHSraJmZLwgeOxalyRReebIbhBLu2Ejr7ztaBeZO5iMWqr-u8Nlkx-d3fvR9593e_bHfHYHtve0zwafvJbF5733r7tN0uxuSp7RidLT057n92e-tTY_PtjKrm6GK7z8cRgm_xqbHtqbPvijqlYXrqYhv_daxWa__3NkdJCjMJMRN378vyqc292Igl2d988vxm7G9--egUX7OSP7e5F0Hx5pPu5pdf3NyLlnjzq9lXbvZ11YE3z0hesRLwFQLzdalBEpfZt28-bsg-7pQz_njzNtpmiPGBRIdfeVTxDt6ZuHl2Ou9vPt0TWKvvk8kk5Fg8UWr-lsiydrM-zo9wcZ2HT7j7DBlubOGD48Bx0utoa89te8yeGpsg2GZwgiNTdsw8RPCm1_CW4QNymtTV219PGG-kxVmbm4M6zakL7f3ySUcWYhGYpUgil6R7j4Cbq4-3P0kpu2nTNu2j2JyQGQQGiLVsGlDAOvPCns2Z7J1wHUo1GXXfJM6eMImPt2_bwaV590J1t_PKJ3djJ5-V7d-yO4sWrKX9sTN4ZI5XlSs0N8b-yRSnBfJ2pYDKM22pqUhzimhtCdyNk6RsdpIkn193klW7UsMeUlBLgz0kKgAhZSKMQJx1EW5p_XDwHEY09F_GkEKVbBu24W1tql1VgKMAtZeRSCYfGwNvYGFXK0-NzqijmaahDpmqobkQRuXG9gsPby8-3F5fNE0RUVbuHHUG7KwNpdPUMUztpqPQqQrK2HXF2twyHam987q4b7K1TgJUj_AkIJTC9ISsH0upjeM6Rxqo6hD_vgrvePolvJQmJNB9C96rL-GtnM7W-C30UdGpj9cDJOcaqqWsYE_b6vCYg3Z6UkeZp6-S5PMr7g23KNu0T5FATZY2BGq9Cykv54lAnDyBsFReFwCP6RCMSEqHDtLmk3kyeFLcjMKu_-kbSTni55dMwgFHH585ErArSpA2S2p1laXRrMpLtRvFvTFnbvxCPfxG3euCcbZ1W7muSah2OEJWXX6gqmuTlDUK31wBhzRViq7uENMAkk7Fg1E_K3ek6zLxEvIzDvHPZBgApcYw_KR8jm5IDz2dzSlP5DsXfQ6NHkykVuMsDTTB62RBo59yhzcqzXVBF_b787d_4gxS8kQi2VclDVGK1_IB2UzQks68Xlv-oKZokB60KAY5bKaNLUZzpzMamVG8Z-zw10rz5G49yKCopMegD9PJ7JTr3wbVQz3SSmVGZiOJ00AEVnROsD5TSV6ojM6jidL-_3T3w-V_3H68vrgjdu9ur7hGLq39zuloD_7XSjkca583Z8WmTRrIXNGJ9aRYgmJKi3rmt-gNRnFPo2_LRDIx5jt5PU9Gr46bwt5rUdjaeNcn3BzgXn2iM4zTrbIxRdwJlWEjDhrU0ltThTjn48GpWKVRwo9cId9U0WJcQ9rbq7bFAS8x5tQB50Ns2JOCSVzEwFQFjgWHnOIZCXdiy57mf3j2i0tybblpg6oIfcFl6O9jekkRwatGaOzyXnVcHvr7vuNdWnufKh_jES7Yt8VUthInneJsXNyIfXq6Z8SwSNtUhZLFpK3-U2zTQ6PFez6ctJT_xAxy6btnBrmU17NkXPDtVMLf2Yodel-zXObsUrg8kZZmh80TKWy3uiWrv8DmHpWzPzLWX0XlI9jj_zNscxm4EcSXtC5ULHQB_0oq_G-LWK9gxe7MfDiUgWapRQfLo0gTOJdgxij2MM3w6qOBOu07PD3q3TUD7-1ItthLqbv5-3gLpA4eeB6T2so8vskD7DxJTmV1xaY42NgKbR9a00inTdluzJdbkU07DYKfZfHwicGQF54b3EU2gU-cxsn4juaCXxyI1ZmYORKvrQLPizrOY5qxxyU2HoFq5nHuXvV4aya_FrYKVNBagFe7-kcFrfiYbxYOV5lkLZRk4PZ-SdFECdK06WQC4qeotPr_0u6guGvRqesXL2TOlIWVtTNT21rVoq9ojeekL_Zm3KjiSXZFMcPtxfXl1fUzP6Jgmx4ngTnkj780iHGXaPkbCSD4QUVKA7l17VoG8Z0qm99wiPbF_m8tdJkM4hEAZ2mEgGreYsfpwe2vNphRx1PL86ZKLQKX4nf7U5vaG8bo4fyYwlgmWSZ_OK455NDsAZ1TRZzuf02wI2pov7s-_3T54ce7q79cXP_w_uqTtLOJQN5Cbgji8QcdDMaeX-nsLzQu-GgCk7_lSO1uuYNhPa4XP-d-8iyZvRwnp-PpyyG30X4f_A8"><img src="../examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="../examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7VrdTiPLEb73U5TMxYJknLFZs7scccGy5ECyC0eLExRFEdOeKXv60O6e092DcY4i5SHyhHmSqKp7fmxYls1Z5SpcIPD0VFdXfVX1VbV34AQmwwk8wGgES_CFRdx33lhcg0drRYZQmMoh_Puf_wKjEXIrVlIvoEQLYeEA5tYsIVV4jyqFmTLZnRv2dno7cLIlRDrwBcKskionIX5dIvhCeDBarWEp7tCBQ01LNTjMvDR6AELnjXjpejtQmBUIKJXQ4MTagTNDOBNZETanbYQGY3OphV2HdTOTr1nQDDOzRAfSOzArDaVY4FFvB1JhswIysyylwhRWVnp04M1Ks-7Dj6Ohu18Mup-MH31yED4ROieJObrMyhnC_v7PzugUFtasHIh4GPfXv6VDOLtHu_YFmcNU3skcg43YjGz2tNLSu3QA6cLKPB2Q6FKUaOkjlwmF9Eculw5E5U3KL0kHzguPORidIZ9clKWSfCZA2rTx3wwzQe4xGns7rXekA-lcxSLY965A9MDeQuCNg5un52dwPT25-AwX13B1eQZX7_9wdjqFm88X0-nZJUzPP5-dwfTi09n1EC5yB8IiVFr-UiHcXEzPLy5BAJtkAM7w8Z1Yki6pzI-dT0kBoVTAZ1SblANtPAjIlHBFOLWvMZZjpoQVBKCAMF-gQ945HNMVYu6HMKVnTuqFQpiLjN9f0WcBjCSqKgnsc2WMdaBwIdQRfb6GQtwjaEP41x5yY2xvB8ycHkpL4KqhK7VPwXmpFFgUeRA7l9b5fRYLSmg2uXC0ICswD0EVEUEur53UoGp3b3iP1stMqBQyozVmnmBN_mUThjCeoTKrIZwWQi8weI4fvHIgCaWk4dpUsEAP6c0t-_H2T5efTqan52cfUrDCF2jJhhoEOKlQe7WGXLq4J-lKhwhYSHNpKUqjAzDvZAreK3otx8wE9xwFayi5KDzYSjsQyhD8vIO5Mb60UvtXFPYfry5_BPEgXbRrLi1UJe-G2iNtxo4Wnle9cqCEXaDdz0xIBh4BdT6Ec7QhymgjssEDYx3WDf4W1lQ6j96JunW2YedwmIrsLrocCoIoKZYpuZyRwt6shM2jNyyi_6EBd3s0YIQieFMGQ0ImrKVA5QPmZqXTQeeAJLdAMGVpnKxPxDCmvKecCfilNVrcA-WMiDqKEEFpgdA5c95WhJhM2qxS7IreTsgMq4IMhA8Zlp79gNrbNWC-wAGsCpkVIUzWXdc5b0oHo-FoAktwhbG-NgwZqbcDK6FUHXDeyrIOVc791lQeW7u2IVXD-U76rMAYUgTjsG1vBxTqhS9gXllGqjOVLygOlihcRTY7mCSwXJI2lNsIe6UP-eIgSWrz17YagFgIqZ0H0duBN0kCS6nlsloyNmIsW5xXDoNnubyspC8ofH46mZ7fTq-ubi9PPn--ukmH8Mncc6lrDcUlLGSAhwEHw0rmqDn--chH9GGoCEG3YBxyL2ixxBxQ4RI1hzq_G2Lv5vwvnIt_Ovk8vZheXF1ew4ery1dT-HT15zOyPIIrpUb2BIXKw_HBOEkGvMcK_b41Ztk8XB-_PkySWMtoRWaNc53Hb5IkITSxP57Kz7pFe6lEhk103ZzynpTVhC94V5LCqwuzQgv8mZOh1IiZuQ_xatjDJmQiztnOi-yuxb82hIjMlOv9UjiPR6SFaGiIb0xQx1jwC6f2WoXcCqnJOfHxCj3r4ygN1-El6pwmHczp1N5AFnKsdAHSvI6ih1_m0pMJpSiIdR6f1lZaxkq6MgH0d1LnDlBYHasJG3AjGUulKuctJTUS4FDdowte3sheN6dUlUrUDsx8DiLkqdHwDcUpoSeAt04MUoP07ClSXaGYB-Clpcnu0KdHXGK4OGrDtrZW5sbyoTS5K0b9m-EbWI4hU0bckQVi0naKtlQ49ynkVt5HI5dCowJtLMWu9iR5PDwkFSlsldB3XezuSg8aMXfwdpLEyh_o3NskgVJVpPHPYjnbiwYRNkcdTMvhJ4IiUi9SPuNGWmP3lpQRwxsi85VQinw9hBOgyMSQgxxxYeZKGlamUhQqIUwYSJKD2ouZwh_ArarA8ciAvBjcCrGMx-cswRm6hqFconbEX7KCAClqbkbh0bAILkCo8D5QHUqgQ7g05In9qCj7kLcijAeueQQpHe2a9N_dS3s7YNFXVjvQlVIwNzZyRAIizCoPaZCWhjR4c3t9c3H54-3V--vp5z-dTokpZEJTMsN71Mw118BulJ6M1po7OoE7CU2MR8D7v_x0cn0NJeGPTOBXhrQmbFAGXBnwVhAdlromyKzxPQoVoRrhoE0EC8PEGyiFveOE4TlD1QYOMExDoHIPEfwfsEsJb2Xq-kSZgN19BKmlDM6Mo6kuga0wATDO88avHCl8j9aRfm1qQ3rESYRKlK00402oO0rpwoV8js43iZL-QaubMAyq1ALpFXpKSOT9lBv2uBz1p3VP0odfewDcQcBy2QPYCW0ETJL0qJMPS2G9ZAhJB-OQ97eyvoMRFQtXtw_pXFWuSFnmXD74yiITWRcS9HA4nCRgLP2RJESuQxfZkjEyr3SBoWRCAz6UFp0DfBCZV-thDyCq2gPgjgdODqA01lshfQ9CDwKjI14QckdV9gCaXoh83mMFrypPJF5k6GAySRJueZMk-QFev0sSyBQKCzP0K0QdI9L6dTj3sNPISgczJbnksdyZIepBkHMd06ykzs2qroBN8xvLeSA3RG3qACa7NAmIAEiiu10Jk1pXiLJOl0pE4pxTClnKPFeceal7iDTSNx1MyOzRoyy7rmktOgnwSM6j1yLroLJVoimpzlJrpcklCj3cwDFMCCXxZyeAGzKmqUpqdHHlBziGUfImSeL_Uzhm1tW-iQ8erWRryOxOo6tfvf7p4vKMlseNdiJlF_kMhaV0ydAdRHt6Q2bYJ8vUWp5NAeAYmMc0AjaJDqebmqWQ4k9ymSjw_cnpH0kgM59GYIcXSV07t2W-bMceS7hHBSPo_8jlOXgpxCfE1_PjYEdordKaBeg0v8JuMkj2YPcm_v6wR5982KNC6xD-sSmNYxs60d1KI6v-CrtsZZYV_qIz7m2JWd0SXp4WMwpiksHN2bQRwn9vy2BjPC8jbL5702jBIthbMj-2t0xdACibt4qDk39HOk7ywI5RYoYK-udCqT60P5VDF7hP6Ga6fc_mLkpyMeZd2Nj8w7sQFh8YT3GXj7y2v7lLELAldZWFFUEqW2hD6vh1K_W0Jk39jtRVtiUxtkRRYjBZlEjB-XDwppX4x7D2dx-Yk_SDxFpAICrB2KE858f5bUAyS39NbUKyR3TRF-SuJPg1oJWZAVO6QIiYwEHw1pbMaFqjY9kRHsaUDoJgysQbEjqG3GEiF0jocJNG8tCgJZGMs27rTTu9cmHgAqWR2g-iyN2DeDBKA1xABmFrZ5TM2wxBvCYU7Y7czFiNlhnncgliJbhidU-7yqLCGweevG0OTH-1J-mek9knP7JHnJtn61I4V9MiGar-aDiGZUOE6q7RrbD0zb9RKhGhMMrjJMi9eLRiS2qIbwA1_19kIBuEaPu8bPlI9FrcfGhwM97ETWf3gD3qUtj7-bHZQDfLCQDfFhXySni_Lrv5sd4I4tHhBnwPN9TYetNtbDx6HQ7whVf53XlltWT2s8RcCvJNk0OEzgqeYZT7HB9MmUKIjjiVtBH6iV7ub0l0Zi7gKYkz471Z8uJWJOdA6oiiyGszF_1tJUMeqocclJeGUZiZzx16OJwkQdzrkFG33p8JRz2i5lc31dlnX3Y1OqQzTpJeB9q1eYn-WpnXFCWQY7g5u56CwwWPN3alzvEBDgY1Seb50G4yYEaxF4Vy3FJU7oXeJBwjDW1rLmlCQRPwSNOJR0XxfB1A_I1zB03TqCzRwKMt7r9Uwnq0-9Qc0e1AZ0ZFOAgDvWaW57aWZMILZRZVjJTWiNEIt07qu8YX3dCIKh7UTmHAs9Hjq9tA8TQjiT8vETgePS9wbmW-wG8QePAVDTNTETl8ucDJ8_K4rd5YEOkn5jHACL_v2gCb0gsxHOKsg24XQoIZTZLB-DBJ9sK776h80oHCjLkHgYsECjeG_u-5ljzH4L4rgfs-_O070LffxN6aW44XsLePYW2_Jj8dtgYNr2hFzzAfteTqecr2HnN-cRRZ0Cz8vy1R-OKldO19nGL2o7L07mMFx62457lareB4S8GYli5NCy6uvcEbLl7DhDkv45vvfjZGndzm0JA7lneRZaHhIsELK8oiXkDF3rx2GZ2vWhQxVdPN2XbpJwc0LIeOOdqiOV1eR6sfcQdfbArgBvNLAmoLb2gwJgERqcLD6_GzGowfk4YujL6FNOgNbG-x5fHzdKOLDMpAXbrx9lm6McM84JyTIOu-WY6ZcmxwDkqJ406YfTAVJ8UtiiBsbs0Mvyj4UZ1nMsNtdhR8E0X0u6U_9NSlRJrCLAyEPtg3T8KUiacacUhIxJu-AhDhyiw0zrJpSBxEz2i0zuA_4tCDSufYma6Q2AHcnMIMeXwomzu3OEAIlGYWrrOCb4aPWI8vfDWLFqFNvmbqN0-yp6YLbPgXCdtiYGMqfV-lYPBYmYZnbhHDDRr2DIDGT52qe6jJf4ef8VMKbuPyafhskYiCOpQYLa8nk2TwbtwUbVJu1FHulBb3WyW-Q-k_gP41ZuYr05v_1_7vVftfWP6dr_L1C8v_Na3tb8xrzHwuM_wNBOC6vbV8hgMseV7_Mg7wia58YuF_iga0dS-e_cW1l9c_VXzhN5XfeLgvFeBHo52w_nEJ7rryf1WCu475thKco7trM2jQ_Sup7jCgvcmg6O62s9zMmLtMOHxC6pcS89vNYcL7KGGj_DL561ZaUd8hxkt45ovhSkDUN_HhuyD1MqrJcWQeBfNtefgKwX3dVDcVnO3mxbojJV6bNyV6CWXl4xX4VksbFHhxxX0X2r2nC-7z9fbgRfX2-5bbCLqv-JVEcav-DQV3U_KXcPj2vy65byePSy48VXS7Mf5NZZe-9NRFLg89B91vSkUY8f0tf0nSGjPnmU-Jdj8UayXvMFzIhbkoKlejNsw4A1apzaH1rxykHORpPeiku6RXjietXKDztrLbOMaenl9cNxPWRZibagMpBVhK30yMV390PY35sK4IczD3aOn7IgS5mmN46RVGSlFa8zNmHvrT7pdyp-EaMviIb9BvZ2von9is-Cj0In5O3wnpj5Px4X7ydn902Gf5_-j9Bw"><img src="../examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
<b><a href="../examples/townhouse.arch">townhouse</a></b><br/>
<sub>Three storeys in one file (ground floor<br/>shown) — <code>level</code> blocks, one stair<br/>shaft, one drawing per page.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=zVjbbhu9Eb7XUwysC9uopKxkO7Fd5MKJ3diokxSx0hQoiiy1nNXyN0VuSa5kJQjQh-gz9MH6JMUMuTo5TlL0pr4wVrucj3M-deECCjurRREgLGzfB-twCZVtPMK___FPsAZBOrFQZgo1OogHelA6O4Nc4xx1DhNti3s_6HQ7XbjDEJSZehBGQqgQai1Mf6rtRGgiCLkHreYI7z-O724ur_gM40QSUdd6CcECztEt-X5bdrp0bHbOPyeN0pL4UR6U9w1KsIa_-AoxgAjxRyE0DuBKFFXE3_cwsXJJZMKAdVIZ4ZadLnPIn3rMgZIehENojPp7g_DpZnx98w5EBGGleMtc5z4I5XKYoLYLwAflgydWJjZUUGprne90iR067MUMobDx2oC-lxQkAvhKOKR7ibUFvZFYaOHQJ6lEGc4hl-gLpyYI_f5v3pq80wWHtXXBgwrQGIkO8jm6oAqhB4U1BougrPF5kitE_CXzUyrnQ-QSDKL0YCxZ1YROFyS9tSUoEmhhyBxamQCFRmGincfXV3B9dfPmenwHlx8uPsG796SnNz24eHcJ4-uLMdzc8ak_vb95Nx7ARdQzaR8q69QXa4LQUDShlxTa6UJeoZpWodXpzM6RGZssA_kBoAoVupVHkjFyfBCzWqN_tnbggZ9Pc7qq1XynC6XSSDpYCA8TLK1D-uoRCi0ajz4aEOUAPlXJZlKEZgYla0f5RxbodKHf96ixCBD59jlrOheuqDiu6M5-f65wAeLBmnwAN9EKToWABpSBUDlECAqd74ERzlkS7Ty6POts37d6gdGLLGPBYnREafd9tGM_2D4_9Ji0qSlg89Zt_5V4hKMsy8h57BydUxLZfUrrkjPGDCC0NRj9RkDuldb5s7xCIXPycAELZaRdwMQ2RvpISb5aKyxI2baEqRZflJkOWt79ADXOBXlkDhevX398-_H2Ynx1F23Et_pkdifYyqESBmaNDqrWS2Wm5CdJLZve68lLRdQNewQdmDriLJ7Y963o9NVYThEjeGBNDOCt9SHJQ_FaoUO2D9LRityMI1Xcs8PAWZY9Gw2zDCSWotHB_55fh4WNapA2UYvoYfxFUFAlpy2EIR4Cag1L24CY2CYMOhwde-OdJLwHXztAqSh4mM06AFOnJJxkHYANl4D2r7vjCWzXTV9peeSwCisfABU6ALUgj7k4Ai2M9IWosQNgrAsVNHUHQKqZB9EEC0LrTgdAY4BP8BJOszUPXbBNQAcLJUMFBwuhNRRoAjqtDPrDRHYJL-HFd8gk1qFKZ8bwEkZb0uFDQKesA4YNlSruDXqfzl9f3N4SSUvTTb4llIOKCJ6xZGQE15iYHcpG63gpOXYsRmWIwlHgDGHvzYYvRXtAvF_Jl74iM67YWnEEY_gKB1kvO4SDT-n_5SG9uTyEQluP8G0LiPj7vIBauKAoRjagyNm-wgFJx0j8cHm4A3CvQlGh-QWMo-dZZCg-fOswjrN21jJCARKZ9-oLskIf2FhaTFDD3rXQeg84a9LxLXqt5hwzAQ6IbgVycpplD3RjC3LLBxNMpNoCSgKtkSK7G2DHa7A_xsMJLZFGwbiYKfmSixsZOdqMcsDwLMuSow5JPM8Bqkywa7lacvk5SWYNJGOJAMPTFcLZNsCGRGuIVqYtjJOjpzC25OjCBQQyTsq9lk5wrhNOojmndAa2LKNbc_RT4mpqKt-j4yzrgTKegj1UyifIVQWhNDKAcYXtpasUjz4miJjWPJhUhNus6FcpcRAdMtIp-XKxobKV0k-ytc5JeVRbmHWqLsznI5QNra1ghkdrrQ1HWRZ1VDbOqNA4BG9LQeW1dUdTVBSftoZSN74iVSDXwuTiWZY9nJ6s_OnOlmJvB7KNMK_MPYipUIYKB1lkHXu2LAmXOKLbWwPu8BbsHH-CMPohQmEbyqg_wzj7EUbplJz-jA0O2B2ILhyNTjKYzbikeRiOIDgU0sMB9wDoYHRK3w_PYXgETnl0nloCrnQwyk6Jlvyywli-UtfG6DFdU2rlB4r-YZb1KD5T8J9R7BMHUrlYmDiFtfGBbqs94C5i3RKcr3tMZdbDB1xfXVxefdhoitbdF2Mzn7FLUr4tptboJRyIR5A8ZyxsoyVMEK4-3179-er289ubvxwOVoVlBHt_WLO5t9md_d_WmIkI1Y8Bst7xWbYCiM87GCj_5xrVVvHvlCm6clVh4rFUFArlikZzA7oFRkIlpMjvGoz7vAT2SoQqIRHFNgTK4S9UvFcomWLY4sTfu1CjXyt5LdpoBy3F6Du7dhkuQE3Nve35d2bXQjincD0u0Swq_EbUdDaay33fDmwgioIMN3WiriCmAI6o1jyeXhYVyrgvsE3gWjJXgue9zRIUORnAwas4m7WD7KbZeHabWYlao4yBuB5gUYJIiDMhsd_UMBG6sGYZxd-eYQ93CjNb8BcrO519TD7aJj-mBPUU-WiXXMT2M8UX3T5c3X66Q07O96hEtvx_t8yefKemthw_XVDbnoMuZEdL5FQWKjWtOBvWTs1FsTxPM2I7Nyb_4JLug-IWO05LEGxC5uCiiUwYGioqS0sQHijT2JlIeL-DbXfO7mlrNDRbPpYqKXLd4h2PVlI9b7sNVshONZzQBsZAjORVs9B3nJS_2zIQysNooyu-tM1E496TwKMWeGJDsLMnULMd1Dtlpo9RF8WqcJPMg8hn230MW7Tj2LjvsiS84t1DTH2bTG0JzBDPKame7EL4yi7QPYFBE9QmBBXss8TFf1nepV2s2t_xRmrR1t57_hqjgr2NKkxMaFTGQVACaHxwQsas55BWJ7TnoqyRUOn1ymF5CPdi6cFbWlnlc6skL1yo1TFwIIWndOawCILsAr-L6z6pxNQaof1hgk0bt_ev7sYfPr4e323lMfJ6Gv3TKmAh9D2Iwlkfl2M67l4XKlTMFX0XE90mzEpoC76pa4fex-1nHPFRTrEHEyxoodVeQBqncIorLSeU5q3MTdoCvHs_TrCFpchK80PS8z6vQsV5XBuYZjYho8csTzmhXT3xqa0towidjRGcakCjMW7HdheZUYNxl8mW8M0kOFHQHjnKT8Ec9zLUUyVgjWIeNyztZqVdOQdSFkjlxdQhxiXUo0s1r2vbzWnCZHv7v_4tXys_FuYApdDagzI9WFSqqKKUxJMAgwFKNY2N-Qw9V7uYnAiPvH3KjenyR_6-6eYkmu-1OY-mls2OMy65lF_ttXPOd6uNZ1oaWtN6DDeDct0PuDSUja9v7qAW0xgAxkJOXVqeVqIcLFxZB22LUnJkVcJMIQ5q3JgFFTSmprV29jdaiD7eZMWaR2H0ebKEvQtXVLfCTNN7ERD2RtnoeT970R8932Psb53_AA"><img src="../examples/two-storey.svg" width="270" alt="Two-storey house" /></a><br/>
<b><a href="../examples/two-storey.arch">two-storey</a></b><br/>
<sub>A void over the ground-floor gallery,<br/>and eaves on the storey above.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrvctvGEf_Op9iRpiMpJRnor22lTkexlcZTj9SR1fH0k3AAlsSVwB17dxDFZjKTh-gz9MHyJO3u3gGgnKRpU33w0MRh7_bfb3-7x324ghfzE3iC03kGLbS6dHZW2xbBGrAGocFHbOCH7_8BoUZ4e3t7N_vju5u3H2ZXN29nb95fX91d3by5BnxS7brB-WR_sg9XELTZQm07j6A9v1l0uqm0WcKmRoeAj-i20Oqm0S0Gx8uUW3ZYgX1ENwVvQYf0stPLOkz2Yd0oA8GCr-2GH4TaIUKjzLJTS4SFdS29oQIoh6AK2wX4bKHDZ-BUqNHRMwO-Vmu85KMCVNY6KJQzAPDD9_8Eu0YD2fwCABQ0qBYir1Zm6ckotO3XV2-uwS7480Y1DWjjA6qKvtMGdBhJ1gvbVCx5o6tQw_FFlkHYWJL9iPG0vEabYEmkdmA3hg-izVJE6RbKBpUDgEN1NPvysDgC4CNWukXjtTWw7poGSQyIHN7l3c3N9Z0ccqFK9Kz1x3oLSpTmQypTgbEBFNTaLMkHBn8P96QdBnDWtuSJ4_n5ObSkBs7hKi0lE032wW-0WZJ_tYGF7Rpx3Mc3XwxPyBk6gN8gruWxNc2WzrbaqC2fu0aJGpJPx5vsiwviO8YG2hXIv41EZU4KfKAtDo9ycBg6ZzyYjvS1LsaZsWYWj7vSpqLomuxD_vHhw8d3N394uP3qw_3dn9_cX7_NoVSGLIGPaECt182WjKkD70VmWiu36uNAfB-gVC3Cwtl2TmJ9o6sYszl4NJWnNcFulKv61w48LJQDNBUc0neeRDS4CJ_zi1Ba84gmaEs2yPnwOXQe_RQcRZpqrFmOpVHIBKce0XnVQKUdlvT20RQ2tS5r4LRLydgosyKn2S7UM1Se9nMGXQrqRj-Sndnz48wpVLniBJVVdhGgUVWFThI_T8mT005v767IvLPbm_d_mcNN9F2LyncOK1aDLHPJFqT8Qg-U2GSXXr3JvliZ9lsrgw1JrpzamBS1LBUbCpp3jBgbp0NAIxoXWCqCoXG48-ukft3xC9pU2gdtlp32tSoa8eVONpDH12pNyETb8mmsNiEZjERy9PvJfo9QAnVsKQripUVP35mIbGQssRtnmnKVs4UgIcNlmGkDDkv0fhrTkx3CoRjgeP4KnsjYlJQikSzXmUrcM9mHM2hPYNGQznmjTcgBn9ZYBk_HFmmiT6maho8fWNmN7f6NWQVZbaE5jKJtyWi65azYWMqFoOmpZyEKckG7nM18OUK5KaCiGFSNmItBMALcdLLP-JcgosfV7RhWexR5mWXQtgKWCpaqaXArIMoQ9bKHqGhZthR_S6FB_817NCXAWFsX_ByuDFhXaaPclhfkKVA9FBg2iCZBKtUhcr2Hre1g42zALyCP8giDvSiLppIQ0VRJIyRrQ1n2Sf0Qd8UdWzQBXGe8KEnu7gMp6ktQPgiIgbNw1oQ-PGUnWjjZT0uNdaEGX2METy-HMl1boBtX6hCrDZesKVTo9CNWUzDIub9dY0VQd69WCBfiELuAjXWrYNfJi1oOc3xy3i9IUO8Z6hI0sWO20QgLp6slDnVpR8VYM0uCIhtqClGGHEVxW-KQTQWash5yQZAONtpUdkP7nWUZVIhrSayLLLuMBYkdshIAoG_EqHQaSewwLorspBQeerD9wto-jguyGz2gLcc1n_eRaJ7sw-EFP17wYaZUm_50df_Nw_3t7cPN1d3d7cf8aD5h_rN3T-TqGyqTe_DtBKAzOniSArAP-dLpCs6zXDQ7Js2kCPbZ2peCY2IitS5XTLco159C55BoVokV5Ium83XOYtVSUTIKJVRU0qwhgFTNYsYiDHoPh_P5_Dw7gtJKLgWcRmSgrfhkAi3eqDXL_Xdl5Zry7ub-tk-H-QQgqjGBGLTdesIvzGazWYzg3_YkZ60JJcnif7XakLLCAcsAyoMPritZsdnuHwt8cZJlxH8zQqRU2WwXYvL4L-DiJa84IQ9p45n-UIzJKQjIDULZWI8VS7RdaLRBobA-VlYPrQ4u2iMiHxtRC1dNRStXAQ6fptsjAQbeQ1wgDISYdhmgRBMc8jYMMimVKDOMhdZy6QO7WMwiwCgDuTVMRFWA362t_5LZDhlbeEz1WjTCp4BOWweDY8lG38JhNs2O4PBFlo0-nLzM6HP6wHaA78RZYwZJFIXoXh-Gc7hRLSVHKtGcLX2R1h7qjkoCm6jYUrKxUKrVypSxSJOFF9r5kOxweH7KxxvrtXmgUwwJMCh2LIrFd-IH0WSsQ8SfS0qSHmVVpJtzuKYEEyISatwCGjGDpuDTTRP51IzswEKlJiup2Epwl5NbU7yYEp3BSjz-jAH4tSKc29GNeCX8nHrZ9CRjL52wxzJR77mMB_w5GaNX4-exlTgtST3_PMn-6z-Wd2tQILYi0iTmm4JvENfcABBnsXbF346KCFV3IsmJwK50KGs0kkBebf1lZEoqPeIugTE7gp_rGkx8ZkyD-25iRDgnEJuj6rV7aJXmQiRZAgBe_x2BAuqJTAWNKrCBvfci83P4QMrs8RvH51k2pTp5BD9y-p1dKJD5nRSyvMvxi2e7fIxZtwfyx2ILFeqRuyjN_k_uut-plIlJcL6P2sSdFm8g0ryMK68ONYU4UT2pOq6kmrtCXAshuYRXPdv4W6dcQDertC93OFrPFiQ9-32YE5DP5IzV6-ohJnOAw5MXfUhLn04bDRAsakiB9sL0zacYN4ecH-ZSHUcdB0UxJXCLyrCKpFKcqkgxNmQB-kYHlmtUi36YNvRdRBpEiP1ybfJk7tgI_tZY16oGqFBdjro5liqUv29MIg8YKBx3hnFcEBNDuq7AdH8FlgvGTqtHvY8fLb3IfjMm8amVU0H602bXBWQ7NpQ1IDhNjP2crM9-oKBOFodRa90Paj6FaZ4ecCdy4MejFp6yjPrw5Cxm02R6nlBEqs5ShW7vlKjkLYGBAmst4dWSifo5zjMdacc4CRI16QvF9Cwbz4VEUduFUZoKaf21iUpoH9lv9do8xD6CIv9FlgBrFPnj0GdOk5iR12b1TFaBFY-iAhyeDsKiVie7abQjq2DCNIjaPCy5-44oenyWjUU9O9bOm_5BCD-_eXb6LJWfHWLnTRREhWSKbEqxl968eLbn4BUx4CXNuhyUKqjG8vQylhGu1yMe_BPui6m0WHgMfR73BCcmEbPbAw9vrm_u765jPok5PS65W8z6CS2zZUn1zky5yaBTEVWSwpQGWalPWTvuZUsbR1j8oFeIOwNjYyMo_AvXoQbrhqHieOhS8Rxqo8tEkoN9pH-5Z1jTpIlxge1_4KlJnhJLZcl8pIZw7wDKzgWlzVAlYl_Itftc8Mo3uiUKzEV9xRNClZrQAw-n2XnqinrF5DgkU4gZT-eGOQ2FcoFLbbycPnW0MlVky8Q52RglNuiDWOMwOeT0E9NzQB5N-zbTdUbKSYGE1H1yXYJioWeiY2urrhE3SP9PCRLDV1QmBuzLGmkdBLWUSkkAtOic0UxqIpN4oA36Xm6UlkMcSSyyhQlwhdbsyBITxr9fIuv47Dz7CVnRqb9c1snpeRaJVZY9Xfyk4NJ2hlq4_yT4tD8kwQsLPiPB2VjwCItT5__rKdOfpMnuI1Mqs7cyPOKcH0ZQ_SpqlvkWRWr9MOSJY9qYR8r0I8zdDt3bFmXC5yg4qeAVW-IUlQT8xzcpV2OODYNYptA8RsFqiVPpbYc29CxNeWLlTznBg-6SW6c1NaeIlQdsCrsRyrQbW7Xd0CSKTM9UwJQ10RC7nnGuAAAPJcRTr7Ls6VWW7UjYlDsuZzHzwoZg23Fs955-kWUDgSiU12Zgr_h8IlJsPxltMCNY2Igf9E68LvIQrNgsqIBsLYLGxFqlccyd5acZjxuNhz2ehsQ5E2P5HgdFWvgqoxlj8NHP2suZD3wczRve6Prqwz17SdA-2iKkmcU0EfFP5_-9o8URPW8NaoU8wxc9KywbRUP8nAzJlUs1G7UdOtmZeqKBdCowlz3A-21b2CYiqoxTQAfBRbqzUGbZYL_xbniIf6hSX5ydZ9OT4yw1QGfnkrS9mfoYGmVvk1qvvo_8n7P3PZplqDfa42jIKLAsmcF6xWsimWAx-lDI0OOaxtrjKyEMw3Rg6MIPR36fiovJW0eXNJHJgHOTZ6xnwiNxDn82ZFqaq_TXSr0XpH473FBzghWcxFm5yJifQcsimT9jxTrMLF8nqjgroAob-wu6451xK8diG7W1XZCkoLuG_n6H5hvW4DNPCmcU2kWTtSn7UpxJuj2xSrGb_Qqr2Mg-8-8nuB9pYGSjZ0QET_sgIWb3RGIHuaasWfKPS-s7SW7SWdh5f8rjl1n2ROWo77nj6r10yuOXu8cUkBndmh14qFUo62lEtWG-zMEwnpVdRAePLrR4W5mipiuxdzcf3r297sFmSD_Ye8877g0pvSDXwKnAdmGfejwT9ogU1ugYyWiiiMHp0svdliMaoYM07NKzpsGu3A4RueFbgET101h3sK1YIHrq7OJ8JwIuBJmht206PfxoWe7vwH9Vl8TyvuHRUk2IuXPzSXdCHlQXbH4p3b38GIEg2LfphpKetyroEv7w1ef34FFSTmxjuzAjN-38HmIO1-me6Pbu7fUdrHW58pENVtjzeq6xNGvmGibTkf4K-P311_cpLe2CS__sy3h1lBiFNBN-h6zHMtBfFif2QLXCUc9J94Gjnhha5ZbaCFWQGyK-S1POaY4qyAM-hVzGDpvaNnE8naKUZR-_JNrmh5vgxBmoVR9-qSATT75rooMW22Th2jK7HX4TQfPIaUa_ijjpZ5Sx1l8wPaClLLMn4rMvx9PrgRjsLh6WpPW7i4cIpKPJkOH_ME3LZeqfiAgF2sH4lmGY0DsZi3KLlpPpcigbFX92Q1QLq0RDKu1VW-hlJ2yEMH70a58NKiethLN2Iftcxh4kOqKWqz4Fvis6VyiJlqIzS9XYDf2opkIRsWzU35mk6lDHGemCoYBmVySUDBd0aJDvrwDWzv4Vy7BztcUPGNUeii3sXbmyfq_MMn5PSuydZCcXs-zl7PiCvv1u8t3kXw"><img src="../examples/tiny-house.svg" width="270" alt="Tiny House" /></a><br/>
<b><a href="../examples/tiny-house.arch">tiny-house</a></b><br/>
<sub>Barn and bifold doors on a 7.2 x 3 m<br/>shell, now with eaves — <code>roof overhang</code>.</sub>
</td>
</tr>
</table>

**Also in [`examples/`](../examples)** — the whole corpus, by what it is there to show:

- **Showpiece** — [`hillside-villa`](../examples/hillside-villa.arch) (the whole language on one sheet).
- **Start here** — [`one-room`](../examples/one-room.arch) (the smallest plan that draws anything),
  [`studio`](../examples/studio.arch) (the lint-clean flagship),
  [`attached`](../examples/attached.arch) (nothing positioned by hand).
- **Homes** — [`laneway-house`](../examples/laneway-house.arch),
  [`tiny-house`](../examples/tiny-house.arch), [`garden-loft`](../examples/garden-loft.arch),
  [`two-bed`](../examples/two-bed.arch), [`bungalow`](../examples/bungalow.arch),
  [`furnished-flat`](../examples/furnished-flat.arch) (the furniture flagship),
  [`courtyard-house`](../examples/courtyard-house.arch),
  [`townhouse`](../examples/townhouse.arch) (three storeys),
  [`terrace-row`](../examples/terrace-row.arch) (one component, placed four times),
  [`two-storey`](../examples/two-storey.arch), [`accessible`](../examples/accessible.arch)
  (`accTitle`/`accDescr`).
- **Public buildings** — [`library`](../examples/library.arch),
  [`transit-hall`](../examples/transit-hall.arch), [`clinic`](../examples/clinic.arch),
  [`museum`](../examples/museum.arch) (A1 at 1:200),
  [`hexagon-pavilion`](../examples/hexagon-pavilion.arch).
- **Geometry & experiments** — [`gallery-l`](../examples/gallery-l.arch) (polygon rooms),
  [`aquarium`](../examples/aquarium.arch) (arcs and circles).
- **Scripting & composition** — [`parametric`](../examples/parametric.arch) (a `for` loop that
  generates units), [`relational`](../examples/relational.arch) (`right-of` / `below`),
  [`imports`](../examples/imports.arch), [`museum-wing`](../examples/museum-wing.arch) +
  [`museum-wings`](../examples/museum-wings.arch) (one wing, imported and placed twice).
- **Style** — [`themed`](../examples/themed.arch) (a custom theme + brick hatch),
  [`materials`](../examples/materials.arch) (per-element `style` overrides and wall materials).

The [docs gallery](https://archlang.uk/examples) renders all of them **live and
editable** in the browser.

## 🎬 Showcase

The examples above teach the language. The **[Showcase](https://archlang.uk/showcase)** is what
happens when you point it at real buildings and original plans — the West Wing (whose Oval
Office is a true `arc`, not a faceted polygon), Palladio's Villa La Rotonda (one quarter, `place`d
four times), a railroad apartment, a house in one tweet — and, under a "fan studies" heading, a few
famous fictional ones. Every one is a few hundred lines of source or fewer, and you can open it in
the playground and recompile.

They are worth a look for what the compiler *says* about them as much as for the drawings:
`archlang lint` reports a real `W_NO_ENTRANCE` on de_dust2 — a quarter century of continuous occupancy,
achieved entirely by spawning — and, under core 1.55.0, it reviews a $2,950-a-month railroad
apartment in 24 warnings across 17 codes.

<table>
<tr>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/west-wing/plan.png" width="270" alt="The West Wing, first floor" />
</td>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/villa-rotonda/plan.png" width="270" alt="Villa La Rotonda, piano nobile" />
</td>
<td width="33%" align="center" valign="top">
<img src="https://raw.githubusercontent.com/ChanMeng666/archlang-showcase/main/plans/railroad-apartment/plan.png" width="270" alt="Railroad apartment, Unit 3R" />
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
`World` seam. See [AGENTS.md](../AGENTS.md) and the [ADRs](../docs/adr).

## 📦 Ecosystem

| Package / surface | What it is |
|---|---|
| **[`@chanmeng666/archlang`](https://www.npmjs.com/package/@chanmeng666/archlang)** | The core: compiler, CLI, analysis. Zero runtime deps, isomorphic. |
| **[`@chanmeng666/archlang-mcp`](../packages/mcp)** | Optional stdio MCP server (the SDK is quarantined here). |
| **[VS Code extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang)** | Syntax + live diagnostics, hover, completion, rename. |
| **[Playground](https://playground.archlang.uk)** | Client-side editor: preview, describe, lint, **intent scoring**, apply-fix, embed. |
| **[Docs site](https://archlang.uk)** | Guide, reference, [CLI reference](https://archlang.uk/cli), ADRs, live examples. |
| **[🤗 Dataset](https://huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories)** | Synthetic, self-verifying **repair trajectories** + authoring pairs. CC0. |
| **[GitHub Action](../.github/actions/arch-render)** | Render ` ```arch ` fences in any repo's Markdown. |

### Embed a plan anywhere

A **live, editable** plan in any blog, wiki or docs page — one `<iframe>`, no build step, nothing
sent to a server (the source rides in the compressed `#z=` hash, so the page is self-contained):

```html
<iframe src="https://playground.archlang.uk/embed.html#z=…" width="720" height="480"></iframe>
```

The playground's **Embed** button generates the snippet. Optional params: `editable=1` (show a
compact editor that re-renders as you type) and `theme=blueprint|dark|mono|presentation|rendered`.

> **Not on GitHub, though.** GitHub's markdown sanitizer strips `<iframe>` — it renders as escaped
> text, the same way `<script>` does — so a README (here or anywhere on github.com) *cannot* host a
> live embed, no matter how it's written. The honest substitutes GitHub does allow are what this
> README uses: a **static SVG the compiler really produced**, linked to a **playground permalink
> that opens the same plan live**. On the [docs site](https://archlang.uk/examples),
> where the sanitizer doesn't apply, every plan *is* live and editable in place.

## 📚 Documentation

- **[📖 Docs site](https://archlang.uk)** — guide, reference, error catalog, ADRs, and a **live, editable** examples gallery. Every ` ```arch ` fence on a docs page is itself an editable plan.
- **[⌨ CLI reference](https://archlang.uk/cli)** — every command, flag and exit code (generated from the manifest, so it can't fall behind).
- **[spec.llm.md](../spec.llm.md)** — the **whole language in one page** for AI agents; also `archlang spec`.
- **[SKILL.md](../skills/archlang/SKILL.md)** — the agent Skill: the `spec → compile → fix → describe → validate` loop.
- **[Language Reference](../docs/language-reference.md)** · **[Error catalog](../docs/error-codes.md)** · **[The intent contract](../docs/intent.md)** · **[ADRs](../docs/adr)**
- **[AGENTS.md](../AGENTS.md)** — orientation for AI agents working *in* this repo.
- **[Release notes](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md)** — every version, including what changes for code that embeds or parses the output. Installed, they are at `node_modules/@chanmeng666/archlang/CHANGELOG.md`; each tag's section is also its [GitHub Release](https://github.com/ChanMeng666/archlang/releases).
- **Research** — engineering write-up: *Reproducible Is Not Correct: Reflexive Gates and the Self-Descriptions We Ship to Language Models* — preprint on Zenodo (not peer-reviewed), DOI [10.5281/zenodo.22958002](https://doi.org/10.5281/zenodo.22958002).

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](../CONTRIBUTING.md) and our
[Code of Conduct](../CODE_OF_CONDUCT.md). Use the issue and pull-request templates when you open one.

## ❤️ Support & Sponsor

- Questions? Open a [Discussion](https://github.com/chanmeng666/archlang/discussions) or see [SUPPORT.md](../SUPPORT.md).
- Found a security issue? Follow [SECURITY.md](../SECURITY.md).
- If this project helps you, consider [sponsoring](https://github.com/sponsors/ChanMeng666) ☕.

## 📄 License

Released under the [MIT](../LICENSE) license.

---

<!-- CHAN MENG PERSONAL BRAND -->
<div align="center">
  <a href="https://github.com/ChanMeng666" target="_blank">
    <img src="../.github/brand/chan-meng-logo.svg" alt="Chan Meng" width="160" />
  </a>

  <p><strong>Chan Meng</strong><br/>Need a custom app like this one? I build them — let's talk.</p>

</div>
<!-- /CHAN MENG PERSONAL BRAND -->
