<script setup lang="ts">
// The landing hero — "The Compile Boundary" made literal. A full-bleed stage
// split by a visible compile SEAM: a dark SOURCE world on the left where the
// canonical example (examples/studio.arch) types itself, and a warm SHEET world
// on the right where the compiled floor plan draws itself. The whole thing IS the
// thesis: source on one side, a professional drawing on the other, the compiler
// the rule between them.
//
// SSR & hydration: compile() is pure/isomorphic, so the server renders the FINAL
// state (fully-typed source + final SVG). The client only mutates AFTER mount —
// an IntersectionObserver rewinds to empty and replays the typing on a rAF loop,
// exactly once, and only when the hero is on-screen and motion is allowed.
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { compile } from "archlang";
import { EXAMPLES } from "./examples-data.js";

// The canonical example, already synced into examples-data.js by sync-docs.mjs
// (no `?raw` / fs.allow dependency). This is the source that types itself.
const raw: string = EXAMPLES.studio;

const ARCHCANVAS = "https://archcanvas.chanmeng.org";
const PLAYGROUND = "https://archlang-playground.vercel.app";

// ── The source text and its final compiled drawing (computed once, at setup,
//    so it exists during SSR and initial hydration alike). ──────────────────
const SPEED = 90; // characters/second — a calm, readable typing cadence
const finalResult = compile(raw, { noCache: true });
const finalSvg = finalResult.svg;

// Anti-CLS: reserve the paper stage at the final drawing's exact aspect ratio so
// the sheet never resizes as intermediate SVGs (different viewBoxes) swap in.
function aspectFromSvg(svg: string): string {
  const m = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/);
  if (m) {
    const w = Number(m[3]);
    const h = Number(m[4]);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "9648 / 10213.6"; // studio.arch fallback
}
const paperAspect = aspectFromSvg(finalSvg);

// ── Reactive display state — starts at the FINAL state for a hydration-safe
//    first render; the client rewinds it after mount. ────────────────────────
const typed = ref(raw);
const displaySvg = shallowRef(finalSvg);
const phase = ref<"settled" | "typing">("settled");
const mounted = ref(false);

// ── Minimal ArchLang syntax tint (source world → the shared --syn-* palette). A tiny
//    regex tokenizer, not a real parser: it re-highlights the visible prefix each
//    frame, which is cheap and looks alive mid-token. Deterministic → SSR-safe. */
const KEYWORDS = new Set(
  ("plan component let theme title style import for if while else set wall room " +
    "door window opening furniture dim column units grid scale north dims material " +
    "angle at size width thickness label hinge swing offset text close id project " +
    "drawn_by date from as below above align gap uses rotate against segment side " +
    "up down left right in out mm true false top middle bottom center auto " +
    "exterior partition living kitchen dining bedroom bath wc hall circulation " +
    "storage utility office entry").split(" "),
);
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function highlight(text: string): string {
  const re = /(#[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    if (m[1]) out += `<span class="t-cm">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="t-st">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="t-nu">${esc(m[3])}</span>`;
    else if (m[4]) out += KEYWORDS.has(m[4]) ? `<span class="t-kw">${esc(m[4])}</span>` : esc(m[4]);
    last = re.lastIndex;
  }
  out += esc(text.slice(last));
  return out;
}
const highlightedTyped = computed(() => highlight(typed.value));

// ── Line-end offsets: the byte index just past each newline. Compiling only when
//    a whole line completes keeps intermediate SVGs valid and holds compiles to
//    ≤1 per frame. ────────────────────────────────────────────────────────────
const lineEnds: number[] = (() => {
  const ends: number[] = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] === "\n") ends.push(i + 1);
  ends.push(raw.length);
  return ends;
})();

let rafId = 0;
let startTime = 0;
let nextLineEnd = 0;
let lastGoodSvg = "";
let hasRun = false;

function compileAt(end: number) {
  const prefix = raw.slice(0, end);
  const open = (prefix.match(/{/g) || []).length;
  const close = (prefix.match(/}/g) || []).length;
  const balanced = prefix + "\n" + "}".repeat(Math.max(0, open - close));
  const r = compile(balanced, { noCache: true });
  if (!r.errors.length && r.svg) {
    lastGoodSvg = r.svg;
    displaySvg.value = r.svg;
  }
}

