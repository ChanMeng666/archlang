# Public surfaces: show it, then hand it over

The owner's ask (2026-11-06): the playground, the docs site, the README and the other public
showcases do not show ArchLang efficiently, completely or plainly. A visitor should see within
seconds:

- **what** it is;
- **why** it is worth trying;
- **how** to get a plan now, through the cheapest door for them.

Nobody comes to learn the syntax. They come to see good output, touch it, and maybe change a line.
Every surface exists to make the first try cheap.

Cards are in `cards.md`; `handoff.md` is the resume point. Each card is one PR in the repo it
names. Evidence (2026-11-06): a live read of both sites; source maps of `playground/`,
`docs-site/` and the card generator; an inventory of 22 public surfaces; a study of the
`archlang-showcase` repo; two passes over `archcanvas-growth` (strategy/marketing and
research/outreach); a study of comparable tools (Mermaid Live Editor source, D2, Excalidraw,
Remotion, Typst, Maket).

## 1. What a visitor meets today

| Surface | Problem |
|---|---|
| playground.archlang.uk (the Show HN URL) | It is an author's tool, not a showroom. The first screen has 13 header controls, a code pane that opens on 20 comment lines, and a drawing at about 40 % width. Six tabs sit at equal weight. It loads about 625 KB gzip of JS before the first compile. |
| archlang.uk | Three terminal commands at equal weight, and no zero-install door: the ChatGPT app (public since 2026-11-05) and the hosted MCP URL are **not linked anywhere on the site**. Feature cards run 80–150 words of engineer prose. The nav has 7 slots and 22 dropdown links. |
| README (= the npm page) | Install steps come before any reason to install. The card (313 KB, 30 s) types code for 30 s and never shows a brief becoming a plan. There is a 23-bullet "Recently added" list. |
| npm `archlang-mcp` | Opens with "When to prefer the CLI", which talks the visitor out of the zero-install door. |
| VS Code / Open VSX listing | A feature list with no drawing and no door for a newcomer. |
| `llms.txt` | No ChatGPT door. |
| archlang-showcase | A 223-line README, about half of it maintainer docs. No hero image, no door, no "make your own". Pinned to core 1.50 (current 1.55). Stale permalinks (dust2, and two on the site page). It leads with recreations of TV sets and game maps, and it places a plan of a real military raid third. |
| Owner database / profile (`ChanMeng666`) | Says v1.43.0 and "62 published versions" (from 2026-10-14). The wiki shows "Links: None". (`chanmeng.org/projects/archlang` is a 404 by design: the site has no project pages; see O6.) |
| GitHub repo settings | The social preview is GitHub's auto card, not `brand/archlang-og.png`. |
| Taglines | Six different ones across surfaces: "Floor plans as code", "Designs that compile.", "Typst/LaTeX for architecture", "A deterministic DSL…", a bare tool list, and "linting and geometric validation". |

These are kept: the real compiler in every visual; the `#z=` permalinks; the no-JS static gallery
(`/examples/`); the agent gallery with real briefs (`docs/gallery/*.brief.txt`); the card's
"change one number" and "lint raised and cleared" scenes; the five SEO topic pages; the playground's
pre-JS h1 and lede; the shared-plan attribution strip; `/s/<id>` and its PNG preview.

## 2. Who visits, and what the evidence says

- **The room is the developer room.** ArchLang is "the format an agent emits when it needs a floor
  plan" (`archcanvas-growth/strategy/category.md` §3, `positioning.md`). The consumer line ("describe
  your home, get a plan") belongs to ArchCanvas and launches on Product Hunt on 2026-12-15. ArchLang
  copy must not echo it.
- **The people who engage are builders:** tool, game and ML developers working with an agent.
  Frustrated homeowners never reply (`research/2026-11-04-outreach-user-needs-insights`). The one
  real user's problems came from his "agent not fully knowing ArchLang's capabilities", so the gap is
  discoverability, not capability.
