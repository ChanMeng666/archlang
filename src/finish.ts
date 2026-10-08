/**
 * `finish()` — make a plan a complete DRAWING: the furniture its empty rooms imply (the
 * `furnish` stage, `src/furnish.ts`, `docs/adr/0025-furnish-as-explicit-transform.md`), then
 * the sheet statements its author left out (the `sheet` stage, below,
 * `docs/adr/0024-finish-as-explicit-transform.md`). Furniture goes first because the
 * legend lists it.
 *
 * An explicit source-to-source transform, like `repair` and `arch fix`, and for the same
 * reason (ADR 0005/0006): `compile()` renders what is written. Nothing here runs inside
 * it, and no grammar, `describe()` or `lint()` path is touched.
 *
 * **Fill only what is missing; delete nothing.** For each of `paper`, `scale`,
 * `dims auto`, `title`, `schedule rooms` and `legend` the statement is added only when the
 * plan has none. An authored `dim`, `axes`, `north` or title block is never rewritten.
 * `reissue: true` is the one exception, and it reaches `paper`/`scale` only: when the
 * drawing does not fit the sheet the author declared, those two statements are replaced.
 *
 * The edits are span-based inserts through the {@link Data} piece table, never a
 * re-emission through the formatter — every authored byte and comment survives, and a
 * plan that needs nothing comes back byte-identical with `changed: false`.
 *
 * Four laws, each pinned by `test/finish.test.ts` / `test/fuzz.test.ts`:
 *
 *   1. **Fixpoint** — `finish(finish(s).source).source === finish(s).source`.
 *   2. **Never worse** — the result has no compile error and no diagnostic code (compile +
 *      lint, as a multiset) the input did not have, and no new hard furniture conflict;
 *      otherwise the whole stage is rolled back and the reason reported in `unresolved`.
 *   3. **A sheet finish chose fits** — whenever `paper` or `scale` was written the result
 *      raises neither `W_SCALE_OVERFLOW` nor `W_DRAWING_OVERFLOW`.
 *   4. **A source that does not compile is returned untouched.**
 *
 * The fit is decided with the compiler's own rule ({@link fitsOnSheet}, on
 * {@link sheetExtents}, {@link planTableRows} and {@link titleRows}) — the numbers
 * `resolve()` decides `sheet.fits` with — never by reading a diagnostic's message.
 */

import type { PlanNode, TitleNode } from "./ast.js";
import { type AnalyzeOptions, resolvePlan } from "./analyze.js";
import { titleRows } from "./chrome-layout.js";
import type { Span } from "./diagnostics.js";
import { escapeStr } from "./expr-source.js";
import { Data } from "./fix-apply.js";
import { furnishStage } from "./furnish.js";
import { type ResolvedPlan, type RFurniture, type ROutdoor, type RRoom, sheetExtents } from "./ir.js";
import { lex, type Token } from "./lexer.js";
import { lint } from "./lint.js";
import { fmt3 } from "./num-format.js";
import { parse } from "./parser.js";
import { compileUncached } from "./pipeline.js";
import { BUILTIN_REGISTRY, createRegistry, type Registry } from "./registry.js";
import { sourceConflicts } from "./repair.js";
import {
  AUTO_SCALE_DENOMINATORS,
  fitsOnSheet,
  PAPER_ORIENTATIONS,
  PAPER_SIZES,
  type PaperSpec,
  paperMm,
  scaleDenominator,
} from "./sheet.js";
import { planTableRows } from "./sheet-tables.js";

/** The stages `finish` is made of, as `--only` names them. */
export const FINISH_STAGES = ["sheet", "furnish"] as const;
export type FinishStage = (typeof FINISH_STAGES)[number];
/** The stages this version can run. */
export const FINISH_STAGES_AVAILABLE: readonly FinishStage[] = ["sheet", "furnish"];
/** The order a full run takes them in: the legend's rows depend on the furniture. */
export const FINISH_STAGE_ORDER: readonly FinishStage[] = ["furnish", "sheet"];

/** The statements `finish` may write: the six sheet statements, and `furniture`. */
export type FinishStatement = "paper" | "scale" | "dims" | "title" | "schedule" | "legend" | "furniture";

