/**
 * `keep`: declared invariants, checked by `compile()` and never solved (ADR 0033; plan-soundness
 * PS4.3, design `docs/plans/plan-soundness/research/2026-10-26-ps43-keep-design.md`).
 *
 * A keep is a control statement. It is expanded with the body it sits in ({@link expandKeep}: its
 * values evaluated on the step meter, its placement and caps checked), then measured once, after
 * its storey has finished resolving, against the resolved plan in plan coordinates
 * ({@link evaluateKeeps}); a `stacked` keep is measured after the last storey
 * ({@link evaluateStacked}). It reads, it never writes: nothing is moved, snapped, re-hosted or
 * re-tried, and the results live in a side table beside the resolved plan (`ir.ts`), never on an
 * element and never on the memoised AST.
 *
 * Exactness (ADR 0022, design R5/R6/R20). A datum is read as an expression in the plan would read
 * it, grid-snapped; each value is put on the 0.001 mm lattice by `sign(v)·round(|v|·1000)` and the
 * arithmetic is done in integers. Every quantity is held in HALF-lattice units (0.0005 mm) so a
 * centre line (`cx`, `cy`) is compared at twice its value and never rounded, and a wall face
 * (centreline ± t/2) is exact. A keep's own `<mm>` is put on the lattice and never snapped.
 *
 * Budget (design §4, R11, R13). Expansion charges one step per target before the record is
 * allocated (its expressions are charged as every expression is); the measure charges once,
 * immediately before it runs: `1 + targets`, `min clear` its scan, `stacked` `1 + 4 × levels`. The
 * per-storey indexes are built once and charged once when built. Past `MAX_KEEPS` keeps (or
 * `MAX_KEEP_TARGETS` targets in one) `E_KEEP_LIMIT` is raised once and every later keep is dropped
 * while its expansion is still charged.
 *
 * Messages are id-free (R17): rooms by `src/naming.ts`'s phrases, walls by the rooms on their
 * faces; the ids and datums as written go in `hints[0]`.
 */

import type { KeepGrade, KeepNode, KeepRef, Point } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { chargeSteps, closest, stepSite } from "./expr.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import { arcExtremes } from "./geometry/arc.js";
import { pointInPolygon } from "./geometry/polygon.js";
import type { RRoom, ResolvedElement, ResolvedPlan, RWall } from "./ir.js";
import {
  capFirst,
  makeNaming,
  type Naming,
  type NameableRoom,
  nameableOf,
  type WallRun,
  wallRunPhrase,
} from "./naming.js";
import { fmt3, fmtHalfLattice, MODEL_RANGE_MM } from "./num-format.js";
import { COMPASS_DATUM_ALIASES, type DatumWord } from "./room-datums.js";
import { keepFormText, keepRefText } from "./statement-print.js";
import { classifyLabelUses } from "./vocabulary.js";

/** Most keeps one plan may declare: 12 × the 80 that would pin every edge of the largest example. */
export const MAX_KEEPS = 1_000;
/** Most targets, or levels, one keep may name. */
export const MAX_KEEP_TARGETS = 64;

// ---- the lattice ---------------------------------------------------------------------------

/** `v` on the 0.001 mm lattice, sign-symmetric (R6), as an integer count of 0.001 mm. */
function lattice(v: number): number {
  const r = Math.round(Math.abs(v) * 1000);
  return v < 0 && r !== 0 ? -r : r;
}
/** An edge, a length or a `<mm>` in half-lattice units. */
const halfOf = (v: number): number => 2 * lattice(v);
/** {@link halfOf}, for the static facts: a literal on the same scale as a keep's residuals. */
export const keepHalfOf = halfOf;
/** A centre line in half-lattice units: twice its value, on the lattice, so it is never rounded. */
const halfOfCentre = (v: number): number => lattice(2 * v);
/** A half-lattice count in mm, exact. */
const mmText = (h: number): string => fmtHalfLattice(h);
/** A half-lattice count as the JSON number of its exact decimal. */
export const mmNumber = (h: number): number => Number(fmtHalfLattice(h));

// ---- expansion -----------------------------------------------------------------------------

/** A keep as expansion left it: its node and its evaluated values. */
export interface KeepRecord {
  node: KeepNode;
  /** The evaluated `<mm>` (`offset`, `min clear`, `fixed`). */
  mm?: number;
  /** The evaluated levels (`stacked`). */
  levels?: number[];
}

/** Every keep one resolution expanded, and the plan-wide cap's state (shared by reference). */
export interface KeepSink {
  list: KeepRecord[];
  /** Keeps counted so far in the plan (the storeys below this one's included). */
  count: number;
  /** `E_KEEP_LIMIT` has been raised (sticky). */
  limited: boolean;
}

/** Where a keep is being expanded. */
export type KeepPlace =
  /** inside a component body (a `place`d instance, a bare call, an imported file) */
  | "component"
  /** the body of a single-storey plan */
  | "plan"
  /** a `level` block of a multi-storey plan */
  | "storey"
  /** the root of a multi-storey plan (only `stacked` reaches here) */
  | "root";

const MESSAGE_TAIL = " A keep moves nothing.";

function refsOf(n: KeepNode): KeepRef[] {
  switch (n.form) {
    case "align":
    case "equal":
      return n.refs;
    case "offset":
      return [n.x, n.from];
    case "min-clear":
      return [n.room];
    case "on-axis":
      return [n.axis, n.wall];
    case "stacked":
      return [n.target];
    case "fixed":
      return [n.datum];
  }
}

/** The refs a keep names, in the order it names them (read by `impact` and the static facts). */
export const keepRefsOf = (n: KeepNode): KeepRef[] => refsOf(n);

/** One step per target (levels included) — what expansion charges before the record. */
function targetCount(n: KeepNode): number {
  return refsOf(n).length + (n.form === "stacked" ? n.levels.length : 0);
}

/** A ref's identity for the self-reference check: a compass word is its frame word. */
function refKey(r: KeepRef): string {
  switch (r.t) {
    case "room":
      return `room\u0000${r.room}\u0000${COMPASS_DATUM_ALIASES[r.word] ?? r.word}`;
    case "axis":
      return `axis\u0000${r.label}`;
    case "el":
      return `el\u0000${r.id}\u0000${r.segment ?? ""}`;
  }
}

/** What a ref is, said without its id (for an id-free refusal message). */
function refKind(r: KeepRef): string {
  if (r.t === "axis") return `axis ${r.label}`;
  if (r.t === "room")
    return `the ${datumWordName(COMPASS_DATUM_ALIASES[r.word] ?? (r.word as DatumWord), r.word)} of a room`;
  return "one target";
}

/**
 * Expand one keep statement: charge it, refuse it where it may not stand, count it against the
 * caps, evaluate its values and check them; on success append its record to `sink`. Every refusal
 * is a compile error (R8) through `diag`. `evalNum` returns `undefined` when evaluating the value
 * raised a diagnostic (`E_DIV_ZERO`, `E_DATUM_BEFORE_ROOMS`, …): that diagnostic is the report,
 * and the keep is dropped rather than measured against a substitute value.
 */
