/**
 * The live-fence gate — every ```arch block the docs site turns into a running compiler
 * must actually compile.
 *
 * `docs-site/.vitepress/config.ts` rewrites EVERY plain ```` ```arch ```` fence into a live,
 * editable `<ArchLive>` widget that calls `compile()` in the reader's browser. That is a
 * feature, and it is also a loaded gun: an *illustrative fragment* — a lone `room …` line
 * shown to explain a clause — is not a plan, so the widget renders a red error card on the
 * public page instead of a drawing. The escape hatch is a `static` info token
 * (```` ```arch static ````), which keeps ArchLang syntax highlighting and drops the compile.
 *
 * Nothing enforced the choice, and both halves of it had rotted on production:
 *
 *   - https://archlang.uk/relational — the opening fragment fence showed
 *     `Expected "plan" but found "room"`.
 *   - https://archlang.uk/errors — 104 of the error-catalog examples showed an error card,
 *     and worse, mostly the WRONG error: `E_ARC_RADIUS`'s example rendered
 *     `Expected "plan" but found "wall"`, which is not the code the section documents.
 *     (Fixed at the source: `scripts/gen-error-codes.ts` now emits `arch static`.)
 *
 * `npm run docs:build` does not catch this — the fence compiles at RUNTIME, in the reader's
 * browser, so the build is green and the page is broken. This test is the only gate.
 *
 * WHAT IS CHECKED: for every PUBLISHED Markdown page — the hand-written `docs-site/*.md`
 * pages plus the repo-side SOURCES that `sync-docs.mjs` publishes (its `PAGES` table, and
 * `docs/adr/*`) — every ```` ```arch ```` fence whose info string does not carry `static`
 * must compile with zero errors. Warnings are fine: a doc example is allowed to be
 * architecturally imperfect, it just may not fail to compile.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const SYNC = "docs-site/sync-docs.mjs";
const CONFIG = "docs-site/.vitepress/config.ts";

/**
 * The repo-side sources of the pages `sync-docs.mjs` copies into the site. Parsed out of
 * its literal `PAGES` table — the same single source of truth `test/docs-sync-list.test.ts`
 * and `scripts/smoke.mjs` read — because the site copies themselves are GENERATED (and
 * untracked), so the thing to check is the source in `docs/` or at the repo root.
 */
function syncedPageSources(): string[] {
  const src = readFileSync(SYNC, "utf8");
  const block = /const PAGES = \[([\s\S]*?)\n\];/.exec(src);
  expect(
    block,
    `${SYNC} no longer declares \`const PAGES = [ … ];\` as a literal table. Both this gate and ` +
      `test/docs-sync-list.test.ts parse it to learn which repo docs become site pages — restore ` +
      `the shape, or update both parsers together.`,
  ).toBeTruthy();
  const rows = [...block![1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => m[1]!);
  expect(rows.length, `\`PAGES\` in ${SYNC} parsed to zero rows.`).toBeGreaterThan(0);
  return rows;
}

/** Tracked Markdown under a path spec (so generated site copies never appear). */
function tracked(...pathspec: string[]): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspec], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
}

/**
 * Every Markdown file that reaches the public site: the hand-written top-level
 * `docs-site/*.md` pages, the repo sources behind the synced pages, and the ADRs (copied
 * verbatim into `docs-site/adr/`).
 */
function publishedPages(): string[] {
  return [...new Set([...tracked("docs-site/*.md"), ...syncedPageSources(), ...tracked("docs/adr/*.md")])].sort();
}

interface Fence {
  file: string;
  /** 1-based line of the opening fence marker. */
  line: number;
  /** The info string, trimmed (e.g. `arch`, `arch static`). */
  info: string;
  body: string;
}

/**
 * Every fenced code block in one file. A fence opens on a run of >= 3 backticks or tildes
 * and closes on a run of the SAME character at least as long, which is what keeps a
 * ```` ```` ```` -delimited block quoting a ```` ``` ```` fence from being mis-split.
 */
function fences(file: string): Fence[] {
  const out: Fence[] = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let open: { marks: string; line: number; info: string; body: string[] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      if (marker && marker[1]![0] === open.marks[0] && marker[1]!.length >= open.marks.length && !marker[2]!.trim()) {
        out.push({ file, line: open.line, info: open.info, body: open.body.join("\n") });
        open = null;
      } else open.body.push(line);
      continue;
    }
    if (marker) open = { marks: marker[1]!, line: i + 1, info: marker[2]!.trim(), body: [] };
  }
  if (open) out.push({ file, line: open.line, info: open.info, body: open.body.join("\n") });
  return out;
}

/**
 * The docs-site fence rule, restated: the FIRST info token selects the language, and a
 * later bare `static` token opts out of the live rewrite. Kept in lockstep with
 * `docs-site/.vitepress/config.ts` by the "the convention is still what config.ts
 * implements" case below.
 */
function isLive(info: string): boolean {
  const tokens = info.trim().split(/\s+/);
  return tokens[0] === "arch" && !tokens.slice(1).includes("static");
}

