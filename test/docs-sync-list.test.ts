/**
 * Docs-site sync gate — the hand-written lists and the tracked copies inside
 * `docs-site/`, neither of which any build step compares against its source.
 *
 * 1. THE EXAMPLE GALLERY LIST. `docs-site/sync-docs.mjs` hard-codes the example names it
 *    compiles into `public/examples/*.svg` and inlines into the live `<ArchLive>` widgets.
 *    A new `examples/*.arch` therefore ships to npm, the spec and the README while being
 *    invisible on the docs site — silently, because nothing reads the directory. (This is
 *    the same rot the ADR sidebar had before sync-docs started deriving it: a hand-list
 *    frozen at 0005 while `docs/adr/` grew to 0014.) Adding an example is now a two-file
 *    change or an explicit decision, never an oversight: every `examples/*.arch` must be in
 *    sync-docs' list or in EXCLUDED below, with a reason.
 *
 * 2. THE TRACKED GENERATED COPIES. `docs-site/.gitignore` lists the sync-docs outputs, but
 *    three of them predate that ignore and are still TRACKED (`git ls-files` shows them):
 *    `docs-site/intent.md`, `docs-site/public/intent.md`, `docs-site/public/intent.schema.json`.
 *    A tracked generated file is a stale copy waiting to happen — the repo would ship one
 *    `intent.md` in `docs/` and a different one on the site. These assert the committed
 *    bytes still equal what sync-docs would write from the canonical sources.
 *    NOTE for WS-D: if those three get untracked, replace these cases with a `git ls-files`
 *    assertion that no sync-docs output is tracked at all.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SYNC = "docs-site/sync-docs.mjs";

/**
 * Examples deliberately absent from the docs gallery. One comment per entry — an example
 * lands here only for a reason that would survive review, never to green this test.
 */
const EXCLUDED: ReadonlyArray<readonly [string, string]> = [
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

/** The hard-coded `const examples = [ … ]` gallery list in sync-docs.mjs. */
function galleryList(): string[] {
  const text = readFileSync(SYNC, "utf8");
  const m = text.match(/const examples = \[([\s\S]*?)\];/);
  expect(
    m,
    `${SYNC} no longer declares \`const examples = [ … ]\` — that array IS the docs gallery, ` +
      `and this gate's anchor. If it became derived from readdirSync("examples"), delete this test.`,
  ).toBeTruthy();
  return [...m![1]!.matchAll(/"([^"]+)"/g)].map((e) => e[1]!);
}

/** Every `examples/*.arch` (top level only — `examples/lib/` holds component libraries). */
const exampleFiles = (): string[] =>
  readdirSync("examples")
    .filter((f) => f.endsWith(".arch") && statSync(join("examples", f)).isFile())
    .sort();

describe("the docs example gallery lists every examples/*.arch (or excludes it on purpose)", () => {
  const listed = galleryList();
  const excluded = new Map(EXCLUDED);

  it("the list is non-trivial and names the flagships", () => {
    expect(listed.length).toBeGreaterThan(5);
    for (const flagship of ["studio", "museum", "aquarium", "gallery-l"]) expect(listed).toContain(flagship);
  });

  it("every example is either published or explicitly excluded", () => {
    const missing = exampleFiles().filter((f) => !listed.includes(f.replace(/\.arch$/, "")) && !excluded.has(f));
    expect(
      missing,
      `examples/*.arch that the docs site would never show:\n` +
        missing.map((f) => `  - ${f}`).join("\n") +
        `\nAn example not in ${SYNC}'s \`examples\` array gets no gallery SVG and no live ` +
        `<ArchLive> widget — it ships everywhere else and is invisible on the site. Either add ` +
        `its name to that array, or add it to EXCLUDED in this test with the reason it stays off.`,
    ).toEqual([]);
  });

  it("nothing in the list points at a file that no longer exists", () => {
    const files = new Set(exampleFiles());
    const dangling = listed.filter((n) => !files.has(`${n}.arch`));
    expect(
      dangling,
      `${SYNC} lists example(s) with no source file: ${dangling.join(", ")}. sync-docs reads each ` +
        `name with readFileSync, so the docs build would crash. Remove the name or restore the file.`,
    ).toEqual([]);
  });

  it("EXCLUDED names real files (a stale exclusion hides a new example)", () => {
    const files = new Set(exampleFiles());
    for (const [name] of EXCLUDED) {
      expect(files.has(name), `EXCLUDED names examples/${name}, which no longer exists — drop the entry.`).toBe(true);
    }
  });

  it("no example is both listed and excluded", () => {
    for (const [name] of EXCLUDED) expect(listed).not.toContain(name.replace(/\.arch$/, ""));
  });
});

describe("the docs-site copies that are still TRACKED equal their canonical sources", () => {
  const sync = readFileSync(SYNC, "utf8");

  /** sync-docs' page() banner, replicated here — the assertions below are only as good as this. */
  const banner = (src: string) =>
    `> _This page is generated from [\`${src}\`](https://github.com/chanmeng666/archlang/blob/main/${src}) — edit it there._\n\n`;

  it("sync-docs still writes the banner this test replicates", () => {
    // Pieces, not the whole template literal — the interpolation between them is `${src}`,
    // which cannot be written here without Biome reading it as an accidental placeholder.
    const stale =
      `${SYNC}'s page() banner changed shape, so the expectations below are stale. Update \`banner()\` ` +
      `in this test to match, then re-run \`npm run docs:build\` to rewrite the tracked copies.`;
    for (const piece of [
      "`> _This page is generated from [\\`",
      "\\`](https://github.com/chanmeng666/archlang/blob/main/",
      "— edit it there._\\n\\n`",
    ]) {
      expect(sync, stale).toContain(piece);
    }
  });

  it("docs-site/intent.md is docs/intent.md plus the generated banner", () => {
    expect(
      readFileSync("docs-site/intent.md", "utf8"),
      `docs-site/intent.md (TRACKED, though .gitignore lists it) drifted from docs/intent.md. It is a ` +
        `sync-docs OUTPUT — never hand-edit it. Edit docs/intent.md and run \`npm run docs:build\` ` +
        `(or \`node docs-site/sync-docs.mjs\`), then commit the regenerated copy.`,
    ).toBe(banner("docs/intent.md") + readFileSync("docs/intent.md", "utf8"));
  });

  it("docs-site/public/intent.md is the raw, unbannered docs/intent.md", () => {
    expect(
      readFileSync("docs-site/public/intent.md", "utf8"),
      `docs-site/public/intent.md drifted from docs/intent.md. That file is served verbatim at ` +
        `/intent.md — the append-\`.md\` machine route llms.txt advertises — so it must be the raw ` +
        `canonical markdown, no banner. Regenerate with \`npm run docs:build\`.`,
    ).toBe(readFileSync("docs/intent.md", "utf8"));
  });

  it("docs-site/public/intent.schema.json is a byte copy of schemas/intent.schema.json", () => {
    const want = readFileSync("schemas/intent.schema.json");
    expect(
      readFileSync("docs-site/public/intent.schema.json").equals(want),
      `docs-site/public/intent.schema.json drifted from schemas/intent.schema.json. Both are ` +
        `generated (\`npm run gen:intent-schema\`) and the site copy is a plain copyFileSync — never ` +
        `hand-edit either. Regenerate the schema, then \`npm run docs:build\`.`,
    ).toBe(true);
  });
});