export function expandKeep(
  node: KeepNode,
  place: KeepPlace,
  evalNum: (e: import("./expr.js").Expr) => number | undefined,
  diag: (d: Diagnostic) => void,
  sink: KeepSink,
): void {
  // Charged before anything is allocated, and whether or not a refusal or the cap then drops it
  // (R13): one step per target and level.
  chargeSteps(targetCount(node));
  const span = node.span;
  const text = (): string => `keep ${keepFormText(node)}`;
  const refuse = ({ code }: { code: string }, message: string, hint: () => string): void =>
    diag({ severity: "error", code, message, ...(span ? { span } : {}), hints: [hint()] });
  if (place === "component") {
    refuse(
      { code: "E_KEEP_PLACEMENT" },
      "A keep inside a component would be checked once per instance in its own frame; write it in the plan",
      () =>
        `\`${text()}\` sits in a component body (a \`place\`d or called component, or an imported file); move it to the plan or storey that places the component`,
    );
    return;
  }
  if (node.form === "stacked" && place !== "root") {
    refuse(
      { code: "E_KEEP_PLACEMENT" },
      place === "storey"
        ? "A stacked keep compares storeys, so it sits outside every level"
        : "A stacked keep compares storeys, and this plan has one",
      () =>
        place === "storey"
          ? `move \`${text()}\` out of the \`level\` block, to the plan's root`
          : `\`${text()}\` needs a plan of two or more \`level\` blocks`,
    );
    return;
  }
  sink.count++;
  if (
    sink.count > MAX_KEEPS ||
    refsOf(node).length > MAX_KEEP_TARGETS ||
    targetCount(node) - refsOf(node).length > MAX_KEEP_TARGETS
  ) {
    if (!sink.limited) {
      sink.limited = true;
      refuse(
        { code: "E_KEEP_LIMIT" },
        sink.count > MAX_KEEPS
          ? `A plan may declare at most ${fmt3(MAX_KEEPS)} keeps`
          : `A keep may name at most ${fmt3(MAX_KEEP_TARGETS)} targets or levels`,
        () => "this keep and every later one past the cap are not checked; split the keep, or keep fewer",
      );
    }
    return;
  }
  const refs = refsOf(node);
  const seen = new Set<string>();
  for (const r of refs) {
    const k = refKey(r);
    if (seen.has(k)) {
      refuse(
        { code: "E_KEEP_SELF" },
        `This keep compares ${refKind(r)} with itself`,
        () => `\`${keepRefText(r)}\` is named twice in \`${text()}\`; name each target once`,
      );
      return;
    }
    seen.add(k);
  }
  const rec: KeepRecord = { node };
  if (node.form === "offset" || node.form === "min-clear" || node.form === "fixed") {
    const mm = evalNum(node.mm);
    if (mm === undefined) return;
    if (!(Math.abs(mm) <= MODEL_RANGE_MM)) {
      refuse(
        { code: "E_KEEP_VALUE" },
        `A keep's length must be in mm within ±${fmt3(MODEL_RANGE_MM)} (2^25 mm)`,
        () => `\`${text()}\` evaluates its length to ${fmt3(mm)}`,
      );
      return;
    }
    if (node.form === "min-clear" && !(mm > 0)) {
      refuse(
        { code: "E_KEEP_VALUE" },
        "A minimum clear span must be a positive length in mm",
        () => `\`${text()}\` asks for ${fmt3(mm)} mm`,
      );
      return;
    }
    rec.mm = mm;
  }
  if (node.form === "stacked") {
    const levels: number[] = [];
    for (const e of node.levels) {
      const v = evalNum(e);
      if (v === undefined) return;
      if (!Number.isInteger(v)) {
        refuse(
          { code: "E_KEEP_VALUE" },
          "A level in a stacked keep must be a whole storey number",
          () => `\`${text()}\` names level ${fmt3(v)}`,
        );
        return;
      }
      if (levels.includes(v)) {
        refuse(
          { code: "E_KEEP_SELF" },
          `This keep compares level ${fmt3(v)} with itself`,
          () => `\`${text()}\` lists level ${fmt3(v)} twice`,
        );
        return;
      }
      levels.push(v);
    }
    rec.levels = levels;
  }
  sink.list.push(rec);
}

// ---- results -------------------------------------------------------------------------------

/** Where the reported residual stands. */
export interface KeepAt {
  target: string;
  level?: number;
  edge?: "left" | "top" | "right" | "bottom";
}

/** One residual of a keep that compares several things (`align`, `equal`, `stacked`). */
export interface KeepResidual {
  target: string;
  level?: number;
  edge?: KeepAt["edge"];
  /** Half-lattice units. */
  h: number;
}

/** Why `min clear` did not read a wall segment that meets the room, by count. */
export interface KeepSkipped {
  /** A straight run that does not span the room on the joined outline. */
  not_spanning?: number;
  /** A straight run that ends in a curved or oblique wall, which carries no run (so it does not
   *  span the room, whatever it ends in). */
  ends_in_curved_or_oblique?: number;
  /** A curved segment (an arc is never a cut). */
  curved?: number;
  /** An oblique straight segment (never a cut). */
  oblique?: number;
}

/** One accepted keep, measured. */
export interface KeepResult {
  node: KeepNode;
  /** The statement as `arch fmt` prints it, without `keep` and the grade. */
  keep: string;
  form: string;
  grade: KeepGrade;
  /** The storey it was measured on, on a multi-storey plan (absent for a `stacked` keep). */
  level?: number;
  /** The targets as written. */
  targets: string[];
  holds: boolean;
  /** The reported residual, half-lattice units. */
  h: number;
  at?: KeepAt;
  /** `min clear`: the measured clear span, half-lattice units. */
  measuredH?: number;
  /** Every residual, for a keep that compares several things. */
  residuals?: KeepResidual[];
  /** `min clear`: the wall segments that meet the room and could not be read. */
  skippedWalls?: number;
  /** `min clear`: why they were not read, when any were. */
  skipped?: KeepSkipped;
  /** When broken: the id-free message and its hints (the `W_KEEP_VIOLATED` text for any grade). */
  message?: string;
  hints?: string[];
  /** Internal, read by the static facts (`--facts depends`): whether the lines `align`, `on
   *  axis`, `offset` and `fixed` compare are vertical (their values are x) or horizontal. */
  vertical?: boolean;
  /** Internal, read by the static facts and `impact`: a `stacked` keep's levels as evaluated. */
  levels?: number[];
  /** Internal, read by the static facts: the keep's own `<mm>` (`offset`, `min clear`, `fixed`),
   *  half-lattice units, never snapped. */
  valueH?: number;
}

const FORM_WORDS: Record<KeepNode["form"], string> = {
  align: "align",
  equal: "equal",
  offset: "offset",
  "min-clear": "min clear",
  "on-axis": "on axis",
  stacked: "stacked",
  fixed: "fixed",
};

/** The `W_KEEP_VIOLATED` diagnostic of a broken hard keep. */
export function violationOf(r: KeepResult): Diagnostic {
  return {
    severity: "warning",
    code: "W_KEEP_VIOLATED",
    message: r.message!,
    ...(r.node.span ? { span: r.node.span } : {}),
    hints: r.hints!,
  };
}

// ---- measuring one storey ------------------------------------------------------------------

/** What measuring one storey's keeps needs from the resolver. */
export interface KeepStoreyCtx {
  ir: ResolvedPlan;
  snap(v: number): number;
  /** Whether `id` is an element id the author wrote (never an auto id). */
  authored(id: string): boolean;
  /** Compass words alias the frame words (a root plan whose `north` is `up`), and why not. */
  compass: { aliases: boolean; why: string };
  /** The storey, on a multi-storey plan (the results carry it). */
  level?: number;
  /** The storey a message names an unlabelled room on: set only when the plan has two or more. */
  namingLevel?: number;
  /** Report (and charge) one diagnostic. */
  diag(d: Diagnostic): void;
}

/** A line a datum names: vertical (its value an x) or horizontal (a y), in half-lattice units. */
interface Line {
  vertical: boolean;
  h: number;
  /** How a message names it, and how it refers back to it ("that edge"). */
  phrase: string;
  that: string;
  text: string;
}

type Refusal = { code: string; message: string; hint: string };

/** The storey's index of elements by id, built once and charged once (R13). */
interface StoreyIndex {
  byId: Map<string, ResolvedElement>;
  naming: Naming;
  nameable: Map<string, NameableRoom>;
  rooms: RRoom[];
}

const EDGE_ORDER = ["left", "top", "right", "bottom"] as const;

function datumWordName(word: DatumWord, written: string): string {
  if (written !== word) return `${written} edge`;
  switch (word) {
    case "cx":
      return "vertical centre line";
    case "cy":
      return "horizontal centre line";
    default:
      return `${word} edge`;
  }
}

/** "A", "A and B", "A, B and C". */
function listWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
const codeList = (xs: readonly string[]): string => listWords(xs.map((x) => `\`${x}\``));

/** `+` is right of / below; `−` left of / above. */
function sideWord(vertical: boolean, h: number): string {
  return vertical ? (h >= 0 ? "right of" : "left of") : h >= 0 ? "below" : "above";
}
const axisWord = (vertical: boolean): string => (vertical ? "x" : "y");
const signWord = (vertical: boolean): string => (vertical ? "+ is right" : "+ is down");

function indexOf(ctx: KeepStoreyCtx): StoreyIndex {
  const { ir } = ctx;
  chargeSteps(ir.elements.length + ir.walls.length + 1);
  const byId = new Map<string, ResolvedElement>();
  for (const e of ir.elements) if (!byId.has(e.id)) byId.set(e.id, e);
  for (const w of ir.walls) if (!byId.has(w.id)) byId.set(w.id, w);
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const nameable = new Map(
    rooms.map(
      (r) =>
        [r.id, nameableOf(r, r.uses && r.uses.length > 0 ? r.uses : classifyLabelUses(r.label ?? r.id).uses)] as const,
    ),
  );
  return { byId, naming: makeNaming([...nameable.values()], ctx.namingLevel), nameable, rooms };
}

function roomPhrase(ix: StoreyIndex, r: RRoom): string {
  if (r.label !== undefined) return `"${r.label}"`;
  const n = ix.nameable.get(r.id);
  return n ? ix.naming.phrase(n) : "an unlabelled room";
}

/** The room whose floor holds `p`, if any (its own shape, never its bbox, for a polygon). */
function roomAtPoint(ix: StoreyIndex, p: Point): RRoom | undefined {
  return ix.rooms.find((r) => {
    if (r._unplaced) return false;
    if (r.poly && r.poly.length >= 3) return pointInPolygon(p.x, p.y, r.poly);
    return p.x > r.at.x && p.x < r.at.x + r.size.w && p.y > r.at.y && p.y < r.at.y + r.size.h;
  });
}

