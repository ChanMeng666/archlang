/**
 * The parser's error-recovery METRIC, pinned as floors over a FROZEN corpus.
 *
 * `test/recovery-metric.ts` defines it (statement-fingerprint survival over deterministic
 * mutants). The corpus is `test/recovery-corpus/`: verbatim copies of eight examples,
 * chosen for statement-form coverage (walls' point blocks, `theme`/`style` blocks,
 * `for`/`if`/`let`, `component`/`place`, `zone`, `level`, `strip`). It is a SNAPSHOT, not
 * `examples/`: the examples move with every feature, and a floor over a moving corpus
 * goes red on an added example with no parser change — the only "fix" would be to retype
 * the number. No other sweep reads this directory (byte-identity, docs, dataset and spec
 * guards all read `examples/`, `test/fixtures/` or `eval/`). Never edit these files; to
 * widen the corpus, add a file AND re-measure every floor in the same commit, recording
 * the before/after below.
 *
 * Measured with the same body (`TOKEN_STRIDE` 13):
 *
 * | class                      | any-depth stop (before)  | brace-balance aware (floor) |
 * |----------------------------|--------------------------|-----------------------------|
 * | `dropBrace` (71 mutants)   | 2734/2877 = 0.950295     | 2809/2877 = 0.976364        |
 * | `dropToken` (307 mutants)  | 10621/12756 = 0.832628   | 12364/12756 = 0.969269      |
 * | `insertBrace` (266)        | 11145/11146 = 0.999910   | 11145/11146 = 0.999910      |
 * | `subToken` (307 mutants)   | 11535/12756 = 0.904280   | 12370/12756 = 0.969740      |
 *
 * `insertBrace` exists because a brace-DEPTH rule that trusted every `{` scored
 * 6495/11146 = 0.582720 on it: a stray `room … {` swallowed every later statement.
 *
 * The floors may only rise. A red floor is a recovery regression, not a number to re-measure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import {
  measure,
  multisetIntersection,
  MUTATION_CLASSES,
  statementFingerprints,
  type MetricApi,
  type MutationClass,
} from "./recovery-metric.js";

const API: MetricApi = { lex, parse };
const CORPUS = resolvePath("test/recovery-corpus");
const FILES = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".arch"))
  .sort();
const SOURCES = FILES.map((f) => readFileSync(join(CORPUS, f), "utf8"));

/** Per class: the exact mutant and statement counts (the corpus is frozen) and the floor. */
const FLOORS: Record<MutationClass, { mutants: number; original: number; survived: number }> = {
  dropBrace: { mutants: 71, original: 2877, survived: 2809 },
  dropToken: { mutants: 307, original: 12756, survived: 12364 },
  insertBrace: { mutants: 266, original: 11146, survived: 11145 },
  subToken: { mutants: 307, original: 12756, survived: 12370 },
};