- **The needs most asked for,** which the surfaces should answer up front:
  - *the plan looks right but is wrong* (about 10 threads: proof of correctness);
  - *start from a photo or PDF* (about 12: answered honestly by `/from-an-image`);
  - *every edit redraws everything* (about 5: `/edit-one-room`, `impact --lock`);
  - *which MCP or plugin is it?* (one install line for every agent).
- **What performed:** a checkable number in the first line plus a moving visual; a mistake caught and
  shown ("a checker turns the mistake into a receipt"); and one command for any agent (Remotion's
  `npx skills add …`). Self-introductions and text without an artifact fail.
- **The success test (frozen until 2027-01-09):** two of four must move. They are npm core 2×,
  skills.sh ≥ 100, VS Code + Open VSX ≥ 100, and hosted-MCP calls ≥ 1,000 a week. So every door that
  feeds a measure must be visible, and that includes the **VS Code extension**. No analytics, no UTM
  parameters.
- **Search:** developer queries are almost uncontested; consumer queries ("AI floor plan generator")
  are crowded. Do not chase them. The brand reads as "Archangel" to Google, so the category noun stays
  next to the name.

## 3. Decisions (PS-D)

- **PS-D1 · One message, plain words, developer room.**
  - *What* (the canonical line, everywhere): **"Floor plans as code. Your AI writes ArchLang; the
    compiler draws a precise, dimensioned plan and tells it what's wrong."** The docs h1 stays
    "Designs that compile." plus "A declarative language for floor plans." (ADR 0010; SEO, now pinned
    by a test). The canonical line is the lede under them. The README's first sentence is the
    25-word boilerplate (`marketing/copy/messaging-library.md`).
  - *Why*, in three cards:
    - **Exact.** Areas and reachability are computed, not estimated; the same text gives the same
      drawing, byte for byte.
    - **Change one line, see what moved.** Edit a number and only what depends on it moves;
      `impact --lock` proves the rest didn't.
    - **It checks itself.** An unreachable room or an opening off its wall comes back as a message
      with a code and a fix your AI can apply; checks other than reachability and area are advisory.
  - *Honest limits*, one line on the docs home and in the README: plan drawings only (no 3D in the
    core, no BIM/IFC, not permit drawings); it does not read images (your AI can: `/from-an-image`);
    clearances are advisory.
  - *Guardrails* every card's copy is checked against:
    - the `KILLED` list in `test/docs-page-meta.test.ts`;
    - `positioning.md` bans B1 (no structure-vs-pixels contrast), B6 (verification-value as
      proven fact), B12 ("before you see it", a check that "blocks");
    - never say ChatGPT Images fails at plans; never "first"/"only"; never imply CAD/BIM displacement;
    - never say ArchLang "designs", "arranges" or "lays out";
    - no star, download or eval counts as traction;
    - no "public check suite", `lang-1.0` or conformance until those cards ship; "checks plans in
      other open formats" only after OAS ships (A3, §6).
- **PS-D2 · Doors: one source of truth, ordered per surface.** `site-shared/doors.json` holds every
  URL, command and the agent prompt; every surface reads it, and a test fails on drift.
  - The doors are:
    - **coding agent** (one prompt to paste: skills add → spec → write → compile → check; tabs for
      Claude Code, Codex, Cursor, VS Code);
    - **ChatGPT app** (no install);
    - **claude.ai connector** `https://mcp.archlang.uk/mcp` (no install);
    - **VS Code extension**;
    - **playground**.
  - Order by surface:

    | Surface | Order |
    |---|---|
    | README / npm / `/agents` | coding agent → hosted (ChatGPT, claude.ai) → VS Code → playground |
    | npm `archlang-mcp` page, `llms.txt`, VS Code listing | hosted (ChatGPT, claude.ai) → coding agent → (VS Code) → playground: their readers already chose MCP or an editor (O1) |
    | Docs home | ChatGPT and the agent prompt side by side at equal weight |
    | Playground sheet | all doors at equal weight |
    | `/start` | by friction, for the curious non-developer |

  - Say "no install", never "no signup" (both hosts need an account).
