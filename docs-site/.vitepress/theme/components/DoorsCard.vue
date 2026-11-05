<script setup lang="ts">
// The home page's doors card: one tab per door, in doors.json's `order.docsHome`. Each panel is
// door-copy.json's sentence and DoorBody's link, URL, prompt or command, so the card says
// exactly what /start says. Every panel is in the HTML; the tabs only choose which one shows.
import { ref } from "vue";
import COPY from "../door-copy.json";
import { doors, HOME_ORDER, type DoorId } from "../doors";
import DoorBody from "./DoorBody.vue";

const active = ref<DoorId>(HOME_ORDER[0]!);
const tabs = ref<HTMLElement[]>([]);

/** Arrow keys move along the tabs, as the ARIA tabs pattern has it. */
function onKey(e: KeyboardEvent, i: number) {
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = (i + step + HOME_ORDER.length) % HOME_ORDER.length;
  active.value = HOME_ORDER[next]!;
  tabs.value[next]?.focus();
}
</script>

<template>
  <div id="ways-in" class="doors-card">
    <div class="doors-card__tabs" role="tablist" aria-label="Ways to get a plan">
      <button
        v-for="(id, i) in HOME_ORDER"
        :id="`doors-tab-${id}`"
        :key="id"
        ref="tabs"
        type="button"
        role="tab"
        class="doors-card__tab"
        :aria-selected="active === id"
        :aria-controls="`doors-panel-${id}`"
        :tabindex="active === id ? 0 : -1"
        @click="active = id"
        @keydown="onKey($event, i)"
      >
        {{ doors[id].label }}
      </button>
    </div>
    <div
      v-for="id in HOME_ORDER"
      :id="`doors-panel-${id}`"
      :key="id"
      role="tabpanel"
      class="doors-card__panel"
      :aria-labelledby="`doors-tab-${id}`"
      :hidden="active !== id"
    >
      <p class="doors-card__lead"><strong>{{ COPY[id].heading }}.</strong> {{ COPY[id].body }}</p>
      <DoorBody :id="id" />
    </div>
    <p class="doors-card__more">Every way in, one screen each: <a href="/start">Get a floor plan from your AI</a>.</p>
  </div>
</template>

<style scoped>
.doors-card {
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--paper-panel);
  scroll-margin-top: calc(var(--vp-nav-height, 64px) + 16px);
}
.doors-card__tabs {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--hairline);
}
.doors-card__tab {
  padding: 10px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 550;
  color: var(--ink-muted);
  cursor: pointer;
}
.doors-card__tab[aria-selected="true"] {
  border-bottom-color: var(--redline);
  color: var(--ink);
}
.doors-card__tab:focus-visible {
  outline: 2px solid var(--redline);
  outline-offset: -2px;
}
.doors-card__panel {
  padding: 16px 18px 6px;
}
.doors-card__lead {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink-muted);
}
.doors-card__lead strong {
  color: var(--ink);
}
.doors-card__more {
  margin: 0;
  padding: 10px 18px 14px;
  font-size: 14px;
  color: var(--ink-muted);
}
</style>
