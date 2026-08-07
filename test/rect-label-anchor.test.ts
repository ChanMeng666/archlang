/**
 * A RECTANGULAR room's `label "…" at (x,y)` — the explicit label/area anchor.
 *
 * The clause has parsed on every room form since v1.23 (`parseTail` is shared by the
 * rect, `polygon` and `circle` forms alike), but only `resolveCircle` / `resolvePolygon`
 * ever carried it into the IR. On a rectangle it was **parsed and then dropped**: the
 * label sat at the computed centre as if the clause were absent, with no diagnostic, and
 * `W_ROOM_LABEL_OUTSIDE` — which keys off the recorded anchor — could not fire there
 * either.
 *
 * That made the rule the language actually documents, *"an explicit `label at` always
 * wins"*, true for two room forms out of three. It is load-bearing now that
 * `src/label-placement.ts` may relocate a label: the post-pass excludes an authored
 * anchor from relocation, and on a rect room it could not even tell there was one.
 *
 * What this file pins, in the order it matters:
 *
 *  1. the loss is in the RESOLVER, not the parser — the AST carries `labelAt` for a
 *     rect room, so this is a drop and not a rejection;
 *  2. an explicit anchor is honoured on both rect paths (absolute `at` and relational
 *     `right-of`/…), and the area text travels with the name;
 *  3. `W_ROOM_LABEL_OUTSIDE` fires on a rect room whose pin is off its own floor, with
 *     the boundary counting as inside — the same convention the circle and polygon
 *     forms already use;
 *  4. the label post-pass never touches an authored anchor, even sitting on furniture;
 *  5. a rect room with **no** `label at` is byte-identical — the whole point of the
 *     `labelAt ? { labelAt } : {}` spread;
 *  6. `describe()` is untouched: a label anchor is a drawing fact, not a measured one.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, format } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import type { RRoom } from "../src/ir.js";
import type { RoomNode } from "../src/ast.js";
import type { Scene } from "../src/scene.js";
import { roomLabelAnchor } from "../src/elements/room.js";

const sceneOf = (src: string): Scene => {
  const res = compile(src, { noCache: true });
  if (!res.scene) throw new Error(`no scene: ${res.errors.join("; ")}`);
  return res.scene;
};

const roomsOf = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

const codes = (src: string): (string | undefined)[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code);

/** The drawn position of one `labels`-pass text node, by its exact string. */
const textAt = (scene: Scene, value: string): { x: number; y: number } => {
  for (const n of scene.nodes) {
    if (n.layer === "labels" && n.prim.t === "text" && n.prim.value === value) {
      return { x: n.prim.at.x, y: n.prim.at.y };
    }
  }
  throw new Error(`no label text "${value}"`);
};

/** A 5 × 4 m shell, plus whatever the caller puts inside it. */
const plan = (body: string): string =>
  `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  ${body}
}`;

describe("rect `label … at` — scope: the parser accepts it, the resolver dropped it", () => {
  it("the AST carries `labelAt` for a RECTANGLE, so this was never a parse rejection", () => {
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`);
    const res = compile(src, { noCache: true });
    expect(res.errors.map((e) => e.message)).toEqual([]);

    const ast = parse(src).plan!;
    const node = ast.body.find((s): s is RoomNode => s.kind === "room")!;
    expect(node.labelAt).toBeDefined();
    expect(node.labelAtSpan).toBeDefined();
  });

  it("the same clause reaches the IR — the resolved rect room records the anchor", () => {
    const r = roomsOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`))[0]!;
    expect(r.labelAt).toEqual({ x: 1000, y: 3000 });
    expect(r.poly).toBeUndefined();
    expect(r.circle).toBeUndefined();
  });

  it("`roomLabelAnchor` returns the pin, not the rectangle's centre", () => {
    const pinned = roomsOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`))[0]!;
    const loose = roomsOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall"`))[0]!;
    expect(roomLabelAnchor(pinned)).toEqual({ x: 1000, y: 3000 });
    expect(roomLabelAnchor(loose)).toEqual({ x: 2500, y: 2000 });
  });
});

