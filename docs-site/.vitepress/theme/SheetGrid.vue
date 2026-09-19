<script setup lang="ts">
// The feature gallery as drafting-sheet cards. Each card is a sheet: a numbered
// title block (A-101 … A-109), a header that shows a real compiled artifact (an
// example plan's SVG), then the specification copy. Rows are separated by a
// dimension line — the drawing detail that says "this is a measured document".
// (The card__art--poche 45° hatch fallback stays for any future art-less sheet;
// today every card carries a compiled drawing.)
//
// ONE CARD, ONE CAPABILITY. The old six carried three "principle" cards
// (deterministic / zero-dependency / reads its own plans) whose subject was the
// project rather than the language — and the last of them re-stated the FactsSection
// band immediately below it, while a second re-showed the hero's own plan. The
// principles now live inside the bodies of the cards that demonstrate them, and each
// sheet names exactly one thing the language does.
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

/** Which drawing OF `example` a card shows. Deliberately not a list of paths: every
 *  route is derived from the one `example` name by {@link artSrcs}, so there is no way
 *  to spell a card that pictures one plan and opens another.
 *  - absent — the plan's own drawing, `/examples/<name>.svg`
 *  - `{ levels }` — the per-storey pages a multi-storey plan compiles to (sync-docs.mjs
 *    writes them beside the whole-plan SVG, under the CLI's own `<stem>.L<n>` law)
 *  - `{ view }` — a committed axonometric render from `npm run gen:example-svgs` */
type Art = { levels: readonly number[] } | { view: "iso" | "axon" };

interface Sheet {
  no: string;
  tag: string;
  title: string;
  body: string;
  /** The plan this sheet SHOWS. Both the drawing and the playground link are derived
   *  from it, so a card cannot picture one plan and open another. Absent = an art-less
   *  sheet, which falls back to wall poché. */
  example?: ExampleName;
  art?: Art;
  /** One line under the body for a card whose drawing and whose link are not the same
   *  artifact — today only A-108, where the strip opens the PLAN and the picture comes
   *  from a flag. Saying so on the card is the honest version, and it teaches the flag. */
  hint?: string;
}

/** Every drawing a card shows: its site route and its OWN alt text, both derived from
 *  the one `example` name. The alt is per-drawing on purpose — three images captioned
 *  with one string tells a screen-reader user there are three of something and nothing
 *  about which storey is which. */
function artSrcs(s: Sheet): Array<{ src: string; alt: string }> {
  if (!s.example) return [];
  if (!s.art) return [{ src: `/examples/${s.example}.svg`, alt: `${s.title} — a compiled ArchLang floor plan` }];
  if ("view" in s.art) {
    return [
      {
        src: `/view/${s.example}-${s.art.view}.svg`,
        alt: `An axonometric view compiled from ${s.example}.arch — extruded walls with their openings cut`,
      },
    ];
  }
  const { levels } = s.art;
  return levels.map((n) => ({
    src: `/examples/${s.example}.L${n}.svg`,
    alt: `${s.example}.arch storey ${n} of ${levels.length} — a compiled ArchLang floor plan`,
  }));
}

/** Every figure below is `arch describe --json` on the file the card draws — never a
 *  number retyped from a doc. `docs-site/examples.md` is the long-form tour of the same
 *  plans; these are its headlines, one capability each. */
const showpiece: Sheet[] = [
  {
    no: "A-101",
    tag: "Showpiece",
    title: "The whole language on one sheet",
    body:
      "Two storeys, an attached garage, one A2 sheet at 1:50 — 11 rooms and 196.54 m² on the ground floor, nine rooms and 140.76 m² above. Nearly every sheet below appears here at once: site orientation, a polygon reading nook, an L-shaped master suite, an arc-bowed bay off the living room, all five door kinds, one stair shaft declared by a shared id on both level blocks, a void over the double-height living room, roof eaves, and a mirrored pair of ensuites placed from a single component. arch lint still raises three warnings, left in and named in the source — the honest cost of a real site, not a plan tuned to hide them.",
    example: "hillside-villa",
  },
];

/** A-102 takes a full-width band of its own. Three A3-PORTRAIT sheets across a 3-column
 *  card cap at ~100px each — narrower than the 150px box this redesign replaced, and the
 *  card's whole claim is that a reader can see one storey differing from another, which
 *  at 100px they cannot. The trio is WIDTH-bound, not height-bound, so a taller box buys
 *  nothing; only more horizontal room does. Full width takes each storey to ~263×372. */
const levels: Sheet[] = [
  {
    no: "A-102",
    tag: "Levels",
    title: "One storey is one drawing",
    body:
      "A plan written as level blocks compiles to a complete sheet per storey — three here, 4 rooms and 55.64 m² each, on a 5.2 × 10.7 m terrace footprint. arch compile writes townhouse.L1.svg, .L2.svg and .L3.svg; the three drawings above are those files. The stair is one object written three times: ids are unique within a level, so the same id=st on all three storeys is not a clash but the declaration that these are one shaft — and it is why the upper floors lint clean with no front door of their own.",
    example: "townhouse",
    art: { levels: [1, 2, 3] },
  },
];

