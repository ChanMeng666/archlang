<script setup lang="ts">
// The product film, behind a click. Until the visitor presses play the page loads nothing from
// YouTube (no iframe, no thumbnail): the poster is a compiled plan from this site, and the
// player is the privacy-enhanced youtube-nocookie.com embed, inserted on click. With no
// JavaScript the button is a plain link to the video. `privacy.md` says the same.
import { ref } from "vue";

/** The video id, typed once; site-markdown.mjs reads it from here for the /start.md copy. */
const FILM_ID = "RBcGF6X4esY";
const FILM_TITLE = "ArchLang — a language that compiles to dimensioned floor plans";

const watch = `https://youtu.be/${FILM_ID}`;
const embed = `https://www.youtube-nocookie.com/embed/${FILM_ID}?autoplay=1&rel=0`;
const playing = ref(false);

defineProps<{ poster: string }>();
</script>

<template>
  <figure class="film">
    <div class="film__frame">
      <iframe
        v-if="playing"
        :src="embed"
        :title="FILM_TITLE"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
      <a
        v-else
        class="film__facade"
        :href="watch"
        target="_blank"
        rel="noopener"
        :aria-label="`Play the film: ${FILM_TITLE} (YouTube)`"
        @click.prevent="playing = true"
      >
        <img :src="poster" alt="" loading="lazy" decoding="async" />
        <span class="film__play" aria-hidden="true">▶</span>
      </a>
    </div>
    <figcaption class="film__cap">
      {{ FILM_TITLE }} ·
      <a :href="watch" target="_blank" rel="noopener">watch on YouTube&nbsp;↗</a>
      · the player loads from YouTube when you press play.
    </figcaption>
  </figure>
</template>

<style scoped>
.film {
  margin: 16px 0;
}
.film__frame {
  position: relative;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--paper);
  overflow: hidden;
}
.film__frame iframe,
.film__facade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.film__facade {
  display: flex;
  align-items: center;
  justify-content: center;
}
.film__facade img {
  position: absolute;
  inset: 8%;
  width: 84%;
  height: 84%;
  object-fit: contain;
  opacity: 0.55;
}
.film__play {
  position: relative;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--redline-ink);
  color: #fff;
  font-size: 26px;
  padding-left: 5px;
}
.film__facade:hover .film__play {
  background: var(--redline);
}
.film__facade:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: -4px;
}
.film__cap {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ink-muted);
}
</style>
