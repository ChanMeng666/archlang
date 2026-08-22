# Self-description drift in LLM-facing packages: an ecosystem measurement

**Frame.** Every server listed on the official Model Context Protocol registry
(`registry.modelcontextprotocol.io`) that distributes an npm package.
**Enumerated 2026-08-22T00:36:08Z**: 24,131 server entries over 242 pages.
**Metric 1 is a CENSUS** of all 7,272 unique npm packages in that frame — not a sample, so it
carries no sampling error. Metric 2 *is* a sample (n=600, seeded) and carries sampling error.
**Harness:** `scan.mjs` (zero dependencies; `--help` documents every stage).
**Dataset:** `results-2026-08-22.json` (10 MB, one record per package).
**Checkable:** `node verify-findings.mjs` recomputes every headline figure from the dataset and
asserts thirteen internal identities; it exits non-zero on any failure and currently exits 0.

| | Question | Headline | Upper bound |
|---|---|---|---|
| **M1** | Does the version a server states at handshake match the version it actually is? | **41.1% corroborated as left behind**, plus a disjoint 9.8% never correct at any release | 55.0% incl. uncorroborated |
| **M2** | Does a resource vendored into the tarball still match the project's own source? | **4.1% verified** | 14.6% raw |
| **M3** | Do the registry entry and the dependency graph resolve to what the baked copies describe? | 29.1% of registry entries behind npm; 95.8% of SDK ranges open | — |

---

## 1. What is being measured, and why this artifact class

An MCP server is a package whose *purpose* is to describe itself to a language model. It states a
name and a version to the host at handshake time; it ships documentation, schemas, tool descriptions
and sometimes grammars that a model reads in order to use it. Those descriptions are typed by hand
into the code, or baked into the tarball at pack time, and then **nothing compares them to the thing
they describe**. The package's tests pass, its CI is green, and the registry keeps serving the stale
copy to every host that installs it.

The *concept* of this failure is not new — vacuous guards (Ball & Kupferman, TAP 2008) and
documentation-code inconsistency detection are both established literatures. What is new is the
**artifact class**: machine-consumed self-descriptions shipped to LLMs, where the reader is a model
that cannot notice the description is wrong. This study measures how often that class fails in the
wild.

---

## 2. Methodology and denominators at every stage

Nothing below is a rate without its denominator. Each row is the population the next row filters.
The two funnels are reported separately because M1 is a census and M2 is a sample.

### 2.1 From the registry to a readable tarball

| Stage | Count | What falls out here, and why |
|---|---:|---|
| Server entries enumerated (latest version of each) | 24,131 | `version=latest`, 242 pages of `/v0/servers` |
| ... declaring at least one npm package | 7,501 | the rest are remote-only (HTTP endpoints), PyPI, or OCI |
| **Unique npm packages** | **7,272** | one row per package name; where several servers name the same package, the newest declared version is kept |
| ... resolvable on the npm registry | 7,240 | 32 registry entries name a package npm does not serve (unpublished or removed) |
| ... registry-declared version actually published | 7,180 | a further 60 name a *version* npm does not have; for these the harness falls back to `latest` and records the fallback |
| ... tarball downloaded | 7,188 | 13 skipped for exceeding 40 MB; **zero network failures** |
| ... tarball read successfully | 7,187 | 1 tar/gzip parse failure (`sanctionwise`) |

### 2.2 From a tarball to a Metric-1 verdict

| Stage | Count | What falls out here, and why |
|---|---:|---|
| Tarballs read | 7,187 | |
| ... containing any scannable code file | 7,153 | **34** ship no `.js`/`.ts` at all (wrapper packages, docs-only) |
| ... where a server handshake site was located | **5,882** | **1,271** have code but no identifiable handshake — overwhelmingly heavily minified bundles where the SDK constructor has been renamed and the `{name, version}` object restructured past recognition. This is the detection ceiling, discussed in §7. |
| &nbsp;&nbsp;of which Tier A — a real `new Server(...)` / `new McpServer(...)` | 5,601 | high confidence: the constructor is named in the source |
| &nbsp;&nbsp;of which Tier B — the `{name, version}` `Implementation` shape with no visible constructor | 281 | medium confidence: used only when Tier A finds nothing in the whole package; guarded against clients, inlined dependency manifests, and serialised `package.json` writes (§4) |
| ... where the version is a **hardcoded literal** — *can drift* | 4,527 (89.6%) | |
| ... where the version is **derived at runtime** — *cannot drift* | 525 (10.4%) | read from `package.json`, `import.meta`, `process.env`, or a `createRequire` load |
| ... where the version expression could not be settled — **EXCLUDED** | **830** | e.g. `opts.version`, `config.serverVersion` — a value supplied by a caller or a config object that static reading cannot resolve. Excluded rather than guessed, in either direction. |
| **APPLICABLE** (literal + derived: we can tell whether it drifts) | **5,052** | |

