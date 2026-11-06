<script setup lang="ts">
// The landing hero: "The Compile Boundary" (ADR 0010 §5), told as brief → source → plan.
//
// Left, the SOURCE world: what ArchLang is (the h1, its sub-line and the canonical line) and the
// two ways to get a plan now, at equal weight (PS-D2): the ChatGPT app, and the prompt for a
// coding agent. Right, across the plum seam, the SHEET world: a real agent-gallery pair. The
// brief arrives as a chat message, the agent's ArchLang streams in, and the compiled plan draws
// itself line by line.
//
// SSR & hydration: compile() is pure and isomorphic, so the server renders the FINAL state (the
// whole source and the final SVG). The client rewinds only after mount, once, when the hero is on
// screen and motion is allowed, and the whole run takes under eight seconds.
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { compile, describe } from "archlang";
import { EXAMPLE_COUNT, HOME } from "./home-data.js";
import { highlightArch } from "./arch-highlight.js";
import { stripHeaderComments } from "./strip-header-comments.js";
// Every door comes from the one doors file every public surface reads (test/site-doors.test.ts).
import { agentPrompt, canonicalLine, doors as NO_INSTALL } from "../../../site-shared/doors.json";
import CopyBox from "./components/CopyBox.vue";

// The hero pair, chosen in sync-docs.mjs's HOME_PROOFS and copied byte for byte from
// docs/gallery/: the brief as given, the plan as the agent delivered it (after one `arch finish`).
// The gallery is not pinned corpus, so sync-docs falls back rather than fail: another gallery
// entry, or an example with no brief (then there is no bubble and no wait for one).
const PAIR = HOME.hero;
const PROMPT = agentPrompt.join("\n");

// The source, minus its leading prose header: those comment lines are for a reader of the FILE,
// and in the animation they are seconds of an empty sheet before the first line that draws. The
// file itself is untouched, and the playground link below carries all of it.
const raw: string = stripHeaderComments(PAIR.source);
const PLAYGROUND = PAIR.link;

// ── Timing. The brief sits alone for BRIEF_MS, then the source streams in over TYPE_MS: the
//    whole run is under eight seconds whatever the pair's length, because the rate is derived
//    from it rather than fixed. ─────────────────────────────────────────────────────────────
const BRIEF_MS = PAIR.brief ? 900 : 0;
const TYPE_MS = 6200;
const SPEED = raw.length / (TYPE_MS / 1000); // characters per second

const finalSvg = compile(raw, { noCache: true }).svg;

// Anti-CLS: reserve the paper at the final drawing's exact aspect ratio.
function aspectFromSvg(svg: string): string {
  const m = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/);
  if (m) {
    const w = Number(m[3]);
    const h = Number(m[4]);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "420 / 297";
}
const paperAspect = aspectFromSvg(finalSvg);

// The sheet's title strip, DERIVED: the plan's name, its room count and area, from describe().
const heroFacts = describe(raw);

// ── Display state: starts FINAL for a hydration-safe first render; the client rewinds it. ──
const typed = ref(raw);
const displaySvg = shallowRef(finalSvg);
const phase = ref<"settled" | "brief" | "typing">("settled");
const mounted = ref(false);

// The tokenizer is GENERATED from src/grammar/tokens.ts (scripts/gen-grammars.ts), the tables
// the VS Code grammar and the playground use, coloured once in style.css.
const highlightedTyped = computed(() => highlightArch(typed.value));

// Byte index just past each newline: a compile per completed line keeps every intermediate
// drawing valid and holds compiles to one per frame.
const lineEnds: number[] = (() => {
  const ends: number[] = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] === "\n") ends.push(i + 1);
  ends.push(raw.length);
  return ends;
})();

let rafId = 0;
let briefTimer: ReturnType<typeof setTimeout> | undefined;
let startTime = 0;
let nextLineEnd = 0;
let hasRun = false;

