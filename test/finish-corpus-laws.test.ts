/** finish — the corpus is not empty; finish law 1 — fixpoint; finish law 3 — an already-sheeted plan is a byte no-op; finish law 5 — a sheet finish wrote holds the drawing. Split out of `finish.test.ts` (FT3c). */

import { describe as suite, expect, it } from "vitest";
import { compile, finish } from "../src/index.js";
import { NAMES, overflows, srcOf, world, wroteSheet } from "./helpers/finish-shared.js";

suite("finish — the corpus is not empty", () => {
  it("reads every shipped example, and most of them have something to add", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(30);
    const changed = NAMES.filter((n) => finish(srcOf(n), { world }).changed);
    expect(changed.length).toBeGreaterThan(NAMES.length / 2);
  }, 120000);
});

suite("finish law 1 — fixpoint: finishing a finished plan changes nothing", () => {
  for (const name of NAMES)
    it(`${name}: finish(finish(s)) === finish(s), with and without reissue`, () => {
      for (const reissue of [false, true]) {
        const once = finish(srcOf(name), { world, reissue });
        const twice = finish(once.source, { world, reissue });
        expect(twice.source).toBe(once.source);
        expect(twice.changed).toBe(false);
        expect(twice.changes).toEqual([]);
        expect(once.unresolved.map((u) => u.reason).join("\n")).not.toContain("did not settle");
      }
    }, 120000);
});

suite("finish law 3 — an already-sheeted plan is a byte no-op for the sheet stage", () => {
  const SHEETED = NAMES.filter((n) => {
    const s = srcOf(n);
    return ["paper ", "scale ", "schedule ", "legend", "title "].every((w) => new RegExp(`^\\s*${w}`, "m").test(s));
  });

  it("some shipped example carries every sheet statement (the law is not vacuous)", () => {
    expect(SHEETED.length).toBeGreaterThan(0);
  });

  for (const name of SHEETED)
    it(`${name}: comes back byte-identical, changed: false`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "sheet" });
      expect(r.source).toBe(src);
      expect(r.changed).toBe(false);
      expect(r.changes).toEqual([]);
      expect(finish(src, { world }).changes.filter((c) => c.stage === "sheet")).toEqual([]);
    });

  it("a multi-storey plan that finish has completed is a byte no-op, pages and all", () => {
    for (const name of ["two-storey", "townhouse"]) {
      const done = finish(srcOf(name), { world }).source;
      expect(compile(done, { world, noCache: true }).pages?.length).toBeGreaterThan(1);
      const again = finish(done, { world });
      expect(again.source).toBe(done);
      expect(again.changed).toBe(false);
      expect(again.unresolved.filter((u) => u.stage === "sheet")).toEqual([]);
    }
  });
});

suite("finish law 5 — a sheet finish wrote holds the drawing", () => {
  for (const name of NAMES)
    it(`${name}: no W_SCALE_OVERFLOW / W_DRAWING_OVERFLOW once finish has written paper or scale`, () => {
      const r = finish(srcOf(name), { world });
      if (wroteSheet(r)) expect(overflows(r.source)).toEqual([]);
      // Without `reissue` an authored sheet is kept, so an overflow can only be one the
      // input already had — and then it is reported, never passed over in silence.
      if (overflows(r.source).length > 0) {
        expect(overflows(srcOf(name))).toEqual(overflows(r.source));
        expect(r.unresolved.some((u) => u.reason.includes("--reissue"))).toBe(true);
      }
    }, 120000);

  for (const name of NAMES)
    it(`${name}: with reissue no example is left overflowing`, () => {
      expect(overflows(finish(srcOf(name), { world, reissue: true }).source)).toEqual([]);
    }, 120000);

  // Since fix/examples-sound (2026-10-27) no shipped example overflows as authored, so the
  // overflowing half is exercised on `materials` as it was: its old A3 sheet put back.
  it("the overflowing half: materials on its old A3 is reported, then reissued to fit", () => {
    expect(NAMES.filter((n) => overflows(srcOf(n)).length > 0)).toEqual([]);
    const asWas = srcOf("materials").replace("  paper A2 landscape", "  paper A3 landscape");
    expect(asWas).not.toBe(srcOf("materials"));
    expect(overflows(asWas).length).toBeGreaterThan(0);
    const kept = finish(asWas, { world });
    expect(overflows(kept.source)).toEqual(overflows(asWas));
    expect(kept.unresolved.some((u) => u.reason.includes("--reissue"))).toBe(true);
    expect(overflows(finish(asWas, { world, reissue: true }).source)).toEqual([]);
  }, 120000);
});
