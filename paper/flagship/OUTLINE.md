# Flagship — argument outline

Written after the prior-art audit (`paper/refs-notes.md`), which substantially narrowed what
can be claimed. Read that file before writing a sentence. This outline is the frame the
drafting must follow; `main.tex` is scaffolded to match.

## The strategic realisation (2026-08-22, after two contributions were cut)

Two rounds of prior-art hunting have now eaten a conceptual claim each. Vacuity
(`ball2008vacuitytesting`, and Beer et al. CAV'97 whose remedy *is* our planted-fault
remedy, 29 years early) took the first. rustc's `src/tools/tidy/src/error_codes.rs` —
which requires every declared code to be documented, triggered by a test, **and actually
emitted by the compiler**, checked bidirectionally — took the second.

The pattern is now unmistakable and should be treated as a design constraint, not a
setback:

> **Every conceptual claim we have made has been eaten by prior art. Every
> measurement claim has survived — because nobody has measured this artifact class.**

So the paper is an **empirical paper**, not a conceptual one. It does not say "we identify
a class"; it says "here is what this class costs, measured, in a place nobody has looked."
This is also the better fit for ICSE NIER, which asks for promising initial *results*.

Three consequences for drafting:

1. **Never open a section with a definition.** Open with a measurement and a denominator.
2. **Concede the concept in the first paragraph that uses it**, with the citation, and move
   immediately to what we measured. A conceded concept cannot be used against us; a claimed
   one can.
3. **Every claim must survive the "and someone already shipped this" test**, run against
   engineering practice and not only the literature. That is the method that killed gap 2,
   and it is now applied pre-emptively — see the gap-1 sweep of OpenAPI contract testing,
   protobuf CI, `cargo semver-checks` and doctest ecosystems.

~~The fallback, if the gap-1 sweep also lands: the headline becomes a distribution claim of
the same shape as the surviving gap-2 framing — non-reflexive validation of a
machine-consumed description exists in the API-contract ecosystem and essentially nowhere
else.~~

**SUPERSEDED 2026-08-22 — the sweep landed, and this paragraph is now wrong in a way worth
leaving visible.** "Essentially nowhere else" is false: doctests in Rust, Go and Python, and
protobuf conformance suites, are widespread non-reflexive validation. The dividing line is
not the API-contract ecosystem, it is **whether the description has an executable
counterpart** — see the rev. 3 thesis below, which is the live text.

Struck rather than deleted on purpose. A stale description of the state of knowledge sat
directly above its own correction in this file, with nothing marking which was which, and it
was caught by a reader rather than by me. That is the paper's subject, occurring in the
paper's own planning document. Left in place as an example, not as an apology.

## The one-sentence thesis (rev. 3, after the gap-1 sweep — this is the real one)

**A reflexive gate is sound for a *derived* artifact and vacuous for a *retyped* one, it
does not check which case it is in, and it looks identical in CI either way.**

This is sharper than the "reproducible is not correct" framing it replaces, and it survives
the sweep that killed the earlier version. The sweep's finding, which is the paper's centre:

> Every reflexive gate in the ecosystem — API Extractor regenerating `.api.md` and failing a
> production build on any difference, `gazelle -mode=diff`, `protoc` + `git diff
> --exit-code`, `terraform fmt -check`, `cargo readme --check` — guards an artifact that is
> **mechanically derived** from its subject. API Extractor reads the TypeScript compiler's
> own symbol table; gazelle reads real Go imports; `cargo-semver-checks` reads rustdoc JSON.
> **A derived artifact cannot be wrong about its subject — only stale.** For derived
> artifacts the reflexive gate is therefore *sufficient*, which is exactly why its limitation
> has never needed naming.

Our generators were **not** derived. They were hand-typed templates that *retyped* language
facts, wearing the gate the ecosystem built for derived artifacts. The empirical proof is
undamaged and now has a mechanism behind it: **two hand-typed generators, the same gate, both
green, disagreeing with the parser *and with each other*, in different places.**

