/**
 * The taste profiles (ADR 0032; plan-soundness PS5.2). A profile is an honestly named bundle of
 * taste numbers (ADR 0005: never a standard's name, never a compliance claim); every number cites
 * its source and how it was checked ([V] read in the source, [S] second-hand).
 *
 * The three `*-residential-advisory` names are also lint profiles (`LINT_PROFILES`,
 * `src/lint/ruleset.ts`), so `lint --profile`, `score --taste` and `validate --profile/--taste`
 * take the same names. A taste profile that names a lint profile lists that profile's own lint
 * warnings under the report's `advisory`, where they never cap the score (design §6 Q2).
 */

import type { TasteProfile } from "./criteria.js";

/** IRC R303.1: glazing at least 8 % of the floor area of a habitable room [S, `prior-art.md` §3.2]. */
const IRC_R303_1 = { num: 8n, den: 100n } as const;

export const TASTE_PROFILES: Readonly<Record<string, TasteProfile>> = Object.freeze({
  generic: {
    daylightTarget: IRC_R303_1,
  },
  "cn-residential-advisory": {
    // GB 50096-2011 7.1.5: a window-to-floor area ratio of at least 1/7 for bedrooms, living
    // rooms and kitchens [V, `docs/plans/plan-soundness/research/prior-art.md` §3.1].
    daylightTarget: { num: 1n, den: 7n },
  },
  "uk-residential-advisory": {
    // No English figure was read for a glazing ratio, so the generic 8 % (IRC R303.1 [S]) stands:
    // a remembered value would not ship (README §3 D3).
    daylightTarget: IRC_R303_1,
  },
  "us-residential-advisory": {
    // IRC R303.1: glazing at least 8 % of a habitable room's floor area [S, `prior-art.md` §3.2].
    daylightTarget: IRC_R303_1,
  },
});

/**
 * Where a profile's number for a criterion comes from a different source than the criterion's
 * own (`TASTE_ADVICE`), the source and mark the report prints for it under that profile, so a
 * criterion never cites one source for another's number.
 */
export const TASTE_PROFILE_SOURCES: Readonly<
  Record<string, Readonly<Record<string, { source: string; verified: "V" | "S" }>>>
> = Object.freeze({
  "cn-residential-advisory": Object.freeze({
    R7: { source: "GB 50096-2011 7.1.5 (window-to-floor area ratio at least 1/7)", verified: "V" as const },
  }),
});

/** The names `taste()` accepts, in a stable order. */
export const TASTE_PROFILE_NAMES: readonly string[] = Object.keys(TASTE_PROFILES);
