# 14. One light world — no dark mode, no dark surfaces, on either public site

- **Status:** Accepted
- **Date:** 2026-07-13
- **Supersedes:** [ADR 0010](0010-compile-boundary-design-system.md) **§1** (in part), **§2**, **§6**
  (in part), **§7** (outright). ADR 0010's §3 (fonts), §4 (the token-lockstep law), §5 (the live
  compiler hero), §8 (ArchCanvas keeps its own identity) and §9 (the accessibility floor) still bind.

## Context

ADR 0010 built both public sites on a **two-world** system: a *dark* SOURCE world (carbon `#0f1115`,
plum-on-carbon syntax) beside a *light* SHEET world (drafting paper), split by a visible compile seam.
The docs site kept a light/dark toggle whose dark mode was a "mylar film" variant of the sheet world,
while the source world stayed byte-identical in both modes. §6 explicitly rejected a light editor pane
as "breaking the metaphor".

Three reports against the live docs home forced the question:

1. The hero's dark left pane never followed light mode.
2. The nav was carbon at scroll-top and paper one pixel later — a visible colour jump.
3. The "Use it from an agent" CTA had **invisible text** in light mode.

(3) was a real bug — `.vp-doc a:visited` (0,2,1) outranked `.vp-doc .agents__btn--solid` (0,2,0), and
in light mode `--redline-ink` is byte-identical to the button's own background. (1) and (2) were ADR
0010 working exactly as designed. So the choice was not "fix three bugs" but "is the two-*luminance*
system still what we want?" — because two of the three complaints *were* the design.

The system had also accumulated a tax that only existed because half the surfaces flipped per mode and
half did not: fixed hexes (`#f0705f`, `#b3261e`) chosen precisely *because* a mode-flipping token would
land on a ground that never flips; a `html:not(.dark) … var(--shiki-dark)` override forcing light mode
to use the *dark* Shiki palette; a `.dark img { filter: invert(1) }` rule; and a documented trap about
`:global(.dark)` miscompiling inside Vue scoped styles (which once inverted the whole site).

## Decision

**1. One light world.** Both sites are light-only. There is no appearance toggle, no `.dark` class, and
no dark surface anywhere — including the playground's CodeMirror editor, every docs code fence, the
ArchLive widgets, the home hero's source pane, and the "built for agents" terminal.

**2. The two worlds survive; only their luminance dies.** SOURCE and SHEET remain two distinct
surfaces, and the compile seam remains the thing between them. They now differ by **temperature and
texture** rather than by darkness: SOURCE is a cool neutral grey plate (`--src-bg #eceef2` /
`--src-surface #fbfbfc`) carrying mono type and syntax colour; SHEET is warm drafting paper
(`#f5f2ea` / `#fbfaf5`) carrying the grid, the poché and the title block. The seam is drawn as a solid
plum rule with redline ticks — on a light ground the old plum *glow* reads as dirt, not as light. A
cool plate on warm paper is a real, visible step (the two grounds were deliberately pulled apart:
the first candidate, `#f2f3f5`, sat only 1.008:1 from paper and erased the seam).

**3. Renamed tokens, because the old names became lies.** `--carbon` → `--src-bg`, `--carbon-2` →
`--src-surface`, `--plum-bright` (the AA-on-carbon text plum) → `--plum-deep` (the AA-on-light text
plum, `#6b3ae0`). Brand plum `#8052ff` keeps its value and its job: graphics, seams, carets and ≥24px
display text only — it is 4.1:1 on `--src-bg`, so it is **never** body text. The home headline's accent
is the one place it now appears at full saturation (large-text 3:1 applies).

**4. A new `--src-rule` (`#7f858f`, 3.2:1).** `--src-border` (12% black, 1.3:1) is decorative only. Any
control whose *only* boundary is its border — the playground's toolbar selects and buttons, the ghost
CTAs, the CodeMirror tooltip — must use `--src-rule` to clear WCAG 1.4.11's 3:1 for non-text UI. This
distinction did not exist before because the old `oklch(1 0 0 / 12%)` was equally weak on carbon.

