/**
 * Shared fixtures + helpers for the docs-site E2E specs.
 *
 * NOTE for vitest: nothing under `docs-site/e2e/` is a unit test. The root vitest
 * `include` is `test/ ** /*.test.ts` (plus `playground/test/`), which matches neither this
 * file nor the `*.spec.ts` siblings — the suites never collide.
 *
 * The route lists below are DERIVED from `docs-site/sync-docs.mjs`, never retyped: adding
 * a doc page or an example extends this suite the day it lands. `scripts/smoke.mjs` and
 * `test/docs-sync-list.test.ts` parse the same three literal tables out of that file, which
 * is why they are declared in a uniform `["src", "dest"],` shape.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

/** Repo root, from this file (`docs-site/e2e/`). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SYNC = join(ROOT, "docs-site", "sync-docs.mjs");
const syncSrc = readFileSync(SYNC, "utf8");

/** Read one of sync-docs' literal `["src", "dest"],` tuple tables. */
function tupleTable(name: string): Array<[string, string]> {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(syncSrc);
  if (!block) throw new Error(`could not find \`const ${name} = [ … ];\` in ${SYNC} — has its shape changed?`);
  const rows = [...block[1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
  if (rows.length === 0) throw new Error(`\`${name}\` in ${SYNC} parsed to zero rows`);
  return rows;
}

/** `{ route, source }` for every raw-markdown copy the site publishes at `/<route>`. */
export const PAGE_ROUTES: ReadonlyArray<{ route: string; source: string }> = tupleTable("PAGES").map(([src, dest]) => ({
  route: `/${dest}`,
  source: src,
}));

/** The repo-root artifacts copied verbatim into `public/`, as site routes. */
export const ROOT_COPY_ROUTES: readonly string[] = tupleTable("ROOT_COPIES").map(([, dest]) => `/${dest}`);

/** The gallery, derived exactly as sync-docs derives it: examples/*.arch minus the excluded. */
export const GALLERY_EXAMPLES: readonly string[] = (() => {
  const excluded = new Set(tupleTable("EXCLUDED_EXAMPLES").map(([file]) => file));
  const dir = join(ROOT, "examples");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".arch") && statSync(join(dir, f)).isFile() && !excluded.has(f))
    .map((f) => f.replace(/\.arch$/, ""))
    .sort();
})();

/** Read a repo file, normalised to LF so a CRLF checkout can't fail a byte comparison. */
export const readRepoFile = (repoRelPath: string): string =>
  readFileSync(join(ROOT, repoRelPath), "utf8").replace(/\r\n/g, "\n");

/** The first ATX heading in some markdown — the human-legible "is this the right doc?" probe. */
export function firstHeading(markdown: string): string {
  const line = markdown.split("\n").find((l) => l.startsWith("# "));
  if (!line) throw new Error("markdown has no top-level `# ` heading");
  return line;
}

/**
 * The "generated from" banner `page()` prepends to the SITE page source. The RAW copy must
 * NOT carry it — machines get the canonical bytes, not a decorated variant — so this string
 * is the marker the route spec asserts is absent.
 */
export const BANNER_MARKER = "> _This page is generated from";

/** A plan whose only interesting feature is a label — the v-html escaping probe's carrier. */
export const labelledPlan = (label: string): string =>
  [
    'plan "E2E" {',
    "  units mm",
    "  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
    `  room id=main at (0,0) size 6000x4000 label ${JSON.stringify(label)}`,
    "}",
  ].join("\n");

/** A second plan, a different size, used to prove a re-render actually happened. */
export const RESIZED_PLAN = labelledPlan("Main").replace(/6000/g, "9000");

/**
 * Replace an ArchLive's whole source AND wait for the recompile to land.
 *
 * `v-model` on the textarea updates on `input`, and `svg` is a plain computed over
 * `compile()`, so the new drawing is synchronous once Vue flushes — but `fill()` returns
 * before that flush. Callers must await a visible consequence; `waitForSvgChange` below is
 * the general one.
 */
export async function setArchLiveSource(page: Page, index: number, src: string): Promise<void> {
  await page.locator(".archlive-editor textarea").nth(index).fill(src);
}

/** The current inline SVG markup of the nth ArchLive preview ("" when it is showing an error). */
export async function archLiveSvg(page: Page, index: number): Promise<string> {
  const svg = page.locator(".archlive-preview .archlive-svg svg").nth(index);
  return (await svg.count()) === 0 ? "" : ((await svg.innerHTML()) ?? "");
}

/** Wait until the nth ArchLive's rendered SVG differs from `before`. */
export async function waitForSvgChange(page: Page, index: number, before: string): Promise<string> {
  await expect.poll(() => archLiveSvg(page, index), { timeout: 10_000 }).not.toBe(before);
  return archLiveSvg(page, index);
}

/** Collector for console errors + page errors over a page's lifetime. */
export interface PageProblems {
  consoleErrors: string[];
  pageErrors: string[];
  dialogs: string[];
}

/** Start recording console/page problems and auto-dismissed dialogs. Attach BEFORE navigating. */
export function watchForProblems(page: Page): PageProblems {
  const problems: PageProblems = { consoleErrors: [], pageErrors: [], dialogs: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => problems.pageErrors.push(String(err)));
  // Playwright auto-dismisses dialogs when no handler is attached, which would hide an
  // `alert()` fired by injected markup — the exact thing the escaping probe looks for.
  page.on("dialog", async (d) => {
    problems.dialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });
  return problems;
}
