/**
 * CR2 group D: `W_FURNITURE_ON_VOID`, a piece standing on a void, a lift shaft or an escalator of its
 * own storey, and `finish` keeping a single-storey plan's pieces off a void (it used to read voids
 * only on a plan of `level` blocks, so it stood a sofa over a stairwell).
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, finish, lint } from "../src/index.js";
import { LINT_RULES } from "../src/lint/rules/index.js";

const CODE = "W_FURNITURE_ON_VOID";
const of = (src: string, code = CODE): Diagnostic[] => lint(src).filter((d) => d.code === code);
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;

const ROOM = `  room id=liv at (0,0) size 6000x5000 label "Living"`;
const VOID = `  void id=v at (0,0) size 3000x2500`;

suite("W_FURNITURE_ON_VOID", () => {
  it("reports a piece over a void, naming the piece and the room, and the void's id only in the hint", () => {
    const src = plan(ROOM, VOID, `  furniture id=s sofa at (1000,500) size 2000x900`);
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      'Furniture "sofa" stands on a void in "Living": it covers 2000 × 900 mm of the hole in this floor, and there is no floor there to stand on.',
    );
    expect(d!.message).not.toContain("`v`");
    expect(d!.hints).toEqual(["Move or resize it so it clears `v` (x 0–3000, y 0–2500), or move the void."]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toContain("furniture id=s sofa");
  });

  it("the control: the same piece beside the void, and a piece touching its edge, are silent", () => {
    expect(of(plan(ROOM, VOID, `  furniture id=s sofa at (3500,500) size 2000x900`))).toEqual([]);
    expect(of(plan(ROOM, VOID, `  furniture id=s sofa at (3000,500) size 2000x900`))).toEqual([]);
    expect(of(plan(ROOM, `  furniture id=s sofa at (1000,500) size 2000x900`))).toEqual([]);
  });

  it("reads a rotated piece by its turned footprint", () => {
    // Read by `rectOf`, as W_FURNITURE_ON_STAIR reads a piece: beside the void's x 3000 edge, then 500 mm over it.
    expect(of(plan(ROOM, VOID, `  furniture id=s sofa at (3200,0) size 2000x900 rotate 90`))).toEqual([]);
    const over = of(plan(ROOM, VOID, `  furniture id=s sofa at (2500,0) size 2000x900 rotate 90`));
    expect(over).toHaveLength(1);
    expect(over[0]!.message).toContain("it covers 500 × 900 mm");
  });

  it("reads whatever stands there, a rug as much as a wardrobe", () => {
    expect(of(plan(ROOM, VOID, `  furniture id=r rug at (500,500) size 1600x1200`))).toHaveLength(1);
  });

  it("one warning per piece and void, however many pieces", () => {
    const src = plan(
      ROOM,
      VOID,
      `  void id=v2 at (3500,3000) size 2000x1500`,
      `  furniture id=a sofa at (1000,500) size 2000x900`,
      `  furniture id=b table at (2500,2000) size 1500x1500`,
    );
    // `b` spans x 2500–4000, y 2000–3500: over `v` and over `v2`.
    expect(of(src).map((d) => d.hints![0]!.slice(0, 40))).toEqual([
      "Move or resize it so it clears `v` (x 0–",
      "Move or resize it so it clears `v` (x 0–",
      "Move or resize it so it clears `v2` (x 3",
    ]);
  });

  const LEVELS = (l1: string[], l2: string[]): string =>
    plan(
      `  level 1 {`,
      `    room id=g at (0,0) size 6000x5000 label "Hall"`,
      ...l1.map((l) => `    ${l}`),
      `  }`,
      `  level 2 {`,
      `    room id=u at (0,0) size 6000x5000 label "Landing"`,
      ...l2.map((l) => `    ${l}`),
      `  }`,
    );

  it("a void is a hole in its OWN storey: a piece under the void of the storey above is silent", () => {
    const piece = `furniture id=t table at (500,500) size 1200x800`;
    const hole = `void id=v at (0,0) size 3000x2500`;
    expect(of(LEVELS([piece], [hole]))).toEqual([]);
    const on = of(LEVELS([], [hole, piece]));
    expect(on).toHaveLength(1);
    expect(on[0]!.level).toBe(2);
    // On a plan of several storeys the message says which, as the stair rule's does.
    expect(on[0]!.message).toContain('stands on a void in "Landing" on level 2:');
    expect(of(plan(ROOM, VOID, `  furniture id=s sofa at (1000,500) size 2000x900`))[0]!.message).not.toContain(
      "on level",
    );
  });

  /** A stairwell drawn the usual way: the flight coming down on level 2, and a void on its rectangle. */
  const WELL = (piece: string, opts: { stair?: boolean; hole?: string } = {}): string =>
    LEVELS(
      [`stair id=s1 at (3000,500) size 1000x3000 dir up`],
      [
        ...(opts.stair === false ? [] : [`stair id=s1 at (3000,500) size 1000x3000 dir down`]),
        opts.hole ?? `void id=v at (3000,500) size 1000x3000`,
        piece,
      ],
    );

  it("a drawn stairwell (a stair and a void on one rectangle) reads the void too, beside the stair rule", () => {
    for (const piece of [
      `furniture id=t table at (3200,1500) size 600x600`, // wholly on the well
      `furniture id=t table at (3700,1500) size 600x600`, // half on it, half on the floor beside it
    ]) {
      const src = WELL(piece);
      expect(of(src, "W_FURNITURE_ON_STAIR"), piece).toHaveLength(1);
      expect(of(src), piece).toHaveLength(1);
    }
  });

  /**
   * Red-team round 2 (CR2d): a yield to the stair rule on the stair's whole footprint lost these
   * from both rules, because the stair rule reads only part of it (the low part of a flight rising
   * from this storey, a mid landing only for a body-layer piece). Each must raise this code.
   */
  it.each([
    [
      "a table under the high end of a `dir up` flight drawn over a void",
      `plan "t" {
  units mm
  grid 50
  room id=liv at (0,0) size 6000x5000 label "Living"
  stair id=s1 at (3000,500) size 1000x3000 dir up
  void id=v at (3000,500) size 1000x3000
  furniture id=t table at (3200,700) size 600x600
}
`,
    ],
    [
      "a rug on a block stair's mid landing drawn over a void",
      `plan "t" {
  units mm
  grid 50
  room id=liv at (0,0) size 8000x6000 label "Living"
  stair id=s1 dir up width 1000 { flight at (3000,3000) size 1000x2000 landing at (3000,2000) size 2000x1000 flight at (4000,3000) size 1000x2000 }
  void id=v at (3000,2000) size 2000x3000
  furniture id=r rug at (3200,2100) size 600x600
}
`,
    ],
    [
      "a 2 mm overlap with a void a 1 mm narrower stair stands in",
      `plan "t" {
  units mm
  grid 1
  level 1 {
    room id=g at (0,0) size 6000x5000 label "Hall"
    stair id=s1 at (3001,500) size 999x3000 dir up
  }
  level 2 {
    room id=u at (0,0) size 6000x5000 label "Landing"
    stair id=s1 at (3001,500) size 999x3000 dir down
    void id=v at (3000,500) size 1000x3000
    furniture id=t table at (2402,1500) size 600x600
  }
}
`,
    ],
  ])("%s raises it", (_n, src) => {
    expect(of(src)).toHaveLength(1);
  });

  it("the controls: a void with no stair fires, and so does a larger void, beside or away from the flight", () => {
    const piece = `furniture id=t table at (3200,1500) size 600x600`;
    expect(of(WELL(piece, { stair: false }))).toHaveLength(1);
    // An atrium wider than the flight: a table straddling the flight's side reaches the open void.
    const atrium = WELL(`furniture id=t table at (3700,1500) size 600x600`, {
      hole: `void id=v at (3000,500) size 2500x3000`,
    });
    expect(of(atrium, "W_FURNITURE_ON_STAIR")).toHaveLength(1);
    expect(of(atrium)).toHaveLength(1);
    // A table on the atrium away from the flight is the void rule's alone.
    const away = WELL(`furniture id=t table at (4600,1500) size 600x600`, {
      hole: `void id=v at (3000,500) size 2500x3000`,
    });
    expect(of(away, "W_FURNITURE_ON_STAIR")).toEqual([]);
    expect(of(away)).toHaveLength(1);
  });

  it("reads a lift shaft and an escalator, and names them as such", () => {
    const lift = of(
      LEVELS(
        [`elevator id=l at (4000,500) size 1500x1500`, `furniture id=t table at (4500,1000) size 800x800`],
        [`elevator id=l at (4000,500) size 1500x1500`],
      ),
    );
    expect(lift).toHaveLength(1);
    expect(lift[0]!.message).toContain("stands on a lift shaft");
    expect(lift[0]!.hints![0]).toContain("or move the lift.");
    const esc = of(
      plan(
        ROOM,
        `  escalator id=e at (500,500) size 1000x4000 dir up`,
        `  furniture id=t table at (600,1000) size 800x800`,
      ),
    );
    expect(esc).toHaveLength(1);
    expect(esc[0]!.message).toContain("stands on an escalator");
  });

  it("leaves a stair to W_FURNITURE_ON_STAIR", () => {
    const src = plan(
      ROOM,
      `  stair id=s1 at (3000,500) size 1000x3000 dir up`,
      `  furniture sofa at (2500,1000) size 900x2000 rotate 90`,
    );
    expect(of(src, "W_FURNITURE_ON_STAIR")).toHaveLength(1);
    expect(of(src)).toEqual([]);
  });

  it("is appended last, so no existing diagnostic moves within the array", () => {
    expect(LINT_RULES.at(-1)!.name).toBe("furniture-on-void");
    expect(LINT_RULES.at(-1)!.codes).toEqual([CODE]);
  });
});

suite("finish keeps a single-storey plan's pieces off a void", () => {
  const SRC = plan(
    `  room id=liv at (0,0) size 6000x5000 label "Living"`,
    `  walls from rooms exterior 200 partition 100`,
    `  door id=f on liv.bottom at 1000 from liv.left width 900`,
    `  window on liv.top width 1500`,
    `  void id=v at (0,0) size 6000x2500`,
  );

  it("the finished plan stands nothing on the void, and still furnishes the room", () => {
    const r = finish(SRC, { only: "furnish" });
    expect(r.source).toContain("furniture sofa in liv");
    expect(of(r.source)).toEqual([]);
  });

  it("the control: the same room without the void is furnished where the void was", () => {
    const without = finish(SRC.replace("  void id=v at (0,0) size 6000x2500\n", ""), { only: "furnish" });
    expect(without.source).toContain("furniture sofa in liv");
    // With the void, the old placement (against the right wall, across y 1500–3500) is reported.
    const old = `${SRC.replace(/\n}\n$/, "\n")}  furniture sofa in liv anchor right flush size 900x2000 rotate 90\n}\n`;
    expect(of(old)).toHaveLength(1);
  });
});
