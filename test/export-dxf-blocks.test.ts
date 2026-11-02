import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, type Scene, toDxf } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { CATALOG_CATEGORIES } from "../src/fixtures-catalog.js";
import { DOOR_KINDS, WINDOW_KINDS } from "../src/grammar/tokens.js";
import { everyWord } from "./sheet-text-plans.js";
import { MAX_RUN_TREADS, TREAD_GOING_MM } from "../src/elements/vertical-glyphs.js";

/**
 * Backlog U.13: doors, windows and catalogued furniture are a `BLOCK` with one `INSERT` each, and
 * dimensions are `DIMENSION` entities. The drawing does not change: a Scene's `parts` say which of
 * its nodes belong together, and exploding the file gives the flat file back. `npm run check:dxf`
 * proves the same through ezdxf; this file proves it with a small reader of its own, so it runs
 * everywhere, and holds what the file must look like.
 */

type Pair = [number, string];
interface Ent {
  type: string;
  layer: string;
  pairs: Pair[];
}
interface Block {
  name: string;
  flags: number;
  layer: string;
  ents: Ent[];
}

function pairs(dxf: string): Pair[] {
  const l = dxf.split("\n");
  const out: Pair[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([Number(l[i]), l[i + 1]!]);
  return out;
}

/** The pairs of one section. */
function section(p: readonly Pair[], name: string): Pair[] {
  const at = p.findIndex(([c, v], i) => c === 2 && v === name && p[i - 1]?.[1] === "SECTION");
  if (at < 0) return [];
  const end = p.findIndex(([c, v], i) => i > at && c === 0 && v === "ENDSEC");
  return p.slice(at + 1, end);
}

function entities(p: readonly Pair[]): Ent[] {
  const out: Ent[] = [];
  let cur: Ent | undefined;
  for (const [c, v] of p) {
    if (c === 0) {
      cur = { type: v, layer: "", pairs: [] };
      out.push(cur);
    } else if (cur) {
      if (c === 8 && cur.layer === "") cur.layer = v;
      else cur.pairs.push([c, v]);
    }
  }
  return out;
}

function blocks(dxf: string): Map<string, Block> {
  const out = new Map<string, Block>();
  let cur: Block | undefined;
  for (const e of entities(section(pairs(dxf), "BLOCKS"))) {
    if (e.type === "BLOCK") {
      const name = e.pairs.find(([c]) => c === 2)![1];
      const flags = Number(e.pairs.find(([c]) => c === 70)![1]);
      cur = { name, flags, layer: e.layer, ents: [] };
      out.set(name, cur);
    } else if (e.type === "ENDBLK") cur = undefined;
    else cur?.ents.push(e);
  }
  return out;
}

const ents = (dxf: string): Ent[] => entities(section(pairs(dxf), "ENTITIES"));
const num = (e: Ent, code: number): number => Number(e.pairs.find(([c]) => c === code)?.[1] ?? 0);
const str = (e: Ent, code: number): string | undefined => e.pairs.find(([c]) => c === code)?.[1];
const round = (n: number): number => Math.round(n * 100) / 100 + 0;

/** Turn `(x,y)` by a quarter-turn, counter-clockwise, and stand it at `(ox,oy)`. */
function place(x: number, y: number, turn: number, ox: number, oy: number): [number, number] {
  const [a, b] = turn === 90 ? [-y, x] : turn === 180 ? [-x, -y] : turn === 270 ? [y, -x] : [x, y];
  return [a + ox, b + oy];
}

/** An entity's pairs in plan coordinates, as a comparable string. */
function exploded(e: Ent, turn: number, ox: number, oy: number): string {
  const keep = e.pairs.filter(([c]) => c !== 6);
  const out: string[] = [e.type, e.layer];
  for (let i = 0; i < keep.length; i++) {
    const [c, v] = keep[i]!;
    const next = keep[i + 1];
    if ([10, 11].includes(c) && next?.[0] === c + 10) {
      const [x, y] = place(Number(v), Number(next[1]), turn, ox, oy);
      out.push(`${c}:${round(x)},${round(y)}`);
      i++;
    } else if ((e.type === "ARC" && (c === 50 || c === 51)) || (e.type === "TEXT" && c === 50)) {
      out.push(`${c}:${round((((Number(v) + turn) % 360) + 360) % 360)}`);
    } else if (c === 40) out.push(`${c}:${round(Number(v))}`);
    else out.push(`${c}:${v}`);
  }
  return out.join(" ");
}

/** Every entity of a file in plan coordinates, blocks and dimensions exploded, sorted. */
function explode(dxf: string): string[] {
  const defs = blocks(dxf);
  const out: string[] = [];
  for (const e of ents(dxf)) {
    if (e.type === "INSERT") {
      const b = defs.get(str(e, 2)!)!;
      for (const x of b.ents) out.push(exploded(x, num(e, 50), num(e, 10), num(e, 20)));
    } else if (e.type === "DIMENSION") {
      for (const x of defs.get(str(e, 2)!)!.ents) out.push(exploded(x, 0, 0, 0));
    } else out.push(exploded(e, 0, 0, 0));
  }
  return out.sort();
}

/** A copy of a Scene: `parts` is not a part of the data, so it is left behind. */
const flat = (scene: Scene): Scene => ({ ...scene });

const plan = (body: string): string => `plan "p" {\n  units mm\n  ${body}\n}\n`;
const sceneOf = (src: string): Scene => {
  const c = compile(src, { noCache: true });
  expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return c.scene!;
};
const dxfOf = (src: string): string => toDxf(sceneOf(src));
const inserts = (dxf: string): Ent[] => ents(dxf).filter((e) => e.type === "INSERT");
const dims = (dxf: string): Ent[] => ents(dxf).filter((e) => e.type === "DIMENSION");

const BOX = "wall id=e exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }";

suite("the Scene is the Scene it was", () => {
  const src = readFileSync("examples/studio.arch", "utf8");

  it("`parts` is not data: JSON, keys and a copy do not hold it", () => {
    const scene = sceneOf(src);
    expect(scene.parts?.length).toBeGreaterThan(0);
    expect(Object.keys(scene)).not.toContain("parts");
    expect(JSON.stringify(scene)).not.toContain('"parts"');
    expect(flat(scene).parts).toBeUndefined();
  });

  it("the SVG cannot see it", () => {
    const a = compile(src, { noCache: true });
    const before = a.svg;
    void a.scene?.parts;
    expect(compile(src, { noCache: true }).svg).toBe(before);
  });

  it("parts run in node order, never overlap, and point at what they name", () => {
    const scene = sceneOf(src);
    let end = 0;
    for (const p of scene.parts!) {
      expect(p.from).toBeGreaterThanOrEqual(end);
      expect(p.to).toBeGreaterThan(p.from);
      end = p.to;
    }
    expect(end).toBeLessThanOrEqual(scene.nodes.length);
  });

  it("toDxf is a pure function of the Scene", () => {
    const scene = sceneOf(src);
    expect(toDxf(scene)).toBe(toDxf(scene));
  });

  it("an annotated compile writes the same file", () => {
    const annotated = compile(src, { noCache: true, annotate: true }).scene!;
    expect(toDxf(annotated)).toBe(toDxf(sceneOf(src)));
  });
});

suite("a Scene with no parts is the flat file", () => {
  it("no BLOCKS, no BLOCK_RECORD, no DIMSTYLE, no INSERT", () => {
    const dxf = toDxf(flat(sceneOf(readFileSync("examples/studio.arch", "utf8"))));
    for (const word of ["BLOCKS", "BLOCK_RECORD", "DIMSTYLE", "INSERT", "DIMENSION", "$DIMTXT"]) {
      expect(dxf).not.toContain(word);
    }
  });

  it("nor has a plan with nothing to group any of it", () => {
    const dxf = dxfOf(plan(BOX));
    expect(dxf).toBe(toDxf(flat(sceneOf(plan(BOX)))));
    expect(dxf).not.toContain("BLOCKS");
  });

  it("the axonometric view has no parts and stays flat", () => {
    const c = compile(readFileSync("examples/studio.arch", "utf8"), { noCache: true, view: "iso" });
    expect(c.scene?.parts).toBeUndefined();
    expect(toDxf(c.scene!)).not.toContain("BLOCKS");
  });
});

suite("over the corpus", () => {
  const world = makeNodeWorld("examples");
  const NAMES = readdirSync("examples")
    .filter((f) => f.endsWith(".arch"))
    .sort();

  type Counted = Pick<ReturnType<typeof describe>, "doors" | "windows" | "furniture">;
  const pagesOf = (src: string): Array<{ scene: Scene; facts: Counted }> => {
    const c = compile(src, { noCache: true, world });
    const facts = describe(src, { world });
    return c.pages
      ? c.pages.map((p, i) => ({ scene: p.scene, facts: facts.levels![i]! }))
      : [{ scene: c.scene!, facts }];
  };

  it.each(NAMES)("%s: exploding the file gives the flat file back", (name) => {
    for (const { scene } of pagesOf(readFileSync(join("examples", name), "utf8"))) {
      expect(explode(toDxf(scene))).toEqual(explode(toDxf(flat(scene))));
    }
  });

  it.each(NAMES)("%s: one INSERT per door, window and catalogued fixture, and one DIMENSION per dimension", (name) => {
    for (const { scene, facts } of pagesOf(readFileSync(join("examples", name), "utf8"))) {
      const dxf = toDxf(scene);
      const pieces = facts.furniture.filter((f) => CATALOG_CATEGORIES.includes(f.category)).length;
      expect(inserts(dxf)).toHaveLength(facts.doors.length + facts.windows.length + pieces);
      expect(dims(dxf)).toHaveLength(scene.parts!.filter((p) => p.t === "dimension").length);
    }
  });

  it("the corpus really reaches every kind of part", () => {
    const seen = new Set<string>();
    for (const name of NAMES) {
      for (const { scene } of pagesOf(readFileSync(join("examples", name), "utf8"))) {
        for (const e of inserts(toDxf(scene))) seen.add(str(e, 2)!.split("-")[0]!);
        if (dims(toDxf(scene)).length > 0) seen.add("DIMENSION");
      }
    }
    expect([...seen].sort()).toEqual(["DIMENSION", "DOOR", "FURN", "WINDOW"]);
  });

  it("every layer a file names is declared, and no entity left its AIA layer", () => {
    for (const name of NAMES) {
      for (const { scene } of pagesOf(readFileSync(join("examples", name), "utf8"))) {
        const dxf = toDxf(scene);
        const p = pairs(dxf);
        const table = entities(section(p, "TABLES"))
          .filter((e) => e.type === "LAYER")
          .map((e) => str(e, 2)!);
        const named = [...blocks(dxf).values()].flatMap((b) => [b.layer, ...b.ents.map((e) => e.layer)]);
        for (const l of [...named, ...ents(dxf).map((e) => e.layer)]) expect(table).toContain(l);
      }
    }
  });
});

suite("a block", () => {
  it("a door and a window of each kind are blocks, `glazed_sliding` among them", () => {
    const rows = [...DOOR_KINDS.map((k) => `door ${k}`), ...WINDOW_KINDS.map((k) => `window ${k}`)];
    const body = rows.flatMap((row, i) => {
      const [word, kind] = row.split(" ");
      return [
        `wall id=w${i} exterior thickness 200 { (0,${3000 * i}) (4000,${3000 * i}) }`,
        `${word} id=o${i} ${kind} on w${i} at center width 900`,
      ];
    });
    const dxf = dxfOf(plan(body.join("\n  ")));
    const names = inserts(dxf).map((e) => str(e, 2)!);
    expect(names).toHaveLength(rows.length);
    for (const k of DOOR_KINDS) expect(names).toContain(`DOOR-${k.toUpperCase()}-900`);
    for (const k of WINDOW_KINDS) expect(names).toContain(`WINDOW-${k.toUpperCase()}-900`);
    expect(names).toContain("DOOR-GLAZED_SLIDING-900");
  });

  it("every catalogued fixture is a block, and an uncatalogued word stays flat", () => {
    const body = CATALOG_CATEGORIES.map((c, i) => `furniture id=f${i} ${c} at (${3000 * i},0) size 1000x1000`);
    const dxf = dxfOf(plan(`${body.join("\n  ")}\n  furniture id=odd hammock at (0,3000) size 1000x1000 label "H"`));
    expect(inserts(dxf)).toHaveLength(CATALOG_CATEGORIES.length);
    expect(
      ents(dxf)
        .filter((e) => e.type === "TEXT")
        .map((e) => str(e, 1)),
    ).toContain("H");
  });

  it("a cased opening stays flat: the card names doors, windows and furniture", () => {
    const dxf = dxfOf(plan(`${BOX}\n  opening id=o on e at 2000 width 900`));
    expect(inserts(dxf)).toEqual([]);
    expect(dxf).not.toContain("BLOCKS");
  });

  it("the same door on all four sides of a room is one block, turned", () => {
    const doors = [1000, 7000, 13000, 19000].map(
      (at, i) => `door id=d${i} on e at ${at} width 900 hinge left swing in`,
    );
    const dxf = dxfOf(plan(`${BOX}\n  room id=r at (0,0) size 6000x6000\n  ${doors.join("\n  ")}`));
    expect(inserts(dxf).map((e) => str(e, 2))).toEqual(Array(4).fill("DOOR-HINGED-900"));
    expect(
      inserts(dxf)
        .map((e) => num(e, 50))
        .sort((a, b) => a - b),
    ).toEqual([0, 90, 180, 270]);
    expect([...blocks(dxf).keys()].filter((n) => n.startsWith("DOOR"))).toEqual(["DOOR-HINGED-900"]);
  });

  it("a different drawing under one name is a second block, never a wrong one", () => {
    const doors = ["hinge left", "hinge right"].map(
      (h, i) => `door id=d${i} on e at ${1000 + 2000 * i} width 900 ${h} swing in`,
    );
    const dxf = dxfOf(plan(`${BOX}\n  room id=r at (0,0) size 6000x6000\n  ${doors.join("\n  ")}`));
    expect(inserts(dxf).map((e) => str(e, 2))).toEqual(["DOOR-HINGED-900", "DOOR-HINGED-900-2"]);
  });

  it("a wall at another angle keeps turn 0, and explodes to the flat drawing", () => {
    const src = plan("wall id=w exterior thickness 200 { (0,0) (3000,1700) }\n  door id=d on w at center width 900");
    const dxf = dxfOf(src);
    expect(num(inserts(dxf)[0]!, 50)).toBe(0);
    expect(explode(dxf)).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("so does a door on a curve", () => {
    const src = plan(
      "wall id=w exterior thickness 200 { (0,0) arc (4000,0) radius 3000 cw }\n  door id=d on w at center width 900",
    );
    expect(num(inserts(dxfOf(src))[0]!, 50)).toBe(0);
    expect(explode(dxfOf(src))).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("a width that is not whole keeps its block name a plain one", () => {
    const dxf = dxfOf(plan(`${BOX}\n  door id=d on e at 2000 width 912.5`));
    expect(str(inserts(dxf)[0]!, 2)).toBe("DOOR-HINGED-912P5");
  });

  it("a turned fixture stands at the middle of its footprint, and shares its block", () => {
    const body = [0, 90, 180, 270].map(
      (r, i) => `furniture id=b${i} bed at (${4000 * i},0) size 2000x2000 rotate ${r}`,
    );
    const src = plan(body.join("\n  "));
    const dxf = dxfOf(src);
    expect(inserts(dxf).map((e) => [num(e, 10), num(e, 20), num(e, 50)])).toEqual([
      [1000, -1000, 0],
      [5000, -1000, 270],
      [9000, -1000, 180],
      [13000, -1000, 90],
    ]);
    expect([...blocks(dxf).keys()].filter((n) => n.startsWith("FURN"))).toEqual(["FURN-BED-2000X2000"]);
    expect(explode(dxf)).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("a mirrored `place` draws another shape, and says so with its own block", () => {
    const src = plan(`component c() { furniture id=s sofa_l at (0,0) size 2000x2000 }
  place c() as a at (0,0)
  place c() as b at (9000,0) mirror x`);
    const dxf = dxfOf(src);
    expect(new Set(inserts(dxf).map((e) => str(e, 2))).size).toBe(2);
    expect(explode(dxf)).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("the entities keep their AIA layer, and the INSERT stands on the element's", () => {
    const dxf = dxfOf(plan(`${BOX}\n  door id=d on e at 2000 width 900\n  window id=v on e at 8000 width 900`));
    const by = (n: string) => inserts(dxf).find((e) => str(e, 2)!.startsWith(n))!;
    expect(by("DOOR").layer).toBe("A-DOOR");
    expect(by("WINDOW").layer).toBe("A-GLAZ");
    expect(
      new Set(
        blocks(dxf)
          .get("DOOR-HINGED-900")!
          .ents.map((e) => e.layer),
      ),
    ).toEqual(new Set(["A-DOOR"]));
  });

  it("a block holds no block, and the file holds the blocks it uses", () => {
    const dxf = dxfOf(readFileSync("examples/studio.arch", "utf8"));
    const defs = blocks(dxf);
    for (const b of defs.values()) expect(b.ents.map((e) => e.type)).not.toContain("INSERT");
    const used = new Set(ents(dxf).flatMap((e) => (e.type === "INSERT" || e.type === "DIMENSION" ? [str(e, 2)!] : [])));
    expect(new Set([...defs.keys()].filter((n) => !n.endsWith("_Space")))).toEqual(used);
    const records = entities(section(pairs(dxf), "TABLES"))
      .filter((e) => e.type === "BLOCK_RECORD")
      .map((e) => str(e, 2));
    expect(records).toEqual([...defs.keys()]);
  });
});

suite("a dimension", () => {
  const W = "wall id=w exterior thickness 200 { (0,0) (4000,0) }";

  it("is a rotated DIMENSION on its layer, measured by its two points", () => {
    const dxf = dxfOf(plan(`${W}\n  dim (0,0)->(4000,0) offset -600`));
    const [d] = dims(dxf);
    expect(d?.layer).toBe("A-ANNO-DIMS");
    expect(num(d!, 70)).toBe(160);
    expect([num(d!, 13), num(d!, 23), num(d!, 14), num(d!, 24)]).toEqual([0, 0, 4000, 0]);
    expect([num(d!, 10), num(d!, 20)]).toEqual([4000, 600]);
    expect(str(d!, 3)).toBe("ARCHLANG");
    expect(str(d!, 1)).toBeUndefined();
  });

  it("its angle reads as the sheet does, in all four directions", () => {
    const angle = (a: string, b: string): number => num(dims(dxfOf(plan(`${W}\n  dim ${a}->${b}`)))[0]!, 50);
    expect(angle("(0,0)", "(4000,0)")).toBe(0);
    expect(angle("(4000,0)", "(0,0)")).toBe(180);
    expect(angle("(0,0)", "(0,4000)")).toBe(270);
    expect(angle("(0,4000)", "(0,0)")).toBe(90);
  });

  it("its anonymous block holds what the drawing drew, in plan coordinates", () => {
    const src = plan(`${W}\n  dim (0,0)->(4000,0) offset -600`);
    const dxf = dxfOf(src);
    const name = str(dims(dxf)[0]!, 2)!;
    expect(name).toBe("*D1");
    expect(blocks(dxf).get(name)?.flags).toBe(1);
    expect(
      blocks(dxf)
        .get(name)
        ?.ents.map((e) => e.type),
    ).toEqual(["LINE", "LINE", "LINE", "LINE", "LINE", "TEXT"]);
    expect(explode(dxf)).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("written text is its override, cleaned as a TEXT is", () => {
    const d = dims(dxfOf(plan(`${W}\n  dim (0,0)->(4000,0) text "4 m Ñ"`)))[0]!;
    expect(str(d, 1)).toBe("4 m \\U+00D1");
  });

  it("a text with a line break cannot break the file", () => {
    const dxf = dxfOf(plan(`${W}\n  dim (0,0)->(4000,0) text "a\\nb"`));
    expect(str(dims(dxf)[0]!, 1)).toBe("a b");
    expect(dxf.split("\n").length % 2).toBe(1);
  });

  it("a figure that is not whole is written out, since the style redraws whole millimetres", () => {
    const fractional = dims(dxfOf(plan(`${W}\n  dim (0,0)->(12345.68,0)`)))[0]!;
    expect(str(fractional, 1)).toBe("12345.68");
    expect(
      blocks(dxfOf(plan(`${W}\n  dim (0,0)->(12345.68,0)`)))
        .get("*D1")
        ?.ents.at(-1)?.pairs,
    ).toContainEqual([1, "12345.68"]);
    // A whole figure stays the reader's own measure, so it follows a stretch in CAD.
    expect(str(dims(dxfOf(plan(`${W}\n  dim (0,0)->(12345,0)`)))[0]!, 1)).toBeUndefined();
  });

  it("a decimal comma stands in text, and never in a number the file carries", () => {
    const pages = compile(everyWord('  sheet text { decimal "," }'), { noCache: true }).pages!;
    let written = 0;
    for (const { scene } of pages) {
      const dxf = toDxf(scene);
      for (const d of dims(dxf)) if (str(d, 1)?.includes(",")) written++;
      for (const [code, value] of pairs(dxf)) {
        // Group 1 is text, 2, 3, 6, 7, 8 and 9 are names, 100 a subclass and 0 an entity type.
        if ([0, 1, 2, 3, 4, 6, 7, 8, 9, 100].includes(code)) continue;
        expect(value, `group ${code}`).toMatch(/^-?\d+(\.\d+)?$/);
      }
    }
    expect(written).toBeGreaterThan(0);
    // And the same plan with a point writes the same geometry: only the text differs.
    const plain = compile(everyWord('  sheet text { decimal "." }'), { noCache: true }).pages!;
    expect(dims(toDxf(plain[0]!.scene)).length).toBe(dims(toDxf(pages[0]!.scene)).length);
  });

  it('an empty text is no number: "" in the file would mean the measure', () => {
    expect(str(dims(dxfOf(plan(`${W}\n  dim (0,0)->(4000,0) text ""`)))[0]!, 1)).toBe(" ");
  });

  it("`dim radius` and `dim diameter` carry their `R` and `φ`", () => {
    const dxf = dxfOf(
      plan(`wall id=w exterior thickness 200 { (0,0) (4000,0) arc (4000,4000) radius 2000 }
  room id=c circle at (9000,2000) radius 1000
  dim radius w
  dim diameter c`),
    );
    expect(dims(dxf).map((d) => str(d, 1))).toEqual(["R2000", "\\U+03C62000"]);
  });

  it("`dims auto` chains are dimensions too, and a stepped facade measures along the baseline", () => {
    const src = plan(`room id=a at (0,0) size 4000x3000
  room id=b at (4000,500) size 3000x2500
  walls from rooms exterior 200 partition 100
  dims auto all`);
    const dxf = dxfOf(src);
    expect(dims(dxf).length).toBeGreaterThan(4);
    expect(new Set(dims(dxf).map((d) => [0, 90, 180, 270].includes(num(d, 50))))).toEqual(new Set([true]));
    expect(explode(dxf)).toEqual(explode(toDxf(flat(sceneOf(src)))));
  });

  it("a dimension of nothing has no direction, and stays flat", () => {
    const dxf = dxfOf(plan(`${W}\n  dim (100,0)->(100,0)`));
    expect(dims(dxf)).toEqual([]);
  });

  it("the style row and the header agree, sized from the drawing", () => {
    const src = plan(`${W}\n  dim (0,0)->(4000,0)`);
    const scene = sceneOf(src);
    const dxf = toDxf(scene);
    const row = entities(section(pairs(dxf), "TABLES")).find((e) => e.type === "DIMSTYLE")!;
    expect(str(row, 2)).toBe("ARCHLANG");
    expect(num(row, 142)).toBeCloseTo(scene.sizes.refDim * 0.012, 3);
    const p = pairs(dxf);
    const header = (name: string): string => p[p.findIndex(([c, v]) => c === 9 && v === name) + 1]![1];
    expect(header("$DIMSTYLE")).toBe("ARCHLANG");
    expect(Number(header("$DIMTXT"))).toBe(num(row, 140));
    expect(Number(header("$DIMTSZ"))).toBe(num(row, 142));
    expect(header("$DIMDEC")).toBe("0");
  });

  it("a plan with no dimension declares no style", () => {
    const dxf = dxfOf(plan(`${BOX}\n  door id=d on e at 2000 width 900`));
    expect(dxf).toContain("BLOCKS");
    expect(dxf).not.toContain("DIMSTYLE");
    expect(dxf).not.toContain("$DIMTXT");
  });
});

suite("the drawing budget", () => {
  /** A hostile plan of its size: every piece its own shape, so no block is shared. */
  const many = (n: number): string =>
    plan(
      Array.from(
        { length: n },
        (_, i) => `furniture id=f${i} bed at (${3000 * (i % 200)},${3000 * Math.floor(i / 200)}) size ${1000 + i}x2000`,
      ).join("\n  "),
    );

  it("a block costs a constant number of records beyond what it drew", () => {
    const scene = sceneOf(many(500));
    const file = toDxf(scene);
    const parts = scene.parts!.length;
    const inBlocks = [...blocks(file).values()].reduce((s, b) => s + b.ents.length, 0);
    const flatCount = ents(toDxf(flat(scene))).length;
    // Exploded, it is the flat file, entity for entity: nothing multiplies.
    expect(inBlocks + ents(file).length - parts).toBe(flatCount);
    expect(file.length).toBeLessThan(toDxf(flat(scene)).length * 2);
  });

  it("no INSERT is an array and none is scaled: exploding it cannot multiply", () => {
    for (const e of inserts(dxfOf(many(50)))) {
      expect(e.pairs.map(([c]) => c).filter((c) => [41, 42, 43, 44, 45, 70, 71].includes(c))).toEqual([]);
    }
  });

  it("a plan past the budget has no Scene, so it has no file", () => {
    // The plan `test/drawing-budget.test.ts` opens with: a step of a long escalator is a primitive.
    const run = MAX_RUN_TREADS * TREAD_GOING_MM;
    const c = compile(plan(`for i in 0..500 { escalator at (0, 10000 + i * 2000) size ${run}x1200 dir up }`), {
      noCache: true,
    });
    expect(c.diagnostics.map((d) => d.code)).toContain("E_DRAWING_LIMIT");
    expect(c.scene).toBeUndefined();
  });
});

suite("the wiring", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("the reader check runs in a gating job, from a pinned reader", () => {
    const builds = ci.slice(ci.indexOf("  builds:\n"), ci.indexOf("  windows:\n"));
    expect(builds).toContain("npm run check:dxf");
    expect(builds).toContain("e2e/requirements.txt");
    const pins = readFileSync("e2e/requirements.txt", "utf8")
      .split("\n")
      .filter((l) => l !== "" && !l.startsWith("#"));
    expect(pins.map((l) => l.split("==")[0])).toContain("ezdxf");
    for (const pin of pins) expect(pin).toMatch(/^[\w-]+==\d+(\.\d+)+$/);
  });

  it("the core takes no dependency on it", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: object };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
