/**
 * AF4: an `E_PARSE` carries `expected`, what the parser would have read at the token it stopped at
 * (after rustc's "expected one of"): the position's own alternatives, read from the token table
 * (`TOKEN_TEXT`, `src/grammar/tokens.ts`) and the closed word lists the parser checks against, then
 * every word and token the parser looked for at that token (the branches it tried, a clause the
 * statement before would still have read, `}`), then the operators that continue an expression
 * that stopped there, then the did-you-mean word. `expectedAt` gives the token's offset when the
 * error is spanned elsewhere; `expectedMore` counts the entries a long list leaves out. A word of
 * the list glued to the number after it (`size (A)x3000`) gets the AF2 did-you-mean and a
 * `maybe-incorrect` fix that splits it.
 *
 * Only diagnostics of plans that already fail move: the corpus sweep and its RM-D56 swap-back
 * (delete the three keys and put `main`'s span back, and the payload is `main`'s) are in the PR.
 * `test/parse-expected-oracle.test.ts` holds `expected` to what the parser accepts.
 */
import { describe as suite, expect, it } from "vitest";
import { applyFixes, compile, diagnosticToJson } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { exprContinuations } from "../src/expr.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { PAPER_SIZES, STATEMENT_STARTS, TITLE_FIELDS, TOKEN_TEXT } from "../src/grammar/tokens.js";
import { USE_KINDS } from "../src/ast.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { sheetTextKeys } from "../src/sheet-text.js";

