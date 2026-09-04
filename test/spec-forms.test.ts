/**
 * The EXECUTABLE-SPEC gate — every form `spec.llm.md` teaches must actually compile,
 * and every illegality it names must actually be refused.
 *
 * ## Why this file exists
 *
 * `spec.llm.md` is generated from hand-typed grammar strings in
 * `scripts/gen-llm-spec.ts`. Because the generator faithfully reproduces whatever was
 * typed, `npm run check:drift` stayed green for releases while **seven of nineteen
 * grammar lines were factually wrong and four taught forms that do not compile**
 * (`7377a65`); the sibling GBNF generator had eleven more (`2ac49ef`). Measured
 * downstream, 11 of 18 LLM generations failed. The drift gate cannot see any of it:
 * it compares a generator's OUTPUT to the committed file, which proves reproducibility,
 * never correctness.
 *
 * **Only execution can close that gap.** So this file runs the spec through the real
 * compiler:
 *
 *  1. **Every documented form compiles clean.** A minimal snippet per form, written by
 *     copying its grammar line. This is what catches a WRONG ORDER: a snippet copied
 *     from a line that lies does not compile.
 *  2. **Every illegality the spec names is refused with its catalogued code.** With the
 *     distinction that matters kept explicit — a diagnostic with **no `code`** is a parse
 *     error, a catalogued `E_*` is a resolve-time refusal — so a form that quietly
 *     downgrades from one to the other is a failure, not a pass.
 *  3. **The binding.** Set-equality between documented and covered KEYWORDS catches a new
 *     keyword; {@link clauseAtoms} coverage catches a new CLAUSE on an existing keyword.
 *     `clauseAtoms` is the exact inverse of `assertDoorEnumsRendered` /
 *     `assertVocabRendered`: those assert "a table entry has a rendering", this asserts
 *     "a rendering has an exercise".
 *  4. **Anti-vacuity.** `clauseAtoms` is pinned against a synthetic line, and a planted
 *     new clause with no snippet is PROVED to be caught.
 *
 * ## When this goes red
 *
 * A failing positive snippet means **the spec is wrong — fix the generator, not the
 * corpus.** (Unless you conclude the PARSER is wrong, in which case stop and raise it:
 * changing compiler behaviour to match a doc is how a doc becomes the spec by accident.)
 * A failing coverage assertion means a keyword or clause was added to the spec with no
 * snippet proving it works: add the snippet.
 *
 * The "compiles clean" definition and the collect-then-`expect([])` shape are borrowed
 * verbatim from `test/docs-fences.test.ts`, so one run reports the FULL list rather than
 * aborting on the first failure. The corpus is inline (the `test/door-enums.test.ts`
 * precedent): ~50 one-line `.arch` files in a directory would be far worse to review.
 */

import { describe, expect, it } from "vitest";
import { compile, lint, ERROR_CATALOG } from "../src/index.js";
import {
  assertScriptingKeywordsTaught,
  clauseAtoms,
  CLAUSE_ATTRIBUTES,
  ELEMENT_GRAMMAR,
  renderLlmSpec,
  SCRIPTING_KEYWORDS,
  SETTING_GRAMMAR,
  SPEC_EXAMPLES,
  STATEMENT_GRAMMAR,
} from "../scripts/gen-llm-spec.js";
import { AUTO_DIMS_MODES, AXIS_ALIGNS, FURNITURE_ANCHORS, OUTDOOR_KINDS, REL_ALIGNS } from "../src/ast.js";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** `test/docs-fences.test.ts`'s definition of clean, verbatim: errors only. A doc
 *  example may be architecturally imperfect (warnings are fine); it may not fail to
 *  compile. `noCache` so a snippet is never served from a sibling test's memo. */
const errorsOf = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");

/** Wrap a body in the smallest legal plan. */
const plan = (body: string): string => `plan "Spec" {\n  units mm\n${body}\n}\n`;

/** A closed exterior box every opening/fixture snippet can host onto. */
const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
/** …plus the room that fills it, for `swing into` / `in <room>` clauses. */
const ROOM = `  room id=r1 at (0,0) size 8000x5000 uses living`;

/** A relational direction that actually aligns on `edge`'s own cross axis — `right-of`
 *  for a vertical edge, `below` for a horizontal one. Derived from `AXIS_ALIGNS`, so a
 *  seventh edge added there is paired with a direction that takes it without anyone
 *  editing this file, and a REORDERED table cannot quietly re-pair the existing six. */
const dirForAlign = (edge: string): string =>
  (AXIS_ALIGNS.v as readonly string[]).includes(edge) ? "right-of" : "below";

interface Snippet {
  /** The documented keyword this snippet exercises. */
  keyword: string;
  /** What form it is copied from — printed on failure. */
  note: string;
  src: string;
}

// ---------------------------------------------------------------------------
// 1. The positive corpus — every documented form, copied from its grammar line
// ---------------------------------------------------------------------------

