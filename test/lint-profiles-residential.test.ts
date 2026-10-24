import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  describe as describePlan,
  ERROR_CATALOG,
  LINT_PROFILE_NAMES,
  LINT_PROFILES,
  lint,
  lintCoverage,
  TASTE_PROFILE_NAMES,
  taste,
} from "../src/index.js";
import { ADVISORY_CODE_PROFILES, DEFERRED_PROFILE_NUMBERS } from "../src/lint/ruleset.js";
import { EXAMPLE_SOURCES, TASTE_WORLD } from "./taste-sources.js";

/**
 * The residential-advisory profiles (plan-soundness PS5.2): `cn-`, `uk-` and
 * `us-residential-advisory`. Each is a lint profile (`LINT_PROFILES`) and a taste profile
 * (`TASTE_PROFILES`), named honestly (ADR 0005: never `gb50096`, `ndss`, `irc`). Every number
 * cites its source in a doc comment with its mark, [V] read or [S] second-hand; nothing
 * remembered [M] ships (README §3 D3). Each number is pinned here just above and just below its
 * threshold, on whole millimetres (ADR 0022).
 */

const CN = "cn-residential-advisory";
const UK = "uk-residential-advisory";
const US = "us-residential-advisory";
const RESIDENTIAL = [CN, UK, US] as const;

const PROFILE_CODES = new Set(["W_ROOM_TOO_SMALL", "W_ROOM_TOO_NARROW"]);
const found = (src: string, profile?: string): string[] =>
  lint(src, profile ? { profile } : {})
    .filter((d) => PROFILE_CODES.has(d.code ?? ""))
    .map((d) => `${d.code} ${d.message}`);
const skipsOf = (src: string, profile: string, family = "rooms"): string[] =>
  (lintCoverage(src, { profile })?.families ?? [])
    .filter((f) => f.family === family)
    .flatMap((f) => (f.skipped ?? []).map((s) => s.reason));

/** One room with no walls, so its clear width is its drawn short side. */
const room = (w: number, h: number, uses: string, extra = "", label = "Room"): string => `plan "P" {
  units mm
  room id=r at (0,0) size ${w}x${h} label "${label}" uses ${uses}
  ${extra}
}`;
const bed = (w: number) => `furniture bed at (100,100) size ${w}x2000`;

