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
 *
 * The **use** vocabulary also carries a small, closed set of Spanish and Portuguese room words
 * (backlog NR.16, product-roadmap RM-D68), and {@link classifyLabelUses} alone compares tokens
 * without accents ({@link foldAccents}: "Baño" and "Bano" are one word). Every other reader here —
 * {@link synonymMatchesLabel} (the concept matcher), {@link matchVocabulary}, {@link namesOpenAir},
 * {@link nonResidentialWord} — compares exactly, as before. A label word is a convenience: an
 * authored `uses` is the language-neutral channel and always wins over this table.
 */

import type { UseKind } from "./ast.js";

/** Lowercase, turn `-_/` into spaces, collapse whitespace. The shared normal form. */
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
}

/** A string's tokens: its {@link normalizeLabel} form split on spaces, empties dropped. */
const tokensOf = (s: string): string[] => normalizeLabel(s).split(" ").filter(Boolean);

/** The combining diacritical marks, U+0300 to U+036F, that {@link foldAccents} drops. Built from
 *  code points so the source holds no combining character. */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/**
 * Accents folded away for COMPARISON in the use classifier: canonical decomposition (NFD), then
 * every combining diacritical mark dropped, so "baño", "bano" and a decomposed "ban" + U+0303 + "o"
 * all read "bano", and "dormitório" reads "dormitorio". An all-ASCII string is returned as it is.
 * Never part of {@link normalizeLabel}'s output, which stays the public normal form.
 * `String.prototype.normalize` is ES2015, in every browser and Node, and Unicode normalization is
 * stable by policy, so the fold is deterministic. A letter NFD does not decompose ("ø", "ł", the
 * dotless "ı", a full-width letter) is not folded.
 */
function foldAccents(s: string): string {
  for (let k = 0; k < s.length; k++) {
    if (s.charCodeAt(k) > 0x7f) return s.normalize("NFD").replace(COMBINING_MARKS, "");
  }
  return s;
}

/** {@link tokensOf} with accents folded ({@link foldAccents}): the use classifier's tokens only. */
const foldedTokensOf = (s: string): string[] => foldAccents(normalizeLabel(s)).split(" ").filter(Boolean);

/** One synonym token, with whether a fused numeric suffix may follow it. */
interface SynToken {
  readonly tok: string;
  /** The token is one or more ASCII lowercase letters (`/^[a-z]+$/`). */
  readonly suffixable: boolean;
}

/** A synonym's tokens, each tagged once with {@link SynToken.suffixable}; accents folded when
 *  `fold` (the use classifier's tables), exact otherwise. */
