import { describe, expect, it } from "vitest";
import { connectorConnection, DEFAULT_TOL, pointInRoomBox, resolvePlan, roomBox } from "../src/analyze.js";
import { pointInRect } from "../src/geometry/rect.js";
import { describe as describePlan, lint } from "../src/index.js";
import type { RDoor, RRoom } from "../src/ir.js";

/**
 * A hosted connector's `between` is read off its host wall's two SIDES — probed one wall
 * thickness either side of the centreline (half a thickness past each face), the room whose
 * floor holds the probe, from the shape, and only a room the point touches — not off which
 * room edges its centre point touches alone. The centre-point answer handed an exterior
 * door centred on a T-junction (or within the 200 mm tolerance of a partition's end) to
 * the two rooms inside, so the plan had no entrance (`test/plans/plan-soundness/repro/
 * door-on-tee.arch`, backlog C.4). `straddles` records every room a face's clear span
 * covers when that is more than one: the partition runs into the opening.
 */

const edgeOf = (src: string, id: string) => describePlan(src).access.edges.find((e) => e.doorId === id);
const codes = (src: string): Array<string | undefined> => lint(src).map((d) => d.code);

/** `door-on-tee.arch`, reduced: a door centred where partition `p` meets the shell. */
const TEE = `plan "tee" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (4000,0) (4000,5000) }
  room id=a at (0,0) size 4000x5000 label "A"
  room id=b at (4000,0) size 4000x5000 label "B"
  door id=front on shell at 4000 width 900
  door id=inner on p at 50% width 800
}`;

/** Backlog C.4: an exterior door 100 mm off a partition's end, inside the 200 mm tolerance. */
const CORNER = `plan "corner" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (4000,0) (4000,3000) }
  room id=a at (0,0) size 4000x3000 label "Hall"
  room id=b at (4000,0) size 4000x3000 label "Living"
  door id=d at (4100,3000) width 900 wall shell
  door id=d2 at (4000,1500) width 800 wall mid
}`;

