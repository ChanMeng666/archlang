import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { USE_KINDS, type UseKind } from "../src/ast.js";
import { CATALOG_CATEGORIES, defaultFootprint, zoneFixtureCategories } from "../src/fixtures-catalog.js";
import {
  type FurnishCodes,
  furnishCheckBound,
  furnishStage,
  MAX_CHECKS_PER_ROOM,
  MAX_PIECES_PER_ROOM,
} from "../src/furnish.js";
import {
  compile,
  describe as describePlan,
  FINISH_STAGE_ORDER,
  finish,
  format,
  FURNISH_TABLE,
  LINT_PROFILE_NAMES,
  LINT_PROFILES,
  lint,
} from "../src/index.js";
import { sourceConflicts } from "../src/repair.js";
import type { World } from "../src/world.js";

/**
 * `finish()` — the furnish stage (`docs/adr/0025-furnish-as-explicit-transform.md`).
 *
 * Each law is named in a suite title. The laws that hold for the whole of `finish` — the
 * fixpoint, never-worse, `fmt` then `finish`, and the SHA-256 sweep over the examples — are
 * pinned in `test/finish.test.ts`, which runs both stages; this file adds what is the
 * furnish stage's own. The corpus is every shipped example, read from the directory, and a
 * generated row of rooms.
 */

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};
const NAMES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .map((f) => f.slice(0, -".arch".length))
  .sort();
const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");

