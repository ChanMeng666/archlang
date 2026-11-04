import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest, FINISH_STAGES, FINISH_STAGES_AVAILABLE, MANIFEST_COMMAND_NAMES } from "../src/index.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { CLI_NAME } from "../src/manifest.js";

/**
 * The capability manifest (`archlang manifest`) is the agent's API-discovery channel,
 * so it must not drift from the CLI it describes. These guards parse the actual
 * source so a new command (or fixture) can't ship without a manifest entry — the
 * same single-source discipline as the grammar/spec drift tests.
 */

describe("manifest — no drift vs the CLI dispatch", () => {
  it("documents exactly the commands (and aliases) the CLI dispatches", () => {
    const src = readFileSync("src/cli.ts", "utf8");
    const region = src.slice(src.indexOf("switch (cmd)"));
    const dispatched = new Set<string>();
    for (const m of region.matchAll(/case "([a-z]+)":/g)) dispatched.add(m[1]!);
    expect([...dispatched].sort()).toEqual([...new Set(MANIFEST_COMMAND_NAMES)].sort());
  });
});

/**
 * The command name the help and every example write must be a bin the package installs.
 * `archlang` is the canonical one; `arch` stays as an alias for existing scripts, though
 * coreutils owns `arch` on Linux, macOS and Git Bash. Both must run the same CLI.
 */
describe("package.json bins", () => {
  const bin = JSON.parse(readFileSync("package.json", "utf8")).bin as Record<string, string>;

  it("installs CLI_NAME and the `arch` alias, both pointing at the one CLI", () => {
    expect(CLI_NAME).toBe("archlang");
    expect(Object.keys(bin).sort()).toEqual(["arch", "archlang"]);
    expect(bin[CLI_NAME]).toBe("dist/cli.js");
    expect(bin.arch).toBe(bin[CLI_NAME]);
  });

  it("the manifest JSON names the command to type in `invoke`, and keeps `name` for old readers", () => {
    const m = buildManifest("9.9.9");
    expect(m.invoke).toBe("archlang");
    expect(m.invoke).toBe(CLI_NAME);
    expect(bin[m.invoke]).toBe("dist/cli.js");
    expect(m.name).toBe("arch");
  });
});

describe("manifest — content", () => {
  const m = buildManifest("9.9.9");

  it("injects the version and advertises the formats with their optional deps", () => {
    expect(m.version).toBe("9.9.9");
    expect(m.formats.map((f) => f.id)).toEqual(["svg", "dxf", "txt", "json", "pdf", "png"]);
    expect(m.formats.find((f) => f.id === "svg")?.zeroDep).toBe(true);
    expect(m.formats.find((f) => f.id === "txt")?.zeroDep).toBe(true);
    // `-f json` is the Plan JSON the core already projects: zero-dependency, no optional dep.
    expect(m.formats.find((f) => f.id === "json")).toEqual({ id: "json", zeroDep: true });
    // The `-f` placeholder is derived from the format table, so a new row cannot go unadvertised.
    const fmt = m.commands.find((c) => c.name === "compile")!.flags.find((f) => f.flag === "--format")!;
    expect(fmt.arg).toBe(`<${m.formats.map((f) => f.id).join("|")}>`);
    expect(m.formats.find((f) => f.id === "png")?.optionalDep).toBe("@resvg/resvg-js");
  });

  it("documents `finish` with its write flags and the stages `--only` takes", () => {
    const finish = m.commands.find((c) => c.name === "finish")!;
    expect(finish.input).toBe("<file.arch|->");
    expect(finish.flags.map((f) => f.flag)).toEqual([
      "--out",
      "--only",
      "--reissue",
      "--dry-run",
      "--backup",
      // The revision guard every in-place writer takes (`--expected-hash`, `E_STALE_SOURCE`).
      "--expected-hash",
      "--json",
      "--quiet",
    ]);
    // The stage list is FINISH_STAGES, interpolated — never a second copy of it.
    const only = finish.flags.find((f) => f.flag === "--only")!;
    expect(only.arg).toBe(`<${FINISH_STAGES.join("|")}>`);
    for (const stage of FINISH_STAGES_AVAILABLE) expect(only.description).toContain(stage);
    // The write flags are `fix`'s, word for word: one mutation boundary, one description.
    const fix = m.commands.find((c) => c.name === "fix")!;
    for (const flag of ["--dry-run", "--backup", "--expected-hash"])
      expect(finish.flags.find((f) => f.flag === flag)).toEqual(fix.flags.find((f) => f.flag === flag));
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

  it("addresses every example to its own command (`archlang <name|alias> …`)", () => {
    for (const c of m.commands) {
      const verbs = [c.name, ...(c.aliases ?? [])];
      for (const e of c.examples) {
        // `archlang`, never the `arch` alias: coreutils owns `arch` on Linux, macOS and Git Bash.
        expect(e.cmd.startsWith("archlang "), `example "${e.cmd}" must start with "archlang "`).toBe(true);
        const verb = e.cmd.split(/\s+/)[1];
        expect(verbs, `example "${e.cmd}" is not addressed to \`archlang ${c.name}\``).toContain(verb);
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
    // `[a-z0-9_]`, not `[a-z_]`: a category name may carry a DIGIT (`sofa_2`, the loveseat's
    // alias, is the first that does), and the narrower class silently skipped that arm — so the
    // guard reported a category advertised by `arch manifest` and "not drawn" when it was drawn
    // three lines away. A scrape that under-matches makes a set-equality gate lie in the
    // direction that looks like a real defect, which is the worst way for one to fail.
    for (const m of region.matchAll(/case "([a-z0-9_]+)":/g)) cases.add(m[1]!);
    expect([...new Set(FIXTURE_CATEGORIES)].sort()).toEqual([...cases].sort());
  });
});
