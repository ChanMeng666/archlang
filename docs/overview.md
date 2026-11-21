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
  # The rug is an UNDERLAY, drawn before the pieces that stand on it so the sofa and
  # table sit visibly on top rather than hiding it — anchored to the room, like
  # everything else here, never a coordinate.
  furniture rug   in r_live anchor bottom-left inset 400 size 2800x3400
  furniture id=t_dining table in r_live centered size 1300x900 label "Table"
  furniture sofa   in r_live anchor bottom-left flush inset 250 size 900x2000  label "Sofa"
  furniture bed    against r_bed.right size 1500x2000 label "Bed"
  furniture robe   in r_bed  anchor top-left     flush inset 200 size 1800x600  label "Wardrobe"
  furniture shower in r_bath anchor top-right    flush size 900x900
  furniture wc     against r_bath.bottom offset 750 size 400x700
  furniture basin  in r_bath anchor bottom-right flush size 600x450
  # The chairs are anchored to the room too, on the centred table's axis, 50 mm off its long
  # sides: their insets are the room's centre less and plus half the table's 900 mm depth, so a
  # deeper table needs these two numbers changed with it. (A `let` would carry them, but this
  # is the playground's default plan, and its built-in page draws no knobs.)
  furniture chair  in r_live anchor top inset r_live.cy - r_live.top - 450 - 550 size 500x500 facing t_dining
  furniture chair  in r_live anchor top inset r_live.cy - r_live.top + 450 + 50 size 500x500 facing t_dining

  title { project "Laneway House" drawn_by "ArchLang" date "2026-08-16" }
}
```

<div align="center">

<a href="https://playground.archlang.uk/#z=rVddjhs3En7vU3yQHjxGNApHMxrP7NoGvLsGFojhDbIOgn2aZjdLamYoskGyR9IaBvK0BwhyhhwgR8hRfJJFkd36GY_HeYieKKrqq69-WRrjFZyl04qUd24FIy2t5Ra1i1EuCR9_-gUX11j9_htiIyM8SRUgAyuh9W7p5WpajIsx3rrYaLtEQ56gA1oXdNTOkkK1RSOtmuL1HfktXEuWJVlIWxaIDhK-s1A6RGlrgjTOLiGLMaxckcJaGoOT0lk85-NLyIjnrQsvy6cTUIJd6E3sPMFTcOaOAuRSahsiQ7NrzkMmnGKMk1JbPOfrl5C2bpzHx59-LScoB6VkkO-eTiCtQmwIlYzN10OkWqk9u2CkVnBdRLUtxihD9LotpyiDjoT3CNETRVjnY4MPZXInJLS4dljIWqr-e2ukRey85eD-JV0p53wxZqlehtMzSaelkSEc_LKUXpGdFgll9KZP4z9dF2iE9wXQWR0DVqsCWHqtMBc4-IzRSh9TwgKkJ5wJgdjo-naCwNkpF6YLTbmLspFWMVFIjtJcFOh97NoCUHoVIDvOqzEF8GAwigI5zFq9WN-wawBoE8lr55GtWwoBMyHwHidiIp7i5NlcpMOHI22SIT6uPejlw-VcfIKRQ_g4g6z3eYw1fYlHJvGwdsMn7FNxoH2WtS9mvRfp8BAGF-kfwJgdODLrYQrkTtHqhb8x-o64yzLhoP9LYMUN24SRFRmM3ug7buSv8Y2OdUN2hC5QgMnXt_mS089NAeXWNiEOTixlC4G1VrHB-TmTK7gW9xySL8n07MDq32RsRiyYjLHMfTVS6BmLA7XcuD3Hvo0LZL-501hZ3Sy8sxFc2X1NyogZRy7zvBYCPOcIlqRHiNJHhHWaZzY65MAdIfZ1FYxWLJaQ-zvGfrbDPrsSIokRDC3iEUjyqaeVykRGzC93qlc7Wqx5TKgiVXCHl1mz5Km1luaWVJonH__3c2aTOr3M9r1eNrFEIO7yNJ2kJZNTyF-DMzpP5QRdkXHr9MOPclX9dUBhLiXWrjMKUq-gY6ItBFarPFW5Lsofbr7919-_ef3u5rvv35bTY7f7anb1LcVj76-PnD-gneaKtsqts0Lfkxzri32sZ0Lck9vnhFMyyIlH5OZX8x3e5Sdy_UySEWfznV0WK4BF561Og3ThtVpSP4aPXp-euVssAkWcc7K13RfYHiJEdzcgPAbBPn8Gou_Vm6Dt7WMQM_FZiNp1NpL_IgvOwRHEGO8agu_SRiAtvn_7j9ffvXn1nwmUl2uLihbOU65CTfnBk5FbzyqOtI5cuLkqF5LrKoFGWRnilwd3OujKbFk2uhZexoY8g1g0uSd1TJtOXgXyQsJ4PCEmMPo200x7Rt5yyARKq84Elq8hUTvnlbYy0vQoLuzYgcPDvlG5GN3qNLWrtkNg8rC7EmJzfpEKao-j1Yt4o3RanbJve8yaOPSksv7ZuRCb6_3ke8fSo-OS4Uh9gVV68Xtus3nP7VqITSqCAfzfbiGPsftRNZRAGkDT1Jk9vfmAsZ_MxwjeVTSwS2g9u-jaTI0_R_SG0PEI3Vwe0PtBesVw99xv3Jp8b4BHzIGBzHRnYOf19b18rGvcc1PGZpoDONT6syFsF0Jsnt0DqGTQFp-S6HOQeRyQuBRic5E2rdwxdSO1z9vaQ4WL6Nwk1XyTCyT9zqXwJEBudJjwDrhKXMG7Ia_cCTxoRSFtoLzicoCzlQH5SejxYHit4DZsTRfQSLPIq21v5TpPekVtbPIemfAVUcsNmIrYEuUnJuSV2Harinxg7-ySN38dG-g4xckrlIZ270ktvd-y3mqCqou85oSErnfr9HbpXWfVkwBFC9mZmHbsvM-zw1WnTTzVFi3_1eFhE2Adbq2rwvTp8XDjWD_QLzxPcgnm-2m9xelw5h9PcTEXOMV8qAQufn4OFrJOndy39J9j7atk7St8yVgBRB0N7-Stdz9SHT_5z5Bm7021xeiVr5s30i5HUDISRjMxuzwVV6dnlyN8KD4U_wc">
<img src="../examples/laneway-house.svg" alt="The floor plan the program above compiles to — click to open it in the live playground" width="620" />
</a>

**↑ `archlang compile laneway-house.arch` — that program, rendered.** The walls join and hatch
themselves, the hinged doors draw their own swing arcs, the sliding and pocket leaves draw panels
instead (a pocket door has no arc, because it has no swing), and `dims auto all` measures the
building it was given.

**▶ [Click the drawing](https://playground.archlang.uk/#z=rVddjhs3En7vU3yQHjxGNApHMxrP7NoGvLsGFojhDbIOgn2aZjdLamYoskGyR9IaBvK0BwhyhhwgR8hRfJJFkd36GY_HeYieKKrqq69-WRrjFZyl04qUd24FIy2t5Ra1i1EuCR9_-gUX11j9_htiIyM8SRUgAyuh9W7p5WpajIsx3rrYaLtEQ56gA1oXdNTOkkK1RSOtmuL1HfktXEuWJVlIWxaIDhK-s1A6RGlrgjTOLiGLMaxckcJaGoOT0lk85-NLyIjnrQsvy6cTUIJd6E3sPMFTcOaOAuRSahsiQ7NrzkMmnGKMk1JbPOfrl5C2bpzHx59-LScoB6VkkO-eTiCtQmwIlYzN10OkWqk9u2CkVnBdRLUtxihD9LotpyiDjoT3CNETRVjnY4MPZXInJLS4dljIWqr-e2ukRey85eD-JV0p53wxZqlehtMzSaelkSEc_LKUXpGdFgll9KZP4z9dF2iE9wXQWR0DVqsCWHqtMBc4-IzRSh9TwgKkJ5wJgdjo-naCwNkpF6YLTbmLspFWMVFIjtJcFOh97NoCUHoVIDvOqzEF8GAwigI5zFq9WN-wawBoE8lr55GtWwoBMyHwHidiIp7i5NlcpMOHI22SIT6uPejlw-VcfIKRQ_g4g6z3eYw1fYlHJvGwdsMn7FNxoH2WtS9mvRfp8BAGF-kfwJgdODLrYQrkTtHqhb8x-o64yzLhoP9LYMUN24SRFRmM3ug7buSv8Y2OdUN2hC5QgMnXt_mS089NAeXWNiEOTixlC4G1VrHB-TmTK7gW9xySL8n07MDq32RsRiyYjLHMfTVS6BmLA7XcuD3Hvo0LZL-501hZ3Sy8sxFc2X1NyogZRy7zvBYCPOcIlqRHiNJHhHWaZzY65MAdIfZ1FYxWLJaQ-zvGfrbDPrsSIokRDC3iEUjyqaeVykRGzC93qlc7Wqx5TKgiVXCHl1mz5Km1luaWVJonH__3c2aTOr3M9r1eNrFEIO7yNJ2kJZNTyF-DMzpP5QRdkXHr9MOPclX9dUBhLiXWrjMKUq-gY6ItBFarPFW5Lsofbr7919-_ef3u5rvv35bTY7f7anb1LcVj76-PnD-gneaKtsqts0Lfkxzri32sZ0Lck9vnhFMyyIlH5OZX8x3e5Sdy_UySEWfznV0WK4BF561Og3ThtVpSP4aPXp-euVssAkWcc7K13RfYHiJEdzcgPAbBPn8Gou_Vm6Dt7WMQM_FZiNp1NpL_IgvOwRHEGO8agu_SRiAtvn_7j9ffvXn1nwmUl2uLihbOU65CTfnBk5FbzyqOtI5cuLkqF5LrKoFGWRnilwd3OujKbFk2uhZexoY8g1g0uSd1TJtOXgXyQsJ4PCEmMPo200x7Rt5yyARKq84Elq8hUTvnlbYy0vQoLuzYgcPDvlG5GN3qNLWrtkNg8rC7EmJzfpEKao-j1Yt4o3RanbJve8yaOPSksv7ZuRCb6_3ke8fSo-OS4Uh9gVV68Xtus3nP7VqITSqCAfzfbiGPsftRNZRAGkDT1Jk9vfmAsZ_MxwjeVTSwS2g9u-jaTI0_R_SG0PEI3Vwe0PtBesVw99xv3Jp8b4BHzIGBzHRnYOf19b18rGvcc1PGZpoDONT6syFsF0Jsnt0DqGTQFp-S6HOQeRyQuBRic5E2rdwxdSO1z9vaQ4WL6Nwk1XyTCyT9zqXwJEBudJjwDrhKXMG7Ia_cCTxoRSFtoLzicoCzlQH5SejxYHit4DZsTRfQSLPIq21v5TpPekVtbPIemfAVUcsNmIrYEuUnJuSV2Harinxg7-ySN38dG-g4xckrlIZ270ktvd-y3mqCqou85oSErnfr9HbpXWfVkwBFC9mZmHbsvM-zw1WnTTzVFi3_1eFhE2Adbq2rwvTp8XDjWD_QLzxPcgnm-2m9xelw5h9PcTEXOMV8qAQufn4OFrJOndy39J9j7atk7St8yVgBRB0N7-Stdz9SHT_5z5Bm7021xeiVr5s30i5HUDISRjMxuzwVV6dnlyN8KD4U_wc)** — it opens the
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

<a href="https://playground.archlang.uk/#z=vVxdciM3kn7XKTKkB1PbpFSkRImS3Y7ocWu6O6bHdljyeCMmJlhgFUhiVCxwAJQo2eGNOcSeYa-w73uUOclGZgL1xyIlj9vWQzd_gK8SiUT-g0dwt5Rw-_6bH779cPPVDcwzsbBLtYZ__fO_QYDb6IF12sgnWKossyqV8KCyTMBGuSWIHIRzIlnKFBbCiIXsg1tKWGf4zcERzJWxbuDUCqdZ5bQBp2lIJvJFIRYS7FIXWQpWyhO4eZDmyS1VvgCZWQkqB_koVutM2lNQFnQuD46AB6Q6l7CRWfY5fkDf4RDE3ix1VnuCzulLu5TSncBtYeYikRaUA_koTaKstNcHRxBb5WQMvbl6kJBKox5kColerYW1kIuVtMfwf_8L8VqspYlfxTYRmYxfxeJRWnq7lGlBn2RyIfM0hp4AI0V2cMTP9jwDp1wmYZbp5J4Rf9Q5PjhTDypfnFppHlQiT20m5RpXulH5wvbB6CyTKRRrZItbIifCM8EWM6edyDyJRusVrHX2tNA5kZEsxWoujUwh1_oe9HxOjLKuSJ94ijBJDBuRZSDTBWL3BMz0RqYwE0_lBCYREJ-m4fjbD_8JqdYG7lWeWhQc2iMJxEi3FA6WAl9pmEliZAo9m6kUF7vWyb10pzM111l6OhMmP2VBOu7DOit4P2PccJnGB0eQyrkoMod7it8YaV0fpEiWsFlKI0HArFBZKg1sSKxE4gqRZU-wLhwod0LiHiO5MWQqlxblb0OS-iD7MJOJKGz1RJSoXD4gnFHOyfxz4tQSUmkTo2YSBoO_W2SykWttHNOLjACdHxwBTn1i7iCTNypP9QaJ_wJZ_SUIB1-stf0y5sUKiOdEmdZr3ADrjJRuMBcJcV3NZijLc9x53DlgPL_pmXyQGQzjU_9qFNPH1gllYuhZsZKgUphptwQaYfv-XIi5Y4gHrYjLPQGpLmaZHCylWiwdLMQaNLKhSwhQ3Ob09VLkixh6OEiKB2n7kBqxycNuFeu1NEQ8ahSeiwdM5zJ3MbyCeJ2JRMK__vk_sFLGaAOPJL78RqawFsqAnoPMbaGchJlwS6SDWfBfZxHuZGFy5QojYS5WKlPSgkiMthbulUuWMj_1B20mU5x7Srz0YnfqpDFIA9KWqpUFUTiNco58YYncaFiJvBAZ4ICTg6ODIxKrdaYdzI3OvRjw7oXFf_3Nd3fv-_7sQq6NW0qTw1KulF2T7KLKtRrimUjuYxB5ikpJ_qMQTpspqt4YhJE0_fbNn2-AtHHP6sItj_uwWapkifK6WT61t4m1sjAJHWZGJjnwLLDgxD0jExzMRSJS2ceh9KlnjldNMGMI60Ryb0FkOl_UVnwSVCluvoVck8L-HBWuzrMn1qWQKiMTp3RuTw7IXhy-DxbmL2hhDuGnA4AiV87CanUAsDAqhWEUHQCQCoY3Q9TxqU3EWh4AkD6G4fUYRxB_oVgfADR2kcZ5pUkrPwBgdX2AX6FM_RQ2jjFqG8Qf_Iwjj-BNJZXfvvnwXadU9vG5Sxqj80SeBAH3A3vHICx8gfxAVUCwvcf-0zH8NYj_32JQuXUid0o4NlrCkt1NUyOtFTM0JfoResgnvclZh7-ixcErcEsjJQFvpIO5esSDYY8_ZzMtjMwdJIWzrEOJqs8Yh5TW7AlQFTgnUzASLUieoFlmI064TF6C0-jRvVjmoxN8Gfchlvl0xW-OSb5JSlAT0bm3CgUAEp07IxJcGkHGpdFfFVYWqwFZwBNUvPEJfK2ZNmW9dvnw9e2HtzcEXWoTPHXrwqy1ldd8NAjZyzuJ4lrmlpfi3QZmx2cWUpkoq3TeR-8jcdkTZMofD6TkMwtLXClScXIAtYdW-4qyC8wQlb6m_9fCOF6vW6rkPpfWojjDT9CL-tEx9IaTqPZidBHh6_AiybSV8DPB8hLS1_S_cH6-VT9KwKmPOAMyMZMZHN4wSYdQWGlJMgniCGKVW-lgOI7iPp5RiOdZYZdxPygs1HOktEqxufb2jIR4hQuekQIgG09uA0NrZKqAu_cfvvrTzXew1NYF2bBLmWUxnEURrFYw1wZkPupDvJlmoymqlRhG1XckLUi-PfbQpshz1Go1nYPShKYcDwZ5guV-eEkeMiBRgDLoF4q-WWq9HCN2LoWRBnWfJMWX6CxTqbTst5FHIwyaTPYi0HGQBhZaWnB6Pfjuw7v3d9eNg-SBg9SR2JLKCjz-ePPHO-Ic9GLh4HIcRTHMZKY3x6x8RXgMWotAKLs2GZpYlORcg90EVc-0_fAV6jLLUKx46Xk3b27viBH9wBX07Hp4SktqaYv4TKjkXprjE_qiMqueIpWzIIo8WZJfvx4YchYAStFiobyKoscrUtx1mJmwKocumEzOEaUNcxFFj-MtmE2C7-kY0PqZhgE-tM8ccXoNr2B4HoVDchlFj-dRBEY74ZC8QMQBBO3--rf4I-SPN3-5-QhDkkSZO_PEzth1GUCRO9L35vs0VSjvp9516YP3T35TIr0nCYfvjC7yFOaZ1ubQ67QjGAwGAy8lg0_055G_ySUruhQMCnTQASuhcnjQWbGS_RBFVcFJJl1pkrz_0lsIk8o8aA06-jO5VN6dqblGPtBNCoPhHrpIN2_f3bBGFGDlWhiUEQ6pEmWSTMb9CvZepujyraB3fh5F_WE0QilzGnrDi-o9kRwnmxj9O-VgVmQLaeGb7-9-ePPd25OGrWDGykcnjaLlB1uBOpO3AEqLccYmI3zK7_mh4bMaXf4jXGSDPCNSVVhUvBEkm-oRjVm0L_Sajgiu_67yDAunMuUoIllcs9dB_qlll4-8k7ku0H8iF8-bXNpYWjHr6sBYaR3p4T4yzDuQlcF3G5XI4ybbNlN89DSvONdmHfQG47G3sPTvz10Am5cB8CvPv04g-zyQn97bCYRcBej0HEZ1oIuAc-FhPB__iMHIAM1qhWGh5_1b3IgtLur5XCVyKnc81jss55HnA7047yR-rTepNNPNfqRJQKIXo31Iz9A0jAIUv-rG4vjsIZnaZ6liAH-outFIgU_tQwIvRZvUGVbfplP0pSiyArtWeTP4SmXe3sb2xmVD8p-mm33iEh7dJKMbSO4Dqs33DNoBph6mKZr5fWDn1Xx-veM4pCqf3iv3AoGqr3KyEwttKTy7ykkNawdh98p5sK4z3wHGLJs0xYDsqo8bF0YXa5myXaPwB2Mxnyn8pYb1R0rz-Nj98Na_QNTD0qKUMcWUNTp7VKXCA2DXCd8_opYJ8cU7Gn0IHF_w3C3IYB0qSFZUFSTqkQD5PY_2IYufu4XJSoHJDEqkJBNN2eOoRua3NDqQuUm24QT5YgRXapIAdzZpw9HoAIf5rLBsv5vEcu9mHH7k_5sMZ_NJzt41YKI4cSJfZJKdBbSXtzeQaJNLU0vfKg6tMHRBSMzmoqIoMd98_e7jzVte14MS7VQwOTs5h7Xox0tKRwgjRd8vTTgOpFGzaZWebDGKDUSA9F-XHknTMJyRz907G1VH0r8o53mG3iIf_I7zE7YezM4y79B5a4Pw_eP5qB728v6EPwJmhCWngZrgfqt8NM20luC4-xc1AeX9PGyCM8IWMPvvnupKz7FYjVrAb2lwC5gRtoB9RFDJfw14PGkdqT_x4MMGsEfYQg4p0BJ50kIe1ZDvePBhKYF_YDebD9wpH5Q-CixVichXps1h8dSVCY3Rb5TKUJiMaXf0x0NYFhILJJwag2Gf_hQcVVPKAccOMlS5FLH4zL3MnTTsbookwW8XRqyXx9uiHVRkufDRnoUHNfpeZJkXXMoKYYxQZAINStNbJvVOa7umvDtVCda0EFfQePj34ibOhqWvU3ZuSunBZVz4g7JRqVvCEE8ImS2OMqjKARRucwaB1Is_ai1sf-5r2HQIkSUB_iqg19zIXY-oHfIjuNtoSISx5O6XtQcGtZwlFpxv84eIklMz8YTKAkakZThbkmLZjvOIFEigjAhby2GDLlyoQfp0dWuhwf7xn39Hlmt0WWcmEhKWy7FHJ9BU8ZawZrm86GAXb0aDPXWrt4XowwIumuGh8JGCcDC6HEdhs8dRVIK2gDz8VD46TxovroxXW9vpIxreTM6wMLIuXAs62GX-4_oe01hzvYVDdy1QiozEgqCHbgN6y8x_WCLsgju7KuGudq8bHbVEG08ewVTuLrKvQqGzsr1gvz913VnBVw5qCR8-QvBqxbT4FwIGdVxzda66d6n0aXcduip51GZK9RBfmWXqS8cWOVyRjyfO7xg-pIXHlnDKYUsguilavPl7FBHKFcFimp5WkL7WZTTBG-ffNDmLVG5PrOI0mlq9bQoiJkV2TfaGvCEzG5xP3nDFl4a69wXaay5Wh_pts3qLeY1G4fcZdY9JMYUZy-jk5Kx0J6vSMnMU2X4ZRfAKFPwHDIcV7y_9Gn0Qsz1vOJw0zlLr7wj4RO6cfhU1D9HW_OC69KTwlYHjXWCj6Lx5aH4VWE2EMR28DRaOwQvAhpfRPi7BETrvRqVos7rRSvvcPBqT5tEo4VgA-z7DuQlebAdpZ-dXDSvQEMkqc_4JU7cVaCrtfdsD6aNtOfbeNJ6xR5RMzLnX3YAKwzsPyRKr_YiBG9dH3XxcVQKwxtXK4HejzbS-R9bMA0UYjZy1KTprUdQCMcUCtpY1HlYgZxRxlii1aKBWONFzMc3qKGhzxxcVCiqQRzLcu1ESPZ9LOXVU-uV4FdlzWfmqeFCwUgJ7UIRZMX9LWihKG1-OA4qv2pRMHl3uowpL-E3XE4k6P6_WVm7aHhAlcg1tlKg_uazWhjCkVl5ElnuYYgsBiIXAQnWwlKUhmc-xxER6geHHnnV1yLaI00H0G4A04g72LyYljZR9IG1FKD6A29rGAgOTcq11Ar1DKBdUZB0GMs-vSjIjz0x6QN13qB7gP51ald-_8AEY5OyDtE4_yNr-vADy8nw_ZKrsciPs0nPiJZAXzyx8blRaOfBbW1_6e4Grl1GtwHi5H5tamKaJmKlcuhdgj-vYz7BCWawNN6T_is5kVbmk8v7VfpiZMNZpndVgJlgMvRiXMOeemF8IczX-JDDDaNiN04Bpl3lZRloM9yWbIBil-NbDp5qsmSfKGO7DqOQ1YHTWmwNGyEOekO_qMYalOjlnieqsfNNDfLTUUUOnJoVm4Ztd08IFV3sx5XCX_t2Ien51cBY1E6xn9TQTjj_cUkiCje2AIuzLpsydl2euluLtmEuW-rm5ba1S5NNMF_lCMshVpfI9ylX9YNaDmN0gQ7QRDcPRCcKhi1qV-X2UysGXZSWVhDSIVxSBw4g5JL1gfDKBRxidRLA6rJBw3oRhzhh0UkM5CxtJjZlU8XXBzxlSHu-sMiRIMwp1qgw3s_1O7QkjbkYMHci-Q4ErthatFje6-Q4VmWisWtFHPkXngz_M0fVBEDIHPX6KK1Klw-BaPTJ0vSxElmGrUdl02uxHrRXwf4dOiBEcfo96_3dohChbIb7WIfXEPTzU2TTX2q0NJpSQS7nmds6Zpj4grCKsMyyohxaKUFLoc9tBSIq1-3V9kxBGoVZh3x2slKOeRZZYKkiEIrxvlMB0gpwXVv6S5oV220KzYaFWBw_NbnU-1wrYn5LTVRGP5HN_WbjsyuPU50V3xTNHp2sfzLjW3zd5Dkn-gup5Jwyftal9QYn6ol7w7qaJu_ReVGPeVxf253t_kfmldWFuEXx-feyi763kUlPt_t0bDit336-R39RLf6XqPLytX-PoqreyXqz6OBs1rXorp6-RhfLNjjIZSQ3Djf0xY1syasF9xIEVXL2I2SZP6UaZtVYQaZGn9GEneR1tzzIf1Ut5B1UBqbsx3VsU3-9edqjz3Y9QMsV2T_-Uqn_CbXQJ7r_E5eLX1HOBF1Pwf39PCBulUSCuqXt5Noqp49r3cfuW5rhUp6RQq8sKbqNybsFsGEplw4rwSoS0tmw_Qyo8UddlLyqlexrDygs4Ik_ZIlPvqq7Vw9xGb5e0ZjIdvaz2-AffpDoKrcL8ft8GTmejVvlxu_yJq_BuP52bGglbEvnWL_lwv0R6zpZP5tNXk0osOwfMP_Pg23oT9AtWttoiOexxvahXO3V-X_gUs-5kt5N6B4b1c8dDd9UMG711pCSvsWUQe-Qx5KANx3s6nfdx2JZ7ew_3Uq5tOBced15kmS-PYtkfO7pRx-ligU2VZycRPML5yQhWQJfo9Mw6UyT-RstKpSl-OMerVAftthH22OoV9O7y-Tse-QwDqnLpJ3SutiqmXvlSVj84AJhBHXVWk6iIQsM6YJSGGhBb3GZ5oRNK6a3yCSlwX-NgZ4Ky8s162Y7yGx34MNsbayxSnO-mAqe06058bNsoQ0zk7oKhOS0cf1S5EuZNa3MtWzA8JbiqMh_FoVmUrnM9lbdrrlmyc1leB_HhRDiL1HRaZcv71RWCQSbzhVvCGEMt32PqRRm9YAyl8Rl4JvDO4LdUxOSeYL4Y2GdqQ2P_6NpjC_yoTxAmNXomvRHC1lWtDQLj7QTpZHW_Ae8vIH3tOrTMR1yr1GjT-EoNMg-JfoEgyHw2apVgSWOXOHjZ4EUFWJmvyoJmeZ-nC6FbGhq1tDKua0tWNG4U4TqKaJ9eDXRVdahgtbNEdBS68_kq2L4iDNmO55CU3gVFNYZaS_me6lB1wWS0qzpEaZXJC9Hqnss-QORVu3h18asAyZkej-sUjroAG74R-oA-m9cGpFSU7wusb8UWoBfLPneeE9RvWTPrqJup9PV8aql6Rv_sSYRHZZ5xVNYDzuvJrcpC7ampYUp4u6LmrxoHUnbCVUW1PYSeBUInZYq9WWtj5I4q2bP1hYoHJHJV2eWqju1ta1d1spUELk22hx2Nd7N2C3UHM7ZRq3LANh-UDiJ3gyHNTKZ4z1CKtGbZOHb5DK9s823oEKR6W0IHgRjV981vRU7p5bIdCo9G-z7XTKY7aiU-VgqsvmxUyUZlgat0ICrMHO0Ix1h7MRHSe-71IkAHYmlRt6iscglh86py3qReJyPUtkRQXhG_evHiJ43F1_yVX7788bhz-b8KczQJF-aex9zF1B2Vt6thN2M7sWsVZo6lItY47fpyHWE7-AEjVEYRLx4ySDHCLy977UwK-5wm3-3yP2vgTQde10RHzsi0SCT7ZjjFXxaloKgX7_x9B-X8mSJU-9e_xb6RlGIylb5-aERCV2WbQNUlgLFRfaX0UwnX5U-OUIvs3fsPt_53EjxhPqnrT3fI0BYOt5AWqhxfuA-uKGWIqx9T6cOMfgKDObAwlFPG9NtClqFclRWmg1mJwr9XsUhD2Fnx5vmZociBP6vis2WPOCHqU0asDxTzA_foc3hNg578IIy9-4A8xkGjCpB_doUR10b_XSZu6zcH2PPFS2bT2RMcvjHJ8qPIF_5zbDc4HEWji0E0GYwuDwn554P_Bw">
<img src="../examples/hillside-villa.svg" alt="Hillside Villa — a two-storey villa with an attached garage, ground floor shown" width="620" />
</a>

<b><a href="../examples/hillside-villa.arch">hillside-villa</a></b>

</div>

**The site plan** — the same language pointed at everything OUTSIDE the wall line: a surveyed lot
boundary, nine `outdoor` ground materials from lawn to swimming pool, a posted `fence` round the
water, a `garage` with the sixth door kind, and fourteen outdoor fixture families from the bins to
the trampoline. The ground is drawn and measured but is emphatically not floor area.

<div align="center">

<a href="https://playground.archlang.uk/#z=rVvdchu3kr7nU3RJF3GqKGb4J5FO-UKJaVsVR_TK8vFunTrFAWdADqLhgAEworSpVJ2H2GfYB9hH2Ec5T7Lb3cDMcEjJTiq-sPgz_aHRaPQ_T-E2kzD_dPt6Pr-BVS7WNlNb-Nc__wsEuJ0-s04b-QgrsVH5I2S6tBJ0AQIGA3jA_zZgy2VplqKAXLsupEbsChAWROcUPl7dzmCbi-IluEzCslR5qoo1KAuZyFegV6BcF0SR0vfaZdLwN8rC2uiySHud084pzO6leXQZ0srcSlAFyAex2ebSfkdLWthlwiGZKqxKJeHtRJ5DrgrZg9tMWdCFxCfwK2SKWOQtKQsicaXI80dQ1pYyBWG7sMtUkgWSXaZzCVutCoeM40f3_d6wD7Y0K5FI-xJiq5yEf_3zvzunsETuhXmMYVs6Rsi1I3ZQgvjeZlK6LhT4UaxLl2ptYr9v2AgnjRK5BSseeXcSpdA5BftrKYyEjXRGgi7d3oYtXH3sQrySRSJj2GrrF99qnYMsklzb0shK5tYZKV3nFFZGF06sJR9HfxT2OOiDZw1W6sEhLWmDkhZWpSmUzei5tTCpLDwbj_i3cwp3yiWZLAJlTSHCV3y-N7PL13D7bvZxBrfvbmYzeHP54-1H-GH2Zn4zo2-vrt_iA_D65vLz1fXbHlwGQXnx4zFdz29BgNF68xIUakPnFMTSysLh9jYQp9ImRi0lnJ39YnURf2Mhxsft3_8Rd_0zTjuR294q19oshJFisRnEJBT6HjdISt45hdgmmUzLXNKaNgYnlrmXoHIWkBpyUaSolhWyF2eNrQrrpEh7cIUHoZfWmTJxtJ13uG-8jtURqiLJy1Sm9KnVkCiTlLlwShd4_ncWj1SodeZAJEZbr7yoTd93TsH5ayLAOuFkCvd9sGqzzdVKJYRS38egRCznmgNbCQEvpBWPqlh3TllH8ZuNTmUOqZYWCu16cEnigLc3888f6RA_XL6dvdy_EsqyNalkzIrZBasRWrlMlw7irdhKE_NNYMKdpL0qVj2-zjtd5iksJdhE5DIFpxsq2oN3uC2voXQHWQmRs7eXN5dvZ3DFfM5v381u4N3l-zcwf0Of3Mzezy4_znqsNnjVobTSIrRYy5gliyzcqSJF5sMylaJIkVo4eUvPn5Co488LXnZxO58vri9vbuafY9hIYenKKPcSxr0xbPx5dkGsBaqMhx70LmBDtm0rzJ1MIU6EiaGQMrWoUhbo8ioLMb3wrHZZyurBZcSsN_pWJqgEIu-cQi7FihXGiTuJ-ghJLnB3woHI8y4sZULvlaPFLcz_Nrt5h5fZCDLmLhMFWNQTVBVtUBS5QidQq1kqbCZTMDJxoljnsmnCmVlWOeFA30uTSZHC1uhfmNMefEYrjcBIhJzwdxaPXVl4Pbu5-tvsdRd1EXZGOSe9PzLS6vxeGqRYSvYP5DNcppK7QloLerXqnIIUSQZkZIhnEgY5LCRQLgMyFj1ypqlR9xItYDDMKPhgQcOXMe2-c8pWCuRmmwmnEvI_yCbhBfUBUdidNOHesUhYZec3V7Pr28vbq_k1r77FC0Wm3DZuUXA41_Ob23fdcFcKbfCMCsjkRtltJo301y2Wv5bCabPADZBSW126rDJE4SLdemOyyx75Nqt7PGa8Gqxe3sh_l6qCbQTKb6n_H2opU7KZJE1mlZZYiUSkDfckzb1KJCzxA-tEcmdB5Jqw6v35-1u9PyPB0w0tt9YJZWyweWX6yJog8JRNGhh56QMeWoiig0xY_KRz6rdbg1rYSgMcGnWf2dKGz8TgvSf1teIRRdlFEX9e3MznPy-u57eL2b99uryd3yzeXP54df027jKvqRErh-LMZGmUdSoJV0ZZ5nAjpUP70Lxs6EDupTFlToGWYxa8qyS1-sYeSsmrll6tVCLxWlcXkHSJLEivQ4ui6UJH_w4t7Qn81gEoC3R2m00HYG1UCv0o6gCQqYbLiB1gIrayA2yQof-SHyENhHLbAUjVxoIonSb2RZ7Tw03v2gHI5VoWaacDwKcdvEcPYt5S_F1cK3NMLgoPmwJHlJ0u8IKJjYRUGbYf9nuIq1iNkFV9ubfCULBHgV3Mh0jhnCruwqXaooF6IciMnaWa7M9WGvcYYj0C_fHsw838w7fEhUhTy5C9XLs6DsDrNZqMYPO__wN8G5ePGOcmDmymZS4S2UOxYJCJcodwvUmO9EG9-8aHYXvwIupG38KLwSCKmq_o_2_xW37VAfidhfwxk3kOiSyckbgby-rUDORFAe_x8vT7vTE8wBQ2wQmjYRTkuh7gHDbecBGuLig-aurhKhfFXY8O2cEtvIJhFEH4dwryAcNhbWrb3KFn72UOfTh521DwEy8cMuUqfWVpE4cAcOsfBHgxGEdRdzQmMfSnB2_6kX83ig7fDfkdQfg3GGVLwv59j5XdIusDaZWigK3mpR9F8Bu8OJ_US9NrD3gAM3gWZjqoYej1EzC757mhLU2jmht-3UaR_S8zM4kaIpschVkLcxRmwDBMOjpyEKSs4C1Z-sosMsQEwDClKVGw6j8lDEZR9IAbAcjFUuZw8k7k-QnU_yiiIwxU_MdmiN1aiPyJX6ihQrzQaBhFD_hBtdCc7OvJ_kJsdFvA3pPWwCz5p4Df0-MtYMZoAZdOVaJpaIkHnkTRw7AJ_MmpXLnHkz3gkj-EXdICD-leBT6JWuDjJvhPPjp4TdHBCYMHDB8y7C_gw0FaoKkPtABiP5w3DzZE2XvcezPUYbtyu-fjulVqzoaVoxGMmHwKYbfoboiWo-r0Vbpgel0AWxrhiBXYqdRleAkiQAckIZcrx8EwA7KiVpzU6QdWY3pwrSEmwhgjFogxcK5eI4p_rbeyYOfBaRE6Lk7e0bF79NkCQRc_XV2_Xvz4_vLTxxlHExTaGrkqraDMDs2yxgqOWZcbWTifplEmYMS9zC18-kBhIuM68jUKMz34RWyWGHTzbjGTLLQPqDWF_ZJjN1q40CgEaTYyVcJhamn9xQ_Q6L19TH2QIVRu-GimgE65kHlIiELW0PXAuLyHpMeVxRhlXYq1_IazgEQX97IgdlbagCh88Uks9T0vl5SOgrADZfB8-D9NpeiPBuOgFcMoijotSm9MMI9HNyEcWr5AMI2ifdWhp1sI3mo0EM7HTyM07MMpXMJWJ3fS0VHzoYdrzvlOoSHRxqgUb0kIz1nMdLTWR3ME3u8NYeOR9QqW6Nv57rA-vFCOE1SYjCNS3aB3kyiCbV5iAEzqJPJc70SRyG_bgiZL5pnmHQ9IypNqx_iK1Q5vnmfHGx1USX9GIavZlOkZmRpag--ScE5gFBqezYQ9cuC8Pr4QDkYX4ydF7o2bZ4WtNgmzspyGA0-7pWyzLuA0DA_ed8JMX-nK5DYkcF5LoH8e1IwtndvpUKjDDdgu3__qigsO7aTxJZRt6fiGY70tXqqVztOYGCCuPHIj7QMdLOUW_eX3INhuobWCrVCmJoaadU-SyuSuB9dS4ZIe2-6k3Nr6BuJhUR3jI8r1xbeUnRZlntNF5UOjcsYSy0VkidI41MpCKqCL2nqBk8agsCnf01g1upNbB0ku8WBRJiia9qnT9oAlAnvXfNSv7xxe4BYhbhJCEWSPcDga1AdX667B-hYf4k4Vqd5RtKSKKvjYW3x6sX_4h2QhAmiSTTFUq5X2CFUISPYYno723NwRsoZ61mSDBtkgKCil6RSuO3LvF-dR1B2fV96dQhMUUKoMpoz-BM_Ozs7git0AvqaPqcpMpepU2jv2_aoIRhNEkWSYCOjtGblkpMhLm_FCKLaHC7-bGmmp9R1uYXUEaamd0xsGayIhz6MDpCTDnYYgbDiMou55VEcxGCVFERiN9VnEaCzYaUFZvRIE5CuCZFxZ0Fau0X_DGANMKx0M8Iw5Ah5wBMzADTdQA5tyXXNICUQ0qlgkehTTMwDufoFlAQIYUwA7qENBPHUUDOwBtBB26KHNs3uLwt4uhoEZ1O62DphHxPkqoEn_GaClsKr4SqDpNEj73B_oU6i7hBX0a1D70XQPqQXlb9vCYnliD4-SNA9yXgm-6Y4aSuUwyIEjXDVR6vM_jrIyKl3LL6HQja7EdPE8ZKJLjBi_ADkYP4_CicWCWjWcSESs4JNKwckETNswbW7Y3b_oj0doqaY19RS1u9LIquyxp0oqeUzC-hMyAYMKAFfvX7Tom_auUdKrbN6pf-Aag6zQkuxigb9uJWJOwb0W4Yu0BSULVccpuNlGbqAL2YjHqYiKNbwzscNYJRMOn8EiugCnQr6wFc5hZdlH4xYrbrS1-TXlOR_fzWa3IEJMRvVAbBorV_duMJZ7OY7qJgM791RtZGExMldYRALrMD7Qq1WzKfVNSHuMXElD7Z6artmaQLqNynNFzVRLwaovbvlgy1fuVfpqvaDyPdQlfk5Dx1xMIyfmLXgrPX_tCU4OIbfCZYDlE3av7PqGNaJXqZGHPASg5DOHHNvuVc2DXUqDp3MsGQxHDZ7eUNKKZCdPgC4pwaESNIJOpg1U3ujIgz4BIPcB-hibBATe1kUAOCoYpQH8H18JOadS1kWrFDIcNvb1AQmObClHm9gS9Pm0jTcIeEcOnwI38H8aFZR9htDnD6bNw5fJ3bGDx1YqcGM2wPXHjFfbEqxxPAybNY0PWufHtsfnv6cGYyogXowajneItgX_qypHxxXgUZgUsJyPKf-e9Jtww8ijHQIsZbqwsK8ABDDo9xv8YK7y8CTArgXQPP6GBk2ipwAktFVwUkPUxnoS7adJrVkJ7ozGlOzGQE3xxmwItb0F0yyFMYpadZgw0ZN-LiGUHrDcQI36_CWm1FWVk2olW51kWG1ykNHcRqGrZI9HCuAXrQr6XCQJ1sAZdW3ENqN24cGEAxi51YbbRGWBmR139XHigeswaFbDVzRA8vd_xD24DNAYhCoLKRpSI1NsSVADpWlFV-KOv8mlY1lzwoO74PROOTanXiTpqxVfAC4gUHW3Ue1-0Z-eH75Ds_ht9SS_o0K7ryQ3O4CNcRbf7eThIusec4ldcYxythY41-TWsR94IYvsCxyV51P3zSPP9A5PXFHtgbfEvThRUMkY6xUH-_WMearf4AWGDXSZXlz0w8vfD_08p-sHfv6NLo2TmFox224nC_d4Rv48zOv4OR10-5z4hmJdbOSvpTLSfhZ5Hr8MFLaRFnNdnv23fEjktp4NEdUkkHWi4EYQC3mj0jSXPmtGU6SadYJCm43IQRgjirWkyLapRQLbN8JxWhzkV0VMYWqmjtsG6E76o9FB2NaiLDdLI_NcQGUYR9MW5fQo4XL5a6Mr4A3Qvn2-8OarHUKXxSLXZbGWHCOyAo_6e3T9wxXbdP3oScI2JRapGpwOaIvTmpDaHv0jea0q9rY44Nt1vheNnn-RbHj-VWRJjvfQUme0Xm3SyC3HR3Nmeb9IMmHWlBBWxf9B1HSUD8MDso1Q-VI_1OeHXDb9RyBrZ69GbLa64nJKx35RJwjD4JYP6KRsqkufdhe1mk-D0ZcIyct2-5PG8aE8B0cEqgu1qiMIlEjUxQpUdSlQoP3xAWEmq_Ss4ZsHbd98SGgzUy5rwmm9Hjx3mY6RXQz-FNl09EfJBlG_pZ5_hGz658iGtSy_bm-jmuoPkPV9VHxstd_rJvkATt4oY91f1CM_0oz9o33wv6YN_td0wf-SJvif6oF733jyA08PQf8Epw_JmQpVhKGiqklRjZzRQLXIE108UjyDZXCxkSnVwZULrrwoN0tp9vwstloMNWS0jxw0jSXS1DZY6Sey_becJ6xU1W3zwKFhQ-oU5ukwiqQRbopRV5hhYmKtEtvl2RtqnaFSpGcrbTYgrVMbCjFDST528sGdeaqeszwqByc_N6RxQnG3SuvIYdSbwIY7EFQ36EdRr91S96FKayigNRNQpUX08EloGjenbDOeTjqYAxgczAG0uvUe-yM-fPKFAYClTAcABwMAxxGD7gx8D92LqQ3JpYZ267_V-Q-QwmUsag8p_DDRHov9PbxJtI83PsJiv8ViqFrp2vhQ7MqXyPopO27gSG69YitXGmzmyJ4P-bGgvpS53mFVzijZjDqp-KSqYVywmVi5KnHjhCr0gElBwrRwY6Sod6xVO3iiVTs52qodtCDogI93ag8A8Nk2OR7mM23PPfJwdnur95_oGR5bvd8cUvjh8v2P8-v_aAzwanIZwsEdNesUdpHXIsfJ73r21RurGIxQufXVPAxCPDRZtTAwgGauNqJLmSnOf1EPKIkhw5Vh1LTC_9Aw2S6kEjO1FHeExUuPjIt8w9Zqo1L-BQfl9Dx87fezuJ7TjEQMK0WlQLQrnumKOZ-ON1hW-NjB1LCfvEQF9p0-6q9Wc8wMQ4Zb5FbjTJ-lMmojA2sNbcZYeYoPCw-BxdKG36_0DnSFnzjWdBwMx3-i6bg31nBR9w6faDmy5WkSTcZfajiyAdxjlXoqzy9EJmmPqNGNrZuN-4UiL57wl-zZsFUnGlHPa9I0kPT0yZ_oXqZ6V-xVLIQyO4kVIbJDdOC-PkGVdZrDzelnDqQ9Sa42Sx5v9z9sIdvHx36vVYqM3C-Yp-e4Cbeafl6FJhnW-KONuNlbiXlcOvatTvzFA7U445fVc7G_d1wswB8nuVqRS1PAm5v5z1VRoTLEaMeXGguNEn8hU27B_34EnyLbwWtKGtJm2xLK-tgcRV8c0S2gEhblMzxPvy0pHXa6cVviz4s3V_9---lmtvjh8sefFrdzGsCO23WGZcijn-nH1a20cWhfUe1hUHUPyWa2-5kmxd8Z1A80GtEHDejDTK9ABaCCSyPsn473GsejvfX_xM6GVRdtWO2MUtaogTx4qslePfDUzkbHyyV1l_5rWDu_2BN61ShruNnn2_ZN9s7I0h0wOTpkEo2YK5d-k1wkbKG0Bgkujg8S-C7yAU5ziqCJc340DW-3jRmrxyBBVKOqvTryvDTsjhT30lYTj3hUPtiiSJ0TDgyLMH1E_0PHETd_QRmm5Sig77QGtY13Nbfvrj7SkHyXR3C4yhyHnxJh3iJlKtNeKHf6MT6rcNQvBHHMGSp_iPAKzTvwY_arkJFUcf-KB_9EsYZxnQ075fIwPu9_KdT6TQN7T_yJ32L5CCeXJsnei2LtP8dk5WQQDc7PosnZYHJCuL93_g8">
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
<a href="https://playground.archlang.uk/#z=lVfbbttGEH3XVxwoD7EBWaVoS1GcC5AULQq0RR-ad2tEjshNqF1hd2k6DQL0Iwr0g_on_ZJiZklZsh03eZJIzpyd65nZJ3iD2LmzNZfeuS1oRz5u2UZ0JtYgFGyjpwaF896Uzk_QeRMjW4h8wMb4EC9HTwDMpog1p_cT_TsogbbOVvJqixO6fW0CSOVPXyhCPsWqo6YJ2Hi3TUirCbraFDVK9uaagwKHmpsGzsqD8XBtbIxlkC1BEBdMNM7CWYUFwNfsPyLU5LkElxVPEBysgxyHgiwqh60Jwdgq2XKevHE7tsZWYQKmokbtQuQS64-3rsJEvHfGBpysSuc81hw7ZruaYOUsXorQ6-lLOfT1qnf0IoFvWm9NbD1PR0_wg5qoWZBDA9xmo1I1Nc1grn42AV6s4RKx9q6tJFFDBp1XpTXFejraNWQxfte5s7f95x8bimN8GgGtNTFgux0BlTclZlk2AkJBDWN2mZ6s87GGN1UdRyP0p5ev_FVjro2tQBEn2SQ7TUFGMH8wLrIsu1lmWYaG1txg_LOJRc0W3-EX1RqjDRzwoX-doI7Q11zOAEUXtP4ARV8I-vniFv1XCpE9ev_GRzgSuUMc0Ts9wJld3OL8RE1zrC0hPNSeZ3vt_EKsOPDxLUkm7p6_5jIHUvzO3AY9JjWmsohul8DEqmOwPlf5WIL-BO_6IoBvbYCx0WmK-xyEHRWc2tU6aAU2TJtLkB2qF1R4F1LrdLVrWGGPuyGSFLanWLNUEFk0vIkgadGKdtMRcLc1wTeRvXEe51l20HazLMMnPXvoBfS5kAbdF8_nW-823tmYbKe4L_qnAUwhgm35ou9gp-alQj9ojyneJO1AH4OidjV7ltYMkWwpvUlRDMuS_SGSj6tLSAsoxfEkfdC2bu3TgI7T0afiuoKb8lV5lUx1g0tTTa5YLTDs0Zky1nieZaiNrRiWyafjEDpxW_OXlAfgB6OkTXDf6IMDjvBE_HE8Lb0v4S3v4VGs_8--_NvsyyXhnbGl61IAUyFMpROSVp4p7Twgk4oxYj5_6LTZ_J6exEORKSJfDEpsy-Goi4dU8unaxei2A64IaT295TKkJksjp2Yqg6iRtsULrDZNG-oVtkyh9Rxuy6lLpWysZY8NFSwFtad-Ie7Ensbus26LWnjc7c7Ub4WGsYGjtprSxmyZZTf57Ig2xkfIHfnSuzU_jJwKN0EnwDzLbhYalUesyx_HEGLMs28xag-YIn_o8cDUN2IavBOOQv6sT8kwV3xrQU2_YKS21al-or1sbPU0IHClW835sE0olWqKTrLJUpm93SE6RdaZdjpB0UjzusQzqVJeHFJvTc1m-KycFOkDC2EGt6F-G4m0bu5kfONNWXE_M6kiYweT94S6t1doTtL-bD7kXeLxLMtS_PbD8xY9RHc9gH8t-vz8EcB-UF8FYz98LeBi9ghg4Vqlym-xcLF8zGUJtw7qfDnPJvOL_aB-fqccf3cbGuOLQKZ8Fa9KozNTE6egSxn-yz3m7DwtOAPmOxEcH2EeW1e7jn1f70rCj9a7mPz8Thd2xVGsEs5AVX2EZouhQi5ShRz3MQVjcd-Iex08f4AEipqMTwGWTpzM830wRFwpmQoN2hC9L-b-DtTi2TdB7TcGpmsOl9p56WJQ9pcCk9Yc2XyfCkEzisYF2XOG2hJKmKY9bQN3zb4mW8npCf23a_ZDLdoYJnK7CKZkpW5Ed_R8iZX8hBV2bag5pFsC23LnjKwJbVRMN-xsWuUm3m5yutirwd5Y2cDCjuzgRPQtY5ZJc_7zN5byG-u0vK1b05QSnf28-ffPv1RJ5nGSz5Q03Tbt97umDYmxRErHiAaM4t7oqUL_cENFbNINh7yJ9ZajKUCoyZZnw_VvFfkmrlBxDOi8SyEtzVbDEvasevb6RA3qOXZgMy2wI2kVfUBsBEQTG9Y7C7Dz7j0X8YFLjX4uPXX2av0R4ze-qL8ne02h_yKzY5xn-eIsW5zlc3n7efR59B8"><img src="../examples/two-bed.svg" width="270" alt="Two-bedroom flat" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=pVrNchs3Er7zKbqkQ6RaUktSkSIr5QMt0TbLDpmVqNWRBGdADiIQYACMKCaVqjzEPsM-WJ5kq7uBmSEdx8nGB5c4HHxo9O_XDR7DALwyKy07Plgnd-DLRekWwsCiNCuh7RZ--_U_EAoJk7vRcDwdTEeTcWcwvu1Mvh-OR-N39yBfxHqjJZw89876F6dnrePWMUwLCRttAyydNcETgg9OygDW0Kf7ycP0PQiT06eVcLk06bvx5G76vg2KP3lbhkI60zqGQq6V3xTSyTOYFgLBJCxFFiCXmcolb7QtrJagxc6WoQ3e0sONFgZ8EEF6UOGapATwKkj4OYlGOzU2iQ9-oZfn-O4ccie2HowNhTKrMxgFMGItPSzVs4RcOZkFZY3Ho8yFywrIpc-cWkjodH7w1kCn46WWWaC959eETNvP4eT-tA3zhcie5nAyrlTPysGv5I-lCNbNvMolvtKGhcxE6ZOkdkkL4mut4-Yn0Eqi4C4UW-FyhPOlccrLBDc8JXvgYy9Devp4egbvURlRMGFylHlfFOEkW3Xw3RDwURu2hcoKUB4dJAt6B9tiR-8UFgUOpTMexFbs0EfW-E3rGJwV-TW9pdWzMitw1q5JqoUNBSxkjg88BPHEG9J50AUE7pncyUv3rDIJC3zw26__aR2DNMHt2lAIrduwEKFogxalyfHhkwpZIQ0pXHn0kuxJ5iC0NauG657BxEgQ-bPy1u1AKxNQ5FJLcFLk6FdtmD_O7iaT72bjyXQ2_NfDYDq5m70d3IzG7-bfgpbiWYJI54CtCkXyJViUAVTwIIVH3K0yud3SkVSArdIavNiBt1WEeUl6v70bvJ2Oxu_g_fDhbnQ_Hd3cw9vJHQzGMLj_fngzbeMWICAXO61WRYC1FL50ci1NOIOBy4qPwqygEL51DMaCLw2sbS41LgQtggplLkkSYyEXQVJUHbiAFzsfjY5GFekA2tonBOblfNRtIYJ8lg7EwpYBCruFdZkVwOJldk2R7Gy5KkCFOqVYTARow2VydQprxXGfW-vgw2h8e38GA9T1Er-hs-stSod7y7xyE4oPJ9GJTCeXS1HqAE_K5B4o-lG5UuB5-CMsSqVz6WBrS52DyEIptN7BpqREVOUUrXI8ZDOxkWgpnpel1p1C0lnxZenAmsBpKpfZE6FsbPYkAzAK-6tdLkFA76LbhfUaMuucyq27JiPRYTlfsosbTI3xCS4n0IVaWp1H0Mr98RkKrFAI9EC7NWA30lAACtJ5KIQB-0x_SViLrFBGejrxgPTHumVB_FbKTZUk2VlQA_dbZVYnp3NwksPflFrD0joQWkdbxPTyOLt_HI3fzSZv7qd3DzfT4e0cMmHImJuN3gHra01KtUZzaglbW8UWbuhTGkr5onUMydBzlngOix1snQp4WGPJ_iDQZXQbMuEcurJHwUG47KxFDnf0JpbHI_i5BVAa1Np63QI4hvnKqRwuuvMqN6On72AjXFBYG9i5lIdetwuhUNlTlbeSN3usk5gODEGiw3fWMjjpqeKUXuaogAU65ePk7sPgbvIwvgXhYSu1vgYBS_USSkeImcxhvtSlL-YgVkIZH0AQLgpQi6UFer41IHhDEs1I7-Hkt1__e9E9hcxalytDCSCJ7KS3Gv0iCkXAqIKON2KDfhPgdng3-vfwtrEetHpCW4MoQ2GdzDGA2FFIfb1udw7OliaXlP6w9BDyaDydcJFHl0EhnFC48_xx9vbhbjyaPtwNZ4-Djx9nN5OPH0f3o8l4zofCgMG6i0rGBJFLp55lTrANyShlAKZ-6QDPsMGUEVkECac8LMlVUZkpqr0EU64X0nnMGwRamqwQdcbxlqohOcNiF9AfEUlpyaTirAUQfacFsBEb6WBwzmbJxAYxfSa0hN51r4uvcO0rNy2AXK096tKi39KLhcypMGG5bLX-NNMhwTudTgd8IbWGf-CKMiNf6vwf_zgktjO_UUbOwZXGVzkQtioPBekmV88VfYspk2o3UQNSWayRslBUEL-tgLnUzyG3cb0Xa0lJpUE6EewM3iCHwKyOlC2v4jPVDg8Lqe2WkEUjdqyZc65Z7ODuYQy3o_vpYHwzrIgLOeNXaEvnA2ysMoFNHndgWR9n309uPgyns7uH8TzVYBZ5I4xEgEw8q7CLxAMTOAvq5YpqdQvY7VX-mq2D_-RLkE5ZB1AHbL_bhZ_hpNvunsJJr9_tNv-6uujih_RHpq2X8EsDeztbyLyH2HVyqLF7jH2ZQOmPr68Q6hOQ_hdAXiWQV58DIb_5Y5C0MB7v91ASwfsDlPN6Lf_N2jmQJvLKL-FcnjcE4g8HuhGh-IJuLq5qIPr79wSKNfyPcK4aAl01D1aHOnPqzt_8R3jvGsF7QgnqlPk877GRFntFrwKnRC3lBpRpx7SILs_Ebh17QQKNRLOzFBkmAWb7Z3BfxzacUALb24tKT26JABpJdQQjiMiByl-7WWwxsNpzqPA_r36SgF79gu4AWiykhqOP_PI_4VYhLzrCeudTl5LTsz3wFEIInmIlgZ8fgr-JnKV3FGUg8MhkDmH7CfbVn4XtfxE2BQirgsNgD_b8mxr2A7-cQCNshNiDRSqapG0EGMGi9C9EZiPse6F1jZlgCSJTLiuxEbH7-CmMKnz2c8LvX3W7L_1-QxsiFJ_iEzfe84oYUojZiEHG7B9gfuSXD1RRBqVV2O3BUv8ZRb06EPXr7gHsEF8-OhSVIBphSzXrmoKGWCsSBq9CSXqCvxS22FzRqIY7FeXTKCbWz2aDrUJquIh3V_Wn0QFgnDFQ_jqfMTAevNetExAXf3zC-YwrGoGAlssQSbcyrUrCRjOFBC72TspTP4kNrsyeqsalas-Ub8odpxCE2ZwxZIJ7nsjKhIsdRmRZ2KkjIxfc4UhB_QIxGY3icIkniUj6BtWh4k4MFoLF0UuTMvggXIhNTNzQW61y2CjpCHQhw1YmuarDRfbNPXZs8DNnfaRQWni_b4Sou9ScojUwGNuVJfoHlqjPwgZ4k2YvT5izuVelTuq6bqWSKXa2hBWm5s-3VtjnISxTZ2zc0gyJvIr5WOxfqS2iWUmjFUP72AWz0_2jUuq1BhJ7EAG-wTwTD4oJsuFmtZ8dYPQPMHpdBDnEcNzGf-KrmFfQSZt9MTHtQmCDwSOFlbXUyK3sNfZ75BzY7WibPfm6148tCvf7OBdNLy5tqX1s8b2iribODegkwvgtNiQ4O2vH2Z6mYQ3PRSKuX8ugMpYOPbHJqtGiQuM0bCt9QFlxPMWdGnsIKQDnouq5yWYJWyWfpuS2XmNxZ_cmR9tz7R_EelH5dUrCHOrNuCLcOIBRa1SCCLQks85gNjA-SJG349CG6EBJTXWcm6QWGL-5uuBH3GZf8Qscr8gYYuI4YO68uZMb63BgB-cM4gvrDh0Ry1M0CPtS5I8iYPlr-FJDlbULVQMazPCUpJalo2lMYzKJzQ4qE20fxzv4n9-b5hBkzB1kOxVd1oORiiArUyU_w8T36cRn_4DJTHHjwzOe7x2SD3YjsFuPsvjrZmlnnadxFu6U0p3KX9s9joKBkWhKTF9fp_QVQ_ZweZPtff3J8t6Xlm8EF_CKalxcXNTLX1F64eU1EdoDaBIAroPMAOL-_cb-rMFGpec0_3cpOuGNeWCOnep1ZN2FWKggFnFagInbNy8OEu0WfiOz0BjsU6rHauBTg_u5yTf8WCqcn08LyRldGgyukD6mqYTKJTW5PDlW-WuTzBb5bsXSD61GNetgaaTguBTzf1obl15-YWm_slW99stL5d5S6v_QMz81c2rgjyHewtDp0wgPRLyqOQCPhLoGZy88dMIanCfqB6H9FXLJfA96O_PKPEFqhi4vu_va-n25fTRau04UCLOH7BNLp8i5rPhfRL7cF7rh9HGE-Te9Pjp9NRClqsBXdjh-XHiryyCbA8BqRkpitePFhZFEZXAZe7uzeJk4J6eubpCw1LhqkkUn-spz6YxDHC6ddrn0eOOnsMrnygdhMuakg4-T8TvuXeMKOImzojgOw5y-N2lKo5zT-qKMyrD1KnZMx1Vh_bEULkjXwfk7Ma44Bd2fZX0bTfmTjJcx1beZCELbVSnPqjLlhVFBuF1tMMQVJuPBLvuecrEX2i_PaS6dpmEEWm2GnJmui5grK4MF_u3gZkhKNPZwTo05yakQqEfYGqSfBQ7-WoCV0yhygGgq9vdk6ybvjVo_BzYSE2NloO6SababR4dnT9_bwgf7LFPr9qe2uDrYYg9u6VS-kn8BjsjuZ-EyW5og3Z-H6_UOpdvDI-oZ96NQZ9NHdg1k4djnXnRfLml0Xa_eZiTHJ6sXNgRkPI3V3e7LNwerfWG3RF4OVjMrb65-1e2-vGIS8qkqaH3V-H9OAKw2JP--CHYpqjFPu8-Js54WUFKObf29XYqjvcUqfx1mPD0CLsFVluzVoxLa-FU9Hpjim_tAC5k3rMnjpzNuownhAicM3b3R0BcB-n8JICuEcsyuuhfddq9_kcTHpeiSkUdUB2atU33_I6T-N38JqS4gRDTE89-sIJyV6x_EKA9r6_EHDc7aJZcHvjSzgX_zUg9I6Lqfc3khUlVIdf0Y2_SfDu9YhdnF9p1-baCx-eTfnKjA001bBnqqfHWxtsBLaF-wInEOgYE8_8qDQ3icW1Aq1EsqHnXC3OjSYwVuw1oFTNYi8I03N1OpVVjb55ia1bKqER5nq7GsuHRt5mVmca6LDc-yUVQ9loEnHvaCD3JzloQE5dMcgDt_uo_IYZ7mSnPOTbhJkqfqE4xY4wGxaaXinCqzXRIhwds32CdrczyCSHJaViP_FCHP8aYu3hvRyAGZMEMOkdq-nQ2-ezN69zB5uJ_v2wxWpeSByzHfUoZos-aPHtbWSbqsn6efBOFV-JPc8c8slAn0WxL61Li_257BYyG4V1eBr7n4XjF52feDd8PqxwW4L-6G6jMBJw2gTKbL5H0UENV9pi-kDPHKFhuMYKHATg4n8HFYvq9KDK-ggpZ08Q2wcfYHvFQ9uk-_HKuuxul7FMfMFjs4wt-Z3AjzLHz8BrnWUb_bv-x0rzq9c3z6S-uX1v8A"><img src="../examples/bungalow.svg" width="270" alt="Bungalow with sliding, pocket and bifold doors" /></a><br/>
<b><a href="../examples/bungalow.arch">bungalow</a></b><br/>
<sub>The door vocabulary: sliding, pocket<br/>and bifold leaves — panels, not arcs.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVrvcttGkv_Op-iSKmX7jmRIUbRk7TlVTETb2tNJLkk5J19OGgJNYlbDGezMQCCzlao8xD3DPlie5Kp7ZgBQku29hB9sEWj09P8_P3AfZlDgRqyMFgpWwuaooRQPUkmjT8DJDXgrSvzFyJwJlEIr0YGVeiX1CgRk0maVEhas8ZXOxbC339uH-QPaLRhfoAXciHWpEKROf7pvQTpYVFJ5WFqzBouZF3ql0PVhgZmoHIIvhCeymv4XvX1YKmMslEpoqFwllNqCdEO4KaQDo5FotfGJF8s0u_j504f51bwPQucgPeBGOu_AG3CFqXv74RRfIPjagDZ6QI9LJTWySmYNS2PXDjKzLo1DqKUvSOvKPmAOtVDqhBWGQPz7b_-E0qjtymh4uelvX_GVzkeQEUolM-nZiPD7b_9LZsk8SYRKZAjCouiDEgtUIDwz__qHdMhQe2tk3gdtYGEqndMJC7MBobd1gZadQJRCuxrtrtzkSYUgPLzMNv1s-wqsyGXlSGqwxC24oM8CwhqFqyzmIFxQQG2hlFf_c8Bchc2iASKTq8cCN0b8NDs_h_np-3kfcitqTQwFeFshXP_3-29Pf3pH3NjKNx_m8GH-0-z95QWcXcPF5Q1czd__eD676sPs4hRuPsxu6AbRfbw8u7gZwgwshmCIgQ5mGYJ2nSTr7UMmLMf10lSWCKR38IDWywwdWWQLb-Hfvx3A1b-5v1v_cvLq2wP2nNAgrRVecgLpar1AS8ZfWZlDJnRvn9xt0Tkmd4Y5O2VKzGEpMpGjA40PaJM9G1sLvfWF1KsTcOg5wE3lSZYreAtH09Gotw9Gg4DpCNbrcCJFOYqsAG3WkiQiOsB8hRTA6GAhsnu6eEiGIWtTgHAOZEIpx3_29sNj0oHaSr0KyUMCdAilZzagjLl3oOQ9Cb6Wzot7HMK1AU9p6QpUqsn1JPBkcDiYgreSUx6kdh5FPoxFY8c44DyWDg5JHpFZ4xwL83o0GkFuat2HupBZ0dunQ1IUkvRBaGSO5EjcgBI6p0rBCUDmSpkL8HJMHPtHo9HoFbwcj4nBOHyZdv4ed4jC9cnOE_yNmb6jOEr-NcsoEtUYs2Tp-0CPjGAD4wP63zygFUrFoEqSx4CKMrsC0QdVBdSFUQhrqZRco-e4ISPnaCnuQsxUPtUrL0oMlXkGDjOj8yYdhG8MVwi1BJcJheAoTqV2MkeQnqoscjtoW4CwFBBINTS1CAffz28-zecXqaKehIQqjdTecWRGI1QebSfBdN7UYKk1a4yutw8LLGS4t2bLcFwaG_wfrRKs3A_Cc4TGG0H6Pkw4WBDLIVzLDdcjoXr74EpzT62s0iCU4TxA-JuR2oXgEbAWzmi7hdxWa1jKkCBk9DxX0ZxkF74tw71SWA-1sb4Ai4Lrr69lhkM4C93MSu-Ra9zlxZwbCIUEae5wLVM37e3DnbDZHeeug5c-FG_qcJAp43Ag9IBqLHWnE6qldDEPJTXJQkwLoR6Q01W6V30wVJFEaBRIXY4Oj3WQ7USKU0RS_mb3w3AxdlYBS4sIWWFkhieBZ7S05mYSQ-qFg7OLq9np2Y_XfSp5PtroheseHJ-NXUdql1m5wDx0KOETsz4FmKmygscNpTgKyWKUxCkYX8SwYWtRsHZGB4U-nBQHFFhQzN5x24uHU_frGOGOY40zTqyxI3OsNkl0Y3Ophd3CzGbFudAraiRGP6CmfhC0ENxfX7jQjolYOu4B5Pkdg_SbNLBIcRcKeVBxy5wrSiLhYHb619kP84sbGmO6ilnB85YvhCY9qCu4wlgfGlrI4ZB5SxozuB5SOHiYvKaKVArnW392vJkZq9FyI5xMpoc7TgVHmpjaPfII1anGJ6nGkyQKxUMcHS060p-uVprYYBwxUuJLz1Yhf-VyDbkUayT5o8Z3sRlxY4xtsywkl4e2ZGWCMsOUqKVehbpVGifJR8isjQ6aCA__UWb-u7vk51qo-6AX5-liC7OrH-B8fvH-5kPq58fDyWTyDXl1QlVmZZGGWPf3SljkhhedFIoGqSqSU1MFoaTiVk91PZVlT-6n2rgg7WYXF5c3s5uzy4thbFrjIdvEgai8Se3jrglNrbbhztrkGAtSEQxPpYSzdyWpNBA5dw7JAcwfavbN_JgVQuo-X7si71GLKdFCLp2XOvM866URgcxPNztrgVkPE98bjlazZnK2KTN3JBpSbRMbydO5khiLchhxJoNg2qbahwhMfMPwTjqmnktezuUatWM3w_c_w4fZxekQ5jrndgSXV6fzq6ZKlFVsUEC52Nih8qGHtEsJuXBJ3dVW2nUax_n83Q3JsBZc0GmtGXznDYcJFX0ElJSeiXUppOVxrBY2b1tgKo1hEvaFNdWq2PERvLz7dHt69l-3ZxfXZ6dzClbu8YnxWlCtxIEoac0QC2rmtShfDWEWz7h89-56fgOFYFMvEBZytUqFQ_ow052E0lKpxhhxQHUx9Uk-kvaFo9gONhUr8qbfkfeFY5cPcOORCtj3lz-x-7gVxU3AlUps26EvUyisjIblMIkdCDWbg2w6Pg6NyXlJ98Ok0gmJZqXsNz2MEinuP2thV1JD2IlEGymwQPKoCxF7MISL4DUoyEFUg9KmIODO48bfcepZDhIi0ZFeI_KwiSedIaWVLW6vcS7kYO60rGRgMoET2yjNhGb2tFxyFvGKyO0E1ZLKFzUW6gxXl2enQR5WsLsbpgpRG-ua3bIMe-eDkIoDhqdQttuABqd2wqOx0zXFjOVNB3AJXVSK5hXqJIm39CEHCqkCIZUIqtsD9kcK9cswNKYS32-G0vaEWPVfuCY9aw2aWnRtKpXDyvDmEUZnNlBJtYWMwlSLbXAj58td2K_3fv_tn3u889KyetfvZH6aI-NkwB5aSIeZDzzp9Jq6W5_sUYstLNDXiLo1B_fZmNqJcwiFdkgJ5RqjDzg-paNpEzuqi8oXxsK9pkbrzBq5X3TZNv7NDXKytPNpKRR6H8oKWkk7N6MuApzkDSwzisb0YBcatjEQ7O0fLF8vD3EvTEQkZYEbeBCqQp7Ow1LJ4cTrCG8dS07ZPpQmK7AfGzoP1Fobz7sySH3vhj3GcvY-xI73MeJOe_CPHkClycbrdQ_Cajsd9SDuJuMT_hIKflX2AJ40wl6PEZEnitD1fRgMBoOwm4bsDENR6ryD_8-H-X0S6j4ZlfghDVJx68yUye5r6TCFUylWTf_i-SS1LFtp5jYa8JrD6g2IVZ_LxGA8aS73gb8MDmgjjZQ1EiVfGRwcE6kzVbrOjPnqYHLY3OsDfxkc8goayOnAOCqmiYlqYv1obgqBahwy53YNdTtTaImW4lKsusCe6CIx1Ll5QlSoV75w3JW0Ya4xOlsmIQfXKLSDvcdDVTDj3rAHsWXkbwP8QI3HSmPDSqMJi6HpmIJsd_OPF9rtP1yYPvo-fvRABwnY4dBe4eWsB_BrJ_xSjTjhtFpWNAvxNtLv7oiUA5017rnwS8pywaH1U8btIynL69w_uqK1wjNMN22udbeg9n7noUcEjxWicI5r9eCPfZjfnOYwnq9CndK7G0lKLarRcbpuAQXcwAK3Ji4PcUwkpp1lkWeFsFnH4uzCnNGgGmHzI3VoxHE7QUX63SI8a2s2NbwcHxxMWzipgy39-oSRxi8yGtGzh09xqWcY1V9idNTy2cG0nvKpv6jZ4VGj2A4e9pSP-7o8rN0jLO0ZRv-ChRKnburtRCeNA384KLvRyXOFzN-mpbuDmh8_myYRyN-7Cg_staTHEyKtHFLVCz0rcV9xXKQXCZ9HJ3fjo406Tt50cMChwsGBhgp-PFlJWgp3j4bO0Z_DQo-6B7dSdA--9lUuTUfhg1Zhs1zKDHePrdtjP4e6dsKvI0H30BsUcGXMOhzL9B1tc6kfa-s6x34W4N0J11aIXW2Nxc6pb46bU503Vqx2tXXwWNtnsOTH4d0Ro3v0XHsrdBZPPyIwZzw-ao6nyXC7ezg-8fDkabF6VMZGzx_-PoAZ3fDqqB7Dq03E0lgvlDt5DpqJE1IAMb-WiPEpUqikbOmgOBGTgVrmvoDxIfeqXXro0h9Mv-EZ-gv0dZf-cDx8_fromy_Qux36aRToC_Q78hx9VR63o--bp_K0BscYHNzqVkr8Qkz-WF-mqbBh55TMCWydESa0JHFoJUEXlzFX0-IoYDw8hDUQHObRDnLpsvQiJzXmdohLqxAHagCBA0bhvNgGVOAvtHjT0VKv7sLJfBKvPAEj9gQTh4nXESwEjhdpgjKAQRFkntI3oEuj0z1zSssdby7U-nPaYGjEul0LqSEeTyqHCZNwUcqijgOCeUDh0pMvaqlzUxOPWuoYre2zR9NRcvZBcPYjetihH4_as56nr3fpjw6mX6R3u_QHVL--SP9I_uNH_Nvga4CVP9V7w4b3BP6Nl7s1a_DdTseKUF2cVpm47SxE2xY72CFuNVCGAI9lZbX09Hr2T4y1HzvYjQOLy4QoCp3Rdh9-afByfvvxfPbD_Pbj5fnPEYnRBOhFiC3QBnxJMN8G6nrFA2_AP-hVzcB5ETDcUmKGkF4iCQ1i4YyqPMKd8Hdh36M9I4AcIrtnxgxet2gDiXuXID6a0RqgnPLTgcIVgZ8E2O7AVGnxkz7ke8IRm32ZfwHA6Jnx7dWAHAPs81MzzeDwQCi5ov0zaCTpMAZhEqjegTXTO9AksoDr88uP89OIT9CLBeJM6b4UNr7laEA4GwF4NglPpEtpXQCzSE56jA4ewvfGF7BAzeRhWXYi6DrmvZ1fxUSIUgReziiZQ6W9VHD36fbdj1cXZzc_Xs1vyRa3P1yen59dn11ecImzpC9B-ekXAsya2STYkF_Pdczzl6YcFiK8TIaswOwe8yH8JyN69EqVoAHGaxLOtA2c-QXB8pZVCmU3gDzx1XwLFDRw_PLWIf02INCmuZ2812aOzN8ub3N09xDeZaGFbjDFeuJwtaZ3QuNuPoKTvyD_tZm2E_UnY--D3fcoEFa3-ul5xHT5mfPiuhPPCVWbzqGFefO6Pee6QNq-4yGufnoKveoF8Iyd8hhE7aA_nU6psDDPN6PR5s1o1I6pRJvExqccPQrocpwctww_wxHFHsGtzPEZGYM3w79hVHszHfWPD1sZyQKbw2mj9_cd07pnZGSXdzi-OZyO-vxzhn-J4w5Deg9ko-0mpCpzYSbT6PWlyCigo7Wfs1yHyQENwdOj6Z9hcjj6iiDspOcM3vKYTL4ixw4PQi2lVxjhmtKav2Hmn4FI-TYD57eLLeylF9DxuvAIewejg9eD0fFg_HqPkZpfe_8H"><img src="../examples/hexagon-pavilion.svg" width="270" alt="Hexagonal pavilion of six wedge-shaped galleries" /></a><br/>
<b><a href="../examples/hexagon-pavilion.arch">hexagon-pavilion</a></b><br/>
<sub>Six polygon rooms round a circular rotunda:<br/><code>room … polygon</code> meets <code>room circle</code>.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=pVnbbhs5En3XVxTsh9iIpGnJlySeOIA2UWJjEjmwtbAHg0FEdVerOaFIDcl2WxsEyEfsN-TD8iW7VWS3LvEkmV09WDLVPKwqVp26aBcGYE0FJofclBY8WitShKxCpaSeOZihRis8ZpBbM4eL0RBSM18Yjdq3YaFEihkIncFcWmssZt3WbmsXBg2UdOALBCfmSI_reJCco2uDMyA9uMKUKoMpQmWl96jB6BS7MGlOmsDD1i5M-LgJQRamgoFNi9dCz8CJJR0ifJsl8YV0kEu1OnsulELnWXKFHgHvBH0Ck7d2-ZGF8B6tPmHhYaUilFr6vaoNWRtmYqpwHz7Al0-f4SPEl9Erc7VBlL4gKwRr7SXtZB-kBukd4_7w6-J6BKkxNpNaeLLUQlgxR49WOsxguoRKZr5gULZKEPS614YXw7fjszb09kE4KHsgPOx9-fR5n2CFBpFlFp0jXeB8dDUejJ4P4cunfwPeol2CzEBqJzP8e_JOMTVzdDApe92nMns2YVOYjswcWHReWA8LtH8PVGrnhU6R_YRuiV1HWARjM7QdqTNcoM5QewameyGd-yudg1fC3dfgAiwKBRZzhamXRp9AZowFV5Hft6GQeoaOHOrvCU1yVoVRCLn0HVOy1yHQhyBMR87FDNnRxoVFJH-lSBNTeoa2U0SSlpWxviAxM6lnkCrjUC1DfL05v7y8uDwfvYK3g_PLKxifDeGfo_PxVRcmtc6TWrl17PrKHzgwlQZj5UxqNrBo7TZBzN5E4VMHuCcXhpeDS7gDzGbIHlP26ZGjwyQhb0QOvtWGXvI4SdpQFTIlP12U3lGwG807vnz6zA90YaAo8oQnHUnCKL50UBXCw1y8p2to-KT5dMLOzddT9mGO6EGZVKjO3WkF3qz-qd1HWpgKX1hj5nyv8F76tEANttQOpiJ9D0Z7wxHtCmGRoBfC-iVUQqlALuRc9HaweWKyfmLShXGBkBrt8M8SdYr0rTZe1nwofOQda6oHDnxl4OXlcBgoxvHlT40v-BFGBTqCpGDDs02DhZYw4U3Mij3IjYWy19oNQh7yW8KrBEXnSB2tnGUKg06EQmsTmU9i9PP_KxbkyxMQeaGSOqOkoVmTIBbhaFMVaBFQOQxuSm558fLl1XB8BYPLIQwuz8dnb4bj8-dtGF2MYfzr2_PRqy5MmM0cK0EcZa1YMuRN_6ebg59uDtkkgm5KSz1r7YIr55S1pO82aSEVWhsPM1PrIGCSGzuBPVZOOHiqxRyfhVPIU4mZiT1kLtG26YbYciC1R7swShAv7G_Sj5I63lCprVHqv2xMVzKlQC-EntGxrA3LH0iVoomQc4-WYmBubtGR_SioTKVXxroaD169Gl7C-RWn2ucXF5cvzkeD8XAVJ4HqHTjp4ThJIC-tL9CGjMPpzltEHyMPjGZXkw5cQR47R6Fd48bBsKugXcIpJOGrXu3ocflqOP7H4Pkvwbc5LMgVhFIOnJdKQWqkTsnu5hZt0JypjW3DnnJMhOAMoEgL-KPUzLuQWVHFRF0YS4bCO0p0xoJFX1pNnicqbzgiahpIfSmUWkIhXDDf9dmvbMK3rwcjst_47PyK_-luFTnS8ZFUZbCR2S7NJTPzsbSutLfyFilzx0KCmKEqjKO4ZRKxGHVXOJOUUYUHAX-WwtJNmzxkA_aGjbgVLEHwZKIJb4Wkeor8l_0_LaTH1JdWKDo1xGmg5JAVpkiWLYymuobFlR4ya245dFu7oMTSlL4LL0llFjfA5_IWT0DJW9q_zoKcVzWSH2nPO6CSkYNmVEAtKfxauyHucYMZWU0KWTjqHsI8YIgZs11zU9NSKt-FkaBCweTBmsZmXRgZdpTWLmhhramQ6Epo6HUfwzw4nCc9pWMVdjKDnEuIoKTCHfawsBoCjqUPN-PEMpZflO-IAGp6iMEXfHiHL8gZmJDxIUOXWjlF6HT-cEZTKl0YyzkqbwxKFU0T21x4IrwdvSI3prsFJ-88ooZSm6nztkypjFZiiiq4TlMXpwWm79tkXqboSixdNxQHJHa-Ih_Ntot7LebGIrw9H42GL8JdTRgddr58-rzDRdBde7k_aTd1dSD_1i48v3jz9mI0HI1jHbBWa54QN0qta1kjWxqpPSj5ntL8EgydzzGzYl9rZQgWckhrylnwnZwK13ZjIFJwo8ygHsOvZX7MYGGcZGqgxJVbxC68wjpl8hVaOSs8qUNOxCG7CpDmOzJZ4IaJL3COMFUlLqykfoKVGg3eDF9A_E64UNWIWL6lS6GNXy7I0xV6j4Fha69ts8XJZU0NHzuDCUyVSd9Tzp9TWAupuy1ufXbGkb0uTbUDH1oQDTCftwB24SgJIdpLkpMmxNgQ4c57SUJMnr5vjFmXmJw209B5THJVumIC3jBoKHzoPi3kIqVeItCQEjrjJFQIlXcYV6Nz667QbQHMrMzgKGkBaCaectECyCSxX0nF0i1aoVSrBbBlY1pS6EM_AgCn8CRJkvVSeXctPW70iRkufPEzGK2Wawx6K9jBAmrMRnDKOXATNeCEhHECYjtvelyEam8rY0bkUIqQvL9RodqG8Pc4qT__Xmt23YPT-Phvye_1Yn-12GsWD1aL_WbxcLV4wKC7cBkKnLq8aZR37JpcDmLuQwlu8pBIg_l06K63bo_OuSExk_ofEu-mBw_hulcvkXA3fVrq10sk2s0BLR0EwTqdTmej1-WV_-nV-k5_3aJbJCn4guEUDr_yG740hbjg8kLorE1sR6uhjA-WWyjjG7CzwevXL-AUeo_vA0utcY4iQcEUfUWsXZMVwbs1mcZn13AK_X6SrBaHL65J0Ao64YHmm5eXF6MxnELG3zz_BTpBkBY_wZWzzE5dgUrRQlP4wCoe-0cJfIijhL0q_s32aSXbD10hfNyAq95Rn0OTgZo_1uCIRD7AHonMWPyBRNv_CoXM8U5_CyWJO_eqb0G470PAw2CXBmq18DHYilO6zE6nmHH77qNJ1l5O_gvDXdxF34np8B-Y7dSbehTNj5PVztKhgylmdMDmScGItKm21uZJ7ArxqPok4YudtU3wEHq9JGn3e3RiOIpgSy-V9MuN89j7as2COTfOq-AuejE0mp0JpXZqJRgglTYtQ-eygV5XfP5rkzfowVtX6K95T6gkKvgJ-u3jJ7Xl-MQIGkvIcFG78JIrSJ6mmDxfY1hqrGIr1RSZP8cC02aowx5OzU7JLFYY2kRchSIHVyEuQq6Ilwa5MsZ2-aEAkJ0GfL7vRwkHSsghT45iGx1Cjoc9QaqgygaIRWFZkNpwvX7CPhewejz4WAMjkZmfWysYGmNlp9k7dlujoYkq4aF_ECYnvgAipTVhpphFnSdGw1M65BnteLow7tkEfJyJKOkp-zb1UtPEEFGbBXIqCQ1LJsMsLcKGwZmra3lOIdfnL8Zn3GHEalGsCr_4HGdnkuaBgxS1t0jtcPcedcnJg9t02FDRoVfasuEaa6zrLnzBgLUCMjs1_Nya_RyBP2nM10uSJFJqmE0Q-Uj9TsnbEFDHR-wE8bWSYu3-7t_eb7R4ktQQqzO_vZ3vvGGCDre_yf4Pn75hw0dJzXZh-9HW9nivF3XJRJkr1DvcGAguo0OK5Xo7DHPqE-vigst63luIWwQRUVetXug7QjUvGnmpQ197JrZp9ffBPWQeTz89hV5M8tsahwcCRQXGjKbuf23qjw3bxBp4uow18EksKxcSw7xtjsKVzVCebEK08SDM_DhECPrl4PkwQu7FGno_8k8YY_Bsi2KDY29VaIGxILaq6KBzXlotfWmRKSn4Q8xfNN3mz0FmGvd5M-9wdceHU5eK3AsEfqYguuuRy68ltftOqYTNgP5YM8WtU0JrFF_hGAY_Jux-HUNbgNTOooX4RoDsmAHRm0UQegvxSZLcPYkl0rYZhJMaIL7dg9dIuSXh4dG9eFUaXCm8iZmg3w0YtBusSlmIbXncPwpoZMtHf6WuyQVA-Cv1alLyF9fEeI_JfhTR1njyiP6j5pquTC52al8db8xSwMoM3dYw5QQmUYUJZGhpALXG79wZ1e1fBI3jpg6PypqeZjWy5iYhFV4oMyspCuQdazu1_LtDPQbJjfHcuN3ru07q9wB1pg__1qZez4E4m1NZ36ttfkw5rjHjvciehlYQ32DjEr-F_Kj_PeTcSuqT4tuPIz_uHX0HOTUljYihfv_KT7xZbHvvMUfDx7V2qv6tp_N_vRhvsBqe1L-afevnG-a1sg8pte8ObvpfPn2-6T-8bqbC4QuGvjmkLw8fXh92m6HwIY97lrF0I9LOlZj9vDZWphJloxF_4JqijzPCD_xqedNr133-_taOfrMj2V_7zS92sbxa_wy2tfNge-dB2Hnwl2cdbkt3GHYc0lmHm2fRGER6hTHBLaz5A1MPOzSF7YTRchgBBermOfS76RJ26h-z4zqRyE4_6R93ksed3vEOe87H1n8A"><img src="../examples/terrace-row.svg" width="270" alt="A terrace of four mirrored houses" /></a><br/>
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
<a href="https://playground.archlang.uk/#z=tVvbchs5kn3nV2RQD7ZiSG6REm1Z3t4Nta3uVozH6pDk8e68iGAVyEILBKoBlChOR0fMR-w37IfNl-xmJlAXSr7N7OpFvACn8oZE3ngAZzB9MTmCB5hOJyewAa_MWsuxD9bJHZS29hK2pfUSnLUbD06ZNQgDtpIGclu7sBOumAwOBgdwU8r2I1AeQkmbtYTKKhPAruijSgszAmEKerdSzgcIJQIHC7UppPMBvxVLW4fBAajAYCLAxQ1cXMP7yxs4g6vLyz9N4L3lrcpDIXMtnCxABHg-z7JsdDTPssPx8-kU37zMsuzwlNEGB_Rsog1fLGuliwizdaKqEMXZ2hQjZjVYWufvdkx5LrSm9QEELFA2C9iqUA4O8H3tpV_A1ta6gKoOMJvCZobsb6UIpXSgTARcaWsd-LyURa3lBD4il9Lk2nrpI-dicBD1AqF0Uo69XG-kCVAJF1RQ1oxgsb0l0S-YPHkv3S7KFBGdFIVvhA9__9t_4RvEjU8ewaKQPndqKZ8fToINQvvFiHbkyuW1FvgcIrcYr5TWhOHVptI78FJ6MDYygwzKaBE_ncMPZ28u3v8IVx_enU_g7LGB-FJUkqlcOinu-FMj1L2Erdih1ITxW4mWNziA4bZUeUnfFFbiYlSZMoXdgrb27t-HE7gRd7KRyO028hEXWcNcJTqeoTF8PL--ga3QegI3SAm-JFuQvjHbZscIvAUBrtaR7txuKjK8zmOiMeAnG1UUWiaYxtTYPHJ6UqAnjVciV2Y9gQvSu7HhlLashdbS7Z75KGGy38gHUehVEfET7el0kfEKhXvSDil8IBY61KLkEPT87PpmAmcuL98JOugoeLLD5Q4qZ5dIuDWSHxJKld8Z6T3Y1QqkyEtYibzhlLFJvnZroLRIaTRdok_csYFKZsBYcjJg87yulPQjYF0rD_JB5AEZEK0a8KiZgj_02uKRXYlcFBKEVndyAldSFES6yO9IH6dklADC5SUkc0fsTaWl_5cGeUx-b0LLxuNfvDUwHnupZR4iU56Q8PEdMwMnK-uCh8WQFTk8hSFKe7hoD-itfHod6nG4wFM1OGBRok5QPmdvri6vr_dNsBHNFnXu7UaiWshxkotGlyo3dDT5LP7l8v359QQWf8V1Wt3jqt_g73_7b_gdyaOPK6fuRZDN58whfeWlu1d556u1s3UVvQipzQcRJCrXs3vbKrP2eORpfyk8_OX86hLW0m5kcLtTdlLtNlCGzMBJb_W9RLMhtesdCA8q2hQ5Zwdb6SQUUssg8TyKDQrHukIZEdBy6BNV-BEsd0GOVSFNULnQgwMonNjSKfuT3Cyl86WqUI5vz9-8O7s6fzsCg4SBMivp8FCvnN3AFp0aHnrktEQajMdLwf-vfbHOOgrZsU1H1wpLqe0WcmEgF87t0FzrJblYIFYaL20siI2t6aYcHDQGwLpMdKMR6AJKcY8CcOpeFhNY9E1632hRA34Bzmqdrj7hpPBQV69hMR53lb-IlwWdcj7uoILHI9xe89EjsVeR8PPlu__88fI9SWeEfosvKnAyDwIvLn8KAj6w9tKZb28Ca1B-kt1SHUq-woQPE_joVAjownyCpDAEHSaJwUhyu_gNujo0OVjKsJUSMSslc-mTP4pW4pwqrGsDkEZPjKiVD-RmeF0ED2ojPTpmlF8uTXBWob_RGq19jx-8GpHd3g3HUZS4l06sU0CE4qsDWX1jR9Exa7GUdAVVWuSyQP9bIsXxYVFObsM6OdPeAproKSy0XIWxXcXDK5b2XsYbMGwtOMlXudBQKNSPsoYub0uBSXSGgBHM68EBLLxW6FAWUFjrfP8cWDoFNsUyrQCeC9BSxPvIkyOAV1kGmw25BgqSpnP-oGNKcVdkcSt2h6-ji5ewqGx-JwPTASuOM1ilaMnWTAYU2gzfNFT8hF58CL8NAGqDJrzZDAAOYLF2qoB5tjhtIyiPBwKmWcaXWrziFytd-3IBK_UQaodKMXQyQMBkMplndN1NBgARcQBQCTzTZ0e8NheVHAD4XGgJ09NphkuMdaGEuhoAFGrjQdTBgtCaFkZbJDMfAGi5lqYYEN03FL7ZgB4JvSwJIDgpQ7raMYyZwMIrPMboLyiIwDDwNRqYERvpYaXuJeF19G9NG_898h4MR_EeP-35x8MR36rPzw9HIH-tRbDuFu2YgJ9fjyKT8eTFFYcj8LVxyktay7t9bbwM8YOPhxiAyR1pQ8Dbq7Mfbi7e_0ioP51_uLq4vrl4Q9oX6BMqmYfTNlzBO8ZYRISNLaRGKgDNPdQYFZgC3xcikMqQK_gtsURhVCk3yldk4Uz-7yz48Xg8Bl9KrZFtNIHkO1qTp4Bo_MW_AcTYsviOAEE-BOkUmXMKpo6yDH6D59koO4Tn0xeYu7SvpnhuDvHb-IpShUTpzdbCqtZ6vFVFKLvmXVjY2DaY3Vp3d0oHaylLFblhppd05FZsgiOCxXXKsN013pQ8UFq8lAWtn8C54GtQpJyF-F3KXGAuSa5NGbYT5SG3JihT29pjOIBWbOt1yUGNwnCxEg5vdMhLYdbSg9CW0q5JR5LbWyTj1rT8dqQ5S9I8YsGxGPnN749B_OdBTrogJxGkOZ2d5CZ4qVenTaw8ivdIjH_9CDYqxFx1aUOJ942RzvfZIrzPEdRmufE1JbnQzXjTm6MusdN5xvf0NMvwambnyr4Vr1RU395jQRpSDQY9SKHdUlhQCSN1n-q10LdbeJLs6ZzIRloS2fT65Al1IIz8BAxzP511cPjNU0B4W-8-C0Q0NMQ8ZRuFwtjicxiv0jl99Sn7ulMhL7-CoZabp600lPAVKC-yjqXymz0gWUw_DzRvJcqvo8t5hDP7AkHT9rTENw1S62DZ33BeIYtODoGxDyUhi69zsN0MZ_iO_yMQhwLAsYsqvnO3cRHWi5IJePVXCcjsA34Sw7CIMgSKiyI2YR104i2K1PhaZpMTa6GMD9Hp0aPw2c9iXYFyZQ7StFpjjalaRFB0kYSkXPTKskDvV1d0D-MlJ3OLdagm6eHSFUXLHNtu7H0MtRvQhgT8skcqpsfRq3YFFI9OZBFaiSWCWV5H-_I6x31DlhZjlBzgdMHjmULpp8PzNNpbWhjheNcg8tRJRjjF4Kpd_3KmuL2N2lUTsqfqSCqHJEHRY5sQfa3wZpIPlVa5wnT0OcXKW-UlLD7eYh3y9t3Z9-fvbi8_3FxfvD1fHO7LMQW5ldW7tTX0LfT94Le68oTxSSfY8axxbRTnj0zMkCR_Qugv59khi7db7Ys6o0Paqw8Mf44vnj5W5FkQPJGCf52DlbWq_Z7jBphG7cY44jHgjKu6LXtfAJx9CfCIALuuiQGzTwAePQF4kPKrlOpxEmXktg2uT2OcXhc7jDl9_EbvKGi3VSd6gukowsaEGwpZUarARQgu5bIHab3CiL0JOwg6mLLYtz9-PNEKST90hPFkd07dvMP4Ne6JTNvVSuWyZwupIDS8ji-etgW69PCUhc71lszh0Un_I68eQvS0cfe-9vgK7GAetQokzFkH83sRStybvDfu3gOsg9J9QL4wnwb8EJRWYdcQWfP7JJ14nXG-PP4n_zhhpRQalFnEJCa0HwUL0U0v0AG26b3ejWPpgPnE_ohWS4nhtN4RLvZRRBdqAUG4tQyjJl5HQ2yqOFwmu7r48_nb1EKg2rfSVMbSGkkj5FjDoyytDqXFSDfXhJguRQw6PQcMikvodcBqm3Wws_UELg3uTukRocais2x8MaYxTSOh0kIZCriF2W3F7hQWKLGmCCO1foaef4vxeUrcKeJVxXfFLSc37LWm5A85h0IHwU_mhA2zaRnPTRQca_3yUR0Ei59YP5GuKdQKTs9KqdZlgLVwhTSpcgUiDzUqDpSnK5xgBT-x4NoIJadcqPJbKSuQilxOp00AsTbSJiOYevjS6qLPMdejNcQSD_qjJpMSAV5g9BZlcJJlzAkx_gTKuo_CiQuhzBuUWdagOGS_zZvIPY2oiyBaNozewfRoTlWiLe6KhT1SHlWWY9pyJ2XlOY3CMoIn3FxL4V5zASs-EGsiKsU9lLjELJaO0WzKBSn0x1qYO1b6c6ybYEZEoCfzjCw_-WeUS6VrTJd-EZvl4SgWyBatsFIfUKgNdQtDVA6me319sJOOPJEYOZMSAWatFE8eC7GFYM_Y7JWkgpfzDKC7u-s6ojdsIdgX7kEco-o-BYE7ehCc6BBEzHlEgCmRwRCv9iFaP9_hhfKT1ig9ETLPPo2CO_YhZo8gTrLPQ8z2IY4eQUyJmU9DHLFpvxFeFk1dmgOBql5qladuOnWocBu7LQ4fKBbHyhUeePQZmhLs5CVU8Z1NgXmTubDHSsd1nlxWTH73d-9H3v3dL9rdMdje2x4TfNx-PJun2zdtn7bb2Zk8tV3GyxafHPd_cnt7p8bm2ylWzaWL7T4fRwi-5U6NbU9VfGdSSkP0pGIb_XW8Vuv_9zZHSTIzGTITd-_L8qnNvdiIJNnffPzpzbK_-cUjLb4iI__U5l4ERZuPu5tffHZzL1qizS9nX7nZp6oDbZ6hvGIl4CsE5lOpgROX2bdvPmrIPuqUM768eRt9M8T4gKPDr1RVPIO3Om6encz7m0_2BNba-2QyCaU0T5SavyWyTNesj_MjVFyn4RPqPkMhN9b44ChwnPQ62spT214WT41NIGwzOEGRKV3MNETwutfw5uEDvDSxq7e_HjFec4szuZuDlOakQnu_fNKRBXsEYimSSCXp3iPg-vLDzU9cym7atE37KDYneAaBAGItGwcUZMq8ZM_nTPY0nEKpJqPuu8TZEy7x8fZtO7g07x6o7nZa-eRu2clnefu37C6iB2tpf3wZPHLHq9oZRY2xfzLFaYG8XQnA8kxbajJ5iRGtrYC6cZyUzY6z7OFVJ1m1KzHsIaniu5Awglhq2UPFYpDErITQkMsu2g2uHw4e40V338GLn3we721n27ANe5MLd7UBh4FrL1PhDD82DF7Dwq5WHhug0XYLhcMePG2D8yKESg3vZx7enL-_uTpvmiVsxNRR6gzeWRsqp7CTmNtNx9BzEYS265qsvBVApPbWK3PXZHGdxCiN9mTAlML0GL0iSamN7zqqDliNiH9fhXc0_RxejpMT0n0L3svP4a2cKtbyW-jDYlQfrweIl26ol7yCbuDWtscUzOOTOkY-fZllDy-pZ9yibPM-RQw1WdoQsCXPpLyYZwxx_ATCUnhlAB7TwRiRlA4daM3H82zwpLgJhUKCp08q5o4PL4iEA4pKHihCsCtMnDZLbIFVlVZkykuxG8W9MZdu7os0FIddbUM429RuTrUK0Q5N8KqL91iNbZK1xuCbI-AkTptKlzrHOJikcr7ZsM9VOrR1noQJ5SmF_qc8JCC59jD8KHwp3RAfejKbY_5IZy7eRTiSMOEajrM46ASvsgWOhPIZ3oi8VAYP7Pdnb_5ImSXnj0iyryscruTbzAdJbgKXdOb42rIINksD96bZMPAiJ9rIYzRnusBRGkF7xk7-Wiua6E0DDgJLfQR6P53MTqgurqW4T6OuWH4kNrI4JYRgpqPBpFNOarC8TiOLPBbw8faHi_-4-XB1fovs3t5cUu2cW_4d7SgP_tdaODlWvmx0Ra6NG8tU6Yl1pliaIkpNmgU2vYEp6nX0fRlLJsaCx6_m2ejlUVPwe8UGm5x30nCjwL26RWdIp1t9I4qoQ8pDSBRMiKW3ug5x_seDE7F6I5gfPkK-qa7FeAett1eFi4Nf7MyxM05KbNjjQkpcRMBYHY6FiBLjHA6DYisf54JoJoxKdW0ZaiOFCX3BFdLfxbQTI4WXjdDoynvZufKkv-tfyEtr73LhY5xChfy2yEpe4rhTtI2LG7FPT_acmDR5m8JgEpm1XQGMeXpouHjvPkcrpT92g1QS77lBKvH1PBkVgjsV8re2pgu9b1mucHbJXB5zq7PD5jEXvFvb4tWfYXOPytmXnPVXUfkI9ugfhm0OAzWI6JCmAsZCGfhXNOF_W8Q6Bhl2ZxbESR505hp1sDSiNIEzDma0oBumGWp9NGinfDdA2-_pNYPw7ag2-0uux_m7eAq4Ph5oThPbzTTWSYPtNGGO5XZBrjjY2CJtH5poRG1jFhzz6FZk007j4GdePGxndfJSKEclJRr5pRYlDjRioDhKORPXKDE9GcE8lihXnE3hqUY2j7l0ycVgQk8j4bhMPGBBOfqoJsxLuRQ98zUsOBtcQKid8UxPYA9G5JCXHuz1kdswlWYYYwBrV-KZ72Z0aW36TYjQdy0dTTe9SfpStSjGAClMxqIca1Wlmm-HD7YcNESKwjx2L1exqXvALPhnaQqR-2pUucVJGBr2K6TE0T2O7XkIBhsTNHdUdBvknRgI1Ue6T4nFJH-AMYZfI2g_2sEfoNdhxD5byr6bJKWTnnzFQ_7AMzz_Hw9hnfU4SR994SFR253E6Cse0nDyjz_k8QDWM0-DJKaYwEcql_CYnKLCehw8pwPlLanW1oHmsh3VC5rx4qVsIiw8OvH3LaLnK5oJy4WtA9roArzYpR_vtO6I_AhZK1VzeS1UGDDs_WKpibq5OdrJuDnuwxbG_0lbEfOYRad_Zp7xPDcJq2hnE7fJdcfYqw1GJn2xN2N9Nf1iRGAMfnN-dXF59YkfK1GMFCfuKYWOv-iJeQzfGq_5CNODTI6D76lHxD94caJqfivF3jzOWSSh8wQejdo4i6M62FviuAgf3P46ihh19OuAedMNYoG3Dod_0paiyxiNnx1hWkgk84Qd5QnPKdW5l84JE39F8wphRzg48vbq7OPF-x9vL_98fvXDu8uPPDaCBNIWdDwQ1R9U0DL21itnf8Gx3EeTzvQtZT63yx0M01hs_JzmNmbZ7MU4OxlPXwypXf374H8A"><img src="../examples/courtyard-house.svg" width="270" alt="Courtyard house wrapped round an open court" /></a><br/>
<b><a href="../examples/courtyard-house.arch">courtyard-house</a></b><br/>
<sub>A ring of rooms round an open court —<br/>the case where a window's outward face is<br/><i>not</i> the side its bounding box suggests.</sub>
</td>
<td width="33%" align="center" valign="top">
<a href="https://playground.archlang.uk/#z=7Vrdbhs7kr7XUxTki9hYWduSYyfxgS8cx3vimcQ-iDVrDBYLi-ouqXncIntItmXtwQDzEPOE-ySLqmL_SHYc55xgsRfrC8PuJovFqq-qPhZ7B07hcHgIDzAawRJC7hD3fbAO1xDQOZUi5LbyCP_9j3-CNQiZUyttFlCiAxk4gLmzS5gWeI_FFGaFTe_8sLfT24HTLSHaQ8gRZpUuMhIS1iVCyFUAa4o1LNUdevBoaKgBj2nQ1gxAmawRr31vB3K7AgVloQx4tfbg7RDOVZrL4rSMMmBdpo1yaxk3s9maBc0wtUv0oIMHuzJQqgUe93ZgqlyaQ2qXpS5wCiunA3oIdmVY9-Gn0dDfLwbdJ-NHTw7kiTIZSczQp07PEPb3f_XWTGHh7MqDipvx__Gf0yGc36Nbh5zMYavgdYZiIzYjm31aGR38dADThdPZdECiS1Wio0c-VQXSH5leelBVsFOepD34oAJmYE2KvHNVloXmPQHSoo3_Zpgqco812NtpvaM9aO8rFsG-9zliAPYWAi8sbp58PIfryenFF7i4hqvLc7h6_6fzswncfLmYTM4vYfLxy_k5TC4-n18P4SLzoBxCZfTfKoSbi8nHi0tQwCYZgLe8fa-WpMtUZyc-TEkBVRSCz6g2KQfGBlCQFsrnsutQYyzDtFBOEYAEYSFHj7yybNPnah6GMKF3XptFgTBXKc9f0TMBI4mqSgL7vLDWeShwoYpjer6GXN0jGEv4NwEya11vB-ycXmpH4Kqhq02Ygg-6KMChykTsXDsf9lksFMqwyZWnAWmOmQRVRAS5vHZSg6rdveE9uqBTVUwhtcZgGgjW5F82oYTxDAu7GsJZrswCxXP84pUHTSglDde2ggUGmN7csh9v_3L5-XRy9vH8wxScCjk6sqEBBV4XaEKxhkz7uCbpSpsQLEwz7ShKowMw62QKXit6LcPUinuOxRqFXuQBXGU8qMIS_IKHubWhdNqEVxT2n64ufwb1oH20a6YdVCWvhiYgLcaOVoFHvfJQKLdAt59aSQYBAU02hI_oJMpoIbLBA2Md1g3-Fs5WJoveibp1lmHncJiq9C66HHKCKCmWFno5I4WDXSmXRW84xPBTA-52a8AIRQi2FENCqpyjQOUNZnZlpoPOBklujmDL0npd74hhTHmv8FbwS2OMugfKGRF1FCGK0gKhc-aDqwgxqXZpVbArejuSGVY5GQgfUiwD-wFNcGvAbIEDWOU6zSVM1l3X-WBLD6Ph6BCW4HPrQm0YMlJvB1aqKOqAC06Xdahy7ne2CtjatQ2pGs53OqQ5xpAiGMuyvR0o0CxCDvPKMVK9rUJOcbBE5Suy2cFhAsslaUO5jbBXBskXB0lSm7-21QDUQmnjA6jeDrxJElhqo5fVkrERY9nhvPIonuXystIhp_D55XTy8XZydXV7efrly9XNdAif7T2XutZQXMIkAzwMOBhWOkPD8c9bPqaHUhFENzEOuReMWmIGWOASDYc6z5XYu_n4V87Fv5x-mVxMLq4ur-HD1eWrCXy--vdzsjyCL7VB9gSFysPJwThJBrzGCsO-s3bZvFyfvD5KkljLaETqrPed12-SJCE0sT-eys-mRXtZqBSb6Lo54zUpq6mQ86okhUfndoUO-JnXUmrUzN5LvFr2sJVMxDnbB5Xetfg3lhCR2nK9Xyof8Ji0UA0NCY0J6hgTv3Bqr1XInNKGnBNfrzCwPp7ScB1eqs5p2sOcdh0spJJjtRdI8ziKHp7MpSdVRUFBbLL4trbSMlbSlRXQ32mTeUDlTKwmbMCNZKyLovLBUVIjAR6Le_Ti5Y3sdXNGValE48HO56AkT42GbyhOCT0C3joxaAM6sKdI9QLVXIA3LW16h2F6zCWGi6OxbGvndGYdb8qQu2LUvxm-geUY0sKqO7JATNq-oCULnIcpZE7fRyOXymABxjqKXRNI8nh4RCpS2BbK3HWxu6sDGMTMw9vDJFZ-oXNvkwTKoiKNf1XL2V40iHIZGjEth58SRbRZTHmPG2mN3VtSRpQZKg2VKgry9RBOgSITJQd54sLMlQysbFVQqEiYMJA0B3VQswJ_Ar-qhOORAXkw-BViGbfPWYIzdA1DvUTjib-kOQFS1dyMwqNhEVyAsMB7oTqUQIdwackT-1FR9iEvRRgXrnkMU9raNem_uzft7YDDUDnjwVRFAXPrIkckIMKsCjAVaVNJgze31zcXlz_fXr2_nnz5y9mEmEKqDCUzvEfDXHMN7EYdyGituaMT-CRhiPEoeP_XX06vr6Ek_JEJwsqS1oQNyoArC8EposPa1ASZNb5HVUSoRjgYG8HCMAkWSuXuOGEEzlC1gQWGUwlUPkOI_wW7lPBWtq5PlAnY3ccwdZTBmXE01UXYChMA6wMv_MqTwvfoPOnXpjakV5xEqES5yjDeVHFHKV15yefoQ5Mo6R90pglDUaUWSFPoLSGR1yv8sMflqD-pzyR9-K0HwCcIWC57ADtyjIDDZHrcyYelckEzhLSHseT9razvYUTFwtfHh-m8qHw-ZZlz_RAqh0xkvSTo4XB4mIB19EeSELmWU2RLxsi82gtDSZUBfCgdeg_4oNJQrIc9gKhqD4BPPHB6AKV1wSkdeiBnEBgd8wDJHVXZA2jOQuTzHit4VQUi8SpFD4eHScJH3iRJfoLX75IE0gKVgxmGFaKJEenCWvY97BxktYdZobnksdyZJepBkPMd06y0yeyqroDN4TeWcyE3RG3qACa7NAmIAEiiu6cSJrU-V2WdLgsViXNGKWSps6zgzEunh0gjQ3OCkcwePcqy65rWopMAj-Q8mhZZB5WtEm1JdZaOVoZcUmCAGziBQ0JJ_NkRcEPKNLXQBn0c-QFOYJS8SZL4_wROmHW1M_EhoNNsDZ3eGfT11OtfLi7PaXhcaCdSdpXNUDlKlwzdQbRnsGSGfbJMreX5BABOgHlMI2CT6HC6qVkKKf4kl4kC35-e_ZkEMvNpBHZ4kTa1c1vmy3bssYR7LGAE_Z-5PIuXJD4hTs9OxI7QWqU1C9BufoPdZJDswe5N_P1hj5582KNC6xH-vimNYxs60d1KI6v-BrtsZZYlf9Ee97bErG4JL0-LGYmYZHBzPmmE8N_bMtgYz8uQxXdvGi1YBHtLZyfulqkLAGXzVnHw-r-QtpM8sGMKNcMC-h9VUfSh_ak8euE-cprpnns2Vyk0F2NehY3NP7wKYfGB8RRX-cRj-5uriIAtqatURohUttCG1PHrVupZTZr6HamrdEtiPBJFiWKyKJGC8-HgTSvxzzL2Xz8wJ-mLxFqAEBUxtpTn7CS7FSSz9Nd0TEj2iC6GnNyViF8FrcwMmNIJIWICB-KtLZnRtNbEsqMCjCkdiGDKxBsSOobcYSInJHS4SSO5adCSSMZZ9-hNK73y0nCB0moTBlHk7kHcGKUBLiADWdrbQmdthiBeI0W7Ize1zqBjxrlcgloprljd3a7SqPDGhg_fNhumv9qddPfJ7JNfuWPOzbN1qbyvaZGWqj8ajmHZEKH61OhXWIbm3yiViJC08jgJ8lk8WrElNcQ3gA7_X2UgG4Roe79s-Uj0Wtx8aHAz3sRNZ3XBHp1S2PvZid1AN8sRgG-Lkrwi8-uym52YjSAeHW3A92hDja2ZfmPh0WvZwFem8tx55Yxm9rPETCvyTZNDlElz7mGU-xwfTJkkREecStoI_UyT-1sSvZ0reErizIZglzy4Fck5kE5EzlLvF0ZvG-nXdq762_pKSqr7HZSihlGunc89Bjg6TETya0muW_NnytNx0fDUTc322a1d5Y5ou4dJr4Py2tLEhJ3OarYiPBluzq8n4HHBnY5dbTJ8gINBzZe5VbSbDJhc7EWhHMIUoHtyTJFtTOUEm2lqVlAzPDJ2olRRPN8MEJXjNEKNNapQ1Pto6_zfKuUCun06J9FFQaddRZCQ3l7T1vNbQ1IVVGEXVQya1ojRCLdem7vGF90oiSoe1E5h7LPR49RtzARql8Sflwgcj54XOHc6W-B3CDz4hoaprYgnvlzg4fPydHYSbrun7Y3BkZViFuOOsPyujbsJTehHP1-Q33KlnR9A3TWcSyeEMEOnT38sBZAgQ3pRXydXhYx6J8VAOozchzg8TAYdIMmzZNACg-r5K89KxryrmNRTn4f3Iidbub-gSmCq5Qydj-2mTNo3OmzjirfBSayxxDB9gH0Y0_KdZ2vY5x3tReqQJA-HcmBje9aGfc6fL1_qX0h-zdletBSvFXtTdBskBWF0mAzGR43S74juEOrkTqAHwh2Fco-h_29c-59j3D-UcP8Yvv0D6PYfYtvNrdQL2PYnGduvyWqHXUPDA1vRM8xGLRl-nmK_x4wnjiJrncn_2xJVyF9Kr9_HrnM_KktzHys4bsU9z61rBcdbCsaQv7QtuJgriTd8vDaTvjzjm-_qNlrTfCylS4lIx1SaygGZBC-cKvN4YRh7KbXLaH_VIo_1lG46t6kaOaBhpbTN0RYt7fJwGv2I64V8UwA3BL4moLbwhgZjEhCRqgK8Hj-rwfgxyevC6HtIntnA9tbpZvw8PewigzJQlx6-fZYezjATnHN-Y903ORNTxA2OSLVq3AmzD7ZqqlWHxymXOTvDrwp-RMaYfHJbJAq-iSL6XX4mPZBSI3XNFhakbxGaN9IV5C5UbOrSQYk-2Yhw5VNDvHugpr6InlHJZPAfc-hBZTLsdMNI7ABuzmCG3O7VzR1pbPgI75zJ9aP4ZviImoY8VLNoEVrkW6Z-8yTFbU7tDUkmYVs0eUxF7Js8GR4r05wLtoj8Bld-BkDjp3bV3dTh78PP-CkFt3H5NHy2mQGdKGO0vCYu9G68wTRGHeXOaHC_VeL3lv4avjxzhQV_r1Hn23hPbe8j4uKlLJ8G5OKeOok6CEGTrydY5r3VGalxfxvbqc_ossk_DqB_jan9Rsvv_wnIjyIgL-QgPlTZ-oUc5JrG9jeafHY-1yn-ARZy3V51P0NElnzJ8zIi8pnuCSP7eIqLtMU37v3FBIDHP8UA4A9xgLi5r7GAR_1AGf-YB3Rd-b_FA7qO-T4ekKG_a9O46P6NfHskaG_SOPq77VQ7s_YuVR6fkPq16vB2swP1PkrY4ADMQLvlXtUXz_HLDU6Rco-k6s835AOiehgRg3jPEgXzJxby3cl93X5paATbLah1R0r81qLhCUsoqxC_m9hqfogCLy7776QZ8HTVf77oH7yo6P_Ymh9B9w2_kihu6nxH1d-U_DUcvv3ddf_t4eO6D09V_m6Mf1ftpy_l_m9U_44W3K4fdL_xi1jmLw_4815n7ZxblCW6fWEMhb5DuUqWjj4Wvg4d6c5LwNCBj8a_8jDlTDOtW_R0C_rK8x0Bs4SspRcuXsBMPl5cN3cDC-k8GQtTivIpfVMbL62p_YTZsC5LczYetZ4I9zXRCToUGHlN6eyvmAboT7qfk0_kAl2Awt9-3M7W0D91af5JmUV8Tl3r_jgZH-0nb_dHR32W__fe_wA"><img src="../examples/townhouse.svg" width="270" alt="Three-storey townhouse, ground floor" /></a><br/>
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
