/**
 * The site copies of the canonical docs (PAGES + docs/adr/*.md) must not carry repo-relative
 * links: `../CHANGELOG.md` or `README.md` resolve on GitHub and 404 on archlang.uk (GSC "Not
 * found", 2026-11-09). `docs-site/link-rewrite.mjs` maps them from the sync-docs tables; this runs
 * it over every source and asserts each link left is a known route, a public file or absolute, and
 * that a `#fragment` on a site route is the id VitePress gives one of the target page's headings
 * (it turns `_` into `-`: GitHub's `#w_scale_overflow` is `/errors#w-scale-overflow` here).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without declarations
import { headingIds, rewriteLinks, routeOfDest, slugify } from "../docs-site/link-rewrite.mjs";

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

/** Every inline/reference link target outside fenced code and inline code spans. */
function linksOf(md: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      fence = fence === null ? f[1]![0]! : f[1]![0] === fence ? null : fence;
      continue;
    }
    if (fence !== null) continue;
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
function problems(md: string): string[] {
  const bad: string[] = [];
  for (const link of linksOf(md)) {
    if (link.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    const [pathAndQuery = "", frag] = link.split("#");
    const path = pathAndQuery.split("?")[0]!;
    if (path.endsWith(".md")) bad.push(`${link} (still .md)`);
    else if (!path.startsWith("/")) bad.push(`${link} (still repo-relative)`);
    else if (!ROUTES.has(path) && !publicFile(path)) bad.push(`${link} (no such route or public file)`);
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
    expect(rewriteLinks("`[a](../x.md)`\n```\n[a](../CHANGELOG.md)\n```", "docs/a.md", ctx)).toBe(
      "`[a](../x.md)`\n```\n[a](../CHANGELOG.md)\n```",
    );
  });
});