const POSITIVE: Snippet[] = [
  // --- wall -----------------------------------------------------------------
  {
    keyword: "wall",
    note: "id= leads, material + scale/angle, close",
    src: plan(
      `  wall id=w1 exterior thickness 200 material brick scale 2 angle 30 { (0,0) (6000,0) (6000,4000) (0,4000) close }`,
    ),
  },
  {
    keyword: "wall",
    note: "arc edge: radius + cw + major",
    src: plan(`  wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 cw major (6000,4000) }`),
  },
  {
    keyword: "wall",
    note: "arc edge: the ccw default, spelled",
    src: plan(`  wall id=bow exterior thickness 200 { (0,0) arc (6000,0) radius 4000 ccw }`),
  },
  {
    keyword: "wall",
    note: "`scale`/`angle`: either order, each once — the reverse order the line promises",
    src: plan(`  wall id=w1 exterior thickness 200 material concrete angle 30 scale 2 { (0,0) (4000,0) close }`),
  },
  {
    keyword: "wall",
    note: "the vertical `height` clause, last before the body and after `material`",
    src: plan(`  wall id=w1 exterior thickness 200 material brick height 2400 { (0,0) (4000,0) close }`),
  },

  // --- room -----------------------------------------------------------------
  {
    keyword: "room",
    note: "absolute: at + size + label at + uses (several)",
    src: plan(`  room id=r1 at (0,0) size 6000x4000 label "Living" at (3000,2000) uses living kitchen`),
  },
  {
    keyword: "room",
    note: "relational: right-of + align + gap",
    src: plan(
      `  room id=a at (0,0) size 3000x3000\n  room id=b right-of a align top gap 200 size 3000x3000\n  room id=c below a align center gap 100 size 3000x2000`,
    ),
  },
  {
    keyword: "room",
    note: "polygonal ring with a label override",
    src: plan(
      `  room id=p polygon (0,0) (6000,0) (6000,4000) (3000,4000) (3000,2000) (0,2000) label "L" at (1500,1000)`,
    ),
  },
  {
    keyword: "room",
    note: "relational: the other three directions and the other four alignments",
    src: plan(
      `  room id=a at (4000,4000) size 3000x3000\n  room id=b left-of a align bottom size 2000x2000\n` +
        `  room id=c above a align right size 2000x2000\n  room id=d below a align left size 2000x2000\n` +
        `  room id=e right-of a align middle size 2000x2000`,
    ),
  },
  {
    // Generated from `REL_ALIGNS`, so the day a seventh edge is added this snippet types
    // it — and if the parser's accept-set (`E_ROOM_ALIGN`) was not extended with it, this
    // goes red. The counterpart negative is the `E_ROOM_ALIGN` entry below: together they
    // pin the set from both sides, which is the whole reason the cast was a bug.
    //
    // The DIRECTION is generated too, and was not always. This snippet used to pin all six
    // edges to `right-of`, which made two of its own rows — `align left` and `align right`
    // on a HORIZONTAL relation — cross-axis. They passed, and could only have passed,
    // because `alignOffset` dropped a cross-axis edge on the floor in silence: the fixture
    // written to prove the accept-set was itself the repo's only specimen of the defect
    // `E_ROOM_ALIGN_AXIS` closes, and it asserted the silence was fine. Pairing each edge
    // with a direction of ITS OWN axis is what makes "accepted" mean accepted rather than
    // ignored; the two negatives below now own the mismatches this no longer covers.
    keyword: "room",
    note: "every alignment in REL_ALIGNS is accepted, each on a direction of its own cross axis",
    src: plan(
      `  room id=a at (20000,20000) size 3000x3000\n` +
        REL_ALIGNS.map((e, i) => `  room id=r${i} ${dirForAlign(e)} a align ${e} size 1000x1000`).join("\n"),
    ),
  },
  {
    // The 4/4 overlap, pinned positively. `alignOffset` tests `align === "middle" ||
    // align === "center"` before it tests anything axis-specific, so the centring edge is
    // honoured under BOTH spellings on BOTH axes — the per-direction accept-sets are four
    // words each, not a clean 3/3 split. That asymmetry is the one thing an axis check can
    // most easily get wrong (refusing `right-of … align center` would break working plans
    // that draw correctly today), so it is asserted here rather than left to inference.
    keyword: "room",
    note: "`middle`/`center` are the same instruction spelled twice — both legal on both axes",
    src: plan(
      `  room id=a at (0,0) size 3000x3000\n  room id=b right-of a align center size 1000x1000\n` +
        `  room id=c below a align middle size 1000x1000`,
    ),
  },
  { keyword: "room", note: "circular floor", src: plan(`  room id=c circle at (5000,5000) radius 3000`) },
  {
    keyword: "room",
    note: "rule 1 — the metric unit suffixes fold to mm (4m, 3.5m, 40cm, 20mm)",
    src: plan(`  room id=r1 at (0,0) size 4mx3.5m\n  column id=c1 at (40cm,20mm) size 300x300`),
  },
  {
    keyword: "room",
    note: "rule 3 — `<expr> x <expr>` with spaces is the other size form",
    src: plan(`  let W = 4000\n  room id=r1 at (0,0) size W x 3000`),
  },

  // --- door -----------------------------------------------------------------
  {
    keyword: "door",
    note: "on-wall placement + hinge + swing",
    src: plan(`${BOX}\n  door id=d1 on w1 at 50% width 900 hinge left swing in`),
  },
  {
    keyword: "door",
    note: "hinge near <vertex>, both ends",
    src: plan(`${BOX}\n  door on w1 at 20% width 900 hinge near start\n  door on w1 at 30% width 900 hinge near end`),
  },
  {
    keyword: "door",
    note: "absolute placement + the at-form-only `wall` clause + swing into",
    src: plan(`${BOX}\n${ROOM}\n  door at (4000,0) width 900 wall w1 swing into r1`),
  },
  {
    keyword: "door",
    note: "every kind, with the clauses each one accepts",
    src: plan(
      `${BOX}\n  door hinged on w1 at 5% width 900 hinge right\n  door sliding on w1 at 15% width 900 slide left open 0.5\n  door barn on w1 at 25% width 900 swing out slide right\n  door bifold on w1 at 35% width 900 swing in\n  door pocket on w1 at 45% width 900 slide left\n  door garage on w1 at 60% width 2400`,
    ),
  },
  {
    keyword: "door",
    note: "mm and `center` positions along a wall",
    src: plan(`${BOX}\n  door on w1 at center width 900\n  door on w1 at 1200 width 800`),
  },
  {
    keyword: "door",
    // AFTER `open`, which is where the grammar puts every vertical clause on all three
    // opening elements. A snippet that wrote it earlier would pass by accident only if the
    // parser were order-insensitive, which it is not.
    note: "the vertical `head`, trailing even `open` on a sliding leaf",
    src: plan(
      `${BOX}\n  door on w1 at 50% width 900 hinge left swing in head 2100\n` +
        `  door sliding on w1 at 20% width 900 slide left open 0.5 head 2400`,
    ),
  },
  {
    keyword: "door",
    note: "<pos> is an EXPRESSION — a `for`-generated run places itself along the wall",
    src: plan(
      `${BOX}\n  let bay = 1200\n  for i in 0..4 { door on w1 at bay * i + 600 width 800 }\n` +
        `  window on w1 at 10 + 15% width 900\n  opening on w1 at (bay % 500) + 4000 width 800`,
    ),
  },

  // --- window / opening ------------------------------------------------------
  {
    keyword: "window",
    note: "both placement forms; `wall` pairs with `at` only",
    src: plan(`${BOX}\n  window id=win1 on w1 at 30% width 1200\n  window at (6000,0) width 1000 wall w1`),
  },
  {
    keyword: "window",
    // `sill 0` is in here on purpose: it is the one height the language lets be zero, and
    // a range check written `> 0` for every clause alike would refuse a floor-length
    // window.
    note: "the vertical clauses, trailing everything — incl. the legal `sill 0`",
    src: plan(
      `${BOX}\n  window id=win1 on w1 at 30% width 1200 sill 600 head 2100\n` +
        `  window on w1 at 70% width 1000 sill 0\n  window at (6000,0) width 1000 wall w1 head 2400`,
    ),
  },
  {
    keyword: "opening",
    note: "both placement forms; `wall` pairs with `at` only",
    src: plan(`${BOX}\n  opening id=o1 on w1 at 60% width 1000\n  opening at (2000,0) width 1000 wall w1`),
  },
  {
    keyword: "opening",
    note: "the vertical `head`, trailing everything — no `sill`, it starts at the floor",
    src: plan(`${BOX}\n  opening id=o1 on w1 at 60% width 1000 head 2400`),
  },

  // --- furniture -------------------------------------------------------------
  {
    keyword: "furniture",
    note: "all four placement forms + size/label/rotate/in",
    src: plan(
      `${BOX}\n  room id=r1 at (0,0) size 8000x5000 uses bedroom\n` +
        `  furniture id=f1 bed at (1000,1000) size 1600x2000 label "Bed" rotate 90 in r1\n` +
        `  furniture id=f2 wc against wall w1 segment 0 offset 3000 side right size 400x600\n` +
        `  furniture id=f3 sofa in r1 centered size 2000x800\n` +
        `  furniture id=f4 desk in r1 anchor bottom-left flush inset 100 size 1200x600`,
    ),
  },
  {
    keyword: "furniture",
    note: "a catalogued fixture against a wall may omit `size` (multi-segment ⇒ `segment <n>`)",
    src: plan(
      `${BOX}\n  room id=bath at (0,0) size 3000x2500 uses bath\n  furniture basin against wall w1 segment 0 offset 1500 side right in bath`,
    ),
  },

  {
    keyword: "furniture",
    note: "every one of the nine anchors the line lists",
    src: plan(
      `${BOX}\n  room id=r1 at (0,0) size 8000x5000\n` +
        FURNITURE_ANCHORS.map((a, i) => `  furniture id=a${i} box in r1 anchor ${a} size 400x400`).join("\n"),
    ),
  },
  {
    keyword: "furniture",
    note: "`flush` on an anchored edge measures from the wall's inner FACE",
    src: plan(`${BOX}\n${ROOM}\n  furniture id=f1 counter in r1 anchor bottom flush inset 100 size 1200x600`),
  },

  // --- dim -------------------------------------------------------------------
  {
    keyword: "dim",
    note: "plain, faces and clear; offset optional; text override",
    src: plan(
      `${BOX}\n  dim (0,-800)->(8000,-800)\n  dim faces (0,-500)->(8000,-500) offset 300 text "8.0 m"\n  dim clear (0,2500)->(8000,2500) offset 0`,
    ),
  },
  {
    keyword: "dim",
    note: "the two curve call-outs derive geometry + text from the named element",
    src: plan(
      `  wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 }\n  room id=rot circle at (3000,6000) radius 2000\n  dim radius drum\n  dim diameter rot`,
    ),
  },

  // --- plan-level SETTINGS (the `SETTING_GRAMMAR` table) -----------------------
  // The attribute keywords the parser's statement switch leads with. Until the third
  // table existed, three of these (`dims`, `accTitle`, `accDescr`) had no syntax on the
  // page and so no way to appear here either — the D12 hole, from the corpus side.
  { keyword: "units", note: "the only unit", src: plan(`  room id=r1 at (0,0) size 4000x3000`) },
  { keyword: "grid", note: "snap grid in mm", src: plan(`  grid 50\n  room id=r1 at (0,0) size 4000x3000`) },
  {
    keyword: "paper",
    note: "size + orientation, the form the Structure block prints",
    src: plan(`  paper A3 landscape\n  room id=r1 at (0,0) size 4000x3000`),
  },
  {
    keyword: "scale",
    note: "`1:<n>` — operative because `paper` is present",
    src: plan(`  paper A3\n  scale 1:50\n  room id=r1 at (0,0) size 4000x3000`),
  },
  { keyword: "north", note: "one of the four page directions", src: plan(`  north up`) },
  {
    keyword: "height",
    note: "the plan-level storey datum, an EXPRESSION like `thickness` rather than a literal",
    src: plan(`  let h = 3200\n  height h\n  room id=r1 at (0,0) size 4000x3000`),
  },
  {
    keyword: "accTitle",
    note: "plan-level accessible name",
    src: plan(`  accTitle "Studio"\n  room id=r1 at (0,0) size 4000x3000`),
  },
  {
    keyword: "accDescr",
    note: "plan-level accessible description",
    src: plan(`  accDescr "A one-room studio."\n  room id=r1 at (0,0) size 4000x3000`),
  },

  ...AUTO_DIMS_MODES.map((m) => ({
    // Keyed `dims`, not `dim`: the mode set is the plan SETTING's, and printing it on the
    // element line as well is the duplication the third table let us delete.
    keyword: "dims",
    note: `\`dims auto ${m}\` — one of the four modes the setting line prints`,
    src: plan(
      `  dims auto ${m}\n  wall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=r1 at (0,0) size 6000x4000`,
    ),
  })),

  // --- column / vertical circulation -----------------------------------------
  { keyword: "column", note: "at + size", src: plan(`  column id=c1 at (3000,2000) size 300x300`) },
  {
    keyword: "stair",
    note: "dir up + the optional flight width",
    src: plan(`  stair id=s1 at (1000,1000) size 1200x3000 dir up width 1000`),
  },
  { keyword: "stair", note: "dir down", src: plan(`  stair id=s2 at (1000,1000) size 1200x3000 dir down`) },
  { keyword: "elevator", note: "no dir", src: plan(`  elevator id=e1 at (3000,1000) size 2000x2000`) },
  { keyword: "escalator", note: "dir down", src: plan(`  escalator id=x1 at (1000,1000) size 1500x4000 dir down`) },

  // --- statement keywords -----------------------------------------------------
  {
    keyword: "axes",
    note: "both lists of positions, expressions allowed",
    src: plan(`  let W = 6000\n  axes { x at 0, W, 2 * W y at 0, 4000 }\n  room id=r1 at (0,0) size 6000x4000`),
  },
  {
    keyword: "level",
    note: "a whole plan of storeys, plan-global settings outside them",
    src: plan(
      `  north up\n  level 1 "Ground" { room id=r1 at (0,0) size 4000x3000 }\n  level 2 "Upper" { room id=r2 at (0,0) size 4000x3000 }`,
    ),
  },
  {
    keyword: "level",
    // The whole fallback chain in one plan, which is the part a reader most needs to see
    // work: the wall's own clause beats the storey's, which beats the plan's — and the
    // header `height` sits after the optional name, where the grammar puts it.
    note: "`level … height` in the header, overriding the plan's and overridden by a wall's",
    src: plan(
      `  height 3000\n` +
        `  level 1 "Ground" height 3600 {\n` +
        `    wall id=w1 exterior thickness 200 height 2400 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n` +
        `    room id=r1 at (0,0) size 6000x4000 uses living\n` +
        `  }\n` +
        `  level 2 "Upper" { room id=r2 at (0,0) size 6000x4000 uses bedroom }`,
    ),
  },
  {
    keyword: "strip",
    note: "a right-running row with the shared cross `height`, one child overriding it",
    src: plan(
      `  strip right at (0,0) gap 200 height 3000 {\n    room id=a size 3000 label "A" uses living\n    room id=b size 2000x2500\n  }`,
    ),
  },
  {
    keyword: "strip",
    note: "a down-running column uses `width` as the shared cross",
    src: plan(`  strip down at (0,0) gap 100 width 2500 {\n    room id=p size 2000\n    room id=q size 3000\n  }`),
  },
  {
    keyword: "strip",
    note: "the shared cross dimension really is optional (`[height|width <mm>]`)",
    src: plan(`  strip left at (9000,0) gap 200 {\n    room id=m size 3000x2000\n    room id=n size 2000x2000\n  }`),
  },
  {
    keyword: "zone",
    note: "labelled and nested",
    src: plan(`  zone west "West wing" {\n    zone galleries {\n      room id=g1 at (0,0) size 4000x3000\n    }\n  }`),
  },
  {
    keyword: "schedule",
    note: "`rooms` is the only subject",
    src: plan(`  paper A3\n  room id=r1 at (0,0) size 4000x3000 label "Hall"\n  schedule rooms`),
  },
  {
    keyword: "legend",
    note: "nothing to configure; derived from what is drawn",
    src: plan(`  paper A3\n  wall id=w1 exterior thickness 200 material brick { (0,0) (4000,0) close }\n  legend`),
  },
  {
    keyword: "site",
    note: "street required, hemisphere optional",
    src: plan(`  site { street north hemisphere south }\n  room id=r1 at (0,0) size 4000x3000`),
  },
  { keyword: "site", note: "street alone (hemisphere defaults)", src: plan(`  site { street west }`) },
  {
    keyword: "place",
    note: "as + at required; rotate and mirror",
    src: plan(
      `  component wing() {\n    room id=main at (0,0) size 4000x3000\n  }\n` +
        `  place wing() as west at (0,0) rotate 90 mirror x\n  place wing() as east at (6000,0) mirror y`,
    ),
  },
  // --- roof ------------------------------------------------------------------
  {
    keyword: "roof",
    note: "the `overhang` sugar, inferring the plan's one closed exterior ring",
    src: plan(`${BOX}\n  roof overhang 600`),
  },
  {
    keyword: "roof",
    note: "…and naming the ring explicitly",
    src: plan(`${BOX}\n  roof overhang 600 wall w1`),
  },
  {
    keyword: "roof",
    note: "the explicit ring — no wall needed at all",
    src: plan(`  roof polygon (0,0) (9000,0) (9000,6000) (0,6000)`),
  },
  // --- void ------------------------------------------------------------------
  {
    keyword: "void",
    note: "at + size, top-left",
    src: plan(`${ROOM}\n  void id=well at (2000,1500) size 2000x2000`),
  },
  // --- outdoor ---------------------------------------------------------------
  {
    keyword: "outdoor",
    note: "the rectangle spelling, with a label",
    src: plan(`  outdoor id=g lawn at (-4000,-4000) size 16000x13000 label "Garden"`),
  },
  {
    keyword: "outdoor",
    note: "the ring spelling — every kind that is not a balcony may take one",
    src: plan(`  outdoor paving polygon (0,0) (6000,0) (6000,3000) (2000,3000)`),
  },
  {
    keyword: "outdoor",
    note: "an authored rail, naming edges; `all`/`none` are the whole-rectangle answers",
    src: plan(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600 rail bottom left right`),
  },
  {
    keyword: "outdoor",
    note: "…and the derived rail — no clause at all is the common case",
    src: plan(`${BOX}\n  outdoor balcony at (0,5200) size 4000x1600 label "Terrace"`),
  },
  // Every remaining kind, so the accept-set is EXERCISED and not merely rendered. The
  // four above cover `lawn`/`paving`/`balcony`; these are the other six, one statement
  // each, in one plan.
  {
    keyword: "outdoor",
    note: "the rest of the closed kind set compiles",
    src: plan(
      OUTDOOR_KINDS.filter((k) => k !== "lawn" && k !== "paving" && k !== "balcony")
        .map((k, i) => `  outdoor ${k} at (${i * 5000},0) size 4000x4000`)
        .join("\n"),
    ),
  },
  // --- fence -----------------------------------------------------------------
  {
    keyword: "fence",
    note: "the style word leads and is optional; the body is a point list",
    src: plan(`  fence id=f picket { (0,0) (12000,0) (12000,9000) close }`),
  },
  {
    keyword: "fence",
    note: "…omitted, it defaults, and an open run needs no `close`",
    src: plan(`  fence { (0,0) (12000,0) }`),
  },
  {
    keyword: "fence",
    note: "the other two styles",
    src: plan(`  fence panel { (0,0) (9000,0) }\n  fence post { (0,3000) (9000,3000) }`),
  },
  // --- site boundary ---------------------------------------------------------
  {
    keyword: "site",
    note: "the lot line — the one part of `site` that draws anything",
    src: plan(`  site {\n    street south\n    boundary (0,0) (20000,0) (20000,16000) (0,16000)\n  }`),
  },
];

// ---------------------------------------------------------------------------
// 2. The negative corpus — every illegality the spec names
// ---------------------------------------------------------------------------

/**
 * A refusal the spec promises. `channel` records WHERE it is raised, because that is
 * the fact a reader needs: `compile` covers parse + resolve, `lint` is the separate
 * soundness pass an agent reaches through `arch lint` / `arch validate`.
 */
interface Negative {
  code: string;
  channel: "compile" | "lint";
  note: string;
  src: string;
}

const NEGATIVE: Negative[] = [
  {
    code: "E_ARC_RADIUS",
    channel: "compile",
    note: "R < chord/2 has no circle",
    src: plan(`  wall id=w1 exterior thickness 200 { (0,0) arc (6000,0) radius 1000 }`),
  },
  {
    code: "E_ROOM_POLY_SELF_INTERSECT",
    channel: "compile",
    note: "a crossing (bow-tie) ring",
    src: plan(`  room id=p polygon (0,0) (4000,4000) (4000,0) (0,4000)`),
  },
  {
    code: "E_ROOM_POLY_DEGENERATE",
    channel: "compile",
    note: "an all-collinear ring",
    src: plan(`  room id=p polygon (0,0) (2000,0) (4000,0)`),
  },
  {
    code: "E_ROOM_ALIGN",
    channel: "compile",
    note: "the `align` value set is closed — an out-of-set word USED to draw as `align top` in silence",
    src: plan(`  room id=a at (0,0) size 3000x3000\n  room id=b right-of a align sideways size 2000x2000`),
  },
  {
    // The other half of the same defect, and the likelier half: `right` is spelled
    // correctly and is a real edge, so membership passes and nothing about the source
    // looks wrong — but a HORIZONTAL relation aligns on the VERTICAL axis, so it matched
    // no branch of `alignOffset` and the room was drawn against `top`. Chosen as the
    // TRAILING mismatch on purpose: it is the one where the silent fallback was actually
    // drawing the wrong plan (a leading mismatch like `align left` fell through to `top`,
    // which is what it should have meant anyway).
    code: "E_ROOM_ALIGN_AXIS",
    channel: "compile",
    note: "`right` is a real edge, but of the other axis — a horizontal relation takes top|middle|bottom",
    src: plan(`  room id=a at (0,0) size 3000x3000\n  room id=b right-of a align right size 2000x2000`),
  },
  {
    // …and the mirror, so the check cannot be one direction's special case.
    code: "E_ROOM_ALIGN_AXIS",
    channel: "compile",
    note: "…and symmetrically, a vertical relation refuses `bottom`",
    src: plan(`  room id=a at (0,0) size 3000x3000\n  room id=b below a align bottom size 2000x2000`),
  },
  {
    code: "E_ACC_PLACEMENT",
    channel: "compile",
    note: "`accTitle`/`accDescr` describe the whole plan, so they are plan-level only",
    src: plan(`  component c() { accDescr "x" }\n  room id=r1 at (0,0) size 3000x3000`),
  },
  {
    code: "W_UNKNOWN_THEME_KEY",
    channel: "compile",
    note: "an unknown theme key warns and is dropped — colour is never a hard error",
    src: plan(`  theme { nosuchkey "#fff" }\n  room id=r1 at (0,0) size 3000x3000`),
  },
  {
    code: "W_UNKNOWN_STYLE_KEY",
    channel: "compile",
    note: "…and the same per element kind",
    src: plan(`  style room { nosuchkey "#fff" }\n  room id=r1 at (0,0) size 3000x3000`),
  },
  {
    code: "E_PLACE_POLY",
    channel: "compile",
    note: "a rectangle-only clause REFUSES a polygon room rather than approximating it",
    src: plan(
      `  room id=p polygon (0,0) (4000,0) (4000,4000) (2000,4000) (2000,2000) (0,2000)\n  room id=q right-of p size 3000x3000`,
    ),
  },
  {
    code: "E_DOOR_KIND_CLAUSE",
    channel: "compile",
    note: "`hinge` is hinged-only",
    src: plan(`${BOX}\n  door pocket on w1 at 50% width 900 hinge left`),
  },
  {
    code: "E_DOOR_KIND_CLAUSE",
    channel: "compile",
    // The only kind whose clause row is entirely `false`: a sectional door parks overhead,
    // so `open` has no intermediate position to name and the projection side is derived.
    note: "`garage` takes no clause at all — not even `open`",
    src: plan(`${BOX}\n  door garage on w1 at 50% width 2400 open 0.5`),
  },
  {
    code: "E_DOOR_KIND_CURVED",
    channel: "compile",
    note: "a non-hinged kind on an `arc` wall",
    src: plan(
      `  wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 }\n  door sliding on drum at 50% width 900 slide left`,
    ),
  },
  {
    code: "E_DOOR_OPEN_RANGE",
    channel: "compile",
    note: "`open` is [0,1]",
    src: plan(`${BOX}\n  door sliding on w1 at 50% width 900 slide left open 2`),
  },
  {
    code: "E_FURN_AGAINST",
    channel: "compile",
    note: "an `against` piece takes rotation FROM the wall, so writing `rotate` refuses",
    src: plan(`${BOX}\n  furniture id=f1 wc against wall w1 size 400x600 rotate 90`),
  },
  {
    code: "E_FURN_FLUSH",
    channel: "compile",
    note: "`flush` needs an anchored edge",
    src: plan(`${BOX}\n${ROOM}\n  furniture id=f1 sofa in r1 centered flush size 1000x600`),
  },
  {
    code: "E_LEVEL_MIX",
    channel: "compile",
    note: "a drawable statement beside a `level` block",
    src: plan(`  level 1 { room id=r1 at (0,0) size 4000x3000 }\n  room id=stray at (0,5000) size 1000x1000`),
  },
  {
    code: "E_SITE_NO_STREET",
    channel: "compile",
    note: "`street` is required — never a silent default",
    src: plan(`  site { }`),
  },
  {
    code: "E_SITE_DUP",
    channel: "compile",
    note: "one `site` block per plan",
    src: plan(`  site { street north }\n  site { street south }`),
  },
  {
    code: "W_UNKNOWN_MATERIAL",
    channel: "compile",
    note: "an unlisted material falls back to the default hatch, loudly",
    src: plan(`  wall id=w1 exterior thickness 200 material marble { (0,0) (4000,0) close }`),
  },
  {
    code: "E_ATTACH_POS_RANGE",
    channel: "compile",
    note: "an attachment position past the end of the wall run it walks",
    src: plan(`${BOX}\n  door on w1 at 150% width 900`),
  },
  {
    code: "E_PARSE",
    channel: "compile",
    note: "a SHAPE refusal — resolution never ran, so no semantic code can apply",
    src: plan(`${BOX}\n  door on w1 at 40% width 900 wall w1`),
  },
  {
    code: "W_DOOR_OFF_WALL",
    channel: "compile",
    note: "rule 4 — an `at` door must sit on a wall centerline",
    src: plan(`${BOX}\n  door at (4000,2500) width 900`),
  },
  {
    code: "W_WINDOW_OFF_WALL",
    channel: "compile",
    note: "rule 4 — the same for a window",
    src: plan(`${BOX}\n  window at (4000,2500) width 900`),
  },
  {
    code: "W_SCALE_OVERFLOW",
    channel: "compile",
    note: "a declared scale is never silently overridden",
    src: plan(`  paper A4\n  scale 1:50\n  room id=r1 at (0,0) size 60000x40000`),
  },
  {
    code: "W_DIM_INSIDE",
    channel: "lint",
    note: "endpoint ORDER + the offset sign choose the side; a reversed pair lands inside",
    src: plan(`${BOX}\n${ROOM}\n  dim (0,0)->(8000,0) offset 300`),
  },
  {
    code: "W_POCKET_RUN",
    channel: "lint",
    note: "a pocket needs its own width of wall past the slide-side jamb",
    src: plan(
      `  wall id=w1 partition thickness 100 { (0,0) (2000,0) }\n  door pocket on w1 at 80% width 900 slide right`,
    ),
  },
  {
    code: "W_DOOR_NEAR_CORNER",
    channel: "lint",
    note: "the nib between a jamb and a corner must be at least the wall's own thickness",
    src: plan(`  wall id=w1 exterior thickness 250 { (0,0) (5000,0) (5000,4000) }\n  door on w1 at 4400 width 900`),
  },
  // --- roof + void: every refusal the two new lines name ---------------------
  {
    code: "E_ROOF_OVERHANG",
    channel: "compile",
    note: "an overhang is a projection PAST the wall face, so it must be positive",
    src: plan(`${BOX}\n  roof overhang 0`),
  },
  {
    code: "E_ROOF_AMBIGUOUS",
    channel: "compile",
    note: "no closed `exterior` wall to infer the ring from",
    src: plan(`${ROOM}\n  roof overhang 600`),
  },
  {
    code: "E_ROOF_WALL",
    channel: "compile",
    note: "an open polyline is not a ring — an overhang is offset from a loop",
    src: plan(`  wall id=w1 exterior thickness 200 { (0,0) (8000,0) }\n  roof overhang 600 wall w1`),
  },
  {
    code: "E_ROOF_CURVED",
    channel: "compile",
    note: "an `arc` edge refuses rather than being faceted",
    src: plan(
      `  wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 (6000,4000) (0,4000) close }\n` +
        `  roof overhang 600 wall drum`,
    ),
  },
  {
    code: "E_ROOF_SELF_INTERSECT",
    channel: "compile",
    note: "a bow-tie ring encloses no single area",
    src: plan(`  roof polygon (0,0) (4000,4000) (4000,0) (0,4000)`),
  },
  {
    code: "E_ROOF_POLY_DEGENERATE",
    channel: "compile",
    note: "three collinear points are a line, not an outline",
    src: plan(`  roof polygon (0,0) (4000,0) (8000,0)`),
  },
  {
    code: "E_ROOF_PLACEMENT",
    channel: "compile",
    note: "a component has no building-scale wall ring to offset from",
    src: plan(`  component wing() { roof overhang 600 }\n  wing()`),
  },
  {
    code: "E_VOID_SIZE",
    channel: "compile",
    note: "a hole with no extent is not a hole",
    src: plan(`${ROOM}\n  void at (2000,1500) size 0x2000`),
  },
  // --- the vertical datum: all three refusals it names ------------------------
  {
    code: "E_HEIGHT_RANGE",
    channel: "compile",
    // A wall at zero, not the unit slip that motivates the code. The slip a reader thinks
    // of — `height 3` for three metres — is NOT caught and must not be implied to be:
    // 3 mm is inside the range, and a compiler that guessed the author meant metres would
    // be inventing a number. The range guards the ends; the units are the author's.
    note: "a wall at zero height is not a low wall, it is a missing one",
    src: plan(`  wall id=w1 exterior thickness 200 height 0 { (0,0) (4000,0) (4000,3000) (0,3000) close }`),
  },
  {
    code: "E_SILL_ABOVE_HEAD",
    channel: "compile",
    note: "glazing whose bottom is above its top has no glass in it",
    src: plan(`${BOX}\n  window on w1 at 50% width 1200 sill 2400 head 2100`),
  },
  {
    code: "E_OPENING_ABOVE_WALL",
    channel: "compile",
    note: "a 2400 head runs out through the top of a 2200 parapet",
    src: plan(
      `  wall id=w1 exterior thickness 200 height 2200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
        `  door on w1 at 50% width 900 head 2400`,
    ),
  },
  // --- outdoor / fence / the lot line: every refusal the three lines name -----
  {
    code: "E_OUTDOOR_SIZE",
    channel: "compile",
    note: "ground with no extent is not ground",
    src: plan(`  outdoor lawn at (0,0) size 0x4000`),
  },
  {
    code: "E_OUTDOOR_POLY_SELF_INTERSECT",
    channel: "compile",
    note: "a crossing (bow-tie) ring encloses no single surface",
    src: plan(`  outdoor deck polygon (0,0) (4000,4000) (4000,0) (0,4000)`),
  },
  {
    code: "E_OUTDOOR_POLY_DEGENERATE",
    channel: "compile",
    note: "three collinear points are a line, not a surface",
    src: plan(`  outdoor paving polygon (0,0) (2000,0) (4000,0)`),
  },
  {
    code: "E_OUTDOOR_RAIL",
    channel: "compile",
    note: "`rail` on a kind that has no railing is refused, never ignored",
    src: plan(`  outdoor deck at (0,0) size 3000x2000 rail all`),
  },
  {
    code: "E_FENCE_CURVED",
    channel: "compile",
    note: "the post pitch and the reported length are measured along a straight run",
    src: plan(`  fence picket { (0,0) arc (3000,3000) radius 3000 }`),
  },
  {
    code: "E_SITE_BOUNDARY_DEGENERATE",
    channel: "compile",
    note: "an all-collinear lot line encloses no lot",
    src: plan(`  site {\n    street north\n    boundary (0,0) (5000,0) (10000,0)\n  }`),
  },
  {
    code: "E_SITE_BOUNDARY_SELF_INTERSECT",
    channel: "compile",
    note: "a bow-tie lot line has no single area to report",
    src: plan(`  site {\n    street north\n    boundary (0,0) (10000,10000) (10000,0) (0,10000)\n  }`),
  },
  {
    code: "W_OUTDOOR_OVERLAPS_ROOM",
    channel: "lint",
    note: "ground over a room's floor is double-counted by anything adding the two totals",
    src: plan(`${BOX}\n${ROOM}\n  outdoor paving at (1000,1000) size 3000x2000`),
  },
  {
    code: "W_BALCONY_NO_DOOR",
    channel: "lint",
    note: "a slab with no opening within a wall thickness cannot be reached",
    src: plan(`${BOX}\n${ROOM}\n  outdoor balcony at (0,9000) size 4000x1600`),
  },
  {
    code: "W_STAIR_UNMATCHED",
    channel: "lint",
    note: "a shaft id on one storey only",
    src: plan(
      `  level 1 { room id=r1 at (0,0) size 6000x5000\n    stair id=s1 at (1000,1000) size 1200x3000 dir up }\n` +
        `  level 2 { room id=r2 at (0,0) size 6000x5000 }`,
    ),
  },
];

