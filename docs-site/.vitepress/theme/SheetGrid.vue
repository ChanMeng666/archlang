<script setup lang="ts">
// The five features as drafting-sheet cards. Each card is a sheet: a numbered
// title block (A-101 … A-105), a header that shows a real compiled artifact (an
// example plan's SVG), then the specification copy. Rows are separated by a
// dimension line — the drawing detail that says "this is a measured document".
// (The card__art--poche 45° hatch fallback stays for any future art-less sheet;
// today every card carries a compiled drawing.)
//
// Each drawing is also a DOOR into the playground. `example` names the examples/*.arch
// the art was compiled from, and EXAMPLE_LINKS (minted at build time by sync-docs.mjs)
// turns it into a `#z=` permalink opening that exact source with its plan already drawn.
// One name drives both, so a card cannot show one plan and open another.
import { EXAMPLE_LINKS } from "./examples-data.js";

/** An example the gallery ships — the keys sync-docs.mjs derives from examples/*.arch.
 *  Typed as the literal union rather than `string` so a card naming a plan that is not
 *  in the gallery is a BUILD error, not a card whose link silently reads `undefined`.
 *  (It is also what makes `EXAMPLE_LINKS[s.example]` legal under the generated module's
 *  index-signature-free type.) */
type ExampleName = keyof typeof EXAMPLE_LINKS;

interface Sheet {
  no: string;
  tag: string;
  title: string;
  body: string;
  /** The plan this sheet SHOWS. Both the drawing (/examples/<name>.svg) and the
   *  playground link are derived from it, so a card cannot picture one plan and
   *  open another. Absent = an art-less sheet, which falls back to wall poché. */
  example?: ExampleName;
}

const row1: Sheet[] = [
  {
    no: "A-101",
    tag: "Showpiece",
    title: "The whole language on one sheet",
    body:
      "Site orientation, a polygon reading nook and an L-shaped suite, a bowed arc bay, all five door kinds, a shared stair shaft, a void over a double-height living room, a roof overhang, and a mirrored pair of bathrooms composed from one component — a two-storey villa with an attached garage, on one A2 sheet at 1:50. Every room is reachable, every doorway clears.",
    example: "hillside-villa",
  },
  {
    no: "A-102",
    tag: "Principle",
    title: "Deterministic by design",
    body:
      "The same source always compiles to byte-identical output — no clocks, no randomness, no I/O. Every loop, conditional and function is evaluated as the drawing is built. This 49 m² laneway house has no hand-placed opening in it: each one is pinned to a run along a named wall, so the numbers are the drawing.",
    example: "laneway-house",
  },
  {
    no: "A-103",
    tag: "Principle",
    title: "Zero-dependency core",
    body:
      "The default SVG path pulls no runtime dependencies. Optional power — PNG raster, vector PDF, angled-wall geometry — loads lazily and is never required. An 11-room courtyard house, 163 m² around an open middle, compiles with nothing installed.",
    example: "courtyard-house",
  },
];

const row2: Sheet[] = [
  {
    no: "A-104",
    tag: "Output",
    title: "Professional CAD output",
    body:
      "Layers, line weights, wall poché, openings that void walls, real fixture symbols, dimensions, a north arrow, scale bar and a title block — plus a room schedule and a legend, both derived. Here: a 50 × 32 m library on A2 at 1:200, its column grid and shelf runs written as for loops rather than coordinates. Export to SVG, DXF, PDF or PNG.",
    example: "library",
  },
  {
    no: "A-105",
    tag: "Geometry",
    title: "Not only rectangles",
    body:
      "Polygonal rooms measured by exact shoelace area, circular rooms measured as πR², and true arc wall edges — SVG A commands and native DXF arcs, never faceted at any zoom. This pavilion is rectangular nowhere: six trapezoid galleries ring a 28 m² drum.",
    example: "hexagon-pavilion",
  },
  {
    no: "A-106",
    tag: "Read-back",
    title: "Reads its own plans",
    body:
      "describe() returns rooms, areas, adjacency, an access graph and circulation facts; lint() flags habitability problems — image-free, so an agent can verify intent without an image. The legend and hatches below are derived the same way: one row per material actually used.",
    example: "materials",
  },
];
</script>

