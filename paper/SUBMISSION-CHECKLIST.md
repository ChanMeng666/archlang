# Submission checklist

Run this end to end before each submission. It exists because every item on it is something
that actually went wrong during preparation, or that a venue desk-rejects for.

Do not tick an item you have not executed. That is the whole subject of the paper.

---

## 0. The one command

```bash
npm run paper:check        # claims + anonymity + build/page-limits/citations
```

It chains `check-claims.mjs`, `check-anon.mjs` and `build.mjs`, and exits non-zero on any
failure. **All three have been proven non-vacuous by planting a fault and watching them
fail** — a banned claim and a split-across-a-newline banned phrase; an author name and
e-mail; an over-long paper and a misspelled citation key. Re-prove any of them you change.

It does not replace the rest of this list — it cannot re-run the experiments, regenerate the
snapshot, or read the PDF for you.

## A. Mechanical gates (run them; do not read them)

- [ ] `npm run gen:paper-facts && npm run check:drift` — green. Every structural number in
      every `.tex` comes from `facts.tex`. **If you typed a digit into a `.tex`, you broke the
      paper's own argument.**
- [ ] `npm run paper:snapshot -- --date <today>` — regenerate `scale-snapshot.json`, and update
      the corresponding `\fact*` values in `facts-manual.tex` to match. These do *not*
      auto-propagate on purpose.
- [ ] `npm run paper:build` — exit 0. This asserts page limits and citation keys, and it fails
      closed (`UNVERIFIED`) rather than passing when it cannot see what it checks.
- [ ] `npm run check` — the repo's own gate, since `paper/` now lives inside the repo.
- [ ] Every `paper/experiments/*/run.sh` and harness re-run from scratch, against its pinned
      SHA. A reproduction script that has not been executed since it was written is exactly the
      defect this paper documents.
- [ ] `git status` clean of anything unintended — **specifically check `src/` for a leftover
      mutation.** The mutation harness has left a planted fault in the working tree once
      already, while its own result file recorded `treeCleanAfterRun: true`.

## B. Venue conformance

| | ICSE Demo | ICSE NIER | arXiv |
|---|---|---|---|
| Deadline | 23 Oct 2026 AoE | 23 Oct 2026 AoE | rolling |
| Limit | 4 pp **incl.** refs | 4 pp + 1 pp refs | none |
| Anonymity | single (names IN) | **double (names OUT)** | named |
| Extra | 3–5 min YouTube video | — | endorsement may be needed |

- [ ] `\documentclass[10pt,conference]{IEEEtran}`, no `compsoc`/`compsocconf`. Title 24 pt,
      body 10 pt. Template unmodified.
- [ ] Page limits verified by `build.mjs`, **not by eye**. Both ICSE tracks enforce strictly
      with no option to buy pages.
- [ ] **NIER only:** no author name, no e-mail, no acknowledgements, no funding note, no
      ArchLang URL, no `github.com/ChanMeng666`, no npm package name, no first-person
      self-citation. Grep the PDF text, do not just look at page 1.
- [ ] **NIER only:** the artifact link is anonymised or omitted. The system is "a production
      open-source DSL"; third-party corroborating systems stay named.
- [ ] `\nocite{*}` **removed** from `flagship/main.tex`. It is there for drafting only; on the
      flagship it is not self-catching, because that target has no page limit.
- [ ] Demo video recorded, 3–5 min, uploaded unlisted, link live for the whole review period.

## C. Claim safety — the desk-reject surface

Read the final PDF against this list. These have already come back once under paraphrase.

- [ ] No "first", "only", "novel", "missing primitive", "no checkable text substrate".
- [ ] **PlanScript is cited by name** in related work, with its date (2026-01-05), and stated
      to be a structural mirror of the agent surface 5.5 months earlier. arch-plotter likewise.
      Hiding either is worse than conceding both.
- [ ] The drawing-generation leg is conceded to IfcOpenShell (to-scale SVG floor plans with
      door swings, room names and computed areas, since July 2015).
- [ ] The concession paragraph (`refs-notes.md` §8) is present near the top, conceding
      vacuity (Ball & Kupferman), mutate-and-recheck (Beer et al.), executing documentation
      (@tComment), tests-from-docs (CASCADE), diagnostic-catalogue completeness (rustc tidy),
      non-reflexive validation (Pact, Schemathesis), and **DRY (Hunt & Thomas 1999)**.
      Omitting DRY is the cheapest available refutation of our remedy.
- [ ] The claim is the **precondition and the measurement**, never the concept. No section
      opens with a definition.
- [ ] No statement, positive **or negative**, about whether a diagnostic feedback loop beats
      equal-budget resampling.