/**
 * Illegalities the spec names as **parse errors** — no catalogued code, by design. Each
 * one is a form an agent reaches for by analogy and the spec explicitly warns against,
 * so "it is refused" is a claim this file has to execute like any other.
 */
const PARSE_ERRORS: { note: string; src: string }[] = [
  {
    note: "the trailing `wall` clause after `on <wall>` — the host is already named",
    src: plan(`${BOX}\n  door on w1 at 50% width 900 wall w1`),
  },
  {
    note: "`id=` after the category on a wall (rule 6: id= leads)",
    src: plan(`  wall exterior id=w1 thickness 200 { (0,0) (4000,0) close }`),
  },
  {
    note: "`id=` after the category on a fixture (rule 6: id= leads)",
    src: plan(`  furniture bed id=b1 at (0,0) size 1600x2000`),
  },
  {
    note: "`rooms` is the only `schedule` subject",
    src: plan(`  schedule doors`),
  },
  {
    note: "a size is WxH — `size 4000` alone is not one",
    src: plan(`  room id=r1 at (0,0) size 4000`),
  },
];

/**
 * Codes the spec names that this file deliberately does NOT reproduce, each with the
 * reason — a `Map`, never a bare `Set`, because the reason is what stops it becoming a
 * dumping ground. Every member here is a whole-plan ANALYSIS outcome (or another
 * channel entirely): reproducing it means building a plan whose spatial properties are
 * the point, which is `test/lint.test.ts`'s job and where each already has ± coverage.
 */