function tick(now: number) {
  if (!startTime) startTime = now;
  const elapsed = (now - startTime) / 1000;
  const charIndex = Math.min(raw.length, Math.floor(elapsed * SPEED));
  typed.value = raw.slice(0, charIndex);

  // Advance past every line-end crossed this frame, but compile only the latest
  // (one compile per frame). Skips comment-only prefixes cheaply — they compile
  // to the same last-good drawing.
  let crossed = -1;
  while (nextLineEnd < lineEnds.length && charIndex >= lineEnds[nextLineEnd]) {
    crossed = lineEnds[nextLineEnd];
    nextLineEnd++;
  }
  if (crossed >= 0) compileAt(crossed);

  if (charIndex >= raw.length) {
    finish();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

function finish() {
  typed.value = raw;
  displaySvg.value = finalSvg;
  phase.value = "settled";
  // Settle to the top of the source (matches the SSR / reduced-motion state,
  // and reads as a code preview rather than a scrolled tail).
  if (preEl.value) preEl.value.scrollTop = 0;
}

function play() {
  cancelAnimationFrame(rafId);
  hasRun = true;
  startTime = 0;
  nextLineEnd = 0;
  lastGoodSvg = "";
  typed.value = "";
  displaySvg.value = "";
  phase.value = "typing";
  rafId = requestAnimationFrame(tick);
}

// Keep the typed source scrolled to the caret.
const preEl = ref<HTMLElement | null>(null);
watch(
  typed,
  () => {
    const el = preEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  { flush: "post" },
);

let observer: IntersectionObserver | null = null;
const rootEl = ref<HTMLElement | null>(null);

onMounted(() => {
  mounted.value = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return; // honour reduced motion — stay on the final, static state
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !hasRun) play();
      }
    },
    { threshold: 0.35 },
  );
  if (rootEl.value) observer.observe(rootEl.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  observer?.disconnect();
});
</script>

<template>
  <section ref="rootEl" class="seam-hero" aria-label="ArchLang — a declarative language that compiles to floor plans">
    <div class="seam-hero__stage">
      <!-- SOURCE WORLD -->
      <div class="pane pane--source">
        <div class="src-inner">
          <a class="eyebrow" :href="ARCHCANVAS" target="_blank" rel="noopener">
            <img class="eyebrow__mark" src="/brand/archlang-icon-plum.svg" alt="" width="20" height="20" />
            <span>Part of the ArchCanvas family</span>
            <span class="eyebrow__arrow" aria-hidden="true">↗</span>
          </a>

          <h1 class="headline">Designs that <span class="headline__accent">compile.</span></h1>

          <p class="tagline">
            A small declarative language that compiles to professional SVG floor plans.
            Zero-dependency, deterministic, isomorphic.
          </p>

          <div class="actions">
            <a class="btn btn--solid" href="/guide">Get started</a>
            <a class="btn btn--ghost" href="/reference">Language reference</a>
            <a class="btn btn--ghost" :href="PLAYGROUND" target="_blank" rel="noopener">Open playground&nbsp;↗</a>
          </div>

          <div class="code-stage" :data-phase="phase">
            <div class="code-chrome">
              <span class="code-chrome__file">studio.arch</span>
              <span class="code-chrome__status">{{ phase === "typing" ? "compiling" : "compiled" }}</span>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <pre ref="preEl" class="code-pre"><code v-html="highlightedTyped"></code><span v-if="phase === 'typing'" class="caret" aria-hidden="true"></span></pre>
          </div>
        </div>
      </div>

      <!-- THE SEAM -->
      <div class="seam" aria-hidden="true"></div>

      <!-- SHEET WORLD -->
      <div class="pane pane--sheet">
        <div class="sheet">
          <div class="sheet__title">
            <span>STUDIO 1BR</span><span>SHEET A-101</span><span>SCALE 1:50</span>
          </div>
          <div class="sheet__body" :style="{ aspectRatio: paperAspect }">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="sheet__svg" v-html="displaySvg"></div>
          </div>
          <button
            v-if="mounted"
            type="button"
            class="sheet__replay"
            :disabled="phase === 'typing'"
            @click="play"
          >
            ↻ Replay
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Full-bleed: .VPHome is already full-width, so the hero spans edge-to-edge and
   sits naturally below the (opaque) nav — no negative margins. */
.seam-hero {
  color: var(--src-fg);
  --seam-w: 3px;
}
.seam-hero__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--seam-w) minmax(0, 1fr);
  min-height: min(84vh, 780px);
}

/* ── Panes ──────────────────────────────────────────────────────────────── */
.pane {
  min-width: 0;
  display: flex;
}
.pane--source {
  background: var(--src-bg);
  padding: clamp(32px, 5vw, 72px) clamp(24px, 4vw, 60px);
  align-items: center;
  justify-content: flex-end;
}
.pane--sheet {
  background: var(--paper);
  /* two-tier drafting grid: 8px minor, 40px major */
  background-image:
    repeating-linear-gradient(to right, var(--grid-line) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to bottom, var(--grid-line) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to right, var(--grid-line) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(to bottom, var(--grid-line) 0 1px, transparent 1px 40px);
  padding: clamp(28px, 4vw, 56px) clamp(24px, 4vw, 60px);
  align-items: center;
  justify-content: flex-start;
}

.src-inner {
  width: 100%;
  max-width: 560px;
}

/* ── Eyebrow ─────────────────────────────────────────────────────────────── */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 8px;
  border: 1px solid var(--src-rule);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--src-muted);
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}
.eyebrow:hover {
  border-color: color-mix(in srgb, var(--plum) 60%, transparent);
  color: var(--src-fg);
}
.eyebrow__mark {
  display: block;
}
.eyebrow__arrow {
  color: var(--plum-deep);
}

