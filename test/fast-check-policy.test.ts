/**
 * The fast-check run policy (docs/testing.md § 3, "Property tests without a seed").
 *
 * A property that asserts a NON-VACUITY or "at least one" claim (`some(`, `toBeGreaterThan(0)`,
 * `.length > 0`, "at least") must carry a `seed:` in the same `fc.assert(` / `fc.check(` call: an
 * unseeded draw can legitimately miss, and the claim would flake at the rate of the miss. A
 * universal law may stay unseeded (fast-check prints the seed and path on failure). The rest of the
 * calls that match are listed in `UNSEEDED_ALLOWED`, one row per `file :: nth match`, with why the
 * claim cannot miss.
 *
 * Also pins `FC_SCALE` itself: `runs()` scales a count and never returns less than 1.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FC_SCALE, runs } from "./setup/fast-check.js";

const ROOT = resolve(__dirname, "..");
const TEST_ROOTS = [
  "test",
  "playground/test",
  "editors/vscode/test",
  ...readdirSync(join(ROOT, "packages")).map((p) => `packages/${p}/test`),
];

function walk(rel: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(join(ROOT, rel));
  } catch {
    return out;
  }
  for (const n of names) {
    if (n === "node_modules") continue;
    const r = posix.join(rel, n);
    if (statSync(join(ROOT, r)).isDirectory()) walk(r, out);
    else if (n.endsWith(".test.ts")) out.push(r);
  }
  return out;
}

const SELF = "test/fast-check-policy.test.ts";
const FILES = TEST_ROOTS.flatMap((r) => walk(r))
  .filter((f) => f !== SELF)
  .sort();

/** The text of the call whose `(` sits at `open`, strings, template literals and comments skipped. */
function callText(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/** The end offset of the `it(`/`test(` call that contains `at`, or undefined when none does. */
function enclosingTestEnd(text: string, at: number): number | undefined {
  const starts = [...text.slice(0, at).matchAll(/\b(?:it|test)(?:\.\w+)?\(/g)];
  for (let i = starts.length - 1; i >= 0; i--) {
    const m = starts[i] as RegExpMatchArray;
    const open = (m.index as number) + m[0].length - 1;
    const end = open + callText(text, open).length;
    if (end > at) return end;
  }
  return undefined;
}

const CLAIM = /\bsome\(|toBeGreaterThan\(0\)|\.length\s*>\s*0|at least/i;

interface Call {
  /** 1-based order of the `fc.assert(`/`fc.check(` call within the file. */
  nth: number;
  line: number;
  claim: boolean;
  seeded: boolean;
}

/** Every `fc.assert(` / `fc.check(` call in `text` and whether it claims non-vacuity and has a seed. */
function propertyCalls(text: string): Call[] {
  const out: Call[] = [];
  for (const m of text.matchAll(/\bfc\.(?:assert|check)\(/g)) {
    const open = m.index + m[0].length - 1;
    const body = callText(text, open);
    // The claim often sits AFTER the call (`expect(found).toBeGreaterThan(0)`): read from the call to
    // the end of the enclosing `it(` / `test(` body, or just the call when there is none.
    const scope = text.slice(m.index, enclosingTestEnd(text, m.index) ?? open + body.length);
    out.push({
      nth: out.length + 1,
      line: text.slice(0, m.index).split("\n").length,
      claim: CLAIM.test(scope),
      seeded: /\bseed\s*:/.test(body),
    });
  }
  return out;
}

/** `file :: nth call` -> why an unseeded non-vacuity-looking property cannot miss. */
const UNSEEDED_ALLOWED: Record<string, string> = {
  "test/equivariance-fuzz.test.ts :: 2":
    "universal law: every violation is covered by a pinned class; the `some(` is the class lookup, not a claim that a draw exists",
  "test/fuzz.test.ts :: 1":
    "universal law: an error diagnostic implies an empty svg; the `some(` only decides which branch to assert",
  "test/fuzz.test.ts :: 16": "universal law (finish() is never worse); the `some(` only selects the roll-back branch",
  "test/path-algebra.test.ts :: 7":
    "universal law: bfsNearest equals the minimum over single-source runs; the `.length > 0` is the empty-reach branch",
  "test/reroll-findrun-oracle.test.ts :: 3":
    "universal law: the whole-list collection is null iff any pair is; the `some(` is the oracle itself",
};

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("fast-check run policy", () => {
  it("runs() scales a count and never returns less than 1", () => {
    expect(runs(300)).toBe(Math.max(1, Math.round(300 * FC_SCALE)));
    expect(runs(1)).toBeGreaterThanOrEqual(1);
    expect(runs(0)).toBe(1);
  });

  it("the detector reads a call's whole body (red on an unseeded claim)", () => {
    const src = [
      "fc.assert(fc.property(a, (x) => { expect(seen.some((s) => s === x)).toBe(true); }), { numRuns: 5 });",
      "fc.assert(fc.property(a, (x) => { expect(x.length).toBe(1); }), { numRuns: 5, seed: 1 });",
      'fc.assert(fc.property(a, (x) => { f("at least ) one"); }), { seed: 7 });',
    ].join("\n");
    const after =
      'it("x", () => {\n  fc.assert(fc.property(a, (x) => { n++; }), { numRuns: 5 });\n  expect(n).toBeGreaterThan(0);\n});';
    expect(propertyCalls(after).map((c) => [c.claim, c.seeded])).toEqual([[true, false]]);
    expect(propertyCalls(src).map((c) => [c.claim, c.seeded])).toEqual([
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  it("a non-vacuity property carries a seed, or is allow-listed with a reason", () => {
    const offenders = FILES.flatMap((f) =>
      propertyCalls(read(f))
        .filter((c) => c.claim && !c.seeded && !(`${f} :: ${c.nth}` in UNSEEDED_ALLOWED))
        .map((c) => `${f}:${c.line} (call ${c.nth})`),
    );
    expect(
      offenders,
      "an 'at least one' / non-vacuity claim over an unseeded draw can miss: add `seed:` to the call, or list `file :: nth` in UNSEEDED_ALLOWED with why it cannot miss",
    ).toEqual([]);
  });

  it("every allow-list row still names an unseeded claim", () => {
    const live = new Set(
      FILES.flatMap((f) =>
        propertyCalls(read(f))
          .filter((c) => c.claim && !c.seeded)
          .map((c) => `${f} :: ${c.nth}`),
      ),
    );
    expect(Object.keys(UNSEEDED_ALLOWED).filter((k) => !live.has(k))).toEqual([]);
  });
});
