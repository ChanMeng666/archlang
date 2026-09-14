/**
 * The docs site's PER-PAGE METADATA gate.
 *
 * `docs-site/.vitepress/config.ts` carries one hand-written `PAGE_META` table: a
 * `<title>` fragment and a meta description for every route the site builds. Those
 * strings are EDITORIAL — no generator can produce "what does this page answer" —
 * which is exactly why they need a mechanical guard, and this is it. Three things it
 * pins, each of which has a matching real failure mode:
 *
 * 1. **Two-way route coverage.** A new page (a `docs-site/*.md`, a new row in
 *    sync-docs' `PAGES`, a new ADR) that nobody writes a row for would ship with the
 *    SITE description — which is how all 34 routes came to share one description and
 *    one social card in the first place. And an orphaned row is a description nobody
 *    will ever see, quietly rotting next to the ones that are live.
 * 2. **Shape.** 80–170 characters (shorter says nothing, longer is truncated by every
 *    engine that shows it), a sentence rather than a keyword list — keyword stuffing
 *    is the one tactic measured to HURT retrieval — and no character that could break
 *    out of the attribute it is interpolated into.
 * 3. **The killed claims.** The project's own positioning work retired
 *    "first"/"only"-style novelty claims and the Typst/LaTeX analogy as a
 *    DIFFERENTIATION claim; that analogy stays in body copy (README, `/guide`) and is
 *    deliberately absent from every `<title>`, description and JSON-LD string. Hype
 *    vocabulary is banned outright. This half is the mechanical part of that rule.
 *
 * The table is PARSED out of config.ts rather than imported: config.ts imports
 * `./theme/adr-data.js`, which sync-docs generates, so an importing test would fail on
 * a fresh checkout that has never built the site. Same reason `scripts/smoke.mjs` and
 * `test/docs-sync-list.test.ts` parse sync-docs' tuple tables.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIG = "docs-site/.vitepress/config.ts";
const SYNC = "docs-site/sync-docs.mjs";
const ROBOTS = "docs-site/public/robots.txt";

const configSrc = readFileSync(CONFIG, "utf8");
const syncSrc = readFileSync(SYNC, "utf8");

/** The exact home `<title>`, fixed by the programme's wording law. */
const HOME_TITLE = "ArchLang — floor plans as code, compiled to SVG, DXF and PDF";

const MIN_DESCRIPTION = 80;
const MAX_DESCRIPTION = 170;

/**
 * Claims and vocabulary that must never appear in a title or a description.
 * Each entry is `[regex, why]`, so a failure says what was decided and where.
 */
const KILLED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bLaTeX\b/i, "the Typst/LaTeX analogy stays in body copy; it is not a differentiation claim"],
  [/\bTypst\b/i, "the Typst/LaTeX analogy stays in body copy; it is not a differentiation claim"],
  // `first`/`only` as a NOVELTY claim. The lookbehind exempts a hyphen compound
  // ("AI-first", "read-only"), which describes a posture rather than claiming
  // primacy — the claim the project retired after auditing the prior art.
  [/(?<![-\w])first\b/i, "novelty claims were retired — there is documented prior art for the category"],
  [/(?<![-\w])only\b/i, "novelty claims were retired — there is documented prior art for the category"],
  [/Design Compiler/i, "a killed positioning line"],
  [/Code as CAD/i, "a killed positioning line"],
  [/checked design/i, "a killed positioning line — the checks are advisory, not a guarantee"],
  [/every clearance measured/i, "a killed claim — lint is advisory and does not measure every clearance"],
  [/game.?chang/i, "hype vocabulary"],
  [/revolutionar/i, "hype vocabulary"],
  [/seamless/i, "hype vocabulary"],
  [/effortless/i, "hype vocabulary"],
  [/cutting.edge/i, "hype vocabulary"],
  [/world.class/i, "hype vocabulary"],
  [/blazing/i, "hype vocabulary"],
  [/state.of.the.art/i, "hype vocabulary"],
  [/\b10x\b/i, "hype vocabulary"],
  [/\bmagic/i, "hype vocabulary"],
];

/** Function words a sentence has and a comma-separated keyword list does not. */
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "it",
  "its",
  "that",
  "with",
  "and",
  "or",
  "for",
  "so",
  "from",
  "to",
  "of",
  "in",
  "you",
  "each",
  "every",
]);

// ───────────────────────────────────────────────────────────────────────────────
// Parsing
// ───────────────────────────────────────────────────────────────────────────────

type Row = { route: string; title: string; description: string };

/**
 * `PAGE_META` out of config.ts. Rows are literal 3-tuples of double-quoted strings;
 * the match spans newlines because the formatter wraps a long row onto its own lines.
 */