describe("rect `label … at` — the anchor is honoured in the drawing", () => {
  it("the room NAME is drawn at the author's point", () => {
    const scene = sceneOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`));
    expect(textAt(scene, "Hall")).toEqual({ x: 1000, y: 3000 - scene.sizes.roomFont * 0.2 });
  });

  it("the AREA text travels with it — `room.ts` emits both off one anchor", () => {
    const scene = sceneOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`));
    expect(textAt(scene, "20.0 m²")).toEqual({ x: 1000, y: 3000 + scene.sizes.roomFont * 0.9 });
  });

  it("an UNLABELLED room's area text moves too — the anchor is not about the name", () => {
    const scene = sceneOf(plan(`room id=r at (0,0) size 5000x4000 label "" at (1000,3000)`));
    // An empty label emits no name node, so the area text sits ON the anchor.
    expect(textAt(scene, "20.0 m²")).toEqual({ x: 1000, y: 3000 });
  });

  it("a RELATIONAL rect room honours it too — the pin is a plan coordinate, not an offset", () => {
    const src = plan(`room id=a at (0,0) size 2000x4000 label "A"
  room id=b right-of a size 3000x4000 label "B" at (4000,500)`);
    const b = roomsOf(src).find((r) => r.id === "b")!;
    expect(b.at).toEqual({ x: 2000, y: 0 });
    expect(b.labelAt).toEqual({ x: 4000, y: 500 });
    const scene = sceneOf(src);
    expect(textAt(scene, "B")).toEqual({ x: 4000, y: 500 - scene.sizes.roomFont * 0.2 });
  });

  it("a placed instance carries the pin through its frame, like every other coordinate", () => {
    // `component` bodies resolve in LOCAL coordinates; `transformElement` is the one
    // crossing into plan space. A 90° turn about the origin sends (1000,500) → (-500,1000),
    // then the instance's own translation to (10500, 1000).
    const src = `plan "t" {
  grid 50
  component w() {
    room id=main at (0,0) size 4000x3000 label "Gallery" at (1000,500)
  }
  place w() as inst at (11000,0) rotate 90
}`;
    const res = compile(src, { noCache: true });
    expect(res.errors.map((e) => e.message)).toEqual([]);
    const r = roomsOf(src).find((rm) => rm.id === "inst.main")!;
    expect(r.labelAt).toEqual({ x: 10500, y: 1000 });
  });
});

describe("rect `label … at` — W_ROOM_LABEL_OUTSIDE can finally fire", () => {
  it("warns when the pin is off the rectangle's own floor", () => {
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (9000,9000)`))).toContain(
      "W_ROOM_LABEL_OUTSIDE",
    );
  });

  it("stays silent when the pin is inside", () => {
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`))).not.toContain(
      "W_ROOM_LABEL_OUTSIDE",
    );
  });

  it("the boundary counts as inside — the same convention the circle and polygon use", () => {
    // A pin exactly on a corner and on an edge: legal for all three room forms.
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (0,0)`))).not.toContain(
      "W_ROOM_LABEL_OUTSIDE",
    );
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (5000,2000)`))).not.toContain(
      "W_ROOM_LABEL_OUTSIDE",
    );
    // One grid step past the same edge is not.
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (5050,2000)`))).toContain(
      "W_ROOM_LABEL_OUTSIDE",
    );
  });

  it("reports the pin, blames the `at` clause, and names the room", () => {
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (9000,9000)`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_ROOM_LABEL_OUTSIDE")!;
    expect(d.severity).toBe("warning");
    expect(d.message).toBe(`Room "r" pins its label at (9000, 9000), which is outside the room`);
    // The span is the `at (x,y)` clause itself, not the whole statement.
    expect(src.slice(d.span!.start, d.span!.end)).toBe("at (9000,9000)");
  });

  it("fires on a RELATIONAL rect room against its RESOLVED box, not its placeholder", () => {
    // (500,500) is inside the placeholder rect at the origin and outside the room's real
    // position — a check run before `placeRelational` would call this one clean.
    const outside = plan(`room id=a at (0,0) size 2000x4000 label "A"
  room id=b right-of a size 3000x4000 label "B" at (500,500)`);
    expect(codes(outside)).toContain("W_ROOM_LABEL_OUTSIDE");
    const inside = plan(`room id=a at (0,0) size 2000x4000 label "A"
  room id=b right-of a size 3000x4000 label "B" at (3000,500)`);
    expect(codes(inside)).not.toContain("W_ROOM_LABEL_OUTSIDE");
  });

  it("says nothing about a room that pins no label", () => {
    expect(codes(plan(`room id=r at (0,0) size 5000x4000 label "Hall"`))).not.toContain("W_ROOM_LABEL_OUTSIDE");
  });
});