function codes(src: string, w: World | undefined = world): Map<string, number> {
  const out = new Map<string, number>();
  const env = w ? { world: w } : {};
  for (const d of [...compile(src, { ...env, noCache: true }).diagnostics, ...lint(src, env)])
    out.set(d.code ?? "", (out.get(d.code ?? "") ?? 0) + 1);
  return out;
}
const gainedBy = (before: string, after: string, w?: World): string[] => {
  const was = codes(before, w);
  return [...codes(after, w)].filter(([c, n]) => n > (was.get(c) ?? 0)).map(([c]) => c);
};
const errorsOf = (src: string): string[] =>
  compile(src, { world, noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
/** `out` is `src` with one run of bytes inserted at one offset. */
function isOneInsertion(src: string, out: string): boolean {
  let p = 0;
  while (p < src.length && src[p] === out[p]) p++;
  let s = 0;
  while (s < src.length - p && src[src.length - 1 - s] === out[out.length - 1 - s]) s++;
  return out.length >= src.length && p + s === src.length;
}
const furnitureLines = (src: string): string[] => src.split(/\r?\n/).filter((l) => /^\s*furniture /.test(l));

/** A flat: a bedroom, a bathroom and a hall off one corridor wall. Nothing is furnished. */
const FLAT = `plan "Flat" {
  units mm
  grid 50
  # the shell
  wall id=w_ext exterior thickness 200 { (0,0) (7000,0) (7000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (0,3600) (7000,3600) }
  wall id=w_bb partition thickness 100 { (4200,0) (4200,3600) }
  room id=r_bed at (0,0) size 4200x3600 label "Bedroom" uses bedroom
  room id=r_bath at (4200,0) size 2800x3600 label "Bathroom" uses bath
  room id=r_hall at (0,3600) size 7000x1400 label "Hall" uses hall
  door id=d_bed on w_mid at 3400 width 900 swing into r_bed
  door id=d_bath on w_mid at 6200 width 800 swing into r_bath
  door id=d_front on w_ext at 62% width 1000 swing in
  window id=win_bed on w_ext at 2100 width 1600
}
`;

suite("furnish — the corpus is not empty", () => {
  it("some shipped example has an empty room the stage furnishes", () => {
    const changed = NAMES.filter((n) => finish(srcOf(n), { world, only: "furnish" }).changed);
    expect(changed.length).toBeGreaterThan(0);
  }, 120000);

  it("furnishes the flat's bedroom and bathroom, and leaves the hall alone", () => {
    const r = finish(FLAT, { only: "furnish" });
    expect(r.unresolved).toEqual([]);
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r_bed", "r_bath"]);
    const words = r.changes.map((c) => c.text.split(" ")[1]);
    expect(words).toEqual(expect.arrayContaining(["bed", "wc", "basin"]));
    expect(r.source).not.toMatch(/furniture \w+ .*r_hall/);
    expect(gainedBy(FLAT, r.source, undefined)).toEqual([]);
    expect(codes(FLAT, undefined).has("W_ROOM_NO_FIXTURE")).toBe(true);
    expect(codes(r.source, undefined).has("W_ROOM_NO_FIXTURE")).toBe(false);
  });
});

suite("furnish law — placement is relative: `against wall` or `in <room> anchor`, never `at (x,y)`", () => {
  const FORM =
    /^furniture \w+ (against wall \w+( segment \d+)? offset \d+ side (left|right) in \w+|in \w+ anchor [a-z-]+( flush)?( inset \d+)? size \d+x\d+ rotate (0|90|180|270))$/;
  for (const name of NAMES)
    it(`${name}: every statement written is one of the two relative forms`, () => {
      for (const c of finish(srcOf(name), { world, only: "furnish" }).changes) {
        expect(c.text).toMatch(FORM);
        expect(c).toMatchObject({ stage: "furnish", kind: "added", statement: "furniture" });
      }
    }, 120000);

  it("a services fixture is written `against wall`, a free-standing piece anchored with size and rotate", () => {
    const texts = finish(FLAT, { only: "furnish" }).changes.map((c) => c.text);
    expect(texts.find((t) => t.startsWith("furniture wc "))).toMatch(
      /against wall w_\w+ .*offset \d+ side \w+ in r_bath$/,
    );
    expect(texts.find((t) => t.startsWith("furniture bed "))).toMatch(
      /in r_bed anchor [a-z-]+ flush size \d+x\d+ rotate \d+$/,
    );
    for (const t of texts) expect(t).toMatch(FORM);
  });
});

suite("furnish law — fill only: a room that holds furniture is not touched", () => {
  const HALF = FLAT.replace(
    "  door id=d_bed",
    "  furniture armchair at (300,300) size 800x800 in r_bed   # the only piece\n  door id=d_bed",
  );

  it("only the empty room gains pieces, and the authored piece keeps its bytes", () => {
    const r = finish(HALF, { only: "furnish" });
    expect(r.changed).toBe(true);
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r_bath"]);
    expect(r.source).toContain("  furniture armchair at (300,300) size 800x800 in r_bed   # the only piece\n");
    expect(furnitureLines(r.source).filter((l) => l.includes("r_bed")).length).toBe(1);
  });

  it("a piece with no `in` counts for the room it stands in", () => {
    const r = finish(HALF.replace(" in r_bed   #", "   #"), { only: "furnish" });
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r_bath"]);
  });

  it("a plan whose rooms are all furnished is a byte no-op", () => {
    const done = finish(FLAT, { only: "furnish" }).source;
    const r = finish(done, { only: "furnish" });
    expect(r).toEqual({ source: done, changes: [], unresolved: [], changed: false });
  });

  for (const name of NAMES)
    it(`${name}: authored furniture survives byte for byte, and a second run adds nothing`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "furnish" });
      const kept = furnitureLines(r.source).filter((l) => !r.changes.some((c) => l.trim() === c.text));
      expect(kept).toEqual(furnitureLines(src));
      const again = finish(r.source, { world, only: "furnish" });
      expect(again.source).toBe(r.source);
      expect(again.changed).toBe(false);
    }, 120000);
});

