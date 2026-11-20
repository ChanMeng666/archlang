/**
 * Card AF9's plans and its corpus fuzz, importable without vitest so the PR's full fuzz count is
 * taken by this very body (`test/opening-moves.test.ts` runs a bounded share of it).
 *
 * {@link fuzzCases} shifts every literal position of a door, window or cased opening in a source
 * (`between … at <mm> from …`, `on <edge|wall> at <mm>[ from …]`) by ±50, ±150 and ±400 mm and onto
 * each wall that meets its host; {@link judgeFix} applies one `maybe-incorrect` fix of the AF9
 * producers alone, as `arch fix --unsafe` would, and reports what it did.
 */

import { applyFixes, compile, type Diagnostic, describe, type FixSuggestion, lint } from "../../src/index.js";
import { resolvePlan } from "../../src/analyze.js";
import type { RDoor, ROpening, RWindow } from "../../src/ir.js";
import { openBoundaryIds, standingJunctionSpans } from "../../src/opening-junctions.js";
import { segmentLength, segmentsOfWall } from "../../src/geometry.js";

export const plan = (name: string, ...body: string[]): string =>
  [`plan "${name}" {`, "  units mm", ...body.map((l) => `  ${l}`), "}", ""].join("\n");

const PAIR = ["room id=a at (0,0) size 4000x3000", "room id=b at (4000,0) size 3000x3000"];
const HALF = ["room id=a at (0,0) size 4000x3000", "room id=b at (4000,0) size 3000x1500"];
const WALLS = "walls from rooms exterior 200 partition 100";

/** The design note's §2 plans (`docs/plans/ai-first-language/af9-design.md`), as written there. */
export const AF9_PLANS = {
  nib: plan("nib", ...PAIR, WALLS, "door between a and b at 500 from start width 800"),
  nibTie: plan(
    "nib-tie",
    ...PAIR,
    WALLS,
    "wall id=t partition thickness 100 { (4000,1500) (7000,1500) }",
    "door between a and b at 1500 from start width 800",
  ),
  flush: plan("flush", ...PAIR, WALLS, "opening between a and b at 450 from start width 800"),
  ext: plan("ext", ...PAIR, WALLS, "window on a.right width 1200"),
  extDoor: plan("ext-door", ...PAIR, WALLS, "door on a.right at 1500 from start width 800"),
  extPart: plan("ext-part", ...HALF, WALLS, "window on a.right at center width 800"),
  par: plan("par", ...PAIR, WALLS, "door between a and b at 600 from a.left width 800"),
  nopos: plan("nopos", ...PAIR, WALLS, "door between a and b width 800", "door between a and b at 600 width 800"),
  pct: plan("pct", ...PAIR, WALLS, "door between a and b at 40% width 800"),
  /** A room with one exterior edge (`b`, its top): a window on its partition moves there. */
  oneEdge: plan(
    "one-edge",
    "room id=a at (0,0) size 3000x3000",
    "room id=b at (3000,0) size 3000x3000",
    "room id=c at (6000,0) size 3000x3000",
    "room id=d at (0,3000) size 9000x3000",
    WALLS,
    "window on b.left width 1200",
  ),
  blocked: plan(
    "blocked",
    "wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
    'room id=r at (0,0) size 6000x4000 label "Bath"',
    "door id=d on shell at 3000 width 800",
    "furniture wc at (2800,150) size 400x700",
  ),
} as const;

/** The AF9 producers' fix ids. */
export const AF9_FIX_IDS = new Set(["opening-move", "opening-exterior-edge", "opening-datum", "doorway-move"]);
/** The codes AF9 attaches fixes to. */
export const AF9_CODES = new Set([
  "E_OPENING_NIB",
  "E_OPENING_HOST_AMBIGUOUS",
  "E_OPENING_NO_SHARED_WALL",
  "E_OPENING_DATUM",
  "W_DOORWAY_BLOCKED",
]);
/** The lint warnings a moved opening is watched for (design §9 item 3, the red team's B1 and B2 kinds). */
export const WATCHED = [
  "W_OPENING_AT_JUNCTION",
  "W_OPENING_OVERLAP",
  "W_DOOR_NEAR_CORNER",
  "W_CONNECTOR_AMBIGUOUS",
  "W_SWING_OBSTRUCTED",
  "W_DOORWAY_BLOCKED",
  "W_HOB_UNDER_WINDOW",
] as const;

/** Every diagnostic `arch fix` reads: `compile()`'s, then `lint()`'s when it compiles. */
export function diagnosticsOf(src: string): { compiled: Diagnostic[]; linted: Diagnostic[] } {
  const compiled = compile(src, { noCache: true }).diagnostics;
  const linted = compiled.some((d) => d.severity === "error") ? [] : lint(src);
  return { compiled, linted };
}

/** The source with one fix applied, as `arch fix --unsafe` applies it. */
export const paste = (src: string, f: FixSuggestion): string =>
  applyFixes(src, [f], { maxApplicability: "maybe-incorrect" }).output;

/** The plan's openings (door, window, cased opening) on every storey, resolved, in source order;
 *  `[]` on an error. */