// `displaySvg` is only ever assigned from a clean compile, so an erroring prefix leaves the
// previous drawing on the stage.
function compileAt(end: number) {
  const prefix = raw.slice(0, end);
  const open = (prefix.match(/{/g) || []).length;
  const close = (prefix.match(/}/g) || []).length;
  const balanced = prefix + "\n" + "}".repeat(Math.max(0, open - close));
  const r = compile(balanced, { noCache: true });
  if (!r.errors.length && r.svg) displaySvg.value = r.svg;
}

function tick(now: number) {
  if (!startTime) startTime = now;
  const elapsed = (now - startTime) / 1000;
  const charIndex = Math.min(raw.length, Math.floor(elapsed * SPEED));
  typed.value = raw.slice(0, charIndex);
  let crossed = -1;
  // `nextLineEnd < lineEnds.length` is the in-range check the `!` asserts.
  while (nextLineEnd < lineEnds.length && charIndex >= lineEnds[nextLineEnd]!) {
    crossed = lineEnds[nextLineEnd]!;
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
  if (preEl.value) preEl.value.scrollTop = 0;
}

function play() {
  cancelAnimationFrame(rafId);
  clearTimeout(briefTimer);
  hasRun = true;
  startTime = 0;
  nextLineEnd = 0;
  typed.value = "";
  displaySvg.value = "";
  phase.value = "brief";
  briefTimer = setTimeout(() => {
    phase.value = "typing";
    rafId = requestAnimationFrame(tick);
  }, BRIEF_MS);
}

// Keep the streaming source scrolled to its last line.
const preEl = ref<HTMLElement | null>(null);
watch(
  typed,
  () => {
    const el = preEl.value;
    if (el && phase.value === "typing") el.scrollTop = el.scrollHeight;
  },
  { flush: "post" },
);

let observer: IntersectionObserver | null = null;
const rootEl = ref<HTMLElement | null>(null);

onMounted(() => {
  mounted.value = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // stay final
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting && !hasRun) play();
    },
    { threshold: 0.35 },
  );
  if (rootEl.value) observer.observe(rootEl.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  clearTimeout(briefTimer);
  observer?.disconnect();
});
</script>

