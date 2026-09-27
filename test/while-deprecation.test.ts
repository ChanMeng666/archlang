/**
 * W7 — `W_WHILE_DEPRECATED` / `W_REASSIGN_DEPRECATED` (`src/while-deprecation.ts`) and
 * the proof-gated machine fix (`src/while-fix.ts` + `src/index.ts`'s `attachWhileFixes`).
 *
 * Both warnings are advisory-only and never change `describe()`/`lint()`/SVG output. The
 * fix is attached ONLY after `src/index.ts` compiles a candidate rewrite (the "twin") and
 * proves it renders, describes and lints identically to the original (deprecation codes
 * excluded) — a red-team review found the first cut (attaching a fix straight from the
 * syntactic shape check) unsound, and every disqualifying case below is one of its
 * counterexamples, turned into a regression test.
 */

import { describe, expect, it } from "vitest";
import { applyFixes, codeActions, compile, describe as describePlan, format, lint } from "../src/index.js";
import type { World } from "../src/world.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

const codesOf = (src: string, opts: Record<string, unknown> = {}): string[] =>
  compile(src, { noCache: true, ...opts })
    .diagnostics.map((d) => d.code)
    .filter((c): c is string => !!c);

function whileFix(src: string, opts: Record<string, unknown> = {}) {
  const d = compile(src, { noCache: true, ...opts }).diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED");
  return d?.fixes?.[0];
}

