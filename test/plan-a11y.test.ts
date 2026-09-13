import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/**
 * The per-element accessibility surface — `data-arch-label` + `data-arch-primary` under
 * `annotate`, and the `role`/`tabindex`/`aria-label`/`aria-hidden` stamping those two
 * carry once `accessible` joins them.
 *
 * Why it exists: an embedder that wants a KEYBOARD-operable plan has to decide, per
 * element, which of its several drawn primitives is "the thing" and what to call it. Every
 * consumer that has tried has ended up guessing — "the polygon, else the first non-text
 * node" — from the outside, which is a second model of a drawing the compiler already
 * knows everything about, and it drifts. So the compiler answers both questions itself.
 *
 * The three laws under test:
 *   1. **Exactly ONE primary per element id.** Two would be two tab stops for one room;
 *      none would be an element the keyboard cannot reach.
 *   2. **A primary is never a `<text>` node.** A drawn name describes a control; it is
 *      not one, and `aria-hidden` on a focusable node is a keyboard trap.
 *   3. **The id SET never moves.** `accessible` may add attributes to the elements
 *      `annotate` already stamped and must never add, drop or rename one — that is the
 *      invariant a consumer's own regression test (ArchCanvas's `annotateInvariant`) is
 *      written against.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleDir = join(__dirname, "..", "examples");
const example = (name: string) => readFileSync(join(exampleDir, name), "utf8");

/** Every shipped example that compiles cleanly with no `World` (so no `import`s). */
const CORPUS: readonly (readonly [string, string])[] = readdirSync(exampleDir)
  .filter((f) => f.endsWith(".arch"))
  .map((f) => [f, compile(example(f), { noCache: true })] as const)
  .filter(([, r]) => r.errors.length === 0)
  .map(([f]) => [f, example(f)] as const);

/** A room with a name, a room without one, a fixture that declares its room, a
 *  catalogued fixture with no label, and the two openings the language never names. */
const SRC = `plan "T" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=r_kit at (0,0) size 4000x4000 label "Kitchen"
  room id=r_spare at (4000,0) size 4000x4000
  furniture id=f_bed bed in r_kit anchor top-left inset 300 size 1500x2000 label "Bed"
  furniture id=f_sink kitchen_sink at (300,3200) size 800x600
  door id=d_main at (2000,4000) width 900 wall exterior
  window id=w_east at (8000,2000) width 1200 wall exterior
}`;

const A11Y = { annotate: true, accessible: true, noCache: true } as const;

/** Every `data-arch-id` in document order, one entry per drawn node. */
const idsOf = (svg: string): string[] => [...svg.matchAll(/data-arch-id="([^"]*)"/g)].map((m) => m[1]!);

/**
 * Every markup tag in the document, as a flat list.
 *
 * `<[^<>]*>` on purpose, rather than the `<[a-z]+[^>]*>` this file first used: the latter
 * is ambiguous (`[a-z]+` and `[^>]*` both match letters), so matching it against a long
 * attribute run is polynomial and CodeQL rightly failed the build on it. This form is
 * unambiguous and linear, and every later question is asked with a plain `includes`.
 */
const tagsOf = (svg: string): string[] => svg.match(/<[^<>]*>/g) ?? [];

/** The tags of the nodes carrying `data-arch-id`, each paired with that id. */
const idTags = (svg: string): [string, string][] =>
  tagsOf(svg).flatMap((t) => {
    const id = /data-arch-id="([^"]*)"/.exec(t);
    return id ? [[id[1]!, t] as [string, string]] : [];
  });

/** The opening tag of each node carrying `data-arch-primary`. */
const primaryTags = (svg: string): string[] => tagsOf(svg).filter((t) => t.includes('data-arch-primary=""'));

/** id → its `aria-label`, for the nodes that carry one. */
function ariaLabels(svg: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, tag] of idTags(svg)) {
    const label = /aria-label="([^"]*)"/.exec(tag);
    if (label) m.set(id, label[1]!);
  }
  return m;
}

