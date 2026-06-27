<script setup>
// Wraps the VitePress default Layout to inject the brand-family pieces through
// official slots: the dark void hero above the homepage features
// (home-hero-before) and the brand-family footer site-wide (layout-bottom).
import DefaultTheme from "vitepress/theme";
import BrandHero from "./BrandHero.vue";
import FamilyFooter from "./FamilyFooter.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <BrandHero />
    </template>
    <template #layout-bottom>
      <FamilyFooter />
    </template>
  </Layout>
</template>
