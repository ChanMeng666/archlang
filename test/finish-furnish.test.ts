/** furnish — the corpus is not empty; placement is relative; fill only (a room that holds furniture, a partly furnished room). Split from the former single file (FT3c). */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { CATALOG_CATEGORIES, fixtureSpec } from "../src/fixtures-catalog.js";
import { finish } from "../src/index.js";
import { canonicalFixture } from "../src/elements/fixtures-glyphs.js";
import { finishDigest, PARTLY } from "./helpers/finish-digest.js";
import {
  world,
  NAMES,
  srcOf,
  codes,
  gainedBy,
  errorsOf,
  furnitureLines,
  refused,
  FLAT,
} from "./helpers/finish-furnish-shared.js";

/**
 * `finish()` — the furnish stage (`docs/adr/0025-furnish-as-explicit-transform.md`).
 *
 * Each law is named in a suite title. The laws that hold for the whole of `finish` — the
 * fixpoint, never-worse, `fmt` then `finish`, and the SHA-256 sweep over the examples — are
 * pinned in `test/finish*.test.ts`, which run both stages; this file adds what is the
 * furnish stage's own. The corpus is every shipped example, read from the directory, and a
 * generated row of rooms.
 */

suite("furnish — the corpus is not empty", () => {
  it("some shipped example has an empty room the stage furnishes", () => {
    const changed = NAMES.filter((n) => finish(srcOf(n), { world, only: "furnish" }).changed);
    expect(changed.length).toBeGreaterThan(0);
  }, 120000);

  it("furnishes the flat's bedroom and bathroom, and names the hall it leaves empty", () => {
    const r = finish(FLAT, { only: "furnish" });
    expect(r.unresolved).toEqual([
      {
        stage: "furnish",
        room: "r_hall",
        scope: "outside-table",
        reason:
          '"r_hall" is outside the furnish table and was left empty — its use `hall` has no row there; add furniture yourself only if it should hold some',
        span: { start: FLAT.indexOf("room id=r_hall"), end: FLAT.indexOf("\n  door id=d_bed") },
      },
    ]);
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
    const first = finish(FLAT, { only: "furnish" });
    const r = finish(first.source, { only: "furnish" });
    // The hall's note is the first run's, word for word: finishing again asks nothing new.
    expect(r.source).toBe(first.source);
    expect(r.changes).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.unresolved.map((u) => [u.room, u.reason])).toEqual(first.unresolved.map((u) => [u.room, u.reason]));
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

suite("furnish law — fill only: a partly furnished room is reported, never topped up", () => {
  /** The partly-furnished notes of a result, as `[room, what it lacks]`. */
  const partly = (r: { unresolved: readonly { room?: string; reason: string }[] }): Array<[string, string]> =>
    r.unresolved
      .filter((u) => u.reason.includes(PARTLY))
      .map((u) => [u.room!, /requires — (.*?) missing/.exec(u.reason)![1]!]);

  it("the agent-UX audit plan: the kitchen/living room's missing worktop and sofa are named; the bedrooms are furnished; the bathroom is silent", () => {
    const src = readFileSync("test/finish-fixtures/agent-ux-prefinish.arch", "utf8");
    expect(errorsOf(src)).toEqual([]);
    for (const r of [finish(src, { only: "furnish" }), finish(src)]) {
      expect([...new Set(r.changes.filter((c) => c.stage === "furnish").map((c) => c.room))]).toEqual([
        "r_bed1",
        "r_bed2",
      ]);
      expect(refused(r).filter((u) => u.stage === "furnish")).toEqual([
        {
          stage: "furnish",
          room: "r_live",
          reason:
            '"r_live" holds furniture but not every piece its use requires — kitchen: `counter`; living: `sofa` missing; finish fills only empty rooms',
          span: { start: src.indexOf("room id=r_live"), end: src.indexOf("\n\n  outdoor") },
        },
      ]);
      // Nothing is written into the partly furnished room, and the full bathroom has no note.
      expect(furnitureLines(r.source).filter((l) => l.includes("in r_live"))).toEqual(
        furnitureLines(src).filter((l) => l.includes("in r_live")),
      );
      expect(r.unresolved.some((u) => u.room === "r_bath")).toBe(false);
    }
  });

  it("a living room with only a lamp is named; a bedroom with its bed is not; an empty kitchen is furnished", () => {
    const src = `plan "Lamp" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall id=p1 partition thickness 100 { (4000,0) (4000,4000) }
  wall id=p2 partition thickness 100 { (6500,0) (6500,4000) }
  room id=r_live at (0,0) size 4000x4000 label "Living" uses living
  room id=r_bed at (4000,0) size 2500x4000 label "Bedroom" uses bedroom
  room id=r_kit at (6500,0) size 2500x4000 label "Kitchen" uses kitchen
  door id=d on w at 2000 width 900 swing in
  opening id=o1 on p1 at 3000 width 900
  opening id=o2 on p2 at 3000 width 900
  furniture lamp at (300,300) size 400x400 in r_live
  furniture bed in r_bed anchor top flush size 1500x2000
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect([...new Set(r.changes.map((c) => c.room))]).toEqual(["r_kit"]);
    expect(partly(r)).toEqual([["r_live", "living: `sofa`"]]);
    expect(r.unresolved.map((u) => u.room)).toEqual(["r_live"]);
  });

  it("every required piece of every use is named, use by use", () => {
    const src = FLAT.replace(`label "Bedroom" uses bedroom`, `label "Studio" uses bedroom living kitchen`).replace(
      "  door id=d_bed",
      "  furniture fridge against wall w_bb offset 2000 in r_bed\n  door id=d_bed",
    );
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(partly(r)).toEqual([
      ["r_bed", "kitchen: `kitchen_sink`, `stove`, `counter`; bedroom: `bed`; living: `sofa`"],
    ]);
    expect(r.changes.some((c) => c.room === "r_bed")).toBe(false);
  });

  /** FLAT with r_bed given `use` and holding `pieces` (each `furniture …` without the keyword). */
  const holding = (use: string, pieces: readonly string[]): string =>
    FLAT.replace(`uses bedroom`, `uses ${use}`).replace(
      "  door id=d_bed",
      `${pieces.map((p) => `  furniture ${p}\n`).join("")}  door id=d_bed`,
    );

  it("a piece of the same family, or one the catalogue says serves the job, counts: no note", () => {
    for (const [use, pieces] of [
      ["living", ["couch in r_bed anchor center size 2000x900"]], // the `sofa` family
      ["living", ["loveseat in r_bed anchor center size 1500x850"]], // serves `sofa`
      ["bedroom", ["double_bed in r_bed anchor center size 1600x2000"]], // serves `bed`
      ["bedroom", ["bunk_bed in r_bed anchor center size 1000x2000"]],
      ["dining", ["table in r_bed anchor center size 1400x900"]], // serves `dining_table`
      ["office", ["reception_desk in r_bed anchor center size 2400x900"]], // serves `desk`
      ["bath", ["wc against wall w_bb offset 600 in r_bed", "sink against wall w_bb offset 1600 in r_bed"]],
      ["wc", ["urinal against wall w_bb offset 600 in r_bed", "basin against wall w_bb offset 1600 in r_bed"]],
    ] as const) {
      const src = holding(use, pieces);
      expect(errorsOf(src), pieces.join(" + ")).toEqual([]);
      expect(partly(finish(src, { only: "furnish" })), pieces.join(" + ")).toEqual([]);
    }
  });

  it("a `kitchen_sink` is not a basin: the catalogue zones it for the kitchen only", () => {
    const src = holding("bath", [
      "wc against wall w_bb offset 600 in r_bed",
      "kitchen_sink against wall w_bb offset 1600 in r_bed",
    ]);
    expect(errorsOf(src)).toEqual([]);
    expect(partly(finish(src, { only: "furnish" }))).toEqual([["r_bed", "bath: `basin`"]]);
  });

  it("the catalogue's `serves`: a canonical word, the same across a family's words of one zone set, and zoned like what it serves", () => {
    const zones = (w: string): string => [...(fixtureSpec(w)?.zones ?? [])].sort().join(",");
    const serving = CATALOG_CATEGORIES.filter((w) => fixtureSpec(w)?.serves !== undefined);
    expect(serving.length).toBeGreaterThan(0);
    for (const w of serving) {
      const target = fixtureSpec(w)!.serves!;
      expect(canonicalFixture(target), `${w} serves ${target}`).toBe(target);
      expect(canonicalFixture(w), `${w} serves its own family`).not.toBe(target);
      for (const z of fixtureSpec(target)?.zones ?? [])
        expect(fixtureSpec(w)!.zones, `${w} serves ${target}`).toContain(z);
    }
    for (const a of CATALOG_CATEGORIES)
      for (const b of CATALOG_CATEGORIES)
        if (canonicalFixture(a) === canonicalFixture(b) && zones(a) === zones(b))
          expect(fixtureSpec(a)?.serves, `${a} / ${b}`).toBe(fixtureSpec(b)?.serves);
    expect(fixtureSpec("kitchen_sink")?.serves).toBeUndefined();
  });

  it("a piece declared `in` one room that overhangs the next by less than the wall band counts for its own room only", () => {
    // The bed is declared in r_bed and reaches 50 mm (one step of the plan's `grid 50`) past
    // the partition's centreline into r_bath.
    const src = FLAT.replace(
      "  door id=d_bed",
      "  furniture bed at (2700,300) size 1550x2000 in r_bed\n  door id=d_bed",
    );
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(partly(r)).toEqual([]);
    // r_bath is an empty room again: furnished, or reported as one the stage could not fill.
    expect(r.changes.some((c) => c.room === "r_bath") || r.unresolved.some((u) => u.room === "r_bath")).toBe(true);
    // The same piece with no `in` stands on both floors, so it counts for both.
    const loose = finish(src.replace(" size 1550x2000 in r_bed", " size 1550x2000"), { only: "furnish" });
    expect(partly(loose)).toEqual([["r_bath", "bath: `wc`, `basin`"]]);
  });

  it("a piece declared `in` one room but standing wholly in another counts for the room it stands in", () => {
    // A copy-paste slip: the wc says `in r_bed` but stands in the bathroom.
    const src = FLAT.replace("  door id=d_bed", "  furniture wc at (5000,200) size 400x700 in r_bed\n  door id=d_bed");
    expect(errorsOf(src)).toEqual([]);
    expect(codes(src, undefined).has("W_FIXTURE_WRONG_ROOM")).toBe(true);
    const r = finish(src, { only: "furnish" });
    // Nothing is written: not a second wc into r_bath, not a bed into r_bed.
    expect(r.changes).toEqual([]);
    expect(r.source).toBe(src);
    expect(codes(r.source, undefined)).toEqual(codes(src, undefined));
    // r_bath holds the wc and lacks its basin; r_bed holds nothing on its floor, and says why.
    expect(partly(r)).toEqual([["r_bath", "bath: `basin`"]]);
    expect(r.unresolved.map((u) => u.room)).toEqual(["r_bed", "r_bath", "r_hall"]);
    expect(r.unresolved[0]!.reason).toBe(
      '"r_bed" holds no piece on its floor — `wc` is declared `in r_bed` but stands outside it (`W_FIXTURE_WRONG_ROOM`); finish fills only empty rooms',
    );
  });

  it("the band's edge: a declared piece reaching 100 mm onto the next floor stays its own room's; 101 mm counts for both", () => {
    // No `grid`, so the overhang is the one written. r_bath's floor starts at x = 4200.
    const at = (w: number): string =>
      FLAT.replace("  grid 50\n", "").replace(
        "  door id=d_bed",
        `  furniture bed at (2700,300) size ${w}x2000 in r_bed\n  door id=d_bed`,
      );
    for (const w of [1600, 1601]) expect(errorsOf(at(w)), `${w}`).toEqual([]);
    // The edge is lint's: `W_FIXTURE_WRONG_ROOM` fires at 101 mm and not at 100.
    expect(codes(at(1600), undefined).has("W_FIXTURE_WRONG_ROOM")).toBe(false);
    expect(codes(at(1601), undefined).has("W_FIXTURE_WRONG_ROOM")).toBe(true);
    const edge = finish(at(1600), { only: "furnish" }); // 100 mm over
    expect(partly(edge)).toEqual([]);
    expect(edge.changes.some((c) => c.room === "r_bath") || edge.unresolved.some((u) => u.room === "r_bath")).toBe(
      true,
    );
    const past = finish(at(1601), { only: "furnish" }); // 101 mm over
    expect(partly(past)).toEqual([["r_bath", "bath: `wc`, `basin`"]]);
    expect(past.changes).toEqual([]);
  });

  it("a `urinal` serves the `wc` of a dwelling bathroom too: a judgement, pinned", () => {
    const src = holding("bath", [
      "urinal against wall w_bb offset 600 in r_bed",
      "basin against wall w_bb offset 1600 in r_bed",
    ]);
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(partly(r)).toEqual([]);
    expect(r.changes.some((c) => c.room === "r_bed")).toBe(false);
  });

  it("a room of a placed component is told to furnish the component, even when it is larger than 100 m²", () => {
    const src = `plan "Big unit" {
  units mm
  component unit() {
    wall id=w exterior thickness 200 { (0,0) (12000,0) (12000,10000) (0,10000) close }
    room id=r at (0,0) size 12000x10000 label "Loft" uses living
    furniture lamp at (300,300) size 400x400 in r
  }
  place unit() as u1 at (0,0)
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(partly(r)).toEqual([["u1.r", "living: `sofa`"]]);
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      '"u1.r" holds furniture but not every piece its use requires — living: `sofa` missing; it belongs to a placed component instance, which finish leaves to you: furnish the component, or write `furniture … in u1.r` in the plan body',
    ]);
  });

  it("a partly furnished room larger than 100 m² is reported too, with the dwelling-room reason", () => {
    const src = `plan "Loft" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (12000,0) (12000,10000) (0,10000) close }
  room id=r at (0,0) size 12000x10000 label "Loft" uses living kitchen
  door id=d on w at 5% width 900 swing in
  furniture fridge       against wall w segment 0 offset 3000 in r
  furniture stove        against wall w segment 0 offset 3600 in r
  furniture kitchen_sink against wall w segment 0 offset 4300 in r
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.unresolved).toEqual([expect.objectContaining({ stage: "furnish", room: "r" })]);
    expect(r.unresolved[0]!.reason).toBe(
      '"r" holds furniture but not every piece its use requires — kitchen: `counter`; living: `sofa` missing; it is larger than 100 m², which the furnish table does not cover; finish fills only empty dwelling rooms',
    );
  });

  it("a room of a placed component is told to furnish the component", () => {
    // terrace-row's front room no longer says `dining` (PS2.9), so it is complete; tagged
    // dining again it lacks a dining table in every one of its four placed units.
    const src = srcOf("terrace-row").replace("uses living kitchen", "uses living dining kitchen");
    expect(src).not.toBe(srcOf("terrace-row"));
    const r = finish(src, { world, only: "furnish" });
    const notes = r.unresolved.filter((u) => u.reason.includes(PARTLY));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.reason).toContain("it belongs to a placed component instance, which finish leaves to you");
      expect(n.reason).toContain(`or write \`furniture … in ${n.room}\` in the plan body`);
      expect(n.reason).not.toContain("finish fills only empty rooms");
    }
  }, 120000);

  it("the partly furnished notes follow every other note of the run", () => {
    // r_a (partly furnished) comes first in the source; r_b (empty, no wall to stand on) second.
    const src = `plan "Order" {
  units mm
  room id=r_a at (0,0) size 4000x4000 label "Living" uses living
  room id=r_b at (5000,0) size 4000x4000 label "Bedroom" uses bedroom
  furniture lamp at (300,300) size 400x400 in r_a
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved.map((u) => u.room)).toEqual(["r_b", "r_a"]);
    expect(partly(r)).toEqual([["r_a", "living: `sofa`"]]);
  });

  it("a piece counts for a room by its footprint on the room's shape, never the room's bounding box", () => {
    // The bed stands in the square room that fills the notch of the L, without `in`. The L's
    // bounding box covers it; the L's floor does not. So the L holds nothing (and is furnished,
    // on its own sides), and the square room holds its bed (no note).
    const src = `plan "Notch" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=p partition thickness 100 { (6000,3000) (3000,3000) (3000,6000) }
  room id=l polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Bedroom" uses bedroom
  room id=sq at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom
  door id=d on w at 10% width 900 swing in
  opening id=o on p at 1500 width 900
  furniture bed at (3500,3800) size 1500x2000
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(new Set(r.changes.map((c) => c.room))).toEqual(new Set(["l"]));
    expect(r.unresolved).toEqual([]);
    expect(partly(r)).toEqual([]);
  });

  // The examples whose `finish` output gained a partly-furnished note, each named with what it
  // lacks. Every other example has none. A move in this table is an output change: explain it.
  const CORPUS_PARTLY: Readonly<Record<string, Array<[string, string]>>> = {
    clinic: [
      ["r_recept", "office: `desk`"],
      ["r_treat", "office: `desk`"],
      ["r_staff", "office: `desk`"],
    ],
    // RM8.5, added with the example: its games room says `uses living` and holds a pool table, not
    // the sofa that use defines. (Its gym names no use, so nothing defines what it should hold.)
    "courtyard-family": [["games", "living: `sofa`"]],
    // 2026-10-18 (PS2.9): corner-cafe's servery no longer says `uses kitchen` (it has no sink
    // or hob; no use describes a bar servery), terrace-row's front room no longer says `dining`
    // (its header calls it living + kitchen), and practice-office's break room and
    // two-storey's kitchen gained the stove W_ROOM_MISSING_DEFINING asked for: none is named.
    "hexagon-pavilion": [
      ["g_ne", "living: `sofa`"],
      ["g_n", "office: `desk`"],
      ["g_se", "living: `sofa`"],
    ],
    "practice-office": [
      ["r_meet1", "office: `desk`"],
      ["r_meet2", "office: `desk`"],
    ],
    // 2026-10-18 (PS0.7): "Living" with no `uses` now classifies as living, so its missing sofa is named.
    themed: [["a", "living: `sofa`"]],
    "tiny-house": [["r_main", "living: `sofa`"]],
    "transit-hall": [
      ["r_shop1", "office: `desk`"],
      ["r_shop2", "office: `desk`"],
      ["r_shop3", "office: `desk`"],
      ["r_shop4", "office: `desk`"],
    ],
  };

  /**
   * {@link finishDigest} of every example — `source`, `changes[]` and every note except the
   * partly-furnished ones and the ones on a room outside the furnish table (issue #370: no row
   * moved when those notes joined, because the digest reads neither), for a `--only furnish` run
   * and a full run — measured on the stage
   * BEFORE the partly-furnished note and the shape test existed (base a18dcca) and unchanged
   * since: neither may move what `finish` writes or how it reports an empty room. Re-measure
   * only for a change you can explain row by row (`test/helpers/finish-digest.ts`).
   *
   * Six rows re-measured 2026-10-18 (plan-soundness PS2.1–PS2.3): courtyard-house,
   * furnished-flat, hillside-villa, library, terrace-row and two-storey had openings at wall
   * junctions fixed in their SOURCE (`./byte-identity-baseline.ts`, "Six examples fixed for the
   * opening rules"). `finish` writes nothing different: the previous runs with the same edits
   * applied to their `source` equal the new runs exactly, `changes[]` and notes included.
   * `terrace-row` again in the review round (`win_bath` at w − 700, was w − 500): the `bc5c55f`
   * runs with that edit applied to `source` equal the new runs exactly.
   *
   * 2026-10-18 (PS2.8, PS2.9): seven rows re-measured for SOURCE edits to their examples, not a
   * compiler change. With this function, each example's PREVIOUS source under the new compiler
   * (W_HABITABLE_NO_WINDOW, W_ROOM_MISSING_DEFINING) reproduces its previous row exactly, so
   * the rule moved none of them; `finish` echoes the edited source: `accessible` and
   * `relational` gain a living-room window, `hillside-villa` a window on the living room's bay
   * and one `dim`, `practice-office` a stove in the break room, `two-storey` a stove and a
   * shower, `corner-cafe`'s servery drops `uses kitchen`, `terrace-row`'s front room drops
   * `dining`. Measured again on the tree merged with the opening rules: `hillside-villa`,
   * `terrace-row` and `two-storey` carry both branches' edits, and each one's source as `main`
   * has it (cefe7e9) still reproduces `main`'s row under this compiler.
   *
   * 2026-10-19 (PS2.4): three rows re-measured for SOURCE edits, not a compiler change. Each
   * example's previous source (cc165f4) under the new compiler (the three space-enclosure rules)
   * reproduces its previous row exactly; `finish` echoes the edited source: `aquarium`'s
   * galleries reach the north wall and its concourse takes the floor round the drum,
   * `courtyard-house` gains an `outdoor patio` over its courtyard, and `relational`'s header
   * counts its seven deliberate warnings (`./byte-identity-baseline.ts`, "the space-enclosure
   * rules").
   *
   * 2026-10-20 (PS2.17): eleven rows re-measured for SOURCE edits, not a compiler change. The
   * kitchen row now requires a worktop (`counter`), so every example kitchen gained one
   * (`./byte-identity-baseline.ts`, "a worktop in every example kitchen"). Each example's
   * previous source (ef7dc46) under the new compiler reproduces its previous row exactly
   * (its kitchen already holds furniture, so `finish` writes nothing into it either way, and
   * the partly-furnished note naming the worktop is outside this digest); `finish` echoes the
   * edited source: bungalow, corner-cafe, garden-house, garden-loft, laneway-house,
   * relational, terrace-row, tiny-house, townhouse, two-bed, two-storey.
   */
  // Digest first: a name-keyed row reads to a secret scanner as `<key-ish word>: <opaque value>`.
  // Re-measured 2026-10-23 (PS3.7): aquarium, corner-cafe, furnished-flat, gallery-l, hillside-villa, materials, museum, themed: chairs turned to the table they sit at, a real
  // defect `W_SEAT_FACING_AWAY` found (ADR 0029 §6); the cause and the proof that nothing else
  // moved are in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-24 (PS2.12): aquarium, hillside-villa, library, museum-wings, tiny-house,
  // transit-hall and two-bed were fixed for annotation collisions; why, and the swap-back proof, in
  // `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11a/b): the twelve examples fixed for WC side clearance and tall
  // units over windows; why, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-25 (PS2.11c, PS2.11d): hillside-villa, relational and tiny-house fixed for a
  // transposed footprint or a parked leaf; why, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-26 (PS2.50): tiny-house's bed comment rewritten, comment only. `finish`
  // echoes the source, so the row moves; its `changes` and `unresolved` are unchanged, and its
  // `source` is the old one with that comment swapped, in both runs.
  // Re-measured 2026-10-26 (PS2.11e, PS2.46, PS2.54): the twenty examples fixed for a hob under a
  // window, a hob beside a fridge, a hinged leaf over 1219 mm and a doorway approach read from the
  // wall's face; why, in `test/byte-identity-baseline.ts`'s header. `finish` echoes the source, so
  // each row moves with its edit; the partly furnished rooms each names are unchanged (asserted above).
  // Re-measured 2026-10-26 (PR #283 red-team round 1): the eight examples its rulings edited (relational is `main`'s again); `finish` echoes the source; why, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-26 (merging main@e432c24a): garden-house, hillside-villa and library carry both PRs' edits; two-storey is `main`'s row; why, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-26 (PR #283 red-team round 2): museum-wings, a comment edit only; `finish` echoes the source.
  // Re-measured 2026-10-26 (PS2.11e): garden-house, hillside-villa, library and two-storey fixed for
  // stair defects; why, in `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-27 (PS2.74): museum and practice-office, each accessible-WC pan moved by one
  // line; `finish` echoes the source; swapped back, the previous rows reproduce. Why, in
  // `test/byte-identity-baseline.ts`'s header.
  // Re-measured 2026-10-27 (PS2.69): one-room. Main's `finish` wrote the sofa and a coffee table;
  // the table stands 1400 mm inside the pull side of the exterior door, which raises
  // `W_EXIT_APPROACH_BLOCKED` under `accessibility-advisory` (1525 mm), so the never-worse gate
  // now writes the sofa alone. Nothing else in the two runs moved.
  // Re-measured 2026-11-02 (issue #364 part 2, on 18127701): two rows, each read field by field. The
  // multi-storey examples other than turning-stair have no room the stage can fill, so they did not move.
  // museum-wings: the note on a room of a placed component no longer says a plan body cannot name it;
  // `source` and `changes[]` of both runs are unchanged, and the old sentence put back in the new runs
  // reproduces the previous row. turning-stair: a plan with `level` blocks is furnished now: 4 pieces
  // (`living` on level 1, `bed` on level 2), each change with its `level`. Less those statements, the
  // `--only furnish` source is the example's and the full run's is the previous full run's, with the
  // same sheet statements; the four notes that said the stage handles one storey are two scope notes now.
  const FINISH_DIGESTS: ReadonlyMap<string, string> = new Map(
    (
      [
        ["50bfe2d1d4955f0399834c0e436ef5f6308a109552a22a7df3aea13f93cdfdd9", "accessible"], // PS2.9 source edit, see above
        ["a27edda3841828db7983acb43d0ee8ead233008eb2934f908c8a8a092556aa51", "aquarium"], // PS2.4 source edit, see above; PS2.10 source edit (byte-identity-baseline.ts); PS2.11e source edit, see above; RM1.4 source edit (snapped values written as drawn), `finish` echoes the source: the old source still gives the old digest (was b03a75dc)
        ["8894023b744a155aad52d1ca28b7836ad1c9d63d1665e82f6b835c8d8e480f3b", "attached"],
        ["6a6bd42fa1eabace670f41cac9c5b228d03c43a4a06d80350181721324e241ea", "bungalow"], // PS2.17 source edit (a worktop), see above; PS2.11e source edit, see above; CV13 (was 30ec95a6): example source edited (chairs added)
        ["f12245a9fa1c1f60c7327ff1bcd2717db121f42e38bd333d8a6dec47f3389abe", "classroom-block"], // first measurement, added with the example; PS2.11e source edit, see above
        ["2c5940b85eddc82a6f510f90350995bf05471b246982d7cf2f36e70fff0f28ef", "clinic"],
        ["35c8741f367876f8ad1f7c2111485959f1151cb54da5c015d8bcdc9aea130682", "corner-cafe"], // first measurement with the example; PS2.9 source edit; PS2.17 source edit (a worktop), see above
        ["6ede0a00b294961bbb9267e67318b79315e19e7d9e6323ff10fb366d09b5e6fa", "courtyard-family"], // first measurement, added with the example (RM8.5); re-measured after its review's source edit (a deeper garage, a gym with no `uses`); CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was e252c466)
        ["6e9a6e9177efc577314a4ba2d2d44edfcfd1dcc9ea7b657b5b5de744839f634d", "courtyard-house"], // PS2.4 source edit, see above; PS2.11e source edit, see above; CV13 (was 18fff217): example source edited (chairs added)
        ["45ee887cf4b527976f42af04bbc8deafaa17070747b37acd6bf1d02efef0e79f", "furnished-flat"], // PS2.11e source edit, see above
        ["f66376fd7e87d89a5a3b26746fdd8f48c9e606918fcf5872cc41494e74ac3b1d", "gallery-l"], // PS2.10, PS2.11e source edits; the fit-out comment corrected, same length: the old comment gives 4fbdbd13, the row before it; RM1.4 source edit (snapped values written as drawn), `finish` echoes the source: the old source still gives the old digest (was 62ef4254)
        // Re-measured 2026-10-18 (plan-soundness PS2.6): the example's SOURCE changed, one door
        // re-hosted (`d_gar` onto the kitchen, +3 bytes), and `source` is part of this digest. The
        // pre-edit source still gives the previous row; see ./byte-identity-baseline.ts.
        ["1b827208e2241a051276fd47aa2dd9d692bb53a0d394c3cb254b849a27ae302a", "garden-house"], // PS2.17 source edit (a worktop), see above; RM1.4 source edit (snapped values written as drawn), `finish` echoes the source: the old source still gives the old digest (was d0e7d726); CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was 732aae32)
        ["fa3550386dfba8b67426e41179dd2519e44182d1a0437ac093e2dae0f3d7df01", "garden-loft"], // PS2.17 source edit (a worktop), see above; PS2.11e source edit, see above; CV13 (was 2e7ccbfc): example source edited (chairs added)
        ["7e6e8a099d0e13f8eba07189c8e005904d81fe22d77140b862dbeb3a0bd093c4", "hexagon-pavilion"], // CV13 (was 57d42378): example source edited (chairs added)
        ["323a92b2eeb165f7989f6d06410a2279f3b37a8b7a712308993c9e8e5bd47b25", "hillside-villa"], // PS2.1–PS2.3 and PS2.9 source edits, see above; PS2.11e source edit, see above; RM1.4 source edit (snapped values written as drawn), `finish` echoes the source: the old source still gives the old digest (was 79df29d0); CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was 50626c34)
        ["b43cd18d46e8f1da0e7f97821f75841ec1a252a1c9b99c04f68999821d429a70", "imports"],
        ["86801700bbd9d51ddf1a9611a8c8dfd98a0967bbbcb7045cc2f901fe1c190c6f", "knob-flat"], // first measurement, added with the example (P4)
        ["784e6b573a7065d016c9f559638ba67e88cab82ef1d339edb98558c209be0430", "laneway-house"], // PS2.17 source edit (a worktop), see above; PS2.11e source edit, see above; CV13 (was 878f41b1): example source edited (chairs added)
        ["d30296c2c7ee4ce7b7fdad894c4a7394d27d8e5422894b6782925d5e172a3414", "library"], // PS2.11e source edit, see above
        ["0a8902f60aa17c548fed121167615cdaaf3d1ea679fb34dff983e1dfa84b2b13", "materials"],
        ["618d95678ec61da2cd88a2393bbaec049eabc21a8dec47d6db09d8943153edbd", "museum"], // PS2.11e source edit, see above; PS2.74 source edit, see above; CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was 536031a0)
        ["e56adeb88cb99daf3c2e93723b84ccd134c948f803bffb84fb519553d0ff63c4", "museum-wing"],
        ["6b667b581ae1ad37f2c5ae97fd569b189765d2bc97ecd7317d3b79716545de9d", "museum-wings"], // PS2.11e source edit, see above; a note's wording (#364), see above
        ["323b8b2e7741e5cd31ae525c5d54c570cb47d5e27c8e32817d357350799a5053", "one-room"], // PS2.69, see above
        ["06e0d70afc7df98e0cf944d4d4d6179370632ea31e52eebf07aaf6efb7af210c", "parametric"],
        ["a6f645e75374318f4ec98242aaf081345a5c478041c9b953df1c235111e64c0c", "relational"], // PS2.9 and PS2.4 source edits; PS2.17 source edit (a worktop), see above; PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e source edit, see above
        ["0e7a659469d935c459aa333f2600a120f6a7d9d2f2732b8a933916062935fe29", "remodel"], // first measurement, added with the example (B3b); CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was 07f7be65); CV13 (was f9e4fb3c): example source edited (chairs added)
        ["d58bfbf0a25a5b70b7bdfdd1a8ef7b0fb8912f88ebb5cf631da3efe8268015e4", "sheet-notes"], // first measurement, added with the example
        ["07fdbb004b13fcea94bbc7969a42f821bbe48f8665f80dd39d093f502415f439", "practice-office"], // first measurement with the example; PS2.9 source edit, see above; PS2.11e source edit, see above; PS2.74 source edit, see above
        ["cb0407f5d5cd8881f49a775b48985443227cbdca0129ebefeb9ea0f3cc063d2a", "studio"], // PS2.11e source edit, see above; RM0.2b header comment corrected, `finish` echoes the source: the old comment gives f6a934fc, the row before it
        ["472248c06943a371266767d2db8b12ff4206a1d0c71ea5ab5de82b11277d154f", "terrace-row"], // PS2.1–PS2.3 and PS2.9 source edits; PS2.17 source edit (a worktop), see above
        ["ed1c51d6484b8ec38f45e16b5706e07ea4318a315138fe9bd57ac2fde2e660d8", "themed"], // PS2.11e source edit, see above
        ["d9d4e8820a66dd416c690161cb107ed6ce9148fd26d160150ef20d72227a3542", "tiny-house"], // PS2.17 source edit (a worktop); PS2.50 comment edit, see above; PS2.11e source edit, see above
        ["960dc90ec303e97e5bae1d26ad17142787f2bc9e1cc55b4653ffbae3af9ce537", "townhouse"], // PS2.17 source edit (a worktop), see above; PS2.11e source edit, see above; CV13 (was f65d780b): example source edited (chairs added)
        ["d444146fdb6b48864dd0523c1013599e72ff7108a16d1e154ecc79dd0e0137e1", "transit-hall"], // PS2.11e source edit, see above
        ["25ad7208d20c1e0e597c0e1e82f10f56963fd7a9c8579dcc3c968857611460e0", "turning-stair"], // first measurement, added with the example (S2); furnished storey by storey (#364), see above; RM1.2a, see ./byte-identity-baseline.ts
        ["0ad1dd5290d7a581eb2d9a9338bc144f7b338d558bc2a81540c6e141f3782f43", "two-bed"], // PS2.17 source edit (a worktop), see above; PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e source edit, see above; RM1.4 source edit (snapped values written as drawn), `finish` echoes the source: the old source still gives the old digest (was 16b598f4); CO.1 source edit (the snapped `against` sizes written out), `finish` echoes the source: main's source still gives the old digest under this compiler, and main's compiler gives this one on the new source (was 707f5a25); CV13 (was c7fdec4b): example source edited (chairs added)
        ["e7fd3c28e5ff9870f1e6ac923916ea759422947495801a9b2a4f915cbc28e85e", "two-storey"], // PS2.1–PS2.3 and PS2.9 source edits; PS2.17 source edit (a worktop), see above; RM1.2a, see ./byte-identity-baseline.ts
      ] as const
    ).map(([digest, example]) => [example, digest]),
  );

  it("the pinned tables name only shipped examples, and the digest table names every one", () => {
    for (const name of Object.keys(CORPUS_PARTLY)) expect(NAMES).toContain(name);
    expect([...FINISH_DIGESTS.keys()].sort()).toEqual(NAMES);
  });

  for (const name of NAMES)
    it(`${name}: the partly furnished rooms are named, nothing is written into them, and nothing else moved`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "furnish" });
      const named = partly(r);
      expect(named).toEqual(CORPUS_PARTLY[name] ?? []);
      for (const [room] of named) expect(r.changes.some((c) => c.room === room)).toBe(false);
      expect(finishDigest(src, world)).toBe(FINISH_DIGESTS.get(name));
    }, 120000);
});
