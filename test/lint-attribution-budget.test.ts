/** W_PATH_TOO_NARROW's door attribution spends a bounded COUNT of re-measures. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `W_PATH_TOO_NARROW` verifies every door it names by re-measuring the plan with that door
 * widened, and the playground lints on every keystroke, so how many re-measures one `lint()`
 * run may spend is a COUNT bounded by construction (`MAX_ATTRIBUTION_MEASURES`), never a time.
 * This counts the circulation builds a run actually makes — the one the rule always makes,
 * plus the re-measures (`roomBottlenecks`) — on the two plans that made round 2 of this rule
 * fourteen times slower: thirty rooms off one corridor, and thirty rooms in a row. Both are
 * tree-shaped, so the door graph proves every widened door off the other rooms' paths and the
 * single union re-measure settles all thirty attributions.
 */

const calls = { computeCirculation: 0, roomBottlenecks: 0 };
vi.mock("../src/analyze/circulation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/analyze/circulation.js")>();
  return {
    ...real,
    computeCirculation: (...args: Parameters<typeof real.computeCirculation>) => {
      calls.computeCirculation++;
      return real.computeCirculation(...args);
    },
    roomBottlenecks: (...args: Parameters<typeof real.roomBottlenecks>) => {
      calls.roomBottlenecks++;
      return real.roomBottlenecks(...args);
    },
  };
});

const { lint } = await import("../src/index.js");
const { MAX_ATTRIBUTION_MEASURES } = await import("../src/lint/rules/circulation-facts.js");

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

afterEach(() => {
  calls.computeCirculation = 0;
  calls.roomBottlenecks = 0;
});

describe("W_PATH_TOO_NARROW's door attribution spends a bounded COUNT of re-measures", () => {
  for (const name of ["star30.arch", "chain30.arch"]) {
    for (const profile of [undefined, "accessibility-advisory"] as const) {
      it(`${name} (${profile ?? "default"}): one model, one union re-measure, and every room still named`, () => {
        const ds = lint(fixture(name), profile ? { profile } : {}).filter((d) => d.code === "W_PATH_TOO_NARROW");
        expect(ds.length).toBeGreaterThanOrEqual(29);
        // Every warned room names its door(s): the union re-measure, proved per room by the
        // door graph, did the work an exact re-measure per room used to do.
        for (const d of ds) expect(d.message, d.message).toMatch(/ — the bottlenecks? (is|are) /);
        expect(calls.computeCirculation).toBe(1);
        expect(calls.roomBottlenecks).toBe(1);
      });
    }
  }

  it("the per-run cap is a small count, and no run exceeds it, storeys together", () => {
    expect(MAX_ATTRIBUTION_MEASURES).toBeGreaterThanOrEqual(0);
    expect(MAX_ATTRIBUTION_MEASURES).toBeLessThanOrEqual(2);
    for (const name of ["examples/hillside-villa.arch", "examples/library.arch", "examples/garden-house.arch"]) {
      for (const profile of [undefined, "accessibility-advisory"] as const) {
        calls.roomBottlenecks = 0;
        lint(readFileSync(join(__dirname, "..", name), "utf8"), profile ? { profile } : {});
        // At most the cap for the whole run, however many storeys.
        expect(calls.roomBottlenecks, `${name} ${profile ?? "default"}`).toBeLessThanOrEqual(MAX_ATTRIBUTION_MEASURES);
      }
    }
  });
});