The `derived` / `literal` split is the cleanest single fact in the dataset: **of the packages whose
self-reported identity can be resolved statically, 89.6% retype it and 10.4% derive it.** A derived
version cannot be wrong; a retyped one can, and mostly is.

### 2.3 Metric 2's funnel (a sample, not a census)

| Stage | Count |
|---|---:|
| Packages with a parseable GitHub repository in `package.json` | 6,403 |
| **Sampled** — uniform without replacement, mulberry32, `--m2-seed=20260822` | **600** |
| ... repository reachable (`git ls-remote --tags`) | 530 |
| ... a tag matching the published version exists | 269 |
| ... snapshot downloaded and comparable | **267** |
| Comparable text files present in both tarball and repo snapshot | 1,344 |

Only 44.5% of the sample could be compared at all: 70 repositories are private or deleted, and 261
projects publish releases without tagging them. This attrition is Metric 2's main limitation.

---

## 3. Metric 1 — the handshake version (census, n = 7,272)

### 3.1 Headline

**2,075 of 5,052 applicable packages — 41.1% (95% CI 39.7–42.4) — state a handshake version that
once tracked the package and has since been left behind**, corroborated case-by-case against the
package's own release history.

**2,777 of 5,052 — 55.0% (95% CI 53.6–56.3) — is the upper bound**, counting every literal that
disagrees with the package version whether or not it could be corroborated.

The headline is the corroborated figure. The gap between the two is not noise: it is the 578
`never-published` cases, which are *not corroborable by construction* (§3.3), plus 68 cases the
corroboration step actively **rejected** as legitimate independent versioning.

Confidence intervals are given even though this is a census, because the census is of one frame at
one instant; they express binomial uncertainty about the underlying propensity, not sampling error.

### 3.2 The corroboration step

Counting "the literal is some old version of this package" is not sufficient. In a package with
hundreds of releases, *any* small literal appears in its history by coincidence, and some projects
version an embedded MCP surface deliberately: `firebase-tools@14.27.0` ships
`SERVER_VERSION = "0.3.0"` on purpose, and `0.3.0` happens to be a real firebase-tools version from
2015.

So the harness re-downloads the tarball of the version the literal *names* and asks the decisive
question: **at that version, did the handshake say exactly that?** If yes, the literal once tracked
the package version and has since been frozen — the drift is real, not an independent scheme.

| Verdict on the 2,177 "literal is a former version of this package" cases | Count |
|---|---:|
| **confirmed-left-behind** — the handshake said exactly that at that version | **2,075 (95.3%)** |
| independent-versioning — it said something else there; **excluded** | 68 |
| no handshake existed at that version (e.g. `firebase-tools`); **excluded** | 33 |
| no literal at that version; **excluded** | 1 |

The 68 exclusions are the check working, and they are the reason a hardcoded handshake version
cannot be assumed wrong on sight (§7).

### 3.3 The categories, each defined and reported separately

The 2,777 raw-drift cases are **not one number**. They are four distinguishable failures:

| Category | Count | Definition |
|---|---:|---|
| **stale-published** | **2,177** | The literal is a version this package genuinely published, and the package has since moved past it. Corroborable — 2,075 confirmed, 102 excluded. This is the headline's source. |
| **never-published** | **578** | The literal is a well-formed version that **has never been any published version of this package**. Not a stale value left behind: a value that was never true. Typically a scaffold default (`1.0.0`, `0.1.0`, `0.0.0`). Excluded from the 41.1% headline because the stale-published corroboration cannot reach it — there is no tarball of "that version" to open. A **different** check does reach it, and is reported in section 3.3.1. |
| **not-a-version** | **19** | The literal is not a version at all: `"unknown"`, `"4"`, `"0.8.x"`, `"p3f-1.0.0"`, and one unsubstituted build template, `"${VERSION}+${GIT_SHA}"` — a package shipping its own uninterpolated placeholder to every host that installs it. |
| **ahead-of-package** | **3** | The literal names a version *newer* than the package: `@lchampz/mcp-heimdall@1.0.1` says `1.1.0`, `mermaid-mcp-app@0.3.2` says `1.0.0`, `mup-mcp-server@0.1.1` says `0.2.0`. A bump applied to the literal and not to the release. |