- **PS-D3 · The playground opens in view mode.** (The kept intro band is superseded by PG-D6,
  owner 2026-11-07: `docs/plans/playground-minimal/`.)
  - The drawing fills the screen.
  - **Source stays a visible header button**: this is the Show HN URL and HN readers "expect to
    touch it immediately".
  - `#z=…&edit` opens edit mode (used by `arch link` and the docs code panes).
  - Every power tool stays, behind **Tools**. That includes Tier-A "3D preview", labelled exactly as
    the 3D decision record says, in both modes.
  - Kept as they are: the attribution strip, the frame headers, and the pre-JS h1 and lede.
- **PS-D4 · Interaction without code.** (The thumbnail strip is superseded by PG-D2's gallery,
  owner 2026-11-07: `docs/plans/playground-minimal/`.)
  - A thumbnail strip switches plans.
  - Pan and zoom.
  - Hover a room for name, area and size; click it for its facts.
  - A storey switcher.
  - **Knobs**: sliders from the plan's top-level numeric `let`s (`LetNode`, `src/ast.ts:1146`).
  - **Checks**: a toggle that draws the review rings `preview --review` already makes, so a
    "mistake → receipt" is one click.
- **PS-D5 · Performance is a feature.**
  - The first drawing is pre-rendered in the HTML.
  - The compiler loads after first paint. The editor, panels, three.js and jsPDF load on demand.
  - Budgets: the drawing is visible with JS off; startup JS without the compiler and editor is
    ≤ 60 KB gzip; no 3D and no CodeMirror in the startup chunks.
- **PS-D6 · Docs: a showroom on top, the full reference underneath.**
  - Nav: **Try it · Gallery · Docs ▾ · Playground ↗ · GitHub**.
  - The five topic pages (`/floor-plans-as-code`, `/floor-plan-dsl`, `/mcp`, `/javascript`,
    `/vs-mermaid`) stay linked, through a home "Topics" row and the footer, and a test guards them.
  - No URL changes, and no FAQPage markup.
- **PS-D7 · README = one screen that shows, then hands over.** In order:
  1. wordmark;
  2. boilerplate;
  3. pills;
  4. card;
  5. **Try it** (doors in the README order);
  6. plan grid;
  7. why (3 lines) and limits (1 line);
  8. "Starting from a photo? / Change one room?" links;
  9. for your agent;
  10. video;
  11. what's new link;
  12. the ArchCanvas line, verbatim ("ArchCanvas is a hosted app built on ArchLang.").

  Because the README is the npm page, an owner-tagged docs-only patch release follows R1 so npm
  matches on Show HN day.
- **PS-D8 · The card: brief → plan → change → check.** Built from a **real** agent-gallery pair,
  with the real compiler, and every typed line real.
  - It opens on a checkable figure (rooms and m², exact area) and keeps the lint ring raised and
    cleared.
  - Budget: ≤ 220 KB, ≤ 24 s, a static last frame, reduced motion honoured.
  - The same card serves the owner's profile README.
- **PS-D9 · Laws hold.**
  - Light only (ADR 0014).
  - Token lockstep between the sites.
  - The byte-sacred logo.
  - ~~2D only on the README and docs through Show HN.~~ Superseded by PS-D11 (owner, 2026-11-06; `3d.md`).
  - No AI imagery on ArchLang surfaces; compiler output only.
  - The URL contract: `#z=`, `#src=`, `/s/<id>`, `/s/<id>.png`, `/embed.html` (literal 200),
    `/examples/*`, `/llms.txt` (kept trim).
  - The pinned home `<title>`.
  - `#z=` never leaves the browser unless the visitor clicks a share action: a short link is
    created only on click, and a chat-host link says it puts the plan in that host's URL.
  - Tests that pin the old layout are rewritten to pin the new contract, never deleted without a
    replacement and never blessed green.
