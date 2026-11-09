/**
 * Counts, not clocks (AGENTS.md: "budgets are counts, never time").
 *
 * 1. No test asserts on a wall clock: a `Date.now()` / `performance.now()` / `hrtime` read inside an
 *    `expect(` argument, or captured into a name that a later `expect(` uses, is a flake waiting
 *    for a loaded runner. Assert on the work count (steps, probes, drawing units) instead. A
 *    smoke bound that cannot be a count, or a wait helper, goes in `CLOCK_ALLOWED` with the reason.
 * 2. Every per-test timeout above 120 s is listed in `SLOW_ALLOWED`, one row per file, so a test
 *    that drifts to minutes surfaces as a finding instead of hiding behind its own timeout.
 *
 * The scan derives the file set from the same globs as `vitest.config.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

const SELF = "test/no-clock-assertions.test.ts";
const FILES = TEST_ROOTS.flatMap((r) => walk(r))
  .filter((f) => f !== SELF)
  .sort();

const CLOCK_CALL = /\b(?:Date\.now|performance\.now)\s*\(|\bhrtime\b/;
/** `const t0 = Date.now()`, `let t = performance.now()` or a bare `t0 = Date.now()`. */
const CAPTURE =
  /(?:\b(?:const|let|var)\s+)?\b([A-Za-z_$][\w$]*)\s*=[^=][^;\n]*?(?:\b(?:Date\.now|performance\.now)\s*\(|\bhrtime\b)/;

const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

/** The argument text of the call whose `(` is at `open` (strings skipped), across lines. */
function argText(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/**
 * The 1-based line of every `expect(` whose argument (possibly over several lines) reads a clock, or
 * uses a name captured from a clock EARLIER in the file: the stamp is always taken before the
 * assertion, so any later `expect(` that mentions the name counts, however far down it sits.
 *
 * Blind spot, accepted: a clock read inside a helper (`const took = () => performance.now() - t0`,
 * or a function that returns the elapsed time) is not followed; the helper's call site is not seen
 * as a clock. The guard is a tripwire for the direct forms, not a proof.
 */
function clockAssertions(text: string): number[] {
  const lines = text.split("\n");
  const hits = new Set<number>();
  const captured: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (isComment(l)) return;
    const cap = CAPTURE.exec(l);
    if (cap?.[1]) captured.push({ name: cap[1], line: i });
  });
  const lineOf = (offset: number) => text.slice(0, offset).split("\n").length;
  for (const m of text.matchAll(/\bexpect\s*\(/g)) {
    const line = lineOf(m.index);
    if (isComment(lines[line - 1] ?? "")) continue;
    const arg = argText(text, m.index + m[0].length - 1);
    if (CLOCK_CALL.test(arg)) hits.add(line);
    for (const c of captured) {
      if (c.line < line - 1 && new RegExp(`(?<![\\w$.])${c.name.replace(/\$/g, "\\$")}(?![\\w$])`).test(arg))
        hits.add(line);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

/** Honest remaining clock uses: file -> why a count cannot stand in. */
const CLOCK_ALLOWED: Record<string, string> = {
  "test/diagnostics-volume.test.ts":
    "the one time-based check for the uncapped path, by ruling: offsetToLineCol called outside compile() has no 500-diagnostic cap and no work counter, so a 10 s smoke over 200,000 calls is what catches the quadratic scan; the 30 s flood smoke beside it is a backstop for the counted caps",
  "test/rectilinear-sides.test.ts":
    "30 s smoke that a pathological rectilinear input returns at all; the step budget is the real bound and is asserted elsewhere in the suite",
  "packages/archlang-3d/test/mesh.test.ts":
    "2 s smoke on the 3D mesh builder, which lives outside the core's step meter and exports no count",
};

/** Per-test timeouts above 120 s, one row per file: the test sweeps a corpus or a generated family. */
const SLOW_ALLOWED: Record<string, string> = {
  "test/cli-commands.test.ts":
    "the three `watch` tests spawn the CLI and wait for a save to be recompiled and reported",
  "test/cli-validate-next.test.ts":
    "every example x variant through the CLI validate path, output compared with and without `next`",
  "test/drawing-budget.test.ts": "corpus sweep: drawn units against the drawing budget for every example",
  "test/finish-furnish.test.ts":
    "a generated-rows property plus the wet-room sweep (its counts), each candidate compile-checked",
  "test/finish-levels.test.ts":
    "the compile-check count over every storey of the corpus, and a generated-storeys property",
  "test/finish.test.ts": "sheet-stage candidates measured on every example and every planted refusal",
  "test/huge-coordinates.test.ts":
    "one case: transit-hall scaled x1000 must be refused with E_OUT_OF_RANGE, never thrown",
  "test/keep-byte-identity.test.ts": "digest and evaluation steps of every corpus file (the weak keep law)",
  "test/label-fit.test.ts":
    "the label-fit rule over the corpus: moves only reported labels, and agrees with the passes before it",
  "test/label-placement-oracle.test.ts":
    "oracle against the placer on every corpus storey, on named families and on a pile of identical rooms",
  "test/label-wrap.test.ts": "the wrap law over the corpus, and a 120-run generated narrow-room property",
  "test/lint-hint-paste.test.ts": "applies each lint hint and re-lints, walk round included, across the corpus",
  "test/lint-layers.test.ts": "lints the corpus checking every warning is among its rule's codes",
  "test/lint-summary.test.ts":
    "the lint summary key and `lint --json` equality with lint(), byte for byte, over the corpus",
  "test/net-area-oracle-corpus.test.ts":
    "the net-area oracle over every room of the corpus (its work count is pinned in the test)",
  "test/polygon-overlap-oracle.test.ts": "every pair of rings in each corpus plan, with each eps a caller passes",
  "test/reroll-findrun-oracle.test.ts":
    "two reroll properties over generated sources (new finder against the oracle, 300 s each)",
  "test/shaft-equivariance.test.ts": "one test per bound: shaft facts under the D4 group, each over a corpus plan",
  "test/stages.test.ts": "the stage of every diagnostic over every example, and the held-back counts per stage",
  "test/step-budget.test.ts":
    "every clean corpus plan spends at most 1/100 of the step budget, every error demo at most 1/10",
  "test/taste-budget.test.ts": "the taste charge against its budget on every corpus plan, and the skip behaviour",
  "test/taste-digests.test.ts":
    "taste digests: a profile that inherits generic must report generic's numbers, over the corpus",
  "test/taste-invisible.test.ts": "every corpus file's payload equals the one taken before taste ran",
  "test/taste-separation.test.ts": "twin pairs over the corpus ledger, both ways",
  "test/taste.test.ts": "every room a taste message names is named by its label, over the corpus",
  "playground/test/glb-export.test.ts": "every example built into a GLB by the page and by the CLI, bytes compared",
};

const NUM = /(?:timeout:|testTimeout:|\},|setTimeout\()\s*([0-9_]+(?:\s*\*\s*[0-9_]+)*)\s*[,)}]/g;

/** The timeouts (ms) above `limit` that `text` pins on a test. */
function slowTimeouts(text: string, limit = 120_000): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUM)) {
    const v = (m[1] ?? "")
      .replace(/_/g, "")
      .split("*")
      .map((x) => Number(x.trim()))
      .reduce((a, b) => a * b, 1);
    if (v > limit) out.push(v);
  }
  return out;
}

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("counts, not clocks", () => {
  it("the detector sees a clock bound and a captured stamp (red on a violation)", () => {
    expect(clockAssertions("expect(Date.now() - t0).toBeLessThan(2000);")).toEqual([1]);
    expect(
      clockAssertions("const t0 = performance.now();\nwork();\nexpect(performance.now() - t0).toBeLessThan(5);"),
    ).toEqual([3]);
    expect(clockAssertions("const t = Date.now();\nwork();\nconst dt = 3;\nexpect(t).toBe(1);")).toEqual([4]);
    expect(clockAssertions("expect(\n  performance.now() - t0,\n).toBeLessThan(5);")).toEqual([1]);
    expect(clockAssertions("let t0;\nt0 = Date.now();\nwork();\nexpect(t0).toBe(1);")).toEqual([4]);
    expect(clockAssertions("// expect(Date.now())\nconst end = Date.now() + 5;\nwhile (Date.now() < end) {}")).toEqual(
      [],
    );
  });

  it("the timeout scan sees a long timeout", () => {
    expect(slowTimeouts("it('x', () => {}, 300_000);")).toEqual([300_000]);
    expect(slowTimeouts("it('x', { timeout: 60_000 }, () => {});")).toEqual([]);
  });

  it("no test asserts on a wall clock outside the allow-list", () => {
    const found = FILES.filter((f) => !(f in CLOCK_ALLOWED)).flatMap((f) =>
      clockAssertions(read(f)).map((line) => `${f}:${line}`),
    );
    expect(
      found,
      "a clock bound is a latent flake: assert on the work count (steps, probes, drawing units). If it truly cannot be a count, add the file to CLOCK_ALLOWED with the reason.",
    ).toEqual([]);
  });

  it("every allow-list row still names a file that reads a clock inside an assertion", () => {
    const stale = Object.keys(CLOCK_ALLOWED).filter((f) => !FILES.includes(f) || clockAssertions(read(f)).length === 0);
    expect(stale, "remove the row: the file no longer asserts on a clock (or no longer exists)").toEqual([]);
  });

  it("every per-test timeout above 120 s is allow-listed, and every row is still needed", () => {
    const slow = FILES.filter((f) => slowTimeouts(read(f)).length > 0);
    expect(
      slow.filter((f) => !(f in SLOW_ALLOWED)),
      "a test that needs more than 120 s is a finding: make it faster, or add the file to SLOW_ALLOWED with the reason",
    ).toEqual([]);
    expect(
      Object.keys(SLOW_ALLOWED).filter((f) => !slow.includes(f)),
      "remove the row: the file has no timeout above 120 s any more",
    ).toEqual([]);
  });
});