**5. One syntax palette, three renderers.** The eight `--syn-*` colours move into the **shared token
block** and are consumed by all three code surfaces: the playground's CodeMirror `HighlightStyle`
(via `scripts/gen-grammars.ts`, which emits `var(--syn-<name>, <hex>)`), the docs hero's typing pane,
and the docs code fences — the last through a **custom single Shiki theme** (`archlangLight`, in
`docs-site/.vitepress/config.ts`). A custom theme is required, not a preference: stock `github-light`'s
comment `#6e7781` is **4.40:1** on our grounds (below the AA gate), and `github-light-high-contrast`'s
keyword is **red**, which would collide with "redline means attention only". A single theme (not a
`{light,dark}` pair) also means Shiki emits plain `color:#hex` with no `--shiki-*` vars to swap, so the
`html:not(.dark)` override dies with it. The hexes now live in four places (two token blocks, the
generator template, the Shiki theme) — cross-referenced by comment, the same discipline as the lockstep law.

**6. `color-scheme: only light` is the force-dark opt-out.** ADR 0010 §9 declared
`<meta name="color-scheme" content="light dark">` to stop Chromium's Auto Dark Mode force-darkening the
sites. A light-only site cannot make that claim, and declaring `light` alone in the meta tag re-arms
force-dark. The correct modern opt-out is the **CSS** `color-scheme: only light` in the shared `:root`
block; the meta tag states the same intent for UAs that read it first. Both ship.

**7. Landing CTAs are excluded from the link-colour rules, not out-specified.** `doc-pages.css` now
scopes its link rules to `.vp-doc a:not(.agents__btn)`. Raising `.vp-doc a.agents__btn--solid` to
(0,2,1) would only *tie* `:visited` and then depend on `home.css` loading after `doc-pages.css` — true
today, one import reorder from breaking. Exclusion removes the rule in every state at once and fixes
the ghost sibling for free. VitePress's own `.vp-doc a:hover` (0,2,1) still applies, so the buttons
must keep re-asserting `color` in their own `:hover`.

**8. The home nav is the paper bar at every scroll position.** VitePress leaves `.VPNavBar.home.top`
*transparent* (it expects a hero to show through) and only fills it once `.top` drops. Deleting the old
carbon rule is therefore **not** enough — it would leave a see-through bar. The background is now
positively asserted, and the underline reuses `.divider-line` rather than a `border-bottom` so there is
no 1px height jump against the scrolled bar.

## Consequences

- **The "fixed hex on ground that doesn't flip" rule is moot.** Nothing flips, so every fixed hex went
  back to being a token (`.agents__flag`, both solid CTAs, the hero's `.t-st` / `.t-nu`). A fixed hex
  in the site CSS is now a **fossil**: if you find one, convert it. Likewise the `:global(.dark)`
  scoped-style trap and the `.dark img { filter: invert(1) }` rule are gone — there are no dark
  overrides left to write.
- **A pre-existing AA failure was fixed in passing:** `--warn-ink` was `#8a6d00` = 4.40:1 as text on
  paper. It is now `#7a6000` (5.4:1). The CodeMirror warning squiggle's data-URI carries the same hex
  literally (a `var()` cannot cross into an SVG) and tracks it.
- **The metaphor is quieter.** A cool plate against warm paper is a smaller step than carbon against
  paper. The seam, the grid, the mono type and the syntax colour now carry the source/sheet distinction
  that luminance used to carry alone. This is the deliberate cost of the decision.
- **The core is untouched.** `@chanmeng666/archlang` has zero source changes; the only non-site edit is
  the `gen-grammars.ts` palette template and its regenerated `playground/src/arch-language.js` (the
  TextMate grammar carries no colours and stayed byte-identical). The playground's **`theme dark` render
  option is NOT affected** — that is the compiler producing a dark SVG *plan*, a language feature in
  `src/theme.ts`, not a dark mode for the page. Leave it alone.
- The token-lockstep law (ADR 0010 §4) now covers a larger block (source tokens + the syntax palette).
  It is still hand-enforced: no shared import, no CI check. Diff the two files before committing.
