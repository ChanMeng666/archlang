/**
 * The raw-markdown copies of the hand-written docs pages (`/<route>.md`) are produced by
 * `docs-site/site-markdown.mjs`. Nothing else runs that transform before `docs:build`, so a
 * page edit that breaks it (an unresolvable `<ArchLive :src>`, a new component) would pass
 * `npm run check` and fail only at deploy time. This runs it over every SITE_PAGES row with the
 * real compiler and holds the contract: no throw, a real body, no markup left at a line start,
 * and the two pages whose copies once came out hollow keep their content.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
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
const THREE_D = "../docs-site/three-d.mjs";
const { HOME_3D_PLAN, previewLines, threeDAssets } = (await import(/* @vite-ignore */ THREE_D)) as {
  HOME_3D_PLAN: string;
  previewLines: (repo: string) => { lead: string; title: string; rest: string; limits: string; download: string };
  threeDAssets: (
    repo: string,
  ) => Array<{ name: string; poster: { png: string }; video: { mp4: string }; glb: { href: string } }>;
};

const syncSrc = readFileSync("docs-site/sync-docs.mjs", "utf8");
const table = /const SITE_PAGES = \[([\s\S]*?)\n\];/.exec(syncSrc);
const pages = [...(table?.[1] ?? "").matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => m[1]!);

/** The examples sync-docs compiles into the site: every top-level `examples/*.arch` minus its
 *  EXCLUDED_EXAMPLES table, derived the way test/docs-sync-list.test.ts derives it. */
const excluded = new Set(
  [...(/const EXCLUDED_EXAMPLES = \[([\s\S]*?)\n\];/.exec(syncSrc)?.[1] ?? "").matchAll(/\["([^"]+)",/g)].map(
    (m) => m[1]!,
  ),
);
const EXAMPLE_COUNT = readdirSync("examples").filter(
  (f) => f.endsWith(".arch") && statSync(`examples/${f}`).isFile() && !excluded.has(f),
).length;

/**
 * The home hero sync-docs would inject. The real one is an agent-gallery pair, which no test may
 * read (test/agent-gallery.test.ts's isolation law), so this is a stand-in of the same shape on an
 * example: the transform is what is under test, not the pair.
 */
const HERO = {
  id: "one-room",
  model: "A stand-in model",
  brief: "A stand-in brief.\nOn two lines.",
  source: readFileSync("examples/one-room.arch", "utf8").replace(/\r\n/g, "\n"),
  link: "https://playground.archlang.uk/#z=stand-in",
};

