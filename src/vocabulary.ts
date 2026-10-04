/**
 * Closed-vocabulary, token-bounded label matching — the one place ArchLang turns a
 * free-text room label into a controlled classification.
 *
 * Two vocabularies share this matcher core:
 *   1. The **concept** vocabulary ({@link import("./intent-concepts.js").CONCEPTS}) —
 *      the intent channel's brief-level room ideas ("bathroom", "tea point"). It
 *      imports {@link normalizeLabel} / {@link synonymMatchesLabel} from here; the
 *      table and its `SYNONYMS_VERSION` stay in `intent-concepts.ts`.
 *   2. The **use** vocabulary ({@link USE_VOCABULARY}, below) — the lint/describe
 *      layer's label → {@link UseKind} classifier, the data form of the label regexes
 *      that used to live inline in `analyze.ts` (`BEDROOM_RE`, `WET_RE`, …) and
 *      `analyze/circulation.ts` (`LIVING_DINING_RE`).
 *
 * The matcher is **token-bounded**: a synonym matches only whole label tokens (in
 * order), never a substring — so "hall" matches "Entrance Hall" but not "Hallmark",
 * while a fused numeric suffix ("Bedroom 2" → tokens `[bedroom, 2]`) and multi-word
 * phrases ("en suite" → `[en, suite]`) still resolve. This is a superset-safe
 * re-expression of the old substring regexes: the two behave identically on the
 * committed corpus (pinned by `test/vocabulary-equivalence.test.ts`) and the
 * token form only ever refuses a spurious substring hit the regex would have taken.
 */

import type { UseKind } from "./ast.js";

/** Lowercase, turn `-_/` into spaces, collapse whitespace. The shared normal form. */
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
}

/** A string's tokens: its {@link normalizeLabel} form split on spaces, empties dropped. */
const tokensOf = (s: string): string[] => normalizeLabel(s).split(" ").filter(Boolean);

/** One synonym token, with whether a fused numeric suffix may follow it. */
interface SynToken {
  readonly tok: string;
  /** The token is one or more ASCII lowercase letters (`/^[a-z]+$/`). */
  readonly suffixable: boolean;
}

/** A synonym's tokens, each tagged once with {@link SynToken.suffixable}. */
function synTokens(syn: string): SynToken[] {
  return tokensOf(syn).map((tok) => {
    let suffixable = true;
    for (let k = 0; k < tok.length; k++) {
      const c = tok.charCodeAt(k);
      if (c < 0x61 || c > 0x7a) suffixable = false;
    }
    return { tok, suffixable };
  });
}

/** Does one label token satisfy one synonym token? Exact, or the synonym followed by
 *  a fused numeric suffix ("bedroom" ⇢ "bedroom2"); a spaced suffix ("Bedroom 2",
 *  "Unit A") falls out for free as a separate, ignored token in the subsequence walk.
 *
 *  The suffix is read by UTF-16 code unit, as the former `^<syn>[0-9]+$` (no flags) read
 *  it: one or more of `0`–`9` up to the end of the token, and nothing else — no full-width,
 *  Arabic-Indic or superscript digit (`test/vocabulary-matcher-oracle.test.ts`). */
function tokenEq(st: SynToken, labTok: string): boolean {
  if (labTok === st.tok) return true;
  const n = st.tok.length;
  if (!st.suffixable || labTok.length <= n || !labTok.startsWith(st.tok)) return false;
  for (let k = n; k < labTok.length; k++) {
    const c = labTok.charCodeAt(k);
    if (c < 0x30 || c > 0x39) return false;
  }
  return true;
}

/** The subsequence walk over already-split tokens: every synonym token appears, in
 *  order, as a whole label token. */
function tokensMatch(synToks: readonly SynToken[], labToks: readonly string[]): boolean {
  if (synToks.length === 0) return false;
  let i = 0;
  for (const lt of labToks) {
    const st = synToks[i];
    if (st !== undefined && tokenEq(st, lt)) i++;
  }
  return i === synToks.length;
}

/** Whole-word (token-bounded) subsequence match: every synonym token appears, in
 *  order, as a whole label token — so "hall" matches "Entrance Hall" but NOT
 *  "Hallmark", and "Bedroom 2" still matches "bedroom". */
export function synonymMatchesLabel(syn: string, label: string): boolean {
  return tokensMatch(synTokens(syn), tokensOf(label));
}

