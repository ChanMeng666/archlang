/**
 * The mask-to-plan recipe (card G3, `docs/import.md`), held without Python: the committed outputs
 * of `tools/mask-to-plan/` on its worked example. The Plan JSON is rooms-only (rooms and a
 * `walls_from_rooms` statement, nothing else), compiles with no error, is what `planJsonToArch`
 * turns into the committed `plan.arch`, and each mask region's floor area matches the net area
 * `describe()` reports for its rooms within 2 % (the card's acceptance). The Python half is
 * re-run by hand (`docs/import.md`); a change to a script regenerates these files.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, planJsonToArch } from "../src/index.js";

const dir = new URL("../tools/mask-to-plan/example/", import.meta.url);
const read = (f: string): string => readFileSync(new URL(f, dir), "utf8");
const plan = JSON.parse(read("plan.json")) as Record<string, unknown> & { rooms: Array<{ id: string }> };
const areas = JSON.parse(read("areas.json")) as {
  regions: Array<{ label: string; mask_area_m2: number; rooms: string[] }>;
};

suite("tools/mask-to-plan worked example", () => {
  it("is a rooms-only Plan JSON: rooms and walls_from_rooms, no wall, opening or furniture", () => {
    expect(plan.walls).toEqual([]);
    expect(plan.openings).toEqual([]);
    expect(plan.furniture).toEqual([]);
    expect(plan.walls_from_rooms).toMatchObject({ exterior: 200, partition: 100 });
    expect(plan.rooms.length).toBeGreaterThan(0);
  });

  it("becomes the committed plan.arch, which compiles with no error", () => {
    const { source, diagnostics } = planJsonToArch(plan);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(source).toBe(read("plan.arch").replace(/\r\n/g, "\n"));
    expect(compile(source as string).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("each region's mask area matches its rooms' net area within 2 %", () => {
    const net = new Map(describe(read("plan.arch")).rooms.map((r) => [r.id, r.net_area_m2 ?? Number.NaN]));
    const ids = new Set(plan.rooms.map((r) => r.id));
    expect(areas.regions.flatMap((r) => r.rooms).sort()).toEqual([...ids].sort());
    for (const reg of areas.regions) {
      const got = reg.rooms.reduce((t, id) => t + (net.get(id) ?? Number.NaN), 0);
      expect(Math.abs(got - reg.mask_area_m2) / reg.mask_area_m2, reg.rooms.join(",")).toBeLessThanOrEqual(0.02);
    }
  });
});
