/**
 * Plan-soundness PS2.50: a piece side-on or end-on to a wall is not "back to the room".
 *
 * `W_FIXTURE_BACK_TO_ROOM` declines when no edge of the piece on a wall could be its back
 * (`backCandidateEdges`) AND its drawn front is off the wall too: a bed lengthwise along a wall,
 * a wardrobe touching one with its end. It still fires where the drawn front is on a wall
 * (whatever the aspect: a nightstand `400x450 rotate 180`), where a walled edge could be the
 * back and the front is on it (a counter or a bed facing the wall), and for a piece whose back
 * must reach any wall it touches (`backsOntoWall`: a plumbed piece, or a wall-mounted radiator,
 * fireplace, TV or EV charger). `W_FOOTPRINT_TRANSPOSED` keeps judging `against` pieces
 * (`against` backs a piece onto the wall, so a crib written with its long side along the wall IS
 * drawn head-to-wall and stretched); side-on is spelled `at (x,y)` or
 * `in <room> anchor <edge> flush` with a `rotate`, which raises no furniture code, and the hint
 * gives that spelling with the piece's own numbers.
 */

import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint } from "../src/index.js";
import { LINT_RULES } from "../src/lint/rules/index.js";

const B = "W_FIXTURE_BACK_TO_ROOM";
const T = "W_FOOTPRINT_TRANSPOSED";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);

/** Every code the furniture-family rules can raise, read off the rule list itself. */
const FURNITURE_CODES = new Set(LINT_RULES.filter((r) => r.family === "furniture").flatMap((r) => r.codes));
const furnitureCodes = (src: string): string[] =>
  lint(src).flatMap((d) => (d.code !== undefined && FURNITURE_CODES.has(d.code) ? [d.code] : []));

/** A room in a 200 mm shell (centrelines on the room edges), its door on the south wall, one
 *  piece in it. 4000 × 3000 unless a piece needs the floor in front of it. */
const room = (piece: string, w = 4000, h = 3000): string => `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }
  room id=r at (0,0) size ${w}x${h} label "Bedroom" uses bedroom
  door id=d at (${w - 1000},${h}) width 900 wall shell
  ${piece}
}`;

