/**
 * Byte-identity oracle for W4b: `emitOpening` (`src/fix-producers.ts`) was rewritten to
 * print through the shared printer (`printDoc(statementText(...))`) instead of a second,
 * hand-written enumeration of clauses — the old enumeration never printed `sill`/`head`,
 * so every fix that rebuilt an opening statement silently deleted an authored one.
 *
 * `legacyEmitOpening` below is the OLD `emitOpening` body, copied verbatim (see the git
 * history of `src/fix-producers.ts` at `feat/algebra` before this change). It is kept
 * only so this file can assert: for every opening statement WITHOUT sill/head/heights,
 * across every example, fixture and `fc.sample(archPlan)` seed, and every `EmitOpts`
 * combination any real call site actually uses (grepped from `src/fix-producers.ts` and
 * `src/elements/door.ts`), the NEW `emitOpening` produces EXACTLY the same text. Never
 * call `legacyEmitOpening` outside this file, and never "fix" a diff here by editing it —
 * a diff here for a heights-free statement is a real regression in the new printer.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { DoorNode, OpeningAttach, OpeningNode, PlanNode, Statement, WindowNode } from "../src/ast.js";
import { parse } from "../src/parser.js";
import { emitOpening } from "../src/fix-producers.js";
import { exprToSource } from "../src/expr-source.js";
import type { DoorHinge } from "../src/grammar/tokens.js";
import { fmt3 as numStr } from "../src/num-format.js";
import { archPlan } from "./arbitrary-plan.js";

type OpeningKind = "door" | "window" | "opening";
type OpeningLikeNode = DoorNode | WindowNode | OpeningNode;

interface LegacyEmitOpts {
  lead?: string;
  width?: string;
  attached?: boolean;
  hinge?: DoorHinge;
  drop?: readonly ("hinge" | "swing" | "slide" | "open")[];
  open?: string;
}

// ---------------------------------------------------------------------------
// `legacyEmitOpening` — verbatim copy of `emitOpening`'s body before W4b.
// ---------------------------------------------------------------------------

function legacyAttachPosText(pos: OpeningAttach["pos"]): string {
  if (pos.kind === "center") return "center";
  const v = pos.value ? exprToSource(pos.value) : numStr(0);
  return pos.kind === "percent" ? `${v}%` : v;
}

function legacyLeadText(node: OpeningLikeNode): string {
  if (node.attach) return `on ${node.attach.wall} at ${legacyAttachPosText(node.attach.pos)}`;
  return `at (${exprToSource(node.at!.x)}, ${exprToSource(node.at!.y)})`;
}

function legacyEmitOpening(kind: OpeningKind, node: OpeningLikeNode, opts: LegacyEmitOpts = {}): string {
  const id = node.id ? `id=${node.id} ` : "";
  const lead = opts.lead ?? legacyLeadText(node);
  const width = opts.width ?? exprToSource(node.width);
  const attached = opts.attached ?? !!node.attach;
  const wall = attached ? "" : node.wall ? ` wall ${node.wall}` : "";
  const dropped = (c: "hinge" | "swing" | "slide" | "open"): boolean => opts.drop?.includes(c) === true;
  let head = "";
  let tail = "";
  if (kind === "door") {
    const d = node as DoorNode;
    head = d.doorKind ? `${d.doorKind} ` : "";
    if (!dropped("hinge")) {
      if (opts.hinge) {
        tail += d.hingeNear ? ` hinge near ${opts.hinge === "left" ? "start" : "end"}` : ` hinge ${opts.hinge}`;
      } else {
        tail += d.hinge ? ` hinge ${d.hinge}` : d.hingeNear ? ` hinge near ${d.hingeNear}` : "";
      }
    }
    if (!dropped("swing")) {
      tail += d.swing ? ` swing ${d.swing}` : d.swingInto ? ` swing into ${d.swingInto}` : "";
    }
    if (!dropped("slide") && d.slide) tail += ` slide ${d.slide}`;
    if (!dropped("open") && d.open !== undefined) tail += ` open ${opts.open ?? exprToSource(d.open)}`;
  }
  return `${kind} ${id}${head}${lead} width ${width}${wall}${tail}`;
}

// ---------------------------------------------------------------------------
// Collecting every door/window/opening node out of a parsed plan.
// ---------------------------------------------------------------------------

function collectOpenings(stmts: Statement[], out: OpeningLikeNode[]): void {
  for (const s of stmts) {
    switch (s.kind) {
      case "door":
      case "window":
      case "opening":
        out.push(s);
        break;
      case "for":
      case "while":
        collectOpenings(s.body, out);
        break;
      case "if":
        collectOpenings(s.then, out);
        if (s.else) collectOpenings(s.else, out);
        break;
      case "zone":
      case "level":
        collectOpenings(s.body, out);
        break;
      default:
        break;
    }
  }
}

function allOpenings(plan: PlanNode): OpeningLikeNode[] {
  const out: OpeningLikeNode[] = [];
  collectOpenings(plan.body, out);
  for (const c of plan.components.values()) collectOpenings(c.body, out);
  return out;
}

function openingsIn(src: string): OpeningLikeNode[] {
  const { plan } = parse(src);
  return plan ? allOpenings(plan) : [];
}

// ---------------------------------------------------------------------------
// The corpus: examples + lib + fixtures + a fast-check sample of `archPlan`.
// ---------------------------------------------------------------------------

const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `examples/${f}`);
const LIB = readdirSync("examples/lib")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `examples/lib/${f}`);
const FIXTURES = readdirSync("test/fixtures")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `test/fixtures/${f}`);

// Hand-written, so the shapes below are PINNED regardless of what the shipped
// examples/fixtures happen to contain or what `fc.sample` happens to draw: an
// `at center` attach, a percent-EXPRESSION position, an mm-expression position, a
// door combining `hinge near`/`swing into`/`slide`/`open`, expression/array/`if`
// widths, and a sill-only + a head-only opening. Only parsed (never resolved), so
// a semantically odd combination (e.g. `slide` alongside `swing into` on one door)
// is fine — this file exercises `emitOpening`'s AST → text round trip, not
// the resolver's kind-clause rules.
const HAND_WRITTEN_SOURCES: string[] = [
  `plan "hand-written coverage" {
  units mm
  grid 1
  wall id=w1 exterior thickness 200 { (0,0) (4000,0) }
  wall id=w2 exterior thickness 200 { (0,0) (0,3000) }
  room id=r at (0,200) size 4000x3000 label "R"
  let bay = 900
  door id=d_center on w1 at center width 900
  window id=w_pct on w1 at (1 + 1) * 10% width 700
  door id=d_mm on w2 at bay * 2 + 600 width 700
  door id=d_hn on w1 at 1200 width 900 hinge near start swing into r slide left open 0.4
  door id=d_expr on w1 at 2000 width 800 + 100
  door id=d_arr on w1 at 2400 width [900, 800][0]
  door id=d_if on w1 at 2800 width if true { 900 } else { 800 }
  window id=w_sill on w1 at 3200 width 1000 sill 600
  window id=w_head on w1 at 3600 width 1000 head 2300
  opening id=o_head on w2 at 1500 width 900 head 2000
}`,
];

const CORPUS_SOURCES: string[] = [...EXAMPLES, ...LIB, ...FIXTURES].map((p) => readFileSync(p, "utf8"));
// 100, not 300: this and `fix-printer.test.ts` each pay their own collect-time for
// an identical `fc.sample(archPlan, ...)` (vitest isolates test files, so a shared
// cache module would not actually be shared) — 100 plus the corpus below is still
// comfortably over the non-trivial-corpus floor this file asserts.
const FUZZ_SOURCES: string[] = fc.sample(archPlan, { numRuns: 100, seed: 20260927 });

const ALL_OPENINGS: OpeningLikeNode[] = [...CORPUS_SOURCES, ...HAND_WRITTEN_SOURCES, ...FUZZ_SOURCES].flatMap(
  openingsIn,
);

// The current `EmitOpts` shape (`src/fix-producers.ts` post-MAJOR-2): `lead` is
// structured data, not text to parse, so it is spelled out here rather than
// imported (the real type is not exported, and re-declaring it is what lets this
// file catch a shape drift as a type error instead of silently comparing nothing).
interface RealEmitOpts {
  lead?: { wall: string; pct: number };
  width?: string;
  hinge?: DoorHinge;
  drop?: readonly ("hinge" | "swing" | "slide" | "open")[];
  open?: string;
}

/** `RealEmitOpts` → `LegacyEmitOpts`: the one shape that differs is `lead`, which
 *  the legacy printer only ever knew as pre-rendered text (`attached: true`
 *  alongside it, since `legacyLeadText` always described an `attach`ed opening
 *  when a lead override was given at all). */
