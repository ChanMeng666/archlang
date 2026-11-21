/**
 * Product roadmap RM9.6, coverage class CV08 (plan-soundness PS2.32): `W_SEAT_FACING_WALL`, a sofa,
 * L-sofa, loveseat or armchair whose drawn front is against a wall face, with no floor between.
 *
 * Each finding is shown beside the same plan with its cause removed (the seat turned, or moved off
 * the wall by one millimetre), so a test cannot pass because the rule never ran.
 */
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, ERROR_CATALOG, lint, makeVirtualWorld, repair } from "../src/index.js";
import { sofaLRunDepth } from "../src/elements/glyphs-living.js";
import { lintWork } from "../src/lint.js";
import { D4_ELEMENTS, EXAMPLE_FILES, EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

const CODE = "W_SEAT_FACING_WALL";
const of = (src: string, world?: ReturnType<typeof makeVirtualWorld>): Diagnostic[] =>
  lint(src, world ? { world } : {}).filter((d) => d.code === CODE);
// `grid 1`: a face is measured to the millimetre, and the 50 mm grid would snap a 1 mm gap shut.
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 1\n${lines.join("\n")}\n}\n`;
/** A 6000 x 5000 living room in a 200 mm shell (inner faces x 100…5900, y 100…4900). */
const SHELL = [
  "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }",
  "  door id=d at (3000,5000) width 900 wall shell",
  '  room id=r at (0,0) size 6000x5000 label "Living" uses living',
].join("\n");
/** A loveseat whose front (rotate 0: south) is on the south shell's face, y = 4900. */
const FRONT_ON_SOUTH = '  furniture loveseat at (1000,4050) size 1500x850 label "Loveseat" in r';

suite("W_SEAT_FACING_WALL", () => {
  it("reports a seat whose front is on a wall face, at the seat, with ids only in the hint", () => {
    const src = plan(SHELL, FRONT_ON_SOUTH);
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      "A Loveseat in Living has its front against a wall, with no floor in front of it to sit down from.",
    );
    expect(d!.hints).toEqual([
      "Turn the Loveseat to `rotate 180` so its back is on that wall and it faces the room, or move it off the wall.",
    ]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe(FRONT_ON_SOUTH.trim());
    // An authored id is quoted in the hint, never in the message; an auto id never.
    const named = of(plan(SHELL, FRONT_ON_SOUTH.replace("furniture loveseat", "furniture id=ls loveseat")))[0]!;
    expect(named.hints![0]).toMatch(/^Turn "ls" to `rotate 180`/);
    expect(named.message).not.toContain("ls");
    expect(d!.hints!.join(" ")).not.toMatch(/loveseat_\d|furniture_\d/);
    // Its twin, turned half a turn so its back is on that wall, is silent.
    expect(of(plan(SHELL, FRONT_ON_SOUTH.replace("in r", "rotate 180 in r")))).toEqual([]);
  });

  it("reads every lounge seat family and its aliases, and no other seat", () => {
    for (const word of ["sofa", "couch", "loveseat", "sofa_2", "armchair"])
      expect(of(plan(SHELL, `  furniture ${word} at (1000,4050) size 1500x850 in r`)), word).toHaveLength(1);
    for (const word of ["chair", "bench", "chaise", "bean_bag", "ottoman", "bed"])
      expect(of(plan(SHELL, `  furniture ${word} at (1000,4050) size 1500x850 in r`)), word).toEqual([]);
  });

  it("reads the front off the drawn turn on all four walls, never off which side is nearer a wall", () => {
    // [placement whose front is on a face, the turn that puts the back there instead]
    const cases: [string, number, number][] = [
      ["at (1000,4050) size 2000x850", 0, 180], // front south on y = 4900
      ["at (1000,100) size 2000x850", 180, 0], // front north on y = 100
      ["at (100,1000) size 850x2000", 90, 270], // front west on x = 100
      ["at (5050,1000) size 850x2000", 270, 90], // front east on x = 5900
    ];
    for (const [where, front, back] of cases) {
      const turned = (deg: number) => plan(SHELL, `  furniture sofa ${where}${deg ? ` rotate ${deg}` : ""} in r`);
      const [d] = of(turned(front));
      expect(d, `rotate ${front}`).toBeDefined();
      expect(d!.hints![0]).toContain(`\`rotate ${back}\``);
      expect(of(turned(back)), `rotate ${back}`).toEqual([]);
      // A side or end on the wall is not the front.
      for (const side of [(front + 90) % 360, (front + 270) % 360])
        expect(of(turned(side)), `rotate ${side}`).toEqual([]);
    }
  });

  it("has no tolerance: one millimetre of floor clears it, and a front inside the wall still reports", () => {
    expect(of(plan(SHELL, "  furniture sofa at (1000,4049) size 2000x850 in r"))).toEqual([]);
    // `anchor bottom` without `flush` puts the piece on the room edge, the wall centreline: half
    // a thickness inside the solid, its front still on the wall.
    expect(of(plan(SHELL, "  furniture sofa in r anchor bottom size 2000x850"))).toHaveLength(1);
    expect(of(plan(SHELL, "  furniture sofa in r anchor bottom flush size 2000x850"))).toHaveLength(1);
    expect(of(plan(SHELL, "  furniture sofa in r anchor bottom flush inset 1 size 2000x850"))).toEqual([]);
    // A piece placed `against` a wall is backed onto it, never fronted.
    expect(of(plan(SHELL, "  furniture sofa against wall shell segment 2 offset 3000 size 2000x850 in r"))).toEqual([]);
  });

  it("needs a wall solid over half the front or more, and never reads a curved wall", () => {
    // A 100 mm partition whose north face is y = 2000, under a sofa whose front is y = 2000.
    const partition = (x0: number, x1: number): string =>
      `  wall id=p partition thickness 100 { (${x0},2050) (${x1},2050) }`;
    const sofa = "  furniture sofa at (1000,1150) size 2000x850 in r";
    expect(of(plan(SHELL, partition(1000, 2000), sofa))).toHaveLength(1); // exactly half
    expect(of(plan(SHELL, partition(1000, 1950), sofa))).toEqual([]); // just under half
    expect(of(plan(SHELL, partition(500, 3500), sofa))).toHaveLength(1);
    // Two collinear runs, merged.
    expect(
      of(plan(SHELL, partition(900, 1500), "  wall id=q partition thickness 100 { (1500,2050) (2100,2050) }", sofa)),
    ).toHaveLength(1);
    // The same run as an arc whose chord is that line is not read.
    expect(
      of(plan(SHELL, "  wall id=p partition thickness 100 { (500,2050) arc (3500,2050) radius 1600 }", sofa)),
    ).toEqual([]);
  });

  it("reads an L-sofa's two fronts on the inner edges of its L, never its box", () => {
    // Catalogued 2600x1600: each run is drawn sofaLRunDepth deep, its fronts that far in.
    // 0.56 x 1600 is 896.0000000000001 in floats: the rule absorbs that noise, never a gap.
    const d = sofaLRunDepth(2600, 1600);
    expect(d).toBeCloseTo(896, 9);
    // Its box's south edge on the south face: the open quadrant is floor, so no report.
    expect(of(plan(SHELL, "  furniture sofa_l at (1000,3300) size 2600x1600 in r"))).toEqual([]);
    expect(of(plan(SHELL, "  furniture sofa_l at (1000,3300) size 2600x1600 mirror in r"))).toEqual([]);
    // A partition whose north face is the run's front (y = 1000 + 896), under 1200 of the run's
    // 1704 mm (x 1896…3600).
    const run = "  wall id=p partition thickness 100 { (2400,1946) (3700,1946) }";
    expect(of(plan(SHELL, run, "  furniture sofa_l at (1000,1000) size 2600x1600 in r"))).toHaveLength(1);
    // Mirrored, the return is on the right and the run's front runs x 1000…2704: the same wall is
    // under 304 mm of it, less than half.
    expect(of(plan(SHELL, run, "  furniture sofa_l at (1000,1000) size 2600x1600 mirror in r"))).toEqual([]);
    // A partition whose west face is the return's front (x = 1000 + 896).
    const ret = "  wall id=p partition thickness 100 { (1946,1900) (1946,2700) }";
    expect(of(plan(SHELL, ret, "  furniture sofa_l at (1000,1000) size 2600x1600 in r"))).toHaveLength(1);
    expect(of(plan(SHELL, ret, "  furniture sofa_l at (1000,1000) size 2600x1600 mirror in r"))).toEqual([]);
    // Mirrored, the return's front faces west at x = 1000 + 2600 - 896 = 2704 (2703.9999999999995 in
    // floats): a partition whose east face is 2704 is on it, and one 1 mm further west is not.
    const mirroredRet = (x: number) => `  wall id=p partition thickness 100 { (${x},1900) (${x},2700) }`;
    const mirrored = "  furniture sofa_l at (1000,1000) size 2600x1600 mirror in r";
    expect(of(plan(SHELL, mirroredRet(2654), mirrored))).toHaveLength(1);
    expect(of(plan(SHELL, mirroredRet(2653), mirrored))).toEqual([]);
    // No turn is offered for an L.
    expect(of(plan(SHELL, run, "  furniture sofa_l at (1000,1000) size 2600x1600 in r"))[0]!.hints![0]).toBe(
      "Move the sofa_l so its front faces open floor (`rotate 0` puts its back to the north).",
    );
  });

  it("offers a quarter turn to a sofa drawn deeper than it is wide, never half a turn", () => {
    // 800 x 1800 at `rotate 0`: a row of seats stretched 1800 deep (examples/terrace-row before RM-D73's fix).
    const [d] = of(plan(SHELL, "  furniture sofa in r anchor bottom-left flush size 800x1800"));
    expect(d!.hints).toEqual([
      "Turn the sofa a quarter turn (`rotate 90` or `rotate 270`, whichever puts its back on a wall): it is drawn deeper than it is wide, so a long side is its back. Or move it off the wall.",
    ]);
    // `rotate 270` backs it on the west wall: silent.
    expect(of(plan(SHELL, "  furniture sofa in r anchor bottom-left flush size 800x1800 rotate 270"))).toEqual([]);
    // An armchair is about square either way, so it is offered half a turn.
    expect(of(plan(SHELL, "  furniture armchair at (1000,3900) size 850x1000 in r"))[0]!.hints![0]).toContain(
      "`rotate 180`",
    );
  });

  it("offers no turn for a seat whose turn `facing` states", () => {
    const src = plan(
      SHELL,
      '  furniture id=tv tv at (1200,5200) size 1100x200 label "TV"',
      "  furniture loveseat at (1000,4050) size 1500x850 facing tv in r",
    );
    const ds = of(src);
    // A TV outside the shell: `facing tv` turns the loveseat to rotate 0 (its front ray reaches the TV,
    // through the wall), which puts its front on the wall.
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toMatch(/^Move the loveseat so its front faces open floor/);
  });

  it("is invariant under the eight turns and mirrors of a plan it reports, and pulls its turn back into the frame", () => {
    for (const [src, want] of [
      [plan(SHELL, FRONT_ON_SOUTH), 1],
      [plan(SHELL, FRONT_ON_SOUTH.replace("in r", "rotate 180 in r")), 0],
    ] as const) {
      const world = makeVirtualWorld({ "w.arch": src });
      for (const g of D4_ELEMENTS) {
        const turn = `${g.rotate !== 0 ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`;
        const placed = `plan "p" {\n  units mm\n  grid 50\n  import "w.arch" as w\n  place w() as g at (0, 0)${turn}\n}\n`;
        const ds = of(placed, world);
        expect(ds, `${g.name} (${want})`).toHaveLength(want);
        // The turn is the component's own: half a turn of its `rotate 0`, whatever the frame.
        if (want === 1) expect(ds[0]!.hints![0], g.name).toContain("`rotate 180`");
      }
    }
  });

  it("holds an L-sofa's run, return and mirrored return under the eight turns and mirrors (a witness)", () => {
    // 2600 x 1250: D = min(0.56 x 1250, 0.35 x 2600) = 700, so every face below is on the 50 mm grid.
    const L = "  furniture sofa_l at (1000,1000) size 2600x1250";
    const cases: [string, string, string, string][] = [
      // [case, seat, a wall whose face is on that front, the same wall 50 mm off it]
      [
        "run",
        `${L} in r`,
        "  wall id=p partition thickness 100 { (1800,1750) (3700,1750) }",
        "  wall id=p partition thickness 100 { (1800,1800) (3700,1800) }",
      ],
      [
        "return",
        `${L} in r`,
        "  wall id=p partition thickness 100 { (1750,1750) (1750,2250) }",
        "  wall id=p partition thickness 100 { (1800,1750) (1800,2250) }",
      ],
      [
        "mirrored return",
        `${L} mirror in r`,
        "  wall id=p partition thickness 100 { (2850,1750) (2850,2250) }",
        "  wall id=p partition thickness 100 { (2800,1750) (2800,2250) }",
      ],
    ];
    for (const [name, seat, on, off] of cases)
      for (const [wall, want] of [
        [on, 1],
        [off, 0],
      ] as const) {
        const world = makeVirtualWorld({ "w.arch": plan(SHELL, wall, seat) });
        expect(of(plan(SHELL, wall, seat)), `${name} (${want})`).toHaveLength(want);
        for (const g of D4_ELEMENTS) {
          const turn = `${g.rotate !== 0 ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`;
          const placed = `plan "p" {\n  units mm\n  grid 50\n  import "w.arch" as w\n  place w() as g at (0, 0)${turn}\n}\n`;
          expect(of(placed, world), `${name}, ${g.name} (${want})`).toHaveLength(want);
        }
      }
  });

  it("reads a door or cased opening in the wall as floor, an `open between` boundary too, and a window as wall", () => {
    // The sofa's front runs x 1000…3000 on the south face; the shell's door (x 2550…3450) is under 450 of it.
    const sofa = "  furniture sofa at (1000,4050) size 2000x850 in r";
    expect(of(plan(SHELL, sofa))).toHaveLength(1);
    // With the door's 450: a 1600 opening (x 1200…2800) leaves 200 of the 2000 on a wall, under half: silent.
    // A 400 one (x 1800…2200) leaves 1150, and a 600 one (x 1700…2300) 950, just under half.
    expect(of(plan(SHELL, "  opening at (2000,5000) width 1600 wall shell", sofa))).toEqual([]);
    expect(of(plan(SHELL, "  opening at (2000,5000) width 400 wall shell", sofa))).toHaveLength(1);
    expect(of(plan(SHELL, "  opening at (2000,5000) width 600 wall shell", sofa))).toEqual([]);
    expect(of(plan(SHELL, "  door at (2000,5000) width 1600 wall shell", sofa))).toEqual([]);
    // A window's wall stands below its sill.
    expect(of(plan(SHELL, "  window at (2000,5000) width 1600 wall shell", sofa))).toHaveLength(1);
    const twoRooms = (clause: string, door: string) =>
      plan(
        '  room id=a at (0,0) size 6000x3000 label "Living" uses living',
        '  room id=b at (0,3000) size 6000x2000 label "Dining" uses dining',
        `  walls from rooms exterior 200 partition 100${clause}`,
        door,
        "  furniture sofa at (1000,2100) size 2000x850 in a",
      );
    expect(of(twoRooms("", "  door between a and b at 4500 from a.left width 900"))).toHaveLength(1);
    expect(of(twoRooms(" { open between a and b }", ""))).toEqual([]);
  });

  it("names a piece with an empty label by its category, and offers no `rotate` to a piece placed `against` a wall", () => {
    const [d] = of(plan(SHELL, '  furniture sofa at (1000,4050) size 2000x850 label "" in r'));
    expect(d!.message).toBe(
      "A sofa in Living has its front against a wall, with no floor in front of it to sit down from.",
    );
    expect(d!.hints![0]).toMatch(/^Turn the sofa to `rotate 180`/);
    // 1850 deep `against` the partition's north face: its front lands on the shell's north face. Its turn is
    // derived (`E_FURN_AGAINST` refuses a `rotate`), at root and in a placed component alike.
    const against = plan(
      SHELL,
      "  wall id=p partition thickness 100 { (0,2000) (6000,2000) }",
      "  furniture sofa against wall p segment 0 offset 3000 side right size 2000x1850 in r",
    );
    const world = makeVirtualWorld({ "w.arch": against });
    for (const src of [
      against,
      `plan "p" {\n  units mm\n  grid 50\n  import "w.arch" as w\n  place w() as g at (0, 0) rotate 90\n}\n`,
    ]) {
      const ds = of(src, world);
      expect(ds).toHaveLength(1);
      expect(ds[0]!.hints![0]).toMatch(/^Move the sofa so its front faces open floor/);
    }
  });

  it("tests each drawn front once against each wall segment of its storey (fronts x segments)", () => {
    for (const n of [5, 10, 20]) {
      const lines = [SHELL];
      for (let i = 0; i < n; i++) lines.push(`  furniture armchair at (${200 + i * 250},2000) size 200x200 in r`);
      lines.push("  furniture sofa_l at (1000,3000) size 2600x1600 in r");
      // The shell's 4 segments; n armchairs with one front each and one L-sofa with two.
      expect(lintWork(plan(...lines)).seatWallTests, `n = ${n}`).toBe((n + 2) * 4);
    }
    expect(lintWork(plan(SHELL)).seatWallTests).toBe(0);
    // A reported seat also scans the storey's rooms once for the room its message names: 4 + 1.
    expect(lintWork(plan(SHELL, FRONT_ON_SOUTH)).seatWallTests).toBe(5);
  });

  it("reports nothing over the shipped examples under the default ruleset (RM-D73: their sofas were turned first)", () => {
    const hits = Object.entries(EXAMPLE_FILES).flatMap(([name, src]) =>
      lint(src, { world: EXAMPLES_WORLD })
        .filter((d) => d.code === CODE)
        .map(() => name),
    );
    expect(Object.keys(EXAMPLE_FILES).length).toBeGreaterThan(40);
    expect(hits).toEqual([]);
  });

  it("has a catalogue entry whose example reports it and whose fixed form does not", () => {
    const e = ERROR_CATALOG[CODE]!;
    expect(e.severity).toBe("warning");
    expect(of(plan(e.example!))).toHaveLength(1);
    expect(of(plan(e.fixed!))).toEqual([]);
  });
});

