<script setup lang="ts">
// A compact, live-editable ArchLang example: an editor bound to the zero-dep core
// `compile()` → inline SVG. SSR-safe (compile is isomorphic) so no-JS visitors still
// get the rendered plan in static HTML; hydration makes it editable. Kept
// dependency-light on purpose — a styled <textarea> over a generated highlighter, no
// CodeMirror. The source pane is TWO layers in register: a coloured <pre> underneath and
// a transparent-text <textarea> on top, sharing every metric that can move a glyph. That
// is what makes the code readable AND editable without shipping an editor.
import { ref, computed, onMounted, useSlots } from "vue";
import { compile, describe } from "archlang";
// The tokenizer is GENERATED from src/grammar/tokens.ts by scripts/gen-grammars.ts, from
// the same tables as the VS Code grammar and the playground's CodeMirror mode — so this
// widget can never colour a keyword the parser doesn't have, or miss one it does.
import { highlightArch } from "../arch-highlight.js";

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
const errorMsg = computed(() => result.value.errors[0]?.message ?? "");
const facts = computed(() => {
  if (result.value.errors.length) return null;
  try {
    // No `noCache`: `describe()` takes `DescribeOptions` (plugins/world/tolerance) and
    // has no result cache to bypass — it re-derives from `parse()`, whose memo is keyed
    // on the source text. The option was an ignored excess property (caught by vue-tsc).
    const t = describe(source.value).totals;
    return t ? `${t.rooms} rooms · ${t.doors} doors · ${t.windows} windows · ${t.floor_area_m2} m²` : null;
  } catch {
    return null;
  }
});

// ── The colour layer ─────────────────────────────────────────────────────────
// The <pre> under the textarea. The trailing newline keeps its last line box in step
// with the textarea's, which always reserves a line after a final break.
const highlighted = computed(() => `${highlightArch(source.value)}
`);

const preEl = ref<HTMLElement | null>(null);
const taEl = ref<HTMLTextAreaElement | null>(null);

/** The <pre> has `overflow: hidden` and is scrolled from the textarea it sits under. */
function syncScroll(): void {
  const pre = preEl.value;
  const ta = taEl.value;
  if (pre && ta) {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }
}

// base64url(deflate-raw(utf8)) — the playground's `#z=` share scheme (duplicated
// here so docs stay self-contained; ~byte-identical to playground/src/share.js).
//
// TWO CONSTRAINTS ON EDITS HERE. (1) test/share-codec.test.ts extracts this body by
// its `async function playgroundUrl` anchor and runs it through `new Function`, so it
// must stay PLAIN JS — no `as`, no `!`, no type annotations inside. (2) the docs E2E
// (`docs-site/e2e/archlive.spec.ts`) decodes the button's real href through
// `playground/src/share.ts`, so the scheme is checked at runtime too. The byte loops
// are `for…of` rather than indexed precisely because that satisfies
// `noUncheckedIndexedAccess` without TS-only syntax.
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
      for (const b of bytes) bin += String.fromCharCode(b);
      const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `${base}#z=${b64}`;
    }
  } catch {
    /* fall through */
  }
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
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
      <div class="archlive-code">
        <!-- The colour layer. aria-hidden because the textarea beside it exposes the
             same text — a screen reader must not read the source twice. The v-html
             goes on <code>, not <pre>, so no HTML-parsing rule can eat a leading
             newline. Everything highlightArch emits is escaped. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <pre ref="preEl" class="archlive-hl" aria-hidden="true"><code v-html="highlighted"></code></pre>
        <textarea
          ref="taEl"
          v-model="source"
          :rows="rows ?? 12"
          spellcheck="false"
          aria-label="ArchLang source (editable)"
          @scroll="syncScroll"
        ></textarea>
      </div>
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
  z-index: 2; /* above BOTH layers of .archlive-code (the textarea is z-index 1) */
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
/* ── The two-layer source pane ──────────────────────────────────────────────
   A coloured <pre> underneath, a transparent-text <textarea> on top. The
   TEXTAREA stays in flow so `:rows` still sizes the pane (examples.md asks for
   up to 30); the <pre> is absolutely positioned behind it. The inverse — the
   arrangement most "highlighted textarea" recipes use — would collapse every
   :rows to min-height, because an absolutely-positioned box contributes no
   intrinsic height.

   EVERY metric below that can move a glyph is declared on BOTH boxes. A one-
   pixel divergence in padding, size, leading or wrap behaviour shows up as
   coloured text sliding out from under the caret. */
.archlive-code {
  position: relative;
  /* The grabber moves off the textarea onto the WRAPPER, so a drag can never
     leave the two layers at different heights. `resize` needs a non-visible
     overflow to apply. */
  resize: vertical;
  overflow: hidden;
}
.archlive-code > pre,
.archlive-code > textarea {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  padding: 30px 14px 12px; /* 30px top clears the absolutely-placed SOURCE/.ARCH chip */
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  letter-spacing: normal;
  font-variant-ligatures: none;
  tab-size: 2;
  /* Identical wrapping, or a soft break lands on a different word in each layer.
     These are the textarea's UA defaults, restated on both so no engine disagrees. */
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  background: transparent;
}
.archlive-code > pre {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden; /* scrolled from the textarea's @scroll */
  pointer-events: none;
  color: var(--src-fg); /* the ground colour for anything the tokenizer leaves plain */
}
.archlive-code > textarea {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 220px;
  resize: none;
  color: transparent;
  -webkit-text-fill-color: transparent; /* Safari honours this over `color` */
  caret-color: var(--plum-deep);
  outline: none;
  /* No visible scrollbar: one would narrow the textarea's CONTENT box and re-wrap
     its text under a <pre> that has none — the classic overlay misregistration.
     CompileSeam's .code-pre hides its scrollbar for the same reason. The pane is a
     focusable textarea, so wheel and keyboard still scroll it. */
  overflow: auto;
  scrollbar-width: none;
}
.archlive-code > textarea::-webkit-scrollbar { display: none; }
.archlive-code > textarea::selection {
  background: color-mix(in srgb, var(--plum) 22%, transparent);
  -webkit-text-fill-color: transparent; /* stay invisible while selected, so the <pre> shows through */
}
.archlive-code > textarea:focus-visible { box-shadow: inset 0 0 0 1px var(--plum); }

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
