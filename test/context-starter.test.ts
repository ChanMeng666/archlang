/**
 * `archlang context --level starter` (PS7.2): one screen for a weak model, with the same truth as
 * the full context. The starter quotes the spec's lead example and lines of it; these tests pin
 * every quoted snippet to its source, compile every snippet, run every error row and every claim
 * about furniture sizes, check every command, flag and JSON key the text names, and fix the size
 * (units, lines, columns).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_EXAMPLE } from "../scripts/gen-llm-spec.js";
import { SECTION_NAMES } from "../src/cli/commands-meta.js";
import {
  CONTEXT_LEVELS,
  changedFragments,
  leadExampleFromSpec,
  renderStarter,
  STARTER_AGAINST,
  STARTER_ERRORS,
  STARTER_MAX_COLUMNS,
  STARTER_MAX_LINES,
  STARTER_MAX_UNITS,
  STARTER_PICKS,
  STARTER_PROBE,
  STARTER_SHEET,
  STARTER_SIZED,
  STARTER_UNSIZED,
  withLabel,
} from "../src/cli/context-starter.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { compile, lint } from "../src/index.js";
import { buildManifest } from "../src/manifest.js";

const spec = readFileSync(resolve("spec.llm.md"), "utf8");
const starter = renderStarter(LEAD_EXAMPLE, SECTION_NAMES);
const manifest = buildManifest("0.0.0");

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
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

  it(`is at most ${STARTER_MAX_LINES} lines of at most ${STARTER_MAX_COLUMNS} columns`, () => {
    const lines = starter.replace(/\n$/, "").split("\n");
    expect(lines.length).toBeLessThanOrEqual(STARTER_MAX_LINES);
    for (const l of lines) expect([...l].length, l).toBeLessThanOrEqual(STARTER_MAX_COLUMNS);
  });

  it("is deterministic, ends with one newline and holds no carriage return", () => {
    expect(renderStarter(LEAD_EXAMPLE, SECTION_NAMES)).toBe(starter);
    expect(starter.endsWith("\n")).toBe(true);
    expect(starter.endsWith("\n\n")).toBe(false);
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

  it.each(Object.entries(STARTER_PICKS))("quotes the %s line of the lead example", (name, prefix) => {
    const hits = LEAD_EXAMPLE.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith(prefix));
    expect(hits.length).toBe(1);
    // The absolute room line is quoted with `label` set where the grammar wants it (compiled below).
    const quoted = name === "room" ? withLabel(hits[0]!, "Living") : hits[0]!;
    expect(starter).toContain(`\`${quoted}\``);
  });

  it("states the relational directions the grammar has", () => {
    expect(starter).toContain("`right-of|left-of|below|above`");
  });

  it("renders the --section names from the command's own list", () => {
    expect(SECTION_NAMES.length).toBeGreaterThan(2);
    expect(starter).toContain(`\`--section ${SECTION_NAMES.join("|")}\``);
  });

  /** Every backticked span outside the fenced example. */
  const spans = [...starter.replace(/```arch[\s\S]*?```/, "").matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
  const flagsOf = (name: string): Set<string> =>
    new Set(
      [...manifest.commands.find((c) => c.name === name)!.flags, ...manifest.globalFlags].flatMap((f) =>
        f.alias ? [f.flag, f.alias] : [f.flag],
      ),
    );
  const verbOf = (span: string): string | null => {
    const first = span.replace(/^archlang /, "").split(" ")[0]!;
    return manifest.commands.some((c) => c.name === first) ? first : null;
  };

  it("names only real commands", () => {
    const verbs = [...starter.matchAll(/`archlang ([a-z]+)/g)].map((m) => m[1]!);
    expect(verbs.length).toBeGreaterThan(4);
    for (const v of verbs)
      expect(
        manifest.commands.some((c) => c.name === v),
        v,
      ).toBe(true);
  });

  it("names only flags the named command declares (-o, --json, --section, --taste)", () => {
    const seen = new Set<string>();
    for (const span of spans) {
      const flags = [...span.matchAll(/(?:^| )(--?[a-z][\w-]*)/g)].map((m) => m[1]!);
      if (flags.length === 0) continue;
      const verb = verbOf(span) ?? (span.startsWith("--section") ? "context" : null);
      expect(verb, `a flag span names its command: ${span}`).not.toBeNull();
      for (const f of flags) {
        expect(flagsOf(verb!).has(f), `${f} is a flag of ${verb}`).toBe(true);
        seen.add(f);
      }
    }
    expect([...seen].sort()).toEqual(["--json", "--section", "--taste", "-o"]);
  });

  it("names only JSON keys the real validate and lint output carry", () => {
    const plan = probe(STARTER_ERRORS.find((e) => e.code === "E_OPENING_NIB")!.bad);
    const validate = JSON.parse(run(["validate", "-", "--json"], plan).stdout) as Record<string, any>;
    const lintOut = JSON.parse(run(["lint", "-", "--json"], plan).stdout) as Record<string, any>;
    expect(Object.keys(validate)[0]).toBe("summary");
    expect(Object.keys(lintOut)[0]).toBe("summary");
    expect(validate.ok).toBe(false);
    expect(typeof validate.diagnostics[0].fix).toBe("string");
    expect(validate.next.code).toBe("E_OPENING_NIB");
    expect(typeof validate.next.hint).toBe("string");
    // The starter names exactly these keys; a new one must be checked above.
    const named = spans.filter((s) => /^(summary|next|ok|next\.hint|diagnostics\[\]\.fix)$/.test(s));
    expect(new Set(named)).toEqual(new Set(["summary", "next", "ok", "next.hint", "diagnostics[].fix"]));
  });

  it("states the size cap in the manifest from the constant, not a literal", () => {
    const flag = manifest.commands.find((c) => c.name === "context")!.flags.find((f) => f.flag === "--level")!;
    expect(flag.description).toContain(`${STARTER_MAX_UNITS} characters`);
    expect(flag.arg).toBe(`<${CONTEXT_LEVELS.join("|")}>`);
  });

  it("shows the changed words of a row, with context", () => {
    expect(changedFragments("a b c d e f", "a b c X e f")).toEqual(["b c d e", "b c X e"]);
    expect(changedFragments("a b", "a b c")).toEqual(["a b", "a b c"]);
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

  it("a room line with `label` after `size`, before `uses`, is clean in place of the lead's", () => {
    const room = LEAD_EXAMPLE.split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(STARTER_PICKS.room))!;
    const src = LEAD_EXAMPLE.replace(room, withLabel(room, "Living"));
    expect(src).not.toBe(LEAD_EXAMPLE);
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    expect(lint(src)).toEqual([]);
  });

  it("the sheet lines compile and lint clean inside the lead plan, and the starter names them", () => {
    const src = withStatement(STARTER_SHEET.join("\n  "));
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    expect(lint(src)).toEqual([]);
    for (const s of STARTER_SHEET) expect(starter).toContain(`\`${s}\``);
    // Bare `paper` (no size) is a parse error, which is why the starter writes `paper A3`.
    expect(errorCodes(withStatement("paper"))).toEqual(["E_PARSE"]);
  });

  it("the probe plan is clean with an empty statement", () => {
    expect(compile(probe(""), { noCache: true }).diagnostics).toEqual([]);
  });
});

