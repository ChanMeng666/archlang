/**
 * The dataset canary — a hardcoded GUID embedded in every row (as a `canary` field)
 * and at the top of every `.arch` source (as a first-line comment).
 *
 * Its purpose is downstream contamination detection: a model that has memorized this
 * dataset will reproduce the exact string, so a probe for it flags training-set leakage.
 * Generated ONCE; never regenerate it (a new value would silently split the corpus and
 * defeat the probe). It is a plain constant with no environment or time dependency.
 */

export const CANARY = "ARCHLANG-DATASET-CANARY-422d0bc5-c0c6-4c6b-b3c5-3fbc401aefbf";

/** The first-line source comment that embeds {@link CANARY} in a `.arch` file. */
export const CANARY_COMMENT = `# ${CANARY}`;