A fifth property cuts across the others:

| Property | Count | Definition |
|---|---:|---|
| **internalDisagreement** | **112** (66 of them also drifted) | The package contains **two or more different hardcoded version literals in its own shipped code**, so its files disagree with each other about what version it is — independently of whether any of them matches `package.json`. `0nmcp@4.5.1` is the clearest: `index.js` says `2.2.0` and `server.js` says `1.7.0`. Which one a host sees depends on which entry point it launched. |

#### 3.3.1 The `never-published` cases, corroborated a different way

Saying these cases "cannot be corroborated" is true only of the stale-published check, which works by
opening the version the literal names. A different question *is* answerable, and it is the sharper
one: **did this package's handshake ever state a correct version at all?** The harness opens each
package's earliest published release and compares its handshake against that release's own version
(`--stage=corroborate-never`, 578 packages, one extra tarball each).

| Verdict at the package's first release | Count | What it licenses |
|---|---:|---|
| **never-correct** | **496 (85.8%)** | the handshake was already wrong at release one, so the package has never been observed stating a correct version |
| &nbsp;&nbsp;of which the literal is **byte-identical to today's** | **475 (82.2%)** | see the deduction below |
| was-correct-once | 50 | it matched at release one, and was later replaced by a value naming no release at all |
| no handshake at the first release | 30 | undetermined |
| version derived at the first release | 2 | undetermined |

For the 475, the conclusion is a **deduction rather than a sample**. The literal is not any published
version of the package — that is what `never-published` means — and it was already present, unchanged,
at the first release. There is therefore no release at which it could have matched. **475 packages —
82.2% of the never-published set, 9.4% of all applicable packages — have shipped one identical,
never-once-true version string to every host that has ever installed them, across their entire
published life.**

The tail is severe, because a value that was never right does not self-correct:

| Package | States | Releases | First published |
|---|---|---:|---|
| `samarth-gtm-mcp@1.19.0` | `1.0.0` | 733 | 2026-06-12 |
| `@cleocode/cleo@2026.3.35` | `1.0.0` | 357 | 2026-02-22 |
| `flow-nexus@0.1.121` | `2.0.0` | 131 | 2025-08-25 |
| `@neat.is/mcp@0.9.1` | `0.1.0` | 114 | 2026-05-07 |
| `@contextium/mcp-server@1.10.12` | `0.1.0` | 90 | 2026-02-27 |

This does **not** enter the 41.1% headline, which remains a statement about literals that once
tracked the version and were then left behind. It is reported as its own finding: a second, disjoint
population, failing worse. Adding the 496 never-correct cases to the 2,075 confirmed gives
**2,571 of 5,052 = 50.9% of applicable packages that either left a correct version behind or never
stated one** — the widest claim the corroborated evidence supports, and still narrower than the
55.0% raw bound, because it continues to exclude the 102 rejected stale-published cases and the 32
undetermined here.

### 3.4 The distribution — the median and the tail

The median confirmed case is 2 releases and 1 day behind. On its own that is unremarkable: a
maintainer bumped `package.json`, published the same day, and left the literal. Reporting only the
median would understate the phenomenon; reporting only the tail would overstate it. Both:

| Distance behind | Count (of 2,075 confirmed) | Share |
|---|---:|---:|
| 1 release | 961 | 46.3% |
| **2 or more releases** | **1,114** | **53.7%** |
| 5 or more releases | 337 | 16.2% |
| 10 or more releases | 131 | 6.3% |
| Median | 2 releases / 1 day | |
| **Maximum** | **260 releases / 497 days** | |

So: half of it is a same-day slip, and half of it is a package two or more releases out of date about
its own identity, with 131 packages ten or more releases stale and a worst case of 260.

### 3.5 Illustrative instances

