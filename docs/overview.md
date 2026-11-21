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
/plugin marketplace add ChanMeng666/archlang                # or, inside Claude Code: the skills + the hosted MCP server as one plugin (plugins/archlang)
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

<a href="https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxUVmjZ8k-bBEjbAAFipEWaIOiTl7scaRmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYclfS2rETPVHcmW---eUM8RzW0H5Bylm7QC0NNfIapQ1BzgmfP_2NozMs_vsXoZIBjqTykJ6VsHR27uRinA2zIV7bUGkzR0WOoD2W1uugrSGF4hqVNGqMF1fkrmGXZFiShbRhgWAh4VYGSvsgTUmQtTVzyGwIIxek0Mi6xl5uDZ7w8RlkwJOl9c_yRyNQhJ3pdVg5giNv6yvykHOpjQ8Mza5ZBxlxsiH2cm3whK-fQZqysg6fP_2Tj5B3StEg3z0aQRqFUBEKGarHXaSWUjt2oZZawa4CiutsiNwHp5f5GLnXgfARPjiiAGNdqHCTR3d8RAuNxUyWUrX_l7U0CCtnOLjfxytlrcuGLNXKcHpG8TSvpfc7X-bSKTLjLKIMzts0vrQrTwN8zICV0cFjsciAudMKU4Gd3xBL6UJMmId0hAMhECpdXo7gOTv5rF75Kt9EuZZGMVFIjtJUZGh9XC0zQOmFh1xxXus6A74YjCxDCrNWT5sLdg0ArQM5bR2SdUPeYyIEPmJPjMQj7J1MRTzc9LRJ-vCwdqeXDsdTcQcjhfBhBknvfoyGvsYjkfiydsUnbFOxo32QtI8mrRfx8CUMLtJvwJjsODJpYTKkTtHqqbuo9RVxlyXCXv9BYMU120QtC6oxONdX3MiP8UqHsiIzwMqTR52uL9Mlp5-bAso2JiJ2TszlEgKNVqHC4SGTy7gWtxyiL9H0ZMfqjzJUAxaMxljmthoptIzFjlpq3JZj28YZkt_caaysLmbOmgCu7LYmZcCEI5d4ngkBnnMEQ9LBB-kCfBPnmQkWKXA9xLaufK0Vi0Xk9o6xTzbYB6dCRDFCTbPQA4k-tbRimciA6fFG9XRDizX7hApSGXd4njRznlqNrC9JxXny-c-_EpvY6Xmy7_S8Cjk8cZfH6SQN1SmF_NfbWqepHKELqm0TP3yQi-KHDoW55GjsqlaQegEdIm0hsFikqcp1kb-_-PWXn169eHvx5t3rfNx3u61mW15S6Ht_1nN-h3acK9oo2ySFtic51kfbWE-EuCW3zQmnpJMTD8hNT6cbvOM7cu1MkgEH041dFsuA2coZHQfpzGk1p3YM916flrmdzTwFHHKytdkW2BbCB3vVITwEwT7fA9H26oXX5vIhiIm4F6K0KxPIfZUF56AHMcTbiuBWcSOQBu9e__zizfnz30dQTjYGBc2so1SFmtKDJwO3nlEcaR24cFNVziTXVQQNsqiJXx5caa-L-pplg13CyVCRYxCDKvWkDnHTSatAWkgYjyfECLW-TDTjnpG2HKo9xVVnBMPXkCitdUobGWjciws7tuNwt28UNgS72I_tqk0XmDTsToVYHx7FgtriJH92gErieJNKSgeHQqzPtuPuLYsP-nXC4fkKlfjMt4Qm05bQmRDrmPkO_Dc7k33sdj51eY9TZxzbsaU37TC247iP4GxBHbuI1rILdpmo8a9Hr4sXz8318Q6999IphrvlfmUbcq0Bnis7BhLTjYGN12e3ktCUuOWmDNU4BbAr8JMubEdCrE9uARTSa4O7JNocJB47JI6FWB9N-xhlxbtnfEpTIsflGvuYTKYjdBfX2MfZdPNyTyPKfZ37TXjfIa4JPTxngwwxATvQGRB0qHnhWzr7gcpwZyGNjX1RXGPw3JXVuTTzARQjDSZicrwvTvcPjge4yW6y_wE">
<img src="../examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `archlang compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxUVmjZ8k-bBEjbAAFipEWaIOiTl7scaRmvSIGkvHIDA3nqAYqeoQfoEXqUnKQYclfS2rETPVHcmW---eUM8RzW0H5Bylm7QC0NNfIapQ1BzgmfP_2NozMs_vsXoZIBjqTykJ6VsHR27uRinA2zIV7bUGkzR0WOoD2W1uugrSGF4hqVNGqMF1fkrmGXZFiShbRhgWAh4VYGSvsgTUmQtTVzyGwIIxek0Mi6xl5uDZ7w8RlkwJOl9c_yRyNQhJ3pdVg5giNv6yvykHOpjQ8Mza5ZBxlxsiH2cm3whK-fQZqysg6fP_2Tj5B3StEg3z0aQRqFUBEKGarHXaSWUjt2oZZawa4CiutsiNwHp5f5GLnXgfARPjiiAGNdqHCTR3d8RAuNxUyWUrX_l7U0CCtnOLjfxytlrcuGLNXKcHpG8TSvpfc7X-bSKTLjLKIMzts0vrQrTwN8zICV0cFjsciAudMKU4Gd3xBL6UJMmId0hAMhECpdXo7gOTv5rF75Kt9EuZZGMVFIjtJUZGh9XC0zQOmFh1xxXus6A74YjCxDCrNWT5sLdg0ArQM5bR2SdUPeYyIEPmJPjMQj7J1MRTzc9LRJ-vCwdqeXDsdTcQcjhfBhBknvfoyGvsYjkfiydsUnbFOxo32QtI8mrRfx8CUMLtJvwJjsODJpYTKkTtHqqbuo9RVxlyXCXv9BYMU120QtC6oxONdX3MiP8UqHsiIzwMqTR52uL9Mlp5-bAso2JiJ2TszlEgKNVqHC4SGTy7gWtxyiL9H0ZMfqjzJUAxaMxljmthoptIzFjlpq3JZj28YZkt_caaysLmbOmgCu7LYmZcCEI5d4ngkBnnMEQ9LBB-kCfBPnmQkWKXA9xLaufK0Vi0Xk9o6xTzbYB6dCRDFCTbPQA4k-tbRimciA6fFG9XRDizX7hApSGXd4njRznlqNrC9JxXny-c-_EpvY6Xmy7_S8Cjk8cZfH6SQN1SmF_NfbWqepHKELqm0TP3yQi-KHDoW55GjsqlaQegEdIm0hsFikqcp1kb-_-PWXn169eHvx5t3rfNx3u61mW15S6Ht_1nN-h3acK9oo2ySFtic51kfbWE-EuCW3zQmnpJMTD8hNT6cbvOM7cu1MkgEH041dFsuA2coZHQfpzGk1p3YM916flrmdzTwFHHKytdkW2BbCB3vVITwEwT7fA9H26oXX5vIhiIm4F6K0KxPIfZUF56AHMcTbiuBWcSOQBu9e__zizfnz30dQTjYGBc2so1SFmtKDJwO3nlEcaR24cFNVziTXVQQNsqiJXx5caa-L-pplg13CyVCRYxCDKvWkDnHTSatAWkgYjyfECLW-TDTjnpG2HKo9xVVnBMPXkCitdUobGWjciws7tuNwt28UNgS72I_tqk0XmDTsToVYHx7FgtriJH92gErieJNKSgeHQqzPtuPuLYsP-nXC4fkKlfjMt4Qm05bQmRDrmPkO_Dc7k33sdj51eY9TZxzbsaU37TC247iP4GxBHbuI1rILdpmo8a9Hr4sXz8318Q6999IphrvlfmUbcq0Bnis7BhLTjYGN12e3ktCUuOWmDNU4BbAr8JMubEdCrE9uARTSa4O7JNocJB47JI6FWB9N-xhlxbtnfEpTIsflGvuYTKYjdBfX2MfZdPNyTyPKfZ37TXjfIa4JPTxngwwxATvQGRB0qHnhWzr7gcpwZyGNjX1RXGPw3JXVuTTzARQjDSZicrwvTvcPjge4yW6y_wE)** — it opens the
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
npx -y @chanmeng666/archlang context --section errors      # …or one section of it (about 180 KB in all; the catalog alone is about 75 KB)
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