- **PS-D10 · Rulings by delegation (owner, 2026-11-06: "请你帮我做出最佳决策").**
  - *View mode is the default*, with Source visible (PS-D3).
  - *The Show HN README gate is cleared.* `positioning.md` was updated on 2026-11-04, and the
    FloorGen/Skopia answer is on record: "open MIT text you can diff, run offline and in CI, no
    account". Sources: `research/2026-11-02-competitor-deep-dive-floorgen-walkmyplan-mcp4ifc/01-floorgen.md`,
    `06-skopia.md`, `research/2026-11-02-multi-angle-positioning-research/01-…`.
  - *Knobs never edit an existing example.* `parametric`, `terrace-row`, `classroom-block`,
    `museum` and `garden-house` get knobs as they are. Where a showcase needs better knobs, or a
    before/after for Checks, a **new** example is added with its own pins; no existing digest moves.
  - *Showcase content* (card SC1):
    - The Miraflores raid plan (a real government building and a January 2026 military operation)
      leaves the public gallery and moves to the private `archlang-lab`.
    - Recreations of TV sets and game maps are never the hero of any ArchLang surface, never in Show
      HN material, and no new ones are made. The existing ones move below public-domain
      architecture and original plans, under a "fan studies" heading with the existing nominative-use
      notice.
    - "Building-code linter" (the dust2 heading) is retitled; it breaks the content-line decision.
  - *The 2026-11-24 freeze* covers language forms and core behaviour. Site, README and card work
    is not a language form. It still lands by 2026-11-27 with a fallback (§5).

## 4. Target designs

### Playground (view mode, 1280 px)

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▲ArchLang  Laneway House ▾          [Source]  [Checks]  [Tools ▾]  [Make your own] │
├──────────────────────────────────────────────────────────────────────────────────┤
│  57 lines of ArchLang → this drawing · 4 rooms · 54.2 m² (net) · byte-identical    │
│                                                                                  │
│            THE DRAWING  (hover a room → name · area · W × D; click → facts)      │
│  ┌ Knobs ─────────┐                                                   − + ⤢       │
│  │ W ───●── 7500  │                                                              │
│  └────────────────┘                                                              │
├──────────────────────────────────────────────────────────────────────────────────┤
│ [thumb][thumb][thumb][thumb][thumb][thumb]  →  all plans                            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Make your own** is the only redline button. It opens the doors sheet: the agent prompt
  (tabbed, with a copy button), ChatGPT, claude.ai, VS Code, and "edit this plan here". It also
  has two links answering the top asks: "Starting from a photo?" and "Change one room only?".
- **Source** slides in today's editor and diagnostics. In edit mode, Tools adds Format, Finish,
  Describe, Lint, Intent, Takeoff, theme, accessible export, snapshots, embed, Copy for LLM and
  Ask AI.
- The intro band becomes one line under the header: the h1 and the lede, kept before JS.
- Mobile (≤ 900 px): the drawing full screen, a swipe strip, knobs in a bottom sheet, Source as a
  second full-width screen, Make-your-own always visible.

### Docs home

1. **Hero:**
   - The h1, the sub-line and the canonical line.
   - Two equal primaries: **Use it in ChatGPT** and **Copy the prompt for your agent** (a copy box).
   - A text link to the playground.
   - Right: the compile seam (ADR 0010 §5), retold as brief (a chat bubble from a real gallery
     pair) → source streaming → sheet. It finishes in ≤ 8 s, its final state is server-rendered,
     and it has Replay.
2. **Why:** the three PS-D1 cards, each with a small real visual: dimension callouts, a one-number
   before/after, and a review ring raised and cleared.
3. **How:** ask your AI → it writes ArchLang and checks it → SVG, PDF, DXF or PNG. Then the doors
   card (tabs) and the YouTube film.
4. **Gallery:** 6–8 furnished plans (`finish` output), ≤ 20-word captions, noted as "selected
   examples, not a benchmark". Each has Open in playground.
5. **What it is / what it isn't:** a table from `category.md` §5 plus the honest limits, and a
   link to `/vs-mermaid`. There is **no** comparison table against AI images or CAD.