function wallPhrase(ix: StoreyIndex, s: WallSegment): string {
  const roomAt = (p: Point): { id: string; phrase: string } | undefined => {
    const r = roomAtPoint(ix, p);
    return r ? { id: r.id, phrase: roomPhrase(ix, r) } : undefined;
  };
  const place = (p: Point): string => ix.naming.placeAt(p);
  // Read at the run's midpoint; where neither face probe lands in a room there (two rooms meet
  // at the middle of the run), at its quarter points, each as a short run of the same wall.
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  for (const t of [0.5, 0.25, 0.75]) {
    const c = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    const d = { x: (s.b.x - s.a.x) / 1000, y: (s.b.y - s.a.y) / 1000 };
    const run: WallRun = { ...s, a: { x: c.x - d.x, y: c.y - d.y }, b: { x: c.x + d.x, y: c.y + d.y } };
    if (len === 0) break;
    const off = s.thickness / 2 + 50;
    const nx = -(s.b.y - s.a.y) / len;
    const ny = (s.b.x - s.a.x) / len;
    if (roomAt({ x: c.x + nx * off, y: c.y + ny * off }) || roomAt({ x: c.x - nx * off, y: c.y - ny * off })) {
      return wallRunPhrase(t === 0.5 ? s : run, roomAt, place);
    }
  }
  return wallRunPhrase(s, roomAt, place);
}

/**
 * A door, window or cased opening named by the rooms it serves (never its id): one probe a little
 * past each face of its host at its own position. Between two rooms: "the door between A and B";
 * one room: "the window of A" / "the exterior door into A"; none: its kind and where it stands.
 */
function openingPhrase(ix: StoreyIndex, el: { kind: string; at: Point; host: WallSegment | null }): string {
  const s = el.host;
  if (s) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const off = s.thickness / 2 + 50;
      const a = roomAtPoint(ix, { x: el.at.x - (dy / len) * off, y: el.at.y + (dx / len) * off });
      const b = roomAtPoint(ix, { x: el.at.x + (dy / len) * off, y: el.at.y - (dx / len) * off });
      if (a && b && a !== b) return `the ${el.kind} between ${roomPhrase(ix, a)} and ${roomPhrase(ix, b)}`;
      const one = a ?? b;
      if (one)
        return el.kind === "window"
          ? `the window of ${roomPhrase(ix, one)}`
          : `the exterior ${el.kind} into ${roomPhrase(ix, one)}`;
    }
  }
  return `the ${el.kind} ${ix.naming.placeAt(el.at)}`;
}

const wallNoun = (s: WallSegment): string => (s.category === "partition" ? "partition" : "wall");

/** Look an authored element up, or say why not. */
function lookup(ix: StoreyIndex, ctx: KeepStoreyCtx, id: string, text: string): ResolvedElement | Refusal {
  const el = ix.byId.get(id);
  if (!el && ctx.authored(id)) {
    return {
      code: "E_KEEP_TARGET",
      message: "This keep names an element that could not be placed",
      hint: `\`${id}\` in \`${text}\` was written here and dropped (its own error says why)`,
    };
  }
  if (!el) {
    const hint = closest(
      id,
      [...ix.byId.keys()].filter((k) => ctx.authored(k)),
    );
    return {
      code: "E_KEEP_TARGET",
      message: "This keep names something that is not an authored id on this storey",
      hint: `\`${id}\` in \`${text}\` names no element here${hint ? ` (did you mean \`${hint}\`?)` : ""}`,
    };
  }
  if (!ctx.authored(id)) {
    return {
      code: "E_KEEP_TARGET",
      message: "This keep names an element by an auto id, which renumbers when an earlier element is named",
      hint: `\`${id}\` in \`${text}\` is an assigned id; give the element its own \`id=\` and name that`,
    };
  }
  if (el.kind === "room" && (el as RRoom)._unplaced) {
    return {
      code: "E_KEEP_TARGET",
      message: "This keep names a room that could not be placed",
      hint: `\`${id}\` in \`${text}\` has no position (its own error says why)`,
    };
  }
  return el;
}

const isRefusal = (x: unknown): x is Refusal => typeof x === "object" && x !== null && "code" in x && "hint" in x;

/** A straight wall segment of an authored wall, or why it is not one. */
function wallSegment(w: RWall, ref: Extract<KeepRef, { t: "el" }>, text: string): WallSegment | Refusal {
  const segs = segmentsOfWall(w);
  let s: WallSegment | undefined;
  if (ref.segment !== undefined) {
    s = segs[ref.segment];
    if (!s) {
      return {
        code: "E_KEEP_TARGET",
        message: `This keep names a wall segment the wall does not have`,
        hint: `\`${ref.id}\` in \`${text}\` has segments 0 to ${fmt3(segs.length - 1)}`,
      };
    }
  } else if (segs.length !== 1) {
    return {
      code: "E_KEEP_MEASURE",
      message: `A wall of ${fmt3(segs.length)} segments has no one line to measure: name one of its segments`,
      hint: `write \`${ref.id} segment <n>\` in \`${text}\` (segments are numbered from 0)`,
    };
  } else s = segs[0]!;
  if (s.arc) {
    return {
      code: "E_KEEP_MEASURE",
      message: "A curved wall segment has no straight line to measure",
      hint: `\`${keepRefText(ref)}\` in \`${text}\` is an arc`,
    };
  }
  const vertical = s.a.x === s.b.x && s.a.y !== s.b.y;
  const horizontal = s.a.y === s.b.y && s.a.x !== s.b.x;
  if (!vertical && !horizontal) {
    return {
      code: "E_KEEP_MEASURE",
      message: "An oblique wall segment has no vertical or horizontal line to measure",
      hint: `\`${keepRefText(ref)}\` in \`${text}\` runs neither along x nor along y`,
    };
  }
  return s;
}

