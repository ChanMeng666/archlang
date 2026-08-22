# `refs.bib` — verification log, threat assessment, and gaps

**Compiled 2026-08-22.** Companion to `paper/refs.bib`. Read before citing anything from that
file, and before writing a novelty claim.

> **Note on the previous message:** this file was written at 03:08 and did exist; the lead
> checked before it landed. It has since been rewritten to the stricter standard requested —
> every detail that was supplied from memory rather than from a lookup has been re-verified or
> removed, and five citations have been added for a sub-class the first pass did not cover.
>
> **Third pass, same day:** gap 2 was re-searched at the lead's request after being promoted to
> a claimed contribution. It produced a **partial retraction** — see §5, which supersedes the
> gap-2 entry in §4 — and ten further entries.
>
> **Fourth pass, same day:** gap 1 was attacked the same way once it became the headline.
> It produced a **second partial retraction** — see §6, which supersedes the gap-1 entry
> in §4 — and ten further entries.

---

## 0. Status

| | |
|---|---|
| Entries in `refs.bib` | **136** |
| Fully verified against a primary metadata record | **136** |
| Carrying a residual uncertainty, disclosed in the entry's own `note` field | **2** (`rodionov2026floorplanqa`, `deng2025bimgent` — both demoted to preprint form) |
| Listed UNVERIFIED and **absent** from `refs.bib` | **8** (§3) |
| Duplicate keys / non-ASCII characters | 0 / 0 |

**Compile proof.** A generated `main.tex` that `\nocite`s all 109 keys builds clean under
`IEEEtran` with tectonic, and the rendered `main.bbl` yields a `\bibitem` key set **identical**
to the `.bib`'s own key set — 136 = 136, empty diff both directions. Only `Underfull \hbox`
warnings remain, from long URLs in a two-column measure.

> **A correction to what I reported last time, because it is exactly the failure this paper is
> about.** I described that check as "a count comparison against the `.bib`'s own key list". The
> *count* was real and correct (grep). The *set* comparison I ran alongside it was broken — a
> `\\bibitem` pattern inside a shell-quoted Python one-liner collapsed to the regex `\b` word
> boundary, so it matched nothing and reported all 104 entries as missing. I did not act on that
> result because grep contradicted it, but for one run the verification step was reporting a
> total failure and being ignored, and had it instead reported *success* I would have believed
> it. It is now run from a file with a raw string, and it passes non-vacuously: perturbing a key
> makes it report that key on both sides of the diff. **Sub-class (C), produced by the tooling
> written to check the bibliography for a paper about sub-class (C), within two hours.** Worth a
> footnote in the flagship.

**Residual hole, disclosed:** tectonic swallows BibTeX's "I didn't find a database entry"
warning, so an **undefined** `\cite` key in a real paper will not fail the build loudly. The
136-vs-136 set comparison covers the `.bib` side only. A `\cite`-key-exists check belongs in
`build.mjs`; it is not there yet.

---

## 1. How verification was done

Nothing in `refs.bib` was written from memory. Sources used, in order of authority:

| Source | Used for | Entries |
|---|---|---|
| **arXiv API** (`export.arxiv.org/api/query`) | ID resolves; exact title; complete, ordered author list; `arxiv:comment` venue claims | 35 |
| **Crossref API** (`api.crossref.org/works`, plus `/works/{doi}` for direct resolution) | registered title, container, volume, issue, page range, year, DOI | 52 |
| **Crossref book-level DOI resolution** | confirming an LNCS chapter's actual conference (see below) | 4 |
| **OpenAlex API** | locating proceedings records where Crossref indexes only the preprint | 6 |
| **OpenReview API** | ICLR/NeurIPS acceptance and track | 4 |
| **Publisher / standards / project page fetch** | rustc `Applicability` levels, Biome fix safety, llms.txt authorship, ISO catalogue, CWI repository | 8 |
| **GitHub Releases API** | buildingSMART IDS v1.0 release date | 1 |
| **HTTP liveness (`curl -L`, 200)** | every `@misc` URL | 29 |

**Four LNCS venue attributions were confirmed the hard way**, by resolving the *book* DOI rather
than trusting the chapter record (Crossref reports only "Lecture Notes in Computer Science" for
all of them):

- `10.1007/978-3-030-72019-3` → *Programming Languages and Systems*, **30th European Symposium on
  Programming, ESOP 2021**, ETAPS 2021 → confirms `goldstein2021judgecover`.
- `10.1007/978-3-030-58452-8` → *Computer Vision – ECCV 2020*, 16th European Conference, Part I →
  confirms `nauata2020housegan`.
- `10.1007/978-3-540-79124-9` → *Tests and Proofs* (**TAP 2008**) → confirms
  `ball2008vacuitytesting`.
- `10.1007/3-540-63166-6` → *Computer Aided Verification*, **9th International Conference,
  CAV'97** → confirms `beer1997vacuity`.

**Limitation, stated rather than implied:** DBLP's API was unreachable from this machine
throughout (connection reset on every request). Crossref, OpenAlex and OpenReview covered every
case, but a venue indexed *only* by DBLP would have been missed.

### What changed on the second pass

Eighteen corrections were applied by a script that **asserts each replacement matched exactly
once and aborts otherwise** — so a silently-skipped edit is impossible.

**Details removed because they came from memory, not a record:**

- `mokhov2020buildsystems` — dropped `pages = {e11}`. JFP vol. 30 registers no page range.
- `beer1997vacuity` — dropped `volume = {1254}`. Not in any record I could reach.
- `ball2008vacuitytesting` — dropped `volume = {4966}`. A web summary asserted it; no primary
  record did.
- `eastman1975computers` — dropped `number = {3}`. Volume 63 and pp. 46–50 are corroborated by
  ERIC (EJ114213) and multiple independent reference listings; the *issue* number appeared only
  in a search-result summary. ERIC itself was unreachable at verification time.

**Entries corrected because the record disagreed with what I first wrote:**

- `muller2006procedural` — was `@inproceedings{ACM SIGGRAPH 2006 Papers}` with the TOG DOI. The
  DOI `10.1145/1141911.1141931` registers **ACM TOG 25(3):614–623**. Now an `@article` matching
  its own DOI.
