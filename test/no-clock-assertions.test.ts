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

const CLOCK = /\b(?:Date\.now|performance\.now)\s*\(|\bhrtime\b/;
const CAPTURE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^=]*(?:\b(?:Date\.now|performance\.now)\s*\(|\bhrtime\b)/;

const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

/** `file:line` of every clock-in-assertion in `text`. */
function clockAssertions(text: string): number[] {
  const lines = text.split("\n");
  const hits = new Set<number>();
  const captured: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (isComment(l)) return;
    const cap = CAPTURE.exec(l);
    if (cap?.[1]) captured.push({ name: cap[1], line: i });
    if (CLOCK.test(l) && /\bexpect\s*\(/.test(l)) hits.add(i + 1);
  });
  lines.forEach((l, i) => {
    if (isComment(l) || !/\bexpect\s*\(/.test(l)) return;
    for (const c of captured) {
      // The captured value is used by an `expect(` within a few lines of its capture, or later in
      // the same test (a start stamp read after the work): the stamp is always before the expect.
      if (c.line < i && new RegExp(`\\b${c.name.replace(/\$/g, "\\$")}\\b`).test(l)) hits.add(i + 1);
    }
  });
  return [...hits].sort((a, b) => a - b);
}

/** Honest remaining clock uses: file -> why a count cannot stand in. */
const CLOCK_ALLOWED: Record<string, string> = {
  "test/diagnostics-volume.test.ts":
    "10 s / 30 s linear-time smoke over a generated volume of diagnostics (#597); the count bound is pinned beside it, the clock only catches a quadratic blow-up of the whole pipeline",
  "test/rectilinear-sides.test.ts":
    "30 s smoke that a pathological rectilinear input returns at all; the step budget is the real bound and is asserted elsewhere in the suite",
  "test/rooms-tiling-probe.test.ts":
    "5 s smoke over the tiling probe on a large input; the probe has no exported work counter to read",
  "packages/archlang-3d/test/mesh.test.ts":
    "2 s smoke on the 3D mesh builder, which lives outside the core's step meter and exports no count",
};

/** Per-test timeouts above 120 s, one row per file: the test sweeps a corpus or a generated family. */
const SLOW_ALLOWED: Record<string, string> = {
  "test/cli-commands.test.ts": "spawns the built CLI per command, serial; process start dominates",
  "test/cli-validate-next.test.ts": "runs the CLI over every example, one process each",
  "test/drawing-budget.test.ts": "compiles drawings sized at the drawing budget's edge",
  "test/finish-furnish.test.ts": "furnishes a generated family of plans and the whole corpus",
  "test/finish-levels.test.ts": "finishes a generated family of storeys and the whole corpus",
  "test/finish.test.ts": "finishes every example of the corpus",
  "test/huge-coordinates.test.ts": "sweeps coordinate magnitudes up to the model range across element kinds",
  "test/keep-byte-identity.test.ts": "hashes SVG + describe + lint over the whole corpus (byte-identity law)",
  "test/label-fit.test.ts": "label fitting over the corpus and a generated family",
  "test/label-placement-oracle.test.ts": "brute-force oracle against the label placer over the corpus",
  "test/label-wrap.test.ts": "label wrapping over the corpus at several widths",
  "test/lint-hint-paste.test.ts": "pastes every lint hint back through the compiler across the corpus",
  "test/lint-layers.test.ts": "lints the corpus once per layer set",
  "test/lint-summary.test.ts": "lints the whole corpus and compares the summary",
  "test/net-area-oracle-corpus.test.ts": "net-area oracle over the whole corpus (work count is pinned in-test)",
  "test/polygon-overlap-oracle.test.ts": "overlap oracle versus brute force over generated polygons",
  "test/reroll-findrun-oracle.test.ts": "generated-sources property against the brute-force oracle",
  "test/shaft-equivariance.test.ts": "the D4 group over shafts across the corpus",
  "test/stages.test.ts": "stage of every lint code over the corpus",
  "test/step-budget.test.ts": "step-budget probes that run each evaluator to its limit",
  "test/taste-budget.test.ts": "taste rules over the corpus at the budget's edge",
  "test/taste-digests.test.ts": "taste digests over the whole corpus",
  "test/taste-invisible.test.ts": "taste rules must not move drawings; whole-corpus sweep",
  "test/taste-separation.test.ts": "taste/lint separation over the corpus",
  "test/taste.test.ts": "taste rules over the whole corpus",
  "playground/test/glb-export.test.ts": "builds every example's GLB through the page and the CLI and compares bytes",
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
