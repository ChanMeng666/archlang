/**
 * The language reference's "Per-element styles — `style`" section agrees with `STYLE_KEYS` (WS.6).
 *
 * The section is prose written by hand (#868), and its first draft already disagreed with
 * `spec.llm.md` on which kinds take no `style`. This guard reads the section's own sentences and
 * checks them against the table, never a retyped list: the kinds it calls styleless must equal
 * `KEYWORDS.element` minus `STYLE_KINDS`, every kind/attribute pair it names must resolve through
 * `resolveStyleKey`, a kind it spells out must be spelled out completely, and the "every other
 * kind" catch-all must cover exactly the attributes the remaining kinds take.
 *
 * It reads the prose tolerantly so a rewording does not fail it falsely: parenthesised asides are
 * dropped before attributes are read, bold/italic markup around a word is ignored, and each anchor
 * accepts its common rephrasings ("takes"/"accepts", "except"/"but"). A failure names the sentence.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { STYLE_KEYS, STYLE_KINDS, resolveStyleKey } from "../src/theme.js";

const HEADING = "### Per-element styles — `style`";

/** Drop every parenthesised aside, innermost first, so nested ones go too. */
function dropAsides(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\([^()]*\)/g, "");
  } while (s !== prev);
  return s;
}

/**
 * The section's text, normalised: whitespace collapsed (a sentence may wrap anywhere), bold and
 * italic markup removed (a bold kind reads as the kind), parenthesised asides dropped (a
 * backticked word in "`area` (`areaLabel`)" is a gloss, not an attribute).
 */
function section(): string {
  const doc = readFileSync("docs/language-reference.md", "utf8").replace(/\r\n/g, "\n");
  const start = doc.indexOf(HEADING);
  if (start < 0) throw new Error(`docs/language-reference.md has no "${HEADING}" section`);
  const end = doc.indexOf("\n### ", start + HEADING.length);
  const body = doc.slice(start, end < 0 ? doc.length : end);
  return dropAsides(body.replace(/\*\*|__/g, "").replace(/\s+/g, " "));
}

/** Every backticked bare word in `s`, in order. */
function ticked(s: string): string[] {
  return [...s.matchAll(/`(\w+)`/g)].map((m) => m[1]!);
}

/** The text after the first `anchor` match up to its sentence's first `.`, and that sentence whole. */
function sentenceAfter(text: string, anchor: RegExp, what: string): { rest: string; sentence: string } {
  const m = anchor.exec(text);
  if (!m) {
    throw new Error(`the style section has no sentence ${what} (looked for ${anchor}); reword the anchor or the doc`);
  }
  const from = m.index + m[0].length;
  const stop = text.indexOf(".", from);
  const to = stop < 0 ? text.length : stop;
  return { rest: text.slice(from, to), sentence: text.slice(m.index, to + 1).trim() };
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

/** "`<kind>` is any element kind except …" (also "every kind but …", "other than"). */
const STYLELESS = /`<kind>` (?:is|can be|may be) (?:any|every) (?:element )?kind (?:except|but|other than) /;
/** "every other kind takes a subset of …" (also "accepts", "some of"). */
const SUBSET = /every other (?:element )?kind (?:takes|accepts) (?:a subset of|some of) /;
/** "`room` takes `fill`, `label` and `area`" (also "accepts", "also takes", "also accepts"). */
const CLAUSE = /`(\w+)` (?:also )?(?:takes|accepts) ([^;:.]+)/g;

describe("language reference § Per-element styles agrees with STYLE_KEYS (WS.6)", () => {
  const text = section();

  it("the kinds it says take no `style` are KEYWORDS.element minus the styled kinds", () => {
    const { rest, sentence } = sentenceAfter(text, STYLELESS, "naming the kinds that take no `style`");
    const expected = KEYWORDS.element.filter((k) => !STYLE_KINDS.includes(k));
    expect(expected.length).toBeGreaterThan(0);
    expect(sorted(ticked(rest)), `the styleless kinds in: "${sentence}"`).toEqual(sorted(expected));
  });

  const named = new Map<string, { attrs: Set<string>; clauses: string[] }>();
  for (const m of text.matchAll(CLAUSE)) {
    const entry = named.get(m[1]!) ?? { attrs: new Set<string>(), clauses: [] };
    for (const a of ticked(m[2]!)) entry.attrs.add(a);
    entry.clauses.push(m[0].trim());
    named.set(m[1]!, entry);
  }
  const where = (kind: string): string =>
    named
      .get(kind)!
      .clauses.map((c) => `"${c}"`)
      .join(" and ");

  it("names at least one kind's attributes (the sentence pattern still matches)", () => {
    expect(named.size, `no "<kind> takes …" clause matched ${CLAUSE}`).toBeGreaterThan(0);
  });

  it("every kind/attribute pair it names resolves through resolveStyleKey", () => {
    const unresolved = [...named].flatMap(([kind, { attrs }]) =>
      [...attrs]
        .filter((a) => resolveStyleKey(kind, a) === null)
        .map((a) => `${kind} takes ${a}, which STYLE_KEYS lacks, in ${where(kind)}`),
    );
    expect(unresolved).toEqual([]);
  });

  it("a kind it spells out is spelled out completely", () => {
    for (const [kind, { attrs }] of named) {
      expect(sorted(attrs), `the attributes of ${kind} in ${where(kind)}`).toEqual(
        sorted(Object.keys(STYLE_KEYS[kind] ?? {})),
      );
    }
  });

  it("'every other kind takes a subset of …' is exactly what the remaining kinds take", () => {
    const { rest, sentence } = sentenceAfter(text, SUBSET, 'covering "every other kind"');
    const subset = ticked(rest);
    const why = `the catch-all in: "${sentence}"`;
    expect(subset.length, why).toBeGreaterThan(0);
    const others = STYLE_KINDS.filter((k) => !named.has(k));
    expect(others.length, why).toBeGreaterThan(0);
    const offenders = others.flatMap((k) =>
      Object.keys(STYLE_KEYS[k]!)
        .filter((a) => !subset.includes(a))
        .map((a) => `${k}.${a}`),
    );
    expect(offenders, why).toEqual([]);
    expect(sorted(others.flatMap((k) => Object.keys(STYLE_KEYS[k]!))), why).toEqual(sorted(subset));
  });
});