- `khattab2024dspy` — **the ICLR 2024 paper has a different title from the arXiv preprint.**
  OpenReview: *"…into State-of-the-Art Pipelines"* (spotlight). arXiv: *"…into Self-Improving
  Pipelines"*. I had written the arXiv title under an ICLR booktitle — a hybrid citation for a
  paper that does not exist. Now the real ICLR title, with the arXiv variant in `note`.
- `du2026text2bim` (was `du2024text2bim`) — Text2BIM **is published**: *J. Computing in Civil
  Engineering* vol. 40, 2026, doi `10.1061/JCCEE5.CPENG-6386`, and the published title reads
  "Multiagent", not "Multi-Agent". Key renamed for year consistency.
- `vandeursen2001refactoringtest` — the reachable primary record is the **CWI technical report
  SEN-R0119**, not the XP 2001 proceedings; CWI's own repository lists no page numbers. Now a
  `@techreport` with the XP 2001 appearance in `note`, and the widely-copied "pp. 92–95" dropped.

**Entries upgraded once the proceedings record was located:**

- `joel2024dslsurvey` — TOSEM, **published**, doi `10.1145/3770084` (was "accepted").
- `wang2023grammarprompting` — NeurIPS 36, pp. 65030–65055, doi `10.52202/075280-2837`.
- `park2024gad` — NeurIPS, pp. 24547–24568, doi `10.52202/079017-0774`.
- `leng2023tell2design` — ACL 2023, pp. 14680–14697, doi `10.18653/v1/2023.acl-long.820`.
- `lara2026rlvrfloorplan` — **Findings of ACL 2026**, pp. 26612–26627, doi
  `10.18653/v1/2026.findings-acl.1326`.
- `olausson2024selfrepair` / `jimenez2024swebench` — ICLR 2024 poster / oral, confirmed on
  OpenReview rather than inferred from the arXiv comment.

**Entries demoted because the venue could not be independently confirmed** (both now carry the
uncertainty in their own `note`, so it travels with the citation):

- `rodionov2026floorplanqa` — the arXiv comment says ICML 2026; no proceedings record exists in
  Crossref or OpenAlex as of 2026-08-22. Cited as a preprint. (Plausibly just not indexed yet —
  ICML 2026 is about a month old. Re-check before camera-ready.)
- `deng2025bimgent` — ICML 2025 *workshop*, which is non-archival by nature. Cited as a preprint
  with the workshop in `note`.

**Five entries added** for a sub-class the first pass did not serve — see §2, threat 2.

---

## 2. Closest prior art — the threat list

Blunt, worst first. Our contribution as the lead states it: *guards that pass without having
asserted what they appear to assert, in systems whose primary author and reader is an LLM* —
sub-classes (A) self-description drift under a reflexive gate, (B) a ruler that moves the number
without the subject changing, (C) guards that never execute; corroborated across four
independent codebases; remedy is provable non-vacuity.

> **Before the threat list: the sub-class list changed between the two briefs, and the two
> versions have completely different prior art.** The first brief's (B) was *"a declared
> diagnostic that can never fire, or a check that computes a value then ignores it"*. The
> second's (B) is *"a ruler that moves the number without the subject changing"*. These are not
> the same defect and they are not threatened by the same literature — the first is a
> dead-code/vacuity problem, the second is a measurement-validity problem with a large and
> hostile literature attached. Both are real and both are corroborated in our own evidence
> (PlanScript's unfirable `E101` for the first; `JUDGE_VERSION` v1→v2 moving intent 9%→50% with
> zero model change for the second). **The papers need to pick, or carry four sub-classes.**
> `refs.bib` now serves both readings.

### Threat 1 — `ball2008vacuitytesting` (Ball & Kupferman, "Vacuity in Testing", TAP 2008), standing on `beer1997vacuity` / `beer2001vacuity` / `kupferman2003vacuity`

**How much of us this already covers: the concept AND the remedy. Call it 80% of the conceptual
core.** This is the answer to the lead's direct question about vacuity detection, and it is worse
than it looks from the model-checking framing.

*What the lineage actually claims.* Beer, Ben-David, Eisner & Rodeh (CAV'97 / FMSD'01): a formula
can be satisfied *vacuously* — some subformula plays no role in the outcome — and this is
detected by **mutating that subformula and re-checking**; they report that vacuous passes are
common in real industrial verification and usually indicate a defective specification, not a
correct design. Kupferman & Vardi (CHARME'99 / STTT'03) generalise it and add the "interesting
witness" requirement. Chockler, Kupferman & Vardi extend it to coverage metrics. Ball &
Kupferman then carry the whole apparatus into **testing**, defining when a test passes without
the pass depending on what it appears to check, and arguing that vacuity analysis "leads to
better specifications and test suites".

*Why this is the top threat.* Our remedy — *plant a fault; if the guard still passes, the guard
was asserting nothing* — is Beer et al.'s detection procedure, 29 years old. Our object — a check
that passes for reasons unrelated to its apparent subject — is Ball & Kupferman's, 18 years old.
A reviewer from FM or testing will recognise both in the abstract.

*What survives, and it must be stated this way.* Not "we identify a class of guards that pass
vacuously" — that is dead. What survives is:
1. **A taxonomy grounded in mechanism, not logic.** Vacuity theory says a pass can be
   irrelevant; it does not say *which engineering structures reliably produce that* in a working
   system. Three named mechanisms — a gate that compares a generator to its own output, a
   measurement instrument that moves independently of its subject, a surface with no execution
   path — are an empirical contribution the theory does not make.
2. **Field data across four independently authored codebases.** The vacuity literature works on
   specifications and models; ours are shipped tools with users.
3. **The LLM-authored setting**, where the artifact's *reader* is a decoder and the person who
   would have noticed is not in the loop.

Recommended framing, verbatim-ish: *"Ball and Kupferman named vacuous passing for tests, and Beer
et al. gave the mutate-and-recheck remedy we adopt. We contribute the mechanisms by which it
recurs in systems written and read by language models, and evidence that it does."* Anything
vaguer reads as not knowing the field.

### Threat 2 — the measurement-validity literature, for sub-class (B) as now stated