And the remedy we converged on — deriving eight closed value sets once and interpolating them,
with `assertVocabRendered` failing on an unrendered value — **is the invariant the
derived-artifact ecosystem already relies on**. We arrived at it after violating it. That is
the finding, not an embarrassment: *the invariant is universal in practice, stated nowhere,
and unenforced by the very gate meant to protect it.*

### The second line, which replaces "generated vs hand-written"

Do not make authorship load-bearing — Pact's contract is *generated*, and Rust can pull a
generated README into its doctest suite. The real dividing line is **whether the description
has an executable counterpart**:

| | has an executable counterpart | has none |
|---|---|---|
| examples | OpenAPI + a live server (Schemathesis), a Pact contract + a real provider, a doctest (which is executable *by construction*, because it is code), protobuf conformance suites | a GBNF grammar, a spec page, `llms.txt`, an `AGENTS.md`, a vendored MCP resource |
| validation | mature, mainstream, a decade old | **absent** |

The LLM-facing artifact class sits entirely in the right-hand column. That, not authorship
and not novelty, is what the paper measures.

### The remedy is DRY, and that must be conceded in the sentence that introduces it

Hunt & Thomas, *The Pragmatic Programmer*, **1999**: *"Every piece of knowledge must have a
single, unambiguous, authoritative representation within a system."* That **is**
derive-never-retype, named and famous, twenty-seven years old. `assertVocabRendered` is DRY
applied to a language's self-descriptions — not a new principle, and claiming it as one would
be the cheapest possible refutation.

**What survives is the junction, and it is narrow.** DRY says what you should do. Nobody
states the *failure mode of the gate when DRY is violated*: that regenerate-and-diff is
vacuous for a retyped generator, that it cannot detect the violation, and that it looks
identical in CI either way. **DRY is a design rule with no enforcement story; the reflexive
gate is an enforcement mechanism whose soundness silently depends on that rule and never
checks it.** That junction is empty, and it is exactly what two-generators-both-green
demonstrates — which is why this paper is empirical rather than conceptual.

### The sweep's two best pieces of evidence

**The quotable confirmation.** .NET source generators are validated by snapshot testing
against a committed snapshot, and the Roslyn documentation justifies that **explicitly on the
grounds that generator output is deterministic for a given input**. That is the reflexive gate
defended on determinism grounds — the precise conflation this paper is about — written down in
Microsoft's own documentation. Lead the evidence section with it. (Kubernetes `controller-gen`,
Gradle/Kotlin `binary-compatibility-validator` and Nix's `--rebuild` all confirm the same
shape; Nix is notable for being explicit that reproducibility is not correctness.)

**The counterexample, which supports us.** Kubernetes `apimachinery/pkg/api/apitesting/roundtrip`
**fuzzes real values** through the generated conversion and DeepCopy code, so a conversion that
drops or corrupts data fails. That is semantic, non-reflexive validation of a generated
artifact — and it was found while *trying to refute* the executable-counterpart line, which is
why it is worth reporting prominently. It does not damage the line; it is the strongest
evidence for it. **Generated *code* gets fuzzed because you can run it. A GBNF grammar, a spec
page and an `llms.txt` cannot be run, and get nothing.** Say where it was found and why we
went looking.

### What is conceded, in the first paragraph that uses it

- **Non-reflexive validation of a machine-consumed description is not ours.** Pact generates
  a contract during consumer tests and verifies it by *executing* it against the real
  provider — our remedy, shipped and mainstream for a decade. Schemathesis executes a schema
  against a running server and reports divergence **without attributing blame**, its
  documented remedy being "update the implementation to match the schema *or* the schema to
  match the implementation" — the tooling openly contemplates that the *description* is the
  wrong one.
- **rustc's tidy check** requires each error code's explanation to contain a doctest that
  fails *with that code*. That is `spec-forms.test.ts`, in the Rust repo, CI-gated. That one
  file has now taken gap 2 and half of gap 1; cite it early and directly.
- Contribution 2 is therefore stated as **transfer, not invention**: *this is Pact's
  discipline, applied to an artifact class that has never had it.* Cite Pact and Schemathesis
  in that same sentence.

## Why this framing and not the one we started with

