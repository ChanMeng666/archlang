/** roomBottlenecks reads exactly what computeCirculation measures. */

import { worldFor } from "./helpers/world.js";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CirculationModel } from "../src/analyze/circulation.js";

/**
 * `roomBottlenecks` is `computeCirculation`'s opening steps written out again for the lint
 * rule that re-measures plan variants, so the two must not drift: every time lint builds a
 * circulation model over the corpus, the same inputs are handed to `roomBottlenecks` too, and
 * every room the model measures must read the same there.
 */

const pairs: { model: CirculationModel | null; readings: ReadonlyMap<string, number> }[] = [];
vi.mock("../src/analyze/circulation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/analyze/circulation.js")>();
  return {
    ...real,
    computeCirculation: (...args: Parameters<typeof real.computeCirculation>) => {
      const model = real.computeCirculation(...args);
      const [rooms, walls, doors, openings, furniture, access, tol, body, verticals, voids, arrivals] = args;
      if (body === undefined)
        pairs.push({
          model,
          readings: real.roomBottlenecks(
            rooms,
            walls,
            doors,
            openings,
            furniture,
            access,
            tol,
            verticals,
            voids,
            arrivals,
          ),
        });
      return model;
    },
  };
});

const { lint } = await import("../src/index.js");

describe("roomBottlenecks reads exactly what computeCirculation measures", () => {
  it("over every example and fixture, every measured room", () => {
    for (const dir of ["examples", "test/fixtures"]) {
      const abs = resolvePath(dir);
      for (const f of readdirSync(abs).filter((x) => x.endsWith(".arch")))
        lint(readFileSync(join(abs, f), "utf8"), { world: worldFor(abs) });
    }
    let rooms = 0;
    for (const { model, readings } of pairs) {
      for (const rc of model?.rooms ?? []) {
        expect(readings.get(rc.roomId), rc.roomId).toBe(rc.bottleneckClearWidthMm);
        rooms++;
      }
    }
    expect(pairs.length).toBeGreaterThan(20);
    expect(rooms).toBeGreaterThan(100);
  });
});
