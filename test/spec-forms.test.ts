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
  clauseAtoms,
  ELEMENT_GRAMMAR,
  renderLlmSpec,
  SCRIPTING_KEYWORDS,
  SPEC_EXAMPLES,
  STATEMENT_GRAMMAR,
} from "../scripts/gen-llm-spec.js";
import { AUTO_DIMS_MODES, FURNITURE_ANCHORS } from "../src/ast.js";
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
      `${BOX}\n  door hinged on w1 at 5% width 900 hinge right\n  door sliding on w1 at 15% width 900 slide left open 0.5\n  door barn on w1 at 25% width 900 swing out slide right\n  door bifold on w1 at 35% width 900 swing in\n  door pocket on w1 at 45% width 900 slide left`,
    ),
  },
  {
    keyword: "door",
    note: "mm and `center` positions along a wall",
    src: plan(`${BOX}\n  door on w1 at center width 900\n  door on w1 at 1200 width 800`),
  },

  // --- window / opening ------------------------------------------------------
  {
    keyword: "window",
    note: "both placement forms; `wall` pairs with `at` only",
    src: plan(`${BOX}\n  window id=win1 on w1 at 30% width 1200\n  window at (6000,0) width 1000 wall w1`),
  },
  {
    keyword: "opening",
    note: "both placement forms; `wall` pairs with `at` only",
    src: plan(`${BOX}\n  opening id=o1 on w1 at 60% width 1000\n  opening at (2000,0) width 1000 wall w1`),
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

  ...AUTO_DIMS_MODES.map((m) => ({
    keyword: "dim",
    note: `\`dims auto ${m}\` — one of the four modes the line now prints`,
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

const DOCUMENTED: Record<string, string> = { ...ELEMENT_GRAMMAR, ...STATEMENT_GRAMMAR };

function specText(): string {
  const examples: Record<string, string> = {};
  for (const name of SPEC_EXAMPLES) examples[name] = readFileSync(resolve("examples", name), "utf8");
  return renderLlmSpec(examples);
}

describe("spec.llm.md — every documented form compiles", () => {
  it("the corpus is real (so a green run cannot be vacuous)", () => {
    expect(POSITIVE.length).toBeGreaterThan(25);
    expect(Object.keys(DOCUMENTED).length).toBe(KEYWORDS.element.length + Object.keys(STATEMENT_GRAMMAR).length);
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

  it("keeps parse errors parse errors — a bare diagnostic, not a catalogued code", () => {
    // The distinction is load-bearing for an agent: a coded `E_*` carries a `fix` and a
    // catalog entry to look up; a parse error means the SHAPE is wrong and no amount of
    // reading the catalog helps. A form that silently swaps one for the other has changed
    // what the spec's advice is worth.
    const wrong = PARSE_ERRORS.map((p) => ({ p, errors: errorsOf(p.src) })).filter(
      (r) => r.errors.length === 0 || r.errors.every((e) => e.code !== undefined),
    );
    expect(
      wrong.map((r) => `${r.p.note} — got [${r.errors.map((e) => e.code ?? "<parse>").join(", ") || "nothing"}]`),
      `The spec says each of these is a PARSE ERROR. A run that produced no error at all means ` +
        `the spec forbids something the parser accepts; a run that produced only coded errors ` +
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
        `  theme { }\n  style room { }\n  let W = 4000\n  let f(a, b) = min(a, b) + abs(-1)\n` +
        `  let xs = [1, 2, 3]\n  let n = 0\n  component unit(w) {\n    room at (0,0) size w x 2000\n  }\n` +
        `  set door(swing: out)\n  for i in 0..2 {\n    room at (0, i * 2500) size W x 2000 label "Unit {i}"\n  }\n` +
        `  if len(xs) > 2 { room id=big at (5000,0) size W x 2000 } else { room id=small at (5000,0) size 1000x1000 }\n` +
        `  while n < 1 { n = n + 1 }\n  unit(3000)\n  title { project "P" drawn_by "D" date "2026-01-01" }`,
    );
    expect(errorsOf(scripting)).toEqual([]);
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