We began with "guards that pass without asserting what they appear to assert." That object is
already defined, precisely, by Ball & Kupferman (`ball2008vacuitytesting`, TAP 2008), who carry
vacuity from model checking into testing and state the remedy we would have proposed. Claiming
the concept would be refuted in one citation. The doc–code inconsistency lineage
(`tan2007icomment`, `tan2012tcomment`, `zhong2013docerrors`, `zhou2017directivedefects`) is
nineteen years old, and CASCADE (`kiecker2026cascade`, FSE 2026) generates tests *from*
documentation four months ahead of our `spec-forms` suite.

So the concept is not ours. **The mechanism, the artifact class, and the measurement are.**

## The mechanism — the paper's core, and the cleanest gap

A drift gate of the shape `regenerate && git diff --exit-code` — deployed almost everywhere
code generation is: protobuf, OpenAPI, `go generate`, and all nine of this project's
generators — compares a generator to **its own output**. It therefore establishes that the
generator is *deterministic*. It cannot, even in principle, establish that what the generator
emits is *true*.

This is not a subtle point once stated, and the literature already says the two halves
separately without joining them:

- Build-system theory places the correctness of generated *content* outside what a build
  system guarantees (`mokhov2020buildsystems`).
- The reproducible-builds programme adopts byte-reproducibility explicitly as an **integrity**
  property, not a correctness one (`lamb2022reproducible`) — the same conflation, at
  supply-chain scale.

Nobody appears to have named the practical consequence: a reflexive gate is routinely
*deployed as if* it validated content. Our proof that it does not is empirical and clean —
**two hand-typed generators had the same language forms right and wrong in different places
while both gates stayed green.** A gate that both generators pass, and that disagrees with
each of them about different things, is validating neither.

## The artifact class — why the consequence changed

The doc–code literature targets prose read by a human, where a stale comment misleads a reader
who can notice. Our artifact class is different in kind:

| | classical | this class |
|---|---|---|
| consumer | human reader | generative model |
| failure | misleads, reader may catch it | makes invalid output possible *by construction* |
| example | stale Javadoc | a GBNF grammar deriving 11 forms the parser rejects |

A constrained-decoding grammar exists for exactly one purpose: to make syntactically invalid
output impossible. One that over-derives has inverted its own function while continuing to
look like it is performing it. Nothing in the constrained-decoding literature
(`park2024gad`, `wang2023grammarprompting`, `geng2025jsonschemabench`) treats an incorrect
grammar artifact as a defect class — all of it studies decoding *given* a grammar, and assumes
the grammar is right. `treude2026contextrot` is the nearest neighbour (AI config artifacts),
and it has no generator and no gate.

## Which sub-classes the paper CLAIMS — decided 2026-08-22

The sub-class list drifted between two briefings (itself worth noticing), and the two readings
have completely different prior art. The paper carries **two claimed contributions**, both
occupying gaps in `refs-notes.md` §4, and demotes the other two to corroboration stated in
their owners' vocabulary:

