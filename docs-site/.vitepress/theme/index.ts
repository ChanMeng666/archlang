// Custom VitePress theme: the default theme + ArchLang/ArchCanvas brand layer.
// Self-hosted fonts (no CDN — keeps builds deterministic, matching ArchLang's
// zero-dependency ethos), brand-token overrides, and a slot-wrapped Layout that
// adds the dark void hero and the brand-family footer.
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/400-italic.css";

import "./style.css";
import "./home.css";
import "./doc-pages.css";
import Layout from "./Layout.vue";
import ArchLive from "./components/ArchLive.vue";
import SheetGrid from "./SheetGrid.vue";
import FactsSection from "./FactsSection.vue";

export default {
  extends: DefaultTheme,
  Layout,
  // Global components: `<ArchLive src="…">` (inline live-compiled example) plus the
  // landing-page sections (`<SheetGrid>`, `<FactsSection>`), registered so index.md
  // can drop them into its markdown body.
  enhanceApp({ app }) {
    app.component("ArchLive", ArchLive);
    app.component("SheetGrid", SheetGrid);
    app.component("FactsSection", FactsSection);
  },
} satisfies Theme;
