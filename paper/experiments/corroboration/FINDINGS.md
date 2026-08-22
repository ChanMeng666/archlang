# External corroboration: green-and-vacuous guards in third-party floor-plan compilers

Every claim below was re-verified first-hand at a pinned commit. The prior audit
(`archcanvas-growth/research/competitors/2026-08-06-technical-borrowing-audit.md` section 3)
was used only as a pointer to where to look; several of its claims are sharpened, one is
downgraded, and eight further instances were found that it missed.

**Sub-classes.**

- **A** — a system's *description of itself* drifts from its implementation, while the
  reflexive gate that ought to catch it stays green (it compares a generator to its own
  output, proving reproducibility, never truth).
- **B** — a declared diagnostic that can never fire, or a validity check that computes a
  value and then ignores it.
- **C** — a guard or shipped surface that is never actually executed, so nothing about it is
  verified.

## Provenance of the evidence

| Project | Commit | Branch | Commit date | Upstream remote | Licence |
|---|---|---|---|---|---|
| PlanScript (TypeScript) | `6b0a0c08ec4e58ac8001681833fd03546cd144ab` | `main` | 2026-01-06 | `https://github.com/jfromaniello/planscript.git` | MIT |
| PlanScript-Rust | `6cf5060ad73f26e09bcdb4fe212af780bee2d11b` | `main` | 2026-05-31 | `https://github.com/gravhl/planscript.git` | MIT |
| ifc-lite | `be110ecf0c41e8f6862da21b4d999ce0baaa787d` | `main` | 2026-08-06 | `https://github.com/LTplus-AG/ifc-lite.git` | MPL-2.0 |
| arch-plotter | `63cbd2e72829f940ef99a0d01cab646009076b9d` | `main` | 2026-06-04 | `https://github.com/amitsinghg1/arch-plotter.git` | MIT |

All four working trees were clean before and after verification (`git status --porcelain`
empty in each). None was modified or committed to. PlanScript-TS was `npm install`ed in order
to run its own test suite; `node_modules/`, `dist/` and the peggy-generated parser are all
gitignored, so its tracked tree stayed byte-identical.

**Licence and fair use.** MIT (PlanScript, PlanScript-Rust, arch-plotter) permits
reproduction with the notice; MPL-2.0 (ifc-lite) is file-scoped copyleft and is not triggered
by quotation at all. Every excerpt below is seven lines or fewer, is cited with file and line,
and is reproduced to identify a specific defect in the quoted work — criticism and research,
the paradigm fair-use purpose, with no market substitution: none of these snippets is usable
as software. No code from any of these projects is vendored, adapted, or redistributed in
ArchLang or in this paper. The quotes are fair.

## Verification of the reproduction scripts themselves

**Every `run.sh` in this directory was executed against its clone and observed to exit 0**,
and **every one was then negative-controlled**: a scratch copy of the clone was patched to
remove the finding, and the script re-run to confirm it exits non-zero with a specific
message. All six pass on the real clone and all six fail on the patched copy. Full results,
including which piece of evidence was removed in each case, are in the
"Script verification log" section at the end.

A reproduction script that has never been run is precisely the defect class this paper
documents, and a script that cannot fail is the same defect one level up. Both were checked
here rather than assumed.

---

## 1. PlanScript (TS) — `isPolygonClosed` returns `true` unconditionally; `E101` can never fire

- **Commit:** `6b0a0c08ec4e58ac8001681833fd03546cd144ab` (`main`, 2026-01-06)
- **Remote:** `https://github.com/jfromaniello/planscript.git`
- **Location:** `src/validation/index.ts:48-54` (function) and `:22` (code declaration)
- **Licence:** MIT — quote is 7 lines, cited, for criticism. Fair.
- **Sub-class: B.**
- **VERDICT: CONFIRMED — and stronger than the seeded claim.**

```ts
function isPolygonClosed(points: Point[], epsilon = 1e-10): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  // Polygons don't need to repeat the first point - they are implicitly closed
  return true;
}
```

Three things are computed and then discarded: `first`, `last`, and the `epsilon` tolerance
parameter — the entire apparatus of a closure test, assembled and stepped around. The seeded
claim stopped there. Two further facts sharpen it:

- **The function is never called.** `isPolygonClosed(` occurs exactly once in the whole
  repository: its own declaration. It is not a weak check wired into the pipeline; it is
  disconnected as well as vacuous.
- **`ErrorCodes.POLYGON_NOT_CLOSED` (`E101`, declared at `index.ts:22`) has zero raise
  sites**, and `DESIGN.md:263` advertises it as the *first* of five "typical compiler
  errors". Two of those five (`E101`, `E420`) can never fire.

Nothing goes red because nothing ever asks. `tsconfig.json` sets `strict: true` but not
`noUnusedLocals`, so not even the type-checker complains about the two dead bindings. Note
the failure is not that a test was wrong — it is that the *only* artifact asserting `E101`
exists is a prose list in a design document, which no gate reads.

**Reproduction command**

```sh
sh planscript-e101/run.sh /path/to/planscript
```

Mechanical one-liners against that SHA:

```sh
grep -c 'isPolygonClosed(' src/validation/index.ts        # -> 1  (declaration only)
grep -rc 'ErrorCodes.POLYGON_NOT_CLOSED' src/             # -> 0  (never raised)
grep -n  'E101 polygon not closed' DESIGN.md              # -> 263 (documented anyway)
```

---

## 2. PlanScript-Rust — declared error codes that are never constructed

- **Commit:** `6cf5060ad73f26e09bcdb4fe212af780bee2d11b` (`main`, 2026-05-31)
- **Remote:** `https://github.com/gravhl/planscript.git`
- **Location:** `planscript-rust/src/validation.rs:12-53` (the `ErrorCode` enum);
  `DESIGN.md:268`
- **Licence:** MIT — the excerpt is 4 lines of an enum declaration, cited. Fair.
- **Sub-class: B.**
- **VERDICT: CONFIRMED, and broader than the seeded claim.**

```rust
    #[serde(rename = "E102")]
    PolygonSelfIntersecting,
    #[serde(rename = "E420")]
    RoomNoAccess,
```

Counting `ErrorCode::<Variant>` construction sites across `src/` and `tests/` (the enum body
and the `as_str()` match arms use `Self::`, so every `ErrorCode::` reference is a real raise
site):

| Code | Variant | Construction sites |
|---|---|---|
| `E101` | `PolygonNotClosed` | **0** |
| `E102` | `PolygonSelfIntersecting` | **0** |
| `E420` | `RoomNoAccess` | **0** |
| the other 17 | — | 1-2 each |

The seeded claim named `E420` and `E102`. `E101` is a third, inherited from the TypeScript
original along with the other two. Conversely `E311 OpeningExceedsWall` is dead in the
**TypeScript** version and live in the Rust port — so the port fixed one of four and carried
three across.

That asymmetry is the most valuable property of the pair for the paper: **the defect survived
a reimplementation in a different language, by a different author.** The port re-typed the
error catalogue faithfully, including the entries with nothing behind them. A catalogue that
is a hand-maintained list, rather than something derived from or checked against raise sites,
propagates its own dead entries across a rewrite.

`DESIGN.md:268` lists `E420 room has no access` among the "typical compiler errors", in both
repositories.

**Executed corroboration.** These are not merely unraised in the source, they are unreachable
in behaviour. Feeding the TypeScript validator deliberately broken plans (see section 4's
probe) yields:

```
  self-intersecting bowtie ring          (E102?): [E502]
  room landlocked inside another, no door (E420?): [NO DIAGNOSTICS]
```

A bowtie polygon raises `E502 ZERO_AREA` — its shoelace area is exactly 0 — but never
`E102`. A room sealed inside another with no door anywhere produces no diagnostics at all.

**Reproduction command**

```sh
sh planscript-rust-dead-codes/run.sh /path/to/planscript-rust
```

The script parses the variant list out of the enum rather than hard-coding it, so a newly
added error code is covered without editing the script. Mechanical one-liner:

```sh
grep -rho 'ErrorCode::RoomNoAccess\b' planscript-rust/src planscript-rust/tests | wc -l   # -> 0
```

---

## 3. PlanScript-Rust — the solver is non-deterministic in a project whose headline claim is determinism