**How much of us this covers: nearly all of it, if (B) is "the ruler moved the number".** This is
why five entries were added; the first pass had no citation for this sub-class at all, which
would have been the most exposed part of the paper.

- **`schaeffer2023mirage`** (Schaeffer, Miranda & Koyejo, NeurIPS 2023 **oral**) — the canonical
  statement that a *metric change alone* produced an apparent capability change with **no change
  in the model**. That is our sub-class (B), argued at the field's most visible venue, three
  years ago. Our `JUDGE_VERSION` v1→v2 story (intent 9%→50%, zero model change) is a small
  instance of exactly their thesis. **Do not present it as a discovery; present it as a
  corroborating instance from a different domain, and cite them in the same sentence.**
- **`zheng2023llmjudge`** — LLM-as-a-judge reliability, biases, and agreement rates. Any claim
  about our judge's authority over the number lands here first.
- **`raji2021everything`** and **`dehghani2021benchmarklottery`** — benchmark construct validity
  and how ranking depends on benchmark/setup choices.
- **`jacobs2021measurement`** — construct validity as a formal frame: an operationalisation can
  fail to measure the construct it names. This is the vocabulary the paper should use for (B),
  and using the field's existing vocabulary is cheaper than minting a phrase.
- Already present and directly on point: **`sahoo2026agentlens`** (the "Lucky Pass" problem —
  an evaluator that is itself a model-accessible tool is a cheating surface) and
  **`khanal2026reliability`** (pass@1 is the wrong statistic for long-horizon agents).

*What survives:* very little as a claim; a lot as discipline. The honest contribution is that we
**pre-committed to non-comparability across a ruler change and enforced it as an iron law in the
codebase**, rather than discovering it retrospectively. That is a process result, and it should
be reported as one. The repo's own rule — *never compare eval rates across a `JUDGE_VERSION` /
`SYNONYMS_VERSION` change; it measures the ruler, not the model* — is publishable as practice,
not as insight.

### Threat 3 — `kiecker2026cascade` (CASCADE, FSE 2026)

**Covers roughly 50% of sub-class (A) — and it is four months old, at a top venue, with a
registered DOI.** Detects code/documentation inconsistencies by generating tests *from the
documentation* and flagging a mismatch only when the existing code fails a test that
documentation-derived code passes. Structurally a mirror of `test/spec-forms.test.ts`.

*What survives:* CASCADE is a post-hoc **detector** over natural-language docs and human-written
code, producing an inconsistency list. Ours is a **build gate** over machine-*generated*,
agent-facing artifacts (a spec, a GBNF grammar, a public type surface), where the gate that was
supposed to catch drift is the thing that failed. Defensible — but only if stated at that level
of precision. Never describe the contribution as "checking that documentation matches code".

### Threat 4 — the documentation–code inconsistency lineage (`tan2007icomment`, `tan2011acomment`, `tan2012tcomment`, `zhong2013docerrors`, `zhou2017directivedefects`)

**Covers the *phenomenon* of sub-class (A) almost completely — call it 60% — and 0% of the
mechanism.** This is the lead's second direct question, so, specifically:

- **@tComment** (Tan, Marinov, Tan & Leavens, ICST 2012) is the sharpest one: it takes Javadoc
  comments about null/exception behaviour, turns them into **executable test assertions**, and
  runs them against the implementation. "Execute the documentation" is theirs, in 2012.
- **DocRef** (Zhong & Su, OOPSLA 2013) cross-checks API documentation text against code and finds
  documentation errors at scale in mature libraries.
- **Zhou et al.** (ICSE 2017) detect *directive defects* — documented constraints the code does
  not honour.
- **iComment / aComment** (SOSP 2007, ICSE 2011) establish the whole programme: comments encode
  checkable assumptions, and those assumptions drift.

*What this literature does not have, and where our claim must live:* all of it targets
**hand-written NL documentation attached to hand-written code**, and the remedy is always *add a
detector*. Our finding is one level up and is about a remedy that is already deployed: **the
artifact is generated, a drift gate exists and is green, and the gate is reflexive — it compares
a generator to its own output, which proves reproducibility and never truth.** The proof that
this is a distinct failure is that two hand-typed generators stayed green while disagreeing with
the parser *and with each other, in different places*. Lead with the reflexive gate. If the paper
leads with "documentation drifts from code", it will be desk-objected with @tComment.

### Threat 5 — `almazrouei2025anka` (arXiv:2512.23214)

Occupies the framing "a DSL designed for an LLM author" eight months early, with a benchmark
claiming 99.9% parse success and a 40-point advantage over Python on multi-step tasks.

*What survives:* our subject is orthogonal (guards inside such a system, not whether such a
system helps a model), and Anka is a single-author preprint — n=100 problems, two small models,
data-transformation pipelines, no compiler, no diagnostics, no determinism contract, no users.
But **"the first DSL designed for an LLM author" is dead on arrival**, and citing Anka is
cheaper than being handed it.

### Threat 6 — the test-adequacy empirics (`inozemtseva2014coverage`, `zhang2015assertions`, `papadakis2019mutationadvances`, `jia2011mutationsurvey`, `petrovic2018googlemutation`, `demillo1978hints`)

Coverage does not predict suite effectiveness; assertion count does; mutation testing is the
standard adequacy measure, deployed at Google scale since 2018.

*The question to have an answer ready for:* "Your planted-fault experiments are mutation
testing. Why is this framed as new, and why did you not run a mutation tool?" Our `frame.ts`
result (27 of 28 planted faults killed, the survivor proven equivalent) is a **mutation score
with an equivalent-mutant analysis** — say so in that vocabulary. And `groce2012swarm` /
`goldstein2021judgecover` are the right citations for the deeper `test/arbitrary-plan.ts`
finding: the *generator* was the defect, producing zero walls or rooms across 5000 samples, so
the property was vacuously satisfied. Generator coverage is a named, studied problem. Using the
field's names here costs nothing and buys credibility for the parts that are genuinely ours.

### Threat 7 — test smells (`vandeursen2001refactoringtest`, `bavota2012testsmells`)