describe("the residential-advisory profiles", () => {
  it("are honestly named lint AND taste profiles, from one list each", () => {
    for (const p of RESIDENTIAL) {
      expect(LINT_PROFILE_NAMES).toContain(p);
      expect(TASTE_PROFILE_NAMES).toContain(p);
    }
    const residential = (names: readonly string[]) => names.filter((n) => n.endsWith("-residential-advisory"));
    expect(residential(LINT_PROFILE_NAMES)).toEqual(residential(TASTE_PROFILE_NAMES));
    // The advisory-code layer: finish's never-worse law is not held under them.
    expect(ADVISORY_CODE_PROFILES).toEqual(residential(LINT_PROFILE_NAMES));
    for (const n of [...LINT_PROFILE_NAMES, ...TASTE_PROFILE_NAMES])
      for (const part of n.split("-")) expect(part, n).not.toMatch(/^(gb\d*|ndss|irc|nkba|ada|iso)$/i);
  });

  it("every number they set cites a source and its mark in a doc comment, and none is [M]", () => {
    const text = readFileSync("src/lint/ruleset.ts", "utf8");
    const block = text.slice(text.indexOf(`"${CN}": {`), text.indexOf("export const DEFERRED_PROFILE_NUMBERS"));
    const numbered = block.split("\n").filter((l) => /:\s*\d/.test(l) && !l.trim().startsWith("*"));
    expect(numbered.length).toBe(28); // cn 11, uk 8, us 9
    for (const l of numbered) {
      expect(l, l).toMatch(/\/\/ .*\[(V|S)[\],]/);
      expect(l, l).not.toContain("[M");
    }
    const taste = readFileSync("src/taste/profiles.ts", "utf8");
    expect(taste).toContain("GB 50096-2011 7.1.5");
    expect(taste).not.toContain("[M");
  });

  it("pin the sourced numbers", () => {
    expect(LINT_PROFILES[CN]).toEqual({
      roomAreaMeasure: "net",
      minRoomAreaByUseM2: { bedroom: 5, living: 10, kitchen: 4 },
      minDoubleBedroomAreaM2: 9,
      minEntryPassageWidthMm: 1200,
      minPathClearWidthByUseMm: { bedroom: 1000, living: 1000, kitchen: 900, bath: 900, wc: 900, storage: 900 },
    });
    expect(LINT_PROFILES[UK]).toEqual({
      roomAreaMeasure: "net",
      minRoomAreaByUseM2: { bedroom: 7.5 },
      minDoubleBedroomAreaM2: 11.5,
      minRoomShortSideByUseMm: { bedroom: 2150, hall: 900, circulation: 900, entry: 900 },
      minDoubleBedroomShortSideMm: 2550,
      minMainDoubleBedroomShortSideMm: 2750,
    });
    expect(LINT_PROFILES[US]).toEqual({
      roomAreaMeasure: "net",
      minRoomAreaByUseM2: { living: 6.5, dining: 6.5, bedroom: 6.5 },
      minRoomShortSideByUseMm: { living: 2134, dining: 2134, bedroom: 2134, hall: 914, circulation: 914, entry: 914 },
    });
    // R10 and R37 wait for their rules (PS2.11, PS2.16); their numbers are kept, unread.
    expect(DEFERRED_PROFILE_NUMBERS.usWc).toEqual({ centreToSideMm: 381, clearInFrontMm: 533 });
    expect(DEFERRED_PROFILE_NUMBERS.usEscape.minClearWidthMm).toBe(508);
    expect(DEFERRED_PROFILE_NUMBERS.ukEscape.minClearM2).toBe(0.33);
  });

  it("leave the default ruleset off: no width is asked and no double bedroom is read", () => {
    expect(DEFAULT_RULESET.minRoomShortSideByUseMm).toEqual({});
    expect(DEFAULT_RULESET.minPathClearWidthByUseMm).toEqual({});
    expect(DEFAULT_RULESET.minDoubleBedroomAreaM2).toBeNull();
    expect(DEFAULT_RULESET.minDoubleBedroomShortSideMm).toBeNull();
    expect(DEFAULT_RULESET.minMainDoubleBedroomShortSideMm).toBeNull();
    expect(DEFAULT_RULESET.minEntryPassageWidthMm).toBeNull();
    const narrowBed = room(1500, 4000, "bedroom", bed(1500), "Bedroom");
    expect(found(narrowBed)).toEqual([]);
    expect(skipsOf(narrowBed, "residential-basic")).not.toContain("no-bed");
  });
});

describe("the catalog example", () => {
  it("raises W_ROOM_TOO_NARROW under the profile it names, and nothing under the default", () => {
    const ex = ERROR_CATALOG.W_ROOM_TOO_NARROW!.example;
    const profile = /lint --profile ([a-z-]+)/.exec(ex)![1]!;
    const src = `plan "E" {\n  units mm\n${ex}\n}\n`;
    expect(lint(src, { profile }).map((d) => d.code)).toContain("W_ROOM_TOO_NARROW");
    expect(lint(src).map((d) => d.code)).not.toContain("W_ROOM_TOO_NARROW");
  });
});

