/** furnish laws — never worse, pure insertion, scope, named (issue #370), several uses, the default run furnishes first. Split out of `finish-furnish.test.ts` (FT3c). */

import { describe as suite, expect, it } from "vitest";
import { resolvePlan, roomUses } from "../src/analyze.js";
import { USE_KINDS } from "../src/ast.js";
import { type FurnishCodes, furnishStage, MAX_PIECES_PER_ROOM } from "../src/furnish.js";
import { compile, describe as describePlan, FINISH_STAGE_ORDER, finish, format, FURNISH_TABLE } from "../src/index.js";
import { rectsOverlap } from "../src/geometry/rect.js";
import type { RFurniture, RRoom } from "../src/ir.js";
import { sourceConflicts } from "../src/repair.js";
import {
  world,
  NAMES,
  srcOf,
  codes,
  gainedBy,
  errorsOf,
  isOneInsertion,
  FLAT,
} from "./helpers/finish-furnish-shared.js";

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
    const r = furnishStage(FLAT, {}, (s): FurnishCodes => {
      const m = codes(s, undefined);
      if (s.includes("furniture bed ")) m.set("W_TEST_BLOCK", 1);
      return { errors: false, codes: m };
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
    it(`${name}: the result is the source with one run of statements inserted, one per storey`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "furnish" });
      // Less every other storey's statements, what is left is one insertion into the source.
      for (const level of new Set(r.changes.map((c) => c.level))) {
        const others = r.changes.filter((c) => c.level !== level).map((c) => c.text);
        const less = r.source.split("\n").filter((l) => !others.includes(l.trim()));
        expect(isOneInsertion(src, less.join("\n"))).toBe(true);
      }
      expect(isOneInsertion(src, r.source)).toBe(new Set(r.changes.map((c) => c.level)).size <= 1);
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

suite("furnish law — scope: rectangular rooms", () => {
  it("a slanted polygon room is reported and left empty; its bounding box is never used", () => {
    const src = `plan "T" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (3000,5000) close }
  room id=r polygon (0,0) (6000,0) (3000,5000) label "Bedroom" uses bedroom
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

  it("a plan with `level` blocks is furnished room by room, in each storey's own block", () => {
    // The law lives in `test/finish-levels.test.ts`; this was "reported and left as it is".
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
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r", "r1"]);
    expect(r.unresolved).toEqual([]);
    const lower = r.source.indexOf("level 1 {");
    expect(r.source.indexOf(" in r anchor")).toBeLessThan(lower);
    expect(r.source.indexOf(" in r1 anchor")).toBeGreaterThan(lower);
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

suite("furnish law — named: a room left empty is in `unresolved`, whatever left it empty (issue #370)", () => {
  const OUTSIDE = USE_KINDS.filter((u) => (FURNISH_TABLE[u]?.length ?? 0) === 0);
  const notesOn = (r: {
    unresolved: readonly { room?: string; reason: string; scope?: string }[];
  }): Array<[string, string]> =>
    r.unresolved.filter((u) => u.scope === "outside-table").map((u) => [u.room!, u.reason]);
  const noRow = (id: string, use: string): string =>
    `"${id}" is outside the furnish table and was left empty — its use \`${use}\` has no row there; add furniture yourself only if it should hold some`;

  it("the issue's plan: `changed:false`, and both rooms are named with the use that has no row", () => {
    const src = `plan "f" {
  units mm
  room id=h at (0,0) size 3000x2000 label "Hall" uses hall
  room id=u at (3000,0) size 2000x2000 label "Utility" uses utility
  walls from rooms exterior 300 partition 100
  door on h.top at center width 1000 swing into h
  door between h and u at center width 800 swing into u
  window on u.top width 800
}
`;
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
    expect(notesOn(r)).toEqual([
      ["h", noRow("h", "hall")],
      ["u", noRow("u", "utility")],
    ]);
  });

  for (const use of OUTSIDE)
    it(`\`uses ${use}\` gets no piece, and is named`, () => {
      const src = FLAT.replace(`label "Hall" uses hall`, `label "Spare" uses ${use}`);
      const r = finish(src, { only: "furnish" });
      expect(r.changes.some((c) => c.room === "r_hall")).toBe(false);
      expect(notesOn(r)).toEqual([["r_hall", noRow("r_hall", use)]]);
    });

  it("the no-row uses are the six the docs list", () => {
    expect([...OUTSIDE].sort()).toEqual(["circulation", "entry", "garage", "hall", "storage", "utility"]);
  });

  it("several uses with no row are all named, in the room's own order", () => {
    const src = FLAT.replace(`label "Hall" uses hall`, `label "Lobby" uses entry circulation`);
    expect(notesOn(finish(src, { only: "furnish" }))).toEqual([
      [
        "r_hall",
        '"r_hall" is outside the furnish table and was left empty — its uses `entry`, `circulation` have no row there; add furniture yourself only if it should hold some',
      ],
    ]);
  });

  it("a room of no known use is named with the uses that would furnish it, read from the table", () => {
    // A label in any language the vocabulary does not hold reads as no use: such a plan used to
    // come back `changed:false`, `unresolved:[]`, with every room empty.
    const src = FLAT.replace(`label "Bedroom" uses bedroom`, `label "Schlafzimmer"`);
    const r = finish(src, { only: "furnish" });
    expect(r.changes.some((c) => c.room === "r_bed")).toBe(false);
    const words = Object.keys(FURNISH_TABLE)
      .map((u) => `\`${u}\``)
      .join(", ");
    expect(notesOn(r)[0]).toEqual([
      "r_bed",
      `"r_bed" is outside the furnish table and was left empty — neither \`uses\` nor its label or id names a use; give it \`uses\` with one of ${words} if finish should furnish it`,
    ]);
    // And `uses` then does what the note says.
    const fixed = finish(src.replace(`label "Schlafzimmer"`, `label "Schlafzimmer" uses bedroom`), {
      only: "furnish",
    });
    expect(fixed.changes.some((c) => c.room === "r_bed")).toBe(true);
  });

  it("a room with no `id=` is named by its label", () => {
    const src = FLAT.replace("room id=r_hall at", "room at");
    expect(errorsOf(src)).toEqual([]);
    const [note] = notesOn(finish(src, { only: "furnish" }));
    expect(note![1]).toBe(
      'the room "Hall" is outside the furnish table and was left empty — its use `hall` has no row there; add furniture yourself only if it should hold some',
    );
  });

  it("a room that holds a piece is not left empty, so it is not named", () => {
    for (const piece of [
      "furniture rug at (500,4000) size 800x600 in r_hall",
      "furniture rug at (500,4000) size 800x600",
    ])
      expect(
        notesOn(finish(FLAT.replace("  door id=d_bed", `  ${piece}\n  door id=d_bed`), { only: "furnish" })),
      ).toEqual([]);
  });

  it("a hall whose piece is declared `in` it but stands elsewhere gets the defect's note, not the scope note", () => {
    const src = FLAT.replace("  door id=d_bed", "  furniture rug at (500,500) size 800x600 in r_hall\n  door id=d_bed");
    expect(codes(src, undefined).has("W_FIXTURE_WRONG_ROOM")).toBe(true);
    const r = finish(src, { only: "furnish" });
    expect(notesOn(r)).toEqual([]);
    const note = r.unresolved.find((u) => u.room === "r_hall")!;
    expect(note.scope).toBeUndefined();
    expect(note.reason).toBe(
      '"r_hall" holds no piece on its floor — `rug` is declared `in r_hall` but stands outside it (`W_FIXTURE_WRONG_ROOM`); finish fills only empty rooms',
    );
    // Same reading, same words but the room's name, as a room with a row in the table.
    const row = FLAT.replace("  door id=d_bed", "  furniture rug at (500,500) size 800x600 in r_bath\n  door id=d_bed");
    expect(finish(row, { only: "furnish" }).unresolved.find((u) => u.room === "r_bath")!.reason).toBe(
      note.reason.replaceAll("r_hall", "r_bath"),
    );
  });

  it("only a room's own scope note carries `scope`: a refusal, a sheet note and a compile error never do", () => {
    const polygon = `plan "T" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (3000,5000) close }
  room id=r polygon (0,0) (6000,0) (3000,5000) label "Bedroom" uses bedroom
  door id=d on w at 10% width 900 swing in
}
`;
    const broken = `plan "X" {\n  units mm\n  room at (0,0) size\n}\n`;
    const unnamed = FLAT.replace(`plan "Flat"`, `plan ""`);
    for (const r of [
      finish(polygon, { only: "furnish" }),
      finish(broken, { only: "furnish" }),
      finish(unnamed, { only: "sheet" }),
    ]) {
      expect(r.unresolved.length).toBeGreaterThan(0);
      for (const u of r.unresolved) expect(u).not.toHaveProperty("scope");
    }
  });

  it("a room with one use in the table is the stage's to furnish, not named", () => {
    const src = FLAT.replace(`label "Hall" uses hall`, `label "Hall" uses hall office`);
    const r = finish(src, { only: "furnish" });
    expect(r.changes.some((c) => c.room === "r_hall")).toBe(true);
    expect(notesOn(r)).toEqual([]);
  });

  it("a storey's room is named with its level, after the rooms the stage could have furnished", () => {
    const src = `plan "Two" {
  units mm
  level 0 {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=h at (0,0) size 4000x4000 label "Hall" uses hall
    door id=d on w at 10% width 900 swing in
  }
  level 1 {
    wall id=w1 exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Bedroom" uses bedroom
  }
}
`;
    const r = finish(src, { only: "furnish" });
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.changes.every((c) => c.room === "r" && c.level === 1)).toBe(true);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0]).toMatchObject({ room: "h", level: 0, scope: "outside-table" });
    expect(r.unresolved[0]!.reason).toBe(
      '"h" (level 0) is outside the furnish table and was left empty — its use `hall` has no row there; add furniture yourself only if it should hold some',
    );
  });

  it("the note belongs to the furnish stage: once in a full run, never in `--only sheet`", () => {
    expect(notesOn(finish(FLAT))).toHaveLength(1);
    expect(notesOn(finish(FLAT, { only: "sheet" }))).toEqual([]);
  });

  /** Every storey of a resolved plan, as `[rooms, furniture]`. */
  const storeysOf = (src: string): Array<[RRoom[], RFurniture[]]> => {
    const r = resolvePlan(src, { world });
    return (r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir!]).map((ir) => [
      ir.elements.filter((e): e is RRoom => e.kind === "room"),
      ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
    ]);
  };

  for (const name of NAMES)
    it(`${name}: every room the run leaves empty is named, and every room outside the table is one of them`, () => {
      const r = finish(srcOf(name), { world, only: "furnish" });
      const named = new Set(r.unresolved.map((u) => u.room));
      for (const [rooms, furniture] of storeysOf(r.source))
        for (const room of rooms) {
          // Measured apart from the stage: no piece declared `in` the room, and none whose
          // footprint touches its bounding box (a coarser test than the stage's own, on purpose).
          const box = { x: room.at.x, y: room.at.y, w: room.size.w, h: room.size.h };
          const bare = !furniture.some(
            (f) => f.room === room.id || rectsOverlap({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h }, box),
          );
          if (bare) expect(named.has(room.id), `"${room.id}" is empty and unnamed`).toBe(true);
        }
      const everyRoom = storeysOf(r.source).flatMap(([rooms]) => rooms);
      for (const [id] of notesOn(r)) {
        const rooms = everyRoom.filter((e) => e.id === id);
        expect(rooms.length, id).toBeGreaterThan(0);
        for (const room of rooms)
          expect([...roomUses(room)].filter((u) => (FURNISH_TABLE[u]?.length ?? 0) > 0)).toEqual([]);
      }
    }, 120000);
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
