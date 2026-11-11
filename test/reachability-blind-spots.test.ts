/**
 * RM1.3a — where a person ARRIVES on a storey: a stair-reached upper storey's rooms are reachable
 * (PS0.3), an upper storey's balcony door is no way in (PS0.3), and a balcony door is no arrival for
 * a room a door from the ground reaches (backlog U.1).
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { accessDigraph, buildDoorAccessGraph, reachFrom, resolvePlan, roomBox, type RoomBox } from "../src/analyze.js";
import { arrivalWays, entranceInputs, walkAccessGraph } from "../src/analyze/entrance.js";
import type { RDoor, ROpening, RRoom } from "../src/ir.js";
import { describe as describePlan, lint } from "../src/index.js";
import { corpusFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

/** Two storeys joined by stair `st`; the upper one has no door from the ground. `upper` is
 *  appended to the upper storey's body. */
const twoStorey = (upper = ""): string => `plan "Stair-reached upper storey" {
  units mm
  grid 100
  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=p partition thickness 100 { (2500,0) (2500,4000) }
    room id=hall at (0,0) size 2500x4000 label "Hall" uses hall
    room id=live at (2500,0) size 3500x4000 label "Living" uses living
    door id=front at (1250,4000) width 1000 wall shell
    door id=d_live on p at 2000 width 900
    stair id=st at (100,500) size 900x2600 dir up
  }
  level 2 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=p partition thickness 100 { (2500,0) (2500,4000) }
    room id=landing at (0,0) size 2500x4000 label "Landing" uses circulation
    room id=bed at (2500,0) size 3500x4000 label "Bedroom" uses bedroom
    door id=d_bed on p at 2000 width 800
    stair id=st at (100,500) size 900x2600 dir down
${upper}  }
}
`;

const BALCONY = `    door id=d_balc sliding at (4250,0) width 1800 wall shell
    outdoor id=balc balcony at (2500,-1500) size 3500x1500 label "Balcony"
`;

/** One storey: a hall with the front door, and a living room behind a cased opening with a
 *  sliding door onto a balcony. */
const FLAT = `plan "Flat with a balcony door" {
  units mm
  grid 100
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (3000,0) (3000,5000) }
  room id=hall at (0,0) size 3000x5000 label "Hall" uses hall
  room id=live at (3000,0) size 5000x5000 label "Living" uses living
  door id=front at (1500,5000) width 900 wall shell
  opening id=o_live on p at 2500 width 1200
  door id=d_balc sliding at (5500,0) width 1800 wall shell
  outdoor id=balc balcony at (3000,-1500) size 5000x1500 label "Balcony"
}
`;

const upperOf = (src: string) => describePlan(src).levels![1]!;