/** The 3-column band. */
const row3: Sheet[] = [
  {
    no: "A-103",
    tag: "The sheet",
    title: "It issues a sheet, not a picture",
    body:
      "paper, scale, positioning axes, a room schedule, a legend and a title block — a 50 × 32 m public library on A2 landscape at 1:200, 14 rooms and 1545.06 m². Nothing in the margin is configured: the schedule's rows and total are the same numbers arch describe --json reports, and the legend lists one row per wall material actually used and one per placed fixture category that has a plan symbol. Add a seventh material and the table grows a row on its own.",
    example: "library",
  },
  {
    no: "A-104",
    tag: "Geometry",
    title: "Not only rectangles",
    body:
      "Polygon rooms measured by exact shoelace area, circular rooms measured as πR², and true arc wall edges — SVG A commands and native DXF arcs, never faceted at any zoom. Six trapezoid galleries ring a drum here: 7 rooms, 122.79 m², and a rotunda of exactly 28.27 m² inside a wall of arc edges on a radius of 3000. Nothing in this plan is rectangular, and the hexagon is irregular on purpose — a 3-4-5 shell lands every vertex on the 50 mm grid, where a regular one would measure 7504 and have to be called 7500.",
    example: "hexagon-pavilion",
  },
  {
    no: "A-105",
    tag: "Site",
    title: "Everything outside the wall line",
    body:
      "A lot line, ground materials, fences and a roof: 14 outdoor surfaces across eight kinds, two fence runs and a 484 m² lot around a house of 6 rooms and 136.5 m². Floor, ground and lot are three different numbers and the language keeps them apart — a terrace is not floor area, so a ground surface appears in no rooms[] entry, no schedule row and no access graph. Every hatch is scale-aware: the same pattern size on the sheet at 1:100 as it would be at 1:50.",
    example: "garden-house",
  },
];

/** The first 2-column band. */
const row4: Sheet[] = [
  {
    no: "A-106",
    tag: "Fixtures",
    title: "Symbols, not labelled boxes",
    body:
      "A WC with a cistern and a seat, a bed with a headboard and pillows, a washer told from a dryer by the chords across its drum — 39 pieces across 38 of the 83 catalogued families, in 7 rooms and 90.72 m². A drawn symbol ignores its label, so every word on this plan comes from a room; most pieces carry no size either, because against wall takes the catalogued footprint and derives the rotation from the wall. A fixture category is a catalogue row, never a keyword.",
    example: "furnished-flat",
  },
  {
    no: "A-107",
    tag: "Composition",
    title: "Write the unit, place the row",
    body:
      "Four terrace dwellings from one component — 16 rooms, 199.8 m², 16 doors and 18 windows across 22.2 × 9.6 m, written as component unit(w, d, gable) in its own coordinates and then four place statements with mirror x on alternate units. The offsets are a running sum over an array rather than typed coordinates, and an if inside the component puts a side window on the two free gables only. A pinned label is a point like any other, so the mirrored units get their mirrored label positions for free.",
    example: "terrace-row",
  },
];

/** The second 2-column band. */
const row5: Sheet[] = [
  {
    no: "A-108",
    tag: "Axonometric",
    title: "Heights are a datum, not a drawing",
    body:
      "A plan is a horizontal cut, so a height moves no byte of one: the datum is reported by arch describe --json --select heights and drawn nowhere. --view axon spends it on a picture instead — extruded walls with their doors and windows cut, floor plates, both storeys stacked. This plan authors no height, so the picture above stands on the default 3000 mm storey. It is illustrative and nothing measures it either way: describe() and lint() take no --view and never learn it exists, and the view carries no scale bar, no north arrow, no title block and no dimensions, because each of those would make a picture look issuable.",
    example: "two-storey",
    art: { view: "axon" },
    hint: "The strip below opens the plan, not this picture — for the picture, arch compile two-storey.arch --view axon",
  },
  {
    no: "A-109",
    tag: "Materials",
    title: "Poché is the specification",
    body:
      "On a real drawing the hatch inside a cut wall is the specification, and ArchLang spells it as one clause on wall: material poche, concrete, brick, insulation, tile or none. All six are here, each on the element a builder would actually detail that way — 300 mm concrete facades, a 230 mm brick gable with its courses turned along the wall, a 200 mm insulation leaf drawn as its own wall, tile on the WC partitions, none on the glazed screen — over 4 rooms and 128 m². style wall and style room restyle the inks without touching a coordinate, and the legend beside them is derived: one swatch per material actually used.",
    example: "materials",
  },
];

/** The page's bands, each with the grid it lays its cards on and the art-box height
 *  that grid earns them. Declared here rather than inline in the template so the card
 *  anatomy is written ONCE — when the rows were copy-pasted markup, a change to one
 *  row's card silently left the other row's behind. */