/** Read a datum (`<d>`) as a line, or say why it is not one. */
function readLine(ix: StoreyIndex, ctx: KeepStoreyCtx, ref: KeepRef, text: string): Line | Refusal {
  const written = keepRefText(ref);
  if (ref.t === "axis") {
    const a = ctx.ir.axes?.find((x) => x.label === ref.label);
    if (!a) {
      return {
        code: "E_KEEP_TARGET",
        message: ctx.ir.axes?.length
          ? `This keep names axis ${ref.label}, and no positioning axis has that label`
          : "This keep names a positioning axis, and the plan declares none",
        hint: `\`${written}\` in \`${text}\`; declare it in the plan's \`axes\` block`,
      };
    }
    return {
      vertical: a.axis === "x",
      h: halfOf(a.pos),
      phrase: `axis ${a.label}`,
      that: "that axis",
      text: written,
    };
  }
  if (ref.t === "room") {
    let word = ref.word as DatumWord;
    const alias = COMPASS_DATUM_ALIASES[ref.word];
    if (alias !== undefined) {
      if (!ctx.compass.aliases) {
        return {
          code: "E_DATUM_COMPASS",
          message: `\`${ref.word}\` would mean two things here (${ctx.compass.why})`,
          hint: `write \`${ref.room}.${alias}\` in \`${text}\``,
        };
      }
      word = alias;
    }
    const el = lookup(ix, ctx, ref.room, text);
    if (isRefusal(el)) return el;
    if (el.kind !== "room") {
      return {
        code: "E_KEEP_MEASURE",
        message: `A ${el.kind} has no ${datumWordName(word, ref.word)} to measure: only a rectangular room exposes datums`,
        hint: `\`${written}\` in \`${text}\` names a ${el.kind}`,
      };
    }
    const r = el as RRoom;
    if (r.circle || r.poly) {
      return {
        code: "E_KEEP_MEASURE",
        message: `A ${r.circle ? "circle" : "polygon"} room has no ${datumWordName(word, ref.word)} to measure`,
        hint: `\`${written}\` in \`${text}\`; only a rectangular room exposes datums`,
      };
    }
    if (!(r.size.w > 0 && r.size.h > 0)) {
      return {
        code: "E_KEEP_MEASURE",
        message: "A room of no positive size has no edge to measure",
        hint: `\`${written}\` in \`${text}\``,
      };
    }
    const { x, y } = r.at;
    const { w, h } = r.size;
    const raw: Record<DatumWord, number> = {
      left: x,
      right: x + w,
      top: y,
      bottom: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
    const v = ctx.snap(raw[word]);
    const centre = word === "cx" || word === "cy";
    return {
      vertical: word === "left" || word === "right" || word === "cx",
      h: centre ? halfOfCentre(v) : halfOf(v),
      phrase: `the ${datumWordName(word, ref.word)} of ${roomPhrase(ix, r)}`,
      that: centre ? "that centre line" : "that edge",
      text: written,
    };
  }
  const el = lookup(ix, ctx, ref.id, text);
  if (isRefusal(el)) return el;
  if (el.kind !== "wall") {
    return {
      code: "E_KEEP_MEASURE",
      message:
        el.kind === "room"
          ? "A room is not a line: name one of its edges or centre lines"
          : `A ${el.kind} is not a line a keep can align`,
      hint: `\`${written}\` in \`${text}\`${el.kind === "room" ? `: write \`${ref.id}.left\`, \`${ref.id}.cx\`, …` : ""}`,
    };
  }
  const s = wallSegment(el as RWall, ref, text);
  if (isRefusal(s)) return s;
  const vertical = s.a.x === s.b.x;
  const phrase = wallPhrase(ix, s);
  return {
    vertical,
    h: halfOf(vertical ? s.a.x : s.a.y),
    phrase: ref.segment !== undefined ? `segment ${fmt3(ref.segment)} of ${phrase}` : phrase,
    that: `that ${wallNoun(s)}`,
    text: written,
  };
}

/** A point a keep reads an element at (`offset`'s `<x>`): an opening's centre, a piece's centre. */
function readPoint(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  ref: Extract<KeepRef, { t: "el" }>,
  text: string,
): { x: number; y: number; phrase: string; text: string } | Refusal | undefined {
  const el = ix.byId.get(ref.id);
  if (!el || ref.segment !== undefined) return undefined;
  if (el.kind !== "door" && el.kind !== "window" && el.kind !== "opening" && el.kind !== "furniture") return undefined;
  const found = lookup(ix, ctx, ref.id, text);
  if (isRefusal(found)) return found;
  if (el.kind === "furniture") {
    const f = el;
    const r = f.room !== undefined ? (ix.byId.get(f.room) as RRoom | undefined) : undefined;
    const what = f.category.replace(/_/g, " ");
    return {
      // The footprint rectangle's own centre, doubled so it is never rounded.
      x: f.at.x * 2 + f.size.w,
      y: f.at.y * 2 + f.size.h,
      phrase: r && r.kind === "room" ? `the ${what} in ${roomPhrase(ix, r)}` : `the ${what}`,
      text: keepRefText(ref),
    };
  }
  return {
    x: el.at.x * 2,
    y: el.at.y * 2,
    phrase: openingPhrase(ix, el),
    text: keepRefText(ref),
  };
}

/** The extent `equal` compares: a rectangular room's width or depth, an opening's width. */
function readExtent(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  ref: KeepRef,
  measure: "width" | "depth",
  text: string,
): { h: number; phrase: string; text: string } | Refusal {
  const written = keepRefText(ref);
  if (ref.t !== "el" || ref.segment !== undefined) {
    return {
      code: "E_KEEP_MEASURE",
      message: `\`keep equal\` compares rooms or openings, not a datum`,
      hint: `\`${written}\` in \`${text}\`; name the room or the opening itself`,
    };
  }
  const el = lookup(ix, ctx, ref.id, text);
  if (isRefusal(el)) return el;
  if (el.kind === "room") {
    const r = el as RRoom;
    if (r.circle || r.poly) {
      return {
        code: "E_KEEP_MEASURE",
        message: `A ${r.circle ? "circle" : "polygon"} room has no ${measure} to compare`,
        hint: `\`${written}\` in \`${text}\`; only a rectangular room has one`,
      };
    }
    return { h: halfOf(measure === "width" ? r.size.w : r.size.h), phrase: roomPhrase(ix, r), text: written };
  }
  if (el.kind === "door" || el.kind === "window" || el.kind === "opening") {
    if (measure === "depth") {
      return {
        code: "E_KEEP_MEASURE",
        message: `A ${el.kind} has no depth to compare: \`keep equal\` reads an opening's width`,
        hint: `\`${written}\` in \`${text}\`; write \`keep equal width …\``,
      };
    }
    return {
      h: halfOf(el.width),
      phrase: openingPhrase(ix, el),
      text: written,
    };
  }
  return {
    code: "E_KEEP_MEASURE",
    message: `A ${el.kind} has no ${measure} \`keep equal\` compares: name rooms or openings`,
    hint: `\`${written}\` in \`${text}\``,
  };
}

/** The largest residual in magnitude, the first on a tie. */
function largest(rs: readonly KeepResidual[]): KeepResidual | undefined {
  let best: KeepResidual | undefined;
  for (const r of rs) if (best === undefined || Math.abs(r.h) > Math.abs(best.h)) best = r;
  return best;
}

/** A refusal reported at the keep. */
function refuseAt(ctx: KeepStoreyCtx, node: KeepNode, r: Refusal): void {
  ctx.diag({
    severity: "error",
    code: r.code,
    message: r.message,
    ...(node.span ? { span: node.span } : {}),
    hints: [r.hint],
  });
}

const NOTHING_MOVED = (target: string): string =>
  `Nothing was moved: \`${target}\` stands where its own statement puts it.`;

/**
 * Measure one storey's keeps, in source order, against the storey as resolved. Accepted keeps
 * return a result each; a refused one reports its `E_KEEP_*` error and returns none. Charged per
 * keep immediately before its measure; the index is built once, on the first keep.
 */
export function evaluateKeeps(records: readonly KeepRecord[], ctx: KeepStoreyCtx): KeepResult[] {
  const out: KeepResult[] = [];
  let ix: StoreyIndex | undefined;
  let scan: WallScan | undefined;
  for (const rec of records) {
    const node = rec.node;
    stepSite(node.span);
    ix ??= indexOf(ctx);
    const text = keepFormText(node);
    const base = {
      node,
      keep: text,
      form: FORM_WORDS[node.form],
      grade: node.grade ?? "hard",
      ...(ctx.level !== undefined ? { level: ctx.level } : {}),
      targets: refsOf(node).map(keepRefText),
    };
    let r: Omit<KeepResult, keyof typeof base> | Refusal;
    switch (node.form) {
      case "align":
      case "on-axis":
      case "fixed":
        chargeSteps(1 + refsOf(node).length);
        r = node.form === "fixed" ? measureFixed(ix, ctx, node, rec.mm!, text) : measureAlign(ix, ctx, node, text);
        break;
      case "equal":
        chargeSteps(1 + node.refs.length);
        r = measureEqual(ix, ctx, node, text);
        break;
      case "offset":
        chargeSteps(3);
        r = measureOffset(ix, ctx, node, rec.mm!, text);
        break;
      case "min-clear":
        r = measureMinClear(ix, ctx, node, rec.mm!, text, () => (scan ??= wallScan(ctx.ir)));
        break;
      case "stacked":
        // Never reaches a storey: refused at expansion everywhere but the root.
        continue;
    }
    if (isRefusal(r)) {
      refuseAt(ctx, node, r);
      continue;
    }
    out.push({ ...base, ...r, ...(rec.mm !== undefined ? { valueH: halfOf(rec.mm) } : {}) });
  }
  return out;
}

type Measured = Omit<KeepResult, "node" | "keep" | "form" | "grade" | "level" | "targets">;

function measureAlign(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  node: Extract<KeepNode, { form: "align" | "on-axis" }>,
  text: string,
): Measured | Refusal {
  const refs = node.form === "align" ? node.refs : [node.axis, node.wall];
  if (node.form === "on-axis") {
    if (node.axis.t !== "axis") {
      return {
        code: "E_KEEP_MEASURE",
        message: "`keep on axis` names a positioning axis first",
        hint: `write \`keep on axis <label> <wall>\` (\`${text}\`)`,
      };
    }
    if (node.wall.t !== "el") {
      return {
        code: "E_KEEP_MEASURE",
        message: "`keep on axis` holds a wall on the axis: name the wall",
        hint: `\`${keepRefText(node.wall)}\` in \`${text}\` is not a wall`,
      };
    }
  }
  const lines: Line[] = [];
  for (const ref of refs) {
    const l = readLine(ix, ctx, ref, text);
    if (isRefusal(l)) return l;
    lines.push(l);
  }
  const first = lines[0]!;
  if (lines.some((l) => l.vertical !== first.vertical)) {
    const odd = lines.find((l) => l.vertical !== first.vertical)!;
    return {
      code: "E_KEEP_MEASURE",
      message: `${capFirst(odd.phrase)} runs ${odd.vertical ? "vertically" : "horizontally"} and ${first.phrase} ${first.vertical ? "vertically" : "horizontally"}: one line cannot hold both`,
      hint: `\`${odd.text}\` and \`${first.text}\` in \`${text}\` have two orientations`,
    };
  }
  const residuals: KeepResidual[] = lines.slice(1).map((l) => ({ target: l.text, h: l.h - first.h }));
  const worst = largest(residuals)!;
  const holds = residuals.every((x) => x.h === 0);
  const out: Measured = {
    holds,
    h: worst.h,
    ...(holds ? {} : { at: { target: worst.target } }),
    ...(node.form === "align" && residuals.length > 1 ? { residuals } : {}),
    vertical: first.vertical,
  };
  if (!holds) {
    const wl = lines.find((l) => l.text === worst.target)!;
    const abs = mmText(Math.abs(worst.h));
    out.message =
      node.form === "on-axis"
        ? `This keep holds ${wl.phrase} on ${first.phrase}; ${wl.that} is ${abs} mm ${sideWord(first.vertical, worst.h)} the axis.${MESSAGE_TAIL}`
        : `This keep holds ${listWords(lines.map((l) => l.phrase))} on one line; ${wl.that} is ${abs} mm ${sideWord(first.vertical, worst.h)} ${first.phrase}.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names ${codeList(lines.map((l) => l.text))}; residual ${mmText(worst.h)} mm on ${axisWord(first.vertical)} (${signWord(first.vertical)}): \`${wl.text}\` at ${mmText(wl.h)}, \`${first.text}\` at ${mmText(first.h)}.`,
      NOTHING_MOVED(wl.text),
    ];
  }
  return out;
}

