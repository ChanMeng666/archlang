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

  furniture fridge       against wall w_west offset 400  in r_live
  furniture stove        against wall w_west offset 1200 in r_live
  furniture kitchen_sink against wall w_west offset 2000 in r_live
  furniture counter      against wall w_west offset 2800 in r_live
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

<a href="https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZ8k-bBEjbAAVipEWaIOiTd1YcaVmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYcvVnO073icud-eab350-XsJZ3q9Ye-dmaMhySzcYuxhpyvj86S8cn2P27z-INUV4Jh1AQZQw927qaXZQ9Is-3rhYGztFzZ5hAuYumGicZY3qBjVZfYBX1-xv4OZsRVKEjBWB6EDwCwttQiQ7ZlDj7BRU9GFpxhotNQ32SmfxTI4vQBHP5i68KJ8MwAl2YpZx4Rmeg2uuOYCmZGyIAi2uOQ9KOEUfe6WxeCbXL0B2XDuPz5_-LgcoV0rJoNw9GYCsRqwZFcX66SpSczJeXGjIaLhFRHVT9FGG6M28PEAZTGR8RIieOcI6H2vclsmdkNBi6zChMenufd6QRVx4K8H9Jl1p53zRF6lORtIzSKdpQyFsfZmS12wPioTSu-jS-KNbBO7hYwEsrIkBs1kBTL3RGClsPX3MyceUsADyjEOlEGszvhogSHbKSbMIdbmOckNWC1GQRGmkCnQ-LuYFoM0sgBaS16YpgAeDURTIYTb6eXsprgHgZWRvnEe2bjkEDJXCR-ypgXqCvdORSofbHW2mEB_XXunlw8lI3cPIIXycQdb7MkbLX-ORSTysXcsJm1RsaR9m7eNh50U6PIQhRfo_MIZbjgw7mAK5U4x-7i8bc83SZZlwML8zRHEpNtFQxQ16F-ZaGvkpXps4rtn2sAgc0OTrq3wp6ZemgHatTYgrJ6Y0h0JrdKxxdCTkCqnFDYfkSzI93LL6HcW6J4LJmMjcVWONjrHaUsuN23Hs2rhA9ls6TZT15cQ7GyGV3dUkRQwlcpnnuVKQOcewTB4hko8IbZpnNjrkwO0gdnUVGqNFLCF3d4J9usY-PFMqiTEansQdkORTRyuVCUWMTtaqZ2taorlLqGJdSIeXWbOUqdVSc8U6zZPPf_yZ2aROL7N9b6Z1LBFYujxNJ7Lc5BTKa3CNyVM5QVfcuDZ9-I1m1bcrFOFSonWLRoPMDCYm2kphNstTVeqi_HD580_fv3717vLt-zflwa7bXTW78RXHXe_Pd5zfop3mirHatVmh60mJ9fEm1kOl7shtciIpWcmpR-RGZ6M13sk9uW4mUcThaG1XxApgsvDWpEE68UZPuRvDO3-fjrmbTAJHKWXA2E2BbSBCdNcrhMcgxOcvQHS9ehmMvXoMYqi-CDF2CxvZf5XF8OwORB_vaoZfpI2ALN6_-eHV24uXvw6gPbUWFU-c51yFhvMPj6K0ntUSaROlcHNVTkjqKoFGqhqWPw-uTTBVcyOy0c3hKdbsBcSizj1pYtp08iqQFxLBkwkxQGOuMs20Z-Qth5vAadUZwMo1CGPnvDaWIh_sxEUc28rcat-oXIxutp_a1dhVhvOwO1NqeXScCmqDk_3ZAhqzxJt1Vjo8Ump5vhl370S8t1snEp6vUEm_-Y7QcNQROldqmTK_Av_FTWgXu5tPCTudd7FTYz4MLs2R0TeDehfbu4ofwo5unknLs4O9iqRM1OXJFvEP5LXA3QlM7Vr2nQGZOFsGMvO1gXU8zu-kpx3vFH4GOsjur0r_dOXzsVLL0zsAFQVjcZ_EAxFMGCdKLY9HaZpEExvZr-be_cbjeG__S310Wd2g99KP6wuy0x40RUZvqIYn--ps__Ckh9vitvgP">
<img src="../examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `archlang compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZ8k-bBEjbAAVipEWaIOiTd1YcaVmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYcvVnO073icud-eab350-XsJZ3q9Ye-dmaMhySzcYuxhpyvj86S8cn2P27z-INUV4Jh1AQZQw927qaXZQ9Is-3rhYGztFzZ5hAuYumGicZY3qBjVZfYBX1-xv4OZsRVKEjBWB6EDwCwttQiQ7ZlDj7BRU9GFpxhotNQ32SmfxTI4vQBHP5i68KJ8MwAl2YpZx4Rmeg2uuOYCmZGyIAi2uOQ9KOEUfe6WxeCbXL0B2XDuPz5_-LgcoV0rJoNw9GYCsRqwZFcX66SpSczJeXGjIaLhFRHVT9FGG6M28PEAZTGR8RIieOcI6H2vclsmdkNBi6zChMenufd6QRVx4K8H9Jl1p53zRF6lORtIzSKdpQyFsfZmS12wPioTSu-jS-KNbBO7hYwEsrIkBs1kBTL3RGClsPX3MyceUsADyjEOlEGszvhogSHbKSbMIdbmOckNWC1GQRGmkCnQ-LuYFoM0sgBaS16YpgAeDURTIYTb6eXsprgHgZWRvnEe2bjkEDJXCR-ypgXqCvdORSofbHW2mEB_XXunlw8lI3cPIIXycQdb7MkbLX-ORSTysXcsJm1RsaR9m7eNh50U6PIQhRfo_MIZbjgw7mAK5U4x-7i8bc83SZZlwML8zRHEpNtFQxQ16F-ZaGvkpXps4rtn2sAgc0OTrq3wp6ZemgHatTYgrJ6Y0h0JrdKxxdCTkCqnFDYfkSzI93LL6HcW6J4LJmMjcVWONjrHaUsuN23Hs2rhA9ls6TZT15cQ7GyGV3dUkRQwlcpnnuVKQOcewTB4hko8IbZpnNjrkwO0gdnUVGqNFLCF3d4J9usY-PFMqiTEansQdkORTRyuVCUWMTtaqZ2taorlLqGJdSIeXWbOUqdVSc8U6zZPPf_yZ2aROL7N9b6Z1LBFYujxNJ7Lc5BTKa3CNyVM5QVfcuDZ9-I1m1bcrFOFSonWLRoPMDCYm2kphNstTVeqi_HD580_fv3717vLt-zflwa7bXTW78RXHXe_Pd5zfop3mirHatVmh60mJ9fEm1kOl7shtciIpWcmpR-RGZ6M13sk9uW4mUcThaG1XxApgsvDWpEE68UZPuRvDO3-fjrmbTAJHKWXA2E2BbSBCdNcrhMcgxOcvQHS9ehmMvXoMYqi-CDF2CxvZf5XF8OwORB_vaoZfpI2ALN6_-eHV24uXvw6gPbUWFU-c51yFhvMPj6K0ntUSaROlcHNVTkjqKoFGqhqWPw-uTTBVcyOy0c3hKdbsBcSizj1pYtp08iqQFxLBkwkxQGOuMs20Z-Qth5vAadUZwMo1CGPnvDaWIh_sxEUc28rcat-oXIxutp_a1dhVhvOwO1NqeXScCmqDk_3ZAhqzxJt1Vjo8Ump5vhl370S8t1snEp6vUEm_-Y7QcNQROldqmTK_Av_FTWgXu5tPCTudd7FTYz4MLs2R0TeDehfbu4ofwo5unknLs4O9iqRM1OXJFvEP5LXA3QlM7Vr2nQGZOFsGMvO1gXU8zu-kpx3vFH4GOsjur0r_dOXzsVLL0zsAFQVjcZ_EAxFMGCdKLY9HaZpEExvZr-be_cbjeG__S310Wd2g99KP6wuy0x40RUZvqIYn--ps__Ckh9vitvgP)** — it opens the
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

