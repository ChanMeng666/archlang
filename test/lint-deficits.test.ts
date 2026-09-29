import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFixes, lint } from "../src/index.js";

/**
 * Diagnostic prose for the four advisory placement rules that had the geometry in hand
 * and printed none of it: `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`,
 * `W_FURN_CLEARANCE` and `W_PATH_TOO_NARROW` (the last of which has its own suite in
 * `circulation-lint.test.ts`, so only the deficit shape is re-checked here).
 *
 * Each message must carry the **measured value, the measured shortfall, and a closed
 * remedy set** — and the one remedy that is a bounded, provable rewrite (a door's hinge
 * flip) must be carried as a real `FixSuggestion` that, applied, actually clears the
 * warning rather than relocating it.
 */

const one = (src: string, code: string) => {
  const d = lint(src).find((x) => x.code === code);
  expect(d, `expected ${code}`).toBeDefined();
  return d!;
};

/** The room the swing fixtures live in: 6 × 4 m, one door centred on the south wall. */
const swingPlan = (furn: string) => `plan "P" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room"
  door at (3000,4000) width 1000 wall exterior hinge left swing in
  ${furn}
}`;

describe("W_SWING_OBSTRUCTED states the measured deficit", () => {
  it("quotes the required radius, the distance available and the shortfall", () => {
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    // radius 1000 (the leaf) against the nearest point of the obstruction.
    expect(d.message).toMatch(/needs 1000 mm of clear radius but "X" is \d+ mm from the hinge \(\d+ mm short\)/);
  });

  it("measures a swing↔swing overlap as hinge separation against the two leaves", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=r at (0,0) size 4000x4000 label "Room"
        door id=side  at (0,3400) width 900 wall exterior hinge left swing in
        door id=front at (900,4000) width 900 wall exterior hinge left swing in
      }`,
      "W_SWING_OBSTRUCTED",
    );
    expect(d.message).toMatch(/door "front"'s swing overlaps it/);
    expect(d.message).toMatch(/hinges are \d+ mm apart where the two leaves need 1800 mm \(\d+ mm short\)/);
  });

  it("enumerates the remedies as hints, not as one vague sentence", () => {
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    expect(d.hints?.length).toBeGreaterThanOrEqual(4);
    expect(d.hints!.join("\n")).toMatch(/hinge right/);
    expect(d.hints!.join("\n")).toMatch(/swing out/);
    expect(d.hints!.join("\n")).toMatch(/arch repair/);
    expect(d.hints!.join("\n")).toMatch(/leafless `opening`/);
  });

  it("REFUSES the narrow-the-door remedy when it would breach the minimum width", () => {
    // The obstruction reaches to 300 mm of the hinge: narrowing to 300 mm would silence
    // this warning by creating W_DOOR_CLEARANCE. The hint must say so, not offer it.
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    const hints = d.hints!.join("\n");
    expect(hints).toMatch(/Narrowing the door is not a fix here/);
    expect(hints).toMatch(/under the 700 mm minimum passable width/);
    expect(hints).not.toMatch(/Narrow the door to/);
  });

  it("offers the narrow-to width when it stays at or above the minimum", () => {
    // The obstruction stands ~950 mm off the hinge, so a 700–949 mm leaf still clears.
    const d = one(swingPlan(`furniture box at (2600,2600) size 600x500 label "X"`), "W_SWING_OBSTRUCTED");
    expect(d.hints!.join("\n")).toMatch(/Narrow the door to \d+ mm or less, which still clears the 700 mm minimum/);
  });

  // Backlog 6.9. The leaf is hinged at (3500,4000) and opens up to (3500,3000); a box whose
  // bottom edge sits at y=3000 on that line touches the arc exactly (0 mm short). The quoted
  // width is never the door's own: narrowing keeps `at`, so a 999 mm leaf's hinge moves 0.5 mm
  // toward it and its disc stops 1 mm short of the box — proved by recomputing the swing.
  it("at a shortfall of 0 quotes a width under the door's own, and applying it clears the warning", () => {
    const src = swingPlan(`furniture box at (3300,2600) size 200x400 label "X"`);
    const d = one(src, "W_SWING_OBSTRUCTED");
    expect(d.message).toMatch(/"X" is 1000 mm from the hinge \(0 mm short\)/);
    expect(quoted(d)).toBe(999);
    expect(swingCodes(narrow(src, "door at", 999))).toEqual([]);
    // The other remedies stand.
    const hints = d.hints!.join("\n");
    expect(hints).toMatch(/hinge right/);
    expect(hints).toMatch(/swing out/);
    expect(hints).toMatch(/leafless `opening`/);
  });

  it("at a shortfall of 1 mm quotes 998, not 999 — the hinge moves when the leaf narrows", () => {
    const src = swingPlan(`furniture box at (3300,2600) size 200x401 label "X"`);
    const d = one(src, "W_SWING_OBSTRUCTED");
    expect(d.message).toMatch(/"X" is 999 mm from the hinge \(1 mm short\)/);
    expect(d.hints!.join("\n")).toMatch(/Narrow the door to 998 mm or less, which still clears the 700 mm minimum/);
    expect(swingCodes(narrow(src, "door at", 998))).toEqual([]);
    // What `reach − clearance` used to quote does NOT clear: its disc still touches the box.
    expect(swingCodes(narrow(src, "door at", 999))).toHaveLength(1);
  });

  it("the quoted width, applied, clears the warning — default rules and the a11y profile", () => {
    const a11y = { profile: "accessibility-advisory" } as const;
    const cases: Array<[string, typeof a11y | undefined]> = [
      [swingPlan(`furniture box at (2600,2600) size 600x500 label "X"`), undefined],
      [swingPlan(`furniture box at (3100,2750) size 400x300 label "X"`), a11y],
    ];
    for (const [src, opts] of cases) {
      const tag = opts ? "a11y" : "default";
      const d = lint(src, opts).find((x) => x.code === "W_SWING_OBSTRUCTED");
      expect(d, tag).toBeDefined();
      const w = quoted(d!);
      expect(w, tag).toBeLessThan(1000);
      expect(swingCodes(narrow(src, "door at", w), opts), `${tag} at ${w} mm`).toEqual([]);
    }
  });
});

/** The width the narrowing hint quotes (either phrasing), or fail. */
const quoted = (d: { hints?: string[] }): number => {
  const m = /(?:Narrow the door to|would have to drop to) (\d+) mm/.exec(d.hints!.join("\n"));
  expect(m, "a narrowing hint").not.toBeNull();
  return Number(m![1]);
};

/** `src` with `width 1000` replaced by `width <w>` on the door line starting with `lead`. */
const narrow = (src: string, lead: string, w: number): string => {
  const out = src
    .split("\n")
    .map((l) => (l.trimStart().startsWith(lead) ? l.replace("width 1000", `width ${w}`) : l))
    .join("\n");
  expect(out).not.toBe(src);
  return out;
};

const swingCodes = (src: string, opts?: { profile: string }) =>
  lint(src, opts).filter((x) => x.code === "W_SWING_OBSTRUCTED");

describe("W_SWING_OBSTRUCTED on a double door (backlog 6.8)", () => {
  /** Two leaves on the south wall meeting at x=3000, hinged on their outer jambs. */
  const pair = (width: number, eastAt: number) => `plan "P" {
    units mm
    wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=r at (0,0) size 6000x4000 label "Hall"
    door id=dw at (${3000 - width / 2},4000) width ${width} wall s hinge right swing in
    door id=de at (${eastAt},4000) width ${width} wall s hinge left  swing in
  }`;

  it("lints a shared-jamb pair clean — 2×900 and 2×1000", () => {
    for (const w of [900, 1000]) {
      expect(lint(pair(w, 3000 + w / 2)), `2×${w}`).toEqual([]);
    }
  });

  it("keeps the pair clean under a swing clearance — one assembly — but not a pair 1 mm apart", () => {
    const a11y = { profile: "accessibility-advisory" } as const;
    for (const w of [900, 1000]) expect(swingCodes(pair(w, 3000 + w / 2), a11y), `2×${w}`).toEqual([]);
    // Far jambs 1 mm apart: two independent doors, inside each other's 150 mm band.
    expect(swingCodes(pair(1000, 3501), a11y)).toHaveLength(1);
  });

  it("still warns when the leaves overlap by 1 mm, quoting the 1 mm", () => {
    const d = one(pair(1000, 3499), "W_SWING_OBSTRUCTED");
    expect(d.message).toBe(
      `Door swing is obstructed — door "de"'s swing overlaps it — the hinges are 1999 mm apart where the two leaves need 2000 mm (1 mm short).`,
    );
    // The quoted width is recomputed and proved: applied to "dw", the pair lints clean.
    const w = quoted(d);
    expect(w).toBeLessThan(1000);
    expect(swingCodes(narrow(pair(1000, 3499), "door id=dw", w))).toEqual([]);
  });

  it("under the a11y profile, a pair 1 mm apart gets a narrowing that clears the 150 mm band", () => {
    const a11y = { profile: "accessibility-advisory" } as const;
    const src = pair(1000, 3501);
    const d = lint(src, a11y).find((x) => x.code === "W_SWING_OBSTRUCTED");
    expect(d).toBeDefined();
    expect(swingCodes(narrow(src, "door id=dw", quoted(d!)), a11y)).toEqual([]);
  });

  it("states need, apart and shortfall so they agree even off whole millimetres", () => {
    // Leaves 999.6 mm wide, 1 mm overlapping: need 1999.2, apart 1998.6 (0.6 short). Rounded one
    // by one that read "1999 apart … need 1999 (1 mm short)"; need rounds UP, apart DOWN.
    const src = pair(1000, 3499).replaceAll("width 1000", "width 999.6");
    const d = one(src, "W_SWING_OBSTRUCTED");
    const m = /hinges are (\d+) mm apart where the two leaves need (\d+) mm \((\d+) mm short\)/.exec(d.message)!;
    expect(m).not.toBeNull();
    const [apart, need, short] = [Number(m[1]), Number(m[2]), Number(m[3])];
    expect(need - apart).toBe(short);
    expect(short).toBeGreaterThan(0);
  });
});