describe("data-arch-label (annotate)", () => {
  it("carries the very text the drawing prints for a labelled room", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    expect(svg).toContain('data-arch-id="r_kit" data-arch-kind="room" data-arch-label="Kitchen"');
    // …and that string is what the room's own <text> node renders.
    expect(svg).toMatch(/data-arch-id="r_kit"[^>]*>Kitchen<\/text>/);
  });

  it("omits the attribute entirely for a room the plan never named", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    const spare = idTags(svg)
      .filter(([id]) => id === "r_spare")
      .map(([, t]) => t);
    expect(spare.length).toBeGreaterThan(0);
    for (const tag of spare) expect(tag).not.toContain("data-arch-label");
  });

  it("names an unlabelled fixture by its CATALOGUE word, verbatim", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    // A catalogued symbol draws no text at all, so the category is the only name there
    // is — emitted exactly as the catalogue spells it, snake_case included.
    expect(svg).toContain('data-arch-id="f_sink" data-arch-kind="furniture" data-arch-label="kitchen_sink"');
  });

  it("names no door, window or cased opening — the language gives them none", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    for (const id of ["d_main", "w_east"]) {
      const tags = idTags(svg)
        .filter(([got]) => got === id)
        .map(([, t]) => t);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(tag).not.toContain("data-arch-label");
    }
  });

  it("survives a label that looks like a replacement pattern ($&, $', $`, $1)", () => {
    // The attributes are spliced into an already-serialized tag with `String.replace`,
    // whose replacement STRING reads these as substitution patterns. A room labelled `$&`
    // put the literal `<polygon` back into its own `data-arch-label`, and `$'` would have
    // spliced in the rest of the element — raw quotes included, an attribute breakout. The
    // hazard was unreachable while the stamped values were digits and identifiers; a free
    // -text label is the first one that can carry them. `test/escape-fuzz.test.ts` found it.
    for (const label of ["$&", "$'", "$`", "$1", "$<x>", "a$&b$'c"]) {
      const src = `plan "T" { units mm room id=r1 at (0,0) size 4000x3000 label "${label}" }`;
      const { svg } = compile(src, { annotate: true, noCache: true });
      const got = /data-arch-label="([^"]*)"/.exec(svg)?.[1];
      // Verbatim, bar the XML escaping every interpolated string gets.
      expect(got, label).toBe(label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      expect(svg, label).not.toContain("<polygonlt;");
    }
  });

  it("is XML-escaped like every other interpolated string", () => {
    const src = `plan "T" { units mm room id=r1 at (0,0) size 4000x3000 label "A & <B>" }`;
    const { svg } = compile(src, { annotate: true, noCache: true });
    expect(svg).toContain('data-arch-label="A &amp; &lt;B&gt;"');
    expect(svg).not.toContain('data-arch-label="A & <B>"');
  });
});

describe("data-arch-primary (annotate)", () => {
  it("marks exactly ONE node per element id", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    const perId = new Map<string, number>();
    for (const [id, tag] of idTags(svg)) {
      if (!tag.includes('data-arch-primary=""')) continue;
      perId.set(id, (perId.get(id) ?? 0) + 1);
    }
    expect(new Set(idsOf(svg)).size).toBeGreaterThan(0);
    expect([...perId.values()]).toEqual([...perId.values()].map(() => 1));
    // Every id that is drawn at all has one — none is left unreachable.
    expect([...perId.keys()].sort()).toEqual([...new Set(idsOf(svg))].sort());
  });

  it("holds over every shipped example, not just the fixture", () => {
    expect(CORPUS.length).toBeGreaterThan(20);
    for (const [name, src] of CORPUS) {
      const { svg } = compile(src, { annotate: true, noCache: true });
      const seen = new Map<string, number>();
      for (const [id, tag] of idTags(svg)) {
        if (tag.includes('data-arch-primary=""')) seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      expect([...new Set(idsOf(svg))].sort(), name).toEqual([...seen.keys()].sort());
      for (const [id, n] of seen) expect(n, `${name} / ${id}`).toBe(1);
    }
  });

  it("is never a <text> node", () => {
    for (const [name, src] of CORPUS) {
      const { svg } = compile(src, { annotate: true, noCache: true });
      for (const tag of primaryTags(svg)) expect(tag.startsWith("<text"), `${name}: ${tag}`).toBe(false);
    }
  });

  it("is the room's floor polygon", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    const tag = primaryTags(svg).find((t) => t.includes('data-arch-id="r_kit"'))!;
    expect(tag.startsWith("<polygon")).toBe(true);
  });

  it("neither attribute appears without annotate", () => {
    const { svg } = compile(SRC, { noCache: true });
    expect(svg).not.toContain("data-arch-label");
    expect(svg).not.toContain("data-arch-primary");
  });
});

