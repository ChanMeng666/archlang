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

<a href="https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZ8k-bBEjbAAVipEWaIOiTd1YcaVmvSIGkLLmBgTz1AEXP0AP0CD1KTlIMufpZ23G6T1zuzDff_O708RLO8n7F2js3Q0OWl3SDsYuRpozPn_7C8Tlm__6DWFOEZ9IBFEQJc--mnmYHRb_o442LtbFT1OwZJmDugonGWdaoblCT1Qd4dc3-Bm7OViRFyFgRiA4Ev7DQJkSyYwY1zk5BRR-WZqyxpKbBXuksnsnxBSji2dyFF-WTATjBTswqLjzDc3DNNQfQlIwNUaDFNedBCafoY680Fs_k-gXIjmvn8fnT3-UA5VopGZS7JwOQ1Yg1o6JYP11Hak7GiwsNGQ23iKhuij7KEL2Zlwcog4mMjwjRM0dY52ON2zK5ExJaXDpMaEy6fZ83ZBEX3kpwv0lX2jlf9EWqlZH0DNJp2lAIO1-m5DXbgyKh9C7aNP7oFoF7-FgAC2tiwGxWAFNvNEYKO08fc_IxJSyAPONQKcTajK8GCJKdctIsQl1uotyQ1UIUJFEaqQKtj4t5AWgzC6CF5LVpCuDBYBQFcpiNfr68FNcA8CqyN84jW7ccAoZK4SP21EA9wd7pSKXDbUebKcTHtdd6-XAyUvcwcggfZ5D1voyx5K_xyCQe1q7lhG0qdrQPs_bxsPUiHR7CkCL9HxjDHUeGLUyB3ClGP_eXjblm6bJMOJjfGaK4EptoqOIGvQtzLY38FK9NHNdse1gEDmjy9VW-lPRLU0C7pU2IayemNIfC0uhY4-hIyBVSi1sOyZdkerhj9TuKdU8EkzGRuavGGi1jtaOWG7fl2LZxgey3dJoo68uJdzZCKrutSYoYSuQyz3OlIHOOYZk8QiQfEZZpntnokAPXQWzrKjRGi1hCbu8E-3SDfXimVBJjNDyJHZDkU0srlQlFjE42qmcbWqLZJVSxLqTDy6xZytRaUnPFOs2Tz3_8mdmkTi-zfW-mdSwRWLo8TSey3OQUymtwjclTOUFX3Lhl-vAbzapv1yjCpcTSLRoNMjOYmGgrhdksT1Wpi_LD5c8_ff_61bvLt-_flAddt9tqduMrjl3vzzvO79BOc8VY7ZZZoe1JifXxNtZDpe7IbXMiKVnLqUfkRmejDd7JPbl2JlHE4WhjV8QKYLLw1qRBOvFGT7kdw52_T8vcTSaBI44k2cZuC2wLEaK7XiM8BiE-fwGi7dXLYOzVYxBD9UWIsVvYyP6rLCQHHYg-3tUMv0gbAVm8f_PDq7cXL38dQHtaWlQ8cZ5zFRrOPzyK0npWS6RNlMLNVTkhqasEGqlqWP48uDbBVM2NyEY3h6dYsxcQizr3pIlp08mrQF5IBE8mxACNuco0056RtxxuAqdVZwAr1yCMnfPaWIp80ImLOLbj8HrfqFyMbraf2tXYdWDysDtTanV0nApqi5P92QEas8SbdVY6PFJqdb4dd-9EvNetEwnPV6ik33xLaDhqCZ0rtUqZX4P_4ibUxW7nU8JO5y52asyHwaU5Mvp2UHexvav4Iezo5pm0PB3sdSRloq5Odoh_IK8F7k5gardk3xqQibNjIDPfGNjE4_xOepbjTuFnoIPs_rr0T9c-Hyu1Or0DUFEwFvdJPBDBhHGi1Op4lKZJNLGR_Wru3W88jvf2v9RHl9UNei_9uL4gO-1BU2T0hmp4sq_O9g9Pergtbov_AA">
<img src="../examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `archlang compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZ8k-bBEjbAAVipEWaIOiTd1YcaVmvSIGkLLmBgTz1AEXP0AP0CD1KTlIMufpZ23G6T1zuzDff_O708RLO8n7F2js3Q0OWl3SDsYuRpozPn_7C8Tlm__6DWFOEZ9IBFEQJc--mnmYHRb_o442LtbFT1OwZJmDugonGWdaoblCT1Qd4dc3-Bm7OViRFyFgRiA4Ev7DQJkSyYwY1zk5BRR-WZqyxpKbBXuksnsnxBSji2dyFF-WTATjBTswqLjzDc3DNNQfQlIwNUaDFNedBCafoY680Fs_k-gXIjmvn8fnT3-UA5VopGZS7JwOQ1Yg1o6JYP11Hak7GiwsNGQ23iKhuij7KEL2Zlwcog4mMjwjRM0dY52ON2zK5ExJaXDpMaEy6fZ83ZBEX3kpwv0lX2jlf9EWqlZH0DNJp2lAIO1-m5DXbgyKh9C7aNP7oFoF7-FgAC2tiwGxWAFNvNEYKO08fc_IxJSyAPONQKcTajK8GCJKdctIsQl1uotyQ1UIUJFEaqQKtj4t5AWgzC6CF5LVpCuDBYBQFcpiNfr68FNcA8CqyN84jW7ccAoZK4SP21EA9wd7pSKXDbUebKcTHtdd6-XAyUvcwcggfZ5D1voyx5K_xyCQe1q7lhG0qdrQPs_bxsPUiHR7CkCL9HxjDHUeGLUyB3ClGP_eXjblm6bJMOJjfGaK4EptoqOIGvQtzLY38FK9NHNdse1gEDmjy9VW-lPRLU0C7pU2IayemNIfC0uhY4-hIyBVSi1sOyZdkerhj9TuKdU8EkzGRuavGGi1jtaOWG7fl2LZxgey3dJoo68uJdzZCKrutSYoYSuQyz3OlIHOOYZk8QiQfEZZpntnokAPXQWzrKjRGi1hCbu8E-3SDfXimVBJjNDyJHZDkU0srlQlFjE42qmcbWqLZJVSxLqTDy6xZytRaUnPFOs2Tz3_8mdmkTi-zfW-mdSwRWLo8TSey3OQUymtwjclTOUFX3Lhl-vAbzapv1yjCpcTSLRoNMjOYmGgrhdksT1Wpi_LD5c8_ff_61bvLt-_flAddt9tqduMrjl3vzzvO79BOc8VY7ZZZoe1JifXxNtZDpe7IbXMiKVnLqUfkRmejDd7JPbl2JlHE4WhjV8QKYLLw1qRBOvFGT7kdw52_T8vcTSaBI44k2cZuC2wLEaK7XiM8BiE-fwGi7dXLYOzVYxBD9UWIsVvYyP6rLCQHHYg-3tUMv0gbAVm8f_PDq7cXL38dQHtaWlQ8cZ5zFRrOPzyK0npWS6RNlMLNVTkhqasEGqlqWP48uDbBVM2NyEY3h6dYsxcQizr3pIlp08mrQF5IBE8mxACNuco0056RtxxuAqdVZwAr1yCMnfPaWIp80ImLOLbj8HrfqFyMbraf2tXYdWDysDtTanV0nApqi5P92QEas8SbdVY6PFJqdb4dd-9EvNetEwnPV6ik33xLaDhqCZ0rtUqZX4P_4ibUxW7nU8JO5y52asyHwaU5Mvp2UHexvav4Iezo5pm0PB3sdSRloq5Odoh_IK8F7k5gardk3xqQibNjIDPfGNjE4_xOepbjTuFnoIPs_rr0T9c-Hyu1Or0DUFEwFvdJPBDBhHGi1Op4lKZJNLGR_Wru3W88jvf2v9RHl9UNei_9uL4gO-1BU2T0hmp4sq_O9g9Pergtbov_AA)** — it opens the
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
npx -y @chanmeng666/archlang context --section errors      # …or one section of it (about 145 KB in all; the catalog alone is about 55 KB)
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