function synTokens(syn: string, fold = false): SynToken[] {
  return (fold ? foldedTokensOf(syn) : tokensOf(syn)).map((tok) => {
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

/** `fold`: prepare the words with accents folded, for a label read by {@link foldedTokensOf}. */
function prepareEntry(vocab: VocabEntry, fold = false): PreparedEntry {
  return {
    canonical: vocab.canonical.map((w) => [w, synTokens(w, fold)] as const),
    aliases: vocab.aliases.map((w) => [w, synTokens(w, fold)] as const),
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
 *   - `living`   ← the living half of `LIVING_DINING_RE` (circulation's former classifier)
 *   - `dining`   ← its dining half, a {@link UseKind} of its own
 *
 * A wet room is detected when `bath` OR `wc` matches, then discriminated to a WC when
 * `wc` matches — exactly the former `WET_RE.test(...) ? (WC_RE.test(...) ? "wc" : "bath")`
 * order. `entry` and `hall` are mutually exclusive (entry wins), as before. See
 * {@link classifyLabelUses}.
 *
 * NOTE: "wet room" is deliberately NOT a bath word — the old `WET_RE` never matched it,
 * so a plan labelled only "Wet Room" (with no authored `uses`) stays unclassified, as
 * it did at HEAD. Authored `uses` always wins over this table.
 *
 * Spanish and Portuguese (NR.16): each row's English words come first, exactly as before, and the
 * es/pt words after them (`test/vocabulary-es-pt.test.ts` pins the English prefix), so an
 * English-only label classifies exactly as before. A label that mixes the languages can gain a
 * use, or, since entry wins over hall, change one ("Hall de entrada" read `hall` and now reads
 * `entry`); no tracked plan carries such a label. One spelling stands for both
 * languages where they fold alike ("dormitorio" is also the Portuguese "dormitório"). Left out on
 * purpose: a bare "sala" (any room: "sala de reuniones", "sala de máquinas"), "salón" (it folds
 * to the English "salon", a hair salon), "suíte" (a Brazilian suíte is a bedroom, while "Banheiro
 * da suíte" is its bathroom, and the fold makes it the English "suite" of an office building) and
 * "cuarto" (any room: "cuarto de baño" is a bathroom). "Habitación" is an alias: it is a bedroom
 * in a Spanish flat and any room elsewhere. "Quarto" is canonical (the standard Brazilian bedroom
 * word, "Quarto 1", "Quarto do casal"), except in the phrases that name another room
 * ({@link classifyLabelUses}). "Cochera" is an alias as "carport" is (it is often open), "aseo"
 * and "lavabo" as "powder" is, "vestíbulo" as "vestibule" is, and "distribuidor", "rellano" and
 * "patamar" as "landing" is.
 */
export const USE_VOCABULARY = Object.freeze({
  bedroom: { canonical: ["bed", "bedroom", "dormitorio", "recámara", "quarto"], aliases: ["habitación"] },
  bath: {
    canonical: [
      "bath",
      "bathroom",
      "shower",
      "baño",
      "banheiro",
      "casa de banho",
      "quarto de banho",
      "quarto de banhos",
    ],
    aliases: ["ensuite", "en suite", "washroom"],
  },
  wc: { canonical: ["wc", "toilet"], aliases: ["powder", "aseo", "lavabo"] },
  kitchen: { canonical: ["kitchen", "kitchenette", "cocina", "cozinha"], aliases: [] },
  entry: {
    canonical: ["entry", "entrance", "entrada", "recibidor"],
    aliases: ["foyer", "vestibule", "mudroom", "vestíbulo"],
  },
  hall: {
    canonical: ["hall", "hallway", "corridor", "pasillo", "corredor"],
    aliases: ["landing", "distribuidor", "rellano", "patamar"],
  },
  // `living` and `dining` were once one row (`LIVING_DINING_RE`'s words); they are two because
  // `dining` is a use of its own, so "Dining Room" classifies as `dining`, not `living`. The
  // word set is unchanged; see {@link classifyLabelUses} for the one rule an alias obeys.
  living: { canonical: ["living", "lounge", "sala de estar"], aliases: ["sitting", "family"] },
  dining: { canonical: ["dining", "comedor", "sala de jantar"], aliases: [] },
  // The aliases are
  // aliases and not canonical words on purpose: a carport is not enclosed and a "Parking" room
  // in a large building is a floor, not a garage, so both are reasonable inferences that an
  // author should be advised (W_ALIAS_MATCH) to pin with an explicit `uses garage`.
  garage: { canonical: ["garage", "garaje", "garagem"], aliases: ["carport", "car port", "parking", "cochera"] },
}) satisfies Record<string, VocabEntry>;

/**
 * The **fallback** use vocabulary (plan-soundness PS2.19): words read only for a label that
 * {@link USE_VOCABULARY} leaves with no use at all. Each row is keyed by the {@link UseKind}
 * it gives; the kinds are existing ones (`uses storage`, `uses office`, `uses utility`
 * already parse), so no language form is added. The rows are read from what the corpus
 * authors write: every corpus room labelled "Store", "Pantry", "Linen" or "Cellar" that
 * carries `uses` says `storage`; "Study", "Office" and "Consulting" say `office`; "Utility",
 * "Laundry" and "Plant" say `utility`.
 *
 *   - `bedroom` "nursery" is an alias, and the phrase "day nursery" (a childcare room, not a
 *     bedroom) keeps it from classifying at all. "Guest room", "kids room", "children's room"
 *     and "master suite" are canonical (PS2.18: a US/UK house's "Master" is its main bedroom);
 *     "master" alone is an alias, and it gives way to any other fallback row, since it
 *     qualifies a room as often as it names one ("Master Closet" is storage, "Master Study" an
 *     office).
 *   - `wc` "water closet" is an alias, and its match keeps "closet" from reading as storage.
 *   - `storage` covers a wardrobe, closet or dressing room: the room PS2.5 lets sit behind
 *     a bedroom. "Dressing", "Linen" and "Cellar" are aliases (a cellar may be lived in).
 *   - `office` "study" is canonical and "consulting" an alias (a consulting room is a
 *     clinic's). "Meeting" and "Staff room" are left out although the corpus tags them
 *     `office`: `finish` furnishes an office with a desk, which a meeting room or a staff
 *     room (often a break room) is not defined by.
 *   - `utility` "plant" and "boiler" are aliases: a plant room is not a laundry.
 *   - `living` (PS2.18), read last and only when no other fallback row matched: "great room",
 *     "reception room" and "drawing room" are canonical; "snug" and "den" are aliases (a den
 *     is a study as often as a sitting room). "Family room", "lounge" and "sitting room"
 *     already classify through {@link USE_VOCABULARY}.
 *
 * Deliberately absent: "balcony" and "terrace". ArchLang draws a balcony as an `outdoor`
 * surface, not a room, and no {@link UseKind} names an outdoor floor; a room labelled one
 * stays unclassified, so no use-reading rule judges it as a room people live in, and the lint
 * coverage report names it. "Studio" and "Gallery" are absent too: a studio is a flat, a
 * workroom or a dance floor, and a gallery a corridor or an exhibition room.
 *
 * Spanish and Portuguese (NR.16), after the English words as in {@link USE_VOCABULARY}: a pantry
 * ("despensa"), a box room ("trastero", "arrumos", "arrumação", "quarto de despejo"), a wardrobe
 * ("armario", "roupeiro") or walk-in closet ("vestidor") is storage, and a dressing room ("quarto
 * de vestir") is storage through an alias, as "dressing" is; a laundry ("lavandería", also the
 * Brazilian "lavanderia"; the European Portuguese "lavandaria"; "lavadero"; "quarto de lavar";
 * the Brazilian "área de serviço" and the Spanish "área de servicio") is a utility room. The
 * office row has no Spanish or Portuguese word: "estudio" is a studio flat as often as a study, a
 * Portuguese "oficina" is a workshop and "escritorio" is a desk in Spain, and an office use is the
 * evidence `dwellingReading` reads a plan as non-residential by, so a flat whose bedroom is
 * labelled "Suíte" would read as an office.
 */
export const FALLBACK_USE_VOCABULARY = Object.freeze({
  bedroom: {
    canonical: ["guest room", "kids room", "children's room", "master suite"],
    aliases: ["nursery", "master"],
  },
  wc: { canonical: [], aliases: ["water closet"] },
  storage: {
    canonical: [
      "storage",
      "store",
      "stores",
      "storeroom",
      "closet",
      "wardrobe",
      "pantry",
      "larder",
      "despensa",
      "trastero",
      "arrumos",
      "arrumação",
      "quarto de despejo",
      "armario",
      "roupeiro",
      "vestidor",
    ],
    aliases: ["dressing", "linen", "cellar", "quarto de vestir"],
  },
  office: { canonical: ["office", "study"], aliases: ["consulting"] },
  utility: {
    canonical: [
      "utility",
      "laundry",
      "lavandería",
      "lavandaria",
      "lavadero",
      "quarto de lavar",
      "área de serviço",
      "área de servicio",
    ],
    aliases: ["plant", "boiler"],
  },
  living: { canonical: ["great room", "reception room", "drawing room"], aliases: ["snug", "den"] },
}) satisfies Partial<Record<UseKind, VocabEntry>>;

/** {@link USE_VOCABULARY} with its words' tokens prepared once, when this module loads: a
 *  constant derived from a constant, never a cache filled by a call. */
const PREPARED_USE = Object.freeze(
  Object.fromEntries(Object.entries(USE_VOCABULARY).map(([k, v]) => [k, prepareEntry(v, true)])),
) as Readonly<Record<keyof typeof USE_VOCABULARY, PreparedEntry>>;

/** The one phrase that keeps "nursery" from reading as a bedroom: a day nursery is childcare. */
const PREPARED_DAY_NURSERY = prepareEntry({ canonical: ["day nursery"], aliases: [] }, true);

/** {@link FALLBACK_USE_VOCABULARY}, prepared the same way. */
const PREPARED_FALLBACK = Object.freeze(
  Object.fromEntries(Object.entries(FALLBACK_USE_VOCABULARY).map(([k, v]) => [k, prepareEntry(v, true)])),
) as Readonly<Record<keyof typeof FALLBACK_USE_VOCABULARY, PreparedEntry>>;

/**
 * The Portuguese phrases in which "quarto" names something that is not a bedroom: a bathroom
 * ("quarto de banho", "quarto de banhos", European Portuguese), a box room ("quarto de arrumos",
 * "quarto de arrumação", "quarto de despejo"), a dressing room ("quarto de vestir"), a laundry
 * ("quarto de lavar"), a sewing room ("quarto de costura"), a darkroom ("quarto escuro") and the
 * fourth floor ("quarto andar"). Each is read as ADJACENT tokens starting at a "quarto", unlike a
 * vocabulary word, so "Quarto de casal com casa de banho" is still a bedroom.
 */
const QUARTO_NOT_BEDROOM: readonly (readonly SynToken[])[] = Object.freeze(
  [
    "quarto de banho",
    "quarto de banhos",
    "quarto de arrumos",
    "quarto de arrumação",
    "quarto de despejo",
    "quarto de vestir",
    "quarto de lavar",
    "quarto de costura",
    "quarto escuro",
    "quarto andar",
  ].map((p) => synTokens(p, true)),
);

/** Whether `run` stands in `labToks` as consecutive tokens from index `at` (each by {@link tokenEq}). */
function runAt(labToks: readonly string[], at: number, run: readonly SynToken[]): boolean {
  if (at + run.length > labToks.length) return false;
  for (let k = 0; k < run.length; k++) if (!tokenEq(run[k]!, labToks[at + k]!)) return false;
  return true;
}

/** Whether EVERY "quarto" token of the label starts one of {@link QUARTO_NOT_BEDROOM}'s phrases, so
 *  that no "quarto" in it names a bedroom: "Quarto de banho" yes, "Quarto 1 / Quarto de banho" no. */
function everyQuartoGuarded(labToks: readonly string[]): boolean {
  const quarto = QUARTO_NOT_BEDROOM[0]![0]!;
  let seen = false;
  for (let i = 0; i < labToks.length; i++) {
    if (!tokenEq(quarto, labToks[i]!)) continue;
    seen = true;
    if (!QUARTO_NOT_BEDROOM.some((run) => runAt(labToks, i, run))) return false;
  }
  return seen;
}

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
  /** Inferred use kinds, in emission order (bedroom, bath/wc, kitchen, entry/hall, garage,
   *  living, dining; then, only when none of those matched, the fallback kinds bedroom, wc,
   *  storage, office, utility). */
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
 * `living` and `dining` are emitted like every other kind: a canonical word gives the use,
 * an alias word ("Family Room", "Sitting Room") gives it plus an `aliases` entry. They were
 * once left out, which made a label-only "Living Room" read as `uses: []` while circulation
 * and the equator-aspect rule classified it from the same table through a second function —
 * two classifiers for one fact. They are emitted after `garage`, so no kind that existed
 * before them changes position in the `uses` array. One rule is theirs alone: a living
 * ALIAS word is dropped when the label matched any other kind except `dining`, by a canonical
 * word or an alias ("Family Bathroom" is `[bath]`, "Family Foyer" `[entry]`, "Family Room"
 * `[living]` with the alias flagged).
 *
 * Last, {@link FALLBACK_USE_VOCABULARY} is read, and only when every kind above left the
 * label empty: "Store" is `[storage]`, "Study" `[office]`, "Laundry" `[utility]`, "Nursery"
 * `[bedroom]` (alias flagged), while "Kitchen Store" stays `[kitchen]` and "Family Store"
 * `[living]`, as they were.
 *
 * NR.16: the label's tokens and the table's words are compared without accents ({@link foldAccents}),
 * here alone. One guard is Portuguese: "quarto" gives no bedroom when every "quarto" in the label
 * starts a phrase, read as consecutive words, that names something else ("Quarto de banho" is
 * `[bath]`, "Quarto de arrumos" `[storage]`), so "Quarto de casal com casa de banho" and "Quarto 1
 * / Quarto de banho" are `[bedroom, bath]`, as "Bedroom with en suite" is.
 */
export function classifyLabelUses(text: string): LabelClassification {
  const uses: UseKind[] = [];
  const aliases: AliasMatch[] = [];
  const add = (kind: UseKind, m: VocabMatch): void => {
    uses.push(kind);
    if (!m.canonical) aliases.push({ kind, word: m.word });
  };
  // Normalised, accent-folded and split once for every entry below, not once per word.
  const toks = foldedTokensOf(text);

  // "Quarto" gives no bedroom when every "quarto" starts a phrase naming another room.
  const bedroom = matchPrepared(toks, PREPARED_USE.bedroom);
  if (bedroom && !(bedroom.word === "quarto" && everyQuartoGuarded(toks))) add("bedroom", bedroom);

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

  // After `garage`, for the same reason: appended, so every earlier position holds.
  //
  // A living ALIAS ("family", "sitting") is a qualifier as often as a room name: a "Family
  // Bathroom" is a bathroom, a "Family Foyer" an entry, a "Bed-sitting Room" a bedroom. So it is
  // dropped when the label matched ANY other kind above, canonical or alias. `dining`, the living
  // row's sibling, does not count: "Sitting / Dining" is living AND dining. Only the alias is
  // ever dropped: a canonical living word always classifies ("Kitchen / Living" is both).
  const living = matchPrepared(toks, PREPARED_USE.living);
  if (living && (living.canonical || uses.length === 0)) add("living", living);
  const dining = matchPrepared(toks, PREPARED_USE.dining);
  if (dining) add("dining", dining);

  // PS2.19: the fallback words, only for a label nothing above classified. Every label the
  // table above gives a use to is classified exactly as before; only an empty answer can gain
  // one. In order: bedroom, wc, storage (not after a water closet), office, utility.
  if (uses.length === 0) {
    const closetWc = matchPrepared(toks, PREPARED_FALLBACK.wc);
    const storage = closetWc ? null : matchPrepared(toks, PREPARED_FALLBACK.storage);
    const office = matchPrepared(toks, PREPARED_FALLBACK.office);
    const utility = matchPrepared(toks, PREPARED_FALLBACK.utility);
    const other = closetWc !== null || storage !== null || office !== null || utility !== null;
    // A "Day Nursery" is a childcare room, not a bedroom: that phrase gives no use at all. A
    // bare "Master" qualifies another fallback room ("Master Closet") rather than naming one.
    const bed = matchPrepared(toks, PREPARED_FALLBACK.bedroom);
    if (bed && !matchPrepared(toks, PREPARED_DAY_NURSERY) && !(bed.word === "master" && other)) add("bedroom", bed);
    if (closetWc) add("wc", closetWc);
    if (storage) add("storage", storage);
    if (office) add("office", office);
    if (utility) add("utility", utility);
    // PS2.18: last, and only for a label no other row read.
    const living = uses.length === 0 && !other ? matchPrepared(toks, PREPARED_FALLBACK.living) : null;
    if (living) add("living", living);
  }

  return { uses, aliases };
}

/** Whether a label's text reads as a living or dining space: {@link classifyLabelUses}
 *  emits `living` or `dining` for it. Not a second classifier — the same answer, as a
 *  boolean, for a caller that reads the label even when the room authored its `uses`
 *  (circulation). */
export function matchesLivingDining(text: string): boolean {
  const { uses } = classifyLabelUses(text);
  return uses.includes("living") || uses.includes("dining");
}

/**
 * Words that name a place outdoors with no enclosure of its own, so a wall round it has no gap to
 * leave. {@link FALLBACK_USE_VOCABULARY} leaves the balcony and the terrace out on purpose, so a room
 * labelled one has no use; this says what it is for the one reader that must tell it from a room with
 * no use at all: exterior walls round a terrace are a parapet, not a shell left open
 * (`src/analyze/open-shell.ts`). No {@link UseKind} comes of it.
 *
 * "Loggia" and "carport" are here: each is open on a side by design, so that side is no gap. "Porch"
 * is not: a porch is closed as often as open (a closed porch is the annex this reading exists for),
 * so it answers as a room does. English only, and compared exactly (no accent fold): only the use
 * classifier reads Spanish and Portuguese words (NR.16), and this reading looks for the head noun
 * where English puts it, last, while theirs comes first.
 */
const PREPARED_OPEN_AIR = prepareEntry({
  canonical: [
    "terrace",
    "balcony",
    "patio",
    "deck",
    "veranda",
    "verandah",
    "courtyard",
    "forecourt",
    "yard",
    "backyard",
    "garden",
    "lawn",
    "pool",
    "driveway",
    "loggia",
    "carport",
  ],
  aliases: [],
});

/**
 * Does this label name a place outdoors? Read off its last word, a spaced number apart ("Yard 2"): an
 * English head noun comes last, so "Roof terrace" is a terrace and "Garden shed" is a shed.
 */
export function namesOpenAir(text: string): boolean {
  const head = tokensOf(text).filter((t) => !/^[0-9]+$/.test(t));
  const last = head[head.length - 1];
  return last !== undefined && matchPrepared([last], PREPARED_OPEN_AIR) !== null;
}

/**
 * Words that read a room's label as part of a building people do not live in (plan-soundness
 * PS2.18). Read by `dwellingReading` (`src/analyze/dwelling.ts`) alone, never by
 * {@link classifyLabelUses}: they give no {@link UseKind}, so no room's `uses` and nothing
 * `describe()` reports changes.
 *
 *  - `canonical` words read non-residential on any plan: a café, restaurant, shop floor
 *    (`retail`), clinic, school or staff room is not a home's room.
 *  - `aliases` are ambiguous and read non-residential only on a plan with no bedroom and no
 *    living room (and never on a room that itself reads as one: "Reception room" is a living room
 *    through the fallback vocabulary), since an "Entrance Lobby" is a flat's
 *    hall, a "Waiting area" a landing, a "Shop" a workshop and a "Meeting nook" a corner of a
 *    living room.
 *
 * Measured against every room label in the corpus (examples/, test/, eval/, docs/ and the doc
 * fences) before it shipped: no plan with a bedroom or living room is read by an ambiguous word
 * alone. A café or shop with a flat above still reads as non-residential throughout (a known
 * limit until PS2.14 declares dwellings); `residential-basic` judges such a plan as a dwelling.
 */
export const NON_RESIDENTIAL_VOCABULARY: VocabEntry = Object.freeze({
  canonical: Object.freeze([
    "cafe",
    "café",
    "restaurant",
    "retail",
    "clinic",
    "consulting",
    "servery",
    "staff room",
    "classroom",
  ]),
  aliases: Object.freeze(["lobby", "reception", "waiting", "shop", "meeting"]),
});

/** {@link NON_RESIDENTIAL_VOCABULARY}, prepared once when this module loads. */
const PREPARED_NON_RESIDENTIAL = prepareEntry(NON_RESIDENTIAL_VOCABULARY);

/** The first {@link NON_RESIDENTIAL_VOCABULARY} word a label's text reads, token-bounded as
 *  every vocabulary word is, with whether it is one of the ambiguous ones; or `null`. */
export function nonResidentialWord(text: string): { word: string; ambiguous: boolean } | null {
  const m = matchPrepared(tokensOf(text), PREPARED_NON_RESIDENTIAL);
  return m ? { word: m.word, ambiguous: !m.canonical } : null;
}
