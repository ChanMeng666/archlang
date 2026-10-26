/**
 * Contact dependency (plan-soundness card PS4.5): an authored wall or a furniture piece written at
 * fixed coordinates that lies ON a rectangular room's edge records that contact in
 * `describe --facts depends` (`elements[].contacts`, `src/analyze/contacts.ts`), and `impact`
 * reports it `held` when that edge's line moves and it does not, with the room, the edge and
 * the gap.
 *
 * Pinned here: the widening drill (held = the shell and `p`, with their gaps); a `walls from
 * rooms` plan (no contacts, its derived walls follow); a furniture piece whose back lies on a
 * room edge by `at` (held when the room moves); a wall on two rooms' edges; a wall 1 mm off, a
 * wall meeting an edge only at a corner and a curved segment (no contact); the rooms an element
 * already follows (no contact); the listing cap; and determinism. That the facts are additive is
 * the K1 law (`./keep-byte-identity.test.ts`, which strips exactly them); that they move with a
 * placing frame as a side does is `./describe-depends.test.ts`'s equivariance suite.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { MAX_CONTACTS_LISTED } from "../src/analyze/contacts.js";
import { applyLetOverride, type DependsEntry, describe, impact, type ImpactReport } from "../src/index.js";

const plan = (body: string, grid = "grid 50"): string => `plan "t" {\n  units mm\n  ${grid}\n${body}\n}\n`;

function rows(src: string): DependsEntry[] {
  const s = describe(src, { facts: ["depends"] });
  expect(
    s.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
    src,
  ).toEqual([]);
  return s.depends!.elements;
}
const row = (src: string, id: string): DependsEntry => rows(src).find((e) => e.id === id)!;

function setImpact(src: string, name: string, value: string): ImpactReport {
  const o = applyLetOverride(src, name, value);
  if (!o.ok) throw new Error(JSON.stringify(o.diagnostics));
  return impact(src, o.source);
}
const heldLines = (r: ImpactReport): string[] => r.summary.filter((l) => / stayed at /.test(l));

suite("PS4.5 — the widening drill: the shell and p are held", () => {
  const before = readFileSync("docs/plans/plan-soundness/repro/widen-before.arch", "utf8");

  it("records the walls' contacts (and nothing else's)", () => {
    const withContacts = rows(before).filter((e) => e.contacts);
    expect(withContacts.map((e) => [e.id, e.contacts!.map((c) => `${c.room}.${c.edge}`)])).toEqual([
      ["p", ["a.right", "b.left"]],
      ["shell", ["a.bottom", "a.left", "a.top", "b.bottom", "b.right", "b.top"]],
    ]);
  });

  it("`--set AW=4500`: held = p (two 500 mm gaps) and the shell (one), nothing else", () => {
    const r = setImpact(before, "AW", "4500");
    expect(r.held.map((h) => h.name)).toEqual(["p", "shell"]);
    expect(
      r.held.flatMap((h) =>
        h.because.map((s) => [h.name, s.via, s.name, s.contact?.stayed_mm, s.contact?.moved_to_mm, s.contact?.gap_mm]),
      ),
    ).toEqual([
      ["p", "contact", "a.right", 4000, 4500, 500],
      ["p", "contact", "b.left", 4000, 4500, 500],
      ["shell", "contact", "b.right", 8000, 8500, 500],
    ]);
    expect(heldLines(r)).toEqual([
      "  wall p stayed at x 4000 while a.right moved to x 4500 (500 mm)",
      "  wall p stayed at x 4000 while b.left moved to x 4500 (500 mm)",
      "  wall shell stayed at x 8000 while b.right moved to x 8500 (500 mm)",
    ]);
  });

  it("read backwards (after → before) the same walls are not held: they never lay on the moved edges", () => {
    const after = readFileSync("docs/plans/plan-soundness/repro/widen-after.arch", "utf8");
    // On the after side p (x 4000) lies inside a; the shell's x 8000 is inside b. Contacts are
    // read on the before side, so narrowing back reports neither.
    expect(impact(after, before).held).toEqual([]);
  });
});

const TWO = `  let W = 4000
  room id=a at (0,0) size W x 3000 label "A"
  room id=b at (4000,0) size 3000x3000 label "B"`;

suite("PS4.5 — what is and is not a contact", () => {
  it("a `walls from rooms` plan: no row has contacts; its derived walls follow the room", () => {
    const src = plan(`  let W = 4000
  room id=a at (0,0) size W x 3000 label "A"
  room id=b right-of a align top gap 0 size 3000x3000 label "B"
  walls from rooms exterior 200 partition 100`);
    expect(rows(src).filter((e) => e.contacts)).toEqual([]);
    const r = setImpact(src, "W", "4500");
    expect(r.held).toEqual([]);
    expect(r.changed.some((c) => c.kind === "wall" && c.derived)).toBe(true);
  });

  it("a wall on two rooms' edges records both, and is held by both", () => {
    const src = plan(`${TWO}\n  wall id=p partition thickness 100 { (4000,0) (4000,3000) }`);
    expect(row(src, "p").contacts).toEqual([
      { room: "a", edge: "right" },
      { room: "b", edge: "left" },
    ]);
    // b is pinned at x 4000, so only a.right moves.
    expect(heldLines(setImpact(src, "W", "3500"))).toEqual([
      "  wall p stayed at x 4000 while a.right moved to x 3500 (500 mm)",
    ]);
  });

  it("a wall 1 mm off the edge: no contact, not held", () => {
    // On a 1 mm grid, so the snap keeps x 4001 (a 50 mm grid would put it back on the edge).
    const src = plan(`${TWO}\n  wall id=p partition thickness 100 { (4001,0) (4001,3000) }`, "grid 1");
    expect(row(src, "p").contacts).toBeUndefined();
    expect(setImpact(src, "W", "4500").held).toEqual([]);
  });

  it("a wall meeting an edge only at its corner, and a curved segment: no contact", () => {
    const corner = plan(`${TWO}\n  wall id=q partition thickness 100 { (7000,3000) (9000,3000) }`);
    expect(row(corner, "q").contacts).toBeUndefined();
    const arc = plan(`${TWO}\n  wall id=c partition thickness 100 { (0,3000) arc (7000,3000) radius 3500 }`);
    expect(row(arc, "c").contacts).toBeUndefined();
  });

  it("a wall written between two rooms follows them: no contact with a room in its `on`", () => {
    const src = plan(`${TWO}\n  wall id=p partition thickness 100 between a and b`);
    const p = row(src, "p");
    expect(p.on).toEqual(["a", "b"]);
    expect(p.contacts).toBeUndefined();
  });

  it("furniture by `at` whose back lies on a room edge: held when the room moves", () => {
    // `rotate 0` puts the back on the footprint's top (y 0 = a.top); `rotate 90` on its right
    // (x 4000 = a.right). The `rotate 180` piece's top edge is on a.top, but its back is its
    // bottom (y 600), so it touches nothing.
    const src = plan(`  let Y = 0
  let W = 4000
  room id=a at (0,Y) size W x 3000 label "A"
  furniture id=f counter at (1000,0) size 1200x600
  furniture id=g counter at (3400,1000) size 600x1200 rotate 90
  furniture id=h counter at (2400,0) size 600x600 rotate 180`);
    expect(row(src, "f").contacts).toEqual([{ room: "a", edge: "top" }]);
    expect(row(src, "g").contacts).toEqual([{ room: "a", edge: "right" }]);
    expect(row(src, "h").contacts).toBeUndefined();
    expect(heldLines(setImpact(src, "Y", "500"))).toEqual([
      "  furniture f stayed at y 0 while a.top moved to y 500 (500 mm)",
    ]);
    const wide = setImpact(src, "W", "4500");
    expect(wide.held.map((h) => [h.name, h.kind, h.because.map((s) => s.name)])).toEqual([
      ["g", "furniture", ["a.right"]],
    ]);
    expect(heldLines(wide)).toEqual(["  furniture g stayed at x 4000 while a.right moved to x 4500 (500 mm)"]);
  });

  it("furniture anchored in its room follows it: no contact with that room", () => {
    const src = plan(`  room id=a at (0,0) size 4000x3000 label "A"
  furniture id=f counter in a anchor top size 1200x600`);
    expect(row(src, "f").on).toEqual(["a"]);
    expect(row(src, "f").contacts).toBeUndefined();
  });

  it("an edge that only grows along its own line has not moved", () => {
    // a widens to the right: a.top still lies on y 0, so the wall along it is not held.
    const src = plan(`${TWO.replace(`room id=b at (4000,0)`, `room id=b at (6000,0)`)}
  wall id=t partition thickness 100 { (0,0) (4000,0) }`);
    expect(row(src, "t").contacts).toEqual([{ room: "a", edge: "top" }]);
    expect(setImpact(src, "W", "4500").held).toEqual([]);
  });

  it(`lists at most ${MAX_CONTACTS_LISTED} contacts per element, the first found along it`, () => {
    const n = MAX_CONTACTS_LISTED + 6;
    const body = Array.from({ length: n }, (_, k) => `  room id=r${k} at (${k * 1000},0) size 1000x1000`).join("\n");
    const src = plan(`${body}\n  wall id=w partition thickness 100 { (0,0) (${n * 1000},0) }`);
    const c = row(src, "w").contacts!;
    expect(c).toHaveLength(MAX_CONTACTS_LISTED);
    expect(new Set(c.map((x) => x.room))).toEqual(
      new Set(Array.from({ length: MAX_CONTACTS_LISTED }, (_, k) => `r${k}`)),
    );
    expect(c.every((x) => x.edge === "top")).toBe(true);
  });
});

suite("PS4.5 — determinism", () => {
  it("the same facts and report on every run, and whatever order the statements are written in", () => {
    const body = [
      `  let W = 4000`,
      `  room id=a at (0,0) size W x 3000 label "A"`,
      `  room id=b at (4000,0) size 3000x3000 label "B"`,
      `  wall id=s exterior thickness 200 { (0,0) (7000,0) (7000,3000) (0,3000) close }`,
      `  wall id=p partition thickness 100 { (4000,0) (4000,3000) }`,
      `  furniture id=f counter at (1000,0) size 1200x600`,
    ];
    const src = plan(body.join("\n"));
    const shuffled = plan([body[0], body[5], body[4], body[2], body[3], body[1]].join("\n"));
    const facts = (s: string) => JSON.stringify(rows(s).map((e) => [e.id, e.contacts]));
    expect(facts(src)).toBe(facts(src));
    expect(facts(shuffled)).toBe(facts(src));
    const r1 = setImpact(src, "W", "4500");
    expect(JSON.stringify(setImpact(src, "W", "4500"))).toBe(JSON.stringify(r1));
    expect(JSON.stringify(setImpact(shuffled, "W", "4500").held)).toBe(JSON.stringify(r1.held));
    // b is pinned, so of p's two edges only a.right moves; the shell's and f's edges stay.
    expect(heldLines(r1)).toEqual(["  wall p stayed at x 4000 while a.right moved to x 4500 (500 mm)"]);
  });
});
