/**
 * Card AF7: a conflict names the statements behind it. A broken hard keep (`W_KEEP_VIOLATED`), a
 * relational placement cycle (`E_LAYOUT_CYCLE`), a room left unplaced by what it depends on
 * (`E_LAYOUT_UNPLACED`) and two overlapping rooms (`W_ROOM_OVERLAP`) carry, as related spans, the
 * statement that placed each other element involved. Additive: the diagnostic's own code, message,
 * span and hints are unchanged, and a note is offered only from the compiled source (AF1's
 * same-file rule).
 */
import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, makeVirtualWorld } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";

const diags = (src: string, world?: ReturnType<typeof makeVirtualWorld>): Diagnostic[] =>
  compile(src, { noCache: true, ...(world ? { world } : {}) }).diagnostics;
const notes = (src: string, d: Diagnostic): Array<[string, string]> =>
  (d.relatedSpans ?? []).map((r) => [r.message, src.slice(r.span.start, r.span.end)]);

const KEEP = `plan "K" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  window id=w1 on shell at 2000 width 1500
  window id=w2 on shell at 6000 width 1200
  keep equal width w1 w2
  keep equal width w1 w2 soft
}
`;

describe("W_KEEP_VIOLATED names where each element it compares was placed", () => {
  it("one note per target, at the target's statement, worded with the target as written", () => {
    const ds = diags(KEEP).filter((d) => d.code === "W_KEEP_VIOLATED");
    expect(ds).toHaveLength(1);
    expect(notes(KEEP, ds[0]!)).toEqual([
      ["`w1` placed here", "window id=w1 on shell at 2000 width 1500"],
      ["`w2` placed here", "window id=w2 on shell at 6000 width 1200"],
    ]);
  });

  it("projects to JSON as `related`, after the existing keys", () => {
    const d = diags(KEEP).find((x) => x.code === "W_KEEP_VIOLATED")!;
    const j = diagnosticToJson(KEEP, d);
    expect(Object.keys(j).slice(-1)).toEqual(["related"]);
    expect(j.related!.map((r) => [r.message, r.line])).toEqual([
      ["`w1` placed here", 4],
      ["`w2` placed here", 5],
    ]);
  });

  it("a keep that holds raises nothing, and a room target names its room statement once", () => {
    const src = `plan "R" {
  room id=a at (0,0) size 4000x3000 label "A"
  room id=b at (4000,0) size 4000x3100 label "B"
  keep align a.top b.top
  keep align a.top a.bottom b.bottom
}
`;
    const ds = diags(src).filter((d) => d.code === "W_KEEP_VIOLATED");
    expect(ds).toHaveLength(1);
    expect(notes(src, ds[0]!)).toEqual([
      ["`a` placed here", 'room id=a at (0,0) size 4000x3000 label "A"'],
      ["`b` placed here", 'room id=b at (4000,0) size 4000x3100 label "B"'],
    ]);
  });

  it("two instances of one component: one note per instance, at its `place`, not one at the body", () => {
    const src = `plan "I" {
  component wing() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=main at (0,0) size 4000x3000 label "Wing"
    room id=annex at (0,3000) size 2000x1000 label "Annex"
  }
  place wing() as west at (0,0)
  place wing() as east at (12000,0) mirror x
  keep offset east.shell segment 1 from west.shell segment 1 8000
  keep align east.main.top east.annex.top west.main.bottom
}
`;
    const ds = diags(src).filter((d) => d.code === "W_KEEP_VIOLATED");
    expect(ds).toHaveLength(2);
    expect(notes(src, ds[0]!)).toEqual([
      ["`east` placed here", "place wing() as east at (12000,0) mirror x"],
      ["`west` placed here", "place wing() as west at (0,0)"],
    ]);
    // Two elements of one instance are one note.
    expect(notes(src, ds[1]!)).toEqual([
      ["`east` placed here", "place wing() as east at (12000,0) mirror x"],
      ["`west` placed here", "place wing() as west at (0,0)"],
    ]);
  });

  it("nested instances that share one `place` in the body are still one note each", () => {
    const src = `plan "N" {
  component cell() {
    room id=r at (0,0) size 3000x3000 label "R"
  }
  component wing() {
    place cell() as inner at (0,0)
  }
  place wing() as west at (0,0)
  place wing() as east at (8000,0)
  keep equal width west.inner.r east.inner.r
  keep align west.inner.r.top east.inner.r.bottom
}
`;
    const d = diags(src).find((x) => x.code === "W_KEEP_VIOLATED");
    expect(d, "the second keep is broken").toBeDefined();
    expect(notes(src, d!)).toEqual([
      ["`west.inner` placed here", "place cell() as inner at (0,0)"],
      ["`east.inner` placed here", "place cell() as inner at (0,0)"],
    ]);
  });

  it("an imported component placed in the compiled source is noted at its `place`; a `place` inside a module is not", () => {
    const lib = `plan "lib" {
  component box() {
    room id=r at (0,0) size 3000x3000 label "R"
  }
  component pair() {
    place box() as inner at (0,0)
  }
}`;
    const main = `plan "main" {
  import "lib.arch": box, pair
  place box() as b1 at (0,0)
  place pair() as p1 at (9000,0)
  room id=s at (3000,0) size 3000x3500 label "S"
  keep align b1.r.bottom s.bottom
  keep align p1.inner.r.bottom s.bottom
}
`;
    const ds = diags(main, makeVirtualWorld({ "lib.arch": lib })).filter((x) => x.code === "W_KEEP_VIOLATED");
    expect(ds, "both keeps are broken").toHaveLength(2);
    expect(notes(main, ds[0]!)).toEqual([
      ["`b1` placed here", "place box() as b1 at (0,0)"],
      ["`s` placed here", 'room id=s at (3000,0) size 3000x3500 label "S"'],
    ]);
    // `p1.inner` was placed by a statement in lib.arch: its bytes are not the compiled source's.
    expect(notes(main, ds[1]!)).toEqual([["`s` placed here", 'room id=s at (3000,0) size 3000x3500 label "S"']]);
  });
});