const plan = (...lines: string[]): string => `plan "p" {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const MI = "maybe-incorrect";
const WALL = "wall id=w exterior thickness 200 { (0,0) (4000,0) }";
const door = (clause: string): string => plan(WALL, `door on w at 50% width 900 ${clause}`);
/** The operators that continue an expression, `%` included. */
const OPS = exprContinuations(true);

/** The first `E_PARSE` of a source. */
function parseError(src: string): Diagnostic {
  const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_PARSE");
  expect(d, src).toBeDefined();
  return d!;
}
const expectedOf = (src: string): string[] | undefined => parseError(src).expected;

/** The statement keywords at plan level: the fixed ones, then every registry element's. */
const PLAN_WORDS = [...new Set([...STATEMENT_STARTS, ...BUILTIN_REGISTRY.byKeyword.keys()])];

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
  it("a token of the wrong type: its text or class, then the operators of an expression that stopped there", () => {
    expect(expectedOf(plan("grid"))).toEqual([TOKEN_TEXT.number]);
    expect(expectedOf(plan("let x = [1, 2"))).toEqual(["]", ",", ...OPS]);
    expect(expectedOf(plan("let x = (1 + 2"))).toEqual([")", ...OPS]);
    expect(expectedOf(plan("let x = max(1, 2"))).toEqual([")", ",", ...OPS]);
    expect(expectedOf(plan("let x = if true { 1 } 2"))).toEqual(["else"]);
    expect(expectedOf(plan("let x = *"))).toEqual(["<number>", "<string>", "<name>", "(", "[", "-", "+", "!"]);
    expect(expectedOf('plan "p" {\n  units mm\n')).toEqual(["}"]);
    expect(expectedOf('plan "p" {\n}\nroom')).toEqual([TOKEN_TEXT.eof]);
    expect(expectedOf("plan p {\n}\n")).toEqual([TOKEN_TEXT.string]);
    // A name just before the token could have been a call: `(` too.
    expect(expectedOf(plan("let A = 3", 'room id=r at (0,0) size A "R"'))).toEqual(["x", ...OPS, "("]);
  });

  it("a closed list of words: the list, in the parser's own order, then what it looked for there", () => {
    expect(expectedOf(plan("room id=r at (0,0) size 3000x3000 uses bedrom"))).toEqual([...USE_KINDS]);
    expect(expectedOf(plan("paper A9"))).toEqual([...PAPER_SIZES]);
    expect(expectedOf(plan('title { projekt "x" }'))).toEqual([...TITLE_FIELDS, "}"]);
    expect(expectedOf(plan("north upp"))).toEqual(["up", "down", "left", "right", TOKEN_TEXT.number, "hidden"]);
    expect(expectedOf(door("swing upward"))).toEqual(["in", "out", "inward", "outward", "into"]);
    expect(expectedOf(plan("wall id=w exterior thickness 200 { (0,0) foo }"))).toEqual(["(", "arc", "close", "}"]);
  });

  it("the branches a statement tried before the one it failed in (the red team's twelve sites)", () => {
    const at = ["at", "id", "hinged", "sliding", "barn", "bifold", "pocket", "garage", "double", "glazed_sliding"];
    expect(expectedOf(plan(WALL, "door width 900"))).toEqual([...at, "on", "between"]);
    expect(expectedOf(plan("furniture sofa size 10x10"))).toEqual(["at", "id", "against", "in"]);
    expect(expectedOf(plan("stair id=s size 10x10"))).toEqual(["at", "dir"]);
    expect(expectedOf(plan("stair id=s dir up 1000 {"))).toEqual(["{", "width"]);
    expect(expectedOf(plan("scale x"))).toEqual(["<number>", "hidden"]);
    expect(expectedOf(plan("title x"))).toEqual(["{", "hidden"]);
    expect(expectedOf(plan("roof 300"))).toEqual(["overhang", "polygon"]);
    expect(expectedOf(plan("wall exterior thickness 200 (0,0)"))).toEqual([
      "{",
      "material",
      "height",
      "status",
      "between",
      "around",
      ...OPS,
    ]);
    expect(expectedOf(door("hinge lft"))).toEqual(["left", "right", "near"]);
    expect(
      expectedOf(
        plan("room id=a at (0,0) size 10x10", "walls from rooms exterior 200 partition 100 { open living and hall }"),
      ),
    ).toEqual(["between", "id"]);
    expect(expectedOf(plan("room id=r sise 3000x3000 at (0,0)"))).toEqual([
      "polygon",
      "circle",
      "at",
      "right-of",
      "left-of",
      "below",
      "above",
    ]);
  });

  it("a missing clause: the clause's word, at the token after the statement (`expectedAt`)", () => {
    const src = plan('room id=r at (0,0) label "R"');
    const d = parseError(src);
    expect(d.expected![0]).toBe("size");
    expect(src.slice(d.expectedAt, d.expectedAt! + 1)).toBe("}");
    expect(src.slice(d.span!.start, d.span!.end)).toBe('room id=r at (0,0) label "R"');
  });

  it("a statement: every statement keyword, a name and `}`", () => {
    const top = expectedOf(plan("wombat 3"))!;
    expect(top).toEqual([...PLAN_WORDS, TOKEN_TEXT.ident, TOKEN_TEXT.rcurly]);
    expect(expectedOf(plan(", 3"))).toEqual(top);
  });

  it("on a statement's line, the clauses the statement would still have read, and the hinted word", () => {
    const d = parseError(plan('room id=r at (0,0) size 10x10 lable "x"'));
    expect(d.expected).toEqual([...PLAN_WORDS, "<name>", "}", "size", "label", "floor", "uses"]);
    expect(d.hints).toEqual(["did you mean `label`?"]);
    // After a `uses` list, any use, on any line.
    const after = parseError(plan("room id=r at (0,0) size 10x10 uses living", ","));
    for (const u of USE_KINDS) expect(after.expected).toContain(u);
  });

  it("no `expected` where the parser has no list (a count, a lexical error)", () => {
    expect(expectedOf(plan("wall id=w exterior thickness 200 { (0,0) }"))).toBeUndefined();
    expect(expectedOf(plan('room id=r at (0,0) size 1x1 label "oops'))).toBeUndefined();
  });
});

suite("a block's statement list is its dispatch's", () => {
  /** Each body, and the words it reads only to refuse, each in a whole form. */
  const bodies: Record<string, (stmt: string) => string> = {
    for: (s) => plan("for i in 0..1 {", `  ${s}`, "}"),
    level: (s) => plan("level 1 {", `  ${s}`, "}"),
    component: (s) => plan("component c() {", `  ${s}`, "}"),
  };
  const forms: Record<string, string> = {
    level: "level 1 { }",
    strip: "strip right at (0,0) gap 0 height 3000 { }",
    accTitle: 'accTitle "x"',
    accDescr: 'accDescr "x"',
    keep: "keep align a.left b.left",
    roof: "roof overhang 300",
  };
  const refused = (src: string): boolean =>
    parse(src).diagnostics.some((d) => /_(?:NEST|PLACEMENT)$/.test(d.code ?? ""));

  for (const [name, body] of Object.entries(bodies))
    it(`in a ${name} body, a word is listed exactly when the body reads it as a statement`, () => {
      const listed = new Set(expectedOf(body("wombat 3")));
      expect([...listed].slice(-2)).toEqual([TOKEN_TEXT.ident, TOKEN_TEXT.rcurly]);
      for (const w of PLAN_WORDS) {
        if (BUILTIN_REGISTRY.byKeyword.get(w)?.contextual) continue;
        if (w in forms) {
          expect(listed.has(w), `${name}: ${w}`).toBe(!refused(body(forms[w]!)));
          continue;
        }
        // The word alone on its line: a body that does not read it calls it an unknown statement.
        const unknown = parse(body(w)).diagnostics.some((d) => d.message === `Unknown statement "${w}"`);
        expect(listed.has(w), `${name}: ${w}`).toBe(!unknown);
      }
    });

  it("a component refuses `keep` and `roof`; a level and a loop read both", () => {
    expect(expectedOf(bodies.component!("wombat"))).not.toContain("keep");
    expect(expectedOf(bodies.component!("wombat"))).not.toContain("roof");
    for (const b of [bodies.level!, bodies.for!]) {
      expect(expectedOf(b("wombat"))).toContain("keep");
      expect(expectedOf(b("wombat"))).toContain("roof");
    }
  });
});

suite("a word glued to its number", () => {
  it("`size (A)x3000`: a did-you-mean and a maybe-incorrect fix that splits it", () => {
    const src = plan("let A = 3000", 'room id=r at (0,0) size (A)x3000 label "R"');
    const d = parseError(src);
    expect(src.slice(d.span!.start, d.span!.end)).toBe("x3000");
    expect(d.expected).toEqual(["x", ...OPS]);
    expect(d.hints).toEqual(["did you mean `x 3000`?"]);
    expect(d.fixes).toHaveLength(1);
    const f = d.fixes![0]!;
    expect([f.applicability, f.fixId, f.edits[0]!.newText]).toEqual([MI, "spelling", "x 3000"]);
    const fixed = applyFixes(src, d.fixes!, { maxApplicability: MI }).output;
    expect(compile(fixed, { noCache: true }).errors).toEqual([]);
  });

  it("a word ending in digits splits before it respells: the fix keeps the number", () => {
    const fix = (src: string): [string, string] => {
      const f = parseError(src).fixes![0]!;
      return [f.applicability, f.edits[0]!.newText];
    };
    expect(fix(plan(WALL, "door on w at 50% width900"))).toEqual([MI, "width 900"]);
    expect(fix(plan(WALL, "door on w at 50% width90"))).toEqual([MI, "width 90"]);
    expect(fix(plan("furniture sofa at (0,0) size 10x10 rotate90"))).toEqual([MI, "rotate 90"]);
    expect(fix(plan("level2 {", "}"))).toEqual([MI, "level 2"]);
    expect(fix(plan("grid50"))).toEqual([MI, "grid 50"]);
    expect(fix(plan("wall exterior thickness200 { (0,0) (10,0) }"))).toEqual([MI, "thickness 200"]);
    expect(fix(plan("room id=r at (0,0) size3000x3000"))).toEqual([MI, "size 3000x3000"]);
  });

  it("no split when the rest is no number, nor for a word past 40 letters", () => {
    const d = parseError(plan("let A = 3000", 'room id=r at (0,0) size (A)xB label "R"'));
    expect(d.expected![0]).toBe("x");
    expect(d.fixes).toBeUndefined();
    const long = parseError(plan(`room id=r at (0,0) size (1)x${"9".repeat(60)}`));
    expect(long.hints).toBeUndefined();
    expect(long.fixes).toBeUndefined();
  });
});

suite("the token expected describes", () => {
  it("is the error's span, or `expectedAt` when the error is spanned on its statement", () => {
    const at = (src: string, word: string): void => {
      const d = parseError(src);
      expect(src.slice(d.expectedAt ?? d.span!.start).startsWith(word), src).toBe(true);
    };
    const dims = plan("dims all");
    const units = plan("units cm");
    expect(dims.slice(parseError(dims).span!.start, parseError(dims).span!.end)).toBe("all");
    expect(units.slice(parseError(units).span!.start, parseError(units).span!.end)).toBe("cm");
    at(dims, "all");
    at(units, "cm");
    const w = plan(WALL, "door on w at 50% width900");
    expect(parseError(w).expectedAt).toBeDefined();
    at(w, "width900");
  });
});

suite("a long list", () => {
  it("keeps its first 16 entries and counts the rest (`expectedMore`)", () => {
    const d = parseError(plan('sheet text { zz "x" }'));
    const keys = sheetTextKeys();
    expect(d.expected).toEqual([...keys.slice(0, 16), "}"]);
    expect(d.expectedMore).toBe(keys.length - 16);
    // The 267 keys cost no more than a few hundred bytes of JSON.
    const src = plan('sheet text { zz "x" }');
    const { expected: _e, expectedMore: _m, ...bare } = d;
    const grew = JSON.stringify(diagnosticToJson(src, d)).length - JSON.stringify(diagnosticToJson(src, bare)).length;
    expect(grew).toBeLessThan(300);
  });
});

suite("JSON", () => {
  it("`expected`, `expectedAt`, `expectedMore` follow every other key, before `rule` and `overprint`", () => {
    const src = plan('sheet text { zz "x" }');
    const d = { ...parseError(src), expectedAt: 3 };
    const j = diagnosticToJson(src, d, {
      rule: () => ({
        profile: null,
        key: "k",
        value: 1,
        units: null,
        from: "default",
        verification: "convention",
        document: null,
        clause: null,
        edition: null,
      }),
      overprint: () => ({ subject: { kind: "room-label", text: "A" }, over: [] }),
    });
    expect(Object.keys(j).slice(-5)).toEqual(["expected", "expectedAt", "expectedMore", "rule", "overprint"]);
  });

  it("deleting the keys gives the bytes of the diagnostic without them; a plan that compiles carries none", () => {
    const src = plan("grid");
    const d = parseError(src);
    const j = diagnosticToJson(src, d);
    expect(Object.keys(j).at(-1)).toBe("expected");
    expect(j.expected).toEqual(["<number>"]);
    const { expected: _e, ...rest } = d;
    const { expected: _j, ...restJson } = j;
    expect(JSON.stringify(restJson)).toBe(JSON.stringify(diagnosticToJson(src, rest)));
    const ok = plan('room id=r at (0,0) size 3000x3000 label "R"', "walls from rooms exterior 200 partition 100");
    for (const x of compile(ok, { noCache: true }).diagnostics)
      expect("expected" in diagnosticToJson(ok, x)).toBe(false);
  });
});
