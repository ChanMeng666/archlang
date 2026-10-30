/**
 * #367: a room label in a small room. `W_ANNOTATION_OVERLAP` also reads the walls, the doors'
 * swings and the room's own floor, and the label pass moves a label only to where it stands on
 * that floor.
 *
 * The two plans are the issue's, byte for byte in everything but the one clause each twin changes.
 * The drawing a test reads is the Scene the compiler draws, never a position worked out here.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { lintWithCoverage } from "../src/lint.js";
import { toScene } from "../src/scene-build.js";

const OVERLAP = "W_ANNOTATION_OVERLAP";
const of = (src: string) => lint(src).filter((d) => d.code === OVERLAP);

const issue = (name: string, door = "door between wc and abst", size = "1200x900") => `plan "labels in small rooms" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=flur at (0,0) size 3000x1400 label "Flur" uses hall
  room id=wc right-of flur size 1000x1400 label "WC" uses wc
  room id=abst below wc align left size ${size} label "${name}" uses storage
  walls from rooms exterior 200 partition 100
  door on flur.bottom at 800 from start width 900 swing into flur
  door between flur and wc at center width 800 swing into wc
  ${door} at center width 600${door.includes("sliding") ? "" : " swing into abst"}
}`;

/** The issue's clean twin: the store's door slides, and the store is deep enough for its label. */
const SLIDING = "door sliding between wc and abst";

/** One room on A4 at 1:50, plus `extra`. */
const room = (label: string, extra = "", size = "4000x3000") => `plan "r" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size ${size} ${label} uses bedroom
  walls from rooms exterior 100 partition 100
  ${extra}
}`;

/** Where the Scene drew the room's texts, name first. */
function drawn(src: string, id: string) {
  const { ir } = resolvePlan(src);
  return toScene(ir!, { annotate: true })
    .nodes.filter((n) => n.elementId === id && n.prim.t === "text")
    .map((n) => (n.prim.t === "text" ? n.prim : null)!);
}

