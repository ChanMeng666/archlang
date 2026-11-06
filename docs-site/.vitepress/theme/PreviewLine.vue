<script setup lang="ts">
// One of the 3D preview's two lines (PS-D12), in the package's own words (PREVIEW, from
// `PREVIEW_LABEL` and `PREVIEW_LIMITS` in packages/archlang-3d/src/replay/payload.ts), for a page
// that shows the preview: `label` is the PS-D12 line, its lead in bold, with the download sentence
// the plan adds where a page offers the GLB; `limits` is the limits line. site-markdown.mjs writes
// the same text into the raw copy.
import { PREVIEW } from "./three-d-data.js";

defineProps<{ which: "label" | "limits" }>();
</script>

<template>
  <p v-if="which === 'label'" class="preview-line">
    <strong>{{ PREVIEW.lead }}</strong> {{ PREVIEW.rest }} {{ PREVIEW.download }}
  </p>
  <p v-else class="preview-line preview-line--limits">{{ PREVIEW.limits }}</p>
</template>

<style scoped>
.preview-line--limits {
  color: var(--ink-muted);
}
</style>
