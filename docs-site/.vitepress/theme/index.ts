// Custom VitePress theme: the default theme + ArchLang/ArchCanvas brand layer.
// Self-hosted fonts (no CDN — keeps builds deterministic, matching ArchLang's
// zero-dependency ethos), brand-token overrides, and a slot-wrapped Layout that
// adds the dark void hero and the brand-family footer.
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import "@fontsource/space-grotesk/300.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";

import "./style.css";
import Layout from "./Layout.vue";

export default {
  extends: DefaultTheme,
  Layout,
} satisfies Theme;