Each is checkable and fixable; version and date are given so every claim is falsifiable. All are the
current published version as of 2026-08-22.

- **`@shiplightai/mcp@0.2.1`** — the sharpest instance in the corpus. The *same bundle* carries
  `var mr = "0.2.1"`, used to answer its `--version` flag, and `version: "1.0.0"`, passed to the MCP
  handshake. **The human-facing self-description is correct and the model-facing one is wrong, in one
  file, at the same instant.** Nothing distinguishes them except who reads them.
- **`nx-mcp@0.25.0`** — the Nx build system's MCP server. Constructs
  `new Server({name: "Nx MCP", version: "0.0.1"}, {instructions, capabilities})` in `main.js`, twice.
  **49 releases and 429 days behind.**
- **`@nekzus/mcp-server@1.26.0`** — states `1.0.0`. **152 releases, 497 days.**
- **`@upstash/mcp-server@0.2.7`** — states `0.1.0`. 12 releases, 493 days.
- **`keepsake-mcp@1.8.0`** — `new McpServer({name: "keepsake", version: "1.0.0"})` in the exact file
  its `bin` entry points at. 8 releases, 176 days.
- **`0nmcp@4.5.1`** — internal disagreement: `index.js` says `2.2.0`, `server.js` says `1.7.0`,
  neither is `4.5.1`.
- **`@klever/mcp-server@1.3.0`** — ships the literal `"${VERSION}+${GIT_SHA}"`: a build-time
  substitution that never ran, published to the registry as the server's identity.

### 3.6 Sensitivity

The headline does not depend on the detector's judgement calls:

| Variant | Raw drift | Confirmed |
|---|---:|---:|
| Headline (all applicable) | 55.0% | **41.1%** |
| Tier A sites only — drop the minified-bundle fallback entirely | 54.8% | — |
| Packages with more than one published release only | 59.3% | — |
| Confirmed population found via Tier A | — | 1,988 / 2,075 = 95.8% |

Across six revisions of the detector (adding guards for inlined dependency manifests, client
handshakes, code-generator templates, test files, cross-module constant bindings and serialised
`package.json` writes) the raw figure moved only between 54.4% and 55.0%.

---

## 4. Metric 1 — manual review and false-positive rate

An automated count of 2,075 that nobody has read is exactly the kind of number this study argues
against. Four checks, in increasing strength of evidence.

### 4.1 Whole-population evidence check (n = 2,075, automated)

Every confirmed positive must carry its own evidence: the recorded source excerpt contains the
claimed version verbatim in quotes, **or** the `via` field records the named constant it resolved
from. **2,075 of 2,075 (100%) do.** No confirmed positive rests on an unrecorded inference. This is
asserted by `verify-findings.mjs` and fails the script if it ever stops holding.

### 4.2 Independent hand review (n = 30, 0 false positives)

A deterministic sample of 30 confirmed positives (splitmix32, seed `20260822`, shuffle then take 30),
each excerpt read as source by a second reviewer working independently of the harness author.
**0 false positives.** Rule of three at n=30 with zero events gives a **95% upper bound of 10%**.
Reproduce with `node verify-findings.mjs --sample`.

Three elevated-risk cases were additionally checked individually, chosen because their recorded
evidence was weakest:

| Case | Why it looked risky | Verdict |
|---|---|---|
| `gainium-mcp` | the excerpt is the identifier `SERVER_VERSION`, not a literal | **true positive** — `via` records `SERVER_VERSION = '3.2.3'` in the same file; one hop of indirection |
| `@googlemaps/code-assist-mcp` | minified, `ctor: null` (Tier B) | **true positive** — `{name:…,version:"0.1.7"},{capabilities:{…}}` is the unambiguous `new Server(info, options)` arity and shape |
| `package-intel-mcp` | minified | **true positive** — literal corroborated in the same file at the earlier version |

### 4.3 Seven seeded rounds by the harness author (n = 155, 7 false positives)

Each round's false positives drove a guard, so rounds are reported separately rather than pooled into
a flattering single number. Redraw any of them with `node review.mjs --seed=<n>`.