describe("the furniture sentence is true", () => {
  it.each(STARTER_SIZED)("%s may omit size against a wall", (piece) => {
    expect(errorCodes(probe(`furniture ${piece} against bath.right`))).toEqual([]);
  });

  it.each(STARTER_UNSIZED)("%s may not: against without size is E_FURN_SIZE", (piece) => {
    expect(errorCodes(probe(`furniture ${piece} against bath.right`))).toEqual(["E_FURN_SIZE"]);
    expect(errorCodes(withStatement(`furniture ${piece} against living.top`))).toEqual(["E_FURN_SIZE"]);
  });

  it.each([...STARTER_SIZED, ...STARTER_UNSIZED])("%s: `in <room> anchor` always needs a size", (piece) => {
    expect(errorCodes(probe(`furniture ${piece} in bath anchor top`))).toEqual(["E_FURN_SIZE"]);
  });
});

describe("at <mm> from start counts to the opening's centre", () => {
  const doorY = (at: number): [number, number] => {
    const src = probe(`door between hall and bath at ${at} from start width 800`);
    const prims = (
      compile(src, { noCache: true }).scene as unknown as {
        nodes: { layer: string; prim: { t: string; pts?: { y: number }[] } }[];
      }
    ).nodes;
    const ys = prims.find((p) => p.layer === "doors" && p.prim.t === "polygon")!.prim.pts!.map((p) => p.y);
    return [Math.min(...ys), Math.max(...ys)];
  };

  it("puts the middle of the opening at the stated distance", () => {
    for (const at of [1000, 1200]) {
      const [lo, hi] = doorY(at);
      expect((lo + hi) / 2).toBe(at);
      expect(hi - lo).toBe(800);
    }
  });
});

describe("the error table is executable", () => {
  it("has five rows, each a catalogued error", () => {
    expect(STARTER_ERRORS.map((e) => e.code)).toHaveLength(5);
    for (const e of STARTER_ERRORS) {
      expect(ERROR_CATALOG[e.code]?.severity, e.code).toBe("error");
      expect(starter).toContain(`\`${e.code}\`: ${e.fix}`);
    }
  });

  it.each(STARTER_ERRORS)("$code: bad raises exactly it (warnings may accompany), good is clean", (e) => {
    expect(errorCodes(probe(e.bad))).toEqual([e.code]);
    expect(errorCodes(probe(e.good))).toEqual([]);
    const [bad, good] = changedFragments(e.bad, e.good);
    expect(e.bad).toContain(bad);
    expect(e.good).toContain(good);
    expect(starter).toContain(`\`${bad}\` -> \`${good}\``);
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

  it("--level with no value is a usage error, never the full bundle", () => {
    const r = run(["context", "--level"]);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("--level needs a value");
  });

  it("--level stays a number for the storey commands (describe --level starter exits 3)", () => {
    const r = run(["describe", "examples/two-bed.arch", "--level", "starter"]);
    expect(r.status).toBe(3);
    expect(r.stdout + r.stderr).not.toContain("expected one of: starter");
  });
});
