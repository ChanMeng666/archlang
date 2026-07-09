<script setup lang="ts">
// The five features as drafting-sheet cards. Each card is a sheet: a numbered
// title block (A-101 … A-105), a header that shows either a real compiled
// artifact (an example plan's SVG) or a 45° poché-hatch band for the two
// conceptual sheets, then the specification copy. Rows are separated by a
// dimension line — the drawing detail that says "this is a measured document".
interface Sheet {
  no: string;
  tag: string;
  title: string;
  body: string;
  art?: string; // /examples/<name>.svg — a real compiled drawing
}

const row1: Sheet[] = [
  {
    no: "A-101",
    tag: "Principle",
    title: "Deterministic by design",
    body:
      "The same source always compiles to byte-identical output — no clocks, no randomness, no I/O. Every loop, conditional and function is evaluated as the drawing is built.",
  },
  {
    no: "A-102",
    tag: "Principle",
    title: "Zero-dependency core",
    body:
      "The default SVG path pulls no runtime dependencies. Optional power — PNG raster, vector PDF, angled-wall geometry — loads lazily and is never required.",
  },
  {
    no: "A-103",
    tag: "Output",
    title: "Professional CAD output",
    body:
      "Layers, line weights, wall poché, openings that void walls, real fixture symbols, dimensions, a north arrow, scale bar and a title block. Export to SVG, DXF, PDF or PNG.",
    art: "/examples/studio.svg",
  },
];

const row2: Sheet[] = [
  {
    no: "A-104",
    tag: "Scripting",
    title: "Parametric & scriptable",
    body:
      "Values, arithmetic, arrays, for / if / while and pure functions — plus relational placement (right-of / below / …) resolved by deterministic topological arithmetic.",
    art: "/examples/parametric.svg",
  },
  {
    no: "A-105",
    tag: "Read-back",
    title: "Reads its own plans",
    body:
      "describe() returns rooms, areas, adjacency, an access graph and circulation facts; lint() flags habitability problems — image-free, so an agent can verify intent without an image.",
    art: "/examples/two-bed.svg",
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
      <span class="dimdiv__label">Features · Sheets A-101 — A-105</span>
      <span class="dimdiv__line" />
      <span class="dimdiv__tick" />
    </div>

    <div class="sheets__row sheets__row--3">
      <article v-for="s in row1" :key="s.no" class="card">
        <div class="card__art" :class="{ 'card__art--poche': !s.art }">
          <img v-if="s.art" :src="s.art" :alt="`${s.title} — a compiled ArchLang floor plan`" loading="lazy" />
        </div>
        <div class="card__meta">
          <span class="card__no">{{ s.no }}</span>
          <span class="card__tag">{{ s.tag }}</span>
        </div>
        <h3 class="card__title">{{ s.title }}</h3>
        <p class="card__body">{{ s.body }}</p>
      </article>
    </div>

    <div class="dimdiv dimdiv--inner" role="presentation">
      <span class="dimdiv__tick" />
      <span class="dimdiv__line" />
      <span class="dimdiv__tick" />
    </div>

    <div class="sheets__row sheets__row--2">
      <article v-for="s in row2" :key="s.no" class="card">
        <div class="card__art" :class="{ 'card__art--poche': !s.art }">
          <img v-if="s.art" :src="s.art" :alt="`${s.title} — a compiled ArchLang floor plan`" loading="lazy" />
        </div>
        <div class="card__meta">
          <span class="card__no">{{ s.no }}</span>
          <span class="card__tag">{{ s.tag }}</span>
        </div>
        <h3 class="card__title">{{ s.title }}</h3>
        <p class="card__body">{{ s.body }}</p>
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
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 11px;
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
</style>
