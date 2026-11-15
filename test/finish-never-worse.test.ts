/** finish law 2 — never worse: no error and no new diagnostic code, also under every lint profile. Split out of `finish.test.ts` (FT3c). */

import { describe as suite, expect, it } from "vitest";
import { finish, LINT_PROFILES } from "../src/index.js";
import { sourceConflicts } from "../src/repair.js";
import { codes, errorsOf, gainedUnderAnyProfile, NAMES, SHELL, srcOf, world } from "./helpers/finish-shared.js";

suite("finish law 2 — never worse: no error and no new diagnostic code", () => {
  for (const name of NAMES)
    it(`${name}: the result compiles and raises no code the input did not`, () => {
      const src = srcOf(name);
      for (const reissue of [false, true]) {
        const r = finish(src, { world, reissue });
        expect(errorsOf(r.source)).toEqual([]);
        const before = codes(src);
        const gained = [...codes(r.source)].filter(([c, n]) => n > (before.get(c) ?? 0)).map(([c]) => c);
        expect(gained, `finish${reissue ? " --reissue" : ""} added diagnostics to ${name}`).toEqual([]);
        const was = sourceConflicts(src, { world }).conflicts;
        const now = [...sourceConflicts(r.source, { world }).conflicts.keys()].filter((k) => !was.has(k));
        expect(now).toEqual([]);
        expect(r.unresolved.map((u) => u.reason).join("\n")).not.toContain("rolled back");
      }
    }, 120000);

  it("rolls the whole stage back when no statement can be placed, and says why", () => {
    // `north` and its value on two lines: the settings run ends on `north`, so the insert
    // lands between the keyword and its argument. The check has to catch that. The plan
    // has no name, so there is no title either: nothing is left that could be written.
    const src = `plan "" {\n  units mm\n  north\n  up\n${SHELL}\n}\n`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "sheet" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
    expect(r.unresolved.map((u) => u.reason).join("\n")).toContain("rolled back");
  });
});

suite("finish law 2 — never worse under every lint profile", () => {
  it("there is more than the default ruleset to check", () => {
    expect(Object.keys(LINT_PROFILES).length).toBeGreaterThan(1);
  });

  for (const name of NAMES)
    it(`${name}: no profile in LINT_PROFILES sees a code the input did not have`, () => {
      const src = srcOf(name);
      expect(gainedUnderAnyProfile(src, finish(src, { world, only: "sheet" }).source)).toEqual([]);
    }, 120000);
});
