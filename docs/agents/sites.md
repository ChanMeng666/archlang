# The sites' design system — "The Compile Boundary" (docs + playground)

> Moved verbatim from `AGENTS.md` (2026-09-18) so it loads on demand. Read it — plus `brand/README.md`, ADR 0014 and the `(Sites)` entries in [gotchas.md](gotchas.md) — before touching `docs-site/`, `playground/` or `brand/`.

Both public sites share one front-end system — **site chrome only**, no core/language change. Full
rationale in **[ADR 0014](../adr/0014-one-light-world.md)** (which supersedes ADR 0010 §1/§2/§6/§7 —
read 0010's carbon/mylar prose as history) and `brand/README.md`.

- **ONE LIGHT WORLD. There is no dark mode and no dark surface on either site.** Two worlds still split
  by a compile seam, but both are LIGHT and differ by **temperature + texture**, never by darkness: a
  cool **SOURCE world** (`--src-bg` #eceef2 / `--src-surface` #fbfbfc — code, mono type, syntax colour;
  plum survives *only* as the syntax accent + logo fills) vs. a warm **SHEET world** (drafting paper,
  blue-black ink, grid, title blocks). The seam is a solid plum rule (a glow reads as dirt on light).
  One shared attention accent, **REDLINE**, for CTAs and errors only. Body-size plum is `--plum-deep`;
  bare `--plum` (4.1:1) is graphics/≥24px only. A control's only border must be `--src-rule` (3.2:1),
  never the decorative `--src-border` (1.3:1).
- **One syntax palette, FOUR renderers.** The eight `--syn-*` tokens live in the shared block and
  feed the playground's CodeMirror (via `scripts/gen-grammars.ts`'s fallbacks), the docs fences (via
  the custom `archlangLight` Shiki theme in `docs-site/.vitepress/config.ts`), and — through
  `docs-site/.vitepress/theme/arch-highlight.js` — both the docs hero's typing pane and the
  `<ArchLive>` editor. Change a syntax colour in ALL FOUR places, then `npm run gen:grammars`.
  `arch-highlight.js` is **GENERATED** by `gen-grammars.ts` from the same `KEYWORDS`/`RULES`
  tables as the other two grammars, and deliberately adds no fifth copy of the palette: it emits
  `ahl-<name>` classes whose suffix IS a token name, coloured once by the `.ahl-*` rules at the
  foot of `style.css`. It is why ArchLang source is readable anywhere it appears — the ArchLive
  editor (a coloured `<pre>` under a transparent-text `<textarea>`, both sharing every metric that
  can move a glyph) is where nearly all of it lives, since every plain `arch` fence becomes one, and
  it used to render in ONE FLAT COLOUR while `CompileSeam.vue` carried a hand-typed keyword Set that
  had already drifted behind `src/grammar/tokens.ts`. `test/arch-highlight.test.ts` welds the
  generator's vocabulary to `KEYWORDS` and its class list to those CSS rules.
- **Fonts** (self-hosted `@fontsource`, zero CDN): **Archivo Variable** (display) + **Public Sans
  Variable** (body) + **IBM Plex Mono** (code).
- **Token-lockstep law.** The brand token block is **duplicated byte-identically** in
  `docs-site/.vitepress/theme/style.css` and `playground/src/styles/tokens.css` — change one, change
  the other (the brand iron law in [iron-laws.md](iron-laws.md)). The playground's static example pages are a
  THIRD consumer and deliberately not a third copy: `playground/scripts/gen-static.mjs` slices the
  block out of `tokens.css` on the same content anchor `test/site-lockstep.test.ts` uses and inlines it
  into each page's own `<style>`, so every rule there is a `var()`. It harvests its `@font-face` rules
  the same way — from `playground/dist/assets/*.css`, i.e. vite's own output, unioned across ALL of
  them — and exits 1 if a family `tokens.css` names has no face. Both are guarded; see the two `(Sites)`
  font/token entries in [gotchas.md](gotchas.md) for what shipped before they existed.
- **Machine-readable routes.** `sync-docs.mjs` publishes at the docs-site root a raw markdown copy of
  every generated page at `/<route>.md` plus **`/plan.schema.json`** + **`/archlang.gbnf`** — the copies
  live in `public/`, excluded from page parsing so they serve verbatim.