const NOT_REPRODUCED_HERE = new Map<string, string>([
  ["W_ROOM_UNREACHABLE", "circulation flood-fill outcome — a whole-plan spatial property, owned by test/lint.test.ts"],
  ["W_CIRCUITOUS_PATH", "circulation routing outcome (path length vs. straight line) — test/lint.test.ts"],
  ["W_PATH_TOO_NARROW", "circulation clear-width outcome over the nav grid — test/lint.test.ts"],
  ["W_NO_ENTRANCE", "access-graph outcome over the whole building — test/lint.test.ts"],
  ["W_BEDROOM_NO_WINDOW", "room-programme rule keyed on classification + openings — test/lint.test.ts"],
  ["W_BATH_VIA_BEDROOM", "access-graph topology rule between classified rooms — test/lint.test.ts"],
  [
    "W_SWING_OBSTRUCTED",
    "quarter-disc vs. fixture geometry — a spatial analysis outcome, owned by test/lint.test.ts and test/doors.test.ts",
  ],
  [
    "E_INTENT_NO_SITE",
    "not a compile diagnostic at all: it is raised by validateIntent() on the intent channel — test/intent.test.ts",
  ],
]);

// ---------------------------------------------------------------------------
// The suites
// ---------------------------------------------------------------------------

const DOCUMENTED: Record<string, string> = { ...ELEMENT_GRAMMAR, ...STATEMENT_GRAMMAR, ...SETTING_GRAMMAR };