suite("W_ANNOTATION_OVERLAP — a room label against the room it stands in", () => {
  it("reports the issue's store: the swing runs through the name, the wall under the area figure", () => {
    const [d, ...rest] = of(issue("Abstellraum"));
    expect(rest).toEqual([]);
    expect(d!.message).toBe(
      'The name "Abstellraum" and the area figure (1.1 m²) are printed over a wall and the swing of the door between "WC" and "Abstellraum", so the label and what is under it overprint each other on the drawing.',
    );
    expect(d!.hints?.[0]).toContain("room `abst`");
  });

  it("is silent on its clean twin", () => {
    expect(of(issue("Abstellraum", SLIDING, "1200x1300"))).toEqual([]);
  });

  it("reports the name the label pass used to walk out of the building, and its wide twin is clean", () => {
    expect(of(issue("Abstell- raum"))[0]!.message).toContain("are printed over a wall and the swing of");
    expect(of(issue("Abstell- raum", SLIDING, "1800x1300"))).toEqual([]);
  });

  it("says a name wider than its floor runs out of the room", () => {
    const [d] = of(room('label "Hauswirtschaftsraum"', "", "1200x2000"));
    expect(d!.message).toContain("is printed over a wall and runs out of the room");
  });

  it("says the same of an area figure with no wall to be printed over", () => {
    const src = `plan "bare" {
  units mm
  paper A4 landscape
  scale 1:50
  room at (0,0) size 300x900 uses storage
}`;
    expect(of(src).map((d) => d.message)).toEqual([
      expect.stringMatching(
        /^The area figure \(0\.3 m²\) of .* runs out of the room, so part of the label is drawn off its own floor\.$/,
      ),
    ]);
  });

  it("measures walls at the width drawn: the 0.62 estimate would bury this name in both", () => {
    // 11 × 175 × 0.62 = 1194 mm over a 1100 mm floor; 11 × 175 × 0.5 = 963 mm clears it.
    expect(of(room('label "Abstellraum"', "", "1200x2000"))).toEqual([]);
  });

  it("reads the poche with its holes: a label inside a ring of wall is not over it", () => {
    const ring = "wall id=inner partition thickness 100 { (3000,2000) (6000,2000) (6000,5000) (3000,5000) close }";
    const src = (w: string) => `plan "ring" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=outer exterior thickness 200 { (0,0) (9000,0) (9000,7000) (0,7000) close }
  ${ring}
  ${w}
  room id=r at (3000,2000) size 3000x3000 label "Court" at (4500,3500) uses hall
}`;
    expect(of(src(""))).toEqual([]);
    // The control on the same geometry: a wall that does cross the pinned name is reported.
    expect(of(src("wall id=mid partition thickness 100 { (4500,2000) (4500,5000) }")).map((d) => d.message)).toEqual([
      expect.stringContaining("printed over a wall"),
    ]);
  });

  it("does not report a wall a remodel demolishes: it draws no poche", () => {
    const src = (status: string) => `plan "d" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 4000x3000 label "Room" at (2000,1500) uses bedroom
  walls from rooms exterior 100 partition 100
  wall id=x partition thickness 100${status} { (2000,0) (2000,3000) }
}`;
    expect(of(src("")).map((d) => d.message)).toEqual([expect.stringContaining("a wall")]);
    expect(of(src(" status demolish"))).toEqual([]);
  });

  it("leaves a label pinned off its floor to W_ROOM_LABEL_OUTSIDE, whatever it landed on", () => {
    for (const at of ["(6000,1500)", "(4080,1500)"]) {
      const src = room(`label "Room" at ${at}`).replace("exterior 100", "exterior 200");
      expect(compile(src).diagnostics.map((d) => d.code)).toContain("W_ROOM_LABEL_OUTSIDE");
      expect(of(src)).toEqual([]);
    }
  });

  it('reads `label ""` as no name, as the drawing does', () => {
    const [d] = of(room('label ""', "", "300x900"));
    expect(d!.message).toMatch(/^The area figure \(0\.3 m²\) of /);
    expect(d!.message).not.toContain('""');
  });

  it('keeps `""` out of every message that names the room', () => {
    const two = (room1: string, extra: string, head = "") => `plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  ${head}
  ${room1}
  room id=z right-of r size 3000x3000 label "Next" uses storage
  walls from rooms exterior 100 partition 100
  ${extra}
}`;
    const swing = two(
      'room id=r at (0,0) size 2000x2000 label "" at (1650,1000) uses storage',
      "door id=d between r and z at center width 900 swing into r",
    );
    const dims = of(`plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  dims auto
  room id=r at (0,0) size 1200x900 label "" uses storage
  walls from rooms exterior 300 partition 100
  furniture id=t table at (600,450) size 300x300
}`);
    for (const d of [...of(swing), ...dims]) expect(d.message).not.toContain('""');
    expect(of(swing)[0]!.message).toContain('and "Next"');
    expect(dims.length).toBeGreaterThan(0);
  });

  it('tells a `label ""` pinned on a wall about its pin, not about naming the room', () => {
    const src = room('label "" at (3950,1500)');
    expect(of(src)[0]!.hints![0]).toContain('is pinned by `label "" at (x,y)`: move that point');
  });

  it("sees a label on a mitre's tip, past every wall band", () => {
    const src = `plan "p" {
  units mm
  paper A2 landscape
  scale 1:50
  room id=r at (-4000,-3000) size 10000x6000 label "Room" at (875,-35) uses bedroom
  wall id=o exterior thickness 100 { (-4000,-3000) (6000,-3000) (6000,3000) (-4000,3000) close }
  wall id=v partition thickness 400 { (-3000,-804) (0,0) (-3000,804) }
}`;
    expect(of(src).map((d) => d.message)).toEqual([expect.stringContaining("printed over a wall")]);
  });

  it("says what is true of the case: the name, the figure, a pin, an unnamed room", () => {
    const hint = (src: string) => of(src)[0]!.hints![0]!;
    // The name over the wall: shortening it helps, and nothing promises it wraps.
    const name = hint(room('label "Hauswirtschaftsraum"', "", "1200x2000"));
    expect(name).toContain("Shorten the name");
    expect(name).not.toContain("wrap");
    // Only the area figure on the wall: the name is not the trouble.
    const figure = hint(issue("Abstellraum"));
    expect(figure).toContain("Widen the room");
    expect(figure).not.toContain("Shorten");
    // Pinned, the name over the wall.
    expect(hint(room('label "Hauswirtschaftsraum" at (600,1000)', "", "1200x2000"))).toContain(
      "move that point to a clear part of the floor, shorten the name, or widen the room",
    );
    // An unnamed room over a wall: naming it is only an offer of a clear point.
    expect(hint(room("", "", "300x900"))).toBe(
      'Enlarge the room, or name it and give its label a clear point with `label "…" at (x,y)` if the floor has one.',
    );
  });

  it("reports a pinned label over a swing and says to move the point", () => {
    const [d] = of(room('label "Room" at (2300,500)', "door id=d on r.top at center width 900 swing into r"));
    expect(d!.hints?.[0]).toContain("pinned");
    expect(d!.hints?.[0]).toContain("the door (`d`)");
  });

  it("measures a double door leaf by leaf, and a sliding door sweeps nothing", () => {
    // Over the second leaf, hung at x 2800: the first, hung at x 1200, sweeps to x 2000 only.
    const at = 'label "Room" at (2350,300)';
    expect(of(room(at, "door id=d double on r.top at center width 1600 swing into r")).length).toBe(1);
    expect(of(room(at, "door id=d sliding on r.top at center width 1600"))).toEqual([]);
  });
});

