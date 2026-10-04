/**
 * The label classifier (`src/vocabulary.ts`) against the form it replaced, kept here VERBATIM
 * as the oracle (`docs/backlog.md` M.19).
 *
 * The old matcher re-normalised and re-split the label for every one of the 26 words
 * `classifyLabelUses` tries, and built a `new RegExp` per label token for the fused
 * numeric-suffix test: a 500,003-character label cost `lint` about 10 s. The new one splits
 * the label once per classification, prepares the table's words once, and reads the suffix by
 * UTF-16 code unit. The gate is that no answer moves: the same uses and aliases in the same
 * order, the same `matchVocabulary` result, the same `synonymMatchesLabel` boolean.
 *
 * The old suffix test is `^<syn>[0-9]+$` with no flags, so it reads code units, `[0-9]` is the
 * ASCII digits only and `$` is the end of the input. The code-unit sweep below appends EVERY
 * UTF-16 code unit to a word, so the char-code test is shown equal on all of them, not only
 * ASCII. Labels come from every room of the corpus, the synonym tables' own entries, and
 * generated text (mixed scripts, digits of other scripts, suffixes, punctuation, regex
 * metacharacters, empty, whitespace-only and very long).
 *
 * The oracle's only addition is the `tally` counter, which reads and changes nothing.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve as resolvePath, dirname } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { UseKind } from "../src/ast.js";
import { link } from "../src/import.js";
import { CONCEPTS } from "../src/intent-concepts.js";
import { type RRoom, resolveAll } from "../src/ir.js";
import { extractArchBlocks } from "../src/markdown.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import {
  USE_VOCABULARY,
  type VocabEntry,
  type VocabMatch,
  classifyLabelUses,
  matchVocabulary,
  matchesLivingDining,
  synonymMatchesLabel,
} from "../src/vocabulary.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");

/* ---------------------------------------------------------------------------
 * The oracle: the replaced code, verbatim
 * ------------------------------------------------------------------------- */

const tally = { suffix: 0 };

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokenEq(synTok: string, labTok: string): boolean {
  if (labTok === synTok) return true;
  const hit = /^[a-z]+$/.test(synTok) && new RegExp(`^${escapeRegExp(synTok)}[0-9]+$`).test(labTok);
  if (hit) tally.suffix++;
  return hit;
}

function oldSynonymMatchesLabel(syn: string, label: string): boolean {
  const synToks = normalizeLabel(syn).split(" ").filter(Boolean);
  const labToks = normalizeLabel(label).split(" ").filter(Boolean);
  if (synToks.length === 0) return false;
  let i = 0;
  for (const lt of labToks) {
    const st = synToks[i];
    if (st !== undefined && tokenEq(st, lt)) i++;
  }
  return i === synToks.length;
}

function oldMatchVocabulary(label: string, vocab: VocabEntry): VocabMatch | null {
  for (const word of vocab.canonical) if (oldSynonymMatchesLabel(word, label)) return { word, canonical: true };
  for (const word of vocab.aliases) if (oldSynonymMatchesLabel(word, label)) return { word, canonical: false };
  return null;
}

interface AliasMatch {
  kind: UseKind;
  word: string;
}

function oldClassifyLabelUses(text: string): { uses: UseKind[]; aliases: AliasMatch[] } {
  const uses: UseKind[] = [];
  const aliases: AliasMatch[] = [];
  const add = (kind: UseKind, m: VocabMatch): void => {
    uses.push(kind);
    if (!m.canonical) aliases.push({ kind, word: m.word });
  };

  const bedroom = oldMatchVocabulary(text, USE_VOCABULARY.bedroom);
  if (bedroom) add("bedroom", bedroom);

  const bath = oldMatchVocabulary(text, USE_VOCABULARY.bath);
  const wc = oldMatchVocabulary(text, USE_VOCABULARY.wc);
  if (wc) add("wc", wc);
  else if (bath) add("bath", bath);

  const kitchen = oldMatchVocabulary(text, USE_VOCABULARY.kitchen);
  if (kitchen) add("kitchen", kitchen);

  const entry = oldMatchVocabulary(text, USE_VOCABULARY.entry);
  if (entry) add("entry", entry);
  else {
    const hall = oldMatchVocabulary(text, USE_VOCABULARY.hall);
    if (hall) add("hall", hall);
  }

  const garage = oldMatchVocabulary(text, USE_VOCABULARY.garage);
  if (garage) add("garage", garage);

  return { uses, aliases };
}