suite("furnish law — never worse: no error, no new diagnostic code, no new furniture conflict", () => {
  for (const name of NAMES)
    it(`${name}`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "furnish" });
      expect(errorsOf(r.source)).toEqual([]);
      expect(gainedBy(src, r.source)).toEqual([]);
      const was = sourceConflicts(src, { world }).conflicts;
      expect([...sourceConflicts(r.source, { world }).conflicts.keys()].filter((k) => !was.has(k))).toEqual([]);
    }, 120000);

  it("a room whose required piece has no clear position is left empty and reported with its id", () => {
    // 1600 mm square: no wall run holds a 2000 mm bed.
    const src = `plan "Box" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (1600,0) (1600,1600) (0,1600) close }
  room id=r at (0,0) size 1600x1600 label "Bedroom" uses bedroom
  door id=d on w at 10% width 800 swing in
}
`;
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toEqual([expect.objectContaining({ stage: "furnish", room: "r" })]);
    expect(r.unresolved[0]!.reason).toContain("no position for the required `bed`");
    expect(r.unresolved[0]!.span).toEqual({ start: src.indexOf("room id=r"), end: src.indexOf("\n  door") });
  });

  it("a refused room names the code that blocked it, and the pieces of the other rooms stay", () => {
    // Every check that adds a bed is refused; the bathroom's pieces are judged on their own.
    const real = (s: string): FurnishCodes => {
      const m = codes(s, undefined);
      return { errors: false, codes: m };
    };
    const r = furnishStage(FLAT, {}, (s) => {
      const c = real(s);
      if (s.includes("furniture bed ")) c.codes.set("W_TEST_BLOCK", 1);
      return c;
    });
    const note = r.unresolved.find((u) => u.room === "r_bed")!;
    expect(note.codes).toEqual(["W_TEST_BLOCK"]);
    expect(note.reason).toContain("W_TEST_BLOCK");
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r_bath"]);
    expect(r.source).not.toContain("furniture bed");
  });
});

suite("furnish law — pure insertion: every authored byte and comment survives, in place", () => {
  for (const name of NAMES)
    it(`${name}: the result is the source with one run of statements inserted`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "furnish" });
      expect(isOneInsertion(src, r.source)).toBe(true);
      expect(r.changed).toBe(r.source !== src);
    }, 120000);

  it("the statements follow the plan's last element, in its indentation and line ending", () => {
    const crlf = FLAT.replace(/\n/g, "\r\n").replace(/^ {2}/gm, "\t");
    const r = finish(crlf, { only: "furnish" });
    expect(r.changed).toBe(true);
    expect(r.source.replace(/\r\n/g, "")).not.toContain("\n");
    expect(r.source).toContain("width 1600\r\n\tfurniture ");
    expect(r.source.endsWith("\r\n}\r\n")).toBe(true);
    expect(r.source).toContain("\t# the shell\r\n");
  });

  it("they go after authored furniture when the plan has some, and never inside a `for` or a component", () => {
    const src = FLAT.replace(
      "  door id=d_bed on",
      `  component post(x) {\n    furniture plant at (x, 4000) size 300x300\n  }\n  furniture plant at (200,4000) size 300x300 in r_hall\n  for i in 0..2 {\n    furniture plant at (1000 + i * 600, 4000) size 300x300 in r_hall\n  }\n  door id=d_bed on`,
    );
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.changed).toBe(true);
    expect(isOneInsertion(src, r.source)).toBe(true);
    expect(r.source).toContain(`  furniture plant at (200,4000) size 300x300 in r_hall\n  ${r.changes[0]!.text}\n`);
    expect(r.source).toContain(
      "  for i in 0..2 {\n    furniture plant at (1000 + i * 600, 4000) size 300x300 in r_hall\n  }\n",
    );
    expect(r.source).toContain("  component post(x) {\n    furniture plant at (x, 4000) size 300x300\n  }\n");
  });

  it("a plan written on one line is furnished before its closing brace", () => {
    const one = `plan "One" { ${FLAT.split("\n")
      .slice(1, -2)
      .filter((l) => !l.trim().startsWith("#"))
      .map((l) => l.trim())
      .join(" ")} }`;
    expect(errorsOf(one)).toEqual([]);
    const r = finish(one, { only: "furnish" });
    expect(r.changed).toBe(true);
    expect(isOneInsertion(one, r.source)).toBe(true);
    expect(errorsOf(r.source)).toEqual([]);
    expect(finish(r.source, { only: "furnish" }).changed).toBe(false);
  });

  it("every change's span is the insertion point in the caller's source, also after the sheet stage", () => {
    for (const only of ["furnish", undefined] as const) {
      const r = finish(FLAT, only ? { only } : {});
      const at = FLAT.indexOf("\n", FLAT.indexOf("window id=win_bed"));
      for (const c of r.changes.filter((x) => x.stage === "furnish")) expect(c.span).toEqual({ start: at, end: at });
      for (const c of r.changes) expect(c.span.end).toBeLessThanOrEqual(FLAT.length);
    }
    const title = finish(FLAT).changes.find((c) => c.statement === "title")!;
    expect(title.span.start).toBe(FLAT.lastIndexOf("}"));
  });
});