| | status | why |
|---|---|---|
| **Reflexive-gate drift** | **CLAIMED — headline** | Gap 1. The doc–code lineage covers the *phenomenon* (~60%) and **0% of the mechanism**. Lead with the gate, never with "documentation drifts from code" — the latter is answered with `tan2012tcomment`, which turned Javadoc into executable assertions in 2012. |
| **Declared-but-unreachable diagnostics** | **CLAIMED — second** | Gap 2. No prior work found. Dead-code analysis studies *statements*; the completeness of a tool's own declared diagnostic vocabulary appears unstudied. Three independent instances, one of them surviving a cross-language reimplementation. |
| A ruler that moves the number | corroboration only | Schaeffer et al., *Are Emergent Abilities a Mirage?* (NeurIPS 2023 **oral**) is the canonical statement that a metric change alone produces an apparent capability change with no model change. Our judge story is a small instance of their thesis. Present it as such. What survives is a **process** result: non-comparability across a ruler change was pre-committed as an iron law and enforced mechanically, not discovered retrospectively. Use Jacobs & Wallach's construct-validity vocabulary rather than minting a phrase. |
| Guards that never execute | corroboration only | Ball & Kupferman own the concept; Beer et al. (CAV'97) detect vacuous satisfaction by **mutating a subformula and re-checking**, which *is* our planted-fault remedy, 29 years early. State our results as a mutation score with equivalent-mutant analysis, in that vocabulary. `groce2012swarm` / `goldstein2021judgecover` are the right cites for the `fc.string()` finding — the *generator* was the defect, which is generator coverage, a named and studied problem. |

Consequence for the NIER cut: at 4 pages it carries the mechanism, the second class, the field
data, and the remedy. The two demoted items appear as a single paragraph of corroboration each,
or not at all.

## The evidence, in three tiers

1. **One system, in depth** (ArchLang). Four self-descriptions, all wrong on first check;
   downstream measured at 11 of 18 generations failing; GBNF agreement 49/73 for the last
   published pre-fix grammar versus 73/73 after. Plus the two adjacent classes the same
   project shipped: rulers that move the number without the subject changing (judge v1→v2,
   9%→50%, zero model change, with a *pre-registered* prediction that was confirmed), and
   guards that never executed.
2. **Four independent codebases, re-verified first-hand at pinned commits**, four of six by
   execution rather than by grep — deliberately, since the paper argues that reading a surface
   is not verifying it. Strongest single result: `E101` is dead in *both* the TypeScript and
   Rust ports of the same project, by different authors — the defect survived a cross-language
   reimplementation. Dead-code sets overlap but differ (4 vs 3), which is what one would
   predict if each catalogue were maintained by hand rather than derived: **a confirmed
   prediction, not merely an observation.** One clean counterexample (ifc-lite's 11 MCP error
   codes are all live), which is what makes the claim falsifiable.
3. **Ecosystem scale** (`paper/experiments/ecosystem/`). Required, because the audit is
   explicit that our evidence supports *"this happens and here is the mechanism"* and does
   **not** support *"this is widespread"* — a frequency claim needs a corpus study. If the
   scan returns a weak or null result, that is reported as the result and the frequency claim
   is dropped, not softened.

## Secondary contributions, each occupying a named gap

- **A declared-but-unreachable diagnostic as a defect class.** No prior work found. Unreachable-code
  analysis studies *statements*; the completeness of a tool's own declared diagnostic
  vocabulary appears unstudied. Three independent instances; remedy is a bidirectional
  code↔catalogue test.
- **The fixpoint property of machine-applicable fix protocols.** rustc/rustfix, Biome and
  ESLint all apply fixes iteratively under a pass budget; none states termination or
  confluence as required. Our `W_DIM_INSIDE` 2-cycle made `arch fix`'s output depend on the
  **parity** of its pass budget. Small, sharp, defensible.
- **Generator coverage as the root of a vacuous property test.** The flagship determinism
  property fed `fc.string()` into a plan body and produced zero geometry across 5000 samples.
  Use the existing vocabulary (`groce2012swarm`, `goldstein2021judgecover`) rather than
  inventing one.

## Self-application, and the honest anecdote

Every structural number in this paper is interpolated from the compiler's own tables and
drift-gated; the page-limit checker was proven non-vacuous with a planted overrun. Both were
built for this paper — and while building them, **three green-and-vacuous guards appeared in
the paper's own toolchain within a day**: a page counter that reported a one-page paper as 47
pages and would have passed any limit; a citation check that tectonic's swallowed BibTeX
warning let through silently; and a fault injector whose planted `\cite` lost its backslash in
transit, so the non-vacuity proof itself proved nothing until the bytes were checked.

That belongs in the paper, stated plainly. It is the strongest available evidence that the
failure mode is *ordinary* rather than a story about one careless project — and it was
produced by the person arguing against it, while arguing against it.

## What the paper must not claim

See `paper/README.md` for the full list. The three most likely to creep back in under
paraphrase:

1. That we discovered vacuous guards. Ball & Kupferman, 2008.
2. That reflexive gates are *common*. We have no frequency evidence until the ecosystem scan
   lands, and if it comes back null we say so.
3. That a diagnostic feedback loop helps a model, or that it does not. Permanently out of
   bounds in both directions.