function oldMatchesLivingDining(text: string): boolean {
  return oldMatchVocabulary(text, USE_VOCABULARY.living) !== null;
}

/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

const ENTRIES = Object.entries(USE_VOCABULARY) as [string, VocabEntry][];
const USE_WORDS = ENTRIES.flatMap(([, v]) => [...v.canonical, ...v.aliases]);
const CONCEPT_WORDS = [...Object.keys(CONCEPTS), ...Object.values(CONCEPTS).flatMap((c) => c.labels)];

/** Every public answer for one label, old against new. Returns the classification. */
function compareLabel(label: string, entries = true): { uses: UseKind[]; aliases: AliasMatch[] } {
  const now = classifyLabelUses(label);
  const before = oldClassifyLabelUses(label);
  expect(now, label.slice(0, 80)).toStrictEqual(before);
  expect(matchesLivingDining(label)).toBe(oldMatchesLivingDining(label));
  if (entries)
    for (const [, v] of ENTRIES) expect(matchVocabulary(label, v)).toStrictEqual(oldMatchVocabulary(label, v));
  return now;
}

/** `synonymMatchesLabel` for every synonym against `label`; returns how many matched. */
function compareSynonyms(syns: readonly string[], label: string): number {
  let hits = 0;
  for (const s of syns) {
    const now = synonymMatchesLabel(s, label);
    expect(now, `${s} / ${label.slice(0, 80)}`).toBe(oldSynonymMatchesLabel(s, label));
    if (now) hits++;
  }
  return hits;
}

