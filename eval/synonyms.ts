/**
 * The eval's concept vocabulary — a thin re-export SHIM over the production concept
 * table in {@link import("../src/intent-concepts.js")}.
 *
 * As of v1.14 Tranche 4 the concept table LIVES in `src/intent-concepts.ts` (production
 * name resolution for the intent channel), so the eval and the shipped judge score
 * against ONE table — no eval↔prod skew. This file preserves the eval's historical
 * import surface (`synonyms.js`) and, critically, the eval's LOUD-TYPO contract: the
 * eval's {@link roomsMatching} still THROWS on a concept that is not a table key, so a
 * corpus typo fails the offline gate rather than silently matching nothing. (Production's
 * {@link import("../src/intent-concepts.js").roomsMatchingConcept} is lenient — it falls
 * back to a literal id/label/uses match for unknown concepts — but the eval corpus only
 * ever names table keys, and that stricter contract is what this wrapper keeps.)
 *
 * ORACLE ISOLATION is unchanged and enforced BEHAVIOURALLY: the eval author prompt is
 * `spec.llm.md` only and never imports this table; see `src/intent-concepts.ts`'s header
 * and `test/g1.test.ts`.
 */

import type { RoomSummary } from "../src/index.js";
import { isKnownConcept, roomsMatchingConcept } from "../src/intent-concepts.js";

export {
  SYNONYMS_VERSION,
  type Concept,
  CONCEPTS,
  normalizeLabel,
  roomMatchesConcept,
  isCirculationRoom,
  isKnownConcept,
} from "../src/intent-concepts.js";

/** The rooms that satisfy a named concept. Throws on an unknown concept key so a corpus
 *  typo fails loudly rather than silently matching nothing — the eval's stricter contract
 *  over production's lenient {@link roomsMatchingConcept} (which the eval never hits, as
 *  every corpus concept is a table key). */
export function roomsMatching(concept: string, rooms: readonly RoomSummary[]): RoomSummary[] {
  if (!isKnownConcept(concept)) throw new Error(`unknown concept "${concept}" (not in eval/synonyms.ts)`);
  return roomsMatchingConcept(concept, rooms);
}