> ArchLang is the floor-plan engine behind [ArchCanvas](https://github.com/archcanvas/archcanvas),
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
npx -y @chanmeng666/archlang context --section errors      # …or one section of it (about 130 KB in all; the catalog alone is about 55 KB)
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
symbols for every catalogued furniture kind** — 129 words across 83 families, the bathroom and
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
nook and an L-shaped master suite, a bowed arc bay, all five door kinds, a shared stair shaft, a
void over the double-height living room, a roof overhang, and a mirrored pair of ensuite bathrooms
composed from one `component`. Every room is reachable, every doorway clears, and the three
warnings `archlang lint` still raises are left in on purpose and explained in the source.

<div align="center">

<a href="https://playground.archlang.uk/#z=vVzrcuO2kv7vp-iyf0Q-I9mUZPmWS5WTcWamzmQ8O3YyW3XqlAiRkIhjitACoGUnla3zEPsM-wr7fx_lPMlWdwMkRV3GyU7iHwklER8ajUbfMQdwl0m4fX3z8f2b6--uYZqLmc3UAv71z_8CAW6pe9ZpI58gU3luVSrhQeW5gKVyGYgChHMiyWQKM2HETHbBZRIWOf6ydwBTZazrOTXHYVY5bcBpeiUXxawUMwk202WegpXyCK4fpHlymSpmIHMrQRUgH8V8kUt7DMqCLuTeAfALqS4kLGWef4lf0G_4CmIvM503ZtAF_WgzKd0R3JZmKhJpQTmQj9Ikykp7uXcAsVVOxtCZqgcJqTTqQaaQ6PlCWAuFmEt7CP_7PxAvxEKa-EVsE5HL-EUsHqWlj5lMS_omlzNZpDF0BBgp8r0DntvzDJxyuYRJrpN7RvxZFzhxrh5UMTu20jyoRB7bXMoFrnSpipntgtF5LlMoF8gWlyEnwpxgy4nTTuSeRKP1HBY6f5rpgshIMjGfSiNTKLS-Bz2dEqOsK9OnLogipY9vezYTC5nuHcBcWCcN2FI5yZjCJDEsRZ6DTGcSQSd6KVOYiKcKj1cAOD0Nwrdv3_w7pFobuFdFalGuaAslEJ9dJhxkAp80TCTxOYWOzVWKvFjo5F6644ma6jw9nghTHLOcHXZhkZe83THKg0zjvQNI5VSUucMtx1-MtK4LUiQZLDNpJAiYlCpPpYElSZ1IXCny_AkWpQPljug0xEhuDLkqpEXxXJIgP8guTGQiSlvPiAJXyAeEM8o5WXxJfMoglTYxaiKh1_uHxT0wcqGNY3qREaCLvQPAoU_MHWTxUhWpXiLxXyGjvwHh4KuFtt_EvFgB8ZQo03qBG2CdkdL1piIhrqvJBEV9ioKBGwuM52Uilw8yh3587J8GMX1tnVAmho4VcwkqhYl2GdAbtuuPjZg6hnjQirjcEZDqcpLLXibVLHMwEwvQyIZNQoDSOKWfM1HMYujgS1I8SNuF1IhlEXarXCykIeJR4fBYPH-6kIWL4QXEi1wkEv71z_-GuTJGG3gk6eYPMoWFUAb0FGRBggsT4TKkg1nwn8MId7I0hXKlkTAVc5UraUEkRlsL98olmSyO_TmcyBTHHhMvvdgdO2kM0oC0pWpuQZROo5wjX1gilxrmoihFDvjC0d7B3gGJ1SLXDqZGF14MePfC4t_dfLh73fVHGwptXCZNAZmcK7sg2UWNbDXEE5Hcx3hmUWfJ_yiF02aMmjkGYSQNv7364RpIWXesLl122IVlppIM5XWZPbW3iZW2MAkdZkZm0fQ8CETOhEllARNSGOKeJ6MZYCoSkcpal3h-eWVGQ2hrRXJvQeS6mDWYcBSUL8qDhUKTiv8SVbQu8ifWvpAqIxOndGGP9sjC7L8ONukntEn78MseQFkoZ2E-3wOYGZVCP4r2AEhpw9UArUJqE7GQewCkwaF_OcI3iOVQLvYAVjaW3vNqlmRpD4AV_B7-hGL2S9hLxmjsGX_xK755AFe1oL6_evNho6B2cd6M3tFFIo-CzPsXO4cgLHyF_EDtQLCdx-7TIfwtnIi_x6AK60ThlHBs5oQlS52mRlorJmh89CN0kE96WbBSf0GLgxfgMiMlAS-lg6l6xLNiD79kwy6MLBwkpbOsVomqLxiH9NjkCVA7OCdTMBJtTpGgIWezT7hMXoLDaOpOLIvBET7GXYhlMeTnQ5J4EhLUTaQJrML9h0QXzogEV0aIceUlzEsry3mPTOYRquL4CN5pJk1Zr2_evLt98_KaoCv9giK-KM1CW3nJh4WQwwFASVzIwvJKvJ_B3PjCQioTZZUuuuiuJC5_glz504GUfGEhw4UiFUd70Ji03lYUXWB-qPRr-v9CGMfrdZlK7gtpLUoz_AKdqBsdQqd_HjUeBqcRPoeHJNdWwq8Ey0tIv6b_C-fHW_WzBBz6iCMgFxOZw_41k7QPpZWWBJMgDiBWhZUO-qMo7uIRhXialzaLu0E7oOYjNVZJzaVXIyTDc1zwhM4_WX10Izy0RqYKuHv95ru_Xn-ATFsXRMNmMs9jGIwimM9hqg3IYnAsi2EX4uU4H4xRs8QwiBq_j-eHHtiURYFarqFwUJbQtOOpIMex2g0vxn2GovlRAv0y0ZVLrRdixC6kMNKg4pOk9RKd5yqVlt088nCEQRPKXgU6EtLATEsLTi96H968en3nGeQRGwcjyB0JLumswOW319_feRcsFg7ORlEUw0TmennI2leEqdCCBGLZ3cnR7KIsFxrsMqh_pu_jd6jMLEOx5qX5rq9u74gZ3cAZ9PY6yOUvrEenTeJToZJ7aQ6P6Ifa1HqKVMGiKIoko1Bg0TPkQABUwsVieRFFjxekuZswE2FVAZtgcjlFlDbMaRQ9nozaMMsEP9NBoPUzDT2ctMsccXoBL6B_EoVjcoZAUQRGO-GQvEDEHgT1_vUf8UfIb69_un4LfZJGWTjzxA7aZRVzeT_eOy6pQpk_9u5MF7zP8ocS6b1L2H9ldFmkMM21Nvteqx1Ar9freSnpfaY_j3xTSFZ1KRgUaNQAKLZzoQp40Hk5l90QeNUBSy5dZZO8A9Nh5yZoDjr-E5kp78803CUfGyelwQgR3abrl6-uWScKsHIhDMoIR2GJMkku424Ney9TdAPn0Dk5iaJuPxqglDkNnf5p_ZlIjpNljD6fcjAp85m0cPPj3cerDy-PVqwFM1Y-OmkULT9YC9SavAVQ2YwhG43wLX_mScN3Dbr8V7jIFfKMSFVpUe1GkCzrKVZG0b7QMx0RXP9d7RqWTuXKUZQyu2S3g3xWyz4fuSdTXaIDRT6eN7q0sbRi1teBsdI60sVdZJj3IGuT75YqkYerbFuOcepxUXOuzTro9EYjb2Ppv79uAlg-D4CfPP82AtlPA_nhna1AyFWAzb5DE-g04Jx6GM_H7zFA6ZGHX2FY6HgHFzdijYt6OlWJHMtt07LLchJ5PtDDyUbiF3qZSjNe7kY6D0j0MNiF9Ama-lGA4qfNWByzPSRj-0mqGMAfqs1opMDH9iGB56KdNxnW3KZj9KY4GrMLVaxGX6ks2tvY3ri8T97TeLmRkkFwNU82kLEZSO4Caoz3DNoCph7GKZr5XUJ8Uo_n5y3HIVXF-F65ZwhUc5XnW7HQlu4krDGen7cQdq-cB9t45qM1MGbZ-aoYkF31gePM6HIhU7ZrFABhMOaTi7_VsP5MqR8fvO_f-gdE3a8sShVVjFmjs0dVKTwAdp3w8yNqmRBhvKK394EjDB67BhmsQw3JiqqGRD0SIH_kt33Q4seuYbJSYDKDEqnIRFP2OGiQ-Z7eDmQuk3U4Qb4YwVWaJMANz9tw9HaAwxxXWLbfTWK5dzP23_L_VxnO5pOcvUvA3HLiRDHLJTsLaC9vryHRppCmkfFVHFxh-IKQmABGRVFhXr179fb6Ja_rQYl29picnYIDW_TjJeUjhJGi65cmHIfSqNm0So_WGMUGIkD6nyuPZNUwDMnn7gwH9ZH0D9U4z9Bb5IPfcZ5hbWJ2lnmHTlobhJ8fTwbNwJf3J_wRMCNknAdaBfdb5eNpprUCx90_bQgo7-f-KjgjrAGz_-6prvUci9WgBfySXm4BM8IasI8IavlvAI_OW0fqr_zy_gqwR1hDDmnRCvm8hTxoIN_xy_uVBH7LbjYfuGM-KF0UWCoska9Mm8PiqWsTGqPfKJWhMBlT8eiPh7AspBZIODUGwz4lKjiqpqQDvtvLUeVSxOKz-bJw0rC7KZIEf50ZscgO10U7qMhq4YMdCw9q9LXIcy-4lBfCGKHMBRqUVW-Z1Dut7ZJy8VQ5WNBCXEnvw--Lmzgfln6dsnNTSQ8u49QflKVKXQZ9PCFktjjKoMoHULjNGQRSL_6otbD9uW9g0yFElgT4i4DecCO3TdE45PUcwfTwn_9ERmNwNmqsYxjVM7HbvxForJgbfKg3UtrkA2cOnktlcM65nIWi6f114QCpDSwfRVGF2QLypm0sH52nktdZRY0tpvq4Yp1aXboWdLCO_MeVN6ax4QALh05ToPQcCcWkF0O3Ab195D8s3m2CG15UcBfb143uUqKNJ49gaqcT2VejkMRu3Z6mBqvhazexgg9fIXi9Ylr8MwGDUmw4HBebd6nyLLeJfp3CaTOlnsTXTJn6yr1EDtfkD06qHcNJWnhsj8a-yuOJXhWtfvQJdYByRbCYLqcVpF_ryqfnjfMfVjmLVK4PrKMlGlp_XBVETE1sG-zN6YrMLHE8-aQ1X1aUri-dXnIZOVRWV-uqmF1YKcl-Quliakph3jA6OhpWTl1d9GWOItvPoghegIK_QL9f8_7Mr9GHEuvj-pjMb0hX6-8A-ERuHX4RrR6itfHBgehI4TP0h9vABtHJ6qH5f4E1RBiTsutg4Rg8A6x_Fu3iEhygC21Uqs02tMpKrh6N89WjUcGxAHZ9nnEZfMkNpA1PLlaswIpI1vnrz5hArUFTae_bfkB3cEZeLVeKMJmOkomZ76aZqzG8CU8yrMMjBm5cF3XzYZ2Px1pTK4--GW2i9T2yZhoowphg2KZo2KKoBWLKGawtaxTVIEOK-04CSsMnb5Qv9FSM8ybKGaKc1igI8EiGeztKoqdTKceOKrAcNSJ7zmqPEQ_KI4LsQBFmzvytaKFYaXQ2CihYOzkf1UwenO2iCivpqw4gEnVyUq-t2rQdIEoUGtooUff8rF4bwpBaeRZZ7mGMlXwQM4FlsWApK0MynWKhh_RCE6Qt1HT0PMuRKtyz7ul5RRVF_f0KxQdOaxtXYkBQra5JEp9dK2dU3uwHwk7Il6n29DRM0PQW6gn8t2OrivtnToDBxS5I6_SDbOzIMyBPR7shU2WzpbCZ58RzIM_6uyGnRqW19_48yLPdkNRFNE7ERBXSwZr8VE5j2KhPLFpZrL6uSPYFnbe6Nkgl9IvdMBNhrNM6b8CcY7kReX5YJSSoxPgbYS5GnwWmH_U346zAtAupLA0tHvuiSJCqSlCbabmGVJknysntwjg7aWNsrOgGjJDpOyK_1GOw5x5WdraltkyT-EhoQ5WaWgFWS8ttXSHY8vUoc3O2KiQnlR5oZD03jCWz-amx7QNfFuNcl8VMMshFrX89ykXTfjcjiu0gfVTYK1p8IwjHEWpepbxRjHrfVMVFkqogD1EEDsPXkAeC0dE5PMLgKIL5fo2E484ZZsig5w2UYXCOqH-RiqAuOB2oe73nwjp-EHR8qgx3eP1JJfsBN-2FRl5ftcc-GSsTXaTCPHEHle362mbddRuaOWYiz7lF5KDusVxtv2zUpv-EIv8A9n9EHfsn1PirKv87HVI73J5CjTtTrd3CYMIGOVVo7l6caGpxwQT5IsdacegOCNnyLlfUQ-9Kuz3V979gaGcVNpXBXDnqx2PJo1x7qC_7HgCM0eW0tPK31OXbFfnVWnyjxBs6uZp8btRmPyen6_rURKaDsYXdTWi-5Yyzeqebi3kF-jW7YEaN5rXz7UgTmQ4_QdBFA8mXYDcTxV1jz6p67qpU-qO5u-y5vVLZKLQFDbF_22z631Rqw32p8pO-ftUoaDQ7-b71PWSD0MvHnzcUMgpZMOToPBRJas3ZhHyLr-7X9YBmGatF5TD4J6uQW6kcbqRyQ_erLAbNgs6uF4crFIQO2b2VclpT515ipett7_b11fvrl-1C2NKIBW1N6Jv1k4Xeaht0Crfy-T5ul2Tc8e4yZdIulEXdrV51Reppq88V2xGxyYaqFi5rVOsmkvSOIL1DpZGg5yoFt16l8GtcK8A1ZRMtfesDx0n-CKx8CDrqZK15qCrP_cBz3nIzKTm8FHpTMuC5Oz3mdtUGbc0CSUOERUG5T5-2P639FarD9psizK9uq7-s9CnR8b7E9ivsOEbnkvYJ70FsvO_AxsMbGLiXcmGDtHjcaZnnvtSEJVRs_0RJ0eUMG9SGRxE8wsnRAOZAd5j0xDpTJv7GwFylKX45xasqe-0SPBG7Uo3cXIp8xW9-ggF16ekzWvO16hNrM0rNBoMTssKfrgmwkgmDh79tMCs9n49mG0UZ1HrwWTU41EoO4D1VRbjVj-8AXXIffGjkV5bzgNhAjFn20Hko0y4shUmNnkjfpaOCB4JELdF1wZ3Q84V0zUZGUgpVM7JgktibFFPIBF6X4MtNTkOSS2GOWktFhdks6IRue2LX2ai14q3lHFSnqzDD3wcz5xILnm4G2DR-S5GKNRmXgnjzvC2nesBoR52GR64XCcLBWUNrgJ3XqViyPkXKxiW3msC4luyvNZIi6nBd-vbmx7vXvnvalEUvl8XMZTAaRtEhqQkSnkoSBMxK7GPErntwWn-J1yHG89irEnQVkBXdunfVa3avSrv-TkPxIAs8zCL3wImwmBvnznm6JhSq69XVPSaciIo_jr-9uns9_unN1fjb65cfbm5-iCHFxnWU-6kyoQfwwF93yxVe0FoKU1iwrNLUHNv_449jHD1-d3M3vv63H6_ubj6Mv7_67s27VzEy3JNtgXk69KAdvjYTyizYDnpIL9CVwfjj-D1Sd3dzM3539eHDzcfY3_Hj65YkP_N5dduidRQq2amOgXC0Ic-QPlkMG8OHnx6-oaT0-dXpphrHoD5OvmBS32UZdP29pF2liD7ZzC0Iw20IlGBvOAjNsuNKaeSgFeturo2wMTuLouDoNuhpwflj3OVGYAL6I4snGwooE5k282kDrMqP6uzLKDSDUOYErV1rfIHKEi-ApFWFoTH-ZOTTelvHV-bFF0swCzJstsw9kmVaS78T1O61oGZlYrasZbh7Lf3BadQEqBazbXxrLf1hf2UxJ-3FXDRJ2V4BIvGk3FqdvcWGs0b9p2EmGjlKSrcgOm8NUnN2upqfq_mxEaLFEUy0NiFa2_sciAvclN8I0eLrKKpKPfVC6lLPRohG_YkgkBcXUbRWfFqDwAuQzSbEECNRa9ZSWdmboGGikqtvYvRx0dugH_xn72wdfaqCSUqoe9av1zdoZi83Lm-thEleRfdsew2zf76Ktx5BgBEqJ5cNK5qQYvBYWfCtqTyfiWKvz9-9Dg6jN8VGpmUiORuGQ_wNNoosOvHWS-jKQVlghptQ7d_-Hnt7ToGNSr9-WAknUJGMaiYOQ-Nkc6V0n_uy-mcTKDC9e_3m1l_m9oT5VBxp7W6VVysdiiUtVDm-Ahz8Icrr1f8gRBcmdE-fOTAzlAnE7MtMVvFQncsjW1ybid-ZL045eKOQE_-pB5-TecShUZfyGV2gvBVwEzDHnPTSk3-J1B8gz_ClAf1KgPxPQTDiwuh_yMSt3WpmHwRvsYwnT7B_ZZLsrShm_nuUwP1BNDjtRee9wdk-If-6938">
<img src="../examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="../examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fourteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVtdchtHkn7HKTLIB1MRINz4IwE59EBbkMSwTHgperQbExPoQncBXWajC66qJshxOGIOsWfYA-wR9ihzko3MrOpuNEDKdlgPIn46v8rKysp_nMJdJmH-093b-fwWVrlY20xt4d__-m8Q4Hb63Dpt5BOsxEblT5Dp0krQBQgYDOAR_9uALZelWYoCcu26kBqxK0BYEJ1T-HR9N4NtLorX4DIJy1LlqSrWoCxkIl-BXoFyXRBFSt9rl0nD3ygLa6PLIu11TjunMHuQ5sllSCtzK0EVIB_FZptL-zUtaWGXCYdkqrAqlYS3E3kOuSpkD-4yZUEXEp_Ar5ApYpG3pCyIxJUiz59AWVvKFITtwi5TSRZIdpnOJWy1Khwyjh899HvDPtjSrEQi7WuIrXIS_v2v_-mcwhK5F-Yphm3pGCHXjthBCeJ7m0npulDgR7EuXaq1if2-YSOcNErkFqx44t1JlELnFOwvpTASNtIZCbp0exu2cP2pC_FKFomMYautX3yrdQ6ySHJtSyMrmVtnpHSdU1gZXTixlnwc_VHY46APnjVYqUeHtKQNSlpYlaZQNqPn1sKksvBsPOHfzincK5dksgiUNYUIX_H53s6u3sLdh9mnGdx9uJ3N4N3Vd3ef4NvZu_ntjL69vnmPD8Db26vP1zfve3AVBOXFj8d0M78DAUbrzWtQqA2dUxBLKwuH29tAnEqbGLWUcH7-s9VF_JWFGB-3f_9H3PXPOO1EbnurXGuzEEaKxWYQk1Doe9wgKXnnFGKbZDItc0lr2hicWOZegspZQGrIRZGiWlbIXpw1tiqskyLtwTUehF5aZ8rE0XY-4L7xOlZHqIokL1OZ0qdWQ6JMUubCKV3g-d9bPFKh1pkDkRhtvfKiNn3TOQXnr4kA64STKTz0warNNlcrlRBKfR-DErGcaw5sJQS8kFY8qWLdOWUdxW82OpU5pFpaKLTrwRWJA97fzj9_okP88er97PX-lVCWrUklY1bMLliN0MplunQQb8VWmphvAhPuJO1Vserxdd7pMk9hKcEmIpcpON1Q0R58wG15DaU7yEqInL2_ur16P4Nr5nN-92F2Cx-uPr6D-Tv65Hb2cXb1adZjtcGrDqWVFqHFWsYsWWThXhUpMh-WqRRFitTCyXt6_oREHX9e8LKLu_l8cXN1ezv_HMNGCktXRrnXMO6NYePPswtiLVBlPPSgdwkbsm1bYe5lCnEiTAyFlKlFlbJAl1dZiOmFZ7XLUlaPLiNmvdG3MkElEHnnFHIpVqwwTtxL1EdIcoG7Ew5EnndhKRN6rxwtbmH-t9ntB7zMRpAxd5kowKKeoKpog6LIFTqBWs1SYTOZgpGJE8U6l00TzsyyygkH-kGaTIoUtkb_zJz24DNaaQRGIuSEv7N47MrC29nt9d9mb7uoi7Azyjnp_ZGRVucP0iDFUrJ_IJ_hMpXcF9Ja0KtV5xSkSDIgI0M8kzDIYSGBchmQseiRM02NepBoAYNhRsEHCxq-jGn3nVO2UiA320w4lZD_QTYJL6gPiMLupAn3jkXCKju_vZ7d3F3dXc9vePUtXigy5bZxi4LDuZnf3n3ohrtSaINnVEAmN8puM2mkv26x_KUUTpsFboCU2urSZZUhChfpzhuTXfbEt1k94DHj1WD18kb-61QVbCNIfjsdnIvLjJSwlCnZT5Iss03LrUQi0oarkuZBJRKW-IF1Irm3IHJNuPVevWBuZvB29vH629nt1d0MPl_d3lzfvO9CLldkK3QB29JstZWv6XmAz4vb-fyHxc38bjH7j5-u7ua3i3dX36H5fezTxr9lLmEAZ7l8kDkMXoUjQT3IxFKR-afts1oUmqB5NztVpHrXg3nhYyvaBwUiSO-FAJkgxa1FwSco7FYmdaxEuChIFtxW6m0uweZSbnF7KBVpHaylax2YBINmCO1UASJ9UFabJ7TlK8cnBJDJ0ijrVMJXRkAqnnIyst4mbWRRcYIRFwshEWh5UYuCe1g5aQgRry0ui8asB7EwSQYPIlepcKxeSS5F8U3rGzg_t86oxMVg5FYbUmkO43odkhuaUQw6PqDVP4FfOwBlgY53s-kArI1KoR9FHQByG3A1YGeciK3sADsH6L_mR-g2QLntAKRqY0GUThPjIs_p4aan7wDkci2LtNMBOCWxBk_Wg5iPLP46ri9WTO4S5UlBLMpOF3jZxUZCqgzbMvsNxFXcSMgNBdsKQ4EnBZkx20MKLVVxHy74Fo3lmSCTep5qsoVbadxTiDsJ9LvzH2_nP74iLkSaWobs5drVMQlq_Ggygs3__S-wZVg-YcydOLCZlrlIZA_FggEvyh2CopIc6YN6940Pw_bgLOpGr-BsMIii5iv6_xV-y686AL-xkD9lMs8hkYUzEndjWZ2bSYUo4ONrENDv98bwCFPYhIAAb6MgN_oIF7DxRpRwdUGxGrN_TiZ7lYvivkeH7OAO3sAwiiD8OwX5iKG5NrWf6NCzaBT6cPKe4yWy4SdeOORWVPrG0iYOAeDOPwhwNhhHUXc0JjH0pwdv-pF_N4oO3w35HUH4NxjxS8L-bY-V3SLrA2mVouCx5qUfRfArnF1M6qXptQc8gBm8CDMd1DD0-hmY3cvc0JamUc0Nv26jyP6XmZlEDZFNjsKshTkKM2AYJh0dOQhSVmAfoNI3ZpEhJgCGTE2JglX_lDAYRdEjbgQgF0uZw8kHkecnUP-j6JIwUPGfmuF-ayHryvTJL9RQIV5oNIyiR_ygWugTPn7SWkivViqRLWDv1WtglvxzwB_p8ZN9YMZoAZdOVaJpaIkHnkTR47AJ_JNTuXI1zwRc8oewS1rgIfWswCdRC3zcBP_eRypvKVI5YfCA4cOX_QV8aEoLNPWBFkDsx4vmwYaIf497b4Y6bFfQnFHsRhF7tyoTsGHlaAijN5_O2C26G6LlCD99ky6YXhfAlkY4YgV2KnUZXoII0AFJDoQoMGdAVtSKkzoVwspQD240xEQYY1AAMQbx1WtE8a_1VhbsPDhFQ8fFsd4G03FGny0QdPH99c3bxXcfr376NONogsJsI1elFZRlolnWWE0y6xJjDp8yUlZixIPMLfz0I4WsjOvI1yjMOuFnsVliHMW7xay20D6415SCSI4daeFCoxCk2chUYeCx1dZf_ACN3tvH9wfZSuWGj2Yt6JQLmYfkLGQwXQ-My3tI5eObXBTrUqzlV5yRJLp4kAWxs9IGROELYWKpH3i5pHQURx4og-fD_2kqRX80GAetGEZR1GlRemOCNQV0E8Kh5QsE0yjaVx16uoXgrUYD4WL8PELDPpzCFWx1ci8dHTUferjmnHsVGhJtjErxloT0gMVMR2t9NEfg_d4QNh5Zr2CJvp3vDuvDmXKcLMNkHJHqBr2bRBFs8xJTelInked6J4pEvmoLmiyZZ5p3PCApT6od4ytWO7x5nh1vdFAl_RmFDGtTpudkamgNvkvCOYFRaHg2E_bIgfP6-EI4GF2OnxW5N26eFbbaJMzKchoOPO2WMt-6mNQwPHjfCTN9oyuT25DARS2B_kVQM7Z0mL34oiFuwHb5_ldXXHBoJ40v52xLxzcca3_xUq10nsbEAHHlkRspKOhgKbfoL78BwXYLrRVshTI1MdSse5JUJvc9uJEKl_TYdifl1tY3EA-LaiqfUK5nryiVKco8p4vKh0allSWWrsgSpXGo24VUQBe19QInjUFh-yRwKeFebh2lRwaVV5Bo2qdO2wOWCOxd81G_vnN4gVuEuEkIBZk9wuFoUB9crbsG00A-RE5nKVpSRRV87C0-vdw__EOyEAE0yaYYqtVKe4QqBCR7DE9He27uCFlDPWuyQYNsEBTUOtQODNcdx23TKOqOB5V3n2JoggJKlcGU0Z_g-fn5OVyzG8DX9DFVvKlsnkp7z75fFcFogiiSDBMBvT0nl4wUeWkzXgjF9njpd1MjLbW-xy2sjiAttXN6w2BNJB9OtZCSDHcagrDhMIq6F1EdxWCUFEVgNNaKEaOxYKcFZfVKEJCvTpJxZUFbuUb_DWMMMK10MMAz5gh4wBEwAzfcQA1synXNISUQ0ahikehRTC8AuIcFlgUIYEwB7KAOBfHUH1EJ9gBaCDv00ObFvUVhb5fDwAxqd1sHzBPi_C6gSf8FoKWwqvidQNPpC0C7hHXy9wD1o32kFpS_YAuLFYk9PMrLPMhFJeumB2rokcO4Bo5w1USpj_w4ysqodC2_hILpzEsoiS4xLvwCCpmCF1A4fVhwdZDShYjVeFKpMV30aRumzQ079bP-eIT2aFpTo0EaVXpXFTf2FEYlT0lYf0IXvTZouHr_skXftGrosH2_rbJsp_6BGwylQhO0iy2FunmJmQN3d4QvCxeUElQ9ruBMGxmALmQj6qZWFVbqzsUOI5JMOHwGy_YCnApZwVY4h7VsH3NbrKvR1uY3lM18-jCb3YEIkRdV_bBNrVzdLcKI7fU4qtsa7MJTtZGFxfhbYakIrMMoQK9WzTbYVyG5MXIlDTWYarpmMwTpNirPFbVvLYWkvoTlQyrfK1Dpm_WCGgZQNxU42RxzyYxclbfTrST8rSc4OYTcCpcBFknYiRIk2qyA6FVq5CEPASjFzCHHRn9V2WDH0eDpAgsDw1GDp3eUmiLZyTOgS0pjHAWiDs4m0wYqb3TkQZ8BkPsAfYxAAgJv6zIAHBWM0gD-j693XFDB6rJV8BgOG_v6EQmObClHM9gSNEUSe3iDgHfk8Ck8A_-nUSfZZwg9-2DaPHyZ3B87eGzeAreCA1x_zHi1LcFKxuOwWbn4Uev82Pb4_PfUYExlwstRw70O0bbgf1V96LgCPAmTAhbtMbHfk34Tbhh5tEOApUwXFvYVgAAG_X6DH8xIHp8F2LUAmsff0KBJ9ByAhLYKTmqI2lhPov1kqDWdwb3YmFLaGKgN35hGoUa7YJqlMEZRcxDTInrST0KEAgMWFWg0IH-NiXNVy6SKyFYnGdaUHGQ0KVLoKqXjIQb4WauCPhdJgpVuRl0bsc2oQXkwU1E1a5SDssD8jecIcMaCqy1oVsNXNLLy93_EPbgK0BhqKgspGlIjU2w8UJukaUVX4p6_yaVjWXNag7vgJE45NqdeJOmbFV8ALhNQDbdR0z7rTy8O36FZfFU9ye-onO7rxXx2oT5XDdD4_iqPM1n3lEvsw2Ngs7XAGSU3q30XlCxyaOwFz6cemkee6R2euKIKA29pIyX5TyoMY1XiYL-eMU_1K5xh2ECX6eyyH17-dujnOSk_8PPvdGmcxATKN293snBP5-TPw4SQnwxCt8_pbSjJxUb-Uioj7WeR5_HrQGEbyS9X39l_y8dEbutpFFHNHlknCm73sJA3Kk1z6XNjNEWqWQ0otNmIHIQxolhT33JPiwQ2aYTj5DfIr4qYwpxOHbcN0J30R6ODsK1FWW6WRua5gMowjqYtyulRwuXyl0bt3xugfft86c1XO2oui0Wuy2ItOUZkBR719-j6hyu26frRs4RtSixFNTgd0BanNSE1N_pHsldV7G1xwLfrYi8avfgi2fDid5ElOd5DS_3PerVJI4MccwLYopMPiyQTZk1pX1XiH0RNR_k4PCDbCJUv9WN9fshl038EsnaOasRmqysup3Tsl3WCMAxu-YBOyqa69Gl3UavFNBh9iZC8bLc_aRwfynNwRKC6UKs6gkCJRF2sM1WXAgXaHx8QZrLKyBq-edD2zYeENjPlsiac1uvBS5fpGNnl4E-RTUd_lGwQ9Vvq-UfIpn-ObFjL8vftbVRT_QGyvo-Kj632W90KH8DJO2Ws-4s64Udarn-02_3XNLv_ml73X9Lq_lOdbu8bT8JAU_8E5x3JmQpVVINIoRVRDbnRCLfIE108UTyDxW6xkSlVu5ULrrwoN0tp9vwsNlQMtV10Y-wLRyFpUhys9PNE_nvOFFaq6qp56NCYIYUKM3wYR9LYOEWpK8wxMbVWie3yjA21yFAt0vOVNhuQ1qkNBZmh9B47-ejOPVXPWR7Pg5MfGvI4ochbpXXsMOpNYMOdBqoc9KOo126d-2Cl1fxv9f6rxIgePgnN4eZkb8ZTSE3spUwHcNjvb3XlPXY1vOY7235Th5DDPchp9GXI4cuQXG1o9_hbLf4AKVzGsvaQwk8N7bHY38ObRPt44yMs9lsshsKVru0Pha98j3AWiH71QJ0ayT1W7NlKg10b2fNRP1bOlzLXOyzMGSWbgSfVn1Q1AQw2EytX5W6cU4VmL2lIGFFuzA612zx04Mc7spN2cw-fPSQfPtOOPUY-bJPjQb7Q29wjD-e2t3r_mcbgsdX7zUmEb68-fje_-a_GxLAmjyEc3FNHTmGreC1yHDWvh229rYrBCJVbX8zDGMRD-xFNtqho5WobupSZ4vQXdaCaaWS7tcL_0CrZLqQSE7UUd4S1S4-Mi3zFpmqjUv7JCKX0PO3t97O4mdMgRAwrRZVANCqe6Yo5n403WFb42MGYMk1W0q9cQjuPmqjV4DTDkN0WudU4uGepitpIwJrKh7-MwMJTfFh3CCyWNvxg5kBT_RPHOouD4fgPdRbZzO3NLlzWDcJn-opsdZpEk_GXuops_PZYpcbJywuROdojarRc647ifp3Iiyf8JVs2bJWJRtTYmjSNIz198idalKneFeFC0U-p0BLCGn-gETe7GjFP_Ma-lYi_bqAWYvy6ei72Ks9pOv4QydU6VJoC3t3Of6jS-cr-oflcaizxSfw1TLkF_1sRfIquLa-JRR2Z8rUOBXVsPqIPjEgBqXhEmQTPzm9LSkSdbihq_Hnx7vo_7366nS2-vfru-8XdnIa743aGvwwZ7AvNr7pvNQ49S8r6B1V3jsxVu19oUvxNQf1Ao9F70OA9zLEKvA1U6mgE3NOG5xxzz7Je_0_sbFjt7LLaGSWLUQN58KWdDZotbLrFe_sbHS9X_CH-sET-HH_D55rs1QPPSf45zoTLXLn09FyZa-2v1aO_PN6j9w3aA5xmg76Jc8Hx1Rfas4zVY5AgIBrWqKoLl_ulZSkepK2GCVEKPryh4JijfAxEMGdDq0-HEDd_KBkG0SiG7rRmoI038Hcfrj_R_HmXp1u4tBuHXwxhsiBlKtNeqDH6CTmrcIouhE3MGep9iKkKzTvwE-yrkARUofaKZ-pEsYZxnYI65fIwme5_ENT6uQD7LPwl32L5BCdXJsk-imLtP8f84GQQDS7Oo8n5YHJCuL91_h8">
<img src="../examples/garden-house.svg" alt="Garden House — a two-storey family house on a 22 x 22 m suburban lot, ground floor shown" width="620" />
</a>

<b><a href="../examples/garden-house.arch">garden-house</a></b>

</div>

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=jVfbjts4En33Vxy4H9pG3B3Z7UvSQRbIJD2YwQZYIJnZeUxoqWRxmyYFkmq7dxBgn_YL5l_2fT5lvmRQRcmW3VlM-qVpieewLqeKpQu8Qe62tcojQmwK7aBq5eOWbMQf__kNsSLkyjqrc2XwxufVe2U3oL3a1oauBxeDC3mqI-Wx8cqYRwTX2AKjWoVAAZ-VzysYbePn8S3ogfwjvHNbuJpsgCtLKORko1cGlTJmMrhAcHLyWsUKOsAyDJ5UXlGBWHnXbKq0gwome3WyvWzYDLK5cYEKKFsMLlDqGKnATseKmQxKvY-Np_CKN8A6FM55GFIlwo6oDnA2OpSNt5o3XuMjmfIqdzYqbYk5R9ZBb2vnYxizzTpKNLWhgNK7LRSCthtDKDVHqzbKYvgxBXr63Ychfh0AjdUxYLsdABuvCyyyARByZQjTW_lhnY8VmnowAC5wt4_ktfMIFRmDZ-CM6aidDdf4qSLsX8-zLEOhH3TBcWtskPh8__P796hIb6rYj7CQ6oCdMoYKyYgYz--NftB2g1CrnFKQvcBzZ5qtRagN2645UG0q8FyyiOfCfT2A8II6oxErnd9bCgGzLMOvGGWTbIzRKst6i2WW8bpbSCbxpSM7ONwjmyayeUczP9J8M-4mnbo6rr8ZOp8foWn9hbMlEdHFa_-pjaSKrcPpL-h_E5hgz6bCqDUZDN-nvc_xdx3ziuwQDZdSS3GfHp6wr6lgOmbvItCxsyP7mx77dylRQxz_hL5N4AmvpLLHm6Jy5J3Oj7w_KGP6pC0tU5zaymXa40zh6nEue7aqWH2FU2SbioEbh80pafDrkhUnjLb3gSu03dbJlYu_q4RroWyj_8d_f0tIHbhDKW4l3LP43SjXPm-MEkFYoiKcNJDxq_4RQsrHiOPcxLChCJXakIC45jpL2Qh5CHC8ik9bpW0br5ujqHe6iBVLMDsvsErbDcFQGYGwY3M1i6WzXRevXV-NKa-rI-fLLDsX_blJPbkt5wdZJPiLp_DWpNQ6kkmuiU9Ie7pYHnTxV6R9P5mUC1bbwu3aUpuJaUAXsMV5wE4BUsC86RDh2TcAFrMjYHUw9QAQBbS1zO0Yyji7kYyn1s7bb_muuMfv_0PuGhvJ8zJE90C8KL0uNoRR4dXOQgWEx-3amTBmuRzuqK43fBKqVjGT2YIjIAX2InWaE0x3HLqUsssJJJjlVzDJLvQwLxd_hWldOGJmq6fnLLJBvwifHer0wDPBPdURuSHFhSNRFB2JBsJpPIIrVYrDIpvMbw6NhlWxF6G3jeajK9XwBCoaFzHeJIW3UBbHfnbaT4fJaO5Wydh2tvh_tl4G8MTziJo1PzpzgXUs_UxIu74wvkWo3I48tJWHpfLInbfkJ1iroC3URmkborw91MkEv7yFS5Dgmva-F4F2E57UUKy0LzojxYsQ1WOQvsHjwqNreBSEymOT5rxINbQNuqDUOHn2-OWt9EubV87zrOYOdJchHQ8qNjRJ41KAdzF10dH0RSYG5TpE8raFCnHCscljZn939-HHf969e4XPpWlC9RlbUoHD3c0tKsrmS55MLHmUKid4FSvy_NYeiMVNT3lUPKVdBhlEyRtt6WgmOzDLsu02DVyXcqWVV8c54DChWrWl4kyAKWXSKaVTHC_Ql50E-XroZe4Oz_BRHAgYpQSPT5UpyRZObjyT-fykhuaLxLlW-X2XgOq8nR_ZdrkUpLZor-aUPKxdjCxlDvFhTtmvsrZA3-kt2cCZC9Gzam9TNKUJBqi1e6AJ3AP5rhXaGKA8fxykMdVTSZ5snlIx2unI0Ryjdpq3Bh072a4bbQptN5cB__j5p7sPktCA0f711TTLnq-mWTbBY_qx5KmslC59cZ66cZdOMUeM51QHVrqPHFB-KaUhkuFL25MquCB3yhcTIU25rt09NygJ8mH26AwVIe8qbSiVXa0sH6KN6bTaV1pb6L0ncilz279p_6_a_3L3y4Sgt-3VzV6Pr_42alecS1eWgSJmiwyR9hFD3jjsUKs-6kjxFHXTR2WTZQtJA_rZWXytJtTq5KxpN7AwcHqYTJ-gloIaAFFHQ_JdBNTe_YvyePhketN9mw7ltdyFn9aPGPIn6FtlH1Ro36hIGM6y2fIqW17NVvz0y-DL4E8"><img src="../examples/studio.svg" width="270" alt="Studio one-bedroom flat" /></a><br/>
<b><a href="../examples/studio.arch">studio</a></b><br/>
<sub>The flagship: fitted kitchen and bath,<br/>an enclosed bath off a central hall.<br/><b>Lint-clean, and import-free.</b></sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=lVfbbttGEH3XVxwoD7EBWaVoy1GcC5AULQq0RR-a92hEjshNqF1hd2naDQL0Iwr0g_on_ZJiZkldbMdNnmyRM2fnds4On-ANYufOVlx65zagLfm4YRvRmViDULCNnhoUzntTOj9B502MbCH2AWvjQ7waPQEwmyLWnJ5P9N_BCbRxtpJHG5zQ_rEJILU_faEI-RTLjpomYO3dJiEtJ-hqU9Qo2ZtrDgocam4aOCs_jIdrY2Msg2wJgqRgonEWziosAL5mf4tQk-cSXFY8QXCwDnIcCrKoHDYmBGOrFMt5ysZt2RpbhQmYihq1C5FLrG73qcJEfHDGBpwsS-c8Vhw7ZrucYOksXorR6-lLOfT1sk_0IoGvW29NbD1PR0_wg4aoXZBDA9x6rVY1Nc0Qrr42AV6i4RKx9q6tpFFDB51XpxXFejraNmQxfte5s7f96x8bimN8GgGtNTFgsxkBlTclZlk2AkJBDWN2lX5Z52MNb6o6jkboTy9f-feNuTa2AkWcZJPsNBUZwfzBuMiy7GaRZRkaWnGD8c8mFjVbfIdf1GuMNnDAx_5xgjpCX3E5AxRd0PoDFP1S0M8v9-i_Uojs0ec3PsKRyh3iiN_pAc7sYo_zEzXNsbeU8NB7nu288wuJ4iDHtySduHv-isscSPU7c2v0mNSYyiK6bQKTqI7B-l7lYyn6E7zrhwC-tQHGRqct7nsQtlRwoqt10AlsmNZXIDtML6jwLiTqdLVrWGGP2RBJBttTrFkmiCwaXkeQULSi7XQE3KUm-CayN87jPMsOaDfLMnzSswcuoO-FEHQ3PJ_32a29szHFTnE39E8DmEIE2_JFz2Cn4aVBP6DHFG-Sd6DboKhdzZ6FmiGSLYWbFCWwLMUfIvm4vIJQQCWOJ-mF0rq1TwM6TkefSuoKbspX5fsUqhtSmmpzJWqBYY_OlLHG8yxDbWzFsEw-HYfQSdrav-Q8AD9YJSXB_aAPDjjCE_PH8XT0voS3uIdHsf6_-PJviy-XhnfGlq5LBUyDMBUmJK88U9l5wCYNY8R8_tBps_k9P6mHIlNEfjk4sS2Hoy4ecsmnKxej2wy4YqTz9JbLkEiWrpyaqQziRkqLF1iumzbUS2yYQus57MepS6NsrGWPNRUsA7WTfhHupJ7G7rpui1p03G3PNG-FhrGBo1JNZWO2yLKbfHYkG-Mj5I586d2KH0ZOg5ugE2CeZTeXWpVHossfxxBhzLNvCWoHmCp_mPGg1DcSGrwTjUL-rG_JcK_41oKafsFItNVb_US5bGz1NCBwpVvN-bBNqJRqi06yyUKVvd0iOkXWO-10gqIR8rqkM2lSXhxKb03NenitmhTpI4tgBremfhuJtGrudHztTVlxf2dSRcYOIe8EdRevyJy0_ZnMvdkT4ggwRHc94H0t4OXiEcD-bn4fjP341YCzRwAL16o6fkuE8_PHUpYK692cL-bZZH6xu5sX8-MJ_N2taYwvAml_FGghd_xCcA74sNgDvRPL8RHQcUi169j3c61i--hcP8-ym-d32NYVRwVKOIMk9WWZXQ4KIFx7dpevFIzF_SDuMfVinsi-u4OZrjlc6SynVbvs12yTFgfZJZ-K5DGKxgXZHIbWCcmmafNZw12zr8lWmA_ov12zH1ptY5jIvh5MySqGiO7o9xWW8icssW1DzSHt3WzLrTNy8bZRMd2wBekQmbjfjXRV1oC9sbLThC3ZIYnoW8Ysk8n6528s5G-s0zq0ak1TCqt3Cv7vn3-pk9xwyT5TGXKbtDFvmzYkDRArFWYtGMVd0FOF_uGGitikbwbyJtYbjqYAoSZbng0fVMvIN3GJimNA510qaWk2Wpaw06mz1ycaUK9agz7oHBxZq-kDZiMgmtiwfgUAW-8-cBEf-EzQ16Wnzr5f3WL8xhf192SvKfRvRI3HeZZfnmWXZ_lcnn4efR79Bw"><img src="../examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=pVrNchs3Er7zKbqkQ6RaUktSkSIr5QMt0TYrDpmVqNWRBGdADiIQYACMKCaVqjxEnmEfLE-y1d3AzJCOY-_GB5c4HHxo9O_XDR7DALwyKy07Plgnd-DLRekWwsCiNCuh7Rb--O13CIWEyd1oOJ4OpqPJuDMY33YmPwzHo_G7e5AvYr3REk6ee2f9i9Oz1nHrGKaFhI22AZbOmuAJwQcnZQBr6NP95GH6HoTJ6dNKuFya9N14cjd93wbFn7wtQyGdaR1DIdfKbwrp5BlMC4FgEpYiC5DLTOWSN9oWVkvQYmfL0AZv6eFGCwM-iCA9qHBNUgJ4FST8kkSjnRqbxAe_0stzfHcOuRNbD8aGQpnVGYwCGLGWHpbqWUKunMyCssbjUebCZQXk0mdOLSR0Oj96a6DT8VLLLNDe82tCpu3ncHJ_2ob5QmRPczgZV6pn5eBX8qdSBOtmXuUSX2nDQmai9ElSu6QF8bXWcfMTaCVRcBeKrXA5wvnSOOVlghuekj3wsZchPX08PYP3qIwomDA5yrwvinCSrTr4fgj4qA3bQmUFKI8OkgW9g22xo3cKiwKH0hkPYit26CNr_KZ1DM6K_Jre0upZmRU4a9ck1cKGAhYyxwcegnjiDek86AIC90zu5KV7VpmEBT7447ffW8cgTXC7NhRC6zYsRCjaoEVpcnz4pEJWSEMKVx69JHuSOQhtzarhumcwMRJE_qy8dTvQygQUudQSnBQ5-lUb5o-zu8nk-9l4Mp0N__UwmE7uZm8HN6Pxu_m3oKV4liDSOWCrQpF8CRZlABU8SOERd6tMbrd0JBVgq7QGL3bgbRVhXpLeb-8Gb6ej8Tt4P3y4G91PRzf38HZyB4MxDO5_GN5M27gFCMjFTqtVEWAthS-dXEsTzmDgsuKDMCsohG8dg7HgSwNrm0uNC0GLoEKZS5LEWMhFkBRVBy7gxc5Ho6NRRTqAtvYJgXk5H3VbiCCfpQOxsGWAwm5hXWYFsHiZXVMkO1uuClChTikWEwHacJlcncJacdzn1jr4bjS-vT-DAep6id_Q2fUWpcO9ZV65CcWHk-hEppPLpSh1gCdlcg8U_ahcKfA8_BEWpdK5dLC1pc5BZKEUWu9gU1IiqnKKVjkespnYSLQUz8tS604h6az4snRgTeA0lcvsiVA2NnuSARiF_dUulyCgd9HtwnoNmXVO5dZdk5HosJwv2cUNpsb4BJcT6EItrc4jaOX--AwFVigEeqDdGrAbaSgABek8FMKAfaa_JKxFVigjPZ14QPpj3bIgfivlpkqS7CyogfutMquT0zk4yeFvSq1haR0IraMtYnp5nN0_jsbvZpM399O7h5vp8HYOmTBkzM1G74D1tSalWqM5tYStrWILN_QpDaV80TqGZOg5SzyHxQ62TgU8rLFkfxDoMroNmXAOXdmj4CBcdtYihzt6E8vjEfzSAigNam29bgEcw3zlVA4X3XmVm9HTd7ARLiisDexcykOv24VQqOypylvJmz3WSUwHhiDR4TtrGZz0VHFKL3NUwAKd8nFy993gbvIwvgXhYSu1vgYBS_USSkeImcxhvtSlL-YgVkIZH0AQLgpQi6UFer41IHhDEs1I7-Hkj9_-c9E9hcxalytDCSCJ7KS3Gv0iCkXAqIKON2KDfhPgdng3-vfwtrEetHpCW4MoQ2GdzDGA2FFIfb1udw7OliaXlP6w9BDyaDydcJFHl0EhnFC48_xx9vbhbjyaPtwNZ4-DDx9mN5MPH0b3o8l4zofCgMG6i0rGBJFLp55lTrANyShlAKZ-6QDPsMGUEVkECac8LMlVUZkpqr0EU64X0nnMGwRamqwQdcbxlqohOcNiF9AfEUlpyaTirAUQfacFsBEb6WBwzmbJxAYxfSa0hN51r4uvcO0rNy2AXK096tKi39KLhcypMGG5bLW-mOmQ4J1OpwO-kFrDP3BFmZEvdf6PfxwS25nfKCPn4ErjqxwIW5WHgnSTq-eKvsWUSbWbqAGpLNZIWSgqiN9WwFzq55DbuN6LtaSk0iCdCHYGb5BDYFZHypZX8Zlqh4eF1HZLyKIRO9bMOdcsdnD3MIbb0f10ML4ZVsSFnPErtKXzATZWmcAmjzuwrI-zHyY33w2ns7uH8TzVYBZ5I4xEgEw8q7CLxAMTOAvq5YpqdQvY7VX-mq2D_-RLkE5ZB1AHbL_bhV_gpNvunsJJr9_tNv-6uujih_RHpq2X8GsDeztbyLyH2HVyqLF7jH2ZQOmPr68Q6iOQ_mdAXiWQV58CIb_5a5C0MB7vz1ASwfsLlPN6Lf_N2jmQJvLKz-FcnjcE4g8HuhGh-IxuLq5qIPr7zwSKNfyvcK4aAl01D1aHOnPqzt_8R3jvGsF7QgnqlPk877GRFntFrwKnRC3lBpRpx7SILs_Ebh17QQKNRLOzFBkmAWb7Z3BfxzacUALb24tKT26JABpJdQQjiMiByl-7WWwxsNpzqPA_r36WgF79gu4AWiykhqMP_PI_4VYhLzrCeudTl5LTsz3wFEIInmIlgZ8fgr-JnKV3FGUg8MhkDmH7CfbVl8L2PwubAoRVwWGwB3v-TQ37Hb-cQCNshNiDRSqapG0EGMGi9C9EZiPse6F1jZlgCSJTLiuxEbH7-CmMKnz2c8LvX3W7L_1-QxsiFB_jEzfe84oYUojZiEHG7B9gfuCXD1RRBqVV2O3BUv8ZRb06EPXr7gHsEF8-OhSVIBphSzXrmoKGWCsSBq9CSXqC_ylssbmiUQ13KsqnUUysn80GW4XUcBHvrupPowPAOGOg_HU-Y2A8eK9bJyAu_viE8xlXNAIBLZchkm5lWpWEjWYKCVzsnZSnfhIbXJk9VY1L1Z4p35Q7TiEIszljyAT3PJGVCRc7jMiysFNHRi64w5GC-gViMhrF4RJPEpH0DapDxZ0YLASLo5cmZfBBuBCbmLiht1rlsFHSEehChq1MclWHi-ybe-zY4GfO-kihtPB-3whRd6k5RWtgMLYrS_QPLFGfhQ3wJs1enjBnc69KndR13UolU-xsCStMzZ9urbDPQ1imzti4pRkSeRXzsdi_UltEs5JGK4b2sQtmp_tHpdRrDST2IAJ8g3kmHhQTZMPNaj87wOgfYPS6CHKI4biN_8hXMa-gkzb7YmLahcAGg0cKK2upkVvZa-z3yDmw29E2e_J1rx9bFO73cS6aXlzaUvvY4ntFXU2cG9BJhPFbbEhwdtaOsz1Nwxqei0Rcv5ZBZSwdemKTVaNFhcZp2Fb6gLLieIo7NfYQUgDORdVzk80Stko-Tcltvcbizu5Njrbn2j-K9aLy65SEOdSbcUW4cQCj1qgEEWhJZp3BbGB8kCJvx6EN0YGSmuo4N0ktMH5zdcGPuM2-4hc4XpExxMRxwNx5cyc31uHADs4ZxBfWHToilqdoEPalyB9FwPLX8KWGKmsXqgY0mOEpSS1LR9OYxmQSmx1UJto-jnfwP783zSHImDvIdiq6rAcjFUFWpkp-honv44nP_gGTmeLGh2c83zskH-xGYLceZfHXzdLOOk_jLNwppTuVv7Z7HAUDI9GUmL6-Tukrhuzh8ibb-_qj5b3PLd8ILuAV1bi4uKiXv6L0wstrIrQH0CQAXAeZAcT9-439WYONSs9p_u9SdMIb88AcO9XryLoLsVBBLOK0ABO3b14cJNot_EZmoTHYp1SP1cCnBvdTk2_4qVQ4P58WkjO6NBhcIX1MUwmVS2pyeXKs8tcmmS3y3YqlH1qNatbB0kjBcSnm_7Q2Lr38zNJ-Zat67eeXyr2l1P-hZ35s5tTAH0O8haHTpxEeiHhVcwAeCXUNzl546IQ1OE_UD0L7K-SS-R70duaVeYLUDF1edve19edy-2i0dp0oEGYP2SeWTpFzWfG_iHy5L3TD6eMI8296fXT6aiBKVYGv7HD8uPBWl0E2B4DVjJTEaseLCyOJyuAy9nZn8TJxTk5d3SBhqXHVJItO9JXn0hmHOFw67XLp8cZPYZXPlQ_CZMxJBx8m43fcu8YVcBJnRXEchjl9b9KURjmn9UUZlWHrVeyYjqvC-lMpXJCug_N3YlxxCro_y_o2mvJnGS9jqm8zEYS2q1KeVWXKC6OCcLvaYIgrTMaDXfY95WIvtF-e01w6TcMItNoMOTNdFzFXVgYL_NvBzZCUaOzhnBpzklMhUI-wNUg_Cxz8tQArp1HkANFU7O_J1k3eG7V-Dmwk6GFcKQN1l0yz3Tw6PHv63hY-2GeZWrcv2qJ3sMUe3NKpfCX_Bzgiu5-Ey2xpgnRfDte_PJRuD4-oZ9yPQp1NH9k1kIVjn3vRfbmk0XW9epuRHB-tXtgQkPE0Vne7L98crPaF3RJ5OVjNrLy5-lW3-_KKScjHqqD1VeP_KQGw2pD8-yLYpajGPO0-J856WkBJObb193YpjvYWc9mtMmOvHo_QZs3FU3x1f_VC5mnC1Me9662RH71QR1ePgj619tUXra3zMtVv8fw3EzMnu_p3JsrD2nr8nYCzdslZl--ibOCfktRzB7pF5xRZiJRsU7k8xu7358OrS2F2sSumS3yNPR3_lEMFHhraMtBT5av7qgXe7fqCR3vY3mN8zL_y4BAexwGUYfSScnKdhza69FjY2rBWAXOgCHyRzD1KYuBr-xwznlpWqdfjyDJma5duo7zMLI5LsY9YNmqVx-z6xDNU8EFuzpKQoHxqr7mhpjF_DvM0rplzyOMmSZ6KfhuxxgNiL0g1LxU8u6Q6j5dasM-B5ngEkeS0rEa-4c9zvACL1zHUySPBZMghMsa3s8H3b0bvHiYP9_N9m8GqlDzHOObLvxBt1vwtwdo6SXfg8_RLG7xhfpI7_vWCMoF-okGfGtdi2zN4LAS3wCrw7RFf1yUv-2Hwbljd2eO-uBuqzwRs4EGZTJfJ-yggqmtCX0gZ4k0o8vZgocAGCQfbcQa9r0oMr6CClnSfDLBx9ke8qzy6Tz_Iqm6c6XsUx8wWOzjCn2_cCPMsfPwGKcxRv9u_7HSvOr1zfPpr69fWfwE"><img src="../examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
<b><a href="../examples/bungalow.arch">bungalow</a></b><br/>
<sub>The door vocabulary: sliding, pocket<br/>and bifold leaves — panels, not arcs.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrvcttGkv_Op-iSKmX7jmRIUbRk7TlVdETb2tNKLkk5J19OGgJNYlbDGezMQCCzlao8xD7DPlie5Kp7ZgBQkp29LD_YItDof9N_f-A-zKDAjVgZLRSshM1RQykepJJGn4CTG_BWlPizkTkTKIVWogMr9UrqFQjIpM0qJSxY4yudi2Fvv7cP8we0WzC-QAu4EetSIUid_nTfgnSwqKTysLRmDRYzL_RKoevDAjNROQRfCE9kNf0vevuwVMZYKJXQULlKKLUF6YZwU0gHRiPRauMTL9ZpdvHT54_zq3kfhM5BesCNdN6BN-AKU_f2gxRfIPjagDZ6QI9LJTWySWYNS2PXDjKzLo1DqKUvyOrKPmAOtVDqhA2GQPzbr_-E0qjtymh4uelvX_GVzkeQE0olM-nZifDbr_8gt2SeNEIlMgRhUfRBiQUqEJ6Z__6HbMhQe2tk3gdtYGEqnZOEhdmA0Nu6QMuHQJRCuxrtrt50kgpBeHiZbfrZ9hVYkcvKkdZgiVs4gj4rCGsUrrKYg3DBALWFUl797wFzFTaLDohMrh4r3Djx8-z8HOanH-Z9yK2oNTEU4G2FcP0_H749_fE9cWMv33ycw8f5j7MPlxdwdg0XlzdwNf_ww_nsqg-zi1O4-Ti7oRtE9-ny7OJmCDOwGIIhBjqYZQjaddKstw-ZsBzXS1NZIpDewQNaLzN05JEtvIX__HYAV__h_mb9y8mrbw_45IQGaa3wkhNIV-sFWnL-ysocMqF7-3TcFp1jcmeYs1OmxByWIhM5OtD4gDb5s_G10FtfSL06AYeeA9xUnnS5grdwNB2NevtgNAiYjmC9DhIpylFkBWizlqQR0QHmK6QARgcLkd3TxUNyDHmbAoRzIBNKOf6ztx8ekw7UVupVSB5SoEMoPbMBZcy9AyXvSfG1dF7c4xCuDXhKS1egUk2uJ4Ung8PBFLyVnPIgtfMo8mEsGjvOAeexdHBI-ojMGudYmdej0QhyU-s-1IXMit4-CUlRSNoHpZE50kHiBpTQOVUKTgByV8pcgJdj4tg_Go1Gr-DleEwMxuHLtPP3uEMUrk92nuBvzPQ9xVE6X7OMKlGNMUvWvg_0yAg2MD6g_80DWqFUDKqkeQyoqLMrEH0wVUBdGIWwlkrJNXqOG3JyjpbiLsRM5VO98qLEUJln4DAzOm_SQfjGcYVQS3CZUAiO4lRqJ3ME6anKIreDtgUISwGBVENTi3Dwbn7zeT6_SBX1JCRUaaT2jiMzOqHyaDsJpvOmBkut2WJ0vX1YYCHDvTV7huPS2HD-0SvBy_2gPEdovBG078OEgwWxHMK13HA9Eqq3D64099TKKg1CGc4DhL8aqV0IHgFr4Yy2W8httYalDAlCTs9zFd1JfuHbMtwrhfVQG-sLsCi4_vpaZjiEs9DNrPQeucZdXsy5gVBIkOUO1zJ1094-3Amb3XHuOnjpQ_GmDgeZMg4HQg-oxlJ3OqFaShfzUFKTLsS0EOoBOV2le9UHQxVJhEaB1OVIeKyD7CcynCKS8je7H4aLsbMKWFpEyAojMzwJPKOnNTeTGFIvHJxdXM1Oz3647lPJ89FHL1xXcHw2dh2pXWblAvPQoYRPzPoUYKbKCh43lOIoJI9REqdgfBHDhr1FwdoZHRT6ICkOKLCgmL3jtheFU_frOOGOY40zTqyxo3OsNkl1Y3Ophd3CzGbFudAraiRGP6CmfhCsENxfX7jQjolYOu4BdPI7Duk3aWCR4i4U8mDiljlXlETCwez0z7Pv5xc3NMZ0DbOC5y1fCE12UFdwhbE-NLSQwyHzljRmcD2kcPAweU0VqRTOt-fZOc3MWI2WG-FkMj3cOVRwZImp3aMToTrVnEmq8aSJQvEQR0eLjuynq5UmNhhHjJT40rNX6LxyuYZcijWS_tHiu9iMuDHGtlkWkstDW7IyQZlhStRSr0LdKo2TdEbIrI0OlggP_1Vm_ru7dM61UPfBLs7TxRZmV9_D-fziw83H1M-Ph5PJ5Bs61QlVmZVFGmLd3yphkRtePKRQNMhUkQ41VRBKKm71VNdTWfZ0_FQbF2Td7OLi8mZ2c3Z5MYxNazxknzgQlTepfdw1oanVNtxZmxxjQSqC46mUcPauJJUGIufOITmA-UPNvpkfs0JI3edrV3R61GJKtJBL56XOPM96aUQg99PNzlpg1sPE94aj1ayZnH3KzB2phlTbxEbydK4kxqIcRpzJILi2qfYhAhPfMLyTjann0innco3a8THDu5_g4-zidAhznXM7gsur0_lVUyXKKjYooFxs_FD50EPapYSOcEnd1VbadRrH-fz9DemwFlzQaa0ZfOcNhwkVfQSUlJ6JdSmk5XGsFjZvW2AqjWES9oU11arYOSN4eff59vTsL7dnF9dnp3MKVu7xifFaUK3EgShpzRALaua1KF8NYRZlXL5_fz2_gUKwqxcIC7lapcIhfZjpTkJpqVTjjDigupj6pB9p-8JRbAefihWdpt_R94XjIx_gxiMVsHeXP_LxcSuKm4Arldi2Q1-mUFgZHcthEjsQanYH-XR8HBqT85Luh0mlExLNStlvehglUtx_1sKupIawE4k2UmCBdKIuROzBEC7CqUFBB0Q1KG0KAu48bvwdp57lICESHek1Ig-beNIZUlrd4vYa50IO5k7LSg4mFzixjdpMaGZPyyVnEa-I3E5QLal8UWOhznB1eXYa9GEDu7thqhC1sa7ZLcuwdz4IqThgeAplvw1ocGonPBo7XVPMWN8kgEvoolI0r1AnSbylDzlQSBUIqURQ3R7weaRQvwxDYyrx_WYobSXEqv_CNelZa9DUomtTqRxWhjePMDqzg0qqLeQUplpswzFyvtyF_Xrvt1__ucc7Ly2rd_1O5qc5Mk4GfEIL6TDzgSdJr6m79ckftdjCAn2NqFt3cJ-NqZ04h1Boh5RQrjGeAcendDRtYsd0UfnCWLjX1GidWSP3iy7b5nxzg5ws7XxaCoXeh7KCVtLOzaiLACd5A8uMojE9-IWGbQwEe_sHy9fLQ9wLExFpWeAGHoSqkKfzsFRyOPE6wlvHklO2D6XJCuzHhs4DtdbG864MUt-7YY-xnL2PseN9irjTHvy9B1Bp8vF63YOw2k5HPYi7yfiEv4SCX5U9gCeNsNdjROSJIXR9HwaDwSDspiE7w1CUOu_g__Nhfp-Fuk9OJX5Ig1TcOjNlsvtaOkzhVIpV0794Pkkty1aauY0GvOaweQNi1ecyMRhPmst94C-DA9pII2WNRMlXBgfHROpMla4zY746mBw29_rAXwaHvIIGchIYR8U0MVFNrB_NTSFQjUPm3K6hbmcKLdFSXIpVF9gTXSSGOjdPiAr1yheOu5I2zDVGZ8sk5OAahXaw93ioCm7cG_Ygtoz8bYAfqPFYaWxYaTRhMTQdU5Dtbv7xQrv9hwvTR9_Hjx7oIAE7HNorvJz1AH7phF-qESecVsuKZiHeRvrdHZFyoLPGPRd-yVguOLR-yrh9JGN5nft7V7VWeYbpps217hbU3u889IjgsUEUznGtHvyxD_Ob0xzG81WoU3p3I0mpRTU6TtctoIAbWODWxOUhjonEtLMs8qwQNutYnF2YMxpUI2x-ZA6NOG4nqMi-W4Rnfc2uhpfjg4NpCyd1sKVfnjDS-FVGI3r28Cku9Qyj-muMjlo-O5jWUz71Vy07PGoM28HDnvJxv68PW_cIS3uG0b_gocSpm3o70UnjwB8Oym508lwh87dp6e6g5sfPpkkE8veuwgN7LenxhEgrh1T1Qs9K3FccF-lFwpfRyd34aKOOkzcJDjhUEBxoqOBHyUrSUrgrGjqiv4SFHnUFt1p0BV_7KpemY_BBa7BZLmWGu2LrVuyXUNdO-HU06Aq9QQFXxqyDWKbvWJtL_dha1xH7RYB3J1xbJXatNRY7Ut8cN1KdN1asdq118NjaZ7Dkx-HdUaMreq69FTqL0o8IzBmPjxrxNBlud4XjkxOePC1Wj8rY6HnhHwKY0Q2vjukxvNpELI31QrmT56CZOCEFEPP3EjE-RQaVlC0dFCdiMlDL3BcwPuRetUsPXfqD6Tc8Q3-Fvu7SH46Hr18fffMVerdDP40KfYV-R5-j39XH7dj75qk-rcMxBge3upUSPxOTP9aXaSps2DklcwJbZ4QJLUkdWknQxWXM1bQ4ChgPD2ENBId5tINcuiy9yEmNuR3i0irEgRpA4IBROC-2ARX4Ey3eJFrq1V2QzJJ45QkYsSeYOEy8jmAhcLxIE5QBDIog85S-AV0am-6ZU1rueHOh1p_TBkMj1u1aSA1RPJkcJkzCRSmLOgcQ3AMKl57OopY6NzXxqKWO0do-ezQdpcM-CIf9iB526MejVtbz9PUu_dHB9Kv0bpf-gOrXV-kf6X_8iH8bfA2w8m_13rDhPYF_4-VuzRp8t9OxIlQXp1UmbjsL0bbFDnaIWwuUIcBjWVktPb2e_TfG2k8d7MaBxWVCFIXOaLsPvzR4Ob_9dD77fn776fL8p4jEaAL0IsQWaAO-JJhvA3W94oE34B_0qmbgvAgYbikxQ0gvkYQGsXBGVR7hTvi7sO_RnhFADpHdM2MGr1u0gdS9SxAfzWgNUE756UDhisBPAmx3YKq0-Ekf8j3hiM2-zL8AYPTM-PZqQI4B9vmpmWZweCCUXNH-GSySJIxBmASqd2DN9A40qSzg-vzy0_w04hP0YoE4U7ovhY1vORoQzkYAnl3CE-lSWhfALNKTHiPBQ3hnfAEL1EwelmUngq1j3tv5VUyEKEXg5YySOVTaSwV3n2_f_3B1cXbzw9X8lnxx-_3l-fnZ9dnlBZc4S_YSlJ9-IcCsmU2CDfn1XMc9f2rKYSHCy2TICszuMR_CfzOiR69UCRpgvCbhTNvAmV8QLG_ZpFB2A8gTX823QEEDxy9vHdJvAwJtmtvp9NrMkfnb5W2O7h7Cuyy00A2mWE8crtb0TmjczUdw8mfkvzbTdqL-bOx98PseBcLqVj-VR0yXX5AX150oJ1RtkkML8-Z1K-e6QNq-oxBXP5VCr3oBPGOnPAZRO-hPp1MqLMzzzWi0eTMatWMq0Sa18SlHjwK6HCfHLcMvcESxR3Arc3xGx3Ca4d8wqr2ZjvrHh62O5IHN4bSx-13Hte4ZHfnIOxzfHE5Hff45w7_EkTE66RVGcKK05q-Y-WcAQb7NMPHtYgt76XVrvC48wt7B6OD1YHQ8GL_eY1zil97_AQ"><img src="../examples/hexagon-pavilion.svg" width="270" alt="Hexagonal pavilion of six wedge-shaped galleries" /></a><br/>
<b><a href="../examples/hexagon-pavilion.arch">hexagon-pavilion</a></b><br/>
<sub>Six polygon rooms round a circular rotunda:<br/><code>room … polygon</code> meets <code>room circle</code>.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVnrbhNJFv7vpzhKfkCE7Wk7F0KGIHnBkGjAQYlXyWg0wuXu0-4aylWequp0vAiJh9hn4MF4kt1zqrp9IQPMrn_ETrnrO_erd2EA1lRgcshNacGjtSJFyCpUSuqZgxlqtMJjBrk1c7gYDSE184XRqH0bFkqkmIHQGcyltcZi1m3ttnZh0EBJB75AcGKO9LiOhOQcXRucAenBFaZUGUwRKiu9Rw1Gp9iFSUNpAo9auzBhchOCLEwFA5sWr4WegRNLIiJ8mznxhXSQS7WiPRdKofPMuUKPgHeCPoHJW7v8yEJ4j1afMPOwEhFKLf3Dqg1ZG2ZiqnAPPsCXT5_hI8SX0St1tUGUviAtBG09TNrJHkgN0jvG_eHXxfUIUmNsJrXwpKmFsGKOHq10mMF0CZXMfMGgrJXA6HWvDS-Gb8dnbejtgXBQ9kB4ePjl0-c9ghUaRJZZdI5kgfPR1Xgwej6EL5_-DXiLdgkyA6mdzPDv8TvF1MzRwaTsdZ_K7NmEVWE6MnNg0XlhPSzQ_j1QqZ0XOkX2E7ISu46wCMZmaDtSZ7hAnaH2DEx2IZn7K5mDV8Ld1-ACLAoFFnOFqZdGn0BmjAVXkd-3oZB6ho4c6u8xTXxWhVEIufQdU7LXIdCHwExHzsUM2dHGhUUkf6VIE1N6hq5TRJKUlbG-IDYzqWeQKuNQLUN8vTm_vLy4PB-9greD88srGJ8N4Z-j8_FVFya1zJNauHXs2uQPHJhKg7FyJjUrWLR2myBmb6LwqQPckwvDy8El3AFmM2SPKfv0yOFBkpA3Igff6kIvOU6SNlSFTMlPF6V3FOxG840vnz7zA10YKIo84UlG4jCyLx1UhfAwF-_JDE0-aT6dsHOzeco-zBE9KJMK1bk7rcCb1T-1-0gLU-ELa8yc7QrvpU8L1GBL7WAq0vdgtDcc0a4QFgl6IaxfQiWUCsmFnIve9jcpJusUky6MC4TUaId_lqhTpG-18bLOh8LHvGNN9cCBrwy8vBwOQ4pxbPyp8QU_wqhAJIgLVjzrNGhoCRO-xFmxB7mxUPZau4HJA35L-JSgiI7UUctZpjDIRCh0NpH5JEY__7_Kgmw8ATEvVFJnVDQ0SxLYIhxtqgItAiqHwU3JLS9evrwajq9gcDmEweX5-OzNcHz-vA2jizGMf317PnrVhQlnM8dCUI6yViwZ8qb_083-TzcHrBJBltJSz1q74Mo5VS3pu01ZSIXWxsPM1DIImOTGTuAhCyccPNVijs8CFfJUysyUPWQu0bbJQqw5kNqjXRglKC_sbaYfJXW0UKmtUeq_2ZhMMqVAL4SeEVmWhvkPSZWiiZBzj5ZiYG5u0ZH-KKhMpVfKuhoPXr0aXsL5FZfa5xcXly_OR4PxcBUnIdU7cNLDUZJAXlpfoA0Vh8udt4g-Rh4Yza4mHbiCPHaOQrvGjYNiV0G7hFNIwle92tHj8dVw_I_B81-Cb3NYkCsIpRw4L5WC1Eidkt7NLdogOac21g17yhElBGcARVrAH6XmvAuZFVUs1IWxpCi8o0JnLFj0pdXkeaLyhiOiTgOpL4VSSyiEC-q7PvuVVfj29WBE-hufnV_xP92tJkc6JkldBiuZ9dIYmTMfc-tKeytvkSp3bCQoM1SFcRS3nEQsRtkVziRVVOFBwJ-lsGRpk4dqwN6wEbeCOQieTGnCWyGpnyL_Zf9PC-kx9aUViqiGOA0pOVSFKZJmC6Opr2F2pYfMmlsO3dYuKLE0pe_CSxKZ2Q3wubzFE1Dylu6vZ0GuqxrJj7TnG1DJmINm1EAtKfxauyHucSMzspgUsnDYPYB5wBAzznaNpaalVL4LI0GNgsmDNo3NujAy7CitXdDCWlMhpSuhodc9hnlwOE9ySsci7GQGuZZQgpIKd9jDwmkIOOY-WMaJZWy_qN5RAqjTQwy-4MM7bCBnYELKhwxdauUUodP5wxlNpXRhLNeovFEodTRNbHPjifB29IrcmGwLTt55RA2lNlPnbZlSG63EFFVwnaYvTgtM37dJvZyiK7F03dAcENv5Kvlo1l28azE3FuHt-Wg0fBFsNWF02Pny6fMON0F37eXepN301SH5t3bh-cWbtxej4Wgc-4C1XvOEcqPUuuY1ZksjtQcl31OZX4Ih-hwzq-xrrQzBQg5pTTkLvpNT49puFEQCbrQZNGP4tcqPGSyMk5waqHDlFrELr7AumWxCK2eFJ3HIiThkVwHSfEcqC7lh4gucI0xViQsraZ5goUaDN8MXEL8TLnQ1IrZv6VJo45cL8nSF3mPIsLXXtlnj5LKmho-TwQSmyqTvqebPKayF1N0Wjz4745i9Lk21Ax9aEBUwn7cAduEwCSHaS5KTJsRYEcHmvSShTJ6-b5RZt5hcNtMweUxyVbpiAt4waGh8yJ4WcpHSLBHSkBI64yJUCJV3GFejc-uu0G0BzKzM4DBpAWhOPOWiBZBJyn4lNUu3aIVSrRbAlo7pSKEP8wgAnMKTJEnWW-XdtfK4MSdmuPDFz2C0Wq5l0FvBDhZQYzWCU66Bm6gBJxSMExDbddPjInR7WxUzIodWhPj9jRrVNoS_R0n9-fdasusenMbHf0t-rw_7q8Nec7i_Ouw3hwerw30G3YXL0ODU7U0jvGPX5HYQcx9acJOHQhrUp8N0vWU9onNDbCb1P8TeTQ8ewXWvPiLmbvp01K-PiLWbfTraD4x1Op3OxqzLJ__Tq_Wd-bpFViQu2MBwCgdf-Q0bTSEuuL0QOmtTtqPT0MYHzS2U8Q3Y2eD16xdwCr3j-8BSa5yjSFAwRV9R1q6TFcG7NZ7GZ9dwCv1-kqwOhy-uidEKOuGB5puXlxejMZxCxt88_wU6gZEWP8Gds8xOXYFK0UHT-MAqHvuHCXyIq4SHVfyb7dFJthemQvi4AVe9ozmHNgN1_liDoyTyAR4Sy4zFH4i1va9QSB3v9LdQknjzYfUtCPd9CHgU9NJArQ4-Bl1xSZfZ6RQzHt99VMnay8l_YbDFXfSdWA7_gdlOfalH0XycrG6WDh1MMSMCm5SCEulSra1NSuwKkVRNSfhiZ-0SPIJeL0na_R5RDKQItvRSSb_coMfeV0sW1LlBr4K76MXQSHYmlNqphWCAVNq0DJPLBnrd8fmvVd6gB29dob_mO6GTqOAn6LePntSaY4oRNLaQwVC78JI7SN6mmDxfy7A0WMVRqmkyf44Nps1Qhztcmp2SWewwtIm4CkUOrkJchFoRjQa5MsZ2-aEAkJ0GfLb344QDJdSQJ4dxjA4hx8uewFUQZQPEorDMSK24Xj9hnwtYPV58rIERy5yfWysYWmNlp9k7dlujoYkq4aG_HzYnvgBKSmvMTDGLMk-MhqdE5BndeLow7tkEfNyJKOmp-jb9UjPEUKI2C-RSEgaWTIZdWoQNizNX9_JcQq7PX4zPeMKI3aJYNX7xOa7OxM0DBylqb5HG4e494pKTB7fpsKKiQ6-kZcU12liXXfiCAWsBZHZq-Lk1_TkCf9Kor5ckSUypYTdByUfqd0rehoA6OmQniK8VF2v2u_96v5HiSVJDrGh--zrbvMkEHR5_k70fpr6hw8dJne3C9cOt69GuF3XLRJUr9Ds8GAhuo0OJ5X47LHNqinVzwW093y3ELYKIqKtRL8wdoZsXDb80oa89E8e0-vvgHjKP1E9PoReL_LbE4YGQokLGjKruf63qj022iT3wdBl74JPYVi4khn3bHIUrm6U86YTSxoOw8-MQIeiXg-fDCPkw9tB7Mf-ENQbvtig2OPZWjRYYC2Kriw4y56XV0pcWOSUFf4j1i7bb_DnwTOs-b-Yd7u6YOE2pyLNAyM8URHc9cvm1onYflUrYDOiPNVPcohJGo_gKZBj8iLD7dQxtAdI4ixbiGwGyYwZEbxaB6S3EJ0ly9yS2SNtqEE5qgPh2D17D5RaHB4f34lVpcKXwJmaCfjdg0G7QKlUh1uVR_zCgkS4f_5W4JhcA4a_Uq03JX5iJ8Y5Jf8cr21yZXOzUDjreWKCAlRm6rQ3KCUwi3xPI0NLWaS2p8zhUz3wRNO6YOrwfawaZ1Z6aJ4NUeKHMrCTXl3cs4tTyjw317iM3xvO0dq_DOqnfA9TlPfxb63e98OFsTr18r1b0ERW2Rnf3InvaVEF8gw3LfQv5cf97yLmVNBzFtx9HPu59Dzk1Je2FoX7_yjm8WWy77BGHwMe1Gar-gafzf70Yb7DamNQ_lX3rNxtOZmUfUprZHdz0v3z6fNN_dN2sgsMXDH1zQF8ePLo-6Dab4APe8Sxjv0aZOldi9vPaLpn6ko3p-4FrOj0uAz_wU-VNr10P93tbN_rNjWRv7Ye-OLryaf3b19bN_e2b--Hm_l_SOtjm7iDcOCBaB5u0aPchvcJY1RbW_IGphx1avXbCPjnsfUK-5uXzu-kSdupfsOM51ZKdftI_6iTHnd7RDnvOx9Z_AA"><img src="../examples/terrace-row.svg" width="270" alt="A terrace of four mirrored houses" /></a><br/>
<b><a href="../examples/terrace-row.arch">terrace-row</a></b><br/>
<sub>One <code>component</code>, <code>place</code>d four times —<br/>mirrored in pairs, widths from a <code>let</code> array.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrbhs5sv7vpyg4WIy9I2lbkiXbmdkAHluYGCc32M7kLA4OLKq7pOaaampIdiRldhbnIfYJ90kOqsi-SbLsTDY_YskmvyrWvYp8ARfwz0EEK-j3YA6LfKJkDEpOjDBrEEbnWQICYmniXAkDBkUisxkYrefw7__7F7gU4fb1aHTXvnh31b67-OnN6BZwJeYLhZ2DFwcvoNuBy483v4yu4OfR-7eju5u_deAuxSaUtCAgMfn8JQgY86-IpsIxTLVhKlOltQFB_By8AAAYL4VSY9BTGAsTjwGTGdpyOWax0jY32OKvCyENjANj9i_i11wYmc87wsTpGGTmjE7yGG3HYxODxA4xdv3u9vLm-qfRFciMsbpDWNF_c4gxc0YomIh1C6wG6WiDE9kMMwdOg1AKpjo3tMIjE9OWj4Gf0azLxQstM-fl4FKDNtUq-cEfnPbH2mRowC5ElhhUlkgpFJ_Retijf3ZPYN4DFHF6DBNUOpsRA5n2AiaCsTBmTb-xcYpJrhCMXnpleGET-aWRzmEGIgCPrn9-fQfCxBaMcCmSdIWXg1tqsDiXfrPl39lULBAyxMS2IEElJ2iEQ7V-yX8WmVBrKwP2zMgEJpjKLIFxgjY2coLQbv_d6mz8nYVxsDsndTYGI6xDIy2SjEiMMEG3RMxAOgu_jG7uri9Hty0PbfUWe0qsQcAiFZkj80q1ScA6I-QsdSBio60_QikvgwttHP9uKdQDOO2xpQPhYLBius7kCAqzmUs7MGKsB8SFDer1ZGRmZYJemyJGQrBOZAmba4uIeWRacHVz8en63c-kC5lg5mQsFKBk0S_Fmr3OY3sothhiQpi4RYyJbA1ftJ579-t14O71yPtoB8YLsUADFz1QRD4WCxzD9zC2sVAI3Ze9KBrDVK6w4F9kmXasAIYGK78gvH8XvKQApgM6FAk5o4CpETHv4G-DCOYwyaUib-ezErnSAPXcMgcKZ5glYw88lUqxMObCzGTWgZ-0S8GJCelRGIRprtQaEjTyMyYtyLRLpTf4WGdTOcsNeoPzsKCkdcHodMZ2DwuWp1KQChen8PbibnRzffEGcosJHI1jncUGXS0A2RSV8tEkwanIFTltzA5qKvUthHGSTm-P-axEjkgtlIgxIdm63CBcXtyNfn5_8zfyJgepIC0ulMjArucTrVjLy7gFE2FlFmz6Qbo4xezeyuyhBbHOM4emBVMjkxm2wDr9GTvw0ZL_eXshBthTSXIQ6zla0LkDnC_c2ttH39vH6L8_vLm-vL7zsRouL968ab__eHdLWvdBSDvSJ3-WCjswTuQcjEhkbuFHEuR18goszuYUzX7MXgVVsr5paSLFHB0a-JGUfp28GoMTDwg_vb97DTPUc3Rsbwk4XDmYGj33gVwhQ7oU15CJOZ00OOLNWRRF5SE5GCObR0bGCwbdeoGJZ9WCyJ0eg1CUeNZg15lLkczZso5uSEse9ur69u763SVHPThKMMkXSsbCYQKTdSDzvT85R32XSgtIrt-mHSGWWkdGPEPH-MeVNNgiUslWUSVWrectSjDe7eY6QZjkzic5O2Z7YFJoQ-B1wrFg2CFCbkmDtmyK6GCpc5UEPnzsX0qXNqRhl2xT5LjTViHJNcTausKpCmipMOQ3XTgkifoLGt3W06lFx9LRlBFj16IdcUrLcSVip9awTNelYcaUQoxchEz-6f7q-u399bvb66vRGLQpfvP-l9HNm4sPY6oK6oTInixF3_fv_KGlgzkKSvfWm_UVkiOW8oHxF53h2LIcE4yVMBw32E5kNkVjyDnJ5hbasv-2qpxJoYXIH7woDFXGlFoERWfrA83tLxyyJ2uH7Spuk8DJ4VyK8w5c-Ki2BpEktJiZsv_zv2PQ2cGL7RRYmrbNJ047oWBmdL4gdkIpwrmqiKadA44ghzehsrqhP77xtdwh_HYAkGcktPn8AOAFjDn9DqIxx0_oRtHLjQjGkutFEVl4_FBxQ4EQ-lHE1i-KmMagIcyNpyq36RjETFBqqG3jvAOUTqDT6QwiiLU2icyEQzjq98ih29AdRMcduPAFgp4ycjeitWTRxC2uFgY5YQvnEyFxFyw-E4sQqHywnYj4gWo8XeRy1TkI1ccgOgDYTooHALWUeACQaeNSyBcHAKX7UHXHC-vJ7ABCzjlgrtvtdpuqjDx2nJO8EGQG47mgakYoKDNNqy76oOBmpmnzvwNfRYJM_urhcEVQnKZk_JCRXPpRBFsU4Dc4ilrRMRwNoiiqf2LBH9NfwycqnhF-94e4K4q9hcy8_OxLWKJ1sCQ7-0e9DoZ_AIrwl06N0-U9byhPWOOVLOw3OOqeFjz5T4GT3xsgjL0HpN8vQPynEqQ8yESsv7Pgyz0-Shn3QsWfeSdMyvKyKOKbxzE4vbfw9IHOvGQ9O2c7jpQKpe6zp4F6J3Wk8C0cbMRZ4zMahyuu_pdcGGY--LKptwdRaDKEC5mT491Rj0yg1R0yHsXHk7Mo-svwJIpAWkYX0G-ftAccsSmzkWcktZTkk59vErzhhJLUp8IOfBLqoYivtH50cXvnwwUzVDf0cRwvx2DyzHo7ar8Kvtd-5U2u_Qqszl1aZJhF7nzdXrZNgWkHvcGf4Ih3H7dgEP0JjgjB12Wn9DcGOi7qGlLJdxZuPr77gUTHuZzSmZzkDqnjCsAmDgU_3PzZpegEcGQRjtguk4qzvvhvWg2b2KOqPuBWzivYK4R_w3VI7_wsilrnQ9JSUXeRFmsrBpWJPbIi6j2B4U0tGMMejB7Z3_E-PoKB7l7BZ9mHUZfBxopg8lyBUJSxobgR0Ic5CGkVgs5KhyZn95WhkhkXj9wkwxypNPO9nCja8I2IxWD7fTNqdU8GURW1wrffdwHZJ4BOG0Cng9LBK6RYTPEeYW_cOTkpYqD_tJMlfMbZghLC-Xym2AdmnwF22gA73QFmnZg-FVobMTCAlRGxDqb0ZLJ-HthpA-x0B9gyXrLs94Kd18H8t52ZbBnPnwQ7GdTB_LdmRuP6QqywqELvbi54YFOUHFwzUhGVqfUPNMnLzWf8zhYuJTmsUUmDmSUWQn1BiCEcrchBohZ4qwQvLPCWBSwsXrYulhGXtJp_9PyyXtjba3gw885FU8sXtr7BSsrSPdQ7z_h3APCF-yo_wDz8wD8PwxH8iDH5q-FcCxxk3EZa5cEGx5sV50ZQYoIKDkdU2WQxwmuh1CHvpRGBBYopa0h9DVinUQw2i0aQSDVybC2cFVTqJfthfcdpj3YwwR2k4lSqxCDPZqoAwvMvPg4dcMUaKQhdhh3f2aozYHQlP1Oz18T3cSuIq_T9Dfx-XVyfKEVf0K4gq0JctVHe5iHEFEudlPVbRaS7fQgxrcHXiCQy2z4E1g_RCGmPHWIkvvoQHGeah2gY1g5JXcIb2nS4eYjHiSzj--WGpEJsYCJsvAOmUSPySc8x2yKyjLex5xX2-fOw3zaR69js4-yT1on4wcLhLf_c9snwd29iT5jv-wVmUADRjjMKM11fSDBx67QRM9zyyWnT6_d4_A1O0SC5fJ2Q98fT7g5CjaNOp3zS6XTnQafTph2ebtrhcFDjhHHgkzYPhuMC09XTqYw3zxdGgwxdpv9SkMNKjnUXgv_yuw4LxQWUDWwaKrjAdiMhMfZg2zA-8AYfykqjyJ1U0q03on9Vsz8_1u-M_i8aVza1Gxiu9agv5cwrnB-_UdsRphclC5RADfIs1mmYIMS5Y2SXGp3PUj-ppFmDLa--qFYtxyLFXYLP8UQ9j9OwOMyQfRvv-w3GthjrMBP0g7pwL1C0_1qbpVh3YETH4Eussrvzc8S15UGTXmAWOu7wkZSnud-g8kdnEJoPViR1PwBLmbiURgXR5rbQk_pt4QvdeUT7tzG1bIta7wlqoZX228KX51JbblGrb6PAsLmNesD77tBv45aSt3EkqG8rrcrQmtAjhgLD6NwhCZsURLDJ_VzIrBYpQplW4Xmz8AMbu_QzPKfB1yQ75V9m94pTEuZZxeejqivTEW_lRpr1MKiOOHxEDz4aF1sLqifs4Y8L1W-7D6nWby06jKCTx1kuDnpfNm-1lunp3dQSFTm-OHCN9GCvuHy3UWyv72bSZ4MdRuHjMvm9RfNZxt5PbbhKpchaxGN_FSjI7x9obk3WoqfelDxNy3e0CoWfclrf0bJp-IY21sbIJFwTcrWul1mDMOhitMmKXgs_dKhMs-AmcLElou5JZVJUbYFVdF1pKJo1gFjUBRrDhH60oSQPUTfxKrFUWMUJyGVCN9ivuUy3t8tldN5kyGvPWzvzUzSPbO0bh6pzxFsaUL64YpCiaSTRDCq730ahPZsg822Q06dA5g0Qn3C3OOlXSjonvAYI76kl1pkSX-jP7W_6Rw2rzBK9ZC0Na3VFYMQbTqml5npSYbnhGet73a31_b3rz79ufZ-LxefzE7V8v_Zc_LLBq9b39q8PLcIz-QleEg1qXjJ8cn2vvn4v_8Na3nq-fhuJbr9-o631-_X1teuHW-s3okhz_UnvyfWVQ9FsnSutWnvWAn7WMVn7n6Fm4xnDvkr1AqzMZgrb1ELgOtz7c_WXGLG0MKHRpn8IYH-gu9Dbu4vrm_uP795e3F2-Hl2N_auPea6cDCAM_GuO1j_VyJIwhp5KQ6MDNFytWEcVJN0buVq9wm7RG9ZakZMoWnG7kEjjL71Q4WfhfIRSclrb3o94-1nVEvR6UbSi_2rim0rXpovQb45HL6CYlYTnIKZ4WVMMe_nFDc16bYufSPHa6n3AhK91FQpTvuxYpJKRY6EUc1mU9Fz9lA0CSXCam0zypaJ_U-HjFkmARtrHoeEKjev2fIc3HT6GE_lmtldK8vxbcM5OvhWHz9WLzkqcp85FQGQj5ApRpzMILXAFTl41LYNBy6fX70HCn6F2bE51q2FFJjTi3Dw2SZzsIdE9q9DJy1vs3tVAw7etm13_Lir9LSo1KVVEwujzvPIkOuWqVyNzVwj8mWC9_teCNUXcBDurwPqhby-bdhn7u3Ktd0t6W5kJ2gcfAk5qgvZ6rVGiHEUTloLSFdqHw-dD9XrRk1Bfo68dFDZ47Q6fra9tsOFzwHgEUlOZnopiPNXzA5ZBFUyoSFid151BmzVMMIvTw0dhumec26JaVN6EQeFkNnscwpdjXw0R3qWVTz84m5ZDhPCAh-sExqRPq9MKc5T9mksj0R6SLsvuuMKvj6O6PnWdR_UIxWi79z7CW2hiAm_9R3m7RUP37IEz2uUz3KVwQulZXr3vs_wEljq7MSGNX5aP6BaGR0_-ynvh0rIdZF7KlyzFfIjeKTs0bZcb_xCBHvFVF-l-qFU8gCvYeCxRheldLQgMmwr9YHBxuHfzyfArNtcfLDZlHnq68FqwW4ieIxYLt-oYt7Xnx9TPgCMOH4fz7ybh-XCD3j44fn4JXwE3PNuEa-At4yeAegVQl7MoI4WG9A-h9KP_BMrJ47zwW9ZN3-ORRaH-s-gbNp83Kf_BAwzqKPM_CHIa_QdAzh7nZKcw_O10oYfoGzb3mpTr43qkl3dKxtL5q-SyZrZwZNEX4ml4CV68FT6GrSq-9nY4jG6L40fhr-Vz4fJClfhw0ikMyX1h9N8xdo-8d-Ql1E5l95M1HF6YOH0jfK4CSOi14WEv6g3b0Vm7O_Q5-feD_wc"><img src="../examples/library.svg" width="270" alt="Public library on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/library.arch">library</a></b><br/>
<sub>A public building on a real sheet:<br/>A2 at 1:200, axes, schedule and legend.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVprchu5Ef7PU3RRP1ZKSO7wTSlrV8mysquK4rhsOa5UKkWCM6AGKwwwC2BEcjeuyiFyhhwsJ0m6geEMH6KsTfiHHBL9daMb_QRP4BLOI1jBIIIMMu6MhlirWBfGcrC5FA7maxDOwj1zHKRQHP79j3-CSzm8ufm-_f7Tm9ubq_abTze3b2_efQ98xbJc8k7jpHECf1IcFix2oM09U8JyS3TLVEsOuWTqAhg4w5QVDlImJQgLbqlhXgiZCHWP65kDmzLDgYHRetGBu5Q3TuDTu_eXN2_BioQjlXWGc9cCphJgaq0Vh4ytwTr8Qij47z5QbJvq3Lbg85VtgRPxA3eQsTgVilsCBgRtnGxgc8ncQpvMA6PwWsk1LNkaWGy0tSRxyivtdOCjpm8Sw5ZC3eMCBlaoe4li96MIsgxyZpxwQqsWzJZTJJ61wBRKIQVSLwop0TIZLEXi0hYshUtBofpnOue4bmYhL1Scctxg4wS8qRjMFtrMQGqdXwAX96mDiWeKbCxtBNXT7flvl7hVJqzkHXinXYoScGk5_KiFos01TsgoKZOP3G6sb7hjQqLiRb7RjuXmUcQcaOdz7VKwTueQcJYAc96aSyalPx93qeEciCUyErY8PqVWbaqXMbMcFtpcEAnA7Get-AzohWtyJhL4FgoVPpQi-MMrLLy9vrq9_HD9tgWKP3IDQi24MTyBhdEZQdZfubZkmA7cOLKhBRW0corsPv75ewSdrx1vi4QrJ2ImyTq6cCDcWQvmhQtq234ZrTOwaLBCcrg3usit9y5vXQa2mDvtmIScG8B9-nM3S7iNjZhzaLd_tFrN9qF5ro2zXjn2r3-b-dOuoZnqJWRFnJYKWkitTdCv4U1_PA1nSQv3STJkHa9oMu1so-iFLkxp9UJhSECvxKM0lzp-8PS0KGUqaeeSxTyhTdsOXDMSQbhv7J7werGw3JU2L73AFhnoRfC5_567OV9ow0G4Fu4rTpm6x2WMfPobCwnPXbqHnWk8s2j3NbGHOZd6iSpHxaraefeb5jZmkjltLMBs8wD__se_IBEGivzviV6qmTcLl_wRf55tNGFTtnDAWZy26PAob9lDpyFO-aPRym5859P7b9--A2aMXnbgT2oTNdrWacPXFDBxIUY1ISXhI_Eesv9Zz60zRewgFiYuJMND_TuYfZ5-vLu8-TD99O6Pl3dXP1y_nfkjkBXSiZLVTwW3uH4PmpRGXrQQhlvAM9SBN-joiiQHrhKLdmOq0iWphytnBLel53OItSwyVZ4iUkG3Bxl4sQvDJNwb4XUzYytuZzAv5nPJLSiW8RZIPM_zdQh4eOC1Qj1bxxzPuHLkRkYv_dGkWMi5glhrkwiF0bDTIK0270IS-oFJ2YRfGhBOeJY1AE5gRoIMo9lFFbm94BhEXSrihyoEplxKGEQRnVMGC7FyhaF8h_7A7plQ1gEj4AWLOUhGOkOLdzqdYVQTEBh0o8jrIdaFTPxOVrnh1nYaAEGwBkDOcLeXPQ8Xs5w3ANACHLoXvQiXKG1cCkXeAEhEZoEVTgOTkhaGsET-2mgASO7gzeVf4BVliojMf1I3zpytq7TIVsKSMIHy-8u7ayQdBNITWJfevEmVDVJBu91uB6WVYFWp0X7RqwGUXEAkrzwgXzluhDbeRIpbi4aBjOHXTFKpY7jj8AucRq3oDE7Poyiqf0L58WnzKZbacvhSY-Xzd3Uwasww2xM0qmOD6R--1LYfYjNWHRfbifV0ya07O5xfTznD3w5tfzn1KNPDcvW8XGTYUjb_EHa5vT_TPYYStXrRkJTkIcLTDkTvGYhxVIcYH5Kifxyi369LEZ5IyxUG6m26PIYzHtV04h8O6oSQjmp3UjN2eDiMFC-nFp5H6nW9is7rT7tQ2ddBTbagJgeh2FdB9Xt1qPC0DWUdWyym9iuwRltYo2hjQQz_FJYBVlhIRi0flVrQG9AbLW7BYEJvIwKAsV9CcES7Lmk9ER2zFgzC73WPpDD4wvBzMCCdwO_36iZKXBxdWtMblhS-M-LWAU_u-YXvM3hVNcHb6_d3P4CwhLk0wjmutkshX4Do_CVFz6bKwyKAoN_fXr5r317_-frW13WUWIWDmCnMPQpFFIoaJFYW46fX0493H27eT99df7w7K2tP3NGD0PbBp0osgpABiknFr49oZeKRwjrKgqghvVQtYAvHDS1y1CggrwTrPGYcpndKgD5MkgaZq0LtPcsh8r1TyF_-9FANLpJXZoqa6oIVP3MYDaMIJJtzCc0_oMDQbUKB7apeLETMD1D2nqLsPUfZf4qy_xzl4CnKwS4lnWRUl--Omu-ZSJp7GqDfvNKiM49NrrLyWTuwQFq4KmcCgRM167XCcotnyGbNT_S-zzf8jpzrGchvDlmveqOaAB7meRF2uEg9n5O_b4V0YrLP4xYXNzdlLjHY3l4dehlPl0DQ9RhP0F1S4LgG_fkKPuuMq2YNehnvI2Z1xBDdn4b84wbwaUS2hTjZRawb-TKOubViLjl8vmrWICurlqVH8w2LH7CWS3WBxtjzK4z2UGcdksITrD_S-g9aZ81yMwc9INbKGS3ruKNjuFdhvUc-4B8h0v8vBedOpJ9pBd9h3nuNUn6Xa_t6Bo494NQFbm_urj9c3m4GDKE9uOeKG-awUy4UqtVPaYowLCNcNrdaFo7GIBkGX8dZcuGnH1ooap1DB0U7QRG-sRBjy8VpW_M11rq-ePfn-QRO1_CK6vSzMGWgjB2mUdRi-YY81dZ14JomSTRPYybxUrbw95C5qilSA1BOEDh2izqdSTghYWpF9uujteC3IOA3lMBbXo4Qr3FcVZOF7FXRi-SVpu-nxFOrsAyBB-dYT1RRf8fMBnNX6EKMRoX-CjMnND9JXiXTjAmfdAbDWnHnudNJpE34TsT6WaByGsoA2NjdlM9ItKFN9c4c9HvDCAIsKusQWW-f7Hz8PFl_n6w7QnbHyQb7ZL3eeJtsl47C8VR5ylCGo8WoP_R0_WifnSezu2Q9Sunb7CrDUHyuKLwWhxUjDBbbFkGKXYhsF6KLjc0xiGwXgu1BjCq5u90DEMwf2a0YG0JIrmlejQwsDs4HkIFPcjTA-angRZgXKi5wugeSs4Ufgy85zwmYOAmHdZ8UCZ9h1LHApA5z5xA6nGGP3Fgm4dQPDZwGqwuX0sTnjGIXFac5U1wScmIEVp3EgAo7LYUPanPuljzECRwk0w7AMJLRpYyciEGsjeKms6XDMpmEve9osxdV2jxHZeKWwGCk2kIpU8cTKINDKJIv3L4oUwypvqoITcpkWDk9jdT3nF4XrhaH7iX7Gb_9PzQWV4VxTKg2cZyz9SYJ-HLZX4ngiIklGKtDzwDMhgVk-poZCNTyR65oTLYZo-H4lnoJn1Bq2Ya2eTTT7GaDQcgGS6ESvfQ14LCWDHzjttHoaCeMhikUhs82tSD-dPo97gJjozeusEc1S_UP4YbeBMdo1La0fD-2Af-ys5f-gb1MKn7nVXP59HZOglt5JoFjSFGoVKbivX0NB_8jE5wbHWBCXXtdfePoSY1tL_W-8MLl3fHTrnNofW_wsvX9QU2e7nB7feWQj9z4O5xavR86ch_IyjvAo-OARu3qAOMFt_F005QOuiRPrVodRNEKpaRLBVx3iL7IQxk9GBylp4FueRcBSC3Fwk1Rbn9eMG_VyTHircq0WU5gw2CXRg98Z4buR_U4Sodn41LdQ0bBQwI9CoMjZX9031z-pQXjSqpJFK0mYRCzDTPch-l5gDpU7wms2h6ZEo6ZdTmT_3UDHl_ql3N8OlPfieR1eY31XZa9nkFeOF8954LH_BsLV9fv7j5cby5BE4GldMyr1OvnOkzK3_nrY7zOQkx_98ZiTtU2_FQw47hpu8IoSvanqCkGMXNM6vsC7zX97s42qAutXW6wUaB7dLw74pitE8rjSm9dONCECLvrRbsa0wm7SR905fNEVF8URgm67VjGsKWhcswZlETu6G1HH4WqirDnYLLnYbLyEG2A5sxisb6NRW1DiTWhVFEX5EXUk-HLqLfUscU6eyHxZPgk8TKmS7tdYrajwZKYfQ3nGnF_m7hytOovJAvh2ngx_qsd7W77Xxowp8q4LDI37W5ZkdRuUmgMOfOizsrb5dLvfF-9VfZu4v2Wx4beGKPKjO7o1Mb3Z34p3Z7bGuDKO2-rnIGOIIM5Uw9gc6YsdMftXh8ywqV-2lLZWXf1zpYhYl0onIQeOn_BEr4S9hO0yOeGcg6yo8CmN1hoQV_IZvSr2fgrX2ZtGfcSbh_A4qz3xwKH3rWShPp6ZNuCWHJm8Hs_zPZ9fp4bzeJ0W0mEF_LlkKaKXV_wVRM_qhnKgddGkqZvuDj-k8b6v6vYVJuqQCrT8reYVcNM_HQFr18B5fXy5G3O3dnz0XGO3PYmIf4KI5QtVaIeV1KTlM0nwerVpwcbEtYzYF_2FUlDtl6tiiKE_o7N33L7EAxN3dFRnMlX4YRWrRZLJA2enC7i9KL6H0p5rxDuRT9fhVZ4yfHfBNjSLIXFGGbCkGdLNqwBF15l_qQMotoEfNWvTSdTLh-Fui-3iSOaLSj8_4ALUD3CGm-wRlG0GpUhcp90R4pe7_wFUvSOStHDmetTUvSOSnH-El30j0txfkQX_WNS9Icv0cXgqBT90RFdDBqNw740Hk-qnsPHkGEIIURMx-0JvuPJpLoHJ9phFK1oAFWjbQA44SQP0SE3-kceO2jeYBSmSz1eJVLv9PSXoul8Dc1LE6e3TN2H7zEuNntRb9SOJu3uyHv1l8Z_AA"><img src="../examples/transit-hall.svg" width="270" alt="Station concourse on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/transit-hall.arch">transit-hall</a></b><br/>
<sub>A concourse: paid and unpaid sides,<br/>a generated run of gates and kiosks.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrctvIlf7Ppzgl1dRQWxANggQpanZcpbFkWxVb2qLpOKlUVmwCTaEtsBvpbohkdmdrHiLPsL9TeYQ8yjxJ6pxu3HTxjJPoh00Q3R_63L9zwEM4g_-bhLCDcQgbKMpVLhJgfyqZFuUGfv7pL2AzDq8-zn97cX785uL6_cVi_ntY5-zWZKKA_v1wEI2PBr3D3iFc3HO9t5mQt8Bzw0FI4Du2KXJuXoAwoHliRS4kZzqAFU9YaTiU0oocCIYelTN5W7JbDltmBnAme4fNcYShJatS5Ck-xe4LDjZjFu9cXS9OQVgDCZdW80LwhOP3DJJ9LmSqRcJysEzewV6VvUPYsvwOmFalTANgMqXNXgNrraTFU6zU1gxgkQkDRc5QIK4TYbiBlbIZJKW-57BWemMQoncIUrU0UJ1N8u0pqQiA6QT6u2B_BJqlojQwhz8k2_9Nku0f4Q8b9lnpP-Iqr3L4dPbuHVycv7kI8Ewbkr_Q_F6o0sA915bvwCpC_nV_FkVRkgPLlbxF7Qid5BzUuj7QAM75mpU5Hv2rkDlshFSaZLSllqiHZZJsl8AMpJpt5YDwtFKb6rnMQj_ZBUlbIe6PwavL-auP787m8Prd9fV8AJfWANOcoUo3nJlS8xRdLLH5_isO2i_E_L-jowAkv-e60avlxvA8Z1YoSV_capF-BS76EEs_s4TLZA8523NtoDTcRcdiq4Bcw4BVoDlLQa3X9BxUjZC3A-gPj2CRcedWKaxZwkliWMw_XqBaDYXkh9--geXZsncIidpsmExNAOe_ew3Ls_mrJXBphRXcLTWKnqCVLWXKvMS5UneG0C1P0QJM7uHPSm3QPP3oCJapQIcurVpCwqRUFpKMCYnugkcLEFdYSMWGSyOUNP4ppUxrITOM4T28-eHFoncIcTgMx5Aqbk6BSVjOl5BzlnINBdeQCmOFTCy5DukRlkUm8Ol5fqxKCyzRyjhU9JwyZ7p3SJ4UwDYTOXfZg7KLO6wBY9kevC2N1UzcZhbFZik3sM24pk17WHGMBWemS2NKnuKuswhVMzyNwjBwz1XyHpWrJMtJLIxEw6V1HrNGz68SSJOjMgoiI_7MA9gKm7kQVkbgJlzBdtw8OqWxukxsqVlOXghK5vtBj1LQwVumV6rUcObz4gH8Tw-glJi_NpseuB3DMOwBFAzVexZhXk1NwgreAzAJy7mTrAcglbYZlEUPoDY7sDynhRlPy5yTnk2vB3AIx8fHx2AynuenYDPNn1AtGhBTjHdj_Hj81B_iESb6vFGlzY45MxYSpSXXlO5LLdFFMY2jtJbrVsKaD6MwDEEzm3GNyVbCRlhMCj__9BcCtk0wPczsa5Y4-3DInEIHsMRcVZTW-xkVkso088s3bxeg1g5Xs3ueQ985eZ7jWbGe8BT6kzAMwyA6CcPwCI5fQn-MH4Mxfn0UQMYZOYaTd8uNPSIPTjJC9jVOSCNSErJd8YIqnp2mqTrB9cfFp7P5-QA-bFmBUWlVlXUpGjnhGrbhYLcKuEwLJaQ1cCvueeXYCbvntd6lsZylgx542dLvyd7Ad5ZroVDVIrmT3BgYhSF5H0A_DMIj98lpoHvl9EHfUAlsK6XK_M6cybbCc3fpKsmVQUF-bDkhHf1BbT8lb1uXeV75iUvvWwWGb0SVOlwufeSEmhiDRP3h85bHTB7jabHAox8UpS6U4aeYB3FB6gkAWl8La7lEV6VaslUEmrH8nhu0ijDezHDHeWEAM_EeeHrLvzWVAu6FEaucmJN1IaETPoAfkGowl60INfX1mcxcO8UDR6RQOn7pHA0_oK_h_y7gj1_SiqDjJUvM3Xz5YmmwIC3R_xikSmmUXlgqWwbYLaZXC4u3ZwtIBfE6JclZW3Fhmbzl0hIus67QKaW3bH8UVFUb1SUsbFWZU85lTTLRpRx0EoS3JwaIQ0ZHr9xXldoQmcAk6CQmL4f-yLlfRI5GsqpaXMyn1tERv9XpprN14uLWqEoVzAIXlHIoqbpza85ywiS0FVZCpvf0wERJyRNMKuiFBRb1dmxVtblg2grPParwiprwGlHADMfdMCK5_LeVF-HCZkV734MV7WB6VHmeydlf_muJVVvlRj4vGka5N00_GrYM9ePTSNGXoEazFkCVdr4EZ758sFHYRvJXNdIXtjpJnpfpF2XArR1pfv1TJ-7MbvfkkfBrtef6ZvtFnLa4_mocPoPEv4Q07iCNu0iN6xG5-Ge87RGZ6BDXuo4XmWh45PWVy0SCbbjlGpmdVuVt1q74SJxdqhaeJxI4Ub4tw9IpLEV2zSFd1EussT6XYX7YCsNhxQfwXt1XXOPq7P2FL_IuM5Y2U_pbA5_VyuXNRG0KkXPtybrmuUqYRVrV8G1MYht255_rmGfOVjynROWpj2_0sHUVEmnUDxfvrj-1BUW67EjpknbDzz_9PzC7PAW2UljXrGO-yzlmjIqxE3yf-rmmefKIZVFlZaaTbw1shGMbpK6cW8uRnmUsX2MdgEILiT2IQkmFxbRIEjVp8Ua3O0WXkR8nMyc8HFwnnEmYu60H7S1T2lJi5545cls_iPO1b-CsYzF1R4esHSiudhSI1WPmuOUNy3Ou9we4kHBzgVZuId_xvGiQ69D-EvJvcMtrpbmxBPwMsitcFXKdb2rkISplh-EPFfJrkVtNnYoDdsglTmTsvi6yWKJcPFZFnvin2vL0CYa-Vnmutg3LbsY6zNVCnmCtds2ZrmIjyZnYwDrHWnr9cfHh8vyiw3JPHSBbIzPyW1TpmQSmls3f_-Z8foURPZzMBnAGS9JNofL9rZJ122oxSLDfZDpZEtvyvaup-gLk2RXzZsg6kMfgZEVg8-3TBdNJ4BnbdBD__a8BGMmKgqcg5JbpilRg0wWbDTVgRF7gUppEixUtbOvJgXKG56TmDrjGIF5r5shUKbE37g8nJwMSuBpXECqGy8CRopr7EEiSi8K0wm8ttLEQwYakxmzgZ0bYiPuAO4RLCyxHEsnuuNvtjFP189xTazISw37ZbjmXfnZRbioKSbXBoEvunG-7DCdTIN9HDauCy0e8rRonCNN856Y9aLDWMehhreRJTY03GdmlNlxjIN8euXxoxaZ-mkuvXFoc0zTjC01zkCoeKKXjHKFOot6OKxQLBwfb-mSBrwcCSZRSeHutfH1AtX1WQvK0neMa63m_fZYPdat7dDJrXUzpIqp4YT-a0BcTdxdXBVO_NB7ihb8zHoVhcDJyF6NJGAazob-glNl0X_0IYYJhOHP38VDBcFhd0eqoczUO21fxsL1vMnyIO-089yRsHWl4MmuddjibtgSJwnFLRtJQRwXRcNzSUITAtfIqvXbag_5oOGxfRcN6nyfho2ELdzRunotXs9aZRvG0dd7RZNySZTRt5PS403FLD6PpSa2nmsDHnSuvX38Vzdr7yC4d3LDzXM_H3Jm8yd1xvTM4SbybOCGn4QMdePdyKiLnq7T3BAP9AjV_PCOAfjw7afHG6hOt9MXsVRU47RofxbO6xvtGH1NpK96IszZls01PXUHGzztSUPWkC2k1kwmH17j3wJdNJDv7FrDJVNHmEB60qfSPgT9kqjhoj48JWK3XIuHtFMHWrezQZdRdPcUztOdo6AwTn9C9kb93gpYZjce1xuMpfRM7_4wndDVxERKPae_UX41ivDrxuGTw0cxZPA7pHnm5wx2TpUcz53GdKU-nA-hYk635gZM_FTgTbTUHWDBonvwvNweESaOUquPGbt6AEXVXQMV5AEsl6zXMwn8WiX25pLGKaQYtqz3MP14RaM7lrc2obWCSuu5ESavFqrRUZQ1951fN_8Nm3LIA3xQ5HpIpnVbD-ij-hogI4VYTTz8FxGm6q1E168aTfEuDbm2rIcvF2YeFm2A4itAZFjlaVkpTj4fqaVA1HiKaF7QOg6CduYibVLP12s1DhLSu5Wgoppu0TONvqjmWzYh90FY_iXVjJf8KpA7oI6yPDjb9Pr3Ryt4gQWrbA4-1FanNaGD4aLl5sHzaLD8Jw15d2jf4QoNX4S3qGbx_8-ZGrAG9A4i_qWxAg1Ac2JWyeQWF5nAU0la2aFrIekbUne-TStB837kelQmysx9FH9P0dytkqraGoB3VQF_1UOhSwhqer4lNCg0Fk9gl0nu91gCuYmdCw2e2WblhI8u7eiZlNKnUR6xTWzQOQ-fzbgxMs0EQmFjdCRFie8N0MsTDuUXMwnhaKT5yXPDB6qizOg4frD6EK1UNut3bJ-TKViR3GGU-L7jhW_NSapkLaZegeaE08keWkOO5lvXTzfV_XVxdXr25ubpe3Jxfvr-4-nB5fXVxfuRfQzsOWnfZPMUoz5hMKZIMUXb3ItNnDMfGfYoKSL_Ibul_bycfoq4_poa7r9Zrwy3gVBFtYyyzjiU6-cmC9esLeiNWz5ex06mdqBkHeFd0sfrq7fX8HPrD2Ww6mJxgP4K01I8wnTOhHAeo54O6wcJASEXicpLaSjcc6H9CPd0sLn63uHl_-eH92eLV26Pv4CAahJsDPw4ezuLwOArjMCBw5_aZylP_kpwyKyW5qk-gjrdxVOqu8N4an93uLtDaNCxNxQYr3HA8G4yjYBSNR9PB6OTo-GU_nk1Hw0E4DUZhHE0GUXwElX7B8p31Z60x4ul4NojjYDQdTqLBMCIM_xnrId19FsO7MEbK0L_l8FbDwGlFSXdt_BVra3b3K9ZO2vOQp9f3oI4VkX6vboiqtOhP_GSk-znhw83ERnDz-Jc384ebHftqksyonWTG9bFb89mHCDSqcbqPGz75UO7WvPghAE1k6PyzXwcQtajIWlgaIf5bJpU_cJlk3ICuBoOtikUdOL7h_VPJUk0DxyTH99q-CCVMpwJfQhOBcbktir95gZWOCvWLquLWvekRJg6MJm4h5eYOK4mpelkyTPdFEBn6liN1gTXfgmWrHLvqO15YxxSqs_gpSjMb8im76oWNGyYQqmRa4w9qegBr_H0IvWZYoSacW4zHcRjM4hips5tjRWG4G8chnrQeCD6zO4rjf3n38GQcV83A1-x2J__l3Z3tZAffilCf7Nl6PcHbnTTtwqKx3QFiks06cFgjtYcbRwQX1XBxGO5inAZqRdVmFj4N4geLJBN1i6OoOdM0DHdTBKm3dvaSj7joGj3ciilqh__U8uBikgRd7Tmc6b8Jx50njv8pHKcTwqEhzOikwZm4MStAvbPJFw9_5OEGaB8W8zP6KcFTP_GAZ7LFmX_RnDF6PZ0yW26oQFfDrIRpjb_5kUry7yjq_HRcuAakpgoYe_SLE_dacYdyhc3HamznL6lvby6p3NDlvtlHH6Ooc2fUXTgOqxeOP_b-AQ"><img src="../examples/aquarium.svg" width="270" alt="Aquarium with a curved drum on an A2 sheet" /></a><br/>
<b><a href="../examples/aquarium.arch">aquarium</a></b><br/>
<sub>True arcs, a circular room, and exact<br/>πR² areas — never faceted at any zoom.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVltbxs3Ev6uXzGwgUPcWM7qXTaaAxw3lwZIk0PjIuinmtodaXnmkguSa8ktcrgfcb_wfslhhlxp15Jlq6k-CPsy88wLh8OZ2WO4hH_3kgRWME6gACf1QmFX4R0qKCqHVQH_-89_wecIHy5_fve2--aX9x9-eP_xHcyVWLhclmed484xfMmFB59LB7gSRakQpIO5sReAd2jvfS71AlA5BKlrEveKiARkS1RK6sUpLHO0yMKMyjrHcMTM4OTvGEjnVqReGg1mzmSZFUupF0dgK4WQi7JE7cAbUMbcgpWL3J_BpQcysQDpITPoOsegjWe7rDEFKDFD5SA1BYKpPBToLTrwQqkz-GyCWaUSGjJMlaB3Aj7_-Pbt9QXbDlCKEi1c9kAJnblUlAjQ1I-Ul85VmIHRIMCiUDAd9mAFo_MhFAW4HNEzlkuFQuhd9JME1r9lLtMcCnGLLjgUhNbGC_aFgLlcYRbc9OkjXP94eR30Y8CdvxeDsxHJbTjgFJLwbCmUAiU1ulPo8ZNC2IXU7oTNveyB8FFB6djM1Og71KSMUPDuzatrKC061FHBubEgoKxmSqYwq6TKyCe8hNKx2hedYwZqhOLcGF9aqX1wKskc8dsBrWVB7FLfwlL6PFhBUgjD5xaxcwyZLFA7kp_mQmoHQmeBQHqFMFMmvT2DH6wp-ekNO_6GDV-T8rKAqLzpzqV3Ucs5-caTBr2LUQKvoHdBir-KTnnFjxPwtCeIjUONQvs0gIoiLvBZh8Pq6Er6e_iJt9sR_NEBqDSxFUUHYGFlRn7p7AqzTiteOgDaWJ9DVXaA7HesOgilOh2AY-h2u12ySSl4Cc7bKvWVRX586K8DIU5k9joA4sqjlbwGMr3V6Byv1B_wIjlNTuBFL6Ff83JM_yf0Pl6lyjiEr0HXa_JUKTVegNEIYyggNdbKLC7zvFIKljLzeZ0M6sg6DUGxSTyMZ0rUIezmIP0ZvPcO_NLAXKS0oeu8o9U9GxYCeyGUQivRgUbMzppGk2q_aSiF9ZKjfGN3v7a7Pw4WRoPj7dctGLcfZtBvwcTb6KePvOLWLCGTdzJD6-DFWm0OOB2iDu2dTBE4H3GyRkDhPKDOTtaW7dGDtef1C1cPrdnDOurXrOHqANbJtGYNVwez9oYt58Xb6LzPptrnPNTeCp3SyaJU2LxfrsB5kd6uU0Qq5vgs_w2aixfvYuA_x5rhtMke7g5gn7SkT3ZKl9nrZfrbknLbPqRxC2l8oCLTFvt0_Kgiy_3bIggetnCG_R04xXNwRi2cUWuHcdbU623W_YZfB8JZJbPXCz5GQ3Lkk5sje8X_4USGo3ccivfQO2oy9plxvR2fYu63mAfMvN6QTzEPmszOG4vMv96VgZ_QVryzav7PRHoElUMHxCYW2AAy8zmlog1S3JVNtH4D7RPTu4gXuBtr4-uj4q9amwAWlicmHFYt5JBV01FXRqemsq42NpU2rVSoe_IHB-862fxVITSMOsbdxDpyYln1pzsWc9hcTFKO2Vt5KZg53YJ4W2fCH4VS0VTKjvfByIZOIwZtZavGsu7Ua9TUS1FVx5Gxpdd4C-GDmc3utz3fgFumy4A23rKSHcX_NdyXK_hiCtQRcZm2gIoG0PBJoJ92w1DB5xtAoy2gpn3_JOoIU3mppL9vYNHRw1DTbeOGW766EvM6SDNJpVAjNGNx5C54L8VK3ZrKH7SlGO8nQR1eHS4vQtDPRSoyPAGpvWER6wOV2pelzELZ7nKjMogkvAnpYM0M9Q8UqeeNwyKUfpwlHNc0pvIdWJd5G_rolkBPbgl2v1uXdhZFxmXhJo_43JpqkUMqHPVs0Tun3DeSOu7sgajeoFGcBFH0ZKdCT1GNR8-h6o22jNtBNTp_DtVk8Byq88Eed35ulJcXMUW7tldj98OHSO1grrkD8SmXVNT3mKVmzHVLUdeuHAkm1LPhQA6B1YqS6baTe6E5ekASD519JK3XjThbdyjrcvAlhJ3Ne5O8trZdUY5qaRhz0WSP-JhlniYZbdm52dULJX4njbvdbzxwllJnZtkI9HYAtAgG508QhPDeQ5CcspAHkdgiGI73EtT9VvIcquHoYUC3qUZbSWebaHS-m6hx-Nfd9kVsKu8hNaoqNMzEvYNDMuw_TGUjswOaCIStEGFP6w0yE_dU7dqsWxqpPXU2VmZdp2lKFlo-hR7eXP4Kr2E6YZNohiJpRJecnQ14EhGIVgm8BgnfhVKRH0ftyfpVAi8J55RhNoc1FUo7afvw3UH0TNubDA8D383wdb13qfvPEMtYmG16_VRYS75DaSkX8QqdPfBOP3qnIT1UAC_ZT3x9CsNe8pTOO7hGT3ONhg2u_nNl7eDaLavZ-TihpRf2nqaMFMDuz86LjuFGLGgS50N39r3M_n5DaZNOChRpDqXEFOHNr3D16ePn659_ubp-_-njRX1IOPRgKxrkKaMXPF5j1OW6Oc-w9DkPcl2c8zie74S3th6YSgcZWnmHGcytKeJ01VEVIuO4MYyMNLy4kRq-p6ROqsr0NsyFiPYkHFgCUuGFMgua7kYX8bTIgTZwQ4694TGyoNI_4M7hy5ULw1OLtW1hTKgNpMbYTGrhkSsOqpXm3U3fKqz0eYFepkEBbRi0Fp0KKr8yqEqYKyM8H1mW3MCD6HC8ss84pCurJfMtU2itTmjAo9spCVLgL9Pl85kocR7MNH1E0kw4qdt89ewsck7Okz_LOh00WJ_QtdjlleL5TBuvHMA0fUTSDtNa3hwkf45v0uDbZALuN-bSd-krybfUExtFUlNpj3bv6pxzhtx0gNPGmAEtTXmPSFfSroXtxUxho5iLB33ojyjX0V-NdE3ET-GECvgQnI3zLKZYcvr5xmJso1iG7hZC0RVK82m7h2966ue1eOJiBWPn3liMXMjYaQ0HhHfeX-ONkmRFQchJlOGfggi-SkZbELv4Nm3xcMhlbcPHkyRZTRp8jQI3VlIOQ577W8A5tOZlwE8aYYY6zTmp0ieHoBMVWLUcStCuFNZhFxUuhPahJcSi9OHtLZYeUoXCgpkzbl2K1QWbmJk7bKfeKJaKgfNG3bpZx-i1Re8Rn_UHNdsJtH22g20jbTjaK63_2Aqd75XWf0TapLdX2uARaZPRXmmDR6T1Qxg9Jm34mCdDa7Yj-nawbaRx5d8K2pa00V5PPiptRKEevlb-AaU1_8LUP_hYSB-Y9W-zezi6tGn-QdC38Iw26FE_6Y-7yaTbHx_B187Xzv8B"><img src="../examples/museum.svg" width="270" alt="City Museum" /></a><br/>
<b><a href="../examples/museum.arch">museum</a></b><br/>
<sub>The largest sheet in the corpus:<br/>A1 at 1:200, galleries, reception and cafe.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVbLbhs3FN3rKw5kFJZQSeBIfsguUsBojMCAahttgKIri5q50jCmyCnJsaQEAfIRBfoHXRfddJ_-Sb6kuORIVpq6SFFvPLTvPbyvcy4PcGv1ZmGN1HDWLj06D9lgOOqeQ2KurXVYldYTfCVz8pCOYGyAozxIs9DkB62D1gGm7IwqYaGz7m26-PDu1ykW6oHdIjikAa0rrXIVelDL9KU3_VxbTwWcMgso4wPJAnbOsDJM8SWmXr2m6QAvVxa-lFVC3IaAXBqOidaVI59iLJxcGZTk6DzGB7z_AwupNbkNPrz7mUOZ9LBysqr41lASyAQnTU4opdawBoGvUwX5Aa5CxJXoZKMhlu9_70J59orYAK1lHuBLS1rmlEztPMJyVr1YNBU8siH-_AXZEZaY2doUfPnMrgfbGLWdzTZAihHByYpeW1X04G1Em9VKR6dSek4iVqCAt3Uo-yvyAXOZy4IGeFkSXlllQhPiiquBUMqtCZZEISaR3LHivJXHkXj_Ww-rUuUlH1fswlbx_7YOWhk69A3sUgXHLaiagjjC3Lo0FZcP5Dah5HBJe2IL6wplpNuc7xB9L34W1jrOqMC0UEsPWQc7hSHFmLg3dgVjXesAudym0UyV8tvBk3rQqrQ0aL9oWj1p400LqA3XfrlsAQunCmRCtIBKVuRwMYKWpvC5rKgFviSUqKsWOKwlgYeKTJBBWdMCdsFBas1GKmjCG1TOvqI8oN0QKtGpnSbxbrZB-8Ll5USaRRtvWy2katI6kFPWIZQqvzc8viMhYsxAR_REF51sKMT-15kQfDjh7-woHXZfkUot4O32BlU885UyhEq6oDiJvbuyY4E3DdT4U9h9kFiXuzlP92cipWjHDVILTbeKZ1se7uTin_PcD2j8LznHWmk5I73re3vvtsSo3V1PRfhkcffhJ4zVhgzojIdsIYZsXnvyUT42nOZBpN5OTTyPXqwV4eL6xeTy-adsjfRWAbYi46FMSGTf0T-ipkSSMDBbGFSm_kQ6KB9VRq6V70utFoaKHkrrAxURbUs9rORmwJPMGKp4FgNnsN0wyoDj7AusVBFK7qyAXyVt3qXXSEheSmU8liR97QhSW7PAOtJ4E5My1kSBRlD5_V7gHFCjXTxTX0XgqVYmTOGosi54Lkjnh7ub28vrq-sXd9c3L--eX317ef391c315fMuahOUZiPlmZVkvLKGCsw2KKUpWAGVj7gcAxvFpXBznapRkYnK_EouZwg2_e7Y-dxTgOie4_RYYLlEo0C8CLaSzkkcJuicq0fonMWB4Vp1myqw4cn58X6H-U8snrxNTVLeWN2Ug6YQyFExSCqDzvhoOBqMR70sOxuLQXbU7X_dOTs-PRlkp70sE9nZYHzSxTZiBFoHtBmwvdddZQzFiicV4NaKXWuHQoDlmaBpHva7vFKmsKtH4mu1KMPfh2S4QxoJIdLs9_v9PuYq9G0d4uH__ETEjwQVjua1p2Z-8tI6Xjf8brm8u51cfHN5d3sz-bFhiVGG-hXvwMY24hmi4qMHRDc2hx6iJiniFwCvMZUW7MxbXQeKb5Ee7qkKyDVJ1wxDhJwceiyV91y-n2pZOGkCOmuwjPSTsGCDcTyxqDS7MlH60KfnwRaskcdD3408amaOHyNxRx42bfqpli6Q6xfK555nZl47owLTcEYmL6NKxauHUdMAfkUhGwuxjkNntjc94Tv-z768e0P0zcSxEL2TSIfkeyrE-lQIfI4vU2k4_nzfgvw9HvPNMvHoG2MeC7GV8O8opyouL_ZqPwXJwhZnvHM0fGR2gjxuqgBngwyEs48K8rb1Fw"><img src="../examples/gallery-l.svg" width="270" alt="Gallery L" /></a><br/>
<b><a href="../examples/gallery-l.arch">gallery-l</a></b><br/>
<sub>The polygon-room flagship, furnished<br/>and tried against `theme presentation`.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVptbxs3Ev6uXzGwPiTFSapebNlxmwJKqjbBJXZgB2ccisKidme1PHHJLcn1Wk0C3I-4X3i_5G6G3JXkl-TanD9EtrR8OJx55pkZKl2YwWgKt3ACBRRijbbvSpEg1LlxCLVQyoGwCD7n91R4r18Ij1YKBaVQ6D32wGiEEi04meKg0-104Z1JcgTpQBsPKSbGCi-NHsC5BgEWhYLUilrqFaPnwic5SE0AIHgbeH3JH7kSE5nJhNefdrogPTixcZAYnVj0CDla7MHSymRdG7umVfSG0ARYKeExBYUiA6nB58JDJhKRYg-8VGSANZVOO91wTPRgjSloeQoCMisKVOgcrJT4HVNwiUXUUNMeYadwymCz8CCUGsDMJvkboVedLtlPfuSNhWNXmZLOIhQkSlQOwWhY0PLFKfsOYOthcuPH5qQf-Ywf46mk0R-9VPhRE-YvLhEK4Xv9w6_wi9Ar-j3F1Q-_MuRMKXDyFkRZorCwRGXqHqBIctqcDo4KC9QeBCwrqVK0UJtKpSASXwmlNpCiF1KFc9Riww7qdFuMGDRl9ApQm2qVgzcU6BT-_c9_gYgh3pgKEqGJFQ7ZdWI_wvxELm6w02Xu1FZ6j7rxTBt0gMlwCMC2-9qEjUNgHe_I3PG2SnxlhQKXo1Ihqrwkl8kanadfOEwP_MjgGfYH8WSJCYeLXSAd1PSaCGslOn7SGpMxFMcpgIwnjZUonIeVWCrswSJEazQ4ghCrZ8PFKXODl_aFTvuiv5SeXFsqoXsPm1hLnzN4YirryIzKakzZ9ZWG2Zvzs58Dryk4UjtPATEZiMQa50B6xt0yCsatV2tyT_DoE3cnlXqcvZoILb0DU-uwgzPBOz7Hhw3mPKTwUGxpF-EcFku1obQmWuqVI-vpkYdczCxiaKJ-BB3tMeHqJZTCeknHcT1-22i1iXp2N6hs7go946WMzPl0F9lkmUwwpv9pVIMeHZj0yJvSgSMdYYYxveUq94Fw0ruHvVE2Kpmikku0wqPawPztu_d_BytIXcg-DSlmolI-2vfUFJQT6TcAo6Pdkzu0N2Tk7vHrXCY5eLEOMh6R4s7Rm50uvH81h8tX8_l7kt2rV7P38Hb21_klvH_1-hIu5rMfZy_ezJvTkMWcXpgYzqfgSOkgo6DQq7GDThcWpaCyMJuAEjp1iShxAX9p2X96NFywBGgwJZ1e3pDx0p4C3qDdAAtF4OUSE1OgA9HpQiZvMQVdFUu0ROZCKiUL9BYdnJ_xWd7N3s0v4OlkcARFAUosUbkeDOOfUqP7BrwsIqvYnk4XUtSmkFp4Y8NZGyEpjdSeC01UMyJGUWw9zUHklBjT-zXXMa4gE36SrOZUgikUxQBeCXUTlcQbGJ0SXrOZqLzpZ9I_Ic-4ms5I-uoKoRQV2RzRBzOCmG063egeGNHm9PYEiuK0zXwHzktWZ7MGuyXmvdLrcyzoKCujqZDDbFuKnChK2p4le1u7hYdccMouKfKuwpSrYPDptk4GxlE9rOyNvEHXC2IRnc_JHqQeUpKTXforzNhNu84JbcZC4Qp1umi1gtqYGNNor8KVXCqEzJoifMD-E8poDJLranYBMbU5bae7LXyVw5DVTZeTyVtfWYREeFwZomnzaKlEQqpAUpiilTfYUoj7hFDTQroYqmWZXBFS1IzmgzViSULlPJaw3EAudDqAWZo2VVYyH_AGtScxbGPUVjeqMrCypqZgWVMTg6JQDyj9ckwrxQWrcAtYIgc_JHZjd5BwJwqi0OaUl5-dD749m72dfzu7mM8gwAd9A288GRCDzcBNm9HQtPm0gQ0J7GAhbJJDii6xconQ7__DGb0Ai6Wx3kGlqRtpjf7l10WI_fnZHH6cv3n9Yn4xez-Hq9nF2euzn3uBLVJz5axsaRw2zcPV9eXL2Zv59fnf5hc_vTm_gttRm0fh8GJpqlCX3s4ufn591mvrVClWOID3LX9auWNkLMgH0gHeisSrzZ7kwdPD8RBuYfzsGIqiBzcS6xfmFsaj4ZDeHx2eHA0paUgQv4l9FbSEkA4SJcsS0-8Cx8mcTHqwHMLoJRkq8bJKV-h7MJpOGPskyA80jUlT9sRKUDcAo-Pp8RHcwvFkeBSea3NbWBRgdBIiWgi7kk09TWWB2kmjAygdNHzgpVcIS2WS9ZaMtYmrAy_jTCHWqMFUfgCvfexLMQUZIG9Gg_HxYEjlCzUsKkcL3ymh3xYLcF5YakQscsGLI8SyYSKpR8uWRevOVipMklTlJuq4txVJk5Nce2LvYpH8qlBQR7X1iIP8v93sktr_3yqJXm0Y2JWoyaeDyLL37CCx0sZ5mTxxYLHAdBOEMzHCOhJxEr2YGmLNYfax404xwzbKCgcwC01aKBLUxbMGNEnPwwf1TWhDu825vNzwa5N80kGOIkX7JPjHofaok0Be2Uwnf7hH3-3QB3Bp9oopUKB06loi7FSQWCi4faWYhdiAp9LUKH3gzCDKw41QMhUeF43JiUKhv7vzKfT7zluZ-K188OG5nFEfDQdXxq5dbsoD-NABqDRtXxQdgC6MhiHfj4anILhzD408-5uqnIDR6AhyobI-DxAandtW0quXTWkIFA_VgJEXmapcvmjTjhF_mr2cXzIPYyVcWZnuVFMWcW8Ab0tLE6i4szMlNYGHXinMn21xWopkTef2pgfGBv9rUUJZuTxWyFJigiB19HeoLCSDjOqqkrSTZwknfWP6oAPBztGwA3C_v-sAbLu7DqmY9TlUZQdINRzXb6qP_NxuGepAZEGHPvKbeNsAH2iKM2s8hYPuKBuL8eEBfGofoaXwgRJF0QPZNDvEjB7gM_T7_X6Y_E4hM5UNzVAv_L5HacfPPv7Tgeif9Hl9Hc6Et5SA7NsmICy2TTFuR9UP8HTYG34DT0fT4ZB_-7QH50z1h-FOhsMtYvhjH5SnzYdAidYtaOD3_WGUNmmt_cwuPCM-uMuu6TvjZeuLLd42UmGmCDMMpXH5haA8Gqou_BRGid0xkFR9P-aU5fvXOjEVwrBHiZNKLeyGIbmqhQumKHTe2O0tUnzz6uVgx0PldQTeDgpbH412fcRDJ3l9HL1Og174Y3LP8eW1KyUNqQ_C8ky4-_NhH6n56-jkPm6dXNcAXzaXp-8P-0jxj5MHzDVZdu3-vLnTx9xQJ9f6z5s73fXCloahee1_5U8HgjjJ9Lm9poIDQD3e0ya49OPk7whs0y15LcypuyWqog6kIob5zR5gvI4gwF3GMOAh4ZG3oAE856cPAAJgWLxvIHEZdvCCt7d445MdvEt6muACHi0Wq33AOuETbgGDn3cAxzuAVy8PoksYsE52wmFK1Nx9fW04urF9NyWkxlhwSqbIIjAeHEIR7qaMBuq6yQjuxlxNw5iA3ypqOvm6gcdQ6Zr-TYRyqSQ31gzCi1zbwYdbYR54tQHH3TU376IsFd9s0S0S6QbbJdPnaWBMA2o0NGVCeODQ1jL1OYwPqSWkc_DYs4dQYkoO3V87nbZrefoIxnAPEFi6BxFZRpNUI2Q0phy1GM_uQrTU2jlJoFYACbJFIIePg_CKPYzIJsaIEkUYoxbj5C5GoFAtdWpqrlVSX-tR8Eao38JTldr15P0F4zsLpl9aMLmzgJz82RV1jFCopMJzcjQROnlggYkLQoHfDwcp2v0dkjsLps_aBfT8NtMy6fs0__a_PtPm3JMmwgtlVtTq3-9Lm8uM5YZ6m3BVT1_xNBXY0VcxlXbbW2xG1qKgyYETKtxolj6HcDlosozHiUwkuO3LY-r26W5894ajuREK-Us5tJAavicN-2EBpUzWbgBnMYf5BodGHQxjXGgNPFJzTVcs4ZqScjirrJZ8Vpk-z66d1GtWZn7ZnwAaosTTHlHopd5m4h2oJeokH9FdvyYpugMVGBShmNkstqQWt8fb4vKCQA6-uM34f9pmOm62GR_9qW0mj22z55hnR195msPHtgnC-H_YxopkPQKglyj53F_0jqZt2RtPh8Pb6Rb0Ijx7sP266THwcJ8Xr_UIenJIJXqyDz2abLFnzdcqvOazljtBcroDfsx2H27ByRmj4R1vgBP1wRctT9ER7cMLO2VyMhz2jltwctLtbm_xI7r1wf63cDtl5Q68SXIhbWxorsMfvMshnWG03YbYSdHNRELhiYZ9FttWK9o_vATTY2PU-OUZtTGHTc4-isOKt8-M8WQ_fhTPx6kR_MtF8T58KI3h34bcVP4GS-O9KRpuTw4bbh8Gaj-QKcJJDeFf3rJOQOgkp8HOlH3-3oB24buMgEXBOzziGhKu_uhOBaC05h-YeDh4u_u_Cpqulh_hL0uulxs4aL4rj--Tph6Mh-Npf3jSH03p3U-dT53_AA"><img src="../examples/materials.svg" width="270" alt="Workshop (materials)" /></a><br/>
<b><a href="../examples/materials.arch">materials</a></b><br/>
<sub>Per-element `style` overrides — wall<br/>materials and hatch fills, furnished.</sub>
</td>
</tr>
</table>

**And one that is here for its furniture** — the drawn symbol catalogue in a single plan,
from the WC's seat ring to the wardrobe's hanging rail. Twenty-six kinds; not one of them
carries a `label`, and most carry no `size` either:

<div align="center">

<a href="https://playground.archlang.uk/#z=rVrbbhtHEn3nVxSkh9gAKQ9JURcjCaCN6bWxjhXQ8gbZF7I4U-T0qtnN7e4RxQ0C5CP2G_bD8iW7VT03SiKVG19CjqZP1-XU1TmGm5zg7efJx_c3nydjWGhc-lyt4Zef_wMIYWN7c8qctSv-U-jConBG-Zwy2KiQQ8gJNrnVBH67mlsNKQbUdlnQSee4cwzjO3JbsCEnB3SPq7UmyBxuPCAs1H0oHIF1fA8oA2v0XpnlCdzkyoM1BMpDTo5gwS_l8azpHJe3eX628qTvyL-GkCsXtj1SyzyAXcj78mPbC7kjamTL4FaZzHcBU2e9B9QaFuqOOsegTGatg8yuUBkPL-YY8i7cqpDmZF4VQWkVtl0ojdIFre6UWb7KlFFm2QW7WKiUXq2UT1-ewPvACmDn-JEhwaHYJORoAMHndhPxvBW5U1JamSVYw68EMMVqTo7R-K9vP1xfTzrHcDUZX3XB2BDPVOq9BhKzrxWlFO2nPHi7oo38QHCEWuy7sYXOYGm7gCZjlM4xaGVCvGvDV3vc8mHo9cDYEnOhLQbP2oIKHjaodRfmmN6y10JUIeoz15afsg3YsF0gPoiQakKHJhX3p1ZrlZGPnEKzDbnQYIYuzeEOtcowEPR6PjiVhhk4WlsXfOeYSZUGvYXrj2PYoIteMLiiLCruLSjxAltppXzAWzJCJ2fDa5h9P_3u6ubd9Ob6evrxajK5_n4GlgkmxEZ9C6rSp-RAFza5SiPzDd7B0qkMVoS-cOQBA5wmCaxWEHJni2V8rz-QZ51jsGsyotr7ALheEzqOpJxKN7uCIymgC5SVSjILEL4dX336PBm_gQ1uOVKU8YEwY5qzaRc4dypFPsUXRW9GvTUtAkOajJHatDNFtqQMkCF7PVjZu3hXdHGwHGZKE_sIKw1XZAQ1txt-U6MBH-zaw5z4MN2pjA_E4H9rC75KmaWHYJl0mVCGTeJt4VLakYcfr1XKOeG1nAfon8DHa_hw9Zfxh08ncBXDv0o1amks23ymcU56JilL3GYdGw_TnP-YkU-dmtOLlzO2isACMB1ykVh7kpNl4FmjtxDoPrCVA6chvpPfTO2KPCycXdX09icCNziBb68_3cB378ffjD_BN1eTyQ8s96f3_xgziZecSoJECXypsq_hl5__y_BfMsbXM2BO-t0QruVcWBvWTpkALxAWTmVLCeazJAHU1iwromqYb-FslEBGtH4p_s_IqbsS2NmAQQmzI2ylRgxdbyUfhyCpseQ5-5fTTgacBCV1MSxy8ouRqiQE5ZMTZnOLLospi8BJGhbJ0BFsHKMbOWeLwDlPmaUmyNFkvdSu1gVfHvPcSYU6s4uFpzCLyYjjOZKEUvrCwzfjjzeTMWg0mX9oDVeYUq1SH35SwTJaKQ9yMvL0r0J4bheQkgmOfEyr6CG1zpDztUjXQpCcYOGIenVgiUy-5uCHnrcL7AK6VZqjcl1I7WJBBAHnmroQ60X5qxGLVelCRv62KiVQHudQC11wxbILa4XGii-0LcySnFybUapRsvvMq3_TrIadU4qFp-gyY6N9QlUWqkDgLEdaw0wMOYsMmWW0DvksKj88gZt3Y5h8_iu8_wRXH-HzxzfjyYerH6pCx_mShADtsHa2YKXK-CrtVNmtktEaTlcOlScW0d6R07iuMnpVnCBVLi20MJlrkM16C6U1SBUnDyqcwKRY-lp11oUAVxU1yrahK5SMyaQwDPF_krMNa2PktN2hLS64JKZoGqNCrrKMDMcddyHRRqdso8l4XOWCq8kYrv8-nrwbX72pa2ydUqrSGsseZCiNlS2CVoZel-VYPg7NkiC3NgPPFZcNFDUK9o647MgPXDGHOWS68mClnLOueXuOXhnAUME-OlRJKBxJca4MhXicb9VkliGveysskxpnZrFbbfY5CyUOK4JQl8rUEc07J2037PAUDYdZWf9LklhPsEblfM2HmiUPaMEumxcBCqPVbbzQFS3v-cDssHMfMNUkRQiFpd06KLB2qM220l-h1k1jJnYojApfeChMRs6rjLg_xVA1Y7H9zdRiQU6SyJzChsi0bcz9rbTW7cq8ybexwkgZTdEIL1oZK5S3YBoK1HpbZuiTjhw4elu34m81hiP4sQMiqudWA2JjMko6AGtck4OrIXA_4VCFDoBPURP0X8sLxrqQQ7HuAGRq5QGLEGMQtZZ3c8q4M5Ga1-lANIvKvtpM41Gg-0BOWcfqqvTWkPfATc-P8CLpJi_hxcVpIl9-2jktFDp4ujoXv_STi-QRiLfFsyKUBw-gbOg5UaIcreM7528VH4c1uqAkPzXn-_H8KClVkS-js8cy8HjxKzCGLV2GT6iSo9ZTcwimuj5iPCWKYPjDGGctOc6ekIP7hMPqDM_qo_H7k67h9uMwzlkjQvze9pF0Lir7yk21uiPJT6H0ZvxwuQS27D1bAqSdhKMPMtnBK3gjtfoICi4xcd7bQa3ClVErH1eow9MkuWcfVah_iy8fQfUR1BJiB7YkQwMbXd3A9luwn-NgerSDwD5s1I1ergS7EIRBg_AOtW6kqgTLYwZoMOeU9RvMaPJa2bMkuT9NGsy_lBNv_6iNWc7BD2EHFWyLFAI7uNgDO3geNjJHYFscibDJQ1gM-WMLMASzSNYCKvsqmy6cNYE7ljp_YYAzNuVGZSGHyyQBLnMEhtDFcQ68FHwZJqNjdiAjMQWyDF4MgvOrIRlhBzLS5wHk6LyW8uJZSEbYgYy-byBl3D1vpHwekhEeQg4eQY5Of4OUjLALKT5_LOVvgGSXQzWr13QQyDLNY4D-WQ3JcSTVgLdHm_hiLIwYYDhs3jtNkn2vnfHw1oLbfS1WJ7714hBa_drpMDmAFismBhicHUKrXzs9He281gE4hl6vBw9yJD_7XR8BvCnbN-54TD1cvI59ZGt6qpvUOGTFWSJOEGUHiaFqFQW4bNTQSRctK4zd9Zv0n15Z0zTAremCG0aeWBzGzWLshk8Eutzw6fb2oFxPyIAVZ4xq8mK4an9UNoBNE5yrTFpYwRXFyjaxPYLwrbKClc0pW6v-cI4bcIqLKTnmuPMkuR9wOCnTJIkGINxNuWMsAdp7ioqZcTDgOrsPg0Wd6pYQQ66_Q5EiCiGlZpQkcQtBzOE9WNHN09LNAV5cJkn3vKVQX6r0XlmqcbuRRYTp10n_MknuL0a1JJd7lSrMtBquBah_OUq6_VGtFMfB_XnyPJIM7m0fcWh2W-bhonn2QKNjuCqn_BSdU-R5ndRaXzdbIWtgXbi19XF6aug0r4dXwdvZQlW7Mgy8CV2VW-C4L-LtcLks2t0SSWgsMG1IekvbuPKRvMnD93caU94XbWWtw9vxWyppbE21dy6n310qR23bVB4l3eEg2TV4fz-V40alRR3mfnc4bOp9n2NhP48dZgqDdU_FguTVMhQktTYQdS4sO7vXzSbNFaa1UWptqGJoCfbTybAdEYVs458P0REXkGiqQZtSTW_ZoJbPpl6Z28OoUpb24sTtA_wK6c6Hh3AkMU9lvfGHcDLl8w1vUdyzOJeHcMpF69N6xabvUWJ8CqdYr8lNqz3KQZyLQzgrlTq7wdLWh3AGB_0eN4ztMBtdJEmXo6KMEu5q7i8fYtQkL-eM313on-R447E9ylWRV0d_2Zq2HO-2NcIhiFGyF0JjYTK3jTHxAEKa6cpTw70QGwzkpjnxfw5BcAFrQdTWrecl-BOtm9lirkmG8aeyWs2cy34tVdmmNxiGO5_YZx3EOL8cjP4oRj8ZnI_2YGzQZc7O6bGTy1a_HQV7MO7QMIOfIEq5r6gFOd8Pkjny_sks8wBkOBjtgDzy9eDP9HV1-ZPaYZP9BpdtqQa7qpG_3YvB-O3M19Sb8yoqHgHGf8iYxsZMOqDTUdK9aHJO1QE9aKUeAc2tvfU56cUzkg37O7I0JmcL9P74Z7cE5nYjTeIT1m5SRlVsytGypZNs5A_n9PO6Njw6Xi74f-_xTfp8hbscJPuFD3ko5g-Px7mxuv10v-4qo_DM7Rejnds7AEEFTfAjrJ39J6Xh8R5cZq7pfAtHVy7NPyDv7uT_HzgaJIOzXnLRG5wdwU-dnzr_Aw">
<img src="../examples/furnished-flat.svg" alt="A furnished two-bedroom flat — twenty-nine drawn furniture symbols across five room domains" width="440" />
</a>

<b><a href="../examples/furnished-flat.arch">furnished-flat</a></b>

</div>

**Two more, drawn on a smaller sheet** — the same language, laid out to a fixed scale inside a
titled A3 border rather than sized to its own drawing:

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVvbchs5kn3nV2RQD7YiSG6REm1ZXu-G2lZ3K8ZjdUjyendeRLAqyUILLFQDKNGcjo6Yj5hv2A-bL9nNTNSNknzZWb6IF-BU3pA3pA7gDKYvJkfwGabTyQlswOtibXDsg3W4g9xWHmGbW4_grN14cLpYgyrAllhAaisXdsplk8HB4ABucmy_Au0h5LzZIJRWFwHsir8qjSpGoIqMP6208wFCTsDBQlVk6HygX9XSVmFwADoImApwcQMX1_Dh8gbO4Ory8s8T-GBlq_aQYWqUwwxUgOfzJElGR_MkORw_n07pw8skSQ5PBW1wwM9m2ujNstImizBbp8qSUJytimwkrAbL6_zdTihPlTG8PoCCBclmAVsd8sEBfa48-gVsbWUyKKsAsylsZsT-FlXI0YEuIuDKWOvApzlmlcEJfCIusUiN9egj52pwEPUCIXeIY4_rDRYBSuWCDtoWI1hsb1n0CyEP79HtokwJ0aHKfCN8-Mff_k4fCDc-eQSLDH3q9BKfH06CDcr4xYh3pNqllVH0HCY3G6-0MYzh9aY0O_CIHgobmSEGMVrEz-fw49nbiw8_wdXH9-cTOHtoID5XJQqVS4fqTr4tlL5H2KodSU0VfotkeYMDGG5zneb8S2aRFpPKdJHZLRhr7_59OIEbdYeNRG63kY-4yBbCVU3HMzKGT-fXN7BVxkzghiiht2wL6BuzbXaMwFtQ4CoT6U7tpmTD6zwmGgN9s9FZZrCGaUxNzCPlJwV-0nilUl2sJ3DBei9sOOUta2UMut0zHyXM9hv5YAq9ziJ-TXt9uth4laY99Q5UPjALHWpJcgR6fnZ9M4Ezl-bvFR90Ejzb4XIHpbNLItwWKA8JuU7vCvQe7GoFqNIcViptOBVslq_dFpBbojSaLtOn7sRAURgoLDsZsGlalRr9CETX2gN-VmkgBlSrBjpqRSZfemPpyK5UqjIEZfQdTuAKVcakq_SO9XHKRgmgXJpDbe6EvSkN-n9pkMfs9ya8bDz-1dsCxmOPBtMQmfKMRI_vmBk4LK0LHhZDUeTwFIYk7eGiPaC3-Pg60uNwQadqcCCiJJ2QfM7eXl1eX--bYCOaLenc2w2SWthxsosml4obPppyFv9y-eH8egKLv9I6o-9p1e_wj7_9N_xB5PHXpdP3KmDzvXDIP3l09zrt_LR2tiqjF2G1-aACknK9uLetLtaejjzvz5WHv5xfXcIa7QaD252Kk2q3gS7YDBx6a-6RzIbVbnagPOhoU-ycHWzRIWRoMCCdR7Uh4ViX6UIFshz-Rmd-BMtdwLHOsAg6VWZwAJlTWz5lf8bNEp3PdUlyfHf-9v3Z1fm7ERREGOhihY4O9crZDWzJqdGhJ05zoqHwFBT8_9qX6KyjkJ3YdHStsERjt5CqAlLl3I7MtVqyiwVmpfHShQW1sRVHysFBYwCiy5puMgKTQa7uSQBO32M2gUXfpPeNljTgF-CsMXXoUw6Vh6p8DYvxuKv8RQwWfMrluIMOno5wG-ajRxKvgvDL5fv_-unyA0tnRH5LAhU4TIOiwOVPQcFH0V595ttIYAuSH4pbqkIuIUz5MIFPTodALszXkJyGkMNkMRTIbpd-IVdHJgdLDFtEwiw1puhrfxStxDmdWdcmII2eBNFoH9jNyLoIHvQGPTlmkl-KRXBWk78xhqx9jx8KjcRuL8JJFqXu0al1nRCR-KrAVt_YUXTMRi2RQ1BpVIoZ-d-cKI4Pi3JyG9HJmfEWyERPYWFwFcZ2FQ-vWtp7jBEwbC04lFCuDGSa9KNtwcHbcmISnSFQBvN6cAALbzQ5lAVk1jrfPweWT4Gtc5lWAM8VGFQxHnl2BPAqSWCzYdfASdJ0Ll90TCnuiixu1e7wdXTxCIvSpncYhA5YSZ4hKiVLtsVkwKnN8G1Dxc_kxYfw-wCgKsiEN5sBwAEs1k5nME8Wp20G5elAwDRJJKjFEL9YmcrnC1jpz6FypJSCTwYomEwm84TD3WQAEBEHAKWiM312JGtTVeIAwKfKIExPpwktKawLOVTlACDTGw-qChaUMbww2iKb-QDA4BqLbMB033D6ZgN5JPKyLIDgEEMd2imNmcDCazrG5C84iaA08DUZWKE26GGl75HxOvq3RZv_PfAeAsf5njzt-afDkUTV5-eHI8DfKhWsuyU7ZuDn16PIZDx5ccXhCHxVOO2R18puXxUeQ_zi0yElYLhjbSh4d3X2483Fh58Y9efzj1cX1zcXb1n7inxCiWk4bdMVijGFJUTY2AwNUQFk7qGirKDI6HOmAquMuILfa5Y4jcpxo33JFi7k_yGCH4_HY_A5GkNskwnUvqM1eU6Ixl99DSDmltkbBgT8HNBpNuc6mTpKEvgdniej5BCeT19Q7dK-m9K5OaRf4zsuFWpKb7YWVpUx463OQt4178zCxrbJ7Na6u1M-WEvMdeRGmF7ykVuJCY4YltbpQuyu8absgerFS8x4_QTOlYRBVdcszO8SU0W1JLs2XYidaA-pLYIuKlt5SgfIim21ziWp0ZQulspRRIc0V8UaPShjueyadCS5vSUybouW3440Z7U0j0RwIkb58MdDEP9lkJMuyEkEaU5np7gJHs3qtMmVRzGOxPzXj2CjQ6xVlzbkFG8KdL7PFuN9iaC2yo3vuciFbsVbfzjqEjudJxKnp0lCoVmcq_hWCqmkvr3HAhasGkp6iEK75bSgVAWaPtVrZW638CjZ0zmTTbTUZPP7k0fUQTD4BIxwP511cOTDY0AUrXdfBGIaGmIes41MU27xJYxX9Tl99ZR93emQ5t_AUMvN41YacvgGlBdJx1Llwx4QZtMvA81bicr76HIe4My-QtC0PS3xQ4PUOljxN1JXYNapISj34SJk8W0OtlvhDN_LXwKSVAAkd9HZG3cbF1G_qDYBr_-KQMx-pm9iGhZRhsB5UcRmrINOvsWZmoRlMTm1VrrwITo9fhQ9-1nsK3CtLEma0WvqMZWLCEoukpG0i14ZM_J-VclxmIIcppb6UE3RI60rzpYlt93Y-5hqN6ANCfRjj1Qqj6NX7QooHp3IIrQSqwkWeR3ty-uc9g1FWoKRS4LTBY9niqRfH57H0d7xwggnuwaRp04xIiWGdO36wZnz9jZr103KXndH6nZILSh-bJOirzVFJvxcGp1qKkefc6681R5h8emW-pC3789-OH9_e_nx5vri3fnicF-OdZJbWrNb24J_hb4f_F5XXmM86QQ7njWujeL8SYgZsuRPGP3lPDkU8Xa7fVFnfEh7_YHhL_HN48eKPQuB16TQq3Owkla1P0jeANOo3ZhHPAScSVe3Ze8rgLOvAR4xYNc1CWDyBODRI4AHdX1Vl3pSRBW4bZPr05inV9mOck4ffzE7Ttpt2cmeYDqKsLHghgxLLhWkCSGtXPEgrVcYiTcRB8EHE7N9-5PHM61Q64ePMJ3szqmbdxi_pj2Rabta6RR7tlA3hIbX8c3jtsBBj05Z6IS32hwenPQ_yeohRE8bd-9rT0JgB_OoVSBjzjqYP6iQ097ae9PuPcAqaNMHlID5OODHoI0Ou4bISj7X0onhTOrl8T_5koKVS2jQxSIWMaH9KliIbnpBDrAt781uHFsHwifdjxi9REqnzY5x6R5FdaEWEJRbYxg1-ToZYtPFkTbZ1cV_nL-rrxC4960Nt7GMIdIYOfbwuEqrQm4p000NI9ZBkZJOLwmDlhZ6FajbZh3sbDWBy4J21-URo8amMza-mMqY5iKhNEoXnHCrYrdVu1NYkMSaJgwa84w8_5by87pw54xXZ2-yWyluxGtN2R9KDUUOQp4sBRtV0xjPTRScaP3yQR-Emp_UP0HXNGqVlGc56nUeYK1chkXduQKVhooUB9pzCGdYJU_MpDfCxak0qvwWsQTU7HI61wQQeyNtMUKlh8-tyfocSz_aQGzxkD9qKikV4AVlb1EGJ0kinDDjj6Cs-yhSuDDKvEGZJQ2KI_bbuond04hvEVTLRmF2MD2ac5doS7tiY4-Vx53lWLbcIZZeyihqI3jGTQ0q91oaWPGB1BPRdd7DhUusYvkYzabSkCJ_bFRxJ0p_Tn0TqogY9GSesOXX_pnkUpqKyqVf1WZ5OIoNskUrrPoeUOkN3xaGqBwq9_r6ECcdeWIxSiWlAsxaKZ48FGILIZ6x2YusgpfzBKC7u-s6ojdsIcQX7kEck-qegqAdPQgpdBgi1jwqwJTJEIhX-xCtn-_wwvVJa5SeCZknT6PQjn2I2QOIk-TLELN9iKMHEFNm5mmIIzHtt8pj1vSlJREoq6XRaX2bzjdUtE3clqQPnItT54oOPPkMwwV27SV09sbWiXlTuYjHqo_rvHZZsfjd372fefd3v2h3x2R7b3ss8Gn78WxeR996-7TdLs7kse0Ygy09Oe5_cnsbU-Pl2yl1zdHF6z4fRwi-J6bGa0-dvSnqkobpqZtt_Op4rdb_722OkhRmEmIm7t6X5WObe7kRS7K_-fjpzdjf_OKBFl-xkT-1uZdB8ebj7uYXX9zcy5Z488vZN272ddeBN89IXrET8A0C83WrQQqX2fdvPmrIPuq0M76-eRt9M8T8QLLDb1RVPIO3Jm6encz7m0_2BNba-2QyCTkWj7SavyezrMOsj_Mj3Fzn4RO-fYYMN7bwwXHiOOndaGvP1_aYPTY2QbDN4ARnphyYeYjgde_CW4YPKGjSrd7-esJ4LVectbs5qMucutHeb590ZCEegVmKJHJLuvcIuL78ePOztLKba9rm-iheTsgMAgPEXjYNKGBdeWHP50z2NFynUk1F3XeJs0dc4sPt23Zwad49UN3tvPLR3dipZ2X79-zOogdraX8YDB6441XlCs0XY_9kidMCebtSQO2ZttVUpDlltLYEvo2Tomx2nCSfX3WKVbtSwx5SUEuDPSRqACFVIoxAnHURbmj9cPAURnT0X8aQRpVsG7bpbe2qXVWAowS1V5FIJR8vBl7Dwq5Wni46o41mmoY6ZKqG5kIYlS-2n3l4e_7h5uq8uRQRY-Wbo86AnbWhdJpuDFO76Rh0qoIydl2xNbdMR2pvvS7ummqtUwDVIzwJCKUwPaKYzVJq87iOSgN1HeLr2_BOvoSX0oQEuu_AOz7-Et7K6WyN30MfNZ36eD1ACq6hWsoKjrStDY85aacndYx5-jJJPr_ku-EWZZv2KRKoydKGQFfvQsqLeSIQx48gLJXXBcBDOgQjktKhg6z5eJ4MHhU3o3Dof_xEUo34-QWTcMDZx2fOBOyKCqTNkq66ytJoNuWl2o3i3lgzN3GhHn6j2-uCcbb1tXLdk1DtcISsuvhAXdemKGsMvjkCDmmqFF19Q0wDSDqVCEb3WbkjW5eJl5Cfcop_KsMAKD2G4Sflc3RDeujJbE51Ip-5GHNo9GAivRpnaaAJXiULGv2UM7xRaa4LOrA_nL39E1eQUicSyb4qaYhSopYPyG6ClnTm9dr2B12KBrmDFsOggM20scdoznRGIzOK94wd_lZpntytBxkUtfQY9H46mZ1w_9uguq9HWqnNyGwkcRqIwIqOBmudSvFCbXQeTZTr_0-3P178583Hq_NbYvf25pJ75HK139GO9uB_q5TDsfZ5oyt2bXKBzB2d2E-KLSimtKhnfoveYBTfafR9mUgm5nzHr-bJ6OVR09h7JQZbO-9aw40C9_oTnWGcbpeNKeKbUBk24qRBLb01VYhzPh6cil0aJfzIEfJNFy3mNWS9vW5bHPASZ0434KzEhj1pmMRFDExd4NhwyCmfkXQnXtnT_A_PfnFLrm03bVAVoS-4DP1dLC8pI3jZCI1D3stOyEN_1w-8S2vvUuVjPsIN-7aZyl7iuNOcjYsbsU9P9pwYFmlbqlCxmLTdf8ptemi0eC-Gk5XyS9wgt757bpBbeT1Pxg3fTif8na04oPcty2XOLoXLY7nS7LB5LI3t1rZk9RfY3KNy9jVn_U1UPoA9-j_DNoeBL4L4kNaNioUu4F_JhP9tEfsVbNidmQ-HMtAsvehgeRRpAmeSzBjFEaYZXn0wUKd9h6cHd3fNwHs7ki3-Uvpu_i6eAumDB57HpGtlHt_kAXaeJKe2umJXHGy8Cm0fWtNI2qZqN9bLrcimnQuCX2Tx8JHBkGeeL7iLbAKfuIyT8R3NDb84EKszcXMkXlsFnhd1XMc0Y49LbCIC9czj3L3q8dZMfi1sFaihtQCvdvU_FbTiY75ZONxlkrVQkoPb-0-KJkuQS5tOJSBxilqr_y_XHZR3LTp9_eKZzJmysLJ2Zmpbm1qMFa3znPTF3owbVTzJrihnuDm_uri8euKfKNinx0lgTvnjfxrEvEus_LUkEPygIqWB3Lp3LYP4TpXN_3CI9cX731roMhnEIwDO0ggB9bzFj9OD2__aYEYpgpOKaCnYe3QUEEgdpIigg8F4-1Y6-ysN7j2YheRfOWe6Xe5gWA_Oxe_5ZneWzF6Mk5Px9MWQL7T-GPwP"><img src="../examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="../examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7VrdTiPLEb73U5TMxYJknLFZs7scccGy5ECyC0eLExRFEdOeKXv60O6e092DcY4i5SHyhHmSqKp7fmxYls1Z5SpcIPD0VFdXfVX1VbV34AQmwwk8wGgES_CFRdx33lhcg0drRYZQmMoh_Puf_wKjEXIrVlIvoEQLYeEA5tYsIVV4jyqFmTLZnRv2dno7cLIlRDrwBcKskionIX5dIvhCeDBarWEp7tCBQ01LNTjMvDR6AELnjXjpejtQmBUIKJXQ4MTagTNDOBNZETanbYQGY3OphV2HdTOTr1nQDDOzRAfSOzArDaVY4FFvB1JhswIysyylwhRWVnp04M1Ks-7Dj6Ohu18Mup-MH31yED4ROieJObrMyhnC_v7PzugUFtasHIh4GPfXv6VDOLtHu_YFmcNU3skcg43YjGz2tNLSu3QA6cLKPB2Q6FKUaOkjlwmF9Eculw5E5U3KL0kHzguPORidIZ9clKWSfCZA2rTx3wwzQe4xGns7rXekA-lcxSLY965A9MDeQuCNg5un52dwPT25-AwX13B1eQZX7_9wdjqFm88X0-nZJUzPP5-dwfTi09n1EC5yB8IiVFr-UiHcXEzPLy5BAJtkAM7w8Z1Yki6pzI-dT0kBoVTAZ1SblANtPAjIlHBFOLWvMZZjpoQVBKCAMF-gQ945HNMVYu6HMKVnTuqFQpiLjN9f0WcBjCSqKgnsc2WMdaBwIdQRfb6GQtwjaEP41x5yY2xvB8ycHkpL4KqhK7VPwXmpFFgUeRA7l9b5fRYLSmg2uXC0ICswD0EVEUEur53UoGp3b3iP1stMqBQyozVmnmBN_mUThjCeoTKrIZwWQi8weI4fvHIgCaWk4dpUsEAP6c0t-_H2T5efTqan52cfUrDCF2jJhhoEOKlQe7WGXLq4J-lKhwhYSHNpKUqjAzDvZAreK3otx8wE9xwFayi5KDzYSjsQyhD8vIO5Mb60UvtXFPYfry5_BPEgXbRrLi1UJe-G2iNtxo4Wnle9cqCEXaDdz0xIBh4BdT6Ec7QhymgjssEDYx3WDf4W1lQ6j96JunW2YedwmIrsLrocCoIoKZYpuZyRwt6shM2jNyyi_6EBd3s0YIQieFMGQ0ImrKVA5QPmZqXTQeeAJLdAMGVpnKxPxDCmvKecCfilNVrcA-WMiDqKEEFpgdA5c95WhJhM2qxS7IreTsgMq4IMhA8Zlp79gNrbNWC-wAGsCpkVIUzWXdc5b0oHo-FoAktwhbG-NgwZqbcDK6FUHXDeyrIOVc791lQeW7u2IVXD-U76rMAYUgTjsG1vBxTqhS9gXllGqjOVLygOlihcRTY7mCSwXJI2lNsIe6UP-eIgSWrz17YagFgIqZ0H0duBN0kCS6nlsloyNmIsW5xXDoNnubyspC8ofH46mZ7fTq-ubi9PPn--ukmH8Mncc6lrDcUlLGSAhwEHw0rmqDn--chH9GGoCEG3YBxyL2ixxBxQ4RI1hzq_G2Lv5vwvnIt_Ovk8vZheXF1ew4ery1dT-HT15zOyPIIrpUb2BIXKw_HBOEkGvMcK_b41Ztk8XB-_PkySWMtoRWaNc53Hb5IkITSxP57Kz7pFe6lEhk103ZzynpTVhC94V5LCqwuzQgv8mZOh1IiZuQ_xatjDJmQiztnOi-yuxb82hIjMlOv9UjiPR6SFaGiIb0xQx1jwC6f2WoXcCqnJOfHxCj3r4ygN1-El6pwmHczp1N5AFnKsdAHSvI6ih1_m0pMJpSiIdR6f1lZaxkq6MgH0d1LnDlBYHasJG3AjGUulKuctJTUS4FDdowte3sheN6dUlUrUDsx8DiLkqdHwDcUpoSeAt04MUoP07ClSXaGYB-Clpcnu0KdHXGK4OGrDtrZW5sbyoTS5K0b9m-EbWI4hU0bckQVi0naKtlQ49ynkVt5HI5dCowJtLMWu9iR5PDwkFSlsldB3XezuSg8aMXfwdpLEyh_o3NskgVJVpPHPYjnbiwYRNkcdTMvhJ4IiUi9SPuNGWmP3lpQRwxsi85VQinw9hBOgyMSQgxxxYeZKGlamUhQqIUwYSJKD2ouZwh_ArarA8ciAvBjcCrGMx-cswRm6hqFconbEX7KCAClqbkbh0bAILkCo8D5QHUqgQ7g05In9qCj7kLcijAeueQQpHe2a9N_dS3s7YNFXVjvQlVIwNzZyRAIizCoPaZCWhjR4c3t9c3H54-3V--vp5z-dTokpZEJTMsN71Mw118BulJ6M1po7OoE7CU2MR8D7v_x0cn0NJeGPTOBXhrQmbFAGXBnwVhAdlromyKzxPQoVoRrhoE0EC8PEGyiFveOE4TlD1QYOMExDoHIPEfwfsEsJb2Xq-kSZgN19BKmlDM6Mo6kuga0wATDO88avHCl8j9aRfm1qQ3rESYRKlK00402oO0rpwoV8js43iZL-QaubMAyq1ALpFXpKSOT9lBv2uBz1p3VP0odfewDcQcBy2QPYCW0ETJL0qJMPS2G9ZAhJB-OQ97eyvoMRFQtXtw_pXFWuSFnmXD74yiITWRcS9HA4nCRgLP2RJESuQxfZkjEyr3SBoWRCAz6UFp0DfBCZV-thDyCq2gPgjgdODqA01lshfQ9CDwKjI14QckdV9gCaXoh83mMFrypPJF5k6GAySRJueZMk-QFev0sSyBQKCzP0K0QdI9L6dTj3sNPISgczJbnksdyZIepBkHMd06ykzs2qroBN8xvLeSA3RG3qACa7NAmIAEiiu10Jk1pXiLJOl0pE4pxTClnKPFeceal7iDTSNx1MyOzRoyy7rmktOgnwSM6j1yLroLJVoimpzlJrpcklCj3cwDFMCCXxZyeAGzKmqUpqdHHlBziGUfImSeL_Uzhm1tW-iQ8erWRryOxOo6tfvf7p4vKMlseNdiJlF_kMhaV0ydAdRHt6Q2bYJ8vUWp5NAeAYmMc0AjaJDqebmqWQ4k9ymSjw_cnpH0kgM59GYIcXSV07t2W-bMceS7hHBSPo_8jlOXgpxCfE1_PjYEdordKaBeg0v8JuMkj2YPcm_v6wR5982KNC6xD-sSmNYxs60d1KI6v-CrtsZZYV_qIz7m2JWd0SXp4WMwpiksHN2bQRwn9vy2BjPC8jbL5702jBIthbMj-2t0xdACibt4qDk39HOk7ywI5RYoYK-udCqT60P5VDF7hP6Ga6fc_mLkpyMeZd2Nj8w7sQFh8YT3GXj7y2v7lLELAldZWFFUEqW2hD6vh1K_W0Jk39jtRVtiUxtkRRYjBZlEjB-XDwppX4x7D2dx-Yk_SDxFpAICrB2KE858f5bUAyS39NbUKyR3TRF-SuJPg1oJWZAVO6QIiYwEHw1pbMaFqjY9kRHsaUDoJgysQbEjqG3GEiF0jocJNG8tCgJZGMs27rTTu9cmHgAqWR2g-iyN2DeDBKA1xABmFrZ5TM2wxBvCYU7Y7czFiNlhnncgliJbhidU-7yqLCGweevG0OTH-1J-mek9knP7JHnJtn61I4V9MiGar-aDiGZUOE6q7RrbD0zb9RKhGhMMrjJMi9eLRiS2qIbwA1_19kIBuEaPu8bPlI9FrcfGhwM97ETWf3gD3qUtj7-bHZQDfLCQDfFhXySni_Lrv5sd4I4tHhBnwPN9TYetNtbDx6HQ7whVf53XlltWT2s8RcCvJNk0OEzgqeYZT7HB9MmUKIjjiVtBH6iV7ub0l0Zi7gKYkz471Z8uJWJOdA6oiiyGszF_1tJUMeqocclJeGUZiZzx16OJwkQdzrkFG33p8JRz2i5lc31dlnX3Y1OqQzTpJeB9q1eYn-WpnXFCWQY7g5u56CwwWPN3alzvEBDgY1Seb50G4yYEaxF4Vy3FJU7oXeJBwjDW1rLmlCQRPwSNOJR0XxfB1A_I1zB03TqCzRwKMt7r9Uwnq0-9Qc0e1AZ0ZFOAgDvWaW57aWZMILZRZVjJTWiNEIt07qu8YX3dCIKh7UTmHAs9Hjq9tA8TQjiT8vETgePS9wbmW-wG8R-O55gZmpiBy-XODkeXncVm8siPQT8xhghN93bYBN6YUYDnHWQbcLIcGMJslgfJgke-Hdd1Q-yeRhxtyDwEUChRtD__dcS55jcN-VwH0f_vYd6NtvYm_NLccL2NvHsLZfk58OW4OGV7SiZ5iPWnL1PGV7jzm_OIosaBb-35YofPFSuvY-TjH7UVl697GC41bc81ytVnC8pWBMS5emBRfX3uANF69hwpyX8c13PxujTm5zaMgdy7vIstBwkeCFFWURL6Bib167jM5XLYqYqunmbLv0kwMalkPHHG3RnC6vo9WPuIMvNgVwg_klAbWFNzQYk4CIVOHh9fhZDcaPSUMXRt9CGvQGtrfY8vh5utFFBmWgLt14-yzdmGEecM5JkHXfLMdMOTY4B6XEcSfMPpiKk-IWRRA2t2aGXxT8qM4zmeE2Owq-iSL63dIfeupSIk1hFgZCH-ybJ2HKxFONOCQk4k1fAYhwZRYaZ9k0JA6iZzRaZ_AfcehBpXPsTFdI7ABuTmGGPD6UzZ1bHCAESjML11nBN8NHrMcXvppFi9AmXzP1myfZU9MFNvyLhG0xsDGVvq9SMHisTMMzt4jhBg17BkDjp07VPdTkv8PP-CkFt3H5NHy2SERBHUqMlteTSTJ4N26KNik36ih3Sov7rRLfofQfQP8aM_OV6c3_a__3qv0vLP_OV_n6heX_mtb2N-Y1Zj6XGf4GAnDd3lo-wwGWPK9_GQf4RFc-sfA_RQPauhfP_uLay-ufKr7wm8pvPNyXCvCj0U5Y_7gEd135vyrBXcd8WwnO0d21GTTo_pVUdxjQ3mRQdHfbWW5mzF0mHD4h9UuJ-e3mMOF9lLBRfpn8dSutqO8Q4yU888VwJSDqm_jwXZB6GdXkODKPgvm2PHyF4L5uqpsKznbzYt2REq_NmxK9hLLy8Qp8q6UNCry44r4L7d7TBff5envwonr7fcttBN1X_EqiuFX_hoK7KflLOHz7X5fct5PHJReeKrrdGP-msktfeuoil4eeg-43pSKM-P6WvyRpjZnzzKdEux-KtZJ3GC7kwlwUlatRG2acAavU5tD6Vw5SDvK0HnTSXdIrx5NWLtB5W9ltHGNPzy-umwnrIsxNtYGUAiylbybGqz-6nsZ8WFeEOZh7tPR9EYJczTG89AojpSit-RkzD_1p90u503ANGXzEN-i3szX0T2xWfBR6ET-n74T0x8n4cD95uz867LP8f_T-Aw"><img src="../examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
<b><a href="../examples/townhouse.arch">townhouse</a></b><br/>
<sub>Three storeys in one file (ground floor<br/>shown) — <code>level</code> blocks, one stair<br/>shaft, one drawing per page.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=zVjNbhvJEb7zKQriwRJC0kPa8loKfJBXiiVEtoMVHQcIAk9xpsjpVbN70t1DijYWyEPkGfJgeZKgqnuGP7J3HeQSHYThTNfX9f_Xhwso7LLGIkBY26EP1tEGKtt4gn__459gDUHpcK3MAmpyEA8MYO7sEnJNK9I5zLQt7v2o1-_14Y5CUGbhAU0JoSKoNZrhQtsZaiYIuQetVgTvP0zvbi6v5IzgRBKsa72BYIFW5DZyv533-nxseS4_Z43SJfOjPCjvGyrBGvniK6IAGOKPAjWN4AqLKuI_8TCz5YbJ0IB1pTLoNr2-cCifBsKBKj2gI2iM-ntD8PFmen3zDjCCiFK8Fa5zH1C5HGak7RroQfngmZWZDRXMtbXO9_rMDh_2uCQobLw2kB8kBWEAX6EjvpdZW_ObkgqNjnySCufhHPKSfOHUjGA4_Nlbk_f64Ki2LnhQARpTkoN8RS6oAvWosMZQEZQ1Pk9yhYi_EX7myvkQuQRDVHowlq1qQq8PJb-1c1As0NqwObQyAQpNaKKdp9dXcH118-Z6egeXP118hHfvWU9vBnDx7hKm1xdTuLmTU396f_NuOoKLqGfWPlTWqc_WBNRQNGGQFNrrQ16RWlSh1enSrkgYm20C-wGQChW5ziPZGDk94LLW5J9uHXjkV4ucr2o13-vDXGliHazRw4zm1hF_9QSFxsaTjwakcgQfq2SzEkOzhLloR_lHFuj1YTj0pKkIEPn2uWg6R1dUEld853C4UrQGfLAmH8FNtIJTIZABZSBUjgiCIucHYNA5y6KdR5cXnT3xrV5g8kOWiWAxOqK0T3y04zDYoTwMhLSpOWDz1m3_lXiEZ1mWsfPYFTmnShL3mVuXnDFmANTWUPQbhNwrrfOneUVY5uzhCGtlSruGmW1M6SMl-2qtqGBl2zksNH5WZjFqefcj0rRC9sgcLn788cPbD7cX06u7aCO51SezOxQrhwoNLBsdVK03yizYT5Jadr3Xs5di1I14BB9YOOYsnnjiW9H5q7GSIibwIJoYwVvrQ5KH47UiR2If4qMVu5lEKt6Lw8BZlj2djLMMSppjo4P_vbwOaxvVUNpEjdHD5AtyUCWnLdAwD4G0ho1tAGe2CaOeRMfR9CAJH8GXHnAqCh6Wyx7AwqkSTrMewI5LQPvXP_AEseuur7Q8SliFzgdAhR5AjewxF89Aoyl9gTX1AIx1oYKm7gGUaukBm2ABte71ADQF-Aiv4GW25aEPtgnkYK3KUMHxGrWGgkwgp5Uhf5LILuEV_PAVspLqUKUzU3gFkz3p6CGQU9aBwIZKFfeGvE_nry9ub5mkpekn30LloGKCpyIZG8E1JmaHeaN1vJQdOxajeYjCceCM4ejNji9Fe0C8X5WvfMVm7NjqOIIpfIHjbJCdwPHH9P_yhN9cnkChrSf4ZQ-I-fu0hhpdUBwjO1DsbF_gmKUTJHm4PDkAuFehqMh8B8azF1lkKD780hMcZ-2yZYQDJDLv1WcShT6IsTTOSMPRNWp9BJI1-fgevVYriZkAx0zXgZy-zLIHvrEFuZWDCSZS7QElgbZIkd0dsOdbsD_GwwktkUbBpJip8pUUNzZytBnngPFZliVHHbN4XgJUmWC3crXk5ackmTWQjIUBxi87hLN9gB2JthCtTHsYp8--hbEnRx8uILBxUu61fEJyHbqSzDmnM7DzeXRriX5OXE3N5XvyPMsGoIznYA-V8gmyqyCcRkYwrai9tEvx5GOCiGnNg0lFuM2KvkuJo-iQkU6Vr9Y7KuuUfpptdc7K49oirHN1ET4foexorYMZP9tqbTzJsqijeeOMCo0j8HaOXF5bdzRFxfFpa5jrxlesCpJamFw8y7KHl6edP93ZOR4dQLYR5pW5B1ygMlw42CLb2LPzOeMyR3x7a8AD3oJd0W8gTH4VobANZ9Tfwjh7jBGzIWcueeDgGmfZYHzaxdZZlj1MOE5L5WLelwzRuh-5veorRXpbcc-3LZwy294erq8uLq9-2uk5ts2NYEsVi02I8m2tskZv4BgfQUobv7aNLmFGcPXp9urPV7ef3t785WTU5e0JHP1hy-bRbvPzf5vCZxiqXwfIBs_Psg4gPh9gUPk_l4C2SH6lCvCVXQKPx1LOLZQrGi393R4YC5WQIr9bMGmjEthrDFVCYop9CCrH31FQXlMpFOMWJ_4-hJp8X0Vp0SYHaClxvrNbl5H83tTSOp5_ZTQs0DlF22mERz30O1HT2-ndnvh2HgIsCjbcwmFdgSMsI01nHs8vi4rKOI7bJkiqXimUcWo3w0dORnD8Oo4-7Zy4azYZjZa2JK2pjIG4nQ-pBEyISyxp2NQwQ11Ys4ni74-IJwd1Tyz4nYWTzz4mn-yTP5-cfpt8ckiOsbtL8cW3j7vbXx6Qs_M9qkAt_1-tYqdfKVktx9-uV21J5wvF0RI5J-5KLSrJhrVTKyw252kEa8ey5B9SMX1Q0sHGYQSCTcgSXDzwoOGevbK8Y5B5LU11iUTWJ9Q2v-KetibDo9tjqZIitx3U80kn1Yu2mItCDgrWjBccBmIkd7V46CQpf7UiM8rDZKfpvLTNTNPRN4EnLfDMhmCX30DNDlDvlFk8Rl0XXWllmUeRz7a4j1u057EvPmQJvZLRPqa-Xab2BBaIF5xUTw8hfGXX5L6BwQPKLgQX7LPExX9Z3ku77rrL6U5q0dbee_kao0K8jStMTGhcxgE5ATQ-OCxj1nPEmwleI3HWSKj8unNYmXE9bjx4yxuhfGVVKfsMHo4NHJfoOZ05KgKyXeB3cZtWKlxYg9qfJNi00Hr_-m7604cfp3d7eYy9nifrNGmvUd8DFs76uHvScbW5VqESrvg7znSbMCvUFnxT1468j8vFOEFTuaABzKjgfVF7AWucwylujBwqLUuPmzRkv3s_TbCF5chK7XnS8xPZNOJ5nMpNs5yx0WOW55zQbnbk1N4SD0NvZ8LlGtBoisunwz1h1GBcFYolfDMLDgte00b5OZjj2oN7qgSsCVdxgdEuLtqNbmBlQak8LhxR3PE8ulTLNrRdTCZMsbf_69_yrfJjYQ4wR609KDOAdaWKKkrJPCEYCjBXi9j3LslLtYvJifHY2xfSmG46f5_suTsH7K6Xs2R-0KY8ngl2G864QlK-2xrnku66fWJayVnTOoz0guW2HXBp5Jle39xBjYvo_8ZCzk1anhaOEitSWEdthzKXwKrQLCCOQdKXBRU0pZ61dvZnXjc-3hPFksdR9Gm2gaMLV1S3aBbpPQaCo0k2eTHMfhhOXhwJ9i-9_wA"><img src="../examples/two-storey.svg" width="270" alt="Two-storey house" /></a><br/>
<b><a href="../examples/two-storey.arch">two-storey</a></b><br/>
<sub>A void over the ground-floor gallery,<br/>and eaves on the storey above.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrbciO5kX3nV2RI4WjJJjmla3erPePQtOgZxbYlh1oTin1SgVVJFkZVABdAiaIdE-GP2G_YD_OX2JkJ1EU99q53rCeKVUggbydPJrgPl_B2fgwvcDLPoIFGF87OKtsgWAPWINT4jDX89S__DaFCuLq9vZv9x_XN1efZ5c3V7OOnxeXd5c3HBeCLajY1zif7k324hKDNDirbegTteeWy1XWpzRq2FToEfEa3g0bXtW4wOH5NuXWLJdhndFPwFnRIi51eV2GyD5taGQgWfGW3_CBUDhFqZdatWiOsrGtohQqgHIJa2jbAr1c6_BqcChU6embAV2qDF3xUgNJaB0vlDAD89S__A3aDBrL5OQAoqFGtRF6lzNqTUWjb319-XIBd8eetqmvQxgdUJX2nDegwkKxXti5Z8laXoYKj8yyDsLUk-xnjafkdbYIlkdqB3Ro-iDZrEaUbKGpUDgAO1OHsm4PlIQAfsdQNGq-tgU1b10hiQOTwLtc3N4s7OeRKFehZ64dqB0qU5kMqU4KxARRU2qzJBwZ_B_ekHQZw1jbkiaP52Rk0pAbO4TK9Siaa7IPfarMm_2oDK9vW4riHjx_6J-QMHcBvETfy2Jp6R2d72qodn7tCiRqST8eb7IsL4hpjA-0K5N9aojInBT7TFgeHOTgMrTMeTEv6WhfjzFgzi8d90qak6JrsQ_7w-Pnh-ua7x9tvP9_f_fDxfnGVQ6EMWQKf0YDabOodGVMH3ovMtFHuqYsD8X2AQjUIK2ebOYn1tS5jzObg0ZSe3gl2q1zZLXvjYaUcoCnhgL7zJKLGVfiKF0JhzTOaoC3ZIOfD59B69FNwFGmqtmY9lEYhE5x6RudVDaV2WNDqwylsK11UwGmXkrFW5omcZttQzVB52s8ZdCmoa_1MdmbPDzNnqYonTlB5y64C1Kos0Uni5yl5ctrp6u6SzDu7vfn0n3O4ib5rUPnWYclqkGUu2IKUX-iBEpvs0qk32Rcr034bZbAmyaVTW5OilqViTUFzzYixdToENKLxEgtFMDQMd15O6lctL9Cm1D5os261r9SyFl-OsoE8vlEbQibalk9jtQnJYCSSo99P9juEEqhjS1EQry16-s5EZCNjid0405QrnV0KEjJchpk24LBA76cxPdkhHIoBjubv4YWMTUkpEslyrSnFPZN9OIXmGFY16ZzX2oQc8GWDRfB0bJEm-hSqrvn4gZXd2vbvmLUkq600h1G0LRlNN5wVW0u5EDQ99SxEQS5ol7OZLwYoNwVUFIOqFnMxCEaAm072Gf8SRHS4uhvCaoci77IMmkbAUsFa1TXuBEQZot51EBUty5bibyk06N-8Q1MCjI11wc_h0oB1pTbK7fiFPAWqhyWGLaJJkEp1iFzvYWdb2Dob8APkUR5hsBdl0ZQSIpoqaYRkbSjLvqgf4q64Y4MmgGuNFyXJ3V0gRX0JynsBMXBWzprQhafsRC9O9tOrxrpQga8wgqeXQ5m2WaIbVuoQqw2XrCmU6PQzllMwyLm_22BJUHevnhDOxSF2BVvrnoLdJC9qOczR8Vn3QoJ6z1CXoIkds4tGWDldrrGvSyMVY80sCIpsqChEGXIUxW0RfX57s4Crxafrbxd3l_cLeLi8u7m--W7KW4ozYNO6jfUdB3h4_OPl_feP97e3jzeXd3e3D_By1HEeOnSqqA-xHM4hV66ooERfOL1EmM1-9NZ08ZQogCRjXmhXtLXiRFrWtnjCMoetDhUo-MPi8vMPd4sryClqfXhQu2vzhyYne51mGai1ojSI1gF4K-ZutNFN28wZO2JO9AinuVYKTGlTVB-ERkkhv4AjEvICx7KOxVYxAxVDF-McPHyMeb1UXpuRt6gCD8iBATXikVzEWW5hPaVXRDjDW2w2qJwwleej-cnJPJsKLvIh2xrBB7vZYAlrSwu8riklrImYxYKpaDBMkaKOM448tsSV5VxRpL72whnFLVi-YhBJpa3yFLzxyFzpZAW9espGYgD0QVE1H1VEpHdMW1KhUFu1u4DGPoslNxoLhGBZKitREKQO01xLyVNyTFLbR5H4rEtakELtWdW6VAG5tFJ2mg8sd_wUZjMfnC5CH4psBWtwPuE99u6Jm39PDtqDP08oRnXwFAYA-5CvnS7hLMul4hxl2UXkUB3Yd0ziiIhspYsnZutUKl5C65BUKbCEfFW3vspZbApi7ijYhuxMqgczFmHQeziYz-dn2SEUVqA44DQGIG3FJ5PK5I3asNy_EzOmJNc397cdms4nAFGNCUTMazcTXjCbzWYRAH_TcWT2E9fEH602pKy0EEUA5cEH1xas2Gz8xwLfHnMqnWRU0BIxsm2I2Os_wPk7STbCSW08s2dKBzmF-AaK2nosWaJtQ60NSgfkIzHz0Ojgoj1i4WQjaml1EufJVYCDl-nuUOoK7yEuEAJLjVoRoEATHPI2XKNSIhCwGguNZeYEdrWaxfqkDOTWcB-jAvx2Y_03TJbJ2EKDy69FI3wJ6LR10DuWbPRnOMim2SEcvM2ywQfCoEN6JB_YDvCTOGvYgBDDpW6hC8M53KiGalJieFy7hghYtcQo2ETLHRVUFkpUT1EiMscjC6-08yHZ4eDshI831Gv7SKfoE6BX7EgUi2viB9FkqEMsXxeUJF2RVrFbmcOCEkxwKVS4AzRiBk3Bp-s60vEZYx8JFUqnhPApKduc3AQNVAidwVI8_opA-o2iMjnSjdoS-GfqZdPjjL10zB7LRL3XMh7xn8kYLI2fh1bitCT1_Osk-5f_WN6tidWuJM4t5puCrxE3DM1Eea194m_HVS2nHiv1P086FBUaSSCvdv4iEm2VHnGTSeZP4EflK9HhYRfVNaODfmUCsXyWX7vHRmnmMZIlXDD-hEAB9cJ1ulZLrGHvk8j8Cj6TMnu84ugsy6ZEsw7hZ04_2oUCmdekkOVdiA-Mdkk8Zw_kj8UuVagG7qI0-ze5i5JEEiPlbjcdGEwZRhOCvg_j17hrEULFnYJUHVcQcXtC3AifvYD3HVn9r1a5gG5Wal-MKH5HNiU9u32WaIqKfCZnLL8uH2MyBzg4ftuFtIx5aKMegkUNYaBeGkXzJcbNIeeHuVTHQcNKUUwJ3KAyrCKpFAmqFGNDFqBvdGC5RjXo-2FV14SmOZbYL9cmT-aOc4TfGOsaVQMVqovBMIClSsfY9bWRB_QdAA8W4rQpJoY07YG7xSewXDBGkwJqnf3g1fPsV8MeME0CiM_ReKMeu4Bsx4ayBgSnqeE7I-uzHyiok8VhMJnp5nxfwjQPn7iRfeOHkzoe0g3GOMlZ3IyR6XnAFTs9lird2qhEJW8JDCyx0hJeDZmoGwO-0pF2jINEUZO-UEzPsuFYURS1bRik6Vab0m5_aaIS2rMgOpF5jG0oRf7bLAHWIPKHoc-cJjEjr83TK1lLLHmSGeDgpBcWtToep9FI1pIJUy9q-7jm4U1E0aPTbCjq1bFGK_0jJ7esPD15lcqvDjFaiYKokEyRTSn20srzV3v2XhEDXtCo1EGhgqotD79jGeF6PeDB_8B9MZVWK4-hy-OO4MQkYnb7xsPHxc393SLmk5jT45q7kKxrdpktS6q31PGp-olORVRJClOag3LNszZsHI9CChsnoPygU4g7A2PjHEH4F25CBdb1M-nhzK7kMeZWF5Ekp5GCjHVZdhxUDvNsiz6IvIOk0skXh2eXHk5jzaBKbQSQl0hY14XnBSgWehobbVu2tSgiAxgKsRgATzyVJg7piwrpPQhqLbWGUnjVOqOZFsRa_EgbdN3QILB7T4g3gRCMIEuIwUiWD_YZY2H-P8niAP55WXHa8i_IevcPZRW2NdT3_G-yTjpZlJNMQE6z7OV8JHgAYGnK8Mt5xh-lM-3iVMqZtzKwk3a9G_t1b1GHyTdXUiD7wVocBLBo7pDS2Hjc1nrboExVHcUjVYnljgpxKTH-8DENFs4k5PrhN_NOGtIDlmucSkPY926nabIWy2VKA75cKLjf2FBHh1h6wHppt8IzxuHE8x4xPddPU1RUu-1mxukBANzJi6feZ9nL-ywbSdgWI5ezmPnShmCbYTh3nn6bZX3V5dlST_nw9RhhuftiHsBlNI55ZE28ovM0bGGbBZqFkLUITxLVk24rd5afZjziNR72eIQQJ3wMgHscFOnF9xnNdYOPftZezvzGx-sQwxstLj_fs5cEIvupnUT_NLHXL-9cOkeLIzqyF9QT8r2J6FliUfPYLCdDMtyreqt2ffs3Uy90CZBQ-SIeGMHvmqWtI4jKDAJ0ECikeyJl1jV2G4_DQ_xD5e389CybHh9lqWs4PZOk7czUxdAge-vUr3TN1_87ez-hWYdqqz32lxwRiSUzWK94NSdjH0YfChl6XNFVwvAaDkPfUvet68HA71NxMXnr8ILGGBlwbvJc-1TIF87hB0OmpWFEd5XXeUGKnkMa8hHVOY73EyJjfgoNi2TSiSXrMLN8hatig03tZiTldK8-k-Eqia3VzrZBkoLud7o7NRoK8Mhv5EkhWsJVaBw1ZV-KM0m3F1YptoDfYhm7v1f-_QL3I3eKFO40GwUJ0SGOkl6uKSqW_PPSuvaLO1sSdnLWnZKqz8vJWS_tIb69l0559G58TAGZwU3lGw-VCkU1jagW8z4Fw3DAdB4dPLhE5G1l9JiuIa9vPl9fLTqw6dMP9j7xjnt9Sq_INXAisL20Lx2eCeVCCmt0jGQ0hkMa5Xq5T3TEHHSQLlcavTQNlRs54jN885L4cZqF9rYVC0RPnZ6fjSLgXJAZOtum08PPluXudwe_qLVged_zPKYixBzN1ukezoNqg80vpCWWH4AQBPsm3QrT80YFXcB33351Dx4l5cQ2tg0zctPoNyhzWKS7udu7q8UdbHTx5CMBLLEjw1xjaUDLNUxGCt21-6fF7-9TWtoVl_7ZN_G6LjEKYeB-xHBjGegu6BN7oFrhqFGjO9hBIwmNcmtthCrIrRzfXyrnNEcV5AFfQi69-raydZzppihl2UfvzjL6p7t9T5yB-tv-1yEyJuT7PTrocpcsXFkmtP3vUGiIN83olyjH3WAv1vpzpgf0KsvsuPfsm-HItycG45f7V9L745f7CKSjSWf-bxhB5TIqT0SEAu3NcDTfj7WdzBK5r8nJdDkUtYo_dSKqhWWiIaX2qlnqdStshDB-8AurLSon3YOzdiX7XMS2Y9rd3xEIKfDtsnVLJdGybM1a1XZLP2QqUUSsa_UnJqk6VHGwuGIooIEPCSXDBR1q5EsfgI2zP2IRRvdB_IBR7XG5g71LV1SflFnH70mJvePs-HyWvZsdndO3P01-mvwN"><img src="../examples/tiny-house.svg" width="270" alt="Tiny House" /></a><br/>
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
happens when you point it at real buildings and famous fictional ones — the West Wing (whose Oval
Office is a true `arc`, not a faceted polygon), Palladio's Villa La Rotonda (one quarter, `place`d
four times), Bag End, de_dust2, The Skeld, 742 Evergreen Terrace, the Dunder Mifflin annex. Every one
is a few dozen lines of source you can open in the playground and recompile.

They are worth a look for what the compiler *says* about them as much as for the drawings:
`archlang lint` reports a real `W_NO_ENTRANCE` on de_dust2 — a quarter century of continuous occupancy,
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
- **[spec.llm.md](../spec.llm.md)** — the **whole language in one page** for AI agents; also `archlang spec`.
- **[SKILL.md](../skills/archlang/SKILL.md)** — the agent Skill: the `spec → compile → fix → describe → validate` loop.
- **[Language Reference](../docs/language-reference.md)** · **[Error catalog](../docs/error-codes.md)** · **[The intent contract](../docs/intent.md)** · **[ADRs](../docs/adr)**
- **[AGENTS.md](../AGENTS.md)** — orientation for AI agents working *in* this repo.
- **[Release notes](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md)** — every version, including what changes for code that embeds or parses the output. Installed, they are at `node_modules/@chanmeng666/archlang/CHANGELOG.md`; each tag's section is also its [GitHub Release](https://github.com/ChanMeng666/archlang/releases).

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