describe("relational placement errors name the statement they wait on", () => {
  const src = `plan "L" {
  room id=p right-of q size 2000x2000 label "P"
  room id=q right-of p size 2000x2000 label "Q"
  room id=ghost right-of nobody size 3000x3000 label "Ghost"
  room id=lean below ghost size 3000x2000 label "Lean"
  room id=self right-of self size 1000x1000 label "Self"
}
`;
  const ds = diags(src);
  const of = (code: string, room: string): Diagnostic =>
    ds.find((d) => d.code === code && d.message.includes(`"${room}"`))!;

  it("each cycle member points at the next member's clause: k notes for k rooms", () => {
    expect(notes(src, of("E_LAYOUT_CYCLE", "p"))).toEqual([
      ["`q` placed right-of `p` here", 'room id=q right-of p size 2000x2000 label "Q"'],
    ]);
    expect(notes(src, of("E_LAYOUT_CYCLE", "q"))).toEqual([
      ["`p` placed right-of `q` here", 'room id=p right-of q size 2000x2000 label "P"'],
    ]);
  });

  it("an unplaced room points at the room it depends on", () => {
    expect(notes(src, of("E_LAYOUT_UNPLACED", "lean"))).toEqual([
      ["`ghost` placed right-of `nobody` here", 'room id=ghost right-of nobody size 3000x3000 label "Ghost"'],
    ]);
  });

  it("a room placed against itself repeats nothing, and E_LAYOUT_REF has no second statement", () => {
    expect(of("E_LAYOUT_CYCLE", "self").relatedSpans).toBeUndefined();
    expect(of("E_LAYOUT_REF", "ghost").relatedSpans).toBeUndefined();
  });

  it("a cycle and an unplaced room inside an imported body get no AF7 note; in the compiled source they do", () => {
    const body = `  component knot() {
    room id=p right-of q size 2000x2000 label "P"
    room id=q right-of p size 2000x2000 label "Q"
    room id=lean below p size 3000x2000 label "Lean"
  }`;
    const main = `plan "main" {\n  import "lib.arch": knot\n  place knot() as k1 at (0,0)\n}\n`;
    const imported = diags(main, makeVirtualWorld({ "lib.arch": `plan "lib" {\n${body}\n}` }));
    const local = `plan "local" {\n${body}\n  place knot() as k1 at (0,0)\n}\n`;
    const own = diags(local);
    for (const code of ["E_LAYOUT_CYCLE", "E_LAYOUT_UNPLACED"]) {
      const d = imported.filter((x) => x.code === code);
      expect(d.length, code).toBeGreaterThan(0);
      for (const x of d) {
        // Measured in the module: the diagnostic says so, and the only note is AF1's, at the `place`.
        expect(x.file, code).toBe("lib.arch");
        expect(notes(main, x), code).toEqual([['in instance "k1" placed here', "place knot() as k1 at (0,0)"]]);
      }
      const l = own.filter((x) => x.code === code);
      expect(l.length, code).toBe(d.length);
      // The body's own ids, as written there; AF7's note first, then AF1's at the `place`.
      for (const x of l) {
        const [af7, af1] = notes(local, x);
        expect(af7![0], code).toMatch(/^`\w+` placed (right-of|below) `\w+` here$/);
        expect(af7![1], code).toMatch(/^room id=\w+ (right-of|below) \w+ size /);
        expect(af1, code).toEqual(['in instance "k1" placed here', "place knot() as k1 at (0,0)"]);
      }
    }
  });
});

