# 10. "The Compile Boundary" — one two-world design system for both public sites

- **Status:** Accepted — **superseded in part by [ADR 0014](0014-one-light-world.md)**
- **Date:** 2026-07 (2026-07-10 rollout)

> **Superseded in part (2026-07-13).** [ADR 0014](0014-one-light-world.md) makes both sites **one
> light world**: the two worlds survive but differ by temperature and texture, not by darkness, and
> there is no dark mode or dark surface anywhere. That retires **§1**'s dark/light framing, **§2**'s
> palette, **§6**'s dark editor pane, and **§7** (docs dark mode) outright. **§3** (fonts), **§4** (the
> token-lockstep law), **§5** (the live compiler hero), **§8** (ArchCanvas keeps its own identity) and
> **§9** (the accessibility floor) still bind — read them here, and read everything about carbon,
> mylar, and the dark source world as history.

## Context

ArchLang's identity is one line — **"Designs that compile."** The logo already carries it
(the "A" is a floor plan; [`brand/README.md`](../../brand/README.md)), but the two public
surfaces an agent or a human actually lands on — the **docs site** and the **playground** —
did not. They ran an earlier, generic dark-hero look (a `FlowingLines` canvas, a `BrandHero`
component, pill chrome, Space Grotesk / Geist Mono) that said nothing about what the tool *is*.
A tool that turns **source into a precise drawing** should make that transformation the first
thing you see, on every surface, the same way.

Two forces also pushed a redesign now. A downstream product (ArchCanvas) had just proven the
core runs in the browser, so the sites' credibility as *live compilers* mattered more. And a
user hit Chromium's Auto Dark Mode force-darkening the sites' rendering — a reminder the sites
had no deliberate, declared color contract. The question this ADR settles is not "what should
the sites look like" but "**what is the one system both sites run, and what rules keep it true**"
— because two sites, two build systems (VitePress and Vite), and a shared brand are exactly the
setup where a look drifts into two looks.

## Decision

**1. The compile boundary is the design — two worlds, one seam.** Every surface is split by a
visible **compile seam** into a dark **SOURCE world** and a light **SHEET world**. The brand
grammar is made literal, not decorative: source *is* dark and technical, the compiled sheet *is*
light drafting film, and the seam between them is the compiler. This is the ArchLang logo's
"source ↔ compiled" reading (and the ArchLang/ArchCanvas family split) rendered as chrome. A
generic hero was rejected because it wastes the one thing the product uniquely owns.

**2. Palette carries the two worlds; one accent crosses both.** SOURCE world: carbon
`#0f1115` / `#171b23`, with plum `#8052ff` surviving **only** as the source-world
syntax-highlight accent and the logo fills (`--plum-bright #9a7bff` for AA body text on carbon)
— plum earns no other job in the chrome. SHEET world: drafting paper `#f5f2ea` / `#fbfaf5`,
blue-black ink `#1c2430`, annotation grey `#5b6470`, hairlines `#cfc9bb`, a fine drafting grid.
A single accent, **REDLINE** (`#c2362b` graphics / `#b3261e` text, AA), crosses both worlds and
means **attention only** — calls to action and errors — because that is the architect's markup
red. Amber (`#8a6d00`) stays **advisory-only** (warnings), so red never dilutes into "generic
highlight." Drafting vernacular carries semantics rather than ornament: dimension-line dividers
with end ticks, title-block footers, poché 45° hatches, sheet numbers (A-101…), schedule tables,
squared 2–4px corners (the 9999px pill is retired).

**3. Fonts are self-hosted and axis-driven.** **Archivo Variable** (display, `wdth` axis 62–125
— sheet titles wide caps, micro-labels narrow caps) + **Public Sans Variable** (body) + **IBM
Plex Mono** (code and figures, tabular-nums), all via `@fontsource` with **zero CDN** (the core's
zero-dependency ethos extended to the sites' network). Space Grotesk / Geist Mono are removed
from the sites (the wordmark *asset* still ships outlined Space Grotesk paths — a static SVG, not
a site font).

**4. The brand tokens are duplicated byte-identically, on purpose.** The token block lives in
**two files** — `docs-site/.vitepress/theme/style.css` and `playground/src/styles/tokens.css`
— copied verbatim, **not** shared through an import. VitePress and Vite are independent build
graphs with no common package; a real shared module would mean a third workspace and a build-time
coupling for ~40 lines of custom properties. The **lockstep law** (change one, change the other)
is the deliberate trade: cheaper than the abstraction, and small enough to diff. This mirrors the
project's existing "duplicate a small thing, don't over-engineer the seam" stance (the
ArchLang↔ArchCanvas brand tokens are duplicated the same way).