describe("single or double: read from the bed, never the label (ADR 0005)", () => {
  // 3000 × 2900 = 8.7 m²: under cn's 9 m² double, over its 5 m² single.
  const cnRoom = (extra: string, label = "Bedroom") => room(3000, 2900, "bedroom", extra, label);
  const dbl =
    'W_ROOM_TOO_SMALL Room "Bedroom" is only 8.7 m² of net floor (under 9 m², the floor for a double bedroom).';

  it("a bed 1200 mm wide is a single; 1201 mm a double", () => {
    expect(found(cnRoom(bed(1200)), CN)).toEqual([]);
    expect(found(cnRoom(bed(1201)), CN)).toEqual([dbl]);
  });

  it("a double_bed is a double whatever its width; two beds make a twin, held as a double", () => {
    expect(found(cnRoom("furniture double_bed at (100,100) size 1100x2000"), CN)).toEqual([dbl]);
    expect(found(cnRoom(`${bed(900)}\n  furniture bed at (1500,100) size 900x2000`), CN)).toEqual([dbl]);
  });

  it("the label says nothing: a 'Double Bedroom' with a single bed is a single", () => {
    expect(found(cnRoom(bed(900), "Double Bedroom"), CN)).toEqual([]);
  });

  it("a bedroom with no bed is held to the single figure and files `no-bed`", () => {
    expect(found(cnRoom(""), CN)).toEqual([]);
    expect(skipsOf(cnRoom(""), CN)).toContain("no-bed");
    expect(skipsOf(cnRoom(bed(900)), CN)).not.toContain("no-bed");
    // A bunk or a cot is not read as a bed.
    expect(skipsOf(cnRoom("furniture bunk_bed at (100,100) size 1000x2000"), CN)).toContain("no-bed");
    // us asks nothing of a double, so it reads no beds.
    expect(skipsOf(cnRoom(""), US)).not.toContain("no-bed");
  });

  it("a double hint names the bed, not the label", () => {
    const d = lint(cnRoom(bed(1500)), { profile: CN }).find((x) => x.code === "W_ROOM_TOO_SMALL")!;
    expect(d.hints!.at(-1)).toContain("`bed` wider than 1200 mm");
  });
});

describe("areas are net floor under every residential profile (ADR 0027)", () => {
  // Drawn 3000 × 3100 = 9.3 m² on the centrelines of a 100 mm shell: 2900 × 3000 = 8.7 m² net.
  const walled = `plan "P" {
  units mm
  wall id=shell exterior thickness 100 { (0,0) (3000,0) (3000,3100) (0,3100) close }
  room id=r at (0,0) size 3000x3100 label "Bedroom" uses bedroom
  furniture bed at (300,300) size 1500x2000
}`;
  it("a double drawn at 9.3 m² with 8.7 m² of net floor warns under cn, and its net area is describe's", () => {
    expect(found(walled, CN)).toEqual([
      'W_ROOM_TOO_SMALL Room "Bedroom" is only 8.7 m² of net floor (under 9 m², the floor for a double bedroom).',
    ]);
    expect(found(walled)).toEqual([]);
    expect(describePlan(walled).rooms[0]!.net_area_m2).toBe(8.7);
  });
});

describe("cn-residential-advisory (GB 50096-2011)", () => {
  it("5.2.1: a single bedroom 5 m², a double 9 m²", () => {
    expect(found(room(2500, 2000, "bedroom", bed(900)), CN)).toEqual([]);
    expect(found(room(2500, 1980, "bedroom", bed(900)), CN)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 4.95 m² of net floor (under 5 m², the floor for a bedroom).',
    ]);
    expect(found(room(3000, 3000, "bedroom", bed(1500)), CN)).toEqual([]);
    expect(found(room(3000, 2990, "bedroom", bed(1500)), CN)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 8.97 m² of net floor (under 9 m², the floor for a double bedroom).',
    ]);
  });

  it("5.2.2: a living room 10 m²; 5.3.1: a kitchen 4 m²", () => {
    expect(found(room(4000, 2500, "living"), CN)).toEqual([]);
    expect(found(room(4000, 2490, "living"), CN)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 9.96 m² of net floor (under 10 m², the floor for a living room).',
    ]);
    expect(found(room(2000, 2000, "kitchen"), CN)).toEqual([]);
    expect(found(room(2000, 1990, "kitchen"), CN)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 3.98 m² of net floor (under 4 m², the floor for a kitchen).',
    ]);
  });
});

/**
 * A hall `w` wide (centreline) beside a room of use `to`, in a 200 mm shell with a 100 mm
 * partition between them: the hall's clear width is `w − 100 − 50`. The front door opens into
 * the hall (`front: "hall"`) or into the other room.
 */
const hallPlan = (w: number, to: string, front: "hall" | "room" = "room", hallUses = "hall"): string => `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  wall id=p1 partition thickness 100 { (${w},0) (${w},4000) }
  room id=h at (0,0) size ${w}x4000 label "Hall" uses ${hallUses}
  room id=o at (${w},0) size ${5000 - w}x4000 label "Other" uses ${to}
  door id=d1 on p1 at 2000 width 800
  door id=d0 on shell at ${front === "hall" ? 16000 : 3000} width 900 swing in
}`;

