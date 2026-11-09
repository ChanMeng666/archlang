/**
 * The playground's example table — welded to `examples/` in BOTH directions.
 *
 * `playground/src/examples.ts`'s `EXAMPLE_ROWS` is the single source of three
 * things at once: the editor's `<select>` menu, the 27 static per-example pages
 * `playground/scripts/gen-static.mjs` writes, and the playground's `sitemap.xml`.
 * A hand-written list that feeds all three is exactly the shape that freezes, and
 * it DID: `garden-house` — the outdoor flagship — shipped to npm, the docs
 * site and the README while being invisible in the playground, because that file
 * was last edited before the example existed and nothing compared the two. This
 * test is what makes that impossible again, and the reason it checks both
 * directions is that only the second one (every example has a row) catches it.
 *
 * The second half is the wording law. These blurbs are editorial prose that
 * reaches a public page, an `og:description` and a JSON-LD `description`, so they
 * are checked mechanically: a length band that keeps them sentences rather than
 * keyword lists (keyword stuffing is the one measured-NEGATIVE tactic for answer
 * engines), and the killed-claim regexes.
 *
 * NOTHING HERE RE-TYPES A LIST. The rows are parsed out of examples.ts, the
 * exclusions out of `docs-site/sync-docs.mjs`'s own `EXCLUDED_EXAMPLES` table, and
 * the example set off the directory — so the gate is derived from the same sources
 * the build reads, and a generator's template cannot go stale behind it.
 */

import { exampleNames } from "./helpers/corpus.js";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";

const EXAMPLES_TS = "playground/src/examples.ts";
const GEN_STATIC = "playground/scripts/gen-static.mjs";
const SYNC = "docs-site/sync-docs.mjs";
/** The one parser of the table the builds share: gen-static.mjs, docs-site/sync-docs.mjs and the e2e. */
const ROWS_MJS = "playground/scripts/example-rows.mjs";

interface Row {
  name: string;
  label: string;
  group: string;
  blurb: string;
}

/**
 * The row pattern, character-for-character the one `example-rows.mjs` uses. It is
 * duplicated on purpose and asserted below to be identical: this test's whole
 * value is that it reads what the generator reads, and a parser that had drifted
 * would pass over a table the build could not parse.
 */
const ROW_RE = /\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;

function readRows(): Row[] {
  const src = readFileSync(EXAMPLES_TS, "utf8");
  const block = /const EXAMPLE_ROWS = \[([\s\S]*?)\n\] as const;/.exec(src);
  expect(
    block,
    `${EXAMPLES_TS} no longer declares \`const EXAMPLE_ROWS = [ … ] as const;\` as a literal table. ` +
      `It is parsed from plain Node by ${GEN_STATIC} (no TypeScript loader) to build the static ` +
      `example pages and the sitemap, and by this test. Restore the shape, or move both parsers together.`,
  ).toBeTruthy();
  const rows = [...block![1]!.matchAll(new RegExp(ROW_RE.source, "g"))].map((m) => ({
    name: m[1]!,
    label: m[2]!,
    group: m[3]!,
    blurb: m[4]!,
  }));
  expect(rows.length, `\`EXAMPLE_ROWS\` in ${EXAMPLES_TS} parsed to zero rows.`).toBeGreaterThan(0);
  return rows;
}

/** `EXCLUDED_EXAMPLES` from sync-docs.mjs — the one list of deliberate omissions. */
function excludedExamples(): string[] {
  const src = readFileSync(SYNC, "utf8");
  const block = /const EXCLUDED_EXAMPLES = \[([\s\S]*?)\n\];/.exec(src);
  expect(block, `${SYNC} no longer declares \`const EXCLUDED_EXAMPLES = [ … ];\` as a literal table.`).toBeTruthy();
  const rows = [...block![1]!.matchAll(/\["([^"]+)",\s*"([^"]*)"\]/g)].map((m) => m[1]!);
  expect(rows.length, `\`EXCLUDED_EXAMPLES\` in ${SYNC} parsed to zero rows.`).toBeGreaterThan(0);
  return rows;
}

/** Every top-level `examples/*.arch` (`examples/lib/` holds component libraries). */
function exampleFiles(): string[] {
  return exampleNames();
}