export function openingsOf(src: string): Array<RDoor | RWindow | ROpening> {
  const r = resolvePlan(src);
  const irs = r.levels.length > 0 ? r.levels.map((l) => l.ir) : r.ir ? [r.ir] : [];
  return irs.flatMap((ir) =>
    ir.elements.filter(
      (e): e is RDoor | RWindow | ROpening => e.kind === "door" || e.kind === "window" || e.kind === "opening",
    ),
  );
}

/** One shifted source and where it came from. */
export interface FuzzCase {
  name: string;
  src: string;
}

const POS =
  /^(\s*(?:door|window|opening)\b[^\n]*?\b(?:between \S+ and \S+|on \S+) at )(-?\d+(?:\.\d+)?)((?: from \S+)?)/;

/**
 * Every shifted twin of `src`: each literal position moved by ±50, ±150 and ±400 mm, and onto the
 * centre of each wall meeting the opening's host on its run (read off the resolved plan, the shape).
 */
export function fuzzCases(name: string, src: string): FuzzCase[] {
  const lines = src.split("\n");
  const ops = openingsOf(src);
  const ir = resolvePlan(src).ir;
  const out: FuzzCase[] = [];
  let k = -1;
  lines.forEach((line, i) => {
    if (!/^\s*(door|window|opening)\b/.test(line)) return;
    k += 1;
    const m = POS.exec(line);
    if (!m) return;
    const v = Number(m[2]);
    const shifts = [-400, -150, -50, 50, 150, 400].map((d) => v + d);
    // Onto each meeting wall's centre, measured from the end the position names.
    const el = ops[k];
    if (el && ir && "host" in el && el.host && !el.host.arc) {
      const host = el.host;
      const segs = ir.walls.flatMap((w) => segmentsOfWall(w));
      const len = segmentLength(host);
      const s0 = Math.hypot(el.at.x - host.a.x, el.at.y - host.a.y);
      const end = (m[3] ?? "").trim() === "from end";
      for (const j of standingJunctionSpans(host, segs, openBoundaryIds(ir.walls))) {
        const jc = (j.lo + j.hi) / 2;
        if (jc <= 0 || jc >= len) continue;
        shifts.push(end ? v - (jc - s0) : v + (jc - s0));
      }
    }
    for (const nv of [...new Set(shifts)]) {
      if (!(nv >= 0) || nv === v) continue;
      const twin = [...lines];
      twin[i] = line.replace(POS, (_x, a: string, _n: string, f: string) => `${a}${nv}${f}`);
      out.push({ name: `${name}:${i + 1}@${nv}`, src: twin.join("\n") });
    }
  });
  return out;
}

/** What applying one fix alone did. */
export interface FixVerdict {
  code: string;
  fixId: string;
  title: string;
  /** The diagnostic it answers is gone (one fewer of its code). */
  gone: boolean;
  /** The error count fell (compile stage), or stayed at zero (lint stage). */
  fewerErrors: boolean;
  /** The fix's quoted centre (`centre at x N` in its title), when it quotes one, is where the
   *  opening landed, standing in a wall. */
  landed: boolean;
  /** A relational opening still joins the rooms it named (`describe()`'s `between`). */
  sameRooms: boolean;
  /** A second `arch fix --unsafe` pass on its own code offers no AF9 fix on the moved statement. */
  settled: boolean;
  /** Errors left after the fix. */
  errors: string[];
  /** Watched warnings the fixed plan raises beyond the unshifted plan's. */
  newWarnings: string[];
}

const count = (ds: readonly Diagnostic[], code: string): number => ds.filter((d) => d.code === code).length;

/**
 * Apply `f`, a fix on `d` of the plan `src`, alone, and judge it; `base` is the plan the case was
 * shifted from, whose watched warnings do not count against a compile-stage fix (a lint-stage fix is
 * held to the plan as it stood before it).
 */