describe("rect `label … at` — the label post-pass must not overrule the author", () => {
  it("an authored anchor is never relocated, even sitting squarely on a bed", () => {
    const pinned = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (2500,2000)
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`);
    const loose = plan(`room id=r at (0,0) size 5000x4000 label "Hall"
  furniture bed at (1000,1000) size 3000x2000 label "Bed"`);
    const scene = sceneOf(pinned);
    const at = { x: 2500, y: 2000 - scene.sizes.roomFont * 0.2 };
    expect(textAt(scene, "Hall")).toEqual(at);
    // The identical plan without the pin DOES move — so the exclusion is what held it.
    expect(textAt(sceneOf(loose), "Hall")).not.toEqual(at);
  });

  it("an OFF-FLOOR authored anchor is left where it was written, warning and all", () => {
    // The post-pass would have every reason to pull this back inside; it must not, or
    // `W_ROOM_LABEL_OUTSIDE` would describe a position nothing is drawn at.
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (9000,9000)`);
    const scene = sceneOf(src);
    expect(textAt(scene, "Hall")).toEqual({ x: 9000, y: 9000 - scene.sizes.roomFont * 0.2 });
    expect(codes(src)).toContain("W_ROOM_LABEL_OUTSIDE");
  });
});

describe("rect `label … at` — what must NOT change", () => {
  it("a rect room with no `label at` is byte-identical to the unpinned form", () => {
    // The anchor is absent from the IR entirely (an absent key, not an undefined one),
    // which is what keeps every drawing shipped before this fix on its exact bytes.
    const r = roomsOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall"`))[0]!;
    expect("labelAt" in r).toBe(false);
    const rel = roomsOf(
      plan(`room id=a at (0,0) size 2000x4000 label "A"
  room id=b right-of a size 3000x4000 label "B"`),
    ).find((rm) => rm.id === "b")!;
    expect("labelAt" in rel).toBe(false);
  });

  it("the unpinned rect anchor is still the exact centre", () => {
    const scene = sceneOf(plan(`room id=r at (0,0) size 5000x4000 label "Hall"`));
    expect(textAt(scene, "Hall")).toEqual({ x: 2500, y: 2000 - scene.sizes.roomFont * 0.2 });
  });

  it("`describe()` is untouched — an anchor is a drawing fact, not a measured one", () => {
    const pinned = describePlan(plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`));
    const loose = describePlan(plan(`room id=r at (0,0) size 5000x4000 label "Hall"`));
    expect(JSON.stringify(pinned.rooms)).toBe(JSON.stringify(loose.rooms));
    expect(pinned.totals).toEqual(loose.totals);
    expect(pinned.caption).toBe(loose.caption);
    expect(JSON.stringify(pinned.rooms)).not.toContain("label_at");
    expect(JSON.stringify(pinned.rooms)).not.toContain("labelAt");
  });

  it("is deterministic — the same source renders byte-identically every time", () => {
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("survives the formatter — `fmt` already printed the clause it could not resolve", () => {
    const src = plan(`room id=r at (0,0) size 5000x4000 label "Hall" at (1000,3000)`);
    const once = format(src);
    expect(once).toContain(`label "Hall" at (1000, 3000)`);
    expect(format(once)).toBe(once);
    expect(compile(once, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});