- **Commit:** `6cf5060ad73f26e09bcdb4fe212af780bee2d11b` (`main`, 2026-05-31)
- **Remote:** `https://github.com/gravhl/planscript.git`
- **Locations:** `planscript-rust/src/solver.rs:4`, `:186`, `:832`, `:970`, `:1317`,
  `:1574-1600`; `planscript-rust/src/validation.rs:518`; `SOLVER.md:363-368`
- **Licence:** MIT — three short excerpts, cited. Fair.
- **Sub-classes: A and C.** A, because `SOLVER.md`'s "Determinism Guarantees" describes a
  system that does not exist; C, because there is no determinism test anywhere, so the
  guarantee has never been executed even once.
- **VERDICT: CONFIRMED — by execution, not by reading.**

The mechanism is as claimed. `PlanState.placed` is a `std::collections::HashMap`
(`solver.rs:186`, imported at `:4`), whose iteration order under the default `RandomState`
differs from process to process. Four decision sites consume that order:

| Site | What the iteration order decides |
|---|---|
| `solver.rs:1317` `repair_placement` | seeds a greedy nested swap loop that commits any improving swap; which swaps are attempted, and therefore which are committed, follows the key order |
| `solver.rs:1574-1600` `find_entry_room` | four chained `.find()` calls over `state.placed.values()`; when several rooms qualify — "touches the front edge" is usually true of several — the winner is whichever comes first |
| `solver.rs:970` `generate_candidates` | builds the candidate list in `placed` order; the winner is chosen by `max_by` (`:832`), which in Rust returns the **last** maximum, so ties resolve by position |
| `validation.rs:518` | `json!(visited.into_iter().collect::<Vec<_>>())` — a `HashSet` serialized straight into the emitted error JSON |

```rust
    let ids: Vec<String> = state.placed.keys().cloned().collect();
```

Against this, `SOLVER.md:363-368` is headed "Determinism Guarantees" and promises:

> * stable iteration order (sort room IDs)
> * stable candidate ordering