/**
 * One classification concept as a controlled vocabulary: `canonical` words are the
 * direct, primary names (a room labelled with one reads unambiguously as this kind);
 * `aliases` are indirect names (a "Powder" room is a WC, a "Foyer" is an entry) that
 * still classify but are flagged so a tool can advise an explicit `uses` tag. A
 * label is treated as canonical when it matches ANY canonical word, even if it also
 * matches an alias.
 */
export interface VocabEntry {
  readonly canonical: readonly string[];
  readonly aliases: readonly string[];
}

/** The result of matching a label against a {@link VocabEntry}: which word matched
 *  and whether it was a canonical (direct) term or an alias (indirect) one. */
export interface VocabMatch {
  /** The vocabulary word that matched (as written in the table). */
  word: string;
  /** True when the match came from a `canonical` word; false for an `aliases` one. */
  canonical: boolean;
}

/**
 * Match a label against one {@link VocabEntry}. Canonical words are tried first, so a
 * label carrying both a direct and an indirect term reports `canonical: true` (no
 * alias advisory). Returns `null` when no word matches.
 */
export function matchVocabulary(label: string, vocab: VocabEntry): VocabMatch | null {
  return matchPrepared(tokensOf(label), prepareEntry(vocab));
}

/** A {@link VocabEntry} with each word's tokens prepared, in the table's order. */
interface PreparedEntry {
  readonly canonical: readonly (readonly [string, SynToken[]])[];
  readonly aliases: readonly (readonly [string, SynToken[]])[];
}

function prepareEntry(vocab: VocabEntry): PreparedEntry {
  return {
    canonical: vocab.canonical.map((w) => [w, synTokens(w)] as const),
    aliases: vocab.aliases.map((w) => [w, synTokens(w)] as const),
  };
}

/** {@link matchVocabulary} over a label already split into tokens: the same words tried
 *  in the same order, so the same first match. */
function matchPrepared(labToks: readonly string[], vocab: PreparedEntry): VocabMatch | null {
  for (const [word, toks] of vocab.canonical) if (tokensMatch(toks, labToks)) return { word, canonical: true };
  for (const [word, toks] of vocab.aliases) if (tokensMatch(toks, labToks)) return { word, canonical: false };
  return null;
}

/**
 * The **use** vocabulary — the label classifier the analysis layer (`describe`,
 * `lint`, circulation) runs when a room has no authored `uses`. Each entry is one
 * classifier concept from the former `analyze.ts` regexes, its alternations split
 * into canonical (direct) vs alias (indirect) words:
 *
 *   - `bedroom`  ← `BEDROOM_RE` (`\bbed\b|bedroom`)
 *   - `bath`     ← the full-bathroom half of `WET_RE`
 *   - `wc`       ← the WC discriminator (`WC_RE`, `\bwc\b|toilet|powder`)
 *   - `kitchen`  ← `KITCHEN_RE`
 *   - `entry`    ← `ENTRY_RE` (`\bfoyer\b|vestibule|\bentry\b|\bentrance\b|mudroom`)
 *   - `hall`     ← `HALL_RE` (`\bhall\b|hallway|corridor|landing`)
 *   - `living`   ← `LIVING_DINING_RE` (circulation's living/dining classifier)
 *
 * A wet room is detected when `bath` OR `wc` matches, then discriminated to a WC when
 * `wc` matches — exactly the former `WET_RE.test(...) ? (WC_RE.test(...) ? "wc" : "bath")`
 * order. `entry` and `hall` are mutually exclusive (entry wins), as before. See
 * {@link classifyLabelUses}.
 *
 * NOTE: "wet room" is deliberately NOT a bath word — the old `WET_RE` never matched it,
 * so a plan labelled only "Wet Room" (with no authored `uses`) stays unclassified, as
 * it did at HEAD. Authored `uses` always wins over this table.
 */