function specText(): string {
  const examples: Record<string, string> = {};
  for (const name of SPEC_EXAMPLES) examples[name] = readFileSync(resolve("examples", name), "utf8");
  return renderLlmSpec(examples);
}

describe("spec.llm.md — every documented form compiles", () => {
  it("the corpus is real (so a green run cannot be vacuous)", () => {
    expect(POSITIVE.length).toBeGreaterThan(25);
    expect(Object.keys(DOCUMENTED).length).toBe(
      KEYWORDS.element.length + Object.keys(STATEMENT_GRAMMAR).length + Object.keys(SETTING_GRAMMAR).length,
    );
    expect(NEGATIVE.length).toBeGreaterThan(15);
    expect(PARSE_ERRORS.length).toBeGreaterThan(3);
  });

  it("no snippet copied from a grammar line fails to compile", () => {
    const broken = POSITIVE.map((s) => ({ s, errors: errorsOf(s.src) })).filter((r) => r.errors.length > 0);
    const report = broken
      .map(({ s, errors }) => {
        const e = errors[0]!;
        return `  [${s.keyword}] ${s.note}\n        ${e.code ? `[${e.code}] ` : ""}${e.message}\n${s.src.replace(/^/gm, "        | ")}`;
      })
      .join("\n\n");
    expect(
      broken.map(({ s }) => `${s.keyword}: ${s.note}`),
      broken.length === 0
        ? ""
        : `These snippets were written by copying a grammar line out of spec.llm.md, and each ` +
            `one fails to compile:\n\n${report}\n\n` +
            `FIX THE SPEC, NOT THE CORPUS. The line in scripts/gen-llm-spec.ts is what an agent ` +
            `reads to author ArchLang; if the snippet is a faithful copy and does not compile, the ` +
            `line is wrong. Correct it and run \`npm run gen:spec && npm run gen:llms\`. The one ` +
            `exception is a snippet that is NOT a faithful copy — fix the snippet then. If you ` +
            `conclude the PARSER is wrong, stop and raise it rather than changing behaviour here.`,
    ).toEqual([]);
  });
});

