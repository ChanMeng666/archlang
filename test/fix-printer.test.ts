/**
 * `emitOpening` (W4b) rebuilds a whole door/window/opening statement through the shared
 * printer (`printDoc(statementText(...))`) instead of a second, hand-written enumeration
 * of clauses, precisely so a rebuild never silently drops one — `sill`/`head` above all,
 * which the OLD `emitOpening` never printed (see `test/emit-opening-oracle.test.ts` for
 * the byte-identity half of that migration). This file pins the other half: every fix
 * producer that rebuilds an opening statement keeps every clause it was not asked to
 * change, including `sill`/`head`.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyFixes, compile, lint } from "../src/index.js";
import type { DoorNode, OpeningNode, PlanNode, Statement, WindowNode } from "../src/ast.js";
import { parse } from "../src/parser.js";
import { emitOpening } from "../src/fix-producers.js";
import { statementText } from "../src/statement-print.js";
import { printDoc } from "../src/doc.js";
import { archPlan } from "./arbitrary-plan.js";

type OpeningLikeNode = DoorNode | WindowNode | OpeningNode;

function collectOpenings(stmts: Statement[], out: OpeningLikeNode[]): void {
  for (const s of stmts) {
    switch (s.kind) {
      case "door":
      case "window":
      case "opening":
        out.push(s);
        break;
      case "for":
      case "while":
        collectOpenings(s.body, out);
        break;
      case "if":
        collectOpenings(s.then, out);
        if (s.else) collectOpenings(s.else, out);
        break;
      case "zone":
      case "level":
        collectOpenings(s.body, out);
        break;
      default:
        break;
    }
  }
}

function allOpenings(plan: PlanNode): OpeningLikeNode[] {
  const out: OpeningLikeNode[] = [];
  collectOpenings(plan.body, out);
  for (const c of plan.components.values()) collectOpenings(c.body, out);
  return out;
}

// ---------------------------------------------------------------------------
// Property: every `EmitOpts` combination a real call site uses keeps sill/head.
// ---------------------------------------------------------------------------

const FUZZ_PLANS = fc.sample(archPlan, { numRuns: 300, seed: 20260927 });
const HEIGHTS_OPENINGS: OpeningLikeNode[] = FUZZ_PLANS.flatMap((src) => {
  const { plan } = parse(src);
  return plan ? allOpenings(plan) : [];
}).filter((n) => ("sill" in n && n.sill !== undefined) || n.head !== undefined);

describe("emitOpening preserves every clause it was not asked to change (incl. sill/head/heights)", () => {
  it("the extended arbitrary actually produced heights-carrying openings to test against", () => {
    expect(HEIGHTS_OPENINGS.length).toBeGreaterThan(0);
  });

  // The clause each op is titled after is exactly what it changes; sill/head must
  // survive every one of them, because none is meant to touch either.
  const OPS: { name: string; run: (kind: "door" | "window" | "opening", n: OpeningLikeNode) => string }[] = [
    { name: "width placeholder", run: (k, n) => emitOpening(k, n, { width: "<positive-number>" }) },
    { name: "off-wall lead override", run: (k, n) => emitOpening(k, n, { lead: "on w1 at 33.333%" }) },
    {
      name: "door-kind-clause drop (hinge)",
      run: (k, n) => emitOpening(k, n, { drop: ["hinge"] }),
    },
    {
      name: "door-open-range clamp",
      run: (k, n) => emitOpening(k, n, { open: "0.5" }),
    },
    { name: "hinge flip (left)", run: (k, n) => emitOpening(k, n, { hinge: "left" }) },
    { name: "hinge flip (right)", run: (k, n) => emitOpening(k, n, { hinge: "right" }) },
  ];

  // One `it()` per op, looping every heights-carrying opening internally and
  // collecting every failure — one `it()` per (opening, op) pair would otherwise put
  // thousands of cases in the suite for no more signal than a single assertion over
  // the whole set gives.
  for (const { name, run } of OPS) {
    it(`${name} (over ${HEIGHTS_OPENINGS.length} heights-carrying openings)`, () => {
      const failures: string[] = [];
      for (const node of HEIGHTS_OPENINGS) {
        const original = printDoc(statementText(node));
        const sillClause = /\bsill [^\s]+/.exec(original)?.[0];
        const headClause = /\bhead [^\s]+/.exec(original)?.[0];
        const out = run(node.kind, node);
        const missing: string[] = [];
        if (sillClause && !out.includes(sillClause)) missing.push(sillClause);
        if (headClause && !out.includes(headClause)) missing.push(headClause);
        if (missing.length > 0) {
          failures.push(`${node.kind} ${node.id ?? "<anon>"}: missing ${missing.join(", ")} in "${out}"`);
        }
      }
      expect(failures.length, `${failures.length}/${HEIGHTS_OPENINGS.length} dropped a clause:\n\n${failures.slice(0, 10).join("\n")}`).toBe(
        0,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// A concrete regression per fix producer.
// ---------------------------------------------------------------------------

const shell = (extra: string): string => `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  wall id=mid partition thickness 100 { (2500,0) (2500,4000) }
  room id=west at (0,0) size 2500x4000 label "West"
  room id=east at (2500,0) size 2500x4000 label "East"
  ${extra}
}`;

describe("a concrete regression per fix producer", () => {
  it("off-wall fix (W_WINDOW_OFF_WALL): a floating window with `sill 900 head 2100` keeps both once attached", () => {
    const src = shell("window id=w at (2500,9000) width 1000 sill 900 head 2100");
    const diag = compile(src).diagnostics.find((d) => d.code === "W_WINDOW_OFF_WALL")!;
    expect(diag).toBeDefined();
    // Point (2500,9000) is equidistant from `w1`'s top edge and `mid`'s far endpoint (both
    // meet at (2500,4000)), so the fix is `maybe-incorrect` — still the exact text this
    // regression cares about, and still worth applying explicitly to prove it compiles.
    const newText = diag.fixes![0]!.edits[0]!.newText;
    expect(newText).toContain("sill 900 head 2100");
    expect(newText).toMatch(/window id=w on w\d+ at [\d.]+% width 1000 sill 900 head 2100/);
    const applied = applyFixes(src, diag.fixes!, { maxApplicability: "maybe-incorrect" }).output;
    expect(compile(applied).diagnostics.map((d) => d.code)).not.toContain("W_WINDOW_OFF_WALL");
  });

  it("door-kind-clause fix (E_DOOR_KIND_CLAUSE): dropping `hinge` off a pocket door keeps `head 2100`", () => {
    const src = shell("door id=d pocket on mid at 50% width 900 hinge left slide right head 2100");
    const diag = compile(src).diagnostics.find((d) => d.code === "E_DOOR_KIND_CLAUSE")!;
    expect(diag).toBeDefined();
    const applied = applyFixes(src, diag.fixes!).output;
    expect(applied).toContain("door id=d pocket on mid at 50% width 900 slide right head 2100");
    expect(compile(applied).errors).toEqual([]);
  });

  it("door-open-range fix (E_DOOR_OPEN_RANGE): clamping `open 1.5` keeps `head 2100`", () => {
    const src = shell("door id=d sliding on mid at 50% width 900 open 1.5 head 2100");
    const diag = compile(src).diagnostics.find((d) => d.code === "E_DOOR_OPEN_RANGE")!;
    expect(diag).toBeDefined();
    const applied = applyFixes(src, diag.fixes!).output;
    expect(applied).toContain("open 1 head 2100");
    expect(compile(applied).errors).toEqual([]);
  });

  it("opening-width fix (E_WINDOW_WIDTH): a zero-width window keeps `sill 900 head 2100`", () => {
    const src = shell("window id=w on w1 at 50% width 0 sill 900 head 2100");
    const diag = compile(src).diagnostics.find((d) => d.code === "E_WINDOW_WIDTH")!;
    expect(diag).toBeDefined();
    expect(diag.fixes![0]!.edits[0]!.newText).toContain("sill 900 head 2100");
    expect(diag.fixes![0]!.edits[0]!.newText).toContain("width <positive-number>");
  });

  it("door hinge-flip fix (W_SWING_OBSTRUCTED): the flipped statement keeps `head 2100`", () => {
    // `W_SWING_OBSTRUCTED` is a lint-only rule (not raised by `compile().diagnostics`),
    // hence `lint()` here. The obstruction (`test/lint-deficits.test.ts`'s `flipClears`
    // shape) sits in the disc swept from the LEFT hinge only, so the flip is proved
    // clear and carries a machine-applicable fix.
    const src = `plan "P" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room"
  door at (3000,4000) width 1000 wall exterior hinge left swing in head 2100
  furniture box at (3400,2900) size 600x500 label "X"
}`;
    const diag = lint(src).find((d) => d.code === "W_SWING_OBSTRUCTED");
    expect(diag).toBeDefined();
    expect(diag!.fixes?.[0]?.fixId).toBe("door-swing-obstructed");
    const applied = applyFixes(src, diag!.fixes!).output;
    expect(applied).toContain("hinge right");
    expect(applied).toMatch(/door at \(3000, ?4000\) width 1000 wall exterior hinge right swing in head 2100/);
    expect(lint(applied).map((d) => d.code)).not.toContain("W_SWING_OBSTRUCTED");
  });
});