suite("furnish law — scope: rectangular rooms of a single-storey plan", () => {
  it("a polygon room is reported and left empty; its bounding box is never used", () => {
    const src = `plan "L" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) close }
  room id=r polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Bedroom" uses bedroom
  door id=d on w at 10% width 900 swing in
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toEqual([expect.objectContaining({ stage: "furnish", room: "r" })]);
    expect(r.unresolved[0]!.reason).toContain("polygon room");
  });

  it("a plan with `level` blocks is reported room by room and left as it is", () => {
    const multi = NAMES.filter((n) => /^\s*level /m.test(srcOf(n)));
    expect(multi.length).toBeGreaterThan(0);
    for (const name of multi) {
      const r = finish(srcOf(name), { world, only: "furnish" });
      expect(r.source).toBe(srcOf(name));
      expect(r.changes).toEqual([]);
      for (const u of r.unresolved) expect(u.reason).toContain("single-storey");
    }
    const two = `plan "Two" {
  units mm
  level 0 {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Bedroom" uses bedroom
    door id=d on w at 10% width 900 swing in
  }
  level 1 {
    wall id=w1 exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r1 at (0,0) size 4000x4000 label "Study" uses office
  }
}
`;
    const r = finish(two, { only: "furnish" });
    expect(r.source).toBe(two);
    expect(r.unresolved.map((u) => u.room)).toEqual(["r", "r1"]);
  });

  it("a room whose use is unknown or circulation-only is left alone, silently", () => {
    const src = FLAT.replace(`label "Bedroom" uses bedroom`, `label "Room 1"`).replace(
      `label "Bathroom" uses bath`,
      `label "Lobby" uses entry circulation`,
    );
    const r = finish(src, { only: "furnish" });
    expect(r).toEqual({ source: src, changes: [], unresolved: [], changed: false });
  });

  it("a room with no `id=` of its own is reported, not furnished through its positional id", () => {
    const src = FLAT.replace("room id=r_bath at", "room at").replace(" swing into r_bath", " swing in");
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.changes.every((c) => c.room === "r_bed")).toBe(true);
    expect(r.unresolved.some((u) => u.reason.includes("`id=`"))).toBe(true);
  });

  it("a source that does not compile is returned untouched", () => {
    for (const src of [`plan "X" {\n  units mm\n  room at (0,0) size\n}\n`, "this is not a plan", ""]) {
      const r = finish(src, { only: "furnish" });
      expect(r.source).toBe(src);
      expect(r.changed).toBe(false);
      expect(r.changes).toEqual([]);
      expect(r.unresolved).toEqual([expect.objectContaining({ stage: "furnish" })]);
    }
  });
});

suite("furnish law — a room with several uses gets the union: the wall run first, then the largest use", () => {
  it("a studio gets the kitchen run, then the bed before the sofa, each word once", () => {
    const src = `plan "Studio" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r at (0,0) size 8000x6000 label "Studio" uses living kitchen bedroom
  door id=d on w at 5% width 900 swing in
}
`;
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved).toEqual([]);
    const words = r.changes.map((c) => c.text.split(" ")[1]!);
    expect(new Set(words).size).toBe(words.length);
    expect(words.indexOf("bed")).toBeLessThan(words.indexOf("sofa"));
    expect(words.indexOf("kitchen_sink")).toBe(0);
    expect(words.length).toBeLessThanOrEqual(MAX_PIECES_PER_ROOM);
    expect(gainedBy(src, r.source, undefined)).toEqual([]);
  });
});

suite("furnish law — the default run furnishes first, so the sheet lists the new pieces", () => {
  it("the stage order is furnish, then sheet", () => {
    expect([...FINISH_STAGE_ORDER]).toEqual(["furnish", "sheet"]);
    const stages = finish(FLAT).changes.map((c) => c.stage);
    expect(stages.lastIndexOf("furnish")).toBeLessThan(stages.indexOf("sheet"));
    expect(stages).toContain("furnish");
    expect(stages).toContain("sheet");
  });

  it("the legend of the finished plan has the rows of the furniture finish wrote", () => {
    const both = finish(FLAT).source;
    const sheetOnly = finish(FLAT, { only: "sheet" }).source;
    expect(both).toContain("legend");
    // The legend is a table of text rows: the furnished sheet has the unfurnished one's, and more.
    const rows = (src: string): number => (compile(src, { noCache: true }).svg?.match(/<text/g) ?? []).length;
    expect(rows(both)).toBeGreaterThan(rows(sheetOnly));
    expect(describePlan(both).sheet?.fits).toBe(true);
    expect(finish(format(both)).changed).toBe(false);
  });
});

suite("furnish law — bounded: the compile checks are linear in the rooms", () => {
  const measure = (src: string, w?: World) => {
    const env = w ? { world: w } : {};
    return furnishStage(src, env, (s) => ({
      errors: compile(s, { ...env, noCache: true }).diagnostics.some((d) => d.severity === "error"),
      codes: codes(s, w),
    }));
  };

  it("the bound is stated per room", () => {
    expect(furnishCheckBound(0)).toBe(1);
    expect(furnishCheckBound(3) - furnishCheckBound(2)).toBe(MAX_CHECKS_PER_ROOM);
  });

  for (const name of NAMES)
    it(`${name}: no more checks than the bound for its empty rooms`, () => {
      const r = measure(srcOf(name), world);
      expect(r.checks).toBeLessThanOrEqual(furnishCheckBound(r.rooms));
    }, 120000);

  it("a plan on which every proposal is refused spends the whole budget and no more", () => {
    let calls = 0;
    const r = furnishStage(FLAT, {}, (s) => {
      calls++;
      return { errors: false, codes: new Map(s === FLAT ? [] : [["W_TEST_BLOCK", 1]]) };
    });
    expect(r.source).toBe(FLAT);
    expect(r.changed).toBe(false);
    expect(r.rooms).toBe(2);
    expect(r.checks).toBeGreaterThan(2);
    expect(r.checks).toBeLessThanOrEqual(furnishCheckBound(r.rooms));
    expect(calls).toBeLessThanOrEqual(furnishCheckBound(r.rooms));
    expect(r.unresolved.map((u) => u.codes)).toEqual([["W_TEST_BLOCK"], ["W_TEST_BLOCK"]]);
  });

  it("is deterministic", () => {
    expect(finish(FLAT)).toEqual(finish(FLAT));
  });
});

suite("furnish law — generated rows of rooms: fixpoint, never worse, pure insertion", () => {
  const FURNISHED_USES = USE_KINDS.filter((u) => (FURNISH_TABLE[u]?.length ?? 0) > 0);
  const room = fc.record({
    w: fc.integer({ min: 18, max: 60 }).map((n) => n * 100),
    uses: fc.uniqueArray(fc.constantFrom(...USE_KINDS), { minLength: 0, maxLength: 3 }),
    door: fc.integer({ min: 15, max: 85 }),
    window: fc.boolean(),
    furnished: fc.boolean(),
  });
  const row = fc
    .record({
      depth: fc.integer({ min: 20, max: 50 }).map((n) => n * 100),
      rooms: fc.array(room, { minLength: 1, maxLength: 4 }),
    })
    .map(({ depth, rooms }) => {
      const total = rooms.reduce((s, r) => s + r.w, 0);
      const lines = [
        `plan "Row" {`,
        "  units mm",
        `  wall id=shell exterior thickness 200 { (0,0) (${total},0) (${total},${depth + 1500}) (0,${depth + 1500}) close }`,
        `  wall id=spine partition thickness 100 { (0,${depth}) (${total},${depth}) }`,
        `  room id=hall at (0,${depth}) size ${total}x1500 label "Hall" uses hall`,
        `  door id=front on shell at 62% width 1000 swing in`,
      ];
      let x = 0;
      rooms.forEach((r, i) => {
        if (i > 0) lines.push(`  wall id=p${i} partition thickness 100 { (${x},0) (${x},${depth}) }`);
        lines.push(
          `  room id=r${i} at (${x},0) size ${r.w}x${depth}${r.uses.length ? ` uses ${r.uses.join(" ")}` : ""}`,
        );
        lines.push(`  door id=d${i} on spine at ${Math.round(x + (r.w * r.door) / 100)} width 800 swing into r${i}`);
        if (r.window) lines.push(`  window id=g${i} on shell at ${x + r.w / 2} width 900`);
        if (r.furnished) lines.push(`  furniture plant at (${x + 300},300) size 300x300 in r${i}`);
        x += r.w;
      });
      return `${lines.join("\n")}\n}\n`;
    });

  it("holds every law, and reaches rooms it furnishes and rooms it refuses", () => {
    let furnished = 0;
    let refused = 0;
    fc.assert(
      fc.property(row, (src) => {
        if (compile(src, { noCache: true }).diagnostics.some((d) => d.severity === "error")) return;
        for (const only of ["furnish", undefined] as const) {
          const r = finish(src, only ? { only } : {});
          const again = finish(r.source, only ? { only } : {});
          expect(again.source, `not a fixpoint:\n${src}`).toBe(r.source);
          expect(again.changed).toBe(false);
          expect(gainedBy(src, r.source, undefined), `worse:\n${src}\n→\n${r.source}`).toEqual([]);
          if (only) {
            expect(isOneInsertion(src, r.source)).toBe(true);
            for (const c of r.changes) expect(c.text).not.toContain(" at (");
            const touched = new Set(r.changes.map((c) => c.room));
            for (const l of furnitureLines(src)) expect(touched.has(/in (\w+)$/.exec(l)![1]!)).toBe(false);
            furnished += touched.size;
            refused += r.unresolved.length;
          }
        }
      }),
      { numRuns: 60, seed: 20261009 },
    );
    expect(furnished, "the property never furnished a room").toBeGreaterThan(20);
    expect(refused, "the property never met a room it had to leave empty").toBeGreaterThan(0);
    expect(FURNISHED_USES.length).toBeGreaterThan(4);
  }, 300000);
});

suite("furnish — the table is built from words the catalogue has, and the docs print it", () => {
  const rows = Object.entries(FURNISH_TABLE) as Array<[UseKind, (typeof FURNISH_TABLE)[UseKind] & object]>;

  it("every word is catalogued, and a `wall` piece has a catalogued footprint", () => {
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const [use, items] of rows) {
      expect(USE_KINDS).toContain(use);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]!.required).toBe(true);
      for (const item of items)
        for (const word of [item.category, ...(item.or ?? [])]) {
          expect(CATALOG_CATEGORIES, `${use}: ${word}`).toContain(word);
          if (item.place === "wall") expect(defaultFootprint(word)).not.toBeNull();
          else expect(item.sizes?.length).toBeGreaterThan(0);
        }
    }
  });

  it("the wet-room and kitchen rows hold only what the catalogue lists for that zone", () => {
    const wet = zoneFixtureCategories("wet");
    const kitchen = zoneFixtureCategories("kitchen");
    for (const use of ["bath", "wc"] as const)
      for (const item of FURNISH_TABLE[use]!)
        for (const w of [item.category, ...(item.or ?? [])]) expect(wet).toContain(w);
    for (const item of FURNISH_TABLE.kitchen!) expect(kitchen).toContain(item.category);
    expect(FURNISH_TABLE.bath!.map((i) => i.category)).toEqual(["wc", "basin", "bathtub"]);
    expect(FURNISH_TABLE.kitchen!.map((i) => i.category)).toEqual(["kitchen_sink", "stove", "fridge"]);
  });

  it("docs/furniture.md prints the table as the source has it", () => {
    const cell = (item: (typeof rows)[number][1][number]): string => {
      const words = [item.category, ...(item.or ?? [])].map((w) => `\`${w}\``).join(" or ");
      const size = item.sizes ? ` ${item.sizes.map(([a, d]) => `${a} × ${d}`).join(", then ")}` : "";
      return `${words}${size}${item.required ? "" : " (optional)"}`;
    };
    const expected = rows.map(([use, items]) => `| \`${use}\` | ${items.map(cell).join(" · ")} |`);
    const doc = readFileSync("docs/furniture.md", "utf8").split(/\r?\n/);
    const head = doc.indexOf("| Room use | Pieces, in the order they are placed |");
    expect(head).toBeGreaterThan(0);
    expect(doc.slice(head + 2, head + 2 + expected.length)).toEqual(expected);
    expect(doc[head + 2 + expected.length]).toBe("");
  });
});