const render = (src: string, hero: typeof HERO | { [k: string]: unknown } = HERO): string =>
  siteMarkdown(src, {
    repo: process.cwd(),
    compile,
    describe,
    encodePlanHash,
    levelSvgName: (name: string, level: number) => `${name}.L${level}.svg`,
    playground: "https://playground.archlang.uk",
    exampleCount: EXAMPLE_COUNT,
    hero,
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

  it("the home copy carries the hero, every section and the facts band, in the page's order", () => {
    const md = render("docs-site/index.md");
    const file = JSON.parse(readFileSync("site-shared/doors.json", "utf8"));
    expect(md.startsWith("# Designs that compile.\n\nA declarative language for floor plans.\n\n")).toBe(true);
    expect(md).toContain(file.canonicalLine);
    // Both primaries, with their doors.json values.
    expect(md).toContain("**Use it in ChatGPT:**");
    expect(md).toContain(file.doors.chatgpt.url);
    expect(md).toContain("**Copy the prompt for your agent:**");
    expect(md).toContain(file.agentPrompt.join("\n"));
    // D4: the proof line, N derived the way sync-docs derives it.
    expect(md).toContain(
      `${EXAMPLE_COUNT} example plans, every one compiled and checked in CI · SVG · PDF · DXF · PNG · MIT`,
    );
    // The hero sync-docs chose: its brief quoted line by line, its model named, its source and link.
    expect(md).toContain(`The brief below was given to ${HERO.model}`);
    expect(md).toContain(HERO.brief.replace(/^/gm, "> "));
    expect(md).toContain(HERO.source.trimEnd());
    expect(md).toContain(`[Open this plan in the Playground](${HERO.link})`);
    // A fallback hero with no brief gets no quote and no model line.
    const bare = render("docs-site/index.md", { ...HERO, model: null, brief: null });
    expect(bare).not.toContain("The brief below was given to");
    expect(bare).toContain(`The plan below is \`${HERO.id}.arch\``);
    const sections = [
      "## Same source, plan and 3D preview",
      "## Why use it",
      "## How it works",
      "## Plans written in ArchLang",
      "## What it is, and what it isn't",
      "## Reads its own plans",
      "## An interface, not just an image.",
      "## Topics",
    ];
    const at = sections.map((h) => md.indexOf(h));
    for (const [i, pos] of at.entries()) expect(pos, sections[i]).toBeGreaterThan(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(md).toContain("| Room | Use | Area | Adj. |");
    expect(md).toContain("**Limits.** Plan drawings only");
    // The gallery's cards carry 3D posters, so its section ends on the 3D limits line (HomeGallery.vue).
    const gallery = md.slice(
      md.indexOf("## Plans written in ArchLang"),
      md.indexOf("## What it is, and what it isn't"),
    );
    expect(gallery.trimEnd().endsWith(previewLines(process.cwd()).limits)).toBe(true);
    expect(md.length).toBeGreaterThan(5000);
  });

  it("the home copy's 3D band: the package's lines, the plan beside its poster, the replay and a link opening in 3D", () => {
    const md = render("docs-site/index.md");
    const lines = previewLines(process.cwd());
    const band = md.slice(md.indexOf(`## ${lines.title}\n`), md.indexOf("## Why use it"));
    expect(band.length).toBeGreaterThan(0);
    // Right after the hero: the hero's playground link, then the band.
    expect(md.indexOf(`[Open this plan in the Playground](${HERO.link})`)).toBeLessThan(md.indexOf(band));
    const a = threeDAssets(process.cwd()).find((x) => x.name === HOME_3D_PLAN)!;
    expect(band).toContain(lines.rest);
    expect(band).toContain(lines.limits);
    expect(band).toContain(`(/examples/${a.name}.svg)`);
    expect(band).toContain(`(${a.poster.png})`);
    expect(a.video, "the home band's plan has a replay").not.toBeNull();
    expect(band).toContain(`(${a.video!.mp4})`);
    const link = /\[Try it in the playground →\]\((https:\/\/playground\.archlang\.uk\/#z=([A-Za-z0-9_-]+)&3d)\)/.exec(
      band,
    );
    expect(link, "the band's playground link, with &3d").toBeTruthy();
    expect(link![2]).toBe(
      encodePlanHash(readFileSync(`examples/${a.name}.arch`, "utf8").replace(/\r\n/g, "\n").trimEnd()),
    );
    expect(band).toContain("[What the 3D preview shows →](/3d)");
  });

  it("the /3d copy carries both lines and every plan of the 3D manifest, each beside its drawing", () => {
    const md = render("docs-site/3d.md");
    const lines = previewLines(process.cwd());
    expect(md).toContain(`**${lines.lead}** ${lines.rest} ${lines.download}`);
    expect(md).toContain(lines.limits);
    const assets = threeDAssets(process.cwd());
    // Every sized GLB link, read with a fixed pattern (no pattern built from a path).
    const glbLinks = [...md.matchAll(/\[Download GLB \(\d+ kB\)\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    const at = assets.map((a) => md.indexOf(`### ${a.name}.arch\n`));
    for (const [i, pos] of at.entries()) expect(pos, assets[i]!.name).toBeGreaterThan(0);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    for (const a of assets) {
      expect(md).toContain(`(/examples/${a.name}.svg)`);
      expect(md).toContain(`(${a.poster.png})`);
      // A plan published without a replay (video: false) has no MP4 link.
      if (a.video) expect(md).toContain(`[Play the replay (MP4)](${a.video.mp4})`);
      else {
        const section = md.slice(md.indexOf(`### ${a.name}.arch`)).split("### ")[1] ?? "";
        expect(section, `${a.name}: no replay link`).not.toContain("Play the replay");
      }
      expect(glbLinks, `${a.name}: a [Download GLB (N kB)] link to its GLB`).toContain(a.glb.href);
      expect(md).toMatch(
        /\[Open in the playground \(3D\)\]\(https:\/\/playground\.archlang\.uk\/#z=[A-Za-z0-9_-]+&3d\)/,
      );
    }
  });

  it("the /examples copy carries every feature sheet, moved there from the home page", () => {
    const md = render("docs-site/examples.md");
    const cards = readFileSync("docs-site/.vitepress/theme/SheetGrid.vue", "utf8").match(/\bno: "A-\d+"/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect((md.match(/^### A-\d+ · /gm) ?? []).length).toBe(cards.length);
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