/** Every room label and id of every storey of the corpus (the room-overlap oracle's corpus). */
function corpusLabels(): string[] {
  const worldFor = (dir: string): World => ({
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  });
  const walk = (dir: string, keep: (f: string) => boolean): string[] => {
    const files: string[] = [];
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) files.push(...walk(p, keep));
      else if (keep(f)) files.push(p);
    }
    return files;
  };
  const sources: { src: string; world: World }[] = [];
  for (const d of ["examples", "test/fixtures", "test/recovery-corpus", "eval"])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      sources.push({ src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8"))) sources.push({ src: b.source, world: NULL_WORLD });
  const out = new Set<string>();
  for (const s of sources) {
    const { plan: ast } = parse(s.src, BUILTIN_REGISTRY);
    if (!ast) continue;
    const res = resolveAll(link(ast, s.world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, s.world);
    const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
    for (const ir of irs)
      for (const e of ir?.elements ?? []) {
        if (e.kind !== "room") continue;
        const r = e as RRoom;
        out.add(r.id);
        if (r.label !== undefined) out.add(r.label);
      }
  }
  return [...out];
}

/** Fragments generated labels are built from: words, digits of several scripts, separators,
 *  other scripts, combining marks, case-changing letters, surrogates and regex metacharacters. */
const FRAGMENTS: readonly string[] = [
  ...USE_WORDS,
  "Bedroom",
  "BATH",
  "WC",
  "En-Suite",
  "Car_Port",
  "living/dining",
  "Hallmark",
  "bedrooms",
  "2",
  "12",
  "0",
  "007",
  "\uff12", // full-width 2
  "\uff10\uff11",
  "\u0663", // Arabic-Indic 3
  "\u06f5", // extended Arabic-Indic 5
  "\u0969", // Devanagari 3
  "\u00b2", // superscript 2
  "\u2082", // subscript 2
  "\u2167", // Roman numeral eight
  "\ud835\udfd0", // mathematical bold 2 (a surrogate pair)
  "\u0301", // combining acute
  "e\u0301",
  "\u20dd",
  " ",
  "  ",
  "-",
  "_",
  "/",
  "\t",
  "\n",
  "\r\n",
  "\u3000", // ideographic space
  "\u00a0",
  "\u2028",
  "\ufeff",
  "\u200b", // zero-width space: not \s
  "主卧",
  "卫生间",
  "厨房",
  "玄関",
  "욕실",
  "Küche",
  "salle de bain",
  "İ", // capital I with dot above: lowercases to two code units
  "\u212a", // Kelvin sign: lowercases to k
  "ß",
  "ﬁ", // the fi ligature
  "Σ",
  "Ｂｅｄ", // full-width Bed
  "ＷＣ",
  "🛁",
  "\ud800", // lone high surrogate
  "\udc00",
  ".",
  ",",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "*",
  "+",
  "?",
  "^",
  "$",
  "|",
  "\\",
  "#",
  "'",
  '"',
  "&",
  ":",
];

/** The 100,000-deep array of M.19, printed: `[[…[1], 2]…, 2]`, 500,003 characters. */
function deepArrayLabel(): string {
  return `${"[".repeat(100_000)}[1]${", 2]".repeat(100_000)}`;
}

describe("label classification: the one-split matcher against the per-word one", () => {
  it("every room label and id of the corpus, and every synonym against each", () => {
    const labels = corpusLabels();
    const syns = [...new Set([...USE_WORDS, ...CONCEPT_WORDS])];
    let classified = 0;
    let withAlias = 0;
    let synHits = 0;
    let nonAscii = 0;
    tally.suffix = 0;
    for (const l of labels) {
      const c = compareLabel(l);
      if (c.uses.length > 0) classified++;
      if (c.aliases.length > 0) withAlias++;
      if ([...l].some((ch) => ch.charCodeAt(0) > 0x7f)) nonAscii++;
      synHits += compareSynonyms(syns, l);
    }
    // Not vacuous (when this was written: 307 distinct labels and ids, 62 classified, 7
    // through an alias, 2 non-ASCII, 169 synonym hits, 26 fused-suffix hits).
    expect(labels.length).toBeGreaterThan(250);
    expect(classified).toBeGreaterThan(50);
    expect(withAlias).toBeGreaterThanOrEqual(5);
    expect(nonAscii).toBeGreaterThanOrEqual(2);
    expect(synHits).toBeGreaterThan(130);
    expect(tally.suffix).toBeGreaterThan(20);
  }, 120_000);

  it("the synonym tables' own entries, as labels and against each other", () => {
    const syns = [...new Set([...USE_WORDS, ...CONCEPT_WORDS])];
    let hits = 0;
    for (const s of syns) {
      compareLabel(s);
      compareLabel(s.toUpperCase());
      compareLabel(`${s}2`);
      compareLabel(`${s} 2`);
      hits += compareSynonyms(syns, s);
    }
    expect(syns.length).toBeGreaterThan(100);
    // At least every synonym matches itself.
    expect(hits).toBeGreaterThanOrEqual(syns.length);
  }, 120_000);

  it("every UTF-16 code unit as a fused suffix: only the ten ASCII digits extend a word", () => {
    // "bed" and "en suite" are suffixable ([a-z]+); "b2" and "bé" are not, so a suffix
    // after them must never match whatever the code unit is. "b" + the code unit is
    // suffixable exactly when the old `/^[a-z]+$/` says so.
    const pairs = (ch: string): [string, string][] => [
      ["bed", `bed${ch}`],
      ["bed", `bed2${ch}`],
      ["bed", `bed${ch}2`],
      ["en suite", `En Suite${ch}`],
      ["b2", `b2${ch}`],
      ["bé", `bé${ch}`],
      // The code unit inside the synonym token: suffixable only when it lowercases into a-z.
      [`b${ch}`, `b${ch}2`],
    ];
    const extended: number[] = [];
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      for (const [syn, label] of pairs(ch)) compareSynonyms([syn], label);
      if (synonymMatchesLabel("bed", `bed${ch}`)) extended.push(c);
    }
    // "bed" + one code unit: the ten digits, and the code units that normalise away (the
    // separators `-_/` and whitespace, which leave the token "bed").
    const digits = extended.filter((c) => c >= 0x30 && c <= 0x39);
    expect(digits).toHaveLength(10);
    expect(extended.every((c) => (c >= 0x30 && c <= 0x39) || /[-_/\s]/.test(String.fromCharCode(c)))).toBe(true);
  }, 120_000);

  it("property: labels assembled from mixed scripts, digits, separators and punctuation", () => {
    const syns = [...new Set([...USE_WORDS, ...CONCEPT_WORDS])];
    // Words and digits weighted up, so that matches and fused suffixes are common.
    const fragment = fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...USE_WORDS, "Bedroom", "BATH", "WC", "En-Suite", "Car_Port") },
      { weight: 2, arbitrary: fc.constantFrom("2", "12", "0", "\uff12", "\u0663", "\u00b2", "\ud835\udfd0", " ", "-") },
      { weight: 3, arbitrary: fc.constantFrom(...FRAGMENTS) },
    );
    const label = fc.array(fragment, { maxLength: 12 }).map((fs) => fs.join(""));
    const spaced = fc.array(fragment, { maxLength: 8 }).map((fs) => fs.join(" "));
    // A synonym drawn from the label's own fragments (often a hit), and one from the tables.
    const pair = fc
      .tuple(fc.array(fragment, { minLength: 1, maxLength: 8 }), fc.nat(), fc.boolean())
      .map(([fs, k, fused]) => ({ l: fs.join(fused ? "" : " "), s: fs[k % fs.length]! }));
    let classified = 0;
    let generatedSynHits = 0;
    tally.suffix = 0;
    fc.assert(
      fc.property(fc.oneof(label, spaced, fc.string(), fc.string({ unit: "binary" })), pair, (l, p) => {
        if (compareLabel(l).uses.length > 0) classified++;
        compareSynonyms(syns, l);
        if (compareLabel(p.l).uses.length > 0) classified++;
        generatedSynHits += compareSynonyms([p.s, `${p.s}2`, `${p.s} x`], p.l);
      }),
      { numRuns: 1500, seed: 1922 },
    );
    // 1,071 classified, 808 generated-synonym hits, 52 fused-suffix hits when written.
    expect(classified).toBeGreaterThan(800);
    expect(generatedSynHits).toBeGreaterThan(600);
    expect(tally.suffix).toBeGreaterThan(40);
  }, 120_000);

  it("empty, whitespace-only and separator-only labels", () => {
    for (const l of ["", " ", "   ", "\t\n", "\u3000", "\u00a0\u2028", "-", "_/-", " - _ / ", "\u200b", "\ufeff"]) {
      expect(compareLabel(l).uses).toEqual([]);
      compareSynonyms([...USE_WORDS, "", " ", "-"], l);
    }
  });

  it("very long labels: M.19's 500,003-character array, and a long suffix-heavy one", () => {
    const deep = deepArrayLabel();
    expect(deep.length).toBe(500_003);
    expect(compareLabel(deep, false).uses).toEqual([]);
    // 60,000 tokens, most of them a word with a fused suffix, the matching words at the end.
    const parts: string[] = [];
    for (let k = 0; k < 60_000; k++) parts.push(k % 3 === 0 ? `hall${k}` : k % 3 === 1 ? `x${k}` : `\uff12${k}`);
    parts.push("Bedroom12", "En-Suite3", "Powder", "Garage 2");
    const long = parts.join(" ");
    tally.suffix = 0;
    // "En-Suite3" is a bath word, but "Powder" makes the wet room a WC.
    expect(compareLabel(long, false)).toStrictEqual({
      uses: ["bedroom", "wc", "hall", "garage"],
      aliases: [{ kind: "wc", word: "powder" }],
    });
    expect(tally.suffix).toBeGreaterThan(0);
  }, 120_000);
});