| Round | Seed | Stratum | n | FP | Mechanism found, and the guard it produced |
|---|---|---|---:|---:|---|
| 1 | 20260822 | corroborated | 20 | 0 | — |
| 2 | 42 | never-published | 20 | 3 | an inlined dependency `package.json`; a client `initialize` in `scripts/`; a code-generator template |
| 3 | 42 | corroborated | 30 | 1 | a metadata stub (`module.exports = {name, version}`) — **deliberately left unguarded** |
| 4 | 1337 | never-published | 20 | 2 | `new Client({name, version})` — a *client* handshake, not a server's |
| 5 | 1337 | corroborated | 25 | 0 | — |
| 6 | 2718 | corroborated | 25 | 0 | — |
| 7 | 2718 | never-published | 15 | 1 | a scratch `package.json` written through `JSON.stringify` |
| **Total** | | | **155** | **7** | **4.5%** (95% CI 2.2–9.0%) |

**Final held-out round (6 + 7, after the last guard but one): 1 false positive in 40 = 2.5%
(95% CI 0.4–12.9%).** Round 3's mechanism is not guarded, so this is an estimate of the *shipped*
detector rather than an artefact of fitting guards to the review.

### 4.4 The number to quote

| Population | Reviewed | FP | Rate |
|---|---:|---:|---|
| **Corroborated stratum** (rounds 1, 3, 5, 6 + the independent 30) | **130** | **1** | **0.8%** (95% CI 0.1–4.2%) |
| All positives, all strata, all detector revisions | 185 | 7 | 3.8% (95% CI 1.8–7.6%) |
| Final held-out round only | 40 | 1 | 2.5% (95% CI 0.4–12.9%) |

**The headline figure's false-positive rate is 1 in 130 reviewed (0.8%).** False positives
concentrate in the `never-published` stratum and in Tier B — neither of which contributes to the
41.1% headline. That is the main reason for quoting the corroborated figure rather than the raw one.

### 4.5 Robustness of the confirmed population

| Property of the 2,075 confirmed | |
|---|---:|
| Found via a real, named `Server`/`McpServer` constructor (Tier A) | 1,988 (95.8%) |
| The literal is written directly at the constructor | 1,863 (89.8%) |
| The literal is resolved through a named constant | 212 (10.2%) |
| The source file looks minified | 53 (2.6%) |
| Corroborated against the **same file** at the earlier version | 2,046 (98.6%) |

The headline does not rest on the minified-bundle fallback (4.2% of confirmed cases), and the
corroboration compares like with like in 98.6% of cases.

### 4.6 False negatives

30 packages classified *clean* were also reviewed (seeds 1337 and 2718): no false negatives, and one
deliberate conservative exclusion — `clarik@0.1.1`, whose entry file says `0.1.0` while another file
says `0.1.1`, excluded under the rule that any literal matching the package version makes the package
ambiguous. Every bias in the detector points **downward**: 830 unresolvable expressions are excluded
rather than guessed, test/example/script files are dropped outright, a package is a positive only if
*every* literal in it disagrees, and the 578 `never-published` cases are kept out of the headline.

---

## 5. Metric 2 — vendored resources vs the project's own source

**This is a sample, not a census, and it carries sampling error.** Keep it separate from Metric 1's
numbers: different population, different denominator, much weaker result.

**Question.** A package bakes documentation, a schema or a grammar into its tarball at pack time. The
registry then serves that copy to every host that installs it. Does the copy still match the source
it was made from?

**Method.** For each sampled package with a GitHub repository, find the tag corresponding to the
published version (`git ls-remote --tags`, then conventional spellings `v1.2.3`, `1.2.3`,
`pkg@1.2.3`, …), download that snapshot from codeload, and compare every comparable text file
(`.md`, `.json`, `.gbnf`, `.txt`, `.yaml`, …) byte-for-byte with line endings normalised.
`package.json` and lockfiles are excluded because npm rewrites them.

| Outcome | Files | Packages |
|---|---:|---:|
| Identical | 1,293 (96.2%) | — |
| **Differ** | **51 (3.8%)** | **39 = 14.6% of 267 comparable** (95% CI 10.9–19.3%) |
| Absent from the repo — built or generated at pack time; **never counted as drift** | 131 | — |

**All 39 packages with a differing file were then reviewed by hand,** and the raw 14.6%
substantially overstates drift:

| Classification | Packages | |
|---|---:|---|
| **A — verified stale or false self-description** | **11 = 4.1%** (95% CI 2.3–7.2%) | the shipped copy makes a claim its own source at that tag contradicts |
| B — tarball *ahead* of the tag (docs updated after tagging) | 5 | not drift |
| C — deliberately different npm-facing document, or pack-time link rewriting | 3 | not drift |
| D — divergent, direction not establishable automatically | 19 | undetermined |
| E — not a self-description (`tsconfig.json`) | 1 | not drift |

**Automated-positive false-positive rate: 9 of 39 = 23%** (classes B, C, E), with 19 undetermined.
So Metric 2's defensible figure is **4.1%**, with 14.6% as a loose upper bound. Class C is worth
naming as a mechanism: several projects rewrite relative links to absolute GitHub URLs at pack time,
which produces a byte difference with no semantic drift at all.

Two sub-tests separate the sharp cases from the merely divergent:

- **A shipped document names a version the package is not, while the source at that very tag names
  the right one: 7 of 267 = 2.6%** (95% CI 1.3–5.3%). Every instance:
  `gogcli-mcp-slides@2.25.0` (CHANGELOG stops at 2.1.0; its README and `SKILL.md` carry a *different
  package's* name entirely), `invoiceflow-mcp-server@1.4.0` (`.well-known/mcp/server-card.json` — a
  literal machine-readable self-description — says 1.2.0), `leadpipe-mcp-server@1.4.0` (`server.json`
  says 1.3.0), `@meltingpixels/zero-core-tools@1.0.0` (`server.json` says 1.1.0),
  `@memi-design/cli@2.7.9` (README tells the reader to run `npx @memi-design/cli@2.7.7`),
  `@thask-org/cli@0.6.0` (README names 0.5.15), `virtualsms-mcp@1.3.1` (README names 1.0.0 / 1.2.3).
- **The same distinctively-named document baked in two places within one project, disagreeing — the
  shape that motivated this study — is RARE: 1 of 267 = 0.4%** (95% CI 0.1–2.1%). **This is a null
  result and is reported as one.** An earlier version of this test scored 4.1% only because it
  counted `SKILL.md` and `manifest.json`, of which a package legitimately ships one per skill and one
  per app; removing them collapsed the measure to a single instance (`gogcli-mcp-slides`).

The most consequential single instance is not a version at all: **`cesium-mcp-runtime@1.139.2`**
ships a README (and a Chinese translation) headed `## MCP Tools (19)` while its source at tag
`v1.139.2` says `## MCP Tools (43 + 2 meta)`. The document a model reads understates the server's
tool surface by more than half.

---

## 6. Metric 3 — what the registry and the dependency graph actually resolve to

Metric 3 as originally posed — "does the declared dependency range resolve to a newer core than the
one the baked resources came from?" — is **not answerable at ecosystem scale**, because establishing
which version of which dependency a given baked file came from requires the complete file inventory
of every published version of every dependency. Two computable facets of the same question are
reported instead, labelled as proxies rather than as the metric.

### 6.1 The registry entry is itself a self-description, and it goes stale

The MCP registry tells a host which version to install. Denominator: the 7,180 entries whose declared
version is published on npm.

| | |
|---|---:|
| Registry-declared version is behind npm `latest` | **2,087 = 29.1%** (95% CI 28.0–30.1%) |
| Median distance | 2 releases / 17 days |
| Maximum | 731 releases |

Nearly a third of the registry describes packages as versions they have moved past. This is the same
failure one level up: a hand-maintained record of a fact, never rechecked against the fact.

### 6.2 The precondition for pack-time staleness is near-universal

**"Open range"** means a dependency specifier that resolves to *whatever is newest at install time*
rather than to one fixed version: a caret (`^1.2.3`), a tilde (`~1.2.3`), a wildcard (`*`, `1.x`), a
comparator (`>=1.2.3`), or a union. An exact pin (`1.2.3`) is closed. **Why it matters here:** a
package's baked copies are frozen at pack time, but an open range means the code around them keeps
moving after publication. The artifact a host actually runs is therefore assembled at install time
from a frozen copy plus a moving dependency — which is how a baked self-description goes stale with
no commit ever touching the package that contains it.

Denominator: the 5,920 packages declaring `@modelcontextprotocol/sdk`.