describe("cn-residential-advisory: passages by destination (GB 50096-2011 5.7.1)", () => {
  it("measures the passage clear between wall faces", () => {
    // 1150 drawn, 1000 clear: exactly the bedroom passage's minimum.
    expect(found(hallPlan(1150, "bedroom"), CN)).toEqual([]);
    expect(found(hallPlan(1140, "bedroom"), CN)).toEqual([
      'W_ROOM_TOO_NARROW Room "Hall" is 990 mm wide between its wall faces, under the 1000 mm the profile asks of a passage that leads to "Other" — 10 mm short.',
    ]);
  });

  it("a passage to a living room asks 1000 mm; to a kitchen, bath, WC or store 900 mm", () => {
    expect(found(hallPlan(1140, "living"), CN)).toHaveLength(1);
    for (const to of ["kitchen", "bath", "wc", "storage"]) {
      expect(found(hallPlan(1050, to), CN), to).toEqual([]);
      expect(found(hallPlan(1040, to), CN), to).toHaveLength(1);
    }
    // A passage to an office is asked nothing.
    expect(found(hallPlan(600, "office"), CN)).toEqual([]);
  });

  it("the entry passage (a door from outside, or `uses entry`) asks 1200 mm (宜)", () => {
    expect(found(hallPlan(1350, "storage", "hall"), CN)).toEqual([]);
    expect(found(hallPlan(1340, "storage", "hall"), CN)).toEqual([
      'W_ROOM_TOO_NARROW Room "Hall" is 1190 mm wide between its wall faces, under the 1200 mm the profile asks of an entry passage — 10 mm short.',
    ]);
    expect(found(hallPlan(1340, "storage", "room", "entry"), CN)).toHaveLength(1);
  });

  it("is not the walk: a door narrower than the passage is no finding here", () => {
    // The 800 mm door is under 1000; the passage is not.
    expect(found(hallPlan(1200, "bedroom"), CN)).toEqual([]);
  });
});

describe("uk-residential-advisory (NDSS 10(c)–(e); AD M4(2))", () => {
  it("10(c): every bedroom 7.5 m² and 2150 mm wide", () => {
    expect(found(room(2150, 3500, "bedroom", bed(900)), UK)).toEqual([]);
    expect(found(room(2140, 3600, "bedroom", bed(900)), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Room" is 2140 mm wide between its wall faces, under the 2150 mm the profile asks of a bedroom — 10 mm short.',
    ]);
    expect(found(room(2500, 2990, "bedroom", bed(900)), UK)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 7.48 m² of net floor (under 7.5 m², the floor for a bedroom).',
    ]);
  });

  it("10(d): a double 11.5 m²; 10(e): one double 2750 mm wide, every other 2550 mm", () => {
    expect(found(room(2750, 4200, "bedroom", bed(1500)), UK)).toEqual([]);
    expect(found(room(2740, 4200, "bedroom", bed(1500)), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Room" is 2740 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 10 mm short.',
    ]);
    const two = (a: number, b: number) => `plan "P" {
  units mm
  room id=a at (0,0) size ${a}x5000 label "Bed A" uses bedroom
  room id=b at (${a},0) size ${b}x5000 label "Bed B" uses bedroom
  furniture bed at (100,100) size 1500x2000
  furniture bed at (${a + 100},100) size 1500x2000
}`;
    // One double at 2750, the other at 2550: both fine.
    expect(found(two(2750, 2550), UK)).toEqual([]);
    expect(found(two(2750, 2540), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Bed B" is 2540 mm wide between its wall faces, under the 2550 mm the profile asks of a double bedroom — 10 mm short.',
    ]);
    // Neither reaches 2750: the widest (the first on a tie) is held to it.
    expect(found(two(2600, 2700), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Bed B" is 2700 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 50 mm short.',
    ]);
    expect(found(two(2700, 2700), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Bed A" is 2700 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 50 mm short.',
    ]);
  });

  it("10(d) at the lattice: 11.5 m² passes, 11.49 m² warns", () => {
    expect(found(room(2875, 4000, "bedroom", bed(1500)), UK)).toEqual([]);
    expect(found(room(2873, 4000, "bedroom", bed(1500)), UK)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 11.49 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    ]);
  });

  it("AD M4(2): a hall 900 mm clear", () => {
    expect(found(hallPlan(1050, "storage"), UK)).toEqual([]);
    expect(found(hallPlan(1040, "storage"), UK)).toEqual([
      'W_ROOM_TOO_NARROW Room "Hall" is 890 mm wide between its wall faces, under the 900 mm the profile asks of a hall — 10 mm short.',
    ]);
  });

  it("a polygon bedroom is not measured (`non-rectangular-room`); a multi-storey plan files `no-dwelling`", () => {
    const poly = `plan "P" {
  units mm
  room id=r polygon (0,0) (3000,0) (3000,2000) (2000,2000) (2000,4000) (0,4000) label "Bedroom" uses bedroom
  furniture bed at (100,100) size 1500x2000
}`;
    expect(found(poly, UK).filter((f) => f.startsWith("W_ROOM_TOO_NARROW"))).toEqual([]);
    expect(skipsOf(poly, UK)).toContain("non-rectangular-room");
    const storeys = `plan "P" {
  units mm
  level 1 "Ground" {
    room id=a at (0,0) size 2600x5000 label "Bed A" uses bedroom
    furniture bed at (100,100) size 1500x2000
  }
  level 2 "Upper" {
    room id=b at (0,0) size 2800x5000 label "Bed B" uses bedroom
    furniture bed at (100,100) size 1500x2000
  }
}`;
    expect(found(storeys, UK).filter((f) => f.includes("one double bedroom"))).toEqual([]);
    expect(skipsOf(storeys, UK)).toContain("no-dwelling");
  });
});

