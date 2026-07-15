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
  const base = "https://playground.archlang.uk/";
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
      <span class="archlive-tab">SOURCE / .ARCH</span>
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
/* ArchLive — the compile boundary as a widget: a SOURCE-world editor (cool grey,
   plum caret) meeting a SHEET-world preview (drafting-grid paper) across a 2px
   plum seam. Both worlds are light (ADR 0014). Tokens come from the shared brand
   layer (style.css). */

/* The SSR/no-JS fallback wrapper carries the same vertical rhythm as the live
   widget so the swap-on-mount doesn't shift surrounding content. */
.archlive-fallback { margin: 18px 0; }
.archlive {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 0;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  overflow: hidden;
  margin: 18px 0;
  background: var(--src-bg);
}

/* ── SOURCE world: the cool-grey editor pane ───────────────────────────── */
.archlive-editor {
  position: relative;
  min-width: 0;
  /* the 2px seam: the compiler, drawn as a plum rule */
  border-right: 2px solid var(--plum);
  background: var(--src-surface);
}
.archlive-tab {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  padding: 3px 10px 4px;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 85;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--plum-deep);
  background: var(--src-bg);
  border-right: 1px solid var(--src-border);
  border-bottom: 1px solid var(--src-border);
  border-radius: 0 0 3px 0;
  pointer-events: none;
}
.archlive-editor textarea {
  width: 100%;
  height: 100%;
  min-height: 220px;
  border: 0;
  resize: vertical;
  padding: 30px 14px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--src-fg);
  background: transparent;
  caret-color: var(--plum-deep);
  outline: none;
}
.archlive-editor textarea::selection { background: color-mix(in srgb, var(--plum) 22%, transparent); }
.archlive-editor textarea:focus-visible { box-shadow: inset 0 0 0 1px var(--plum); }

/* ── SHEET world: paper preview pane on a fine drafting grid ────────────── */
.archlive-preview { min-width: 0; display: flex; flex-direction: column; background: var(--paper); }
.archlive-svg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: auto;
  background:
    repeating-linear-gradient(0deg, var(--grid-line) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(90deg, var(--grid-line) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(0deg, var(--grid-line) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, var(--grid-line) 0 1px, transparent 1px 40px);
  background-color: var(--paper);
}
/* the compiled plan floats as a small sheet on the drafting grid */
.archlive-svg :deep(svg) {
  max-width: 100%;
  height: auto;
  background: #fff;
  border: 1px solid var(--hairline);
  box-shadow: 0 1px 6px rgb(28 36 48 / 12%);
}
.archlive-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--redline-ink);
  text-align: center;
}

/* ── micro title block ─────────────────────────────────────────────────── */
.archlive-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  border-top: 1px solid var(--hairline);
  background: var(--paper-panel);
}
.archlive-facts {
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-muted);
}
.archlive-open {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 90;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 4px 12px;
  border: 1px solid var(--redline);
  border-radius: 3px;
  color: var(--redline-ink);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;
}
.archlive-open:hover { background: color-mix(in srgb, var(--redline) 12%, transparent); }
.archlive-open:focus-visible { outline: 2px solid var(--redline); outline-offset: 2px; }

@media (max-width: 720px) {
  /* seam goes horizontal when stacked */
  .archlive { grid-template-columns: 1fr; }
  .archlive-editor { border-right: 0; border-bottom: 2px solid var(--plum); }
}
@media (prefers-reduced-motion: reduce) {
  .archlive-open { transition: none; }
}
</style>
