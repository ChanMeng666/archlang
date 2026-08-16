/**
 * Docs-site sync gate — the two things about `docs-site/sync-docs.mjs` that no build step
 * checks: what it deliberately leaves OUT, and what it writes that git must never hold.
 *
 * 1. THE EXAMPLE GALLERY. sync-docs used to hard-code the example names it compiles into
 *    `public/examples/*.svg` and inlines into the live `<ArchLive>` widgets, so a new
 *    `examples/*.arch` shipped to npm, the spec and the README while being invisible on
 *    the docs site — silently, because nothing read the directory. It now DERIVES the
 *    gallery from `readdirSync("examples")` minus an explicit `EXCLUDED_EXAMPLES` table,
 *    which makes that staleness structurally impossible. So this half no longer guards a
 *    hand-list; it guards the two things derivation cannot: that the derivation is still
 *    what sync-docs does, and that every EXCLUSION is a conscious, still-valid decision
 *    (an exclusion whose file is gone, or one nobody documented, hides an example just as
 *    effectively as the old frozen list did).
 *
 *    Plus the ONE hand-list that survives: `docs-site/examples.md` names each example in
 *    prose, so a new example gets a gallery SVG automatically but no widget on the page
 *    unless someone writes about it. That gap is asserted here.
 *
 * 2. NOTHING SYNC-DOCS WRITES IS TRACKED. `docs-site/.gitignore` lists the outputs, but
 *    three of them predated that ignore and were still tracked (`docs-site/intent.md`,
 *    `docs-site/public/intent.md`, `docs-site/public/intent.schema.json`) — a tracked
 *    generated file is a stale copy waiting to happen, one `intent.md` in `docs/` and a
 *    different one on the site. They were untracked in WS-D; this asserts the class stays
 *    empty, deriving the full output list from sync-docs' own source tables rather than
 *    naming those three.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SYNC = "docs-site/sync-docs.mjs";
const GALLERY_PAGE = "docs-site/examples.md";
const syncSrc = readFileSync(SYNC, "utf8");

/**
 * Examples deliberately absent from the docs gallery — the expectation half of the guard.
 * One comment per entry: an example lands here only for a reason that would survive
 * review, never to green this test. sync-docs.mjs carries the same set (with the same
 * reasons) in its `EXCLUDED_EXAMPLES` table; the cases below weld the two together.
 */
const EXPECTED_EXCLUSIONS: ReadonlyArray<readonly [string, string]> = [
  // Resolves `import "lib/…"` through the World seam (file I/O). The gallery compiles with
  // the pure browser-safe `compile()` and no World, so it cannot be rendered here.
  ["imports.arch", "needs the World seam to read examples/lib/*.arch"],
  // Imports its sibling `museum-wing.arch` as a whole-file component — same World-seam
  // dependency as above, so the composed building cannot compile in a live widget.
  ["museum-wings.arch", "imports museum-wing.arch through the World seam"],
  // The component HALF of that pair: a wing drawn in local coordinates, published as a
  // component source rather than as a building in its own right. It ships to the gallery
  // only via museum-wings, which is itself excluded.
  ["museum-wing.arch", "a component source, only meaningful as half of museum-wings"],
];

/**
 * Read one of sync-docs' literal `["src", "dest"],` tuple tables. They are declared in
 * that uniform shape so this test and `scripts/smoke.mjs` can both derive from them
 * instead of retyping the lists.
 */
