import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RDoor, ROpening, RWindow } from "../src/ir.js";

/**
 * T1a — opening attachment (`door|window|opening on <wall> at <pos>`) and
 * T1b — explicit swing/hinge (`swing into <room>`, `hinge near start|end`).
 *
 * An attached opening walks the named wall's polyline to a point (percent / mm /
 * center), pins to that host segment by construction (never "off wall"), and is
 * byte-identical to the hand-computed absolute-coordinate form (twin golden).
 */

// Wall w1: (0,0)->(4000,0), 200 thick. Room r below it (on the +y / interior side).
const plan = (body: string) => `plan "P" {
  units mm
  grid 1
  wall id=w1 exterior thickness 200 { (0,0) (4000,0) }
  room id=r at (0,200) size 4000x3000 label "R"
  ${body}
}`;

const doorOf = (src: string): RDoor => resolve(parse(src).plan!).ir.elements.find((e) => e.kind === "door") as RDoor;

describe("T1a — opening attachment", () => {
  it("attached door is byte-identical to the hand-computed absolute door (twin golden)", () => {
    // 40% of the 4000 mm wall = 1600 mm from start → point (1600, 0) on w1.
    const attached = compile(plan(`door on w1 at 40% width 900 swing out`), { noCache: true });
    const manual = compile(plan(`door at (1600,0) width 900 wall w1 swing out`), { noCache: true });
    expect(attached.errors).toEqual([]);
    expect(attached.svg).toBe(manual.svg);
  });

  it("percent / mm / center resolve to the same point on the wall", () => {
    expect(doorOf(plan(`door on w1 at 40% width 900`)).at).toEqual({ x: 1600, y: 0 });
    expect(doorOf(plan(`door on w1 at 1600 width 900`)).at).toEqual({ x: 1600, y: 0 });
    expect(doorOf(plan(`door on w1 at center width 900`)).at).toEqual({ x: 2000, y: 0 });
  });

  it("an attached opening always has a host (never W_*_OFF_WALL)", () => {
    const { diagnostics } = compile(plan(`door on w1 at 10% width 900`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_DOOR_OFF_WALL")).toBe(false);
    expect(doorOf(plan(`door on w1 at 10% width 900`)).host).not.toBeNull();
  });

  it("walks a multi-segment polyline by cumulative length", () => {
    // L-shaped wall: (0,0)->(2000,0) [len 2000] ->(2000,2000) [len 2000]; total 4000.
    const src = `plan "P" {
      units mm
      grid 1
      wall id=w exterior thickness 200 { (0,0) (2000,0) (2000,2000) }
      door on w at 75% width 800
    }`;
    // 75% of 4000 = 3000 → 1000 into the 2nd (vertical) segment → (2000, 1000).
    const d = doorOf(src);
    expect(d.at).toEqual({ x: 2000, y: 1000 });
    expect(d.host!.index).toBe(1);
  });

  it("window and opening attach the same way", () => {
    const w = resolve(parse(plan(`window on w1 at 50% width 1200`)).plan!).ir.elements.find(
      (e) => e.kind === "window",
    ) as RWindow;
    const o = resolve(parse(plan(`opening on w1 at 25% width 800`)).plan!).ir.elements.find(
      (e) => e.kind === "opening",
    ) as ROpening;
    expect(w.at).toEqual({ x: 2000, y: 0 });
    expect(w.host).not.toBeNull();
    expect(o.at).toEqual({ x: 1000, y: 0 });
    expect(o.host).not.toBeNull();
  });

  it("raises E_ATTACH_WALL_REF for an unknown wall", () => {
    const { diagnostics } = compile(plan(`door on nope at 50% width 900`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_ATTACH_WALL_REF")).toBe(true);
  });

  it("raises E_ATTACH_POS_RANGE for a percent past 100 or an mm past the wall length", () => {
    expect(
      compile(plan(`door on w1 at 150% width 900`), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_ATTACH_POS_RANGE",
      ),
    ).toBe(true);
    expect(
      compile(plan(`door on w1 at 9000 width 900`), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_ATTACH_POS_RANGE",
      ),
    ).toBe(true);
  });

  it("round-trips the `on … at` clause through the formatter", () => {
    expect(format(plan(`door on w1 at 40% width 900`))).toContain("door on w1 at 40% width 900");
    expect(format(plan(`window on w1 at center width 1200`))).toContain("window on w1 at center width 1200");
    expect(format(plan(`opening on w1 at 1600 width 800`))).toContain("opening on w1 at 1600 width 800");
  });
});

describe("T1b — swing into / hinge near", () => {
  it("`swing into <room>` picks the side toward that room (byte-identical to explicit swing)", () => {
    // Room r is on the +y side of w1 (dir (1,0), left-normal (0,1)) → swing "in".
    expect(doorOf(plan(`door on w1 at 50% width 900 swing into r`)).swing).toBe("in");
    const into = compile(plan(`door on w1 at 50% width 900 swing into r`), { noCache: true });
    const explicit = compile(plan(`door on w1 at 50% width 900 swing in`), { noCache: true });
    expect(into.svg).toBe(explicit.svg);
  });

  it("warns W_SWING_ROOM_NOT_ADJACENT and falls back when the room does not border the wall", () => {
    const src = `plan "P" {
      units mm
      grid 1
      wall id=w1 exterior thickness 200 { (0,0) (4000,0) }
      room id=far at (9000,9000) size 100x100
      door on w1 at 50% width 900 swing into far
    }`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_SWING_ROOM_NOT_ADJACENT")).toBe(true);
    expect(doorOf(src).swing).toBe("in"); // default
  });

  it("`hinge near start|end` maps to the wall-vertex side (start→left, end→right)", () => {
    expect(doorOf(plan(`door on w1 at 50% width 900 hinge near start`)).hinge).toBe("left");
    expect(doorOf(plan(`door on w1 at 50% width 900 hinge near end`)).hinge).toBe("right");
  });

  it("round-trips swing into / hinge near through the formatter", () => {
    const out = format(plan(`door on w1 at 50% width 900 hinge near end swing into r`));
    expect(out).toContain("hinge near end");
    expect(out).toContain("swing into r");
  });
});

/**
 * S.2 — the attachment position is an EXPRESSION (v1.27.0).
 *
 * Before this, `at` in the `on <wall> at <pos>` form read a single `number` token, so
 * neither a `let` binding nor any arithmetic was legal there. That is not a cosmetic gap:
 * it made the form UNREACHABLE from a `for` loop, which is exactly the case it exists to
 * serve — a generated run of openings had to fall back to the absolute `at (x,y) … wall
 * <id>` form and hand-compute the very coordinate `on … at` removes
 * (`examples/transit-hall.arch` is the shipped instance). Both refusals also came back as
 * raw parser expectations with NO code, so `--code` could not select them and the catalog
 * did not document them.
 *
 * The law that bounds the change: a plan that does not use an expression there compiles,
 * describes, lints and FORMATS exactly as before, because a literal `1200` parses to
 * `{ t: "num", value: 1200 }` and evaluates to the number it always did. The whole-corpus
 * proof is the shipped goldens and `test/example-svgs-drift.test.ts`; the targeted proof
 * is the literal-versus-expression twin below.
 */
describe("S.2 — an attachment position is an expression", () => {
  it("takes a `let` binding, arithmetic, a call, and a percent suffix on all of them", () => {
    const cases: [string, number][] = [
      [`let p = 1000\n  door on w1 at p width 900`, 1000],
      [`door on w1 at 1000 + 500 width 900`, 1500],
      [`let p = 400\n  door on w1 at p * 2 + 200 width 900`, 1000],
      [`door on w1 at min(1200, 3000) width 900`, 1200],
      [`let p = 25\n  door on w1 at p + 25% width 900`, 2000], // 50% of the 4000 mm run
      [`door on w1 at (0 - 500) + 1000 width 900`, 500],
    ];
    for (const [body, x] of cases) {
      const { diagnostics } = compile(plan(body), { noCache: true });
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(doorOf(plan(body)).at, body).toEqual({ x, y: 0 });
    }
  });

  it("a `for`-generated run places itself along the wall — the case the form exists for", () => {
    // The red-then-green case from docs/backlog.md S.2. Every door lands where the
    // arithmetic says, which is what makes the absolute-coordinate fallback unnecessary.
    const src = plan(`let bay = 900\n  for i in 0..4 { door on w1 at bay * i + 600 width 700 }`);
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const doors = resolve(parse(src).plan!).ir.elements.filter((e) => e.kind === "door") as RDoor[];
    expect(doors.map((d) => d.at.x)).toEqual([600, 1500, 2400, 3300]);
  });

  it("BYTE-IDENTITY: an expression that evaluates to N renders exactly like the literal N", () => {
    // Both halves of the law: the literal form is untouched, and the expression form is
    // not a second code path — it lowers to the same number and so to the same bytes.
    const literal = compile(plan(`door on w1 at 1600 width 900 swing out`), { noCache: true });
    const expr = compile(plan(`let p = 800\n  door on w1 at p * 2 width 900 swing out`), { noCache: true });
    expect(literal.errors).toEqual([]);
    expect(expr.svg).toBe(literal.svg);
    const litPct = compile(plan(`door on w1 at 40% width 900 swing out`), { noCache: true });
    const exprPct = compile(plan(`let p = 10\n  door on w1 at p * 4% width 900 swing out`), { noCache: true });
    expect(exprPct.svg).toBe(litPct.svg);
  });

  it("round-trips an expression position through the formatter (not the resolved number)", () => {
    // `arch fmt` re-emits the AUTHORED expression. Printing `1500` here would silently
    // constant-fold a plan's source — and inside a `for`, would collapse the whole run
    // onto one coordinate.
    const out = format(plan(`let bay = 900\n  for i in 0..4 { door on w1 at bay * i + 600 width 700 }`));
    expect(out).toContain("door on w1 at bay * i + 600 width 700");
    expect(format(plan(`door on w1 at 10 + 15% width 900`))).toContain("door on w1 at 10 + 15% width 900");
  });

  it("`%` ENDS the position — a bare modulo is refused, a parenthesised one is not", () => {
    // The one grammar consequence, stated in spec.llm.md and mirrored by the GBNF's
    // `attach-expr`: in this slot `%` is the percent suffix, never the operator.
    const bare = compile(plan(`door on w1 at 5000 % 3000 width 900`), { noCache: true });
    expect(bare.diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
    const parens = compile(plan(`door on w1 at (5000 % 3000) width 900`), { noCache: true });
    expect(parens.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(doorOf(plan(`door on w1 at (5000 % 3000) width 900`)).at).toEqual({ x: 2000, y: 0 });
  });

  it("`center` stays a keyword, not a reference", () => {
    // `center` is matched before the expression parser sees it, so it cannot be captured
    // by a same-named binding — the pre-expression behaviour, pinned.
    expect(doorOf(plan(`let center = 100\n  door on w1 at center width 900`)).at).toEqual({ x: 2000, y: 0 });
  });
});

/**
 * S.2, second half — every refusal the slot has left carries a CATALOGUED code.
 *
 * The backlog entry's parting note was that the two reported failures came back with no
 * `E_*` at all. Both now compile, so what is audited here is what REMAINS refusable, and
 * the requirement is the project's standing one: a byte span and a code the catalog
 * documents. `E_PARSE` is that code for a SHAPE refusal (see `src/error-catalog.ts`);
 * everything else is a semantic code the evaluator or the range check already raised.
 */
describe("S.2 — every refusal in the slot is coded", () => {
  const REFUSALS: [string, string, string][] = [
    ["no value at all", `door on w1 at width 900`, "E_PARSE"],
    ["a trailing operator", `door on w1 at 1200 + width 900`, "E_PARSE"],
    ["an unbound name", `door on w1 at nope width 900`, "E_UNKNOWN_REF"],
    ["a non-numeric value", `door on w1 at "x" width 900`, "E_TYPE"],
    ["division by zero", `door on w1 at 1200 / 0 width 900`, "E_DIV_ZERO"],
    ["past the end of the run", `door on w1 at 3000 + 3000 width 900`, "E_ATTACH_POS_RANGE"],
    ["a percentage past 100", `door on w1 at 60 + 60% width 900`, "E_ATTACH_POS_RANGE"],
    ["an unknown wall", `door on nope at 50% width 900`, "E_ATTACH_WALL_REF"],
  ];

  for (const [label, body, code] of REFUSALS) {
    it(`${label} → ${code}`, () => {
      const errors = compile(plan(body), { noCache: true }).diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.map((d) => d.code)).toContain(code);
      // A code is only half of it: a diagnostic an agent cannot locate is not actionable.
      for (const d of errors) expect(d.span, `${label}: ${d.message}`).toBeDefined();
    });
  }

  it("a NON-FINITE position is refused rather than drawn — the hole an expression opens", () => {
    // `NaN < 0 || NaN > total` is false on BOTH sides, so without an explicit finiteness
    // check a non-finite position walks straight past the range test into
    // `segmentPointAlong` and puts NaN in the drawing. Only an expression can produce
    // one; a literal never could, which is why the guard arrives with this feature.
    const big = "10000000000000000000000000000000000000000";
    const overflow = `let a = ${big}\n  let b = a * a\n  let c = b * b\n  let d = c * c`;
    for (const body of [`${overflow}\n  door on w1 at d width 900`, `${overflow}\n  door on w1 at d - d width 900`]) {
      const { svg, diagnostics } = compile(plan(body), { noCache: true });
      expect(diagnostics.map((d) => d.code)).toContain("E_ATTACH_POS_RANGE");
      expect(svg).not.toContain("NaN");
    }
  });
});
