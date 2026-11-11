# What ArchLang can and cannot do

ArchLang compiles `.arch` text to floor-plan drawings and checks them. This page is generated from the tool list both MCP servers serve and the CLI manifest.

## Tools on both servers (11)

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
- Format "png" is unavailable on the hosted server, which has no image renderer: use format "svg", or GET /svg/<payload> on this server for an image URL.

## Limits

- Work is counted, never timed: past a budget the work stops with a catalogued code, and `archlang explain <code>` gives its numbers:
  - `E_DIAGNOSTIC_LIMIT`: More than 500 diagnostics; further diagnostics were not collected.
  - `E_DRAWING_LIMIT`: The drawing is larger than any plan may draw.
  - `E_ELEMENT_LIMIT`: The plan expands to too many elements.
  - `E_IMPORT_LIMIT`: A file given to `archlang import` needs more work to convert than any plan does.
  - `E_KEEP_LIMIT`: Too many keeps, or too many targets in one keep.
  - `E_RANGE_LIMIT`: Range too large.
  - `E_STEP_LIMIT`: Evaluation did more work than any plan needs.
  - `E_WHILE_LIMIT`: `while` exceeded its iteration cap.
  - `W_DIAGNOSTIC_LIMIT`: More than 500 diagnostics, all warnings; further diagnostics were not collected.
- The hosted server refuses any one tool argument over 64 KB with `E_INPUT_TOO_LARGE` before compiling anything, and answers an address at most 600 requests per 60 s, then `E_RATE_LIMITED`. The npm server and the CLI have neither cap.

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
