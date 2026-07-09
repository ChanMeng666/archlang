<script setup>
// Wraps the VitePress default Layout to inject the brand-family pieces through
// official slots: the "Compile Boundary" hero above the homepage body
// (home-hero-before) and the title-block footer site-wide (layout-bottom).
import DefaultTheme from "vitepress/theme";
import CompileSeam from "./CompileSeam.vue";
import TitleBlockFooter from "./TitleBlockFooter.vue";

const { Layout } = DefaultTheme;
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
