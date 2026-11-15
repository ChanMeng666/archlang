/** finish — the sheet stage degrades instead of giving up. Split out of `finish.test.ts` (FT3c). */

import { describe as suite, expect, it } from "vitest";
import { finish, format, type FinishResult } from "../src/index.js";
import { codesOf, SHEET_MAX_CHECKS, sheetStage } from "../src/finish.js";
import { NOT_GATED_DRAFTING } from "../src/furnish.js";
import {
  BARE,
  codes,
  errorsOf,
  gainedUnderAnyProfile,
  isSubsequence,
  NAMES,
  overflows,
  SHELL,
  srcOf,
  world,
} from "./helpers/finish-shared.js";

suite("finish — the sheet stage degrades instead of giving up", () => {
  const OPENING = "W_OPENING_NOT_DIMENSIONED";
  const SIX = ["paper", "scale", "dims", "schedule", "legend", "title"];
  // A window on a splayed facade: a chain measures along x or y, so `dims auto all` leaves
  // it out and says so with an advisory the bare plan does not have.
  const SPLAY = `plan "Splay" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) (8000,2000) (8000,5000) (0,5000) close }
  room id=r at (0,0) size 6000x5000 label "Hall" uses living
  door id=d at (3000,0) width 900 wall w swing in
  window id=c at (7000,1000) width 1000 wall w
}
`;
  // The same gap on a bowed facade: a curve has no coordinate on a chain.
  const BOW = `plan "Bow" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (6000,0) arc (6000,5000) radius 3000 (0,5000) close }
  room id=r at (0,0) size 6000x5000 label "Hall" uses living
  door id=d at (3000,0) width 900 wall w swing in
  window id=c on w at 8500 width 1000
}
`;
  const REPRODUCERS: Record<string, string> = { "an opening on an angled wall": SPLAY, "an opening on an arc": BOW };
  const statements = (r: { changes: FinishResult["changes"] }): string[] => r.changes.map((c) => c.statement);

  /** The sheet stage on its own, counting its measurements; `planted` raises a code on a match. */
  const stage = (src: string, planted?: RegExp, reissue = false) => {
    const memo = new Map();
    let calls = 0;
    const r = sheetStage(src, { world }, reissue, (s) => {
      calls++;
      const c = codesOf(s, { world }, memo);
      return planted?.test(s) ? { ...c, codes: new Map([...c.codes, ["W_PLANTED", 1]]) } : c;
    });
    return { r, calls };
  };

  for (const [what, src] of Object.entries(REPRODUCERS)) {
    it(`${what}: the fixture is the defect — \`dims auto all\` raises an advisory the plan lacks`, () => {
      expect(errorsOf(src)).toEqual([]);
      expect(codes(src).has(OPENING)).toBe(false);
      expect(codes(src.replace("  units mm\n", "  units mm\n  dims auto all\n")).has(OPENING)).toBe(true);
      expect(codes(src.replace("  units mm\n", "  units mm\n  dims auto overall\n")).has(OPENING)).toBe(false);
    });

    // Since 2026-10-24 (PR #245, ADR 0024 §6 amended) the advisory is a drafting-layer code the law
    // does not count: `dims auto all` is written whole, and the finished plan reports the opening
    // the chains leave out. The step down itself is still pinned below, with a planted code.
    it(`${what}: all six statements are written, with \`dims auto all\`, and the plan reports the gap`, () => {
      const r = finish(src, { only: "sheet" });
      expect(r.changed).toBe(true);
      expect(statements(r)).toEqual(["paper", "scale", "dims", "schedule", "legend", "title"]);
      expect(r.changes.find((c) => c.statement === "dims")?.text).toBe("dims auto all");
      expect(r.unresolved.filter((u) => u.statement === "dims")).toEqual([]);
      expect(codes(r.source).has(OPENING)).toBe(true);
      expect(NOT_GATED_DRAFTING.has(OPENING)).toBe(true);
    });

    it(`${what}: the finished result keeps every law`, () => {
      for (const only of ["sheet", undefined] as const) {
        const r = finish(src, only ? { only } : {});
        // never worse, under every profile
        expect(errorsOf(r.source)).toEqual([]);
        expect(gainedUnderAnyProfile(src, r.source)).toEqual([]);
        // pure insertion
        expect(isSubsequence(src, r.source)).toBe(true);
        expect(r.changes.every((c) => c.kind === "added")).toBe(true);
        // fixpoint: a second run is a byte no-op and does not put `dims auto all` back
        const again = finish(r.source, only ? { only } : {});
        expect(again.source).toBe(r.source);
        expect(again.changed).toBe(false);
        expect(again.changes).toEqual([]);
        // fmt, then finish
        const formatted = format(r.source);
        expect(finish(formatted, only ? { only } : {}).source).toBe(formatted);
        expect(overflows(r.source)).toEqual([]);
      }
    });
  }

  it("`dims auto` is given up altogether when `overall` is refused too, and the rest is still written", () => {
    const { r, calls } = stage(BARE, /dims auto/);
    expect(statements(r)).toEqual(SIX.filter((s) => s !== "dims"));
    expect(r.source).not.toContain("dims auto");
    const note = r.unresolved.find((u) => u.statement === "dims")!;
    expect(note.codes).toEqual(["W_PLANTED"]);
    expect(note.reason).toContain("`dims auto all` was not added");
    expect(note.reason).toContain("`dims auto overall` was not added");
    // the input, then: all six, `overall`, no `dims auto`
    expect(calls).toBe(4);

    // Fixpoint on the degraded plan: `dims auto` is still refused, and still reported.
    const again = stage(r.source, /dims auto/);
    expect(again.r.source).toBe(r.source);
    expect(again.r.changed).toBe(false);
    expect(again.r.changes).toEqual([]);
    expect(again.r.unresolved.map((u) => u.statement)).toEqual(["dims"]);
    expect(again.r.unresolved[0]!.reason).not.toContain("rolled back");
    expect(again.calls).toBe(3);
  });

  it("a statement other than `dims auto` is left out on its own, and every other one is kept", () => {
    for (const [planted, statement] of [
      [/^ {2}legend$/m, "legend"],
      [/^ {2}schedule rooms$/m, "schedule"],
      [/^ {2}title \{/m, "title"],
    ] as const) {
      const { r, calls } = stage(BARE, planted);
      expect([...statements(r)].sort()).toEqual(SIX.filter((s) => s !== statement).sort());
      expect(r.changes.find((c) => c.statement === "dims")?.text).toBe("dims auto all");
      expect(r.unresolved.map((u) => u.statement)).toEqual([statement]);
      expect(r.unresolved[0]!.codes).toEqual(["W_PLANTED"]);
      expect(calls).toBeLessThanOrEqual(1 + SHEET_MAX_CHECKS);
      const again = stage(r.source, planted);
      expect(again.r.source).toBe(r.source);
      expect(again.r.changed).toBe(false);
    }
  });

  it("when the sheet itself is refused, the title, the tables and `dims auto` are still written", () => {
    const { r } = stage(BARE, /^ {2}paper /m);
    expect([...statements(r)].sort()).toEqual(["dims", "legend", "schedule", "title"]);
    expect(r.source).not.toMatch(/^\s*(paper|scale) /m);
    expect(r.unresolved.map((u) => u.statement)).toEqual(["paper"]);
    expect(r.unresolved[0]!.reason).toContain("`paper A4 landscape` / `scale 1:50` was not added");
  });

  it("writes what can be placed when the settings cannot: the title alone", () => {
    // `north` and its value on two lines: every setting lands between the keyword and its
    // argument and would not compile; the title goes before the closing brace and does.
    const src = `plan "Wrapped" {\n  units mm\n  north\n  up\n${SHELL}\n}\n`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "sheet" });
    expect(statements(r)).toEqual(["title"]);
    expect(r.source).toBe(src.replace(/}\n$/, `  title { project "Wrapped" }\n}\n`));
    expect(r.unresolved.map((u) => u.statement)).toEqual(["paper", "schedule", "legend", "dims"]);
    expect(r.unresolved.every((u) => u.reason.includes("would not compile"))).toBe(true);
    expect(finish(r.source, { only: "sheet" }).source).toBe(r.source);
    // …and that plan is the longest search there is.
    expect(stage(src).calls).toBe(1 + SHEET_MAX_CHECKS);
  });

  it(`measures at most ${SHEET_MAX_CHECKS} candidates after the input, on every example and every planted refusal`, () => {
    const worst = (src: string, planted?: RegExp): number =>
      Math.max(stage(src, planted).calls, stage(src, planted, true).calls);
    for (const name of NAMES) expect(worst(srcOf(name)), name).toBeLessThanOrEqual(1 + SHEET_MAX_CHECKS);
    for (const planted of [/dims auto/, /paper /, /scale /, /legend/, /schedule/, /title/, /dims auto all/, /./])
      for (const src of [BARE, SPLAY, BOW, ...NAMES.slice(0, 6).map(srcOf)])
        expect(worst(src, planted), String(planted)).toBeLessThanOrEqual(1 + SHEET_MAX_CHECKS);
  }, 240000);

  it("is deterministic", () => {
    expect(finish(SPLAY)).toEqual(finish(SPLAY));
    expect(stage(BARE, /legend/).r).toEqual(stage(BARE, /legend/).r);
  });
});
