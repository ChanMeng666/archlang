import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest, MANIFEST_COMMAND_NAMES } from "../src/index.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";

/**
 * The capability manifest (`arch manifest`) is the agent's API-discovery channel,
 * so it must not drift from the CLI it describes. These guards parse the actual
 * source so a new command (or fixture) can't ship without a manifest entry — the
 * same single-source discipline as the grammar/spec drift tests.
 */

describe("manifest — no drift vs the CLI dispatch", () => {
  it("documents exactly the commands (and aliases) the CLI dispatches", () => {
    const src = readFileSync("src/cli.ts", "utf8");
    const region = src.slice(src.indexOf("switch (cmd)"));
    const dispatched = new Set<string>();
    for (const m of region.matchAll(/case "([a-z]+)":/g)) dispatched.add(m[1]);
    expect([...dispatched].sort()).toEqual([...new Set(MANIFEST_COMMAND_NAMES)].sort());
  });
});

describe("manifest — content", () => {
  const m = buildManifest("9.9.9");

  it("injects the version and advertises the formats with their optional deps", () => {
    expect(m.version).toBe("9.9.9");
    expect(m.formats.map((f) => f.id)).toEqual(["svg", "dxf", "txt", "pdf", "png"]);
    expect(m.formats.find((f) => f.id === "svg")?.zeroDep).toBe(true);
    expect(m.formats.find((f) => f.id === "txt")?.zeroDep).toBe(true);
    expect(m.formats.find((f) => f.id === "png")?.optionalDep).toBe("@resvg/resvg-js");
  });

  it("exposes elements, lint profiles, fixture categories, and error codes", () => {
    expect(m.elements).toContain("room");
    expect(m.lint.profiles).toContain("residential-basic");
    expect(m.fixtureCategories).toContain("wc");
    expect(m.errorCodes.some((e) => e.code === "E_PNG_DEPENDENCY")).toBe(true);
    expect(m.errorCodes.length).toBeGreaterThan(30);
  });
});

describe("manifest — fixture categories match the glyph renderer", () => {
  it("FIXTURE_CATEGORIES equals the fixtureGlyph switch cases", () => {
    const src = readFileSync("src/elements/fixtures-glyphs.ts", "utf8");
    const region = src.slice(src.indexOf("switch (category)"));
    const cases = new Set<string>();
    for (const m of region.matchAll(/case "([a-z_]+)":/g)) cases.add(m[1]);
    expect([...new Set(FIXTURE_CATEGORIES)].sort()).toEqual([...cases].sort());
  });
});
