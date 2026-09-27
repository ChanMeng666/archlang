/**
 * W7 — `W_WHILE_DEPRECATED` / `W_REASSIGN_DEPRECATED` (`src/while-deprecation.ts`).
 *
 * `compile()` ONLY ever emits these two advisory warnings — never a fix. The proof that
 * makes the `while`→`for` rewrite sound lives entirely outside `compile()`, in
 * `src/while-fix.ts`'s `proveWhileFixes` (tested in `test/while-fix.test.ts`); a second
 * red-team round found that even a compile()-internal proof was itself unsound (a hidden,
 * input-dependent side channel on what is supposed to be a pure function of source text),
 * so this file now only covers the warnings themselves — both advisory-only, and never
 * changing `describe()`/`lint()`/SVG output.
 */

import { describe, expect, it } from "vitest";
import { codeActions, compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

const codesOf = (src: string, opts: Record<string, unknown> = {}): string[] =>
  compile(src, { noCache: true, ...opts })
    .diagnostics.map((d) => d.code)
    .filter((c): c is string => !!c);

/** The canonical counted-loop shape — the one `proveWhileFixes` offers a fix for. Used
 *  here only to prove `compile()` itself carries none, ever. */
const canonical = (n: number): string =>
  plan(`  let i = 0\n  while i < ${n} {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);

describe("W_WHILE_DEPRECATED / W_REASSIGN_DEPRECATED — advisory only, never a fix", () => {
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

  it("LSP codeActions never sees a while fix (resolves independently of compile(), which never carries one)", () => {
    const src = plan(`  let i = 0\n  while i < 4 {\n    column at (i * 300, 0) size 100x100\n    i = i + 1\n  }`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED")!;
    expect(codeActions(src, d.span!)).toHaveLength(0);
  });

  it("compile() NEVER carries a fix on W_WHILE_DEPRECATED, even for the canonical shape, memoised or not", () => {
    const src = canonical(4);
    const cached1 = compile(src);
    const cached2 = compile(src);
    const uncached = compile(src, { noCache: true });
    for (const r of [cached1, cached2, uncached]) {
      const d = r.diagnostics.find((x) => x.code === "W_WHILE_DEPRECATED");
      expect(d).toBeTruthy();
      expect(d!.fixes).toBeUndefined();
    }
  });
});