and `README.md:3`, `DESIGN.md:7` and `AGENTS.md:12` ("Same input always produces the same
output") repeat the claim. `grep -ril determinis` over `src/` and `tests/` returns **zero**
files: the guarantee has no test.

**The executed result is far stronger than the code-reading argument.** Building the crate
and solving each shipped intent 30 times:

| Intent | Successful runs | Distinct floor plans emitted |
|---|---|---|
| `family-house` | 30 | **30** |
| `corridor-house` | 30 | 29 |
| `simple-house` | 30 | 26 |
| `l-shaped-house` | 0 | n/a — solve fails at HEAD |
| `u-shaped-house` | 0 | n/a — solve fails at HEAD |

`family-house` produced a different building on every single run. The differences are
semantic, not cosmetic: diffing two consecutive runs shows the door topology and window
placement changing.

```
<     between living and kitchen        >     between ensuite and master
<     between garage and hall           >     between hall and bedroom2
<     on living.edge north              >     on master.edge north
```

Two consequences worth stating for the paper:

1. **The committed `examples/family-house.psc` matches none of five fresh runs.** The
   repository's own build artifacts are irreproducible by construction, so a
   "regenerate and byte-compare" gate — the kind ArchLang runs as `check:drift` — is
   *impossible* here. The absence of that gate is not an oversight the project could simply
   correct; the non-determinism forecloses it.
2. **Incidental finding:** 2 of the 5 shipped example intents fail to solve at HEAD
   (`Could not place 1 room(s): master`, exit 1), and `scripts/build-examples-intent.sh`
   runs under `set -e`. The script that regenerates the examples therefore cannot complete,
   and the committed `.psc`/`.svg` for those two are artifacts of a build that no longer
   runs. (`set -e` is present and correct here — this is not the "test script that cannot
   fail" pattern, it is a script that can no longer succeed.)

**Reproduction command**

```sh
sh planscript-rust-nondeterminism/run.sh /path/to/planscript-rust 30
```

The static half always runs. The executed half builds with `cargo` (or accepts a prebuilt
binary via `PLANSCRIPT_BIN=<path>`) and counts distinct output hashes; it fails if every run
agrees. Mechanical core, if you already have the binary:

```sh
for i in $(seq 30); do
  planscript-rust solve examples/family-house.intent.json --out /tmp/o.psc --no-svg >/dev/null
  md5sum /tmp/o.psc
done | sort -u | wc -l      # -> 30
```

*Note on toolchains:* on Windows under Git Bash the default MSVC toolchain fails to link,
because coreutils' `link` shadows MSVC's `link.exe`. Install
`stable-x86_64-pc-windows-gnu` and build with that, or pass `PLANSCRIPT_BIN`.

---

## 4. PlanScript (both ports) — `rooms_connected` counts a shared wall as a connection

- **Commits:** `6b0a0c08ec4e58ac8001681833fd03546cd144ab` (TS, `main`, 2026-01-06) and
  `6cf5060ad73f26e09bcdb4fe212af780bee2d11b` (Rust, `main`, 2026-05-31)
- **Remotes:** `https://github.com/jfromaniello/planscript.git`,
  `https://github.com/gravhl/planscript.git`
- **Locations:** `src/validation/index.ts:338-342` and `:348` (TS);
  `planscript-rust/src/validation.rs:463` (Rust);
  `test/validation/validation.test.ts:635-657` (the vacuous test);
  `LANGUAGE_REFERENCE.md:1110-1113` (the documentation)
- **Licence:** MIT — three short excerpts, cited. Fair.
- **Sub-class: C** (the test), **not A.** See the downgrade below.
- **VERDICT: PARTIALLY CONFIRMED.** The behaviour reproduces exactly; the framing does not.

**What reproduces.** Both ports seed the connectivity graph from shared polygon edges before
doors are considered at all, so two rooms divided by a solid wall with no opening are
"connected":

```ts
      if (polygonsShareEdge(rooms[i].polygon, rooms[j].polygon)) {
        adjacency.get(rooms[i].name)!.add(rooms[j].name);
        adjacency.get(rooms[j].name)!.add(rooms[i].name);
      }
```

and only then, at `:348`:

```ts
  // Also consider doors as connections (even for rooms that don't share edges)
```

The Rust port has the identical shape at `validation.rs:463`. Since rooms in a typical plan
tile the footprint and therefore share edges pairwise, the door pass adds nothing in the
common case, and `assert rooms_connected` fails only when a room is *geometrically* detached.

**Where the seeded claim is overstated, and must be corrected.** This is **not**
description-versus-implementation drift. `LANGUAGE_REFERENCE.md:1110-1113` documents the
semantics accurately:

> - Rooms that share an edge are considered connected
> - Doors between rooms also establish connectivity

The implementation matches its own documentation. What is actually wrong is narrower and
different: the assertion's **name** (`rooms_connected`) and its error
(`E801 ROOMS_NOT_CONNECTED`) promise circulation connectivity — that you can walk from any
room to any other — while the check measures geometric adjacency. That is the
"a token must not claim more than the check verifies" failure, not a drift failure, and it
belongs in sub-class C rather than A. Reported as a correction, not quietly dropped.

**The stronger finding underneath, which the prior audit missed — a textbook
green-and-vacuous guard.** The upstream test written specifically to prove that doors
establish connectivity, `'should consider doors as connections'`
(`test/validation/validation.test.ts:635-657`), lays out:

```
          room living  { rect (0,0)   (10,10) }
          room kitchen { rect (10,0)  (20,10) }
          room hall    { rect (20,0)  (30,10) }
```

Each pair already shares a **full** edge, so the adjacency graph is complete before the door
pass runs. The two `opening door` statements the test adds are decoration. Executed and
confirmed — deleting both leaves the assertion passing identically:

```
  upstream suite: Test Files  1 passed (1)
  upstream suite: Tests      46 passed (46)
  upstream plan, doors present -> E801 diagnostics: 0
  same plan, BOTH doors deleted -> E801 diagnostics: 0
  the assertion holds identically without the feature it tests: true
```

The test that exists to verify the door branch would pass with the door branch deleted. It is
the only test in the file that exercises a door at all, so the documented behaviour "doors
between rooms also establish connectivity" has, in effect, no coverage whatsoever — while the
suite reports 46 green.

This is the cleanest specimen in the corroboration set, because all three ingredients are
present in one place: a stated promise, a passing test named after that promise, and a
mechanical demonstration that the test does not depend on the promise being kept.

**Reproduction command**

```sh
sh rooms-connected-vacuous/run.sh /path/to/planscript
```

The static half always runs (and cross-checks the Rust port's line if that clone sits beside
this one). The executed half needs the clone built once — `cd <clone> && npm install`, which
leaves the tracked tree clean since `node_modules/`, `dist/` and the generated parser are
gitignored. It runs the upstream suite, then re-runs the same plan with the doors stripped,
and additionally probes the dead codes from section 2. It exits non-zero if a dead code ever
fires or if the vacuous pass stops reproducing.

---

## 5. ifc-lite — the wall clock is written into every exported drawing

- **Commit:** `be110ecf0c41e8f6862da21b4d999ce0baaa787d` (`main`, 2026-08-06)
- **Remote:** `https://github.com/LTplus-AG/ifc-lite.git`
- **Locations:** `packages/drawing-2d/src/svg-exporter.ts:502` (the defect), `:111`
  (`showTitleBlock` default), `:169` (the call site);
  `packages/drawing-2d/src/svg-exporter.test.ts:190` (the guard that misses it), `:280`,
  `:296`
- **Licence:** MPL-2.0 — file-scoped copyleft, not triggered by quotation; the excerpt is one
  line, cited, for criticism. Fair.
- **Sub-class: C.**
- **VERDICT: CONFIRMED — by execution.**

```ts
    <text x="${x + 105}" y="${y + 45}" font-family="Arial" font-size="7">${new Date().toLocaleDateString()}</text>
```

The same model exported on two different days yields different bytes. Because it is
`toLocaleDateString()` rather than an ISO stamp, the output additionally varies with the
exporting machine's **locale and time zone** — so two colleagues exporting the same drawing
at the same instant can produce different files. On the verification machine a stubbed clock
of `2020-01-02T12:00Z` renders as `2020/1/3`, showing both effects at once.

Executed proof (stubbing `Date`, so the demonstration does not require waiting for midnight):

```
  clock 2020-01-02 -> title block reads: 2020/1/3
  clock 2031-11-30 -> title block reads: 2031/12/1
  identical bytes: false
```

**What makes this a green-and-vacuous guard rather than merely a bug.** The same file
contains a test named:

> `padding: 0 and omitted padding produce byte-identical SVG (compatibility guarantee)`

`showTitleBlock` defaults to `false` (`svg-exporter.ts:111`) and the body of that test never
sets it. So the file's only byte-for-byte assertion runs on precisely the path that excludes
the clock. Two other tests *do* set `showTitleBlock: true` (`:280`, `:296`), but they assert
only on a regex-extracted scale label, never on bytes. The guarantee is stated, is green, and
does not cover the single line that breaks it.

Even had the byte-identity test enabled the title block, it would still have passed: it
compares two exports made microseconds apart, which carry the same date. The guard would then
fail only on a run straddling local midnight — flaky once a day rather than honest. This is
worth noting in the paper: the *shape* of the assertion (compare two outputs from one
process) cannot detect clock dependence at all, so strengthening the fixture would not have
helped. Only comparing across a time boundary can, which is what ArchLang's own v1.26.1 pdfkit
`CreationDate` fix had to do.

The asymmetry within the package is instructive: the DXF writer in the same directory treats
determinism as a first-class property (`dxf/writer.ts:131`, `:134`, `:184-185`;
`dxf/writer.test.ts:261` asserts "deterministic 0.0 output"). One export format was audited
for reproducibility and its sibling was not.

**Negative result, recorded deliberately.** A sweep of ifc-lite's MCP `ToolErrorCode`
catalogue (`packages/mcp/src/errors.ts`) found **all 11 declared codes in active use**,
between 1 and 46 sites each. The declared-but-never-raised pattern of sections 1 and 2 is
*not* present there. The sweep was not rubber-stamping.

**Reproduction command**

```sh
sh ifc-lite-svg-clock/run.sh /path/to/ifc-lite
```

The static half always runs. The executed half needs only `tsx` on PATH (`npm i -g tsx`) —
it imports the exporter's TypeScript source directly, so no `pnpm install` of the monorepo is
required. Mechanical one-liner:

```sh
grep -n 'new Date().toLocaleDateString()' packages/drawing-2d/src/svg-exporter.ts   # -> 502
```

---

## 6. arch-plotter — no diagnostic mechanism at all, under a "CRASH-PROOF SAFETY NET"

- **Commit:** `63cbd2e72829f940ef99a0d01cab646009076b9d` (`main`, 2026-06-04)
- **Remote:** `https://github.com/amitsinghg1/arch-plotter.git`
- **Locations:** `src/Arch.typ:1411` (the anchor branch), `:1443-1446` (the comment and the
  silent return); `README.md` changelog ("Column Crash"); `tests/test1`, `tests/test2`
- **Licence:** MIT — two excerpts of 1 and 3 lines, cited. Fair.
- **Sub-class: C.**
- **VERDICT: CONFIRMED — by execution.**

Zero `panic` and zero `assert` calls across all 4,846 lines of the library:

| File | Lines | `panic`/`assert` |
|---|---|---|
| `src/Arch.typ` | 2,331 | 0 |
| `src/Plotter.typ` | 1,508 | 0 |
| `src/Furniture.typ` | 461 | 0 |
| `src/Arch-helper.typ` | 419 | 0 |
| `src/Hatches.typ` | 114 | 0 |
| `lib.typ` | 13 | 0 |

The comment the prior audit cites is at `src/Arch.typ:1443`, and the mechanism around it is
precise. A movement distance given as a string is first tried as an anchor name (`:1411`):

```typst
      if type(val) == str and val in anchors {
```

If that membership test misses — a typo, a renamed mark — control falls through to:

```typst
        // NEW: CRASH-PROOF SAFETY NET
        // If it's a string that wasn't a valid anchor or percentage, safely ignore it!
        if type(val) == str { return (cur-x, cur-y) }
```

A misspelled anchor becomes a **zero-length move**, and the wall segment silently vanishes.
Seven further `anchors.at(name, default: (0,0))` lookups in the same file resolve an unknown
anchor to the page origin instead, which drags geometry to the corner rather than dropping
it. Neither path emits anything.

**Executed.** A one-character typo — `R("b")` becomes `R("bb")`, the only difference between
two source files — compiles with exit 0 and no output to a materially different drawing:

```
  good.typ: typst exit 0, no diagnostics (5773 bytes of SVG)
  typo.typ: typst exit 0, no diagnostics (4025 bytes of SVG)
  control - same source compiled twice: IDENTICAL (compiler is deterministic)
  typo'd source vs correct source:      DIFFERENT DRAWING, zero diagnostics
```

The control run is load-bearing: `typst` is byte-reproducible for this input, so the
1,748-byte, nine-path difference is the typo's doing and nothing else. Nine `M` path commands
disappear from the drawing without a word.

**The policy is explicit, not accidental.** The project's own changelog, under "Bug Fixes":

> **Column Crash:** Fixed a geometry crash in the `column()` component where passing `sides`
> less than 3 would break the math. It now safely defaults to 4 (square) if invalid data is
> passed.

Invalid input was made *silent* rather than *diagnosed*, and that was shipped as the fix.
This is the clearest statement of the anti-pattern in any of the four codebases: not an
oversight, a design position.

**New finding: the test suite cannot run, and nothing would notice.** `tests/` holds two
extension-less files, `test1` and `test2` — not `.typ`, so no glob picks them up. There is no
runner, no `typst.toml` test target, and no `.github/` directory at all. Both files fail to
compile at HEAD for a trivial reason nobody has ever hit:

```
  tests/test1: error: file not found (searched at .../arch-plotter/tests/src/Furniture.typ)
  tests/test2: error: file not found (searched at .../arch-plotter/tests/src/Arch.typ)
```

They import `"src/Arch.typ"`, which Typst resolves relative to the importing file — that is,
`tests/src/Arch.typ`. The suite has never been executed even once.

**Reproduction command**

```sh
sh arch-plotter-no-diagnostics/run.sh /path/to/arch-plotter
```

The static half always runs. The executed half needs `typst` on PATH; it copies the clone
into a temp directory (so the clone is never written to), compiles the correct and typo'd
sources, runs the determinism control, and fails if the two drawings come out identical.
Mechanical one-liner:

```sh
grep -c 'panic(\|assert(' src/*.typ lib.typ    # -> 0 for every file
```

---

## Summary table

| # | Project | Seeded claim | Verdict | SHA | file:line | Sub-class | Executed? |
|---|---|---|---|---|---|---|---|
| 1 | PlanScript TS | `isPolygonClosed` always true; `E101` dead | CONFIRMED (stronger) | `6b0a0c0` | `src/validation/index.ts:48-54`, `:22` | B | static |
| 2 | PlanScript-Rust | `E420`, `E102` declared, never raised | CONFIRMED (+ `E101`) | `6cf5060` | `planscript-rust/src/validation.rs:12-53` | B | yes (via section 4 probe) |
| 3 | PlanScript-Rust | `HashMap` order makes `solve()` non-deterministic | CONFIRMED (executed) | `6cf5060` | `solver.rs:186`, `:970`, `:1317`, `:1574`; `validation.rs:518` | A + C | **yes — 30/30 distinct** |
| 4 | PlanScript both | a shared wall counts as a connection | PARTIALLY CONFIRMED — behaviour reproduces, "drift" framing refuted; the door test is vacuous | `6b0a0c0`, `6cf5060` | `validation/index.ts:338`; `validation.rs:463`; `validation.test.ts:635` | C | **yes** |
| 5 | ifc-lite | wall clock in the SVG title block | CONFIRMED (executed) | `be110ec` | `packages/drawing-2d/src/svg-exporter.ts:502` | C | **yes** |
| 6 | arch-plotter | zero panics under "CRASH-PROOF SAFETY NET" | CONFIRMED (executed) | `63cbd2e` | `src/Arch.typ:1411`, `:1443-1446` | C | **yes** |

Four of the six are backed by a run rather than a grep. That was deliberate: the paper argues
that reading a surface is not verifying it, and the corroboration should not be gathered by
the method the paper criticises.

## New findings beyond the four seeded claims

1. **`E101` is dead in the Rust port too** — so the dead-code defect survived a
   cross-language reimplementation by a different author (section 2). This is arguably the
   single most useful new result: it shows the failure is a property of *hand-maintained
   catalogues*, not of one author's carelessness.
2. **`E311 OPENING_EXCEEDS_WALL` is dead in PlanScript-TS** and live in the Rust port. Four
   dead codes in TS (`E101`, `E102`, `E311`, `E420`), three in Rust — overlapping but not
   identical sets, which is what you would expect if each was maintained by hand rather than
   derived (sections 1 and 2).
3. **`validateOpeningsOnWalls` (`src/validation/index.ts:394-409`) validates a dictionary
   lookup, not geometry.** It raises `E310` only when an opening's `wallId` fails to resolve
   to a wall in the list. It never checks that the opening's *position* lies on that wall,
   which is exactly what the assertion `openings_on_walls` names. A computed-then-narrowed
   check: sub-class B.
4. **The upstream door-connectivity test is vacuous** — it passes with the feature under test
   deleted (section 4). Demonstrated by execution.
5. **PlanScript's four dead codes have zero test references.** No test anywhere names `E101`,
   `E102`, `E311` or `E420` — consistent with codes that cannot fire, and confirmation that
   no gate would have caught their death.
6. **PlanScript-Rust serializes an unsorted `HashSet` into emitted error JSON**
   (`validation.rs:518`), so even the *diagnostics* of a "deterministic" compiler vary
   between runs (section 3).
7. **Two of PlanScript-Rust's five shipped example intents fail to solve at HEAD**, and
   `scripts/build-examples-intent.sh` runs under `set -e`, so the script that regenerates the
   examples cannot complete. The committed `.psc`/`.svg` for those two are artifacts of a
   build that no longer runs (section 3).
8. **arch-plotter's two "tests" cannot be compiled**, have no runner, and there is no CI at
   all — the import paths are resolved relative to the test file, so they have never run
   (section 6).

## Refutations and negative results

Stated plainly, because a refuted claim is a result.

1. **REFUTED (framing):** the seeded characterisation of `rooms_connected` as
   description-versus-implementation *drift* is wrong. `LANGUAGE_REFERENCE.md:1110-1113`
   documents the shared-edge rule accurately, and both implementations match it. The
   behaviour is exactly as described and is still a defect — the assertion's name and error
   code over-claim relative to what the check verifies, and its test is vacuous — but it
   belongs in sub-class C, not A. Do not cite this instance as an example of self-description
   drift.
2. **NEGATIVE:** ifc-lite's MCP `ToolErrorCode` catalogue has **no** dead codes; all 11 are
   in active use. The declared-but-never-raised pattern is not universal, and a project can
   evidently keep a small error catalogue honest.
3. **NEGATIVE:** PlanScript's parser is generated by peggy from `src/parser/grammar.pegjs`
   and regenerated on every `npm test` and `npm run build`, so `src/parser/grammar.ts` is not
   committed and cannot drift. Searched for, not found. The generated-artifact-drift pattern
   from sub-class A does not appear in these codebases in its grammar form.
4. **NEGATIVE:** `scripts/build-examples-*.sh` in both PlanScript repositories correctly use
   `set -e`. The "test script that cannot fail" pattern was looked for and is not present
   there. (arch-plotter's failure, section 6, is the absence of any runner at all, which is a
   different thing.)

## Script verification log

Every script was run against its clone. Recorded verbatim:

```
planscript-e101:                exit=0
rooms-connected-vacuous:        exit=0
planscript-rust-dead-codes:     exit=0
planscript-rust-nondeterminism: exit=0
ifc-lite-svg-clock:             exit=0
arch-plotter-no-diagnostics:    exit=0
```

**Negative controls, to prove the scripts are not themselves vacuous.** For each script a
scratch copy of the clone was patched to remove the evidence, and the script re-run. All six
correctly exited non-zero with a specific message:

| Script | Evidence removed in the scratch copy | Exit | Message |
|---|---|---|---|
| `planscript-e101` | made `isPolygonClosed` actually test closure | 1 | `the body no longer ends in an unconditional 'return true'` |
| `rooms-connected-vacuous` | deleted the share-edge adjacency pass | 1 | `the share-edge adjacency pass is gone` |
| `planscript-rust-dead-codes` | added one `ErrorCode::RoomNoAccess` construction | 1 | `RoomNoAccess now HAS a raise site - claim no longer holds` |
| `planscript-rust-nondeterminism` | changed `placed` to a `BTreeMap` | 1 | `PlanState.placed is no longer a HashMap - claim no longer holds` |
| `ifc-lite-svg-clock` | replaced the `Date` call with a constant | 1 | (static assertion on line 502 fails) |
| `arch-plotter-no-diagnostics` | appended one `assert(...)` to `src/Hatches.typ` | 1 | `the library now raises 1 diagnostic(s) - claim no longer holds` |

No script passes on a codebase where its finding has been fixed. Each one names *which* piece
of evidence went missing rather than failing generically, so a future re-pin that goes red
tells you whether the upstream project fixed the defect or merely moved the code.

Clone cleanliness after all runs — `git status --porcelain | wc -l` for each:

```
planscript         0 tracked changes
planscript-rust    0 tracked changes
ifc-lite           0 tracked changes
arch-plotter       0 tracked changes
```

### Running everything

```sh
sh planscript-e101/run.sh                /path/to/planscript
sh rooms-connected-vacuous/run.sh        /path/to/planscript
sh planscript-rust-dead-codes/run.sh     /path/to/planscript-rust
sh planscript-rust-nondeterminism/run.sh /path/to/planscript-rust 30
sh ifc-lite-svg-clock/run.sh             /path/to/ifc-lite
sh arch-plotter-no-diagnostics/run.sh    /path/to/arch-plotter
```

Optional toolchains for the executed halves: `cargo` for section 3 (or `PLANSCRIPT_BIN=`),
a built PlanScript-TS clone for section 4, `tsx` for section 5, `typst` for section 6. Each
script degrades to its static half with a printed notice rather than reporting a false
negative, and exits non-zero only when the evidence itself has gone. That distinction is the
point: a guard that cannot tell "not checked" from "checked and fine" is the thing this
directory exists to document.