function measureFixed(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  node: Extract<KeepNode, { form: "fixed" }>,
  mm: number,
  text: string,
): Measured | Refusal {
  const l = readLine(ix, ctx, node.datum, text);
  if (isRefusal(l)) return l;
  const want = halfOf(mm);
  const h = l.h - want;
  const out: Measured = { holds: h === 0, h, vertical: l.vertical };
  if (h !== 0) {
    const a = axisWord(l.vertical);
    out.message = `This keep holds ${l.phrase} at ${a} ${mmText(want)}; it is at ${a} ${mmText(l.h)}, ${mmText(Math.abs(h))} mm ${sideWord(l.vertical, h)} that.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names \`${l.text}\`; residual ${mmText(h)} mm on ${a} (${signWord(l.vertical)}): \`${l.text}\` at ${mmText(l.h)}, the keep says ${mmText(want)}.`,
      NOTHING_MOVED(l.text),
    ];
  }
  return out;
}

function measureEqual(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  node: Extract<KeepNode, { form: "equal" }>,
  text: string,
): Measured | Refusal {
  const ext: { h: number; phrase: string; text: string }[] = [];
  for (const ref of node.refs) {
    const e = readExtent(ix, ctx, ref, node.measure, text);
    if (isRefusal(e)) return e;
    ext.push(e);
  }
  const first = ext[0]!;
  const residuals: KeepResidual[] = ext.slice(1).map((e) => ({ target: e.text, h: e.h - first.h }));
  const worst = largest(residuals)!;
  const holds = residuals.every((x) => x.h === 0);
  const out: Measured = {
    holds,
    h: worst.h,
    ...(holds ? {} : { at: { target: worst.target } }),
    ...(residuals.length > 1 ? { residuals } : {}),
  };
  if (!holds) {
    const we = ext.find((e) => e.text === worst.target)!;
    const more = node.measure === "width" ? (worst.h > 0 ? "wider" : "narrower") : worst.h > 0 ? "deeper" : "shallower";
    out.message = `This keep holds the ${node.measure}s of ${listWords(ext.map((e) => e.phrase))} equal; ${we.phrase} is ${mmText(Math.abs(worst.h))} mm ${more} than ${first.phrase}.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names ${codeList(ext.map((e) => e.text))}; residual ${mmText(worst.h)} mm (+ is ${node.measure === "width" ? "wider" : "deeper"}): \`${we.text}\` ${mmText(we.h)}, \`${first.text}\` ${mmText(first.h)}.`,
      NOTHING_MOVED(we.text),
    ];
  }
  return out;
}

function measureOffset(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  node: Extract<KeepNode, { form: "offset" }>,
  mm: number,
  text: string,
): Measured | Refusal {
  if (node.from.t === "el") {
    const el = ix.byId.get(node.from.id);
    if (el && el.kind !== "wall") {
      return {
        code: "E_KEEP_MEASURE",
        message: "An offset is measured from a datum (a room edge or centre line, an axis or a straight wall)",
        hint: `\`${keepRefText(node.from)}\` in \`${text}\` names a ${el.kind}`,
      };
    }
  }
  const d = readLine(ix, ctx, node.from, text);
  if (isRefusal(d)) return d;
  let xh: number;
  let xPhrase: string;
  let xText: string;
  const pt = node.x.t === "el" ? readPoint(ix, ctx, node.x, text) : undefined;
  if (isRefusal(pt)) return pt;
  if (pt) {
    // The point is doubled already (a centre), so it is put on the lattice as a centre.
    xh = lattice(d.vertical ? pt.x : pt.y);
    xPhrase = pt.phrase;
    xText = pt.text;
  } else {
    const l = readLine(ix, ctx, node.x, text);
    if (isRefusal(l)) return l;
    if (l.vertical !== d.vertical) {
      return {
        code: "E_KEEP_MEASURE",
        message: `${capFirst(l.phrase)} and ${d.phrase} are not parallel, so no offset runs between them`,
        hint: `\`${l.text}\` and \`${d.text}\` in \`${text}\` have two orientations`,
      };
    }
    xh = l.h;
    xPhrase = l.phrase;
    xText = l.text;
  }
  const want = halfOf(mm);
  const h = xh - d.h - want;
  const out: Measured = { holds: h === 0, h, vertical: d.vertical };
  if (h !== 0) {
    const stated =
      want === 0 ? `on ${d.phrase}` : `${mmText(Math.abs(want))} mm ${sideWord(d.vertical, want)} ${d.phrase}`;
    const dir = d.vertical ? (h > 0 ? "further right" : "further left") : h > 0 ? "lower" : "higher";
    out.message = `This keep holds ${xPhrase} ${stated}; it stands ${mmText(Math.abs(h))} mm ${dir} than that.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names \`${xText}\` and \`${d.text}\`; residual ${mmText(h)} mm on ${axisWord(d.vertical)} (${signWord(d.vertical)}): \`${xText}\` at ${mmText(xh)}, \`${d.text}\` at ${mmText(d.h)}, the keep says ${mmText(want)} apart.`,
      NOTHING_MOVED(xText),
    ];
  }
  return out;
}

// ---- `min clear` ---------------------------------------------------------------------------

/** A straight wall run for the clear-span scan, in half-lattice units: the collinear runs on one
 *  line (same centreline, same thickness) merged into one, then carried through the walls it is
 *  joined to. */
interface Body {
  vertical: boolean;
  /** Centreline coordinate across the run, and half the thickness (both half-lattice). */
  c: number;
  half: number;
  /** The run's extent along its line, carried through the walls it is joined to. */
  lo: number;
  hi: number;
  /** The run's own extent, before it is carried on: whether it meets a room is read on this. */
  lo0: number;
  hi0: number;
}

/** A curved segment's body, read by the box around the arc's extreme points (`arcExtremes`, the
 *  endpoints and every axis extreme inside the sweep) ± half its thickness. */
interface CurvedBody {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** An oblique straight segment's body: its centreline and half its thickness, tested exactly. */
interface ObliqueBody {
  a: { x: bigint; y: bigint };
  b: { x: bigint; y: bigint };
  half: bigint;
}

/** The storey's wall bodies for `min clear`, built once (R13). */
interface WallScan {
  straight: Body[];
  curved: CurvedBody[];
  oblique: ObliqueBody[];
}

/** ⌈log₂(n + 2)⌉, in integers. */
function bitsOf(n: number): number {
  let b = 1;
  while (2 ** b < n + 2) b++;
  return b;
}

/** Merge the runs that share a line (orientation, centreline and half-thickness) and touch or
 *  overlap into one run each, in a deterministic order (by line, then by start). */
function mergeCollinear(bodies: readonly Body[]): Body[] {
  const sorted = [...bodies].sort(
    (p, q) => Number(p.vertical) - Number(q.vertical) || p.c - q.c || p.half - q.half || p.lo - q.lo || p.hi - q.hi,
  );
  const out: Body[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && last.vertical === b.vertical && last.c === b.c && last.half === b.half && b.lo <= last.hi) {
      last.hi = Math.max(last.hi, b.hi);
      last.lo0 = Math.min(last.lo0, b.lo0);
      last.hi0 = Math.max(last.hi0, b.hi0);
    } else out.push({ ...b });
  }
  return out;
}

/**
 * The runs of one orientation, indexed for the two join queries (R13): grouped by LINE (one
 * centreline and half-thickness, whose merged runs are disjoint and sorted along it, so a position
 * is found by binary search), and the lines sorted by where their band starts across, with the
 * furthest band end of every subtree beside them, so the lines whose band meets a cross interval are
 * reached in `O((k + 1) log n)` for `k` lines reported. Every node visited is one step.
 */
class RunIndex {
  /** The lines, sorted by band start (`c − half`); each holds its runs sorted along. */
  private readonly lines: { c: number; half: number; runs: Body[] }[];
  /** `maxEnd[node]` over the implicit segment tree of `lines` (1-based, size 2^k). */
  private readonly maxEnd: number[];
  private readonly size: number;