suite("repair never manufactures W_SEAT_FACING_WALL (ruling RM-D80)", () => {
  const ROOM = [
    "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }",
    "  door id=d at (5000,0) width 900 wall shell",
    "  window at (2000,0) width 1500 wall shell",
    '  room id=r at (0,0) size 6000x5000 label "Living" uses living',
  ].join("\n");
  const grid50 = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;

  it("turns a seat it pushed out of a wall half a turn when the push leaves its front on the face", () => {
    // Drawn through the south wall at rotate 0: the push lands it flush, its front on that face.
    const src = grid50(ROOM, "  furniture sofa at (1000,4300) size 2000x850 in r");
    const r = repair(src);
    expect(r.changes.map((c) => [c.kind, c.toRotate ?? null, c.reason])).toEqual([
      ["moved", null, 'pushed clear of wall "shell"'],
      ["rotated", 180, 'turned so its back is on wall "shell"'],
    ]);
    expect(r.source).toContain("furniture sofa at (1000, 4050) size 2000x850 rotate 180 in r");
    expect(lint(r.source)).toEqual([]);
    // A second repair changes nothing.
    const again = repair(r.source);
    expect(again.changes).toEqual([]);
    expect(again.source).toBe(r.source);
    // A seat already backed onto that wall is only pushed.
    const backed = repair(grid50(ROOM, "  furniture sofa at (1000,4300) size 2000x850 rotate 180 in r"));
    expect(backed.changes.map((c) => c.kind)).toEqual(["moved"]);
    expect(of(backed.source)).toEqual([]);
  });

  it("leaves a seat between two walls unturned, for the rule to report", () => {
    // A 1050-deep nook: after the push the front is on the south face, and half a turn would put it on the north one.
    const nook = grid50(
      "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,1050) (0,1050) close }",
      "  door id=d at (5000,0) width 900 wall shell",
      '  room id=r at (0,0) size 6000x1050 label "Nook" uses living',
      "  furniture sofa at (1000,200) size 2000x850 in r",
    );
    const r = repair(nook);
    expect(r.changes.map((c) => c.kind)).toEqual(["moved"]);
    expect(of(r.source)).toHaveLength(1);
  });
});