describe("accessible + annotate — the element roles", () => {
  it("makes each primary a control: role, tabindex and a name", () => {
    const { svg } = compile(SRC, A11Y);
    for (const tag of primaryTags(svg)) {
      expect(tag).toContain('role="button"');
      // -1, never 0: the drawing is ONE roving tab stop, and which element holds it is
      // the embedder's to decide. Emitting 0 here would be a tab stop per element.
      expect(tag).toContain('tabindex="-1"');
      expect(tag).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("names an element kind-first, and a fixture by its room", () => {
    const names = ariaLabels(compile(SRC, A11Y).svg);
    expect(names.get("r_kit")).toBe("Room Kitchen");
    // Nothing named it, so it answers to its POSITION among the unnamed rooms rather
    // than to a bare "Room" shared with every other one.
    expect(names.get("r_spare")).toBe("Room 1");
    expect(names.get("f_bed")).toBe("Furniture Bed, Kitchen");
    // Declared in no room → the piece is named, the room clause is simply absent. The
    // catalogue word opens like the sentence it is; the underscore is left alone, since
    // splitting it into words is a guess the compiler does not make.
    expect(names.get("f_sink")).toBe("Furniture Kitchen_sink");
    expect(names.get("d_main")).toBe("Door");
    expect(names.get("w_east")).toBe("Window");
  });

  it("capitalises a CATALOGUE word and never an authored one", () => {
    const src = `plan "T" {
  units mm
  room id=r1 at (0,0) size 4000x4000 label "Kitchen"
  furniture id=f1 bed in r1 anchor top-left size 1500x2000
  furniture id=f2 sofa in r1 anchor bottom-left size 1500x800 label "grandma's sofa"
}`;
    const svg = compile(src, A11Y).svg;
    const names = ariaLabels(svg);
    expect(names.get("f1")).toBe("Furniture Bed, Kitchen");
    // The author's words, cased the way the author cased them — the drawing prints them
    // that way and this string must not quietly retitle somebody's furniture.
    expect(names.get("f2")).toBe("Furniture grandma's sofa, Kitchen");
    // …and `data-arch-label` stays the raw token either way.
    expect(svg).toContain('data-arch-id="f1" data-arch-kind="furniture" data-arch-label="bed"');
  });

  it("numbers the unnamed rooms 1, 2, 3 … in document order", () => {
    const src = `plan "T" {
  units mm
  room id=a at (0,0) size 3000x3000
  room id=b at (3000,0) size 3000x3000 label "Kitchen"
  room id=c at (6000,0) size 3000x3000
  room id=d at (9000,0) size 3000x3000
}`;
    const svg = compile(src, A11Y).svg;
    const names = ariaLabels(svg);
    // Dense over the UNNAMED rooms, so a plan with three of them presents three
    // distinguishable controls rather than three called "Room".
    expect(names.get("a")).toBe("Room 1");
    expect(names.get("b")).toBe("Room Kitchen");
    expect(names.get("c")).toBe("Room 2");
    expect(names.get("d")).toBe("Room 3");
    expect(new Set([...names.values()]).size).toBe(names.size);
    // The ordinal is a naming device, not a fact about the plan: the plan calls these
    // rooms nothing, and `data-arch-label` reports what the plan calls things.
    for (const [id, tag] of idTags(svg)) {
      if (id !== "b") expect(tag, id).not.toContain("data-arch-label");
    }
  });

  it("numbers no element kind but rooms", () => {
    const names = ariaLabels(compile(SRC, A11Y).svg);
    // Two doors on one plan legitimately share "Door" — that is what the drawing says
    // about them, and inventing a distinction here would be inventing a fact.
    expect(names.get("d_main")).toBe("Door");
    expect(names.get("w_east")).toBe("Window");
  });

  it("hides the drawn labels, and never the focusable node", () => {
    const svg = compile(SRC, A11Y).svg;
    // The room's name and its area text are announced by the primary's aria-label; left
    // visible to assistive tech they would be read a second and third time.
    const drawnName = idTags(svg).find(
      ([id, t]) => id === "r_kit" && t.startsWith("<text") && !t.includes('data-arch-primary=""'),
    );
    expect(drawnName?.[1]).toContain('aria-hidden="true"');
    for (const tag of primaryTags(svg)) expect(tag).not.toContain("aria-hidden");
  });

  it("adds nothing per element when annotate is off", () => {
    const { svg } = compile(SRC, { accessible: true, noCache: true });
    expect(svg).toContain('role="img"');
    expect(svg).not.toContain('role="button"');
    expect(svg).not.toContain("aria-hidden");
    expect(svg).not.toContain("tabindex");
  });

  it("annotate alone stamps no role, tabindex or aria", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    expect(svg).not.toContain("role=");
    expect(svg).not.toContain("tabindex");
    expect(svg).not.toContain("aria-");
  });

  it("leaves the data-arch-id SET exactly where annotate put it", () => {
    const plain = compile(SRC, { annotate: true, noCache: true }).svg;
    const acc = compile(SRC, A11Y).svg;
    // Order and multiplicity too, not just the set: a consumer's roving tab order is
    // document order, so a reordered node list would silently reorder the keyboard.
    expect(idsOf(acc)).toEqual(idsOf(plain));
  });

  it("is deterministic", () => {
    expect(compile(SRC, A11Y).svg).toBe(compile(SRC, A11Y).svg);
  });
});

describe("accessible idPrefix — the <title>/<desc> ids", () => {
  it("defaults to arch-title/arch-desc, so `true` moves no byte", () => {
    const boolean = compile(SRC, { accessible: true, noCache: true }).svg;
    expect(boolean).toContain('aria-labelledby="arch-title arch-desc"');
    expect(boolean).toContain('<title id="arch-title">');
    expect(compile(SRC, { accessible: {}, noCache: true }).svg).toBe(boolean);
    expect(compile(SRC, { accessible: { idPrefix: "arch" }, noCache: true }).svg).toBe(boolean);
  });

  it("two plans compiled with different prefixes get DISTINCT title ids", () => {
    const a = compile(SRC, { accessible: { idPrefix: "p1" }, noCache: true }).svg;
    const b = compile(SRC, { accessible: { idPrefix: "p2" }, noCache: true }).svg;
    expect(a).toContain('<title id="p1-title">');
    expect(b).toContain('<title id="p2-title">');
    expect(a).toContain('aria-labelledby="p1-title p1-desc"');
    // The whole point: inlined in one page, neither drawing's aria-labelledby can
    // resolve to the other's title.
    expect(a).not.toContain("p2-title");
    expect(b).not.toContain("p1-title");
    expect(a).not.toContain("arch-title");
  });

  it("reduces an id-unsafe prefix rather than failing the compile", () => {
    // A space would split the aria-labelledby token list and name the drawing nothing.
    const { svg, errors } = compile(SRC, { accessible: { idPrefix: "my plan #1" }, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain('<title id="myplan1-title">');
    expect(svg).toContain('aria-labelledby="myplan1-title myplan1-desc"');
  });

  it("falls back to arch when nothing id-safe survives", () => {
    for (const idPrefix of ["", "   ", "!!!"]) {
      const { svg } = compile(SRC, { accessible: { idPrefix }, noCache: true });
      expect(svg, idPrefix).toContain('<title id="arch-title">');
    }
  });

  it("gives each prefix its own cache entry", () => {
    // No `noCache` — the option must be folded into the compile key, or the second
    // call would be served the first one's ids.
    const a = compile(SRC, { accessible: { idPrefix: "c1" } }).svg;
    const b = compile(SRC, { accessible: { idPrefix: "c2" } }).svg;
    expect(a).toContain("c1-title");
    expect(b).toContain("c2-title");
  });
});
