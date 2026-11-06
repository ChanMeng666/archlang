<script setup lang="ts">
// The home gallery: six furnished plans from examples/, each drawing a door into the playground.
// The drawing, the link and the facts line all derive from the one `example` name, so a card
// cannot show one plan and open another (homepage-links.spec.ts decodes every link). Captions are
// plain words, at most 20 (test/docs-home-copy.test.ts). These are the language's own examples:
// the showcase's fan studies never appear here.
//
// A card whose plan has a 3D preview in public/3d/manifest.json (ASSETS_3D, card X6) swaps its
// drawing for the preview's poster on hover or focus of its link, and its "3D" badge toggles the
// swap for a tap or a key. The drawing stays the card's picture; the poster lies over it, lazy.
// When any card has a poster, the limits line (PS-D12, `PREVIEW_LIMITS`) sits under the grid.
import { reactive } from "vue";
import { EXAMPLE_LINKS } from "./examples-data.js";
import { EXAMPLE_FACTS } from "./home-data.js";
import { ASSETS_3D, PREVIEW } from "./three-d-data.js";

type ExampleName = keyof typeof EXAMPLE_LINKS;
type Poster = (typeof ASSETS_3D)[number]["poster"];

const POSTERS: ReadonlyMap<string, Poster> = new Map(ASSETS_3D.map((a) => [a.name, a.poster]));
/** The cards whose badge is pressed. */
const shown = reactive<Record<string, boolean>>({});

const PLANS: ReadonlyArray<{ example: ExampleName; caption: string }> = [
  { example: "furnished-flat", caption: "A two-bedroom flat with every room furnished, each piece standing against its wall." },
  { example: "bungalow", caption: "A suburban bungalow with the street to the south and the garden to the north." },
  { example: "courtyard-house", caption: "A single-storey house whose rooms ring an open courtyard." },
  { example: "hillside-villa", caption: "The ground floor of a two-storey villa with an attached garage." },
  { example: "corner-cafe", caption: "A neighbourhood cafe: a dining room for eighteen, a servery, a kitchen, a store and a WC." },
  { example: "library", caption: "A public library around a circular reading room, issued with its room schedule and legend." },
];
</script>

<template>
  <section class="home-gallery" aria-labelledby="home-gallery-title">
    <div class="home-gallery__inner">
      <h2 id="home-gallery-title" class="home-gallery__title">Plans written in ArchLang</h2>
      <p class="home-gallery__note">
        Selected examples, not a benchmark. Every one is a text file in the repository;
        <a href="/examples">all the examples</a> · <a href="/gallery">plans written by AI agents</a>.
      </p>
      <ul class="home-gallery__grid">
        <li v-for="p in PLANS" :key="p.example" class="home-gallery__item">
          <div class="home-gallery__card" :data-show="shown[p.example] ? '3d' : 'plan'">
            <a class="home-gallery__open plan-open" :href="EXAMPLE_LINKS[p.example]" target="_blank" rel="noopener">
              <span class="home-gallery__art">
                <img data-role="plan" :src="`/examples/${p.example}.svg`" :alt="`${p.caption} Compiled from ${p.example}.arch.`" loading="lazy" />
                <picture
                  v-if="POSTERS.get(p.example)"
                  class="home-gallery__3d"
                  :aria-hidden="shown[p.example] ? undefined : 'true'"
                >
                  <source :srcset="POSTERS.get(p.example)?.webp" type="image/webp" />
                  <img
                    :src="POSTERS.get(p.example)?.png"
                    :width="POSTERS.get(p.example)?.width"
                    :height="POSTERS.get(p.example)?.height"
                    :alt="`The 3D preview of ${p.example}.arch, from the same source.`"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </span>
              <span class="home-gallery__cta">Open in playground&nbsp;↗</span>
            </a>
            <button
              v-if="POSTERS.get(p.example)"
              type="button"
              class="home-gallery__badge"
              :aria-pressed="shown[p.example] ? 'true' : 'false'"
              :aria-label="`Show the 3D preview of ${p.example}.arch`"
              @click="shown[p.example] = !shown[p.example]"
            >
              3D
            </button>
          </div>
          <p class="home-gallery__cap">{{ p.caption }}</p>
          <p class="home-gallery__facts">
            {{ p.example }}.arch · {{ EXAMPLE_FACTS[p.example].rooms }} rooms ·
            {{ EXAMPLE_FACTS[p.example].floor_area_m2 }} m²
          </p>
        </li>
      </ul>
      <p v-if="PLANS.some((p) => POSTERS.has(p.example))" class="home-gallery__limits">{{ PREVIEW.limits }}</p>
    </div>
  </section>
</template>

<style scoped>
.home-gallery {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.home-gallery__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.home-gallery__title {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 640;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--ink);
}
.home-gallery__note {
  margin: 8px 0 20px;
  font-size: 14px;
  color: var(--ink-muted);
}
.home-gallery__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(14px, 2vw, 24px);
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (max-width: 900px) {
  .home-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .home-gallery__grid {
    grid-template-columns: 1fr;
  }
}
.home-gallery__item {
  margin: 0;
}
.home-gallery__open {
  position: relative;
  display: block;
  border: 1px solid var(--hairline);
  border-radius: 2px;
  background: var(--paper-panel);
  text-decoration: none;
  transition: border-color 0.2s;
}
.home-gallery__open:hover {
  border-color: color-mix(in srgb, var(--redline) 45%, var(--hairline));
}
.home-gallery__open:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: 2px;
}
.home-gallery__card {
  position: relative;
}
.home-gallery__art {
  position: relative;
  display: block;
}
.home-gallery__art > img {
  display: block;
  width: 100%;
  height: 240px;
  padding: 10px;
  object-fit: contain;
}
/* The 3D poster lies over the drawing: shown on hover or focus of the card's link, or while the
   badge is pressed. */
.home-gallery__3d,
.home-gallery__3d img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.home-gallery__3d {
  background: var(--paper-panel);
  opacity: 0;
  transition: opacity 0.2s;
}
.home-gallery__open:hover .home-gallery__3d,
.home-gallery__open:focus-visible .home-gallery__3d,
.home-gallery__card[data-show="3d"] .home-gallery__3d {
  opacity: 1;
}
.home-gallery__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 44px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--hairline);
  border-radius: 2px;
  background: var(--paper);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 88;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--redline-ink);
  cursor: pointer;
}
.home-gallery__badge[aria-pressed="true"] {
  border-color: var(--redline-ink);
  background: var(--redline-ink);
  color: #fff;
}
.home-gallery__badge:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: 2px;
}
.home-gallery__cta {
  display: block;
  padding: 7px 12px;
  border-top: 1px solid var(--hairline);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 88;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--redline-ink);
}
.home-gallery__cap {
  margin: 8px 0 0;
  font-size: 14.5px;
  line-height: 1.45;
  color: var(--ink);
}
.home-gallery__limits {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-muted);
}
.home-gallery__facts {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-muted);
}
@media (prefers-reduced-motion: reduce) {
  .home-gallery__open,
  .home-gallery__3d {
    transition: none;
  }
}
</style>