suite("the label pass moves a label only onto its own floor", () => {
  it("keeps the issue's spaced name on its floor (it walked out through the wall to x 4080)", () => {
    const [name] = drawn(issue("Abstell- raum"), "abst");
    expect(name!.at.x).toBe(3600);
  });

  it("lets a name wider than its room slide along it, off a piece, no further off the floor", () => {
    const src = room('label "Hauswirtschaftsraum"', "furniture table at (600,3000) size 800x800", "1200x6000");
    const [name] = drawn(src, "r");
    // Bare, the name stands at the room's centre on the table; it moves down the room, across it not at all.
    expect(Math.abs(name!.at.x - 600)).toBeLessThanOrEqual(180);
    expect(name!.at.y).not.toBe(3000 - 175 * 0.2);
    const [d] = of(src);
    expect(d!.message).toContain("runs out of the room");
    expect(d!.message).not.toContain("table");
  });

  it("gives an outdoor surface's label the same room to slide", () => {
    const src = room(
      'label "Room"',
      'outdoor id=t patio at (0,3100) size 300x3900 label "Sonnenterrasse"\n  furniture table at (150,5050) size 250x600',
    );
    const { ir } = resolvePlan(src);
    const [name] = toScene(ir!, { annotate: true }).nodes.filter((n) => n.elementId === "t" && n.prim.t === "text");
    expect(name!.prim.t === "text" && name!.prim.at).toEqual({ x: 150, y: 4445 });
  });

  it("still moves a label off a swing when the floor has a clear place", () => {
    const src = room('label "Room"', "door id=d on r.top at center width 2200 swing into r", "4000x4000");
    const [name] = drawn(src, "r");
    expect(name!.at).not.toEqual({ x: 2000, y: 2000 - 175 * 0.2 });
    expect(of(src)).toEqual([]);
  });

  it("never costs a plan a symbol report: past the fabric count that test alone stands down", () => {
    // A storey whose every label touches a wall, its poche one loop round the whole building.
    const grid = (n: number) => {
      let s = 'plan "g" {\n  units mm\n  paper A0 landscape\n  scale 1:200\n';
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          s += `  room id=r${x}_${y} at (${x * 1500},${y * 1500}) size 1500x1500 label "Room"${x + y === 0 ? " at (750,750)" : ""} uses bedroom\n`;
      s += "  walls from rooms exterior 200 partition 100\n";
      for (let y = 0; y < n; y++)
        for (let x = 0; x + 1 < n; x++) s += `  door between r${x}_${y} and r${x + 1}_${y} at center width 700\n`;
      return `${s}  furniture bed at (250,250) size 1000x1000\n}\n`;
    };
    const src = grid(20);
    const skipped = (lintWithCoverage(src).coverage?.families ?? []).some((f) =>
      (f.skipped ?? []).some((s) => s.reason === "annotation-budget"),
    );
    expect(skipped).toBe(true);
    expect(of(src).map((d) => d.message)).toEqual([expect.stringContaining("printed over the bed")]);
  }, 60_000);

  it("charges a label clear of every wall nothing for the poche", () => {
    const n = 16;
    let s = 'plan "g" {\n  units mm\n  paper A0 landscape\n  scale 1:200\n';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        s += `  room id=r${x}_${y} at (${x * 4000},${y * 4000}) size 4000x4000 label "Room" uses bedroom\n`;
    s += "  walls from rooms exterior 200 partition 100\n";
    for (let y = 0; y < n; y++)
      for (let x = 0; x + 1 < n; x++) s += `  door between r${x}_${y} and r${x + 1}_${y} at center width 900\n`;
    const family = (lintWithCoverage(`${s}}\n`).coverage?.families ?? []).find((f) => f.family === "annotation");
    expect(family?.status).toBe("ran");
  }, 60_000);

  it("changes no other lint code on the issue's plans", () => {
    const codes = (s: string) =>
      lint(s)
        .filter((d) => d.code !== OVERLAP)
        .map((d) => d.code);
    expect(codes(issue("Abstell- raum"))).toEqual(["W_ROOM_NO_FIXTURE", "W_DOOR_CLEARANCE", "W_PATH_TOO_NARROW"]);
  });
});
