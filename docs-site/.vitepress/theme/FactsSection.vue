<script setup lang="ts">
// "Reads its own plans" — the SHEET world showing that ArchLang is not just a
// renderer: the same source that draws the plan (left) also answers questions
// about it (right). describe() returns a room schedule, areas, adjacency, an
// access graph and circulation facts as data — image-free — so an agent can
// verify intent without ever looking at a picture. Compiled at setup (compile is
// isomorphic) so the drawing and the schedule are in the SSR HTML.
import { compile, describe } from "archlang";

const SRC = `plan "Garden Loft" {
  units mm
  grid 50
  scale 1:50
  north up
  wall exterior  thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3600,0) (3600,4000) }
  room id=r_live at (0,0)    size 3600x4000 label "Living / Kitchen" uses living kitchen
  room id=r_bed  at (3600,0) size 2400x4000 label "Bedroom"         uses bedroom
  door id=d_main at (1800,0)    width 900 wall exterior  hinge left  swing in
  door id=d_bed  at (3600,1200) width 800 wall partition hinge right swing in
  window at (0,1500)    width 1200 wall exterior
  window at (6000,2600) width 1000 wall exterior
}`;

const svg = compile(SRC, { noCache: true }).svg;
const facts = describe(SRC, { noCache: true });
const rooms = facts.rooms;
const totals = facts.totals;
</script>

<template>
  <section class="facts">
   <div class="facts__inner">
    <div class="facts__intro">
      <p class="facts__eyebrow">describe() &amp; lint</p>
      <h2 class="facts__title">Reads its own plans</h2>
      <p class="facts__lede">
        A plan compiles to a drawing — and to <em>facts</em>. <code>describe()</code> returns rooms,
        areas, adjacency, a modelled access graph and circulation figures; <code>lint()</code> flags
        habitability and circulation problems. Both are image-free, so an agent can confirm what it
        drew without rendering a pixel.
      </p>
    </div>

    <div class="facts__split">
      <!-- The drawing -->
      <figure class="facts__plan">
        <figcaption class="facts__plan-cap">GARDEN LOFT · A-201 · SCALE 1:50</figcaption>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="facts__plan-svg" v-html="svg"></div>
      </figure>

      <!-- The schedule it derives from the same source -->
      <div class="facts__schedule">
        <div class="facts__schedule-head">
          <span>Room schedule</span>
          <span class="facts__schedule-src">← describe()</span>
        </div>
        <table class="schedule">
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col">Use</th>
              <th scope="col" class="num">Area</th>
              <th scope="col" class="num">Adj.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rooms" :key="r.id">
              <th scope="row">{{ r.label }}</th>
              <td class="use">{{ r.uses.join(", ") || "—" }}</td>
              <td class="num">{{ r.area_m2 }} m²</td>
              <td class="num">{{ r.adjacent.length }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td class="use">{{ totals.rooms }} rooms</td>
              <td class="num">{{ totals.floor_area_m2 }} m²</td>
              <td class="num">{{ totals.doors + totals.windows }}</td>
            </tr>
          </tfoot>
        </table>
        <p class="facts__foot">
          {{ totals.doors }} doors · {{ totals.windows }} windows ·
          {{ facts.access.hasEntrance ? "entrance verified" : "no entrance" }} ·
          every room reachable
        </p>
      </div>
    </div>
   </div>
  </section>
</template>

<style scoped>
.facts {
  padding-block: clamp(56px, 8vw, 104px);
}
.facts__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.facts__intro {
  max-width: 46rem;
}
.facts__eyebrow {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--redline-ink);
}
.facts__title {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 122;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: clamp(1.9rem, 3.6vw, 2.8rem);
  color: var(--ink);
}
.facts__lede {
  margin: 18px 0 0;
  font-family: var(--font-body);
  font-size: 1.02rem;
  line-height: 1.65;
  color: var(--ink-muted);
}
.facts__lede code {
  /* neutralise the .vp-doc inline-code chip in this branded section */
  font-family: var(--font-mono);
  font-size: 0.9em;
  color: var(--ink);
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.facts__split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(24px, 4vw, 48px);
  margin-top: clamp(32px, 5vw, 52px);
  align-items: start;
}
@media (max-width: 767px) {
  .facts__split {
    grid-template-columns: 1fr;
  }
}

/* ── The plan (a real sheet) ─────────────────────────────────────────────── */
.facts__plan {
  margin: 0;
  background: var(--paper-panel);
  border: 1px solid var(--hairline);
  box-shadow: 0 14px 34px -26px rgb(28 36 48 / 40%);
}
.facts__plan-cap {
  padding: 9px 14px;
  border-bottom: 1px solid var(--hairline);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.facts__plan-svg {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.facts__plan-svg :deep(svg) {
  width: 100%;
  height: auto;
  max-height: 420px;
}

/* ── The schedule ────────────────────────────────────────────────────────── */
.facts__schedule {
  min-width: 0;
}
.facts__schedule-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--ink);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 100;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
}
.facts__schedule-src {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--redline-ink);
}
.schedule {
  display: table; /* override .vp-doc table { display: block } */
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-family: var(--font-body);
}
.schedule tr {
  border: 0; /* override .vp-doc tr border-top */
}
.schedule thead tr,
.schedule tbody tr,
.schedule tfoot tr {
  background: transparent; /* override .vp-doc tr / tr:nth-child(2n) striping */
}
.schedule th,
.schedule td {
  padding: 9px 10px;
  border: 0; /* clear .vp-doc th,td 4-side box */
  border-bottom: 1px solid var(--hairline);
  background: transparent;
  text-align: left;
  font-size: 13.5px;
  line-height: 1.35;
}
.schedule thead th {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.schedule tbody th[scope="row"] {
  font-weight: 600;
  color: var(--ink);
}
.schedule .use {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-muted);
}
.schedule .num {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.schedule tfoot th,
.schedule tfoot td {
  border-bottom: 0;
  border-top: 2px solid var(--ink);
  font-weight: 600;
  color: var(--ink);
}
.facts__foot {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-muted);
}
</style>
