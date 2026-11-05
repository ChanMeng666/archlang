# Public surfaces: cards

Each card is one PR off `main` in the repo it names (archlang unless stated). Decisions PS-D1…PS-D10
are in `README.md`. Every card:

- names the tests it rewrites, and the PR body lists each old assertion next to its new one;
- checks its copy against the PS-D1 guardrails.

## Stage 0 — doors, today

### S1 · The doors module

- New file `site-shared/doors.json`, hand-maintained. It holds:
  - the ChatGPT app URL;
  - the hosted MCP URL;
  - `claude mcp add` (local, and `--transport http`);
  - `npx -y skills add ChanMeng666/archlang --yes`;
  - the Claude Code plugin commands;
  - the VS Code Marketplace and Open VSX URLs;
  - Cursor and VS Code MCP install links, built from one JSON config:
    `cursor://anysphere.cursor-deeplink/mcp/install?name=archlang&config=<base64>` and the
    `vscode:mcp/install?…` form. Verify both by hand in the tool before shipping;
  - the skills.sh URL;
  - the agent prompt: today's README block in plain steps, plus "if you start from an image, read
    /from-an-image; to change one room, use `impact --lock`";
  - a per-surface `order` array (PS-D2).
  No UTM parameters.
- Readers:
  - VitePress and Vite import the JSON directly.
  - `gen:doors` writes generated blocks between `<!-- doors:start -->` / `<!-- doors:end -->` into
    `README.md`, `packages/mcp/README.md`, `editors/vscode/README.md` and `llms.txt`. The
    `llms.txt` block is one short list, because the file is kept trim. `check:drift` covers all
    four.