describe("PS0.3 — a storey a stair reaches", () => {
  it("counts its rooms from where the stair lands: reachable, the landing at depth 1 and the flight's width", () => {
    const up = upperOf(twoStorey());
    expect(up.access.entrances).toEqual([]);
    expect(up.access.rooms).toEqual([
      { id: "landing", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 900 },
      { id: "bed", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 740 },
    ]);
    // The same numbers the circulation model walks from the stair.
    expect(up.circulation!.entranceId).toBe("st");
    expect(up.circulation!.rooms.map((r) => [r.roomId, r.bottleneckClearWidthMm])).toEqual([
      ["landing", 900],
      ["bed", 740],
    ]);
  });

  it("walks an upper storey from the stair, not from its balcony door", () => {
    const up = upperOf(twoStorey(BALCONY));
    // The balcony door is still one of the storey's doors to the outside.
    expect(up.access.entrances).toEqual(["d_balc"]);
    expect(up.access.rooms).toEqual([
      { id: "landing", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 900 },
      { id: "bed", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 740 },
    ]);
    expect(up.circulation!.entranceId).toBe("st");
    expect(up.circulation!.rooms.map((r) => [r.roomId, r.bottleneckClearWidthMm, r.walkDistanceMm])).toEqual([
      ["landing", 900, 1900],
      ["bed", 740, 4800],
    ]);
  });

  it("counts a room that only holds a flight boarded on this storey through its door, not as an arrival", () => {
    // s1 climbs from the ground into the landing; s2 stands in the study and climbs on to a floor
    // reached only through this one, so on this storey s2 is boarded, never stepped off. Before,
    // the study was seeded at depth 1 like the landing; it is reached through the 740 mm door.
    const src = `plan "Board" {
  units mm
  grid 50
  level 1 "G" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=hall at (0,0) size 8000x6000 label "Hall" uses hall
    door id=front on shell at 1000 width 1000 swing into hall
    stair id=s1 at (500,1500) size 900x2900 dir up
  }
  level 2 "One" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=mid partition thickness 100 { (4000,0) (4000,6000) }
    room id=landing at (0,0) size 4000x6000 label "Landing" uses circulation
    room id=study at (4000,0) size 4000x6000 label "Study" uses office
    door id=d_st on mid at 3000 width 740 swing into study
    stair id=s1 at (500,1500) size 900x2900 dir down
    stair id=s2 at (6500,1500) size 1100x2900 dir up
  }
  level 3 "Two" {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=top at (0,0) size 8000x6000 label "Top" uses bedroom
    stair id=s2 at (6500,1500) size 1100x2900 dir down
  }
}
`;
    const levels = describePlan(src).levels!;
    expect(levels[1]!.access.rooms).toEqual([
      { id: "landing", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 900 },
      { id: "study", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 690 },
    ]);
    expect(levels[1]!.circulation!.entranceId).toBe("s1");
    // On the floor above, s2 IS the way in.
    expect(levels[2]!.access.rooms).toEqual([
      { id: "top", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 1100 },
    ]);
  });

  it("reads a room whose only door opens onto a balcony as unreachable, in describe and lint alike", () => {
    // A wider upper storey: a second bedroom whose one door opens onto its own balcony. Before,
    // that slider was the storey's way in: the landing and the first bedroom read unreachable
    // and unmeasured, and lint said nothing about the second bedroom.
    const src = twoStorey()
      .replace(
        "wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n    wall id=p partition thickness 100 { (2500,0) (2500,4000) }\n    room id=landing",
        "wall id=shell exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }\n    wall id=p partition thickness 100 { (2500,0) (2500,4000) }\n    wall id=q partition thickness 100 { (6000,0) (6000,4000) }\n    room id=landing",
      )
      .replace(
        "    stair id=st at (100,500) size 900x2600 dir down\n",
        `    stair id=st at (100,500) size 900x2600 dir down
    room id=bed2 at (6000,0) size 3000x4000 label "Bedroom 2" uses bedroom
    door id=d_bal2 sliding at (7500,0) width 1800 wall shell
    outdoor id=bal2 balcony at (6000,-1500) size 3000x1500 label "Balcony 2"
`,
      );
    const up = upperOf(src);
    expect(up.access.entrances).toEqual(["d_bal2"]);
    expect(up.access.rooms).toEqual([
      { id: "landing", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 900 },
      { id: "bed", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 740 },
      { id: "bed2", depthFromEntrance: null, reachable: false, bottleneckClearWidth: null },
    ]);
    expect(up.circulation!.entranceId).toBe("st");
    expect(up.circulation!.unmeasured).toEqual([{ roomId: "bed2", reason: "no_door_route" }]);
    expect(
      lint(src)
        .filter((d) => d.code === "W_ROOM_UNREACHABLE")
        .map((d) => [d.level, d.message]),
    ).toEqual([[2, `Room "Bedroom 2" can't be reached from the entrance.`]]);
  });
});

describe("U.1 — a balcony door is no arrival", () => {
  it("walks every room from the front door, and counts the hall's way in at the front door's width", () => {
    const s = describePlan(FLAT);
    expect(s.access.entrances).toEqual(["front", "d_balc"]);
    expect(s.access.rooms).toEqual([
      { id: "hall", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 840, depthFromMainEntrance: 1 },
      { id: "live", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 840, depthFromMainEntrance: 2 },
    ]);
    const c = s.circulation!;
    expect(c.entranceId).toBe("front");
    // One way in for the walk, so no room names its own.
    expect(c.rooms.map((r) => [r.roomId, r.bottleneckClearWidthMm, r.walkDistanceMm, r.entranceId])).toEqual([
      ["hall", 840, 2300, undefined],
      ["live", 840, 6200, undefined],
    ]);
  });

  it("keeps a balcony door as the way into a room nothing else reaches", () => {
    // The opening is gone: the living room is entered only from the balcony.
    const s = describePlan(FLAT.replace("  opening id=o_live on p at 2500 width 1200\n", ""));
    expect(s.access.rooms.find((r) => r.id === "live")).toMatchObject({ reachable: true, depthFromEntrance: 1 });
    expect(s.circulation!.rooms.find((r) => r.roomId === "live")?.entranceId).toBe("d_balc");
  });
});