describe("parser recovery metric — the measurement is honest", () => {
  it("the frozen corpus is the one measured", () => {
    expect(FILES).toEqual([
      "attached.arch",
      "clinic.arch",
      "materials.arch",
      "parametric.arch",
      "studio.arch",
      "terrace-row.arch",
      "themed.arch",
      "two-storey.arch",
    ]);
  });

  it("every corpus file parses clean, so a mutant's loss is the mutation's alone", () => {
    for (const src of SOURCES) {
      expect(parse(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });

  it("fingerprints carry no position: re-indenting every line keeps every statement", () => {
    let kept = 0;
    let total = 0;
    for (const src of SOURCES) {
      const base = statementFingerprints(API, src);
      kept += multisetIntersection(base, statementFingerprints(API, `  \n${src.replace(/\n/g, "\n ")}`));
      total += base.length;
    }
    expect(total).toBeGreaterThan(200);
    expect(kept).toBe(total);
  });

  it("it can see a loss: a stray `}` mid-plan drops the statements after it", () => {
    const src = 'plan "p" {\n  room id=a at (0,0) size 1x1\n}\n  room id=b at (1,0) size 1x1\n}\n';
    const whole = statementFingerprints(API, src.replace("}\n  room id=b", "  room id=b"));
    expect(multisetIntersection(whole, statementFingerprints(API, src))).toBe(1);
  });
});

describe("parser recovery metric — floors (may only rise)", () => {
  it.each(MUTATION_CLASSES)(
    "%s",
    (cls) => {
      const r = measure(API, SOURCES, cls);
      const f = FLOORS[cls];
      expect({ mutants: r.mutants, original: r.original }).toEqual({ mutants: f.mutants, original: f.original });
      expect(r.survived).toBeGreaterThanOrEqual(f.survived);
    },
    30_000,
  );
});

/** Rooms the parser produced, and the error diagnostics — the two halves of recovery. */
function recovered(src: string): { rooms: string[]; errors: (string | undefined)[] } {
  const out = compile(src, { noCache: true });
  return {
    rooms: (out.ast?.body ?? []).filter((s) => s.kind === "room").map((s) => s.id),
    errors: out.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  };
}

const room = (id: string, x: number) => `  room id=${id} at (${x},0) size 3000x3000`;

describe("brace-balance-aware synchronize — the cases the metric aggregates", () => {
  it("a bad point inside a wall's `{ … }` no longer closes the plan at the wall's `}`", () => {
    const src = [
      'plan "p" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) bogus (4000,3000) close }",
      room("a", 0),
      room("b", 3000),
      "}",
    ].join("\n");
    // Previously: rooms [] (silently dropped after the wall's `}` closed the plan).
    expect(recovered(src)).toEqual({ rooms: ["a", "b"], errors: ["E_PARSE"] });
  });

  it("a bad key inside a `theme { … }` block no longer closes the plan", () => {
    const src = ['plan "p" {', "  theme { wall 12 bogus }", room("a", 0), "}"].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a"], errors: ["E_PARSE"] });
  });

  it("a keyword-named key inside an open `theme {` is skipped with the block, not parsed at plan level", () => {
    // parseTheme fails AT the second `wall` — a statement keyword, but inside a `{` the
    // file does close, so it is part of the failed block.
    const src = ['plan "p" {', "  theme { wall wall 12 }", room("a", 0), "}"].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a"], errors: ["E_PARSE"] });
  });

  it("a failed `for` header skips its body as a unit (no cascade from the orphaned body)", () => {
    const src = [
      'plan "p" {',
      "  for i 0..2 {",
      "    room at (i*1000, 0) size 1000x1000",
      "  }",
      room("b", 3000),
      "}",
    ].join("\n");
    // Previously the body was parsed at plan level: an extra E_UNKNOWN_REF for `i`.
    expect(recovered(src)).toEqual({ rooms: ["b"], errors: ["E_PARSE"] });
  });

  it("failing AT a statement keyword with the wall's `{` never closed resumes there", () => {
    const src = [
      'plan "p" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) close",
      room("a", 0),
      "}",
    ].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a"], errors: ["E_PARSE"] });
  });

  it("a stray `{` after a statement (`room … {`) is skipped alone", () => {
    const src = ['plan "p" {', `${room("a", 0)} {`, room("b", 3000), room("c", 6000), "}"].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a", "b", "c"], errors: ["E_PARSE"] });
  });

  it("a stray `{` alone on its own line is skipped alone", () => {
    const src = ['plan "p" {', room("a", 0), "  {", room("b", 3000), room("c", 6000), "}"].join("\n");
    expect(recovered(src)).toEqual({ rooms: ["a", "b", "c"], errors: ["E_PARSE"] });
  });

  it("a stray `{` inside a `for` body does not swallow the for's `}` or what follows", () => {
    const src = [
      'plan "p" {',
      "  for i in 0..1 {",
      "    room at (i*1000, 0) size 1000x1000 {",
      "    room id=b at (5000,0) size 1x1",
      "  }",
      room("c", 6000),
      "}",
    ].join("\n");
    const out = compile(src, { noCache: true });
    const body = out.ast?.body ?? [];
    expect(body.map((s) => s.kind)).toEqual(["for", "room"]);
    const forNode = body[0] as { body: { kind: string; id: string }[] };
    expect(forNode.body.map((s) => s.kind)).toEqual(["room", "error", "room"]);
    expect(out.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
  });
});
