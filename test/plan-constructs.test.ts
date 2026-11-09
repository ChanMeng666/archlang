/**
 * "What this plan uses" on the playground's static example pages (`playground/scripts/plan-constructs.mjs`):
 * every anchor it links is a real heading of the language reference, and every row is read off the
 * parse tree of a plan that really uses it.
 *
 * THE ANCHORS. The reference is published by VitePress at https://archlang.uk/reference, and a heading's
 * id there is VitePress's slug of the heading's text (markdown-it-anchor's text and code tokens, a
 * repeated slug suffixed `-1`, `-2` …). The slug function is not retyped here: it is read out of the
 * installed VitePress and evaluated, so a VitePress that slugs differently fails this test rather than
 * quietly breaking every link. VitePress is a docs-site dependency hoisted to the root `node_modules`,
 * so the check runs after any `npm ci`; it skips only on an un-installed checkout, and fails under `CI`.
 *
 * THE ROWS. Each must fire on at least one EXAMPLE_ROWS plan (a row that fires nowhere is a detector
 * nothing has checked), and a construct written only in a comment must not fire.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

// @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
const constructs = (await import("../playground/scripts/plan-constructs.mjs")) as {
  REFERENCE_URL: string;
  CONSTRUCTS: Array<[string, string, string, (facts: unknown) => boolean]>;
  planConstructs(ast: unknown): Array<{ key: string; label: string; href: string }>;
};
// @ts-expect-error — the root typecheck has no allowJs, so it has no declarations for it.
const rowsModule = (await import("../playground/scripts/example-rows.mjs")) as {
  readExampleRows(repo: string): Array<{ name: string }>;
};

const REFERENCE = "docs/language-reference.md";
const rows = rowsModule.readExampleRows(".");
const astOf = (name: string) => compile(readFileSync(join("examples", `${name}.arch`), "utf8")).ast;

/**
 * VitePress's own heading slug function, out of its built node bundle: the three character classes
 * and the `slugify` arrow, evaluated together. Null when VitePress is not installed.
 */
function vitepressSlugify(): ((s: string) => string) | null {
  const dir = join("node_modules", "vitepress", "dist", "node");
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(join(dir, f), "utf8");
    const lines = ["rControl", "rSpecial", "rCombining", "slugify"].map((name) => {
      const at = src.indexOf(`\nconst ${name} = `);
      return at < 0 ? null : src.slice(at + 1, src.indexOf("\n", at + 1));
    });
    if (lines.some((l) => l === null)) continue;
    // Plain, one-line definitions only: anything else means the bundle changed shape.
    for (const l of lines) expect(l, `${f}: ${l}`).toMatch(/^const \w+ = .+;$/);
    return new Function(`${lines.join("\n")}\nreturn slugify;`)() as (s: string) => string;
  }
  throw new Error(
    `no file under ${dir} defines VitePress's heading slugify (\`const rSpecial = …\`, \`const slugify = …\`); ` +
      "VitePress changed its bundle. Find the anchor slug it uses now and read that instead.",
  );
}

/**
 * Every heading id of a Markdown page as VitePress publishes it: ATX headings outside fenced code
 * and outside HTML comment blocks, the text of their inline content (code spans keep their text,
 * links their label), slugged, and a repeat suffixed `-1`, `-2` … as markdown-it-anchor does.
 *
 * - A fence opens on a run of >= 3 backticks or tildes and closes only on a bare run of the SAME
 *   character at least as long (the rule `test/docs-fences.test.ts` states).
 * - A line that starts (after <= 3 spaces) with `<!--` opens an HTML comment block, which runs to
 *   the line holding `-->` (markdown-it's HTML block type 2): a `#` line inside it is no heading.
 * - A heading ending in an attribute block with `#id` (`## Title {#custom-id}`) keeps that id, as
 *   markdown-it-attrs sets it and markdown-it-anchor keeps it; the explicit id takes its place in
 *   the same slug registry, so a later heading slugged to it is suffixed.
 */
