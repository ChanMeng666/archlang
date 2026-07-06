<script setup lang="ts">
// A compact, live-editable ArchLang example: an editor bound to the zero-dep core
// `compile()` → inline SVG. SSR-safe (compile is isomorphic) so no-JS visitors still
// get the rendered plan in static HTML; hydration makes it editable. Kept
// dependency-light on purpose — a styled <textarea>, no CodeMirror.
import { ref, computed, onMounted, useSlots } from "vue";
import { compile, describe } from "archlang";

// `src` — plain-text source (explicit `<ArchLive src="…"/>` usage).
// `b64` — base64(UTF-8) source, injected by the ```arch fence rule in
// .vitepress/config.ts (avoids HTML-attribute / Vue-mustache escaping of raw
// multi-line source). Exactly one is supplied; `b64` wins when present.
const props = defineProps<{ src?: string; b64?: string; rows?: number }>();

// Isomorphic base64(UTF-8) decode (atob + TextDecoder exist in Node 18+ and the
// browser), so the initial source is ready during SSR and on the client alike.
function decodeB64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const source = ref((props.b64 ? decodeB64(props.b64) : (props.src ?? "")).trim());

// When the fence rule injects a `#fallback` slot (the Shiki-highlighted <pre>),
// show it during SSR and initial hydration, then swap to the live editor once
// mounted — so the source stays readable with no JS and there is no hydration
// mismatch. Explicit `<ArchLive src=…/>` usages have no fallback slot and keep
// their original behaviour (live, SSR-rendered SVG) unchanged.
const slots = useSlots();
const hasFallback = computed(() => !!slots.fallback);
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const result = computed(() => compile(source.value, { noCache: true }));
const svg = computed(() => (result.value.errors.length ? "" : result.value.svg));
const errorMsg = computed(() =>
  result.value.errors.length ? result.value.errors[0].message : "",
);
const facts = computed(() => {
  if (result.value.errors.length) return null;
  try {
    const t = describe(source.value, { noCache: true }).totals;
    return t ? `${t.rooms} rooms · ${t.doors} doors · ${t.windows} windows · ${t.floor_area_m2} m²` : null;
  } catch {
    return null;
  }
});

// base64url(deflate-raw(utf8)) — the playground's `#z=` share scheme (duplicated
// here so docs stay self-contained; ~byte-identical to playground/src/share.js).
async function playgroundUrl(): Promise<string> {
  const base = "https://archlang-playground.vercel.app/";
  const utf8 = new TextEncoder().encode(source.value);
  try {
    if (typeof CompressionStream !== "undefined") {
      const w = new CompressionStream("deflate-raw");
      const writer = w.writable.getWriter();
      writer.write(utf8);
      writer.close();
      const bytes = new Uint8Array(await new Response(w.readable).arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `${base}#z=${b64}`;
    }
  } catch {
    /* fall through */
  }
  let bin = "";
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
  return `${base}#src=${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

async function openInPlayground() {
  window.open(await playgroundUrl(), "_blank", "noopener");
}
</script>

<template>
  <!-- No-JS / SSR fallback: the Shiki-highlighted source, swapped for the live
       editor on mount. The fence rule wraps the slot content in its own `v-pre`
       div so Vue never interpolates the raw Shiki HTML. -->
  <div v-if="hasFallback && !mounted" class="archlive-fallback"><slot name="fallback" /></div>
  <div v-else class="archlive">
    <div class="archlive-editor">
      <textarea
        v-model="source"
        :rows="rows ?? 12"
        spellcheck="false"
        aria-label="ArchLang source (editable)"
      ></textarea>
    </div>
    <div class="archlive-preview">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="svg" class="archlive-svg" v-html="svg"></div>
      <div v-else class="archlive-error">{{ errorMsg }}</div>
      <div class="archlive-bar">
        <span class="archlive-facts">{{ facts ?? "—" }}</span>
        <button type="button" class="archlive-open" @click="openInPlayground">
          Open in Playground ↗
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The SSR/no-JS fallback wrapper carries the same vertical rhythm as the live
   widget so the swap-on-mount doesn't shift surrounding content. */
.archlive-fallback { margin: 18px 0; }
.archlive {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  overflow: hidden;
  margin: 18px 0;
  background: var(--vp-c-bg-soft);
}
.archlive-editor { min-width: 0; border-right: 1px solid var(--vp-c-border); }
.archlive-editor textarea {
  width: 100%;
  height: 100%;
  min-height: 220px;
  border: 0;
  resize: vertical;
  padding: 12px 14px;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  outline: none;
}
.archlive-preview { min-width: 0; display: flex; flex-direction: column; }
.archlive-svg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  overflow: auto;
  background:
    repeating-conic-gradient(var(--vp-c-bg-soft) 0% 25%, var(--vp-c-bg) 0% 50%) 50% / 20px 20px;
}
.archlive-svg :deep(svg) { max-width: 100%; height: auto; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1); }
.archlive-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-danger-1);
  text-align: center;
}
.archlive-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  border-top: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
}
.archlive-facts { font-family: var(--vp-font-family-mono); font-size: 11.5px; color: var(--vp-c-text-2); }
.archlive-open {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 9999px;
  color: var(--vp-c-brand-1);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}
.archlive-open:hover { background: var(--vp-c-brand-soft); }
@media (max-width: 720px) {
  .archlive { grid-template-columns: 1fr; }
  .archlive-editor { border-right: 0; border-bottom: 1px solid var(--vp-c-border); }
}
</style>