| | |
|---|---:|
| **Open range** | **5,673 = 95.8%** (95% CI 95.3–96.3%) |
| Exact-pinned | 247 = 4.2% |
| Median SDK releases published since the package was | 1 (max 28, of 79 known SDK versions) |
| Median package age at scan | 72 days |

The exposure is real but currently shallow: the median package is 72 days old and one SDK release
behind. The tail is 28 releases.

---

## 7. Threats to validity

**1. Census, but of a frame.** Metric 1 is a census of all 7,272 unique npm packages on the MCP
registry, so it has **no sampling error**. But the *frame* is "registry-listed servers distributing
an npm package", which is **not** "all MCP servers": it excludes remote-only servers, PyPI and OCI
distributions, and every server whose author never published a registry entry. The frame also skews
toward recently published, small, single-author packages — 528 of 5,052 applicable packages have
only one release. Restricting to multi-release packages *raises* raw drift to 59.3%, so the skew is
not inflating the result.

**2. Metric 2 is a sample and carries sampling error**, reported with Wilson intervals throughout.
It is further restricted to projects that tag releases (269 of 600 sampled) and whose repository is
public (530 of 600) — both plausibly correlated with maintenance discipline, so Metric 2's rate is
if anything an **under**estimate for the wider population. Its tag assumption is also imperfect: the
tag matching a version is not always the commit that was packed, which accounts for 5 of its 39 raw
positives.

**3. The detection ceiling, and the direction of its bias.** 1,305 packages have no identifiable
handshake (1,271 with code, 34 with none) and 830 have a version expression that could not be
statically settled. Together that is 2,135 packages — 29.4% of the census — on which Metric 1 is
silent. Most are heavily minified bundles. **The bias runs downward for the retyping rate:** if
dynamic resolution correlates with better engineering practice, and minification correlates with
bundler-based, more professional builds, then the true retyping rate across *all* packages is
**lower** than the measured 89.6%. The 41.1% and 55.0% figures are rates *among packages whose
handshake can be read*, and are stated that way throughout.

**4. A hardcoded handshake version can be legitimate — and we have proof.** A project may
deliberately version an embedded MCP surface separately from the package that contains it.
`firebase-tools@14.27.0` does exactly this. The corroboration step **rejected 68 such cases**, which
is the check working rather than a limitation; but it means the 55.0% raw figure contains an unknown
number of legitimate cases, and it is precisely why the corroborated 41.1% is the headline.

**5. The headline excludes 578 `never-published` cases, and they fail worse.** A literal that was
never any published version cannot enter the stale-published corroboration, which works by opening
the version the literal names. Section 3.3.1 reaches them by a different route — the package's first
release — and finds 496 were already wrong at release one, 475 of them carrying today exactly the
string they carried then. Excluding these keeps the 41.1% headline a clean statement about *left-
behind* literals, but it means the headline is not the whole failure: the union of both corroborated
populations is 2,571 of 5,052 = 50.9%.

**6. "Version" is under-specified by the MCP protocol.** `Implementation.version` is described as
the version of the server software. Where a package *is* the server, package version is the only
sensible reading; where a server is embedded in a larger tool, it is arguable. This affects the raw
figure, not the corroborated core, whose whole test is *did this literal once track this package*.

**7. Tier A vs Tier B detection confidence.** Tier A (5,601 sites) matches a named
`Server`/`McpServer` constructor and is high confidence. Tier B (281 sites) matches the
`{name, version}` `Implementation` shape with no visible constructor, and is used only where Tier A
found nothing anywhere in the package; it exists to cover minified bundles and hand-rolled JSON-RPC
servers that never import the SDK. Tier B is where false positives concentrated during review, which
is why it is guarded against clients, inlined dependency manifests, code-generator templates and
serialised `package.json` writes — and why the confirmed population is reported as 95.8% Tier A.
Dropping Tier B entirely moves the raw figure by 0.2 points.

**8. Guards were developed on reviewed samples.** Six of the seven false-positive mechanisms found
were subsequently guarded, which risks fitting the detector to its own review. Two defences: the
final round (40 positives, 1 false positive) post-dates all but one guard, and round 3's mechanism
is left unguarded on purpose so the reported rate is not flattered.

**9. One snapshot, one day.** Every rate is as of 2026-08-22. Drift distances grow monotonically
until someone fixes them, so these are lower bounds for any later date.

---

## 8. Paragraph a paper can use verbatim