suite("furnish law — never worse under EVERY lint profile", () => {
  const profileCodes = (src: string, profile: string): Map<string, number> => {
    const out = new Map<string, number>();
    for (const d of lint(src, { world, profile })) out.set(d.code ?? "", (out.get(d.code ?? "") ?? 0) + 1);
    return out;
  };
  const CORPUS: Array<[string, string]> = [
    ...NAMES.map((n): [string, string] => [n, srcOf(n)]),
    ["test/fixtures/diff-a", readFileSync("test/fixtures/diff-a.arch", "utf8")],
  ];

  it("there is a profile stricter than the default on door clearances", () => {
    expect(LINT_PROFILE_NAMES.length).toBeGreaterThan(1);
    expect(LINT_PROFILE_NAMES.some((p) => (LINT_PROFILES[p]!.swingClearanceMm ?? 0) > 0)).toBe(true);
  });

  for (const [name, src] of CORPUS)
    it(`${name}: no profile gains a lint code`, () => {
      const r = finish(src, { world, only: "furnish" });
      for (const profile of LINT_PROFILE_NAMES) {
        const was = profileCodes(src, profile);
        const gained = [...profileCodes(r.source, profile)].filter(([c, n]) => n > (was.get(c) ?? 0)).map(([c]) => c);
        expect(gained, `${profile}:\n${r.changes.map((c) => c.text).join("\n")}`).toEqual([]);
      }
    }, 120000);
});