<a href="https://playground.archlang.uk/#z=vVxdciM3kn7XKTKkB1PbpFSkRImS3Y7ocWu6O6bHdljyeCMmJlhgFUhiVCxwAJQo2eGNOcSeYa-w73uUOclGZgL1xyIlj9vWQzd_qr5KJPI_EzyCu6WE2_ff_PDth5uvbmCeiYVdqjX865__DQLcRg-s00Y-wVJlmVWphAeVZQI2yi1B5CCcE8lSprAQRixkH9xSwjrDbw6OYK6MdQOnVnibVU4bcJouyUS-KMRCgl3qIkvBSnkCNw_SPLmlyhcgMytB5SAfxWqdSXsKyoLO5cER8AWpziVsZJZ9jh_Qd3gJYm-WOqs9Qef0pV1K6U7gtjBzkUgLyoF8lCZRVtrrgyOIrXIyht5cPUhIpVEPMoVEr9bCWsjFStpj-L__hXgt1tLEr2KbiEzGr2LxKC29Xcq0oE8yuZB5GkNPgJEiOzjiZ3uegVMukzDLdHLPiD_qHB-cqQeVL06tNA8qkac2k3KNK92ofGH7YHSWyRSKNbLFLZET4Zlgi5nTTmSeRKP1CtY6e1ronMhIlmI1l0amkGt9D3o-J0ZZV6RPfIswSQwbkWUg0wVi9wTM9EamMBNP5Q1MIiA-3YbX3374T0i1NnCv8tSi4NAeSSBGuqVwsBT4SsNMEiNT6NlMpbjYtU7upTudqbnO0tOZMPkpC9JxH9ZZwfsZ44bLND44glTORZE53FP8xkjr-iBFsoTNUhoJAmaFylJpYENiJRJXiCx7gnXhQLkTEvcYyY0hU7m0KH8bktQH2YeZTERhqyeiROXyAeGMck7mnxOnlpBKmxg1kzAY_N0ik41ca-OYXmQE6PzgCPDWJ-YOMnmj8lRvkPgvkNVfgnDwxVrbL2NerIB4TpRpvcYNsM5I6QZzkRDX1WyGsjzHncedA8bzm57JB5nBMD71r0YxfWydUCaGnhUrCSqFmXZLoCts3-uFmDuGeNCKuNwTkOpilsnBUqrF0sFCrEEjG7qEAMVtTl8vRb6IoYcXSfEgbR9SIzZ52K1ivZaGiEeLwveigulc5i6GVxCvM5FI-Nc__wdWyhht4JHEl9_IFNZCGdBzkLktlJMwE26JdDAL_usswp0sTK5cYSTMxUplSloQidHWwr1yyVLmp17RZjLFe0-Jl17sTp00BmlA2lK1siAKp1HOkS8skRsNK5EXIgO84OTg6OCIxGqdaQdzo3MvBrx7YfFff_Pd3fu-113ItXFLaXJYypWya5JdNLlWQzwTyX0MIk_RKMl_FMJpM0XTG4Mwkm6_ffPnGyBr3LO6cMvjPmyWKlmivG6WT-1tYqssTELKzMgkB54FFpy4Z2SCg7lIRCr7eCl96pnjTRPMGMI6kdxbEJnOF7UVnwRTiptvIddksD9Hg6vz7IltKaTKyMQpnduTA_IXh--Dh_kLephD-OkAoMiVs7BaHQAsjEphGEUHAGSC4c0QbXxqE7GWBwBkj2F4PcYriL9QrA8AGrtI13mjSSs_AGBzfYBfoUz9FDaOMWobxB_8jFcewZtKKr998-G7Tqns43OXdI3OE3kSBNxf2DsGYeEL5AeaAoLtPfafjuGvQfz_FoPKrRO5U8Kx0xKW_G6aGmmtmKEr0Y_QQz7pTc42_BUtDl6BWxopCXgjHczVIyqGPf6c3bQwMneQFM6yDSWqPmMcMlqzJ0BT4JxMwUj0IHmCbpmdOOEyeQneRo_uxTIfneDLuA-xzKcrfnNM8k1SgpaI9N4qFABIdO6MSHBpBBmXTn9VWFmsBuQBT9DwxifwtWbalPXW5cPXtx_e3hB0aU1Q69aFWWsrr1k1CNnLO4niWuaWl-LDBmbHZxZSmSirdN7H6CNx2RNkyqsHUvKZhSWuFKk4OYDaQ6t9RdkFZohKX9P_a2Ecr9ctVXKfS2tRnOEn6EX96Bh6w0lUezG6iPB1eJFk2kr4mWB5Celr-l84f79VP0rAWx_xDsjETGZweMMkHUJhpSXJJIgjiFVupYPhOIr7qKMQz7PCLuN-MFho58holWJz7f0ZCfEKFzwjA0A-nsIGhtbIVAF37z989aeb72CprQuyYZcyy2I4iyJYrWCuDch81Id4M81GUzQrMYyq70hakHx77KFNkedo1Wo2B6UJXTkqBkWC5X54SR4yIFGAMugXirFZar0cI3YuhZEGbZ8kw5foLFOptBy3UUQjDLpMjiIwcJAGFlpacHo9-O7Du_d31w1F8sBB6khsyWQFHn-8-eMdcQ56sXBwOY6iGGYy05tjNr4iPAa9RSCUQ5sMXSxKcq7BboKpZ9p--AptmWUoNrz0vJs3t3fEiH7gCkZ2PdTSklraItYJldxLc3xCX1Ru1VOkchZEkSdLiuvXA0PBAkApWiyUV1H0eEWGuw4zE1bl0AWTyTmitGEuouhxvAWzSfA9qQGtn2kY4EP7zBGn1_AKhudRUJLLKHo8jyIw2gmH5AUiDiBY99e_xR8hf7z5y81HGJIkytyZJw7GrssEisKRvnffp6lCeT_1oUsffHzymxLpI0k4fGd0kacwz7Q2h96mHcFgMBh4KRl8oj-P_E0u2dClYFCggw1YCZXDg86KleyHLKpKTjLpSpfk45feQphU5sFqkOrP5FL5cKYWGvlENykMpnsYIt28fXfDFlGAlWthUEY4pUqUSTIZ9yvYe5liyLeC3vl5FPWH0QilzGnoDS-q90RynGxijO-Ug1mRLaSFb76_--HNd29PGr6CGSsfnTSKlh98BdpM3gIoPcYZu4zwKb_nh4bPanT5j3CRDfKMSFVh0fBGkGyqRzTuon2h16QiuP67KjIsnMqUo4xkcc1RB8WnlkM-ik7musD4iUI873JpY2nFbKsDY6V1ZIf7yDAfQFYO321UIo-bbNtM8dHTvOJcm3XQG4zH3sPSvz93AWxeBsCvPP86gezzQP723k4g5CpAZ-QwqgNdBJwLD-P5-EdMRgboVisMCz0f3-JGbHFRz-cqkVO547E-YDmPPB_oxXkn8Wu9SaWZbvYjTQISvRjtQ3qGpmEUoPhVNxbnZw_J1D5LFQN4pepGIwM-tQ8JvBRtUmdYfZtOMZaizArsWuXN5CuVeXsb2xuXDSl-mm72iUt4dJOMbiC5D6h2v2fQDjD1ME3Rze8DO6_u59c71CFV-fReuRcIVH2Vk51Y6Evh2VVOalg7CLtXzoN16XwHGLNs0hQD8qs-b1wYXaxlyn6N0h_MxXyl8Jc61h-pzONz98Nb_wJRD0uPUuYUU7boHFGVBg-AQyd8_4hWJuQX7-jqQ-D8gu_dggzeoYJkQ1VBoh0JkN_z1T5l8fduYbJRYDKDESnJRFf2OKqR-S1dHcjcJNtwgmIxgistSYA7m7Th6OoAh_WssGy_m8RyH2YcfuT_mwxn90nB3jVgoThxIl9kkoMF9Je3N5Bok0tTK98qTq0wdUFIrOaioSgx33z97uPNW17XgxLtUjAFOzmntRjHSypHCCNF3y9NOE6k0bJplZ5sMYodRID0X5cRSdMxnFHM3TsbVSrpX5T3eYbeIh_8jvMTth7MwTLv0Hlrg_D94_monvby_oQ_AmaEJZeBmuB-q3w2zbSW4Lj7FzUB5f08bIIzwhYwx--e6srOsViNWsBv6eIWMCNsAfuMoJL_GvB40lKpP_HFhw1gj7CFHEqgJfKkhTyqId_xxYelBP6Bw2xWuFNWlD4KLHWJKFamzWHx1JULjTFulMpQmoxld4zHQ1oWCgsknBqTYV_-FJxVU8kBrx1kaHIpY_GVe5k7aTjcFEmC3y6MWC-Pt0U7mMhy4aM9Cw9m9L3IMi-4VBXCHKHIBDqUZrRM5p3Wdk11d-oSrGkhrqDr4d_Lm7galr5OObgppQeXceEVZaNSt4Qhagi5Lc4yqMsBlG5zBYHMi1e1FrbX-xo2KSGyJMBfBfRaGLnrETUlP4K7jYZEGEvhftl7YFDLVWLB9TavRFScmoknNBYwIivD1ZIU23ZcR6REAmVE2FoNG3ThQg_Sl6tbCw3-j__8O_Jco8s6M5GQsFzOPTqBpoq3hC3L5UUHu3gzGuype70tRJ8WcNMMlcJnCsLB6HIchc0eR1EJ2gLy8FP56DxpvLgyX21tp89oeDO5wsLIunAt6OCX-Y_7e0xjLfQWDsO1QCkyEhuCHroN6D0z_2GLsAvu7KqEu9q9bgzUEm08eQRThbvIvgqFdGV7wX5_6razgq8C1BI-fITg1Ypp8S8EDOa4Fupcde9SGdPuUrqqeNRmSvUQ35ll6svAFjlckY8a53cMH9LCY0845bQlEN0ULd78PYYI5YpgsUxPK0hf6zKb4I3zb5qcRSq3b6zyNLq1etsURCyK7LrZO_KGzGzwfoqGK740zL1v0F5zszr0b5vdW6xrNBq_z5h7LIoprFhGJydnZThZtZaZo8j2yyiCV6DgP2A4rHh_6dfok5jt-4bDSUOXWn9HwBq58_arqKlEW_eH0KUnhe8MHO8CG0XnTaX5VWA1EcZy8DZYUIMXgA0vo31cgiMM3o1K0Wd1o5X-uakak6ZqlHAsgH1f4dyEKLaDtLPzq4YXaIhkVTn_hKXbCjSV9r4dgfTRtxz7aBp17BElE2vu9TCgwvDBQ7LEbj9i4Mb10TYfV50A7HG1KvjdaDOt75E180ARZiNnbYrOWhS1QEyxgK1ljYcVyBllnCVKLRuoNU70XEyzOgr63PFFhYIG5JEc926URM_nUk4dtX45X0X2XFaxKioKdkpgD4owK-ZvSQtlaePLcUDxXZuSyaPLfVRhC78ZeiJR5-fV2spN2wOiRK6hjRL1J5fV2hCGzMqLyHIPUxwhALEQ2KgOnrJ0JPM5tpjILjD82LOuDtkWcVJEvwFII-5g_2JS0kjVB7JWhOITuK1tLDAxKddaJ9AHhHJBTdZhIPP8qiQz8sykB9Rjh-oB_tOpVfn9Cx-ASc4-SOv0g6ztzwsgL8_3Q6bKLjfCLj0nXgJ58czC50alVQC_tfVlvBe4ehnVGoyX-7FphGmaiJnKpXsB9riO_QwrlMXecEP6r0gnq84ltfev9sPMhLFO66wGM8Fm6MW4hDn3xPxCmKvxJ4EZRsNunAZMu83LMtJiuG_ZBMEoxbeePtVkzTxRxXAfRiWvAaOz3xwwQh3yhGJXjzEszck5S1Rn55se4rOljh46DSk0G98cmhYuhNqLKae79O9G1Ourg7OoWWA9q5eZ8PrDLYMk2NkOKMO-bMrcealztRJvx73kqZ-7t21Vinya6SJfSAa5qky-R7mqK2Y9idkNMkQf0XAcnSCcuqhVWd9HqRx8WXZSSUiDeEUROMyYQ9ELxicTeITRSQSrwwoJ75swzBmDTmooZ2EjaTCTOr4uxDlDquOdVY4EaUahTpXhYbbfaTxhxMOIYQLZTyhwx9ai1-JBNz-hIhONXSv6yJfofPKHNbo-CELmpMff4opU6XBxrR8Zpl4WIstw1KgcOm3Oo9Ya-L_DJMQIDr9Hu_87DEKUoxBf61B64hkemmyaa-3WBgtKyKVc8zjnTNMcEHYR1hk21MMIRWgp9HnsIBTF2vO6fkgIs1CrcO4OVsrRzCJLLDUkQhPeD0pgOUHOCyt_yfBCe2yhObBQ64OHYbc6n2sN7E_J6aqJR_K5vy1cTuVx6fOiu-OZY9C1D2Zcm--bPIckf0H3vBOGdW1qX9Civqg3vLtp4im9F_WY9_WFvX7vbzK_tC_MI4LPr49D9L2dXBqq3b97w2EV7vs18pt66680nYe39WMcXf1WtovVHGejp1Uf5fQ9stC-2dEmI6lhuLFXM_YloxbcR7ywgqs3MdvkKd1os9YaIi3ylD7sJK9j7Fnmo3or76BqIHUPpnuP4ufdywl1PvsRWqY47umfUs1PuI0uwf2XuFz8mmYu8GAK_u_PCeGgNArENU0vz0YxTVz7OW4_0hyX5pQManVYwW1UziOYDUepbFgRHomQ1pbjZ0iFJ-q6nEWlck_jsvIAjshT9sg0u6pr_TC30dstrZlMRy_rPf7BD6mOwqgwv9-3gdPZqNV-3G5_4ip82E96UyNhSyLf-iUf7pdIz9nyyax9NanEtnPA_DNffFsfgn7BylZbJIc9rjf1alrn94W1mG0nh500OzCs6x1fuqtn2JitIyN5jSODOCOPKQdtOJ7T6TyPw77c-3u4l3Jtg1543HmRZb49im1_nOhGG6eLBQ5Vnp1E8AjnJyNYAR2i0zPrTJH4Ey0rlab44RyPUh20x0Y4Yqt30Lvb5-_4ymcYULVLP2FwtdUx9caXqvohAMAK6qizm0RNFLqsA0ZpqAGxx222FzqhlN5qn5AB9z0ODiaoKt_sl-1ov5HCh7u9s8YmxfluKvCWdt-J1baNMsRC7i4YuqeF41WVO2HetTbXsgXDt4RQVeajOAyL0nGup_J0zTVLdi7L4yA-nQi6SEOnVbW8Xx0hGGQyX7gljDHV8jOmXpQxCsZUGp-BOoFnBr-lJibPBPPBwD5TGwb7R9ceW-BHfYIwqdEz6Z0Qjq5qbRAYTydIJ6vzDXh-Aelr96FlPuJepUafxkdqkHlI9AsEQeazUasFSxa7xMHDBi9qwMp8VTY0y_M8XQjd0tDopZV5XVuyonGjCdfRRPv0ZqCrq0MNq50toqMwnc9HwfY1Ych3PIek9C4o6jHURsr3dIeqAyajXd0hKqtMXohWj1z2ASKv2s2ri18FSMH0eFyncNQF2IiNMAb01bw2IJWi_FxgfSu2AL1Y9nnynKB-y55ZR99Mpa_nU0vdM_pnTyE8KuuMo7IfcF4vblUeak9PDUvC2x01f9Q4kLITrmqq7SH0LBA6KUvszV4bI3d0yZ7tL1Q8IJGr2i5XdWzvW7u6k60icOmyPexovJu1W6g7mLGNWrUDtvmgdBC5G0xpZjLFc4ZSpDXPxrnLZ3hkm09DhyTV-xJSBGJU3w-_FTmVl8txKFSN9nmumUx39Ep8rhRYfdnoko3KBlcZQFSYOfoRzrH2YiKkj9zrTYAOxNKjblFZ1RLC5lXtvEm9T0aobYmguiJ-9eLFTxqLr8Urv3z543Hn8n8V5mgSDsw9j7mLqTs6b1fDbsZ2Ytc6zJxLRWxx2v3lOsJ28gNGqIwyXlQySDHDLw977SwK-5omn-3yP2vgXQce18RAzsi0SCTHZniLPyxKSVEv3vn7Dsp5nSJU-9e_xX6QlHIylb5-aGRCV-WYQDUlgLlRfaX0UwnX5U-O0Ijs3fsPt_53EjxhvqjrtTtUaAuHW0gLVY4P3IdQlCrE1Y-p9GFGP4HBHFgYqilj-W0hy1SuqgqTYlai8O91LFJOOylZxl9J8cWvR7wz6lOBqw-UwgOP3HO2TBc9-Yswle4DsgwvGtG3BMi_osKIa6P_LhO39RMCHMjimbHp7AkO35hk-VHkC_85Tg8cjqLRxSCaDEaXh4T888H_Aw">
<img src="../examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="../examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fourteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVvdchu3kr7nU3RJF3GqKGb4J5FO-UKJaVsVR_TK8vFunTrFAWdADqLhgAEworSpVJ2H2GfYB9hH2Ec5T7Lb3cDMcEjJTiq-sPgz_aHRaPQ_T-E2kzD_dPt6Pr-BVS7WNlNb-Nc__wsEuJ0-s04b-QgrsVH5I2S6tBJ0AQIGA3jA_zZgy2VplqKAXLsupEbsChAWROcUPl7dzmCbi-IluEzCslR5qoo1KAuZyFegV6BcF0SR0vfaZdLwN8rC2uiySHud084pzO6leXQZ0srcSlAFyAex2ebSfkdLWthlwiGZKqxKJeHtRJ5DrgrZg9tMWdCFxCfwK2SKWOQtKQsicaXI80dQ1pYyBWG7sMtUkgWSXaZzCVutCoeM40f3_d6wD7Y0K5FI-xJiq5yEf_3zvzunsETuhXmMYVs6Rsi1I3ZQgvjeZlK6LhT4UaxLl2ptYr9v2AgnjRK5BSseeXcSpdA5BftrKYyEjXRGgi7d3oYtXH3sQrySRSJj2GrrF99qnYMsklzb0shK5tYZKV3nFFZGF06sJR9HfxT2OOiDZw1W6sEhLWmDkhZWpSmUzei5tTCpLDwbj_i3cwp3yiWZLAJlTSHCV3y-N7PL13D7bvZxBrfvbmYzeHP54-1H-GH2Zn4zo2-vrt_iA_D65vLz1fXbHlwGQXnx4zFdz29BgNF68xIUakPnFMTSysLh9jYQp9ImRi0lnJ39YnURf2Mhxsft3_8Rd_0zTjuR294q19oshJFisRnEJBT6HjdISt45hdgmmUzLXNKaNgYnlrmXoHIWkBpyUaSolhWyF2eNrQrrpEh7cIUHoZfWmTJxtJ13uG-8jtURqiLJy1Sm9KnVkCiTlLlwShd4_ncWj1SodeZAJEZbr7yoTd93TsH5ayLAOuFkCvd9sGqzzdVKJYRS38egRCznmgNbCQEvpBWPqlh3TllH8ZuNTmUOqZYWCu16cEnigLc3888f6RA_XL6dvdy_EsqyNalkzIrZBasRWrlMlw7irdhKE_NNYMKdpL0qVj2-zjtd5iksJdhE5DIFpxsq2oN3uC2voXQHWQmRs7eXN5dvZ3DFfM5v381u4N3l-zcwf0Of3Mzezy4_znqsNnjVobTSIrRYy5gliyzcqSJF5sMylaJIkVo4eUvPn5Co488LXnZxO58vri9vbuafY9hIYenKKPcSxr0xbPx5dkGsBaqMhx70LmBDtm0rzJ1MIU6EiaGQMrWoUhbo8ioLMb3wrHZZyurBZcSsN_pWJqgEIu-cQi7FihXGiTuJ-ghJLnB3woHI8y4sZULvlaPFLcz_Nrt5h5fZCDLmLhMFWNQTVBVtUBS5QidQq1kqbCZTMDJxoljnsmnCmVlWOeFA30uTSZHC1uhfmNMefEYrjcBIhJzwdxaPXVl4Pbu5-tvsdRd1EXZGOSe9PzLS6vxeGqRYSvYP5DNcppK7QloLerXqnIIUSQZkZIhnEgY5LCRQLgMyFj1ypqlR9xItYDDMKPhgQcOXMe2-c8pWCuRmmwmnEvI_yCbhBfUBUdidNOHesUhYZec3V7Pr28vbq_k1r77FC0Wm3DZuUXA41_Ob23fdcFcKbfCMCsjkRtltJo301y2Wv5bCabPADZBSW126rDJE4SLdemOyyx75Nqt7PGa8Gqxe3sh_l6qCbQTKb6n_H2opU7KZJE1mlZZYiUSkDfckzb1KJCzxA-tEcmdB5Jqw6v35-1u9PyPB0w0tt9YJZWyweWX6yJog8JRNGhh56QMeWoiig0xY_KRz6rdbg1rYSgMcGnWf2dKGz8TgvSf1teIRRdlFEX9e3MznPy-u57eL2b99uryd3yzeXP54df027jKvqRErh-LMZGmUdSoJV0ZZ5nAjpUP70Lxs6EDupTFlToGWYxa8qyS1-sYeSsmrll6tVCLxWlcXkHSJLEivQ4ui6UJH_w4t7Qn81gEoC3R2m00HYG1UCv0o6gCQqYbLiB1gIrayA2yQof-SHyENhHLbAUjVxoIonSb2RZ7Tw03v2gHI5VoWaacDwKcdvEcPYt5S_F1cK3NMLgoPmwJHlJ0u8IKJjYRUGbYf9nuIq1iNkFV9ubfCULBHgV3Mh0jhnCruwqXaooF6IciMnaWa7M9WGvcYYj0C_fHsw838w7fEhUhTy5C9XLs6DsDrNZqMYPO__wN8G5ePGOcmDmymZS4S2UOxYJCJcodwvUmO9EG9-8aHYXvwIupG38KLwSCKmq_o_2_xW37VAfidhfwxk3kOiSyckbgby-rUDORFAe_x8vT7vTE8wBQ2wQmjYRTkuh7gHDbecBGuLig-aurhKhfFXY8O2cEtvIJhFEH4dwryAcNhbWrb3KFn72UOfTh521DwEy8cMuUqfWVpE4cAcOsfBHgxGEdRdzQmMfSnB2_6kX83ig7fDfkdQfg3GGVLwv59j5XdIusDaZWigK3mpR9F8Bu8OJ_US9NrD3gAM3gWZjqoYej1EzC757mhLU2jmht-3UaR_S8zM4kaIpschVkLcxRmwDBMOjpyEKSs4C1Z-sosMsQEwDClKVGw6j8lDEZR9IAbAcjFUuZw8k7k-QnU_yiiIwxU_MdmiN1aiPyJX6ihQrzQaBhFD_hBtdCc7OvJ_kJsdFvA3pPWwCz5p4Df0-MtYMZoAZdOVaJpaIkHnkTRw7AJ_MmpXLnHkz3gkj-EXdICD-leBT6JWuDjJvhPPjp4TdHBCYMHDB8y7C_gw0FaoKkPtABiP5w3DzZE2XvcezPUYbtyu-fjulVqzoaVoxGMmHwKYbfoboiWo-r0Vbpgel0AWxrhiBXYqdRleAkiQAckIZcrx8EwA7KiVpzU6QdWY3pwrSEmwhgjFogxcK5eI4p_rbeyYOfBaRE6Lk7e0bF79NkCQRc_XV2_Xvz4_vLTxxlHExTaGrkqraDMDs2yxgqOWZcbWTifplEmYMS9zC18-kBhIuM68jUKMz34RWyWGHTzbjGTLLQPqDWF_ZJjN1q40CgEaTYyVcJhamn9xQ_Q6L19TH2QIVRu-GimgE65kHlIiELW0PXAuLyHpMeVxRhlXYq1_IazgEQX97IgdlbagCh88Uks9T0vl5SOgrADZfB8-D9NpeiPBuOgFcMoijotSm9MMI9HNyEcWr5AMI2ifdWhp1sI3mo0EM7HTyM07MMpXMJWJ3fS0VHzoYdrzvlOoSHRxqgUb0kIz1nMdLTWR3ME3u8NYeOR9QqW6Nv57rA-vFCOE1SYjCNS3aB3kyiCbV5iAEzqJPJc70SRyG_bgiZL5pnmHQ9IypNqx_iK1Q5vnmfHGx1USX9GIavZlOkZmRpag--ScE5gFBqezYQ9cuC8Pr4QDkYX4ydF7o2bZ4WtNgmzspyGA0-7pWyzLuA0DA_ed8JMX-nK5DYkcF5LoH8e1IwtndvpUKjDDdgu3__qigsO7aTxJZRt6fiGY70tXqqVztOYGCCuPHIj7QMdLOUW_eX3INhuobWCrVCmJoaadU-SyuSuB9dS4ZIe2-6k3Nr6BuJhUR3jI8r1xbeUnRZlntNF5UOjcsYSy0VkidI41MpCKqCL2nqBk8agsCnf01g1upNbB0ku8WBRJiia9qnT9oAlAnvXfNSv7xxe4BYhbhJCEWSPcDga1AdX667B-hYf4k4Vqd5RtKSKKvjYW3x6sX_4h2QhAmiSTTFUq5X2CFUISPYYno723NwRsoZ61mSDBtkgKCil6RSuO3LvF-dR1B2fV96dQhMUUKoMpoz-BM_Ozs7git0AvqaPqcpMpepU2jv2_aoIRhNEkWSYCOjtGblkpMhLm_FCKLaHC7-bGmmp9R1uYXUEaamd0xsGayIhz6MDpCTDnYYgbDiMou55VEcxGCVFERiN9VnEaCzYaUFZvRIE5CuCZFxZ0Fau0X_DGANMKx0M8Iw5Ah5wBMzADTdQA5tyXXNICUQ0qlgkehTTMwDufoFlAQIYUwA7qENBPHUUDOwBtBB26KHNs3uLwt4uhoEZ1O62DphHxPkqoEn_GaClsKr4SqDpNEj73B_oU6i7hBX0a1D70XQPqQXlb9vCYnliD4-SNA9yXgm-6Y4aSuUwyIEjXDVR6vM_jrIyKl3LL6HQja7EdPE8ZKJLjBi_ADkYP4_CicWCWjWcSESs4JNKwckETNswbW7Y3b_oj0doqaY19RS1u9LIquyxp0oqeUzC-hMyAYMKAFfvX7Tom_auUdKrbN6pf-Aag6zQkuxigb9uJWJOwb0W4Yu0BSULVccpuNlGbqAL2YjHqYiKNbwzscNYJRMOn8EiugCnQr6wFc5hZdlH4xYrbrS1-TXlOR_fzWa3IEJMRvVAbBorV_duMJZ7OY7qJgM791RtZGExMldYRALrMD7Qq1WzKfVNSHuMXElD7Z6artmaQLqNynNFzVRLwaovbvlgy1fuVfpqvaDyPdQlfk5Dx1xMIyfmLXgrPX_tCU4OIbfCZYDlE3av7PqGNaJXqZGHPASg5DOHHNvuVc2DXUqDp3MsGQxHDZ7eUNKKZCdPgC4pwaESNIJOpg1U3ujIgz4BIPcB-hibBATe1kUAOCoYpQH8H18JOadS1kWrFDIcNvb1AQmObClHm9gS9Pm0jTcIeEcOnwI38H8aFZR9htDnD6bNw5fJ3bGDx1YqcGM2wPXHjFfbEqxxPAybNY0PWufHtsfnv6cGYyogXowajneItgX_qypHxxXgUZgUsJyPKf-e9Jtww8ijHQIsZbqwsK8ABDDo9xv8YK7y8CTArgXQPP6GBk2ipwAktFVwUkPUxnoS7adJrVkJ7ozGlOzGQE3xxmwItb0F0yyFMYpadZgw0ZN-LiGUHrDcQI36_CWm1FWVk2olW51kWG1ykNHcRqGrZI9HCuAXrQr6XCQJ1sAZdW3ENqN24cGEAxi51YbbRGWBmR139XHigeswaFbDVzRA8vd_xD24DNAYhCoLKRpSI1NsSVADpWlFV-KOv8mlY1lzwoO74PROOTanXiTpqxVfAC4gUHW3Ue1-0Z-eH75Ds_ht9SS_o0K7ryQ3O4CNcRbf7eThIusec4ldcYxythY41-TWsR94IYvsCxyV51P3zSPP9A5PXFHtgbfEvThRUMkY6xUH-_WMearf4AWGDXSZXlz0w8vfD_08p-sHfv6NLo2TmFox224nC_d4Rv48zOv4OR10-5z4hmJdbOSvpTLSfhZ5Hr8MFLaRFnNdnv23fEjktp4NEdUkkHWi4EYQC3mj0jSXPmtGU6SadYJCm43IQRgjirWkyLapRQLbN8JxWhzkV0VMYWqmjtsG6E76o9FB2NaiLDdLI_NcQGUYR9MW5fQo4XL5a6Mr4A3Qvn2-8OarHUKXxSLXZbGWHCOyAo_6e3T9wxXbdP3oScI2JRapGpwOaIvTmpDaHv0jea0q9rY44Nt1vheNnn-RbHj-VWRJjvfQUme0Xm3SyC3HR3Nmeb9IMmHWlBBWxf9B1HSUD8MDso1Q-VI_1OeHXDb9RyBrZ69GbLa64nJKx35RJwjD4JYP6KRsqkufdhe1mk-D0ZcIyct2-5PG8aE8B0cEqgu1qiMIlEjUxQpUdSlQoP3xAWEmq_Ss4ZsHbd98SGgzUy5rwmm9Hjx3mY6RXQz-FNl09EfJBlG_pZ5_hGz658iGtSy_bm-jmuoPkPV9VHxstd_rJvkATt4oY91f1CM_0oz9o33wv6YN_td0wf-SJvif6oF733jyA08PQf8Epw_JmQpVhKGiqklRjZzRQLXIE108UjyDZXCxkSnVwZULrrwoN0tp9vwstloMNWS0jxw0jSXS1DZY6Sey_becJ6xU1W3zwKFhQ-oU5ukwiqQRbopRV5hhYmKtEtvl2RtqnaFSpGcrbTYgrVMbCjFDST528sGdeaqeszwqByc_N6RxQnG3SuvIYdSbwIY7EFQ36EdRr91S96FKayigNRNQpUX08EloGjenbDOeTjqYAxgczAG0uvUe-yM-fPKFAYClTAcABwMAxxGD7gx8D92LqQ3JpYZ267_V-Q-QwmUsag8p_DDRHov9PbxJtI83PsJiv8ViqFrp2vhQ7MqXyPopO27gSG69YitXGmzmyJ4P-bGgvpS53mFVzijZjDqp-KSqYVywmVi5KnHjhCr0gElBwrRwY6Sod6xVO3iiVTs52qodtCDogI93ag8A8Nk2OR7mM23PPfJwdnur95_oGR5bvd8cUvjh8v2P8-v_aAzwanIZwsEdNesUdpHXIsfJ73r21RurGIxQufXVPAxCPDRZtTAwgGauNqJLmSnOf1EPKIkhw5Vh1LTC_9Aw2S6kEjO1FHeExUuPjIt8w9Zqo1L-BQfl9Dx87fezuJ7TjEQMK0WlQLQrnumKOZ-ON1hW-NjB1LCfvEQF9p0-6q9Wc8wMQ4Zb5FbjTJ-lMmojA2sNbcZYeYoPCw-BxdKG36_0DnSFnzjWdBwMx3-i6bg31nBR9w6faDmy5WkSTcZfajiyAdxjlXoqzy9EJmmPqNGNrZuN-4UiL57wl-zZsFUnGlHPa9I0kPT0yZ_oXqZ6V4QLRb9sQmsIa_y9RNxsa8Q8qRz7LiP-2IC6i_HL6rnYqzzn6fi7IFfrUGkKeHMz_7nK5ysbiCZ0qbHGJ_HHKeUW_E838Cm6trympPlovtahoo59SXSDESkgVY8oleBR9m1JmajTDUWNPy_eXP377aeb2eKHyx9_WtzOafY5bqf4y5DCPtMKq7tY49A5orR_UDXuyFy1W4kmxRH_-oFGD_ig93uYZBV4G6jW0Yi4p-O9nu1ob_0_sbNh1cAaVjujbDFqIA-e6m9XDzy1s9HxSkXdIP8a1s4v9oRe9agaHu75jnmTvTMyMgdMjg6ZRPvhyqXfJNfnWiitHv7F8R6-b-Ae4DQb-E2c86MZcLtjy1g9BgmiGlWdzZHnpVGklOJe2mrYEI_KxzkUJHOsjxEJZm5o-uk44uaPF8OgGsXSndaMtPFW_vbd1UeaT-_y9AsXeOPwKx5MGaRMZdoLlUY_QWcVTtmF-Ik5Q-UPwVWheQd-wn0VkoEq5F7xzJ0o1jCuE1GnXB4m1_2PdFo_J2DHhb-uWywf4eTSJNl7Uaz955gnnAyiwflZNDkbTE4I9_fO_wE">
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
<a href="https://playground.archlang.uk/#z=lVfbbttGEH3XVxwoD7EBWaVoS1GcJkBStCjQFn1o3qMROSI3oXaF3aVptwjQjyjQD-qf9EuKmSV1sV23ebJFzpyd2zk7fIa3iJ27WHPpnduCduTjlm1EZ2INQsE2empQOO9N6fwEnTcxsoXYB2yMD_F69AzAbIpYc3o-0X8HJ9DW2UoebXFGh8cmgNT-_JUi5FOsOmqagI1324S0mqCrTVGjZG9uOChwqLlp4Kz8MB6ujY2xDLIlCJKCicZZOKuwAPiG_R1CTZ5LcFnxBMHBOshxKMiictiaEIytUiyXKRu3Y2tsFSZgKmrULkQusb47pAoT8dEZG3C2Kp3zWHPsmO1qgpWz-FqM3ky_lkPfrPpErxL4pvXWxNbzdPQM32qI2gU5NMBtNmpVU9MM4eprE-AlGi4Ra-_aSho1dNB5dVpTrKejXUMW4_edu3jXv_6uoTjGbyOgtSYGbLcjoPKmxCzLRkAoqGHMrtMv63ys4U1Vx9EI_enla_-hMTfGVqCIs2ySnaciI5hfGVdZlt0usyxDQ2tuMP7BxKJmi6_wo3qN0QYO-NQ_TlAn6GsuZ4CiC1p_gKIvBP1ycUD_iUJkjz6_8QmOVO4YR_zOj3BmVwec76lpTr2lhMfe82zvnV9JFEc5viPpxP3z11zmQKrfhdugx6TGVBbR7RKYRHUK1vcqH0vRn-F9PwTwrQ0wNjptcd-DsKOCE12tg05gw7S5BtlhekGFdyFRp6tdwwp7yoZIMtieYs0yQWTR8CaChKIV7aYj4D41wbeRvXEel1l2RLtZluE3PXvgAvpeCEH3w_P5kN3GOxtT7BT3Q_88gClEsC1f9Qx2Gl4a9CN6TPE2eQe6C4ra1exZqBki2VK4SVECy1L8IZKPq2sIBVTieJJeKK1b-zyg43T0uaSu4KZ8XX5Iobohpak2V6IWGPboTBlrvMwy1MZWDMvk03EInaSt_UvOA_CjVVISPAz66IATPDF_Gk9H79_wlg_wKNb_FV_-ZfHl0vDO2NJ1qYBpEKbChOSVZyo7j9ikYYyYzx87bTZ_4Cf1UGSKyBeDE9tyOOrqMZd8unYxuu2AK0Y6T--4DIlk6cqpmcogbqS0eIXVpmlDvcKWKbSew2GcujTKxlr22FDBMlB76RfhTupp7L7rtqhFx93uQvNWaBgbOCrVVDZmyyy7zWcnsjE-Qe7Il96t-XHkNLgJOgHmWXa70Ko8EV3-NIYIY559SVB7wFT544wHpb6V0OCdaBTyF31LhnvFtxbU9AtGoq3e6mfKZWOr5wGBK91qLodtQqVUW3SWTZaq7O0O0Smy3mnnExSNkNclnUmT8upYemtqNsNr1aRIn1gEM7gN9dtIpHVzr-Mbb8qK-zuTKjJ2CHkvqPt4Reak7S_mQ9-lHi-yLNVvf3ke0EN0NwP4_0WfXz4B2F_UH4Kxn_4v4GL2BGDhWpXKL4lwsXwqZSm3XtT5cp5N5lf7i_rlvXH8xW1ojH8F0mYp0FIu_KXgHJFjeQB6L5bjE6DTkGrXse-HXJX3ySGXOF_eo15XnBQo4Qz61JdlthjG4iqNxSl5KRiLh0E8oO38EeYXNRmfqirJT-b5vqpiPn-qwfdcFy8euPZkni2z-zVMGwHTDYdrZVZa_Mt-6TdpjZHN9rkIMKNoXJA9Zpgdofw07WEbuBv2NdlKDk7oP9-wH2bNxjCRr4dgSlZpRnQnv6-xkj9hhV0bag7pK4BtuXNG1oA2KqYbdjKdYhMPm5ou7hqwN1Y2rLAjOyQRfcuYZUK-v_7EUv7GOi1n69Y0pWjM_j75-_c_1Enu22SfaR3dNu3vu6YNSZHESq8JLRjFfdBThf72lorYpC8Y8ibWW46mAKEmW14Mn3eryLdxhYpjQOddKmlptlqWsFfNizdnGlCvoYNa6SydWKvpI2YjIJrYsH6TADvvPnIRH_lo0delp85-WN9h_NYX9Tdkbyj0b2ScxnmWLy6yxUU-l6efR59H_wA"><img src="../examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=pVrNchu3st7zKbqkRaQ6pC5JWbKslBe0RNusOGSuRF0tSXAG5CACAQbAiGJSqcpDnGc4D5YnOdXdwHCGjuPkxguXOBx8aPTv1w0ewwC8MistOz5YJ3fgy0XpFsLAojQroe0Wfv_t3xAKCZO70XA8HUxHk3FnML7tTH4YjkfjD_cgX8R6oyWcPPfO-henZ63j1jFMCwkbbQMsnTXBE4IPTsoA1tCn-8nD9CMIk9OnlXC5NOm78eRu-rENij95W4ZCOtM6hkKuld8U0skzmBYCwSQsRRYgl5nKJW-0LayWoMXOlqEN3tLDjRYGfBBBelDhmqQE8CpI-CWJRjvVNokPfqWX5_juHHInth6MDYUyqzMYBTBiLT0s1bOEXDmZBWWNx6PMhcsKyKXPnFpI6HR-9NZAp-OlllmgvefXhEzbz-Hk_rQN84XInuZwMq5Uz8rBr-RPpQjWzbzKJb7ShoXMROmTpHZJC-JrreP6J9BKouAuFFvhcoTzpXHKywQ3PCV74GMvQ3r6eHoGH1EZUTBhcpS5KYpwkq06-H4I-KgN20JlBSiPDpIFvYNtsaN3CosCh9IZD2Irdugja_ymdQzOivya3tLqWZkVOGvXJNXChgIWMscHHoJ44g3pPOgCAvdM7uSle1aZhAU--P23f7eOQZrgdm0ohNZtWIhQtEGL0uT48EmFrJCGFK48ekn2JHMQ2ppVzXXPYGIkiPxZeet2oJUJKHKpJTgpcvSrNswfZ3eTyfez8WQ6G_7vw2A6uZu9H9yMxh_m34KW4lmCSOeArQpF8iVYlAFU8CCFR9ytMrnd0pFUgK3SGrzYgbdVhHlJer-9G7yfjsYf4OPw4W50Px3d3MP7yR0MxjC4_2F4M23jFiAgFzutVkWAtRS-dHItTTiDgcuKT8KsoBC-dQzGgi8NrG0uNS4ELYIKZS5JEmMhF0FSVB24gBc7H42ORhXpANraJwTm5XzUbSGCfJYOxMKWAQq7hXWZFcDiZXZNkexsuSpAhX1KsZgI0IbL5OoU1orjPrfWwXej8e39GQxQ10v8hs6utygd7i3zyk0oPpxEJzKdXC5FqQM8KZN7oOhH5UqB5-GPsCiVzqWDrS11DiILpdB6B5uSElGVU7TK8ZD1xEaipXhellp3CklnxZelA2sCp6lcZk-EsrHZkwzAKOyvdrkEAb2LbhfWa8iscyq37pqMRIflfMkubjA1xie4nEAXaml1HkEr98dnKLBCIdAD7daA3UhDAShI56EQBuwz_SVhLbJCGenpxAPSH-uWBfFbKTdVkmRnQQ3cb5VZnZzOwUkOf1NqDUvrQGgdbRHTy-Ps_nE0_jCbvLuf3j3cTIe3c8iEIWNuNnoHrK81KdUazaklbG0VW7ihT2ko5YvWMSRDz1niOSx2sHUq4GGNJfuDQJfRbciEc-jKHgUH4bKzFjnc0btYHo_glxZAaVBr63UL4BjmK6dyuOjOq9yMnr6DjXBBYW1g51Ieet0uhEJlT1XeSt7ssU5iOjAEiQ7fWcvgpKeKU3qZowIW6JSPk7vvBneTh_EtCA9bqfU1CFiql1A6QsxkDvOlLn0xB7ESyvgAgnBRgL1YWqDnWwOCNyTRjPQeTn7_7T8X3VPIrHW5MpQAkshOeqvRL6JQBIwq6HgjNug3AW6Hd6P_G97W1oNWT2hrEGUorJM5BhA7Cqmv1-3OwdnS5JLSH5YeQh6NpxMu8ugyKIQTCneeP87eP9yNR9OHu-HscfDp0-xm8unT6H40Gc_5UBgwWHdRyZggcunUs8wJtiYZpQzA1C8d4Bk2mDIiiyDhlIcluSoqM0W1l2DK9UI6j3mDQEuTFWKfcbylakjOsNgF9EdEUloyqThrAUTfaQFsxEY6GJyzWTKxQUyfCS2hd93r4itc-8pNCyBXa4-6tOi39GIhcypMWC5brb_MdEjwTqfTAV9IreFfuKLMyJc6_49_HBLbmd8oI-fgSuOrHAhblYeCdJOr54q-xZRJtZuoAaks1khZKCqI31bAXOrnkNu43ou1pKRSI50IdgbvkENgVkfKllfxmWqHh4XUdkvIohY71sw51yx2cPcwhtvR_XQwvhlWxIWc8Ru0pfMBNlaZwCaPO7Csj7MfJjffDaezu4fxPNVgFnkjjESATDyrsIvEAxM4C-rlimp1C9jtVf6WrYP_5EuQTlkHsA_YfrcLv8BJt909hZNev9ut_3V10cUP6Y9MWy_h1xr2draQeQ-x98lhj91j7MsESn-8ukKoz0D6XwF5k0DefAmE_ObPQdLCeLw_QkkE709Qzvdr-W_WzoE0kVd-DefyvCYQfzjQjQjFV3RzcbUHor__SKBYw_8M56om0FX9YPtQZ07d-Yf_CO9DLXhPKEGdMp_nPTbSYq_oVeCUqKXcgDLtmBbR5ZnYrWMvSKCRaHaWIsMkwGz_DO73sQ0nlMAae1HpyS0RQCOpjmAEETlQ-Vs3iy0GVnsOFf7n1c8S0Ktf0B1Ai4XUcPSJX_4fuFXIi46w3vnUpeT0rAGeQgjBU6wk8PND8HeRs_SOogwEHpnMIWw_wb75q7D9r8KmAGFVcBg0YM9f72G_45cTaISNEA1YpKJJ2lqAESxK_0JkNsJ-FFrvMRMsQWTKZSU2IraJn8Kowmc_J_z-Vbf70u_XtCFC8Tk-ceOGV8SQQsxaDDJm_wDzE798oIoyKK3CrgFL_WcU9epA1FfdA9ghvnx0KCpB1MKWatY1BQ2xViQMXoWS9AR_K2yxuaJRDXcqyqdRTKyf9QZbhdRwEe-u6k-tA8A4Y6D8bT5jYDx4r7tPQFz88QnnM65oBAJaLkMk3cq0KglrzRQSuNg7KU_9JDa4MnuqGpeqPVO-LnecQhBmfcaQCe55IisTLnYYkWVhp46MXHCHIwX1C8RkNIrDJZ4kIulrVIeKOzFYCBZHL3XK4INwITYxcUNvtcpho6Qj0IUMW5nkqg4X2Tf32LHBz5z1kUJp4X3TCFF3qTlFa2AwtitL9A8ssT8LG-Bdmr08Yc7mXpU6qet9K5VMsbMlrDA1f7m1wj4PYZk6Y-OWZkjkVczHYv9KbRHNSmqtGNrHLpidNo9KqdcaSOxBBHiNeSYeFBNkzc32fnaA0T_A6HUR5BDDcRv_ma9iXkEnrffFxLQLgQ0GjxRW1lIjt7LX2O-Rc2C3o2325Pe9fmxRuN_HuWh6cWlL7WOL7xV1NXFuQCcRxm-xIcHZWTvO9jQNa3guEnH9WgaVsXToiXVWjRYVGqdhW-kDyorjKe7U2ENIATgXVc91NkvYKvk0Jbf1Gos7uzc5WsO1fxTrReXXKQlzqNfjinDjAEatUQki0JLMOoPZwPggRd6OQxuiAyU11XFuklpg_Obqgh9xm33FL3C8ImOIieOAufPmTm6sw4EdnDOIL6w7dEQsT9Eg7EuRP4qA5a_mSzVV7l2oGtBghqcktSwdTWNqk0lsdlCZaPs43sH_fGOaQ5Axd5DtVHRZD0YqgqxMlfwME9_nE5_mAZOZ4saHZzxvHJIPdiOwW4-y-Ot6aWedp3EW7pTSncrf2gZHwcBINCWmr1cpfcWQPVxeZ3uvPlve-9ryjeACXlGNi4uL_fI3lF54-Z4INQDqBIDrIDOAuH-_tj9rsFbpOc3_U4pOeGMemGOneh1ZdyEWKohFnBZg4vb1i4NEu4XfyCzUBvuU6rEa-NTgfmnyDT-VCufn00JyRpcGgyukj2kqoXJJTS5PjlX-1iSzRb5bsfRDq1HNOlgaKTguxfyf1sall19Z2q9stV_79aWysZT6P_TMz82cGvhjiLcwdPo0wgMRr2oOwCOh3oOzFx464R6cJ-oHof0Ncsm8Ab2deWWeIDVDl5fdprb-WG4fjdbeJwqEaSD7xNIpci4r_heRL5tC15w-jjD_oddHp68GolQV-MoOx48Lb3UZZH0AWM1ISax2vLgwkqgMLmNvdxYvE-fk1NUNEpYaV02y6ETfeC6dcYjDpdMulx5v_BRW-Vz5IEzGnHTwaTL-wL1rXAEncVYUx2GY0xuTpjTKOd1flFEZtl7Fjum4Kqw_lcIF6To4fyfGFaegzVnWt9GUP8t4GVN9m4kgtF2V8qwqU14YFYTb7Q2GuMJkPNhl31Mu9kLN8pzm0mkaRqDVZsiZ6bqIubIyWODfD26GpERjD-fUmJOcCoF6hK1B-lng4K8FWDmNIgeIpmJ_T7au896o9XNgIzExVgb2XTLNdvPo8OzpjS18sM8ytW5_aYurgy0acEun8pX8G3BEdr8Il9nSBOn-OlyvdyhdA4-oZ9yPQp1NH9k1kIVjn3vRfbmk0fV-9TYjOT5bvbAhIOOpre52X14frPaF3RJ5OVjNrLy--k23-_KGScjnqqD1VeP_JQGw2pD8TRHsUlRjnnafE-d-WkBJObb193YpjhqLuexWmbG3H4_QZvXFU3y1uXoh85oJeeZ0xr0zQVzgWKHbmAd9FaD_twCyQijHlKr7-qLdq800Lrovry6i33AR_7OV_dcXhys5wULvqgmyLxBEJMTzP6wQnHX3P3hRHtbW4w8WnLVLTv98KWYD_6ZlPwCh63zO1YVIWT_V7WNsw38-vEMVZhfbc_o1gcbmkn9TogJPL20Z6Kny1cXZAi-ZfcE6xDkDBur8Gw8O4XEuQalOL6k47BPiRpceK2wb1ipgMhaBb7S5WUqtwNo-x9SrllUN8Dg7jWXDpWsxLzOLc1tsaJa1oukxzT_xMBd8kJuzJCQon_p87uzpviGHeZobzTn34CZJnqoPMGKNB8SmlIpvqrx2SYQDb9egScbmeASR5LSsRv6pQZ7jTVy8F6KRAjJdhhwidX0_G3z_bvThYfJwP2_aDFal5IHKMd9Chmiz-o8a1tZJuoyfp5_84FX3k9zxzyiUCfRbEfpUu5_bnsFjIbgXV4GvsfjeMHnZD4MPw-rHA7gv7obqMwEnCaBMpsvkfRQQ1X2lL6QM8UoWG4hgocBODSfscRjeVCWGV1BBS7rYBtg4-yNemh7dp1-GVVff9D2KY2aLHRzh70huhHkWPn6DwXvU7_YvO92rTu8cn_7a-rX1Xw"><img src="../examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
<b><a href="../examples/bungalow.arch">bungalow</a></b><br/>
<sub>The door vocabulary: sliding, pocket<br/>and bifold leaves — panels, not arcs.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrvcttGkv_Op-iSKmX7jmRIUbRk7TlVTETb2tNKLkk5J19OGgJNYlbDGezMQCCzlao8xD7DPlie5Kp7ZgBQku29LD_YItDof9N_f-A-zKDAjVgZLRSshM1RQykepJJGn4CTG_BWlPiLkTkTKIVWogMr9UrqFQjIpM0qJSxY4yudi2Fvv7cP8we0WzC-QAu4EetSIUid_nTfgnSwqKTysLRmDRYzL_RKoevDAjNROQRfCE9kNf0vevuwVMZYKJXQULlKKLUF6YZwU0gHRiPRauMTL9ZpdvHzpw_zq3kfhM5BesCNdN6BN-AKU_f2gxRfIPjagDZ6QI9LJTWySWYNS2PXDjKzLo1DqKUvyOrKPmAOtVDqhA2GQPz7b_-E0qjtymh4uelvX_GVzkeQE0olM-nZifD7b_8gt2SeNEIlMgRhUfRBiQUqEJ6Zf_1DNmSovTUy74M2sDCVzknCwmxA6G1doOVDIEqhXY12V286SYUgPLzMNv1s-wqsyGXlSGuwxC0cQZ8VhDUKV1nMQbhggNpCKa_-94C5CptFB0QmV48Vbpz4aXZ-DvPT9_M-5FbUmhgK8LZCuP6f99-e_vSOuLGXbz7M4cP8p9n7yws4u4aLyxu4mr__8Xx21YfZxSncfJjd0A2i-3h5dnEzhBlYDMEQAx3MMgTtOmnW24dMWI7rpaksEUjv4AGtlxk68sgW3sJ_fjuAq_9wf7P-5eTVtwd8ckKDtFZ4yQmkq_UCLTl_ZWUOmdC9fTpui84xuTPM2SlTYg5LkYkcHWh8QJv82fha6K0vpF6dgEPPAW4qT7pcwVs4mo5GvX0wGgRMR7BeB4kU5SiyArRZS9KI6ADzFVIAo4OFyO7p4iE5hrxNAcI5kAmlHP_Z2w-PSQdqK_UqJA8p0CGUntmAMubegZL3pPhaOi_ucQjXBjylpStQqSbXk8KTweFgCt5KTnmQ2nkU-TAWjR3ngPNYOjgkfURmjXOszOvRaAS5qXUf6kJmRW-fhKQoJO2D0sgc6SBxA0ronCoFJwC5K2UuwMsxcewfjUajV_ByPCYG4_Bl2vl73CEK1yc7T_A3ZvqO4iidr1lGlajGmCVr3wd6ZAQbGB_Q_-YBrVAqBlXSPAZU1NkViD6YKqAujEJYS6XkGj3HDTk5R0txF2Km8qleeVFiqMwzcJgZnTfpIHzjuEKoJbhMKARHcSq1kzmC9FRlkdtB2wKEpYBAqqGpRTj4fn7zaT6_SBX1JCRUaaT2jiMzOqHyaDsJpvOmBkut2WJ0vX1YYCHDvTV7huPS2HD-0SvBy_2gPEdovBG078OEgwWxHMK13HA9Eqq3D64099TKKg1CGc4DhL8aqV0IHgFr4Yy2W8httYalDAlCTs9zFd1JfuHbMtwrhfVQG-sLsCi4_vpaZjiEs9DNrPQeucZdXsy5gVBIkOUO1zJ1094-3Amb3XHuOnjpQ_GmDgeZMg4HQg-oxlJ3OqFaShfzUFKTLsS0EOoBOV2le9UHQxVJhEaB1OVIeKyD7CcynCKS8je7H4aLsbMKWFpEyAojMzwJPKOnNTeTGFIvHJxdXM1Oz3687lPJ89FHL1xXcHw2dh2pXWblAvPQoYRPzPoUYKbKCh43lOIoJI9REqdgfBHDhr1FwdoZHRT6ICkOKLCgmL3jtheFU_frOOGOY40zTqyxo3OsNkl1Y3Ophd3CzGbFudAraiRGP6CmfhCsENxfX7jQjolYOu4BdPI7Duk3aWCR4i4U8mDiljlXlETCwez0z7Mf5hc3NMZ0DbOC5y1fCE12UFdwhbE-NLSQwyHzljRmcD2kcPAweU0VqRTOt-fZOc3MWI2WG-FkMj3cOVRwZImp3aMToTrVnEmq8aSJQvEQR0eLjuynq5UmNhhHjJT40rNX6LxyuYZcijWS_tHiu9iMuDHGtlkWkstDW7IyQZlhStRSr0LdKo2TdEbIrI0OlggP_1Vm_ru7dM61UPfBLs7TxRZmVz_A-fzi_c2H1M-Ph5PJ5Bs61QlVmZVFGmLd3yphkRtePKRQNMhUkQ41VRBKKm71VNdTWfZ0_FQbF2Td7OLi8mZ2c3Z5MYxNazxknzgQlTepfdw1oanVNtxZmxxjQSqC46mUcPauJJUGIufOITmA-UPNvpkfs0JI3edrV3R61GJKtJBL56XOPM96aUQg99PNzlpg1sPE94aj1ayZnH3KzB2phlTbxEbydK4kxqIcRpzJILi2qfYhAhPfMLyTjann0innco3a8THD9z_Dh9nF6RDmOud2BJdXp_OrpkqUVWxQQLnY-KHyoYe0Swkd4ZK6q6206zSO8_m7G9JhLbig01oz-M4bDhMq-ggoKT0T61JIy-NYLWzetsBUGsMk7AtrqlWxc0bw8u7T7enZX27PLq7PTucUrNzjE-O1oFqJA1HSmiEW1MxrUb4awizKuHz37np-A4VgVy8QFnK1SoVD-jDTnYTSUqnGGXFAdTH1ST_S9oWj2A4-FSs6Tb-j7wvHRz7AjUcqYN9f_sTHx60obgKuVGLbDn2ZQmFldCyHSexAqNkd5NPxcWhMzku6HyaVTkg0K2W_6WGUSHH_WQu7khrCTiTaSIEF0om6ELEHQ7gIpwYFHRDVoLQpCLjzuPF3nHqWg4RIdKTXiDxs4klnSGl1i9trnAs5mDstKzmYXODENmozoZk9LZecRbwicjtBtaTyRY2FOsPV5dlp0IcN7O6GqULUxrpmtyzD3vkgpOKA4SmU_Tagwamd8GjsdE0xY32TAC6hi0rRvEKdJPGWPuRAIVUgpBJBdXvA55FC_TIMjanE95uhtJUQq_4L16RnrUFTi65NpXJYGd48wujMDiqptpBTmGqxDcfI-XIX9uu933_75x7vvLSs3vU7mZ_myDgZ8AktpMPMB54kvabu1id_1GILC_Q1om7dwX02pnbiHEKhHVJCucZ4Bhyf0tG0iR3TReULY-FeU6N1Zo3cL7psm_PNDXKytPNpKRR6H8oKWkk7N6MuApzkDSwzisb04BcatjEQ7O0fLF8vD3EvTESkZYEbeBCqQp7Ow1LJ4cTrCG8dS07ZPpQmK7AfGzoP1Fobz7sySH3vhj3GcvY-xI73MeJOe_D3HkClycfrdQ_Cajsd9SDuJuMT_hIKflX2AJ40wl6PEZEnhtD1fRgMBoOwm4bsDENR6ryD_8-H-X0S6j45lfghDVJx68yUye5r6TCFUylWTf_i-SS1LFtp5jYa8JrD5g2IVZ_LxGA8aS73gb8MDmgjjZQ1EiVfGRwcE6kzVbrOjPnqYHLY3OsDfxkc8goayElgHBXTxEQ1sX40N4VANQ6Zc7uGup0ptERLcSlWXWBPdJEY6tw8ISrUK1847kraMNcYnS2TkINrFNrB3uOhKrhxb9iD2DLytwF-oMZjpbFhpdGExdB0TEG2u_nHC-32Hy5MH30fP3qggwTscGiv8HLWA_i1E36pRpxwWi0rmoV4G-l3d0TKgc4a91z4JWO54ND6KeP2kYzlde7vXdVa5RmmmzbXultQe7_z0COCxwZROMe1evDHPsxvTnMYz1ehTundjSSlFtXoOF23gAJuYIFbE5eHOCYS086yyLNC2KxjcXZhzmhQjbD5kTk04ridoCL7bhGe9TW7Gl6ODw6mLZzUwZZ-fcJI4xcZjejZw6e41DOM6i8xOmr57GBaT_nUX7Ts8KgxbAcPe8rHfV0ftu4RlvYMo3_BQ4lTN_V2opPGgT8clN3o5LlC5m_T0t1BzY-fTZMI5O9dhQf2WtLjCZFWDqnqhZ6VuK84LtKLhM-jk7vx0UYdJ28SHHCoIDjQUMGPkpWkpXBXNHREfw4LPeoKbrXoCr72VS5Nx-CD1mCzXMoMd8XWrdjPoa6d8Oto0BV6gwKujFkHsUzfsTaX-rG1riP2swDvTri2Suxaayx2pL45bqQ6b6xY7Vrr4LG1z2DJj8O7o0ZX9Fx7K3QWpR8RmDMeHzXiaTLc7grHJyc8eVqsHpWx0fPC3wcwoxteHdNjeLWJWBrrhXInz0EzcUIKIObXEjE-RQaVlC0dFCdiMlDL3BcwPuRetUsPXfqD6Tc8Q3-Bvu7SH46Hr18fffMFerdDP40KfYF-R5-jr-rjdux981Sf1uEYg4Nb3UqJX4jJH-vLNBU27JySOYGtM8KElqQOrSTo4jLmalocBYyHh7AGgsM82kEuXZZe5KTG3A5xaRXiQA0gcMAonBfbgAr8iRZvEi316i5IZkm88gSM2BNMHCZeR7AQOF6kCcoABkWQeUrfgC6NTffMKS13vLlQ689pg6ER63YtpIYonkwOEybhopRFnQMI7gGFS09nUUudm5p41FLHaG2fPZqO0mEfhMN-RA879ONRK-t5-nqX_uhg-kV6t0t_QPXri_SP9D9-xL8NvgZY-bd6b9jwnsC_8XK3Zg2-2-lYEaqL0yoTt52FaNtiBzvErQXKEOCxrKyWnl7P_htj7ccOduPA4jIhikJntN2HXxq8nN9-PJ_9ML_9eHn-c0RiNAF6EWILtAFfEsy3gbpe8cAb8A96VTNwXgQMt5SYIaSXSEKDWDijKo9wJ_xd2Pdozwggh8jumTGD1y3aQOreJYiPZrQGKKf8dKBwReAnAbY7MFVa_KQP-Z5wxGZf5l8AMHpmfHs1IMcA-_zUTDM4PBBKrmj_DBZJEsYgTALVO7BmegeaVBZwfX75cX4a8Ql6sUCcKd2Xwsa3HA0IZyMAzy7hiXQprQtgFulJj5HgIXxvfAEL1EwelmUngq1j3tv5VUyEKEXg5YySOVTaSwV3n27f_Xh1cXbz49X8lnxx-8Pl-fnZ9dnlBZc4S_YSlJ9-IcCsmU2CDfn1XMc9f2rKYSHCy2TICszuMR_CfzOiR69UCRpgvCbhTNvAmV8QLG_ZpFB2A8gTX823QEEDxy9vHdJvAwJtmtvp9NrMkfnb5W2O7h7Cuyy00A2mWE8crtb0TmjczUdw8hfkvzbTdqL-ZOx98PseBcLqVj-VR0yXn5EX150oJ1RtkkML8-Z1K-e6QNq-oxBXP5VCr3oBPGOnPAZRO-hPp1MqLMzzzWi0eTMatWMq0Sa18SlHjwK6HCfHLcPPcESxR3Arc3xGx3Ca4d8wqr2ZjvrHh62O5IHN4bSx-_uOa90zOvKRdzi-OZyO-vxzhn-J4w5Deg9ko-8mR9P-dER6MZPDaeDxnK86jx28Jg8dHU0fPWYJc0Q4OPoah8NRI_c5wfVnHptMGrlfEVwzKim9wgjHlNb8FTP_DATKtxkYv11sYS-9YI7Xie3ewejg9WB0PBi_3mMk5tfe_wE"><img src="../examples/hexagon-pavilion.svg" width="270" alt="Hexagonal pavilion of six wedge-shaped galleries" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=rVrbbhs5En3XVxRsYBFPLEW3lmRjsoDjySYBclnEHgTzNKa6KTXXbLJBsi17Ai_2I_YL90sWVWRLbOtmTUYPhtSqOnVhVbGq5GO4gH_3ul24h1EXCrBCzSVvS37HJRSV5VUB__vPf8HlHD5efH33tv3m1w8ff_nw-R3MJJvbXJSd1nHrGL7lzIHLhQV-z4pSchAWZtqcA7_j5sHlQs2BS8tBqJrEvkIiBtmCSynU_BQWOTechGmZtY7hiJjBij-4J50ZljqhFegZkWWGLYSaH4GpJIeclSVXFpwGqfUtGDHPXQcuHKCJBQgHmea2dQxKO7LLaF2AZFMuLaS64KArBwV3hltwTMoOXGlvVimZgoynkuF3DK7ev317fU62A5Ss5AYueiCZymzKSg4Q64fKC2srnoFWwMBwJmEy7ME9JGdDKAqwOeeOsGzKJIfeeb_bheVrkYs0h4LdcusdCkwp7Rj5gsFM3PPMu-nLZ7h-f3Ht9SPAja8Xg06CciMHnELXP1swKUEKxe0p9OhJwcxcKHtC5l70gLmgoLBkZqrVHVeoDJPw7s2raygNt1wFBWfaAIOymkqRwrQSMkOf0BEKS2qft44JKArFmdauNEI571SUmdC3AzzLAtmFuoWFcLm3AqUghssN561jyETBlUX5ac6EssBU5gmEkxymUqe3HfjF6JKe3pDjb8jwJSkdC7DK6fZMOBu0nKFvHGrQO0-68Ap656j4q-CUV_S4Cw5zAtko1DC0Tz0oK8IBd1oUVkeXwj3AJ0q3I_jeAqgUshVFC2BuRIZ-aW0Ks1YjXloAShuXQ1W2AO23pDowKVstgGNot9tttElKeAnWmSp1leH0-NBXC3yciOy1B-T3jhtBZyDSW8WtpZP6Di-6p90TeNHr4it-O8K_J_h9eJdKbTk8el2v0VOlUPwctOIwggJSbYzIwjHPKilhITKX18WgjqxTHxSrwkN4uuTKh90MhOvAB2fBLTTMWIoJXdcdJR_IMB_YcyYlN4JbUJxnndhoVO13BSUzTlCUr-zu13b3R97CYHD4-LgGY3fDDPoNmPAx-OkznbjRC8jEnci4sfBiqTYFnPJRx82dSDlQPaJizYEz64Cr7GRp2Q49SHs6P__uqTU7WJN-zerfHcA6ntSs_t3BrL1hw3nhY3Dela52OY8rZ5hK8WaR0ifvt0uwjqW3yxKRshl_lv8G8eGFTyHwn2PNcBKz-08HsI8b0scbpYvs9SL9fYG1bRfSqIE0OlCRSYN9MtqqyGJ3WnjBwwbOsL8Bp3gOTtLASTbhsN3Z7l2ajGO3hE-PUfVVy3Rt_8CrBf7OE9nrOV3HvshSB0AZck9__c0OR-8opB-gdxQz9olxmdb7mPsN5gExLxN7H_MgZrZOG078y-z2_Ih2Txla818h6RFUlltANjbnEZCezbCkrZBCdsdo_QjtC9HbgOe5o7Nx9ZXzV52NB_PHEwoXqeZr0X3sqEutUl0ZWxubCpNW0vdP-ZMLfFm0_qoQGgYdQ1aSjlSg7vuTDYc5jA8TlSP2Rn3zZk7WIN7WFfU9kzKYilX2wRsZ6ZQQaKPqRce6Ua8k1ktid0iRsaaXD9MkQviop9OHdc9HcIuURWghsVdogwjsIk25tWIq8bYIoIu0gbXwWKM1j5HT6W-N9u0SvumCq81ARQQ03Av0aTMMNqEuAkrWgGJv_xOpA0zlhBTuIcLC65CgJuvGDddO7pLN6oDPBLZnUZiHhs2eU16G6cHoyh2UnoT3ieHUWYfeC59AM5ayjJ-AUE6TiOUljyPVQmR-lLC5lhkEEkpovOwzrQ1kusJDpuA_i-4x35VS4bHUbunK1TyhGJxFhFiiGoR1q7oCDm709OhG76d3y_bUcJZRa7uqYS43uprnkDKLc2fw5inNvqiK7TwR1RtEDZYXhU82KrSPapQ8h6qXrBm3gSo5ew7VePAcqrPBDndeRS3yebgebNOrYYKjC6x2MM0NnviU2kKc3fRCEeZyLKr7b4oC7Xty3wz4QOzEETJZd3LPD3hPSMKFt4tkW5wtp6xlS_sSfCWgXEavLW2XWB8bGobaNd4hPlSl_STJLjv9uSYNlFVmUfIuUhbVjblkf-BX7fYPXo8LoTK9iFKjGTINgsHZHgKfEDsIuqck5EnsNgiGo50E9ZTZfQ7VMHmaAk2qZK2erRMlZ5uJolal3jGch1H6AVItq0LBlD1YOKSG_0NXJjBbwD2IT54Ae1qn1JQ9YG9usnaphXI4zxmRta3C3aAfdCV38ObiN3gNkzGZhJsjgYvJbqczoP2LJ7rvwmsQ8JNvbOlx0B6tv-_CS8Q5JZhVM4Bt3UbaPvx0ED3R9sbDw8A3Mzwusx13HhnnZWgjVxuOlBmDvuPCYPWiE-o88U4_eCeS7nuMl-Qnen8Kw153n84buJL9XMkw4uo_V9YGrs2y4jnNMiUcMw-4W8UAtn92S3YMN2yO-0fnZ8mfRfb3Gyy0eLdwluZQCp5yePMbXH75fHX99dfL6w9fPp_X14rlDkyF60up1ZyWioS6WK4kMl66nNbXNmy3LG21_LemXhMLCxk34o5nMDO6CDtli32OCEtWvyhT8OJGKPgZrwFUVaS3fhuGtCf-imOQMseknuNOO7iIdmQWlIYbdOwNLc8ZDioedwbfLq1fGRte2-aXo0pDqrXJhGKOU4-C3disvZqymREuL7gTqVdAaQKtRacMG7wMqhJmUjNHl5xBN9At4S9k8hmFdGWUIL5FCo3T8WuH4HYsghj4i3TxfCYaKw5lmmyRNGVWqCZfvTEMnOMzugzrQP7TOJPBNpw9VhSb_FU8n2nlrwOYJlskbbCz4ectRh4GMt4Gskd_XCDVRieBie2XHLHhQL1Bctz90Pw1E66Nv2T9SPez0irVlXLc7Ayfs27sFBoYlyscbnATf4S6onYNbMfqCco3q6Et8fMiGol_aqRrJN6H4zv8Q3BWzjM85SUVyx9sHVeKZdzegm8R_egxae5HYk99XYpHLlIwbEWiw8iZ8I3xYDhAvLP-Ei8JQUEln-D3QXhfdZM1iE18qzXBcEg9eeTjcbd7P474onY89H2W-6r8N49zaIdOgF8UhylXaU5XAP4s5HXCdrCWg9eJLZmxvM0lnzPl_MjLi9L5b2956SCVnBnQM8KtG8e6vWRTfcebF0UQi63LWdRlr84xeG3e2-Kz_qBmO4GmzzawraQNk53S-ttO6GyntP4WaePeTmmDLdLGyU5pgy3S-j6MtkkbbvOkHz03RN8GtpW0Ufdp0DakJTs9uVVagqHuf1H-DqXR_-Kpe_KDLv4TgPp9-gBHFybNPzL8f4UME_So3-2P2t1xuz86gsfWY-v_"><img src="../examples/museum.svg" width="270" alt="City Museum" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=rVvbchtHkn3HV2SADyLDALYBEhJFrXeDlmibMRrRQVKj3XkhCt0JdJmFrnZVNSGMwxHzEfMN82HzJbOZWX0BCOqyNl-IS9XprKy8Z-IAzmH8fHQMH2E8Hp3CCrwulgaHPliHG8ht5RHWufUIztqVB6eLJagCbIkFpLZyYaNcNuod9A7gNsf2I9AeQs6bDUJpdRHALvij0qhiAKrI-N1COx8g5AQcLFRFhs4H-lbNbRV6B6CDgKkAl7dweQPvrm7hHK6vrv48gndWtmoPGaZGOcxABTicJkkyOJ4mydHwcDymNy-SJDk6E7TeAT-baaMX80qbLMKsnSpLQnG2KrKBHDVYXufvN0J5qozh9QEUzIg3M1jrkPcO6H3l0c9gbSuTQVkFmIxhNaHjr1GFHB3oIgIujLUOfJpjVhkcwQc6JRapsR59PLnqHcR7gZA7xKHH5QqLAKVyQQdtiwHM1nfM-pmQhw_oNpGnhOhQZb5hPvzr7_-gN4QbnzyAWYY-dXqOh0ejYIMyfjbgHal2aWUUPYfJzYYLbQxjeL0qzQY8oofCxsPQATFKxI8X8P3568t3P8D1-7cXIzh_LCA-VyUKlXOH6l4-LZR-QFirDXFNFX6NJHm9A-ivc53m_E1mkRbTlekis2sw1t7_d38Et-oeG47creM54iJbyKlqOp6RMHy4uLmFtTJmBLdECb1kWUDfiG2zYwDeggJXmUh3alclC17nMVEY6JOVzjKDNUwjaiIeKT8p8JOGC5XqYjmCS773woYz3rJUxqDbPPORwyy_8RxModdZxK9pr7WLhVdp2lPvQOUDH6FDLXGOQC_Ob25HcO7S_K1iRSfGsxzON1A6OyfCbYHykJDr9L5A78EuFoAqzWGh0uakgs38tesCckuURtFl-tS9CCjKAQrLRgZsmlalRj8AuWvtAT-qNNABVHsNpGpFJh96Y0llFypVGYIy-h5HcI0qY9JVes_3ccZCCaBcmkMt7oS9Kg36_2iQh2z3RrxsOPzZ2wKGQ48G0xAP5RmJHt8RM3BYWhc8zPpykf0z6BO3-7NWQe9w_zq6x_6MtKp3IKykOyH-nL--vrq52RXBhjVrunNvV0jXwoaTTTSZVFyxaoou_vXq3cXNCGZ_o3VGP9CqX-Fff_8n_Ebk8cel0w8qYPO5nJC_8ugedNr5aulsVUYrwtfmgwpIl-vFvK11sfSk8rw_Vx7-enF9BUu0KwxucyZGqt0GumAxcOiteUASG752swHlQUeZYuPsYI0OIUODAUkf1YqYY12mCxVIcvgTnfkBzDcBhzrDIuhUmd4BZE6tWcv-jKs5Op_rkvj45uL12_PrizcDKIgw0MUCHSn1wtkVrMmokdLTSXOiofDkFPz_yZfcWedCNiLT0bTCHI1dQ6oKSJVzGxLXas4mFvgojZUuLKiVrdhT9g4aAZC7rOkmITAZ5OqBGOD0A2YjmG2L9K7Q0g34GThrTO36lEPloSpfwWw47F7-LDoL1nJRd9DBkwq3bj5aJLEqCD9dvf3fH67eMXcGZLfEUYHDNChyXP4MFLyX26t1vvUEtiD-oZilKuTiwpQPI_jgdAhkwnwNyWEIGUxmQ4FsdukbMnUkcjDHsEYkzFJjir62R1FKnNOZdW0A0tyTIBrtA5sZWRfBg16hJ8NM_EuxCM5qsjfGkLTvnIdcIx13y8NJFKUe0KllHRAR-6rAUt_IUTTMRs2RXVBpVIoZ2d-cKI4Pi3xyK7mTc-MtkIiewczgIgztIiqvmtsHjB4wrC04FFeuDGSa7kfbgp235cAkGkOgCOZV7wBm3mgyKDPIrHV-Ww8sa4GtY5mWAYcKDKrojzwbAniZJLBasWngIGk8lQ86ohR3xSOu1eboVTTxCLPSpvcYhA5YSJwhV0qSbItRj0Ob_uuGih_Jivfh1x5AVZAIr1Y9gAOYLZ3OYJrMztoIypNCwDhJxKlFFz9bmMrnM1joj6FydCkFawYoGI1G04Td3agHEBF7AKUinT4_lrWpKrEH4FNlEMZn44SWFNaFHKqyB5DplQdVBQvKGF4YZZHFvAdgcIlF1mO6bzl8s4EsEllZZkBwiKF27RTGjGDmNakx2QsOIigMfEUCVqgVeljoB2S8zv3boo3_HlkPgeN4T552-OFoIF718OJoAPhLpYJ1dyTHDHx4M4iHjJoXVxwNwFeF0x55rez2VeExxA8-HFEAhhu-DQVvrs-_v7189wOj_njx_vry5vbyNd--IptQYhrO2nCFfExhCRFWNkNDVACJe6goKigyep-pwFdGp4Jf6yNxGJXjSvuSJVzI_00YPxwOh-BzNIaOTSJQ245W5DkgGn72rwcxtsy-ZUDAjwGdZnGug6njJIFf4TAZJEdwOH5OuUv7akx6c0TfxlecKtSU3q4tLCpjhmudhbwr3pmFlW2D2bV192esWHPMdTyNHHrOKrcQERwwLK3ThchdY03ZAtWL55jx-hFcKHGDqs5Z-LxzTBXlkmzadCFyoj2ktgi6qGzlKRwgKbbVMpegRlO4WCpHHh3SXBVL9KCM5bRr1OHk-o7IuCva83a4Oam5eSyMEzbKm98eg_hPg5x2QU4jSKOdneQmeDSLsyZWHkQ_EuNfP4CVDjFXnduQk78p0PntYzHepwhqs9z4mpNc6Ga89ZvjLrHjaSJ-epwk5JrFuIptJZdK17fzWMCCr4aCHqLQrjksKFWBZpvqpTJ3a9hL9njKZBMtNdn8-nTPdRAMPgEjpx9POjjyZh8QeevNJ4GYhoaYfbKRaYotPoXxstbTl0_J170Oaf4FB2pPs19KQw5fgPI86UiqvNkBwmz8aaBpy1F5HU3OI5zJZwgat9oS3zRIrYEVeyN5BWadHIJiH05CZl9mYLsZTv-t_CcgCQVAYhedfevu4iKqF9Ui4PXfEOiwH-mTGIZFlD5wXBSxGeugE29xpCZuWUROLZUufIhGjx9Fz34W6wqcK0uQZvSSakzlLIKSiWQk7aJVxoysX1WyHyYnh6mlOlST9EjpiqNliW1X9iGG2g1oQwJ9uUUqpcfRqnYZFFUnHhFajtUEC7-Od_l1Qfv6wi3ByCXA6YJHnSLu18qzH-0NL4xwsqsXz9RJRiTFkKrdtnPmuL2N2nUTstfVkbocUjOKH9uE6EtNngk_lkanmtLRQ46V19ojzD7cUR3y7u35dxdv767e395cvrmYHe3ysQ5yS2s2S1vwt7BtB7_WlNcYTxrBjmWNayM7fxBi-sz5U0Z_MU2OhL3dal-8M1bSrfpA_6f4Yr9asWUh8JoU-usoVtJe7XcSN8A43m6MIx4DTqSq2x7vM4CTzwEeM2DXNAlg8gTg8R7Agzq_qlM9SaIKXLfB9VmM06tsQzGnj9-YDQfttuxETzAeRNiYcEOGJacKUoSQUq5YkNYqDMSaiIFgxcRsV_7k8Uwr1PfDKkya3dG6aefgN7QnHtouFjrFLVmoC0L9m_hivyyw0yMtCx33VovDI03_k6zuQ7S0cffu7YkL7GAetxfImJMO5ncq5LS3tt60ewewCtpsA4rD3A_4Pmijw6YhspL3NXeiO5N8efg7_yRh5RQadDGLSUxoPwoWopmekQFs03uzGcbSgZyT-iNGz5HCabNhXOqjqC7UDIJySwyDJl4nQWyqOFImu778y8WbuoXAtW9tuIxlDJHGyLGGx1laFXJLkW5qGLF2ihR0egkYtJTQq0DVNutgY6sRXBW0u06PGDUWnbGxxZTGNI2E0ihdcMCtis1abc5gRhxrijBozDOy_GuKz-vEnSNenX2b3UlyI1ZrzPZQcigyEPJkSdgom8aoN5FxcutXj-ogVPyk-gm6plCrJD3LUS_zAEvlMizqyhWoNFR0caA9u3CGVfLETGojnJxKocqvEUtAzSan0yaAWBtpkxFKPXxuTbZ9YqlHG4glHrJHTSalAjyn6C3y4DRJ5CR88D0oy20USVwYZdqgTJIGxdHx27yJzdOAuwiqPUZhNjA-nnKVaE27YmGPL48ryzFtuUcsvaRRVEbwjJsaVO6VFLDiA6kmouu4hxOXmMWyGk3GUpAie2xUcS-Xfkh1E8qIGPR0mrDk1_aZ-FKaitKln9VqfjSIBbJZy6y6D6j0iruFIV4OpXvb9yFGOp6J2SiZlAowabl4-piJLYRYxmYv8hW8mCYA3d1d0xGtYQshtnAH4oSu7ikI2rEFIYkOQ8ScRwUYMxkC8XIXorXznbNwftIKpWdCpsnTKLRjF2LyCOI0-TTEZBfi-BHEmA_zNMSxiPZr5TFr6tISCJTV3Oi07qZzh4q2idmS8IFjcapckcKTzTCcYNdWQmff2jowbzIXsVi1uk5rkxWT393du5H39u7n7e4YbO9sjwk-bT-ZTGvvW28ft9vFmOzbjtHZ0pPj_ie3tz41Nt_OqGqOLrb7fBwh-BqfGtueOvu2qFMapqcutvFfx2q19n9nc-SkHCahw8Tdu7zct3krNmJObm8-eXozbm9-_ugWX7KQP7V5K4LizSfdzc8_uXkrWuLNLyZfuNnXVQfePCF-xUrAFzDM16UGSVwmX7_5uCH7uFPO-PzmdbTNEOMDiQ6_8KqiDt6ZuHlyOt3efLrDsFbeR6NRyLHYU2r-msiydrM-zo9wcZ2HT7j7DBmubOGD48BxtNXR1p7b9pjtG5sg2GZwgiNTdsw8RPBqq-EtwwfkNKmrt7ueMF5Ji7M2Nwd1mlMX2rfLJx1eiEXgI0USuSS99Qi4uXp_-6OUsps2bdM-is0JmUFggFjLpgEFrDMv3LI5o50brkOpJqPeNomTPSbx8fZ1O7g07SpUdzuv3LsbO_msbP-a3Vm0YC3tj53BI3O8qFyhuTH2O1OcFsjbhQIqz7SlpiLNKaK1JXA3TpKyyUmSfHzZSVbtQvW3kIKaG9xCogIQUibCCHSyLsItre_3nsKIhv7TGFKokm39NrytTbWrCnAUoG5lJJLJx8bAK5jZxcJTozPKaKZpqEOmamguhFG5sf3Mw-uLd7fXF01TRISVO0edATtrQ-k0dQxTu-oIdKqCMnZZsTS3h47U3nld3DfZWicBqkd4EhBKYXxC1o-51MZxnSsNVHWIf1-Edzz-FF5KExLovgbvxafwFk5nS_wa-qjotI23BUjONVRzWcGetpXhIQft9KSOMI9fJMnHF9wbblHW6TZFAjWa2xCo9S6kPJ8mAnGyB2GuvC4AHtMhGJGUDh0kzSfTpLeX3YzCrn-_RlKO-PE5k3DA0cdHjgTsghKk1ZxaXWVpNIvyXG0GcW_MmRu_UA-_Ufe6YJx13VauaxKqHY6QVZfvqOraJGWNwDcq4JCmStHVHWIaQNKpeDDqZ-WOZF0mXkJ-xiH-mQwDoNQY-h-Uz9H16aGnkynliaxz0efQ6MFIajXO0kATvExmNPopOrxSaa4LUtjvzl__iTNIyROJZF-VNEQpXssHZDNBSzrzem35g5qiQXrQIhjksJk2thiNTmc0MqN4z9DhL5Xmyd16kEFRSY9BH8ajySnXvw2qh3qklcqMfIwkTgMRWNG5wfpOJXmhMjqPJkr7_8Pd95f_c_v--uKOjnt3e8U1cmntd25He_C_VMrhUPu8uSs2bdJA5opOrCfFEhRTWtQzv8XWYBT3NLZtmXAmxnwnL6fJ4MVxU9h7KQJbG-_6hpsL3KlPdIZxulU2pog7oTJsxEGDmntrqhDnfDw4Fas0Ss4jKuSbKlqMa0h6t6ptccBLjDl1wPkSm-NJwSQuYmCqAseCQ07xjIQ7sWVP8z88-8UlubbctEJVhG3GZejvY3pJEcGLhmns8l50XB76-23HO7f2PlU-xiNcsG-LqWwlTjrF2bi4Yfv4dMeIYZG2qQoli0lb_afYZguNFu_4cJJS_hMzyKXvLTPIpbwtS8YF304l_I2t2KFvS5bLnJ3LKU-kpdk55okUtlvZktWfOOYOlZPPGesvovIR7PH_G7ZRBm4EsZLWhYqZLuA_SYT_axbrFSzYnZkPhzLQLLXoYHkUaQTnEswYxR6mGV59NFCnfedMj3p3zcB7O5It9lLqbv4-aoHUwQPPY1Jbmcc3eYCdJ8mprK7YFAcbW6HtQ2sa6bYp2435csuycadB8JMsjjx7nSvtfF34Yx2k-JBGQFD5qhkxre2ANColFZGXWdwhHAJbDKIRYZ9Kvi0TswionNHomviQR8t0ts80pkQWn6cOkEfpRxiS0x5A-9EGvoG2uXIy5QihI8XdCPsL8L-R0ZM_GF-Cc6F_KvTXH21gCC-nu_idkP4LQL-hkaw_GnQPpV_Cid9D9FfgPx5peuZ5NKPIRvCBCxAyeKa5VB1HuXUmDpoMg60CTzo7zsCbgd05NrEMCX78xYja0spmZnFmq0Cl2Bl4tal_DtMqPmss6wzXR2UtlOSad34D1MS30m7s5LASYVFT4A9p1FHGMOt0pIpnMiHNzMraab91bSRjlNO6_dE225tBuYp_g6Eo2r29uL68un7i5z8cjcQZdk5W429kYsYg9vmVhL78oCKlUfK66yI_IXGqbH59JEYpTi7UTJeZNh5ecZaGX6hbIxEIPbj9vREf1PG8_bTprwjDpW3T_kisjuNi3Ht-TAkYkywzaxyRH3JS8YDOqSL-LuUlwQ5oFOPN9fmHy3c_3F395eL6-7dXH2QQgwjkLRRAQbz-oIPB2K0unf2ZBl0fzQ7zt5xj3M030K8HTePnPAkxSSbPh8npcPy8zw3g33r_Bg"><img src="../examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="../examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7VrdUiM7kr73U2SYi4ZY4y2bNk1zgguaZg7sdMOJxjPExMYGJVelXTrIUo2kwnhPTMQ-xDzhPMlEplQ_NjRNz-nYq-GCgCoplcr8MvNTqnbgFCbDCTzCaARL8IVF3HfeWFyDR2tFhlCYyiH84__-DkYj5FaspF5AiRbCwAHMrVlCqvABVQozZbJ7N-zt9HbgdEuIdOALhFklVU5C_LpE8IXwYLRaw1LcowOHmoZqcJh5afQAhM4b8dL1dqAwKxBQKqHBibUDZ4ZwLrIiLE7LCA3G5lILuw7jZiZfs6AZZmaJDqR3YFYaSrHA494OpMJmBWRmWUqFKays9OjAm5Vm3YefRkP3sBh0n4yfPDkIT4TOSWKOLrNyhrC__6szOoWFNSsHIm7G_ff_pEM4f0C79gWZw1TeyRyDjdiMbPa00tK7dADpwso8HZDoUpRo6ZHLhEL6I5dLB6LyJuVJ0oHzwmMORmfIOxdlqSTvCZAWbfw3w0yQe4zG3k7rHelAOlexCPa9KxA9sLcQeOHg5unFOdxMTy-_wOUNXF-dw_WH_zo_m8Ltl8vp9PwKphdfzs9hevn5_GYIl7kDYREqLf9aIdxeTi8ur0AAm2QAzvD2nViSLqnMT5xPSQGhVMBnVJuUA208CMiUcEXYta8xlmOmhBUEoIAwX6BDXjls0xVi7ocwpXdO6oVCmIuM56_oWQAjiapKAvtcGWMdKFwIdUzP11CIBwRtCP_aQ26M7e2AmdNLaQlcNXSl9ik4L5UCiyIPYufSOr_PYkEJzSYXjgZkBeYhqCIiyOW1kxpU7e4NH9B6mQmVQma0xswTrMm_bMIQxjNUZjWEs0LoBQbP8Ys3DiShlDRcmwoW6CG9vWM_3v3p6vPp9Ozi_GMKVvgCLdlQgwAnFWqv1pBLF9ckXWkTAQtpLi1FaXQA5p1MwWtFr-WYmeCe42ANJReFB1tpB0IZgp93MDfGl1Zq_4bC_tP11c8gHqWLds2lhark1VB7pMXY0cLzqDcOlLALtPuZCcnAI6DOh3CBNkQZLUQ2eGSsw7rB38KaSufRO1G3zjLsHA5Tkd1Hl0NBECXFMiWXM1LYm5WwefSGRfQ_NeButwaMUARvymBIyIS1FKi8wdysdDrobJDkFgimLI2T9Y4YxpT3lDMBvzRGiwegnBFRRxEiKC0QOmfO24oQk0mbVYpd0dsJmWFVkIHwMcPSsx9Qe7sGzBc4gFUhsyKEybrrOudN6WA0HE1gCa4w1teGISP1dmAllKoDzltZ1qHKud-aymNr1zakajjfS58VGEOKYByW7e2AQr3wBcwry0h1pvIFxcEShavIZgeTBJZL0oZyG2Gv9CFfHCRJbf7aVgMQCyG18yB6O_AuSWAptVxWS8ZGjGWL88ph8CyXl5X0BYXPL6fTi7vp9fXd1emXL9e36RA-mwcuda2huISFDPA44GBYyRw1xz9v-ZgehooQdAvGIfeCFkvMARUuUXOo89wQe7cXf-Fc_Mvpl-nl9PL66gY-Xl-9mcLn6z-fk-URXCk1sicoVB5PDsZJMuA1Vuj3rTHL5uX65O1hksRaRiMya5zrvH6XJAmhif3xXH7WLdpLJTJsouv2jNekrCZ8wauSFB5dmBVa4GdOhlIjZuYhxKthD5uQiThnOy-y-xb_2hAiMlOu90vhPB6TFqKhIb4xQR1jwS-c2msVciukJufE1yv0rI-jNFyHl6hzmnQwp117A1nIsdIFSPM4ih6ezKUnE0pREOs8vq2ttIyVdGUC6O-lzh2gsDpWEzbgRjKWSlXOW0pqJMChekAXvLyRvW7PqCqVqB2Y-RxEyFOj4TuKU0JPAG-dGKQG6dlTpLpCMQ_AS0uT3aNPj7nEcHHUhm1trcyN5U1pcleM-nfDd7AcQ6aMuCcLxKTtFC2pcO5TyK18iEYuhUYF2liKXe1J8nh4SCpS2Cqh77vY3ZUeNGLu4GiSxMof6NxRkkCpKtL4V7Gc7UWDCJujDqbl8BNBEakXKe9xI62xe0vKiGGGyHwllCJfD-EUKDIx5CBHXJi5koaVqRSFSggTBpLkoPZipvAncKsqcDwyIA8Gt0Is4_Y5S3CGrmEol6gd8ZesIECKmptReDQsggsQKnwIVIcS6BCuDHliPyrKPuSlCOOBax5DSlu7If1399LeDlj0ldUOdKUUzI2NHJGACLPKQxqkpSEN3t7d3F5e_Xx3_eFm-uVPZ1NiCpnQlMzwATVzzTWwG6Uno7Xmjk7gk4QmxiPgw19-Ob25gZLwRybwK0NaEzYoA64MeCuIDktdE2TW-AGFilCNcNAmgoVh4g2Uwt5zwvCcoWoDBximIVD5DBH8H7BLCW9l6vpEmYDdfQyppQzOjKOpLoGtMAEwzvPCbxwp_IDWkX5takN6xUmESpStNONNqHtK6cKFfI7ON4mS_kGrmzAMqtQCaQq9JSTyesoNe1yO-tP6TNKH33oAfIKA5bIHsBOOETBJ0uNOPiyF9ZIhJB2MQ97fyvoORlQsXH18SOeqckXKMufy0VcWmci6kKCHw-EkAWPpjyQhch1OkS0ZI_NKFxhKJjTgY2nROcBHkXm1HvYAoqo9AD7xwOkBlMZ6K6TvQTiDwOiYB4TcUZU9gOYsRD7vsYLXlScSLzJ0MJkkCR95kyT5Cd6-TxLIFAoLM_QrRB0j0vp12Pewc5CVDmZKcsljuTND1IMg5zqmWUmdm1VdAZvDbyzngdwQtakDmOzSJCACIInunkqY1LpClHW6VCIS55xSyFLmueLMS6eHSCN9c4IJmT16lGXXNa1FJwEeyXk0LbIOKlslmpLqLB2tNLlEoYdbOIEJoST-7ARwQ8Y0VUmNLo78CCcwSt4lSfx_CifMutqZ-OjRSraGzO41unrqzS-XV-c0PC60Eym7yGcoLKVLhu4g2tMbMsM-WabW8nwKACfAPKYRsEl0ON3ULIUUf5bLRIEfTs_-SAKZ-TQCO7xI6tq5LfNlO_ZYwgMqGEH_Zy7PwUshPiFOz0-CHaG1SmsWoN38BrvJINmD3dv4--MePfm4R4XWIfxtUxrHNnSiu5VGVv0NdtnKLCv8RXvc2xKzuiO8PC9mFMQkg9vzaSOE_96WwcZ4WUZYfPe20YJFsLdkfmLvmLoAUDZvFQcn_xdpO8kjO0aJGSroXwil-tD-VA5d4D7hNNM992yuoiQXY16Fjc0_vAph8ZHxFFf5xGP7m6sEAVtSV1kYEaSyhTakjt-2Us9q0tTvSF1lWxLjkShKDCaLEik4Hw_etRL_GMb-50fmJP0gsRYQiEowdijP-Ul-F5DM0t_SMSHZI7roC3JXEvwa0MrMgCldIERM4CB4a0tmNK3RsewID2NKB0EwZeINCR1D7jCRCyR0uEkjuWnQkkjGWffoTSu9caHhAqWR2g-iyN2DuDFKA1xABmFpZ5TM2wxBvCYU7Y7czFiNlhnncgliJbhidXe7yqLCGxueHDUbpr_anXT3yeyTX9ljzs2zdSmcq2mRDFV_NBzDsiFC9anRrbD0zb9RKhGh0MrjJMhn8WjFltQQ3wA6_H-VgWwQou39suUj0Wtx87HBzXgTN53VA_bolMLez0_MBrpZTgD4tqiQV8L8uuzmJ3ojiEeHG_A93FBja6bbWHj0NmzgK1N57ryyWjL7WWIuBfmmySFCZwX3MMp9jg-mTCFER5xK2gj9TJP7WxKdmQt4TuLMeG-WPLgVyTmQTkRR5I2Zi_62kiEP1U0OykvDKMzM5w49HE6SIO5tyKhb82fC0RlR89RNdfbZl12NDmmPk6TXgXZtXqK_VuY1RQnkGG7Pb6bgcMHtjV2pc3yEg0FNkrk_tJsMmFHsRaEctxSVe-FsEraRhmNrLqlDQR3wSNOJR0XxfB1A_I1zB3XTqCxRw6Mt7n-thPVo9-lwRLcDnR4V4SA09JpentsakgkvlFlUMVJaI0Yj3Dmp7xtfdEMjqnhQO4UBz0aPU7eB4qlHEn9eI3A8elng3Mp8gd8h8OAbGmamInL4eoGTl-XxsXpjQKSfmMcAI_y-bwNsShO2A4zO1pZDvREzzB5hH8bjyQA6z9awD-8nyV4MjQnj-sX9vl7yf9BetyRbQ9c3MDraWoRXia0auhwJ-XE0SQbjw0bIe6r-5I_QIu9BoFKBgY6h_wcuhS8R0B_KP38M_fwB7PN3kc_mkuYV5PNTGNuvuVuHbEJDi1rRM8xHLTd8mXF-wJwnjiKJm4X_tyUKX7yWbX6ITdh-VJbmPlVw3Ip7mWrWCo63FIxZ9cq04GLqELzh4i1SaFMzvvnqaqNTy6c06tFHdiKyLJwXSfDCirKI92extVC7jPZXLYpYaejib5u5kAMakkbbHG2xtC4tpdFPqI8vNgXw-fhrAmoLb2gwJgERqcLD2_GLGoyfcp4ujL6H8-gNbG-R_fHLbKmLDMpAXbZ09CJbmmEecM75jXXfZBPMmDYoE2X0cSfMPprqmZxOXMCaGX5V8BOawlyMuwRR8G0U0e8yl9ASKCVSE2lhIBzjffMmNMm4KRN7nHRuoC8YIlyZRMdWPPW4g-gZ3Qww-I859KDSOXaaQyR2ALdnMEPufsrmyjD2PwIjm4XbuOCb4RPS5gtfzaJFaJFvmfrds-SvOcQ29JGEbRHIMVXubzJIeKpMQ5O3eO0Gi3wBQOPndtXd1ORfw8_4OQW3cfk8fLY5AR2wYrS8nUySwftxU7RJuVFHuTMa3G-V-AGl_wD6N5iZbzSf_l37f1Ttf2X5d77K168s_zc0tr_RbjLzuczwdxCAm_bS9QUOsOTrhtdxgM90YxUL_3M0oK17ce-vrr08_rniC7-r_MbNfa0AP-lMhfFPS3DXlf9fJbjrmO8rwTm6-zaDBt2_keoOA9qbDIrufjvLzYy5z4TDZ6R-LTEfbfZCPkQJG-WXyV-30or6CjR-Q8B8MdxoiPpDgvApSz2ManLs-EfBfNkfvoB4qHsCTQVnu3mx7kiJt_5NiV5CWfl4g791Ig8KvLrivg-n1ecL7sv19uBV9fbHltsIum_4lURxp-E7Cu6m5K_h8OhfLrlHk6clF54rut0Y_66yS99sdZHLPdtB90OvCCO-fuZvPK0xc25ZlWj3Q7FW8h7DfWJo66JyNWpDizZglY45NP6Ng5SDPK37tHQV9sZxo5gLdN5Wdhu78NOLy5umQbwIbV9tIKUAS-nDynhzSbfrmA_rijAH84CWPnchyNUcw0uvMFKK0ppfMfPQn3a_KZ6GW9TgI_4A4G62hv6pzYpPQi_ic-p79MfJ-HA_OdofHfZZ_t96_wQ"><img src="../examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
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