/* ── Headline ────────────────────────────────────────────────────────────── */
.headline {
  margin: 26px 0 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 112;
  font-weight: 640;
  letter-spacing: -0.02em;
  line-height: 1.0;
  font-size: clamp(2.75rem, 6vw, 4.4rem);
  color: var(--src-fg);
}
.headline__accent {
  /* The headline clamps to ≥44px, so large-text 3:1 applies and the brand plum
     can finally appear at full saturation (4.1:1 on --src-bg). Body-size plum
     must still use --plum-deep. */
  color: var(--plum);
}

.tagline {
  margin: 20px 0 0;
  max-width: 30rem;
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--src-muted);
}

/* ── CTAs ────────────────────────────────────────────────────────────────── */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 3px;
  border: 1px solid transparent;
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 550;
  text-decoration: none;
  transition: transform 0.12s, background 0.2s, border-color 0.2s, color 0.2s;
}
.btn:active {
  transform: translateY(1px);
}
.btn--solid {
  /* white on --redline-ink = 6.5:1; hover lightens to the graphics redline, 5.4:1 */
  background: var(--redline-ink);
  color: #fff;
}
.btn--solid:hover {
  background: var(--redline);
}
.btn--ghost {
  /* a control edge, so --src-rule (3.2:1), not the decorative --src-border */
  border-color: var(--src-rule);
  color: var(--src-fg);
}
.btn--ghost:hover {
  border-color: var(--plum);
  color: var(--plum-deep);
}

/* ── Code stage (types itself) ───────────────────────────────────────────── */
.code-stage {
  margin-top: 34px;
  border: 1px solid var(--src-border);
  border-radius: 4px;
  background: var(--src-surface);
  overflow: hidden;
}
.code-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid var(--src-border);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.code-chrome__file {
  color: var(--src-muted);
}
.code-chrome__status {
  color: var(--plum-deep);
}
.code-stage[data-phase="settled"] .code-chrome__status {
  color: var(--src-muted);
}
.code-pre {
  position: relative;
  height: 232px;
  margin: 0;
  padding: 14px 16px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.62;
  color: var(--src-fg);
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: none;
}
.code-pre::-webkit-scrollbar {
  display: none;
}
.code-pre :deep(.t-kw) {
  color: var(--syn-keyword);
}
.code-pre :deep(.t-st) {
  color: var(--syn-string);
}
.code-pre :deep(.t-nu) {
  color: var(--syn-number);
}
.code-pre :deep(.t-cm) {
  color: var(--syn-comment);
  font-style: italic;
}
.caret {
  display: inline-block;
  width: 8px;
  height: 1.05em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--plum);
  animation: caret-blink 1s steps(2, start) infinite;
}
@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

/* ── The seam ────────────────────────────────────────────────────────────── */
.seam {
  position: relative;
  /* The seam IS a solid plum rule now. On a light ground a soft plum glow reads
     as dirt, not as light — so the compiler is drawn as a hard line. */
  background: var(--plum);
}
.seam::after {
  /* redline tick row on the PAPER side */
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--seam-w);
  width: 6px;
  background: repeating-linear-gradient(to bottom, var(--redline) 0 2px, transparent 2px 13px);
  opacity: 0.85;
}

/* ── Sheet (draws itself) ────────────────────────────────────────────────── */
.sheet {
  width: 100%;
  max-width: 620px;
  background: var(--paper-panel);
  border: 1px solid var(--hairline);
  box-shadow: 0 1px 0 var(--hairline), 0 18px 40px -24px rgb(28 36 48 / 35%);
}
.sheet__title {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
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
.sheet__title span:first-child {
  color: var(--ink);
}
.sheet__body {
  position: relative;
  width: 100%;
  /* aspect-ratio set inline from the final SVG viewBox — anti-CLS */
}
.sheet__svg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sheet__svg :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sheet__replay {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: 0;
  border-top: 1px solid var(--hairline);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
  transition: color 0.2s, background 0.2s;
}
.sheet__replay:hover:not(:disabled) {
  color: var(--redline-ink);
  background: color-mix(in srgb, var(--redline) 7%, transparent);
}
.sheet__replay:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ── Mobile: stack the panes, seam goes horizontal ───────────────────────── */
@media (max-width: 767px) {
  .seam-hero__stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto var(--seam-w) auto;
    min-height: 0;
  }
  .pane--source {
    justify-content: center;
    padding: clamp(40px, 9vw, 56px) 22px clamp(30px, 7vw, 44px);
  }
  .pane--sheet {
    justify-content: center;
    padding: clamp(30px, 7vw, 44px) 22px clamp(40px, 9vw, 56px);
  }
  .seam::after {
    top: var(--seam-w);
    bottom: auto;
    left: 0;
    right: 0;
    width: auto;
    height: 6px;
    background: repeating-linear-gradient(to right, var(--redline) 0 2px, transparent 2px 13px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    animation: none;
  }
}
</style>
