> Research record, 2026-10-26, measured on `main@0413af3d` (PR #281), built CLI `archlang v1.43.1`. Card
> PS1.4; question: `../README.md` § 8 Q3 (the owner's ask of 2026-10-18, "什么样的诊断措辞最利于 AI 修复").
> Harness: `scripts/research/diagnostic-wording/`. Replies, scores and transcripts are kept outside the
> repository. Read observations as evidence and diagnoses as hypotheses: every number here is one draw.

# Which diagnostic wording repairs best (PS1.4)

## Headline

| Variant | sonnet: fixed / unchanged / broke (of 59) | haiku: fixed / unchanged / broke (of 59) | Both models |
|---|---|---|---|
| `facts` (measured facts only) | 46 / 8 / 5 (78 %) | 46 / 6 / 7 (78 %) | 92 |
| `rule` (catalogue one-liner, no numbers) | 49 / 5 / 5 (83 %) | 42 / 8 / 9 (71 %) | 91 |
| `fix` (the hints only) | **52** / 2 / 5 (88 %) | 45 / 3 / 11 (76 %) | 97 |
| `current` (message + hints + catalogue fix, as `arch lint` prints them) | 51 / 3 / 5 (86 %) | **51** / 3 / 5 (86 %) | **102** |

**Verdict: the data does not support a wording rule.** The rule needed a variant that is best on both
models by at least 3 cases (5 % of 59). The best variant differs by model. On sonnet `fix` leads `current`
by one case. On haiku `current` leads `facts` by five. The transfer check fails. What the data does
show: `current` is never more than one case behind the best on either model. Pooled over both models,
`current` beats `facts` (15 cases fixed by `current` only, against 5 by `facts` only; sign test p 0.04)
and beats `rule` (16 against 5, p 0.03). Six pairs were tested, so neither result survives a Bonferroni
correction. The working reading for the catalogue: keep the current combination of a message with
facts and a hint with an instruction. Do not cut messages down to facts only or to a rule only. The
next section says what would support a rule.

## Method

**Cases.** `test/defect-corpus/` holds 73 cases that are not `.clean` twins. The 59 whose default
`lint()` reports their `expect` code were all used: they span 25 codes in 7 of the 8 classes. No case
was sampled, because the card's bound is 80. The 14 cases left out are the corpus's `todo` cases:
`W_DIM_INSIDE`, `W_EXIT_SWINGS_INWARD`, `W_PATH_TOO_NARROW` ×2, `W_DOORWAY_BLOCKED`, `W_HOB_FRIDGE_GAP`,
`W_LEAF_TOO_WIDE`, `W_FOOTPRINT_TRANSPOSED`, `W_WARDROBE_FRONT_CLEARANCE` ×2, `W_STAIR_TOO_STEEP`,
`W_SWING_OVER_STAIR` ×2 and `W_STAIR_HEAD_VOID`. All four stair cases are among them, so the stair class
has no case here.

**What the author sees.** Two edits were made to each case's source, so that it does not give the answer
away:
- The `# key: value` header was removed. Its `fact:` line states the defect.
- The plan title was replaced by `"Plan"`. Most titles name the defect ("Bedroom without a window").
  The title was replaced only where every diagnostic's code, message and hints stay identical with the
  new title. That held for all 59 cases.

Line numbers refer to this shown source. Three cases raise their code more than once:
`living-via-bedrooms` ×2, `two-bed-chain` ×3 and `fa-no-wall-living-bedrooms` ×2. In those the author is
shown the first instance.

**The four texts.** All four come from the case's own `lint()` diagnostic and from `ERROR_CATALOG` at
run time (`lib.ts`). None is retyped:

| Variant | Source | Derivation |
|---|---|---|
| `facts` | the diagnostic's `message` | First sentence (up to the first `. ` before a capital, a quote or `(`). Then, for 14 codes, the template `FACTS_EDITS` cuts the threshold, the consequence or the rule clause; per code below. An edit that matches no message in the corpus fails the build |
| `rule` | `ERROR_CATALOG[code].message`, the one-line summary `arch explain` prints first | Mechanical, every code. The build checks it holds no digit |
| `fix` | the diagnostic's `hints`, each as a `= help:` line | Mechanical. Every case carries hints, so the catalogue-`fix` fallback was never used. Hints may name ids (PS2.29 allows ids only there) |
| `current` | `message`, then each hint as `= help:`, then `= fix:` and the catalogue `fix` | Mechanical: the lines `arch lint` prints for the diagnostic, without the code tag and the source excerpt (see the frame below) |

How `facts` was derived, per code (`whole` means the message was a single sentence; `+ n` is the
number of template edits applied):

| Code | Cases | `facts` | Code | Cases | `facts` |
|---|---|---|---|---|---|
| `W_ANNOTATION_OVERLAP` | 4 | whole + 1 | `W_HABITABLE_NO_WINDOW` | 3 | whole + 1 |
| `W_BATH_VIA_BEDROOM` | 1 | whole | `W_LEAF_ACROSS_DOORWAY` | 1 | whole + 2 |
| `W_BEDROOM_NO_WINDOW` | 1 | whole | `W_OPENING_AT_JUNCTION` | 9 | first sentence |
| `W_BOUNDARY_NO_WALL` | 1 | first sentence + 1 | `W_OPENING_OVERLAP` | 5 | first sentence (+ 1 on the pier form) |
| `W_CONNECTOR_AMBIGUOUS` | 1 | first sentence + 2 | `W_PATH_TOO_NARROW` | 3 | whole + 1 |
| `W_DIM_TEXT_MISMATCH` | 1 | whole | `W_ROOM_MISSING_DEFINING` | 5 | whole + 1 |
| `W_DOOR_NEAR_CORNER` | 1 | whole + 3 | `W_ROOM_NOT_ENCLOSED` | 1 | whole |
| `W_ENTRANCE_INTO_PRIVATE` | 1 | first sentence | `W_ROOM_OUTSIDE_SHELL` | 2 | first sentence |
| `W_FLOOR_UNASSIGNED` | 2 | first sentence + 1 | `W_ROOM_VIA_PRIVATE` | 3 | first sentence |
| `W_FOOTPRINT_TRANSPOSED` | 1 | whole + 2 | `W_SEAT_FACING_AWAY` | 1 | whole |
| `W_FURNITURE_OVER_WINDOW` | 2 | whole + 1 | `W_SWING_OBSTRUCTED` | 1 | whole + 1 (rewritten as facts) |
| `W_WC_SIDE_CLEARANCE` | 2 | whole + 1 | `W_TITLE_OVERFLOW` | 1 | whole |
| `W_WET_ROOM_DOOR` | 6 | first sentence | | | |

**The author prompt, fixed.** This is the template (`authorPrompt` in `lib.ts`). `<…>` marks the three
parts filled per case and the one part filled per variant. The prompt gives no spec and no other
document:

````text
Here is a floor plan written in ArchLang, a language whose `.arch` source compiles to an SVG floor plan.

```arch
<the shown source>
```

The linter reports one warning, on line <L> (`<that line, trimmed>`):

<the variant's text>

Make the minimal edit to the source that resolves this. Reply with the full file only.
````

The frame names the line and quotes it for every variant, because a real diagnostic always has a span.
The code name (`W_…`) is left out of every variant. It is itself a short rule wording, and it would
blur the gap between `facts` and `rule`.

The four texts for `clearances/leaf-across-doorway`, verbatim:

````text
facts:   In "Hall", the open leaf of the door from outside parks 200 mm in front of the door to "Bedroom 2" and leaves 150 mm of its 800 mm doorway clear.
rule:    A door's open leaf parks across another doorway's approach.
fix:     = help: Hang door "d_front" on its other jamb (flip its `hinge`), which parks the leaf clear of this doorway, or open it to the other side of its wall (flip its `swing`).
         = help: Or move door "d_front" or door "d_bed" along its wall until the open leaf stands at least 300 mm clear of the doorway's face, or beside it.
         = help: Or make door "d_front" a `sliding` or `pocket` door, which parks no leaf in the room.
current: In "Hall", the open leaf of the door from outside parks 200 mm in front of the door to "Bedroom 2" and leaves 150 mm of its 800 mm doorway clear (700 mm needed), so one door must be shut to use the other.
         <the three = help: lines above>
         = fix: Hang the leaf on its other jamb (flip its `hinge`; the hint says when that clears the doorway), open it to the other side of its wall (flip its `swing`), move either door along its wall until the open leaf stands at least the approach depth clear of the doorway's face or beside it, or make it a `sliding` or `pocket` door. There is no machine-applicable fix: which door moves or turns is a design decision.
````

(The labels and the indent are added here for reading. In the prompt the text stands alone.)

**Dispatch.** One headless `claude -p` session per model, using the machine's Claude Code 2.1.310
subscription. It is local and unpaid: no `eval:live`, nothing under `eval/` or `dataset/`. Each session
was started from its own folder outside the repository, so no project instructions loaded. It ran with
`CLAUDECODE` unset, `--model sonnet` or `--model haiku`, `--dangerously-skip-permissions`,
`--strict-mcp-config`, `--settings '{"disableAllHooks":true}'`, `--agents agents.json` and
`--output-format json`. The README in the harness folder has the exact line.

Each session dispatched 236 `wording-author` subagents (59 cases × 4 variants) and ran each prompt once.
The authors had tools `Read` and `Write` only and `model: inherit`. The author's prompt, verbatim
(`author-agent.md`):

```text
You edit one file for a study. The message you receive names a task file and a reply file.

Read the task file with the Read tool. It is the only file you may read. Do what it asks. Then write your reply, exactly what the task asks you to reply with and nothing else, to the reply file with the Write tool.

Do not read, list or search any other file, and use no tool other than one Read and one Write. When the reply file is written, answer with the single word: done
```

The dispatcher's prompt is `dispatcher-prompt.md`, verbatim in the harness. It tells the dispatcher to
read the job list once, send six Agent calls per message, wait, and go on in file order, adding nothing
to the prompts.

| Setting | sonnet | haiku |
|---|---|---|
| Model that answered (every author transcript) | `claude-sonnet-5-5` | `claude-haiku-5-5` |
| Dispatcher session | `dac813b1-7910-47e8-912b-a69e1f5bbd69` | `c8f46f1f-66f3-4b27-bf64-7ec992c1bffd` |
| Agent calls per dispatcher message | 6 ×39, then 2 | 6 ×30, 8 ×7 (the dispatcher said so in its reply) |
| Wall time | about 13 min | about 10 min |
| API-metered cost the session reports (the subscription paid it) | about $5.43 | about $0.62 |
| Replies | 236 of 236, none fenced | 236 of 236, 15 in a code fence (the scorer reads the first fenced block) |
| Author compliance (`transcripts.ts`) | 236 strict: one `Read` of its task, then one `Write` of its reply | 210 strict. The other 26 made one more call after the `Write` (re-read their own reply or task, a `Read` with no path, one second `Write` of the same reply). No author touched another job's file or any other file |

**Scoring** (`score.ts`). Each reply was re-linted with the same build. Its code set is `lint()` plus
the compile channel's warnings, counted per code. The outcomes are:
- `broke`: the reply has a compile error, or it raises a code its baseline did not.
- `unchanged`: otherwise, when the expected code fires at least as often as before.
- `fixed`: otherwise. In the three multi-instance cases this includes fewer instances (`partial`: 2 sonnet
  and 4 haiku replies).

Also recorded:
- changed lines (an LCS line diff, added + removed);
- statements deleted, by leading keyword;
- `relabelled`: any `label` text or `uses` word changed;
- a twin-adjusted outcome, in which a new code that the case's own clean twin also raises does not
  count as broke (see the per-code notes).

## Results

| Model | Variant | Fixed | Unchanged | Broke | Fixed, twin-adjusted | Median changed lines (fixed) | Fixed by deleting a statement | Fixed by relabelling |
|---|---|---|---|---|---|---|---|---|
| sonnet | facts | 46 | 8 | 5 | 48 | 2 | 2 | 1 |
| sonnet | rule | 49 | 5 | 5 | 51 | 2 | 2 | 0 |
| sonnet | fix | 52 | 2 | 5 | 54 | 2 | 1 | 0 |
| sonnet | current | 51 | 3 | 5 | 53 | 2 | 1 | 0 |
| haiku | facts | 46 | 6 | 7 | 48 | 2 | 2 | 1 |
| haiku | rule | 42 | 8 | 9 | 44 | 2 | 2 | 1 |
| haiku | fix | 45 | 3 | 11 | 47 | 2 | 1 | 0 |
| haiku | current | 51 | 3 | 5 | 53 | 2 | 1 | 0 |

How to read the deletion and relabelling columns:
- Deleting a statement: 8 of the 12 rows (every variant on both models) are `bath-leafless-to-living`'s
  `opening` rewritten as a `door`, which is the hint's own fix. The other 4 delete the garage door in
  `wc-utility-passage`, under `facts` and `rule` only. That is a fix the hint, which re-hosts the door,
  would not make.
- Relabelling: all three silenced `W_ANNOTATION_OVERLAP` by shortening a room label ("Bedroom 4" became
  "Bed 4") or dropping it. That is an evasion, and it appears only under `facts` and `rule`.

**Paired, same cases** (cases fixed by A only / by B only, exact two-sided sign test):

| A vs B | sonnet | haiku | Both models pooled |
|---|---|---|---|
| facts vs rule | 4 / 7, p 0.55 | 8 / 4, p 0.39 | 12 / 11, p 1.00 |
| facts vs fix | 2 / 8, p 0.11 | 9 / 8, p 1.00 | 11 / 16, p 0.44 |
| facts vs current | 3 / 8, p 0.23 | 2 / 7, p 0.18 | 5 / 15, p 0.04 |
| rule vs fix | 2 / 5, p 0.45 | 9 / 12, p 0.66 | 11 / 17, p 0.34 |
| rule vs current | 2 / 4, p 0.69 | 3 / 12, p 0.04 | 5 / 16, p 0.03 |
| fix vs current | 1 / 0, p 1.00 | 1 / 7, p 0.07 | 2 / 7, p 0.18 |

**Fixed per class** (the corpus's code families; cases per class in the second column):

| Class | Cases | sonnet facts | sonnet rule | sonnet fix | sonnet current | haiku facts | haiku rule | haiku fix | haiku current |
|---|---|---|---|---|---|---|---|---|---|
| annotation-collisions | 6 | 5 | 4 | 3 | 2 | 5 | 3 | 3 | 4 |
| circulation-privacy | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 7 | 11 |
| clearances | 11 | 11 | 8 | 11 | 11 | 9 | 10 | 10 | 9 |
| daylight | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| missing-defining-contents | 5 | 3 | 4 | 5 | 5 | 3 | 2 | 5 | 5 |
| openings-ignore-walls | 16 | 9 | 14 | 14 | 14 | 11 | 9 | 13 | 14 |
| space-not-enclosed | 6 | 3 | 4 | 4 | 4 | 3 | 3 | 3 | 4 |

**Transfer check.**
- Ranks by fixed count: sonnet `fix` > `current` > `rule` > `facts`; haiku `current` > `facts` > `fix` > `rule`.
- The best variant does not agree across the models. `current` is in the top two on both.
- The models gave the same outcome in 201 of 236 case × variant cells.
- Few cases tell the variants apart. 28 cases were fixed in all eight cells. All four variants gave the
  same outcome on 44 cases for sonnet and 32 for haiku, which leaves 15 and 27 cases that discriminate.

**Per case** (F fixed, U unchanged, B broke; the four letters are `facts rule fix current`):

| Case | Code | sonnet | haiku |
|---|---|---|---|
| annotation-collisions--dim-text-lies | W_DIM_TEXT_MISMATCH | FFFF | FFFF |
| annotation-collisions--label-over-bed | W_ANNOTATION_OVERLAP | FFUU | FFUU |
| annotation-collisions--label-over-wc | W_ANNOTATION_OVERLAP | UUUU | FFUF |
| annotation-collisions--radius-over-label | W_ANNOTATION_OVERLAP | FUFU | FUFF |
| annotation-collisions--radius-over-piece | W_ANNOTATION_OVERLAP | FFFF | BUFF |
| annotation-collisions--title-overflow | W_TITLE_OVERFLOW | FFBB | FUBB |
| circulation-privacy--bath-door-off-kitchen | W_WET_ROOM_DOOR | FFFF | FFFF |
| circulation-privacy--bath-leafless-to-living | W_WET_ROOM_DOOR | FFFF | FFFF |
| circulation-privacy--bath-off-open-plan | W_WET_ROOM_DOOR | FFFF | FFBF |
| circulation-privacy--bath-via-bedroom | W_BATH_VIA_BEDROOM | FFFF | FFFF |
| circulation-privacy--bedroom-via-bedroom | W_ROOM_VIA_PRIVATE | FFFF | FFFF |
| circulation-privacy--entry-into-bedroom | W_ENTRANCE_INTO_PRIVATE | FFFF | FFFF |
| circulation-privacy--living-via-bedrooms | W_ROOM_VIA_PRIVATE | FFFF | FFBF |
| circulation-privacy--two-bed-chain | W_ROOM_VIA_PRIVATE | FFFF | FFBF |
| circulation-privacy--wc-off-dining | W_WET_ROOM_DOOR | FFFF | FFUF |
| circulation-privacy--wc-off-servery | W_WET_ROOM_DOOR | FFFF | FFFF |
| circulation-privacy--wc-utility-passage | W_WET_ROOM_DOOR | FFFF | FFFF |
| clearances--bed-blocks-alcove | W_PATH_TOO_NARROW | FFFF | BFBB |
| clearances--bench-across-opening | W_PATH_TOO_NARROW | FFFF | FFFF |
| clearances--fridge-in-swing | W_SWING_OBSTRUCTED | FUFF | UFFU |
| clearances--fridge-over-window-end | W_FURNITURE_OVER_WINDOW | FFFF | FFFF |
| clearances--fridge-over-window | W_FURNITURE_OVER_WINDOW | FBFF | FFFF |
| clearances--leaf-across-doorway | W_LEAF_ACROSS_DOORWAY | FFFF | FFFF |
| clearances--masked-route-balcony-door | W_PATH_TOO_NARROW | FFFF | FFFF |
| clearances--seat-facing-away | W_SEAT_FACING_AWAY | FFFF | FFFF |
| clearances--sofa-l-transposed | W_FOOTPRINT_TRANSPOSED | FFFF | FFFF |
| clearances--wc-centre-to-basin | W_WC_SIDE_CLEARANCE | FFFF | FFFF |
| clearances--wc-side-clearance | W_WC_SIDE_CLEARANCE | FUFF | FUFF |
| daylight--accessible-living-no-window | W_HABITABLE_NO_WINDOW | FFFF | FFFF |
| daylight--bedroom-no-window | W_BEDROOM_NO_WINDOW | FFFF | FFFF |
| daylight--living-bay-no-window | W_HABITABLE_NO_WINDOW | FFFF | FFFF |
| daylight--living-label-no-window | W_HABITABLE_NO_WINDOW | FFFF | FFFF |
| missing-defining-contents--bath-no-shower | W_ROOM_MISSING_DEFINING | FFFF | FFFF |
| missing-defining-contents--bedroom-no-bed | W_ROOM_MISSING_DEFINING | FFFF | FBFF |
| missing-defining-contents--dining-no-table | W_ROOM_MISSING_DEFINING | FFFF | FFFF |
| missing-defining-contents--kitchen-no-worktop | W_ROOM_MISSING_DEFINING | BFFF | BBFF |
| missing-defining-contents--servery-no-sink | W_ROOM_MISSING_DEFINING | UUFF | UUFF |
| openings-ignore-walls--bifold-overlaps-window | W_OPENING_OVERLAP | FFFF | FUFF |
| openings-ignore-walls--door-fills-gap | W_OPENING_AT_JUNCTION | UBBB | UBBB |
| openings-ignore-walls--door-jamb-50-from-tee | W_OPENING_AT_JUNCTION | FFFF | FFFF |
| openings-ignore-walls--door-near-l-corner | W_DOOR_NEAR_CORNER | FFFF | FFFF |
| openings-ignore-walls--door-notches-tee-wall | W_OPENING_AT_JUNCTION | UFFF | FFFF |
| openings-ignore-walls--door-on-exterior-tee | W_CONNECTOR_AMBIGUOUS | FFFF | FFFF |
| openings-ignore-walls--door-window-overlap-chamfer | W_OPENING_OVERLAP | UFFF | FBFF |
| openings-ignore-walls--double-leaf-pier-chamfer | W_OPENING_OVERLAP | FFFF | FFFF |
| openings-ignore-walls--fa-door-across-tee | W_OPENING_AT_JUNCTION | BBBB | BBBB |
| openings-ignore-walls--fa-window-overlaps-entry | W_OPENING_OVERLAP | UFFF | FBFF |
| openings-ignore-walls--opening-between-two-tees | W_OPENING_AT_JUNCTION | FFFF | FFBF |
| openings-ignore-walls--opening-crossed-by-partition | W_OPENING_AT_JUNCTION | UFFF | UUFF |
| openings-ignore-walls--wc-window-crossed-by-partition | W_OPENING_AT_JUNCTION | FFFF | FUFF |
| openings-ignore-walls--window-overlaps-door | W_OPENING_OVERLAP | UFFF | UFFF |
| openings-ignore-walls--window-past-corner | W_OPENING_AT_JUNCTION | FFFF | FFFF |
| openings-ignore-walls--window-straddles-tee | W_OPENING_AT_JUNCTION | FFFF | UFFF |
| space-not-enclosed--bath-open-side | W_ROOM_NOT_ENCLOSED | BBBB | BBBB |
| space-not-enclosed--bow-strip-unassigned | W_FLOOR_UNASSIGNED | FFFF | BBFF |
| space-not-enclosed--fa-no-wall-living-bedrooms | W_BOUNDARY_NO_WALL | BFFF | FFBF |
| space-not-enclosed--room-past-shell | W_ROOM_OUTSIDE_SHELL | FFFF | FFFF |
| space-not-enclosed--round-snug-unassigned | W_FLOOR_UNASSIGNED | BBBB | BBBU |
| space-not-enclosed--widen-after-outside-shell | W_ROOM_OUTSIDE_SHELL | FFFF | FFFF |

## Per-code notes (what the replies did)

- **`W_TITLE_OVERFLOW`: the hint misleads without the spec.** All four `fix` and `current` replies broke,
  on both models, with `E_PARSE: Unknown title field "notes"`. The hint and the catalogue `fix` say "move the
  rest to a `notes "…"` line". Every author put that line inside `title { }`, but `notes` is a plan-level
  statement. The `facts` and `rule` authors shortened the value instead (3 of 4 fixed). Filed as PS2.62:
  say where the line goes ("a plan-level `notes "…"` line, outside the `title { }` block"). Authors with
  the spec could look this up; these authors could not.
- **`W_ANNOTATION_OVERLAP`: the hint gives no point.** The hint says "Give it a clear point with
  `label "…" at (x,y)`" but does not say which point. Authors chose one that was still over the symbol, so
  sonnet's `current` fixed 2 of 6 cases in this class, its lowest. Three of the `facts`/`rule` fixes are
  relabels (a shorter name), an evasion. Filed as PS2.63: quote a computed clear point in the hint, as the
  opening hints quote checked positions.
- **`W_OPENING_AT_JUNCTION` and `W_OPENING_OVERLAP`: checked positions repair.** These hints quote a checked
  `at`/`on … at` clause. Sonnet fixed 14 of 16 cases with `fix` and with `current`, against 9 with `facts`.
  The `facts` text drops the 100 mm nib and the mullion size, so authors moved the opening too little (a
  window moved 300 mm where the hint's checked move is 350 mm; an opening moved 600 mm where it is 675 mm). This is
  the clearest per-code effect in the data: a number the author must reach is worth stating.
- **`W_ROOM_MISSING_DEFINING`: the hint names every piece.** In `servery-no-sink` the room lacks two pieces.
  The `facts`/`rule` authors added only the sink (`UU` on both models); the hint names both (`FF`).
- **Circulation (`W_ROOM_VIA_PRIVATE`, `W_WET_ROOM_DOOR`): the hint alone loses the target.** Haiku's `fix`
  variant failed 4 of the 11 circulation cases: 3 broke (the front door moved to another wall; a room
  shrunk, which leaves `W_FLOOR_UNASSIGNED`) and 1 came back unchanged. With the message in front of the hint (`current`) it fixed 11 of 11. Sonnet fixed
  all 11 in every variant.
- **`door-fills-gap`: the authors narrowed the door.** None of the 8 replies fixed it. Six narrowed the door
  to 800 or 700 mm, the "constraint laundering" `W_DOOR_NEAR_CORNER`'s hint warns against, which either left
  the junction or raised `W_PATH_TOO_NARROW`; two moved the door or the partition so that the door spanned two rooms (`W_CONNECTOR_AMBIGUOUS`). The hint says no position on this run works and to move the door
  to another wall the rooms share. Neither model did.
- **Corpus artifacts: `bath-open-side` and `fa-door-across-tee`.** Both broke in all 8 replies each, on
  `W_PATH_TOO_NARROW`. Their own clean twins raise the same code: the case's fix unmasks a 700 mm door that
  is 640 mm clear, which the defect had hidden (the room was reached another way). The twin-adjusted column
  scores these as fixed, adding 2 to every cell. Filed as PS1.6: give each of the two cases a door the path
  rule passes, so the corpus case holds one defect.
- **`round-snug-unassigned`: the authors invented syntax.** 7 of 8 replies are `E_PARSE` (`room … rect
  (0,0) (3800,2400)`). Without the spec the authors had to make up the form of a rectangular room. This
  confound is the same for every variant.

## PS2.29 folded in

Nothing here argues for putting ids back into messages. `facts` and `rule` carry no id, and `fix` and
`current` carry the ids PS2.29 allows in hints. Sonnet's best variant (`fix`) and haiku's (`current`) both
carry hint ids. The study cannot separate the effect of the ids from the effect of the instruction around
them. The PS2.29 rule stands as it is (`README.md` §5: no message quotes an id; ids only in `hint`). Any
wording rule a later card writes keeps that as its first clause.

## What would support a rule

- **Repeat draws.** Run each prompt at least three times per model. The models already disagree on 35 of
  236 cells, and one draw cannot tell wording from sampling noise.
- **A third model,** to settle the transfer question this run left open.
- **More discriminating cases.** 28 of 59 cases were fixed in all eight cells, so they say nothing about
  wording.
- **The spec in the author's context,** as real authors have it. It would remove the `notes` and `rect`
  syntax confounds above, which fall unevenly on the variants.
- **A margin stated before the run** and a correction for six pairwise tests.

With those, a rule could be tested in its likely form: "the message states the measured facts and the
number to reach; the hint quotes a checked edit". The `facts`-versus-`current` gap on the opening codes is
the effect it would have to reproduce.

## Confounders

- **Single draw** per prompt per model. Every cell is one sample.
- **Model versions.** `claude-sonnet-5-5` and `claude-haiku-5-5` answered, as Claude Code 2.1.310
  subagents. The authors' context also held the dispatching machine's global user instructions, which are
  the same for every variant.
- **The corpus is lint-driven.** Each case is defined by the rule that catches it, and the outcome is
  that same lint. `fixed` means the rule stopped firing without a new code. It does not mean an architect
  would accept the edit. The relabels and the deleted garage door above are fixes by that measure.
- **No spec,** by the card's design. Real authors have `spec.llm.md`, and syntax guesses cost some
  variants more than others.
- **Minimal plans.** The shown sources are 7 to 21 lines with one defect each, so a median edit is 2 lines. Real
  plans are larger and carry many warnings at once.
- **Stair class.** Its four corpus cases are `todo`, so the stair class is absent.
- **Run differences.** The haiku dispatcher sent 8 calls per message seven times. 26 haiku authors made one
  extra call on their own files after writing the reply.