suite("W_FIXTURE_BACK_TO_ROOM declines a piece side-on or end-on to a wall (PS2.50)", () => {
  it("the furniture family has codes to check against", () => {
    expect(FURNITURE_CODES.has(B)).toBe(true);
    expect(FURNITURE_CODES.has(T)).toBe(true);
  });

  it("a bed lengthwise along the north wall, head east (the tiny-house layout): clean", () => {
    const src = room('furniture bed at (1000,100) size 2000x1500 label "Bed" rotate 90 in r');
    expect(of(src, B)).toEqual([]);
    expect(of(src, T)).toEqual([]);
  });

  it("a 550x1800 wardrobe touching the north wall only with its end (hillside-villa Bedroom 2): clean", () => {
    expect(of(room("furniture wardrobe at (2000,100) size 550x1800 rotate 270 in r"), B)).toEqual([]);
    // Its other end-on turns, front off the wall: no walled edge could be its back.
    for (const turn of ["", " rotate 90"])
      expect(of(room(`furniture wardrobe at (2000,100) size 550x1800${turn} in r`), B), turn).toEqual([]);
  });

  it("a piece whose drawn FRONT is on the wall warns, whatever its aspect", () => {
    // `rotate 180` puts the front on the top edge, which is on the north wall.
    for (const piece of [
      "furniture wardrobe at (2000,100) size 600x1800 rotate 180 in r",
      "furniture nightstand at (2000,100) size 400x450 rotate 180 in r",
    ])
      expect(of(room(piece), B), piece).toHaveLength(1);
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

  it("a wall-mounted piece end-on to a wall still warns: radiator, fireplace, TV, EV charger", () => {
    // Each touches the north wall with an end, its back east and its front west, both off the
    // wall: the layout a wardrobe is allowed, and the wrong way round for these four.
    for (const piece of [
      "furniture radiator at (2000,100) size 100x1000 rotate 90 in r",
      "furniture fireplace at (2000,100) size 400x1200 rotate 90 in r",
      "furniture tv at (2000,100) size 80x1200 rotate 90 in r",
      "furniture ev_charger at (2000,100) size 300x400 rotate 90 in r",
    ])
      expect(of(room(piece), B), piece).toHaveLength(1);
    // The same turn and floor for a wardrobe is the end-on layout, and is clean.
    expect(of(room("furniture wardrobe at (2000,100) size 600x1800 rotate 90 in r"), B)).toEqual([]);
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

  it("a bed, a crib and a treadmill side-on by `at` or `anchor … flush` + `rotate` raise no furniture code", () => {
    for (const piece of [
      'furniture bed at (1000,100) size 2000x1500 label "Bed" rotate 90 in r',
      "furniture crib in r anchor top flush size 1300x700 rotate 90",
      "furniture crib at (300,100) size 1300x700 rotate 270 in r",
      "furniture treadmill in r anchor left flush size 800x1800 rotate 0",
    ])
      expect(furnitureCodes(room(piece, 5000, 4000)), piece).toEqual([]);
  });

  it("a crib by `against` warns (drawn head-to-wall), and the hinted spelling raises no furniture code", () => {
    // North wall and east wall: the recipe keeps the resolved floor and turns the symbol.
    for (const [against, recipe] of [
      ["segment 0 offset 1500", "at (850,100) size 1300x700 rotate 90"],
      ["segment 1 offset 1500", "at (3200,850) size 700x1300 rotate 180"],
    ] as const) {
      const ds = of(room(`furniture crib against wall shell ${against} size 1300x700 in r`), T);
      expect(ds, against).toHaveLength(1);
      const hint = ds[0]!.hints![0]!;
      expect(hint).toContain("`against` always backs a piece onto the wall");
      expect(hint).toContain(`\`${recipe}\``);
      expect(hint).toContain("`in <room> anchor <edge> flush`");
      // The id is assigned: quoted nowhere.
      expect(ds[0]!.message + hint).not.toContain("crib_1");
      expect(furnitureCodes(room(`furniture crib ${recipe} in r`)), recipe).toEqual([]);
    }
  });

  it("inside a turned `place`, the recipe's size and turn are the component's own, its position left open", () => {
    const body = (piece: string): string => `component nook() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Nook"
    ${piece}
  }`;
    const plan = (piece: string): string =>
      `plan "P" {\n  units mm\n  ${body(piece)}\n  place nook() as n at (0,0) rotate 90\n}`;
    const ds = of(plan("furniture crib against wall shell segment 0 offset 1500 size 1300x700 in r"), T);
    expect(ds).toHaveLength(1);
    const hint = ds[0]!.hints![0]!;
    // In the component's frame the crib stands on the north wall: the root recipe's size and turn.
    expect(hint).toContain("`at (x,y) size 1300x700 rotate 90`");
    expect(furnitureCodes(plan("furniture crib at (850,100) size 1300x700 rotate 90 in r"))).toEqual([]);
  });

  it("an authored id is quoted in the hint only, never the message", () => {
    const ds = of(room("furniture id=cot1 crib against wall shell segment 0 offset 1500 size 1300x700 in r"), T);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toContain('"cot1"');
    expect(ds[0]!.message).not.toContain("cot1");
  });

  it("no side-on recipe for a wide family or one that backs onto any wall it touches", () => {
    for (const piece of [
      "furniture wc against wall shell segment 0 offset 1500 size 700x400 in r",
      "furniture tv against wall shell segment 0 offset 1500 size 80x1200 in r",
      "furniture bar_counter against wall shell segment 0 offset 1500 size 600x1800 in r",
    ]) {
      const ds = of(room(piece), T);
      expect(ds, piece).toHaveLength(1);
      expect(ds[0]!.hints![0], piece).toContain("the wall it backs onto states its turn");
      expect(ds[0]!.hints![0], piece).not.toContain("side-on");
    }
  });
});
