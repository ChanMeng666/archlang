import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/index.js";
import { FLAG_KEYS, HELP_FLAGS } from "../src/cli/io.js";
import { findCommand, renderCommandHelp, renderTopHelp, usageLine } from "../src/cli/help.js";

/**
 * Help, `--version`, and flag strictness — the discoverability contract.
 *
 * Before v1.17 `arch compile --help` printed no help at all: `--help` fell through the
 * parser's if/else chain into the positional bucket and was read as a filename. The same
 * fall-through silently accepted `--jsn` as an input file. Both are now usage errors, and
 * help is rendered from the manifest — which the drift guards below pin to the parse table.
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const VALID = 'plan "S" { units mm room at (0,0) size 4000x3000 label "R" door at (0,1500) width 900 }';

describe("FLAG_KEYS — no drift vs the manifest", () => {
  const m = buildManifest("9.9.9");
  const manifestFlags = [...m.commands.flatMap((c) => c.flags), ...m.globalFlags];

  it("has a parse-table entry for every flag (and alias) the manifest documents", () => {
    for (const f of manifestFlags) {
      for (const name of f.alias ? [f.flag, f.alias] : [f.flag]) {
        expect(
          FLAG_KEYS[name],
          `manifest flag "${name}" has no FLAG_KEYS entry — the CLI would reject it`,
        ).toBeDefined();
      }
    }
  });

  it("documents every parse-table entry in the manifest", () => {
    const documented = new Set(manifestFlags.flatMap((f) => (f.alias ? [f.flag, f.alias] : [f.flag])));
    for (const name of Object.keys(FLAG_KEYS)) {
      expect(documented.has(name), `FLAG_KEYS has "${name}" but no manifest command declares it`).toBe(true);
    }
  });

  it("agrees with the manifest on which flags take a value", () => {
    for (const f of manifestFlags) {
      for (const name of f.alias ? [f.flag, f.alias] : [f.flag]) {
        const takesValue = FLAG_KEYS[name]!.kind !== "boolean";
        expect(takesValue, `"${name}": manifest arg=${f.arg ?? "none"} but FLAG_KEYS kind says otherwise`).toBe(
          f.arg !== undefined,
        );
      }
    }
  });

  it("maps an alias to the same Args field as its long flag", () => {
    for (const f of manifestFlags) {
      if (!f.alias) continue;
      expect(FLAG_KEYS[f.alias]!.key, `alias ${f.alias} must fill the same field as ${f.flag}`).toBe(
        FLAG_KEYS[f.flag]!.key,
      );
    }
  });

  it("keeps --help/-h out of the value-taking table (they short-circuit in parseArgs)", () => {
    for (const h of HELP_FLAGS) expect(FLAG_KEYS[h]).toBeUndefined();
  });
});

describe("help renderers (pure)", () => {
  const m = buildManifest("0.0.0");

  it("renderTopHelp lists every command and the CLI-wide contract", () => {
    const out = renderTopHelp(m);
    for (const c of m.commands) expect(out).toContain(c.name);
    expect(out).toContain("--version");
    expect(out).toContain("--json");
    expect(out).toContain("stdin");
    expect(out).toContain("Exit codes:");
    expect(out).toContain("svg");
  });

  it("renderCommandHelp renders usage, flags, examples and exit codes", () => {
    const compile = findCommand(m, "compile");
    expect(compile).not.toBeNull();
    const out = renderCommandHelp(m, compile!);
    expect(out).toContain("Usage:");
    expect(out).toContain(usageLine(compile!));
    expect(out).toContain("--from-json");
    expect(out).toContain("--help");
    expect(out).toContain("Examples:");
    expect(out).toContain(compile!.examples[0]!.cmd);
    expect(out).toContain("Exit codes:");
    // A flag another command owns must NOT appear in compile's help.
    expect(out).not.toContain("--brief");
  });

  it("resolves aliases (md ≡ markdown, manifest ≡ capabilities)", () => {
    expect(findCommand(m, "markdown")?.name).toBe("md");
    expect(findCommand(m, "capabilities")?.name).toBe("manifest");
    expect(findCommand(m, "nope")).toBeNull();
  });

  it("synthesizes a usage line with the command's input operand", () => {
    expect(usageLine(findCommand(m, "describe")!)).toBe("arch describe <file.arch|-> [flags]");
    expect(usageLine(findCommand(m, "spec")!)).toBe("arch spec [flags]");
  });
});

describe("CLI — help & version", () => {
  it("`compile --help` prints help, exit 0 (it used to read --help as a filename)", () => {
    const r = run(["compile", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage");
    expect(r.stdout).toContain("arch compile");
    expect(r.stdout).toContain("$ arch compile"); // an example line
  }, 30000);

  it("`help lint` ≡ `lint --help`", () => {
    const a = run(["help", "lint"]);
    const b = run(["lint", "--help"]);
    expect(a.status).toBe(0);
    expect(b.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toContain("--profile");
  }, 30000);

  it("`describe --help` works with NO input file (no 'missing input')", () => {
    const r = run(["describe", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("arch describe");
    expect(r.stderr).not.toContain("missing input");
  }, 30000);

  it("`--version` prints a semver on stdout, exit 0", () => {
    const r = run(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  }, 30000);

  it("bare `arch` is a usage error with help on stderr", () => {
    const r = run([]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("missing command");
    expect(r.stderr).toContain("Commands:");
    expect(r.stdout).toBe("");
  }, 30000);

  it("`arch help` prints the top help on stdout, exit 0", () => {
    const r = run(["help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Commands:");
  }, 30000);
});

describe("CLI — unknown command / unknown flag", () => {
  it("suggests the nearest command for a typo'd verb", () => {
    const r = run(["comple", "x.arch"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("unknown command");
    expect(r.stderr).toContain("compile");
  }, 30000);

  it("rejects an unknown flag instead of reading it as a filename", () => {
    const r = run(["lint", "-", "--jsn"], VALID);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('unknown flag "--jsn"');
    expect(r.stderr).toContain("--json"); // did-you-mean
    expect(r.stderr).toContain("usage: arch lint");
  }, 30000);

  it("rejects a real flag that this command does not take", () => {
    const r = run(["describe", "-", "--strict"], VALID);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('unknown flag "--strict"');
  }, 30000);

  it("still accepts the flags a command does declare", () => {
    const r = run(["lint", "-", "--json"], VALID);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  }, 30000);
});
