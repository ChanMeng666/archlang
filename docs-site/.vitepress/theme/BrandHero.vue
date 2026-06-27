<script setup>
// The dark "void" landing hero — ArchLang's homepage門面, sharing the ArchCanvas
// brand language (plum + flowing lines + light-weight Space Grotesk display).
// Rendered above the (light) VitePress features grid via the home-hero-before
// slot. The default VitePress hero is removed from index.md so only this shows.
import FlowingLines from "./FlowingLines.vue";

const ARCHCANVAS = "https://archcanvas.chanmeng.org";
const PLAYGROUND = "https://archlang-playground.vercel.app";
</script>

<template>
  <section class="brand-hero">
    <FlowingLines class="brand-hero__lines" />
    <div class="brand-hero__scrim" />
    <div class="brand-hero__inner">
      <a class="brand-hero__eyebrow" :href="ARCHCANVAS" target="_blank" rel="noopener">
        <span class="brand-hero__dot" />
        Part of the ArchCanvas family ↗
      </a>
      <h1 class="brand-hero__title">
        <span class="brand-hero__line">Code</span>
        <span class="brand-hero__line brand-hero__line--accent">→ floor plans</span>
      </h1>
      <p class="brand-hero__tagline">
        A small declarative language that compiles to professional SVG floor plans —
        like Typst/LaTeX, but for architecture. Zero-dependency, deterministic, isomorphic.
      </p>
      <div class="brand-hero__actions">
        <a class="brand-btn brand-btn--action" href="/guide">Get started</a>
        <a class="brand-btn brand-btn--ghost" href="/reference">Language reference</a>
        <a class="brand-btn brand-btn--ghost" :href="PLAYGROUND" target="_blank" rel="noopener">
          Open playground ↗
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.brand-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  /* full-bleed across the home container */
  margin: -48px calc(50% - 50vw) 24px;
  padding: clamp(72px, 14vw, 150px) 24px clamp(64px, 12vw, 132px);
  background: var(--void-bg);
  color: var(--void-fg);
}
.brand-hero__lines {
  z-index: 0;
}
/* radial scrim keeps the headline legible over the lines */
.brand-hero__scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(
    ellipse 52% 46% at center,
    color-mix(in oklab, var(--void-bg) 78%, transparent) 0%,
    transparent 70%
  );
}
.brand-hero__inner {
  position: relative;
  z-index: 2;
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}
.brand-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  margin-bottom: 28px;
  border: 1px solid var(--void-border);
  border-radius: 9999px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ash);
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}
.brand-hero__eyebrow:hover {
  border-color: color-mix(in srgb, var(--plum) 55%, transparent);
  color: var(--void-fg);
}
.brand-hero__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--plum);
}
.brand-hero__title {
  margin: 0;
  border: 0;
  font-family: var(--vp-font-family-base);
  font-weight: 300;
  letter-spacing: -0.04em;
  line-height: 1.02;
  font-size: clamp(3rem, 9vw, 5.4rem);
}
.brand-hero__line {
  display: block;
}
.brand-hero__line--accent {
  background: linear-gradient(92deg, var(--plum) 0%, #a98bff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-hero__tagline {
  max-width: 30rem;
  margin: 26px auto 0;
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--ash);
}
.brand-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 36px;
}
.brand-btn {
  display: inline-flex;
  align-items: center;
  padding: 11px 22px;
  border-radius: 9999px;
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
  border: 1px solid transparent;
  transition: transform 0.15s, background 0.2s, border-color 0.2s, color 0.2s;
}
.brand-btn:active {
  transform: translateY(1px);
}
.brand-btn--action {
  background: var(--plum);
  color: #fff;
}
.brand-btn--action:hover {
  background: color-mix(in srgb, var(--plum) 90%, #fff);
}
.brand-btn--ghost {
  border-color: var(--void-border);
  color: var(--void-fg);
}
.brand-btn--ghost:hover {
  border-color: color-mix(in srgb, var(--plum) 60%, transparent);
  color: #fff;
}
</style>