**The weakest of the three the lead named — roughly 20% coverage. Do not over-hedge against
it.** Van Deursen et al. catalogue *maintainability* smells in test code (Assertion Roulette,
Mystery Guest, Eager Test) with refactorings; Assertion Roulette is about *many undocumented*
assertions, not *zero*. Bavota et al. measure their distribution and maintenance impact. Neither
addresses a test that passes having asserted nothing about the system, and neither has a
correctness argument. The genuinely adjacent artifact is engineering practice, not research:
`railsatscale2024assertionless` (failing a test that performed zero assertions). That is worth
one sentence and a footnote, not a paragraph of defensive positioning.

### Runners-up, one line each

- **`treude2026contextrot`** (Treude & Baltes, 2026) — repurposes documentation-consistency
  research for **AI configuration artifacts** (`CLAUDE.md`/`AGENTS.md`-class files) and observes
  that code drift is caught by compilers and tests while documentation drift is not. One step
  from our framing, very recent, easy for a reviewer to have read. Engage it.
- **`planscript_ts` / `planscript_rust`** — third-party, independently authored instances of the
  *first* brief's sub-class (B): PlanScript's `isPolygonClosed` computes the first and last
  points, ignores both, returns `true`, so its `E101` can never fire; PlanScript-Rust declares
  `E420 RoomNoAccess` and `E102 PolygonSelfIntersecting` and raises neither. This is the
  strongest available evidence that the class is not an ArchLang idiosyncrasy. Cite at
  `file:line`, pinned (`paper/experiments/corroboration/`), and concede in the same breath that
  PlanScript shipped a structural mirror of ArchLang's agent surface 5.5 months earlier.