> We measured self-description drift across the npm packages published on the official Model Context
> Protocol registry. Enumerating the registry on 2026-08-22 yielded 24,131 server entries, of which
> 7,501 distribute an npm package, covering 7,272 unique packages; we analysed all of them, so this
> is a census of that frame rather than a sample. Of the 5,052 packages whose self-reported identity
> can be resolved statically, **4,527 (89.6%) retype the version as a literal and only 525 (10.4%)
> derive it from the package manifest at runtime.** Comparing each retyped literal against the
> package's actual version, **2,075 packages (41.1% of applicable, 95% CI 39.7–42.4%) state a version
> that once tracked the package and has since been left behind** — corroborated case-by-case by
> re-downloading the version each literal names and confirming the handshake said exactly that there,
> a step that also excluded 68 cases of legitimate independent versioning. Counting every disagreeing
> literal, corroborated or not, gives an upper bound of 55.0%; the headline further excludes 578
> packages whose stated version was never any published version at all, because such cases cannot be
> corroborated by the same route. A second check reaches those separately, by opening each package's
> earliest release: **496 of the 578 were already wrong at their first release, and 475 carry today
> the byte-identical string they carried then** — which, since that string names no release the
> package ever made, means it has been wrong at every release the package has ever published. Of the
> 2,075 confirmed left-behind cases, 1,114 are two or more releases behind, 131
> are ten or more, and the worst is 260 releases and 497 days stale. A whole-population evidence
> check confirms all 2,075 carry their own source excerpt, and hand review of 130 sampled confirmed
> positives across two independent reviewers found **one false positive (0.8%)**. The clearest single
> instance is `@shiplightai/mcp@0.2.1`, whose one bundle carries the correct version `0.2.1` for its
> human-facing `--version` flag and a stale `1.0.0` for its machine-facing MCP handshake: the same
> package, at the same instant, describing itself correctly to a person and incorrectly to a model.

---

## 9. Provenance

The harness, the census, the corroboration step and the seven seeded review rounds in section 4.3
were produced by the agent that authored `scan.mjs`. During a period when that agent was
unresponsive, the session lead independently analysed the committed dataset, wrote
`verify-findings.mjs`, and performed the 30-case hand review recorded in section 4.2 together with
the three elevated-risk checks. This document merges both. The review in section 4.2 is therefore
genuinely independent of the harness author, which is why it is reported separately rather than
pooled into section 4.3.

---

## 10. Reproducing and checking

```bash
node verify-findings.mjs                # recompute every figure; asserts 13 identities; exit 1 on failure
node verify-findings.mjs --sample       # also print the 30 hand-reviewed cases
node scan.mjs --help                    # every stage and flag
node scan.mjs                           # full pipeline; ~50 min cold, ~95 s from cache
node scan.mjs --stage=metric1,report    # re-classify with no network access at all
node scan.mjs --stage=corroborate-never # open each never-published package's FIRST release
node review.mjs --seed=2718 --n=25 --corroboration=confirmed-left-behind
node review.mjs --negatives --seed=2718 # the false-negative sample
node inspect.mjs nx-mcp 0.25.0          # the source evidence behind one positive
```

Layout:

```
scan.mjs                the harness (enumerate npm tarballs extract metric1 corroborate metric2 report)
verify-findings.mjs     recomputes this document's figures; asserts 13 internal identities; exits non-zero on failure
inspect.mjs             print the source around every handshake site in one cached tarball
review.mjs              draw a seeded, reproducible review sample from the dataset
lib/tar.mjs             a small tar reader, so no dependency is added to the repo
lib/handshake.mjs       the M1 detector, its guards, and package-wide version-binding resolution
lib/repo.mjs            repository coordinates, tag conventions, comparability rules
lib/metric2.mjs         tag discovery via git ls-remote, snapshot comparison, the sub-tests
lib/util.mjs            fetch/retry, bounded-concurrency pool, semver, caching
results-2026-08-22.json the dataset
cache/                  every network response (gitignored; ~3 GB)
```

The run is dated, not clocked: `--date` selects the registry snapshot, and the one age computation in
section 6.2 is measured against the recorded `registryFetchedAt`, never the wall clock. Network
access is polite throughout — bounded concurrency, a descriptive User-Agent naming the study, retry
with backoff, and every response cached so a re-run costs nothing.
