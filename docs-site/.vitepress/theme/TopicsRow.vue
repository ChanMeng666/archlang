<script setup lang="ts">
// The home page's Topics row: the five topic pages, from the list the footer renders too
// (test/docs-topics.test.ts).
import { TOPICS } from "./topics";
</script>

<template>
  <nav class="topics" aria-label="Topics">
    <div class="topics__inner">
      <span class="topics__label">Topics</span>
      <a v-for="t in TOPICS" :key="t.href" class="topics__link" :href="t.href">{{ t.label }}</a>
    </div>
  </nav>
</template>

<style scoped>
.topics {
  padding-block: clamp(32px, 5vw, 56px) 0;
}
.topics__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 22px;
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.topics__label {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 86;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.topics__link {
  font-size: 14.5px;
}
</style>