function tupleTable(name: string): Array<[string, string]> {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(syncSrc);
  expect(
    block,
    `${SYNC} no longer declares \`const ${name} = [ … ];\` as a literal table. The three tables ` +
      `(PAGES, ROOT_COPIES, EXCLUDED_EXAMPLES) are the docs site's single source of truth for what ` +
      `it publishes, and both this gate and scripts/smoke.mjs parse them. Restore the shape, or ` +
      `update both parsers together.`,
  ).toBeTruthy();
  const rows = [...block![1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
  expect(rows.length, `\`${name}\` in ${SYNC} parsed to zero rows.`).toBeGreaterThan(0);
  return rows;
}

/** Every `examples/*.arch` (top level only — `examples/lib/` holds component libraries). */
const exampleFiles = (): string[] =>
  readdirSync("examples")
    .filter((f) => f.endsWith(".arch") && statSync(join("examples", f)).isFile())
    .sort();

/** The gallery sync-docs derives: every top-level example minus the excluded ones. */
function galleryExamples(): string[] {
  const excluded = new Set(tupleTable("EXCLUDED_EXAMPLES").map(([file]) => file));
  return exampleFiles()
    .filter((f) => !excluded.has(f))
    .map((f) => f.replace(/\.arch$/, ""));
}

describe("the docs example gallery is derived, and every exclusion is deliberate", () => {
  it("sync-docs derives the gallery from the directory, not a hand-written list", () => {
    const why =
      `${SYNC} no longer derives its example gallery from \`readdirSync\` over \`examples/\`. A ` +
      `hand-written list freezes: an example added to the repo would ship to npm, the spec and the ` +
      `README while staying invisible on the docs site. Keep the derivation; put a deliberate ` +
      `omission in EXCLUDED_EXAMPLES (with its reason) instead.`;
    expect(syncSrc, why).toMatch(/const examples = readdirSync\(join\(repo, "examples"\)\)/);
    expect(syncSrc, why).toMatch(/!excluded\.has\(f\)/);
    // The old frozen array must not creep back in alongside the derivation.
    expect(syncSrc, why).not.toMatch(/const examples = \[/);
  });

  it("sync-docs' EXCLUDED_EXAMPLES is exactly the set documented here", () => {
    expect(
      tupleTable("EXCLUDED_EXAMPLES")
        .map(([file]) => file)
        .sort(),
      `${SYNC}'s EXCLUDED_EXAMPLES no longer matches EXPECTED_EXCLUSIONS in this test. Every ` +
        `exclusion keeps a real example off the public site, so it is a decision, not a detail: ` +
        `update this test's list — with the reason, as a comment — in the same commit that changes ` +
        `sync-docs, so the two are reviewed together.`,
    ).toEqual(EXPECTED_EXCLUSIONS.map(([file]) => file).sort());
  });

  it("each exclusion still names a real file (a stale one hides a new example)", () => {
    const files = new Set(exampleFiles());
    for (const [name] of EXPECTED_EXCLUSIONS) {
      expect(
        files.has(name),
        `EXCLUDED_EXAMPLES names examples/${name}, which no longer exists. A stale exclusion is ` +
          `dead weight at best; at worst a future example reusing that name is silently hidden. ` +
          `Drop the entry from ${SYNC} and from this test.`,
      ).toBe(true);
    }
  });

  it("the derived gallery is non-trivial and carries the flagships", () => {
    const gallery = galleryExamples();
    expect(gallery.length).toBeGreaterThan(5);
    for (const flagship of ["studio", "museum", "aquarium", "gallery-l", "laneway-house", "library"])
      expect(gallery).toContain(flagship);
  });

  it("the examples PAGE shows every gallery example (the one surviving hand-list)", () => {
    const page = readFileSync(GALLERY_PAGE, "utf8");
    const missing = galleryExamples().filter((n) => !page.includes(`EXAMPLES['${n}']`));
    expect(
      missing,
      `${GALLERY_PAGE} has no live <ArchLive> widget for:\n` +
        missing.map((n) => `  - ${n}`).join("\n") +
        `\nsync-docs now derives the gallery SVGs from the directory, so these DO get a ` +
        `/examples/<name>.svg — but the page itself is hand-written prose, so the example is still ` +
        `invisible to a reader. Add a section with <ArchLive :src="EXAMPLES['<name>']" />, or ` +
        `exclude the example in ${SYNC}'s EXCLUDED_EXAMPLES with a reason.`,
    ).toEqual([]);
  });
});

describe("no sync-docs output is tracked by git", () => {
  /**
   * Every path sync-docs writes, relative to the repo root — derived from its own source
   * tables plus the two directories it reads, so a new page or artifact is covered the day
   * it is added.
   */
  function outputPaths(): string[] {
    const pages = tupleTable("PAGES").map(([, dest]) => dest);
    const rootCopies = tupleTable("ROOT_COPIES").map(([, dest]) => dest);
    const adrs = readdirSync("docs/adr").filter((f) => f.endsWith(".md") && f !== "index.md");
    return [
      // page(): the bannered page source AND the raw copy served at /<dest>.
      ...pages.map((d) => `docs-site/${d}`),
      ...pages.map((d) => `docs-site/public/${d}`),
      ...rootCopies.map((d) => `docs-site/public/${d}`),
      ...adrs.map((f) => `docs-site/adr/${f}`),
      "docs-site/adr/index.md",
      ...galleryExamples().map((n) => `docs-site/public/examples/${n}.svg`),
      "docs-site/.vitepress/theme/adr-data.js",
      "docs-site/.vitepress/theme/examples-data.js",
    ];
  }

  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z", "docs-site"], { encoding: "utf8" }).split("\0").filter(Boolean),
  );

  it("git tracks docs-site at all (so the assertion below cannot pass vacuously)", () => {
    expect(tracked.has("docs-site/sync-docs.mjs")).toBe(true);
    expect(tracked.size).toBeGreaterThan(10);
  });

  it("every path sync-docs writes is untracked", () => {
    const paths = outputPaths();
    expect(paths.length, "derived zero output paths — the derivation above is broken").toBeGreaterThan(20);
    const leaked = paths.filter((p) => tracked.has(p));
    expect(
      leaked,
      `these files are GENERATED by ${SYNC} on every docs build, yet git tracks them:\n` +
        leaked.map((p) => `  - ${p}`).join("\n") +
        `\nA tracked generated file is a stale copy waiting to happen: the repo would ship one ` +
        `version in docs/ and a different one on the site, and every docs build would leave the ` +
        `tree dirty. docs-site/.gitignore already lists them — run \`git rm --cached <path>\` ` +
        `(exactly how docs-site/intent.md, public/intent.md and public/intent.schema.json were fixed).`,
    ).toEqual([]);
  });

  it("docs-site/.gitignore covers every output, so none can be re-added", () => {
    const paths = outputPaths();
    // `--stdin -z` (NUL in, NUL out) rather than argv: the path list is long, and a filename
    // is not shell-safe in general. `git check-ignore` exits 1 when NOTHING matches, which
    // execFileSync throws on — and an empty match set is itself the failure this case
    // reports, so swallow the status and read stdout either way.
    let stdout = "";
    try {
      stdout = execFileSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
        encoding: "utf8",
        input: paths.join("\0"),
      });
    } catch (e) {
      stdout = (e as { stdout?: string }).stdout ?? "";
    }
    const ignored = new Set(stdout.split("\0").filter(Boolean));
    const uncovered = paths.filter((p) => !ignored.has(p));
    expect(
      uncovered,
      `docs-site/.gitignore does not cover these ${SYNC} outputs:\n` +
        uncovered.map((p) => `  - ${p}`).join("\n") +
        `\nAn uncovered output shows up as an untracked file after every docs build and will be ` +
        `committed by the first \`git add -A\`. Add it to docs-site/.gitignore.`,
    ).toEqual([]);
  });
});
