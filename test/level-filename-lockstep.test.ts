/**
 * ONE per-storey file-naming scheme, two implementations — welded here.
 *
 * `arch compile -o house.svg` on a multi-storey plan writes `house.L1.svg`, `house.L2.svg`,
 * … (`levelTarget`, `src/cli/io.ts`). The playground downloads the storey it is showing and
 * must name it the same way, but `levelTarget` is part of the CLI's Node-only path layer
 * (`node:path`), so `playground/src/levels.ts` MIRRORS it instead of importing it.
 *
 * A mirror is a copy, and a copy drifts silently: nothing else in the repo compares these
 * two, and the symptom would be a user holding `floorplan.L3.svg` from one tool and
 * `floorplan-3.svg` from the other with no way to tell which storey either is. So this
 * drives both over the same inputs — including the awkward ones the CLI's version was
 * written for (a directory with a dot in it, a target with no extension, a negative
 * storey number) — and asserts they agree character for character.
 *
 * The playground's function takes `level: number | null`, where `null` means "single-storey
 * plan, leave the name alone". That arm has no CLI counterpart (the CLI only calls
 * `levelTarget` when there ARE levels), so it is pinned separately rather than compared.
 */

import { describe as suite, expect, it } from "vitest";
import { levelTarget } from "../src/cli/io.js";
import { levelFileName } from "../playground/src/levels.js";

/** Targets chosen to exercise every branch of the shared rule, not just the happy one. */
const TARGETS = [
  "floorplan.svg",
  "floorplan.pdf",
  "floorplan.dxf",
  "floorplan.txt",
  "floorplan.png",
  // No extension at all — the suffix is appended.
  "floorplan",
  // A dot in a DIRECTORY name and none in the file: still an append, not an insert.
  "out.d/floorplan",
  "out.d\\floorplan",
  // A dotted stem: the LAST dot is the extension.
  "house.v2.svg",
];

/** 0 and a basement are legal storey numbers, and both have bitten a naive version. */
const LEVELS = [1, 2, 3, 0, -1, 12];

suite("the per-storey file name has ONE spelling", () => {
  it("playground/src/levels.ts agrees with src/cli/io.ts's levelTarget on every target", () => {
    for (const target of TARGETS) {
      for (const level of LEVELS) {
        expect(levelFileName(target, level), `${target} @ level ${level}`).toBe(levelTarget(target, level));
      }
    }
  });

  it("the CLI's own examples still hold, so this is pinned to the scheme and not just to itself", () => {
    // From `levelTarget`'s doc comment — the naming law in its own words.
    expect(levelTarget("plan.svg", 1)).toBe("plan.L1.svg");
    expect(levelTarget("plan.svg", -1)).toBe("plan.L-1.svg");
    expect(levelTarget("out/house.svg", 1)).toBe("out/house.L1.svg");
  });

  it("a null level is the playground-only arm: a single-storey download keeps its name", () => {
    for (const target of TARGETS) expect(levelFileName(target, null)).toBe(target);
  });
});
