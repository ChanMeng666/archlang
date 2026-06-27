<script setup>
// Thin Vue wrapper around the shared flowing-lines helper. Mounts the canvas
// animation on the client only (VitePress SSRs pages — the canvas + matchMedia
// must run in the browser).
import { onMounted, onBeforeUnmount, ref } from "vue";
import { mountFlowingLines } from "./flowing-lines.js";

const canvas = ref(null);
let dispose = null;

onMounted(() => {
  if (canvas.value) dispose = mountFlowingLines(canvas.value);
});
onBeforeUnmount(() => dispose && dispose());
</script>

<template>
  <canvas ref="canvas" class="flowing-lines" aria-hidden="true" />
</template>

<style scoped>
.flowing-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