suite("furnish law — a relational room has no fixed `at` to anchor in", () => {
  const REL = `plan "Rel" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=p partition thickness 100 { (5000,0) (5000,4000) }
  room id=hall at (0,0) size 5000x4000 label "Hall" uses hall
  room id=side right-of hall align top gap 0 size 3000x4000 label "Bedroom" uses bedroom
  door id=d on w at 2000 width 1000 swing in
  opening id=o on p at 2000 width 1000
}
`;

  it("a room that needs an anchored piece is reported before any compile check", () => {
    expect(errorsOf(REL)).toEqual([]);
    let calls = 0;
    const r = furnishStage(REL, {}, (s) => {
      calls++;
      return { errors: false, codes: codes(s, undefined) };
    });
    expect(r.source).toBe(REL);
    expect(r.checks).toBe(0);
    expect(calls).toBe(1); // the measure of the source itself
    expect(r.unresolved).toEqual([expect.objectContaining({ stage: "furnish", room: "side" })]);
    expect(r.unresolved[0]!.reason).toContain("a relational room has no fixed `at` to anchor in");
    expect(r.unresolved[0]!.codes).toBeUndefined();
  });

  it("a relational room whose pieces all go `against wall` is furnished", () => {
    const src = REL.replace(`label "Bedroom" uses bedroom`, `label "Bathroom" uses wc`);
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved).toEqual([]);
    expect(r.changes.map((c) => c.text.split(" ")[1])).toEqual(["wc", "basin"]);
    for (const c of r.changes) expect(c.text).toContain(" against wall ");
    expect(gainedBy(src, r.source, undefined)).toEqual([]);
  });

  it("the shipped relational golden: `bed` is named with the true reason", () => {
    const src = readFileSync("eval/goldens/relational-studio.arch", "utf8");
    const r = finish(src, { only: "furnish" });
    const note = r.unresolved.find((u) => u.room === "bed")!;
    expect(note.reason).toContain("relational");
    expect(note.reason).not.toContain("E_PLACE_REF");
  });
});

