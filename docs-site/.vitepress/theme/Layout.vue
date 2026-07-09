<script setup>
// Wraps the VitePress default Layout to inject the brand-family pieces through
// official slots: the "Compile Boundary" hero above the homepage body
// (home-hero-before) and the title-block footer site-wide (layout-bottom).
import { onMounted } from "vue";
import DefaultTheme from "vitepress/theme";
import CompileSeam from "./CompileSeam.vue";
import TitleBlockFooter from "./TitleBlockFooter.vue";

const { Layout } = DefaultTheme;

// The `layout: home` page renders no <main> landmark (VitePress uses a bare
// #VPContent > .VPHome). Mark .VPHome as the main landmark so the page has
// exactly one — but only if the page doesn't already expose a main (inner
// doc pages do), so we never create a duplicate. Client-only; harmless on
// hydrate since it mutates an existing element's attribute after mount.
onMounted(() => {
  if (document.querySelector('main, [role="main"]')) return;
  document.querySelector(".VPHome")?.setAttribute("role", "main");
});
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <CompileSeam />
    </template>
    <template #layout-bottom>
      <TitleBlockFooter />
    </template>
  </Layout>
</template>
