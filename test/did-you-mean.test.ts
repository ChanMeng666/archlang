/**
 * AF2: one did-you-mean producer (`spelling`, `src/expr.ts`; `spellingFix`, `src/fix-producers.ts`),
 * after TypeScript's `getSpellingSuggestion` and its one spelling codefix. It serves an unknown
 * statement word (`dor`, and a misspelt clause word that ended a statement early: `lable`), an
 * unknown relational reference (`right-of hal`), a clause word the parser expected (`betwen`,
 * `widht`) and a `uses` word (`bedrom`). Each fix rewrites the offending word alone; it is
 * `machine-applicable` only when no other word of the set is under the distance limit. The
 * `W_UNKNOWN_FURNITURE` fix (`sofaa`) is narrowed to the same shape, and stays `maybe-incorrect`.
 *
 * Only diagnostics of plans that already fail moved, plus the `W_UNKNOWN_FURNITURE` span and fix:
 * the corpus sweep and its RM-D56 swap-back are in the PR, and the moved rows are re-pinned where
 * they live (`test/resolve-order-byte-identity.test.ts`, `test/rectilinear-rooms-byte-identity.test.ts`).
 */
import { describe as suite, expect, it } from "vitest";
import { applyFixes, compile } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { spelling } from "../src/expr.js";
import { STATEMENT_STARTS } from "../src/grammar/tokens.js";
import { USE_KINDS } from "../src/ast.js";

