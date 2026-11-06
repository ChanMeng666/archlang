<script setup lang="ts">
// The band right after the hero (public-surfaces card X6, PS-D12): one plan's drawing beside its
// 3D preview's drafting-order replay, from the same source. The words are the package's own
// (PREVIEW: `PREVIEW_LEAD`, `PREVIEW_LABEL`, `PREVIEW_LIMITS`), and the plan, its poster, replay
// and playground link all come from one ASSETS_3D entry, which sync-docs.mjs builds from
// public/3d/manifest.json; nothing here names a file. site-markdown.mjs renders the same band for
// the raw /index.md.
//
// The replay is poster-first: the poster is a lazy <picture> (WebP, PNG fallback) over a
// `preload="none"` video, and the MP4 loads when the band is at least half in view, where it plays
// muted, and pauses when it leaves. Under reduced motion, or with Save-Data on, it never starts by
// itself (the MP4 loads only when the play button is pressed): the poster stays, with the button.
// The video carries no `poster` attribute, because a browser fetches that eagerly. A video that
// cannot play (no decoder, a failed load) leaves the poster in place with a link to the MP4.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ASSETS_3D, HOME_3D_PLAN, PREVIEW } from "./three-d-data.js";

const PLAN = ASSETS_3D.find((a) => a.name === HOME_3D_PLAN)!;
// sync-docs refuses a home plan without a replay, so the band always has one.
const VIDEO = PLAN.video!;

const frame = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
/** A frame has played: from then on the video shows its own frame, paused or not. */
const started = ref(false);
const playing = ref(false);
const ended = ref(false);
/** The video cannot play here: the poster stays, and the link to the MP4 shows. */
const failed = ref(false);
/** The visitor paused it: scrolling back into view does not start it again. */
let held = false;
let observer: IntersectionObserver | null = null;

/** `poster` until a frame has played, then `playing`, `paused` or `ended`; `failed` for good. */
const state = computed(() =>
  failed.value
    ? "failed"
    : !started.value
      ? "poster"
      : playing.value
        ? "playing"
        : ended.value
          ? "ended"
          : "paused",
);
const buttonLabel = computed(() =>
  playing.value ? "Pause the replay" : ended.value ? "Play the replay again" : "Play the replay",
);

async function play(): Promise<void> {
  const v = video.value;
  if (!v || failed.value) return;
  try {
    await v.play();
  } catch (e) {
    // An AbortError is our own pause() (the band left the view before the play began), and a
    // NotAllowedError a blocked autoplay: the button still offers it. Anything else cannot play.
    const name = (e as { name?: string }).name;
    if (name !== "AbortError" && name !== "NotAllowedError") failed.value = true;
  }
}

function toggle(): void {
  const v = video.value;
  if (!v) return;
  if (!v.paused) {
    held = true;
    v.pause();
  } else {
    held = false;
    void play();
  }
}

