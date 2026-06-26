import { defineConfig } from "vitepress";

// ArchLang docs site (T6.1). Static, isomorphic — no backend. Pages re-use the
// canonical docs maintained in the repo root (language reference, error catalog)
// so the site never drifts from the source of truth.
export default defineConfig({
  title: "ArchLang",
  description: "A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.",
  // Built into a subdir under the eventual GitHub Pages / Vercel project; "./"
  // keeps asset URLs relative so it works under any base path.
  base: "/",
  cleanUrls: true,
  lastUpdated: true,
  // The reference/errors pages are synced verbatim from the canonical repo docs,
  // which contain relative links to repo files (examples/*.arch, playground/) that
  // are valid on GitHub but not pages on this site. Don't fail the build on them.
  ignoreDeadLinks: [/\.\.\/(examples|playground)\//, /\.\.\/\.\.\//],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide" },
      { text: "Reference", link: "/reference" },
      { text: "Errors", link: "/errors" },
      { text: "Examples", link: "/examples" },
      { text: "ADRs", link: "/adr/" },
      { text: "Playground", link: "https://github.com/chanmeng666/archlang#playground" },
    ],
    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "What is ArchLang?", link: "/guide" },
          { text: "Examples gallery", link: "/examples" },
        ],
      },
      {
        text: "Language",
        items: [
          { text: "Language reference", link: "/reference" },
          { text: "Relational placement", link: "/relational" },
          { text: "Error catalog", link: "/errors" },
        ],
      },
      {
        text: "Design",
        items: [
          { text: "Architecture decisions", link: "/adr/" },
          { text: "Hand-written parser vs Lezer", link: "/adr/0001-handwritten-parser-vs-lezer" },
          { text: "Optional-dependency geometry", link: "/adr/0002-optional-dep-geometry" },
          { text: "Expand-time scripting", link: "/adr/0003-expand-time-scripting" },
          { text: "Relational placement, not an optimizer", link: "/adr/0004-relational-placement-not-optimizer" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/chanmeng666/archlang" }],
    search: { provider: "local" },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Chan Meng",
    },
  },
});