- **`rustc_applicability` / `rustfix` / `biome_linter`** — the machine-applicable-fix protocol is
  wholly prior art (`MachineApplicable` / `MaybeIncorrect` / `HasPlaceholders` / `Unspecified`;
  Biome's safe/unsafe split). Present ours as an instance, and reserve the claim for the
  **fixpoint postcondition** — see gap 5.

---

## 3. UNVERIFIED — do not cite

Searched for and **not** confirmed. **None of these is in `refs.bib`.** If a paper needs one,
someone verifies it first and adds the entry then.

1. **PLaSM as "Paoluzzi et al., 1992, a functional design language for solid modeling of
   architectural design"** (substrate-uniqueness audit §2). No 1992 publication matching that
   description exists in Crossref. Cited instead: Paoluzzi & Sansoni, *A Programming Language
   for Architectural Symbolic Modeling*, eCAADe **1989**; and Paoluzzi, Pascucci & Vicentino,
   *Geometric Programming*, ACM TOG **1995**. **Write "1989/1995", never "1992."**
2. **US patent 7,415,156** (claimed 2008 shape-grammar descendant of the Palladian grammar).
   Never checked against USPTO. Do not cite the number.
3. **SpatialLM at NeurIPS 2025.** `arXiv:2506.07491` carries no venue and no `journal_ref`.
   Cited as a preprint.
4. **FloorplanQA at ICML 2026** — author self-report only; no proceedings record. The entry is
   demoted and says so in its own `note`.
5. **Text2BIM's "~99% rule pass rate"** — the 2026-08-03 audit already flags this widely-quoted
   figure as unverifiable against the paper. Do not repeat it. (The paper itself is now cited
   with its real ASCE record.)
6. **van Deursen et al. "XP 2001, pp. 92–95"** as a page range. The CWI primary record is a
   technical report with no pages; the page range propagates through secondary citations.
   Entry is a `@techreport`; do not add pages back.
7. **The LNCS volume numbers 1254 (CAV'97) and 4966 (TAP 2008)**, and the **issue number of
   Eastman 1975**. All three are probably right and none is in a record I could reach. Removed
   rather than guessed.
8. **"Beatty & Beer et al. on vacuity detection"** as a single work — the phrasing in the task
   brief conflates two unrelated lines. Beer, Ben-David, Eisner & Rodeh (CAV'97 / FMSD'01) is
   the vacuity work. Beatty & Bryant (DAC'94) is *coverage* in simulation-based formal
   verification, an antecedent of the coverage-and-vacuity thread, not a vacuity paper. Both are
   in `refs.bib` under their real subjects. **Do not merge them into one citation.**

---

## 4. Gaps — searched, found no prior work

The strongest positioning input, stated explicitly rather than left implied. **Every one of
these is "we found no prior work naming this", never "no prior work exists"** — and the DBLP
outage (§1) is a real hole in the search.

1. **Generator-output drift under a reflexive gate.** **RETRACTED IN PART, 2026-08-22 — see
   §6.** Non-reflexive validation of a generated, machine-consumed description is mature in
   the API-contract ecosystem (Pact, Schemathesis). What survives is narrower and is stated
   there. The original wording follows for the record; do not cite it. No literature names the situation where a
   drift gate compares a *generator* to its *own output*, thereby proving reproducibility and
   never truth. Nearest neighbours, all cited and none of them this: `kiecker2026cascade`
   (detects code↔doc inconsistency, but the artifacts are hand-written and there is no gate to
   fool), `treude2026contextrot` (AI config artifacts, no generator), `mokhov2020buildsystems`
   (what a build system guarantees — and notably, *correctness of generated content is outside
   its guarantee*), `lamb2022reproducible` (byte-reproducibility as integrity — the same
   confusion at supply-chain scale: reproducible ≠ correct). **This is the cleanest gap and the
   best candidate for the paper's headline mechanism.**
2. **A declared-but-unreachable diagnostic as a defect class.** **RETRACTED IN PART, 2026-08-22 —
   see §5. The first pass said "found nothing"; a harder search found that rustc and clang both
   ship this gate.** The remaining gap is narrower and is stated in §5, not here. Do not cite
   the original wording.
3. **Correctness of grammar artifacts used for constrained decoding.** GAD
   (`park2024gad`), Grammar Prompting (`wang2023grammarprompting`) and JSONSchemaBench
   (`geng2025jsonschemabench`) all study decoding *given* a grammar, and all assume the grammar
   is right. No work I found treats an incorrect grammar artifact as a defect class — which
   matters because a too-permissive grammar makes invalid output *possible by construction*
   while looking like it prevents it. Our GBNF derived eleven forms the parser rejects, and the
   agreement corpus is the remedy. Nothing to cite against us here.
4. **The fixpoint property of machine-applicable fix protocols.** rustc/rustfix, Biome and ESLint
   all apply fixes iteratively under a pass budget. I found no paper, and no documentation in
   those three projects, stating termination or confluence as a required property of a fix. Our
   `W_DIM_INSIDE` 2-cycle — which made `arch fix`'s output depend on the **parity** of its pass
   budget — is a concrete failure of a property nobody appears to have written down. **Small,
   sharp, and defensible.**
5. **Any benchmark measuring architectural soundness** (egress, circulation, clearances) rather
   than execution validity or polygon overlap. Independently re-confirmed here; already recorded
   as falsifier #8 in the 2026-08-03 audit.
6. **Evaluation of an LLM-authored system's self-describing artifacts as a category.** Plenty on
   docs-for-humans, and now `treude2026contextrot` on docs-for-agents, but nothing measuring
   whether a system's machine-facing self-description is *true*.

**One gap I looked for and did NOT find on our side either:** I found no prior work claiming
that reflexive gates are *common*. We have one system's worth of evidence plus three third-party
instances. That supports "this happens and here is the mechanism"; it does not support "this is
widespread". Frequency claims need a corpus study we have not run.

---

## 5. Gap 2, re-searched — **partial retraction**

Requested 2026-08-22 after gap 2 was promoted to a claimed contribution. The first pass's
"no prior work found" was **wrong**, and it was wrong in the most dangerous direction: the
prior art is not in the literature, it is *shipped and enforced in two of the most widely read
compilers in the world*. It was missed because the first pass searched academic databases with
academic vocabulary and never looked at a compiler's own build tooling.

### What kills the strong form of the claim

| Source | What it does | Strength |
|---|---|---|
| **`rustc_tidy_errorcodes`** | rustc's `tidy` check, run in CI. **(1)** extracts the error-code catalogue; **(2)** requires each code to have a long-form explanation containing a doctest that fails with that code; **(3)** requires a UI test in `tests/ui/error-codes/` that *triggers* the code; **(4)** checks the code is **actually emitted by the compiler**, by regex over `compiler/`. Hard-`error`s in **both directions** — a code used but not catalogued, and a catalogued code not found in the source — with explicit, named opt-out lists (`IGNORE_DOCTEST_CHECK`, `IGNORE_UI_TEST_CHECK`). | **Fatal to the strong claim.** This is our bidirectional code↔catalogue test *and more*: stage 3 is execution-based, which our gate is not. |
| **`clang_unused_diagnostics`** | `clang/utils/find-unused-diagnostics.sh` — lists every diagnostic defined in `Diagnostic*.td` and not referenced in `lib/ include/ tools/ utils/`. | Strong. Exactly the detector. But an **advisory script, not a build gate** — nothing fails if you never run it. |
| **`msvc_diagnostic_testing`** | Microsoft C++ team: each of the compiler's ~1,000 warnings and errors has one or more test cases verifying the expected diagnostic *is actually emitted*. | Strong as practice, weak as evidence — a blog post asserting a policy, with no artifact to inspect. |
| **`roslyn_release_tracking`** | Roslyn's `RS2000`–`RS2100` rules force every declared analyzer diagnostic ID into a release-tracking file. | Partial. Tracks the **catalogue**; does **not** check a rule can fire. |
| **`i18n_tasks`, `i18n_unused`** | The i18n ecosystem detects unused and missing message-catalogue keys, bidirectionally, as routine tooling. | The same *shape* on a different artifact — a declared entry nothing can reach. Widely deployed, apparently never formalised. |

**Verdict: "no prior work" is dead. Do not write it, in any of its phrasings.** If the paper
claims novelty for the *idea* of checking that every declared diagnostic can fire, rustc refutes
it in one link, and a Rust-literate reviewer will supply that link from memory.

### What survives, and it is worth keeping

Three things, and they should be claimed in exactly this order and no stronger.

1. **The practice exists only where it was paid for, and nobody has said so.** rustc has all four
   stages; clang has a script nothing runs; Roslyn tracks the catalogue but never asks whether a
   rule fires; MSVC asserts a policy. Below that tier — our subject systems included — the gate
   is simply absent. **That distribution is itself the finding**, and it is an empirical claim we
   can support rather than a conceptual one we cannot.
2. **The measured consequence.** Three independent dead diagnostics across two systems, one of
   which — `E101` — is dead in **both** the TypeScript and Rust ports of the same project, by
   different authors. A defect that survives a cross-language reimplementation is strong evidence
   that hand-maintained catalogues rot by default. No prior work measures this; the practice
   literature simply prevents it in the projects that can afford to.
3. **The generalisation past compilers.** rustc, clang, Roslyn and the i18n tools each solved it
   once, locally, for their own artifact. Nobody has named it as one class spanning error
   catalogues, lint rules, analyzer descriptors and message catalogues — nor connected it to
   vacuity, where it plainly belongs (a declared diagnostic that cannot fire is a guard whose
   pass carries no information, in Ball & Kupferman's sense).

**Recommended framing:** *"Compilers with the resources to do so already enforce diagnostic
catalogue completeness — rustc's `tidy` check is the strongest instance, requiring each code to
be documented, triggered by a test, and emitted by the compiler. It is neither named as a defect
class nor studied, and outside that tier it is absent: we find dead diagnostics in every subject
system that lacks it, including one that survived a cross-language reimplementation."* That is
honest, it cites the threat rather than hiding from it, and it is still a contribution.

### Nearest research neighbours (none is a hit, all are askable)

- **`tang2025certest`** (Tang et al., TSE 2025) — CERTest, "the first mutation-based approach for
  compiler error-recovery diagnostics testing", explicitly targeting **erroneous, spurious,
  missing and crashing** diagnostics in GCC and Clang. **The closest research neighbour**, and
  the one a reviewer is most likely to raise. Distinguish carefully: a *missing* diagnostic there
  is one that should fire for a **given program** and does not; ours is one that cannot fire for
  **any** program. Adjacent, not the same — but say so before a reviewer does.
- **`schumi2021spectest`** (FASE 2021) — specification-based compiler testing with a coverage
  criterion over the *specification*. The same instinct (is every declared thing exercised?)
  applied to language semantics rather than diagnostics.
- **`chen2020compilertesting`** (CSUR 2020) — the field's survey of compiler testing. Organised
  around test-program construction, oracles, execution and debugging. **Diagnostic-catalogue
  coverage does not appear as a category**, which is the cleanest available evidence that the
  research literature has not framed it.
- **`zhang2019compilererrors`** (ESEC/FSE 2019) — which compiler errors developers actually hit
  in CI (the top twenty types cover 95.4%). Useful for the opposite reason: it shows the *usage*
  distribution of a diagnostic catalogue is extremely skewed, which is exactly the condition
  under which a rarely-used code can be dead for years unnoticed. Supporting, not threatening.

### Search terms recorded, so the residual negative claim is auditable

Run against arXiv, Crossref, OpenAlex and general web search on 2026-08-22, plus direct source
inspection of the rust-lang/rust, llvm/llvm-project, microsoft/TypeScript and dotnet/roslyn
repositories.

`unreachable diagnostic` · `unreachable error code` · `dead error code` · `unused error code` ·
`diagnostic coverage` · `error code coverage` · `message catalogue completeness` ·
`message catalog completeness` · `unreachable warning` · `lint rule coverage` ·
`rule never fires` · `unused lint rule` · `compiler diagnostic completeness` ·
`diagnostic testing` · `testing compiler error messages` · `error message testing` ·
`declared but never emitted` · `analyzer diagnostic descriptor unused` ·
`unused translation keys` · `dead message keys` · `unused resource strings` ·
`gettext ICU Fluent unused keys` · plus the compiler-testing survey literature and the four
projects' own engineering practice.

**Two limits on this negative claim.** DBLP was unreachable throughout (§1), so a venue indexed
only there was not searched. And GitHub code search over `microsoft/TypeScript` returned no
usable result through the unauthenticated API, so **TypeScript's practice is unverified in
either direction** — treat it as unknown, not as absent.

---

## 6. Gap 1, attacked in practice — **the strong form is dead**

Requested 2026-08-22 after gap 1 became the headline, using the method that killed gap 2: hunt
engineering practice first, literature second.

**The claim under test:** *no one validates that a generated artifact is CORRECT as opposed to
merely reproducible; the gate people deploy (`regenerate && git diff --exit-code`) compares a
generator to its own output and is structurally incapable of validating content.*

**Verdict: the first half is refuted, twice, independently. The second half is confirmed, and is
where the paper must now live.** Split that sentence — as written it is one claim and half of it
is false.

### What refutes it

| Source | What it does | Why it refutes |
|---|---|---|
| **`pact_contract_testing`** | The contract file is **generated during execution of the consumer tests**, then verified by **executing it against the real provider**. | The most direct refutation available. Generate a machine-consumed description of a system, then run it against that system. That is our remedy — shipped, mainstream, for a decade. |
| **`schemathesis`** | Generates property-based tests from an OpenAPI/GraphQL schema and runs them against a live server. `response_schema_conformance` flags a schema/implementation mismatch **without attributing blame**; the documented remedy is explicitly "update the implementation to match the schema **or** update the schema to match the implementation". | Refutes it in the exact direction we care about: the tooling openly contemplates that **the description is the thing that is wrong**. |
| **`rust_doctests`, `go_testable_examples`, `python_doctest`** | `cargo test` compiles and runs every doc-comment example; a Go `Example`'s captured stdout is compared to its `// Output:` comment; `doctest` executes docstring sessions. | Documentation executed against the implementation, in three major languages, by default. |
| **`rustc_tidy_errorcodes`** (again) | Requires each error code's long-form explanation to contain a **doctest that fails with that code**. | rustc executes a catalogue's documentation against the compiler and asserts the exact diagnostic. That is `test/spec-forms.test.ts`, in the Rust repo, CI-gated. The same artifact took gap 2 and now takes half of gap 1. |
| **`protobuf_conformance`** | A shared executable suite testing an implementation's completeness against the specification; `protoc-gen-validate` generates test cases and runs them against each language's harness to verify **generated** validation semantics. | Answers sub-question 2 directly: the protobuf world is **not** purely codegen plus reproducibility. |

**On the proposed distinction — "those execute *hand-written* docs, whereas ours is *generated*
and a reflexive gate already exists and is green":** it is real but **thinner than hoped, and it
will not carry a contribution alone.** Pact's contract is generated, not hand-written. Rust can
pull a generated `README.md` into the doctest suite via `#[doc = include_str!(...)]`, so a
generate-then-execute path exists there too. Do not make generated-vs-hand-written the
load-bearing distinction.

### What is confirmed, and what survives

The reflexive gate is exactly as ubiquitous as we said, and it now has names:
`go generate ./... && git diff --exit-code` (the canonical Go CI pattern), Makefile
`check-proto` targets, **`bazel_gazelle`** `-mode=diff`, **`api_extractor`** (a production build
regenerates `.api.md` and fails on any difference from the committed copy), `terraform fmt
-check`, `cargo readme --check`. Adjacent, and also not content validation:
**`buf_breaking`** and **`cargo_semver_checks`** compare an artifact against a **past version of
itself**.

**The finding that changes the paper — and it is better than what we had.** Every one of those
reflexive gates guards an artifact that is **mechanically derived** from its subject: API
Extractor reads the TypeScript compiler's own symbol table; gazelle reads real Go imports;
protoc reads the `.proto`; `cargo-semver-checks` reads rustdoc JSON. **A derived artifact cannot
be *wrong* about its subject — only stale.** For derived artifacts the reflexive gate is
therefore *sufficient*, which is precisely why nobody has ever needed to name its limitation.

Our generators were not derived. They were **hand-typed templates that retyped language facts**,
wearing the same gate the ecosystem uses for derived artifacts. The gate is sound for one case
and vacuous for the other, **it does not check which case it is in, and it looks identical in CI
either way.** The empirical proof stands undamaged and is now sharper: two hand-typed
generators, same gate, both green, disagreeing with the parser *and with each other, in
different places*.

Note also where the fix landed. The remedy the project adopted — derive the eight closed value
sets once and interpolate them into every description, with `assertVocabRendered` failing on a
value that has no rendering — **is the invariant the derived-artifact ecosystem already relies
on.** We converged on it after being burned by violating it. That is a finding, not an
embarrassment: *the invariant is universal in practice, stated nowhere, and unenforced by the
gate that is supposed to protect it.*

### The gap-1 framing to use (the equivalent of the surviving gap-2 shape)

> Non-reflexive validation of a machine-consumed description is mature in exactly one place: the
> API-contract ecosystem, where the description has an executable counterpart to run against —
> Pact verifies a generated contract against a live provider, and Schemathesis executes a schema
> against a running server and reports divergence without deciding which side is wrong.
> Everywhere else, generated artifacts carry a **reflexive** gate. That gate is sound, but only
> because those artifacts are mechanically derived and can therefore be stale but not wrong. It
> does not check that precondition and cannot distinguish the two cases. We measure what a
> hand-typed generator under a reflexive gate costs, in an artifact class whose consumer is a
> decoder.

A defensible second contribution, stated as **transfer rather than invention**: contract testing
applied to a language's own self-description — execute the documented forms against the parser
(`spec-forms`), run the grammar as a recognizer against the compiler and take the expected
verdict from the compiler on every run (`gbnf-drift`). Say "this is Pact's discipline, for an
artifact class that has never had it", cite Pact and Schemathesis in that same sentence, and the
transfer is defensible where an invention claim would not be.

### Answers to the six sub-questions

1. **OpenAPI/AsyncAPI contract testing** — occupies the remedy. Honest read, not reassurance:
   this was the biggest single threat and it lands. Cite it, concede it, transfer from it.
2. **protobuf/gRPC/Thrift** — not purely codegen plus reproducibility. `protobuf_conformance` and
   `protoc-gen-validate`'s generated-and-executed harness do test generated semantics.
   `buf breaking` is version-to-version, not content validation.
3. **`cargo semver-checks` / API Extractor / japicmp** — all diff a **derived** description
   against a **previous self**. None validates a description against the API. API Extractor is
   the cleanest reflexive-gate exemplar available; use it as the paper's canonical example rather
   than a generic `go generate` line.
4. **JSON Schema / Zod / Pydantic / TypeSpec / Smithy** — derivation, not validation. Pydantic
   explicitly "does nothing to validate JSON schema whatsoever". **TypeSpec and Smithy remain
   unverified** — searches returned nothing specific; treat as unknown, not absent.
5. **`go generate`, protoc CI, gazelle, `terraform fmt -check`, `make check-generated`** —
   **uniformly reflexive** across everything sampled, with no counterexample found. But this was
   opportunistic sampling, not a corpus study; only the ecosystem scan in
   `paper/experiments/ecosystem/` would license the word "uniformly" in the paper.
6. **Doctest ecosystems** — they do execute documentation against the implementation, and the
   generated-vs-hand-written distinction is weaker than hoped. What still separates us is the
   *artifact*: a doctest example is executable **by construction**, because it is code. A GBNF
   grammar, a spec prose page and an `llms.txt` are not code, have no natural harness, and that —
   not authorship — is why nobody executes them.

### Search terms recorded

`regenerate and diff generated files CI` · `git diff --exit-code generated` · `go generate CI
check` · `make check-generated` · `check-proto` · `gazelle -mode=diff` · `terraform fmt -check` ·
`openapi drift check committed spec` · `contract testing generated contract verified against
provider` · `consumer-driven contract testing` · `schemathesis response_schema_conformance` ·
`spec implementation divergence which is wrong` · `buf breaking generated stub semantics` ·
`protobuf conformance tests generated code correctness` · `cargo semver-checks rustdoc JSON
baseline` · `API Extractor .api.md CI baseline` · `japicmp api-diff` · `Pydantic Zod TypeSpec
Smithy generated schema validated against code` · `schema drift generated schema correctness` ·
`rust doctests execute documentation` · `cargo readme --check` · `Go testable examples output` ·
`Python doctest` · `mdBook test`.

**Holes in this sweep, stated rather than papered over.** DBLP remained unreachable. GitHub code
search over the unauthenticated API returned nothing usable, so CI configurations could not be
sampled at scale — every "uniformly reflexive" observation here rests on documentation and a
handful of repositories, not a corpus. TypeSpec and Smithy are unverified in either direction.
And this searched the ecosystems named in the brief; ones nobody named — Nix, Gradle, .NET source
generators, Kubernetes CRD codegen — were not searched at all.

---

## 7. The last hole in "uniformly reflexive" — four ecosystems, one real counterexample

Requested 2026-08-22. The four ecosystems named as unsearched: **Nix**, **Gradle**, **.NET
source generators**, **Kubernetes CRD codegen** (`controller-gen`/`kubebuilder`, `client-gen`,
`deepcopy-gen`). One question each: does the project validate its generated artifact against its
**subject**, or only against its **previous self**?

### Result: no counterexample for generated descriptions; one real counterexample for generated code

| Ecosystem | Artifact | Gate | Verdict |
|---|---|---|---|
| **Kubernetes CRDs** (`kubebuilder_crd`) | CRD YAML derived from marker comments on Go types | `make manifests` then regenerate-and-diff in CI | **Reflexive, artifact derived.** Confirms. |
| **Kubernetes conversion/deepcopy** (`k8s_roundtrip`) | generated Go conversion and `DeepCopy` functions | `apitesting/roundtrip` **fuzzes values and round-trips them through the generated code**; a conversion that dropped data fails | **COUNTEREXAMPLE — semantic, non-reflexive validation of a generated artifact.** |
| **Gradle / Kotlin** (`kotlin_bcv`) | `.api` dump of the public ABI, written by `apiDump` | `apiCheck` fails the build when the current API no longer matches the committed dump | **Reflexive, artifact derived.** Same shape as API Extractor. Confirms. |
| **.NET source generators** (`roslyn_sourcegen_testing`) | generated C# source | snapshot testing against a committed snapshot, **justified explicitly by the generator being deterministic for a given input** | **Reflexive, and the rationale is stated outright.** Confirms, and is the most quotable instance. |
| **Nix** (`nixos_reproducible`, `crate2nix`) | `Cargo.nix` etc., derived via `cargo metadata`; and builds themselves | regenerate-and-diff for the expressions; `nix build --rebuild` for byte-identical rebuilds | **Reflexive, artifact derived** — and Nix is explicit that reproducibility is not correctness. Confirms. |

**The counterexample is the useful kind, and it does not break the thesis — it sharpens it.**
Kubernetes validates its generated *conversion and deepcopy code* semantically, by fuzzing real
values through it and checking nothing is dropped or corrupted. That is exactly what nobody does
for a generated *description*. And the reason is the dividing line the outline already adopted:
**generated code has an executable counterpart by construction — you can run it — and a GBNF
grammar, a spec page and an `llms.txt` do not.** Report this counterexample prominently. It is
the strongest available evidence *for* the executable-counterpart line, precisely because it was
found while trying to refute it.

Note also the .NET rationale, which is the closest anyone comes to stating our precondition out
loud: snapshot testing is recommended *because* generator output is deterministic for a given
input. That is the reflexive gate defended on determinism grounds — the exact conflation the
paper is about — written down in the Roslyn docs. Quote it.

### The threat I went looking for, and what it costs us

I searched specifically for anyone stating the derived/retyped precondition — "this gate only
works because the artifact is derived" — because that sentence would cost the thesis.

**Not found in that form. But something adjacent is 27 years old and must be cited:**

**`hunt1999pragmatic` — the DRY principle.** *"Every piece of knowledge must have a single,
unambiguous, authoritative representation within a system."* That **is** derive-never-retype,
named, famous, and the remedy we converged on. Practitioner writing states the positive half
plainly too — generated code is "derived output, not the source of truth", and drift detection
works "precisely because it compares generated code against a canonical specification."

**What this costs:** the *remedy* is not ours and must be conceded in the sentence that
introduces it. Our `assertVocabRendered` fix is DRY applied to a language's self-descriptions,
not a new principle.

**What survives, stated exactly:** DRY says what you should do. Nobody states the **failure mode
of the gate when DRY is violated** — that `regenerate && git diff --exit-code` is *vacuous* for a
retyped generator, that it cannot detect the violation, and that it looks identical in CI either
way. DRY is a design rule with no enforcement story; the gate is an enforcement mechanism whose
soundness silently depends on that rule and never checks it. **That junction is the sliver, and
it is still empty.** It is narrow. It is also exactly what our two-generators-both-green result
demonstrates, which is why the paper is empirical.

### Search terms recorded

`single source of truth code generation derived not hand-written` · `DRY every piece of knowledge
single unambiguous authoritative representation` · `why drift check works canonical
specification` · `kubebuilder controller-gen make manifests git diff --exit-code` · `deepcopy-gen
conversion roundtrip fuzz generated code correctness` · `apimachinery apitesting roundtrip` ·
`client-gen generated client verified` · `Kotlin binary-compatibility-validator apiDump apiCheck`
· `Gradle verification metadata` · `Roslyn source generator snapshot testing Verify` ·
`EmitCompilerGeneratedFiles CI diff` · `nix build --rebuild reproducibility not correctness` ·
`crate2nix node2nix gomod2nix regenerate CI diff` · `Nix validate generated expression against
upstream manifest` · `fixed-output derivation outputHash`.

**Holes, again stated rather than papered over.** DBLP still unreachable. GitHub code search still
unusable through the unauthenticated API, so this remains documentation-and-repository reading
rather than a corpus study — **the word "uniformly" is still not licensed by evidence**, and only
`paper/experiments/ecosystem/` can license it. Within Kubernetes I checked `controller-gen` and
the conversion/deepcopy round-trip harness but did **not** separately verify `client-gen` or
`lister-gen`. Gradle's own build (as opposed to Kotlin's ABI validator) was not examined.

---

## 8. The concession paragraph, written

Drop-in text for the top of the paper. Ordered so each concession sets up the next, ending on
what is left. Written to read as command of the field.

> Almost every component of what follows is someone else's. A guard that passes without its
> passing depending on what it appears to check is *vacuous satisfaction*, carried from model
> checking into testing by Ball and Kupferman~\cite{ball2008vacuitytesting}; the remedy we
> use — perturb the thing under test and require the guard to notice — is Beer et al.'s vacuity
> detection procedure, published in 1997~\cite{beer1997vacuity}. Executing documentation against
> the implementation it describes is older than it looks: \texttt{@tComment} turned Javadoc into runnable
> assertions in 2012~\cite{tan2012tcomment}, CASCADE now generates tests directly from
> documentation~\cite{kiecker2026cascade}, and Rust, Go and Python all run their doc examples by
> default~\cite{rust_doctests,go_testable_examples,python_doctest}. Requiring that a tool's
> declared diagnostics can actually fire is shipped and CI-enforced: rustc's \texttt{tidy} check demands
> that every error code be documented, triggered by a test, and emitted by the
> compiler~\cite{rustc_tidy_errorcodes}. Validating a machine-consumed *description* against the
> system it describes is a decade-old industry practice — Pact generates a contract during
> consumer tests and verifies it by executing it against the real provider~\cite{pact_contract_testing},
> and Schemathesis runs a schema against a live server and reports divergence without deciding
> which side is wrong~\cite{schemathesis}. Even the remedy we converged on has a name: deriving a
> fact once instead of retyping it is DRY~\cite{hunt1999pragmatic}. We claim none of it.
>
> What is left is a precondition and a measurement. The gate that projects actually deploy over
> generated artifacts — regenerate, then fail on a diff against the committed copy — is
> *reflexive*: it compares a generator to its own output. It is nonetheless sound wherever it is
> deployed, because the artifacts it guards are **mechanically derived** from their subject and a
> derived artifact can be stale but never wrong. That precondition is never stated and never
> checked. When a generator *retypes* a fact instead of deriving it, the same gate is vacuous,
> and it looks identical in CI. We report what that costs in the one artifact class where no
> executable counterpart exists to fall back on — the specifications, grammars and context files
> that describe a system to a language model — and we report it as measurement, not as
> definition.