onMounted(() => {
  const v = video.value;
  if (!v) return;
  v.addEventListener("playing", () => {
    started.value = true;
    playing.value = true;
    ended.value = false;
  });
  v.addEventListener("pause", () => (playing.value = false));
  v.addEventListener("ended", () => {
    playing.value = false;
    ended.value = true;
  });
  v.addEventListener("error", () => {
    playing.value = false;
    failed.value = true;
  });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  observer = new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      if (e.intersectionRatio >= 0.5) {
        // Never under reduced motion or Save-Data; a replay the visitor paused or watched to the
        // end stays where it is.
        if (!reduced && !saveData && !held && !ended.value && v.paused) void play();
      } else if (!v.paused) {
        // Playing, or a play() still pending: either way it stops once the band leaves.
        v.pause();
      }
    },
    { threshold: [0, 0.5] },
  );
  if (frame.value) observer.observe(frame.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="same-source" aria-labelledby="same-source-title">
    <div class="same-source__inner">
      <h2 id="same-source-title" class="same-source__title">{{ PREVIEW.title }}</h2>
      <p class="same-source__lede">{{ PREVIEW.rest }}</p>
      <div class="same-source__pair">
        <figure class="same-source__fig same-source__fig--plan">
          <div class="same-source__frame">
            <img
              :src="`/examples/${PLAN.name}.svg`"
              :alt="`The plan: ${PLAN.name}.arch, compiled to SVG.`"
              loading="lazy"
              decoding="async"
            />
          </div>
          <figcaption class="same-source__cap">The plan · {{ PLAN.name }}.arch</figcaption>
        </figure>
        <figure class="same-source__fig same-source__fig--3d" :data-state="state">
          <div ref="frame" class="same-source__frame same-source__frame--video">
            <video
              ref="video"
              class="same-source__video"
              muted
              playsinline
              preload="none"
              :src="VIDEO.mp4"
              :width="VIDEO.width"
              :height="VIDEO.height"
              :aria-label="`The drafting-order replay of ${PLAN.name}.arch: the plan draws itself, then rises into the 3D preview.`"
            ></video>
            <picture class="same-source__poster">
              <source :srcset="PLAN.poster.webp" type="image/webp" />
              <img
                :src="PLAN.poster.png"
                :width="PLAN.poster.width"
                :height="PLAN.poster.height"
                :alt="`The 3D preview of ${PLAN.name}.arch, from the same source as the plan.`"
                loading="lazy"
                decoding="async"
              />
            </picture>
            <button
              v-if="!failed"
              type="button"
              class="same-source__toggle"
              :aria-label="buttonLabel"
              @click="toggle"
            >
              <span aria-hidden="true">{{ playing ? "❚❚" : "▶" }}</span>
            </button>
          </div>
          <figcaption class="same-source__cap">
            The 3D preview · its drafting-order replay<template v-if="failed">
              · <a class="same-source__mp4" :href="VIDEO.mp4">Play the replay (MP4)</a></template
            >
          </figcaption>
        </figure>
      </div>
      <p class="same-source__limits">{{ PREVIEW.limits }}</p>
      <p class="same-source__links">
        <a class="same-source__open plan-open" :href="PLAN.link3d" target="_blank" rel="noopener"
          >Try it in the playground →</a
        >
        ·
        <a href="/3d">What the 3D preview shows →</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.same-source {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.same-source__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.same-source__title {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 640;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--ink);
}
.same-source__lede {
  max-width: 72ch;
  margin: 8px 0 20px;
  font-size: 15.5px;
  line-height: 1.55;
  color: var(--ink);
}
.same-source__pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(14px, 2vw, 24px);
}
@media (max-width: 720px) {
  .same-source__pair {
    grid-template-columns: 1fr;
  }
}
.same-source__fig {
  margin: 0;
}
/* Both frames reserve their 16:9 box before anything loads, so nothing below them moves. */
.same-source__frame {
  position: relative;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--hairline);
  border-radius: 2px;
  background: var(--paper-panel);
  overflow: hidden;
}
.same-source__frame > img {
  display: block;
  width: 100%;
  height: 100%;
  padding: 10px;
  object-fit: contain;
}
.same-source__video,
.same-source__poster,
.same-source__poster img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* The poster covers the video until a frame has played (and for good when it cannot play); a
   paused replay shows its own frame. */
.same-source__fig--3d:not([data-state="poster"]):not([data-state="failed"]) .same-source__poster {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.same-source__toggle {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: var(--redline-ink);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
.same-source__toggle:hover {
  background: var(--redline);
}
.same-source__toggle:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: 2px;
}
.same-source__cap {
  margin: 6px 0 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-muted);
}
.same-source__limits {
  margin: 16px 0 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-muted);
}
.same-source__links {
  margin: 8px 0 0;
  font-size: 14.5px;
}
@media (prefers-reduced-motion: reduce) {
  .same-source__fig--3d:not([data-state="poster"]):not([data-state="failed"]) .same-source__poster {
    transition: none;
  }
}
</style>