describe("W_SWING_OBSTRUCTED's hinge-flip fix", () => {
  /** The obstruction sits in the disc swept from the LEFT hinge only. */
  const flipClears = swingPlan(`furniture box at (3400,2900) size 600x500 label "X"`);
  /** The obstruction spans the opening: neither jamb clears it. */
  const flipDoesNot = swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`);

  it("is machine-applicable only when the flipped swing is proved clear", () => {
    const yes = one(flipClears, "W_SWING_OBSTRUCTED");
    expect(yes.fixes?.[0]?.applicability).toBe("machine-applicable");
    expect(yes.fixes?.[0]?.fixId).toBe("door-swing-obstructed");
    expect(one(flipDoesNot, "W_SWING_OBSTRUCTED").fixes).toBeUndefined();
  });

  it("applies to source that compiles and no longer trips the rule", () => {
    const fixes = lint(flipClears).flatMap((d) => d.fixes ?? []);
    const applied = applyFixes(flipClears, fixes);
    expect(applied.output).toContain("hinge right");
    const codes = lint(applied.output).map((x) => x.code);
    expect(codes).not.toContain("W_SWING_OBSTRUCTED");
    // …and it does not launder the problem into the door's own width rule.
    expect(codes).not.toContain("W_DOOR_CLEARANCE");
  });

  it("keeps the `hinge near` idiom when the author used it", () => {
    const src = flipClears.replace("hinge left", "hinge near start");
    const d = one(src, "W_SWING_OBSTRUCTED");
    expect(d.fixes?.[0]?.edits[0]?.newText).toContain("hinge near end");
  });
});

describe("W_DOORWAY_BLOCKED / W_FURN_CLEARANCE state the measured deficit", () => {
  it("quotes the landing depth required, the depth left and the shortfall", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=r at (0,0) size 4000x4000 label "R"
        door at (1000,4000) width 900 wall exterior hinge left swing in
        furniture wc at (700,3600) size 700x400
      }`,
      "W_DOORWAY_BLOCKED",
    );
    expect(d.message).toMatch(/approach needs 300 mm clear on each side but "wc" leaves \d+ mm \(\d+ mm short\)/);
    expect(d.hints?.length).toBe(3);
  });

  it("quotes the catalogued clearance, the depth left and the shortfall", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=k at (0,0) size 4000x4000 label "Kitchen" uses kitchen
        furniture stove at (200,100) size 600x600
        furniture sofa at (200,800) size 1500x900
      }`,
      "W_FURN_CLEARANCE",
    );
    // The stove's front faces south; the sofa's near edge is 100 mm off it.
    expect(d.message).toBe(
      'Fixture "stove" needs 550 mm of clear space in front but "sofa" leaves 100 mm (450 mm short).',
    );
    expect(d.hints?.length).toBe(4);
  });
});

describe("W_SWING_OBSTRUCTED's quoted width holds across the shipped examples", () => {
  // Derived from the corpus, not retyped: every narrowing width any example's warning quotes
  // (default rules and the a11y profile), written into that door's own statement, must leave
  // that door clear. This is what caught a width the resolver's `grid` snap would undo.
  const EXAMPLES = resolvePath("examples");
  const world = {
    read: (p: string) => {
      try {
        return readFileSync(resolvePath(EXAMPLES, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
  it("applied to its door, every quoted width clears that door's warning", () => {
    let applied = 0;
    for (const f of readdirSync(EXAMPLES).filter((x) => x.endsWith(".arch"))) {
      const src = readFileSync(join(EXAMPLES, f), "utf8");
      for (const profile of [undefined, "accessibility-advisory"]) {
        for (const d of lint(src, { world, profile }).filter((x) => x.code === "W_SWING_OBSTRUCTED")) {
          const m = /(?:Narrow the door to|would have to drop to) (\d+) mm/.exec(d.hints!.join("\n"));
          if (!m || d.file || !d.span) continue; // no quoted width, or the door is in an imported module
          const span = d.span;
          const stmt = src.slice(span.start, span.end);
          const next = stmt.replace(/width \d+(\.\d+)?/, `width ${m[1]}`);
          expect(next, `${f}: ${stmt}`).not.toBe(stmt);
          const out = src.slice(0, span.start) + next + src.slice(span.end);
          const still = lint(out, { world, profile }).filter(
            (x) => x.code === "W_SWING_OBSTRUCTED" && x.span?.start === span.start,
          );
          expect(still, `${f} (${profile ?? "default"}) at width ${m[1]}`).toEqual([]);
          applied++;
        }
      }
    }
    // Not vacuous: the a11y profile raises quoted widths on several shipped examples.
    expect(applied).toBeGreaterThanOrEqual(5);
  });
});