<template>
  <section ref="rootEl" class="seam-hero" :data-phase="phase" aria-label="ArchLang: floor plans as code">
    <div class="seam-hero__stage">
      <!-- SOURCE WORLD -->
      <div class="pane pane--source">
        <div class="src-inner">
          <!-- The brand line stays verbatim (brand/README.md, ADR 0010), and the sub-line inside
               the same <h1> names the category for a crawler (test/docs-home-copy.test.ts). -->
          <h1 class="headline">
            Designs that <span class="headline__accent">compile.</span>
            <span class="headline__sub">A declarative language for floor plans.</span>
          </h1>

          <p class="tagline">{{ canonicalLine }}</p>

          <!-- The two ways to get a plan now, at equal weight (PS-D2, docs home). -->
          <div class="primaries">
            <a class="primary primary--chatgpt" :href="NO_INSTALL.chatgpt.url" target="_blank" rel="noopener">
              <span class="primary__title">Use it in ChatGPT</span>
              <span class="primary__sub">{{ NO_INSTALL.chatgpt.label }} · {{ NO_INSTALL.chatgpt.note }}</span>
              <span class="primary__go">Open&nbsp;↗</span>
            </a>
            <div class="primary primary--prompt">
              <span class="primary__title">Copy the prompt for your agent</span>
              <CopyBox :text="PROMPT" label="the prompt for your agent" clip />
            </div>
          </div>

          <p class="hero-links">
            <a href="/start">New here? Get a floor plan from your AI&nbsp;→</a>
            <a :href="NO_INSTALL.playground.url" target="_blank" rel="noopener">Or open a plan in the playground&nbsp;↗</a>
            <a href="#ways-in">claude.ai, VS Code and the rest&nbsp;↓</a>
          </p>

          <!-- D4: N is the number of example plans this build compiled into the site. -->
          <p class="proof">
            {{ EXAMPLE_COUNT }} example plans, every one compiled and checked in CI · SVG · PDF · DXF · PNG ·
            MIT
          </p>
        </div>
      </div>

      <!-- THE SEAM -->
      <div class="seam" aria-hidden="true"></div>

      <!-- SHEET WORLD: brief → source → plan -->
      <div class="pane pane--sheet">
        <div class="story">
          <figure v-if="PAIR.brief" class="chat">
            <figcaption class="chat__who">The brief, as given to {{ PAIR.model }}</figcaption>
            <blockquote class="chat__bubble">{{ PAIR.brief }}</blockquote>
          </figure>

          <div class="code-stage" :data-phase="phase">
            <div class="code-chrome">
              <span class="code-chrome__file">{{ PAIR.id }}.arch<template v-if="PAIR.model"> · written by {{ PAIR.model }}</template></span>
              <span class="code-chrome__status">{{
                phase === "typing" ? "compiling" : phase === "brief" ? "reading the brief" : "compiled"
              }}</span>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <pre ref="preEl" class="code-pre"><code v-html="highlightedTyped"></code><span v-if="phase === 'typing'" class="caret" aria-hidden="true"></span></pre>
          </div>

          <div class="sheet">
            <div class="sheet__title">
              <span>{{ heroFacts.plan }}</span><span>{{ heroFacts.totals.rooms }} rooms</span
              ><span>{{ heroFacts.totals.floor_area_m2 }} m²</span>
            </div>
            <div class="sheet__body" :style="{ aspectRatio: paperAspect }">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="sheet__svg" v-html="displaySvg"></div>
            </div>
            <div class="sheet__foot">
              <button v-if="mounted" type="button" class="sheet__ctl" :disabled="phase !== 'settled'" @click="play">
                ↻ Replay
              </button>
              <a
                class="sheet__ctl sheet__ctl--open plan-open"
                :href="PLAYGROUND"
                :aria-label="`Open in Playground: ${heroFacts.plan} (${PAIR.id}.arch)`"
                target="_blank"
                rel="noopener"
                >Open in Playground&nbsp;↗</a
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Full-bleed: .VPHome is already full-width, so the hero spans edge to edge below the nav. */
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
  padding: clamp(28px, 4vw, 56px) clamp(24px, 4vw, 60px);
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
  padding: clamp(16px, 2vw, 24px) clamp(24px, 4vw, 60px);
  align-items: center;
  justify-content: flex-start;
}
.src-inner {
  width: 100%;
  max-width: 560px;
}

/* ── Headline ────────────────────────────────────────────────────────────── */
.headline {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 112;
  font-weight: 640;
  letter-spacing: -0.02em;
  line-height: 1;
  font-size: clamp(2.5rem, 5.4vw, 4rem);
  color: var(--src-fg);
}
.headline__accent {
  /* ≥ 40px, so large-text 3:1 applies and the brand plum can appear at full saturation. */
  color: var(--plum);
}
.headline__sub {
  display: block;
  margin-top: 0.45em;
  font-size: 0.44em;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--src-muted);
}
.tagline {
  margin: 16px 0 0;
  max-width: 32rem;
  font-family: var(--font-body);
  font-size: 1.08rem;
  line-height: 1.55;
  color: var(--src-fg);
}