const pages = publishedPages();
const allFences = pages.flatMap(fences);
const archFences = allFences.filter((f) => /(^|\s)arch(\s|$)/.test(f.info));

describe("every live ```arch fence on the public docs site compiles", () => {
  it("the page set is real (so a green run cannot be vacuous)", () => {
    for (const required of ["docs-site/relational.md", "docs/error-codes.md", "docs/language-reference.md"]) {
      expect(pages, `${required} must be in the published page set`).toContain(required);
    }
    expect(pages.length).toBeGreaterThan(10);
    expect(archFences.length, "found no ```arch fences at all — the fence scanner is broken").toBeGreaterThan(50);
    expect(
      archFences.some((f) => isLive(f.info)),
      "no LIVE fence left — did every page get marked static?",
    ).toBe(true);
  });

  it("no live fence renders an error card to the reader", () => {
    const broken = archFences
      .filter((f) => isLive(f.info))
      .map((f) => ({ f, errors: compile(f.body, { noCache: true }).diagnostics.filter((d) => d.severity === "error") }))
      .filter((r) => r.errors.length > 0);
    const report = broken
      .map(({ f, errors }) => {
        const e = errors[0]!;
        return `  ${f.file}:${f.line}  \`\`\`${f.info}\n        ${e.code ? `[${e.code}] ` : ""}${e.message}`;
      })
      .join("\n\n");
    expect(
      broken.map(({ f }) => `${f.file}:${f.line}`),
      broken.length === 0
        ? ""
        : `These \`\`\`arch fences are published on the docs site as LIVE <ArchLive> widgets, and each ` +
            `one fails to compile — so the public page shows a red error card where a floor plan ` +
            `should be:\n\n${report}\n\n` +
            `\`npm run docs:build\` cannot catch this: the fence compiles in the READER's browser, ` +
            `not at build time.\n\n` +
            `TWO FIXES, pick per case:\n` +
            `  1. If it is meant to be a runnable example, make it a full compilable plan ` +
            `(\`plan "…" { … }\`).\n` +
            `  2. If it is an illustrative FRAGMENT or a deliberate error demo, mark the fence ` +
            `\`\`\`arch static — it keeps ArchLang syntax highlighting and skips the live compile ` +
            `(see the escape hatch in ${CONFIG}).`,
    ).toEqual([]);
  });

  it("the live/static convention is still what config.ts implements", () => {
    // This gate re-implements the fence rule in `isLive()`. If the rule's convention ever
    // changes, that copy silently starts checking the wrong fences — so pin the rule's own
    // source on the two decisions it makes.
    const src = readFileSync(CONFIG, "utf8");
    const why =
      `${CONFIG}'s \`\`\`arch fence rule no longer matches the convention this test encodes in ` +
      `\`isLive()\`: the FIRST info token selects the language (\`arch\`) and a later bare ` +
      `\`static\` token opts out of the live <ArchLive> rewrite. If the convention changed on ` +
      `purpose, update \`isLive()\` and the fence info strings across docs/ + docs-site/ in the ` +
      `same commit — otherwise this gate quietly stops checking anything.`;
    expect(src, why).toMatch(/const attrs = info\.split\(\/\\s\+\/\)\.slice\(1\);/);
    expect(src, why).toMatch(/const lang = info\.split\(\/\\s\+\/\)\[0\]/);
    expect(src, why).toMatch(/if \(lang !== "arch" \|\| attrs\.includes\("static"\)\) return highlighted;/);
  });

  it("recognises the live form, the escape hatch, and every near-miss spelling", () => {
    expect(isLive("arch")).toBe(true);
    expect(isLive("arch static")).toBe(false);
    expect(isLive("arch static twoslash")).toBe(false);
    // Near misses. None of these go live — but none is the escape hatch either: the rule
    // keys on the FIRST token being exactly `arch`, so each also loses ArchLang
    // highlighting. The assertion below keeps them out of the published pages.
    expect(isLive("arch-static")).toBe(false);
    expect(isLive("static arch")).toBe(false);
    expect(isLive("archlang")).toBe(false); // a Shiki alias, but the rewrite rule wants `arch`
    expect(isLive("")).toBe(false);
  });

  it("no published fence uses a near-miss spelling of the escape hatch", () => {
    const suspects = allFences.filter((f) => {
      const info = f.info.trim();
      if (info === "arch" || info === "arch static") return false;
      return /arch/i.test(info) || /static/i.test(info);
    });
    expect(
      suspects.map((f) => `${f.file}:${f.line} \`\`\`${f.info}`),
      `A fence info string mentions \`arch\` or \`static\` but is neither \`arch\` (live) nor ` +
        `\`arch static\` (highlighted, not compiled). ${CONFIG} keys the language off the FIRST ` +
        `info token, so a spelling like \`arch-static\`, \`static arch\` or \`archlang\` silently ` +
        `drops ArchLang syntax highlighting — and reads as if it opted out of something it was ` +
        `never in. Write \`arch\` or \`arch static\`.`,
    ).toEqual([]);
  });
});