const BANDS: ReadonlyArray<{ rows: Sheet[]; row: string; art: string }> = [
  { rows: showpiece, row: "sheets__row--1", art: "card__art--full" },
  { rows: levels, row: "sheets__row--1", art: "card__art--full" },
  { rows: row3, row: "sheets__row--3", art: "card__art--trio" },
  { rows: row4, row: "sheets__row--2", art: "card__art--duo" },
  { rows: row5, row: "sheets__row--2", art: "card__art--duo" },
];
</script>

<template>
  <section class="sheets">
   <div class="sheets__inner">
    <!-- Dimension-line section divider -->
    <div class="dimdiv" role="presentation">
      <span class="dimdiv__tick" />
      <span class="dimdiv__line" />
      <h2 class="dimdiv__label">Features · Sheets A-101 — A-109</h2>
      <span class="dimdiv__line" />
      <span class="dimdiv__tick" />
    </div>

    <!-- One card per row band. The template is written once and driven by the row
         arrays + their art-box modifier, so a card's anatomy cannot drift between
         rows the way it did when the markup was copy-pasted per row. -->
    <template v-for="(band, i) in BANDS" :key="i">
      <div v-if="i > 0" class="dimdiv dimdiv--inner" role="presentation">
        <span class="dimdiv__tick" />
        <span class="dimdiv__line" />
        <span class="dimdiv__tick" />
      </div>

      <div class="sheets__row" :class="band.row">
        <article v-for="s in band.rows" :key="s.no" class="card">
          <div
            class="card__art"
            :class="[band.art, { 'card__art--poche': !s.example, 'card__art--multi': artSrcs(s).length > 1 }]"
          >
            <img
              v-for="a in artSrcs(s)"
              :key="a.src"
              :src="a.src"
              :alt="a.alt"
              loading="lazy"
            />
          </div>
          <div class="card__meta">
            <span class="card__no">{{ s.no }}</span>
            <span class="card__tag">{{ s.tag }}</span>
          </div>
          <h3 class="card__title">{{ s.title }}</h3>
          <p class="card__body">{{ s.body }}</p>
          <p v-if="s.hint" class="card__hint">{{ s.hint }}</p>
          <!-- The file name is VISIBLE, not just an aria-label: nine links reading only
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
    </template>
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
.sheets__row--1 {
  grid-template-columns: minmax(0, 1fr);
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

/* The art box is the card's whole reason to exist, and it used to be 150px tall for
   every sheet — which turned a 50 × 32 m library into a grey smudge. Each band now
   gets the height its drawings need, and `object-fit: contain` keeps every one of
   them un-cropped and un-stretched inside it. */
.card__art {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--hairline);
  background: var(--paper);
}
.card__art--full {
  height: 400px;
}
.card__art--trio {
  height: 230px;
}
.card__art--duo {
  height: 300px;
}
/* `width`/`height: 100%` rather than `max-*`: a compiled plan's SVG carries an
   intrinsic size in the low hundreds, so a `max-width` box lets it sit at that size
   and leave most of the sheet empty — the drawing has to be told to fill the box.
   `object-fit: contain` is what keeps that from distorting one: the plan letterboxes
   inside the box at its own aspect ratio, never cropped and never stretched. */
.card__art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* A multi-drawing sheet (A-102's three storeys) shares the box between its pages:
   each gets an equal share of the width and the full height, so three portrait
   sheets read as three drawings rather than one wide one. */
.card__art--multi img {
  min-width: 0;
  flex: 1 1 0;
}
.card__art--poche {
  /* 45° wall poché — the fill an architect hatches into a cut wall */
  background: repeating-linear-gradient(
    45deg,
    var(--paper) 0 7px,
    color-mix(in srgb, var(--hairline) 70%, transparent) 7px 8px
  );
}
@media (max-width: 560px) {
  /* One column: a card is now as wide as the page, so the 3-col height starves the
     drawing it finally has room for. */
  .card__art--trio,
  .card__art--duo {
    height: 300px;
  }
  .card__art--full {
    height: 320px;
  }
  /* A-102's three storeys STACK on a phone rather than staying three-across. Side by
     side inside a ~299px card they would be ~93px each — narrower than anywhere else on
     the page, and unreadable. Stacked, each storey gets the card's full width. The card
     grows tall, which on a phone costs a scroll; three illegible slivers cost the point
     of the card. `height: auto` releases the fixed box, so the column is as tall as the
     drawings need. */
  .card__art--multi {
    flex-direction: column;
    height: auto;
    gap: 14px;
  }
  .card__art--multi img {
    flex: none;
    width: 100%;
    /* …but not without a ceiling. Unbounded, a 560px-wide phone gives each storey a
       682px-tall drawing and a 2100px card — four screens of scrolling for one of nine
       sheets. Capping the width caps the height with it (these are A3 portrait), and
       narrower viewports are already under the cap, so 375px is unaffected. */
    max-width: 340px;
    height: auto;
    margin-inline: auto;
  }
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
/* The one line that says the drawing above and the link below are not the same
   artifact. Mono, because the half that matters is a command. */
.card__hint {
  margin: -8px 0 0;
  padding: 0 16px 18px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.55;
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
