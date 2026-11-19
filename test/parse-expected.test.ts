/**
 * AF4: an `E_PARSE` carries `expected`, what the grammar would have read at its span (after rustc's
 * "expected one of"), read from the token table (`TOKEN_TEXT`, `src/grammar/tokens.ts`) and the
 * closed word lists the parser already checks against, never retyped. A word of the list glued to
 * the number after it (`size (A)x3000`, which the lexer reads as the name `x3000`) gets the AF2
 * did-you-mean hint and a `maybe-incorrect` fix that splits it.
 *
 * Only diagnostics of plans that already fail move: the corpus sweep and its RM-D56 swap-back
 * (delete `expected` and the payload is `main`'s) are in the PR.
 */
import { describe as suite, expect, it } from "vitest";
import { applyFixes, compile, diagnosticToJson } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { PAPER_SIZES, STATEMENT_STARTS, TITLE_FIELDS, TOKEN_TEXT } from "../src/grammar/tokens.js";
import { USE_KINDS } from "../src/ast.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";

const plan = (...lines: string[]): string => `plan "p" {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const MI = "maybe-incorrect";

/** The first `E_PARSE` of a source. */
function parseError(src: string): Diagnostic {
  const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_PARSE");
  expect(d, src).toBeDefined();
  return d!;
}
const expectedAt = (src: string): string[] | undefined => parseError(src).expected;

/** The words a statement may start with, plan level: the fixed ones, then the registry's own. */
const reserved = [...BUILTIN_REGISTRY.byKeyword.values()].filter((d) => !d.contextual).map((d) => d.keyword);

/** A class row names a kind of token in words (`<number>`); a typed row is punctuation (`<=`). */
const isClass = (text: string): boolean => /[A-Za-z]/.test(text);

suite("TOKEN_TEXT is the lexer's", () => {
  it("every typed row lexes back to one token of its own type; every other row is a `<class>`", () => {
    for (const [type, text] of Object.entries(TOKEN_TEXT)) {
      if (isClass(text)) {
        expect(text.startsWith("<") && text.endsWith(">"), type).toBe(true);
        continue;
      }
      const { tokens, errors } = lex(text);
      expect(errors, type).toEqual([]);
      expect(
        tokens.map((t) => t.type),
        type,
      ).toEqual([type, "eof"]);
    }
  });

  it("a `<class>` row names a token no word of the language can be", () => {
    for (const text of Object.values(TOKEN_TEXT))
      if (isClass(text)) expect(lex(text).tokens[0]!.type).not.toBe("ident");
  });
});

suite("expected at each kind of failure", () => {
  it("a token of the wrong type: the token's own text or class", () => {
    expect(expectedAt(plan("grid"))).toEqual([TOKEN_TEXT.number]);
    expect(expectedAt(plan("let x = [1, 2"))).toEqual(["]", ","]);
    expect(expectedAt(plan("let x = (1 + 2"))).toEqual([")"]);
    expect(expectedAt(plan("let x = max(1, 2"))).toEqual([")", ","]);
    expect(expectedAt(plan("let x = if true { 1 } 2"))).toEqual(["else"]);
    expect(expectedAt(plan("let x = *"))).toEqual(["<number>", "<string>", "<name>", "(", "[", "-", "+", "!"]);
    expect(expectedAt('plan "p" {\n  units mm\n')).toEqual(["}"]);
    expect(expectedAt('plan "p" {\n}\nroom')).toEqual([TOKEN_TEXT.eof]);
    expect(expectedAt("plan p {\n}\n")).toEqual([TOKEN_TEXT.string]);
  });

  it("a closed list of words: the list, in the parser's own order", () => {
    expect(expectedAt(plan("room id=r at (0,0) size 3000x3000 uses bedrom"))).toEqual([...USE_KINDS]);
    expect(expectedAt(plan("paper A9"))).toEqual([...PAPER_SIZES]);
    expect(expectedAt(plan('title { projekt "x" }'))).toEqual([...TITLE_FIELDS]);
    expect(expectedAt(plan("north upp"))).toEqual(["up", "down", "left", "right", TOKEN_TEXT.number]);
    expect(expectedAt(plan("room id=r sise 3000x3000 at (0,0)"))).toEqual([
      "polygon",
      "circle",
      "at",
      "right-of",
      "left-of",
      "below",
      "above",
    ]);
    // `swing` takes its four words or `into <room>`.
    const door = (clause: string): string =>
      plan("wall id=w exterior thickness 200 { (0,0) (4000,0) }", `door on w at 50% width 900 ${clause}`);
    expect(expectedAt(door("swing upward"))).toEqual(["in", "out", "inward", "outward", "into"]);
    expect(expectedAt(door("hinge lft"))).toEqual(["left", "right"]);
    expect(expectedAt(plan("wall id=w exterior thickness 200 { (0,0) foo }"))).toEqual(["(", "arc", "close", "}"]);
  });

  it("a missing clause: the clause's word", () => {
    expect(expectedAt(plan('room id=r at (0,0) label "R"'))).toEqual(["size"]);
  });

  it("a statement: every statement keyword, a name and `}`; in a block, only the block's own", () => {
    const top = expectedAt(plan("wombat 3"))!;
    expect(top).toEqual([...STATEMENT_STARTS, ...reserved, TOKEN_TEXT.ident, TOKEN_TEXT.rcurly]);
    expect(expectedAt(plan(", 3"))).toEqual(top);
    const inBlock = expectedAt(plan("for i in 0..1 {", "  wombat 3", "}"))!;
    expect(inBlock).toContain("let");
    expect(inBlock).toContain("room");
    expect(inBlock).not.toContain("units");
    expect(inBlock.slice(-2)).toEqual([TOKEN_TEXT.ident, TOKEN_TEXT.rcurly]);
  });

  it("each plan-level word is listed in a block exactly when the block reads it", () => {
    const inBlock = new Set(expectedAt(plan("for i in 0..1 {", "  wombat 3", "}")));
    // The words a block reads only to refuse where they stand, each in a whole form.
    const refusedForms: Record<string, string> = {
      level: "level 1 { }",
      strip: "strip right at (0,0) gap 0 height 3000 { }",
      accTitle: 'accTitle "x"',
      accDescr: 'accDescr "x"',
    };
    const codesIn = (stmt: string): string[] =>
      parse(plan("for i in 0..1 {", `  ${stmt}`, "}")).diagnostics.map((d) => d.code ?? "");
    for (const [w, form] of Object.entries(refusedForms)) {
      expect(
        codesIn(form).some((c) => /_(?:NEST|PLACEMENT)$/.test(c)),
        w,
      ).toBe(true);
      expect(inBlock.has(w), w).toBe(false);
    }
    for (const w of STATEMENT_STARTS) {
      if (w in refusedForms) continue;
      // The word alone on its line: a block that does not read it calls it an unknown statement.
      const unknown = parse(plan("for i in 0..1 {", `  ${w}`, "}")).diagnostics.some(
        (d) => d.message === `Unknown statement "${w}"`,
      );
      expect(inBlock.has(w), w).toBe(!unknown);
    }
  });

  it("no `expected` where the parser has no list (a count, a lexical error)", () => {
    expect(expectedAt(plan("wall id=w exterior thickness 200 { (0,0) }"))).toBeUndefined();
    expect(expectedAt(plan('room id=r at (0,0) size 1x1 label "oops'))).toBeUndefined();
  });
});

suite("a word glued to its number", () => {
  it("`size (A)x3000`: a did-you-mean and a maybe-incorrect fix that splits it", () => {
    const src = plan("let A = 3000", 'room id=r at (0,0) size (A)x3000 label "R"');
    const d = parseError(src);
    expect(src.slice(d.span!.start, d.span!.end)).toBe("x3000");
    expect(d.expected).toEqual(["x"]);
    expect(d.hints).toEqual(["did you mean `x 3000`?"]);
    expect(d.fixes).toHaveLength(1);
    const f = d.fixes![0]!;
    expect([f.applicability, f.fixId, f.edits[0]!.newText]).toEqual([MI, "spelling", "x 3000"]);
    const fixed = applyFixes(src, d.fixes!, { maxApplicability: MI }).output;
    expect(compile(fixed, { noCache: true }).errors).toEqual([]);
  });

  it("`width900` on a door: the same split, never machine-applicable", () => {
    const src = plan("wall id=w exterior thickness 200 { (0,0) (4000,0) }", "door on w at 50% width900");
    const f = parseError(src).fixes![0]!;
    expect([f.applicability, f.edits[0]!.newText]).toEqual([MI, "width 900"]);
  });

  it("no split when the rest is no number", () => {
    const src = plan("let A = 3000", 'room id=r at (0,0) size (A)xB label "R"');
    const d = parseError(src);
    expect(d.expected).toEqual(["x"]);
    expect(d.fixes).toBeUndefined();
  });
});

suite("JSON", () => {
  it("`expected` is appended after every other key, and only an E_PARSE that has one carries it", () => {
    const src = plan("grid");
    const d = parseError(src);
    const j = diagnosticToJson(src, d);
    expect(Object.keys(j).at(-1)).toBe("expected");
    expect(j.expected).toEqual(["<number>"]);
    // Delete it and the bytes are the diagnostic's without the field.
    const { expected: _e, ...rest } = d;
    const { expected: _j, ...restJson } = j;
    expect(JSON.stringify(restJson)).toBe(JSON.stringify(diagnosticToJson(src, rest)));
    const ok = plan('room id=r at (0,0) size 3000x3000 label "R"', "walls from rooms exterior 200 partition 100");
    for (const x of compile(ok, { noCache: true }).diagnostics)
      expect("expected" in diagnosticToJson(ok, x)).toBe(false);
  });
});