<a href="https://playground.archlang.uk/#z=vVxrciM3kv6vU2RIP0xNk1LxpZcfEbJb090x7W5vS3ZvxMQEC6wCWRgVC1wAJUrj8MYcYs-wV9j_e5Q5yUZmAlXF4kPyrMf6YRfJwodEIpFv9BHcZRJu3378_MO7m-9uYJaLuc3UEv7x9_8CAW6le9ZpI58gU3luVSrhQeW5gJVyGYgChHMiyWQKc2HEXHbBZRKWOf5ycAQzZazrObXAYVY5bcBpeiUXxbwUcwk202WegpXyBG4epHlymSrmIHMrQRUgH8VimUt7CsqCLuTBEfALqS4krGSef4lf0G_4CmKvMp03ZtAF_WgzKd0J3JZmJhJpQTmQj9Ikykp7dXAEsVVOxtCZqQcJqTTqQaaQ6MVSWAuFWEh7DP_7PxAvxVKa-FVsE5HL-FUsHqWlj5lMS_oml3NZpDF0BBgp8oMjntvzDJxyuYRprpN7RvybLnDiXD2oYn5qpXlQiTy1uZRLXOlKFXPbBaPzXKZQLpEtLkNOhDnBllOnncg9iUbrBSx1_jTXBZGRZGIxk0amUGh9D3o2I0ZZV6ZPXRBFSh_f92wmljI9OIKFsE4asKVykjGFSWJYiTwHmc4lgk71SqYwFU8VHq8AcHoahG_fvvt3SLU2cK-K1KJc0RZKID67TDjIBD5pmEricwodm6sUebHUyb10p1M103l6OhWmOGU5O-7CMi95u2OUB5nGB0eQypkoc4dbjr8YaV0XpEgyWGXSSBAwLVWeSgMrkjqRuFLk-RMsSwfKndBpiJHcGHJVSIviuSJBfpBdmMpElLaeEQWukA8IZ5RzsviS-JRBKm1i1FRCr_dXi3tg5FIbx_QiI0AXB0eAQ5-YO8jilSpSvULiv0JGfwPCwVdLbb-JebEC4hlRpvUSN8A6I6XrzURCXFfTKYr6DAUDNxYYz8tELh9kDv341D8NYvraOqFMDB0rFhJUClPtMqA3bNcfGzFzDPGgFXG5IyDV5TSXvUyqeeZgLpagkQ3bhAClcUY_Z6KYx9DBl6R4kLYLqRGrIuxWuVxKQ8SjwuGxeP50IQsXwyuIl7lIJPzj7_8NC2WMNvBI0s0fZApLoQzoGciCBBemwmVIB7PgP4cR7mRpCuVKI2EmFipX0oJIjLYW7pVLMlmc-nM4lSmOPSVeerE7ddIYpAFpS9XCgiidRjlHvrBErjQsRFGKHPCFk4OjgyMSq2WuHcyMLrwY8O6FxX_4-OnubdcfbSi0cZk0BWRyoeySZBc1stUQT0VyH-OZRZ0l_6MUTpsJauYYhJE0_Pb6-xsgZd2xunTZcRdWmUoylNdV9tTeJlbawiR0mBmZRdPzIBA5FyaVBUxJYYh7noxmgJlIRCprXeL55ZUZDaGtFcm9BZHrYt5gwklQvigPFgpNKv5LVNG6yJ9Y-0KqjEyc0oU9OSALc_g22KSf0CYdws8HAGWhnIXF4gBgblQK_Sg6ACClDdcDtAqpTcRSHgCQBof-1RjfIJZDuTwAWNtYes-rWZKlAwBW8Af4E4rZz2EvGaOxZ_zFL_jmEVzXgvrD9btPWwW1i_Nm9I4uEnkSZN6_2DkGYeEr5AdqB4LtPHafjuHP4UT8JQZVWCcKp4RjMycsWeo0NdJaMUXjox-hg3zSq4KV-itaHLwClxkpCXglHczUI54Ve_wlG3ZhZOEgKZ1ltUpUfcE4pMemT4DawTmZgpFoc4oEDTmbfcJl8hIcRlN3YlkMTvAx7kIsiyE_H5PEk5CgbiJNYBXuPyS6cEYkuDJCjCsvYVFaWS56ZDJPUBXHJ_BBM2nKen3z7sPtu9c3BF3pFxTxZWmW2sorPiyEHA4ASuJSFpZX4v0M5sYXFlKZKKt00UV3JXH5E-TKnw6k5AsLGS4UqTg5gMak9bai6ALzQ6Vf0_-Xwjher8tUcl9Ia1Ga4WfoRN3oGDr9i6jxMDiL8Dk8JLm2En4hWF5C-jX9Xzg_3qq_ScChjzgCcjGVORzeMEmHUFppSTAJ4ghiVVjpoD-O4i4eUYhneWmzuBu0A2o-UmOV1Fx5NUIyvMAFT-n8k9VHN8JDa2SqgLu37777080nyLR1QTRsJvM8hsE4gsUCZtqALAanshh2IV5N8sEENUsMg6jx-2Rx7IFNWRSo5RoKB2UJTTueCnIcq93wYtxnKJofJdAvE1251HohRuxCCiMNKj5JWi_Rea5SadnNIw9HGDSh7FWgIyENzLW04PSy9-ndm7d3nkEesXEwgtyR4JLOClx-f_PHO--CxcLB-TiKYpjKXK-OWfuKMBVakEAsuzs5ml2U5UKDXQX1z_R9_g6VmWUo1rw038317R0xoxs4g95eB7n8hfXotEl8KlRyL83xCf1Qm1pPkSpYFEWRZBQKLHuGHAiASrhYLC-j6PGSNHcTZiqsKmAbTC5niNKGOYuix9G4DbNK8DMdBFo_09DDSbvMEaeX8Ar6oygck3MEiiIw2gmH5AUiDiCo96__FX-E_P7mp5v30CdplIUzT-ygXVUxl_fjveOSKpT5U-_OdMH7LP9SIr13CYdvjC6LFGa51ubQa7Uj6PV6PS8lvd_ozyN_LCSruhQMCjRqABTbhVAFPOi8XMhuCLzqgCWXrrJJ3oHpsHMTNAcd_6nMlPdnGu6Sj42T0mCEiG7Tzes3N6wTBVi5FAZlhKOwRJkkl3G3hr2XKbqBC-iMRlHU7UcDlDKnodM_qz8TyXGyitHnUw6mZT6XFj7-ePf5-tPrkzVrwYyVj04aRcsP1gK1Jm8BVDZjyEYjfMufedLwXYMu_xUuco08I1JVWlS7ESSreoq1UbQv9ExHBNd_V7uGpVO5chSlzK_Y7SCf1bLPR-7JTJfoQJGP540ubSytmPV1YKy0jnRxFxnmPcja5LuVSuTxOttWE5x6UtSca7MOOr3x2NtY-u8v2wBWLwPgJ8-_rUD2eSA_vLMTCLkKsN13aAKdBZwzD-P5-EcMUHrk4VcYFjrewcWN2OCins1UIidy17Tssowizwd6GG0lfqlXqTST1X6ki4BED4N9SM_Q1I8CFD9tx-KY7SGZ2GepYgB_qLajkQKf2IcEXop20WRYc5tO0ZviaMwuVbEefaWyaG9je-PyPnlPk9VWSgbB1RxtIWM7kNwH1BjvGbQDTD1MUjTz-4R4VI_n5x3HIVXF5F65FwhUc5UXO7HQlu4lrDGen3cQdq-cB9t65qMNMGbZxboYkF31gePc6HIpU7ZrFABhMOaTi7_WsP6NUj8-eD-89Q-IelhZlCqqmLBGZ4-qUngA7Drh50fUMiHCeENvHwJHGDx2AzJYhxqSFVUNiXokQP7Ib_ugxY_dwGSlwGQGJVKRiabscdAg8wd6O5C5SjbhBPliBFdpkgA3vGjD0dsBDnNcYdl-N4nl3s04fM__X2c4m09y9q4Ac8uJE8U8l-wsoL28vYFEm0KaRsZXcXCF4QtCYgIYFUWFef3hzfub17yuByXa2WNydgoObNGPl5SPEEaKrl-acBxKo2bTKj3ZYBQbiADpf648knXDMCSfuzMc1EfSP1TjPENvkQ9-x3mGjYnZWeYdGrU2CD8_jgbNwJf3J_wRMCNknAdaB_db5eNpprUCx90_awgo7-fhOjgjbACz_-6prvUci9WgBfyaXm4BM8IGsI8IavlvAI8vWkfqT_zy4RqwR9hADmnRCvmihTxoIN_xy4eVBH7LbjYfuFM-KF0UWCoska9Mm8PiqWsTGqPfKJWhMBlT8eiPh7AspBZIODUGwz4lKjiqpqQDvtvLUeVSxOKz-bJw0rC7KZIEf50bscyON0U7qMhq4YM9Cw9q9K3Icy-4lBfCGKHMBRqUdW-Z1Dut7Ypy8VQ5WNJCXEnvwz8XN3E-LP06Zeemkh5cxpk_KCuVugz6eELIbHGUQZUPoHCbMwikXvxRa2H7c9_ApkOILAnwlwG94UbumqJxyOs5gunhP_-JjMbgfNxYxzCqZ2K3fyvQRDE3-FBvpbTJB84cvJTK4JxzOQtF0_vrwgFSG1g-jqIKswXkTdtEPjpPJa-zihpbTPVxxSa1unQt6GAd-Y8rb0xjwwEWDp2mQOkFEopJL4ZuA3r7yH9YvNsGN7ys4C53rxvdpUQbTx7B1E4nsq9GIYnduT1NDVbD125iBR--QvB6xbT4FwIGpdhwOC6371LlWe4S_TqF02ZKPYmvmTL1lXuJHK7JH4yqHcNJWnhsjya-yuOJXhetfvSMOkC5IlhMl9MK0q915dPzxvkP65xFKjcH1tESDa0_rgsipiZ2DfbmdE1mVjiefNKaL2tK15dOr7iMHCqr63VVzC6slWSfUbqYmlKYN4xOToaVU1cXfZmjyPbzKIJXoOAP0O_XvD_3a_ShxOa4PibzG9LV-jsCPpE7h19G64doY3xwIDpS-Az98S6wQTRaPzT_L7CGCGNSdhMsHIMXgPXPo31cgiN0oY1KtdmFVlnJ9aNxsX40KjgWwK7PM66CL7mFtOHocs0KrIlknb_-DROoNWgq7X3bD-gOzsmr5UoRJtNRMjHz3TRzNYY34UmGdXjEwI3rom4-rvPxWGtq5dG3o021vkfWzAJFGBMM2xQNWxS1QEw5h41ljaMaZEhx3yigNHzyRvlCz8Qkb6KcI8pZjYIAj2S4d6MkejaTcuKoAstRI7LnvPYY8aA8IsgeFGEWzN-KFoqVxufjgIK1k4txzeTB-T6qsJK-7gAiUaNRvbZq0_aAKFFoaKNE3Yvzem0IQ2rlRWS5hwlW8kHMBZbFgqWsDMlshoUe0gtNkLZQ09HzLEeqcM-6ZxcVVRT19ysUHzhtbFyJAUG1uiZJfHatnFN5sx8IG5EvU-3pWZig6S3UE_hvJ1YV9y-cAIOLfZDW6QfZ2JEXQJ6P9kOmymYrYTPPiZdAnj2z8JlRae29b2x25eEFCvejUQPRJBFTVUj3PNpovB9OWSy8rgn1JR21uixI1fPL_TBTYazTOm_AXGCl8WxcwYx8dfFXwlyOfxOYftTfjrMG066hsiC0eOzrIWH3KxltZuQaAmWeKB23D6MWyoCxtZgbMEKS74RcUo_BTntY2fmOsjJN4oOgLQVq6gJYryq31YRgo9ejpM35upCMqpPQSHhuGUsW87mx7bNeFpNcl8VcMshlrXo9ymXTdDeDid0gfdTVawp8KwiHEGpRZbtRjHrfVHVFkqogD1EEDiPXkAKC8ckFPMLgJILFYY2E4y4YZsigFw2UYfCLqHWR6p8u-Buodr3Twup9ENR7qgw3d_1O1foB9-uFHl5fsMcWGSsTXaTCPHHzlO36smbdcBv6OOYiz7k75Khur1zvvGyUpX-H-v4ADn9EHfs7lPerAv8HHbI63JlCPTszrd3SYK4GOVVoblycaupuwdz4MscycWgMCInyLhfTQ9tKuzPVt75gVGcV9pPBQjlqxWPJozR7KC378j-G53JWWvlrSvLtYvx6Gb5R3Q1NXE0-N8qyvyWn69LUVKaDiYX9_We-24wTemfb63gFujT7YMaNvrWL3UhTmQ6fIeiygeSrr9uJ4oaxFxU89xUp_dHcX_HcXaRs1NiChji8bfb7b6uy4b5UqUlfumrUMppNfN_69rFBaOPjz1tqGIUsGHJ8EeojteZsQr7HVw_rUkCzgtWichj8k3XInVQOt1K5pfFVFoNmLWffi8M1CkJz7MFaJa2pc6-wyPW-d_v2-oeb1-0a2MqIJW1NaJn1k4W2aht0Cnfx-RZul2Tc7O4yZdIulEXdqF41ROpZq8UVOxGxv4YKFi5rFOqmkvSOIL1DVZGg5yoFt1mg8GvcqL01ZRMtfesDh0j-CKx9CDpqtNE3VFXmvuc5b7mPlBxeiropD_DSnZ5wp2qDtmZtpCHCoqC0p8_Yn9X-CpVg-00R5ld3lV7WWpToeF9h5xU2G6NzSfuEVyC2XnVg4-ENDNxLubRBWjzurMxzX2XC6il2fqKk6HKOvWnDkwgeYXQygAXQ9SU9tc6Uib8ssFBpil_O8JbKQbv6TsSuFSK3VyHf8JvPMKCuOv2G1nyj8MTajLKyweCEhPDz5QBWMmHw8NcNZqXnU9Fsoyh5Wg8-rwaHMskR_EAFEe7y4-s_V9wCH3r4leUUIPYOY4I9NB3KtAsrYVKjp9I36KjggSBRK3RdcCf0Yilds4eRlELVhyyYJPYmxQwygTcl-F6T05DkUpiT1lJRYTZrOaHRnth1Pm6teGclB9XpOszwn4NZcHUFTzcDbBu_oz7FmoyrQLx53pZTKWC8p0TDIzfrA-HgbKA1wC7qLCxZnyJl45JbTWBcRvY3GkkRdbgkffvxx7u3vnHalEUvl8XcZTAeRtExqQkSnkoSBMxLbGHEhntwWn-JNyEmi9irEnQVkBXdum3Va3avSrv-OkPxIAs8zCL3wImwmBbnpnm6IRQK69WtPSaciIo_T769vns7-end9eTbm9efPn78PoYUe9ZR7mfKhPa_I3_TLVd4N2slTGHBskpTC-z8jz9PcPTkw8e7yc2__Xh99_HT5I_X37378CZGhnuyLTBPhx60wzdmQoUFO0GP6QW6LRh_nvyA1N19_Dj5cP3p08fPsb_exzctSX4Wi-qiResoVLJTHQPhaENeIH2yGDaGD58fvqWa9Nur023ljUF9nHytpL7GMuj6K0n7qhB9spk7EIa7ECi33nAQmhXHtarIUSvW3V4WYWN2HkXB0W3Q04Lzx7jLPcAE9K-sm2ypnUxl2synDbAgP66zL-PQB0KZE7R2rfEFKku8-5FWxYXG-NHYp_V2jq_Mi6-TYBZk2OyWeyTLtJF5J6j9a0HNysTsWMtw_1r6g7OoCVAtZtf41lr6w_7aYkbtxVw2Sdld_CHxpNxanb3FXrNG6adhJho5Skq3IDpvDVJzfraen6v5sRWixRFMtDYhWtv7EohL3JRfCdHi6ziqqjz1Quoqz1aIRumJIJAXl1G0UXfagMC7j83-wxAjUVfWSlnZm6Jhomqr71_0cdH7oB_8Z-9snTxXvCQl1D3v1-sbNLOXW5e3Ub0kr6J7vrt82b9Yx9uMIMAIlZPLhsVMSDF4rCz4zlSez0Sx1-evXQeH0ZtiI9MykZwNwyH-8hpFFp145_1z5aAsMMNNqPbPf4m9PafARqVfP6yFE6hIxjUTh6FnsrlSusp9Vf2LCRSY3r19d-vvcXvCfCqOtHa3yquVDsWSFqoc3_4N_hDl9ep_C6ILU7qizxyYG8oEYvZlLqt4qM7lkS2uzcQ_mS9OOXijkBP_lQefk3nEoVGX8hldoLwVcP8vx5z00pN_idQfIM_wpQH9SoD8r0Aw4tLov8rEbVxoZh8EL7BMpk9weG2S7L0o5v57lMDDQTQ460UXvcH5ISH_cvB_">
<img src="../examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="../examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fourteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVtdchtHkn7HKTLIB1MRINz4IwE59EBbkMSwTHgperQbExPoQncBXWajC66qJshxOGIOsWfYA-wR9ihzko3MrOpuNEDKdlgPIn46v8rKysp_nMJdJmH-093b-fwWVrlY20xt4d__-m8Q4Hb63Dpt5BOsxEblT5Dp0krQBQgYDOAR_9uALZelWYoCcu26kBqxK0BYEJ1T-HR9N4NtLorX4DIJy1LlqSrWoCxkIl-BXoFyXRBFSt9rl0nD3ygLa6PLIu11TjunMHuQ5sllSCtzK0EVIB_FZptL-zUtaWGXCYdkqrAqlYS3E3kOuSpkD-4yZUEXEp_Ar5ApYpG3pCyIxJUiz59AWVvKFITtwi5TSRZIdpnOJWy1Khwyjh899HvDPtjSrEQi7WuIrXIS_v2v_-mcwhK5F-Yphm3pGCHXjthBCeJ7m0npulDgR7EuXaq1if2-YSOcNErkFqx44t1JlELnFOwvpTASNtIZCbp0exu2cP2pC_FKFomMYautX3yrdQ6ySHJtSyMrmVtnpHSdU1gZXTixlnwc_VHY46APnjVYqUeHtKQNSlpYlaZQNqPn1sKksvBsPOHfzincK5dksgiUNYUIX_H53s6u3sLdh9mnGdx9uJ3N4N3Vd3ef4NvZu_ntjL69vnmPD8Db26vP1zfve3AVBOXFj8d0M78DAUbrzWtQqA2dUxBLKwuH29tAnEqbGLWUcH7-s9VF_JWFGB-3f_9H3PXPOO1EbnurXGuzEEaKxWYQk1Doe9wgKXnnFGKbZDItc0lr2hicWOZegspZQGrIRZGiWlbIXpw1tiqskyLtwTUehF5aZ8rE0XY-4L7xOlZHqIokL1OZ0qdWQ6JMUubCKV3g-d9bPFKh1pkDkRhtvfKiNn3TOQXnr4kA64STKTz0warNNlcrlRBKfR-DErGcaw5sJQS8kFY8qWLdOWUdxW82OpU5pFpaKLTrwRWJA97fzj9_okP88er97PX-lVCWrUklY1bMLliN0MplunQQb8VWmphvAhPuJO1Vserxdd7pMk9hKcEmIpcpON1Q0R58wG15DaU7yEqInL2_ur16P4Nr5nN-92F2Cx-uPr6D-Tv65Hb2cXb1adZjtcGrDqWVFqHFWsYsWWThXhUpMh-WqRRFitTCyXt6_oREHX9e8LKLu_l8cXN1ezv_HMNGCktXRrnXMO6NYePPswtiLVBlPPSgdwkbsm1bYe5lCnEiTAyFlKlFlbJAl1dZiOmFZ7XLUlaPLiNmvdG3MkElEHnnFHIpVqwwTtxL1EdIcoG7Ew5EnndhKRN6rxwtbmH-t9ntB7zMRpAxd5kowKKeoKpog6LIFTqBWs1SYTOZgpGJE8U6l00TzsyyygkH-kGaTIoUtkb_zJz24DNaaQRGIuSEv7N47MrC29nt9d9mb7uoi7Azyjnp_ZGRVucP0iDFUrJ_IJ_hMpXcF9Ja0KtV5xSkSDIgI0M8kzDIYSGBchmQseiRM02NepBoAYNhRsEHCxq-jGn3nVO2UiA320w4lZD_QTYJL6gPiMLupAn3jkXCKju_vZ7d3F3dXc9vePUtXigy5bZxi4LDuZnf3n3ohrtSaINnVEAmN8puM2mkv26x_KUUTpsFboCU2urSZZUhChfpzhuTXfbEt1k94DHj1WD18kb-61QVbCNIfjsdnIvLjJSwlCnZT5Iss03LrUQi0oarkuZBJRKW-IF1Irm3IHJNuPVevWBuZvB29vH629nt1d0MPl_d3lzfvO9CLldkK3QB29JstZWv6XmAz4vb-fyHxc38bjH7j5-u7ua3i3dX36H5fezTxr9lLmEAZ7l8kDkMXoUjQT3IxFKR-afts1oUmqB5NztVpHrXg3nhYyvaBwUiSO-FAJkgxa1FwSco7FYmdaxEuChIFtxW6m0uweZSbnF7KBVpHaylax2YBINmCO1UASJ9UFabJ7TlK8cnBJDJ0ijrVMJXRkAqnnIyst4mbWRRcYIRFwshEWh5UYuCe1g5aQgRry0ui8asB7EwSQYPIlepcKxeSS5F8U3rGzg_t86oxMVg5FYbUmkO43odkhuaUQw6PqDVP4FfOwBlgY53s-kArI1KoR9FHQByG3A1YGeciK3sADsH6L_mR-g2QLntAKRqY0GUThPjIs_p4aan7wDkci2LtNMBOCWxBk_Wg5iPLP46ri9WTO4S5UlBLMpOF3jZxUZCqgzbMvsNxFXcSMgNBdsKQ4EnBZkx20MKLVVxHy74Fo3lmSCTep5qsoVbadxTiDsJ9LvzH2_nP74iLkSaWobs5drVMQlq_Ggygs3__S-wZVg-YcydOLCZlrlIZA_FggEvyh2CopIc6YN6940Pw_bgLOpGr-BsMIii5iv6_xV-y686AL-xkD9lMs8hkYUzEndjWZ2bSYUo4ONrENDv98bwCFPYhIAAb6MgN_oIF7DxRpRwdUGxGrN_TiZ7lYvivkeH7OAO3sAwiiD8OwX5iKG5NrWf6NCzaBT6cPKe4yWy4SdeOORWVPrG0iYOAeDOPwhwNhhHUXc0JjH0pwdv-pF_N4oO3w35HUH4NxjxS8L-bY-V3SLrA2mVouCx5qUfRfArnF1M6qXptQc8gBm8CDMd1DD0-hmY3cvc0JamUc0Nv26jyP6XmZlEDZFNjsKshTkKM2AYJh0dOQhSVmAfoNI3ZpEhJgCGTE2JglX_lDAYRdEjbgQgF0uZw8kHkecnUP-j6JIwUPGfmuF-ayHryvTJL9RQIV5oNIyiR_ygWugTPn7SWkivViqRLWDv1WtglvxzwB_p8ZN9YMZoAZdOVaJpaIkHnkTR47AJ_JNTuXI1zwRc8oewS1rgIfWswCdRC3zcBP_eRypvKVI5YfCA4cOX_QV8aEoLNPWBFkDsx4vmwYaIf497b4Y6bFfQnFHsRhF7tyoTsGHlaAijN5_O2C26G6LlCD99ky6YXhfAlkY4YgV2KnUZXoII0AFJDoQoMGdAVtSKkzoVwspQD240xEQYY1AAMQbx1WtE8a_1VhbsPDhFQ8fFsd4G03FGny0QdPH99c3bxXcfr376NONogsJsI1elFZRlolnWWE0y6xJjDp8yUlZixIPMLfz0I4WsjOvI1yjMOuFnsVliHMW7xay20D6415SCSI4daeFCoxCk2chUYeCx1dZf_ACN3tvH9wfZSuWGj2Yt6JQLmYfkLGQwXQ-My3tI5eObXBTrUqzlV5yRJLp4kAWxs9IGROELYWKpH3i5pHQURx4og-fD_2kqRX80GAetGEZR1GlRemOCNQV0E8Kh5QsE0yjaVx16uoXgrUYD4WL8PELDPpzCFWx1ci8dHTUferjmnHsVGhJtjErxloT0gMVMR2t9NEfg_d4QNh5Zr2CJvp3vDuvDmXKcLMNkHJHqBr2bRBFs8xJTelInked6J4pEvmoLmiyZZ5p3PCApT6od4ytWO7x5nh1vdFAl_RmFDGtTpudkamgNvkvCOYFRaHg2E_bIgfP6-EI4GF2OnxW5N26eFbbaJMzKchoOPO2WMt-6mNQwPHjfCTN9oyuT25DARS2B_kVQM7Z0mL34oiFuwHb5_ldXXHBoJ40v52xLxzcca3_xUq10nsbEAHHlkRspKOhgKbfoL78BwXYLrRVshTI1MdSse5JUJvc9uJEKl_TYdifl1tY3EA-LaiqfUK5nryiVKco8p4vKh0allSWWrsgSpXGo24VUQBe19QInjUFh-yRwKeFebh2lRwaVV5Bo2qdO2wOWCOxd81G_vnN4gVuEuEkIBZk9wuFoUB9crbsG00A-RE5nKVpSRRV87C0-vdw__EOyEAE0yaYYqtVKe4QqBCR7DE9He27uCFlDPWuyQYNsEBTUOtQODNcdx23TKOqOB5V3n2JoggJKlcGU0Z_g-fn5OVyzG8DX9DFVvKlsnkp7z75fFcFogiiSDBMBvT0nl4wUeWkzXgjF9njpd1MjLbW-xy2sjiAttXN6w2BNJB9OtZCSDHcagrDhMIq6F1EdxWCUFEVgNNaKEaOxYKcFZfVKEJCvTpJxZUFbuUb_DWMMMK10MMAz5gh4wBEwAzfcQA1synXNISUQ0ahikehRTC8AuIcFlgUIYEwB7KAOBfHUH1EJ9gBaCDv00ObFvUVhb5fDwAxqd1sHzBPi_C6gSf8FoKWwqvidQNPpC0C7hHXy9wD1o32kFpS_YAuLFYk9PMrLPMhFJeumB2rokcO4Bo5w1USpj_w4ysqodC2_hEKX-AWURJcYF34BBZOil1A4fVhwdZDShYjVeFKpMV30aRumzQ079bP-eIT2aFpTo0EaVXpXFTf2FEYlT0lYf0IXvTZouHr_skXftGrosH2_rbJsp_6BGwylQhO0iy2FunmJmQN3d4QvCxeUElQ9ruBMGxmALmQj6qZWFVbqzsUOI5JMOHwGy_YCnApZwVY4h7VsH3NbrKvR1uY3lM18-jCb3YEIkRdV_bBNrVzdLcKI7fU4qtsa7MJTtZGFxfhbYakIrMMoQK9WzTbYVyG5MXIlDTWYarpmMwTpNirPFbVvLYWkvoTlQyrfK1Dpm_WCGgZQNxU42RxzyYxclbfTrST8rSc4OYTcCpcBFknYiRIk2qyA6FVq5CEPASjFzCHHRn9V2WDH0eDpAgsDw1GDp3eUmiLZyTOgS0pjHAWiDs4m0wYqb3TkQZ8BkPsAfYxAAgJv6zIAHBWM0gD-j693XFDB6rJV8BgOG_v6EQmObClHM9gSNEUSe3iDgHfk8Ck8A_-nUSfZZwg9-2DaPHyZ3B87eGzeAreCA1x_zHi1LcFKxuOwWbn4Uev82Pb4_PfUYExlwstRw70O0bbgf1V96LgCPAmTAhbtMbHfk34Tbhh5tEOApUwXFvYVgAAG_X6DH8xIHp8F2LUAmsff0KBJ9ByAhLYKTmqI2lhPov1kqDWdwb3YmFLaGKgN35hGoUa7YJqlMEZRcxDTInrST0KEAgMWFWg0IH-NiXNVy6SKyFYnGdaUHGQ0KVLoKqXjIQb4WauCPhdJgpVuRl0bsc2oQXkwU1E1a5SDssD8jecIcMaCqy1oVsNXNLLy93_EPbgK0BhqKgspGlIjU2w8UJukaUVX4p6_yaVjWXNag7vgJE45NqdeJOmbFV8ALhNQDbdR0z7rTy8O36FZfFU9ye-onO7rxXx2oT5XDdD4_iqPM1n3lEvsw2Ngs7XAGSU3q30XlCxyaOwFz6cemkee6R2euKIKA29pIyX5TyoMY1XiYL-eMU_1K5xh2ECX6eyyH17-dujnOSk_8PPvdGmcxATKN293snBP5-TPw4SQnwxCt8_pbSjJxUb-Uioj7WeR5_HrQGEbyS9X39l_y8dEbutpFFHNHlknCm73sJA3Kk1z6XNjNEWqWQ0otNmIHIQxolhT33JPiwQ2aYTj5DfIr4qYwpxOHbcN0J30R6ODsK1FWW6WRua5gMowjqYtyulRwuXyl0bt3xugfft86c1XO2oui0Wuy2ItOUZkBR719-j6hyu26frRs4RtSixFNTgd0BanNSE1N_pHsldV7G1xwLfrYi8avfgi2fDid5ElOd5DS_3PerVJI4MccwLYopMPiyQTZk1pX1XiH0RNR_k4PCDbCJUv9WN9fshl038EsnaOasRmqysup3Tsl3WCMAxu-YBOyqa69Gl3UavFNBh9iZC8bLc_aRwfynNwRKC6UKs6gkCJRF2sM1WXAgXaHx8QZrLKyBq-edD2zYeENjPlsiac1uvBS5fpGNnl4E-RTUd_lGwQ9Vvq-UfIpn-ObFjL8vftbVRT_QGyvo-Kj632W90KH8DJO2Ws-4s64Udarn-02_3XNLv_ml73X9Lq_lOdbu8bT8JAU_8E5x3JmQpVVINIoRVRDbnRCLfIE108UTyDxW6xkSlVu5ULrrwoN0tp9vwsNlQMtV10Y-wLRyFpUhys9PNE_nvOFFaq6qp56NCYIYUKM3wYR9LYOEWpK8wxMbVWie3yjA21yFAt0vOVNhuQ1qkNBZmh9B47-ejOPVXPWR7Pg5MfGvI4ochbpXXsMOpNYMOdBqoc9KOo126d-2Cl1fxv9f6rxIgePgnN4eZkb8ZTSE3spUwHcNjvb3XlPXY1vOY7235Th5DDPchp9GXI4cuQXG1o9_hbLf4AKVzGsvaQwk8N7bHY38ObRPt44yMs9lsshsKVru0Pha98j3AWiH71QJ0ayT1W7NlKg10b2fNRP1bOlzLXOyzMGSWbgSfVn1Q1AQw2EytX5W6cU4VmL2lIGFFuzA612zx04Mc7spN2cw-fPSQfPtOOPUY-bJPjQb7Q29wjD-e2t3r_mcbgsdX7zUmEb68-fje_-a_GxLAmjyEc3FNHTmGreC1yHDWvh229rYrBCJVbX8zDGMRD-xFNtqho5WobupSZ4vQXdaCaaWS7tcL_0CrZLqQSE7UUd4S1S4-Mi3zFpmqjUv7JCKX0PO3t97O4mdMgRAwrRZVANCqe6Yo5n403WFb42MGYMk1W0q9cQjuPmqjV4DTDkN0WudU4uGepitpIwJrKh7-MwMJTfFh3CCyWNvxg5kBT_RPHOouD4fgPdRbZzO3NLlzWDcJn-opsdZpEk_GXuops_PZYpcbJywuROdojarRc647ifp3Iiyf8JVs2bJWJRtTYmjSNIz198idalKneFeFC0U-p0BLCGn-gETe7GjFP_Ma-lYi_bqAWYvy6ei72Ks9pOv4QydU6VJoC3t3Of6jS-cr-oflcaizxSfw1TLkF_1sRfIquLa-JRR2Z8rUOBXVsPqIPjEgBqXhEmQTPzm9LSkSdbihq_Hnx7vo_7366nS2-vfru-8XdnIa743aGvwwZ7AvNr7pvNQ49S8r6B1V3jsxVu19oUvxNQf1Ao9F70OA9zLEKvA1U6mgE3NOG5xxzz7Je_0_sbFjt7LLaGSWLUQN58KWdDZotbLrFe_sbHS9X_CH-sET-HH_D55rs1QPPSf45zoTLXLn09FyZa-2v1aO_PN6j9w3aA5xmg76Jc8Hx1Rfas4zVY5AgIBrWqKoLl_ulZSkepK2GCVEKPryh4JijfAxEMGdDq0-HEDd_KBkG0SiG7rRmoI038Hcfrj_R_HmXp1u4tBuHXwxhsiBlKtNeqDH6CTmrcIouhE3MGep9iKkKzTvwE-yrkARUofaKZ-pEsYZxnYI65fIwme5_ENT6uQD7LPwl32L5BCdXJsk-imLtP8f84GQQDS7Oo8n5YHJCuL91_h8">
<img src="../examples/garden-house.svg" alt="Garden House — a two-storey family house on a 22 x 22 m suburban lot, ground floor shown" width="620" />
</a>

