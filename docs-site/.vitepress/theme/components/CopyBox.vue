<script setup lang="ts">
// A labelled block of text with a Copy button: a command, a URL or the agent prompt. The text
// is real, selectable markup, so it still works with no JavaScript and no clipboard.
import { ref } from "vue";

const props = defineProps<{ text: string; label: string; clip?: boolean }>();

const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard unavailable: the text is still selectable */
  }
}
</script>

<template>
  <div class="copybox" :class="{ 'copybox--clip': clip }">
    <pre class="copybox__text"><code>{{ text }}</code></pre>
    <button type="button" class="copybox__btn" :aria-label="`Copy ${label}`" @click="copy">
      <span aria-live="polite">{{ copied ? "Copied" : "Copy" }}</span>
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
.copybox__btn:hover {
  border-color: var(--plum);
  color: var(--plum-deep);
}
.copybox__btn:focus-visible {
  outline: 2px solid var(--plum);
  outline-offset: 2px;
}
</style>