export interface FinishOptions extends AnalyzeOptions {
  /** Run only this stage. Default: every stage, `furnish` then `sheet`. */
  only?: FinishStage;
  /**
   * Allow `paper` and `scale` — and nothing else — to be REPLACED when the drawing does
   * not fit the sheet the author declared. Default `false`: an authored sheet is kept and
   * the misfit is reported in `unresolved`.
   */
  reissue?: boolean;
}

export interface FinishChange {
  stage: FinishStage;
  /** `added`: a statement the plan did not have. `replaced`: `paper`/`scale` under `reissue`. */
  kind: "added" | "replaced";
  statement: FinishStatement;
  /** The statement as written into the source. */
  text: string;
  /** The statement it replaced (a `replaced` change only). */
  from?: string;
  /** Where in the ORIGINAL source: an empty span at the insertion point, or the replaced range. */
  span: Span;
  reason: string;
  /** The room a `furniture` statement was written for (the `furnish` stage only). */
  room?: string;
}

export interface FinishNote {
  stage: FinishStage;
  /** The statement the note is about, when it is about one. */
  statement?: FinishStatement;
  /** The room the note is about, when the `furnish` stage left one empty. */
  room?: string;
  /** The diagnostic codes furnishing that room would have raised. */
  codes?: string[];
  reason: string;
  /** The authored statement the note points at, when there is one. */
  span?: Span;
}

export interface FinishResult {
  /** The finished `.arch` source. Byte-identical to the input when nothing was added. */
  source: string;
  changes: FinishChange[];
  /** What `finish` declined to do, and why. */
  unresolved: FinishNote[];
  /** True when at least one change was applied. */
  changed: boolean;
}

/** Below this many millimetres ON PAPER the short facade has no room for three chains. */
const SHORT_FACADE_MM = 60;
/** Sheets tried before A0, smallest first; A0 is the last resort at every scale. */
const USUAL_SIZES = PAPER_SIZES.filter((s) => s !== "A0");

const untouched = (source: string, unresolved: FinishNote[]): StageRun => ({
  source,
  changes: [],
  unresolved,
  changed: false,
  ops: [],
});

/** One edit of a stage, in the coordinates of the source that stage was given. */
type Op = readonly [start: number, end: number, bytes: string];
type StageRun = FinishResult & { ops: readonly Op[] };

/**
 * How many times the stages are run in turn before `finish` gives up on a plan that keeps
 * changing. A plan settles in two: the second round is the one that changes nothing.
 */
const MAX_ROUNDS = 4;

/** Where an offset of a stage's OUTPUT stood in its input. */
function mapBack(pos: number, ops: readonly Op[]): number {
  let delta = 0;
  for (const [start, end, bytes] of [...ops].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
    const at = start + delta;
    if (pos < at) break;
    if (pos < at + bytes.length) return start;
    if (pos === at + bytes.length && bytes.length > 0) return end;
    delta += bytes.length - (end - start);
  }
  return pos - delta;
}

/**
 * Finish a plan. See the module header for the contract; `opts.world`/`opts.plugins` are
 * the ones `compile()` takes, so a plan with `import`s is measured on the same modules.
 *
 * The fixpoint law is held by construction as well as by test: the stages are run in turn
 * until a whole round changes nothing, so the result is one `finish` would itself leave
 * alone. A plan that has not settled after {@link MAX_ROUNDS} rounds is returned untouched.
 */
