/**
 * The showcase plans (product-roadmap card RM8.5, `docs/plans/product-roadmap/design/visual-language.md`
 * § 5.2): plans that name a family added after a byte-identity law's baseline ON PURPOSE, to show
 * it. A families law's premise case ("no shipped plan names a new word") skips exactly these and
 * scans every other file as before; the law's statement and its rows do not change, because a
 * showcase plan lives under `examples/showcase/` and the law's rows are the top-level
 * `examples/*.arch` only (`familiesLawRows`, `test/helpers/new-families-law.ts`).
 *
 * A closed list, sorted, each entry under `examples/showcase/`: the premise case checks all of
 * that, and that each entry exists and does name a new word (an entry that no longer needs the
 * exemption is removed). Each new entry is argued in its PR.
 */
export const SHOWCASE_PLANS: readonly string[] = ["examples/showcase/garden-courtyard.arch"];