suite("furnish law — a use's wall run is placed first and stays together", () => {
  const OPEN = `plan "Open plan" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (9000,0) (9000,6000) (0,6000) close }
  room id=r at (0,0) size 9000x6000 label "Great room" uses living dining kitchen
  door id=d1 on w at 900 width 1000 swing in
  window id=g1 on w at 19500 width 3000
}
`;
  const run = (texts: string[]): Array<{ word: string; wall: string; offset: number }> =>
    texts
      .filter((t) => t.includes(" against wall "))
      .map((t) => {
        const m = /^furniture (\w+) against wall (\w+(?: segment \d+)?) offset (\d+) /.exec(t)!;
        return { word: m[1]!, wall: m[2]!, offset: Number(m[3]) };
      });

  it("sink, stove and fridge sit on one wall, each touching the next", () => {
    const r = finish(OPEN, { only: "furnish" });
    const texts = r.changes.map((c) => c.text);
    const k = run(texts);
    expect(k.map((p) => p.word)).toEqual(["kitchen_sink", "stove", "fridge"]);
    expect(new Set(k.map((p) => p.wall)).size).toBe(1);
    const sorted = [...k].sort((a, b) => a.offset - b.offset);
    const half = (w: string): number => defaultFootprint(w)!.along / 2;
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i]!.offset - sorted[i - 1]!.offset).toBe(half(sorted[i]!.word) + half(sorted[i - 1]!.word));
    // The run is written before the free-standing pieces.
    expect(texts.findIndex((t) => t.includes(" against wall "))).toBe(0);
    expect(texts.some((t) => t.startsWith("furniture sofa "))).toBe(true);
    expect(gainedBy(OPEN, r.source, undefined)).toEqual([]);
  });

  it("a use whose run cannot be placed whole is left out and named; the other uses stay", () => {
    // Every check that adds a stove is refused: the kitchen goes, the sofa stays.
    const r = furnishStage(OPEN, {}, (s) => {
      const m = codes(s, undefined);
      if (s.includes("furniture stove ")) m.set("W_TEST_BLOCK", 1);
      return { errors: false, codes: m };
    });
    const words = r.changes.map((c) => c.text.split(" ")[1]);
    expect(words).toContain("sofa");
    for (const w of ["kitchen_sink", "stove", "fridge"]) expect(words).not.toContain(w);
    const note = r.unresolved.find((u) => u.room === "r")!;
    expect(note.reason).toContain("kitchen");
    expect(note.codes).toEqual(["W_TEST_BLOCK"]);
  });
});