/** Every corpus storey: its rooms, its door graph and its describe() access facts. */
function corpusStoreys() {
  const out: Array<{
    file: string;
    level?: number;
    rooms: RRoom[];
    full: ReturnType<typeof buildDoorAccessGraph>;
    st: ReturnType<typeof resolvePlan>["levels"][number]["ir"];
  }> = [];
  for (const file of corpusFiles({ dirs: ["examples", "test/defect-corpus", "test/main-entrance-fixtures"] })) {
    const src = readFileSync(file, "utf8");
    const { ir, levels } = resolvePlan(src, { world: worldFor(dirname(file)) });
    const storeys =
      levels.length > 0
        ? levels.map((l) => ({ level: l.level as number | undefined, st: l.ir }))
        : ir
          ? [{ level: undefined, st: ir }]
          : [];
    for (const { level, st } of storeys) {
      const rooms = st.elements.filter((e): e is RRoom => e.kind === "room");
      const doors = st.elements.filter((e): e is RDoor => e.kind === "door");
      const openings = st.elements.filter((e): e is ROpening => e.kind === "opening");
      out.push({ file, level, rooms, st, full: buildDoorAccessGraph(rooms, doors, 200, undefined, openings) });
    }
  }
  return out;
}

describe("RM1.3a laws over the corpus", () => {
  const storeys = corpusStoreys();

  it("the arrival ways reach every room the doors reach (W_ROOM_UNREACHABLE cannot move by U.1)", () => {
    let dropped = 0;
    for (const { rooms, st, full } of storeys) {
      const rects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
      const keep = arrivalWays(full, entranceInputs(st, rects));
      const walk = walkAccessGraph(full, keep);
      const ids = rooms.map((r) => r.id);
      expect([...reachFrom(accessDigraph(ids, walk.edges))].sort()).toEqual(
        [...reachFrom(accessDigraph(ids, full.edges))].sort(),
      );
      if (keep === null) expect(walk).toBe(full);
      else dropped += full.entrances.length - keep.size;
    }
    // Non-vacuity: the corpus holds balcony doors the walk no longer starts from.
    expect(dropped).toBeGreaterThan(0);
  });

  it("describe().access says unreachable exactly where lint says W_ROOM_UNREACHABLE", () => {
    const files = [...new Set(storeys.map((s) => s.file))];
    let upper = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const world = worldFor(dirname(file));
      const sum = describePlan(src, { world });
      const sums = sum.levels ?? [sum];
      const warned = lint(src, { world }).filter((d) => d.code === "W_ROOM_UNREACHABLE" && d.file === undefined);
      for (const [i, s] of sums.entries()) {
        const mine = storeys.filter((x) => x.file === file)[i];
        if (!mine) continue;
        const spanOf = new Map(mine.rooms.map((r) => [r.span?.start, r.id]));
        const flagged = new Set(warned.filter((d) => d.level === mine.level).map((d) => spanOf.get(d.span?.start)));
        for (const id of flagged)
          expect(s.access.rooms.find((r) => r.id === id)?.reachable, `${file} ${id}`).toBe(false);
        // And the other way: on a storey with a way in, a room a door joins that describe() calls
        // unreachable is one lint names (a room written in an imported module is left out: its
        // diagnostics carry their own file).
        if (s.access.rooms.some((r) => r.reachable)) {
          for (const r of s.access.rooms) {
            const room = mine.rooms.find((x) => x.id === r.id);
            const joined = s.access.edges.some((e) => !e.ambiguous && e.between.includes(r.id));
            if (!r.reachable && joined && room?._file === undefined)
              expect(flagged.has(r.id), `${file} ${r.id}`).toBe(true);
          }
        }
        if (mine.level !== undefined && mine.level > 1) upper += s.access.rooms.filter((r) => r.reachable).length;
      }
    }
    // Non-vacuity: stair-reached upper-storey rooms are counted reachable.
    expect(upper).toBeGreaterThan(0);
  });
});
