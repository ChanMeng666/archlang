import { defineConfig } from "vitepress";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// The ArchLang TextMate grammar — generated from the single source of truth
// (scripts/gen-grammars.ts → editors/archlang.tmLanguage.json, the same grammar
// VS Code uses). Loading it here lets Shiki highlight `arch` fenced code blocks
// instead of falling back to plain text, and keeps the site in lockstep with the
// grammar (regenerate the grammar → the site picks it up; nothing to hand-sync).
const archGrammar = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../editors/archlang.tmLanguage.json", import.meta.url)), "utf8"),
);

// ArchLang docs site (T6.1). Static, isomorphic — no backend. Pages re-use the
// canonical docs maintained in the repo root (language reference, error catalog)
// so the site never drifts from the source of truth.
export default defineConfig({
  title: "ArchLang",
  description:
    "A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.",
  // Brand: the ArchLang spark favicon (SVG, scales), an apple-touch icon, the dark
  // theme-colour, and an OG/Twitter social card (the 1200×630 wordmark banner). All
  // assets live in public/brand/ (the lockup logo set).
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/brand/archlang-icon-plum.svg" }],
    ["link", { rel: "alternate icon", href: "/brand/archlang-favicon-32.png", sizes: "32x32" }],
    ["link", { rel: "apple-touch-icon", href: "/brand/archlang-apple-touch.png" }],
    ["meta", { name: "theme-color", content: "#0f1115" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "ArchLang — code to floor plans" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "A declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.",
      },
    ],
    ["meta", { property: "og:image", content: "https://archlang-docs.vercel.app/brand/archlang-og.png" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: "https://archlang-docs.vercel.app/brand/archlang-og.png" }],
  ],
  // Built into a subdir under the eventual GitHub Pages / Vercel project; "./"
  // keeps asset URLs relative so it works under any base path.
  base: "/",
  cleanUrls: true,
  lastUpdated: true,
  // The reference/errors pages are synced verbatim from the canonical repo docs,
  // which contain relative links to repo files (examples/*.arch, playground/,
  // CHANGELOG.md, SKILL.md, error-codes.md → the site's /errors page) that are
  // valid on GitHub but not pages on this site under the same name. Don't fail
  // the build on them.
  ignoreDeadLinks: [
    /\.\.\/(examples|playground)\//,
    /\.\.\/\.\.\//,
    /\.\.\/(CHANGELOG|SKILL)/,
    /error-codes/,
    /language-reference/,
  ],
  // Register the ArchLang grammar with Shiki under the `arch` fence id (the
  // grammar's own `name` is "ArchLang"; its scopeName stays `source.arch`). The
  // `archlang` alias is accepted too.
  markdown: {
    languages: [{ ...archGrammar, name: "arch", aliases: ["archlang"] }],
  },
  // Let theme components (ArchLive) import the built core directly, so docs
  // examples compile client-side — the same alias the playground uses. The core
  // is built before the site (see vercel.json → docs:build), so dist/ exists.
  // The optional Node-only backends are reached only via lazy import()s that never
  // run in the browser — exclude them from prebundling so esbuild doesn't choke on
  // native binaries.
  vite: {
    resolve: {
      alias: {
        archlang: fileURLToPath(new URL("../../dist/index.js", import.meta.url)),
      },
    },
    server: { fs: { allow: [resolve(fileURLToPath(new URL("../..", import.meta.url)))] } },
    optimizeDeps: { exclude: ["@resvg/resvg-js", "pdfkit", "clipper2-wasm", "archlang"] },
    build: { rollupOptions: { external: [/^node:/, "@resvg/resvg-js", "pdfkit", "clipper2-wasm"] } },
  },
  themeConfig: {
    // The ArchLang spark mark beside the "ArchLang" site title in the nav bar.
    // The plum mark reads on both the light docs chrome and the dark mobile nav.
    logo: "/brand/archlang-icon-plum.svg",
    // Calm, grouped top nav: a few primary links plus dropdowns, so the bar
    // stays readable on the home page and every doc page (it's one global nav).
    // Sub-topics live under Reference; the contributor-only ADRs stay in the
    // sidebar (below) rather than the bar. Playground is the standalone CTA — it
    // is intentionally NOT repeated inside Ecosystem.
    nav: [
      { text: "Guide", link: "/guide" },
      {
        text: "Reference",
        items: [
          { text: "Language reference", link: "/reference" },
          { text: "Relational placement", link: "/relational" },
          { text: "Furniture & fixtures", link: "/furniture" },
          { text: "Analysis: describe & lint", link: "/analysis" },
          { text: "Error catalog", link: "/errors" },
        ],
      },
      { text: "Examples", link: "/examples" },
      {
        text: "AI Agents",
        items: [
          { text: "Use it from an agent", link: "/agents" },
          { text: "One-page spec", link: "/spec" },
        ],
      },
      // Keep one-click reach to the playground… (VitePress appends the external
      // ↗ icon itself for external links, so no manual arrow in the text.)
      { text: "Playground", link: "https://archlang-playground.vercel.app" },
      // …and group the wider brand family (the ArchCanvas product + packages)
      // under an Ecosystem dropdown so docs ↔ archcanvas ↔ packages all link.
      {
        text: "Ecosystem",
        items: [
          { text: "ArchCanvas", link: "https://archcanvas.chanmeng.org" },
          { text: "npm", link: "https://www.npmjs.com/package/@chanmeng666/archlang" },
          { text: "GitHub", link: "https://github.com/chanmeng666/archlang" },
        ],
      },
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
        text: "For AI agents",
        items: [
          { text: "Use it from an agent", link: "/agents" },
          { text: "One-page spec", link: "/spec" },
        ],
      },
      {
        text: "Language",
        items: [
          { text: "Language reference", link: "/reference" },
          { text: "Relational placement", link: "/relational" },
          { text: "Furniture & fixtures", link: "/furniture" },
          { text: "Analysis: describe & lint", link: "/analysis" },
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
          { text: "No invisible architect", link: "/adr/0005-no-invisible-architect" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/chanmeng666/archlang" }],
    search: { provider: "local" },
    // The site-wide footer is rendered by FamilyFooter.vue (layout-bottom slot),
    // which carries the MIT/copyright line plus the brand-family ecosystem links.
    // Omitting the built-in `footer` here avoids a duplicate footer.
  },
});
