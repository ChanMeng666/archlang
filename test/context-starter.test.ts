/**
 * `archlang context --level starter` (PS7.2): one screen for a weak model, with the same truth as
 * the full context. The starter quotes the spec's lead example and lines of it; these tests pin
 * every quoted snippet to its source, compile every snippet, run every error row, and fix the size.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_EXAMPLE } from "../scripts/gen-llm-spec.js";
import {
  CONTEXT_LEVELS,
  leadExampleFromSpec,
  renderStarter,
  STARTER_AGAINST,
  STARTER_ERRORS,
  STARTER_MAX_UNITS,
  STARTER_PICKS,
  STARTER_PROBE,
  withLabel,
} from "../src/cli/context-starter.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { compile, lint } from "../src/index.js";
import { buildManifest } from "../src/manifest.js";

const spec = readFileSync(resolve("spec.llm.md"), "utf8");
const starter = renderStarter(LEAD_EXAMPLE);

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The lead example with `statement` as an extra last line of the plan. */
const withStatement = (statement: string): string => LEAD_EXAMPLE.replace(/\n}$/, `\n  ${statement}\n}`);
const probe = (statement: string): string => STARTER_PROBE.replace("{ROW}", statement);
const errorCodes = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

describe("the starter is one screen", () => {
  it(`is at most ${STARTER_MAX_UNITS} UTF-16 units`, () => {
    expect(starter.length).toBeLessThanOrEqual(STARTER_MAX_UNITS);
  });

  it("is deterministic and a few lines of ASCII-safe prose", () => {
    expect(renderStarter(LEAD_EXAMPLE)).toBe(starter);
    expect(starter.endsWith("\n")).toBe(true);
    expect(starter).not.toContain("\r");
  });
});

describe("every quoted snippet comes from its source", () => {
  it("reads the lead example out of the shipped spec, equal to LEAD_EXAMPLE", () => {
    expect(leadExampleFromSpec(spec)).toBe(LEAD_EXAMPLE);
    expect(leadExampleFromSpec("no fences here")).toBeNull();
  });

  it("opens with the lead example, verbatim, in the first arch fence", () => {
    expect(starter).toContain("```arch\n" + LEAD_EXAMPLE + "\n```");
    expect(leadExampleFromSpec(starter)).toBe(LEAD_EXAMPLE);
  });

  it.each(Object.entries(STARTER_PICKS))("quotes the %s line of the lead example", (_name, prefix) => {
    const hits = LEAD_EXAMPLE.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith(prefix));
    expect(hits.length).toBe(1);
    // The absolute room line is quoted with `label` set where the grammar wants it (compiled below).
    const quoted = _name === "room" ? withLabel(hits[0]!, "Living") : hits[0]!;
    expect(starter).toContain(`\`${quoted}\``);
  });

  it("states the relational directions the grammar has", () => {
    expect(starter).toContain("`right-of|left-of|below|above`");
  });

  it("names a section list that the context command accepts", () => {
    for (const s of ["spec", "workflow", "cli", "errors"]) expect(starter).toContain(s);
  });

  it("names only real commands", () => {
    const names = new Set(buildManifest("0.0.0").commands.map((c) => c.name));
    const verbs = [...starter.matchAll(/`archlang ([a-z]+)/g)].map((m) => m[1]!);
    expect(verbs.length).toBeGreaterThan(4);
    for (const v of verbs) expect(names.has(v), v).toBe(true);
  });
});

describe("every snippet compiles", () => {
  it("the lead example compiles and lints with 0 diagnostics", () => {
    expect(compile(LEAD_EXAMPLE, { noCache: true }).diagnostics).toEqual([]);
    expect(lint(LEAD_EXAMPLE)).toEqual([]);
  });

  it("the against line is clean inside the lead plan", () => {
    const src = withStatement(STARTER_AGAINST);
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    expect(lint(src)).toEqual([]);
  });

  it("a room line with `label` before `uses` is clean in place of the lead's", () => {
    const room = LEAD_EXAMPLE.split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(STARTER_PICKS.room))!;
    const src = LEAD_EXAMPLE.replace(room, withLabel(room, "Living"));
    expect(src).not.toBe(LEAD_EXAMPLE);
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    expect(lint(src)).toEqual([]);
  });

  it("the probe plan is clean with an empty statement", () => {
    expect(compile(probe(""), { noCache: true }).diagnostics).toEqual([]);
  });
});

describe("the error table is executable", () => {
  it("has five rows, each a catalogued error", () => {
    expect(STARTER_ERRORS.map((e) => e.code)).toHaveLength(5);
    for (const e of STARTER_ERRORS) {
      expect(ERROR_CATALOG[e.code]?.severity, e.code).toBe("error");
      expect(starter).toContain(`\`${e.code}\``);
      expect(starter).toContain(`\`${e.bad}\` -> \`${e.good}\``);
    }
  });

  it.each(STARTER_ERRORS)("$code: bad raises it, good is clean", (e) => {
    expect(errorCodes(probe(e.bad))).toContain(e.code);
    expect(errorCodes(probe(e.good))).toEqual([]);
  });
});

describe("archlang context --level", () => {
  it("--level starter prints the starter and nothing else", () => {
    const r = run(["context", "--level", "starter"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(starter);
  });

  it("--level starter --json wraps it", () => {
    const r = run(["context", "--level", "starter", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true, level: "starter", context: starter });
  });

  it("--level full is the default output, byte for byte", () => {
    const plain = run(["context"]);
    const full = run(["context", "--level", "full"]);
    expect(plain.status).toBe(0);
    expect(full.stdout).toBe(plain.stdout);
    expect(full.stdout.length).toBeGreaterThan(100_000);
  });

  it("an unknown level is a usage error with a did-you-mean", () => {
    const r = run(["context", "--level", "starer"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('did you mean "starter"');
    expect(CONTEXT_LEVELS).toEqual(["starter", "full"]);
  });

  it("--level starter refuses --section", () => {
    const r = run(["context", "--level", "starter", "--section", "spec"]);
    expect(r.status).toBe(3);
  });

  it("--level stays a number for the storey commands", () => {
    const r = run(["describe", "examples/two-bed.arch", "--level", "starter"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).not.toContain("expected one of: starter");
  });
});
