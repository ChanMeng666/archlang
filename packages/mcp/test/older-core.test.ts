/**
 * The shim on a core OLDER than its release: the server still loads, every other tool works, and
 * the two calls that need something newer say so as data.
 *
 * The mock is the real core minus what this shim's release added to it: no `PNG_PREVIEW_WIDTH`,
 * no `isOptionalDepError`, no `diagnosticRule`, and a `planToJson` without per-storey `pages`. The
 * removed exports are present as `undefined`, which is what an ESM namespace yields for an export a
 * module lacks (vitest would otherwise throw on reading a key its mock factory did not return).
 */
import { describe, expect, it, vi } from "vitest";
import { JSON_PAGES_NEED_NEWER_CORE, PNG_NEEDS_NEWER_CORE } from "../src/server.js";
import { call, connect, TWO_ROOMS, TWO_STOREY } from "./helpers.js";

/** One 2.25 m² room: under the default ruleset's 4 m² floor, so `lint` warns `W_ROOM_TOO_SMALL`. */
const TINY_ROOM = `plan "Small" {
  wall exterior thickness 200 { (0,0) (1500,0) (1500,1500) (0,1500) close }
  room id=a at (0,0) size 1500x1500 label "Den"
  door id=d0 at (750,1500) width 800 wall exterior hinge left swing in
}
`;

vi.mock("@chanmeng666/archlang", async (importOriginal) => {
  const core = await importOriginal<typeof import("@chanmeng666/archlang")>();
  const { PNG_PREVIEW_WIDTH: _w, isOptionalDepError: _d, diagnosticRule: _r, ...older } = core;
  return {
    ...older,
    PNG_PREVIEW_WIDTH: undefined,
    isOptionalDepError: undefined,
    diagnosticRule: undefined,
    planToJson: (...args: Parameters<typeof core.planToJson>) => {
      const { pages: _pages, ...projection } = core.planToJson(...args);
      return projection;
    },
  };
});

describe("the shim on a core older than its release", () => {
  it("loads, and the tools that need nothing newer still work", async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("compile");
    expect((await call(client, "compile", { source: TWO_ROOMS })).ok).toBe(true);
    expect((await call(client, "describe", { source: TWO_ROOMS })).ok).toBe(true);
  });

  it("lint and validate still report their warnings, with no `rule` (RM1.6b)", async () => {
    const client = await connect();
    for (const tool of ["lint", "validate"]) {
      const ds = (await call(client, tool, { source: TINY_ROOM })).diagnostics as Array<Record<string, unknown>>;
      expect(ds.map((d) => d.code)).toContain("W_ROOM_TOO_SMALL");
      for (const d of ds) expect(d).not.toHaveProperty("rule");
    }
  });

  it("png says it needs a newer core, as data, and names no version", async () => {
    const out = await call(await connect(), "compile", { source: TWO_ROOMS, format: "png" });
    expect(out).toMatchObject({ ok: false, format: "png", error: PNG_NEEDS_NEWER_CORE });
    expect(PNG_NEEDS_NEWER_CORE).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("json refuses a multi-storey projection as data; a single storey is unaffected", async () => {
    const client = await connect();
    const multi = await call(client, "compile", { source: TWO_STOREY, format: "json" });
    expect(multi).toMatchObject({ ok: false, error: JSON_PAGES_NEED_NEWER_CORE });
    expect(JSON_PAGES_NEED_NEWER_CORE).not.toMatch(/\d+\.\d+\.\d+/);
    expect((await call(client, "compile", { source: TWO_ROOMS, format: "json" })).ok).toBe(true);
  });
});