describe("spec.llm.md — every illegality it names is refused", () => {
  it("names only codes that exist in the catalog", () => {
    const named = [...new Set(specText().match(/\b[EW]_[A-Z0-9_]+/g) ?? [])].sort();
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((c) => !(c in ERROR_CATALOG))).toEqual([]);
  });

  it("raises the catalogued code for every refusal the corpus reproduces", () => {
    const misses = NEGATIVE.map((n) => {
      const got = n.channel === "compile" ? compile(n.src, { noCache: true }).diagnostics : lint(n.src);
      return { n, codes: got.map((d) => d.code).filter(Boolean) as string[] };
    }).filter((r) => !r.codes.includes(r.n.code));
    expect(
      misses.map((r) => `${r.n.code} (${r.n.channel}): ${r.n.note} — got [${r.codes.join(", ") || "nothing"}]`),
      `The spec promises each of these codes for the form beside it, and the compiler did not ` +
        `produce it. Either the spec over-promises (fix the generator) or the check regressed.`,
    ).toEqual([]);
  });

  it("keeps parse errors parse errors — E_PARSE, not a semantic code", () => {
    // The distinction is load-bearing for an agent: a semantic `E_*` carries a `fix` and
    // a catalog entry describing what the plan MEANS; `E_PARSE` means the SHAPE is wrong,
    // resolution never ran, and there is nothing to correct because the compiler has no
    // reading of the text. A form that silently swaps one for the other has changed what
    // the spec's advice is worth. Before v1.27.0 the marker was the ABSENCE of a code,
    // which made the distinction real but unnameable — `--code` could not select it and
    // the catalog did not document it.
    const wrong = PARSE_ERRORS.map((p) => ({ p, errors: errorsOf(p.src) })).filter(
      (r) => r.errors.length === 0 || !r.errors.some((e) => e.code === "E_PARSE"),
    );
    expect(
      wrong.map((r) => `${r.p.note} — got [${r.errors.map((e) => e.code ?? "<uncoded>").join(", ") || "nothing"}]`),
      `The spec says each of these is a PARSE ERROR. A run that produced no error at all means ` +
        `the spec forbids something the parser accepts; a run that produced no E_PARSE ` +
        `means the refusal moved to resolve, and the spec's wording is now wrong.`,
    ).toEqual([]);
  });

  it("accounts for every code the spec names — reproduced here, or excused with a reason", () => {
    const named = new Set(specText().match(/\b[EW]_[A-Z0-9_]+/g) ?? []);
    const reproduced = new Set(NEGATIVE.map((n) => n.code));
    const unaccounted = [...named].filter((c) => !reproduced.has(c) && !NOT_REPRODUCED_HERE.has(c)).sort();
    expect(
      unaccounted,
      `spec.llm.md names these codes and nothing here proves the compiler raises them. Add a ` +
        `negative snippet, or — only if it is a whole-plan ANALYSIS outcome owned by another ` +
        `suite — add it to NOT_REPRODUCED_HERE with the reason.`,
    ).toEqual([]);
    // …and the excuse list may not rot: every entry must still be named, and still unproved.
    const stale = [...NOT_REPRODUCED_HERE.keys()].filter((c) => !named.has(c) || reproduced.has(c)).sort();
    expect(
      stale,
      `NOT_REPRODUCED_HERE entries the spec no longer names, or that ARE now reproduced — delete them.`,
    ).toEqual([]);
  });
});