describe("us-residential-advisory (IRC R304, R311.6)", () => {
  it("R304.1: a habitable room 6.5 m²; the kitchen is excepted", () => {
    expect(found(room(2600, 2500, "living"), US)).toEqual([]);
    expect(found(room(2600, 2490, "dining"), US)).toEqual([
      'W_ROOM_TOO_SMALL Room "Room" is only 6.47 m² of net floor (under 6.5 m², the floor for a dining room).',
    ]);
    // A 2 m wide, 4.2 m² kitchen: over the default 4 m² floor, and asked no width.
    expect(found(room(2000, 2100, "kitchen"), US)).toEqual([]);
  });

  it("R304.2: a habitable room 2134 mm in any dimension; an office is not asked", () => {
    expect(found(room(2134, 4000, "bedroom"), US)).toEqual([]);
    expect(found(room(2133, 4000, "bedroom"), US)).toEqual([
      'W_ROOM_TOO_NARROW Room "Room" is 2133 mm wide between its wall faces, under the 2134 mm the profile asks of a bedroom — 1 mm short.',
    ]);
    expect(found(room(1800, 4000, "office"), US)).toEqual([]);
  });

  it("R311.6: a hallway 914 mm", () => {
    expect(found(hallPlan(1064, "bedroom"), US).filter((f) => f.includes("Hall"))).toEqual([]);
    expect(found(hallPlan(1063, "bedroom"), US).filter((f) => f.includes("Hall"))).toEqual([
      'W_ROOM_TOO_NARROW Room "Hall" is 913 mm wide between its wall faces, under the 914 mm the profile asks of a hall — 1 mm short.',
    ]);
  });
});

/**
 * Every warning each profile adds over default `lint()` across the shipped examples, judged one
 * by one in the PS5.2 PR (all true positives: each room is under the sourced figure as measured).
 * A move here is a finding: explain it, never re-pin to green.
 */