describe("W_ROOM_OVERLAP names the other room's statement", () => {
  it("the warning sits on the later room, the note on the earlier", () => {
    const src = `plan "O" {
  room id=a at (0,0) size 3000x3000 label "A"
  room id=b at (2000,0) size 3000x3000 label "B"
}
`;
    const d = diags(src).find((x) => x.code === "W_ROOM_OVERLAP")!;
    expect(src.slice(d.span!.start, d.span!.end)).toContain("room id=b");
    expect(notes(src, d)).toEqual([["the other room placed here", 'room id=a at (0,0) size 3000x3000 label "A"']]);
  });

  it("an overlap inside an imported body gets no note; the same body in the compiled source does", () => {
    const body = `  component box() {
    room id=a at (0,0) size 3000x3000 label "A"
    room id=b at (2000,0) size 3000x3000 label "B"
  }`;
    const main = `plan "main" {\n  import "lib.arch": box\n  place box() as b1 at (0,0)\n}\n`;
    const d = diags(main, makeVirtualWorld({ "lib.arch": `plan "lib" {\n${body}\n}` })).find(
      (x) => x.code === "W_ROOM_OVERLAP",
    );
    expect(d, "the imported rooms overlap").toBeDefined();
    expect(d!.relatedSpans).toBeUndefined();
    const local = `plan "local" {\n${body}\n  place box() as b1 at (0,0)\n}\n`;
    const l = diags(local).find((x) => x.code === "W_ROOM_OVERLAP")!;
    expect(notes(local, l)).toEqual([["the other room placed here", 'room id=a at (0,0) size 3000x3000 label "A"']]);
  });

  it("a component placed twice over itself has one statement for both rooms: no note", () => {
    const src = `plan "T" {
  component box() {
    room id=r at (0,0) size 3000x3000 label "R"
  }
  place box() as b1 at (0,0)
  place box() as b2 at (1000,0)
}
`;
    const d = diags(src).find((x) => x.code === "W_ROOM_OVERLAP");
    expect(d, "the instances overlap").toBeDefined();
    expect(d!.relatedSpans).toBeUndefined();
  });
});
