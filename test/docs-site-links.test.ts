/**
 * The site copies of the canonical docs (PAGES + docs/adr/*.md) must not carry repo-relative
 * links: `../CHANGELOG.md` or `README.md` resolve on GitHub and 404 on archlang.uk (GSC "Not
 * found", 2026-11-09). `docs-site/link-rewrite.mjs` maps them from the sync-docs tables; this runs
 * it over every source and asserts each link left is a known route, a public file or absolute, and
 * that a `#fragment` on a site route is the id VitePress gives one of the target page's headings
 * (it turns `_` into `-`: GitHub's `#w_scale_overflow` is `/errors#w-scale-overflow` here).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without declarations
import { fenceStep, headingIds, rewriteLinks, routeOfDest, slugify } from "../docs-site/link-rewrite.mjs";

const syncSrc = readFileSync("docs-site/sync-docs.mjs", "utf8");
function table(name: string): Array<[string, string]> {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(syncSrc);
  expect(block, `sync-docs.mjs no longer declares \`const ${name}\``).toBeTruthy();
  return [...block![1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
}
const PAGES = table("PAGES");
const SITE_PAGES = table("SITE_PAGES");
const ROOT_COPIES = table("ROOT_COPIES");
const PLAYGROUND = /const PLAYGROUND = "([^"]+)"/.exec(syncSrc)![1]!;
const adrs = readdirSync("docs/adr").filter((f) => f.endsWith(".md") && f !== "index.md");

const ctx = {
  pages: [...PAGES, ...SITE_PAGES],
  rootCopies: ROOT_COPIES,
  playground: PLAYGROUND,
  sourceOf: (p: string) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  kindOf: (p: string) => {
    try {
      return statSync(p).isDirectory() ? ("dir" as const) : ("file" as const);
    } catch {
      return null;
    }
  },
};

const ROUTES = new Set<string>([
  ...ctx.pages.map(([, d]) => routeOfDest(d) as string),
  ...ROOT_COPIES.map(([, d]) => `/${d}`),
  ...adrs.map((f) => `/adr/${f.replace(/\.md$/, "")}`),
  "/adr",
]);
const publicFile = (route: string) => {
  try {
    return statSync(join("docs-site/public", route)).isFile();
  } catch {
    return false;
  }
};
/** `public/x.html` is served at `/x` too (clean URLs), as a hand-written page links it. */
const publicPage = (route: string) => publicFile(`${route}.html`);
/** The raw markdown copy every PAGES/SITE_PAGES page also serves at `/<route>.md` (`sync-docs.mjs`). */
const RAW_MD = new Set<string>(ctx.pages.map(([, d]) => `/${d}`));

/**
 * Every inline/reference link target outside fenced code and inline code spans. Fenced code is
 * found by the one fence rule the rewriter uses (`fenceStep`), so a page's links are read the way
 * the rewriter reads them; the rule's own cases are pinned below.
 */
