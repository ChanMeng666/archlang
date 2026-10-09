<script setup lang="ts">
// One entry of the agent gallery (`/gallery`): the brief, who wrote the plan, the drawing,
// and the source behind it. Everything comes from `gallery-data.js`, which sync-docs.mjs
// generates from `docs/gallery/` — this component holds no plan of its own.
//
// The drawing is a pre-rendered `/gallery/<id>.svg` in a lazy <img>, and the source sits in a
// closed <details>. Nothing compiles in the reader's browser, so the page costs a phone one
// small HTML document plus the sheets it actually scrolls to.
import { computed } from "vue";
import { highlightArch } from "../arch-highlight.js";
import { GALLERY } from "../gallery-data.js";

const props = defineProps<{ id: string }>();

const plan = computed(() => GALLERY.find((p) => p.id === props.id));
const lines = computed(() => (plan.value ? plan.value.source.trimEnd().split("\n").length : 0));
const highlighted = computed(() => (plan.value ? highlightArch(plan.value.source.trimEnd()) : ""));
</script>

<template>
  <div v-if="plan" class="agent-plan">
    <p class="agent-plan-label">Brief</p>
    <blockquote class="agent-plan-brief">{{ plan.brief }}</blockquote>
    <p class="agent-plan-by">
      Written by <strong>{{ plan.model }}</strong>, then completed with <code>arch finish</code>.
    </p>
    <figure v-for="(sheet, i) in plan.sheets" :key="sheet.file" class="agent-plan-sheet">
      <a :href="`/gallery/${sheet.file}`" target="_blank" rel="noopener">
        <img
          :src="`/gallery/${sheet.file}`"
          :width="sheet.width"
          :height="sheet.height"
          :alt="
            plan.sheets.length > 1
              ? `${plan.title}: compiled floor plan, sheet ${i + 1} of ${plan.sheets.length}`
              : `${plan.title}: compiled floor plan`
          "
          loading="lazy"
          decoding="async"
        />
      </a>
      <figcaption v-if="plan.sheets.length > 1">Sheet {{ i + 1 }} of {{ plan.sheets.length }}, one per storey</figcaption>
    </figure>
    <details class="agent-plan-source">
      <summary>Source: {{ lines }} lines of ArchLang</summary>
      <!-- Everything highlightArch emits is escaped. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <pre><code v-html="highlighted"></code></pre>
    </details>
    <p class="agent-plan-links">
      <a :href="plan.link" target="_blank" rel="noopener">Open in Playground ↗</a>
      <a :href="`/gallery/${plan.id}.arch`">Raw source</a>
    </p>
  </div>
  <p v-else class="agent-plan-missing">No gallery plan named “{{ id }}”.</p>
</template>

<style scoped>
/* Sheet world throughout (paper, ink, hairlines); the source world appears only inside the
   opened <details>. Light only (ADR 0014); every colour is a token from style.css. */
.agent-plan {
  margin: 16px 0 40px;
}
.agent-plan-label {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 85;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.agent-plan-brief {
  margin: 0 0 12px;
  padding: 10px 14px;
  border-left: 2px solid var(--plum);
  background: var(--paper);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.6;
}
.agent-plan-by {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--ink-muted);
}
.agent-plan-by strong {
  color: var(--ink);
}
.agent-plan-sheet {
  margin: 0 0 12px;
  padding: 12px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--paper);
}
.agent-plan-sheet a {
  display: block;
}
/* The width/height attributes carry the sheet's aspect, so the box is reserved before the
   image loads; a portrait sheet is capped by the viewport instead of running off it. */
.agent-plan-sheet img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 85vh;
  margin: 0 auto;
  background: var(--paper-panel);
  border: 1px solid var(--hairline);
}
.agent-plan-sheet figcaption {
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-muted);
  text-align: center;
}
.agent-plan-source {
  margin: 0 0 10px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--paper-panel);
}
.agent-plan-source summary {
  padding: 9px 14px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--ink);
  cursor: pointer;
}
.agent-plan-source summary:focus-visible {
  outline: 2px solid var(--plum);
  outline-offset: -2px;
}
.agent-plan-source pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  border-top: 1px solid var(--hairline);
  background: var(--src-surface);
  color: var(--src-fg);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  tab-size: 2;
}
.agent-plan-source code {
  padding: 0;
  background: transparent;
  font-size: inherit;
  color: inherit;
}
.agent-plan-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  font-size: 14px;
}
.agent-plan-missing {
  color: var(--redline-ink);
}
</style>
