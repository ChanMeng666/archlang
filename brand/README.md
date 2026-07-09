# ArchLang brand kit

The visual identity for ArchLang. Read this before touching anything in `brand/` —
the geometry law below is a founder decision, not a style preference.

---

## The mark

The logo is the letter **"A" drawn as an A-frame house floor plan**, in full
architectural drafting detail:

- the two thick **gable walls** lean together to form the strokes of the A;
- the letter's **crossbar is a door** — an opening in the wall with its
  quarter-circle **swing arc** drawn in;
- a **pendant light** hangs at the apex;
- the two **leg rooms** carry **furniture / fixture** glyphs;
- **window notches** break the gable walls.

It is meant to be read three ways at once — a **letter**, a **house**, and a
**floor plan**. That triple reading *is* the language's promise in one glyph:
**text in, a precise drawing out.**

## The family grammar — "Designs that compile"

ArchLang and [ArchCanvas](https://github.com/chanmeng666/archcanvas) share **one
identity family**, split along the compile boundary that defines both products:

| | State | Mark |
|---|---|---|
| **ArchLang** (this repo) | the **SOURCE** | the full technical drawing — every drafting line, wall, swing arc, fixture, and window notch visible |
| **ArchCanvas** | the **COMPILED** result | a solid tile with a plan **knocked out** of it (lives in the `archcanvas` repo) |

Same "A", two states of the same idea: you author the drawing on the left, the
compiler hands you the solid artifact on the right. **"Designs that compile"** is
the identity, not just a tagline.

## ⚖️ The geometry law (founder decision, 2026-07-09)

**`archlang-logo-master.svg` is the canonical, byte-sacred source of the mark** — a
verbatim [potrace](https://potrace.sourceforge.net/) trace of the original
gpt-image-2 artwork. It is the single source of truth for every asset here.

Non-negotiable rules:

1. **Recolor only.** Every color variant is produced by swapping the `fill` on the
   master's inner `<g>` — nothing else. **Path data is byte-identical** across
   `archlang-icon.svg`, `-black`, `-plum`, and the app tiles. (Verify:
   `diff` two variants after normalizing the `fill="..."` attribute → empty.)
2. **Never re-trace, re-fit, simplify, or edit the path data.** Not to "clean it
   up", not to reduce file size, not for a specific renderer.
3. **No simplified small-size tier exists, and none may be added.** Full geometry
   renders **everywhere**, favicons included. The interior detail gets dense at
   16–32 px — that density is an **accepted tradeoff**, deliberately chosen over a
   second, drifting geometry.
4. **Never reintroduce the old four-point "spark" mark.** It was fully retired on
   2026-07-09. If you find copy or comments still calling the favicon a "spark",
   they are stale — fix them to describe the A-frame mark.

An earlier rollout shipped a "simple tier" (interior contours dropped ≤56 px). The
founder reversed it: one geometry, everywhere. Do not re-add a simplified tier.

## Colors

| Token | Hex | Use |
|---|---|---|
| **Plum** (primary) | `#8052ff` | the brand accent; the mark on dark surfaces; favicon / nav logo |
| **Plum, light-surface** | `#6a3df0` | the accent when it sits on a light/ivory background (more contrast) |
| **White** | `#ffffff` | the mark on dark / photographic surfaces |
| **Ink** | `#111111` | the mono mark on light surfaces |
| **Void** | `#0f1115` | app-tile ground; site `theme-color`; OG-card ground |

## The sites' design system — "The Compile Boundary"

Distinct from the mark, but built on the same idea: the docs site and the playground
run a shared front-end system called **"The Compile Boundary."** A single compile
seam splits every surface into two worlds —

- a dark **SOURCE world** — carbon grounds (`#0f1115` / `#171b23`), where **plum
  `#8052ff` survives only** as the source-world syntax-highlighting accent and as the
  logo fills (nowhere else in the chrome);
- a light **SHEET world** — drafting paper (`#f5f2ea`), blue-black ink (`#1c2430`),
  hairlines, drafting grids, and title blocks —

joined by a single **REDLINE** accent, the architect's markup red (`#c2362b` for
graphics, `#b3261e` for text). Site type is **Archivo Variable** (display, `wdth`
axis) + **Public Sans Variable** (body) + **IBM Plex Mono** (code). The earlier
Space Grotesk / Geist Mono pairing, the FlowingLines hero canvas, the `BrandHero`
component, and the pill chrome are all **retired** from the sites.

These tokens live in **two files that must stay in sync** — the Compile Boundary
token block is duplicated by hand (not imported — the two build systems are
separate) in:

- **`docs-site/.vitepress/theme/style.css`**
- **`playground/src/styles/tokens.css`**

**ArchCanvas deliberately keeps its own design system** (its plum / Space Grotesk /
dark-hero identity). The two products are **not** joined by shared site chrome —
the family relationship lives entirely in the **logo grammar above** (ArchLang =
SOURCE mark, ArchCanvas = COMPILED knockout tile; **"Designs that compile"**).

## Wordmark

The horizontal lockup is the **full master mark** + **"ArchLang"** set in **Space
Grotesk, weight 500**, outlined to vector paths (no font dependency at render time).

Build note: the supplied `SpaceGrotesk-var.ttf` is a variable font whose `wght`
axis **defaults to 300** — a plain `opentype.js` read gives Light. The wordmark is
outlined with **`fontkit`** via `font.getVariation({ wght: 500 })` to instance the
Medium weight before extracting glyph paths. `archlang-wordmark.svg` is white (for
dark backgrounds); `archlang-wordmark-black.svg` is `#111111`.

**OG card** (`archlang-og.png`, 1200×630): `#0f1115` ground, the **plum** master
mark left-of-center, the white wordmark, and the tagline **"code to floor plans"**
in a muted grey — clean and minimal.

## Asset inventory

All files live in `brand/`. The **two mirrors** — `docs-site/public/brand/` and
`playground/public/brand/` — **must stay in sync** with the corresponding files
here (the sites serve their own copies; there is no build step that syncs them, so
update all three by hand). The mirrors carry the SVGs + `favicon-32` + `apple-touch`
+ `og.png`; they do **not** carry the master source or the icon PNGs.

| File | What | In mirrors? |
|---|---|---|
| `archlang-logo-master.svg` | **canonical source** (byte-sacred; recolor target) | no — repo-only |
| `archlang-icon.svg` / `.png` | full mark, white, transparent (1024²) | svg only |
| `archlang-icon-black.svg` / `.png` | full mark, `#111111`, transparent | svg only |
| `archlang-icon-plum.svg` / `.png` | full mark, `#8052ff`, transparent | svg only |
| `archlang-icon-app.svg` / `.png` | `#0f1115` rounded tile (rx 56/256) + white mark ~72% | svg only |
| `archlang-icon-app-plum.svg` / `.png` | same tile + `#8052ff` mark | svg only |
| `archlang-favicon-32.png` | 32² fallback favicon (full plum mark, transparent) | yes |
| `archlang-apple-touch.png` | 180² apple-touch (full plum mark on void tile) | yes |
| `archlang-wordmark.svg` | mark + "ArchLang", white (dark bg) | yes |
| `archlang-wordmark-black.svg` | mark + "ArchLang", `#111111` (light bg) | yes |
| `archlang-wordmark-dark.png` / `-light.png` | 2840×396 rasters of the two lockups | no — repo-only |
| `archlang-og.png` | 1200×630 social card | yes |

### Where each asset is referenced

| Surface | File | Asset(s) |
|---|---|---|
| README header (dark/light `<picture>`) | `README.md` | `archlang-wordmark.svg`, `-black.svg` |
| Docs site favicon / nav / OG | `docs-site/.vitepress/config.ts` | `archlang-icon-plum.svg` (favicon + `nav logo`), `archlang-favicon-32.png`, `archlang-apple-touch.png`, `archlang-og.png` |
| Docs hero (compile-seam) | `docs-site/.vitepress/theme/CompileSeam.vue` | `archlang-icon-plum.svg` (eyebrow mark) |
| Playground page | `playground/index.html` | `archlang-icon-plum.svg` (favicon), `archlang-apple-touch.png`, `archlang-og.png`, `archlang-icon.svg` (header) |
| Playground embed viewer | `playground/embed.html` | `archlang-icon-plum.svg` (favicon), `archlang-icon.svg` (header) |

When you change a referenced asset, rebuild both sites (`npm run docs:build`,
`npm run playground:build`) and confirm they stay clean.

## Not part of this kit — the author's signature

`chan-meng-logo.svg` and `chan-meng-monkey.svg` (under `.github/brand/` and the site
`public/brand/` mirrors) are the **maintainer's personal signature mark**. They are
separate from the ArchLang identity and must **never** be replaced by, or conflated
with, the ArchLang logo.