export function finish(source: string, opts: FinishOptions = {}): FinishResult {
  if (opts.only !== undefined && !FINISH_STAGES_AVAILABLE.includes(opts.only)) {
    return result(
      untouched(source, [
        {
          stage: opts.only,
          reason: `the \`${opts.only}\` stage is not available — this version runs: ${FINISH_STAGES_AVAILABLE.join(", ")}`,
        },
      ]),
    );
  }
  const env: AnalyzeOptions = {
    ...(opts.world ? { world: opts.world } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  };
  const memo: CodesMemo = new Map();
  const stages = opts.only !== undefined ? [opts.only] : FINISH_STAGE_ORDER;
  const last = stages[stages.length - 1]!;
  if (codesOf(source, env, memo).errors)
    return result(
      untouched(source, [
        { stage: last, reason: "the plan does not compile — fix its errors first; nothing was changed" },
      ]),
    );
  const run = (stage: FinishStage, src: string): StageRun => {
    if (stage === "sheet") return sheetStage(src, env, opts.reissue === true, memo);
    const r = furnishStage(src, env, (s) => codesOf(s, env, memo));
    return {
      source: r.source,
      changes: r.changes,
      unresolved: r.unresolved,
      changed: r.changed,
      ops: r.insert ? [[r.insert.at, r.insert.at, r.insert.text]] : [],
    };
  };

  // Spans are reported in the caller's source: each one is carried back through the edits
  // of every stage that ran before the one that produced it.
  const history: Array<readonly Op[]> = [];
  const original = (span: Span): Span => {
    let { start, end } = span;
    for (let i = history.length - 1; i >= 0; i--) {
      start = mapBack(start, history[i]!);
      end = mapBack(end, history[i]!);
    }
    return { start, end: Math.max(start, end) };
  };
  let current = source;
  const changes: FinishChange[] = [];
  let unresolved: FinishNote[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false;
    // The notes of the round that settles are the ones a fresh run on the result gives.
    unresolved = [];
    for (const stage of stages) {
      const r = run(stage, current);
      for (const n of r.unresolved) unresolved.push(n.span ? { ...n, span: original(n.span) } : n);
      if (!r.changed) continue;
      moved = true;
      for (const c of r.changes) changes.push({ ...c, span: original(c.span) });
      history.push(r.ops);
      current = r.source;
    }
    if (!moved)
      return changes.length > 0
        ? { source: current, changes, unresolved, changed: true }
        : result(untouched(source, unresolved));
  }
  return result(
    untouched(source, [
      ...unresolved,
      { stage: last, reason: `the \`${last}\` stage did not settle on its own result — nothing was changed` },
    ]),
  );
}

/** A stage's run without its edit list — the public shape. */
const result = ({ source, changes, unresolved, changed }: StageRun): FinishResult => ({
  source,
  changes,
  unresolved,
  changed,
});

// ---------------------------------------------------------------------------
// what the plan has, and what its sheet has to hold
// ---------------------------------------------------------------------------

interface Codes {
  errors: boolean;
  codes: Map<string, number>;
}
/** One `finish` call measures each source once: the result it checks is the input it settles on. */
type CodesMemo = Map<string, Codes>;

/** The diagnostic codes of a source — compile's and lint's — as a multiset. */
function codesOf(source: string, env: AnalyzeOptions, memo: CodesMemo): Codes {
  const hit = memo.get(source);
  if (hit) return hit;
  const compiled = compileUncached(source, env);
  const codes = new Map<string, number>();
  for (const d of [...compiled.diagnostics, ...lint(source, env)]) {
    const k = d.code ?? "";
    codes.set(k, (codes.get(k) ?? 0) + 1);
  }
  const out = { errors: compiled.diagnostics.some((d) => d.severity === "error"), codes };
  memo.set(source, out);
  return out;
}

/** What the fit rule needs from the geometry: the largest extent over the storeys. */
interface Measured {
  building: { w: number; h: number };
  drawn: { w: number; h: number };
  storeys: ResolvedPlan[];
  multiStorey: boolean;
}

function measure(storeys: ResolvedPlan[], multiStorey: boolean, registry: Registry): Measured {
  const building = { w: 0, h: 0 };
  const drawn = { w: 0, h: 0 };
  for (const ir of storeys) {
    const e = sheetExtents(ir.elements, ir.walls, ir.siteBoundary, registry);
    building.w = Math.max(building.w, e.building.w);
    building.h = Math.max(building.h, e.building.h);
    drawn.w = Math.max(drawn.w, e.drawn.w);
    drawn.h = Math.max(drawn.h, e.drawn.h);
  }
  return { building, drawn, storeys, multiStorey };
}

/** The deepest margin-table band any storey would draw with these two tables on or off. */
function tableRows(m: Measured, schedule: boolean, legend: boolean): number {
  let rows = 0;
  for (const ir of m.storeys)
    rows = Math.max(
      rows,
      planTableRows({
        schedule: schedule ? "rooms" : undefined,
        legend,
        rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
        zones: ir.zones,
        walls: ir.walls,
        furniture: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
        outdoor: ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
      }),
    );
  return rows;
}

/** Which of the four non-sheet statements a candidate carries (authored or to be added). */
interface Extras {
  dims: boolean;
  title: boolean;
  schedule: boolean;
  legend: boolean;
}

/**
 * `s` as an ArchLang string literal, written by the language's own escaper
 * (`escapeStr`) — or null when the lexer would not read that literal back as exactly `s`.
 * `JSON.stringify` is not that escaper: the lexer knows the newline escape and takes any
 * other escaped character literally, so JSON's tab and unicode escapes do not round-trip.
 */
function stringLiteral(s: string): string | null {
  const text = `"${escapeStr(s)}"`;
  const { tokens, errors } = lex(text);
  const [tok, end] = tokens;
  return errors.length === 0 && tok?.type === "string" && tok.value === s && end?.type === "eof" ? text : null;
}

// ---------------------------------------------------------------------------
// the sheet stage
// ---------------------------------------------------------------------------

function sheetStage(source: string, env: AnalyzeOptions, reissue: boolean, memo: CodesMemo): StageRun {
  const registry = env.plugins?.length ? createRegistry(env.plugins) : BUILTIN_REGISTRY;
  const before = codesOf(source, env, memo);
  const { plan } = parse(source, registry);
  const resolved = resolvePlan(source, env);
  if (before.errors || !plan || !resolved.ir || plan.bodyStart === undefined) {
    return untouched(source, [
      { stage: "sheet", reason: "the plan does not compile — fix its errors first; nothing was changed" },
    ]);
  }
  const multiStorey = resolved.levels.length > 0;
  const m = measure(multiStorey ? resolved.levels.map((l) => l.ir) : [resolved.ir], multiStorey, registry);
  const unresolved: FinishNote[] = [];

  // --- what is missing ------------------------------------------------------
  const handDims = m.storeys.some((ir) => ir.elements.some((e) => e.kind === "dim"));
  const hasRooms = m.storeys.some((ir) => ir.elements.some((e) => e.kind === "room"));
  const name = plan.name.trim();
  // The name as a string literal that lexes back to exactly the name, or null.
  const project = stringLiteral(plan.name);
  const want: Extras = {
    dims: plan.autoDims === undefined && !handDims,
    title: plan.title === undefined && name !== "" && project !== null,
    schedule: plan.schedule === undefined && hasRooms,
    // A legend's caption is one row; a table of nothing but its caption is not added.
    legend: plan.legend !== true && tableRows(m, false, true) > 1,
  };
  if (plan.autoDims === undefined && handDims)
    unresolved.push({
      stage: "sheet",
      statement: "dims",
      reason: "the plan has hand-written `dim` lines, so `dims auto` was not added — add it yourself if you want both",
    });
  if (plan.title === undefined && name === "")
    unresolved.push({
      stage: "sheet",
      statement: "title",
      reason: "the plan has no name to put in a title block — name the plan, or write the `title` yourself",
    });

  if (plan.title === undefined && name !== "" && project === null)
    unresolved.push({
      stage: "sheet",
      statement: "title",
      reason: "the plan's name cannot be written back as a string literal — write the `title` yourself",
    });

  // --- the fit rule, on a candidate set of statements -------------------------
  const has: Extras = {
    dims: plan.autoDims !== undefined,
    title: plan.title !== undefined,
    schedule: plan.schedule !== undefined,
    legend: plan.legend === true,
  };
  const newTitle: TitleNode = { project: plan.name, line: 0 };
  const fits = (paper: PaperSpec, denom: number, add: Extras): boolean => {
    const { w, h } = paperMm(paper.size, paper.orientation);
    const title = plan.title ?? (add.title ? newTitle : undefined);
    const input = {
      autoDims: has.dims || add.dims,
      // The same placeholder scale `resolve()` passes: a sheet always carries a SCALE row.
      titleRows: titleRows(title, "1:1", m.multiStorey ? { level: 0 } : undefined).length,
      tableRows: tableRows(m, has.schedule || add.schedule, has.legend || add.legend),
    };
    // `drawn` contains `building`; both are asked so the two warnings are both ruled out.
    return (
      fitsOnSheet(w, h, denom, { ...input, extent: m.building }) &&
      fitsOnSheet(w, h, denom, { ...input, extent: m.drawn })
    );
  };
  /** The smallest sheet that holds the drawing at `denom`: A4→A1 (or A0 alone), landscape first. */
  const smallestSheet = (denom: number, add: Extras, sizes: readonly PaperSpec["size"][]): PaperSpec | null => {
    for (const size of sizes)
      for (const orientation of PAPER_ORIENTATIONS)
        if (fits({ size, orientation }, denom, add)) return { size, orientation };
    return null;
  };
  /** The finest standard scale on the smallest usual sheet; A0 only when A4–A1 hold none. */
  const chooseSheet = (add: Extras): { paper: PaperSpec; denom: number } | null => {
    for (const sizes of [USUAL_SIZES, ["A0"] as const])
      for (const denom of AUTO_SCALE_DENOMINATORS) {
        const paper = smallestSheet(denom, add, sizes);
        if (paper) return { paper, denom };
      }
    return null;
  };
  const finestScale = (paper: PaperSpec, add: Extras): number | null =>
    AUTO_SCALE_DENOMINATORS.find((d) => fits(paper, d, add)) ?? null;

  // Statements are given up in this order when an AUTHORED sheet cannot hold them all.
  const none: Extras = { dims: false, title: false, schedule: false, legend: false };
  const tiers: Extras[] = [want, { ...want, schedule: false, legend: false }, { ...none, title: want.title }, none];

  // --- decide ---------------------------------------------------------------
  const authoredDenom = scaleDenominator(plan.scale);
  let add: Extras = want;
  let paper: PaperSpec | undefined; // the paper to WRITE (added or replaced)
  let denom: number | undefined; // the scale to WRITE
  let operative: number | undefined = authoredDenom ?? undefined; // the scale `dims` is chosen at
  const noSheet = "no sheet up to A0 holds the drawing at 1:500";
  const rerun = "rerun with `--reissue` to let finish choose the sheet";

  if (plan.scale !== undefined && authoredDenom === null) {
    unresolved.push({
      stage: "sheet",
      statement: "scale",
      reason: `\`scale ${plan.scale}\` is not a usable scale, so no sheet was chosen`,
      ...(plan.scaleSpan ? { span: plan.scaleSpan } : {}),
    });
  } else if (!plan.paper && authoredDenom === null) {
    // Neither authored: the whole choice is finish's.
    const pick = chooseSheet(want);
    if (pick) ({ paper, denom } = pick);
    else
      unresolved.push({
        stage: "sheet",
        statement: "paper",
        reason: `${noSheet} — \`paper\` and \`scale\` were not added`,
      });
  } else if (!plan.paper && authoredDenom !== null) {
    // The author set the scale: find the sheet that holds it.
    const at = smallestSheet(authoredDenom, want, USUAL_SIZES) ?? smallestSheet(authoredDenom, want, ["A0"]);
    if (at) paper = at;
    else {
      const pick = reissue ? chooseSheet(want) : null;
      if (pick) ({ paper, denom } = pick);
      else
        unresolved.push({
          stage: "sheet",
          statement: "paper",
          reason: `no sheet up to A0 holds the drawing at the authored \`scale ${plan.scale}\` — \`paper\` was not added${reissue ? "" : `; ${rerun}`}`,
          ...(plan.scaleSpan ? { span: plan.scaleSpan } : {}),
        });
    }
  } else if (plan.paper) {
    // The author chose the paper (and perhaps the scale): keep it while the drawing fits.
    const authored = plan.paper;
    const at = (t: Extras): number | null =>
      authoredDenom !== null ? (fits(authored, authoredDenom, t) ? authoredDenom : null) : finestScale(authored, t);
    const candidates = reissue ? tiers.slice(0, 1) : tiers;
    const tier = candidates.find((t) => at(t) !== null);
    if (tier) {
      add = tier;
      if (authoredDenom === null) denom = at(tier)!;
      for (const [statement, text] of [
        ["dims", "dims auto"],
        ["title", "title"],
        ["schedule", "schedule rooms"],
        ["legend", "legend"],
      ] as const)
        if (want[statement] && !tier[statement])
          unresolved.push({
            stage: "sheet",
            statement,
            reason: `\`${text}\` was not added — with it the drawing does not fit the authored \`paper ${authored.size} ${authored.orientation}\`; ${rerun}`,
            ...(plan.paperSpan ? { span: plan.paperSpan } : {}),
          });
    } else if (reissue) {
      const kept =
        authoredDenom !== null
          ? (smallestSheet(authoredDenom, want, USUAL_SIZES) ?? smallestSheet(authoredDenom, want, ["A0"]))
          : null;
      const pick = kept ? { paper: kept, denom: undefined } : chooseSheet(want);
      if (pick) ({ paper, denom } = pick);
      else {
        add = none;
        unresolved.push({ stage: "sheet", statement: "paper", reason: `${noSheet} — the sheet was left as authored` });
      }
    } else {
      add = none;
      unresolved.push({
        stage: "sheet",
        statement: "paper",
        reason: `the drawing does not fit the authored \`paper ${authored.size} ${authored.orientation}\`${plan.scale ? ` at \`scale ${plan.scale}\`` : ""}, so nothing was added; ${rerun}`,
        ...(plan.paperSpan ? { span: plan.paperSpan } : {}),
      });
    }
  }
  if (denom !== undefined) operative = denom;

  // --- write ----------------------------------------------------------------
  const edits = new Edits(source, plan);
  const paperText = paper ? `paper ${paper.size} ${paper.orientation}` : "";
  const scaleText = denom !== undefined ? `scale 1:${denom}` : "";
  const sheetWhy = (): string =>
    `the finest standard scale that fits the smallest sheet: the drawing measures ${fmt3(m.drawn.w)}×${fmt3(m.drawn.h)} mm`;

  if (paper && plan.paper && plan.paperSpan) {
    if (paper.size !== plan.paper.size || paper.orientation !== plan.paper.orientation)
      edits.replace("paper", plan.paperSpan, paperText, "the drawing does not fit the authored sheet (`reissue`)");
  } else if (paper)
    edits.addPaper(
      paperText,
      denom !== undefined ? sheetWhy() : `the smallest sheet that holds the drawing at \`scale ${plan.scale}\``,
    );

  if (denom !== undefined && plan.scale !== undefined && plan.scaleSpan) {
    if (denom !== authoredDenom)
      edits.replace(
        "scale",
        plan.scaleSpan,
        scaleText,
        "the drawing does not fit any sheet at the authored scale (`reissue`)",
      );
  } else if (denom !== undefined)
    edits.addScale(
      scaleText,
      plan.paper && !paper
        ? `the finest standard scale at which the drawing fits the authored \`paper ${plan.paper.size} ${plan.paper.orientation}\``
        : sheetWhy(),
    );

  if (add.dims) {
    const short = Math.min(m.building.w, m.building.h);
    const overall = operative !== undefined && short / operative < SHORT_FACADE_MM;
    edits.addSetting(
      "dims",
      `dims auto ${overall ? "overall" : "all"}`,
      overall
        ? `the plan has no dimensions; the short facade is under ${SHORT_FACADE_MM} mm on paper at 1:${operative}, so only the overall chain is drawn`
        : "the plan has no dimensions",
    );
  }
  if (add.schedule) edits.addSetting("schedule", "schedule rooms", "the sheet has no room schedule");
  if (add.legend)
    edits.addSetting("legend", "legend", "the sheet has no legend for the materials and symbols it draws");
  if (add.title)
    edits.addTitle(`title { project ${project} }`, "the sheet has no title block; the project is the plan's own name");

  if (edits.changes.length === 0) return untouched(source, unresolved);

  // --- the never-worse law ----------------------------------------------------
  const refuse = (why: string): StageRun =>
    untouched(source, [
      ...unresolved,
      { stage: "sheet", reason: `${why} — the sheet stage was rolled back and nothing was changed` },
    ]);
  let out: string;
  try {
    out = edits.render();
  } catch {
    return refuse("the edits could not be placed in the source");
  }
  const after = codesOf(out, env, memo);
  if (after.errors) return refuse("the finished plan would not compile");
  const gained = [...after.codes].filter(([code, n]) => n > (before.codes.get(code) ?? 0)).map(([code]) => code);
  if (gained.length > 0)
    return refuse(`the finished plan would raise ${gained.sort().join(", ")}, which the plan does not have now`);
  const wroteSheet = edits.changes.some((c) => c.statement === "paper" || c.statement === "scale");
  if (wroteSheet && (after.codes.has("W_SCALE_OVERFLOW") || after.codes.has("W_DRAWING_OVERFLOW")))
    return refuse("the chosen sheet would still overflow");
  const was = sourceConflicts(source, env).conflicts;
  for (const k of sourceConflicts(out, env).conflicts.keys())
    if (!was.has(k)) return refuse("the finished plan would have a furniture conflict the plan does not have now");

  return { source: out, changes: edits.changes, unresolved, changed: true, ops: edits.ops };
}

// ---------------------------------------------------------------------------
// where a statement goes
// ---------------------------------------------------------------------------

/** The plan-level settings a leading run of the body is made of. */
const SETTING_WORDS = new Set([
  "units",
  "grid",
  "paper",
  "scale",
  "height",
  "north",
  "site",
  "dims",
  "schedule",
  "legend",
]);

/** Nothing but indentation. */
const BLANK = /^[ \t]*$/;
/** Nothing but indentation and, perhaps, a line comment. */
const BLANK_OR_COMMENT = /^[ \t]*(#.*)?$/;

/**
 * The inserts and replacements of one stage, recorded against the ORIGINAL source.
 *
 * A statement is only ever inserted at a LINE boundary (or directly after the plan's
 * opening brace), on a line of its own, in the indentation and line ending the file
 * already uses. Where that is not a statement boundary — a statement wrapped across lines
 * in an unusual place — the result does not compile and the never-worse check rolls the
 * stage back, so a wrong guess costs a refusal, never a broken file.
 */
class Edits {
  readonly changes: FinishChange[] = [];
  /** The edits `render` applied, against the original source. */
  ops: Array<[start: number, end: number, bytes: string]> = [];
  /** Replacements and the two inserts that sit beside an authored statement. */
  private readonly spliced: Array<[start: number, end: number, bytes: string]> = [];
  private readonly settings: string[] = [];
  private title: string | null = null;
  private readonly eol: string;
  /** The indentation of the plan's own line, which its closing brace shares. */
  private readonly outer: string;
  private readonly indent: string;
  /**
   * Where the settings go: after a line (the leading settings, or the brace line when
   * nothing but a comment follows the brace), or `beside` the brace — then they replace the
   * blanks between it and whatever shares its line, and push that down a line.
   */
  private readonly header: { at: number; end: number; beside: boolean };
  /** The closing brace: its offset, and where the blanks before it on its line begin. */
  private readonly closing: { at: number; blanks: number; alone: boolean } | null;

  constructor(
    private readonly source: string,
    private readonly plan: PlanNode,
  ) {
    this.eol = source.includes("\r\n") ? "\r\n" : "\n";
    const toks = lex(source).tokens;
    const open = toks.findIndex((t) => t.type === "lcurly" && t.end === plan.bodyStart);
    const body = toks.slice(open + 1);
    const brace = plan.bodyStart!;
    this.outer = /^[ \t]*/.exec(source.slice(this.lineStart(brace)))![0];

    // The leading run of settings (it may begin on the brace's own line), the first
    // statement that starts a line (the body's indentation), and the closing brace.
    let depth = 0;
    let last: Token | null = null; // last token of the settings run
    let inRun = true;
    let prevLine = toks[open]?.line;
    let indent: string | null = null;
    let close: Token | null = null;
    for (const t of body) {
      if (t.type === "eof") break;
      if (t.type === "rcurly" && depth === 0) {
        close = t;
        break;
      }
      const startsLine = t.line !== prevLine;
      if (startsLine && depth === 0 && indent === null) indent = this.indentAt(t.start);
      const startsStatement = startsLine || t === body[0];
      if (inRun && depth === 0 && startsStatement && !(t.type === "ident" && SETTING_WORDS.has(t.value))) {
        inRun = false;
      }
      if (inRun) last = t;
      if (t.type === "lcurly") depth++;
      else if (t.type === "rcurly") depth--;
      prevLine = t.line;
    }
    this.indent = indent ?? `${this.outer}  `;
    // A run that ends on the closing brace's own line has no line end of its own.
    if (last && close && close.line === last.line) last = null;
    const rest = source.slice(brace, this.lineEnd(brace));
    if (last) this.header = { at: this.lineEnd(last.end), end: this.lineEnd(last.end), beside: false };
    else if (BLANK_OR_COMMENT.test(rest))
      this.header = { at: this.lineEnd(brace), end: this.lineEnd(brace), beside: false };
    else this.header = { at: brace, end: brace + (rest.length - rest.trimStart().length), beside: true };
    if (!close) this.closing = null;
    else {
      const before = source.slice(this.lineStart(close.start), close.start);
      this.closing = {
        at: close.start,
        blanks: close.start - (before.length - before.trimEnd().length),
        alone: BLANK.test(before),
      };
    }
  }

  /** Apply the recorded edits and return the new source. */
  render(): string {
    const { eol, indent, outer, header, closing } = this;
    const ops = [...this.spliced];
    const settings = this.settings.map((t) => `${eol}${indent}${t}`).join("");
    const title = this.title;
    if (closing && this.emptyBody()) {
      // `{}` / `{ }`: one edit lays the body out — settings, title, then the brace.
      if (settings !== "" || title !== null)
        ops.push([
          header.at,
          closing.at,
          `${settings}${title !== null ? `${eol}${indent}${title}` : ""}${eol}${outer}`,
        ]);
    } else {
      // Beside the brace the settings replace the blanks and push the rest down a line.
      if (settings !== "") ops.push([header.at, header.end, header.beside ? `${settings}${eol}${indent}` : settings]);
      if (title !== null && closing) {
        const start = this.lineStart(closing.at);
        if (closing.alone) ops.push([start, start, `${indent}${title}${eol}`]);
        else ops.push([closing.blanks, closing.at, `${eol}${indent}${title}${eol}${outer}`]);
      }
    }
    this.ops = ops;
    const data = new Data(this.source);
    // Inserts first, replacements last: an insert on the boundary of a span the table has
    // already replaced is an overlap, and the other order is not.
    for (const [start, end, bytes] of ops) if (start === end) data.replaceRange(start, end, bytes);
    for (const [start, end, bytes] of ops) if (start !== end) data.replaceRange(start, end, bytes);
    return data.render();
  }

  /** Does nothing but blanks stand between the two braces, on one line? */
  private emptyBody(): boolean {
    return this.closing !== null && BLANK.test(this.source.slice(this.plan.bodyStart!, this.closing.at));
  }

  replace(statement: FinishStatement, span: Span, text: string, reason: string): void {
    this.spliced.push([span.start, span.end, text]);
    this.changes.push({
      stage: "sheet",
      kind: "replaced",
      statement,
      text,
      from: this.source.slice(span.start, span.end),
      span,
      reason,
    });
  }

  /** `paper` reads as the line above the `scale` it makes operative. */
  addPaper(text: string, reason: string): void {
    const s = this.plan.scaleSpan;
    if (s && BLANK.test(this.source.slice(this.lineStart(s.start), s.start))) {
      const at = this.lineStart(s.start);
      this.spliced.push([at, at, `${this.source.slice(at, s.start)}${text}${this.eol}`]);
      this.added("paper", at, text, reason);
      return;
    }
    this.addSetting("paper", text, reason);
  }

  /** `scale` reads as the line below its `paper`. */
  addScale(text: string, reason: string): void {
    const p = this.plan.paperSpan;
    if (p && BLANK_OR_COMMENT.test(this.source.slice(p.end, this.lineEnd(p.end)))) {
      const lead = this.source.slice(this.lineStart(p.start), p.start);
      const at = this.lineEnd(p.end);
      // `paper` is the last leading setting: the settings block starts at this same
      // offset, so `scale` goes in at its head rather than racing it for the position.
      if (!this.header.beside && at === this.header.at) this.settings.unshift(text);
      else this.spliced.push([at, at, `${this.eol}${BLANK.test(lead) ? lead : this.indent}${text}`]);
      this.added("scale", at, text, reason);
      return;
    }
    this.addSetting("scale", text, reason);
  }

  /** A one-line setting, after the plan's leading settings. */
  addSetting(statement: FinishStatement, text: string, reason: string): void {
    this.settings.push(text);
    this.added(statement, this.header.at, text, reason);
  }

  /** The title block, as the plan's last statement. */
  addTitle(text: string, reason: string): void {
    if (!this.closing) return;
    this.title = text;
    this.added("title", this.closing.at, text, reason);
  }

  private added(statement: FinishStatement, at: number, text: string, reason: string): void {
    this.changes.push({ stage: "sheet", kind: "added", statement, text, span: { start: at, end: at }, reason });
  }

  private lineStart(at: number): number {
    return this.source.lastIndexOf("\n", at - 1) + 1;
  }
  /** The offset of the line's end, before its `\n` or `\r\n`. */
  private lineEnd(at: number): number {
    const i = this.source.indexOf("\n", at);
    if (i < 0) return this.source.length;
    return i > 0 && this.source[i - 1] === "\r" ? i - 1 : i;
  }
  /** The indentation of the line `at` is on, when `at` is its first non-blank. */
  private indentAt(at: number): string {
    const lead = this.source.slice(this.lineStart(at), at);
    return BLANK.test(lead) ? lead : "  ";
  }
}