<template>
  <section class="sheets">
   <div class="sheets__inner">
    <!-- Dimension-line section divider -->
    <div class="dimdiv" role="presentation">
      <span class="dimdiv__tick" />
      <span class="dimdiv__line" />
      <h2 class="dimdiv__label">Features · Sheets A-101 — A-106</h2>
      <span class="dimdiv__line" />
      <span class="dimdiv__tick" />
    </div>

    <div class="sheets__row sheets__row--3">
      <article v-for="s in row1" :key="s.no" class="card">
        <div class="card__art" :class="{ 'card__art--poche': !s.example }">
          <img
            v-if="s.example"
            :src="`/examples/${s.example}.svg`"
            :alt="`${s.title} — a compiled ArchLang floor plan`"
            loading="lazy"
          />
        </div>
        <div class="card__meta">
          <span class="card__no">{{ s.no }}</span>
          <span class="card__tag">{{ s.tag }}</span>
        </div>
        <h3 class="card__title">{{ s.title }}</h3>
        <p class="card__body">{{ s.body }}</p>
        <!-- The file name is VISIBLE, not just an aria-label: five links reading only
             "Open in Playground" on one page collide as accessible names, and naming the
             source is the more useful half anyway. Reads as a title-block row. -->
        <a
          v-if="s.example"
          class="card__open plan-open"
          :href="EXAMPLE_LINKS[s.example]"
          target="_blank"
          rel="noopener"
        >
          <span class="card__open-file">{{ s.example }}.arch</span>
          <span class="card__open-cta">Open in Playground&nbsp;↗</span>
        </a>
      </article>
    </div>

    <div class="dimdiv dimdiv--inner" role="presentation">
      <span class="dimdiv__tick" />
      <span class="dimdiv__line" />
      <span class="dimdiv__tick" />
    </div>

    <div class="sheets__row sheets__row--3">
      <article v-for="s in row2" :key="s.no" class="card">
        <div class="card__art" :class="{ 'card__art--poche': !s.example }">
          <img
            v-if="s.example"
            :src="`/examples/${s.example}.svg`"
            :alt="`${s.title} — a compiled ArchLang floor plan`"
            loading="lazy"
          />
        </div>
        <div class="card__meta">
          <span class="card__no">{{ s.no }}</span>
          <span class="card__tag">{{ s.tag }}</span>
        </div>
        <h3 class="card__title">{{ s.title }}</h3>
        <p class="card__body">{{ s.body }}</p>
        <!-- The file name is VISIBLE, not just an aria-label: five links reading only
             "Open in Playground" on one page collide as accessible names, and naming the
             source is the more useful half anyway. Reads as a title-block row. -->
        <a
          v-if="s.example"
          class="card__open plan-open"
          :href="EXAMPLE_LINKS[s.example]"
          target="_blank"
          rel="noopener"
        >
          <span class="card__open-file">{{ s.example }}.arch</span>
          <span class="card__open-cta">Open in Playground&nbsp;↗</span>
        </a>
      </article>
    </div>
   </div>
  </section>
</template>

<style scoped>
.sheets {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.sheets__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}

/* ── Dimension-line divider ──────────────────────────────────────────────── */
.dimdiv {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 clamp(28px, 4vw, 44px);
}
.dimdiv--inner {
  margin: clamp(28px, 4vw, 44px) 0;
}
.dimdiv__line {
  flex: 1;
  height: 1px;
  background: var(--hairline);
}
.dimdiv__tick {
  width: 1px;
  height: 12px;
  background: var(--ink-muted);
}
.dimdiv__label {
  flex: none;
  /* It IS the section's h2 (heading order: hero h1 → this → card h3s), styled as
     a dimension-line label. Reset the .vp-doc h2 box so the drawing detail is
     visually unchanged. */
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* ── Rows ────────────────────────────────────────────────────────────────── */
.sheets__row {
  display: grid;
  gap: clamp(16px, 2.4vw, 28px);
}
.sheets__row--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.sheets__row--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 860px) {
  .sheets__row--3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .sheets__row {
    grid-template-columns: 1fr;
  }
}

/* ── Card = a sheet ──────────────────────────────────────────────────────── */
.card {
  display: flex;
  flex-direction: column;
  background: var(--paper-panel);
  border: 1px solid var(--hairline);
  border-radius: 2px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.card:hover {
  border-color: color-mix(in srgb, var(--redline) 45%, var(--hairline));
  box-shadow: 0 16px 34px -26px rgb(28 36 48 / 45%);
  transform: translateY(-2px);
}
.card__art {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  border-bottom: 1px solid var(--hairline);
  background: var(--paper);
}
.card__art img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.card__art--poche {
  /* 45° wall poché — the fill an architect hatches into a cut wall */
  background: repeating-linear-gradient(
    45deg,
    var(--paper) 0 7px,
    color-mix(in srgb, var(--hairline) 70%, transparent) 7px 8px
  );
}
.card__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 16px 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.card__no {
  color: var(--redline-ink);
  font-variant-numeric: tabular-nums;
}
.card__tag {
  color: var(--ink-muted);
}
.card__title {
  margin: 8px 0 0;
  padding: 0 16px;
  border: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 108;
  font-weight: 600;
  letter-spacing: 0.01em;
  font-size: 1.22rem;
  line-height: 1.15;
  color: var(--ink);
}
.card__body {
  margin: 10px 0 0;
  padding: 0 16px 18px;
  font-family: var(--font-body);
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--ink-muted);
}

/* The way into the playground, drawn as the sheet's bottom rule — same shape as the
   hero sheet's Replay row, so a card reads as a drawing with a control strip rather
   than a marketing tile. `margin-top: auto` pins it to the bottom of the flex column
   so a short card and a long one line their strips up across the row. */
.card__open {
  margin-top: auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 16px;
  border-top: 1px solid var(--hairline);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 88;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
  text-decoration: none;
  transition: color 0.2s, background 0.2s;
}
/* The source file, spelled as a file: mono, mixed case, no tracking — the one
   place on the card that names the thing the drawing was compiled from. */
.card__open-file {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__open-cta {
  flex: none;
  color: var(--redline-ink);
  white-space: nowrap;
}
.card__open:hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--redline) 7%, transparent);
}
.card__open:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .card__open {
    transition: none;
  }
}
</style>
