/**
 * `W_ACCESSIBLE_WC_SIDE_WALL` (plan-soundness PS2.74, `src/lint/rules/clearances.ts`): a WC in a
 * room whose label says accessible, with its centreline farther than `wcAccessibleSideWallMaxMm`
 * (500 mm, Approved Document M4(2) Diagram 2.5 / M4(3) Diagrams 3.11, 3.16; ADA 604.2) from the
 * face of every side wall.
 *
 * The four positions PR #305's review moved by hand are rebuilt here from the shipped examples by
 * swapping the fixed line back for the pre-fix one (`git log -p examples/`); the corpus pair lives
 * in `test/defect-corpus/clearances/accessible-wc-pan-far*.arch`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";

const CODE = "W_ACCESSIBLE_WC_SIDE_WALL";

const of = (src: string, opts: Parameters<typeof lint>[1] = {}) => lint(src, opts).filter((d) => d.code === CODE);

/**
 * A 3000 × 2500 room inside a 200 mm shell (inner faces x 100 and 2900, y 100 and 2400), a door on
 * the south wall well away from the pan, and the given extra statements.
 */
const room = (label: string, extra: string): string => `plan "WC" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,2500) (0,2500) close }
  room id=r_wc at (0,0) size 3000x2500 label "${label}" uses wc
  door id=d_in at (2400,2500) width 1000 wall shell swing into r_wc
  ${extra}
}`;

/** A 400 × 700 pan backed onto the north face whose centreline is `c` mm from the west face. */
const wcAt = (c: number): string => `furniture wc at (${100 + c - 200},100) size 400x700`;

/** An example with one line swapped back to what it was before PR #305 (fc3f9d7). */
function prefix(name: string, fixed: string, was: string): string {
  const src = readFileSync(`examples/${name}.arch`, "utf8");
  expect(src.split(fixed).length, `${name}: the fixed line is in the example once`).toBe(2);
  return src.replace(fixed, was);
}

/**
 * The four pre-fix positions. classroom-block, clinic and transit-hall are `git log -p`'s removed
 * lines. The library's accessible WC was added by PR #305 and only its fixed position was
 * committed, so its pre-fix position is reconstructed: the pan at offset 2500, mid-way along the
 * room's 5000 mm span (2350 mm from the 300 mm shell's face, 2400 from the 200 mm partition's).
 */
const PRE_FIX: readonly { name: string; fixed: string; was: string; at: number }[] = [
  {
    name: "classroom-block",
    fixed: "furniture wc against wall shell segment 2 offset 3550 in r_wca",
    was: "furniture wc against wall shell segment 2 offset 4250 in r_wca",
    at: 1175,
  },
  {
    name: "clinic",
    fixed: "furniture id=f_wc_pan   wc    against wall w_ea_d offset 3950 in r_wc",
    was: "furniture id=f_wc_pan   wc    against wall w_ea_d offset 3500 in r_wc",
    at: 900,
  },
  {
    name: "transit-hall",
    fixed: "furniture wc    against wall w_wca_s offset 9300 in r_wc_a",
    was: "furniture wc    against wall w_wca_s offset 1500 in r_wc_a",
    at: 1400,
  },
  {
    name: "library",
    fixed: "furniture wc    against wall shell segment 2 offset 650 in r_wc_a",
    was: "furniture wc    against wall shell segment 2 offset 2500 in r_wc_a",
    at: 2350,
  },
];

describe("W_ACCESSIBLE_WC_SIDE_WALL: the four positions PR #305 moved by hand", () => {
  for (const c of PRE_FIX) {
    it(`${c.name}: the pre-fix pan warns once, ${c.at} mm from the nearer side wall`, () => {
      const ds = of(prefix(c.name, c.fixed, c.was));
      expect(ds).toHaveLength(1);
      expect(ds[0]!.message).toContain(`has its centreline ${c.at} mm from the nearer side wall`);
      expect(ds[0]!.message).toContain("needs one within 500 mm");
    });

    it(`${c.name}: the shipped (fixed) example is silent`, () => {
      expect(of(readFileSync(`examples/${c.name}.arch`, "utf8"))).toEqual([]);
    });
  }
});