  constructor(runs: readonly Body[]) {
    const byLine = new Map<string, { c: number; half: number; runs: Body[] }>();
    for (const r of runs) {
      const k = `${r.c}|${r.half}`;
      let l = byLine.get(k);
      if (!l) {
        l = { c: r.c, half: r.half, runs: [] };
        byLine.set(k, l);
      }
      l.runs.push(r);
    }
    this.lines = [...byLine.values()].sort((p, q) => p.c - p.half - (q.c - q.half) || p.c - q.c || p.half - q.half);
    for (const l of this.lines) l.runs.sort((p, q) => p.lo0 - q.lo0);
    let size = 1;
    while (size < this.lines.length) size *= 2;
    this.size = size;
    this.maxEnd = new Array<number>(2 * size).fill(Number.NEGATIVE_INFINITY);
    this.lines.forEach((l, i) => {
      this.maxEnd[size + i] = l.c + l.half;
    });
    for (let i = size - 1; i >= 1; i--) this.maxEnd[i] = Math.max(this.maxEnd[2 * i]!, this.maxEnd[2 * i + 1]!);
  }

  /** Every line whose band `[c − half, c + half]` meets `[lo, hi]` (closed), charged per node. */
  linesMeeting(lo: number, hi: number, visit: (l: { c: number; half: number; runs: Body[] }) => void): void {
    // The lines whose band starts at or before `hi`: a prefix of the sort.
    let n = 0;
    let top = this.lines.length;
    while (n < top) {
      const mid = (n + top) >> 1;
      if (this.lines[mid]!.c - this.lines[mid]!.half <= hi) n = mid + 1;
      else top = mid;
    }
    chargeSteps(bitsOf(this.lines.length));
    const walk = (node: number, from: number, to: number): void => {
      if (from >= n) return;
      chargeSteps(1);
      if (this.maxEnd[node]! < lo) return;
      if (to - from === 1) {
        visit(this.lines[from]!);
        return;
      }
      const mid = (from + to) >> 1;
      walk(2 * node, from, mid);
      walk(2 * node + 1, mid, to);
    };
    if (this.lines.length > 0) walk(1, 0, this.size);
  }

  /** The runs of a line whose own extent meets `[lo, hi]` (closed), found by binary search. */
  static runsMeeting(runs: readonly Body[], lo: number, hi: number, visit: (r: Body) => void): void {
    // Runs on one line are disjoint and sorted, so the first that can reach `lo` is found by search.
    let a = 0;
    let b = runs.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (runs[mid]!.hi0 < lo) a = mid + 1;
      else b = mid;
    }
    chargeSteps(bitsOf(runs.length));
    for (let i = a; i < runs.length && runs[i]!.lo0 <= hi; i++) {
      chargeSteps(1);
      visit(runs[i]!);
    }
  }
}

/**
 * Build the storey's scan once (R13), charged before it allocates: one step per wall, two per
 * segment and `segments × ⌈log₂ segments⌉` for the sorts, then `O(log n)` per join query and one
 * step per join found. The straight runs on one line are merged; then each run is carried through
 * the walls it is joined to, read on the joined outline without building the joinery (design §2.1,
 * R18):
 *
 * - **along** a parallel straight wall whose band (± t/2) meets its own band and whose extent meets
 *   its own (two thicknesses end to end, a lining against a wall): the two are one body, and
 *   every run joined this way, however many hops, takes the extent of all of them (a union-find
 *   over these joins, so the carry is closed, never one hop);
 * - **across** a perpendicular straight wall when its end lies inside that wall's body (± t/2: a
 *   ring's corner, a T-junction, a partition stopped at the shell's inner face or short of its
 *   centreline): the end reaches the far face of the body that wall belongs to (so a lining on
 *   the shell counts with the shell).
 *
 * Only straight horizontal and vertical walls carry a run: a run ending in an oblique or a curved
 * wall is not carried, and is counted as skipped when it meets a room. Heights are never read.
 */
function wallScan(ir: ResolvedPlan): WallScan {
  let n = 0;
  for (const w of ir.walls) n += Math.max(0, w.points.length - 1) + (w.closed && w.points.length > 2 ? 1 : 0);
  chargeSteps(ir.walls.length + 2 * n + n * bitsOf(n) + 1);
  const raw: Body[] = [];
  const curved: CurvedBody[] = [];
  const oblique: ObliqueBody[] = [];
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      const half = lattice(s.thickness);
      if (s.arc) {
        const ex = arcExtremes(s.arc);
        const xs = ex.map((p) => halfOf(p.x));
        const ys = ex.map((p) => halfOf(p.y));
        curved.push({
          x0: Math.min(...xs) - half,
          x1: Math.max(...xs) + half,
          y0: Math.min(...ys) - half,
          y1: Math.max(...ys) + half,
        });
        continue;
      }
      const a = { x: halfOf(s.a.x), y: halfOf(s.a.y) };
      const b = { x: halfOf(s.b.x), y: halfOf(s.b.y) };
      const vertical = a.x === b.x && a.y !== b.y;
      const horizontal = a.y === b.y && a.x !== b.x;
      if (vertical || horizontal) {
        const [p, q] = vertical ? [a.y, b.y] : [a.x, b.x];
        const [lo, hi] = [Math.min(p, q), Math.max(p, q)];
        raw.push({ vertical, c: vertical ? a.x : a.y, half, lo, hi, lo0: lo, hi0: hi });
      } else if (a.x !== b.x || a.y !== b.y) {
        oblique.push({
          a: { x: BigInt(a.x), y: BigInt(a.y) },
          b: { x: BigInt(b.x), y: BigInt(b.y) },
          half: BigInt(half),
        });
      }
    }
  }
  const runs = mergeCollinear(raw);
  const index = [new RunIndex(runs.filter((r) => !r.vertical)), new RunIndex(runs.filter((r) => r.vertical))];
  const indexOfRun = new Map(runs.map((r, i) => [r, i] as const));
  // Along: parallel runs whose bands and extents meet are one body (union-find, closed).
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (const r of runs) {
    const self = indexOfRun.get(r)!;
    index[r.vertical ? 1 : 0]!.linesMeeting(r.c - r.half, r.c + r.half, (line) =>
      RunIndex.runsMeeting(line.runs, r.lo0, r.hi0, (h) => {
        if (h === r) return;
        const a = find(self);
        const b = find(indexOfRun.get(h)!);
        if (a !== b) parent[a < b ? b : a] = a < b ? a : b;
      }),
    );
  }
  // Each body's band across its line: the union of its runs' bands.
  const band = new Map<number, { lo: number; hi: number }>();
  runs.forEach((r, i) => {
    const root = find(i);
    const e = band.get(root);
    if (e) {
      e.lo = Math.min(e.lo, r.c - r.half);
      e.hi = Math.max(e.hi, r.c + r.half);
    } else band.set(root, { lo: r.c - r.half, hi: r.c + r.half });
  });
  // Across: each end inside a perpendicular wall's body reaches the far face of the body that
  // wall belongs to.
  for (const r of runs) {
    const across = index[r.vertical ? 0 : 1]!;
    for (const [end, isLo] of [
      [r.lo0, true],
      [r.hi0, false],
    ] as const) {
      across.linesMeeting(end, end, (line) =>
        RunIndex.runsMeeting(line.runs, r.c, r.c, (h) => {
          const e = band.get(find(indexOfRun.get(h)!))!;
          if (isLo) r.lo = Math.min(r.lo, e.lo);
          else r.hi = Math.max(r.hi, e.hi);
        }),
      );
    }
  }
  // Every run of a body takes the extent of all of them.
  const extent = new Map<number, { lo: number; hi: number }>();
  runs.forEach((r, i) => {
    const root = find(i);
    const e = extent.get(root);
    if (e) {
      e.lo = Math.min(e.lo, r.lo);
      e.hi = Math.max(e.hi, r.hi);
    } else extent.set(root, { lo: r.lo, hi: r.hi });
  });
  runs.forEach((r, i) => {
    const e = extent.get(find(i))!;
    r.lo = e.lo;
    r.hi = e.hi;
  });
  return { straight: runs, curved, oblique };
}

/** Whether an oblique body meets the room's open rectangle — decided exactly, on the integer
 *  lattice, by separating axes (x, y, the run and its normal), squares compared so no root is
 *  taken. */
function obliqueMeets(o: ObliqueBody, X0: number, X1: number, Y0: number, Y1: number): boolean {
  const [x0, x1, y0, y1] = [BigInt(X0), BigInt(X1), BigInt(Y0), BigInt(Y1)];
  const dx = o.b.x - o.a.x;
  const dy = o.b.y - o.a.y;
  const L2 = dx * dx + dy * dy;
  const h2 = o.half * o.half;
  const abs = (v: bigint): bigint => (v < 0n ? -v : v);
  /** `u < h·k/L` for a non-negative `k`: `u ≤ 0` or `u²·L2 < h²·k²`. */
  const below = (u: bigint, k: bigint): boolean => u <= 0n || u * u * L2 < h2 * k * k;
  // x: the body's extent is [min − h|dy|/L, max + h|dy|/L].
  const minX = o.a.x < o.b.x ? o.a.x : o.b.x;
  const maxX = o.a.x < o.b.x ? o.b.x : o.a.x;
  if (!below(x0 - maxX, abs(dy)) || !below(minX - x1, abs(dy))) return false;
  const minY = o.a.y < o.b.y ? o.a.y : o.b.y;
  const maxY = o.a.y < o.b.y ? o.b.y : o.a.y;
  if (!below(y0 - maxY, abs(dx)) || !below(minY - y1, abs(dx))) return false;
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const;
  // The normal: |n·(p − a)| < h·L inside the body (|n| = L).
  const ns = corners.map(([x, y]) => -dy * (x - o.a.x) + dx * (y - o.a.y));
  const nMin = ns.reduce((p, q) => (q < p ? q : p));
  const nMax = ns.reduce((p, q) => (q > p ? q : p));
  const within = (u: bigint): boolean => u * u < h2 * L2;
  if (!(nMin < 0n || within(nMin)) || !(nMax > 0n || within(nMax))) return false;
  // The run: 0 < d·(p − a) < L2 inside the body.
  const ts = corners.map(([x, y]) => dx * (x - o.a.x) + dy * (y - o.a.y));
  const tMin = ts.reduce((p, q) => (q < p ? q : p));
  const tMax = ts.reduce((p, q) => (q > p ? q : p));
  return tMin < L2 && tMax > 0n;
}

