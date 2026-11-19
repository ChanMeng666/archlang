# What ArchLang can and cannot do

ArchLang compiles `.arch` text to floor-plan drawings and checks them. This page is generated from the tool list both MCP servers serve and the CLI manifest.

## Tools on both servers (12)

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
- `explain`: Explain a diagnostic code
- `link`: Share link to the rendered plan

The hosted server (https://mcp.archlang.uk/mcp) adds:

- `read_me`: How to use this server. Explain this hosted ArchLang server in one short page: the authoring loop, the size cap, what is unavailable here, how to get an image URL for a plan, and what the server keeps (nothing). Call it first when unsure.

## The loop

1. Write the plan as `.arch` source.
2. `compile` it. Errors are diagnostics, usually with a byte span, often a fix; `fix` applies the machine-applicable ones, edit the rest by hand.
3. `describe` it; check rooms, areas and doors against the brief.
4. `validate` with strict:true (parse, resolve, `lint`); fix its next item first, then every warning, then back to 2.
5. `finish` once lint is clean, before export: it adds what the plan lacks and deletes nothing.

- Draw a plan from an image or PDF: https://archlang.uk/from-an-image
- Change one room without moving the others: https://archlang.uk/edit-one-room

## What `fix` resolves

`fix` resolves the codes below; any other code is edited by hand (`archlang explain <code>` says how). The `fix` tool reads `compile`'s diagnostics; `archlang fix` also reads `lint`'s and proves a `while` rewrite, so it alone resolves the codes marked CLI. A code in two groups says when its edit takes each.

- `machine-applicable`, applied by default: `E_ARC_RADIUS`, `E_ATTACH_POS_RANGE`, `E_DOOR_KIND_CLAUSE`, `E_DOOR_OPEN_RANGE`, `E_HEIGHT_RANGE`, `E_OPENING_ABOVE_WALL`, `E_PARSE` (the word is none the language or the plan knows and one word of a closed list alone is within the distance limit), `E_ROOM_ALIGN`, `E_ROOM_ALIGN_AXIS`, `E_SILL_ABOVE_HEAD`, `E_WINDOW_KIND_CLAUSE`, `W_ALIAS_MATCH` (CLI), `W_DIM_INSIDE` (CLI), `W_DIM_OVERLAP` (CLI), `W_DOOR_OFF_WALL` (one wall is nearest), `W_FIXTURE_BACK_TO_ROOM` (CLI), `W_OPENING_OFF_WALL` (one wall is nearest), `W_POCKET_RUN` (CLI), `W_SWING_OBSTRUCTED` (CLI), `W_WHILE_DEPRECATED` (CLI; outside any component), `W_WINDOW_OFF_WALL` (one wall is nearest)
- `maybe-incorrect`, applied only with `unsafe:true` (`archlang fix --unsafe`): `E_LAYOUT_REF`, `E_PARSE` (the position expected one word or the word is one the language or the plan knows or another candidate is within the limit or the word is a closed-list word glued to the number after it), `W_DIM_TEXT_MISMATCH` (CLI), `W_DOOR_OFF_WALL` (two or more walls tie for nearest), `W_FOOTPRINT_TRANSPOSED` (CLI), `W_OPENING_OFF_WALL` (two or more walls tie for nearest), `W_UNKNOWN_FURNITURE`, `W_WHILE_DEPRECATED` (CLI; inside a component), `W_WINDOW_OFF_WALL` (two or more walls tie for nearest)
- `has-placeholders`, never applied (the edit holds a `<…>` to fill in): `E_DOOR_WIDTH`, `E_OPENING_WIDTH`, `E_WINDOW_WIDTH`

## Export formats

- `svg`: no dependency
- `dxf`: no dependency, CLI only
- `txt`: no dependency
- `json`: no dependency
- `pdf`: needs the optional `pdfkit`, CLI only
- `png`: needs the optional `@resvg/resvg-js`

`compile` returns `svg`, `txt`, `json`, `png` (`png` only where its optional renderer is installed).

## What it does not do

- ArchLang does not read images. Text is the only input; the first guide above says how an assistant that sees images writes the text.
- No tool writes a file or reaches anything outside the server: each returns text (or, for `png`, an image).
- `dxf`, `pdf` come only from the CLI, not from `compile`.
- `pdf`, `png` need an optional dependency the zero-dependency core does not install.
- Format "png" is unavailable on the hosted server, which has no image renderer: use format "svg", or GET /svg/<payload> on the hosted server for an image URL.

## Limits

- The compiler's work is counted, never timed: past a budget it stops with a catalogued code, and `archlang explain <code>` gives its numbers:
  - `E_DIAGNOSTIC_LIMIT`: More than 500 diagnostics; further diagnostics were not collected.
  - `E_DRAWING_LIMIT`: The drawing is larger than any plan may draw.
  - `E_ELEMENT_LIMIT`: The plan expands to too many elements.
  - `E_IMPORT_LIMIT`: A file given to `archlang import` needs more work to convert than any plan does.
  - `E_KEEP_LIMIT`: Too many keeps, or too many targets in one keep.
  - `E_RANGE_LIMIT`: Range too large.
  - `E_STEP_LIMIT`: Evaluation did more work than any plan needs.
  - `E_WHILE_LIMIT`: `while` exceeded its iteration cap.
  - `W_DIAGNOSTIC_LIMIT`: More than 500 diagnostics, all warnings; further diagnostics were not collected.
- The hosted server refuses any one tool argument over 64 KB with `E_INPUT_TOO_LARGE` before compiling anything, and an address that sends more than 600 requests in 60 s gets `E_RATE_LIMITED`. The npm server and the CLI have neither cap.

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
