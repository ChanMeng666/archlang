/**
 * The intent channel's concept vocabulary — production name resolution for the
 * NL→ArchLang intent contract (v1.14, Tranche 4).
 *
 * A "concept" is a brief-level room idea ("bathroom", "master bedroom", "tea point").
 * A produced room (a {@link RoomSummary}) matches a concept by, in order:
 *   1. its normalized `label` matching one of the concept's `labels` (token-bounded), then
 *   2. its `room_type` being in the concept's `roomTypes`, then
 *   3. its `uses[]` intersecting the concept's `uses`.
 * Label match wins so a specifically-labelled room is not miscounted by a broad type.
 * This kills the label-wording failure class at the production layer, not only in the eval.
 *
 * ORACLE ISOLATION (load-bearing, and unchanged by moving this into core): this table is
 * the SCORER's definition of "what the brief asked for". It is deliberately NOT enumerated
 * in any agent-facing prose (SKILL.md / spec.llm.md / docs), and the eval's author prompt
 * is `spec.llm.md` only — this vocabulary never enters a model prompt. If it did, the eval
 * would be measuring itself. Oracle isolation is enforced behaviourally (prompt-building
 * code never imports this) and source-checked; see `eval/synonyms.ts`'s header and
 * `test/g1.test.ts`. The eval re-points at this module (a later step) so eval and
 * production judge from ONE table.
 *
 * This byte-mirrors `eval/synonyms.ts` (the CONCEPTS table and matchers are identical) with
 * one difference: the room-matching entry point ({@link roomsMatchingConcept}) does not
 * throw on an unknown concept — it falls back to a literal id/label/uses/room_type match
 * (production leniency). The eval corpus only ever names table keys, and a test pins that a
 * typo still fails loudly there.
 */

import type { RoomSummary } from "./describe.js";

/** Bump when the concept table or matching semantics change (pinned by a test). */
export const SYNONYMS_VERSION = 1;

/** One brief-level room concept. All three matcher inputs are optional but `labels`
 *  is always present (a concept is named, first, by the words a brief would use). */
export interface Concept {
  /** Natural-language names a brief might use; matched against a room label. */
  labels: string[];
  /** Canonical `room_type` values that satisfy the concept (fallback after labels). */
  roomTypes?: string[];
  /** ArchLang `uses` tags that satisfy the concept (last-resort fallback). */
  uses?: string[];
}

/**
 * The concept table. Alphabetized by key. `roomTypes` uses the canonical
 * {@link import("./plan-json.js").RoomType} spelling (LivingRoom, MasterRoom, …).
 *
 * Additions beyond the roadmap starter set (documented):
 *   - `private-office`: labels-only (no `roomTypes`/`uses`) so it matches only rooms
 *     labelled like "Office 1"/"Office 2" and NOT sibling `StudyRoom`s such as a
 *     Reception or Meeting Room (which the golden also types `StudyRoom`). Needed by
 *     the `reception-suite` brief's "two private offices".
 */
export const CONCEPTS: Readonly<Record<string, Concept>> = Object.freeze({
  bathroom: {
    labels: [
      "bathroom",
      "bath",
      "wc",
      "toilet",
      "shower room",
      "wet room",
      "washroom",
      "cloakroom",
      "lavatory",
      "restroom",
      "ensuite",
      "en suite",
    ],
    roomTypes: ["Bathroom"],
    uses: ["bath", "wc"],
  },
  bedroom: {
    labels: ["bedroom", "bed room"],
    roomTypes: ["MasterRoom", "SecondRoom", "ChildRoom", "GuestRoom"],
    uses: ["bedroom"],
  },
  "consulting-room": {
    labels: ["consulting room", "consult", "treatment room", "exam room", "room"],
  },
  corridor: {
    labels: ["corridor", "hall", "hallway", "passage", "circulation"],
    roomTypes: ["Entrance"],
  },
  dining: {
    labels: ["dining", "dining room", "dining area"],
    roomTypes: ["DiningRoom"],
  },
  hall: {
    labels: [
      "hall",
      "hallway",
      "entry",
      "entrance",
      "entrance hall",
      "foyer",
      "vestibule",
      "corridor",
      "passage",
      "landing",
    ],
    roomTypes: ["Entrance"],
    uses: ["hall"],
  },
  kitchen: {
    labels: ["kitchen", "kitchenette", "galley"],
    roomTypes: ["Kitchen"],
    uses: ["kitchen"],
  },
  kitchenette: {
    labels: ["kitchenette", "kitchen", "tea point", "pantry"],
    roomTypes: ["Kitchen"],
  },
  "living-room": {
    labels: [
      "living room",
      "living",
      "lounge",
      "sitting room",
      "living area",
      "family room",
      "living dining",
      "kitchen living",
    ],
    roomTypes: ["LivingRoom"],
    uses: ["living"],
  },
  "main-bathroom": {
    labels: ["main bathroom", "family bathroom", "bathroom 1", "bathroom", "master bath"],
    roomTypes: ["Bathroom"],
  },
  "master-bedroom": {
    labels: ["master bedroom", "main bedroom", "primary bedroom", "principal bedroom", "bedroom 1", "master suite"],
    roomTypes: ["MasterRoom"],
  },
  "meeting-room": {
    labels: ["meeting room", "meeting", "conference room", "boardroom"],
  },
  "open-office": {
    labels: ["open office", "open plan", "open work area", "work area", "workspace", "open area", "office"],
    uses: ["office"],
  },
  "private-office": {
    labels: ["office", "private office"],
  },
  reception: {
    labels: ["reception", "lobby", "waiting area", "front desk"],
  },
  "studio-room": {
    labels: ["studio", "studio room", "living", "main room", "living space", "bedsit"],
    roomTypes: ["LivingRoom"],
  },
  study: {
    labels: ["study", "office", "home office", "den", "workroom"],
    roomTypes: ["StudyRoom"],
    uses: ["office"],
  },
  suite: {
    labels: ["suite", "demised suite", "tenant suite", "office suite", "unit"],
  },
  "tea-point": {
    labels: ["tea point", "teapoint", "kitchenette", "pantry", "break area", "breakout", "tea"],
    uses: ["kitchen"],
  },
  unit: {
    labels: ["unit", "studio", "apartment", "flat"],
  },
  utility: {
    labels: ["utility", "utility room", "laundry"],
    roomTypes: ["Storage"],
  },
  wc: {
    labels: ["wc", "toilet", "restroom", "lavatory", "cloakroom", "washroom", "bathroom"],
    roomTypes: ["Bathroom"],
  },
  "wet-room": {
    labels: ["wet room", "wetroom", "shower room", "accessible bathroom", "bathroom"],
    roomTypes: ["Bathroom"],
  },
});