6. **Reads its own plans** (shortened), **For agents** (keeps the sentence "An interface, not just
   an image."), and a **Topics** row.

New page **/start**, titled "Get a floor plan from your AI in 60 seconds": the doors by friction,
one screen each with a real capture of the result.

### README

```text
[wordmark]
<25-word boilerplate: floor plans as code …>
[Playground] [Docs] [Gallery] [npm]
[card.svg]
## Try it
  Your coding agent (one prompt, copy block) · ChatGPT app · claude.ai connector (no install)
  · VS Code extension · playground
## What you get     2×3 grid of real, furnished plan SVGs → playground (view mode)
## Why text         exact · change one line, see what moved · it checks itself  (+ one limits line)
Starting from a photo or PDF? → /from-an-image · Change one room only? → /edit-one-room
## For your agent   AGENTS.md, `context`, MCP, docs
[video] · What's new → · MIT · ArchCanvas is a hosted app built on ArchLang.
```

## 5. Order, gates and the launch fallback

| Stage | Cards | Why |
|---|---|---|
| 0 (day 1) | S1, S2, O1–O3 | The zero-install doors are invisible today. The npm MCP page talks people out of them. The fixes are small. |
| 1 | P1 → P2–P6 | The playground is the Show HN URL, and other surfaces link into its view mode. |
| 2 | D1–D4, SC1 | They reuse the doors and view-mode links. |
| 3 | C1, R1, O4–O8 | They need final URLs; R1 is followed by the docs-only patch release (owner tags). |
| 4 | V1 | First-contact review; the after-launch reading on 2027-01-09. |

- **Gates per card:** `check:quick` (plus `docs:build` for docs), CI green, and the risk tier
  (`scripts/risk-tier.mjs`). P1 is high, because the share links are a public contract, so the
  owner approves it. The README is medium. One heavy local process at a time; e2e and Lighthouse
  run in CI.
- **Fallback:** if P1 is not merged by **2026-11-24**, Show HN links today's playground and P1–P6
  ship after launch. Stages 0, 2 and 3 do not depend on P1, except for the `&edit` links, which
  degrade to today's behaviour.
- **Dates:** language freeze 2026-11-24; Show HN Tuesday 2026-12-01, 9–12 ET (ArchLang only, no
  mention of the ArchCanvas Product Hunt launch); Product Hunt (ArchCanvas) ~2026-12-15.

## 6. Owner-only items, outside the agents' reach

- The GitHub social preview (upload `brand/archlang-og.png`) and the repo description.
- The Marketplace upload of the VS Code README change.
- The Glama description.
- The docs-only patch release tag.
- **A3, ruled by delegation on 2026-11-06.**
  - The general claim "ArchLang checks plans written in other open formats" waits until OAS is
    also released and the round-trip metric passes, as growth decision 2026-11-04 says. That
    record is the owner's, and its wording promises import, lint and export.
  - Allowed now, as a feature fact on reference and docs pages but never as a headline or hero
    claim: "imports OpenPlan3D JSON (`archlang import --from openplan3d`) and checks it like any
    plan". It traces to a released version.
  - `docs/plans/checker-reach/handoff.md` was corrected to match.

## 7. Definition of done

- **First-contact test.** Three fresh-context reviewers per surface (README/npm, docs home,
  playground, showcase), one of them an HN sceptic armed with
  `marketing/launches/show-hn/anticipated-comments.md`. Each gets the URL and 10 seconds and must
  state what it is, one reason to try it, and a no-install way to try it. All pass.
- **Playground.**
  - The drawing is visible with JS off.
  - Startup JS without the compiler and editor is ≤ 60 KB gzip (`e2e/startup-chunks.baseline.json`).
  - LCP ≤ 1.5 s (CI Lighthouse, desktop).
  - The drawing takes ≥ 70 % of the 1280 px viewport.
  - At most 5 header controls.
- **Docs home.**
  - Both primaries are above the fold at 1280×800 and 390×844.
  - The nav has 5 slots and the topic pages stay linked.
  - No caption is over 20 words.
  - The h1 sub-line is pinned.
- **README.** It reaches Try it within one screen at GitHub's 1012 px column; the card is ≤ 220 KB;
  npm matches after the patch release.
- **All surfaces.** Every door string equals `doors.json`; one canonical line; no guardrail word; no
  stale version in owner-controlled copy.