function headingIds(md: string, slugify: (s: string) => string): Set<string> {
  const ids = new Set<string>();
  let fence: string | null = null;
  let inComment = false;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null && f) {
      fence = f[1]!;
      continue;
    }
    if (fence !== null) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !f[2]!.trim()) fence = null;
      continue;
    }
    const open = /^ {0,3}<!--/.exec(line);
    if (open) {
      if (!line.slice(open[0].length).includes("-->")) inComment = true;
      continue;
    }
    const h = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!h) continue;
    const attrs = /[ \t]*\{([^{}]*)\}$/.exec(h[1]!);
    const custom = attrs ? /(?:^|\s)#([^\s#.{}]+)/.exec(attrs[1]!)?.[1] : undefined;
    if (custom !== undefined) {
      ids.add(custom);
      continue;
    }
    const text = h[1]!.replace(/`([^`]*)`/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const base = slugify(text);
    let id = base;
    for (let n = 1; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
  }
  return ids;
}

describe("every construct anchor is a heading of the language reference", () => {
  const slugify = vitepressSlugify();
  const required = !!process.env.CI;

  it("VitePress's slug function is available (skips only on an un-installed checkout; fails under CI)", (ctx) => {
    if (slugify === null) {
      if (required) throw new Error("node_modules/vitepress is missing under CI: the anchor check cannot run.");
      ctx.skip();
    }
    // Its known behaviour, so a function read from the wrong place cannot pass the check below.
    expect(slugify!("Bindings — `let`")).toBe("bindings-—-let");
    expect(slugify!("Sheet tables — room schedule & legend")).toBe("sheet-tables-—-room-schedule-legend");
    expect(slugify!("Opening (v1.3)")).toBe("opening-v1-3");
  });

  it("each anchor names a heading id on /reference", (ctx) => {
    if (slugify === null) {
      if (required) throw new Error("node_modules/vitepress is missing under CI: the anchor check cannot run.");
      ctx.skip();
    }
    const ids = headingIds(readFileSync(REFERENCE, "utf8"), slugify!);
    expect(ids.size, "the reference parsed to almost no headings").toBeGreaterThan(50);
    const missing = constructs.CONSTRUCTS.map(([key, , anchor]) => [key, anchor]).filter(([, a]) => !ids.has(a!));
    expect(
      missing,
      `construct anchor(s) with no heading in ${REFERENCE}: a heading was renamed. Point the row at the ` +
        "heading's new id, or drop the row if the reference no longer documents it.",
    ).toEqual([]);
  });

  it("reads headings as VitePress does: fences, HTML comments and explicit ids", (ctx) => {
    if (slugify === null) {
      if (required) throw new Error("node_modules/vitepress is missing under CI: the anchor check cannot run.");
      ctx.skip();
    }
    const md = [
      "## Kept",
      "````md",
      "```",
      "## In a four-backtick fence",
      "```",
      "````",
      "<!-- one-line comment -->",
      "<!--",
      "## In a comment",
      "-->",
      "## Named {#my-id}",
      "## My id",
      "## Kept",
    ].join("\n");
    expect([...headingIds(md, slugify!)]).toEqual(["kept", "my-id", "my-id-1", "kept-1"]);
  });

  it("the links go to the published reference page", () => {
    expect(constructs.REFERENCE_URL).toBe("https://archlang.uk/reference");
    const sync = readFileSync("docs-site/sync-docs.mjs", "utf8");
    expect(sync, "the reference is published at /reference").toMatch(
      /\["docs\/language-reference\.md", "reference\.md"\]/,
    );
  });
});

describe("the constructs are read off the parse tree", () => {
  it("the table has unique keys, labels and anchors", () => {
    for (const col of [0, 1, 2]) {
      const vals = constructs.CONSTRUCTS.map((r) => r[col]);
      expect(
        vals.filter((v, i) => vals.indexOf(v) !== i),
        `column ${col}`,
      ).toEqual([]);
    }
  });

  it("every row fires on at least one EXAMPLE_ROWS plan, and every plan uses some", () => {
    const fired = new Set<string>();
    for (const r of rows) {
      const used = constructs.planConstructs(astOf(r.name));
      expect(used.length, r.name).toBeGreaterThan(0);
      for (const c of used) fired.add(c.key);
    }
    const never = constructs.CONSTRUCTS.map(([key]) => key).filter((k) => !fired.has(k));
    expect(never, "row(s) no example plan uses: an unchecked detector; drop it or add the plan").toEqual([]);
  });

  it("lists them in table order, and the same plan always lists the same", () => {
    const order = constructs.CONSTRUCTS.map(([key]) => key);
    for (const r of rows) {
      const a = constructs.planConstructs(astOf(r.name)).map((c) => c.key);
      expect(
        a.map((k) => order.indexOf(k)),
        r.name,
      ).toEqual([...a.map((k) => order.indexOf(k))].sort((x, y) => x - y));
      expect(constructs.planConstructs(astOf(r.name)).map((c) => c.key)).toEqual(a);
    }
  });

  it("finds what a plan writes, inside loops, levels, zones and its own components", () => {
    const keys = (name: string) => new Set(constructs.planConstructs(astOf(name)).map((c) => c.key));
    // A `for` inside a component body, an `if`, a `set`.
    for (const k of ["let", "control", "set"]) expect(keys("parametric").has(k), `parametric: ${k}`).toBe(true);
    // Levels, zones, a component placed, a polygon room, an outdoor area.
    for (const k of ["level", "zone", "component", "place", "polygon", "outdoor", "void"]) {
      expect(keys("hillside-villa").has(k), `hillside-villa: ${k}`).toBe(true);
    }
    for (const k of ["boundary", "fence"]) expect(keys("garden-house").has(k), `garden-house: ${k}`).toBe(true);
    expect(keys("accessible").has("accessible")).toBe(true);
    expect(keys("one-room").has("level"), "a single-storey plan has no levels").toBe(false);
  });

  it("a `while` loop is control flow (no shipped example writes one: `while` is deprecated)", () => {
    const src =
      'plan "w" {\n  units mm\n  let i = 0\n  while i < 2 {\n    column at (i * 600, 0) size 300x300\n    i = i + 1\n  }\n}\n';
    const keys = constructs.planConstructs(compile(src).ast).map((c) => c.key);
    expect(keys).toContain("control");
  });

  it("a construct written only in a comment does not count", () => {
    const base = readFileSync(join("examples", "one-room.arch"), "utf8");
    const commented = `# for i in 0..3 { } theme blueprint level 1 zone a paper A3 component c() { }\n${base}`;
    const keys = (src: string) => constructs.planConstructs(compile(src).ast).map((c) => c.key);
    expect(keys(commented)).toEqual(keys(base));
  });

  it("every link goes to a reference anchor", () => {
    for (const r of rows) {
      for (const c of constructs.planConstructs(astOf(r.name))) {
        expect(c.href.startsWith(`${constructs.REFERENCE_URL}#`), c.href).toBe(true);
      }
    }
  });
});