function toLegacyOpts(opts: RealEmitOpts): LegacyEmitOpts {
  const { lead, ...rest } = opts;
  return lead ? { ...rest, lead: `on ${lead.wall} at ${numStr(lead.pct)}%`, attached: true } : rest;
}

// Real `EmitOpts` combinations, grepped from every `emitOpening(...)` call site in
// `src/fix-producers.ts` and `src/elements/door.ts`.
const REAL_OPTS: { name: string; opts: RealEmitOpts; onlyDoors?: boolean }[] = [
  { name: "offWallFix lead", opts: { lead: { wall: "w1", pct: 42.5 } } },
  { name: "doorKindClauseFix drop hinge", opts: { drop: ["hinge"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop swing", opts: { drop: ["swing"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop slide", opts: { drop: ["slide"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop open", opts: { drop: ["open"] }, onlyDoors: true },
  { name: "doorOpenRangeFix open", opts: { open: numStr(0.5) }, onlyDoors: true },
  { name: "openingWidthFix placeholder", opts: { width: "<positive-number>" } },
  { name: "door hinge-flip left", opts: { hinge: "left" }, onlyDoors: true },
  { name: "door hinge-flip right", opts: { hinge: "right" }, onlyDoors: true },
];

/** Only assert byte-identity for statements the old printer could have handled
 *  faithfully — i.e. no sill/head. A statement WITH one is exactly the case W4b
 *  fixes, and is counted (and pinned by its own, separate law) in `fix-printer.test.ts`. */
const HEIGHTS_FREE_OPENINGS = ALL_OPENINGS.filter(
  (n) => !(("sill" in n && n.sill !== undefined) || n.head !== undefined),
);
const HEIGHTS_CARRYING_COUNT = ALL_OPENINGS.length - HEIGHTS_FREE_OPENINGS.length;

describe("emitOpening === legacyEmitOpening (byte-identity, no sill/head/heights)", () => {
  it(`ran over a non-trivial corpus (${ALL_OPENINGS.length} openings, ${CORPUS_SOURCES.length} files + ${HAND_WRITTEN_SOURCES.length} hand-written + ${FUZZ_SOURCES.length} fuzz seeds)`, () => {
    expect(ALL_OPENINGS.length).toBeGreaterThan(20);
  });

  it("counted the heights-carrying openings excluded from the byte-identity assertion below", () => {
    // A fact about today's corpus, not a law, so it is not pinned to a literal here
    // (a corpus change should not need this test edited) — but it must be positive,
    // or the corpus below has stopped exercising sill/head/heights at all and
    // `fix-printer.test.ts`'s own law (which needs this set non-empty) is vacuous.
    expect(HEIGHTS_CARRYING_COUNT).toBeGreaterThan(0);
  });

  // One `it()` per real `EmitOpts` combination, looping every heights-free opening
  // internally and collecting every mismatch, rather than one `it()` per
  // (opening, opts) pair — thousands of cases would otherwise balloon the suite's
  // test count for no more signal than a single assertion over the whole set gives.
  for (const { name, opts, onlyDoors } of REAL_OPTS) {
    it(`${name} (over ${HEIGHTS_FREE_OPENINGS.length} heights-free openings${onlyDoors ? ", doors only" : ""})`, () => {
      const failures: string[] = [];
      let ran = 0;
      for (const node of HEIGHTS_FREE_OPENINGS) {
        if (onlyDoors && node.kind !== "door") continue;
        ran++;
        const got = emitOpening(node.kind, node, opts);
        const want = legacyEmitOpening(node.kind, node, toLegacyOpts(opts));
        if (got !== want) {
          failures.push(`${node.kind} ${node.id ?? "<anon>"}:\n  got:  ${got}\n  want: ${want}`);
        }
      }
      expect(ran, "the filter above matched zero openings — this assertion is vacuous").toBeGreaterThan(0);
      expect(failures.length, `${failures.length}/${ran} mismatched:\n\n${failures.slice(0, 10).join("\n\n")}`).toBe(0);
    });
  }
});
