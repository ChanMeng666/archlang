<script setup lang="ts">
// How: three steps, then the doors card and the film. site-markdown.mjs reads STEPS for /index.md.
import DoorsCard from "./components/DoorsCard.vue";
import FilmFacade from "./components/FilmFacade.vue";
import { HOME } from "./home-data.js";

const STEPS = [
  {
    title: "Ask your AI",
    body: "Describe the plan in a sentence or a paragraph: the rooms, their sizes, what opens onto what.",
  },
  {
    title: "It writes ArchLang and checks it",
    body: "Your AI writes a short text file, compiles it, reads the areas and messages the compiler returns, and fixes what they point at.",
  },
  {
    title: "SVG, PDF, DXF or PNG",
    body: "A dimensioned drawing in SVG, PDF or DXF, or PNG with one optional download; the same text gives the same file every time.",
  },
] as const;
</script>

<template>
  <section class="how" aria-labelledby="how-title">
    <div class="how__inner">
      <h2 id="how-title" class="how__title">How it works</h2>
      <ol class="how__steps">
        <li v-for="(s, i) in STEPS" :key="s.title" class="how__step">
          <span class="how__no" aria-hidden="true">{{ i + 1 }}</span>
          <h3 class="how__step-title">{{ s.title }}</h3>
          <p class="how__step-body">{{ s.body }}</p>
        </li>
      </ol>
      <div class="how__doors">
        <DoorsCard />
        <FilmFacade :poster="HOME.check.cleared" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.how {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.how__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.how__title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 640;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--ink);
}
.how__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(14px, 2vw, 24px);
  margin: 0 0 24px;
  padding: 0;
  list-style: none;
}
.how__step {
  margin: 0;
  padding: 0 0 0 44px;
  position: relative;
}
.how__no {
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--redline);
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--redline-ink);
}
.how__step-title {
  margin: 4px 0 4px;
  border: 0;
  padding: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--ink);
}
.how__step-body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--ink-muted);
}
.how__doors {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(20px, 3vw, 32px);
}
.how__doors :deep(.film) {
  width: 100%;
  max-width: 720px;
  margin: 0;
}
@media (max-width: 900px) {
  .how__steps {
    grid-template-columns: 1fr;
  }
}
</style>