/** Lowercase, turn `-_/` into spaces, collapse whitespace. The shared normal form. */
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does one label token satisfy one synonym token? Exact, or the synonym followed by
 *  a fused numeric suffix ("bedroom" ⇢ "bedroom2"); a spaced suffix ("Bedroom 2",
 *  "Unit A") falls out for free as a separate, ignored token in the subsequence walk. */
function tokenEq(synTok: string, labTok: string): boolean {
  if (labTok === synTok) return true;
  return /^[a-z]+$/.test(synTok) && new RegExp(`^${escapeRegExp(synTok)}[0-9]+$`).test(labTok);
}

/** Whole-word (token-bounded) subsequence match: every synonym token appears, in
 *  order, as a whole label token — so "hall" matches "Entrance Hall" but NOT
 *  "Hallmark", and "Bedroom 2" still matches "bedroom". */
function synonymMatchesLabel(syn: string, label: string): boolean {
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

/** Whether a produced room satisfies a concept (label → room_type → uses order). */
export function roomMatchesConcept(concept: Concept, room: RoomSummary): boolean {
  const label = room.label ?? "";
  if (concept.labels.some((syn) => synonymMatchesLabel(syn, label))) return true;
  if (concept.roomTypes?.includes(room.room_type)) return true;
  if (concept.uses && room.uses.some((u) => concept.uses!.includes(u))) return true;
  return false;
}

/** Whether `concept` is a known key in the {@link CONCEPTS} table. */
export function isKnownConcept(concept: string): boolean {
  return Object.hasOwn(CONCEPTS, concept);
}

/**
 * The rooms that satisfy a named concept.
 *
 * A table key resolves exactly as {@link roomMatchesConcept} (label → room_type → uses,
 * token-bounded) — the same judgment the eval makes. An UNKNOWN concept (production
 * leniency; the eval corpus never hits this — its concepts are all table keys) falls back
 * to a literal match: `normalized(id)` equals the normalized concept, OR the concept
 * token-matches the label, OR the concept is one of the room's `uses`, OR it equals the
 * room's `room_type` case-insensitively.
 */
export function roomsMatchingConcept(concept: string, rooms: readonly RoomSummary[]): RoomSummary[] {
  const c = CONCEPTS[concept];
  if (c) return rooms.filter((r) => roomMatchesConcept(c, r));
  const norm = normalizeLabel(concept);
  const lower = concept.toLowerCase();
  return rooms.filter((r) => {
    if (normalizeLabel(r.id) === norm) return true;
    if (synonymMatchesLabel(concept, r.label ?? "")) return true;
    if (r.uses.includes(concept)) return true;
    if (r.room_type.toLowerCase() === lower) return true;
    return false;
  });
}

/** Concepts whose labels mark a room as circulation for the policy-B room-count band. */
const CIRCULATION_CONCEPTS = ["hall", "corridor"] as const;

/** Whether a room is circulation: `room_type === "Entrance"`, OR `uses` includes
 *  `"hall"`, OR its normalized label matches the hall/corridor concept labels. This is
 *  the classifier behind the policy-B "one surplus circulation room" room-count band. */
export function isCirculationRoom(room: RoomSummary): boolean {
  if (room.room_type === "Entrance") return true;
  if (room.uses.includes("hall")) return true;
  const label = room.label ?? "";
  return CIRCULATION_CONCEPTS.some((key) => CONCEPTS[key]?.labels.some((syn) => synonymMatchesLabel(syn, label)));
}
