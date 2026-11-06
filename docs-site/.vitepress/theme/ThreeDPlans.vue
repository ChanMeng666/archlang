<script setup lang="ts">
// The /3d page's plans (public-surfaces card X6): every plan public/3d/manifest.json lists, each
// its drawing beside its 3D preview (PS-D12: paired, never instead). The list, the files and the
// playground links are ASSETS_3D, which sync-docs.mjs builds from the manifest, so a plan added to
// gen:3d-assets reaches this page with no edit here. site-markdown.mjs renders the same list for
// the raw /3d.md.
//
// Each replay is behind its poster: nothing of the video loads until the visitor presses play,
// and with no JavaScript the poster is a plain link to the MP4. "Play the replay (MP4)" stays under
// the frame: before the first press it plays in place, after it (or once the video has failed to
// play, which puts the poster back) it is a plain link to the file.
import { reactive } from "vue";
import { ASSETS_3D } from "./three-d-data.js";

/** Per plan: `video` once play was pressed, `failed` once that video could not play. */
const mode = reactive<Record<string, "video" | "failed">>({});

/** Play in place on the first press; after that, or after a failure, follow the link. */
function press(e: MouseEvent, name: string): void {
  if (mode[name] !== undefined) return;
  e.preventDefault();
  mode[name] = "video";
}
</script>

<template>
  <ul class="plans3d">
    <li v-for="a in ASSETS_3D" :key="a.name" class="plans3d__item">
      <h3 :id="`plan-${a.name}`" class="plans3d__name">{{ a.name }}.arch</h3>
      <div class="plans3d__pair">
        <figure class="plans3d__fig">
          <div class="plans3d__frame">
            <img :src="`/examples/${a.name}.svg`" :alt="`The plan: ${a.name}.arch, compiled to SVG.`" loading="lazy" decoding="async" />
          </div>
          <figcaption class="plans3d__cap">The plan{{ a.poster.storey ? `, storey ${a.poster.storey}` : "" }}</figcaption>
        </figure>
        <figure class="plans3d__fig">
          <div class="plans3d__frame">
            <video
              v-if="a.video && mode[a.name] === 'video'"
              class="plans3d__video"
              :src="a.video.mp4"
              :width="a.video.width"
              :height="a.video.height"
              controls
              autoplay
              muted
              playsinline
              :aria-label="`The drafting-order replay of ${a.name}.arch.`"
              @error="mode[a.name] = 'failed'"
            ></video>
            <a
              v-else-if="a.video"
              class="plans3d__facade"
              :href="a.video.mp4"
              :aria-label="`Play the replay of ${a.name}.arch`"
              @click="press($event, a.name)"
            >
              <picture>
                <source :srcset="a.poster.webp" type="image/webp" />
                <img
                  :src="a.poster.png"
                  :width="a.poster.width"
                  :height="a.poster.height"
                  :alt="`The 3D preview of ${a.name}.arch, from the same source as the plan.`"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <span class="plans3d__play" aria-hidden="true">▶</span>
            </a>
            <picture v-else>
              <source :srcset="a.poster.webp" type="image/webp" />
              <img
                :src="a.poster.png"
                :width="a.poster.width"
                :height="a.poster.height"
                :alt="`The 3D preview of ${a.name}.arch, from the same source as the plan.`"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <figcaption class="plans3d__cap">
            The 3D preview{{
              a.poster.storey
                ? `, storey ${a.poster.storey} on its own${a.video ? "; the replay assembles every storey" : ""}`
                : ""
            }}
          </figcaption>
        </figure>
      </div>
      <p class="plans3d__links">
        <template v-if="a.video"
          ><a class="plans3d__mp4" :href="a.video.mp4" @click="press($event, a.name)">Play the replay (MP4)</a> ·
        </template>
        <a :href="a.glb.href" :download="`${a.name}.glb`">Download GLB ({{ a.glbSize }})</a> ·
        <a :href="a.link3d" target="_blank" rel="noopener">Open in the playground (3D)</a> ·
        <a :href="`/examples/${a.name}.arch`">Plan source</a>
      </p>
    </li>
  </ul>
</template>

<style scoped>
.plans3d {
  display: grid;
  gap: 28px;
  margin: 20px 0;
  padding: 0;
  list-style: none;
}
.plans3d__item {
  margin: 0;
}
.plans3d__name {
  margin: 0 0 8px;
  padding: 0;
  border: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.plans3d__pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 640px) {
  .plans3d__pair {
    grid-template-columns: 1fr;
  }
}
.plans3d__fig {
  margin: 0;
}
/* Every frame reserves its 16:9 box before its picture loads. */
.plans3d__frame {
  position: relative;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--hairline);
  border-radius: 2px;
  background: var(--paper-panel);
  overflow: hidden;
}
.plans3d__frame > img,
.plans3d__video,
.plans3d__facade,
.plans3d__facade img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.plans3d__frame > img {
  padding: 8px;
}
.plans3d__facade {
  display: grid;
  place-items: center;
}
.plans3d__play {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--redline-ink);
  color: #fff;
  font-size: 20px;
  padding-left: 4px;
}
.plans3d__facade:hover .plans3d__play {
  background: var(--redline);
}
.plans3d__facade:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: -4px;
}
.plans3d__cap {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--ink-muted);
}
.plans3d__links {
  margin: 8px 0 0;
  font-size: 14px;
}
</style>
