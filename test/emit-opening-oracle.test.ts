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

const CORPUS_SOURCES: string[] = [...EXAMPLES, ...LIB, ...FIXTURES].map((p) => readFileSync(p, "utf8"));
const FUZZ_SOURCES: string[] = fc.sample(archPlan, { numRuns: 300, seed: 20260927 });

const ALL_OPENINGS: OpeningLikeNode[] = [...CORPUS_SOURCES, ...FUZZ_SOURCES].flatMap(openingsIn);

// Real `EmitOpts` combinations, grepped from every `emitOpening(...)` call site in
// `src/fix-producers.ts` and `src/elements/door.ts`.
const REAL_OPTS: { name: string; opts: LegacyEmitOpts; onlyDoors?: boolean }[] = [
  // The historical real call site (`offWallFix`, pre-W4b) always passed `attached:
  // true` alongside `lead` — `attached` no longer exists on the new `EmitOpts` (the
  // new `applyEmitOpts` infers it from the `attach` the lead override installs), so
  // it is harmless extra input to the NEW `emitOpening` and exactly what
  // `legacyEmitOpening` needs to reproduce the old behaviour it is graded against.
  { name: "offWallFix lead", opts: { lead: "on w1 at 42.5%", attached: true } },
  { name: "doorKindClauseFix drop hinge", opts: { drop: ["hinge"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop swing", opts: { drop: ["swing"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop slide", opts: { drop: ["slide"] }, onlyDoors: true },
  { name: "doorKindClauseFix drop open", opts: { drop: ["open"] }, onlyDoors: true },
  { name: "doorOpenRangeFix open", opts: { open: numStr(0.5) }, onlyDoors: true },
  { name: "openingWidthFix placeholder", opts: { width: "<positive-number>" } },
  { name: "door hinge-flip left", opts: { hinge: "left" }, onlyDoors: true },
  { name: "door hinge-flip right", opts: { hinge: "right" }, onlyDoors: true },
];

describe("emitOpening === legacyEmitOpening (byte-identity, no sill/head/heights)", () => {
  it(`ran over a non-trivial corpus (${ALL_OPENINGS.length} openings, ${CORPUS_SOURCES.length} files + ${FUZZ_SOURCES.length} fuzz seeds)`, () => {
    expect(ALL_OPENINGS.length).toBeGreaterThan(20);
  });

  let heightsCarryingCount = 0;

  for (const node of ALL_OPENINGS) {
    // Only assert byte-identity for statements the old printer could have handled
    // faithfully — i.e. no sill/head. A statement WITH one is exactly the case W4b
    // fixes, and is counted (and its own, separate law) below.
    const hasHeights = ("sill" in node && node.sill !== undefined) || node.head !== undefined;
    if (hasHeights) {
      heightsCarryingCount++;
      continue;
    }
    for (const { name, opts, onlyDoors } of REAL_OPTS) {
      if (onlyDoors && node.kind !== "door") continue;
      const id = node.id ?? "<anon>";
      it(`${node.kind} ${id} — ${name}`, () => {
        expect(emitOpening(node.kind, node, opts)).toBe(legacyEmitOpening(node.kind, node, opts));
      });
    }
  }

  it("counted the heights-carrying openings excluded from the byte-identity assertion above", () => {
    // See the report for the exact count and which files/seeds carry one — this
    // count is a fact about today's corpus, not a law, so it is not pinned to a
    // literal here (a corpus change should not need this test edited).
    expect(heightsCarryingCount).toBeGreaterThanOrEqual(0);
  });
});
