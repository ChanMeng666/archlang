/**
 * The raw-markdown copies of the hand-written docs pages (`/<route>.md`) are produced by
 * `docs-site/site-markdown.mjs`. Nothing else runs that transform before `docs:build`, so a
 * page edit that breaks it (an unresolvable `<ArchLive :src>`, a new component) would pass
 * `npm run check` and fail only at deploy time. This runs it over every SITE_PAGES row with the
 * real compiler and holds the contract: no throw, a real body, no markup left at a line start,
 * and the two pages whose copies once came out hollow keep their content.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe } from "../src/index.js";

// Plain `.mjs` modules (no declaration files): loaded by a computed specifier so the
// typechecker does not need to resolve them.
const SITE_MARKDOWN = "../docs-site/site-markdown.mjs";
const PERMALINK = "../scripts/gen-permalink.mjs";
const { siteMarkdown } = (await import(/* @vite-ignore */ SITE_MARKDOWN)) as {
  siteMarkdown: (src: string, deps: object) => string;
};
const { encodePlanHash } = (await import(/* @vite-ignore */ PERMALINK)) as {
  encodePlanHash: (source: string) => string;
};

const syncSrc = readFileSync("docs-site/sync-docs.mjs", "utf8");
const table = /const SITE_PAGES = \[([\s\S]*?)\n\];/.exec(syncSrc);
const pages = [...(table?.[1] ?? "").matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => m[1]!);

const render = (src: string): string =>
  siteMarkdown(src, {
    repo: process.cwd(),
    compile,
    describe,
    encodePlanHash,
    levelSvgName: (name: string, level: number) => `${name}.L${level}.svg`,
    playground: "https://playground.archlang.uk",
  });

suite("siteMarkdown over every SITE_PAGES row", () => {
  it("finds the six hand-written pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  for (const src of pages) {
    it(`${src} renders to plain markdown`, () => {
      const md = render(src);
      expect(md.trim().length).toBeGreaterThan(200);
      expect(md.startsWith("# ")).toBe(true);
      expect(md).not.toMatch(/^\s/);
      // No markup at a line start outside the fenced sources (which legitimately hold `<`).
      const prose = md.replace(/```[\s\S]*?```/g, "");
      expect(prose).not.toMatch(/^<[A-Za-z/]/m);
      expect(prose).not.toContain("<script");
    });
  }

  it("the /embed copy names the core's real version, never the placeholder", () => {
    const md = render("docs-site/embed.md");
    const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    expect(md).toContain(`https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@${version}/+esm`);
    expect(md).not.toContain("%ARCHLANG_VERSION%");
  });

  it("the home copy carries the hero, every feature card and the facts band", () => {
    const md = render("docs-site/index.md");
    expect(md).toContain("# Designs that compile.");
    expect(md).toContain("A declarative language for floor plans.");
    expect(md).toContain("[Get started](/guide)");
    const cards = readFileSync("docs-site/.vitepress/theme/SheetGrid.vue", "utf8").match(/\bno: "A-\d+"/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect((md.match(/^### A-\d+ · /gm) ?? []).length).toBe(cards.length);
    expect(md).toContain("## Reads its own plans");
    expect(md).toContain("| Room | Use | Area | Adj. |");
    expect(md).toContain("An interface, not just an image.");
    expect(md.length).toBeGreaterThan(5000);
  });

  it("the /start copy carries every door in doors.json's start order, each with its value", () => {
    const md = render("docs-site/start.md");
    const file = JSON.parse(readFileSync("site-shared/doors.json", "utf8"));
    const copy = JSON.parse(readFileSync("docs-site/.vitepress/theme/door-copy.json", "utf8"));
    const order = file.order.start as string[];
    const at = order.map((id, i) => md.indexOf(`## ${i + 1} ${copy[id].heading}`));
    for (const [i, pos] of at.entries()) expect(pos, order[i]).toBeGreaterThan(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const url of [file.doors.playground.url, file.doors.chatgpt.url, file.doors.claudeai.url]) {
      expect(md).toContain(url);
    }
    expect(md).toContain(file.agentPrompt.join("\n"));
    expect(md).toContain(file.doors.vscode.marketplace);
    expect(md).toContain("https://youtu.be/");
  });

  it("the gallery copy keeps the provenance sentence and the drawings of every entry", () => {
    const md = render("docs-site/gallery.md");
    const entries = (readFileSync("docs-site/gallery.md", "utf8").match(/<AgentPlan /g) ?? []).length;
    expect(entries).toBeGreaterThan(0);
    expect((md.match(/then completed with `arch finish`\./g) ?? []).length).toBe(entries);
    expect(
      (md.match(/^!\[[^\]]*compiled floor plan[^\]]*\]\(\/gallery\/[^)]+\.svg\)$/gm) ?? []).length,
    ).toBeGreaterThanOrEqual(entries);
  });
});
