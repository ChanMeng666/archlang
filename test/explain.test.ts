/**
 * T5.5 — error-code catalog + diagnostic enrichment.
 *
 * The catalog must cover every code the codebase raises, `explain` must return
 * entries, the generated docs must not drift, and a door/window off a wall must
 * carry a `relatedSpans` note pointing at the nearest wall.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, explain, ERROR_CATALOG, ERROR_CODES, formatDiagnostic } from "../src/index.js";
import { renderErrorCodes } from "../scripts/gen-error-codes.js";

/** Read every `code: "E_…"/"W_…"` literal raised under src/. */
function codesInSource(dir: string): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) for (const c of codesInSource(p)) found.add(c);
    else if (entry.name.endsWith(".ts")) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/code:\s*"((?:E|W)_[A-Z_]+)"/g)) found.add(m[1]!);
    }
  }
  return found;
}

describe("T5.5 — the catalog covers every raised code", () => {
  it("every E_*/W_* raised in src/ has a catalog entry", () => {
    const raised = codesInSource("src");
    const missing = [...raised].filter((c) => !(c in ERROR_CATALOG)).sort();
    expect(missing).toEqual([]);
    expect(raised.size).toBeGreaterThan(30);
  });

  it("the catalog has no orphan entries (every documented code is raised)", () => {
    // E_IMPORT_PARSE etc. are raised with non-literal codes in a couple of spots;
    // allow a small allowlist of codes documented but raised indirectly.
    const raised = codesInSource("src");
    const orphans = ERROR_CODES.filter((c) => !raised.has(c));
    expect(orphans).toEqual([]);
  });
});

/**
 * The bijection above is a SOURCE-level check: it greps `code: "E_…"` literals and asks
 * whether the catalog documents them. It is structurally blind to the opposite failure —
 * a diagnostic the compiler actually emits with NO code at all, which the grep cannot see
 * because there is no literal to find. That was not hypothetical: every lexer and parser
 * refusal was uncoded until v1.27.0, so `arch lint --code`/`--severity` could not select
 * a shape error and `arch explain` had nothing to say about the most common failure a
 * generating model hits. This suite closes it by RUNNING the compiler over sources chosen
 * to fail in different layers and asserting the invariant directly.
 */