export const USE_VOCABULARY = Object.freeze({
  bedroom: { canonical: ["bed", "bedroom"], aliases: [] },
  bath: {
    canonical: ["bath", "bathroom", "shower"],
    aliases: ["ensuite", "en suite", "washroom"],
  },
  wc: { canonical: ["wc", "toilet"], aliases: ["powder"] },
  kitchen: { canonical: ["kitchen", "kitchenette"], aliases: [] },
  entry: { canonical: ["entry", "entrance"], aliases: ["foyer", "vestibule", "mudroom"] },
  hall: { canonical: ["hall", "hallway", "corridor"], aliases: ["landing"] },
  living: { canonical: ["living", "lounge", "dining"], aliases: ["sitting", "family"] },
  // The aliases are
  // aliases and not canonical words on purpose: a carport is not enclosed and a "Parking" room
  // in a large building is a floor, not a garage, so both are reasonable inferences that an
  // author should be advised (W_ALIAS_MATCH) to pin with an explicit `uses garage`.
  garage: { canonical: ["garage"], aliases: ["carport", "car port", "parking"] },
}) satisfies Record<string, VocabEntry>;

/** {@link USE_VOCABULARY} with its words' tokens prepared once, when this module loads: a
 *  constant derived from a constant, never a cache filled by a call. */
const PREPARED_USE = Object.freeze(
  Object.fromEntries(Object.entries(USE_VOCABULARY).map(([k, v]) => [k, prepareEntry(v)])),
) as Readonly<Record<keyof typeof USE_VOCABULARY, PreparedEntry>>;

/** One alias-sourced classification: a use kind inferred from a non-canonical (indirect)
 *  vocabulary word, carried so `W_ALIAS_MATCH` can name what it inferred and from what. */
export interface AliasMatch {
  kind: UseKind;
  /** The alias word that triggered the classification (e.g. "powder", "foyer"). */
  word: string;
}

/** A label's inferred use kinds, plus any that came from an alias rather than a direct
 *  term (the advisory hook for `W_ALIAS_MATCH`). */
export interface LabelClassification {
  /** Inferred use kinds, in canonical emission order (bedroom, bath/wc, kitchen, entry/hall). */
  uses: UseKind[];
  /** Classifications that were inferred from an alias word (empty when all are canonical). */
  aliases: AliasMatch[];
}

/**
 * Classify a room's label/id text into use kinds by the {@link USE_VOCABULARY} table.
 * This is the data-driven replacement for the former `roomUses` regex cascade — same
 * kinds, same emission order, same wet→WC discrimination and entry-over-hall
 * precedence — and it additionally reports which classifications came from an alias
 * (indirect) word so lint can advise an explicit `uses` tag.
 *
 * Note the living/dining kind is intentionally NOT emitted here: the old `roomUses`
 * never produced `living`/`dining` from a label (they came only from an authored
 * `uses`, or the separate circulation classifier). {@link matchesLivingDining} keeps
 * that separate label check.
 */
export function classifyLabelUses(text: string): LabelClassification {
  const uses: UseKind[] = [];
  const aliases: AliasMatch[] = [];
  const add = (kind: UseKind, m: VocabMatch): void => {
    uses.push(kind);
    if (!m.canonical) aliases.push({ kind, word: m.word });
  };
  // Normalised and split once for every entry below, not once per word.
  const toks = tokensOf(text);

  const bedroom = matchPrepared(toks, PREPARED_USE.bedroom);
  if (bedroom) add("bedroom", bedroom);

  // Wet room: bath OR WC words detect it; a WC word discriminates it to a WC.
  const bath = matchPrepared(toks, PREPARED_USE.bath);
  const wc = matchPrepared(toks, PREPARED_USE.wc);
  if (wc) add("wc", wc);
  else if (bath) add("bath", bath);

  const kitchen = matchPrepared(toks, PREPARED_USE.kitchen);
  if (kitchen) add("kitchen", kitchen);

  // Entry and hall are mutually exclusive; entry wins.
  const entry = matchPrepared(toks, PREPARED_USE.entry);
  if (entry) add("entry", entry);
  else {
    const hall = matchPrepared(toks, PREPARED_USE.hall);
    if (hall) add("hall", hall);
  }

  // Last, so every classification that existed before this kind did keeps its emission
  // position in the `uses` array — that array reaches `describe --json`, and re-ordering it
  // would be a behaviour change for every consumer for no gain.
  const garage = matchPrepared(toks, PREPARED_USE.garage);
  if (garage) add("garage", garage);

  return { uses, aliases };
}

/** Whether a label's text reads as a living or dining space by the `living` use
 *  vocabulary — the circulation layer's classifier (former `LIVING_DINING_RE`). */
export function matchesLivingDining(text: string): boolean {
  return matchPrepared(tokensOf(text), PREPARED_USE.living) !== null;
}
