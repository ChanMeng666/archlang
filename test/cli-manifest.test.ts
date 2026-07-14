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

/**
 * The per-command `examples` are what an agent copy-pastes (they are rendered into
 * `docs/cli-reference.md` and `llms-full.txt`), so a typo'd verb would ship a call
 * that exits 3. These guards keep every example addressed to its own command.
 */
describe("manifest — examples", () => {
  const m = buildManifest("9.9.9");

  it("gives every command at least one example", () => {
    for (const c of m.commands) {
      expect(c.examples.length, `command "${c.name}" has no example`).toBeGreaterThan(0);
    }
  });

  it("addresses every example to its own command (`arch <name|alias> …`)", () => {
    for (const c of m.commands) {
      const verbs = [c.name, ...(c.aliases ?? [])];
      for (const e of c.examples) {
        expect(e.cmd.startsWith("arch "), `example "${e.cmd}" must start with "arch "`).toBe(true);
        const verb = e.cmd.split(/\s+/)[1];
        expect(verbs, `example "${e.cmd}" is not addressed to \`arch ${c.name}\``).toContain(verb);
        expect(e.note.length, `example "${e.cmd}" has an empty note`).toBeGreaterThan(0);
      }
    }
  });

  it("declares each flag once per command", () => {
    for (const c of m.commands) {
      const names = c.flags.map((f) => f.flag);
      expect([...new Set(names)], `command "${c.name}" declares a flag twice`).toEqual(names);
    }
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
