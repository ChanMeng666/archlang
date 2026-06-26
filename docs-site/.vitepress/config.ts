import { defineConfig } from "vitepress";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The ArchLang TextMate grammar — generated from the single source of truth
// (scripts/gen-grammars.ts → editors/archlang.tmLanguage.json, the same grammar
// VS Code uses). Loading it here lets Shiki highlight `arch` fenced code blocks
// instead of falling back to plain text, and keeps the site in lockstep with the
// grammar (regenerate the grammar → the site picks it up; nothing to hand-sync).
const archGrammar = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../editors/archlang.tmLanguage.json", import.meta.url)),
    "utf8",
  ),
);

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
  // which contain relative links to repo files (examples/*.arch, playground/,
  // error-codes.md → the site's /errors page) that are valid on GitHub but not
  // pages on this site under the same name. Don't fail the build on them.
  ignoreDeadLinks: [/\.\.\/(examples|playground)\//, /\.\.\/\.\.\//, /error-codes/],
  // Register the ArchLang grammar with Shiki under the `arch` fence id (the
  // grammar's own `name` is "ArchLang"; its scopeName stays `source.arch`). The
  // `archlang` alias is accepted too.
  markdown: {
    languages: [{ ...archGrammar, name: "arch", aliases: ["archlang"] }],
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide" },
      { text: "Reference", link: "/reference" },
      { text: "AI Agents", link: "/agents" },
      { text: "Errors", link: "/errors" },
      { text: "Examples", link: "/examples" },
      { text: "ADRs", link: "/adr/" },
      { text: "Playground", link: "https://archlang-playground.vercel.app" },
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