- [ ] The 26-brief eval is never called a benchmark or a model score.
- [ ] Clear widths, walk distances and furniture clearances are called advisory, never
      measurements. Only reachability, exact areas and byte-identical determinism are
      claimed as measurement.
- [ ] The word **"uniformly"** appears only if `paper/experiments/ecosystem/` licenses it with
      a seeded random sample. Documentation reading and opportunistic repo sampling do not.
- [ ] Every negative claim is phrased "we found no prior work naming this", never "no prior
      work exists" — and the search holes are stated (DBLP unreachable; GitHub code search
      unusable unauthenticated; TypeSpec/Smithy unknown; `client-gen`/`lister-gen` and
      Gradle's own build not examined).

## D. Numbers

- [ ] **"27 of 28 planted faults"** appears nowhere. It is unreproducible and its artifacts do
      not exist. The citable figure is the new 56-mutant experiment, and it must be stated as
      an independent measurement over a different, committed mutant set — **not** as a
      correction of the old number, because the two are not comparable.
- [ ] **"113/113"** and **"71-plan corpus"** appear nowhere. 113 is a whole-file `it()` count
      that grows with the example gallery; 71 was never correct. Cite 73/73 agreement over a
      73-plan corpus (36 parseable, 37 not), against 49/73 for the last published pre-v1.26
      grammar.
- [ ] Exactly one eval baseline is cited (`live-baseline.json`, 2026-07-12, run 29190294073),
      with model, seed, judge version and date. It is stated that the per-brief table and the
      G1 control belong to the superseded 2026-07-11 run.
- [ ] Gate G1's grading is described as **two independent model raters with a human
      adjudicating two disagreements**. No human graded any assertion. The sensitivity result
      (95.7%, z = 1.24, p = 0.11) travels in the same breath as z = 2.08, never behind it.
- [ ] npm download figures carry the release-cadence concentration **in the same sentence**,
      and are never called users, installs or adoption.
- [ ] Every rate has its denominator. Every sample states its frame and its bias.

## E. Honesty items that are part of the contribution

- [ ] The tooling-failure sequence is reported, not tidied away. As of 2026-08-22:
      (1) a bibliography set-comparison whose regex collapsed and reported every entry missing
      — ignored only because a different check contradicted it; (2) a page counter that
      reported a one-page paper as 47 pages and would have passed any limit; (3) a fault
      injector whose planted `\cite` lost its backslash, so the non-vacuity proof proved
      nothing; (4) a stale `.tex` silently recompiled against a grown bibliography, caught by
      the set comparison — the one case where a guard fired; (5) a stale paragraph sitting
      directly above its own correction in `OUTLINE.md`, caught by a reader rather than a
      gate; (6) the mutation harness leaving a planted fault in `src/` while recording
      `treeCleanAfterRun: true`.
- [ ] Refutations are reported as prominently as confirmations: the `rooms_connected`
      framing was refuted; ifc-lite's 11 MCP error codes are all live; PlanScript's parser is
      regenerated on every build and cannot drift.
- [ ] The Kubernetes round-trip counterexample is reported prominently, **with the note that
      it was found while trying to refute our own executable-counterpart line**.
- [ ] The AI-usage disclosure is a titled section, not a footnote, and complies with the ACM
      Policy on Authorship.

## E2. Posting (see `ZENODO.md` and `ARXIV-ENDORSEMENT.md`)

- [ ] **Post the flagship only.** The NIER cut and the Demo paper go on no preprint server before
      their notifications (2026-12-18 and 2026-12-11). ICSE grants the right to preprint, but a
      *submitted* paper on a server is the one move that could be read against the
      concurrent-submission clause.
- [ ] **The word "ICSE" appears nowhere** on the Zenodo record, in the repository, or in the
      preprint PDF. The policy permits preprints and forbids saying the manuscript was submitted
      to ICSE 2027.
- [ ] ORCID registered and attached to the Zenodo creator entry.
- [ ] DOI **reserved** on the Zenodo draft and typed into the flagship's title page *before*
      publishing, then rebuilt. A reserved DOI is lost if the draft is deleted.
- [ ] Software DOI minted from a tagged GitHub release via the Zenodo integration, with a
      `CITATION.cff` in the repository, and linked from the paper record as a related identifier.
- [ ] arXiv submission started (this is what generates the endorsement code) and the first
      endorser contacted. One or two at a time — mass-emailing endorsers is a policy violation,
      not just bad manners.

## F. Last pass

- [ ] Read the PDF, not the source. Check the rendered bibliography for `[?]`.
- [ ] Confirm every `\fact*` macro rendered a number and not a blank.
- [ ] Have someone (or a fresh agent with no context) try to refute the abstract in ten
      minutes. That is cheaper in October than in December.