/** Whether an oblique body holds the point `p` (half-lattice), closed, decided exactly. */
function obliqueHolds(o: ObliqueBody, p: { x: number; y: number }): boolean {
  const px = BigInt(p.x) - o.a.x;
  const py = BigInt(p.y) - o.a.y;
  const dx = o.b.x - o.a.x;
  const dy = o.b.y - o.a.y;
  const L2 = dx * dx + dy * dy;
  const n = -dy * px + dx * py;
  const t = dx * px + dy * py;
  return n * n <= o.half * o.half * L2 && t >= 0n && t <= L2;
}

/** The widest interval of `[lo, hi]` left free by the `cuts` (each clipped to it). */
function widestFree(lo: number, hi: number, cuts: readonly [number, number][]): number {
  const cs = cuts
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let best = 0;
  let at = lo;
  for (const [a, b] of cs) {
    if (a > at) best = Math.max(best, a - at);
    at = Math.max(at, b);
  }
  return Math.max(best, hi - at);
}

function measureMinClear(
  ix: StoreyIndex,
  ctx: KeepStoreyCtx,
  node: Extract<KeepNode, { form: "min-clear" }>,
  mm: number,
  text: string,
  scan: () => WallScan,
): Measured | Refusal {
  const ref = node.room;
  if (ref.t !== "el" || ref.segment !== undefined) {
    return {
      code: "E_KEEP_MEASURE",
      message: "A clear span is measured in a room: this keep names an edge or a segment instead",
      hint: `\`${keepRefText(ref)}\` in \`${text}\`; name the room itself`,
    };
  }
  const el = lookup(ix, ctx, ref.id, text);
  if (isRefusal(el)) return el;
  if (el.kind !== "room") {
    return {
      code: "E_KEEP_MEASURE",
      message: `A ${el.kind} has no clear span: a clear span is measured in a room`,
      hint: `\`${ref.id}\` in \`${text}\``,
    };
  }
  const r = el as RRoom;
  if (r.circle || r.poly) {
    return {
      code: "E_KEEP_MEASURE",
      message: `A ${r.circle ? "circle" : "polygon"} room has no clear span this keep can measure`,
      hint: `\`${ref.id}\` in \`${text}\`; only a rectangular room's span is measured`,
    };
  }
  const sc = scan();
  chargeSteps(1 + sc.straight.length + sc.curved.length + sc.oblique.length);
  const X0 = halfOf(r.at.x);
  const X1 = halfOf(r.at.x + r.size.w);
  const Y0 = halfOf(r.at.y);
  const Y1 = halfOf(r.at.y + r.size.h);
  const xCuts: [number, number][] = [];
  const yCuts: [number, number][] = [];
  const why: Required<KeepSkipped> = { not_spanning: 0, ends_in_curved_or_oblique: 0, curved: 0, oblique: 0 };
  const meets = (x0: number, x1: number, y0: number, y1: number): boolean => x0 < X1 && x1 > X0 && y0 < Y1 && y1 > Y0;
  /** A straight run's end that lies in a curved or oblique wall, which carries no run. */
  const endsInUnread = (b: Body): boolean => {
    chargeSteps(2 * (sc.curved.length + sc.oblique.length));
    for (const e of [b.lo0, b.hi0]) {
      const p = b.vertical ? { x: b.c, y: e } : { x: e, y: b.c };
      if (sc.curved.some((o) => p.x >= o.x0 && p.x <= o.x1 && p.y >= o.y0 && p.y <= o.y1)) return true;
      if (sc.oblique.some((o) => obliqueHolds(o, p))) return true;
    }
    return false;
  };
  for (const b of sc.straight) {
    // Meeting the room is read on the run's own body; spanning it, on the joined outline.
    const [x0, x1, y0, y1] = b.vertical
      ? [b.c - b.half, b.c + b.half, b.lo0, b.hi0]
      : [b.lo0, b.hi0, b.c - b.half, b.c + b.half];
    if (!meets(x0, x1, y0, y1)) continue;
    const spans = b.vertical ? b.lo <= Y0 && b.hi >= Y1 : b.lo <= X0 && b.hi >= X1;
    if (!spans) {
      if (endsInUnread(b)) why.ends_in_curved_or_oblique++;
      else why.not_spanning++;
      continue;
    }
    if (b.vertical) xCuts.push([x0, x1]);
    else yCuts.push([y0, y1]);
  }
  for (const o of sc.curved) if (meets(o.x0, o.x1, o.y0, o.y1)) why.curved++;
  for (const o of sc.oblique) if (obliqueMeets(o, X0, X1, Y0, Y1)) why.oblique++;
  const skipped = why.not_spanning + why.ends_in_curved_or_oblique + why.curved + why.oblique;
  const reasons: KeepSkipped = {};
  for (const k of ["not_spanning", "ends_in_curved_or_oblique", "curved", "oblique"] as const)
    if (why[k] > 0) reasons[k] = why[k];
  const across = widestFree(X0, X1, xCuts);
  const down = widestFree(Y0, Y1, yCuts);
  const clear = Math.min(across, down);
  const want = halfOf(mm);
  const h = clear - want;
  const out: Measured = {
    holds: h >= 0,
    h,
    measuredH: clear,
    skippedWalls: skipped,
    ...(skipped > 0 ? { skipped: reasons } : {}),
  };
  if (h < 0) {
    const said: string[] = [];
    if (why.not_spanning) said.push(`${fmt3(why.not_spanning)} not spanning it`);
    if (why.ends_in_curved_or_oblique)
      said.push(`${fmt3(why.ends_in_curved_or_oblique)} ending in a curved or oblique wall, which carries no run`);
    if (why.curved) said.push(`${fmt3(why.curved)} curved`);
    if (why.oblique) said.push(`${fmt3(why.oblique)} oblique`);
    out.message = `This keep holds a clear span of at least ${mmText(want)} mm in ${roomPhrase(ix, r)}; its clear span is ${mmText(clear)} mm, ${mmText(-h)} mm short.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names \`${ref.id}\`; residual ${mmText(h)} mm (+ is margin): clear ${mmText(across)} mm across x and ${mmText(down)} mm down y between the wall faces${skipped > 0 ? `; wall segments meeting the room and not read: ${listWords(said)}` : ""}.`,
      `Nothing was moved: the walls and \`${ref.id}\` stand where their own statements put them.`,
    ];
  }
  return out;
}

// ---- `stacked` ----------------------------------------------------------------------------

/** One storey as `stacked` reads it. */
export interface StackedStorey {
  level: number;
  ir: ResolvedPlan;
  authored(id: string): boolean;
}

const STACKED_KINDS = new Set(["room", "stair", "elevator", "escalator", "void"]);
const KIND_NOUN: Record<string, string> = {
  stair: "stair",
  elevator: "lift shaft",
  escalator: "escalator",
  void: "void",
};

/**
 * Measure the plan's `stacked` keeps after the last storey (R12): each target's resolved `at` +
 * `size` rectangle on every listed storey, its four edges against the first listed storey's.
 * Charged `1 + 4 × levels` per keep, immediately before its measure; each storey's index is built
 * once, on first use, and charged once.
 */
