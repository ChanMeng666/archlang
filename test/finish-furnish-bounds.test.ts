/** furnish laws — bounded, generated rows of rooms, the table and the docs, the profiles, relational rooms, wall runs, smaller placement rules, wet rooms (PS2.45). Split out of `finish-furnish.test.ts` (FT3c). */

import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { USE_KINDS, type UseKind } from "../src/ast.js";
import { CATALOG_CATEGORIES, defaultFootprint, zoneFixtureCategories } from "../src/fixtures-catalog.js";
import {
  furnishCheckBound,
  furnishStage,
  MAX_CHECKS_PER_PIECE,
  MAX_CHECKS_PER_ROOM,
  MAX_PIECE_CHECKS_PER_ROOM,
  MAX_SET_CHECKS_PER_ROOM,
} from "../src/furnish.js";
import { compile, finish, FURNISH_TABLE, LINT_PROFILE_NAMES, LINT_PROFILES, lint } from "../src/index.js";
import { ADVISORY_CODE_PROFILES } from "../src/lint.js";
import type { World } from "../src/world.js";
import { countsByClass, GATED, sweep } from "../scripts/probe-finish-wet-rooms.js";
import { floorAt, runs } from "./setup/fast-check.js";
import {
  world,
  NAMES,
  srcOf,
  codes,
  gainedBy,
  errorsOf,
  isOneInsertion,
  furnitureLines,
  refused,
  FLAT,
} from "./helpers/finish-furnish-shared.js";

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
    expect(refused(r).map((u) => u.codes)).toEqual([["W_TEST_BLOCK"], ["W_TEST_BLOCK"]]);
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
    let leftEmpty = 0;
    fc.assert(
      fc.property(row, (src) => {
        if (compile(src, { noCache: true }).diagnostics.some((d) => d.severity === "error")) return;
        for (const only of ["furnish", undefined] as const) {
          const r = finish(src, only ? { only } : {});
          const again = finish(r.source, only ? { only } : {});
          expect(again.source, `not a fixpoint:\n${src}`).toBe(r.source);
          expect(again.changed).toBe(false);
          // W_ROOM_MISSING_DEFINING is the one code the stage judges per use rather than as a
          // gained code: a room furnished for one use while another use was left out (a
          // living-dining room whose table has no position) raises it, and the run says so.
          const gained = gainedBy(src, r.source, undefined);
          expect(
            gained.filter((c) => c !== "W_ROOM_MISSING_DEFINING"),
            `worse:\n${src}\n→\n${r.source}`,
          ).toEqual([]);
          if (gained.includes("W_ROOM_MISSING_DEFINING"))
            expect(
              r.unresolved.some((u) => /pieces were left out of/.test(u.reason)),
              `a room lacks its defining piece and no note says which use was left out:\n${r.source}`,
            ).toBe(true);
          if (only) {
            expect(isOneInsertion(src, r.source)).toBe(true);
            for (const c of r.changes) expect(c.text).not.toContain(" at (");
            const touched = new Set(r.changes.map((c) => c.room));
            for (const l of furnitureLines(src)) expect(touched.has(/in (\w+)$/.exec(l)![1]!)).toBe(false);
            furnished += touched.size;
            leftEmpty += refused(r).length;
          }
        }
      }),
      { numRuns: runs(60), seed: 20261009 },
    );
    expect(furnished, "the property never furnished a room").toBeGreaterThan(floorAt(20));
    expect(leftEmpty, "the property never met a room it had to leave empty").toBeGreaterThan(0);
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
    expect(FURNISH_TABLE.kitchen!.map((i) => i.category)).toEqual(["kitchen_sink", "stove", "counter", "fridge"]);
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

/**
 * The default ruleset and the universal advisory profiles (`accessibility-advisory`). The
 * residential-advisory profiles (`ADVISORY_CODE_PROFILES`) are jurisdiction-specific and mutually
 * exclusive by design, so the law is not held under them (ADR 0024 decision 6 and ADR 0025 §7,
 * amended 2026-10-25, PR #248; `src/lint/ruleset.ts` says why).
 */
