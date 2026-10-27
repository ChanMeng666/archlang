/**
 * Plan-soundness PS2.72: `describe --facts clearances`, what each clearance rule measured.
 *
 * - The card's acceptance: the Part 1 figures of the row-6 audit
 *   (`audits/2026-10-26-first-contact-rerun-row6.md`) read off the facet: the 2026-10-18
 *   apartment's 50 × 75 mm hob corner (beside the window, 125 mm off its wall's face, not under
 *   it) and the 2026-10-18 townhouse's 275 mm landing at the stair's foot.
 * - Agreement with `lint()`: over every example and every first-contact plan, per storey, the
 *   facet's rows that read short are exactly as many as the warnings the rule raises. The facet
 *   reads the rules' own measures, so it cannot say clear where the rule warns, or the reverse.
 * - The byte-identity law for the default summary is `describe-facts.test.ts` (every opt-in fact).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { type ClearanceFacts, describe, lint } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD } from "./d4-oracle.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLANS = join(ROOT, "docs/plans/plan-soundness/audits/first-contact-plans");

const clearances = (path: string): ClearanceFacts => {
  const s = describe(readFileSync(join(PLANS, path), "utf8"), { facts: ["clearances"] });
  expect(s.ok).toBe(true);
  return s.clearances!;
};

suite("describe --facts clearances: the row-6 Part 1 figures (PS2.72 acceptance)", () => {
  it("2026-10-18 apartment: the stove's 50 × 75 mm corner in the window's band, beside it and not under it", () => {
    const hob = clearances("1-apartment.arch").hobs.find((h) => h.id === "stove_9")!;
    expect(hob.windows).toEqual([
      { window: "window_5", window_width_mm: 1200, covered_mm: 75, across_mm: 50, off_face_mm: 125, under: false },
    ]);
  });

  it("2026-10-18 townhouse: 275 mm of floor past the bottom step, to the exterior wall", () => {
    const s = describe(readFileSync(join(PLANS, "5-townhouse.arch"), "utf8"), { facts: ["clearances"] });
    const ground = s.levels!.find((l) => l.level === 0)!.clearances!;
    expect(ground.stairs).toEqual([
      {
        id: "st",
        dir: "up",
        width_mm: 900,
        run_mm: 3400,
        min_run_mm: 2640,
        landings: [{ end: "foot", need_mm: 900, clear_mm: 275, by: { kind: "wall", id: "g_s" } }],
      },
    ]);
    // The top-level facts are the lowest storey's, as every other fact.
    expect(s.clearances).toEqual(ground);
    // The opening the same audit row judges: the sofa leaves 250 of the 300 mm approach.
    expect(ground.doorways.find((d) => d.id === "g_o_hl")!.approach).toEqual({
      need_mm: 300,
      blocked_by: { id: "sofa_3", clear_mm: 250 },
    });
  });
});

/** Every `.arch` file under `dir`, sorted, as paths relative to it. */
function archFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return archFiles(p).map((q) => join(f, q));
      return f.endsWith(".arch") ? [f] : [];
    });
}

/** How many of a storey's facet rows read short, per code: the warnings the rule should raise. */
function shortRows(c: ClearanceFacts): Record<string, number> {
  const wcShort = c.wcs.filter((w) => w.sides?.some((s) => s.by !== null && s.centreline_mm < w.need_mm)).length;
  const over = c.tall_units.reduce((n, t) => n + t.windows.length, 0);
  const under = c.hobs.reduce((n, h) => n + h.windows.filter((w) => w.under).length, 0);
  const gap = c.hobs.filter((h) => h.tall_unit_gap !== null).length;
  const blocked = c.doorways.filter(
    (d) => d.approach?.blocked_by != null || (d.stretch !== undefined && d.stretch.clear_mm < d.stretch.need_mm),
  ).length;
  const landing = (c.stairs ?? []).reduce((n, s) => n + s.landings.filter((l) => l.by !== null).length, 0);
  const steep = (c.stairs ?? []).filter((s) => s.min_run_mm !== undefined && s.run_mm < s.min_run_mm).length;
  return {
    W_WC_SIDE_CLEARANCE: wcShort,
    W_FURNITURE_OVER_WINDOW: over,
    W_HOB_UNDER_WINDOW: under,
    W_HOB_FRIDGE_GAP: gap,
    W_DOORWAY_BLOCKED: blocked,
    W_STAIR_NO_LANDING: landing,
    W_STAIR_TOO_STEEP: steep,
  };
}

const CORPUS: Record<string, { src: string; world?: typeof EXAMPLES_WORLD }> = {
  ...Object.fromEntries(
    Object.entries(EXAMPLE_FILES).map(([k, src]) => [`examples/${k}`, { src, world: EXAMPLES_WORLD }]),
  ),
  ...Object.fromEntries(
    archFiles(PLANS).map((f) => [relative(ROOT, join(PLANS, f)), { src: readFileSync(join(PLANS, f), "utf8") }]),
  ),
};

suite("describe --facts clearances agrees with lint() (PS2.72)", () => {
  it("the corpus is read", () => {
    expect(Object.keys(CORPUS).length).toBeGreaterThan(40);
  });

  it.each(Object.keys(CORPUS))("%s", (path) => {
    const { src, world } = CORPUS[path]!;
    const s = describe(src, { facts: ["clearances"], ...(world ? { world } : {}) });
    if (!s.ok) return;
    const ds = lint(src, world ? { world } : {});
    const storeys = s.levels
      ? s.levels.map((l) => ({ level: l.level as number | undefined, c: l.clearances! }))
      : [{ level: undefined, c: s.clearances! }];
    for (const { level, c } of storeys) {
      const want = shortRows(c);
      for (const code of Object.keys(want)) {
        const got = ds.filter((d) => d.code === code && d.level === level).length;
        expect(want[code], `${code} on level ${level ?? "-"}`).toBe(got);
      }
    }
  });
});
