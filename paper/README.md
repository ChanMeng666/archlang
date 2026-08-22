# `paper/` — the ArchLang papers

Three targets, one toolchain.

| Target | Venue | Limit | Blind | Deadline |
|---|---|---|---|---|
| `flagship/` | arXiv (cs.SE, cross-list cs.PL) | none | named | rolling |
| `nier/` | ICSE 2027 NIER | 4 pp main text + 1 pp references | **double-anonymous** | 23 Oct 2026 AoE |
| `demo/` | ICSE 2027 Tool Demonstrations | 4 pp **including** references | single-anonymous (names in) | 23 Oct 2026 AoE |

`nier/` and `demo/` are cuts of `flagship/`, not separate research. `demo/` additionally
requires a 3–5 minute video hosted on YouTube for the duration of review.

## Build

```bash
npm run paper:build            # build + check every target
node paper/build.mjs demo      # one target
node paper/build.mjs --no-check  # drafting loop: build, don't enforce limits
```

Requires [Tectonic](https://tectonic-typesetting.github.io) — one self-contained binary that
fetches LaTeX packages on demand and caches them, instead of a 5 GB TeX Live install. On this
machine it lives at `D:\tectonic\tectonic.exe` and is on the user PATH. To reinstall:

```powershell
New-Item -ItemType Directory -Force D:\tectonic
Invoke-WebRequest -UseBasicParsing -OutFile D:\tectonic\t.zip `
  'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip'
Expand-Archive D:\tectonic\t.zip -DestinationPath D:\tectonic -Force; Remove-Item D:\tectonic\t.zip
```

**The page-limit check is not advisory.** Both ICSE tracks enforce their limits strictly, with
no option to buy pages, and an overrun is desk-rejected before a reviewer opens the file.
`build.mjs` reads the page count from the engine's own log line and locates the bibliography
via a `\label{refsstart}` each paper places immediately before `\begin{thebibliography}`. It
then asserts two things: the main text ends on or before the limit page, and the whole
document fits within limit + reference allowance.

**The check has been proven non-vacuous**, which is the standard the papers themselves argue
for: padding `demo/main.tex` to 8 pages makes it report `OVER: main text runs onto page 8,
limit is 4` and exit 1. It also *fails closed* — if it cannot read a page count or find the
label, it reports `UNVERIFIED` rather than passing. (Its first implementation scraped the PDF
for `/Type /Page`, found nothing because tectonic writes compressed object streams, fell
through to a fallback that matched an unrelated number, and confidently reported a one-page
paper as 47 pages. That is the exact failure mode the papers are about, produced by the
checker written to support them, within an hour of starting.)

## Where the numbers come from

Three tiers, deliberately separated by how often each moves.

**`facts.tex` / `facts.json` — structural, generated, drift-gated.**
Written by `npm run gen:paper-facts` (`scripts/gen-paper-facts.ts`), which interpolates every
count from the compiler's own tables: `src/error-catalog.ts`, `src/grammar/tokens.ts`,
`src/lint/rules/index.ts`, `src/manifest.ts`. `npm run check:drift` fails if one moves without
regeneration. **Papers cite these only through their `\fact*` macros — never by retyping a
digit into a `.tex` file.** That is not fastidiousness; it is the remedy the flagship paper
argues for, applied to the paper.

It earned itself twice, and the second time is the better story. The audit that preceded this
directory reported "136 keywords" alongside component counts of 20 control, 11 element, 56
attribute and 55 enum — which sum to **142**. Neither number was a miscount. A change adding
`street` and `hemisphere` to the keyword table was in flight at the time, and the audit sampled
the file twice: the total is true of the committed source, the components are true of the
working tree, and the description as a whole is true of neither. Then the generator built here
made the same mistake in the other direction — it was run against that same uncommitted working
tree, so the committed `facts.json` claimed 142 while the committed source said 136, and the
drift gate this directory added failed CI on the first push. A hand-written description of a
system can be wrong about which *version* of the system it describes, and that is not a
carelessness problem; it is what happens whenever a description is taken by hand from a moving
subject.

**`scale-snapshot.json` — scale, generated, dated, NOT drift-gated.**
Written on purpose before a submission:

```bash
npm run paper:snapshot -- --date 2026-08-22
```

Lines of code, file counts, commit and tag counts, test call sites. Every one moves on every
commit, so gating them would fail `check:drift` on unrelated work and train people to
regenerate without looking — the exact reflex the papers argue against. The date is an
argument rather than a clock read, so a re-run reproduces an old snapshot.

**`facts-manual.tex` — external and paid measurements, hand-written, each with a source and a
date.** npm download figures, eval pass rates, Gate G1 statistics, VS Code Marketplace
figures. These cannot be derived from the repository. Every entry carries a comment naming
where it came from and when it was measured. Nothing goes in here without provenance.

## Rules for these papers

- **No "first" or "only" claims.** The project's own prior-art audit killed them across ~60
  items (GLIDE 1975, Palladian shape grammar 1978, PLaSM 1992, CityEngine CGA 2008,
  FloorPlan-DSL 2022, Architext 2023). PlanScript shipped a structural mirror of ArchLang's
  agent surface 5.5 months earlier and arch-plotter shipped "Typst for architecture" three
  months before ArchLang started; both are cited, in the related-work section, by name.
- **Concede the drawing-generation leg fully.** IfcOpenShell has emitted to-scale SVG floor
  plans with door swings, room names and computed areas since July 2015.
- **No claim, positive or negative, about whether a diagnostic feedback loop beats
  equal-budget resampling.** That experiment was permanently declined; asserting either
  direction is out of bounds.
- **The 26-brief eval is not a benchmark and not a model score.** n=26, one model, one seed, a
  private holdout, and a judge with 41 points of demonstrated authority over the number.
- **Clear widths, walk distances and furniture clearances are advisory, never measurements.**
  `estimatedClearWidth` is a constant 60 mm subtraction. The three things claimable as
  measurement are reachability, exact areas, and byte-identical determinism.

The full list lives in the plan at `C:\Users\0\.claude\plans\ai-archlang-docs-archlang-archlang-play-zippy-ocean.md`;
the evidence behind it is in `archcanvas-growth/research/competitors/`.

## Layout

```
paper/
├─ build.mjs             build + mechanical page-limit enforcement
├─ facts.tex/.json       GENERATED, drift-gated — structural counts
├─ scale-snapshot.json   GENERATED on demand with --date — LOC, commits, tests
├─ facts-manual.tex      hand-written, each entry sourced and dated
├─ refs.bib              shared bibliography
├─ flagship/ nier/ demo/ one main.tex each
└─ experiments/          reproduction scripts for every external claim
   ├─ corroboration/     third-party defect instances, at pinned commits
   ├─ mutation/          the planted-fault experiment
   └─ npm-downloads/     dated registry query
```
