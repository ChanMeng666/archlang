<script setup lang="ts">
// /start: every door, one short section each, in doors.json's `order.start` (by friction, for
// the curious non-developer, PS-D2). The heading and the sentence are door-copy.json's; the
// link, URL, prompt or command is DoorBody's, from doors.json. site-markdown.mjs renders the
// /start.md copy from the same two files.
import COPY from "../door-copy.json";
import { START_ORDER } from "../doors";
import DoorBody from "./DoorBody.vue";
</script>

<template>
  <section v-for="(id, i) in START_ORDER" :key="id" class="start-door" :data-door="id">
    <h2 :id="`door-${id}`" tabindex="-1">
      <span class="start-door__no">{{ i + 1 }}</span> {{ COPY[id].heading }}
    </h2>
    <p>{{ COPY[id].body }}</p>
    <DoorBody :id="id" />
  </section>
</template>

<style scoped>
.start-door {
  margin: 28px 0 0;
}
.start-door__no {
  display: inline-block;
  min-width: 1.6em;
  font-family: var(--font-mono);
  color: var(--redline-ink);
}
</style>