suite("furnish — smaller placement rules", () => {
  it("a bed is not put in a corner whose other wall has a window over it, when another position is free", () => {
    const src = FLAT.replace(
      "window id=win_bed on w_ext at 2100 width 1600",
      "window id=win_bed on w_ext at 3200 width 1200",
    );
    expect(errorsOf(src)).toEqual([]);
    const bed = finish(src, { only: "furnish" }).changes.find((c) => c.text.startsWith("furniture bed "))!;
    expect(bed.text).not.toMatch(/anchor (top|top-right) /);
  });

  it("a utility room is left alone: `uses utility` does not say laundry", () => {
    expect(FURNISH_TABLE.utility).toBeUndefined();
    for (const [name, id] of [
      ["aquarium", "plant"],
      ["library", "r_plant"],
    ] as const) {
      const r = finish(srcOf(name), { world, only: "furnish" });
      expect(r.changes.filter((c) => c.room === id)).toEqual([]);
      expect(r.changes.map((c) => c.text.split(" ")[1])).not.toContain("washer");
    }
  }, 120000);

  it("a room far larger than a dwelling room is reported, not given a sofa", () => {
    const r = finish(srcOf("aquarium"), { world, only: "furnish" });
    expect(r.changes.filter((c) => c.room === "reef" || c.room === "kelp" || c.room === "shop")).toEqual([]);
    expect(r.unresolved.find((u) => u.room === "reef")!.reason).toContain("dwelling");
  }, 120000);

  it("a room with no wall behind any edge says so", () => {
    const src = `plan "Bare" {\n  units mm\n  room id=r at (0,0) size 4000x4000 label "Bedroom" uses bedroom\n}\n`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.unresolved[0]!.reason).toContain("no wall");
    expect(r.unresolved[0]!.reason).not.toContain("clears its walls");
  });
});
