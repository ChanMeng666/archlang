/**
 * Plan-soundness PS2.50: a piece side-on or end-on to a wall is not "back to the room".
 *
 * `W_FIXTURE_BACK_TO_ROOM` declines a piece that needs no services when no edge of it on a wall
 * could be its back (`backCandidateEdges`): a bed lengthwise along a wall, a wardrobe touching one
 * with its end. It still fires where a walled edge could be the back and the front is on it
 * instead (a counter or a bed facing the wall), and for a plumbed piece whatever its layout, since
 * its back must reach a wall. `W_FOOTPRINT_TRANSPOSED` keeps judging `against` pieces (`against`
 * backs a piece onto the wall, so a crib written with its long side along the wall IS drawn
 * head-to-wall and stretched); side-on is spelled `in <room> anchor <edge>` or `at` with a
 * `rotate`, which both rules read as clean, and the hint says so.
 */

import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint } from "../src/index.js";

const B = "W_FIXTURE_BACK_TO_ROOM";
const T = "W_FOOTPRINT_TRANSPOSED";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);

/** A 4000 × 3000 room in a 200 mm shell (centrelines on the room edges), one piece in it. */
const room = (piece: string): string => `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Bedroom" uses bedroom
  door id=d at (3000,3000) width 900 wall shell
  ${piece}
}`;

suite("W_FIXTURE_BACK_TO_ROOM declines a piece side-on or end-on to a wall (PS2.50)", () => {
  it("a bed lengthwise along the north wall, head east (the tiny-house layout): clean", () => {
    const src = room('furniture bed at (1000,100) size 2000x1500 label "Bed" rotate 90 in r');
    expect(of(src, B)).toEqual([]);
    expect(of(src, T)).toEqual([]);
  });

  it("a wardrobe touching the north wall only with its end (hillside-villa Bedroom 2): clean", () => {
    expect(of(room("furniture wardrobe at (2000,100) size 600x1800 rotate 270 in r"), B)).toEqual([]);
    // Every turn of that footprint reads the same: no walled edge could be its back.
    for (const turn of ["", " rotate 90", " rotate 180"])
      expect(of(room(`furniture wardrobe at (2000,100) size 600x1800${turn} in r`), B), turn).toEqual([]);
  });

  it("a counter facing the wall still warns, with the one `rotate` fix", () => {
    const ds = of(room('furniture counter at (1000,100) size 600x600 label "Counter" rotate 180 in r'), B);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'Fixture "Counter" has its back to the room — the wall it stands against is on its top side.',
    );
    expect(ds[0]!.hints![0]).toContain("`rotate 0`");
    expect(ds[0]!.fixes).toHaveLength(1);
  });

  it("a bed with its foot on the wall (a walled edge that could be its back) still warns", () => {
    const ds = of(room("furniture bed at (1000,100) size 1500x2000 rotate 180 in r"), B);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.fixes).toHaveLength(1);
  });

  it("a plumbed piece side-on to a wall still warns: a basin's back must reach a wall", () => {
    const ds = of(room('furniture basin at (1000,100) size 450x600 label "Basin" rotate 90 in r'), B);
    expect(ds).toHaveLength(1);
    // The walled edge cannot be its back at this size, so the hint is the size swap, not a turn.
    expect(ds[0]!.hints![0]).toContain("write `size 600x450`");
    expect(ds[0]!.fixes).toBeUndefined();
  });

  it("is unmoved by a `place` turn or mirror: the side-on bed stays clean, the facing counter warns", () => {
    const body = (piece: string): string => `component nook() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Nook"
    ${piece}
  }`;
    const at = (piece: string, frame: string): Diagnostic[] =>
      of(`plan "P" {\n  units mm\n  ${body(piece)}\n  place nook() as n at (0,0)${frame}\n}`, B);
    for (const frame of ["", " rotate 90", " rotate 180", " mirror x", " rotate 90 mirror y"]) {
      expect(at("furniture bed at (1000,100) size 2000x1500 rotate 90", frame), frame).toEqual([]);
      expect(at("furniture counter at (1000,100) size 600x600 rotate 180", frame), frame).toHaveLength(1);
    }
  });
});

suite("W_FOOTPRINT_TRANSPOSED: side-on placement has a lint-clean spelling (PS2.50)", () => {
  it("a transposed sofa_l still warns", () => {
    expect(of(room("furniture sofa_l at (1000,300) size 900x2400 in r"), T)).toHaveLength(1);
  });

  it("a crib side-on to the north wall by `anchor` + `rotate`, or by `at` + `rotate`: clean", () => {
    for (const piece of [
      "furniture crib in r anchor top size 1300x700 rotate 90",
      "furniture crib at (300,100) size 1300x700 rotate 270 in r",
      "furniture treadmill in r anchor left size 800x1800 rotate 0",
    ]) {
      const src = room(piece);
      expect(of(src, T), piece).toEqual([]);
      expect(of(src, B), piece).toEqual([]);
    }
  });

  it("a crib by `against` with its long side along the wall warns (drawn head-to-wall) and names the side-on spelling", () => {
    const ds = of(room("furniture crib against wall shell segment 0 offset 1500 size 1300x700 in r"), T);
    expect(ds).toHaveLength(1);
    const hint = ds[0]!.hints![0]!;
    expect(hint).toContain("`against` always backs a piece onto the wall");
    expect(hint).toContain("`in <room> anchor <edge>`");
    // The id is assigned: quoted nowhere.
    expect(ds[0]!.message + hint).not.toContain("crib_1");
  });

  it("an authored id is quoted in the hint only, never the message", () => {
    const ds = of(room("furniture id=cot1 crib against wall shell segment 0 offset 1500 size 1300x700 in r"), T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toContain('"cot1"');
    expect(ds[0]!.message).not.toContain("cot1");
  });

  it("a plumbed piece by `against` keeps the swap-only hint", () => {
    const ds = of(room("furniture wc against wall shell segment 0 offset 1500 size 700x400 in r"), T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toContain("the wall it backs onto states its turn");
    expect(ds[0]!.hints![0]).not.toContain("anchor");
  });
});
