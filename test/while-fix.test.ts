/**
 * W7's machine-applicable `while`→`for` fix (`src/while-fix.ts`'s `proveWhileFixes`),
 * proved and attached ENTIRELY OUTSIDE `compile()` — see that module's header. The one
 * caller is `arch fix` (`src/cli/commands-author.ts`); `compile()`, `lsp.codeActions`, the
 * playground and VS Code never run the proof and never offer this fix (pinned in
 * `test/while-deprecation.test.ts`).
 *
 * Every case here is a red-team counterexample from the two review rounds, turned into a
 * regression test: round one's syntactic-shape disqualifiers, round two's non-vacuity gate
 * (B1'), the component-site `maybe-incorrect` tier, and comment preservation (M-A).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFixes, compile, describe as describePlan, format, planToJson } from "../src/index.js";
import type { World } from "../src/world.js";
import { proveWhileFixes } from "../src/while-fix.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

function proven(src: string, opts: Record<string, unknown> = {}) {
  return proveWhileFixes(src, opts)[0];
}

describe("proveWhileFixes — the canonical shape, tiered by site", () => {
  it("plan level: offered and `machine-applicable`; applying it compiles to the SAME bytes", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const p = proven(src);
    expect(p).toBeTruthy();
    expect(p!.fix.applicability).toBe("machine-applicable");

    const { output, applied } = applyFixes(src, [p!.fix]);
    expect(applied).toHaveLength(1);
    expect(output).toContain("for i in 0..4");
    expect(output).not.toContain("while");

    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
  });

  it("inside a component that IS instantiated: offered, but only `maybe-incorrect`", () => {
    const src = plan(
      `  component c() {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  c()`,
    );
    const p = proven(src);
    expect(p).toBeTruthy();
    expect(p!.fix.applicability).toBe("maybe-incorrect");
  });

  it("PROOF: a plan whose lint() carries real diagnostics is proved by code+message, spans excluded", () => {
    // Disconnected, unreachable rooms inside the loop body (nested if/for, string
    // interpolation of `i`) — every lint code below is real, and the fix must still be
    // offered because the two lint()s agree on {code, message}; only spans shift.
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    if i % 2 == 0 {\n      room at (i * 4000, 0) size 3000x3000 label "Even {i}"\n    } else {\n      room at (i * 4000, 0) size 3000x3000 label "Odd {i}"\n    }\n    for j in 0..2 {\n      column at (i * 4000 + j * 1000, 3500) size 200x200\n    }\n    set door(swing: out)\n    i = i + 1\n  }`,
    );
    const p = proven(src);
    expect(p).toBeTruthy();

    const before = compile(src, { noCache: true });
    const { output } = applyFixes(src, [p!.fix]);
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
  });
});

describe("proveWhileFixes — B1' non-vacuity: only a `while` that actually ran is a candidate", () => {
  it("DECLINED: a component containing the canonical shape is never instantiated (library, standalone)", () => {
    const src = plan(
      `  component c() {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    const c = compile(src, { noCache: true });
    expect(c.diagnostics.some((d) => d.code === "W_EMPTY_PLAN")).toBe(true);
    expect(c.diagnostics.some((d) => d.code === "W_WHILE_DEPRECATED")).toBe(true);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: the canonical shape sits behind a dead `if` branch", () => {
    const src = plan(
      `  room at (0,0) size 3000x3000\n  if false {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("`_executedWhileSpans` never reaches the SVG, describe(), or Plan JSON", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const c = compile(src, { noCache: true });
    expect(c.svg).not.toContain("_executedWhileSpans");
    expect(c.svg).not.toContain("executedWhile");

    const summary = describePlan(src);
    expect(JSON.stringify(summary)).not.toContain("_executedWhileSpans");
    expect(JSON.stringify(summary)).not.toContain("executedWhile");

    const { json, diagnostics } = planToJson(src);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(json)).not.toContain("_executedWhileSpans");
    expect(JSON.stringify(json)).not.toContain("executedWhile");
  });
});

describe("proveWhileFixes — round-one syntactic disqualifiers still hold", () => {
  it("DECLINED — B1: a component called from the body READS the loop counter", () => {
    const src = plan(
      `  component c() {\n    column at (i * 300, 0) size 100x100\n  }\n  let i = 0\n  while i < 3 {\n    c()\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED — B1: a component called from the body WRITES the loop counter", () => {
    const src = plan(
      `  component skip() {\n    i = i + 1\n  }\n  let i = 0\n  while i < 6 {\n    column at (i * 300, 0) size 100x100\n    skip()\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED — B1: `zone` is scope-transparent, and `i` is used after it", () => {
    const src = plan(
      `  zone west {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  column at (i * 300, 600) size 100x100`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED — B1: a component called AFTER the loop reads the counter", () => {
    const src = plan(
      `  component c() {\n    column at (i * 300, 600) size 100x100\n  }\n  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  c()`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED — B1: B >= 10001 (the original hits E_WHILE_LIMIT; `for` would not)", () => {
    const src = plan(
      `  room at (0,0) size 3000x3000\n  let i = 0\n  while i < 10001 {\n    let y = i\n    i = i + 1\n  }`,
    );
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_WHILE_LIMIT")).toBe(true);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED — B2: a recovered parse error inside the body", () => {
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    bogus stuff here\n    i = i + 1\n  }`,
    );
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: the increment is not the last statement of the body", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    i = i + 1\n    column at (i * 300, 0) size 100x100\n  }`);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: another assignment exists in the body besides the increment", () => {
    const src = plan(
      `  let i = 0\n  let extra = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    extra = extra + 1\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: B references the loop variable", () => {
    const src = plan(
      `  let i = 0\n  let n = 4\n  while i < n + i {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: I is referenced after the loop", () => {
    const src = plan(
      `  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  let last = i`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: the condition is not strictly `<`", () => {
    const src = plan(`  let i = 0\n  while i <= 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: no `let I = A` immediately before the while", () => {
    const src = plan(
      `  let i = 0\n  column at (0, 9000) size 100x100\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("DECLINED: the increment is not literally `I = I + 1`", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 2\n  }`);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("nested canonical whiles: the OUTER is disqualified by the inner's own increment, the INNER is offered", () => {
    const src = plan(
      `  let i = 0\n  while i < 2 {\n    let j = 0\n    while j < 2 {\n      column at (i * 600 + j * 300, 0) size 100x100\n      j = j + 1\n    }\n    i = i + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(1);
  });

  it("two independent sibling canonical whiles are BOTH offered", () => {
    const src = plan(
      `  let i = 0\n  while i < 2 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  let k = 0\n  while k < 3 {\n    column at (k * 300, 900) size 100x100\n    k = k + 1\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(2);
  });
});

describe("proveWhileFixes — M-A: comments are kept verbatim, never reprinted", () => {
  it("the six-comment source: every comment survives, and the result is format()-stable", () => {
    const draft = plan(
      `  # leading, before let\n` +
        `  let i = 0  # trailing let\n` +
        `  # standalone, between let and while\n` +
        `  while i < 3 {\n` +
        `    column at (i * 300, 0) size 100x100 # internal, trailing a kept stmt\n` +
        `    # internal, its own line\n` +
        `    i = i + 1\n` +
        `  }\n` +
        `  # following, after the while\n` +
        `  column at (0, 900) size 50x50`,
    );
    const src = format(draft);
    expect(format(src)).toBe(src); // the draft's canonical form is itself a fixpoint

    const p = proven(src);
    expect(p).toBeTruthy();
    const { output } = applyFixes(src, [p!.fix]);

    for (const text of [
      "# leading, before let",
      "# trailing let",
      "# standalone, between let and while",
      "# internal, trailing a kept stmt",
      "# internal, its own line",
      "# following, after the while",
    ]) {
      expect(output, text).toContain(text);
    }

    expect(format(output)).toBe(output);
    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
  });

  it("DECLINED: a comment trails the increment's own line — no faithful place for it", () => {
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1  # progress\n  }`,
    );
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("format(fixed) === fixed for a canonical loop nested in a zone", () => {
    const draft = plan(
      `  zone west {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    const src = format(draft);
    expect(format(src)).toBe(src);
    const p = proven(src);
    expect(p).toBeTruthy();
    const { output } = applyFixes(src, [p!.fix]);
    expect(format(output)).toBe(output);
  });

  it("format(fixed) === fixed for a canonical loop nested in an if", () => {
    const draft = plan(
      `  if true {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    const src = format(draft);
    expect(format(src)).toBe(src);
    const p = proven(src);
    expect(p).toBeTruthy();
    const { output } = applyFixes(src, [p!.fix]);
    expect(format(output)).toBe(output);
  });

  // M1 (round-3 red team): a comment trailing `while … {` was carried AND left in the
  // verbatim slice, so it appeared TWICE. The six-comment case above never exercised this
  // slot at all, and even a fixture that did would have hidden the bug once `format()`ed
  // first — `arch fmt` moves a `{`-trailing comment onto its own next line, which is
  // exactly the position this fix ALSO carries it to, making "duplicated" and "correct"
  // look identical after formatting. So this is the reviewer's exact case, run on the
  // UNFORMATTED draft, on purpose.
  it("M1: a comment trailing `while … {` is carried exactly ONCE, not duplicated", () => {
    const src = plan(
      `  let i = 0\n  while i < 3 {   # three bays\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    const p = proven(src);
    expect(p).toBeTruthy();
    const { output } = applyFixes(src, [p!.fix]);
    expect(output.split("# three bays")).toHaveLength(2); // exactly one occurrence
    expect(output).not.toContain("# three bays   # three bays");

    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
  });

  // M2 (round-3 red team): `}` sharing the increment's own line (`i = i + 1 }`) made the
  // closing-indent slice walk backward into the increment's OWN text (no `\n` to stop
  // it), re-inserting the deprecated reassignment inside the `for` body.
  it("M2: DECLINED when `}` shares the increment's own line", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1 }`);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });

  it("m1: a carried comment uses the source's own CRLF line endings", () => {
    const draft = plan(
      `  let i = 0  # trailing let\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    const src = draft.replace(/\n/g, "\r\n");
    expect(src).toContain("\r\n");
    const p = proven(src);
    expect(p).toBeTruthy();
    const { output } = applyFixes(src, [p!.fix]);
    expect(output).toContain("# trailing let\r\n");
    expect(output).not.toMatch(/[^\r]\n/); // every "\n" is preceded by "\r" — no bare LF introduced
    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
  });

  it("m2: DECLINED when the body is only the increment (empty once it's dropped)", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    i = i + 1\n  }`);
    expect(proveWhileFixes(src)).toHaveLength(0);
  });
});

describe("proveWhileFixes — an imported module never gets a fix", () => {
  it("the importer sees the warning, forwarded and tagged, but NO fix — and still renders fine", () => {
    const mod = `plan "M" {\n  units mm\n  component c() {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n}\n`;
    const world: World = { read: (p) => (p.endsWith("m.arch") ? mod : null), now: () => new Date(0) };
    const main = `plan "P" {\n  units mm\n  import "lib/m.arch": c\n  c()\n}\n`;
    const c = compile(main, { noCache: true, world });
    expect(c.svg).toBeTruthy();
    expect(c.diagnostics.some((d) => d.code === "W_WHILE_DEPRECATED" && d.file === "lib/m.arch")).toBe(true);
    // `proveWhileFixes` never crosses into an imported module's own source at all —
    // its site collector is local-only, so there is nothing for it to even attempt here.
    expect(proveWhileFixes(main, { world })).toHaveLength(0);
  });
});

describe("`arch fix` — the one real caller, tiered by applicability", () => {
  function fixture(src: string): { dir: string; file: string } {
    const dir = mkdtempSync(join(tmpdir(), "archlang-while-fix-"));
    const file = join(dir, "p.arch");
    writeFileSync(file, src);
    return { dir, file };
  }

  it("applies a plan-level canonical fix by default (no --unsafe needed)", () => {
    const { file } = fixture(
      plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`),
    );
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "fix", file, "--dry-run", "--json"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.applied.map((a: { code: string }) => a.code)).toContain("W_WHILE_DEPRECATED");
    expect(j.diff).toContain("for i in 0..4");
  }, 60000);

  it("declines a component-site fix by default, and applies it only with --unsafe", () => {
    const src = plan(
      `  component c() {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  c()`,
    );
    const { file } = fixture(src);
    const rDefault = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "fix", file, "--dry-run", "--json"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(rDefault.status).toBe(0);
    const jDefault = JSON.parse(rDefault.stdout);
    expect(jDefault.applied).toEqual([]);
    expect(jDefault.unresolved).toContain("W_WHILE_DEPRECATED");

    const rUnsafe = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "fix", file, "--dry-run", "--unsafe", "--json"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(rUnsafe.status).toBe(0);
    const jUnsafe = JSON.parse(rUnsafe.stdout);
    expect(jUnsafe.applied.map((a: { applicability: string }) => a.applicability)).toContain("maybe-incorrect");
    expect(jUnsafe.diff).toContain("for i in 0..3");
  }, 60000);
});

describe("M-D: formatDiagnostic prints file-carrying diagnostics without a (wrong-file) excerpt", () => {
  it("a diagnostic with `file` gets `--> <file> [start..end]`, no source line, no line/col", async () => {
    const { formatDiagnostic } = await import("../src/diagnostics.js");
    const text = formatDiagnostic('plan "main" { units mm }', {
      severity: "warning",
      code: "W_WHILE_DEPRECATED",
      message: `"while" is deprecated and will be removed in a future major version.`,
      span: { start: 10, end: 20 },
      file: "lib/m.arch",
    });
    expect(text).toContain("--> lib/m.arch [10..20]");
    expect(text).not.toMatch(/\d+:\d+/); // no line:col
    expect(text).not.toContain("units mm"); // no excerpt from the WRONG file
  });
});