describe("W_ACCESSIBLE_WC_SIDE_WALL: the band", () => {
  it("500 mm from the face is inside the band; 501 warns, 1 mm too far", () => {
    expect(of(room("Accessible WC", wcAt(500)))).toEqual([]);
    const [d] = of(room("Accessible WC", wcAt(501)));
    expect(d?.message).toBe(
      "The WC in Accessible WC has its centreline 501 mm from the nearer side wall; an accessible WC needs one within 500 mm, for a grab rail and a side transfer (1 mm too far).",
    );
  });

  it("the nearer side wall decides: a pan 450 mm from the east face is clear", () => {
    expect(of(room("Accessible WC", wcAt(2800 - 450)))).toEqual([]);
  });

  it("the hint names the wall and gives the slide into the 400–500 mm band", () => {
    const [d] = of(room("Accessible WC", wcAt(1400)));
    expect(d?.hints).toEqual([
      '"wc_1"\'s centreline is 1400 mm from wall "shell" (the ruleset\'s `wcAccessibleSideWallMaxMm` is 500 mm, centreline to a side wall\'s face): slide it 900–1000 mm along its back wall toward wall "shell".',
    ]);
  });

  it("a fixture beside the pan is not a side wall", () => {
    // The basin stands 300 mm east of the pan's side; the nearer WALL is still 1400 mm away.
    const [d] = of(room("Accessible WC", `${wcAt(1400)}\n  furniture basin at (1800,100) size 500x400`));
    expect(d?.message).toContain("1400 mm from the nearer side wall");
  });

  it("`wcAccessibleSideWallMaxMm: null` turns it off; every profile keeps 500", () => {
    expect(of(room("Accessible WC", wcAt(1400)), { ruleset: { wcAccessibleSideWallMaxMm: null } })).toEqual([]);
    for (const profile of ["accessibility-advisory", "uk-residential-advisory", "us-residential-advisory"]) {
      expect(of(room("Accessible WC", wcAt(500)), { profile })).toEqual([]);
      expect(of(room("Accessible WC", wcAt(501)), { profile })).toHaveLength(1);
    }
  });
});

describe("W_ACCESSIBLE_WC_SIDE_WALL: which rooms are read", () => {
  it("a room labelled accessible, wheelchair or disabled is read, in any case", () => {
    for (const label of ["Accessible WC", "WHEELCHAIR TOILET", "Disabled WC", "accessible toilet"])
      expect(of(room(label, wcAt(1400))), label).toHaveLength(1);
  });

  it("a WC in any other room is not: a general WC may stand clear of both walls", () => {
    for (const label of ["WC", "Staff WC", "Bathroom", "Inaccessible store"])
      expect(of(room(label, wcAt(1400))), label).toEqual([]);
  });

  it("the message names the room by its label and never quotes an element id", () => {
    const [d] = of(room("Accessible WC", wcAt(1400)));
    expect(d?.message).not.toMatch(/wc_1|r_wc|shell|"/);
  });
});

describe("W_ACCESSIBLE_WC_SIDE_WALL over the shipped examples", () => {
  /**
   * Examples whose accessible WC the rule finds outside the band that PR #305's review did not
   * move. Each is a real defect by the cited source, pending the owner's decision (see the PR):
   * fixing the example moves its pinned SVG/describe()/lint() digests.
   */
  const OPEN: Readonly<Record<string, number>> = {
    // The pan's centreline is 650 mm from the lobby wall's centreline, 550 from its face.
    museum: 550,
    // The pan stands mid-way along a 2500 mm room's back wall.
    "practice-office": 1200,
  };

  it("every other example is silent", () => {
    const loud: Record<string, number> = {};
    for (const file of readdirSync("examples")
      .filter((f) => f.endsWith(".arch"))
      .sort()) {
      const ds = of(readFileSync(`examples/${file}`, "utf8"));
      if (ds.length === 0) continue;
      expect(ds, file).toHaveLength(1);
      loud[file.replace(/\.arch$/, "")] = Number(/centreline (\d+) mm/.exec(ds[0]!.message)?.[1]);
    }
    expect(loud).toEqual(OPEN);
  });
});