export function judgeFix(src: string, d: Diagnostic, f: FixSuggestion, base: string): FixVerdict {
  const before = diagnosticsOf(src);
  const out = paste(src, f);
  const after = diagnosticsOf(out);
  const errs = (x: { compiled: Diagnostic[] }) => x.compiled.filter((y) => y.severity === "error");
  const all = (x: { compiled: Diagnostic[]; linted: Diagnostic[] }) => [...x.compiled, ...x.linted];
  const code = d.code!;
  const lintStage = code.startsWith("W_");
  const gone = count(all(after), code) < count(all(before), code);
  const fewerErrors = lintStage ? errs(after).length === 0 : errs(after).length < errs(before).length;
  const edit = f.edits[0]!;
  const startOfStmt = out.lastIndexOf("\n", edit.span.start) + 1;
  const stmtEnd = out.indexOf("\n", edit.span.start);
  const line = out.slice(startOfStmt, stmtEnd < 0 ? undefined : stmtEnd);
  // The statement the edit is in, by its span: an `open between` derives openings that no line writes.
  const moved = openingsOf(out).find(
    (o) =>
      o._instance === undefined &&
      o.span !== undefined &&
      o.span.start >= startOfStmt &&
      o.span.start < startOfStmt + line.length,
  );
  const quoted = /centre at ([xy]) (-?\d+(?:\.\d+)?)/.exec(f.title);
  const host = moved && "host" in moved ? moved.host : null;
  const landed =
    moved !== undefined &&
    host !== null &&
    (quoted === null || (quoted[1] === "x" ? moved.at.x : moved.at.y) === Number(quoted[2]));
  let sameRooms = true;
  const rel = /\bbetween (\S+) and (\S+)/.exec(line);
  if (rel && errs(after).length === 0) {
    // Every storey's doors and cased openings: a multi-storey plan lists them per level.
    const facts = describe(out);
    const all = [facts, ...(facts.levels ?? [])].flatMap((f) => [...(f.doors ?? []), ...(f.openings ?? [])]);
    sameRooms = all.some((o) => o.id === moved?.id && o.between.includes(rel[1]!) && o.between.includes(rel[2]!));
  }
  const again = all(after).filter(
    (y) =>
      y.span !== undefined &&
      y.span.start >= startOfStmt &&
      y.span.start <= startOfStmt + line.length &&
      y.code === code &&
      (y.fixes ?? []).some((z) => AF9_FIX_IDS.has(z.fixId ?? "") && z.applicability === "maybe-incorrect"),
  );
  // Against the plan as it stood before the fix when it lints (a warning's fix), else the plan it was shifted from.
  const baseLint = errs(before).length === 0 ? before.linted : diagnosticsOf(base).linted;
  const newWarnings = WATCHED.filter((w) => count(after.linted, w) > count(baseLint, w));
  return {
    code,
    fixId: f.fixId ?? "",
    title: f.title,
    gone,
    fewerErrors,
    landed,
    sameRooms,
    settled: again.length === 0,
    errors: errs(after).map((y) => y.code ?? ""),
    newWarnings,
  };
}

/** Every `maybe-incorrect` AF9 fix a source raises, with its diagnostic. */
export function af9Fixes(src: string): Array<{ d: Diagnostic; f: FixSuggestion }> {
  const { compiled, linted } = diagnosticsOf(src);
  return [...compiled, ...linted].flatMap((d) =>
    AF9_CODES.has(d.code ?? "") && d.file === undefined
      ? (d.fixes ?? []).filter((f) => f.applicability === "maybe-incorrect").map((f) => ({ d, f }))
      : [],
  );
}

/**
 * The near misses of AF9's paths, for its byte-identity law (`test/af9-byte-identity.test.ts`): each
 * passes every check a refusal or a warning forks from, at the edge of failing it, so none raises
 * any of the five codes and nothing of it may move.
 */
export const AF9_NEAR_MISS: ReadonlyArray<{ name: string; src: string }> = [
  { name: "inline:af9-nib-exact", src: plan("n1", ...PAIR, WALLS, "door between a and b at 600 from start width 800") },
  {
    name: "inline:af9-flush-jamb",
    src: plan("n2", ...PAIR, WALLS, "opening between a and b at 500 from start width 800"),
  },
  {
    name: "inline:af9-tee-bays",
    src: plan(
      "n3",
      ...PAIR,
      WALLS,
      "wall id=t partition thickness 100 { (4000,1500) (7000,1500) }",
      "door between a and b at 950 from start width 800",
      "door between a and b at 2050 from start width 800",
    ),
  },
  {
    name: "inline:af9-edge-two-walls",
    src: plan("n4", ...HALF, WALLS, "window on a.right at 2100 from start width 800"),
  },
  {
    name: "inline:af9-edge-exterior",
    src: plan("n5", ...PAIR, WALLS, "door on a.top at 1500 from start width 800", "window on b.right width 1200"),
  },
  {
    name: "inline:af9-datum-through-end",
    src: plan("n6", ...PAIR, WALLS, "door between a and b at 600 from a.top width 800"),
  },
  {
    name: "inline:af9-one-exterior-edge",
    src: plan(
      "n7",
      "room id=a at (0,0) size 3000x3000",
      "room id=b at (3000,0) size 3000x3000",
      "room id=c at (6000,0) size 3000x3000",
      "room id=d at (0,3000) size 9000x3000",
      WALLS,
      "window on b.top width 1200",
      "door between b and d at center width 900",
    ),
  },
  {
    name: "inline:af9-doorway-clear",
    src: plan(
      "n8",
      "wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
      'room id=r at (0,0) size 6000x4000 label "Bath"',
      "door id=d on shell at 2400 width 800",
      "door id=e on shell at 3000 from end width 800",
      "furniture wc at (2800,150) size 400x700",
    ),
  },
  {
    name: "inline:af9-placed-relational",
    src: plan(
      "n9",
      "component flat() {",
      "  room id=a at (0,0) size 4000x3000",
      "  room id=b at (4000,0) size 3000x3000",
      "  walls from rooms exterior 200 partition 100",
      "  door between a and b at 600 from start width 800",
      "}",
      "place flat() as p at (0,0)",
      "place flat() as q at (0,8000) rotate 90 mirror x",
    ),
  },
];