describe("spec.llm.md — the binding between what is documented and what is exercised", () => {
  it("every documented keyword has a snippet, and every snippet a documented keyword", () => {
    // Set-equality (not one-way containment) is what catches a NEW keyword: the generator's
    // own guards already prove KEYWORDS.element/.control each have a grammar line, and this
    // is the other half — that the line was ever run.
    const documented = Object.keys(DOCUMENTED).sort();
    const covered = [...new Set(POSITIVE.map((s) => s.keyword))].sort();
    expect(covered).toEqual(documented);
  });

  it("the scripting keywords are the exact complement, and each is exercised too", () => {
    // `SCRIPTING_KEYWORDS` is the generator's "prose covers it" bucket. It has no grammar
    // line, so `clauseAtoms` cannot reach it — but each is still real syntax, so pin that
    // the two buckets partition KEYWORDS.control and that the Structure/Scripting forms run.
    expect([...Object.keys(STATEMENT_GRAMMAR), ...SCRIPTING_KEYWORDS].sort()).toEqual([...KEYWORDS.control].sort());
    const scripting = plan(
      `  grid 50\n  paper A3 landscape\n  scale 1:100\n  north up\n  dims auto all\n` +
        `  theme blueprint { bg "#101820" }\n  style room { fill "#182430" }\n  let W = 4000\n` +
        `  let f(a, b) = min(a, b) + abs(-1)\n` +
        `  let xs = [1, 2, 3]\n  let n = 0\n  component unit(w) {\n    room at (0,0) size w x 2000\n  }\n` +
        `  set door(swing: out)\n  for i in 0..2 {\n    room at (0, i * 2500) size W x 2000 label "Unit {i}"\n  }\n` +
        `  if len(xs) > 2 { room id=big at (5000,0) size W x 2000 } else { room id=small at (5000,0) size 1000x1000 }\n` +
        `  while n < 1 { n = n + 1 }\n  unit(3000)\n  title { project "P" drawn_by "D" date "2026-01-01" }`,
    );
    expect(errorsOf(scripting)).toEqual([]);
    // The other two `theme` forms the new Scripting bullet teaches — a bare named base
    // with no block, and the derive-a-palette-from-one-colour form.
    expect(errorsOf(plan(`  theme mono\n  room id=r1 at (0,0) size 3000x3000`))).toEqual([]);
    expect(errorsOf(plan(`  theme from "#3355aa"\n  room id=r1 at (0,0) size 3000x3000`))).toEqual([]);
  });

  it("the plan SETTINGS and the element CLAUSES exactly partition KEYWORDS.attribute", () => {
    // The third guard, from the test side — the one `dims` fell through. `renderLlmSpec`
    // throws on a mismatch, so this is belt-and-braces; what it adds is DISJOINTNESS,
    // which set-equality of the concatenation would also catch only because a duplicate
    // would make the lengths differ. Stated explicitly so the intent survives an edit.
    const settings = Object.keys(SETTING_GRAMMAR);
    expect([...settings, ...CLAUSE_ATTRIBUTES].sort()).toEqual([...KEYWORDS.attribute].sort());
    expect(settings.filter((k) => CLAUSE_ATTRIBUTES.includes(k))).toEqual([]);
  });

  it("the scripting-keyword claim is a CHECK, and it is not vacuous", () => {
    // `assertScriptingKeywordsTaught` exists because "the prose covers these" was an
    // unfalsifiable comment that happened to be false. Prove the check bites: a keyword
    // the document genuinely never shows must be reported…
    expect(() => assertScriptingKeywordsTaught(specText(), ["flange"])).toThrow(/flange/);
    // …and — the load-bearing half — a real keyword must NOT be rescued by the generated
    // `## Keyword reference` bullet, which is rendered from `KEYWORDS.control` itself. If
    // the excision ever broke, every keyword would pass by construction and the check
    // would be testing its own input. `zone` is a control keyword that appears in that
    // bullet and (as a STATEMENT_GRAMMAR line) elsewhere too, so it is not the probe;
    // a made-up word planted into the bullet's own text is.
    const planted = specText().replace(/(- \*\*Settings \/ control:\*\*)/, "$1 `flange`,");
    expect(planted).toContain("`flange`");
    expect(() => assertScriptingKeywordsTaught(planted, ["flange"])).toThrow(/flange/);
    // And the real list passes, which is the postcondition the generator relies on.
    expect(() => assertScriptingKeywordsTaught(specText(), SCRIPTING_KEYWORDS)).not.toThrow();
  });

  it("every clause a grammar line TEACHES is exercised by a snippet for that keyword", () => {
    // The inverse of `assertVocabRendered`: that asserts a table entry has a rendering,
    // this asserts a rendering has an exercise. An alternation counts as covered when ANY
    // arm is exercised — the spec teaches the clause; the per-value tables have their own
    // per-value tests (test/door-enums.test.ts, test/site.test.ts).
    //
    // Scope note, deliberately loose: the exercise text is the WHOLE source of every
    // snippet tagged with that keyword, not just its `<keyword> …` statements. Tightening
    // it to the statement would mis-handle the block forms (`strip`/`zone`/`level`), whose
    // clauses live on child lines. What this still catches — and what it exists for — is a
    // clause word that appears in NO snippet of that keyword at all.
    const uncovered: string[] = [];
    for (const [keyword, line] of Object.entries(DOCUMENTED)) {
      const exercise = POSITIVE.filter((s) => s.keyword === keyword)
        .map((s) => s.src)
        .join("\n");
      for (const atom of clauseAtoms(line, keyword)) {
        if (!atom.split("|").some((arm) => exercised(exercise, arm))) {
          uncovered.push(`${keyword}: \`${atom}\``);
        }
      }
    }
    expect(
      uncovered,
      `These clauses are printed in a spec.llm.md grammar line and no snippet in this file ` +
        `types them, so nothing proves the language still accepts them. Add a snippet for each ` +
        `— or, if the clause is gone, take it out of scripts/gen-llm-spec.ts and regenerate.`,
    ).toEqual([]);
  });
});

