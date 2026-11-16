/**
 * The language reference's "Per-element styles — `style`" section agrees with `STYLE_KEYS` (WS.6).
 *
 * The section is prose written by hand (#868), and its first draft already disagreed with
 * `spec.llm.md` on which kinds take no `style`. This guard reads the section's own sentences and
 * checks them against the table, never a retyped list: the kinds it calls styleless must equal
 * `KEYWORDS.element` minus `STYLE_KINDS`, every kind/attribute pair it names must resolve through
 * `resolveStyleKey`, a kind it spells out must be spelled out completely, and the "every other
 * kind" catch-all must cover exactly the attributes the remaining kinds take.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { STYLE_KEYS, STYLE_KINDS, resolveStyleKey } from "../src/theme.js";

const HEADING = "### Per-element styles — `style`";

/** The section's text with whitespace collapsed, so a sentence may wrap anywhere. */
function section(): string {
  const doc = readFileSync("docs/language-reference.md", "utf8").replace(/\r\n/g, "\n");
  const start = doc.indexOf(HEADING);
  if (start < 0) throw new Error(`docs/language-reference.md has no "${HEADING}" section`);
  const end = doc.indexOf("\n### ", start + HEADING.length);
  return doc.slice(start, end < 0 ? doc.length : end).replace(/\s+/g, " ");
}

/** Every backticked bare word in `s`, in order. */
function ticked(s: string): string[] {
  return [...s.matchAll(/`(\w+)`/g)].map((m) => m[1]!);
}

/** The sentence after `marker` up to its first `.`, parenthesised asides removed. */
function sentenceAfter(text: string, marker: string): string {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`the style section no longer says "${marker}"`);
  const from = at + marker.length;
  const stop = text.indexOf(".", from);
  return text.slice(from, stop < 0 ? text.length : stop).replace(/\([^()]*\)/g, "");
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

describe("language reference § Per-element styles agrees with STYLE_KEYS (WS.6)", () => {
  const text = section();

  it("the kinds it says take no `style` are KEYWORDS.element minus the styled kinds", () => {
    const styleless = ticked(sentenceAfter(text, "`<kind>` is any element kind except"));
    const expected = KEYWORDS.element.filter((k) => !STYLE_KINDS.includes(k));
    expect(expected.length).toBeGreaterThan(0);
    expect(sorted(styleless)).toEqual(sorted(expected));
  });

  // "`room` takes `fill`, `label` and `area`" (an "also accepts" clause is read the same way)
  const named = new Map<string, Set<string>>();
  for (const m of text.matchAll(/`(\w+)` (?:takes|also accepts) ([^;:.]+)/g)) {
    const attrs = named.get(m[1]!) ?? new Set<string>();
    for (const a of ticked(m[2]!)) attrs.add(a);
    named.set(m[1]!, attrs);
  }

  it("names at least one kind's attributes (the sentence pattern still matches)", () => {
    expect(named.size).toBeGreaterThan(0);
  });

  it("every kind/attribute pair it names resolves through resolveStyleKey", () => {
    const unresolved = [...named].flatMap(([kind, attrs]) =>
      [...attrs].filter((a) => resolveStyleKey(kind, a) === null).map((a) => `${kind}.${a}`),
    );
    expect(unresolved).toEqual([]);
  });

  it("a kind it spells out is spelled out completely", () => {
    for (const [kind, attrs] of named) {
      expect(sorted(attrs), kind).toEqual(sorted(Object.keys(STYLE_KEYS[kind] ?? {})));
    }
  });

  it("'every other kind takes a subset of …' is exactly what the remaining kinds take", () => {
    const subset = ticked(sentenceAfter(text, "every other kind takes a subset of"));
    expect(subset.length).toBeGreaterThan(0);
    const others = STYLE_KINDS.filter((k) => !named.has(k));
    expect(others.length).toBeGreaterThan(0);
    const offenders = others.flatMap((k) =>
      Object.keys(STYLE_KEYS[k]!)
        .filter((a) => !subset.includes(a))
        .map((a) => `${k}.${a}`),
    );
    expect(offenders).toEqual([]);
    expect(sorted(others.flatMap((k) => Object.keys(STYLE_KEYS[k]!)))).toEqual(sorted(subset));
  });
});
