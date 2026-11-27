<script setup lang="ts">
// A labelled block of text with a Copy button: a command, a URL or the agent prompt. The text
// is real, selectable markup, so it still works with no JavaScript and no clipboard.
import { ref } from "vue";

const props = defineProps<{ text: string; label: string; clip?: boolean }>();

/** idle → done ("Copied", 1.5 s); a refused clipboard → failed: the text is selected and the button
 *  names the keys that copy it (4 s), so a failed copy still says what to do next (U8). */
const state = ref<"idle" | "done" | "failed">("idle");
const textEl = ref<HTMLElement | null>(null);
const chord = ref("Ctrl+C");
let timer: ReturnType<typeof setTimeout> | undefined;
function settle(next: "done" | "failed", ms: number) {
  state.value = next;
  clearTimeout(timer);
  timer = setTimeout(() => (state.value = "idle"), ms);
}
async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    settle("done", 1500);
  } catch {
    const el = textEl.value;
    const sel = window.getSelection();
    if (el && sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // A touch-only device has no keyboard to press a chord on: it is told the text is selected.
    const touchOnly = matchMedia("(hover: none) and (pointer: coarse)").matches;
    chord.value = touchOnly ? "" : /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘C" : "Ctrl+C";
    settle("failed", 4000);
  }
}
</script>

<template>
  <div class="copybox" :class="{ 'copybox--clip': clip }">
    <pre class="copybox__text"><code ref="textEl">{{ text }}</code></pre>
    <button
      type="button"
      class="copybox__btn"
      :class="{ 'is-done': state === 'done', 'is-failed': state === 'failed' }"
      :aria-label="`Copy ${label}`"
      @click="copy"
    >
      <!-- "Copy" and "Copied" share one grid cell, so the button keeps its width (M25). -->
      <span class="copybox__labels" aria-hidden="true">
        <span class="copybox__idle">Copy</span><span class="copybox__done">Copied</span>
      </span>
      <span v-if="state === 'failed'" class="copybox__fail">{{ chord ? `Press ${chord}` : "Text selected" }}</span>
      <span class="vh-copy" aria-live="polite">{{
        state === "done" ? "Copied" : state === "failed" ? `Couldn't copy: the text is selected${chord ? `, press ${chord}` : ""}` : ""
      }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Source world (ADR 0014): the code page on its cool ground. Light only; tokens only. */
.copybox {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0;
  padding: 10px 10px 10px 12px;
  border: 1px solid var(--src-rule);
  border-radius: 3px;
  background: var(--src-surface);
}
.copybox__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  background: none;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--src-fg);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.copybox__text code {
  padding: 0;
  background: none;
  font-size: inherit;
  color: inherit;
}
/* A long prompt shows its first lines; the whole text is still in the box, so Copy and
   select-all take every line. */
.copybox--clip .copybox__text {
  max-height: calc(1.55em * 3);
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 55%, transparent);
}
.copybox__btn {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--src-rule);
  border-radius: 3px;
  background: var(--src-bg);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.4;
  color: var(--src-fg);
  cursor: pointer;
}
.copybox__btn {
  transition:
    border-color var(--dur-press) var(--ease-out),
    color var(--dur-press) var(--ease-out),
    scale var(--dur-press) var(--ease-out);
}
.copybox__btn:active {
  scale: var(--press-scale);
}
.copybox__btn:hover {
  border-color: var(--plum);
  color: var(--plum-deep);
}
.copybox__labels {
  display: inline-grid;
}
.copybox__labels > span {
  grid-area: 1 / 1;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.copybox__done,
.is-done .copybox__idle {
  opacity: 0;
  transition: opacity var(--dur-fast-out) var(--ease-in);
}
.is-done .copybox__done {
  opacity: 1;
}
.is-failed .copybox__labels {
  display: none;
}
.vh-copy {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.copybox__btn:focus-visible {
  outline: 2px solid var(--plum);
  outline-offset: 2px;
}
</style>