/* ── The two primaries: one grid, two equal columns, the same box for each ───── */
.primaries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.primary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--src-rule);
  border-radius: 4px;
  background: var(--src-surface);
  color: var(--src-fg);
  text-decoration: none;
}
.primary__title {
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.3;
}
.primary__sub {
  font-size: 13px;
  color: var(--src-muted);
}
.primary--chatgpt {
  transition: border-color 0.2s;
}
.primary--chatgpt:hover {
  border-color: var(--redline);
}
.primary--chatgpt:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: 2px;
}
/* Each card's one action is drawn the same way: the redline control (attention only). */
.primary__go,
.primary--prompt :deep(.copybox__btn) {
  align-self: flex-start;
  padding: 5px 12px;
  border: 0;
  border-radius: 3px;
  background: var(--redline-ink); /* white on it is 6.5:1 */
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: #fff;
}
.primary__go {
  margin-top: auto;
}
.primary--chatgpt:hover .primary__go,
.primary--prompt :deep(.copybox__btn:hover) {
  background: var(--redline);
  color: #fff;
}
.primary--prompt :deep(.copybox) {
  margin: 0;
  padding: 6px 6px 6px 8px;
}
.primary--prompt :deep(.copybox__text) {
  font-size: 11px;
}
@media (max-width: 1100px) {
  .primaries {
    grid-template-columns: 1fr;
  }
}

.hero-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 14px 0 0;
  font-size: 14px;
}
.hero-links a {
  color: var(--plum-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.proof {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--src-muted);
}

/* ── Right: brief → source → plan ────────────────────────────────────────── */
.story {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 500px;
}
.chat {
  margin: 0;
  align-self: flex-end;
  max-width: 92%;
}
.chat__who {
  margin: 0 0 4px;
  text-align: right;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.chat__bubble {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--hairline);
  border-radius: 14px 14px 4px 14px;
  background: var(--paper-panel);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
}
.seam-hero[data-phase="brief"] .chat__bubble {
  animation: bubble-in 0.35s ease-out both;
}
@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

.code-stage {
  border: 1px solid var(--src-border);
  border-radius: 4px;
  background: var(--src-surface);
  overflow: hidden;
}
.code-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--src-border);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.code-chrome__file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--src-muted);
}
.code-chrome__status {
  flex: none;
  color: var(--plum-deep);
}
.code-stage[data-phase="settled"] .code-chrome__status {
  color: var(--src-muted);
}
.code-pre {
  position: relative;
  height: 92px;
  margin: 0;
  padding: 8px 14px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--src-fg);
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: none;
}
.code-pre::-webkit-scrollbar {
  display: none;
}
.caret {
  display: inline-block;
  width: 7px;
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
  background: var(--paper-panel);
  border: 1px solid var(--hairline);
  box-shadow: 0 1px 0 var(--hairline), 0 18px 40px -24px rgb(28 36 48 / 35%);
}
.sheet__title {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 7px 14px;
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
}
.sheet__svg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}
.sheet__svg :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sheet__foot {
  display: flex;
  border-top: 1px solid var(--hairline);
}
.sheet__ctl {
  flex: 1;
  display: block;
  padding: 7px 14px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
  text-align: center;
  text-decoration: none;
  transition: color 0.2s, background 0.2s;
}
.sheet__ctl + .sheet__ctl {
  border-left: 1px solid var(--hairline);
}
.sheet__ctl:hover:not(:disabled) {
  color: var(--redline-ink);
  background: color-mix(in srgb, var(--redline) 7%, transparent);
}
.sheet__ctl:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: -2px;
}
.sheet__ctl:disabled {
  opacity: 0.5;
  cursor: default;
}
.sheet__ctl--open {
  color: var(--redline-ink);
}

/* ── Mobile: stack the panes, the seam goes horizontal ───────────────────── */
@media (max-width: 767px) {
  .seam-hero__stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto var(--seam-w) auto;
    min-height: 0;
  }
  .pane--source {
    justify-content: center;
    padding: 24px 16px 28px;
  }
  .pane--sheet {
    justify-content: center;
    padding: 28px 16px 36px;
  }
  .headline {
    font-size: 2.4rem;
  }
  .tagline {
    margin-top: 12px;
    font-size: 1rem;
  }
  .primaries {
    margin-top: 16px;
    gap: 10px;
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
  .caret,
  .seam-hero[data-phase="brief"] .chat__bubble {
    animation: none;
  }
  .sheet__ctl,
  .primary--chatgpt {
    transition: none;
  }
  .code-pre {
    scroll-behavior: auto;
  }
}
</style>
