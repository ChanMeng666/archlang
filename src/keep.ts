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
import { actOnSide, applyVec } from "./algebra/d4.js";
import { chargeSteps, closest, stepSite } from "./expr.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
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
import { fmtHalfLattice, MODEL_RANGE_MM } from "./num-format.js";
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
 * Expand one keep statement: refuse it where it may not stand, charge it, count it against the
 * caps, evaluate its values and check them; on success append its record to `sink`. Every refusal
 * is a compile error (R8) through `diag`.
 */
export function expandKeep(
  node: KeepNode,
  place: KeepPlace,
  evalNum: (e: import("./expr.js").Expr) => number,
  diag: (d: Diagnostic) => void,
  sink: KeepSink,
): void {
  const span = node.span;
  const refuse = ({ code }: { code: string }, message: string, hint?: string): void =>
    diag({ severity: "error", code, message, ...(span ? { span } : {}), ...(hint ? { hints: [hint] } : {}) });
  const text = `keep ${keepFormText(node)}`;
  if (place === "component") {
    refuse(
      { code: "E_KEEP_PLACEMENT" },
      "A keep inside a component would be checked once per instance in its own frame; write it in the plan",
      `\`${text}\` sits in a component body (a \`place\`d or called component, or an imported file); move it to the plan or storey that places the component`,
    );
    return;
  }
  if (node.form === "stacked" && place !== "root") {
    refuse(
      { code: "E_KEEP_PLACEMENT" },
      place === "storey"
        ? "A stacked keep compares storeys, so it sits outside every level"
        : "A stacked keep compares storeys, and this plan has one",
      place === "storey"
        ? `move \`${text}\` out of the \`level\` block, to the plan's root`
        : `\`${text}\` needs a plan of two or more \`level\` blocks`,
    );
    return;
  }
  // Charged before the record exists, and whether or not the cap then drops it (R13).
  chargeSteps(targetCount(node));
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
          ? `A plan may declare at most ${MAX_KEEPS} keeps`
          : `A keep may name at most ${MAX_KEEP_TARGETS} targets or levels`,
        `this keep and every later one past the cap are not checked; split the keep, or keep fewer`,
      );
    }
    return;
  }
  const refs = refsOf(node);
  const seen = new Map<string, KeepRef>();
  for (const r of refs) {
    const k = refKey(r);
    if (seen.has(k)) {
      refuse(
        { code: "E_KEEP_SELF" },
        `This keep compares ${refKind(r)} with itself`,
        `\`${keepRefText(r)}\` is named twice in \`${text}\`; name each target once`,
      );
      return;
    }
    seen.set(k, r);
  }
  const rec: KeepRecord = { node };
  if (node.form === "offset" || node.form === "min-clear" || node.form === "fixed") {
    const mm = evalNum(node.mm);
    if (!(Math.abs(mm) <= MODEL_RANGE_MM)) {
      refuse(
        { code: "E_KEEP_VALUE" },
        `A keep's length must be in mm within ±${MODEL_RANGE_MM.toLocaleString("en-US")}`,
        `\`${text}\` evaluates its length to ${mm}`,
      );
      return;
    }
    if (node.form === "min-clear" && !(mm > 0)) {
      refuse(
        { code: "E_KEEP_VALUE" },
        "A minimum clear span must be a positive length in mm",
        `\`${text}\` asks for ${mm} mm`,
      );
      return;
    }
    rec.mm = mm;
  }
  if (node.form === "stacked") {
    const levels: number[] = [];
    for (const e of node.levels) {
      const v = evalNum(e);
      if (!Number.isInteger(v)) {
        refuse(
          { code: "E_KEEP_VALUE" },
          "A level in a stacked keep must be a whole storey number",
          `\`${text}\` names level ${v}`,
        );
        return;
      }
      if (levels.includes(v)) {
        refuse(
          { code: "E_KEEP_SELF" },
          `This keep compares level ${v} with itself`,
          `\`${text}\` lists level ${v} twice`,
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
  /** When broken: the id-free message and its hints (the `W_KEEP_VIOLATED` text for any grade). */
  message?: string;
  hints?: string[];
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
        hint: `\`${ref.id}\` in \`${text}\` has segments 0 to ${segs.length - 1}`,
      };
    }
  } else if (segs.length !== 1) {
    return {
      code: "E_KEEP_MEASURE",
      message: `A wall of ${segs.length} segments has no one line to measure: name one of its segments`,
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
    phrase: ref.segment !== undefined ? `segment ${ref.segment} of ${phrase}` : phrase,
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
        scan ??= wallScan(ctx.ir);
        r = measureMinClear(ix, ctx, node, rec.mm!, text, scan);
        break;
      case "stacked":
        // Never reaches a storey: refused at expansion everywhere but the root.
        continue;
    }
    if (isRefusal(r)) {
      refuseAt(ctx, node, r);
      continue;
    }
    out.push({ ...base, ...r });
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
  const out: Measured = { holds: h === 0, h };
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
  const out: Measured = { holds: h === 0, h };
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

/** A straight wall segment's body for the clear-span scan, in half-lattice units. */
interface Body {
  vertical: boolean;
  /** Centreline coordinate across the run, and half the thickness (both half-lattice). */
  c: number;
  half: number;
  /** The run's extent along it, extended by `half` at an end that is joined to a wall. */
  lo: number;
  hi: number;
}

/** The storey's straight wall segments, and the curved or oblique ones, built once (R13). */
interface WallScan {
  straight: Body[];
  other: { x0: number; y0: number; x1: number; y1: number }[];
}

/**
 * Build the storey's scan once, charged once: one step per wall and per segment, then one per
 * segment end tested for a join against every segment. An end is joined when another segment of
 * any wall runs through it or ends at it (a ring's corner, a T-junction): the joined outline then
 * carries the body on by half its thickness, which is how a partition T-joined at each end spans the
 * room between the walls it meets (design §2.1, R18). Heights are never read.
 */
function wallScan(ir: ResolvedPlan): WallScan {
  const segs = ir.walls.flatMap((w) => segmentsOfWall(w));
  chargeSteps(ir.walls.length + segs.length + 2 * segs.length * segs.length + 1);
  const P = (p: Point): { x: number; y: number } => ({ x: halfOf(p.x), y: halfOf(p.y) });
  const pts = segs.map((s) => ({ a: P(s.a), b: P(s.b), s }));
  const onSeg = (p: { x: number; y: number }, q: (typeof pts)[number]): boolean => {
    if (q.s.arc) return (p.x === q.a.x && p.y === q.a.y) || (p.x === q.b.x && p.y === q.b.y);
    const cross = (q.b.x - q.a.x) * (p.y - q.a.y) - (q.b.y - q.a.y) * (p.x - q.a.x);
    if (cross !== 0) return false;
    return (
      p.x >= Math.min(q.a.x, q.b.x) &&
      p.x <= Math.max(q.a.x, q.b.x) &&
      p.y >= Math.min(q.a.y, q.b.y) &&
      p.y <= Math.max(q.a.y, q.b.y)
    );
  };
  const joined = (p: { x: number; y: number }, self: number): boolean => pts.some((q, j) => j !== self && onSeg(p, q));
  const straight: Body[] = [];
  const other: WallScan["other"] = [];
  pts.forEach((q, i) => {
    const half = lattice(q.s.thickness);
    const vertical = q.a.x === q.b.x && q.a.y !== q.b.y;
    const horizontal = q.a.y === q.b.y && q.a.x !== q.b.x;
    if (q.s.arc || (!vertical && !horizontal)) {
      other.push({
        x0: Math.min(q.a.x, q.b.x) - half,
        x1: Math.max(q.a.x, q.b.x) + half,
        y0: Math.min(q.a.y, q.b.y) - half,
        y1: Math.max(q.a.y, q.b.y) + half,
      });
      return;
    }
    const along = (p: { x: number; y: number }): number => (vertical ? p.y : p.x);
    const [lo, loEnd, hi, hiEnd] =
      along(q.a) <= along(q.b) ? [along(q.a), q.a, along(q.b), q.b] : [along(q.b), q.b, along(q.a), q.a];
    straight.push({
      vertical,
      c: vertical ? q.a.x : q.a.y,
      half,
      lo: joined(loEnd, i) ? lo - half : lo,
      hi: joined(hiEnd, i) ? hi + half : hi,
    });
  });
  return { straight, other };
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
  scan: WallScan,
): Measured | Refusal {
  chargeSteps(1 + scan.straight.length + scan.other.length);
  const ref = node.room;
  if (ref.t !== "el" || ref.segment !== undefined) {
    return {
      code: "E_KEEP_MEASURE",
      message: "`keep min clear` measures a room: name the room itself",
      hint: `\`${keepRefText(ref)}\` in \`${text}\``,
    };
  }
  const el = lookup(ix, ctx, ref.id, text);
  if (isRefusal(el)) return el;
  if (el.kind !== "room") {
    return {
      code: "E_KEEP_MEASURE",
      message: `A ${el.kind} has no clear span: \`keep min clear\` measures a room`,
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
  const X0 = halfOf(r.at.x);
  const X1 = halfOf(r.at.x + r.size.w);
  const Y0 = halfOf(r.at.y);
  const Y1 = halfOf(r.at.y + r.size.h);
  const xCuts: [number, number][] = [];
  const yCuts: [number, number][] = [];
  let skipped = 0;
  const meets = (x0: number, x1: number, y0: number, y1: number): boolean => x0 < X1 && x1 > X0 && y0 < Y1 && y1 > Y0;
  for (const b of scan.straight) {
    const [x0, x1, y0, y1] = b.vertical
      ? [b.c - b.half, b.c + b.half, b.lo, b.hi]
      : [b.lo, b.hi, b.c - b.half, b.c + b.half];
    if (!meets(x0, x1, y0, y1)) continue;
    const spans = b.vertical ? b.lo <= Y0 && b.hi >= Y1 : b.lo <= X0 && b.hi >= X1;
    if (!spans) {
      skipped++;
      continue;
    }
    if (b.vertical) xCuts.push([x0, x1]);
    else yCuts.push([y0, y1]);
  }
  for (const o of scan.other) if (meets(o.x0, o.x1, o.y0, o.y1)) skipped++;
  const across = widestFree(X0, X1, xCuts);
  const down = widestFree(Y0, Y1, yCuts);
  const clear = Math.min(across, down);
  const want = halfOf(mm);
  const h = clear - want;
  const out: Measured = { holds: h >= 0, h, measuredH: clear, skippedWalls: skipped };
  if (h < 0) {
    out.message = `This keep holds a clear span of at least ${mmText(want)} mm in ${roomPhrase(ix, r)}; its clear span is ${mmText(clear)} mm, ${mmText(-h)} mm short.${MESSAGE_TAIL}`;
    out.hints = [
      `The keep names \`${ref.id}\`; residual ${mmText(h)} mm (+ is margin): clear ${mmText(across)} mm across x and ${mmText(down)} mm down y between the wall faces${skipped > 0 ? `, ${skipped} wall segment${skipped === 1 ? "" : "s"} meeting the room not read (curved, oblique or not spanning it)` : ""}.`,
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
          `This keep names level ${lv}, which the plan does not have`,
          `\`${text}\` lists level ${lv}; the plan's levels are ${storeys.map((x) => x.level).join(", ")}`,
        );
        failed = true;
        break;
      }
      const el = indexFor(s).get(target.id);
      if (!el || !s.authored(target.id)) {
        refuse(
          { code: "E_KEEP_TARGET" },
          `This keep names something level ${lv} does not have`,
          `\`${target.id}\` in \`${text}\` is ${el ? "an assigned id" : "not an authored id"} on level ${lv}`,
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
          `\`${target.id}\` in \`${text}\` on level ${lv}`,
        );
        failed = true;
        break;
      }
      if (el.kind === "room" && (el as RRoom)._unplaced) {
        refuse(
          { code: "E_KEEP_TARGET" },
          "This keep names a room that could not be placed",
          `\`${target.id}\` in \`${text}\` on level ${lv}`,
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
    };
    if (!holds) {
      const vertical = worst.edge === "left" || worst.edge === "right";
      const el = first.el;
      const phrase =
        el.kind === "room"
          ? (el as RRoom).label !== undefined
            ? `"${(el as RRoom).label}"`
            : `the room`
          : `the ${KIND_NOUN[el.kind] ?? el.kind}`;
      res.message = `This keep holds ${phrase} on levels ${listWords(levels.map(String))} with one footprint; on level ${worst.level} its ${worst.edge} edge is ${mmText(Math.abs(worst.h))} mm ${sideWord(vertical, worst.h)} where it is on level ${first.level}.${MESSAGE_TAIL}`;
      res.hints = [
        `The keep names \`${target.id}\` on levels ${levels.join(", ")}; residual ${mmText(worst.h)} mm on ${axisWord(vertical)} (${signWord(vertical)}): its ${worst.edge} edge at ${mmText(rects.find((r) => r.level === worst.level)!.e[worst.edge!])} on level ${worst.level}, ${mmText(first.e[worst.edge!])} on level ${first.level}.`,
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

// ---- the D4 transformer (tests) ------------------------------------------------------------

/**
 * A keep carried through a whole-plan turn or mirror, as source (design §7, R10): the plan's body
 * placed as one instance `prefix` by `place … at t rotate … mirror …`, and the keep rewritten to
 * name the same lines in world words. A room's `left|right|top|bottom` goes where the frame takes
 * that side, `cx`↔`cy` and `width`↔`depth` swap under a quarter turn, ids gain the prefix, and a
 * value along an axis is carried to the image axis (`offset`: its sign; `fixed`: its sign and the
 * translation). `vertical(ref)` says which way a line the source cannot spell runs (a wall's
 * centreline), and `opening(ref)` whether an id names a door, window or opening (whose width runs
 * along its wall, so it stays a width under any turn). An axis reference is left as it is: a frame carries no positioning axis, so the
 * law is stated over keeps that name none. Values must be literals. Never used by `compile()`.
 */
export function transformKeep(
  n: KeepNode,
  g: import("./algebra/d4.js").D4,
  t: Point,
  prefix: string,
  vertical: (ref: KeepRef) => boolean,
  opening: (ref: KeepRef) => boolean = () => false,
): KeepNode {
  const img = (v: { x: number; y: number }): { x: number; y: number } => applyVec(g, v);
  const swaps = img({ x: 1, y: 0 }).x === 0;
  const ref = (r: KeepRef): KeepRef => {
    switch (r.t) {
      case "axis":
        return r;
      case "el":
        return { ...r, id: `${prefix}.${r.id}` };
      case "room": {
        const w = (COMPASS_DATUM_ALIASES[r.word] ?? r.word) as DatumWord;
        const word = w === "cx" || w === "cy" ? (swaps ? (w === "cx" ? "cy" : "cx") : w) : actOnSide(g, w);
        return { ...r, room: `${prefix}.${r.room}`, word };
      }
    }
  };
  const isVertical = (r: KeepRef): boolean =>
    r.t === "room" ? ["left", "right", "cx", "west", "east"].includes(r.word) : vertical(r);
  /** The image of a line's normal axis: its sign, and the translation along it. */
  const along = (r: KeepRef): { s: number; t: number } => {
    const v = img(isVertical(r) ? { x: 1, y: 0 } : { x: 0, y: 1 });
    return v.x !== 0 ? { s: v.x, t: t.x } : { s: v.y, t: t.y };
  };
  const lit = (e: import("./expr.js").Expr): number => {
    if (e.t !== "num") throw new Error("transformKeep: a keep's value must be a literal");
    return e.value;
  };
  const num = (v: number): import("./expr.js").Expr => ({ t: "num", value: v });
  switch (n.form) {
    case "align":
      return { ...n, refs: n.refs.map(ref) };
    case "equal":
      return {
        ...n,
        measure: swaps && !n.refs.some(opening) ? (n.measure === "width" ? "depth" : "width") : n.measure,
        refs: n.refs.map(ref),
      };
    case "offset":
      return { ...n, x: ref(n.x), from: ref(n.from), mm: num(along(n.from).s * lit(n.mm)) };
    case "min-clear":
      return { ...n, room: ref(n.room) };
    case "on-axis":
      return { ...n, wall: ref(n.wall) };
    case "stacked":
      return { ...n, target: ref(n.target) };
    case "fixed": {
      const a = along(n.datum);
      return { ...n, datum: ref(n.datum), mm: num(a.s * lit(n.mm) + a.t) };
    }
  }
}

/** The sign a residual of `n` takes under `g`: `+1` or `-1` for a keep measured along one axis
 *  (`align`, `on axis`, `offset`, `fixed`), `+1` for an extent or a span (`equal`, `min clear`). */
export function residualSign(
  n: KeepNode,
  g: import("./algebra/d4.js").D4,
  vertical: (ref: KeepRef) => boolean,
): number {
  const first: KeepRef | undefined =
    n.form === "align"
      ? n.refs[0]
      : n.form === "offset"
        ? n.from
        : n.form === "fixed"
          ? n.datum
          : n.form === "on-axis"
            ? n.wall
            : undefined;
  if (!first) return 1;
  const isV = first.t === "room" ? ["left", "right", "cx", "west", "east"].includes(first.word) : vertical(first);
  const v = applyVec(g, isV ? { x: 1, y: 0 } : { x: 0, y: 1 });
  return v.x !== 0 ? v.x : v.y;
}