const EXAMPLE_ADDITIONS: Record<string, string[]> = {
  [CN]: [
    'examples/accessible.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.93 m² of net floor (under 9 m², the floor for a double bedroom).',
    'examples/furnished-flat.arch W_ROOM_TOO_NARROW Room "Hall" is 1100 mm wide between its wall faces, under the 1200 mm the profile asks of an entry passage — 100 mm short.',
    'examples/garden-loft.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.08 m² of net floor (under 9 m², the floor for a double bedroom).',
    'examples/relational.arch W_ROOM_TOO_NARROW Room "Hall" is 1100 mm wide between its wall faces, under the 1200 mm the profile asks of an entry passage — 100 mm short.',
    'examples/studio.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.12 m² of net floor (under 9 m², the floor for a double bedroom).',
  ],
  [UK]: [
    'examples/accessible.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.93 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/accessible.arch W_ROOM_TOO_NARROW Room "Bedroom" is 2350 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 400 mm short.',
    'examples/attached.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 10.83 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/furnished-flat.arch W_ROOM_TOO_SMALL Room "Bedroom 2" is only 10.4 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/garden-loft.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.08 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/garden-loft.arch W_ROOM_TOO_NARROW Room "Bedroom" is 2650 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 100 mm short.',
    'examples/hillside-villa.arch W_ROOM_TOO_SMALL Room "Bedroom 2" is only 9.12 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/hillside-villa.arch W_ROOM_TOO_NARROW Room "Bedroom 2" is 2400 mm wide between its wall faces, under the 2550 mm the profile asks of a double bedroom — 150 mm short.',
    'examples/hillside-villa.arch W_ROOM_TOO_SMALL Room "Bedroom 3" is only 9.12 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/hillside-villa.arch W_ROOM_TOO_NARROW Room "Bedroom 3" is 2400 mm wide between its wall faces, under the 2550 mm the profile asks of a double bedroom — 150 mm short.',
    'examples/relational.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 10.43 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/relational.arch W_ROOM_TOO_NARROW Room "Bedroom" is 2150 mm wide between its wall faces, under the 2750 mm the profile asks of one double bedroom of every home (none here is that wide) — 600 mm short.',
    'examples/studio.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 8.12 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/themed.arch W_ROOM_TOO_SMALL Room "Bedroom" is only 10.59 m² of net floor (under 11.5 m², the floor for a double bedroom).',
    'examples/two-bed.arch W_ROOM_TOO_SMALL Room "Bedroom 2" is only 9.52 m² of net floor (under 11.5 m², the floor for a double bedroom).',
  ],
  [US]: [],
};

describe("over the shipped examples", () => {
  const same = (
    a: { code?: string; file?: string; level?: number; span?: { start: number; end: number } },
    b: typeof a,
  ) =>
    a.code === b.code &&
    a.file === b.file &&
    a.level === b.level &&
    a.span?.start === b.span?.start &&
    a.span?.end === b.span?.end;

  for (const profile of RESIDENTIAL) {
    it(`${profile} adds exactly the judged warnings, and changes nothing else`, () => {
      const added: string[] = [];
      for (const s of EXAMPLE_SOURCES) {
        const base = lint(s.src, { world: TASTE_WORLD });
        const mine = lint(s.src, { world: TASTE_WORLD, profile });
        const extra = mine.filter((d) => !base.some((b) => same(b, d)));
        for (const d of extra) added.push(`${s.name} ${d.code} ${d.message}`);
        // Everything else is default lint(), byte for byte and in order.
        expect(JSON.stringify(mine.filter((d) => !extra.includes(d))), s.name).toBe(JSON.stringify(base));
      }
      expect(added).toEqual(EXAMPLE_ADDITIONS[profile]);
    });
  }
});

describe("taste under a residential-advisory profile", () => {
  it("lists the profile's own warnings under `advisory` and never caps on them (design §6 Q2)", () => {
    const loft = EXAMPLE_SOURCES.find((s) => s.name === "examples/garden-loft.arch")!;
    const t = taste(loft.src, { world: TASTE_WORLD, profile: CN });
    expect(t.validity.pass).toBe(true);
    expect(t.capped).toBe(false);
    expect(t.advisory).toEqual([{ code: "W_ROOM_TOO_SMALL", warnings: 1 }]);
    expect(taste(loft.src, { world: TASTE_WORLD }).advisory).toEqual([]);
  });

  it("R7 reads the profile's target and cites its source: cn 1/7 (GB 50096-2011 7.1.5 [V])", () => {
    const one = EXAMPLE_SOURCES.find((s) => s.name === "examples/one-room.arch")!;
    const r7 = (p?: string) =>
      taste(one.src, { world: TASTE_WORLD, ...(p ? { profile: p } : {}) }).criteria.find((c) => c.id === "R7")!;
    expect(r7(CN).source).toContain("GB 50096-2011 7.1.5");
    expect(r7(CN).verified).toBe("V");
    expect(r7(CN).message).toContain("14.29 %");
    expect(r7(CN).score!).toBeLessThan(r7().score!);
    expect(r7(US)).toEqual(r7());
    expect(r7(UK)).toEqual(r7());
  });
});