function pageMeta(): Row[] {
  const block = /const PAGE_META = \[([\s\S]*?)\n\] as const;/.exec(configSrc);
  expect(
    block,
    `${CONFIG} no longer declares \`const PAGE_META = [ … ] as const;\` as a literal table. ` +
      `That table is the docs site's single source of SEO text and this gate parses it out of the ` +
      `file (config.ts cannot be imported here — it imports the generated theme/adr-data.js). ` +
      `Restore the shape, or update this parser in the same commit.`,
  ).toBeTruthy();
  const re = /\[\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",?\s*\]/g;
  const rows = [...block![1]!.matchAll(re)].map((m) => ({
    route: m[1]!,
    title: m[2]!,
    description: m[3]!,
  }));
  expect(rows.length, `PAGE_META in ${CONFIG} parsed to zero rows.`).toBeGreaterThan(0);
  return rows;
}

/** sync-docs' `["src", "dest"],` tables — the same shape test/docs-sync-list.test.ts reads. */
function tupleTable(name: string): Array<[string, string]> {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(syncSrc);
  expect(block, `${SYNC} no longer declares \`const ${name} = [ … ];\` as a literal table.`).toBeTruthy();
  return [...block![1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
}

/**
 * Every route VitePress builds, derived rather than listed:
 *   - the TRACKED top-level `docs-site/*.md` page sources (index.md → `/`);
 *   - sync-docs' `PAGES` destinations, which are generated and therefore untracked;
 *   - one route per `docs/adr/*.md`, copied FLAT into `docs-site/adr/`, plus the
 *     generated `/adr/` index.
 *
 * The tracked half comes from `git ls-files` on purpose: by the time this runs a docs
 * build may have dropped the generated pages into `docs-site/` too, and reading the
 * directory would then make the assertion depend on whether someone had built.
 */
function builtRoutes(): string[] {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "docs-site"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const staticPages = tracked
    .map((p) => p.slice("docs-site/".length))
    .filter((p) => p.endsWith(".md") && !p.includes("/"))
    .map((p) => (p === "index.md" ? "/" : `/${p.slice(0, -".md".length)}`));
  expect(
    staticPages,
    `no tracked top-level docs-site/*.md page sources were found — the derivation above is broken, ` +
      `which would make every coverage assertion below pass vacuously.`,
  ).toContain("/");

  const synced = tupleTable("PAGES").map(([, dest]) => `/${dest.replace(/\.md$/, "")}`);
  const adrs = readdirSync("docs/adr")
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .map((f) => `/adr/${f.replace(/\.md$/, "")}`);
  return [...new Set([...staticPages, ...synced, ...adrs, "/adr/"])].sort();
}

const ROWS = pageMeta();
const ROUTES = builtRoutes();

// ───────────────────────────────────────────────────────────────────────────────

describe("PAGE_META covers exactly the routes the docs site builds", () => {
  it("the derivation found a real, non-trivial route set", () => {
    // 5 static pages + 9 synced + 19 ADRs + the ADR index at the time of writing.
    expect(ROUTES.length).toBeGreaterThanOrEqual(30);
    for (const route of ["/", "/guide", "/reference", "/errors", "/spec", "/adr/"]) {
      expect(ROUTES).toContain(route);
    }
  });

  it("every built route has a PAGE_META row", () => {
    const covered = new Set(ROWS.map((r) => r.route));
    const missing = ROUTES.filter((r) => !covered.has(r));
    expect(
      missing,
      `these routes have no row in ${CONFIG}'s PAGE_META:\n` +
        missing.map((r) => `  - ${r}`).join("\n") +
        `\nWithout one they ship the SITE-WIDE title and description, which is how all 34 pages ` +
        `once shared a single description and a single social card. Add a row (the shape and the ` +
        `wording rules are in the comment above the table).`,
    ).toEqual([]);
  });

  it("no PAGE_META row is orphaned", () => {
    const real = new Set(ROUTES);
    const orphans = ROWS.map((r) => r.route).filter((r) => !real.has(r));
    expect(
      orphans,
      `these PAGE_META rows name routes the site does not build:\n` +
        orphans.map((r) => `  - ${r}`).join("\n") +
        `\nA row nobody reaches is a description that will never be seen and will never be ` +
        `reviewed. Delete it, or fix the route.`,
    ).toEqual([]);
  });

  it("no route is listed twice", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const { route } of ROWS) {
      if (seen.has(route)) dupes.push(route);
      seen.add(route);
    }
    expect(dupes, "a duplicated PAGE_META route — the later row silently wins").toEqual([]);
  });
});

describe("every description is a sentence a search result can show whole", () => {
  for (const { route, description } of ROWS) {
    it(`${route} — ${description.length} chars`, () => {
      expect(
        description.length,
        `${route}'s description is ${description.length} characters. Under ${MIN_DESCRIPTION} it ` +
          `says too little to be worth showing; over ${MAX_DESCRIPTION} every engine truncates it ` +
          `mid-thought.`,
      ).toBeGreaterThanOrEqual(MIN_DESCRIPTION);
      expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);

      expect(description, `${route}'s description has stray whitespace`).toBe(description.trim());
      expect(description, `${route}'s description has a double space`).not.toMatch(/ {2}/);
      expect(description.endsWith("."), `${route}'s description must end as a sentence does`).toBe(true);

      const words = description.split(/\s+/);
      expect(words.length, `${route}'s description is too short to read as prose`).toBeGreaterThanOrEqual(12);
      const functionWords = words.filter((w) => FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
      expect(
        functionWords.length,
        `${route}'s description reads as a keyword list rather than a sentence. Keyword stuffing ` +
          `is the one tactic measured to hurt retrieval — write the answer, in a sentence.`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("no title or description carries a killed claim, a hype word, or raw markup", () => {
  for (const { route, title, description } of ROWS) {
    it(`${route}`, () => {
      for (const text of [title, description]) {
        for (const [re, why] of KILLED) {
          expect(re.test(text), `${route}: ${JSON.stringify(text)} matches ${re} — ${why}.`).toBe(false);
        }
        // These strings are interpolated into HTML attributes and into a JSON-LD body.
        // The escaping is VitePress's job, but a description that needs escaping is a
        // description someone wrote markup into by accident.
        expect(text, `${route}: metadata text must be plain prose, not markup`).not.toMatch(/[<>"]/);
      }
      expect(title.length, `${route}'s title fragment is empty`).toBeGreaterThan(0);
      expect(title, `${route}'s title has stray whitespace`).toBe(title.trim());
    });
  }
});

describe("the head wiring itself, which no page can prove on its own", () => {
  it("the home row is the exact agreed title", () => {
    const home = ROWS.find((r) => r.route === "/");
    expect(
      home?.title,
      `the home <title> is fixed wording: it has to fit a SERP (≤ 60 characters), carry the brand ` +
        `AND the category words (there is an unrelated "archlang.dev" that collides on the bare ` +
        `name), and match the README tagline. Change it only with the owner.`,
    ).toBe(HOME_TITLE);
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
  });

  it("every other title is a fragment the template completes, not a repeat of the brand", () => {
    for (const { route, title } of ROWS) {
      if (route === "/") continue;
      expect(
        title.endsWith("ArchLang"),
        `${route}'s title ends in "ArchLang", but titleTemplate already appends " — ArchLang".`,
      ).toBe(false);
      // ≤ 60 once the template has appended " — ArchLang" (11 characters).
      expect(title.length, `${route}'s title is too long to survive a SERP with the template`).toBeLessThanOrEqual(49);
    }
  });

  it("config.ts declares the language and the title template", () => {
    expect(configSrc).toMatch(/lang: "en-GB"/);
    expect(configSrc).toMatch(/titleTemplate: ":title — ArchLang"/);
  });

  it("the static head carries no og:title/og:description/twitter:* that could outrank a page's own", () => {
    const head = /^ {2}head: \[([\s\S]*?)^ {2}\],$/m.exec(configSrc);
    expect(head, `${CONFIG} no longer declares a top-level \`head: [ … ],\` block.`).toBeTruthy();
    // Comment lines out: the block carries a comment SAYING these four are absent.
    const code = head![1]!
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    for (const key of ["og:title", "og:description", "twitter:title", "twitter:description"]) {
      expect(
        code.includes(key),
        `${CONFIG}'s static \`head\` sets ${key}. A static value there describes all ${ROUTES.length} ` +
          `routes identically — which is the exact defect PAGE_META exists to fix. Per-page values ` +
          `are emitted from transformHead.`,
      ).toBe(false);
    }
  });

  it("transformHead falls back instead of throwing on a route the table does not know", () => {
    // transformHead runs per page at build time and an exception there fails
    // `docs:build` with a stack trace and no page context. The 404 page reaches it.
    expect(
      configSrc,
      `transformHead must look PAGE_META up defensively — \`const meta = PAGE_META_BY_ROUTE.get(route); ` +
        `if (!meta) return [];\` — so an unlisted route (the 404) falls back to the site defaults.`,
    ).toMatch(/const meta = PAGE_META_BY_ROUTE\.get\(route\);\s*\n\s*if \(!meta\) return \[\];/);
  });

  it("robots.txt allows every crawler by name and points at the sitemap", () => {
    const robots = readFileSync(ROBOTS, "utf8");
    expect(
      robots,
      `${ROBOTS} must end with the sitemap location — a robots file without one is the cheapest ` +
        `discovery signal left unspent.`,
    ).toContain("Sitemap: https://archlang.uk/sitemap.xml");
    // The policy is allow-everything, training crawlers included (owner decision).
    for (const ua of ["OAI-SearchBot", "ClaudeBot", "PerplexityBot", "GPTBot", "Google-Extended", "CCBot"]) {
      expect(robots, `${ROBOTS} no longer names ${ua}`).toContain(`User-agent: ${ua}`);
    }
    expect(robots, `${ROBOTS} must not disallow anything — the policy is allow-everything`).not.toMatch(
      /^Disallow: \S/m,
    );
  });
});