/** Whole-word (hyphen-aware) presence, so `left` never matches inside `right-of`. */
function exercised(haystack: string, word: string): boolean {
  return new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(haystack);
}

describe("spec.llm.md — the gate is not vacuous", () => {
  it("clauseAtoms reads the syntax half only, and drops every non-literal", () => {
    const line =
      `widget [id=<name>] <category> (at (x,y) | on <host> at <pos>) size <W>x<H> [label "…"] ` +
      `[tilt 0|90|180|270] [mode fast|slow] { (x,y) … [close] }   # prose only: rivet, gusset, 42`;
    expect(clauseAtoms(line, "widget")).toEqual(["at", "on", "size", "label", "tilt", "mode", "fast|slow", "close"]);
    // The prose half is invisible — a word that appears only after the `#` is not a clause.
    expect(clauseAtoms(line, "widget")).not.toContain("rivet");
    // …and so are the allow-listed universals and bare digits.
    for (const dropped of ["id", "x", "name", "category", "0", "90"]) {
      expect(clauseAtoms(line, "widget")).not.toContain(dropped);
    }
    // The leading keyword itself is dropped; a DIFFERENT keyword would not be.
    expect(clauseAtoms("widget foo bar", "widget")).toEqual(["foo", "bar"]);
    expect(clauseAtoms("widget foo bar", "gadget")).toEqual(["widget", "foo", "bar"]);
  });

  it("a planted new clause with no snippet is actually caught", () => {
    // The whole point of the coverage case above. Plant a clause on a real grammar line and
    // prove the same computation reports it — if this passes vacuously, so does the gate.
    const keyword = "column";
    const planted = `${DOCUMENTED[keyword]} [bollard <mm>]`;
    const exercise = POSITIVE.filter((s) => s.keyword === keyword)
      .map((s) => s.src)
      .join("\n");
    const uncovered = clauseAtoms(planted, keyword).filter(
      (atom) => !atom.split("|").some((arm) => exercised(exercise, arm)),
    );
    expect(uncovered).toEqual(["bollard"]);
    // …and the unplanted line is clean, so the miss above is the plant and not a pre-existing hole.
    expect(
      clauseAtoms(DOCUMENTED[keyword]!, keyword).filter(
        (atom) => !atom.split("|").some((arm) => exercised(exercise, arm)),
      ),
    ).toEqual([]);
  });

  it("the positive corpus would notice a broken compiler (the snippets really run)", () => {
    // A guard against the corpus degenerating into strings nobody compiles: at least one
    // snippet must produce real geometry, and a deliberately malformed one must fail.
    expect(compile(POSITIVE[0]!.src, { noCache: true }).svg).toContain("<svg");
    expect(errorsOf(plan(`  room id=r1 at (0,0) size`)).length).toBeGreaterThan(0);
  });
});