const rows = readRows();

describe("EXAMPLE_ROWS and examples/ agree in both directions", () => {
  it("every row names a real examples/<basename>.arch", () => {
    const files = new Set(exampleFiles());
    const missing = rows.filter((r) => !files.has(`${r.name}.arch`)).map((r) => r.name);
    expect(
      missing,
      `${EXAMPLES_TS} has row(s) whose example file does not exist: ${missing.join(", ")}. The static ` +
        `page generator reads examples/<basename>.arch and exits 1 on a missing file, so this would ` +
        `break the playground deploy.`,
    ).toEqual([]);
  });

  it("every example that is not deliberately excluded has a row", () => {
    const excluded = new Set(excludedExamples());
    const publishable = exampleFiles()
      .filter((f) => !excluded.has(f))
      .map((f) => f.replace(/\.arch$/, ""));
    const listed = new Set(rows.map((r) => r.name));
    const invisible = publishable.filter((n) => !listed.has(n));
    expect(
      invisible,
      `examples/ holds plan(s) the playground never shows and never publishes a page for: ` +
        `${invisible.join(", ")}. That is how garden-house stayed invisible for five releases — it ` +
        `shipped to npm, the docs site and the README the whole time. Add a row to EXAMPLE_ROWS in ` +
        `${EXAMPLES_TS} (basename, menu label, group, one-sentence blurb), or, if the plan genuinely ` +
        `cannot compile standalone (it needs the World seam for imports), add it to ${SYNC}'s ` +
        `EXCLUDED_EXAMPLES with its reason — which also removes it from the docs gallery.`,
    ).toEqual([]);
  });

  it("no row is a duplicate, by basename or by menu label", () => {
    const names = rows.map((r) => r.name);
    const labels = rows.map((r) => r.label);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    // A duplicate label shadows a preset in EXAMPLES and makes the <select>'s value
    // ambiguous — and the Playwright specs select by label.
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it("every basename is a safe, lowercase URL segment", () => {
    // Each one becomes `/examples/<name>.html`, a canonical URL and a sitemap entry.
    const bad = rows.filter((r) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.name)).map((r) => r.name);
    expect(bad, `basename(s) that are not URL-safe kebab-case: ${bad.join(", ")}`).toEqual([]);
  });

  it("rows are grouped contiguously, so the derived menu keeps one optgroup per group", () => {
    // EXAMPLE_GROUPS buckets by first appearance; a group split across the table
    // would silently merge its later rows into the earlier optgroup, moving items
    // in the menu without anyone editing a label.
    const seen: string[] = [];
    for (const r of rows) if (seen[seen.length - 1] !== r.group) seen.push(r.group);
    expect(
      seen.filter((g, i) => seen.indexOf(g) !== i),
      "group(s) appearing in two separate runs",
    ).toEqual([]);
  });
});

describe("the blurbs are publishable prose", () => {
  // They are served as the page lede, the meta description, the og:description and
  // the JSON-LD description of 27 public URLs.
  it("every blurb is a sentence-length 40–160 characters", () => {
    const bad = rows
      .filter((r) => r.blurb.length < 40 || r.blurb.length > 160)
      .map((r) => `${r.name} (${r.blurb.length})`);
    expect(bad, `blurb(s) outside the 40–160 character band: ${bad.join(", ")}`).toEqual([]);
  });

  it("every blurb ends as a sentence and is not a keyword list", () => {
    for (const r of rows) {
      expect(r.blurb, `${r.name}: blurb should end in a full stop`).toMatch(/[.]$/);
      expect(r.blurb, `${r.name}: blurb should start with a capital`).toMatch(/^[A-Z]/);
      // A comma every few words is the shape of a keyword list, the one tactic
      // measured to HURT answer-engine visibility.
      const commas = (r.blurb.match(/,/g) ?? []).length;
      expect(commas, `${r.name}: ${commas} commas reads as a list, not a sentence`).toBeLessThanOrEqual(4);
    }
  });

  it("no blurb makes a killed claim or uses hype vocabulary", () => {
    // The wording law, enforced mechanically because it is the half a reviewer's
    // eye slides over. Kept identical to the docs-site head guard's list.
    const killed =
      /\bLaTeX\b|\bTypst\b|Design Compiler|Code as CAD|\bfirst\b.*\b(DSL|language)\b|revolutionary|seamless|effortless|cutting.edge|world.class|blazing|game.chang/i;
    for (const r of rows) {
      expect(killed.test(r.blurb), `${r.name}: "${r.blurb}" matches a killed claim / hype word`).toBe(false);
    }
  });
});

describe("the static page generator reads this table, and nothing else hand-lists it", () => {
  const gen = readFileSync(GEN_STATIC, "utf8");
  /**
   * The same file with its comments removed. The generator's header explains the
   * `./assets/` trap at length, so a naive grep for that string finds the warning
   * rather than a violation — strip the prose and check the code.
   */
  const genCode = gen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the builds parse EXAMPLE_ROWS with the same pattern this test does, through one module", () => {
    const parser = readFileSync(ROWS_MJS, "utf8");
    expect(
      parser.includes(ROW_RE.source),
      `${ROWS_MJS} no longer carries the row pattern this test asserts against. The two parsers are ` +
        `deliberately identical: a test that reads a DIFFERENT shape than the build would pass over a ` +
        `table the deploy cannot read. Change both in one commit.`,
    ).toBe(true);
    expect(parser).toMatch(/const EXAMPLE_ROWS = \\\[\(\[\\s\\S\]\*\?\)\\n\\\] as const;/);
    // Every build reads the table through that module, never through a parser of its own.
    const sync = readFileSync(SYNC, "utf8");
    expect(gen).toMatch(/import \{[^}]*\breadExampleRows\b[^}]*\} from "\.\/example-rows\.mjs"/);
    expect(sync).toMatch(/await import\("\.\.\/playground\/scripts\/example-rows\.mjs"\)/);
    expect(gen.includes(ROW_RE.source), `${GEN_STATIC} carries a row parser of its own`).toBe(false);
    expect(sync.includes(ROW_RE.source), `${SYNC} carries a row parser of its own`).toBe(false);
  });

  it("the shared parser reads exactly the rows this test reads", async () => {
    // @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
    const shared = (await import("../playground/scripts/example-rows.mjs")) as {
      readExampleRows(repo: string): Row[];
    };
    expect(shared.readExampleRows(".")).toEqual(rows);
  });

  it("gen-static.mjs reuses the shared share-hash codec instead of re-implementing it", () => {
    // `encodePlanHash` already has three implementations welded by
    // test/share-codec.test.ts; a fourth would be a fourth thing to keep in step.
    expect(gen).toMatch(/import \{ encodePlanHash \} from "\.\.\/\.\.\/scripts\/gen-permalink\.mjs"/);
    expect(gen, "a re-implemented deflate/base64url codec").not.toMatch(/deflateRawSync/);
  });

  it("gen-static.mjs hard-fails rather than publishing a page with no drawing on it", () => {
    expect(gen).toMatch(/process\.exit\(1\)/);
    expect(gen, "the generator must collect every failure before exiting").toMatch(/failures\.push/);
  });

  it("playground's build script runs the generator after vite build", () => {
    const pkg = JSON.parse(readFileSync("playground/package.json", "utf8")) as { scripts: Record<string, string> };
    expect(
      pkg.scripts.build,
      "playground/package.json's `build` must chain the static generator after `vite build` — the root " +
        "`playground:build` / `playground:build:only` scripts and deploy.yml all go through it, so this " +
        "one line is what puts the example pages and the sitemap into every deploy.",
    ).toBe("vite build && node scripts/gen-static.mjs");
  });

  it("the pages are self-contained: the generator emits no relative asset reference", () => {
    // `base: "./"` makes index.html's own URLs relative, so a page one directory
    // down that reused them would resolve `./assets/…` to `/examples/assets/…`.
    expect(genCode, "a `./assets/` reference would 404 from /examples/").not.toMatch(/\.\/assets\//);
    expect(genCode, "the pages carry no <script> of their own").not.toMatch(/<script(?! type="application\/ld)/);
    // And the canonical/sitemap URLs must keep the extension: `html_handling: "none"`
    // is an exact-path lookup, so `/examples/studio` does not exist.
    expect(gen).toMatch(/\/examples\/\$\{row\.name\}\.html/);
    expect(gen).toMatch(/examples\/\$\{r\.name\}\.html/);
  });

  it("the @font-face rules are DERIVED from vite's output, never hand-typed", () => {
    // These pages load no stylesheet, so a family they NAME but never DECLARE falls back
    // to the system UI stack — silently, with a 200 on every route. That is what they
    // shipped with. The fix must stay a derivation: a hand-written @font-face block goes
    // stale the day a weight is added, and nothing here would see it.
    expect(genCode, "a hand-typed @font-face src").not.toMatch(/src:\s*url\(/);
    expect(gen, "the generator must READ vite's emitted stylesheets").toMatch(/readdirSync/);
    expect(gen).toMatch(/@font-face/);
    // ...and hard-fail rather than publish a page whose fonts silently did not load.
    expect(gen).toMatch(/no @font-face for/);
  });

  it("a gallery thumbnail is compiled, never hand-sized", () => {
    expect(gen, "the thumbnail's pixel box must come from compile(), not from arithmetic here").toMatch(
      /compile\(source, \{ width:/,
    );
    expect(gen, "a lazily loaded thumbnail with no intrinsic size reflows the whole grid").toMatch(/loading="lazy"/);
    expect(gen).toMatch(/width="\$\{t\.w\}" height="\$\{t\.h\}"/);
  });

  it("each gallery card carries exactly one link", () => {
    // The e2e asserts `ul.plans a[href="/examples/studio.html"]` resolves to ONE element,
    // and a second <a> per card would also give a screen reader a duplicated stop per plan.
    // Scoped to anchor hrefs — `sitemap()` builds its <loc>s from the same template — and to
    // the index page's builder: the playground's plan gallery (`prerenderIndex`) is another
    // page's list, one link per plan of its own.
    const index = /\nfunction indexPage\([\s\S]*?\n}\n/.exec(gen)?.[0] ?? "";
    expect(index, "gen-static.mjs declares `function indexPage(…) { … }`").not.toBe("");
    expect(index.match(/href="\/examples\/\$\{r\.name\}\.html"/g) ?? []).toHaveLength(1);
    expect(index, "the thumbnail is decorative: the link text already names the plan").toMatch(/alt=""/);
  });

  it("the plan gallery names each card by its plan and sizes each thumbnail from compile()", () => {
    // The playground's plan gallery (card PG3, ruling PG-D2): one link per plan, named by its
    // visible text (the clean name and the tag, split by `splitLabel` from the table's label,
    // never retyped), so its thumbnail is decorative; and its thumbnail is the index's
    // (`thumbs`, from `thumbSvg`), never re-measured here, lazy so a closed gallery fetches none.
    const index = /\nfunction prerenderIndex\([\s\S]*?\n}\n/.exec(gen)?.[0] ?? "";
    expect(index, "gen-static.mjs declares `function prerenderIndex(…) { … }`").not.toBe("");
    expect(index.match(/href="\/examples\/\$\{r\.name\}\.html"/g) ?? []).toHaveLength(1);
    expect(index).toMatch(/<a class="gal-card" href="\/examples\/\$\{r\.name\}\.html"/);
    expect(index).toMatch(/cardText\(r\.label\)/);
    // The tag's brackets are visually hidden, so the link's text and name are the whole label.
    expect(index).toMatch(/<span class="vh">\$\{escapeHtml\(tag\.open\)\}<\/span>/);
    expect(index).toMatch(/<h2 class="gal-h"/);
    expect(index).toMatch(/<span class="gal-name">\$\{escapeHtml\(name\)\}<\/span>/);
    expect(index).toMatch(/alt=""/);
    expect(index).toMatch(/loading="lazy"/);
    expect(index).toMatch(/width="\$\{t\.w\}" height="\$\{t\.h\}"/);
    // Every row becomes a card: the loop runs over the table's rows, not a list of its own.
    expect(index).toMatch(/for \(const r of rows\)/);
  });

  it("the gallery's tag split keeps the name and moves only a trailing parenthetical", async () => {
    // The one split the generator and the app share (a plain .js module, typed by JSDoc there).
    // @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
    const { splitLabel, cardText } = (await import("../playground/src/plan-label.js")) as {
      splitLabel(label: string): { name: string; tag: string | null };
      cardText(label: string): { name: string; tag: null | { open: string; text: string; close: string } };
    };
    for (const { label } of rows) {
      const { name, tag } = splitLabel(label);
      expect(name.length, label).toBeGreaterThan(0);
      expect(tag === null ? name : `${name} (${tag})`, label).toBe(label);
      expect(name, label).not.toMatch(/[()]$/);
      // A card's pieces, read together (its text, its accessible name), are the label itself.
      const c = cardText(label);
      expect(c.name + (c.tag ? c.tag.open + c.tag.text + c.tag.close : ""), label).toBe(label);
    }
    expect(splitLabel("Clinic (place ×6)")).toEqual({
      name: "Clinic",
      tag: "place ×6",
    });
    expect(splitLabel("Furnished Flat")).toEqual({
      name: "Furnished Flat",
      tag: null,
    });
  });

  it("the reachability clause is gated on describe(), not asserted for every plan", () => {
    // "every room is reachable from the entrance" is one of exactly three claimable
    // measurements, and two shipped examples (themed, relational) have no entrance
    // at all. The clause is conditional in the source, and this pins that.
    expect(gen).toMatch(/allRoomsReachable/);
    expect(gen).toMatch(/hasEntrance/);
    expect(gen).toMatch(/every room is reachable from the entrance/);
  });
});

// @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
const lean = (await import("../playground/scripts/lean-thumb.mjs")) as {
  leanThumb(svg: string): string;
  keepsLayer(id: string): boolean;
  decimalsFor(widthMm: number): number;
  SCALE: number;
  THUMB_MAX_BYTES: number;
};

describe("the gallery's thumbnails are lean drawings cut from compile() (MP-D5)", () => {
  const gen = readFileSync(GEN_STATIC, "utf8");
  const thumbW = Number(/\nconst THUMB_W = (\d+);/.exec(gen)?.[1]);

  /** Every vertex an absolute M/L/H/V/A/Z path visits, as [x, y] in the path's own units. */
  function vertices(d: string): [number, number][] {
    const out: [number, number][] = [];
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    for (const seg of d.match(/[A-Za-z][^A-Za-z]*/g) ?? []) {
      const c = seg[0]!;
      const n = (seg.slice(1).match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
      if (c === "M") [x, y, sx, sy] = [n[0]!, n[1]!, n[0]!, n[1]!];
      else if (c === "L") [x, y] = [n[0]!, n[1]!];
      else if (c === "H") x = n[0]!;
      else if (c === "V") y = n[0]!;
      else if (c === "A") [x, y] = [n[5]!, n[6]!];
      else if (c === "Z") [x, y] = [sx, sy];
      else throw new Error(`a wall path with a ${c} command`);
      out.push([x, y]);
    }
    return out;
  }
  /** The `d` of every path inside one layer group of a drawing. */
  function layerPaths(svg: string, id: string): string[] {
    const open = new RegExp(`<g id="${id}"[^>]*>`).exec(svg);
    if (!open) return [];
    const body = svg.slice(open.index, svg.indexOf("</g>", open.index));
    return [...body.matchAll(/<path\b[^>]*\sd="([^"]*)"/g)].map((m) => m[1]!);
  }

  it("gen-static builds each thumbnail with leanThumb from a compile() at a fixed width", () => {
    expect(thumbW).toBeGreaterThan(0);
    expect(gen).toMatch(/const result = compile\(source, \{ width: THUMB_W \}\);/);
    expect(gen).toMatch(/const svg = leanThumb\(result\.svg\);/);
    expect(gen, "the build stops on an oversized thumbnail").toMatch(/> THUMB_MAX_BYTES/);
  });

  for (const row of rows) {
    it(`${row.name}: at most ${lean.THUMB_MAX_BYTES} bytes, no text, the same box and the same walls`, () => {
      const full = compile(readFileSync(join("examples", `${row.name}.arch`), "utf8"), { width: thumbW }).svg;
      const thumb = lean.leanThumb(full);
      expect(Buffer.byteLength(thumb)).toBeLessThanOrEqual(lean.THUMB_MAX_BYTES);
      expect(thumb).not.toMatch(/<text\b/);
      expect(thumb, "no furniture, dimensions, labels or grid").not.toMatch(/id="A-(?:FURN|ANNO|GRID|COLS)/);
      // The card's intrinsic size is the compiler's: the same root width and height.
      const root = (s: string) => /^<svg[^>]*\swidth="([\d.]+)"\s+height="([\d.]+)"/.exec(s)?.slice(1);
      expect(root(thumb)).toEqual(root(full));

      // Its layers are exactly the keepable layers the compiler drew, in the compiler's order (none
      // lost, none invented), and the walls are the compiler's walls: the same vertices, on the
      // thumbnail's grid.
      const fullLayers = [...full.matchAll(/<g id="([^"]+)" inkscape:groupmode="layer"/g)].map((m) => m[1]!);
      const kept = [...thumb.matchAll(/<g id="([^"]+)">/g)].map((m) => m[1]!);
      expect(kept).toEqual(fullLayers.filter((id) => lean.keepsLayer(id)));
      for (const id of ["A-WALL", "A-DOOR", "A-FLOR", "A-FLOR-STRS", "A-FLOR-EVTR"]) {
        if (fullLayers.includes(id)) expect(kept, `${row.name} keeps ${id}`).toContain(id);
      }
      const vbW = Number((/ viewBox="([^"]*)"/.exec(full)?.[1] ?? "").trim().split(/\s+/)[2]);
      const p = 10 ** lean.decimalsFor(vbW);
      const snap = (v: number) => Math.round((v / lean.SCALE) * p) / p;
      const walls = fullLayers.filter((id) => id === "A-WALL" || id.startsWith("A-WALL-"));
      expect(walls.length).toBeGreaterThan(0);
      for (const id of walls) {
        const want = new Set(layerPaths(full, id).flatMap((d) => vertices(d).map(([x, y]) => `${snap(x)},${snap(y)}`)));
        const got = new Set(layerPaths(thumb, id).flatMap((d) => vertices(d).map(([x, y]) => `${x},${y}`)));
        expect([...got].sort(), `${id} vertices`).toEqual([...want].sort());
      }
    });
  }
});

describe("the plan a first visit opens", () => {
  // `EXAMPLE_ROWS[0]` is `DEFAULT_EXAMPLE`: the first thing a visitor and an agent see. It
  // must open clean, or the front door greets them with warnings. The playground cannot be
  // imported here (`?raw` imports), so the row is parsed exactly as the other tests do.
  const first = readRows()[0]!;
  const source = readFileSync(join("examples", `${first.name}.arch`), "utf8");

  it("compiles with no diagnostics", () => {
    expect(compile(source, { noCache: true }).diagnostics, `${first.name} (row 0)`).toEqual([]);
  });

  it("lints clean under the default profile", () => {
    expect(lint(source), `${first.name} (row 0)`).toEqual([]);
  });
});

describe("the two hosts link each example plan both ways", () => {
  // The docs host used to link the playground only by its bare host and `#z=` fragments, so the
  // static example pages were reachable from the playground's own index alone. Each direction is
  // asserted against the source the build reads: the docs page's widgets, and the generator's template.
  const rows = readRows();
  const docsPage = readFileSync("docs-site/examples.md", "utf8");
  const archLive = readFileSync("docs-site/.vitepress/theme/components/ArchLive.vue", "utf8");
  const gen = readFileSync(GEN_STATIC, "utf8");

  it("every EXAMPLE_ROWS plan's widget on the docs /examples page names its static page", () => {
    const named = new Set(
      [...docsPage.matchAll(/<ArchLive :src="EXAMPLES\['([^']+)'\]" page="([^"]+)"/g)]
        .filter((m) => m[1] === m[2])
        .map((m) => m[1]!),
    );
    const missing = rows.filter((r) => !named.has(r.name)).map((r) => r.name);
    expect(missing, 'add `page="<name>"` to the plan\'s <ArchLive> widget in docs-site/examples.md').toEqual([]);
  });

  it("the widget renders that name as a plain link to the playground's static page", () => {
    // A plain <a> in the SSR output, not a click handler: a crawler follows hrefs only.
    expect(archLive).toMatch(
      /https:\/\/playground\.archlang\.uk\/examples\/\$\{encodeURIComponent\(props\.page\)\}\.html/,
    );
    expect(archLive).toMatch(/<a v-if="staticPage" class="archlive-page" :href="staticPage">/);
  });

  it("every static example page links back to the docs /examples page", () => {
    const page = /\nfunction examplePage\([\s\S]*?\n}\n/.exec(gen)?.[0] ?? "";
    expect(page, "gen-static.mjs declares `function examplePage(…) { … }`").not.toBe("");
    expect(page).toMatch(/href="\$\{DOCS\}\/examples"/);
    // The three docs links the page already carried stay.
    expect(page).toMatch(/href="\$\{DOCS\}\/reference"/);
    expect(page).toMatch(/href="\$\{DOCS\}\/spec"/);
  });

  it("the docs home gallery and /3d link a plan's static page only when EXAMPLE_ROWS publishes one", async () => {
    // The docs host's other cards linked only `#z=` permalinks, which no crawler follows into a page.
    // The set of pages is EXAMPLE_ROWS read by the shared parser (sync-docs.mjs), never a list here or
    // in the components, so a card for a plan with no static page renders no link at all.
    // @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
    const shared = (await import("../playground/scripts/example-rows.mjs")) as {
      examplePageLinks(rows: Row[]): Record<string, string>;
    };
    const pages = shared.examplePageLinks(rows);
    expect(Object.keys(pages)).toEqual(rows.map((r) => r.name));
    for (const r of rows) expect(pages[r.name]).toBe(`https://playground.archlang.uk/examples/${r.name}.html`);
    // A plan with no row gets no link: the e2e (homepage-links.spec.ts, three-d.spec.ts) holds the rendered cards to this.
    expect(pages["museum-wing"], "an excluded example has no static page").toBeUndefined();

    const sync = readFileSync(SYNC, "utf8");
    expect(sync).toMatch(/const examplePages = examplePageLinks\(readExampleRows\(repo\)\);/);
    expect(sync).toMatch(/export const EXAMPLE_PAGES = \$\{JSON\.stringify\(examplePages, null, 2\)\}/);
    for (const [file, name] of [
      ["HomeGallery.vue", "p.example"],
      ["ThreeDPlans.vue", "a.name"],
    ] as const) {
      const vue = readFileSync(`docs-site/.vitepress/theme/${file}`, "utf8");
      expect(vue, file).toMatch(/import \{ EXAMPLE_PAGES \} from "\.\/example-pages-data\.js";/);
      expect(vue, file).toMatch(
        /const PAGES: ReadonlyMap<string, string> = new Map\(Object\.entries\(EXAMPLE_PAGES\)\);/,
      );
      // The link is rendered only under the guard (the next tag after the guarded one's own), and
      // its href is the map's, never built from the name.
      const guard = vue.indexOf(`v-if="PAGES.get(${name})"`);
      const link = vue.indexOf(`<a class="example-page" :href="PAGES.get(${name})"`);
      expect(guard, `${file}: the link's v-if guard`).toBeGreaterThan(0);
      expect(link, `${file}: the link`).toBeGreaterThan(guard);
      expect(vue.slice(guard, link).includes("<"), `${file}: the guard wraps the link`).toBe(false);
      expect(vue.match(/class="example-page"/g) ?? [], file).toHaveLength(1);
      expect(vue, `${file} builds a static-page URL of its own`).not.toMatch(/playground\.archlang\.uk\/examples\//);
    }
  });

  it("each static page carries what it uses, its group and its neighbours", () => {
    const page = /\nfunction examplePage\([\s\S]*?\n}\n/.exec(gen)?.[0] ?? "";
    expect(page).toMatch(/\$\{usesSection\(result\.ast\)\}/);
    expect(page).toMatch(/\$\{groupSection\(row, ctx\.rows\)\}/);
    expect(page).toMatch(/\$\{pager\(row, ctx\.rows\)\}/);
    expect(gen).toMatch(/import \{ planConstructs \} from "\.\/plan-constructs\.mjs";/);
    // Exactly one <h1> stays on the page: the new sections open with h2s.
    expect(page.match(/<h1\b/g) ?? []).toHaveLength(1);
  });

  it("the neighbours are EXAMPLE_ROWS' order and its group column", async () => {
    // @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
    const shared = (await import("../playground/scripts/example-rows.mjs")) as {
      rowNeighbours(rows: Row[], name: string): { prev: Row | null; next: Row | null; siblings: Row[] };
    };
    rows.forEach((r, i) => {
      const n = shared.rowNeighbours(rows, r.name);
      expect(n.prev?.name ?? null, r.name).toBe(i > 0 ? rows[i - 1]!.name : null);
      expect(n.next?.name ?? null, r.name).toBe(i < rows.length - 1 ? rows[i + 1]!.name : null);
      expect(
        n.siblings.map((s) => s.name),
        r.name,
      ).toEqual(rows.filter((s) => s.group === r.group && s.name !== r.name).map((s) => s.name));
    });
    expect(() => shared.rowNeighbours(rows, "no-such-plan")).toThrow();
  });

  it("the sitemap's dates come from git, and a failed git call emits none", () => {
    expect(gen).toMatch(/execFileSync\("git", \["log", "-1", "--format=%cI", "--", path\]/);
    expect(gen, "a build-time date on unchanged content").not.toMatch(/new Date\(\)/);
    expect(gen).toMatch(/<lastmod>\$\{escapeHtml\(lastmod\)\}<\/lastmod>/);
  });

  it("each page's date is floored by every file its bytes depend on", () => {
    // The generator, the construct table, the row parser and the row table (the other rows fill
    // "More in <group>" and the pager): a change to any of them changes every page.
    const at = gen.indexOf("\nconst PAGE_INPUTS = [");
    expect(at, "gen-static.mjs declares `const PAGE_INPUTS = [ … ];`").toBeGreaterThan(0);
    const block = gen.slice(at, gen.indexOf("];", at));
    const inputs = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect([...inputs].sort()).toEqual(
      [GEN_STATIC, "playground/scripts/plan-constructs.mjs", ROWS_MJS, EXAMPLES_TS].sort(),
    );
    for (const p of inputs) expect(statSync(p).isFile(), p).toBe(true);
    expect(gen).toMatch(/for \(const path of PAGE_INPUTS\) floor = later\(floor, commitDate\(path\)\);/);
    expect(gen).toMatch(/dates\.set\(r\.name, later\(own, floor\)\)/);
  });
});

describe("the playground's JSON-LD references only ids the docs graph defines", () => {
  // The playground once pointed at `https://archlang.uk/#chan-meng`, which no page defined. Its
  // archlang.uk ids now come from `ids` in site-shared/identity.json (the docs config defines its
  // nodes by the same ids), so nothing here may spell one out by hand.
  const ids = (JSON.parse(readFileSync("site-shared/identity.json", "utf8")) as { ids: Record<string, string> }).ids;
  const indexHtml = readFileSync("playground/index.html", "utf8");
  const gen = readFileSync(GEN_STATIC, "utf8");
  const viteConfig = readFileSync("playground/vite.config.js", "utf8");

  it("every archlang.uk @id literal in index.html and gen-static.mjs is an identity id", () => {
    const valid = new Set(Object.values(ids));
    const literals = [indexHtml, gen].flatMap((src) =>
      [...src.matchAll(/https:\/\/archlang\.uk\/#[\w-]+/g)].map((m) => m[0]),
    );
    expect(literals.filter((l) => !valid.has(l))).toEqual([]);
    expect(gen, "a docs id spelled from the DOCS origin instead of IDENTITY.ids").not.toMatch(/\$\{DOCS\}\/#/);
  });

  it("each %ARCHLANG_ID_…% placeholder in index.html names an identity id the vite plugin fills", () => {
    const slots = [...new Set([...indexHtml.matchAll(/"%ARCHLANG_ID_([A-Z]+)%"/g)].map((m) => m[1]!))];
    expect(slots.sort()).toEqual(["AUTHOR", "SOFTWARE", "WEBSITE"]);
    for (const slot of slots) {
      expect(ids[slot.toLowerCase()], `identity.json has no ids.${slot.toLowerCase()}`).toMatch(
        /^https:\/\/archlang\.uk\/#/,
      );
      expect(viteConfig).toContain(`'"%ARCHLANG_ID_${slot}%"': JSON.stringify(ids.${slot.toLowerCase()})`);
    }
  });
});