<b><a href="../examples/garden-house.arch">garden-house</a></b>

</div>

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=jVfbjttGEn3XVxxoHkaCNWNKo4s9hhdw7AkSrIEF7GTzaLfIotg7rW6iuznSbGBgn_YL8i_7nk_JlwRVTUqUxot4XoYi-xxWV506XbzAG-RuW6s8IsSm0A6qVj5uyUb88Z_fECtCrqyzOlcGb3xevVd2A9qrbW3oenAxuJC7OlIeG6-MeURwjS0wqlUIFPBZ-byC0TZ-Ht-CHsg_wju3havJBriyhEJONnplUCljJoMLBCdvXqtYQQdYhsGTyisqECvvmk2VVlDBZK9OlpcNh0E2Ny5QAWWLwQVKHSMV2OlYMZNBqfex8RRe8QJYh8I5D0OqRNgR1QHORoey8Vbzwmt8JFNe5c5GpS0x58g66G3tfAxjjllHyaY2FFB6t4VC0HZjCKXmbNVGWQw_pkRPv_swxK8DoLE6Bmy3A2DjdYFFNgBCrgxheis_rPOxQlMPBsAF7vaRvHYeoSJj8AxcMR21s-EaP1WE_et5lmUo9IMuOG-NDZKf739-_x4V6U0V-xkWUh2wU8ZQIRWR4Pm50Q_abhBqlVNKshd47kyztQi14dg1J6otBZ5LFfFcuK8HEF5QFzRipfN7SyFglmX4FaNsko0xWmVZ72KZZXzdXUgl8aUjO2y4RzZNZPOOZn6k-WbcTXrr6nj9zdD5_AhN11-4WpIRXbz2n9pMqthuOP0F_W8CE-w5VBi1JoPh-7T2Of6uY16RHaLhVmop7tPNE_Y1FUzH7F0GOnbeyP6mx_5dKtQQxz-hbwt4wiul7PGmrBx5p_Mj7w_KmD5pS8sUp7Fym_Y4U7p6nMterCpWX-EU2aZmYOOwOSUNfl2ysgmj7X3gDm2XdXLl5u864Voo2-z_8d_fElIHdijFVsKexc9GufZ5Y5QIwhIV4cRAxq_6rxBSfo1snE0MG4pQyYYExD3XRcpByE2A81V82ipt23zdHEW900WsWILZeYNV2m4IhsoIhB2Hq1ksXey6eO36akx1XR05X2bZuejPQ-rJbTk_yCLBXzyFtyEl60ghuSY-Ie3pYnnQxV-R9vfJpNyw2hZu17baTEIDuoQtzhN2CpAG5kWHDM--AbCYHQGrQ6gHgCig7WW2Yyjj7EYqnqydl9_yWXGP3_-HEN0D8UXuGhvJ82XpdbEhjAqvdhYqIDxu186EMcvlcEZ13vBJqFrFTGYLzoA02IvkNCeY7i3oSjp9uWhBgll-BZNCRA8zy_4K027hiJmtnmIW2aDfhM8OfXrgmeCe6ojckOLGkSyKjkQD4TQfwZUq5WGRTeY3B6NhVexF6K3RfHSlGp5AReMixpuk8BbK4tjPTv10mIJmt0rBtrPF_4v1MoAnnkfUrPnR2RZYx-JnQtr5wvgWoXI78tBWbpbKI3fekp9grYK2UBulbYjy9NAnE_zyFi5Bgmva814E2k140kOx0r7ogpRdhKgeg_gGjwuPruFRECqPTZrzItXQNuiCknHy7PHLW_FLm1fO86zmDnSXIb0eVGxoksalAO9ictHR9EUmAeU6RPK2hQpxwnHIY2Z_d_fhx3_evXuFz6VpQvUZW1KB093NLSrK4kueTCx5lConeBUr8vzUHohlm57yqHhKuwwyiJI32tIxTN7ALMu22zRwXcqRVl4d54DDhGrVloozAaaSiVOKUxwP0JedBPl46FXuDs_wUTYQMEoFHp8qU4otnGw8k_n8pIfmi8S5Vvl9V4Dq3M6PbLtcGlJbtEdzKh7WLkaWMqf4MKfsV1nboO_0lmzgyoXoWbW3KZtiggFq7R5oAvdAvrNCGwOU54-DNKZ6KsmTzVMpRjsdOZtj1E7z0qBjJ9t1o02h7eYy4B8__3T3QQoaMNq_vppm2fPVNMsmeEw_ljyVleLSF-elG3fllHAkeC51YKX7yAnlh9IaIhk-tD2pghtyp3wxEdJU69rds0FJkg-zRxeoCHlXaUOp7Wpl-SXamE6rfaW1jd67I4cy2_5N-3_V_pezXyYEvW2Pbt71-Opvo_aKa-nKMlDEbJEh0j5iyAuHHWrVRx0pnqJu-qhssmwhaUA_excfqwm1OnnXtBtYGDg9TKZPUEtBDYCooyH5LgJq7_5FeTx8Mr3pvk2H8ljOwk_rRwz5E_Stsg8qtE9UJAxn2Wx5lS2vZiu--2XwZfAn"><img src="../examples/studio.svg" width="270" alt="Studio one-bedroom flat" /></a><br/>
<b><a href="../examples/studio.arch">studio</a></b><br/>
<sub>The flagship: fitted kitchen and bath,<br/>an enclosed bath off a central hall.<br/><b>Lint-clean, and import-free.</b></sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=lVfbbttGEH3XVxwoD7EBWaVoS1GcJkBStCjQFn1o3qMROSI3oXaF3aVptwjQjyjQD-qf9EuKmSV1sV23ebJFzpyd2zk7fIa3iJ27WHPpnduCduTjlm1EZ2INQsE2empQOO9N6fwEnTcxsoXYB2yMD_F69AzAbIpYc3o-0X8HJ9DW2UoebXFGh8cmgNT-_JUi5FOsOmqagI1324S0mqCrTVGjZG9uOChwqLlp4Kz8MB6ujY2xDLIlCJKCicZZOKuwAPiG_R1CTZ5LcFnxBMHBOshxKMiictiaEIytUiyXKRu3Y2tsFSZgKmrULkQusb47pAoT8dEZG3C2Kp3zWHPsmO1qgpWz-FqM3ky_lkPfrPpErxL4pvXWxNbzdPQM32qI2gU5NMBtNmpVU9MM4eprE-AlGi4Ra-_aSho1dNB5dVpTrKejXUMW4_edu3jXv_6uoTjGbyOgtSYGbLcjoPKmxCzLRkAoqGHMrtMv63ys4U1Vx9EI_enla_-hMTfGVqCIs2ySnaciI5hfGVdZlt0usyxDQ2tuMP7BxKJmi6_wo3qN0QYO-NQ_TlAn6GsuZ4CiC1p_gKIvBP1ycUD_iUJkjz6_8QmOVO4YR_zOj3BmVwec76lpTr2lhMfe82zvnV9JFEc5viPpxP3z11zmQKrfhdugx6TGVBbR7RKYRHUK1vcqH0vRn-F9PwTwrQ0wNjptcd-DsKOCE12tg05gw7S5BtlhekGFdyFRp6tdwwp7yoZIMtieYs0yQWTR8CaChKIV7aYj4D41wbeRvXEel1l2RLtZluE3PXvgAvpeCEH3w_P5kN3GOxtT7BT3Q_88gClEsC1f9Qx2Gl4a9CN6TPE2eQe6C4ra1exZqBki2VK4SVECy1L8IZKPq2sIBVTieJJeKK1b-zyg43T0uaSu4KZ8XX5Iobohpak2V6IWGPboTBlrvMwy1MZWDMvk03EInaSt_UvOA_CjVVISPAz66IATPDF_Gk9H79_wlg_wKNb_FV_-ZfHl0vDO2NJ1qYBpEKbChOSVZyo7j9ikYYyYzx87bTZ_4Cf1UGSKyBeDE9tyOOrqMZd8unYxuu2AK0Y6T--4DIlk6cqpmcogbqS0eIXVpmlDvcKWKbSew2GcujTKxlr22FDBMlB76RfhTupp7L7rtqhFx93uQvNWaBgbOCrVVDZmyyy7zWcnsjE-Qe7Il96t-XHkNLgJOgHmWXa70Ko8EV3-NIYIY559SVB7wFT544wHpb6V0OCdaBTyF31LhnvFtxbU9AtGoq3e6mfKZWOr5wGBK91qLodtQqVUW3SWTZaq7O0O0Smy3mnnExSNkNclnUmT8upYemtqNsNr1aRIn1gEM7gN9dtIpHVzr-Mbb8qK-zuTKjJ2CHkvqPt4Reak7S9k7s2BECeAIbqbAe__As4vnwDs7-YPwdhP_xdwMXsCsHCtquOXRLhYPpWyVFjv5nw5zybzq_3dvJyfTuAvbkNj_CuQ9keBlnLHLwXniA_LA9B7sRyfAJ2GVLuOfT_XKrZPzvXLLLt9eY9tXXFSoIQzSFJfltliUADh2ov7fKVgLB4G8YCpV_NE9v0dzHTD4VpnOa3aZb9mm7Q4yC75XCSPUTQuyOYwtE5INk2bzwbuhn1NtsJ8QP_5hv3QahvDRPb1YEpWMUR0J7-vsZI_YYVdG2oOae9mW-6ckYu3jYrphi1Ih8jEw26kq7IG7I2VnSbsyA5JRN8yZpnM_l9_Yil_Y53WoXVrmlJYvVfwv3__Q53khkv2mcqQ26aNede0IWmAWKkwa8Eo7oOeKvS3t1TEJn0zkDex3nI0BQg12fJi-KBaRb6NK1QcAzrvUklLs9WyhL1OXbw504B61Rr0QefgxFpNHzEbAdHEhvUrANh595GL-Mhngr4uPXX2w_oO47e-qL8he0OhfyNqPM6zfHGRLS7yuTz9PPo8-gc"><img src="../examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=pVrNchs3Er7zKbqkQ6RaUktSkSIr5QMt0TYrDpmVqNWRBGdADiIQYACMKCaVqjxEnmEfLE-y1d3AzJCOY-_GB5c4HHxo9O_XDR7DALwyKy07Plgnd-DLRekWwsCiNCuh7Rb--O13CIWEyd1oOJ4OpqPJuDMY33YmPwzHo_G7e5AvYr3REk6ee2f9i9Oz1nHrGKaFhI22AZbOmuAJwQcnZQBr6NP95GH6HoTJ6dNKuFya9N14cjd93wbFn7wtQyGdaR1DIdfKbwrp5BlMC4FgEpYiC5DLTOWSN9oWVkvQYmfL0AZv6eFGCwM-iCA9qHBNUgJ4FST8kkSjnRqbxAe_0stzfHcOuRNbD8aGQpnVGYwCGLGWHpbqWUKunMyCssbjUebCZQXk0mdOLSR0Oj96a6DT8VLLLNDe82tCpu3ncHJ_2ob5QmRPczgZV6pn5eBX8qdSBOtmXuUSX2nDQmai9ElSu6QF8bXWcfMTaCVRcBeKrXA5wvnSOOVlghuekj3wsZchPX08PYP3qIwomDA5yrwvinCSrTr4fgj4qA3bQmUFKI8OkgW9g22xo3cKiwKH0hkPYit26CNr_KZ1DM6K_Jre0upZmRU4a9ck1cKGAhYyxwcegnjiDek86AIC90zu5KV7VpmEBT7447ffW8cgTXC7NhRC6zYsRCjaoEVpcnz4pEJWSEMKVx69JHuSOQhtzarhumcwMRJE_qy8dTvQygQUudQSnBQ5-lUb5o-zu8nk-9l4Mp0N__UwmE7uZm8HN6Pxu_m3oKV4liDSOWCrQpF8CRZlABU8SOERd6tMbrd0JBVgq7QGL3bgbRVhXpLeb-8Gb6ej8Tt4P3y4G91PRzf38HZyB4MxDO5_GN5M27gFCMjFTqtVEWAthS-dXEsTzmDgsuKDMCsohG8dg7HgSwNrm0uNC0GLoEKZS5LEWMhFkBRVBy7gxc5Ho6NRRTqAtvYJgXk5H3VbiCCfpQOxsGWAwm5hXWYFsHiZXVMkO1uuClChTikWEwHacJlcncJacdzn1jr4bjS-vT-DAep6id_Q2fUWpcO9ZV65CcWHk-hEppPLpSh1gCdlcg8U_ahcKfA8_BEWpdK5dLC1pc5BZKEUWu9gU1IiqnKKVjkespnYSLQUz8tS604h6az4snRgTeA0lcvsiVA2NnuSARiF_dUulyCgd9HtwnoNmXVO5dZdk5HosJwv2cUNpsb4BJcT6EItrc4jaOX--AwFVigEeqDdGrAbaSgABek8FMKAfaa_JKxFVigjPZ14QPpj3bIgfivlpkqS7CyogfutMquT0zk4yeFvSq1haR0IraMtYnp5nN0_jsbvZpM399O7h5vp8HYOmTBkzM1G74D1tSalWqM5tYStrWILN_QpDaV80TqGZOg5SzyHxQ62TgU8rLFkfxDoMroNmXAOXdmj4CBcdtYihzt6E8vjEfzSAigNam29bgEcw3zlVA4X3XmVm9HTd7ARLiisDexcykOv24VQqOypylvJmz3WSUwHhiDR4TtrGZz0VHFKL3NUwAKd8nFy993gbvIwvgXhYSu1vgYBS_USSkeImcxhvtSlL-YgVkIZH0AQLgpQi6UFer41IHhDEs1I7-Hkj9_-c9E9hcxalytDCSCJ7KS3Gv0iCkXAqIKON2KDfhPgdng3-vfwtrEetHpCW4MoQ2GdzDGA2FFIfb1udw7OliaXlP6w9BDyaDydcJFHl0EhnFC48_xx9vbhbjyaPtwNZ4-DDx9mN5MPH0b3o8l4zofCgMG6i0rGBJFLp55lTrANyShlAKZ-6QDPsMGUEVkECac8LMlVUZkpqr0EU64X0nnMGwRamqwQdcbxlqohOcNiF9AfEUlpyaTirAUQfacFsBEb6WBwzmbJxAYxfSa0hN51r4uvcO0rNy2AXK096tKi39KLhcypMGG5bLW-mOmQ4J1OpwO-kFrDP3BFmZEvdf6PfxwS25nfKCPn4ErjqxwIW5WHgnSTq-eKvsWUSbWbqAGpLNZIWSgqiN9WwFzq55DbuN6LtaSk0iCdCHYGb5BDYFZHypZX8Zlqh4eF1HZLyKIRO9bMOdcsdnD3MIbb0f10ML4ZVsSFnPErtKXzATZWmcAmjzuwrI-zHyY33w2ns7uH8TzVYBZ5I4xEgEw8q7CLxAMTOAvq5YpqdQvY7VX-mq2D_-RLkE5ZB1AHbL_bhV_gpNvunsJJr9_tNv-6uujih_RHpq2X8GsDeztbyLyH2HVyqLF7jH2ZQOmPr68Q6iOQ_mdAXiWQV58CIb_5a5C0MB7vz1ASwfsLlPN6Lf_N2jmQJvLKz-FcnjcE4g8HuhGh-IxuLq5qIPr7zwSKNfyvcK4aAl01D1aHOnPqzt_8R3jvGsF7QgnqlPk877GRFntFrwKnRC3lBpRpx7SILs_Ebh17QQKNRLOzFBkmAWb7Z3BfxzacUALb24tKT26JABpJdQQjiMiByl-7WWwxsNpzqPA_r36WgF79gu4AWiykhqMP_PI_4VYhLzrCeudTl5LTsz3wFEIInmIlgZ8fgr-JnKV3FGUg8MhkDmH7CfbVl8L2PwubAoRVwWGwB3v-TQ37Hb-cQCNshNiDRSqapG0EGMGi9C9EZiPse6F1jZlgCSJTLiuxEbH7-CmMKnz2c8LvX3W7L_1-QxsiFB_jEzfe84oYUojZiEHG7B9gfuCXD1RRBqVV2O3BUv8ZRb06EPXr7gHsEF8-OhSVIBphSzXrmoKGWCsSBq9CSXqC_ylssbmiUQ13KsqnUUysn80GW4XUcBHvrupPowPAOGOg_HU-Y2A8eK9bJyAu_viE8xlXNAIBLZchkm5lWpWEjWYKCVzsnZSnfhIbXJk9VY1L1Z4p35Q7TiEIszljyAT3PJGVCRc7jMiysFNHRi64w5GC-gViMhrF4RJPEpH0DapDxZ0YLASLo5cmZfBBuBCbmLiht1rlsFHSEehChq1MclWHi-ybe-zY4GfO-kihtPB-3whRd6k5RWtgMLYrS_QPLFGfhQ3wJs1enjBnc69KndR13UolU-xsCStMzZ9urbDPQ1imzti4pRkSeRXzsdi_UltEs5JGK4b2sQtmp_tHpdRrDST2IAJ8g3kmHhQTZMPNaj87wOgfYPS6CHKI4biN_8hXMa-gkzb7YmLahcAGg0cKK2upkVvZa-z3yDmw29E2e_J1rx9bFO73cS6aXlzaUvvY4ntFXU2cG9BJhPFbbEhwdtaOsz1Nwxqei0Rcv5ZBZSwdemKTVaNFhcZp2Fb6gLLieIo7NfYQUgDORdVzk80Stko-Tcltvcbizu5Njrbn2j-K9aLy65SEOdSbcUW4cQCj1qgEEWhJZp3BbGB8kCJvx6EN0YGSmuo4N0ktMH5zdcGPuM2-4hc4XpExxMRxwNx5cyc31uHADs4ZxBfWHToilqdoEPalyB9FwPLX8KWGKmsXqgY0mOEpSS1LR9OYxmQSmx1UJto-jnfwP783zSHImDvIdiq6rAcjFUFWpkp-honv44nP_gGTmeLGh2c83zskH-xGYLceZfHXzdLOOk_jLNwppTuVv7Z7HAUDI9GUmL6-Tukrhuzh8ibb-_qj5b3PLd8ILuAV1bi4uKiXv6L0wstrIrQH0CQAXAeZAcT9-439WYONSs9p_u9SdMIb88AcO9XryLoLsVBBLOK0ABO3b14cJNot_EZmoTHYp1SP1cCnBvdTk2_4qVQ4P58WkjO6NBhcIX1MUwmVS2pyeXKs8tcmmS3y3YqlH1qNatbB0kjBcSnm_7Q2Lr38zNJ-Zat67eeXyr2l1P-hZ35s5tTAH0O8haHTpxEeiHhVcwAeCXUNzl546IQ1OE_UD0L7K-SS-R70duaVeYLUDF1edve19edy-2i0dp0oEGYP2SeWTpFzWfG_iHy5L3TD6eMI8296fXT6aiBKVYGv7HD8uPBWl0E2B4DVjJTEaseLCyOJyuAy9nZn8TJxTk5d3SBhqXHVJItO9JXn0hmHOFw67XLp8cZPYZXPlQ_CZMxJBx8m43fcu8YVcBJnRXEchjl9b9KURjmn9UUZlWHrVeyYjqvC-lMpXJCug_N3YlxxCro_y_o2mvJnGS9jqm8zEYS2q1KeVWXKC6OCcLvaYIgrTMaDXfY95WIvtF-e01w6TcMItNoMOTNdFzFXVgYL_NvBzZCUaOzhnBpzklMhUI-wNUg_Cxz8tQArp1HkANFU7O_J1k3eG7V-DmwkJsbKQN0l02w3jw7Pnr63hQ_2WabW7Yu2uDrYYg9u6VS-kv8DHJHdT8JltjRBui-H6_UOpdvDI-oZ96NQZ9NHdg1k4djnXnRfLml0Xa_eZiTHR6sXNgRkPI3V3e7LNwerfWG3RF4OVjMrb65-1e2-vGIS8rEqaH3V-H9KAKw2JP--CHYpqjFPu8-Js54WUFKObf29XYqjvcVcdqvM2KvHI7RZc_EUX91fvZB5mjD1ce96a-RHL-S49SjoU2tffdHaOi9T_RbPfzMxc7Krf2eiPKytx98JOGuXnHX5LsoG_ilJPXegW3ROkYVIyTaVy2Psfn8-vLoUZhe7YrrE19jT8U85VOChoS0DPVW-uq9a4N2uL3i0h-09xsf8Kw8O4XEcQBlGLykn13loo0uPha0NaxUwB4rAF8ncoyQGvrbPMeOpZZV6PY4sY7Z26TbKy8ziuBT7iGWjVnnMrk88QwUf5OYsCQnKp_aaG2oa8-cwT-OaOYc8bpLkqei3EWs8IPaCVPNSwbNLqvN4qQX7HGiORxBJTstq5Bv-PMcLsHgdQ508EkyGHCJjfDsbfP9m9O5h8nA_37cZrErJc4xjvvwL0WbN3xKsrZN0Bz5Pv7TBG-YnueNfLygT6Cca9KlxLbY9g8dCcAusAt8e8XVd8rIfBu-G1Z097ou7ofpMwAYelMl0mbyPAqK6JvSFlCHehCJvDxYKbJBwsB1n0PuqxPAKKmhJ98kAG2d_xLvKo_v0g6zqxpm-R3HMbLGDI_z5xo0wz8LHb5DCHPW7_ctO96rTO8env7Z-bf0X"><img src="../examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=rVrrbhs5sv7vpyg4WIy9I2lbkiXbmdkAHluYGCc32M7kLA4OLKq7pOaaampIdiRldhbnIfYJ90kOqsi-SbLsTDY_YskmvyrWvYp8ARfwz0EEK-j3YA6LfKJkDEpOjDBrEEbnWQICYmniXAkDBkUisxkYrefw7__7F7gU4fb1aHTXvnh31b67-OnN6BZwJeYLhZ2DFwcvoNuBy483v4yu4OfR-7eju5u_deAuxSaUtCAgMfn8JQgY86-IpsIxTLVhKlOltQFB_By8AAAYL4VSY9BTGAsTjwGTGdpyOWax0jY32OKvCyENjANj9i_i11wYmc87wsTpGGTmjE7yGG3HYxODxA4xdv3u9vLm-qfRFciMsbpDWNF_c4gxc0YomIh1C6wG6WiDE9kMMwdOg1AKpjo3tMIjE9OWj4Gf0azLxQstM-fl4FKDNtUq-cEfnPbH2mRowC5ElhhUlkgpFJ_Retijf3ZPYN4DFHF6DBNUOpsRA5n2AiaCsTBmTb-xcYpJrhCMXnpleGET-aWRzmEGIgCPrn9-fQfCxBaMcCmSdIWXg1tqsDiXfrPl39lULBAyxMS2IEElJ2iEQ7V-yX8WmVBrKwP2zMgEJpjKLIFxgjY2coLQbv_d6mz8nYVxsDsndTYGI6xDIy2SjEiMMEG3RMxAOgu_jG7uri9Hty0PbfUWe0qsQcAiFZkj80q1ScA6I-QsdSBio60_QikvgwttHP9uKdQDOO2xpQPhYLBius7kCAqzmUs7MGKsB8SFDer1ZGRmZYJemyJGQrBOZAmba4uIeWRacHVz8en63c-kC5lg5mQsFKBk0S_Fmr3OY3sothhiQpi4RYyJbA1ftJ579-t14O71yPtoB8YLsUADFz1QRD4WCxzD9zC2sVAI3Ze9KBrDVK6w4F9kmXasAIYGK78gvH8XvKQApgM6FAk5o4CpETHv4G-DCOYwyaUib-ezErnSAPXcMgcKZ5glYw88lUqxMObCzGTWgZ-0S8GJCelRGIRprtQaEjTyMyYtyLRLpTf4WGdTOcsNeoPzsKCkdcHodMZ2DwuWp1KQChen8PbibnRzffEGcosJHI1jncUGXS0A2RSV8tEkwanIFTltzA5qKvUthHGSTm-P-axEjkgtlIgxIdm63CBcXtyNfn5_8zfyJgepIC0ulMjArucTrVjLy7gFE2FlFmz6Qbo4xezeyuyhBbHOM4emBVMjkxm2wDr9GTvw0ZL_eXshBthTSXIQ6zla0LkDnC_c2ttH39vH6L8_vLm-vL7zsRouL968ab__eHdLWvdBSDvSJ3-WCjswTuQcjEhkbuFHEuR18goszuYUzX7MXgVVsr5paSLFHB0a-JGUfp28GoMTDwg_vb97DTPUc3Rsbwk4XDmYGj33gVwhQ7oU15CJOZ00OOLNWRRF5SE5GCObR0bGCwbdeoGJZ9WCyJ0eg1CUeNZg15lLkczZso5uSEse9ur69u763SVHPThKMMkXSsbCYQKTdSDzvT85R32XSgtIrt-mHSGWWkdGPEPH-MeVNNgiUslWUSVWrectSjDe7eY6QZjkzic5O2Z7YFJoQ-B1wrFg2CFCbkmDtmyK6GCpc5UEPnzsX0qXNqRhl2xT5LjTViHJNcTausKpCmipMOQ3XTgkifoLGt3W06lFx9LRlBFj16IdcUrLcSVip9awTNelYcaUQoxchEz-6f7q-u399bvb66vRGLQpfvP-l9HNm4sPY6oK6oTInixF3_fv_KGlgzkKSvfWm_UVkiOW8oHxF53h2LIcE4yVMBw32E5kNkVjyDnJ5hbasv-2qpxJoYXIH7woDFXGlFoERWfrA83tLxyyJ2uH7Spuk8DJ4VyK8w5c-Ki2BpEktJiZsv_zv2PQ2cGL7RRYmrbNJ047oWBmdL4gdkIpwrmqiKadA44ghzehsrqhP77xtdwh_HYAkGcktPn8AOAFjDn9DqIxx0_oRtHLjQjGkutFEVl4_FBxQ4EQ-lHE1i-KmMagIcyNpyq36RjETFBqqG3jvAOUTqDT6QwiiLU2icyEQzjq98ih29AdRMcduPAFgp4ycjeitWTRxC2uFgY5YQvnEyFxFyw-E4sQqHywnYj4gWo8XeRy1TkI1ccgOgDYTooHALWUeACQaeNSyBcHAKX7UHXHC-vJ7ABCzjlgrtvtdpuqjDx2nJO8EGQG47mgakYoKDNNqy76oOBmpmnzvwNfRYJM_urhcEVQnKZk_JCRXPpRBFsU4Dc4ilrRMRwNoiiqf2LBH9NfwycqnhF-94e4K4q9hcy8_OxLWKJ1sCQ7-0e9DoZ_AIrwl06N0-U9byhPWOOVLOw3OOqeFjz5T4GT3xsgjL0HpN8vQPynEqQ8yESsv7Pgyz0-Shn3QsWfeSdMyvKyKOKbxzE4vbfw9IHOvGQ9O2c7jpQKpe6zp4F6J3Wk8C0cbMRZ4zMahyuu_pdcGGY--LKptwdRaDKEC5mT491Rj0yg1R0yHsXHk7Mo-svwJIpAWkYX0G-ftAccsSmzkWcktZTkk59vErzhhJLUp8IOfBLqoYivtH50cXvnwwUzVDf0cRwvx2DyzHo7ar8Kvtd-5U2u_Qqszl1aZJhF7nzdXrZNgWkHvcGf4Ih3H7dgEP0JjgjB12Wn9DcGOi7qGlLJdxZuPr77gUTHuZzSmZzkDqnjCsAmDgU_3PzZpegEcGQRjtguk4qzvvhvWg2b2KOqPuBWzivYK4R_w3VI7_wsilrnQ9JSUXeRFmsrBpWJPbIi6j2B4U0tGMMejB7Z3_E-PoKB7l7BZ9mHUZfBxopg8lyBUJSxobgR0Ic5CGkVgs5KhyZn95WhkhkXj9wkwxypNPO9nCja8I2IxWD7fTNqdU8GURW1wrffdwHZJ4BOG0Cng9LBK6RYTPEeYW_cOTkpYqD_tJMlfMbZghLC-Xym2AdmnwF22gA73QFmnZg-FVobMTCAlRGxDqb0ZLJ-HthpA-x0B9gyXrLs94Kd18H8t52ZbBnPnwQ7GdTB_LdmRuP6QqywqELvbi54YFOUHFwzUhGVqfUPNMnLzWf8zhYuJTmsUUmDmSUWQn1BiCEcrchBohZ4qwQvLPCWBSwsXrYulhGXtJp_9PyyXtjba3gw885FU8sXtr7BSsrSPdQ7z_h3APCF-yo_wDz8wD8PwxH8iDH5q-FcCxxk3EZa5cEGx5sV50ZQYoIKDkdU2WQxwmuh1CHvpRGBBYopa0h9DVinUQw2i0aQSDVybC2cFVTqJfthfcdpj3YwwR2k4lSqxCDPZqoAwvMvPg4dcMUaKQhdhh3f2aozYHQlP1Oz18T3cSuIq_T9Dfx-XVyfKEVf0K4gq0JctVHe5iHEFEudlPVbRaS7fQgxrcHXiCQy2z4E1g_RCGmPHWIkvvoQHGeah2gY1g5JXcIb2nS4eYjHiSzj--WGpEJsYCJsvAOmUSPySc8x2yKyjLex5xX2-fOw3zaR69js4-yT1on4wcLhLf_c9snwd29iT5jv-wVmUADRjjMKM11fSDBx67QRM9zyyWnT6_d4_A1O0SC5fJ2Q98fT7g5CjaNOp3zS6XTnQafTph2ebtrhcFDjhHHgkzYPhuMC09XTqYw3zxdGgwxdpv9SkMNKjnUXgv_yuw4LxQWUDWwaKrjAdiMhMfZg2zA-8AYfykqjyJ1U0q03on9Vsz8_1u-M_i8aVza1Gxiu9agv5cwrnB-_UdsRphclC5RADfIs1mmYIMS5Y2SXGp3PUj-ppFmDLa--qFYtxyLFXYLP8UQ9j9OwOMyQfRvv-w3GthjrMBP0g7pwL1C0_1qbpVh3YETH4Eussrvzc8S15UGTXmAWOu7wkZSnud-g8kdnEJoPViR1PwBLmbiURgXR5rbQk_pt4QvdeUT7tzG1bIta7wlqoZX228KX51JbblGrb6PAsLmNesD77tBv45aSt3EkqG8rrcrQmtAjhgLD6NwhCZsURLDJ_VzIDBKdTxopP1RrFay3Dj-3sUs_ynMafGmyUw1lkq8YJpmeVew-qsEyK_FW7qdZHYPqpMNH1OGDcrG1oHrCjv64bP22-5Bx_dai0QiqeZzl4qD3ZQ9X65ye3k2dUZHqiwPXSA_2iss3HcX2-m4mfTbYYRs-PJP7WzSfZezd1YYbVQqwRVj2N4KC3P-BxtdkNHrqLcrTtHxVq1D4Yaf1jS2bhu9rY22MTMJtIRftepk1CIMuJpys6LXws4fKQgtuAhdbIuqeVCZFRRdYRbeWhoJaA4hFXaAxTGhLG0ryEHUTr_JLhVWcgFwmNIX9mst0e7tcRudNhrz2vLUzP0UPyda-cag6R7ylAeVrLAYpekcSzaCy-20U2rMJMt8GOX0KZN4A8Xl3i5N-paRzwmuA8J5afp0p8YX-3P6mf9S3yizRS9bSsFZeBEa84ZRaaq4nFZYbnrG-191a39-7_vzr1ve5Znw-P1HLt23PxS_7vGp9b__60Ck8k5_gJdGg5iXDJ9f36uv38j-s5a3n67eR6PbrN9pav19fX7t-uLV-I4o015_0nlxfORSN2LngqnVpLeDXHZO1_xlKNx417CtYL8DKbKawTZ0ErsP1PxeBiRFLCxOacPr3APYHuhK9vbu4vrn_-O7txd3l69HV2D_-mOfKyQDCwL_maP2LjSwJ0-ipNDRBQMNFi3VUSNL1kfNlC6uF3aI3rHUkJ1G04q4hkcbffaHCz8L5CKXktLa9H_H2s6oz6PWiaEX_1cQ3la5N96HfHI9eQDEyCa9CTPHAppj58sMbGvnaFr-U4rXVM4EJ3-4qFKZ84LFIJSPHQinmsqjsufop-wSS4DQ3meS7Rf-0wsctkgBNto9D3xX61-0xD286fAwn8j1tr5Tk-bfgnJ18Kw6fqxedlThPnYuAyEbIFaJOZxA64QqcvGpaBoOWT6_fg4Q_Q-3YnOpWw4pM6Me5h2ySONlDontWoZOXt9i9q7mG7143m_9dVPpbVGpSqoiECeh55Ul0ylWvRuauEPgzwXr9rwVrirgJdlaB9UP7XvbuMvZX5lrvlvS2MhO0Dz4EnNQE7fVao0Q5igYtBaUrtA-Hz4fq9aInob5GXzsobPDaHT5bX9tgw-eA8SSkpjI9FcWUqufnLIMqmFCRsDqvO4M2a5hgFqeHj8J0zzi3RbWovAmDwsls9jiEL8e-GiI8TytfgHA2LWcJ4R0P1wmMSZ9WpxXmKPs1l0aiPSRdlt1xhV-fSnV96jqP6hGK0XbvfYS30MQE3vqP8naLhq7bA2e0y2e4S-GE0rO8euZn-SUsdXZjQhq_LN_SLQxPoPzN98KlZTvIvJQPWooxET1XdmjaLjf-PQK95avu0_1sq3gHV7DxWKIKQ7xaEBg2FfrB4OJw7-aT4Vdsrr9bbMo89HTh0WC3ED1HLBZu1TFua89Pq58BRxw-DuefT8Lz4Qa9fXD8ChO-Am54tgnXwFvGTwD1CqAuZ1FGCg3pH0LpR_8JlJPHeeEnrZu-xyOLQv1n0TdsPm9S_oMHGNRR5n8Q5DT6D4CcPc7JTmH4S-pCD9E3bO41Kden9kgP8JSMpfM3ymXNbOHIoi_E0_AgvHgyfAxbVXztCXGY4BbHj8Jfy1fD5b0q8eGkUxiS-8Lov2PsHnn2yEuoncruJ2s4vDBx-kb4XAWQ0KPDw17UG7ajs3Z36HPy7wf_Dw"><img src="../examples/library.svg" width="270" alt="Public library on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/library.arch">library</a></b><br/>
<sub>A public building on a real sheet:<br/>A2 at 1:200, axes, schedule and legend.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVprchu5Ef7PU3RRP1ZKSO7wTSlrV8mysquK4rhsOa5UKkWCM6AGKwwwC2BEcjeuyiFyhhwsJ0m6geEMH6KsTfiHHBL9daMb_QRP4BLOI1jBIIIMMu6MhlirWBfGcrC5FA7maxDOwj1zHKRQHP79j3-CSzm8ufm-_f7Tm9ubq_abTze3b2_efQ98xbJc8k7jpHECf1IcFix2oM09U8JyS3TLVEsOuWTqAhg4w5QVDlImJQgLbqlhXgiZCHWP65kDmzLDgYHRetGBu5Q3TuDTu_eXN2_BioQjlXWGc9cCphJgaq0Vh4ytwTr8Qij47z5QbJvq3Lbg85VtgRPxA3eQsTgVilsCBgRtnGxgc8ncQpvMA6PwWsk1LNkaWGy0tSRxyivtdOCjpm8Sw5ZC3eMCBlaoe4li96MIsgxyZpxwQqsWzJZTJJ61wBRKIQVSLwop0TIZLEXi0hYshUtBofpnOue4bmYhL1Scctxg4wS8qRjMFtrMQGqdXwAX96mDiWeKbCxtBNXT7flvl7hVJqzkHXinXYoScGk5_KiFos01TsgoKZOP3G6sb7hjQqLiRb7RjuXmUcQcaOdz7VKwTueQcJYAc96aSyalPx93qeEciCUyErY8PqVWbaqXMbMcFtpcEAnA7Get-AzohWtyJhL4FgoVPpQi-MMrLLy9vrq9_HD9tgWKP3IDQi24MTyBhdEZQdZfubZkmA7cOLKhBRW0corsPv75ewSdrx1vi4QrJ2ImyTq6cCDcWQvmhQtq234ZrTOwaLBCcrg3usit9y5vXQa2mDvtmIScG8B9-nM3S7iNjZhzaLd_tFrN9qF5ro2zXjn2r3-b-dOuoZnqJWRFnJYKWkitTdCv4U1_PA1nSQv3STJkHa9oMu1so-iFLkxp9UJhSECvxKM0lzp-8PS0KGUqaeeSxTyhTdsOXDMSQbhv7J7werGw3JU2L73AFhnoRfC5_567OV9ow0G4Fu4rTpm6x2WMfPobCwnPXbqHnWk8s2j3NbGHOZd6iSpHxaraefeb5jZmkjltLMBs8wD__se_IBEGivzviV6qmTcLl_wRf55tNGFTtnDAWZy26PAob9lDpyFO-aPRym5859P7b9--A2aMXnbgT2oTNdrWacPXFDBxIUY1ISXhI_Eesv9Zz60zRewgFiYuJMND_TuYfZ5-vLu8-TD99O6Pl3dXP1y_nfkjkBXSiZLVTwW3uH4PmpRGXrQQhlvAM9SBN-joiiQHrhKLdmOq0iWphytnBLel53OItSwyVZ4iUkG3Bxl4sQvDJNwb4XUzYytuZzAv5nPJLSiW8RZIPM_zdQh4eOC1Qj1bxxzPuHLkRkYv_dGkWMi5glhrkwiF0bDTIK0270IS-oFJ2YRfGhBOeJY1AE5gRoIMo9lFFbm94BhEXSrihyoEplxKGEQRnVMGC7FyhaF8h_7A7plQ1gEj4AWLOUhGOkOLdzqdYVQTEBh0o8jrIdaFTPxOVrnh1nYaAEGwBkDOcLeXPQ8Xs5w3ANACHLoXvQiXKG1cCkXeAEhEZoEVTgOTkhaGsET-2mgASO7gzeVf4BVliojMf1I3zpytq7TIVsKSMIHy-8u7ayQdBNITWJfevEmVDVJBu91uB6WVYFWp0X7RqwGUXEAkrzwgXzluhDbeRIpbi4aBjOHXTFKpY7jj8AucRq3oDE7Poyiqf0L58WnzKZbacvhSY-Xzd3Uwasww2xM0qmOD6R--1LYfYjNWHRfbifV0ya07O5xfTznD3w5tfzn1KNPDcvW8XGTYUjb_EHa5vT_TPYYStXrRkJTkIcLTDkTvGYhxVIcYH5Kifxyi369LEZ5IyxUG6m26PIYzHtV04h8O6oSQjmp3UjN2eDiMFC-nFp5H6nW9is7rT7tQ2ddBTbagJgeh2FdB9Xt1qPC0DWUdWyym9iuwRltYo2hjQQz_FJYBVlhIRi0flVrQG9AbLW7BYEJvIwKAsV9CcES7Lmk9ER2zFgzC73WPpDD4wvBzMCCdwO_36iZKXBxdWtMblhS-M-LWAU_u-YXvM3hVNcHb6_d3P4CwhLk0wjmutkshX4Do_CVFz6bKwyKAoN_fXr5r317_-frW13WUWIWDmCnMPQpFFIoaJFYW46fX0493H27eT99df7w7K2tP3NGD0PbBp0osgpABiknFr49oZeKRwjrKgqghvVQtYAvHDS1y1CggrwTrPGYcpndKgD5MkgaZq0LtPcsh8r1TyF_-9FANLpJXZoqa6oIVP3MYDaMIJJtzCc0_oMDQbUKB7apeLETMD1D2nqLsPUfZf4qy_xzl4CnKwS4lnWRUl--Omu-ZSJp7GqDfvNKiM49NrrLyWTuwQFq4KmcCgRM167XCcotnyGbNT_S-zzf8jpzrGchvDlmveqOaAB7meRF2uEg9n5O_b4V0YrLP4xYXNzdlLjHY3l4dehlPl0DQ9RhP0F1S4LgG_fkKPuuMq2YNehnvI2Z1xBDdn4b84wbwaUS2hTjZRawb-TKOubViLjl8vmrWICurlqVH8w2LH7CWS3WBxtjzK4z2UGcdksITrD_S-g9aZ81yMwc9INbKGS3ruKNjuFdhvUc-4B8h0v8vBedOpJ9pBd9h3nuNUn6Xa_t6Bo494NQFbm_urj9c3m4GDKE9uOeKG-awUy4UqtVPaYowLCNcNrdaFo7GIBkGX8dZcuGnH1ooap1DB0U7QRG-sRBjy8VpW_M11rq-ePfn-QRO1_CK6vSzMGWgjB2mUdRi-YY81dZ14JomSTRPYybxUrbw95C5qilSA1BOEDh2izqdSTghYWpF9uujteC3IOA3lMBbXo4Qr3FcVZOF7FXRi-SVpu-nxFOrsAyBB-dYT1RRf8fMBnNX6EKMRoX-CjMnND9JXiXTjAkFVoqk3NZgWCvyvBR0Imkz1JE0djfisxBtYlOxMwf93jCCAIEKOkTW2yc7Hz9P1t8n646Q3XGywT5ZrzfeJtuloxA8VZ4ylN5oJeoJPV0_2mfnyewuWY_S-Da7yhgUkysKr8VhxQgDBFg_kVVOg4_iuxDZLkQXm5ljENkuBNuDGFVyd7sHIJg_pltxNYSNXNOMGhlYHJYPIAOf2Gho81PBizAjVFzgRA8kZws_-l5ynhMwcRIOaz0pEj7DSGOBSR1mzSFcOMMeubFMwqkfFDgNVhcupSnPGcUrKkhzprgk5MQIrDSJARVzWgofyObcLXmIDTg8ph2AYSSjSxlVawxibRQ3nS0dlgkk7H1Hm72o0uY5KhO3BAaj0xZKmS6eQBkcQpF84fZFmWIY9ZVEaEwmw8rBaYxeOXgwri5cLfbcS_Yzfvt_aCauCuOYUG3iOGfrTeD3JbK_BsGxEkswPoc-AZgNC8j0NTMQqOWPXNFobDM6w5Et9Q8-idQyDG3zaHbZzQCDkAGWQiV66eu-YS0B-GZto9HRdsiEMHnCIrBNbYc_nX6Pu8DY3I0r7FHNUv1DuKEfwdEZtSot34NtwL_s7KV_YC-Tit951VA-vZ2T4FaeSeAY0hIqlal4b1_Dwf_IBGdFB5hQp15X3zh6UmPbS70vvHB5d_y06xxa3xu8bH1_UJOnO9zLvcEhH7nx9za1Gj904T6Qlfd-R0cAjdp1AcYLbuPpphEddEmeWoU6iKIVSkkXCbjuEH2Rh9J5MDhKT0Pc8v4BkFqKhZui3P68YN6qk2PEW5Vps5y6hmEujRv4ztzcj-dxfA7PxqW6h4yChwR6FAbHyP7ovrn8SwvGlVSTKFpNwvBlG2a4D9PzAHWo3hNYtT0yJRwz63IO_-uGOr68L2f3dKa-E8nr8urquyx7PYO8cL5izgWP-TcWrq7f3X243lx8JgLL55hXqdfPcpiUv_NXxniFhZj-vo3FnCps-KlgxnHTdoVRlOxPUVMMYuaY1PcF3mX63Z1tUBdau9xgc0B353hfxDFbJ5THld66ZKCpEHbUi3Y1mhN2kz7omueJqL4ojBJ0w7GMYUtD5WgzKInc0duOPgpVFWHPwWTPw2TlIdoAzZkVaheLWoUSa0Kpoi7Ii6gnw5dRb6lji3X2QuLJ8EniZUwXdbvEbEeDJTH7Gs414v42ceVo1d9GFsK18TL8Vzva3fY_M2BOlXFZZG5a3LIiqd2e0Ohx5kWdlTfKpd_5Xnqr7N3E-y2PDf0wRpUZ3cupje_P_FK6Mbc1wJV33lY59xxBBnOmHsDmTFnojtu9PmSESz20pbKz7uqdLUPEulA4_Tx0_oIlfCXsp2aRzw3l7GNHgU1vMK-nl7IZ_Wo2_pqXWVvGvYTbB7A43_2xwEF3rSShXh7ZtiCWnBn83g-wfW-f50azON1WEuGFfDmkSWLXF3zVlI9qhnLItZGk6Rsujv-esf4vKjbVpiqQyrT8LWbVMAc_XcHrV0B5vTx5m3N39nx0nCO3vemHv7YIZUuVqMeV1CRl80mwevXpwYaE9QzYl31F0mCtV6uiCKG_Y_O33D4EQ1N3dBRn8lU4oVWrxRJJwyanizi9qP57Ut4lhLvQz1ehFV5y_AcBtjRLYTGGmTDY2ZINa8CFV5k_KYOoNvVe9WsTyZTLR6Huy23iiGYLCv8z4AJUj7DGG6xRFK1GZYjcJ92Rotc7f4EUvaNS9HDO-pQUvaNSnL9EF_3jUpwf0UX_mBT94Ut0MTgqRX90RBeDRuOwL43Hk6rn8DFkGEIIEdNxe4LveDKp7r6JdhhFKxpA1WgbAE44yUN0yI3-kccOmjcYhekij1eJ1Ds9_Y1oOl9D89LE6S1T9-F7jIvNXtQbtaNJuzvyXv2l8R8"><img src="../examples/transit-hall.svg" width="270" alt="Station concourse on an A2 sheet at 1:200" /></a><br/>
<b><a href="../examples/transit-hall.arch">transit-hall</a></b><br/>
<sub>A concourse: paid and unpaid sides,<br/>a generated run of gates and kiosks.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrrctvIlf7Ppzgl1dRQWxANggQpanZcpbFkWxVb2qLpOKlUVmwCTaEtsBvpbohkdmdrHiLPsL9TeYQ8yjxJ6pxu3HTxjJPoh00Q3R_63L9zwEM4g_-bhLCDcQgbKMpVLhJgfyqZFuUGfv7pL2AzDq8-zn97cX785uL6_cVi_ntY5-zWZKKA_v1wEI2PBr3D3iFc3HO9t5mQt8Bzw0FI4Du2KXJuXoAwoHliRS4kZzqAFU9YaTiU0oocCIYelTN5W7JbDltmBnAme4fNcYShJatS5Ck-xe4LDjZjFu9cXS9OQVgDCZdW80LwhOP3DJJ9LmSqRcJysEzewV6VvUPYsvwOmFalTANgMqXNXgNrraTFU6zU1gxgkQkDRc5QIK4TYbiBlbIZJKW-57BWemMQoncIUrU0UJ1N8u0pqQiA6QT6u2B_BJqlojQwhz8k2_9Nku0f4Q8b9lnpP-Iqr3L4dPbuHVycv7kI8Ewbkr_Q_F6o0sA915bvwCpC_nV_FkVRkgPLlbxF7Qid5BzUuj7QAM75mpU5Hv2rkDlshFSaZLSllqiHZZJsl8AMpJpt5YDwtFKb6rnMQj_ZBUlbIe6PwavL-auP787m8Prd9fV8AJfWANOcoUo3nJlS8xRdLLH5_isO2i_E_L-jowAkv-e60avlxvA8Z1YoSV_capF-BS76EEs_s4TLZA8523NtoDTcRcdiq4Bcw4BVoDlLQa3X9BxUjZC3A-gPj2CRcedWKaxZwkliWMw_XqBaDYXkh9--geXZsncIidpsmExNAOe_ew3Ls_mrJXBphRXcLTWKnqCVLWXKvMS5UneG0C1P0QJM7uHPSm3QPP3oCJapQIcurVpCwqRUFpKMCYnugkcLEFdYSMWGSyOUNP4ppUxrITOM4T28-eHFoncIcTgMx5Aqbk6BSVjOl5BzlnINBdeQCmOFTCy5DukRlkUm8Ol5fqxKCyzRyjhU9JwyZ7p3SJ4UwDYTOXfZg7KLO6wBY9kevC2N1UzcZhbFZik3sM24pk17WHGMBWemS2NKnuKuswhVMzyNwjBwz1XyHpWrJMtJLIxEw6V1HrNGz68SSJOjMgoiI_7MA9gKm7kQVkbgJlzBdtw8OqWxukxsqVlOXghK5vtBj1LQwVumV6rUcObz4gH8Tw-glJi_NpseuB3DMOwBFAzVexZhXk1NwgreAzAJy7mTrAcglbYZlEUPoDY7sDynhRlPy5yTnk2vB3AIx8fHx2AynuenYDPNn1AtGhBTjHdj_Hj81B_iESb6vFGlzY45MxYSpSXXlO5LLdFFMY2jtJbrVsKaD6MwDEEzm3GNyVbCRlhMCj__9BcCtk0wPczsa5Y4-3DInEIHsMRcVZTW-xkVkso088s3bxeg1g5Xs3ueQ985eZ7jWbGe8BT6kzAMwyA6CcPwCI5fQn-MH4Mxfn0UQMYZOYaTd8uNPSIPTjJC9jVOSCNSErJd8YIqnp2mqTrB9cfFp7P5-QA-bFmBUWlVlXUpGjnhGrbhYLcKuEwLJaQ1cCvueeXYCbvntd6lsZylgx542dLvyd7Ad5ZroVDVIrmT3BgYhSF5H0A_DMIj98lpoHvl9EHfUAlsK6XK_M6cybbCc3fpKsmVQUF-bDkhHf1BbT8lb1uXeV75iUvvWwWGb0SVOlwufeSEmhiDRP3h85bHTB7jabHAox8UpS6U4aeYB3FB6gkAWl8La7lEV6VaslUEmrH8nhu0ijDezHDHeWEAM_EeeHrLvzWVAu6FEaucmJN1IaETPoAfkGowl60INfX1mcxcO8UDR6RQOn7pHA0_oK_h_y7gj1_SiqDjJUvM3Xz5YmmwIC3R_xikSmmUXlgqWwbYLaZXC4u3ZwtIBfE6JclZW3Fhmbzl0hIus67QKaW3bH8UVFUb1SUsbFWZU85lTTLRpRx0EoS3JwaIQ0ZHr9xXldoQmcAk6CQmL4f-yLlfRI5GsqpaXMyn1tERv9XpprN14uLWqEoVzAIXlHIoqbpza85ywiS0FVZCpvf0wERJyRNMKuiFBRb1dmxVtblg2grPParwiprwGlHADMfdMCK5_LeVF-HCZkV734MV7WB6VHmeydlf_muJVVvlRj4vGka5N00_GrYM9ePTSNGXoEazFkCVdr4EZ758sFHYRvJXNdIXtjpJnpfpF2XArR1pfv1TJ-7MbvfkkfBrtef6ZvtFnLa4_mocPoPEv4Q07iCNu0iN6xG5-Ge87RGZ6BDXuo4XmWh45PWVy0SCbbjlGpmdVuVt1q74SJxdqhaeJxI4Ub4tw9IpLEV2zSFd1EussT6XYX7YCsNhxQfwXt1XXOPq7P2FL_IuM5Y2U_pbA5_VyuXNRG0KkXPtybrmuUqYRVrV8G1MYht255_rmGfOVjynROWpj2_0sHUVEmnUDxfvrj-1BUW67EjpknbDzz_9PzC7PAW2UljXrGO-yzlmjIqxE3yf-rmmefKIZVFlZaaTbw1shGMbpK6cW8uRnmUsX2MdgEILiT2IQkmFxbRIEjVp8Ua3O0WXkR8nMyc8HFwnnEmYu60H7S1T2lJi5545cls_iPO1b-CsYzF1R4esHSiudhSI1WPmuOUNy3Ou9we4kHBzgVZuId_xvGiQ69D-EvJvcMtrpbmxBPwMsitcFXKdb2rkISplh-EPFfJrkVtNnYoDdsglTmTsvi6yWKJcPFZFnvin2vL0CYa-Vnmutg3LbsY6zNVCnmCtds2ZrmIjyZnYwDrHWnr9cfHh8vyiw3JPHSBbIzPyW1TpmQSmls3f_-Z8foURPZzMBnAGS9JNofL9rZJ122oxSLDfZDpZEtvyvaup-gLk2RXzZsg6kMfgZEVg8-3TBdNJ4BnbdBD__a8BGMmKgqcg5JbpilRg0wWbDTVgRF7gUppEixUtbOvJgXKG56TmDrjGIF5r5shUKbE37g8nJwMSuBpXECqGy8CRopr7EEiSi8K0wm8ttLEQwYakxmzgZ0bYiPuAO4RLCyxHEsnuuNvtjFP189xTazISw37ZbjmXfnZRbioKSbXBoEvunG-7DCdTIN9HDauCy0e8rRonCNN856Y9aLDWMehhreRJTY03GdmlNlxjIN8euXxoxaZ-mkuvXFoc0zTjC01zkCoeKKXjHKFOot6OKxQLBwfb-mSBrwcCSZRSeHutfH1AtX1WQvK0neMa63m_fZYPdat7dDJrXUzpIqp4YT-a0BcTdxdXBVO_NB7ihb8zHoVhcDJyF6NJGAazob-glNl0X_0IYYJhOHP38VDBcFhd0eqoczUO21fxsL1vMnyIO-089yRsHWl4MmuddjibtgSJwnFLRtJQRwXRcNzSUITAtfIqvXbag_5oOGxfRcN6nyfho2ELdzRunotXs9aZRvG0dd7RZNySZTRt5PS403FLD6PpSa2nmsDHnSuvX38Vzdr7yC4d3LDzXM_H3Jm8yd1xvTM4SbybOCGn4QMdePdyKiLnq7T3BAP9AjV_PCOAfjw7afHG6hOt9MXsVRU47RofxbO6xvtGH1NpK96IszZls01PXUHGzztSUPWkC2k1kwmH17j3wJdNJDv7FrDJVNHmEB60qfSPgT9kqjhoj48JWK3XIuHtFMHWrezQZdRdPcUztOdo6AwTn9C9kb93gpYZjce1xuMpfRM7_4wndDVxERKPae_UX41ivDrxuGTw0cxZPA7pHnm5wx2TpUcz53GdKU-nA-hYk635gZM_FTgTbTUHWDBonvwvNweESaOUquPGbt6AEXVXQMV5AEsl6zXMwn8WiX25pLGKaQYtqz3MP14RaM7lrc2obWCSuu5ESavFqrRUZQ1951fN_8Nm3LIA3xQ5HpIpnVbD-ij-hogI4VYTTz8FxGm6q1E168aTfEuDbm2rIcvF2YeFm2A4itAZFjlaVkpTj4fqaVA1HiKaF7QOg6CduYibVLP12s1DhLSu5Wgoppu0TONvqjmWzYh90FY_iXVjJf8KpA7oI6yPDjb9Pr3Ryt4gQWrbA4-1FanNaGD4aLmBVJU4Revumta7MBh7dYXf4HsNXkW5qEfx_gWcm7QG9Cog_qYyBc1DcW5XyuZNFFrFMUlbmaTpJOtRUXfMT5pBK37nWlUmyNx-In1MQ-CtkKnaGoJ2jANd1kOhZwlreL4mUik0FExis0iv91pzuIqkCQ2f2WblZo4s76qblOHV1yRWH79ee-MwdBHghsI0KQSBadYdFJG2N0wnQzyjW8QsjKcd_T9aHXVWx-GD1Ydwpaqxt3sXhczZiuQOY85nCTeKa15RLXMh7RI0L5RGNskSckPXwH66uf6vi6vLqzc3V9eLm_PL9xdXHy6vry7Oj_xLacdI656bpxjzGZMpxZUhAu9ea_r84bi5T1gBqRm5Lv3vzeUD1nXL1H731XptuAWcMaKJjGXWcUYnPxmyfplB78fqaTP2PbUvNcMB75Eucl-9vZ6fQ384m00HkxPsTpCk-oGm8ymU4wD1fFC3WxgPqUhchlJb6UYF_U-op5vFxe8WN-8vP7w_W7x6e_QdHESDcHPgh8PDWRweR2EcBgTuvD9TeepfmVOepZRXdQ3U_zb-Sr0W3lvjs9u9BlqbRqep2GC9G45ng3EUjKLxaDoYnRwdv-zHs-loOAinwSiMo8kgio-g0i9YvrP-rDVGPB3PBnEcjKbDSTQYRoThP2N1pLvPYngXxkgZ-nce3moYOK0o6a6Nv2JtzfV-xdpJezry9Poe1LEi0u_VDRGXFhmKn4x0PzV8uJm4CW4e__Jm_nCz42JNkhm1k8y4PnZrWvsQgQY3Tvdxwy4fyt2aHj8EoPkMnX_26wCiFjFZC0sDxX_L3PIHLpOMG9DVmLBVuKgfx_e9fypZqmn8mOT4ltvXooTpVOAraaIzLrdF8TcvsOBR2X5R1d-6Uz3CxIHRxC2k3NxhQTFVZ0uG6b4WIkPfciQysOZbsGyVY499xwvreEN1Fj9TaSZFPmVXnbFxowVClUxr_HlND2CNvxahlw4r1IRzi_E4DoNZHCORdlOtKAx34zjEk9bjwWd2R3H8L-8enozjqjX4mt3u5L-8u7Od7OAbE-qaPXev53m7k6Z5WDS2O0BMslkHDmuk9nDjiOCiGi4Ow12Ms0GtqNrMwqdB_JiRZKLecRQ1Z5qG4W6KIPXWzl7yERddo4dbMUXt8J9aHlxMkqCrPYcz_TfhuPPE8T-F43RCODSSGZ00OBM3dAWodzb54uFPPtw47cNifkY_LHjqBx_wTLY486-dM0Yvq1Nmyw0V6Gq0lTCt8RdAUkn-HUWdn5UL147UVAFjj35_4l4y7lCusPlYDfH8JXXxzSWVG7rcN_voYxR17oy6C8dh9frxx94_AA"><img src="../examples/aquarium.svg" width="270" alt="Aquarium with a curved drum on an A2 sheet" /></a><br/>
<b><a href="../examples/aquarium.arch">aquarium</a></b><br/>
<sub>True arcs, a circular room, and exact<br/>πR² areas — never faceted at any zoom.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVnrbhpLEv7PU5RsaWWfABkuA9g6WcnxyTqRclnFPorOr7iZaZhe93SPunsMnCirfYh9wn2SVVX3wIzB2CSHHwiGqq8uXVVdVRzDBfy7F0WwhFEEOVih5pJ3JL_nEvLS8jKH__3nv-AyDu8vPl-96bz-_d373959vIKZZHObiaLbOm4dw5eMOXCZsMCXLC8kB2Fhps058HtuVi4Tag5cWg5CVST2JRIxSBdcSqHmbVhk3HASpmXaOoYjYgYr_uSedGZY4oRWoGdElhq2EGp-BKaUHDJWFFxZcBqk1ndgxDxzXbhwgCbmIBykmtvWMSjtyC6jdQ6STbm0kOicgy4d5NwZbsExKbtwrb1ZhWQKUp5Ihr8xuH775s3NOdkOULCCG7jogWQqtQkrOEBdP1ReWFvyFLQCBoYzCZNhD5YQnw0hz8FmnDvCsgmTHHrn_SiC9WuRiSSDnN1x6x0KTCntGPmCwUwseerd9Okj3Ly9uPH6EeDO18mgG6PcmgPaEPlnCyYlSKG4bUOPnuTMzIWyp2TuRQ-YCwoKS2YmWt1zhcowCVevX95AYbjlKig40wYYFOVUigSmpZAp-oSOUFhS-7x1TEC1UJxp7QojlPNORZkx_TrAs8yRXag7WAiXeStQCmK4zHDeOoZU5FxZlJ9kTCgLTKWeQDjJYSp1cteF34wu6OktOf6WDF-T0rEAK53uzISzQcsZ-sahBr3zOIKX0DtHxV8Gp7ykxxE4zAlko1DD0G57UJaHA-62KKyOLoVbwQdKtyP41gIoFbLleQtgbkSKfmntCrNWI15aAEobl0FZtADtt6Q6MClbLYBj6HQ6HbRJSngB1pkycaXh9PjQVwt8nIj0lQfkS8eNoDMQyZ3i1tJJfYOTqB2dwkkvwlf94wjfT_H38CmR2nL47nW9QU8VQvFz0IrDCHJItDEiDcc8K6WEhUhdVhWDKrLaPig2hYfwdMGVD7sZCNeFd86CW2iYsQQTuqo7Sq7IMB_YcyYlN4JbUJyn3brRqNpXBQUzTlCUb-zuV3b3R97CYHD4-n0Lxu6HGfQbMOFr8NNHOnGjF5CKe5FyY-FkrTYFnPJRx829SDhQPaJizYEz64Cr9HRt2R49SHs6P__poTV7WON-xeo_HcA6nlSs_tPBrL1hw3nha3DetS73OY8rZ5hK8GaR0ifvl0uwjiV36xKRsBl_lv8G9cML30LgP8ea4aTO7r8dwD5uSB_vlC7SV4vk6wJr2z6kUQNpdKAikwb7ZPSoIov9aeEFDxs4w_4OnPw5OHEDJ25kGFVNtU6zzk-8WuDvKpG-mtM16osj3dwU2Ut69zcyHF1RKK6gd1Rn7BPjOh2fYu43mAfEvE7Ip5gHdWbrtOHEv85Kz49oS8qsiv8aSY-gtNwCsrE5rwHp2QxL0QYpZGUdrV9D-0T0NuB57trZuOqq-KvOxoP54wkFh1TzNWRZd9SlVokuja2MTYRJSun7nuzBxbsuNn9VCA2DjiGbSEcqLMv-ZMdhDuuHicoRe6MueTMnWxBvqkr4lkkZTMXquPJG1nSKCbRRrWrHulOvuK6XxK6OImNLr9EWwns9na62PV-DWyQLjzbaspIcRe8V3JdL-KJzrgLiImkA5TWg4ZNAH3bDYMPnakDxFlDdvn8idYApnZDCrWpYePUQ1GTbuOGWry7ZrArSVGArVAvN0BzZc8ql0KkbXbqDUorwPjCc8KpwOfFBP2MJS_kpCOU0iVhfqDi-LETq23abaZlCIKEkxIs11dpAqsup9NYOzmp3hu8AqVhYam106Vqw7vY29ME7nh69482_Wnd4hrOUusNNOXGZ0eU8g4RZHN2Ck9o0PqJWtvtAVG9Q61G8KHyyU6GnqEbxc6h68ZZxO6jis-dQjQfPoTob7HHnda3LPA-V2ja9GoYguksqB1Pr7Ynb1Fnh-KMXijDXk0XVwlJAaN_W-nvZx9c6WCgntp3c8zPSA5Jw9-wjafxci7P1oLLuCl-AT3BKUfTa2naJpaqhYShJ4z3iQ7F5miTesnOT3HPJ_kSNO52fvHcWQqV6UQv0ZgA0CAZnTxD48N5DELVJyINIbBAMR3sJqrEreg7VMH4Y0E2qeKvobBPFZ7uJaj1ANXSfh9lyBYmWZa5gylYWDim0_9ClCcwWcDHgUyHAtqsEmbIVNr0m7RRaKIcDjhFpxypclvnJT3IHry_-gFcwGZNJuEoRuKmLut0BLSQ80TKCVyDgF98x0uOgPVq_jOAF4rQJZnNnY7-0k7YPvxxET7S98fAw8N0M39e5i0uAlPMi9GebkT9hxqDvuDBYi-iEug-80w_eqUn3jcAL8hN9bsOwFz2l8w6u-GmueFjj6j9X1g6u3bLqA5BlSjhmVrhsxAC2P7o2OoZbNseFnPND2q8i_fstlk28KThLMigETzi8_gMuP328vvn8--XNu08fz6tLwnIHpsR9ntRqTls2Ql2sZ_SUFy6jfa4N6x5Lax7_q6n2psJCyo245ynMjM7DktViMyLC1tFvjhSc3AoFv2JRR1VFcufXQ0h76i8sBglzTOo5LnmDi2hpZEFpuEXH3tI2meEE4HFn8OXS-h2q4ZVtfluoNCRam1Qo5jh1HNgyzTqb8ZUZ4bKcO5F4BZQm0Ep0wrALS6EsYCY1c3RlGXQD7aP99Uo-o5AujRLEt0igcTp-Dg9uxyKIgb9IFs9nwsJ5MNPkEUlTZoVq8lUrtMA5Pot-lHUyqLE-oWu-yyv585k2XjmAafKIpB2mNbw5iH6Mb1zj21QCGjtmwnXwz5Kf6Sc2iiS6VI6bvadzRhVyMwhOatsGbnDZe4S6onYNbMeqwcE3c-Gi92MS1jp8q5BukPgpHN8BH4KzcZ7hCS-o_PxkM7ZRLOX2DnzT5VvzSXOUr3vq81o8cpGCYYCvHUbGhO8tB8MB4p3113hxFC0xCKmIEvxTEN5XUbwFsYtvMx0Ph9TW1nw8jqLluMZXa3BDJ2W5r3N_8ziH9rwE-ElxmHKVZFRU8Z8HrxM2WJUcLNC2YMbyDpd8zpTzIyHPC-d_veOFg0RyZkDPCLdqxaqGjU31PW-W3iAWm4GzWt-6OcfgtXnvEZ_1BxXbKTR9toNtI20Y75XWf-yEzvZK6z8ibdzbK23wiLRxvFfa4BFpfR9Gj0kbPuZJP5rtiL4dbBtp1Pk3grYhLd7ryUelxRjq_k_Lb1AY_S-euAf_GeL_zOrrdAVHFybJ3jP8SzzFBD3qR_1RJxp3-qMj-N763vo_"><img src="../examples/museum.svg" width="270" alt="City Museum" /></a><br/>
<b><a href="../examples/museum.arch">museum</a></b><br/>
<sub>The largest sheet in the corpus:<br/>A1 at 1:200, galleries, reception and cafe.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVbBbhs3EL3rKx5kFJZQSeDKli27SAGjMQIDqm20AYqeLGp3pGVMkVuSa0kJAuQjCvQPei566T39k3xJMeRKVpq6SFFdtCtxHt8M37zhAW6t3iyskRrO2qVH5yEbDI-655CYa2sdVqX1BF_JnDykIxgb4CgP0iw0-UHroHWAKQejSljorHubLj68-3WKhXrgsAgOaUDrSqtchR7UMj3pTT_X1lMBp8wCyvhAsoCdM6wMU3yJqVevaTrAy5WFL2WVELcUkEvDnGhdOfKJY-HkyqAkR-eRH_D-Dyyk1uQ2-PDuZ6Yy6WHlZFXxrqEkkAlOmpxQSq1hDQJvpwryA1yFiCvRyY6GWL7_vQvlOSpiA7SWeYAvLWmZU1pq5xGWs-rFoqngkQ3x5y_IjrHEzNam4M1ndj3YctR2NtsAiSOCkxW9tqrowduINquVjkGl9JxErEABb-tQ9lfkA-YylwUN8LIkvLLKhIbiiquBUMrtEiyJQkwihWPFeSuPY_H-tx5WpcpLfl1xCK-K_9s6aGXo0DewSxUcH0HVFMQR5tYlVVw-kNuEkumS9sQrrCuUkW5zvkP0vfhYWOs4owLTQi09ZB3sFIYUY-Le2BWMda0D5HKbRqMq5bfCk3rQqrQ0aL9ojnrSxpsWUBuu_XLZAhZOFciEaAGVrMjh4ghamsLnsqIWeJNQoq5aYFpLAouKTJBBWdMCduQgteZFKmjCG1TOvqI8oN00VGqndlLi3WyD9oXLy4k0izbetlpI1aR1IKesQyhVfm9YvkdCRM5AR_REF51sKMT-05kQ_HLCz9lxetk9xVZqAW-3O6jima-UIVTSBcVJ7O2VjQTeNFDjT2H3QWJd7uas7s9ESmzHDVILzWkVz7Z9uLOLf85zn9D4X3KOtdJyRnp37u293VJH7fZ6iuGTxd2HnzBWGzKgMx7yCjHk5bUnH-1jw2kexNbbuYln6cVaES6uX0wun3_arbG9VYCtyHgoE1Kz79o_oqZEkjFwtzCoTOcT20H56DJyrXxfarUwVPRQWh-oiGjb1sNKbgasZMZQxbNIHIWtZ5oYc6dJGTDKvsBKFaEEVwd-lSx6l2XjJHkplfFYkvS1I0htzQLr2M2bmJuxJvo0gsrv9_gzr8bCWFpfReCpViZM4aiyLniuS-eHu5vby-ur6xd31zcv755ffXt5_f3VzfXl8y5qE5TmRcpzc5LxyhoqMNuglKZgI1Q-4jIHXhRnw811KkpFJhr0K7mcIdj03bHzuacA0T1nrxBYLtE4EQ-ErbVzFocJO-cqEjpnUTjZiGWRysALT85H-yfNP7GJ8lQ1yYFjeVMSmkIgR5E5RfBKKsf_xEUrJjCjXNaeIFGR89agkp5FGEpn60UZU9Uk54_0NckHntbRwVi-R9ngdNzLhtmxGGTjbv_rztnpyXgwHPYyMR6dDcbDLrZlQKB1QJv3b-8pRxlD8RiTw7BexFYv3E5g62ci87AvnZUyhV09mopWizL8XXnDHdKRECL1Vb_f72OuQt_WIb78n09E_Mis4WjORU2izEvreJTxnejy7nZy8c3l3e3N5MemA40y1K94vjZrI54hKj66nHTjgdND9DtFfLvgEanS8J55q-tA8Z7Twz1VAbkm6RqBRcjJocdSec_l-6mWhZMmoLMGW1Q_mRY2GMe346iipKhoF4c-XT22YI31HvpubM5Gx3zRifP3sDmmn2rpArl-oXweNTOvnVGBe3tGJi-jA8ath9EvAb6hIRsLsR4xBbPd6YnY8X-O5bkeYmwmRkL0TmKLpdhTIdanQuBzYrk9h-PPjy3I3-Mx3ywTj7GR81iI7Xj4jnKq4mDkqPZTkOyWUeOd4-GjWyTIUVMFOBtkIJx9VJC3rb8A"><img src="../examples/gallery-l.svg" width="270" alt="Gallery L" /></a><br/>
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

