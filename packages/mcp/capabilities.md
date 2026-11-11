# What ArchLang can and cannot do

ArchLang compiles `.arch` text to floor-plan drawings and checks them. This page is generated from this server's tool list and the CLI manifest.

## Tools on this server (11)

- `compile`: Compile a floor plan to a drawing
- `describe`: Describe a plan (facts, no render)
- `lint`: Lint architectural soundness
- `validate`: Validate (parse + resolve + lint)
- `score`: Score a plan against a brief (intent meter)
- `repair`: Repair furniture placement
- `fix`: Apply machine-applicable diagnostic fixes
- `finish`: Finish the drawing
- `suggest`: Suggest topology fixes (advisory)
- `complete`: Completions at a source offset
- `link`: Share link to the rendered plan

## The loop

1. Write the plan as `.arch` source.
2. `compile` it. Errors are diagnostics, usually with a byte span, often a fix; `fix` applies the machine-applicable ones, edit the rest by hand.
3. `describe` it; check rooms, areas and doors against the brief.
4. `validate` with strict:true (parse, resolve, `lint`); fix its next item first, then every warning, then back to 2.
5. `finish` once lint is clean, before export: it adds what the plan lacks and deletes nothing.

- Draw a plan from an image or PDF: https://archlang.uk/from-an-image
- Change one room without moving the others: https://archlang.uk/edit-one-room

## Export formats

- `svg`: no dependency
- `dxf`: no dependency, CLI only
- `txt`: no dependency
- `json`: no dependency
- `pdf`: needs the optional `pdfkit`, CLI only
- `png`: needs the optional `@resvg/resvg-js`

`compile` on this server returns `svg`, `txt`, `json`, `png` (`png` only where its optional renderer is installed, never on the hosted server).

## What it does not do

- ArchLang does not read images. Text is the only input; the first guide above says how an assistant that sees images writes the text.
- No tool writes a file or reaches anything outside the server: each returns text (or, for `png`, an image).
- `dxf`, `pdf` come only from the CLI, not from `compile` here.
- `pdf`, `png` need an optional dependency the zero-dependency core does not install.

## CLI commands no tool serves

With a shell, `archlang <cmd>` (or `npx -y @chanmeng666/archlang <cmd>`) runs these too:

- `archlang batch`: render many .arch files in one call, concurrently
- `archlang md`: render every ```arch block in a Markdown file and rewrite to image links
- `archlang preview`: render a PNG you can look at (zero-install where the optional binary is present)
- `archlang watch`: recompile on save (interactive)
- `archlang takeoff`: quantities as csv or md
- `archlang ast`: parse only (no resolve/render) and print the span-bearing AST as JSON
- `archlang fmt`: canonical formatting
- `archlang reroll`: offer a proven-equivalent `for` loop for a repeated statement run
- `archlang impact`: change one number: what moved and why, what held, what broke
- `archlang manifest`: this document: the whole CLI API as structured data
- `archlang spec`: print the one-prompt language spec (spec.llm.md)
- `archlang context`: print the full bundled agent context (spec + workflow + CLI + errors)
- `archlang new`: scaffold a starter .arch
- `archlang import`: convert an OpenPlan3D plan (JSON) to .arch source, reporting what it left out
- `archlang explain`: look up an error code (cause / fix / example)