function linksOf(md: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const step = fenceStep(fence, line) as { open: string | null; marker: boolean };
    const inside = fence !== null || step.marker;
    fence = step.open;
    if (inside) continue;
    const plain = line
      .split(/(`+[^`]*`+)/)
      .filter((_, i) => i % 2 === 0)
      .join(" ");
    for (const m of plain.matchAll(/\]\(<?([^()\s>][^()\s>]*(?:\([^()]*\)[^()\s>]*)*)/g)) out.push(m[1]!);
    const ref = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/.exec(plain);
    if (ref) out.push(ref[1]!);
  }
  return out;
}

/** Site route -> the canonical source file it is generated from (PAGES, SITE_PAGES, ADRs). */
const SOURCE_OF = new Map<string, string>([
  ...ctx.pages.map(([src, dest]) => [routeOfDest(dest) as string, src] as [string, string]),
  ...adrs.map((f) => [`/adr/${f.replace(/\.md$/, "")}`, `docs/adr/${f}`] as [string, string]),
]);

/** Every heading id VitePress gives the page built from `src` (duplicates get -1, -2, ...). */
const headingIdsOf = (src: string): Set<string> =>
  new Set((headingIds(readFileSync(src, "utf8")) as Array<{ vp: string }>).map((h) => h.vp));
const IDS = new Map<string, Set<string>>();
const idsOf = (route: string): Set<string> | null => {
  const src = SOURCE_OF.get(route);
  if (!src) return null;
  if (!IDS.has(route)) IDS.set(route, headingIdsOf(src));
  return IDS.get(route) ?? null;
};

/** Problems with a site copy's links; empty when every one resolves. */
function problems(md: string, siteOnly = false): string[] {
  const bad: string[] = [];
  for (const link of linksOf(md)) {
    if (link.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    const [pathAndQuery = "", frag] = link.split("#");
    const path = pathAndQuery.split("?")[0]!;
    // A hand-written page may point at a page's raw markdown copy on purpose (`/cli.md`); a
    // rewritten canonical copy never should.
    if (siteOnly && RAW_MD.has(path) && !frag) continue;
    if (path.endsWith(".md")) bad.push(`${link} (still .md)`);
    else if (!path.startsWith("/")) bad.push(`${link} (still repo-relative)`);
    else if (!ROUTES.has(path) && !publicFile(path) && !(siteOnly && publicPage(path)))
      bad.push(`${link} (no such route or public file)`);
    else if (frag) {
      const ids = idsOf(path);
      if (ids && !ids.has(decodeURIComponent(frag))) bad.push(`${link} (no heading with that VitePress id)`);
    }
  }
  return bad;
}

const sources = [...PAGES.map(([s]) => s), ...adrs.map((f) => `docs/adr/${f}`)];

describe("site copies of the canonical docs", () => {
  it("the check is not vacuous: today's verbatim copies have broken links", () => {
    const raw = sources.flatMap((s) => problems(readFileSync(s, "utf8")));
    expect(raw.length).toBeGreaterThan(10);
  });

  for (const src of sources) {
    it(`${src}: every link resolves on the site and none ends in .md`, () => {
      expect(problems(rewriteLinks(readFileSync(src, "utf8"), src, ctx))).toEqual([]);
    });
  }

  // The hand-written site pages (SITE_PAGES) are served as written, never rewritten, so their
  // links are checked raw: a `#fragment` must be the id VitePress gives the target heading (it
  // keeps an em dash: `/reference#levels-—-a-multi-storey-building-v1-21`, not GitHub's `--`).
  for (const [src] of SITE_PAGES) {
    it(`${src} (site-only): every link resolves on the site, fragments included`, () => {
      expect(problems(readFileSync(src, "utf8"), true)).toEqual([]);
    });
  }

  it("a dead fragment in a site-only page is caught", () => {
    const fromExamples = linksOf(readFileSync("docs-site/examples.md", "utf8")).filter((l) => l.includes("#"));
    expect(fromExamples.length).toBeGreaterThan(10);
    // GitHub's spelling of an em-dash heading (examples.md once carried 13 such)is dead on the site.
    expect(problems("[a](/reference#levels-a-multi-storey-building-v1-21)", true)).toEqual([
      "/reference#levels-a-multi-storey-building-v1-21 (no heading with that VitePress id)",
    ]);
    expect(problems("[a](/reference#levels-—-a-multi-storey-building-v1-21)", true)).toEqual([]);
    expect(problems("[a](/cli.md) [b](/arch-plan-demo)", true)).toEqual([]);
    expect(problems("[a](/nope.md) [b](/nope)", true)).toEqual([
      "/nope.md (still .md)",
      "/nope (no such route or public file)",
    ]);
  });

  it("maps each kind of target from the tables", () => {
    const r = (t: string, from = "docs/adr/0010-x.md") => rewriteLinks(`[a](${t})`, from, ctx);
    expect(r("../language-reference.md#x")).toBe("[a](/reference#x)");
    expect(r("../error-codes.md")).toBe("[a](/errors)");
    expect(r("../error-codes.md#W_SCALE_OVERFLOW")).toBe("[a](/errors#w-scale-overflow)");
    expect(r("../error-codes.md#w_scale_overflow")).toBe("[a](/errors#w-scale-overflow)");
    // GitHub drops an em dash and leaves `--`; VitePress keeps the dash: the anchor is looked up in the target.
    expect(r("../language-reference.md#vertical-circulation--stair-elevator-escalator-v121")).toBe(
      "[a](/reference#vertical-circulation-—-stair-elevator-escalator-v1-21)",
    );
    expect(slugify("Door `kind` (v1.24)")).toBe("door-kind-v1-24");
    expect(r("0001-handwritten-parser-vs-lezer.md")).toBe("[a](/adr/0001-handwritten-parser-vs-lezer)");
    expect(r("../../schemas/plan.schema.json")).toBe("[a](/plan.schema.json)");
    expect(r("../../playground/index.html")).toBe(`[a](${PLAYGROUND})`);
    expect(r("../../CHANGELOG.md")).toBe("[a](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md)");
    expect(r("../../brand")).toBe("[a](https://github.com/ChanMeng666/archlang/tree/main/brand)");
    expect(r("https://example.com/a.md")).toBe("[a](https://example.com/a.md)");
    expect(r("#here")).toBe("[a](#here)");
    expect(r("/reference")).toBe("[a](/reference)");
    // A picture the doc shows by its repo path is served from `public/` at the site root.
    expect(r("../../docs-site/public/catalogue/wc.png")).toBe("[a](/catalogue/wc.png)");
    expect(rewriteLinks('<img src="../docs-site/public/catalogue/wc.png" width="240">', "docs/furniture.md", ctx)).toBe(
      '<img src="/catalogue/wc.png" width="240">',
    );
    // Any other picture keeps its path.
    expect(rewriteLinks('<img src="../examples/studio.svg">', "docs/furniture.md", ctx)).toBe(
      '<img src="../examples/studio.svg">',
    );
    expect(rewriteLinks("`[a](../x.md)`\n```\n[a](../CHANGELOG.md)\n```", "docs/a.md", ctx)).toBe(
      "`[a](../x.md)`\n```\n[a](../CHANGELOG.md)\n```",
    );
  });

  it("a fence closes only on a bare run of its own character at least as long", () => {
    // A four-backtick block quoting a three-backtick fence is ONE block: the inner ``` lines are
    // its content, so the link-like line between them stays literal, and the link after the
    // closing ```` is rewritten.
    const md = "````md\n```\n[a](error-codes.md)\n```\n````\n[b](error-codes.md)";
    expect(rewriteLinks(md, "docs/a.md", ctx)).toBe("````md\n```\n[a](error-codes.md)\n```\n````\n[b](/errors)");
    expect(linksOf(md)).toEqual(["error-codes.md"]);
    // A tilde run does not close a backtick fence; a marker with an info string closes nothing.
    const mixed = "```\n~~~\n[a](error-codes.md)\n``` x\n```\n[b](error-codes.md)";
    expect(rewriteLinks(mixed, "docs/a.md", ctx)).toBe("```\n~~~\n[a](error-codes.md)\n``` x\n```\n[b](/errors)");
    expect(linksOf(mixed)).toEqual(["error-codes.md"]);
    // A fenced `## heading` is not a heading.
    expect(headingIds("````\n```\n## Not a heading\n```\n````\n## Real").map((h: { vp: string }) => h.vp)).toEqual([
      "real",
    ]);
  });

  it("a fence marker is indented <= 3 spaces, and a backtick opener's info string holds no backtick", () => {
    // Indented 4 spaces: indented code, which opens no fence, so the link after it is rewritten.
    const indented = "    ```\n[a](error-codes.md)\n```\n[b](error-codes.md)\n```";
    expect(rewriteLinks(indented, "docs/a.md", ctx)).toBe("    ```\n[a](/errors)\n```\n[b](error-codes.md)\n```");
    expect(linksOf(indented)).toEqual(["error-codes.md"]);
    // Up to 3 spaces still opens a fence.
    expect(linksOf("   ```\n[a](error-codes.md)\n   ```\n[b](x.md)")).toEqual(["x.md"]);
    // ```` ``` a`b ```` is a code span in a paragraph, not a fence: the next line is prose.
    const span = "``` a`b\n[a](error-codes.md)";
    expect(rewriteLinks(span, "docs/a.md", ctx)).toBe("``` a`b\n[a](/errors)");
    expect(linksOf(span)).toEqual(["error-codes.md"]);
    // A tilde opener may carry a backtick.
    expect(linksOf("~~~ a`b\n[a](error-codes.md)\n~~~")).toEqual([]);
    expect(fenceStep(null, "``` a`b")).toEqual({ open: null, marker: false });
    expect(fenceStep(null, "   ~~~ a`b")).toEqual({ open: "~~~", marker: true, info: "a`b" });
  });

  it("heading ids skip HTML comments and honour an explicit {#id}, as VitePress does", () => {
    const ids = (md: string) => (headingIds(md) as Array<{ vp: string; gh: string }>).map((h) => [h.vp, h.gh]);
    // A `#` line in an HTML comment block (one line or many) is no heading; <= 3 spaces of indent is.
    expect(ids("<!-- ## a -->\n<!--\n## In a comment\n-->\n   ## Kept")).toEqual([["kept", "kept"]]);
    // `{#id}` is the VitePress id; GitHub has no attribute blocks and slugs the whole text.
    expect(ids("## Title {#custom-id}")).toEqual([["custom-id", "title-custom-id"]]);
    // A block holding more than an id: the id is still the one, the class is stripped from the text.
    expect(ids("## Title {#a .b}\n## Other {.b}")).toEqual([
      ["a", "title-a-b"],
      ["other", "other-b"],
    ]);
    // An explicit id takes its place in the registry: a later heading slugged to it is suffixed,
    // and an explicit id that repeats an earlier slug is kept as written (VitePress refuses that build).
    expect(ids("## My id\n## Named {#my-id}\n## My id")).toEqual([
      ["my-id", "my-id"],
      ["my-id", "named-my-id"],
      ["my-id-1", "my-id-1"],
    ]);
    // A link to the explicit id is kept; a GitHub-spelled one is re-spelled to it, not to a phantom.
    const src = "# Errors\n## Title {#custom-id}";
    const withSrc = { ...ctx, sourceOf: (p: string) => (p === "docs/error-codes.md" ? src : ctx.sourceOf(p)) };
    expect(rewriteLinks("[a](error-codes.md#custom-id)", "docs/a.md", withSrc)).toBe("[a](/errors#custom-id)");
    expect(rewriteLinks("[a](error-codes.md#title-custom-id)", "docs/a.md", withSrc)).toBe("[a](/errors#custom-id)");
    // The site check reads the same ids, so a correct `#custom-id` link is no false red.
    expect((headingIds(src) as Array<{ vp: string }>).map((h) => h.vp)).toEqual(["errors", "custom-id"]);
  });

  it("heading text keeps a code span verbatim and drops tags only outside one, as VitePress does", () => {
    const vp = (md: string) => (headingIds(md) as Array<{ vp: string }>).map((h) => h.vp);
    expect(vp("## The `<arch-plan>` element")).toEqual(["the-arch-plan-element"]);
    expect(vp("## The <b>bold</b> one")).toEqual(["the-bold-one"]);
    expect(vp("## `[a](b)` and [c](d)")).toEqual(["a-b-and-c"]);
    expect(vp("## `` a`b `` x")).toEqual(["a-b-x"]);
    expect(vp("## Unclosed ` <i>tick</i>")).toEqual(["unclosed-tick"]);
  });

  // VitePress's own markdown parser (the one `docs:build` uses) gives every heading of every
  // published page its id; the shared rule must give the same ids, in order.
  const vitepress = existsSync("node_modules/vitepress/package.json");
  it.skipIf(!vitepress && !process.env.CI)(
    `every published page's heading ids match VitePress's renderer${vitepress ? "" : " (SKIPPED: vitepress not installed)"}`,
    async () => {
      const { createMarkdownRenderer } = await import("vitepress");
      const md = await createMarkdownRenderer("docs-site", {}, "/");
      const pages = [...new Set([...ctx.pages.map(([s]) => s), ...adrs.map((f) => `docs/adr/${f}`)])];
      expect(pages.length).toBeGreaterThan(40);
      const diffs: string[] = [];
      for (const p of pages) {
        const src = readFileSync(p, "utf8");
        const want = md
          .parse(src, {})
          .filter((t) => t.type === "heading_open")
          .map((t) => t.attrGet("id"));
        const got = (headingIds(src) as Array<{ vp: string }>).map((h) => h.vp);
        if (JSON.stringify(want) !== JSON.stringify(got)) diffs.push(`${p}: ${JSON.stringify({ want, got })}`);
      }
      expect(diffs).toEqual([]);
    },
    60_000,
  );

  it("keeps a ?query, between the new path and the #fragment", () => {
    const r = (t: string, from = "docs/adr/0010-x.md") => rewriteLinks(`[a](${t})`, from, ctx);
    expect(r("../error-codes.md?x=1#W_SCALE_OVERFLOW")).toBe("[a](/errors?x=1#w-scale-overflow)");
    expect(r("../error-codes.md?x=1")).toBe("[a](/errors?x=1)");
    expect(r("0001-handwritten-parser-vs-lezer.md?x=1#frag")).toBe(
      "[a](/adr/0001-handwritten-parser-vs-lezer?x=1#frag)",
    );
    expect(r("../../CHANGELOG.md?plain=1#frag")).toBe(
      "[a](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md?plain=1#frag)",
    );
    expect(r("../../schemas/plan.schema.json?x=1")).toBe("[a](/plan.schema.json?x=1)");
  });
});
