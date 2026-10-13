import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { USE_KINDS, type UseKind } from "../src/ast.js";
import { CATALOG_CATEGORIES, defaultFootprint, fixtureSpec, zoneFixtureCategories } from "../src/fixtures-catalog.js";
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
import { canonicalFixture } from "../src/elements/fixtures-glyphs.js";
import { finishDigest, PARTLY } from "./finish-digest.js";

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

suite("furnish law — fill only: a partly furnished room is reported, never topped up", () => {
  /** The partly-furnished notes of a result, as `[room, what it lacks]`. */
  const partly = (r: { unresolved: readonly { room?: string; reason: string }[] }): Array<[string, string]> =>
    r.unresolved
      .filter((u) => u.reason.includes(PARTLY))
      .map((u) => [u.room!, /requires — (.*?) missing/.exec(u.reason)![1]!]);

  it("the agent-UX audit plan: the living room's missing sofa is named; the bedrooms are furnished; the bathroom is silent", () => {
    const src = readFileSync("test/finish-fixtures/agent-ux-prefinish.arch", "utf8");
    expect(errorsOf(src)).toEqual([]);
    for (const r of [finish(src, { only: "furnish" }), finish(src)]) {
      expect([...new Set(r.changes.filter((c) => c.stage === "furnish").map((c) => c.room))]).toEqual([
        "r_bed1",
        "r_bed2",
      ]);
      expect(r.unresolved.filter((u) => u.stage === "furnish")).toEqual([
        {
          stage: "furnish",
          room: "r_live",
          reason:
            '"r_live" holds furniture but not every piece its use requires — living: `sofa` missing; finish fills only empty rooms',
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
    expect(partly(r)).toEqual([["r_bed", "kitchen: `kitchen_sink`, `stove`; bedroom: `bed`; living: `sofa`"]]);
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
    expect(r.unresolved.map((u) => u.room)).toEqual(["r_bed", "r_bath"]);
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
      '"u1.r" holds furniture but not every piece its use requires — living: `sofa` missing; it belongs to a placed component instance — furnish the component instead',
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
      '"r" holds furniture but not every piece its use requires — living: `sofa` missing; it is larger than 100 m², which the furnish table does not cover; finish fills only empty dwelling rooms',
    );
  });

  it("a room of a placed component is told to furnish the component", () => {
    const r = finish(srcOf("terrace-row"), { world, only: "furnish" });
    const notes = r.unresolved.filter((u) => u.reason.includes(PARTLY));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.reason).toContain("it belongs to a placed component instance — furnish the component instead");
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
    // bounding box covers it; the L's floor does not. So the L holds nothing (and is reported
    // as a polygon room), and the square room holds its bed (no note).
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
    expect(r.unresolved.map((u) => u.room)).toEqual(["l"]);
    expect(r.unresolved[0]!.reason).toContain("polygon room");
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
    "corner-cafe": [["r_servery", "kitchen: `kitchen_sink`, `stove`"]],
    "hexagon-pavilion": [
      ["g_ne", "living: `sofa`"],
      ["g_n", "office: `desk`"],
      ["g_se", "living: `sofa`"],
    ],
    "terrace-row": [
      ["u1.living", "dining: `dining_table`"],
      ["u2.living", "dining: `dining_table`"],
      ["u3.living", "dining: `dining_table`"],
      ["u4.living", "dining: `dining_table`"],
    ],
    "small-office": [
      ["r_meet1", "office: `desk`"],
      ["r_meet2", "office: `desk`"],
      ["r_break", "kitchen: `stove`"],
    ],
    "tiny-house": [["r_main", "living: `sofa`"]],
    "transit-hall": [
      ["r_shop1", "office: `desk`"],
      ["r_shop2", "office: `desk`"],
      ["r_shop3", "office: `desk`"],
      ["r_shop4", "office: `desk`"],
    ],
    "two-storey": [["kitchen", "kitchen: `stove`"]],
  };

  /**
   * {@link finishDigest} of every example — `source`, `changes[]` and every note except the
   * partly-furnished ones, for a `--only furnish` run and a full run — measured on the stage
   * BEFORE the partly-furnished note and the shape test existed (base a18dcca) and unchanged
   * since: neither may move what `finish` writes or how it reports an empty room. Re-measure
   * only for a change you can explain row by row (`test/finish-digest.ts`).
   */
  // Digest first: a name-keyed row reads to a secret scanner as `<key-ish word>: <opaque value>`.
  const FINISH_DIGESTS: ReadonlyMap<string, string> = new Map(
    (
      [
        ["c0a176e29ecf6f56a0224fa3b13bc16533b85fdb76cc27ced931ee1cf9d80630", "accessible"],
        ["8c16911c1bfb24f05f97b69b48666a3d6bba913f133e535c15a98df45ceca22e", "aquarium"],
        ["8894023b744a155aad52d1ca28b7836ad1c9d63d1665e82f6b835c8d8e480f3b", "attached"],
        ["c512ccc1711f22b6046175a9ef358ad5b2d95a481448c61bf95196714e990187", "bungalow"],
        ["920bd074dc37bdda300c164b2b09a391898e447c3c348f83b79306355ff3865d", "classroom-block"], // first measurement, added with the example
        ["8f1860697479247a76d029ed309957a97660716904b948956bbe76b6bd46873c", "clinic"],
        ["c6c8393635d06f3a8ab5d1f544d85a8dc0ca405fa404a66d7aadf575a942102c", "corner-cafe"], // first measurement, added with the example
        ["85385abf1ba670c9ba8362ed21773cd8567ce233ce276914cf428689bf4a938e", "courtyard-house"],
        ["603c773d4df5b0e984b6505af56c8d7a49f128b6f690273f4553a2b629a48d73", "furnished-flat"],
        ["6680a2b84429d16bf60bed5d240dbf498fa920c9aa99c2cf91a44362ea5d14b1", "gallery-l"],
        ["566a0d4d8610714ba8a4655e302be926717d5991d1edce9af5ca68efadfbb594", "garden-house"],
        ["33a8fdea6f6aaab2ef4b42bdcf137312ac3b0b63818c9a3bc347cbb176a829ef", "garden-loft"],
        ["57d4237846d3b666c6806da6ee2bf4cadeb68a2e1d39723c6a024e5b415d5faf", "hexagon-pavilion"],
        ["a97e3db608fd51d8e441daafb55989387411ada1531da0fad9ca003f74d6bc8d", "hillside-villa"],
        ["d90d58c40a4068427ef23c066acba5d50d8e99a801b6ce890da3ac9dc01a9554", "imports"],
        ["d04b5112a75e5f493257685ab80f161288f82a78eedbb47ec0bc92950ed928e3", "laneway-house"],
        ["825e5a65cedc04cca28384d9c6ec5bf79c9ed7efff56be8a20b36208c2bc5cd7", "library"],
        ["7737a7533af7804514e028ee6740c98133ae439ec57ca1a73f5ef72de0260a06", "materials"],
        ["0c540e53b8c534793dbfb63eb0ecedc39c152f99b1bfee51237baf114c5eaab5", "museum"],
        ["e56adeb88cb99daf3c2e93723b84ccd134c948f803bffb84fb519553d0ff63c4", "museum-wing"],
        ["c5264000e380ff26ad0ea75d9cb75b84d52d22c5988671aee640f87ef125c340", "museum-wings"],
        ["863a9f2c6d83393b414fc6cf634c7757d3148ba19d9c85ff19b9b935f2d64f99", "one-room"],
        ["aa3345f2ba982f844e25108a7908a6f60a8ed295b574248fb895b54bb5599c27", "parametric"],
        ["e0ee4c353a512b03833dc5271ea20a22bd5117e6f8a5b812037c45816dcb4ef5", "relational"],
        ["d58bfbf0a25a5b70b7bdfdd1a8ef7b0fb8912f88ebb5cf631da3efe8268015e4", "sheet-notes"], // first measurement, added with the example
        ["97dbd77335a441e5269280411340bd75db9e0d088387db69e80f5cd26f208264", "small-office"], // first measurement, added with the example
        ["147ce7e23f6f2a403d2d269cc0e68b678cab850e0d3a641287ef50bced7c76d3", "studio"],
        ["e4ce4942694b6939c8885bd302dbf2fe53f7903025fe86a11e5dfd8cf63f1764", "terrace-row"],
        ["9da982b56530f0ec0c1b313fe8be64e5346f71bc4d098244664f164a02029a09", "themed"],
        ["c8c89f7f1db78626ab2620d113675e146a63c80461d978ce15b968a6aff581f5", "tiny-house"],
        ["ec6046117fe68a7329ef5aded15217195ecbd3d0108153d5e7b5d56e602e43a2", "townhouse"],
        ["8512160d1872176b1d122364ca4a36274ccde6c5e8204c394d50e325598bdc33", "transit-hall"],
        ["07ed5965a8bee0706176c15c95b2714ea43a4f3212267bfcafc4a7333b9a6fdb", "two-bed"],
        ["8e5e10658ec093d71e87dc1068f52b12b1aed8981d7e98f1c640c54b6246ccd9", "two-storey"],
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
