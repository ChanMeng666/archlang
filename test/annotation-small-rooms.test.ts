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

  it("leaves a label pinned off its floor to W_ROOM_LABEL_OUTSIDE", () => {
    const src = room('label "Room" at (6000,1500)');
    expect(compile(src).diagnostics.map((d) => d.code)).toContain("W_ROOM_LABEL_OUTSIDE");
    expect(of(src)).toEqual([]);
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

  it("leaves a name too wide for any place at the room's centre, and reports it", () => {
    const src = issue("Hauswirtschaftsraum");
    const [name] = drawn(src, "abst");
    expect(name!.at).toEqual({ x: 3600, y: 1850 - 175 * 0.2 });
    expect(of(src)[0]!.message).toContain("runs out of the room");
  });

  it("still moves a label off a swing when the floor has a clear place", () => {
    const src = room('label "Room"', "door id=d on r.top at center width 2200 swing into r", "4000x4000");
    const [name] = drawn(src, "r");
    expect(name!.at).not.toEqual({ x: 2000, y: 2000 - 175 * 0.2 });
    expect(of(src)).toEqual([]);
  });

  it("changes no other lint code on the issue's plans", () => {
    const codes = (s: string) =>
      lint(s)
        .filter((d) => d.code !== OVERLAP)
        .map((d) => d.code);
    expect(codes(issue("Abstell- raum"))).toEqual(["W_ROOM_NO_FIXTURE", "W_DOOR_CLEARANCE", "W_PATH_TOO_NARROW"]);
  });
});