const plan = (...lines: string[]): string => `plan "p" {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const ROOMS = [
  'room id=hall at (0,0) size 4000x3000 label "Hall" uses hall',
  'room id=bed right-of hall size 3000x3000 label "Bed" uses bedroom',
  "walls from rooms exterior 200 partition 100",
];

/** Each diagnostic carrying a spelling fix, as the text its span and its one edit cover. */
function spelt(src: string): { code: string; span: string; hint: string | undefined; fix: [string, string, string] }[] {
  return compile(src, { noCache: true })
    .diagnostics.filter((d) => d.fixes?.some((f) => f.fixId === "spelling"))
    .map((d: Diagnostic) => {
      const f = d.fixes!.find((x) => x.fixId === "spelling")!;
      const e = f.edits[0]!;
      expect(f.edits).toHaveLength(1);
      return {
        code: d.code!,
        span: src.slice(d.span!.start, d.span!.end),
        hint: d.hints?.at(-1),
        fix: [f.applicability, src.slice(e.span.start, e.span.end), e.newText],
      };
    });
}

/** `arch fix`'s pass: apply the machine-applicable fixes, then compile again. */
function fixed(src: string): { out: string; codes: string[] } {
  const fixes = compile(src, { noCache: true }).diagnostics.flatMap((d) => d.fixes ?? []);
  const out = applyFixes(src, fixes).output;
  return { out, codes: compile(out, { noCache: true }).diagnostics.map((d) => d.code!) };
}

suite("spelling(): TypeScript's getSpellingSuggestion rules", () => {
  it("finds the near word, and calls it unique when no other word is under the limit", () => {
    expect(spelling("dor", STATEMENT_STARTS)).toEqual({ word: "door", unique: true });
    expect(spelling("bedrom", USE_KINDS)).toEqual({ word: "bedroom", unique: true });
    // A changed letter counts two (`dor` is not one edit from `for`), as in TypeScript.
    expect(spelling("dor", ["for"])).toBeNull();
  });

  it("breaks a tie by the set's own order, and says it is not unique", () => {
    expect(spelling("abcd", ["abc", "bcd"])).toEqual({ word: "abc", unique: false });
    expect(spelling("abcd", ["bcd", "abc"])).toEqual({ word: "bcd", unique: false });
    // A nearer word wins over an earlier one; the earlier one still makes it not unique.
    expect(spelling("tablet", ["tables", "table"])).toEqual({ word: "table", unique: false });
  });

  it("offers nothing for a word of the set, a far word, or a two-letter word in the same case", () => {
    expect(spelling("door", STATEMENT_STARTS)).toBeNull();
    expect(spelling("zzqqxx", STATEMENT_STARTS)).toBeNull();
    expect(spelling("wx", ["wc"])).toBeNull();
    expect(spelling("WC", ["wc"])).toEqual({ word: "wc", unique: true });
  });

  it("is a function of its input: the same answer every time", () => {
    const words = [...STATEMENT_STARTS];
    const first = spelling("wal", words);
    for (let i = 0; i < 5; i++) expect(spelling("wal", words)).toEqual(first);
  });
});

suite("the producers: a word-level span and a fix that rewrites that word alone", () => {
  it("an unknown statement word", () => {
    expect(spelt(plan(...ROOMS, "dor on hall.bottom at 1000 width 900"))).toEqual([
      { code: "E_PARSE", span: "dor", hint: "did you mean `door`?", fix: ["machine-applicable", "dor", "door"] },
    ]);
  });

  it("a misspelt clause word that ended its statement early", () => {
    expect(spelt(plan('room id=a at (0,0) size 4000x3000 lable "A"'))).toEqual([
      { code: "E_PARSE", span: "lable", hint: "did you mean `label`?", fix: ["machine-applicable", "lable", "label"] },
    ]);
    expect(spelt(plan("uses bedrom"))).toEqual([]);
    expect(spelt(plan('room id=a at (0,0) size 4000x3000 label "A" uses living bedrom'))).toEqual([
      { code: "E_PARSE", span: "bedrom", hint: "did you mean `bedroom`?", fix: ["machine-applicable", "bedrom", "bedroom"] },
    ]);
  });

  it("an unknown relational reference, spanned on the id (it was the whole statement)", () => {
    expect(spelt(plan(ROOMS[0]!, 'room id=b right-of hal size 3000x3000 label "B"'))).toEqual([
      { code: "E_LAYOUT_REF", span: "hal", hint: "did you mean `hall`?", fix: ["machine-applicable", "hal", "hall"] },
    ]);
    // Two rooms as near: the first declared, and `maybe-incorrect`. The room itself is no candidate.
    const two = plan(
      "room id=hall1 at (0,0) size 3000x3000",
      "room id=hall2 at (0,3000) size 3000x3000",
      "room id=halls right-of hall size 3000x3000",
    );
    expect(spelt(two)).toEqual([
      { code: "E_LAYOUT_REF", span: "hall", hint: "did you mean `hall1`?", fix: ["maybe-incorrect", "hall", "hall1"] },
    ]);
    // No near room: the span is still the id, and no fix is offered.
    const far = plan(ROOMS[0]!, "room id=b right-of ghost size 3000x3000");
    const d = compile(far, { noCache: true }).diagnostics.find((x) => x.code === "E_LAYOUT_REF")!;
    expect(far.slice(d.span!.start, d.span!.end)).toBe("ghost");
    expect(d.fixes).toBeUndefined();
    expect(d.hints).toBeUndefined();
  });

  it("a clause word the parser expected", () => {
    const body = (clause: string): string =>
      plan(ROOMS[0]!, ROOMS[1]!, `walls from rooms exterior 200 partition 100 {\n    ${clause}\n  }`);
    expect(spelt(body("open betwen hall and bed"))).toEqual([
      { code: "E_PARSE", span: "betwen", hint: "did you mean `between`?", fix: ["machine-applicable", "betwen", "between"] },
    ]);
    expect(spelt(body("betwen hall and bed thickness 150"))).toEqual([
      { code: "E_PARSE", span: "betwen", hint: "did you mean `between`?", fix: ["machine-applicable", "betwen", "between"] },
    ]);
    // A missing clause is spanned on its statement, as it was; the fix still rewrites the word.
    expect(spelt(plan(...ROOMS, "door on hall.bottom at 1000 widht 900"))).toEqual([
      {
        code: "E_PARSE",
        span: "door on hall.bottom at 1000",
        hint: "did you mean `width`?",
        fix: ["machine-applicable", "widht", "width"],
      },
    ]);
  });

  it("a `uses` word, in a room and in a strip", () => {
    expect(spelt(plan("room id=a at (0,0) size 4000x3000 uses bedrom"))).toEqual([
      { code: "E_PARSE", span: "bedrom", hint: "did you mean `bedroom`?", fix: ["machine-applicable", "bedrom", "bedroom"] },
    ]);
    expect(spelt(plan("strip right at (0,0) gap 0 height 3000 {\n    room size 3000 uses kitchn\n  }"))).toEqual([
      { code: "E_PARSE", span: "kitchn", hint: "did you mean `kitchen`?", fix: ["machine-applicable", "kitchn", "kitchen"] },
    ]);
  });

  it("a word of the language out of place gets none (it is spelled right)", () => {
    expect(spelt(plan("room id=a at (0,0) size 4000x3000", "slab 200"))).toEqual([]);
    expect(spelt(plan("room id=a at (0,0) size 4000x3000", "offset 200"))).toEqual([]);
  });

  it("`W_UNKNOWN_FURNITURE` is spanned on the kind word and its fix rewrites only that word", () => {
    const src = plan('room id=a at (0,0) size 4000x3000 label "A"', "furniture sofaa at (500,500) size 2000x900");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_UNKNOWN_FURNITURE")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("sofaa");
    expect(d.fixes).toEqual([
      {
        title: "write the catalogued kind `sofa`",
        applicability: "maybe-incorrect",
        edits: [{ span: d.span, newText: "sofa" }],
      },
    ]);
    // The rest of the statement keeps its bytes: `(500,500)` is not reprinted as `(500, 500)`.
    const out = applyFixes(src, d.fixes!, { maxApplicability: "maybe-incorrect" }).output;
    expect(out).toBe(src.replace("sofaa", "sofa"));
  });
});

suite("`arch fix` applies each machine-applicable fix cleanly: fix, recompile, the error is gone", () => {
  it.each([
    ["dor", plan(...ROOMS, "dor on hall.bottom at 1000 width 900")],
    ["lable", plan('room id=a at (0,0) size 4000x3000 lable "A"', "walls from rooms exterior 200 partition 100")],
    ["hal", plan(ROOMS[0]!, 'room id=b right-of hal size 3000x3000 label "B"', ROOMS[2]!)],
    ["betwen", plan(ROOMS[0]!, ROOMS[1]!, "walls from rooms exterior 200 partition 100 {\n    open betwen hall and bed\n  }")],
    ["widht", plan(...ROOMS, "door on hall.bottom at 1000 widht 900")],
    ["bedrom", plan("room id=a at (0,0) size 4000x3000 uses bedrom", "walls from rooms exterior 200 partition 100")],
  ])("%s", (_word, src) => {
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.severity === "error")).toBe(true);
    const { out, codes } = fixed(src);
    expect(out).not.toBe(src);
    expect(codes.filter((c) => c.startsWith("E_"))).toEqual([]);
  });
});