- As built (#500):
  - The root README block is deferred to R1, which rewrites the README around it.
  - The Cursor and VS Code one-click links wait for a hand check in those apps (`todo` in
    `doors.json`).
  - The test is `test/site-doors.test.ts`; `test/doors.test.ts` is the door-vocabulary test.
  - `applyDoors` refuses a second block and leaves bytes outside the block untouched.
- Test `test/site-doors.test.ts`: every door string on the docs home, `/start`, `/agents`, `/mcp`, the
  playground sheet and those four files equals a `doors.json` value. The commands obey
  `test/docs-flags.test.ts`.

### S2 · Zero-install doors on the current sites (before the redesign)

- **Docs hero:** add "No install: use it in ChatGPT" plus the claude.ai connector line above the
  three install rows. `homepage-links.spec.ts` changes its row count from 3 to 5 with the new
  strings.
- **`/agents` and `/mcp`:** the hosted doors at the top.
- **Playground "Ask AI ▾":** the first item becomes "ArchLang app in ChatGPT".
- **README:** one line under the pills.
- All values come from S1.
- As built (#502): the playground's Ask AI item moved to P1/P5 (P1 rebuilds the header); `/agents`
  and `/mcp` keep their lede first, with the no-install block after it.

### O1 · `packages/mcp/README.md` (the npm page for archlang-mcp)

- Lead with the hosted URL, ChatGPT and claude.ai (the generated doors block), then the local
  install. "When to prefer the CLI" moves below them, reworded as "If your agent has a shell".
- The `package.json` description becomes the canonical line, not a tool list.

### O2 · `llms.txt` doors

- Covered by S1's generated block. Check that the hosted URL and the ChatGPT app are both present.

### O3 · Owner database refresh (repo `ChanMeng666`)

- In `data/profile/23-projects-oss-more.yaml` and `70-linkedin.yaml`, drop the stale v1.43.0, "62
  published versions", commit and test counts. Rule: versions come from npm, not a document, so say
  "on npm" plus the date.
- Add the ChatGPT, playground and hosted MCP links to `wiki/projects/archlang.md`.
- Unify the tagline to the canonical line. "Typst/LaTeX for architecture" stays body copy only,
  never a title.
- Regenerate per that repo's own scripts.

## Stage 1 — playground

### P1 · Shell: view mode, lazy editor, prerendered first drawing (risk: high)

- **Header:** brand, plan picker, Source, Checks, Tools, Make your own. The intro band becomes one
  line. Keep, unchanged:
  - one `h1` and the lede before JS, and the smoke test's "compiles in your browser";
  - `<noscript>`;
  - the attribution strip (`shared-notice.ts`);
  - the frame headers.
- **Prerendered drawing:** inline the default example's SVG into `index.html` at build time (a
  gen-static step). A `#z=` link swaps it in after compile.
- **Split `main.ts`:**
  - The view path has the stage, pan-zoom, interact, facts and levels.
  - The edit path lazy-imports CodeMirror, completion, the panels, snapshots, Format and Finish.
  - The compiler is its own chunk, preloaded but not render-blocking.
- **Modes:**
  - `view` is the default; `&edit` opens edit mode.
  - `arch link` (`src/cli/link.ts`, `src/cli/share-codec.mjs`) and the docs code-pane "Open in
    playground" (`ArchLive.vue`) append `&edit`.
  - Codec tests show the token still parses after other `&` params.
- **Tools menu:** includes "3D preview" in both modes, with the label from the 3D decision record.
- **Budget:** rewrite `e2e/startup-chunks.baseline.json` to PS-D5. Keep the no-3D assertion and add
  no-CodeMirror.
- **Tests rewritten:**
  - `boot`: h1, lede and drawing present before JS.
  - `front-door`: at 1280 the drawing is ≥ 70 % of the viewport and the header has ≤ 5 controls in
    one row. On phone the drawing comes first and Source is reachable. The `#agentsLink` assertion
    is replaced by a Make-your-own assertion.
  - `layout`, and `init-precedence` (adding `&edit`).
  - `actions`, `editing`, `panels`, `levels`, `takeoff`, `preview3d`: enter edit mode, or open
    Tools, first; the assertions are unchanged.
  - `scripts/smoke.mjs`.
  - `cli-link`: opens in edit mode.
- **Merge:** the owner approves.
- **Release:** log the merge as a release marker in `archcanvas-growth/data/agent-reach.csv` (it
  lands inside the N10 window).

### P2 · Plan picker and thumbnail strip

- Thumbnails come from `/examples/thumbs/*.svg` (gen-static already writes them) and load lazily.
  They follow the `EXAMPLE_ROWS` group order, and "all plans" links to `/examples/`.
- The labels stay the public key (`src/examples.ts:67-70`).
- Derive the example count instead of the stale "27" (`index.html:223`, gen-static).
- Tests: switching by strip and by picker; thumbnails resolve; no layout shift.

### P3 · Hover, click, facts

- **Tooltip:** name · area · W × D, taken from `describe()`. Dimensions carry their convention or a
  tilde.
- **Click:** opens a facts card (area, use, neighbours, openings). In edit mode it also offers
  "jump to source".
- **Facts line:** "57 lines of ArchLang → 4 rooms · 54.2 m² (net)". The figure is computed, never
  typed.
- Tests: extend the hover and click specs, and cover the facts line.

### P4 · Knobs

- `playground/src/knobs.ts` (pure):
  - Pick top-level `let NAME = <number literal>` from the parse result.
  - Range: ±40 % rounded to the plan grid (50 mm default); integers for counts.
  - A change rewrites only that literal's byte span, then recompiles with a debounce.
  - On an error, keep the last good drawing and reset the knob.
- Knobs appear where `let`s exist: `parametric`, `terrace-row`, `classroom-block`, `museum`,
  `garden-house`. Per PS-D10, no existing example is edited. Add one **new** `let`-driven example
  (for instance a one-bed flat with W/D and bedroom count) with its own pins and gallery row. Fold in
  CRF11 (the "change one room" starter) if it fits.
- Tests:
  - Unit: extraction; the span rewrite leaves bytes outside the literal identical.
  - e2e: dragging changes the drawing, the facts line and the hash.

### P5 · Make your own

- A dialog (focus trap, Esc closes) with the doors at equal weight (`doors.json`), the two "top
  ask" links, and "edit this plan here".
- "Start from this plan" makes a short link **only when that button is clicked** (`/api/share`,
  falling back to the full link). Text next to the chat-host doors says the plan goes into that
  host's URL.
- One quiet prompt per session after the 3rd plan switch or the 1st knob drag. It is stored in
  localStorage behind try/catch.
- Tests:
  - Each copy button copies the `doors.json` value.
  - External links have `target=_blank rel=noopener`.
  - No network request until a share button is clicked.
  - Keyboard access; phone layout.
- As built (#506):
  - The nudge is shown once per browser, not once per session: its showing is remembered in
    localStorage.
  - The Codex and VS Code tabs show the skills command only, because `doors.json` has no command
    of its own for either.
  - The URLs of the two top-ask links and the `/agents` link are `doors.json`'s `links`.

### P6 · Checks

- The **Checks** toggle draws the review rings that `arch preview --review` produces, from the same
  core function. A side list shows each finding's code and its one-line fix.
- Add a **new** example with one deliberate, fixable finding, plus its fixed twin, for the
  "mistake → receipt → cleared" demo. It is additive, with its own pins.
- Tests: rings match `lint()` findings one to one; the toggle does not change exports.
- As built (#507):
  - The demo is a playground-only sample, "Flat with one thing to fix" (`playground/src/samples.ts`,
    the picker's "Try Checks" group, one `W_BEDROOM_NO_WINDOW`), not a new example: every shipped
    example stays warning-free (fix/examples-sound, 2026-10-27; a warned plan is a test fixture).
    The empty Checks list points at it.
  - The rings come from `reviewSheetAndWarnings` in `src/cli/review.ts`, built as
    `dist/cli/review.js`; `buildReviewSheet` is its `.sheet`, so `arch preview --review` is
    unchanged. Checks reads the default checks and says so when the Lint tab's profile differs.
  - Known: the rings and tags are sized for the review sheet's 1600-unit width, so they read small
    on a phone; Checks shows the findings of the storey on screen, as the sheet does.

## Stage 2 — docs site and showcase

### D1 · Nav, `/start`, topics

- **Nav:** Try it (`/start`) · Gallery · Docs ▾ (Guide, Language reference, CLI, MCP, Agents, From
  an image, Edit one room, Common mistakes, Errors, What's new, …) · Playground ↗ · GitHub. Remove
  the duplicate CLI entry.
- **`/start`:** new file `docs-site/start.md`, added to `SITE_PAGES`, `PAGE_META` and the sitemap.
  Its title contains "floor plan". It embeds the YouTube film.
- **Topics:** a footer row linking the five topic pages, guarded by a new test.
- **Tests:**
  - `page-chrome.spec.ts`: nav fit from 768 to 1152 px, and hamburger reachability.
  - `docs-sync-list.test.ts`.
  - `docs-page-meta.test.ts` (80–170 characters, the `KILLED` list).
- As built (#508):
  - `/start` is titled "Get a floor plan from your AI": no time in the title, because "60 seconds"
    was never measured. Every door's link, URL, prompt and command comes from `doors.json`
    (`DoorBody.vue`); the words around them are `door-copy.json`'s.
  - A real capture of the result under each `/start` door is deferred.
  - The nav keeps its 1152 px breakpoint: with the five-slot row forced on below it, the last item
    still ends inside the viewport, but the row sits flush against the search box.
  - The film is a click-to-load facade (`youtube-nocookie.com` on play); `privacy.md` says so.

### D2 · Docs home rebuilt (README §4)

- **`CompileSeam`** is retold as brief → source → plan with one real gallery pair. It finishes in
  ≤ 8 s and its final state is server-rendered.
- **New components:** `WhyCards.vue`, `HowSteps.vue`, `DoorsCard.vue`, `HomeGallery.vue`,
  `IsIsntTable.vue`. There is no AI-vs-CAD comparison.
- **SheetGrid** long captions move to `/examples`.
- **Copy:** checked against PS-D1. The h1 sub-line "A declarative language for floor plans." gets a
  new pinning test.
- **`site-markdown.mjs`:** update the regex parsers and `test/site-markdown.test.ts` together.
  "An interface, not just an image." stays in the For-agents band; `routes.spec.ts` and
  `scripts/smoke.mjs` use it.
- **Tests:** `homepage-links.spec.ts` derives its counts from the components' data arrays, checks
  both primaries above the fold at 1280×800 and 390×844, and checks that every playground link
  decodes to the plan shown. In `page-chrome.spec.ts`, the hero typing starts with the brief bubble.
- As built (#508):
  - The gallery-isolation law (`test/agent-gallery.test.ts`: no other test reads `docs/gallery`)
    holds. The hero DISPLAYS a gallery pair chosen in `sync-docs.mjs`'s `HOME_PROOFS.hero`, but
    nothing pins it: if that entry is missing it falls back to another gallery entry, then to an
    example with no brief, with a build warning, never a build failure. Unit tests check the
    hero's wiring and a stand-in pair; the e2e specs compare the page with the `home-data.js` the
    build emitted.
  - The three Why proofs all read `examples/`: `describe()` of laneway-house; `impact` of
    knob-flat with BEDROOM 3300 → 3900 and a lock; and knob-flat without its bedroom window, which
    raises `W_BEDROOM_NO_WINDOW` (the playground's "Flat with one thing to fix" story). The
    highlight on the flagged room is the site's, a style rule on the compiler's annotated element.
  - The proof line reads "N example plans, every one compiled and checked in CI · SVG · PDF · DXF ·
    PNG · MIT"; the page says beside it that PNG is one optional download.
  - Measured at 1280×800 (Chromium, final build): both primaries end at 597 px, and the hero sheet,
    its control row (Replay / Open in Playground) included, ends at 795 px, inside the fold (a
    100 px source pane had left it 3 px below; the pane is now 92 px). At 390×844 the
    primaries end at 401 and 529 px. The run settles in about 7.1 s.

### D3 · Plain captions where visitors land

- **`/gallery`:** brief bubble → plan → Open in playground; the source goes in `<details>`. Keep the
  "selected examples, not a benchmark" note.
- **`/examples`:** a one-line plain summary above each full caption.
- **`/guide`:** the first screen links to `/start`.
- **Stale items to fix:**
  - the `whats-new` title against its description (`config.ts:197–198`, `:752`);
  - the `embed.md` standalone size (measure it);
  - the `/showcase` permalinks (tweet-house, friends, dust2) and the "290 bytes" claim (actual 277);
  - the railroad warning counts (`docs/showcase.md`, `docs/overview.md`);
  - stories saying `npx arch` instead of `archlang`.
- As built (#508):
  - `/showcase` follows the showcase repo's order (real buildings, original plans, then "Fan
    studies" under the notice); its permalinks are that README's and its PNGs are that repo's
    `plan.png` files, copied (the repo has no export script). Figures re-derived under core 1.55.0.
  - The standalone `<arch-plan>` is about 1.5 MB (1,485,967 bytes measured), about 520 KB gzipped.
  - No `npx arch` was found in this repo's stories; the showcase repo's own stories are SC1's.

### D4 · Proof line

- "N example plans, every one compiled and checked in CI on every commit · SVG · PDF · DXF · PNG ·
  MIT".
- N is derived at build time. No star, download or version numbers.
- As built (#508): "on every commit" was dropped (CI runs on pushes and pull requests, which that
  phrase overstates). N is the count of examples the docs build compiled, emitted as
  `EXAMPLE_COUNT` in `home-data.js`.

### SC1 · archlang-showcase (repo `archlang-showcase`) and `/showcase`

- **README order:**
  1. hero cover;
  2. the canonical line plus one plain sentence ("famous and original buildings, written as text
     and compiled");
  3. the doors (an S1 block, copied by a script);
  4. a 2×3 grid of `cover.png` (1600×900), not 820 px A1 sheets;
  5. "Make your own: ask your AI for your childhood home, then send a PR";
  6. the full gallery.
  The Social kit section moves to `CONTRIBUTING.md`.
- **Order of plans** (PS-D10):
  1. public-domain and real public buildings (Villa Rotonda, the West Wing);
  2. original plans (the railroad flat, tweet-house);
  3. "Fan studies", with the nominative-use notice.
  Miraflores moves to `archlang-lab`. Retitle dust2 so it no longer says "building-code linter".
- **Core version:** bump the pin to `^1.55.0` and re-render. Make one renderer the source: the
  docs-site PNGs are produced by the showcase scripts, so the two sets can no longer differ.
- **Links:** use `/s/<id>` short links (the PNG preview is the unfurl), not 3–7 KB `#z=` links. Fix
  CRF9 first if any plan has CJK labels.
- **Growth repo:** move the McCallister post off 2026-12-01 (Show HN day) in
  `chanmeng-marketing/calendar.yaml`.

## Stage 3 — README, card, other surfaces

### C1 · The card, retold (repo `ChanMeng666`, `scripts/cards/archlang.mjs`)

- **Scenes:**
  1. Brief, about 3 s: a real `docs/gallery/<x>.brief.txt` in a chat bubble.
  2. Plan, about 7 s: the agent's `.arch` streams, with key lines at reading speed. Layers build,
     and every typed line is real.
  3. The figure: rooms and exact m², from `describe()`.
  4. Change one number, about 5 s (kept).
  5. Checks itself, about 5 s (the lint ring, kept).
  6. Outputs, about 3 s.
- **Budget:** ≤ 220 KB, ≤ 24 s. Get there with fewer stepped frames, shared `<defs>`, and the
  compiler's own number formatting. The static last frame must read on its own.
  `prefers-reduced-motion` shows that last frame.
- **Before shipping:** test on a scratch GitHub repo (camo, SMIL, reduced motion).
- **Copy targets:** `archlang/.github/readme/card.svg` and the profile README. Record the source
  commit in the PR body.

### R1 · README rewrite (risk: medium)

- **Layout:** PS-D7. The doors block is generated by S1. The grid uses committed
  `examples/*.svg` (`README_SVGS` in `test/example-svgs-drift.test.ts`) with view-mode `#z=` links
  (`test/readme-permalink.test.ts`).
- **Keep:**
  - the CHANGELOG path pair (`test/npm-tarball.test.ts`);
  - the tagline match with the home title (`test/docs-page-meta.test.ts`);
  - `npx -y`, and no bare `arch`;
  - the video link;
  - the ArchCanvas line, verbatim.
- **Then:** the owner tags a docs-only patch release so the npm page matches.

### O4 · VS Code / Open VSX README (`editors/vscode/README.md`)

- Above Features: one compiled plan image (an absolute raw GitHub URL), the canonical line, and the
  doors block (S1).
- Open VSX goes through `publish-openvsx.yml --ref v<core>`. The Marketplace upload is owner-only.

### O5 · Skill and registry descriptions

- `skills/*/SKILL.md` descriptions feed skills.sh; check them against PS-D1.
- The MCP `server.json` description keeps its tool list: the registry caps it at 100 characters and
  `packages/mcp/test/server.test.ts` requires every tool to be named. Only the npm description
  (O1) carries the canonical line.
- Glama (owner) uses the same line.

### O6 · chanmeng.org product page (repo `ChanMeng666`)

- `/projects/archlang` returns 404 today. Add a product page from `data/profile`: the canonical
  line, the card, the doors, the films.
- As built (2d-portfolio #12): the premise was wrong. chanmeng.org has no per-project pages by
  design (one job per page); ArchLang lives on the home stage and `/work`. The stage now carries the
  canonical line and every door, and the "12,882 tests" count is gone. No new route.

### O7 · Film repos and `awesome-aec-mcp`

- **`film-archlang-one-take`:** set the homepage to archlang.uk and link it from the README.
- **`awesome-aec-mcp`** (the owner's list): add an ArchLang entry with the hosted URL.

### O8 · archcanvas.uk footer (private `archcanvas` repo)

- "Built on ArchLang ↗" gains the playground link. The wording stays inside archcanvas's own
  copy tests ("floor plans as code" is banned there).

## Stage 4

### V1 · First-contact review and the after-launch reading

- **Review:** three fresh-context reviewers per surface, using different models, with no repo
  access and only the URL.
  - A 10-second read, then the 2-minute task "get a plan for a two-bed flat without installing
    anything".
  - One reviewer is the HN sceptic, using `anticipated-comments.md`.
  - The npm package page is reviewed too.
  - Pass means meeting README §7. At most 2 rounds; leftover issues go to `docs/backlog.md`.
- **Reading:** record skills.sh installs, hosted-worker calls, short-link creations and the npm
  numbers before Show HN, then again on 2026-12-08 and 2027-01-09, in
  `archcanvas-growth/data/agent-reach.csv`. No counting by query parameter.
- **Growth repo:** rewrite `anticipated-comments.md` #10 so it no longer says "validity
  benchmark". Refresh the show-hn `draft.md` status table.