<a href="https://playground.archlang.uk/#z=rVrbbhtHEn3nVxSkh9gAKQ9JURcjCaCN6bWxjhXQ8gbZF7I4U-T0qtnN7e4RxQ0C5CP2G_bD8iW7VT03SiKVG19CjqZP1-XU1TmGm5zg7efJx_c3nydjWGhc-lyt4Zef_wMIYWN7c8qctSv-U-jConBG-Zwy2KiQQ8gJNrnVBH67mlsNKQbUdlnQSee4cwzjO3JbsCEnB3SPq7UmyBxuPCAs1H0oHIF1fA8oA2v0XpnlCdzkyoM1BMpDTo5gwS_l8azpHJe3eX628qTvyL-GkCsXtj1SyzyAXcj78mPbC7kjamTL4FaZzHcBU2e9B9QaFuqOOsegTGatg8yuUBkPL-YY8i7cqpDmZF4VQWkVtl0ojdIFre6UWb7KlFFm2QW7WKiUXq2UT1-ewPvACmDn-JEhwaHYJORoAMHndhPxvBW5U1JamSVYw68EMMVqTo7R-K9vP1xfTzrHcDUZX3XB2BDPVOq9BhKzrxWlFO2nPHi7oo38QHCEWuy7sYXOYGm7gCZjlM4xaGVCvGvDV3vc8mHo9cDYEnOhLQbP2oIKHjaodRfmmN6y10JUIeoz15afsg3YsF0gPoiQakKHJhX3p1ZrlZGPnEKzDbnQYIYuzeEOtcowEPR6PjiVhhk4WlsXfOeYSZUGvYXrj2PYoIteMLiiLCruLSjxAltppXzAWzJCJ2fDa5h9P_3u6ubd9Ob6evrxajK5_n4GlgkmxEZ9C6rSp-RAFza5SiPzDd7B0qkMVoS-cOQBA5wmCaxWEHJni2V8rz-QZ51jsGsyotr7ALheEzqOpJxKN7uCIymgC5SVSjILEL4dX336PBm_gQ1uOVKU8YEwY5qzaRc4dypFPsUXRW9GvTUtAkOajJHatDNFtqQMkCF7PVjZu3hXdHGwHGZKE_sIKw1XZAQ1txt-U6MBH-zaw5z4MN2pjA_E4H9rC75KmaWHYJl0mVCGTeJt4VLakYcfr1XKOeG1nAfon8DHa_hw9Zfxh08ncBXDv0o1amks23ymcU56JilL3GYdGw_TnP-YkU-dmtOLlzO2isACMB1ykVh7kpNl4FmjtxDoPrCVA6chvpPfTO2KPCycXdX09icCNziBb68_3cB378ffjD_BN1eTyQ8s96f3_xgziZecSoJECXypsq_hl5__y_BfMsbXM2BO-t0QruVcWBvWTpkALxAWTmVLCeazJAHU1iwromqYb-FslEBGtH4p_s_IqbsS2NmAQQmzI2ylRgxdbyUfhyCpseQ5-5fTTgacBCV1MSxy8ouRqiQE5ZMTZnOLLospi8BJGhbJ0BFsHKMbOWeLwDlPmaUmyNFkvdSu1gVfHvPcSYU6s4uFpzCLyYjjOZKEUvrCwzfjjzeTMWg0mX9oDVeYUq1SH35SwTJaKQ9yMvL0r0J4bheQkgmOfEyr6CG1zpDztUjXQpCcYOGIenVgiUy-5uCHnrcL7AK6VZqjcl1I7WJBBAHnmroQ60X5qxGLVelCRv62KiVQHudQC11wxbILa4XGii-0LcySnFybUapRsvvMq3_TrIadU4qFp-gyY6N9QlUWqkDgLEdaw0wMOYsMmWW0DvksKj88gZt3Y5h8_iu8_wRXH-HzxzfjyYerH6pCx_mShADtsHa2YKXK-CrtVNmtktEaTlcOlScW0d6R07iuMnpVnCBVLi20MJlrkM16C6U1SBUnDyqcwKRY-lp11oUAVxU1yrahK5SMyaQwDPF_krMNa2PktN2hLS64JKZoGqNCrrKMDMcddyHRRqdso8l4XOWCq8kYrv8-nrwbX72pa2ydUqrSGsseZCiNlS2CVoZel-VYPg7NkiC3NgPPFZcNFDUK9o647MgPXDGHOWS68mClnLOueXuOXhnAUME-OlRJKBxJca4MhXicb9VkliGveysskxpnZrFbbfY5CyUOK4JQl8rUEc07J2037PAUDYdZWf9LklhPsEblfM2HmiUPaMEumxcBCqPVbbzQFS3v-cDssHMfMNUkRQiFpd06KLB2qM220l-h1k1jJnYojApfeChMRs6rjLg_xVA1Y7H9zdRiQU6SyJzChsi0bcz9rbTW7cq8ybexwkgZTdEIL1oZK5S3YBoK1HpbZuiTjhw4elu34m81hiP4sQMiqudWA2JjMko6AGtck4OrIXA_4VCFDoBPURP0X8sLxrqQQ7HuAGRq5QGLEGMQtZZ3c8q4M5Ga1-lANIvKvtpM41Gg-0BOWcfqqvTWkPfATc-P8CLpJi_hxcVpIl9-2jktFDp4ujoXv_STi-QRiLfFsyKUBw-gbOg5UaIcreM7528VH4c1uqAkPzXn-_H8KClVkS-js8cy8HjxKzCGLV2GT6iSo9ZTcwimuj5iPCWKYPjDGGctOc6ekIP7hMPqDM_qo_H7k67h9uMwzlkjQvze9pF0Lir7yk21uiPJT6H0ZvxwuQS27D1bAqSdhKMPMtnBK3gjtfoICi4xcd7bQa3ClVErH1eow9MkuWcfVah_iy8fQfUR1BJiB7YkQwMbXd3A9luwn-NgerSDwD5s1I1ergS7EIRBg_AOtW6kqgTLYwZoMOeU9RvMaPJa2bMkuT9NGsy_lBNv_6iNWc7BD2EHFWyLFAI7uNgDO3geNjJHYFscibDJQ1gM-WMLMASzSNYCKvsqmy6cNYE7ljp_YYAzNuVGZSGHyyQBLnMEhtDFcQ68FHwZJqNjdiAjMQWyDF4MgvOrIRlhBzLS5wHk6LyW8uJZSEbYgYy-byBl3D1vpHwekhEeQg4eQY5Of4OUjLALKT5_LOVvgGSXQzWr13QQyDLNY4D-WQ3JcSTVgLdHm_hiLIwYYDhs3jtNkn2vnfHw1oLbfS1WJ7714hBa_drpMDmAFismBhicHUKrXzs9He281gE4hl6vBw9yJD_7XR8BvCnbN-54TD1cvI59ZGt6qpvUOGTFWSJOEGUHiaFqFQW4bNTQSRctK4zd9Zv0n15Z0zTAremCG0aeWBzGzWLshk8Eutzw6fb2oFxPyIAVZ4xq8mK4an9UNoBNE5yrTFpYwRXFyjaxPYLwrbKClc0pW6v-cI4bcIqLKTnmuPMkuR9wOCnTJIkGINxNuWMsAdp7ioqZcTDgOrsPg0Wd6pYQQ66_Q5EiCiGlZpQkcQtBzOE9WNHN09LNAV5cJkn3vKVQX6r0XlmqcbuRRYTp10n_MknuL0a1JJd7lSrMtBquBah_OUq6_VGtFMfB_XnyPJIM7m0fcWh2W-bhonn2QKNjuCqn_BSdU-R5ndRaXzdbIWtgXbi19XF6aug0r4dXwdvZQlW7Mgy8CV2VW-C4L-LtcLks2t0SSWgsMG1IekvbuPKRvMnD93caU94XbWWtw9vxWyppbE21dy6n310qR23bVB4l3eEg2TV4fz-V40alRR3mfnc4bOp9n2NhP48dZgqDdU_FguTVMhQktTYQdS4sO7vXzSbNFaa1UWptqGJoCfbTybAdEYVs458P0REXkGiqQZtSTW_ZoJbPpl6Z28OoUpb24sTtA_wK6c4vD-FIYp7KeuM5nOEhnEz5fMNbFPfHcMpF69N6xabvUWJ8CqdYr8lNqz3KQZyLQzgrlTq7wdLWh3AGB_0eN4ztMBtdJEmXo6KMEu5q7i8fYtQkL-eM313on-R447E9ylWRV0d_2Zq2HO-2NcIhiFGyF0JjYTK3jTHxAEKa6cpTw70QGwzkpjnxfw5BcAFrQdTWrecl-BOtm9lirkmG8aeyWs2cy34tVdmmNxiGO5_YZx3EOL8cjP4oRj8ZnI_2YGzQZc7O6bGTy1a_HQV7MO7QMIOfIEq5r6gFOd8Pkjny_sks8wBkOBjtgDzy9eDP9HV1-ZPaYZP9BpdtqQa7qpG_3YvB-O3M19Sb8yoqHgHGf8iYxsZMOqDTUdK9aHJO1QE9aKUeAc2tvfU56cUzkg37O7I0JmcL9P74Z7cE5nYjTeIT1m5SRlVsytGypZNs5A_n9PO6Njw6Xi74f-_xTfp8hbscJPuFD3ko5g-Px7mxuv10v-4qo_DM7Rejnds7AEEFTfAjrJ39J6Xh8R5cZq7pfAtHVy7NPyDv7uT_HzgaJIOzXnLRG5wdwU-dnzr_Aw">
<img src="../examples/furnished-flat.svg" alt="A furnished two-bedroom flat — twenty-nine drawn furniture symbols across five room domains" width="440" />
</a>