describe("no diagnostic the compiler emits is uncoded", () => {
  // Deliberately spread across the layers that can produce a diagnostic: the lexer, the
  // plan header, a statement body, a block body, the expression evaluator, resolve-time
  // element checks, and the analysis passes. A layer that grows a new uncoded `diag()`
  // call fails here rather than shipping an unselectable diagnostic.
  const SOURCES: [string, string][] = [
    ["lexer — unterminated string", `plan "x" {\n  room at (0,0) size 1x1 label "oops\n}\n`],
    ["lexer — unknown unit suffix", `plan "x" {\n  room at (0,0) size 3k x 4\n}\n`],
    ["header — no plan keyword", `units mm\nroom at (0,0) size 1x1\n`],
    ["header — no opening brace", `plan "x"\n  room at (0,0) size 1x1\n`],
    ["statement — unknown keyword", `plan "x" {\n  wombat at (0,0) size 1x1\n}\n`],
    ["statement — token soup", `plan "x" {\n  = = ) ( 3 3 ,\n}\n`],
    ["statement — clause out of order", `plan "x" {\n  wall exterior id=w1 thickness 200 { (0,0) (1,0) }\n}\n`],
    ["block body — bad statement inside `for`", `plan "x" {\n  for i in 0..2 { wombat at (0,0) }\n}\n`],
    ["missing closing brace", `plan "x" {\n  room at (0,0) size 1x1\n`],
    ["expression — unknown name", `plan "x" {\n  room at (0,0) size nope x 1\n}\n`],
    ["expression — division by zero", `plan "x" {\n  room at (0,0) size 1 / 0 x 1\n}\n`],
    ["expression — type mismatch", `plan "x" {\n  room at (0,0) size "s" x 1\n}\n`],
    ["resolve — bad room size", `plan "x" {\n  room id=r at (0,0) size 0x0\n}\n`],
    ["resolve — bad attachment", `plan "x" {\n  door on nope at 50% width 900\n}\n`],
    [
      "analysis — an unsound but well-formed plan",
      `plan "x" {\n  wall id=w1 exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n` +
        `  room id=r1 at (0,0) size 4000x3000 uses bathroom\n}\n`,
    ],
  ];

  /**
   * Codes that are WHOLE-PLAN verdicts and therefore carry no span — a `Map`, never a
   * bare `Set`, because the reason is what stops it becoming a dumping ground. Every
   * member must be genuinely spanless in the corpus below (a second assertion prunes
   * one that is not), so a spanned diagnostic can never be excused by being listed here.
   */
  const SPANLESS_BY_DESIGN = new Map<string, string>([
    ["W_EMPTY_PLAN", "the subject is the plan itself — there is no statement to underline, because there are none"],
  ]);

  it("every diagnostic carries a catalogued code, and a byte span unless it is whole-plan", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const [label, src] of SOURCES) {
      for (const d of compile(src, { noCache: true }).diagnostics) {
        seen++;
        if (!d.code) bad.push(`${label}: [uncoded] ${d.message}`);
        else if (!(d.code in ERROR_CATALOG)) bad.push(`${label}: [${d.code}] not in the catalog — ${d.message}`);
        if (!d.span && !(d.code && SPANLESS_BY_DESIGN.has(d.code)))
          bad.push(`${label}: [${d.code ?? "uncoded"}] has no span — ${d.message}`);
      }
    }
    expect(bad).toEqual([]);
    // Non-vacuity: a corpus that produced nothing would pass the loop above trivially.
    expect(seen).toBeGreaterThan(SOURCES.length);
  });

  it("the spanless allowlist has no dead entries", () => {
    const spanless = new Set(
      SOURCES.flatMap(([, src]) => compile(src, { noCache: true }).diagnostics)
        .filter((d) => !d.span && d.code)
        .map((d) => d.code!),
    );
    expect([...SPANLESS_BY_DESIGN.keys()].filter((c) => !spanless.has(c))).toEqual([]);
    for (const why of SPANLESS_BY_DESIGN.values()) expect(why.length).toBeGreaterThan(40);
  });

  it("the corpus really does exercise the parse layer as well as the semantic ones", () => {
    // Otherwise "every diagnostic is coded" could hold because the corpus never reached
    // the layer that was uncoded. Both kinds must be present.
    const all = SOURCES.flatMap(([, src]) => compile(src, { noCache: true }).diagnostics);
    expect(all.filter((d) => d.code === "E_PARSE").length).toBeGreaterThanOrEqual(8);
    expect(all.filter((d) => d.code !== undefined && d.code !== "E_PARSE").length).toBeGreaterThanOrEqual(5);
  });
});

describe("T5.5 — explain", () => {
  it("returns a populated entry for a known code", () => {
    const text = explain("E_ROOM_SIZE");
    expect(text).not.toBeNull();
    expect(text).toContain("E_ROOM_SIZE");
    expect(text).toContain("Cause:");
    expect(text).toContain("Fix:");
    expect(text).toContain("Example:");
  });

  it("returns null for an unknown code", () => {
    expect(explain("E_NOPE")).toBeNull();
  });

  it("every catalog entry has non-empty cause/fix/example", () => {
    for (const c of ERROR_CODES) {
      const e = ERROR_CATALOG[c]!;
      expect(e.cause.length).toBeGreaterThan(0);
      expect(e.fix.length).toBeGreaterThan(0);
      expect(e.example.length).toBeGreaterThan(0);
    }
  });
});

describe("T5.5 — generated docs/error-codes.md has no drift", () => {
  it("matches the catalog", () => {
    const committed = readFileSync("docs/error-codes.md", "utf8").replace(/\r\n/g, "\n");
    expect(renderErrorCodes()).toBe(committed);
  });
});

describe("T5.5 — related spans point at the expected wall", () => {
  const src = [
    'plan "Rel" {',
    "  units mm",
    "  wall exterior thickness 200 { (0, 0) (1000, 0) }",
    "  door at (5000, 5000) width 900",
    "}",
  ].join("\n");

  it("a door off every wall carries a relatedSpan note at the nearest wall", () => {
    const { diagnostics } = compile(src, { noCache: true });
    const d = diagnostics.find((x) => x.code === "W_DOOR_OFF_WALL");
    expect(d).toBeDefined();
    expect(d!.relatedSpans?.length).toBeGreaterThanOrEqual(1);
    const rel = d!.relatedSpans![0]!;
    expect(src.slice(rel.span.start, rel.span.end)).toContain("wall exterior");
    // The framed diagnostic renders the related note.
    expect(formatDiagnostic(src, d!)).toContain("note:");
  });
});