**5. The docs hero is the real compiler.** `CompileSeam.vue` typewrites `examples/studio.arch`
into a carbon pane while the **actual `compile()`** draws the plan on a paper pane — no video, no
pre-baked SVG. The mechanism respects the compiler's contract: source is fed by **line-boundary
prefix** with auto-balanced closing braces, so every intermediate frame is a *valid* partial plan
the parser recovers from (it never throws), and the last good SVG is kept. This only works because
`compile()` is pure, synchronous, and fast (~1.4 ms) — the same determinism [ADR
0007](0007-opt-in-source-annotation.md)/[0008](0008-circulation-as-facts.md) protect. Constraints
the hero must honor: **SSR renders the settled final state** (hydration-safe, no client/server
mismatch); the pane is a **viewBox-locked aspect-ratio box** so layout shift is ~0 (CLS 0.01); the
animation starts on an `IntersectionObserver` and **`prefers-reduced-motion` collapses it to the
static final frame**. `SheetGrid.vue` / `FactsSection.vue` likewise compile real examples at SSR.

**6. The playground is a fixed two-world layout with no light/dark toggle.** The editor pane *is*
the source world (a full dark CodeMirror theme) and the preview pane *is* the sheet world (paper +
drafting grid); the split divider is styled as the compile seam. A user theme toggle is rejected
because the two-world split is the *meaning*, not a preference — a "light source pane" or "dark
sheet" would break the metaphor. Editor syntax colors flow through CSS vars: `gen-grammars.ts`
emits `var(--syn-<name>, <fallback>)` and the on-carbon palette lives in `styles/editor.css`
(recolor via the generator, never by hand-editing `arch-language.js`).

**7. Docs dark mode is a "mylar film" variant, not an inversion.** The docs site keeps a
light/dark toggle (VitePress convention), but dark mode is the *sheet* world reimagined as mylar
drafting film (paper→`#23262e`, ink→`#e8e6dd`, redline→`#e2564a`/`#ff8577`) — **the source world
is byte-identical in both modes** (source is always dark). Inverting the whole page was rejected;
the source world has one true appearance.

**8. ArchCanvas keeps its own system.** The family relationship between ArchLang and ArchCanvas
lives in the **logo grammar** (SOURCE mark ↔ COMPILED knockout tile), **not** in shared site
chrome. ArchCanvas deliberately retains its plum / Space Grotesk / dark-hero identity. Forcing one
chrome across two products was rejected: the family is a *concept* (the two states of a compile),
and each product's site is free to express its own side of it.

**9. Accessibility is a floor, not a polish pass.** Both sites ship **AA** contrast on both
worlds and both modes, real heading hierarchy and `role=main`, `prefers-reduced-motion` honored,
`<meta name="color-scheme" content="light dark">` + `robots.txt`, and **Lighthouse 100** on
accessibility / best-practices / SEO. This is a hard gate the two-world palette was tuned to meet
(hence `--plum-bright` for body text on carbon, and the fixed-hex CTA in point 2).

## Consequences

- One system, two build graphs, held together by the **lockstep law** on two named files —
  cheaper than a shared package, but it **must** be honored by hand (a lint/test could enforce it
  later; today it is a documented rule).
- The hero is a live demo of the product's core claim, at zero incremental asset weight and CLS
  0.01 — but it couples the docs build to `compile()` staying pure/synchronous/fast; a regression
  there would show up as a broken or janky hero.
- Deleted: `BrandHero.vue`, `FlowingLines.vue`, `flowing-lines.js`, `FamilyFooter.vue`,
  `playground/src/style.css` (split into `styles/{tokens,chrome,editor,panels,embed}.css`),
  playground `flowing-lines.ts`. A shipped bug surfaced in the rebuild — a duplicate `id="format"`
  meant the playground **Format button never worked since it shipped**; the reformat control is now
  `id="formatSrc"` and live.
- **Lessons (hard-won, for the next agent to touch the sites):**
  - In a Vue `<style scoped>` block, a partial `:global(.dark) descendant` selector **miscompiles
    to a bare `.dark { … }` rule** — it inverted the entire site once. Put dark-mode overrides of a
    component's scoped internals in a **separate unscoped `<style>` block**.
  - VitePress's default `.vp-doc a:hover` (specificity 0,2,1) **outranks** a two-class component
    rule (0,2,0) the instant a link is hovered — any `.vp-doc <class> a` control whose color must
    survive hover has to re-assert `color` in its own `:hover`. Verify interactive states
    (hover/focus/active), not just the static render.
  - A token that **flips per mode** (`--redline`) is unsafe on ground that **doesn't flip** (the
    always-carbon terminal, the fixed-dark bands) — use a fixed hex + a comment there. The solid CTA
    is fixed `#b3261e` + white for this reason.
- None of this touches the core: `@chanmeng666/archlang` is unchanged (the only in-repo source
  edit was the `gen-grammars.ts` template + its regenerated grammar; the tmLanguage JSON is
  byte-identical). The VS Code extension took an icon-only repack to 0.4.1.