<b><a href="../examples/furnished-flat.arch">furnished-flat</a></b>

</div>

**Two more, drawn on a smaller sheet** — the same language, laid out to a fixed scale inside a
titled A3 border rather than sized to its own drawing:

<table>
<tr>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVvbchs5kn3nV2RQD7YiSG6REm1ZXu-G2lZ3K8ZjdUjyendeRLAqyUILLFQDKNGcjo6Yj5hv2A-bL9nNTNSNknzZWb6IF-BU3pA3pA7gDKYvJkfwGabTyQlswOtibXDsg3W4g9xWHmGbW4_grN14cLpYgyrAllhAaisXdsplk8HB4ABucmy_Au0h5LzZIJRWFwHsir8qjSpGoIqMP6208wFCTsDBQlVk6HygX9XSVmFwADoImApwcQMX1_Dh8gbO4Ory8s8T-GBlq_aQYWqUwwxUgOfzJElGR_MkORw_n07pw8skSQ5PBW1wwM9m2ujNstImizBbp8qSUJytimwkrAbL6_zdTihPlTG8PoCCBclmAVsd8sEBfa48-gVsbWUyKKsAsylsZsT-FlXI0YEuIuDKWOvApzlmlcEJfCIusUiN9egj52pwEPUCIXeIY4_rDRYBSuWCDtoWI1hsb1n0CyEP79HtokwJ0aHKfCN8-Mff_k4fCDc-eQSLDH3q9BKfH06CDcr4xYh3pNqllVH0HCY3G6-0MYzh9aY0O_CIHgobmSEGMVrEz-fw49nbiw8_wdXH9-cTOHtoID5XJQqVS4fqTr4tlL5H2KodSU0VfotkeYMDGG5zneb8S2aRFpPKdJHZLRhr7_59OIEbdYeNRG63kY-4yBbCVU3HMzKGT-fXN7BVxkzghiiht2wL6BuzbXaMwFtQ4CoT6U7tpmTD6zwmGgN9s9FZZrCGaUxNzCPlJwV-0nilUl2sJ3DBei9sOOUta2UMut0zHyXM9hv5YAq9ziJ-TXt9uth4laY99Q5UPjALHWpJcgR6fnZ9M4Ezl-bvFR90Ejzb4XIHpbNLItwWKA8JuU7vCvQe7GoFqNIcViptOBVslq_dFpBbojSaLtOn7sRAURgoLDsZsGlalRr9CETX2gN-VmkgBlSrBjpqRSZfemPpyK5UqjIEZfQdTuAKVcakq_SO9XHKRgmgXJpDbe6EvSkN-n9pkMfs9ya8bDz-1dsCxmOPBtMQmfKMRI_vmBk4LK0LHhZDUeTwFIYk7eGiPaC3-Pg60uNwQadqcCCiJJ2QfM7eXl1eX--bYCOaLenc2w2SWthxsosml4obPppyFv9y-eH8egKLv9I6o-9p1e_wj7_9N_xB5PHXpdP3KmDzvXDIP3l09zrt_LR2tiqjF2G1-aACknK9uLetLtaejjzvz5WHv5xfXcIa7QaD252Kk2q3gS7YDBx6a-6RzIbVbnagPOhoU-ycHWzRIWRoMCCdR7Uh4ViX6UIFshz-Rmd-BMtdwLHOsAg6VWZwAJlTWz5lf8bNEp3PdUlyfHf-9v3Z1fm7ERREGOhihY4O9crZDWzJqdGhJ05zoqHwFBT8_9qX6KyjkJ3YdHStsERjt5CqAlLl3I7MtVqyiwVmpfHShQW1sRVHysFBYwCiy5puMgKTQa7uSQBO32M2gUXfpPeNljTgF-CsMXXoUw6Vh6p8DYvxuKv8RQwWfMrluIMOno5wG-ajRxKvgvDL5fv_-unyA0tnRH5LAhU4TIOiwOVPQcFH0V595ttIYAuSH4pbqkIuIUz5MIFPTodALszXkJyGkMNkMRTIbpd-IVdHJgdLDFtEwiw1puhrfxStxDmdWdcmII2eBNFoH9jNyLoIHvQGPTlmkl-KRXBWk78xhqx9jx8KjcRuL8JJFqXu0al1nRCR-KrAVt_YUXTMRi2RQ1BpVIoZ-d-cKI4Pi3JyG9HJmfEWyERPYWFwFcZ2FQ-vWtp7jBEwbC04lFCuDGSa9KNtwcHbcmISnSFQBvN6cAALbzQ5lAVk1jrfPweWT4Gtc5lWAM8VGFQxHnl2BPAqSWCzYdfASdJ0Ll90TCnuiixu1e7wdXTxCIvSpncYhA5YSZ4hKiVLtsVkwKnN8G1Dxc_kxYfw-wCgKsiEN5sBwAEs1k5nME8Wp20G5elAwDRJJKjFEL9YmcrnC1jpz6FypJSCTwYomEwm84TD3WQAEBEHAKWiM312JGtTVeIAwKfKIExPpwktKawLOVTlACDTGw-qChaUMbww2iKb-QDA4BqLbMB033D6ZgN5JPKyLIDgEEMd2imNmcDCazrG5C84iaA08DUZWKE26GGl75HxOvq3RZv_PfAeAsf5njzt-afDkUTV5-eHI8DfKhWsuyU7ZuDn16PIZDx5ccXhCHxVOO2R18puXxUeQ_zi0yElYLhjbSh4d3X2483Fh58Y9efzj1cX1zcXb1n7inxCiWk4bdMVijGFJUTY2AwNUQFk7qGirKDI6HOmAquMuILfa5Y4jcpxo33JFi7k_yGCH4_HY_A5GkNskwnUvqM1eU6Ixl99DSDmltkbBgT8HNBpNuc6mTpKEvgdniej5BCeT19Q7dK-m9K5OaRf4zsuFWpKb7YWVpUx463OQt4178zCxrbJ7Na6u1M-WEvMdeRGmF7ykVuJCY4YltbpQuyu8absgerFS8x4_QTOlYRBVdcszO8SU0W1JLs2XYidaA-pLYIuKlt5SgfIim21ziWp0ZQulspRRIc0V8UaPShjueyadCS5vSUybouW3440Z7U0j0RwIkb58MdDEP9lkJMuyEkEaU5np7gJHs3qtMmVRzGOxPzXj2CjQ6xVlzbkFG8KdL7PFuN9iaC2yo3vuciFbsVbfzjqEjudJxKnp0lCoVmcq_hWCqmkvr3HAhasGkp6iEK75bSgVAWaPtVrZW638CjZ0zmTTbTUZPP7k0fUQTD4BIxwP511cOTDY0AUrXdfBGIaGmIes41MU27xJYxX9Tl99ZR93emQ5t_AUMvN41YacvgGlBdJx1Llwx4QZtMvA81bicr76HIe4My-QtC0PS3xQ4PUOljxN1JXYNapISj34SJk8W0OtlvhDN_LXwKSVAAkd9HZG3cbF1G_qDYBr_-KQMx-pm9iGhZRhsB5UcRmrINOvsWZmoRlMTm1VrrwITo9fhQ9-1nsK3CtLEma0WvqMZWLCEoukpG0i14ZM_J-VclxmIIcppb6UE3RI60rzpYlt93Y-5hqN6ANCfRjj1Qqj6NX7QooHp3IIrQSqwkWeR3ty-uc9g1FWoKRS4LTBY9niqRfH57H0d7xwggnuwaRp04xIiWGdO36wZnz9jZr103KXndH6nZILSh-bJOirzVFJvxcGp1qKkefc6681R5h8emW-pC3789-OH9_e_nx5vri3fnicF-OdZJbWrNb24J_hb4f_F5XXmM86QQ7njWujeL8SYgZsuRPGP3lPDkU8Xa7fVFnfEh7_YHhL_HN48eKPQuB16TQq3Owkla1P0jeANOo3ZhHPAScSVe3Ze8rgLOvAR4xYNc1CWDyBODRI4AHdX1Vl3pSRBW4bZPr05inV9mOck4ffzE7Ttpt2cmeYDqKsLHghgxLLhWkCSGtXPEgrVcYiTcRB8EHE7N9-5PHM61Q64ePMJ3szqmbdxi_pj2Rabta6RR7tlA3hIbX8c3jtsBBj05Z6IS32hwenPQ_yeohRE8bd-9rT0JgB_OoVSBjzjqYP6iQ097ae9PuPcAqaNMHlID5OODHoI0Ou4bISj7X0onhTOrl8T_5koKVS2jQxSIWMaH9KliIbnpBDrAt781uHFsHwifdjxi9REqnzY5x6R5FdaEWEJRbYxg1-ToZYtPFkTbZ1cV_nL-rrxC4960Nt7GMIdIYOfbwuEqrQm4p000NI9ZBkZJOLwmDlhZ6FajbZh3sbDWBy4J21-URo8amMza-mMqY5iKhNEoXnHCrYrdVu1NYkMSaJgwa84w8_5by87pw54xXZ2-yWyluxGtN2R9KDUUOQp4sBRtV0xjPTRScaP3yQR-Emp_UP0HXNGqVlGc56nUeYK1chkXduQKVhooUB9pzCGdYJU_MpDfCxak0qvwWsQTU7HI61wQQeyNtMUKlh8-tyfocSz_aQGzxkD9qKikV4AVlb1EGJ0kinDDjj6Cs-yhSuDDKvEGZJQ2KI_bbuond04hvEVTLRmF2MD2ac5doS7tiY4-Vx53lWLbcIZZeyihqI3jGTQ0q91oaWPGB1BPRdd7DhUusYvkYzabSkCJ_bFRxJ0p_Tn0TqogY9GSesOXX_pnkUpqKyqVf1WZ5OIoNskUrrPoeUOkN3xaGqBwq9_r6ECcdeWIxSiWlAsxaKZ48FGILIZ6x2YusgpfzBKC7u-s6ojdsIcQX7kEck-qegqAdPQgpdBgi1jwqwJTJEIhX-xCtn-_wwvVJa5SeCZknT6PQjn2I2QOIk-TLELN9iKMHEFNm5mmIIzHtt8pj1vSlJREoq6XRaX2bzjdUtE3clqQPnItT54oOPPkMwwV27SV09sbWiXlTuYjHqo_rvHZZsfjd372fefd3v2h3x2R7b3ss8Gn78WxeR996-7TdLs7kse0Ygy09Oe5_cnsbU-Pl2yl1zdHF6z4fRwi-J6bGa0-dvSnqkobpqZtt_Op4rdb_722OkhRmEmIm7t6X5WObe7kRS7K_-fjpzdjf_OKBFl-xkT-1uZdB8ebj7uYXX9zcy5Z488vZN272ddeBN89IXrET8A0C83WrQQqX2fdvPmrIPuq0M76-eRt9M8T8QLLDb1RVPIO3Jm6encz7m0_2BNba-2QyCTkWj7SavyezrMOsj_Mj3Fzn4RO-fYYMN7bwwXHiOOndaGvP1_aYPTY2QbDN4ARnphyYeYjgde_CW4YPKGjSrd7-esJ4LVectbs5qMucutHeb590ZCEegVmKJHJLuvcIuL78ePOztLKba9rm-iheTsgMAgPEXjYNKGBdeWHP50z2NFynUk1F3XeJs0dc4sPt23Zwad49UN3tvPLR3dipZ2X79-zOogdraX8YDB6441XlCs0XY_9kidMCebtSQO2ZttVUpDlltLYEvo2Tomx2nCSfX3WKVbtSwx5SUEuDPSRqACFVIoxAnHURbmj9cPAURnT0X8aQRpVsG7bpbe2qXVWAowS1V5FIJR8vBl7Dwq5Wni46o41mmoY6ZKqG5kIYlS-2n3l4e_7h5uq8uRQRY-Wbo86AnbWhdJpuDFO76Rh0qoIydl2xNbdMR2pvvS7ummqtUwDVIzwJCKUwPSbvx1Jq87iOSgN1HeLrm_COpl_CS2lCAt334L38Et7K6WyN30MfNZ36eD1ACq6hWsoKjrStDY85aacndYx5-jJJPr_ku-EWZZv2KRKoydKGQFfvQsqLeSIQx48gLJXXBcBDOgQjktKhg6z5eJ4MHhU3o3Dof_xEUo34-QWTcMDZx2fOBOyKCqTNkq66ytJoNuWl2o3i3lgzN3GhHn6j2-uCcbb1tXLdk1DtcISsuvhAXdemKGsMvjkCDmmqFF19Q0wDSDqVCEb3WbkjW5eJl5Cfcop_KsMAKD2G4Sflc3RDeujJbE51Ip-5GHNo9GAivRpnaaAJXiULGv2UM7xRaa4LOrA_nL39E1eQUicSyb4qaYhSopYPyG6ClnTm9dr2B12KBrmDFsOggM20scdoznRGIzOK94wd_lZpntytBxkUtfQY9H46mZ1w_9uguq9HWqnNyGwkcRqIwIqOBmudSvFCbXQeTZTr_0-3P178583Hq_NbYvf25pJ75HK139GO9uB_q5TDsfZ5oyt2bXKBzB2d2E-KLSimtKhnfoveYBTfafR9mUgm5nzHr-bJ6OVR09h7JQZbO-9aw40C9_oTnWGcbpeNKeKbUBk24qRBLb01VYhzPh6cil0aJfzIEfJNFy3mNWS9vW5bHPASZ0434KzEhj1pmMRFDExd4NhwyCmfkXQnXtnT_A_PfnFLrm03bVAVoS-4DP1dLC8pI3jZCI1D3stOyEN_1w-8S2vvUuVjPsIN-7aZyl7iuNOcjYsbsU9P9pwYFmlbqlCxmLTdf8ptemi0eC-Gk5XyS9wgt757bpBbeT1Pxg3fTif8na04oPcty2XOLoXLY7nS7LB5LI3t1rZk9RfY3KNy9jVn_U1UPoA9-j_DNoeBL4L4kNaNioUu4F_JhP9tEfsVbNidmQ-HMtAsvehgeRRpAmeSzBjFEaYZXn0wUKd9h6cHd3fNwHs7ki3-Uvpu_i6eAumDB57HpGtlHt_kAXaeJKe2umJXHGy8Cm0fWtNI2qZqN9bLrcimnQuCX2Tx8JHBkGeeL7iLbAKfuIyT8R3NDb84EKszcXMkXlsFnhd1XMc0Y49LbCIC9czj3L3q8dZMfi1sFaihtQCvdvU_FbTiY75ZONxlkrVQkoPb-0-KJkuQS5tOJSBxilqr_y_XHZR3LTp9_eKZzJmysLJ2Zmpbm1qMFa3znPTF3owbVTzJrihnuDm_uri8euKfKNinx0lgTvnjfxrEvEus_LUkEPygIqWB3Lp3LYP4TpXN_3CI9cX731roMhnEIwDO0ggB9bzFj9OD2__aYEYpgpOKaCnYe3QUEEgdpIigg8F4-1Y6-ysN7j2YheRfOWe6Xe5gWA_Oxe_5ZneWzF6Mk5Px9MWQL7T-GPwP"><img src="../examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=zVjNbhvJEb7zKQriwRJC0kPa8loKfJBXiiVEtoMVHQcIAk9xpsjpVbN70t1DijYWyEPkGfJgeZKgqnuGP7J3HeQSHYThTNfX9f_Xhwso7LLGIkBY26EP1tEGKtt4gn__459gDUHpcK3MAmpyEA8MYO7sEnJNK9I5zLQt7v2o1-_14Y5CUGbhAU0JoSKoNZrhQtsZaiYIuQetVgTvP0zvbi6v5IzgRBKsa72BYIFW5DZyv533-nxseS4_Z43SJfOjPCjvGyrBGvniK6IAGOKPAjWN4AqLKuI_8TCz5YbJ0IB1pTLoNr2-cCifBsKBKj2gI2iM-ntD8PFmen3zDjCCiFK8Fa5zH1C5HGak7RroQfngmZWZDRXMtbXO9_rMDh_2uCQobLw2kB8kBWEAX6EjvpdZW_ObkgqNjnySCufhHPKSfOHUjGA4_Nlbk_f64Ki2LnhQARpTkoN8RS6oAvWosMZQEZQ1Pk9yhYi_EX7myvkQuQRDVHowlq1qQq8PJb-1c1As0NqwObQyAQpNaKKdp9dXcH118-Z6egeXP118hHfvWU9vBnDx7hKm1xdTuLmTU396f_NuOoKLqGfWPlTWqc_WBNRQNGGQFNrrQ16RWlSh1enSrkgYm20C-wGQChW5ziPZGDk94LLW5J9uHXjkV4ucr2o13-vDXGliHazRw4zm1hF_9QSFxsaTjwakcgQfq2SzEkOzhLloR_lHFuj1YTj0pKkIEPn2uWg6R1dUEld853C4UrQGfLAmH8FNtIJTIZABZSBUjgiCIucHYNA5y6KdR5cXnT3xrV5g8kOWiWAxOqK0T3y04zDYoTwMhLSpOWDz1m3_lXiEZ1mWsfPYFTmnShL3mVuXnDFmANTWUPQbhNwrrfOneUVY5uzhCGtlSruGmW1M6SMl-2qtqGBl2zksNH5WZjFqefcj0rRC9sgcLn788cPbD7cX06u7aCO51SezOxQrhwoNLBsdVK03yizYT5Jadr3Xs5di1I14BB9YOOYsnnjiW9H5q7GSIibwIJoYwVvrQ5KH47UiR2If4qMVu5lEKt6Lw8BZlj2djLMMSppjo4P_vbwOaxvVUNpEjdHD5AtyUCWnLdAwD4G0ho1tAGe2CaOeRMfR9CAJH8GXHnAqCh6Wyx7AwqkSTrMewI5LQPvXP_AEseuur7Q8SliFzgdAhR5AjewxF89Aoyl9gTX1AIx1oYKm7gGUaukBm2ABte71ADQF-Aiv4GW25aEPtgnkYK3KUMHxGrWGgkwgp5Uhf5LILuEV_PAVspLqUKUzU3gFkz3p6CGQU9aBwIZKFfeGvE_nry9ub5mkpekn30LloGKCpyIZG8E1JmaHeaN1vJQdOxajeYjCceCM4ejNji9Fe0C8X5WvfMVm7NjqOIIpfIHjbJCdwPHH9P_yhN9cnkChrSf4ZQ-I-fu0hhpdUBwjO1DsbF_gmKUTJHm4PDkAuFehqMh8B8azF1lkKD780hMcZ-2yZYQDJDLv1WcShT6IsTTOSMPRNWp9BJI1-fgevVYriZkAx0zXgZy-zLIHvrEFuZWDCSZS7QElgbZIkd0dsOdbsD_GwwktkUbBpJip8pUUNzZytBnngPFZliVHHbN4XgJUmWC3crXk5ackmTWQjIUBxi87hLN9gB2JthCtTHsYp8--hbEnRx8uILBxUu61fEJyHbqSzDmnM7DzeXRriX5OXE3N5XvyPMsGoIznYA-V8gmyqyCcRkYwrai9tEvx5GOCiGnNg0lFuM2KvkuJo-iQkU6Vr9Y7KuuUfpptdc7K49oirHN1ET4foexorYMZP9tqbTzJsqijeeOMCo0j8HaOXF5bdzRFxfFpa5jrxlesCpJamFw8y7KHl6edP93ZOR4dQLYR5pW5B1ygMlw42CLb2LPzOeMyR3x7a8AD3oJd0W8gTH4VobANZ9Tfwjh7jBGzIWcueeDgGmfZYHzaxdZZlj1MOE5L5WLelwzRuh-5veorRXpbcc-3LZwy294erq8uLq9-2uk5ts2NYEsVi02I8m2tskZv4BgfQUobv7aNLmFGcPXp9urPV7ef3t785WTU5e0JHP1hy-bRbvPzf5vCZxiqXwfIBs_Psg4gPh9gUPk_l4C2SH6lCvCVXQKPx1LOLZQrGi393R4YC5WQIr9bMGmjEthrDFVCYop9CCrH31FQXlMpFOMWJ_4-hJp8X0Vp0SYHaClxvrNbl5H83tTSOp5_ZTQs0DlF22mERz30O1HT2-ndnvh2HgIsCjbcwmFdgSMsI01nHs8vi4rKOI7bJkiqXimUcWo3w0dORnD8Oo4-7Zy4azYZjZa2JK2pjIG4nQ-pBEyISyxp2NQwQ11Ys4ni74-IJwd1Tyz4nYWTzz4mn-yTP5-cfpt8ckiOsbtL8cW3j7vbXx6Qs_M9qkAt_1-tYqdfKVktx9-uV21J5wvF0RI5J-5KLSrJhrVTKyw252kEa8ey5B9SMX1Q0sHGYQSCTcgSXDzwoOGevbK8Y5B5LU11iUTWJ9Q2v-KetibDo9tjqZIitx3U80kn1Yu2mItCDgrWjBccBmIkd7V46CQpf7UiM8rDZKfpvLTNTNPRN4EnLfDMhmCX30DNDlDvlFk8Rl0XXWllmUeRz7a4j1u057EvPmQJvZLRPqa-Xab2BBaIF5xUTw8hfGXX5L6BwQPKLgQX7LPExX9Z3ku77rrL6U5q0dbee_kao0K8jStMTGhcxgE5ATQ-OCxj1nPEmwleI3HWSKj8unNYmXE9bjx4yxuhfGVVKfsMHo4NHJfoOZ05KgKyXeB3cZtWKlxYg9qfJNi00Hr_-m7604cfp3d7eYy9nifrNGmvUd8DFs76uHvScbW5VqESrvg7znSbMCvUFnxT1468j8vFOEFTuaABzKjgfVF7AWucwylujBwqLUuPmzRkv3s_TbCF5chK7XnS8xPZNOJ5nMpNs5yx0WOW55zQbnbk1N4SD0NvZ8LlGtBoisunwz1h1GBcFYolfDMLDgte00b5OZjj2oN7qgSsCVdxgdEuLtqNbmBlQak8LhxR3PE8ulTLNrRdTCZMsbf_69_yrfJjYQ4wR609KDOAdaWKKkrJPCEYCjBXi9j3LslLtYvJifHY2xfSmG46f5_suTsH7K6Xs2R-0KY8ngl2G864QlK-2xrnku66fWJayVnTOoz0guW2HXBp5Jle39xBjYvo_8ZCzk1anhaOEitSWEdthzKXwKrQLCCOQdKXBRU0pZ61dvZnXjc-3hPFksdR9Gm2gaMLV1S3aBbpPQaCo0k2eTHMfhhOXhwJ9i-9_wA"><img src="../examples/two-storey.svg" width="270" alt="Two-storey house" /></a><br/>
<b><a href="../examples/two-storey.arch">two-storey</a></b><br/>
<sub>A void over the ground-floor gallery,<br/>and eaves on the storey above.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=rVrvcuO4kf-up-iy62rsRNJS_jczntu98o6VXddN7JTHW677ZEJkS8SKBHQAaFlJbVUeIs-QB8uTXLobICnPbi53m_nkEYkG-v-vf-AhXMHb6Qm8wOk0gwYaXTg7qWyDYA1Yg1DjM9bwtz__BUKFcH13dz_5z5vb68-Tq9vrycdP86v7q9uPc8AX1WxqnI4OR4dwBUGbHVS29Qja88pFq-tSmxVsK3QI-IxuB42ua91gcPyacqsWS7DP6MbgLeiQFju9qsLoEDa1MhAs-Mpu-UGoHCLUyqxatUJYWtfQChVAOQS1sG2A3yx1-A04FSp09MyAr9QGL_moAKW1DhbKGQD425__CnaDBrLpBQAoqFEtRV6lzMqTUWjb3119nINd8t9bVdegjQ-oSvpNG9BhIFkvbV2y5K0uQwWziyyDsLUk-xnjafkdbYIlkdqB3Ro-iDYrEaUbKGpUDgCO1PHkm6PFMQAfsdQNGq-tgU1b10hiQOTwLje3t_N7OeRSFehZ68dqB0qU5kMqU4KxARRU2qzIBwb_Ax5IOwzgrG3IE7Pp-Tk0pAZO4Sq9SiYaHYLfarMi_2oDS9vW4rjHjx_6J-QMHcBvETfy2Jp6R2dbb9WOz12hRA3Jp-ONDsUFcY2xgXYF8m8tUZmTAp9pi6PjHByG1hkPpiV9rYtxZqyZxOOutSkpukaHkD8-fX68uf3u6e7bzw_3P3x8mF_nUChDlsBnNKA2m3pHxtSB9yIzbZRbd3Egvg9QqAZh6WwzJbG-1mWM2Rw8mtLTO8FulSu7ZW88LJUDNCUc0W-eRNS4DF_xQiiseUYTtCUb5Hz4HFqPfgyOIk3V1qyG0ihkglPP6LyqodQOC1p9PIZtpYsKOO1SMtbKrMlptg3VBJWn_ZxBl4K61s9kZ_b8MHMWqlhzgspbdhmgVmWJThI_T8mT007X91dk3snd7af_msJt9F2DyrcOS1aDLHPJFqT8Qg-U2GSXTr3RoViZ9tsogzVJLp3amhS1LBVrCpobrhhbp0NAIxovsFBUhobhzstJ_arlBdqU2gdtVq32lVrU4su9bCCPb9SGKhNty6ex2oRkMBLJ0e9Hh12FklLHlqIgXln09JuJlY2MJXbjTFOudHYhlZDLZZhoAw4L9H4c05MdwqEYYDZ9Dy9kbEpKkUiWa00p7hkdwhk0J7CsSee81ibkgC8bLIKnY4s00adQdc3HD6zs1rZ_r1kLstpScxhF25LRdMNZsbWUC0HTU89CFORS7XI28-Wgyo0BFcWgqsVcXARjgRuPDrn-pRLR1dXdsKx2VeRdlkHTSLFUsFJ1jTspolyi3nUlKlqWLcW_UmjQf_OumlLB2FgX_BSuDFhXaqPcjl_IU6B6WGDYIppUUqkPkes97GwLW2cDfoA8yqMa7EVZNKWEiKZOGkuyNpRlX_QPcVfcsUETwLXGi5Lk7i6Qor5UynsBMXCWzprQhafsRC-ODtOrxrpQga8wFk8vhzJts0A37NQhdhtuWWMo0elnLMdgkHN_t8GSSt2DWiNciEPsErbWrYPdJC9qOczs5Lx7IZV6z6UulSZ2zC4aYel0ucK-L-2pGHtmQaXIhopClEuOorgtos_vbudwPf908-38_uphDo9X97c3t9-NeUtxBmxat7G-wwCPT3-4evj-6eHu7un26v7-7hFeZh3moUOnjvoY2-EUcuWKCkr0hdMLhMnkR29NF08JAkgy5oV2RVsrTqRFbYs1ljlsdahAwe_nV59_uJ9fQ05R68Oj2t2Y3zc52essy0CtFKVBtA7AWzF3o41u2mbKtSPmRF_hNPdKKVPaFNUHgVHSyC9hRkJe4ETWsdgqZqDi0sV1Dh4_xrxeKK_NnreoAw_AgQG1hyO5ibPcwnpKr1jhDG-x2aByglSeZ9PT02k2lrrIh2xrBB_sZoMlrCwt8LqmlLAm1iwWTE2DyxQp6jjjyGMLXFrOFUXqay-YUdyC5SsEkVTaKk_BG4_MnU5W0KtnbCQugD4o6uZ7HRHpHdOW1CjUVu0uobHPYsmNxgIhWJbKShRUUodprqXlKTkmqe2jSHzWJS1Iofasal2qgNxaKTvNB5a7_xQmEx-cLkIfimwFa3A64j0OHgibf08OOoA_jShGdfAUBgCHkK-cLuE8y6XjzLLsMmKorth3SGJGQLbSxZrROrWKl9A6JFUKLCFf1q2vchabgpgnCrYhO5P6wYRFGPQejqbT6Xl2DIWVUhxwHAOQtuKTSWfyRm1Y7t-BGUOSm9uHu66aTkcAUY0RxJrXbka8YDKZTGIB_G2HkdlP3BN_tNqQsjJCFAGUBx9cW7Bik_1_LPDtCafSaUYNLQEj24ZYe_0HuHgnyUZ1UhvP6JnSQU4hvoGith5LlmjbUGuDMgH5CMw8NDq4aI_YONmIWkadhHlyFeDoZbw7lr7Ce4gLBMDSoFYEKNAEh7wN96iUCFRYjYXGMnICu1xOYn9SBnJreI5RAf59Y_03DJbJ2AKDy69FI3wJ6LR10DuWbPQnOMrG2TEcvc2ywR9Ug47pkfzBdoCfxFnDAYQQLk0LXRhO4VY11JMSwuPeNayAVUuIgk202FFDZaEE9RQlImM8svBSOx-SHY7OT_l4Q722T3SKPgF6xWaiWFwT_xBNhjrE9nVJSdI1aRWnlSnMKcGkLoUKd4BGzKAp-HRdRzg-4dpHQgXSKQF8Sto2JzeVBmqEzmApHn8FIP1GUZvc043GEvhH6mXjk4y9dMIey0S91zKe8B_JGCyNfw-txGlJ6vnXSfZ__sfy7kzsdiVhbjHfGHyNuOHSTJDX2jX_ut_Vcpqx0vyz1qGo0EgCebXzlxFoq_SIh0wyfyp-1L4SHB5OUd0wOphXRhDbZ_m1e2qUZhwjWcIN448IFFAv3KdrtcAaDj6JzK_gMylzwCtm51k2Jph1DD9z-r1dKJB5TQpZ3oXwwN4uCeccgPxjsQsVqoG7KM3-Re6iJJHESLnbsQMDlmGPIejnMH6NpxYBVDwpSNdxBQG3NeJG8OwlvO_A6n-3ygV0k1L7Yg_id2BT0rPbZ4GmqMhncsby6_IpJnOAo5O3XUgLzUMb9SVY1BAE6mVQNF_WuCnk_DCX7jgYWCmKKYEbVIZVJJUiQJVmbMgC9IsOLNeoBn1PVnVDaOKxxH65Nnkyd-QRfmusa1QN1KguB2QAS5WJsZtrIw7oJwAmFiLbFBNDhvbA0-IaLDeMPaaARmc_ePUi-7fhDJiYAMJzRG_U-y4g27GhrAGp0zTwnZP12Q8U1MniMGBmOp7vyzLN5BMPsm_8kKljkm5A4yRn8TBGpmeCK056LFWmtb0WlbwlZWCBlZbwashEHQ34SkfaMRKJoib9oBieZUNaURS1bRik6Vab0m5_baJStWdBdCLzFMdQivy3WSpYg8gfhj5jmoSMvDbrV7IWWDKTGeDotBcWtTrZT6M9WQsGTL2o7dOKyZtYRWdn2VDUq2PtrfRPnNyy8uz0VSq_OsTeSpSKCskU2ZhiL628eLVn7xUx4CVRpQ4KFVRtmfyObYT79QAH_4L7Yiotlx5Dl8cdwIlJxOj2jYeP89uH-3nMJzGnxxVPIVk37DJallRvaeJT9ZpORVBJGlPiQbnnWRs2jqmQwkYGlB90CvFkYGzkEQR_4SZUYF3PSQ85u5JpzK0uEkgO9hnT3LVRMgdH-7_xxLGMCaWyZD5STXXvDRStC0qbvktEWoF797nUK1_rhiAwN_U1E8wqcRhvPJxm52kq6hST45BMAWZM7vY0H4XyAlfapIk3EiJCSrNlIs06rBJb9EGscZQccvqF6Tkgj8ex4xHOMNJOFkiVukuuS1As9CzSBLZsa3GD0EeUIDF8RWVCwL6okN6DoFbSKakALVtnNIOaiCSeaINulhukZR9HEotsYSq4Amv2ZIkJ479_Rtbs7Dz7BVnRqf-8rJPT8ywCqyx7ufhFwYVtDY1w_5vg0-6QVF5Y8BkJzoaCB7U4ESa_HjL9QYbsLjKlM3sr3KMwDx2D2b1FwzJfwkmv7znCyGnEPFKmY8D3J3RvGxSC2FFwUsNb7AhTlBLwjx9TrsYc63l8htB03wBYrnAss20_hp4lkjB2_pQTfE9S8Oi0oeEUsfSA9cJuBTLtxxZTV2J6hgKmqAiG2M2EcwUAmJQQT73Pspf3WbYnYVvsuZzFTBc2BNsMY7vz9Nss6wEE02Q9esXXjMhi9wW1wYggMlayJt42euKN2GaBaB2yFpXGhFplcMyd5acZs9XGwwGzIZGs5Fp-wEGRXnyfEUUdfPSz9nLmNz7e7BjeaH71-YG9JNW-JyAl-scJiH95fdQ5WhzR4dag1shXQKJniUXNDGBOhuTOpeqt2vWT7ES90H1GajCXXYH3u2Zh61hRhU4BHaQu0pWXMqsau433w0P8Q5364uw8G5_MsjQAnZ1L0nZm6mJokL11Gr26OfL_nb2f0KxCtdUe-_uaWJYlM1iveMsoDBZXHwoZelzRrcjwRhFDzw70U_jRwO9jcTF56_iSGJkMODeZoj8THIlT-MGQaYlX6W4lOy9I_3ZIfCW1upN41SIypmfQsEjGz1iyDhPLt9EqcgXUYeN8QZ8ITIQnJrG12tk2SFLQVVV3PUj8BrOXe54UzCiwi5i1MftSnEm6vbBKcZr9Fss4yL7y7xd1P8LAiEbPsr0gmZ3H0t7LNUXFkn9eWjdJ8pBOwk7Pu1PO3mXZC7WjbuaObx-kU87e7R9Tiszg0vWNh0qFohrHqhbzPgXDkCu7iA4e3IfytsKiphvVm9vPN9fzrtj06QcHn3jHgz6ll-QaOJWyvbAvXT0T9IgU1ui4khGjiMRKe7kadQQjdJCBXWbWROzK5SKBG75ESlA_0bq9bcUC0VNnF-d7EXAhlRk626bTw8-25e4Til81JbG875laqqhi7l0T0JWiB9UGm1_KdC_fslAJ9k264KbnjQq6gO--_eoBPErKiW1sGybkpr3PaaYwT9eMd_fX83vY6GLtIxosscP13GOJa-YeJuxI9wXBp_nvHlJa2iW3_sk38eYxIQoZJvweWI9toPvWIKEH6hWOZk66Th7MxNAot9JGoIJcMPJVrHJOc1RBHvAl5EI7bCtbR3o6RSnLnr0j2Ob7DwkSZqBRvf_QRRhPvqqkgy52ycKVZXTbf1JDfOQ4o49qTjqOMvb6C4YH9CrL7ID45Jshe90Dg_2X-1fS-_sv9xFIRxOS4V_ApuXC-icgQoH2ZnjL0DP0TmhRHtFyMl0ORa3iV1sEtbBMMKTUXjULvWoFjVCNH3wstkXlZJRw1i5ln8s4g4y7q0gqQgp8u2jdQkm0LFqzUrXd0jdZJYqIVa3-yCBVhypypEsuBcRdkVAyXNChRr6_Atg4-yMWYe9qix9wVXta7ODgyhXVJ2VW8XdS4uAkO7mYZO8mswv69afRT6P_AQ"><img src="../examples/tiny-house.svg" width="270" alt="Tiny House" /></a><br/>
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