export function evaluateStacked(
  records: readonly KeepRecord[],
  storeys: readonly StackedStorey[],
  diag: (d: Diagnostic) => void,
): KeepResult[] {
  const out: KeepResult[] = [];
  const indexes = new Map<number, Map<string, ResolvedElement>>();
  const indexFor = (s: StackedStorey): Map<string, ResolvedElement> => {
    let m = indexes.get(s.level);
    if (!m) {
      chargeSteps(s.ir.elements.length + 1);
      m = new Map();
      for (const e of s.ir.elements) if (!m.has(e.id)) m.set(e.id, e);
      indexes.set(s.level, m);
    }
    return m;
  };
  /** How a message names the element on its storey: a room as `src/naming.ts` names it, a
   *  stair, lift, escalator or void by its kind and where it stands. Built on first use. */
  const namings = new Map<number, { naming: Naming; byId: Map<string, NameableRoom> }>();
  const nameOn = (s: StackedStorey, el: ResolvedElement): string => {
    let cached = namings.get(s.level);
    if (!cached) {
      // Once per storey, charged before it is built: one step per element read and per room named.
      chargeSteps(s.ir.elements.length + 1);
      const rooms = s.ir.elements.filter((e): e is RRoom => e.kind === "room");
      chargeSteps(rooms.length);
      const byId = new Map(
        rooms.map(
          (r) =>
            [
              r.id,
              nameableOf(r, r.uses && r.uses.length > 0 ? r.uses : classifyLabelUses(r.label ?? r.id).uses),
            ] as const,
        ),
      );
      cached = { naming: makeNaming([...byId.values()]), byId };
      namings.set(s.level, cached);
    }
    const { naming, byId } = cached;
    if (el.kind === "room") {
      const r = el as RRoom;
      if (r.label !== undefined) return `"${r.label}"`;
      const n = byId.get(r.id);
      return n ? naming.phrase(n) : "the room";
    }
    const f = el as unknown as { at: Point; size: { w: number; h: number } };
    const c = { x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 };
    return `the ${KIND_NOUN[el.kind] ?? el.kind} ${naming.placeAt(c)}`;
  };
  for (const rec of records) {
    const node = rec.node;
    if (node.form !== "stacked") continue;
    stepSite(node.span);
    const levels = rec.levels!;
    chargeSteps(1 + 4 * levels.length);
    const text = keepFormText(node);
    const target = node.target;
    const refuse = ({ code }: { code: string }, message: string, hint: string): void =>
      diag({ severity: "error", code, message, ...(node.span ? { span: node.span } : {}), hints: [hint] });
    if (target.t !== "el" || target.segment !== undefined) {
      refuse(
        { code: "E_KEEP_MEASURE" },
        "A stacked keep compares one element's footprint: name the element",
        `\`${keepRefText(target)}\` in \`${text}\``,
      );
      continue;
    }
    const rects: { level: number; el: ResolvedElement; e: Record<KeepAt["edge"] & string, number> }[] = [];
    let failed = false;
    for (const lv of levels) {
      const s = storeys.find((x) => x.level === lv);
      if (!s) {
        refuse(
          { code: "E_KEEP_TARGET" },
          `This keep names level ${fmt3(lv)}, which the plan does not have`,
          `\`${text}\` lists level ${fmt3(lv)}; the plan's levels are ${storeys.map((x) => fmt3(x.level)).join(", ")}`,
        );
        failed = true;
        break;
      }
      const el = indexFor(s).get(target.id);
      if (!el) {
        refuse(
          { code: "E_KEEP_TARGET" },
          s.authored(target.id)
            ? `This keep names an element level ${fmt3(lv)} could not place`
            : `This keep names something level ${fmt3(lv)} does not have`,
          s.authored(target.id)
            ? `\`${target.id}\` in \`${text}\` was written on level ${fmt3(lv)} and dropped there (its own error says why)`
            : `\`${target.id}\` in \`${text}\` names no element on level ${fmt3(lv)}`,
        );
        failed = true;
        break;
      }
      if (!s.authored(target.id)) {
        refuse(
          { code: "E_KEEP_TARGET" },
          "This keep names an element by an auto id, which renumbers when an earlier element is named",
          `\`${target.id}\` in \`${text}\` is an assigned id on level ${fmt3(lv)}; give the element its own \`id=\` and name that`,
        );
        failed = true;
        break;
      }
      if (!STACKED_KINDS.has(el.kind) || (el.kind === "room" && ((el as RRoom).circle || (el as RRoom).poly))) {
        refuse(
          { code: "E_KEEP_MEASURE" },
          el.kind === "room"
            ? `A ${(el as RRoom).circle ? "circle" : "polygon"} room has no rectangular footprint to stack`
            : `A ${el.kind} has no rectangular footprint to stack: name a rectangular room, a stair, a lift, an escalator or a void`,
          `\`${target.id}\` in \`${text}\` on level ${fmt3(lv)}`,
        );
        failed = true;
        break;
      }
      if (el.kind === "room" && (el as RRoom)._unplaced) {
        refuse(
          { code: "E_KEEP_TARGET" },
          "This keep names a room that could not be placed",
          `\`${target.id}\` in \`${text}\` on level ${fmt3(lv)}`,
        );
        failed = true;
        break;
      }
      const f = el as unknown as { at: Point; size: { w: number; h: number } };
      rects.push({
        level: lv,
        el,
        e: {
          left: halfOf(f.at.x),
          top: halfOf(f.at.y),
          right: halfOf(f.at.x + f.size.w),
          bottom: halfOf(f.at.y + f.size.h),
        },
      });
    }
    if (failed) continue;
    const first = rects[0]!;
    const residuals: KeepResidual[] = [];
    for (const r of rects.slice(1))
      for (const edge of EDGE_ORDER)
        residuals.push({ target: target.id, level: r.level, edge, h: r.e[edge] - first.e[edge] });
    const worst = largest(residuals)!;
    const holds = residuals.every((x) => x.h === 0);
    const res: KeepResult = {
      node,
      keep: text,
      form: FORM_WORDS.stacked,
      grade: node.grade ?? "hard",
      targets: [keepRefText(target)],
      holds,
      h: worst.h,
      ...(holds ? {} : { at: { target: target.id, level: worst.level!, edge: worst.edge! } }),
      residuals,
      levels: [...levels],
    };
    if (!holds) {
      const vertical = worst.edge === "left" || worst.edge === "right";
      const phrase = nameOn(storeys.find((x) => x.level === first.level)!, first.el);
      const lvText = (l: number): string => fmt3(l);
      res.message = `This keep holds ${phrase} on levels ${listWords(levels.map(lvText))} with one footprint; on level ${lvText(worst.level!)} its ${worst.edge} edge is ${mmText(Math.abs(worst.h))} mm ${sideWord(vertical, worst.h)} where it is on level ${lvText(first.level)}.${MESSAGE_TAIL}`;
      res.hints = [
        `The keep names \`${target.id}\` on levels ${levels.map(lvText).join(", ")}; residual ${mmText(worst.h)} mm on ${axisWord(vertical)} (${signWord(vertical)}): its ${worst.edge} edge at ${mmText(rects.find((r) => r.level === worst.level)!.e[worst.edge!])} on level ${lvText(worst.level!)}, ${mmText(first.e[worst.edge!])} on level ${lvText(first.level)}.`,
        `Nothing was moved: each storey's \`${target.id}\` stands where its own statement puts it.`,
      ];
    }
    out.push(res);
  }
  return out;
}

// ---- reporting -----------------------------------------------------------------------------

/** One `describe().keeps[]` row (PS4.3 design §3.3). */
export interface KeepSummary {
  keep: string;
  form: string;
  grade: KeepGrade;
  level?: number;
  targets: string[];
  holds: boolean;
  residual_mm: number;
  at?: KeepAt;
  measured_mm?: number;
  residuals?: { target: string; level?: number; edge?: KeepAt["edge"]; residual_mm: number }[];
  skipped_walls?: number;
  skipped?: KeepSkipped;
}

/** A result as `describe()` lists it. */
export function keepSummary(r: KeepResult): KeepSummary {
  return {
    keep: r.keep,
    form: r.form,
    grade: r.grade,
    ...(r.level !== undefined ? { level: r.level } : {}),
    targets: r.targets,
    holds: r.holds,
    residual_mm: mmNumber(r.h),
    ...(r.at ? { at: r.at } : {}),
    ...(r.measuredH !== undefined ? { measured_mm: mmNumber(r.measuredH) } : {}),
    ...(r.residuals
      ? {
          residuals: r.residuals.map((x) => ({
            target: x.target,
            ...(x.level !== undefined ? { level: x.level } : {}),
            ...(x.edge !== undefined ? { edge: x.edge } : {}),
            residual_mm: mmNumber(x.h),
          })),
        }
      : {}),
    ...(r.skippedWalls !== undefined ? { skipped_walls: r.skippedWalls } : {}),
    ...(r.skipped ? { skipped: r.skipped } : {}),
  };
}

/** One `validate --json` `keeps` row (PS4.3 design §3.3). */
export interface KeepValidateRow {
  keep: string;
  grade: KeepGrade;
  level?: number;
  holds: boolean;
  residual_mm: number;
  at?: KeepAt;
  measured_mm?: number;
  span?: [number, number];
}

/** A result as `validate --json` lists it. */
export function keepValidateRow(r: KeepResult): KeepValidateRow {
  const span: Span | undefined = r.node.span;
  return {
    keep: r.keep,
    grade: r.grade,
    ...(r.level !== undefined ? { level: r.level } : {}),
    holds: r.holds,
    residual_mm: mmNumber(r.h),
    ...(r.at ? { at: r.at } : {}),
    ...(r.measuredH !== undefined ? { measured_mm: mmNumber(r.measuredH) } : {}),
    ...(span ? { span: [span.start, span.end] as [number, number] } : {}),
  };
}