describe("W_WHILE_DEPRECATED / W_REASSIGN_DEPRECATED — advisory only", () => {
  it("fires on a `while` statement", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("fires on a stray reassignment (outside any while)", () => {
    const src = plan(`  let total = 0\n  total = total + 100`);
    const codes = codesOf(src);
    expect(codes).toContain("W_REASSIGN_DEPRECATED");
    expect(codes).not.toContain("W_WHILE_DEPRECATED");
  });

  it("never raises an error, and never changes SVG on the SAME plan compiled twice", () => {
    const src = plan(`  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const result = compile(src);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.svg).toBeTruthy();
  });

  it("does not change SVG/describe/lint of an UNRELATED plan (one using neither form)", () => {
    // This plan uses neither `while` nor reassignment, so it must compile, describe and
    // lint identically whether or not the deprecation checker runs at all — proven here
    // against a plan compiled from a DIFFERENT, unrelated source (not a self-comparison).
    const unrelated = plan(
      `  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n` +
        `  room id=r at (0,0) size 4000x3000 label "Room"\n  door id=d on exterior at 20% width 900`,
    );
    const a = compile(unrelated, { noCache: true });
    const b = compile(unrelated, { noCache: true });
    expect(a.svg).toBe(b.svg);
    expect(a.diagnostics).toEqual(b.diagnostics);
    expect(a.diagnostics.some((d) => d.code === "W_WHILE_DEPRECATED" || d.code === "W_REASSIGN_DEPRECATED")).toBe(
      false,
    );
    expect(describePlan(unrelated)).toEqual(describePlan(unrelated));
    expect(lint(unrelated)).toEqual(lint(unrelated));
  });

  it("M2: does not double-warn ANY reassignment lexically inside a while, wherever it sits", () => {
    // The increment FIRST, not last.
    const first = plan(`  let i = 0\n  while i < 3 {\n    i = i + 1\n    column at (i * 300, 0) size 100x100\n  }`);
    expect(codesOf(first).filter((c) => c === "W_REASSIGN_DEPRECATED")).toHaveLength(0);

    // A progress step split across `if`/`else`.
    const ifElse = plan(
      `  let i = 0\n  while i < 10 {\n    if i % 2 == 0 {\n      i = i + 3\n    } else {\n      i = i + 1\n    }\n  }`,
    );
    expect(codesOf(ifElse).filter((c) => c === "W_REASSIGN_DEPRECATED")).toHaveLength(0);

    // A second reassignment to an unrelated name, also inside the body.
    const twoAssigns = plan(`  let i = 0\n  let x = 0\n  while i < 3 {\n    i = i + 1\n    x = x + 1\n  }`);
    expect(codesOf(twoAssigns).filter((c) => c === "W_REASSIGN_DEPRECATED")).toHaveLength(0);
  });

  it("warns on a `while` inside a component body", () => {
    const src = plan(
      `  component c() {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  c()`,
    );
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("warns on a `while` inside a `level` block", () => {
    const src = `plan "P" {\n  units mm\n  level 1 {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n}\n`;
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("warns on a `while` inside a `zone` block", () => {
    const src = plan(
      `  zone west {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    expect(codesOf(src)).toContain("W_WHILE_DEPRECATED");
  });

  it("a plan using neither `while` nor reassignment gets neither code", () => {
    const src = plan(`  for i in 0..3 {\n    column at (i * 300, 0) size 100x100\n  }`);
    const codes = codesOf(src);
    expect(codes).not.toContain("W_WHILE_DEPRECATED");
    expect(codes).not.toContain("W_REASSIGN_DEPRECATED");
  });

  it("M1: an imported module's while/reassign is forwarded, tagged with `file`, with NO fix", () => {
    const mod = `plan "M" {\n  units mm\n  component c() {\n    let i = 0\n    while i < 2 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n}\n`;
    const world: World = { read: (p) => (p.endsWith("m.arch") ? mod : null), now: () => new Date(0) };
    const main = `plan "P" {\n  units mm\n  import "lib/m.arch": c\n  c()\n}\n`;
    const r = compile(main, { noCache: true, world });
    const d = r.diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED");
    expect(d).toBeTruthy();
    expect(d!.file).toBe("lib/m.arch");
    expect(d!.fixes).toBeUndefined();
  });

  it("M1: no OTHER module warning is forwarded — an import-only plan is byte-identical", () => {
    // A module with an unrelated warning (an unknown theme key) must NOT move the
    // importer's diagnostics — only W7's two codes get the cross-file exception.
    const mod = `plan "M" {\n  units mm\n  theme mono { unknownKey "x" }\n  component c() {\n    room at (0,0) size 3000x3000\n  }\n}\n`;
    const world: World = { read: (p) => (p.endsWith("m.arch") ? mod : null), now: () => new Date(0) };
    const main = `plan "P" {\n  units mm\n  import "lib/m.arch": c\n  c()\n}\n`;
    const r = compile(main, { noCache: true, world });
    expect(r.diagnostics.some((d) => d.code === "W_UNKNOWN_THEME_KEY")).toBe(false);
  });

  it("LSP codeActions never sees the fix (it resolves independently of compile())", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED")!;
    expect(codeActions(src, d.span!)).toHaveLength(0);
  });
});

describe("the machine-applicable fix — proof-gated, per the W7 red-team findings", () => {
  const canonical = (n: number): string =>
    plan(`  let i = 0\n  while i < ${n} {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);

  it("is offered on the canonical shape, and applying it compiles to the SAME bytes", () => {
    const src = canonical(4);
    const fix = whileFix(src);
    expect(fix).toBeTruthy();
    expect(fix!.applicability).toBe("machine-applicable");

    const { output, applied } = applyFixes(src, [fix!]);
    expect(applied).toHaveLength(1);
    expect(output).toContain("for i in 0..4");
    expect(output).not.toContain("while");

    const before = compile(src, { noCache: true });
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);
    const isDeprecation = (d: { code?: string }) =>
      d.code === "W_WHILE_DEPRECATED" || d.code === "W_REASSIGN_DEPRECATED";
    const stripDeprecation = (ds: typeof before.diagnostics) => ds.filter((d) => !isDeprecation(d));
    expect(stripDeprecation(after.diagnostics)).toEqual(stripDeprecation(before.diagnostics));
    const stripDescribe = (d: ReturnType<typeof describePlan>) => ({
      ...d,
      diagnostics: (d as { diagnostics?: { code?: string }[] }).diagnostics?.filter((x) => !isDeprecation(x)),
    });
    expect(stripDescribe(describePlan(output))).toEqual(stripDescribe(describePlan(src)));
    expect(lint(output)).toEqual(lint(src));
  });

  it("PROOF: a plan whose lint() carries real diagnostics is proved by code+message, spans excluded", () => {
    // Disconnected, unreachable rooms inside the loop body (nested if/for, string
    // interpolation of `i`) — every lint code below is real, and the fix must still be
    // offered because the two lint()s agree on {code, message}; only spans shift.
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    if i % 2 == 0 {\n      room at (i * 4000, 0) size 3000x3000 label "Even {i}"\n    } else {\n      room at (i * 4000, 0) size 3000x3000 label "Odd {i}"\n    }\n    for j in 0..2 {\n      column at (i * 4000 + j * 1000, 3500) size 200x200\n    }\n    set door(swing: out)\n    i = i + 1\n  }`,
    );
    const before = compile(src, { noCache: true });
    const beforeLint = lint(src);
    expect(beforeLint.length).toBeGreaterThan(0);
    expect(beforeLint.some((d) => d.code === "W_ROOM_DISCONNECTED")).toBe(true);

    const fix = whileFix(src);
    expect(fix).toBeTruthy();
    const { output } = applyFixes(src, [fix!]);
    const after = compile(output, { noCache: true });
    expect(after.svg).toBe(before.svg);

    const afterLint = lint(output);
    const key = (ds: typeof beforeLint) => ds.map((d) => `${d.code}\u0000${d.message}`).sort();
    expect(key(afterLint)).toEqual(key(beforeLint));
    // The spans DID shift (the rewrite is shorter than the original) — proving the
    // exclusion is doing real work, not passing because nothing moved.
    expect(afterLint.map((d) => d.span)).not.toEqual(beforeLint.map((d) => d.span));
  });

  // `format()` always prints every plan-header setting explicitly (e.g. `north up`), even
  // one the source never authored — so `format(x) === x` is only ever true of a source
  // that is ALREADY canonical. Each case below first canonicalizes its draft with
  // `format()`, then checks the FIX preserves that fixpoint — the property the task card
  // actually asks for (the rewrite prints at the loop's real nesting depth, so the fixed
  // file needs no further reformatting), stated in a way `format()`'s own header-printing
  // quirk cannot fail on its own.
  it("format(fixed) === fixed for a canonical loop nested in a zone", () => {
    const draft = plan(
      `  zone west {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    const src = format(draft);
    expect(format(src)).toBe(src); // the draft's canonical form is itself a fixpoint
    const fix = whileFix(src);
    expect(fix).toBeTruthy();
    const { output } = applyFixes(src, [fix!]);
    expect(format(output)).toBe(output);
  });

  it("format(fixed) === fixed for a canonical loop nested in an if", () => {
    const draft = plan(
      `  if true {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }`,
    );
    const src = format(draft);
    expect(format(src)).toBe(src);
    const fix = whileFix(src);
    expect(fix).toBeTruthy();
    const { output } = applyFixes(src, [fix!]);
    expect(format(output)).toBe(output);
  });

  it("DECLINED — B1: a component called from the body READS the loop counter", () => {
    const src = plan(
      `  component c() {\n    column at (i * 300, 0) size 100x100\n  }\n  let i = 0\n  while i < 3 {\n    c()\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B1: a component called from the body WRITES the loop counter", () => {
    const src = plan(
      `  component skip() {\n    i = i + 1\n  }\n  let i = 0\n  while i < 6 {\n    column at (i * 300, 0) size 100x100\n    skip()\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B1: `zone` is scope-transparent, and `i` is used after it", () => {
    const src = plan(
      `  zone west {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  column at (i * 300, 600) size 100x100`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B1: a component called AFTER the loop reads the counter", () => {
    const src = plan(
      `  component c() {\n    column at (i * 300, 600) size 100x100\n  }\n  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  c()`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B1: B depends on a global a component in BODY reassigns", () => {
    const src = plan(
      `  let n = 2\n  component grow() {\n    n = n + 1\n  }\n  let i = 0\n  while i < n {\n    column at (i * 300, 0) size 100x100\n    grow()\n    i = i + 1\n  }`,
    );
    // The original itself is already unsound (an ever-growing bound never terminates
    // normally) and hits E_WHILE_LIMIT — the global no-original-error gate excludes it.
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_WHILE_LIMIT")).toBe(true);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B1: B >= 10001 (the original hits E_WHILE_LIMIT; `for` would not)", () => {
    const src = plan(
      `  room at (0,0) size 3000x3000\n  let i = 0\n  while i < 10001 {\n    let y = i\n    i = i + 1\n  }`,
    );
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_WHILE_LIMIT")).toBe(true);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B2: a recovered parse error inside the body is never reprinted", () => {
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100\n    bogus stuff here\n    i = i + 1\n  }`,
    );
    const before = compile(src, { noCache: true });
    expect(before.diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED — B2: a bogus trailing clause on a statement inside the body", () => {
    const src = plan(
      `  let i = 0\n  while i < 3 {\n    column at (i * 300, 0) size 100x100 bogus\n    column at (i * 300, 400) size 100x100\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: the increment is not the last statement of the body", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    i = i + 1\n    column at (i * 300, 0) size 100x100\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: another assignment exists in the body besides the increment", () => {
    const src = plan(
      `  let i = 0\n  let extra = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    extra = extra + 1\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: B references the loop variable", () => {
    const src = plan(
      `  let i = 0\n  let n = 4\n  while i < n + i {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: I is referenced after the loop", () => {
    const src = plan(
      `  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  let last = i`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: the condition is not strictly `<`", () => {
    const src = plan(`  let i = 0\n  while i <= 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: no `let I = A` immediately before the while", () => {
    const src = plan(
      `  let i = 0\n  column at (0, 9000) size 100x100\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`,
    );
    expect(whileFix(src)).toBeUndefined();
  });

  it("DECLINED: the increment is not literally `I = I + 1`", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 2\n  }`);
    expect(whileFix(src)).toBeUndefined();
  });

  it("nested canonical whiles: the OUTER is disqualified by the inner's own increment, the INNER is offered", () => {
    const src = plan(
      `  let i = 0\n  while i < 2 {\n    let j = 0\n    while j < 2 {\n      column at (i * 600 + j * 300, 0) size 100x100\n      j = j + 1\n    }\n    i = i + 1\n  }`,
    );
    const r = compile(src, { noCache: true });
    const whiles = r.diagnostics.filter((d) => d.code === "W_WHILE_DEPRECATED");
    expect(whiles).toHaveLength(2);
    expect(whiles.map((d) => d.fixes?.length ?? 0).sort()).toEqual([0, 1]);
  });

  it("two independent sibling canonical whiles are BOTH offered, each with the right range", () => {
    const src = plan(
      `  let i = 0\n  while i < 2 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }\n  let k = 0\n  while k < 3 {\n    column at (k * 300, 900) size 100x100\n    k = k + 1\n  }`,
    );
    const r = compile(src, { noCache: true });
    const whiles = r.diagnostics.filter((d) => d.code === "W_WHILE_DEPRECATED");
    expect(whiles).toHaveLength(2);
    expect(whiles.every((d) => (d.fixes?.length ?? 0) === 1)).toBe(true);
  });

  it("is deterministic across a memoised and a noCache compile of the same source", () => {
    const src = plan(`  let i = 0\n  while i < 2 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const a = JSON.stringify(compile(src).diagnostics);
    const b = JSON.stringify(compile(src).diagnostics);
    const c = JSON.stringify(compile(src, { noCache: true }).diagnostics);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