describe("between is read off the host wall's faces", () => {
  it("a door centred on an exterior T-junction is an entrance into one room, and straddles both", () => {
    const front = edgeOf(TEE, "front")!;
    // The inner face's centre probe sits on the a|b boundary; each room covers 400 mm of
    // the clear span, so the tie goes to room order.
    expect(front.between).toEqual(["exterior", "a"]);
    expect(front.exterior).toBe(true);
    expect(front.ambiguous).toBe(false);
    expect(front.straddles).toEqual(["a", "b"]);
    const s = describePlan(TEE);
    expect(s.doors.find((d) => d.id === "front")).toMatchObject({ between: ["exterior", "a"], straddles: ["a", "b"] });
    expect(s.access.entrances).toEqual(["front"]);
    expect(codes(TEE)).not.toContain("W_NO_ENTRANCE");
  });

  it("C.4: an exterior door beside a partition's end opens into the room its inner face is in", () => {
    const d = edgeOf(CORNER, "d")!;
    expect(d.between).toEqual(["exterior", "b"]);
    expect(d.exterior).toBe(true);
    expect(d.straddles).toEqual(["a", "b"]);
    expect(describePlan(CORNER).access.entrances).toEqual(["d"]);
    expect(codes(CORNER)).not.toContain("W_NO_ENTRANCE");
  });

  it("a door honestly joining two rooms on a partition keeps its pair and carries no straddles", () => {
    for (const [src, id] of [
      [TEE, "inner"],
      [CORNER, "d2"],
    ] as const) {
      const e = edgeOf(src, id)!;
      expect(e.between).toEqual(["a", "b"]);
      expect(e.exterior).toBe(false);
      expect(e).not.toHaveProperty("straddles");
      expect(describePlan(src).doors.find((d) => d.id === id)).not.toHaveProperty("straddles");
    }
  });

  it("a door whose jamb meets the partition's face does not straddle it", () => {
    // Clear span 4050..4950: the partition's band (3950..4050) ends at the jamb.
    const src = TEE.replace("door id=front on shell at 4000", "door id=front on shell at 4500");
    const front = edgeOf(src, "front")!;
    expect(front.between).toEqual(["exterior", "b"]);
    expect(front).not.toHaveProperty("straddles");
    expect(codes(src)).not.toContain("W_NO_ENTRANCE");
  });

  it("the probe reads a polygon room's shape, not its bounding box", () => {
    const src = `plan "L" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall id=pv partition thickness 100 { (4000,3000) (4000,6000) }
  wall id=ph partition thickness 100 { (4000,3000) (8000,3000) }
  room id=l polygon (0,0) (8000,0) (8000,3000) (4000,3000) (4000,6000) (0,6000) label "Living"
  room id=n at (4000,3000) size 4000x3000 label "Study"
  door id=d at (4100,6000) width 900 wall shell
  door id=d2 at (6000,3000) width 800 wall ph
}`;
    const { ir } = resolvePlan(src);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const roomRects = new Map(rooms.map((r) => [r.id, roomBox(r)] as const));
    // The control: the L's BOUNDING BOX holds the inner face's centre probe (and the whole
    // clear span), so a bbox reading would hand the door to the L. Its floor does not.
    const probe = { x: 4100, y: 5800 };
    expect(pointInRect(probe.x, probe.y, roomRects.get("l")!)).toBe(true);
    expect(pointInRoomBox(probe, roomRects.get("l")!)).toBe(false);
    const d = ir!.elements.find((e): e is RDoor => e.kind === "door" && e.id === "d")!;
    expect(connectorConnection(d, roomRects, DEFAULT_TOL)).toEqual({
      between: ["exterior", "n"],
      ambiguous: false,
      straddles: ["l", "n"],
    });
    expect(edgeOf(src, "d2")).toMatchObject({ between: ["l", "n"], exterior: false });
    expect(edgeOf(src, "d2")).not.toHaveProperty("straddles");
    expect(codes(src)).not.toContain("W_NO_ENTRANCE");
  });

  it("behind a thick wall, a probe that reaches past a shallow room into the next decides nothing", () => {
    // The probe stands one thickness from the centreline: 300 mm off a 300 mm wall is x=4300,
    // past the 250 mm-deep room b and through partition s into c, which the door does not
    // open into (c is not at the door's point). Likewise 600 mm off a 600 mm wall past a 400 mm room.
    const thick = (t: number, depth: number): string => `plan "thick" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=t partition thickness ${t} { (4000,0) (4000,4000) }
  wall id=s partition thickness 100 { (${4000 + depth},0) (${4000 + depth},4000) }
  room id=a at (0,0) size 4000x4000 label "A"
  room id=b at (4000,0) size ${depth}x4000 label "Duct"
  room id=c at (${4000 + depth},0) size ${4000 - depth}x4000 label "C"
  door id=d on t at 50% width 900
  door id=front on shell at 2000 width 900
}`;
    for (const [t, depth] of [
      [300, 250],
      [600, 400],
    ] as const) {
      const src = thick(t, depth);
      const { ir } = resolvePlan(src);
      const d = ir!.elements.find((e): e is RDoor => e.kind === "door" && e.id === "d")!;
      const rooms = new Map(
        ir!.elements.filter((e): e is RRoom => e.kind === "room").map((r) => [r.id, roomBox(r)] as const),
      );
      // The control: the plus probe really is in c.
      expect(pointInRoomBox({ x: 4000 + t, y: 2000 }, rooms.get("c")!), `${t}/${depth}`).toBe(true);
      expect(edgeOf(src, "d")?.between, `${t}/${depth}`).toEqual(["a", "b"]);
      expect(connectorConnection(d, rooms, DEFAULT_TOL).between, `${t}/${depth}`).toEqual(["a", "b"]);
    }
  });

  it("straddles is listed even when the rooms it names are the between pair", () => {
    // An L wraps b; partition h meets t at the door's centre, so t's east face spans b and the L.
    const src = `plan "wrap" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=t partition thickness 100 { (4000,0) (4000,5000) }
  wall id=h partition thickness 100 { (4000,2500) (8000,2500) }
  room id=a polygon (0,0) (4000,0) (4000,2500) (8000,2500) (8000,5000) (0,5000) label "A"
  room id=b at (4000,0) size 4000x2500 label "B"
  door id=d on t at 2500 width 900
  door id=front on shell at 1500 width 900
}`;
    expect(edgeOf(src, "d")).toMatchObject({ between: ["a", "b"], straddles: ["a", "b"] });
    expect(describePlan(src).doors.find((x) => x.id === "d")?.straddles).toEqual(["a", "b"]);
  });

  it("a free door far from every wall is given a host it is not on: it keeps the edge-touch answer", () => {
    // `test/fixtures/zones-wings.arch`, reduced: no partition, a door 2000 mm from the shell
    // edge it is hosted on, on the boundary two rooms share. No wall meets it, so no straddles.
    const src = `plan "free" {
  units mm
  wall exterior thickness 200 { (0,0) (8000,0) (8000,8000) (0,8000) close }
  room id=lobby at (0,0) size 4000x8000 label "Lobby"
  room id=gal at (4000,0) size 4000x8000 label "Gallery"
  door id=front at (0,4000) width 1200
  door id=d at (4000,2000) width 900
}`;
    const e = edgeOf(src, "d")!;
    expect(e.hostCategory).toBe("exterior");
    expect(e.between).toEqual(["lobby", "gal"]);
    expect(e).not.toHaveProperty("straddles");
  });

  it("a connector with no host wall keeps the edge-touch answer", () => {
    const { ir } = resolvePlan(CORNER);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const roomRects = new Map(rooms.map((r) => [r.id, roomBox(r)] as const));
    expect(connectorConnection({ at: { x: 4100, y: 3000 }, host: null, width: 900 }, roomRects, DEFAULT_TOL)).toEqual({
      between: ["a", "b"],
      ambiguous: false,
    });
  });
});