suite("furnish law — never worse under the default and universal profiles", () => {
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
      for (const profile of LINT_PROFILE_NAMES.filter((p) => !ADVISORY_CODE_PROFILES.includes(p))) {
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
    expect(refused(r)).toEqual([expect.objectContaining({ stage: "furnish", room: "side" })]);
    expect(refused(r)[0]!.reason).toContain("a relational room has no fixed `at` to anchor in");
    expect(refused(r)[0]!.codes).toBeUndefined();
  });

  it("a relational room whose pieces all go `against wall` is furnished", () => {
    const src = REL.replace(`label "Bedroom" uses bedroom`, `label "Bathroom" uses wc`);
    const r = finish(src, { only: "furnish" });
    expect(refused(r)).toEqual([]);
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
    expect(k.map((p) => p.word)).toEqual(["kitchen_sink", "stove", "counter", "fridge"]);
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
    // The piece-by-piece fallback places the sink alone first. A kitchen holding a sink and no
    // hob raises W_ROOM_MISSING_DEFINING, which the gate does not count (the stage judges it
    // per use), so the stove's own W_TEST_BLOCK is what drops the kitchen, and what is named.
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

/**
 * PS2.45: a wet room the piece-by-piece run would leave empty is tried as whole sets (pan, basin,
 * and in a bathroom the bath or shower), from the stage's ordered layouts (`wetSet`,
 * `src/furnish.ts`). A room it furnished before keeps its pieces: only empty rooms gain any.
 */
suite("furnish law — a wet room's pieces are placed together (PS2.45)", () => {
  const room = (use: "wc" | "bath", w: number, h: number, swing: "in" | "out"): string => `plan "Wet" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }
  room id=r at (0,0) size ${w}x${h} label "${use === "wc" ? "WC" : "Bathroom"}" uses ${use}
  door id=d on w at ${w / 2} width 800 swing ${swing}
  wall id=hw exterior thickness 200 { (0,0) (-1200,0) (-1200,-2400) (${w + 1200},-2400) (${w + 1200},0) (${w},0) }
  room id=h at (-1200,-2400) size ${w + 2400}x2400 label "Hall"
  door id=e on hw at ${3600 + (w + 2400) / 2} width 900 swing out
}
`;
  const gatedIn = (src: string, profile?: string): string[] =>
    lint(src, profile ? { profile } : {})
      .map((d) => d.code ?? "")
      .filter((c) => (GATED as readonly string[]).includes(c));

  it("the bound: a room's checks are its pieces' and its sets'", () => {
    expect(MAX_CHECKS_PER_ROOM).toBe(MAX_PIECE_CHECKS_PER_ROOM + MAX_SET_CHECKS_PER_ROOM);
    expect(MAX_PIECE_CHECKS_PER_ROOM).toBe(13);
  });

  it("a 1.0 m clear WC room takes its pan on the end wall and its basin on the side wall, lint clean", () => {
    // 1200 on the centrelines, a 200 mm wall: 1000 mm clear, 2200 mm long, the door at the far end.
    const src = room("wc", 1200, 2400, "out");
    const r = finish(src, { only: "furnish" });
    expect(refused(r)).toEqual([]);
    expect(r.changes.map((c) => c.text)).toEqual([
      // the pan on the end wall, its centreline 450 mm off the side face (and 550 off the other)
      "furniture wc against wall w segment 2 offset 650 side left in r",
      // the basin on the side wall, between the door's approach and the floor before the pan
      // (750 before PS2.54: the approach is now kept 300 mm past the 200 mm wall's FACE, not
      // its centreline, so the basin stands 100 mm further from the door)
      "furniture basin against wall w segment 1 offset 850 side left in r",
    ]);
    expect(lint(r.source).map((d) => d.code)).toEqual([]);
    expect(gatedIn(r.source, "accessibility-advisory")).toEqual([]);
    expect(gainedBy(src, r.source, undefined)).toEqual([]);
  });

  it("a 2.4 × 2.1 m bathroom takes a shower after an off-corner pan, lint clean", () => {
    const src = room("bath", 2400, 2100, "in");
    const r = finish(src, { only: "furnish" });
    expect(refused(r)).toEqual([]);
    expect(r.changes.map((c) => c.text)).toEqual([
      // the pan on the far wall, its centreline 450 mm off the side face
      "furniture wc against wall w segment 2 offset 1850 side left in r",
      // the basin on the side wall, clear of the door's swing
      "furniture basin against wall w segment 1 offset 400 side left in r",
      // the shower in the other corner of the far wall, clear of the pan's side
      "furniture shower against wall w segment 2 offset 550 side left in r",
    ]);
    expect(lint(r.source).map((d) => d.code)).toEqual([]);
    expect(gatedIn(r.source, "accessibility-advisory")).toEqual([]);
    expect(gainedBy(src, r.source, undefined)).toEqual([]);
  });

  it("a wet room every check refuses spends the first proposal, three tries at the pan and four layouts", () => {
    // The 2.4 × 2.1 m bathroom above, with every candidate refused: 1 first proposal + 3 tries at the
    // required `wc` (MAX_CHECKS_PER_PIECE) + 4 layouts (MAX_SET_CHECKS_PER_ROOM). Lifting the set
    // search's cap makes this count grow, so the cap is pinned here, not only by the bound.
    const src = room("bath", 2400, 2100, "in");
    let calls = 0;
    const r = furnishStage(src, {}, (s) => {
      calls++;
      return { errors: false, codes: new Map(s === src ? [] : [["W_TEST_BLOCK", 1]]) };
    });
    expect(r.source).toBe(src);
    expect(r.rooms).toBe(1);
    expect(r.checks).toBe(1 + MAX_CHECKS_PER_PIECE + MAX_SET_CHECKS_PER_ROOM);
    expect(r.checks).toBe(8);
    expect(calls).toBe(1 + r.checks);
    expect(refused(r).map((u) => u.codes)).toEqual([["W_TEST_BLOCK"]]);
  });

  it("a room too small for any layout stays empty, with the note the stage already gives", () => {
    // 1000 × 1300 mm clear: the pan and its clear floor leave no 600 mm of side wall for a basin.
    const src = room("wc", 1200, 1500, "out");
    const r = finish(src, { only: "furnish" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(refused(r)).toEqual([
      {
        stage: "furnish",
        room: "r",
        reason:
          'no position for the required `basin` in "r" clears its walls, its doors and the pieces before it — the room was left empty',
        span: expect.anything(),
      },
    ]);
  });

  it("the wet-room sweep (`scripts/probe-finish-wet-rooms.ts`): its counts, and no furnished room raises a gated code", () => {
    // Measured 2026-10-26 (PS2.45). On main before this card: bath 152, wc 260, and every one of
    // those rooms furnished here with the same statements (the script's `--against`). The script's
    // `--ensuite` class is left out: it reads as a bath and repeats the bath class exactly.
    // Re-measured 2026-10-26 (PS2.54): bath 213 → 212, wc 275 → 271. A door's approach is now
    // kept `doorwayLandingMm` past its wall's FACE, 100 mm deeper on these 200 mm walls, so five
    // rooms that fitted their set only inside that 100 mm are left empty and reported, as the
    // stage reports any room it cannot furnish clean; none raises a gated code.
    // Re-measured 2026-10-27 (PS2.69): bath 212 → 159, wc 271 → 233. Each probe room's one door
    // is the building's exterior exit, whose 914 mm clear floor `W_EXIT_APPROACH_BLOCKED` now
    // reads and the stage now keeps (`Site.fits`); a room whose set fitted only inside it is left
    // empty and reported. The helper above puts a hall outside its rooms' door, so its pinned
    // layouts are not exits and are unchanged.
    const results = sweep();
    expect(results.length).toBe(612);
    expect(countsByClass(results)).toEqual({ bath: 159, wc: 233, ensuite: 0 });
    expect(results.filter((r) => r.violations.length > 0).map((r) => r.key)).toEqual([]);
  }, 300000);
});
