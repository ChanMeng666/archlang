/**
 * Intermediate representation + `resolve(ast)`.
 *
 * `resolve` is the single place semantics live: it grid-snaps coordinates,
 * assigns ids, hosts openings, and runs semantic checks — producing a NEW
 * immutable IR (the input AST is never mutated). `render` consumes IR only.
 */

import type { ExprPoint, LevelNode, PlanNode, Point } from "./ast.js";
import { placeRelational } from "./layout.js";
import {
  beforeRoomsReader,
  functionBodyReader,
  buildDatumTable,
  type DatumTable,
  tableReader,
  type TableReaderOpts,
} from "./room-datums.js";
import { numberAxes } from "./axes.js";
import type { Frame } from "./frame.js";
import { tryTransformElement } from "./frame.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Env, Expr } from "./expr.js";
import { fmt3, MODEL_RANGE_MM } from "./num-format.js";
import {
  asNum,
  asStr,
  chargeSteps,
  currentStepSite,
  DIAGNOSTIC_STEPS,
  evalExpr,
  exprSpan,
  MAX_EVAL_STEPS,
  type StepLimitSignal,
  stepSite,
  withDatumReader,
  withStepMeter,
} from "./expr.js";
import type { ResolveCtx, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import type { World } from "./world.js";
import { NULL_WORLD } from "./world.js";
import { idToken } from "./identity.js";
import type { WallSegment } from "./geometry.js";
import { hostInfoForWalls, WallGrid } from "./geometry.js";
import type { LevelStamp } from "./chrome-layout.js";
import { titleRows } from "./chrome-layout.js";
import type { ResolvedSheet, SheetFitInput } from "./sheet.js";
import { resolveSheetSpec, usablePlanMm } from "./sheet.js";
import { elevationOf, heightRangeDiagnostic, isDrawableHeight, plansAuthorHeights, STOREY_HEIGHT } from "./datum.js";
import { planTableRows } from "./sheet-tables.js";
import { effectiveVertices, polygonSelfIntersects } from "./geometry/polygon.js";
import { BUILTIN_NAMES } from "./builtins.js";
import { idSpanOf } from "./parser.js";
import { evaluateKeeps, evaluateStacked, expandKeep, type KeepSink, type StackedStorey, violationOf } from "./keep.js";
import type { KeepNode } from "./ast.js";
import { keepFormText } from "./statement-print.js";
import type {
  RInstance,
  RWall,
  RRoom,
  RFurniture,
  ROutdoor,
  ResolvedElement,
  RAxis,
  ResolvedPlan,
  ResolvedLevel,
  PlanResolution,
} from "./ir/types.js";
import type { Entry, ElementBudget } from "./ir/expand.js";
import { MAX_ELEMENTS, rootZoneFrame, Scope, expandScope, keepValueOf, stampProvenance } from "./ir/expand.js";
import type { InstanceBody, KeepState } from "./ir/side-tables.js";
import {
  datumTablesOfIr,
  instanceBodiesOfIr,
  stepsSpent,
  keepStateOfIr,
  stackedResultsOfIr,
  stackedStepsOfIr,
  stepsOf,
} from "./ir/side-tables.js";
import {
  sheetExtents,
  drawnView,
  fmtDenom,
  resolveSheet,
  scaleInRange,
  scaleOverflowDiagnostic,
  drawingOverflowDiagnostic,
} from "./ir/sheet.js";
import {
  farthest,
  outOfRange,
  checkNumberDomain,
  checkDrawnSizes,
  lineWeightOutOfRange,
  checkPlanDrawable,
  checkRoomOverlaps,
  checkFurnitureRooms,
} from "./ir/checks.js";
import type { ResolveGroup, PlacedGroup } from "./ir/groups.js";
import {
  deepestFirst,
  descendantView,
  groupEntries,
  chargeDerivedElements,
  assignIds,
  markPlacement,
  afterDemolition,
  demolishedHostDiagnostic,
  hostWallOf,
  registerOpenings,
} from "./ir/groups.js";

export type {
  RBase,
  RZone,
  RInstance,
  Opening,
  RWall,
  WallRelation,
  RelConstraint,
  RoomPlacement,
  OpeningPlacement,
  OpeningRelation,
  FurniturePlacement,
  FurnitureAuthored,
  RRoom,
  RDoor,
  WindowCorner,
  RWindow,
  ROpening,
  RFurniture,
  RDim,
  RColumn,
  RStairPiece,
  RStairFlight,
  RStair,
  RElevator,
  REscalator,
  RRoof,
  RVoid,
  ROutdoor,
  RFence,
  ResolvedElement,
  DerivedWallRow,
  RWallsFromRooms,
  RAxis,
  ResolvedPlan,
  ResolvedLevel,
  PlanResolution,
} from "./ir/types.js";
export { MAX_ELEMENTS, whileSpanKey } from "./ir/expand.js";
export type { InstanceBody } from "./ir/side-tables.js";
export { datumTablesOf, instanceBodiesOf, keepResultsOf, evaluationSteps } from "./ir/side-tables.js";
export { sheetExtents, drawnView } from "./ir/sheet.js";
export { lineWeightOutOfRange, MAX_OVERLAP_PAIRS_LISTED, checkRoomOverlaps } from "./ir/checks.js";
export { DERIVED_ELEMENTS_PER_ROOM } from "./ir/groups.js";

// Stage memo: resolution is a pure function of (ast, registry, world). The AST
// is an immutable per-parse object, so its identity token uniquely keys the
// result (collision-free, unlike a content hash). Sharing the IR is safe —
// scene-building reads it read-only.
const resolveCache = new Map<string, { ir: ResolvedPlan; diagnostics: Diagnostic[] }>();
const RESOLVE_CACHE_MAX = 32;
/** Per-level synthetic PlanNodes, memoized so the resolve memo above can hit. */
const levelPlanCache = new Map<string, PlanNode>();
/** Whole multi-storey resolutions, memoized by the same (ast, registry, world) key. */
const levelsCache = new Map<string, PlanResolution>();

/** Clear the resolve stage memo (called by `clearCache`). */
export function clearResolveCache(): void {
  resolveCache.clear();
  levelPlanCache.clear();
  levelsCache.clear();
}

/**
 * Extra, non-authored inputs to one resolution — the multi-storey seam. Both are derived
 * facts a *caller* knows and the AST cannot: which storey this pass is for, and the sheet
 * shared by every storey (a building is issued on ONE paper at ONE scale, so auto-fit
 * cannot be allowed to pick a finer scale for the smaller floor).
 */
interface ResolveExtras {
  level?: LevelStamp;
  /** How many `level` blocks the plan has: a message names the storey only when this is above 1. */
  storeyCount?: number;
  /** A pre-resolved sheet to adopt verbatim (skips deriving one + its overflow warning). */
  sheet?: ResolvedSheet;
  /**
   * This storey's floor level above the building's lowest, in mm — the sum of the
   * heights of the storeys BELOW it, which only the multi-storey caller can know because
   * it is the only thing that has seen the other storeys. Absent = `0`, the single-storey
   * plan and the ground floor of every plan.
   */
  elevation?: number;
  /**
   * Did the WHOLE plan author a height anywhere? Same reason: a `level 2 height
   * 3200` is invisible from inside level 1's synthetic plan, and the two pages must agree
   * about whether the third dimension exists. Absent = derive it from the plan at hand,
   * which is exactly right for a single-storey plan.
   */
  heightsAuthored?: boolean;
  /**
   * The evaluation steps the storeys below this one already spent (`MAX_EVAL_STEPS`,
   * `src/expr.ts`): the budget is one counter across the whole building, so a storey starts
   * where the one below it stopped. Absent = 0, the single-storey plan and the lowest storey.
   */
  stepsBefore?: number;
  /**
   * The `keep` seam (ADR 0033). `probe`: this is a `paper` plan's geometry probe, so its keeps
   * are expanded but never measured (R11). `keepsBefore`/`keepsLimited`: the keeps the storeys
   * below counted, and whether `E_KEEP_LIMIT` was raised, so the cap is the plan's. `rootKeeps`:
   * the plan's root `stacked` keeps, handed to the LAST storey's drawn pass to be expanded
   * against the plan-level bindings (R12). `keepAuthored`: record which ids were authored, for
   * the `stacked` pass. All absent on a plan with no keep.
   */
  probe?: boolean;
  keepsBefore?: number;
  keepsLimited?: boolean;
  rootKeeps?: readonly KeepNode[];
  keepAuthored?: boolean;
}

/** A value-based key for {@link ResolveExtras}, so the memo hits across calls (an
 *  identity token would miss every time — the sheet object is rebuilt per call). */
function extrasKey(extras: ResolveExtras | undefined): string {
  if (!extras) return "";
  const l = extras.level ? `L${extras.level.level}/${extras.level.name ?? ""}` : "";
  const s = extras.sheet
    ? `S${extras.sheet.size}/${extras.sheet.orientation}/${extras.sheet.denom}/${extras.sheet.auto ? 1 : 0}/${extras.sheet.fits ? 1 : 0}`
    : "";
  // The vertical datum rides in the key too — two storeys of the same shape at different
  // elevations are different resolutions, and a memo that could not tell them apart would
  // hand the upper floor the ground floor's facts.
  const h = `E${extras.elevation ?? 0}/${extras.heightsAuthored === undefined ? "-" : extras.heightsAuthored ? 1 : 0}`;
  // Where the step counter starts decides whether the storey crosses the budget, so it is
  // part of what the resolution is a function of.
  // The keep seam: absent on a plan with no keep, so its keys are what they were.
  const k = `${extras.probe ? "|P" : ""}${extras.keepsBefore ? `|K${extras.keepsBefore}${extras.keepsLimited ? "!" : ""}` : ""}${extras.rootKeeps ? `|R${extras.rootKeeps.length}` : ""}${extras.keepAuthored ? "|A" : ""}`;
  return `${l}|${s}|${h}|T${extras.stepsBefore ?? 0}${k}`;
}

export function resolve(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  // The single-storey path returns the memoized result OBJECT itself (not a copy) — the
  // stage-memo contract is identity, not just equality (`test/stage-cache.test.ts`).
  if (levelBlocks(ast).length === 0) return resolveCached(ast, registry, world);
  const { ir, diagnostics } = resolveAll(ast, registry, world);
  return { ir, diagnostics };
}

/**
 * Resolve a plan, honouring `level` blocks: one {@link ResolvedPlan} per storey.
 *
 * This is the entry point every consumer that cares about pages uses (`compile`,
 * `describe`, `lint`); {@link resolve} is the narrow historical projection of it. For a
 * plan with no `level` block it is exactly the old single resolution, memoized as before.
 *
 * For a multi-storey plan each level's body is resolved as its OWN plan — sharing the plan
 * settings, components, imports and plan-global `let`/`set`, but with per-level element
 * namespaces (so `stair` may exist on every floor and mean vertical identity, and auto-ids
 * restart per storey). Levels come back sorted ASCENDING, so the lowest is page 1.
 */
export function resolveAll(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
): PlanResolution {
  const blocks = levelBlocks(ast);
  if (blocks.length === 0) {
    const { ir, diagnostics } = resolveCached(ast, registry, world);
    return { ir, diagnostics, levels: [] };
  }
  const key = `${idToken(ast)}:${idToken(registry)}:${idToken(world)}`;
  const hit = levelsCache.get(key);
  if (hit) return hit;
  const out = resolveLevelsImpl(ast, blocks, registry, world);
  if (levelsCache.size >= RESOLVE_CACHE_MAX) {
    const oldest = levelsCache.keys().next().value;
    if (oldest !== undefined) levelsCache.delete(oldest);
  }
  levelsCache.set(key, out);
  return out;
}

/**
 * The plan's `level` blocks in DRAWING order — ascending by level number, and with a
 * duplicate number kept only once (the first block wins; the parser already reported
 * `E_LEVEL_DUP`, and resolving a second storey with the same number would emit a second
 * page claiming to be the same floor). Empty for a single-storey plan. The sort is stable
 * on source order, so it is deterministic.
 */
export function levelBlocks(ast: PlanNode): LevelNode[] {
  const out: LevelNode[] = [];
  const seen = new Set<number>();
  for (const s of ast.body) {
    if (s.kind !== "level" || seen.has(s.level)) continue;
    seen.add(s.level);
    out.push(s);
  }
  return out.sort((a, b) => a.level - b.level);
}

/**
 * The synthetic {@link PlanNode} for one storey: the plan's settings and declarations, its
 * plan-global body statements (`let`/`set`/…, which apply to every level), then the
 * level's own body. Memoized per (ast, level, dropPaper) so the resolve memo keys on a
 * stable object identity instead of a fresh clone each call.
 *
 * The parse-stage AST is never mutated (iron law): this is a shallow clone with a new
 * `body` array. `dropPaper` builds the geometry-only variant the shared-sheet pass uses —
 * the sheet affects annotation SIZES, never geometry, so measuring extents without it is
 * exact.
 */
function levelPlanFor(ast: PlanNode, block: LevelNode, dropPaper: boolean): PlanNode {
  const key = `${idToken(ast)}:${block.level}:${dropPaper ? 1 : 0}`;
  const hit = levelPlanCache.get(key);
  if (hit) return hit;
  // A root `keep` is the plan's, never copied into every storey (R12): `resolveLevelsImpl` reads it.
  const shared = ast.body.filter((s) => s.kind !== "level" && s.kind !== "keep");
  const plan: PlanNode = {
    ...ast,
    ...(dropPaper ? { paper: undefined } : {}),
    // `level <n> height <h>` folds into the synthetic plan's own `height`, so the
    // resolver reads ONE field and the fallback chain wall → level → plan → constant has
    // exactly one implementation. A storey that declares none keeps the plan's.
    ...(block.height !== undefined ? { height: block.height, heightSpan: block.heightSpan } : {}),
    body: [...shared, ...block.body],
  };
  if (levelPlanCache.size >= RESOLVE_CACHE_MAX * 4) levelPlanCache.clear();
  levelPlanCache.set(key, plan);
  return plan;
}

/** The margin-table row count one resolved storey will draw — the second thing (after the
 *  extent) a shared sheet has to be the maximum of. */
function tableRowsOf(plan: ResolvedPlan): number {
  const ir = drawnView(plan);
  return planTableRows({
    schedule: ir.schedule,
    legend: ir.legend,
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
    zones: ir.zones,
    walls: ir.walls,
    furniture: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
    outdoor: ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
    openingSchedule: ir.openingSchedule,
    elements: ir.elements,
    notes: ir.notes,
  });
}

/** The outer-wall-face extent of a resolved plan (what a sheet fit is measured on). */
function outerExtent(ir: ResolvedPlan, registry: Registry): ReturnType<typeof sheetExtents> {
  const d = drawnView(ir);
  return sheetExtents(d.elements, d.walls, d.siteBoundary, registry);
}

/**
 * Resolve every storey of a multi-storey plan.
 *
 * With a `paper` declaration this runs a first, geometry-only pass to measure the
 * BUILDING (the largest extent over all storeys) and resolve **one** sheet from it, which
 * every page then adopts: a drawing set is issued on one paper at one scale, so auto-fit
 * must not draw the smaller top floor at 1:50 while the ground floor gets 1:100. The
 * `W_SCALE_OVERFLOW` that goes with it is raised ONCE, for the building, rather than once
 * per page — hence it carries no `level`.
 */
function resolveLevelsImpl(ast: PlanNode, blocks: LevelNode[], registry: Registry, world: World): PlanResolution {
  const stampOf = (b: LevelNode): LevelStamp => ({ level: b.level, ...(b.name !== undefined ? { name: b.name } : {}) });
  const shared: Diagnostic[] = [];
  const { stacked: rootStacked, spans: rootKeepSpans } = rootKeepsOf(ast, blocks.length, shared);

  let sheet: ResolvedSheet | undefined;
  // The step budget is one counter for the whole compile, so on a `paper` plan the geometry
  // probes below and the drawn pass that follows count into the same total: the probes
  // evaluate every storey once and the drawn pass a second time, and the drawn pass starts
  // where the probes stopped. A probe that crosses the budget ends the resolution there.
  let probeSteps = 0;
  let probeKeeps: KeepState | undefined;
  if (ast.paper) {
    let w = 0;
    let h = 0;
    // The DRAWN extent is maximised over the storeys the same way the building's is: a
    // ground-floor terrace and a second-floor balcony each grow the shared page.
    let dw = 0;
    let dh = 0;
    // The tables are per-STOREY (each page draws its own rooms), but the sheet is shared —
    // so the band reserved is the DEEPEST any page will draw, exactly as the extent is the
    // largest any page occupies. Reserving the ground floor's would let a taller schedule
    // upstairs run off the paper the fit rule just approved.
    let tableRows = 0;
    // A probe that crosses the step budget is where the plan stops: it is refused with what
    // the geometry pass found (every storey up to and including the crossing; the sheet,
    // which needs every storey, is never derived), rather than evaluated again.
    const probes: { b: LevelNode; ir: ResolvedPlan; diagnostics: Diagnostic[] }[] = [];
    for (const b of blocks) {
      const probe = resolveCached(levelPlanFor(ast, b, true), registry, world, {
        level: stampOf(b),
        storeyCount: blocks.length,
        stepsBefore: probeSteps,
        probe: true,
        ...keepsBeforeOf(probeKeeps),
      });
      probeKeeps = keepStateOfIr.get(probe.ir) ?? probeKeeps;
      probes.push({ b, ...probe });
      const spent = stepsOf(probe.ir);
      if (spent.exhausted) return stoppedLevels(ast, blocks, probes, stampOf);
      probeSteps = spent.used;
      const e = outerExtent(probe.ir, registry);
      w = Math.max(w, e.building.w);
      h = Math.max(h, e.building.h);
      dw = Math.max(dw, e.drawn.w);
      dh = Math.max(dh, e.drawn.h);
      tableRows = Math.max(tableRows, tableRowsOf(probe.ir));
    }
    const fit: SheetFitInput = {
      extent: { w, h },
      autoDims: ast.autoDims !== undefined,
      // Every page carries the same rows (the LEVEL row included), so the band the fit
      // reserves is level-independent; a placeholder scale keeps it denominator-independent.
      titleRows: ast.hide?.title ? 0 : titleRows(ast.title, "1:1", stampOf(blocks[0]!)).length,
      ...(ast.hide?.scale ? { scaleBarHidden: true } : {}),
      tableRows,
    };
    sheet = resolveSheetSpec(ast.paper, scaleInRange(ast, shared), fit, { w: dw, h: dh });
    const usable = usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit);
    if (!sheet.fits) shared.push(scaleOverflowDiagnostic(ast, sheet, { w, h }, usable));
    else if (!sheet.drawingFits) shared.push(drawingOverflowDiagnostic(ast, sheet, { w: dw, h: dh }, usable));
  }

  // The vertical datum, decided ONCE for the building rather than per storey.
  //
  // `blocks` is ascending, so walking it in order means every storey's elevation is the
  // sum of the heights of the storeys already resolved below it — which is the rule, and
  // is NOT `level × storeyHeight`: `level 1 height 3600` puts level 2 at 3600 however tall
  // the floors above are. Each storey is resolved exactly once; the accumulator is what
  // makes that enough.
  //
  // `heightsAuthored` is whole-plan for a reason a per-storey answer gets wrong: a `height`
  // written on the second floor alone would otherwise switch the summary's height block on
  // for page 2 and off for page 1, and the two pages would disagree about whether the third
  // dimension exists.
  const heightsAuthored = plansAuthorHeights(ast);
  const heightsBelow: number[] = [];
  // The evaluation-step budget is one counter across the building: each storey starts where
  // the one below it stopped, and once a storey crosses it the storeys above are not
  // evaluated at all (they resolve to no elements and raise nothing).
  let steps = probeSteps;
  let stopped = false;
  let keeps: KeepState | undefined;
  // A report about a root keep is the plan's, not the storey's that happened to expand it.
  const inRootKeep = (d: Diagnostic): boolean =>
    d.span !== undefined && rootKeepSpans.some((sp) => d.span!.start >= sp.start && d.span!.end <= sp.end);
  const levels: ResolvedLevel[] = blocks.map((b, i) => {
    if (stopped) return unresolvedLevel(ast, b, stampOf(b));
    const extras: ResolveExtras = {
      level: stampOf(b),
      storeyCount: blocks.length,
      ...(sheet ? { sheet } : {}),
      elevation: elevationOf(heightsBelow),
      heightsAuthored,
      stepsBefore: steps,
      ...keepsBeforeOf(keeps),
      ...(rootStacked.length > 0 ? { keepAuthored: true } : {}),
      ...(rootStacked.length > 0 && i === blocks.length - 1 ? { rootKeeps: rootStacked } : {}),
    };
    const { ir, diagnostics } = resolveCached(levelPlanFor(ast, b, false), registry, world, extras);
    const spent = stepsOf(ir);
    steps = spent.used;
    stopped = spent.exhausted;
    keeps = keepStateOfIr.get(ir) ?? keeps;
    heightsBelow.push(ir.storeyHeight);
    return {
      level: b.level,
      ...(b.name !== undefined ? { name: b.name } : {}),
      ir,
      // Tag by copy — the cached diagnostics are shared and must never be mutated.
      diagnostics: diagnostics.map((d) => (inRootKeep(d) ? { ...d } : { ...d, level: b.level })),
    };
  });

  // The plan's `stacked` keeps, after the last storey (R12), on the same step counter: a crossing
  // here is `E_STEP_LIMIT` and leaves the plan unresolved, as any crossing does (R13).
  const planKeeps: Diagnostic[] = [];
  const records = !stopped ? keepStateOfIr.get(levels[levels.length - 1]!.ir)?.stacked : undefined;
  if (records) {
    const storeys: StackedStorey[] = levels.map((l) => ({
      level: l.level,
      ir: l.ir,
      authored: keepStateOfIr.get(l.ir)?.authored ?? (() => false),
    }));
    const run = withStepMeter(steps, () =>
      evaluateStacked(records, storeys, (d) => {
        chargeSteps(DIAGNOSTIC_STEPS);
        planKeeps.push(d);
      }),
    );
    if ("value" in run) {
      for (const r of run.value) if (r.grade === "hard" && !r.holds) planKeeps.push(violationOf(r));
      stackedResultsOfIr.set(levels[0]!.ir, run.value);
      stackedStepsOfIr.set(levels[0]!.ir, run.used);
    } else {
      planKeeps.push(stepLimitDiagnostic(run.signal));
      stopped = true;
      for (let i = 0; i < levels.length; i++) {
        const ir = unresolvedPlan(levelPlanFor(ast, blocks[i]!, false), { level: stampOf(blocks[i]!) });
        stepsSpent.set(ir, { used: run.used, exhausted: true });
        levels[i] = { ...levels[i]!, ir };
      }
    }
  }

  // Once per PLAN, not per page: the theme's pen (the drawing budget is the pipeline's).
  // It does not run on a plan the step budget stopped (its storeys hold no elements).
  const planWide: Diagnostic[] = [];
  if (!stopped) {
    const lw = ast.theme?.lineWeight;
    if (lw !== undefined) {
      const pen = lineWeightOutOfRange(levels, lw, ast.lineWeightSpan, registry);
      if (pen) planWide.push(pen);
    }
    const grid = axesDiffer(levels, ast);
    if (grid) planWide.push(grid);
  }

  return {
    ir: levels[0]!.ir,
    diagnostics: [
      ...shared,
      ...oncePerPlan(
        levels.map((l) => l.diagnostics),
        ast,
      ),
      ...planKeeps,
      ...planWide,
    ],
    levels,
  };
}

/**
 * `W_AXES_DIFFER`, when the one `axes` block came out as two grids. Each storey evaluates it, and
 * a `let` inside a `level` is in that storey's bindings, so `keep on axis` could hold on both
 * storeys with the walls apart. Uncharged: the comparison reads what evaluating the block paid for,
 * and a plan that writes no `axes` does none of it.
 */
function axesDiffer(levels: readonly ResolvedLevel[], ast: PlanNode): Diagnostic | undefined {
  const block = ast.axes?.span;
  if (!ast.axes) return undefined;
  // A storey whose block failed has reported that, and what it left is no grid to compare.
  const failed = (d: Diagnostic): boolean =>
    d.severity === "error" &&
    block !== undefined &&
    d.file === undefined &&
    d.span !== undefined &&
    d.span.start >= block.start &&
    d.span.end <= block.end;
  if (levels.some((l) => l.diagnostics.some(failed))) return undefined;
  const first = levels[0]!;
  const a = first.ir.axes ?? [];
  const other = levels.find((l) => {
    const b = l.ir.axes ?? [];
    return b.length !== a.length || b.some((x, i) => x.axis !== a[i]!.axis || x.pos !== a[i]!.pos);
  });
  if (!other) return undefined;
  return {
    severity: "warning",
    code: "W_AXES_DIFFER",
    message: `The plan's \`axes\` come out differently on level ${fmt3(other.level)} and on level ${fmt3(first.level)}, so the storeys do not share one grid`,
    ...(ast.axes.span ? { span: ast.axes.span } : {}),
    hints: ["a `let` inside a `level` reaches the block: move it to the plan, so every storey reads one value"],
  };
}

/** The keep cap's state the storeys below handed on (absent when nothing was counted). */
function keepsBeforeOf(k: KeepState | undefined): Pick<ResolveExtras, "keepsBefore" | "keepsLimited"> {
  if (!k || k.count === 0) return {};
  return { keepsBefore: k.count, ...(k.limited ? { keepsLimited: true } : {}) };
}

/**
 * The root keeps of a multi-storey plan (R12): a `stacked` keep is the plan's, measured after the
 * last storey; any other form there is refused once, with no level (`E_KEEP_PLACEMENT`), and so is
 * a `stacked` keep on a plan of one storey. Returns the accepted `stacked` keeps and every root
 * keep's span.
 */
function rootKeepsOf(ast: PlanNode, storeys: number, out: Diagnostic[]): { stacked: KeepNode[]; spans: Span[] } {
  const stacked: KeepNode[] = [];
  const spans: Span[] = [];
  for (const s of ast.body) {
    if (s.kind !== "keep") continue;
    if (s.span) spans.push(s.span);
    const refuse = (message: string, hint: string): void => {
      out.push({
        severity: "error",
        code: "E_KEEP_PLACEMENT",
        message,
        ...(s.span ? { span: s.span } : {}),
        hints: [hint],
      });
    };
    if (s.form !== "stacked") {
      refuse(
        "A keep at the root of a multi-storey plan measures no storey: it sits inside the level it measures",
        `move \`keep ${keepFormText(s)}\` into the \`level\` block whose plan it reads`,
      );
    } else if (storeys < 2) {
      refuse(
        "A stacked keep compares storeys, and this plan has one",
        `\`keep ${keepFormText(s)}\` needs two or more \`level\` blocks`,
      );
    } else stacked.push(s);
  }
  return { stacked, spans };
}

/** A storey left unevaluated because a storey below it crossed the step budget. */
function unresolvedLevel(ast: PlanNode, b: LevelNode, stamp: LevelStamp): ResolvedLevel {
  return {
    level: b.level,
    ...(b.name !== undefined ? { name: b.name } : {}),
    ir: unresolvedPlan(levelPlanFor(ast, b, false), { level: stamp }),
    diagnostics: [],
  };
}

/**
 * The resolution of a multi-storey plan whose geometry pass (the shared-sheet probes)
 * crossed the step budget: the probed storeys as they resolved, up to and including the one
 * that crossed it, and the storeys above it unevaluated.
 */
function stoppedLevels(
  ast: PlanNode,
  blocks: readonly LevelNode[],
  probes: readonly { b: LevelNode; ir: ResolvedPlan; diagnostics: Diagnostic[] }[],
  stampOf: (b: LevelNode) => LevelStamp,
): PlanResolution {
  const levels: ResolvedLevel[] = blocks.map((b, i) => {
    const p = probes[i];
    if (!p) return unresolvedLevel(ast, b, stampOf(b));
    return {
      level: b.level,
      ...(b.name !== undefined ? { name: b.name } : {}),
      ir: p.ir,
      diagnostics: p.diagnostics.map((d) => ({ ...d, level: b.level })),
    };
  });
  return {
    ir: levels[0]!.ir,
    diagnostics: oncePerPlan(
      levels.map((l) => l.diagnostics),
      ast,
    ),
    levels,
  };
}

/**
 * The spans of the plan-level SETTINGS a storey evaluates on its own behalf: the `axes`
 * block, the `site` block and the plan `height`. A report inside one of them is about the
 * plan, whichever storey raised it. (`north`, `grid` and a `paper` scale are reported by the
 * parser or the shared sheet, once already; a theme `lineWeight` once by
 * {@link lineWeightOutOfRange}.)
 */
function planSettingSpans(ast: PlanNode): Span[] {
  const spans: Span[] = [];
  if (ast.axes?.span) spans.push(ast.axes.span);
  if (ast.site?.span) spans.push(ast.site.span);
  if (ast.heightSpan) spans.push(ast.heightSpan);
  return spans;
}

/**
 * The storeys' diagnostics in drawing order, with a report raised INSIDE a plan-level
 * setting (see {@link planSettingSpans}) kept once, untagged, where it first appears: every
 * storey evaluates the same setting against the same plan-level bindings, so it is one fact
 * about the plan, not one per page. Everything else keeps one report per storey with its
 * level, including a statement written once and expanded on several storeys (a component
 * placed on two floors is two placements, each reported on its own floor).
 */
function oncePerPlan(perStorey: readonly Diagnostic[][], ast: PlanNode): Diagnostic[] {
  const all = perStorey.flat();
  const settings = planSettingSpans(ast);
  if (perStorey.length < 2 || settings.length === 0) return all;
  const inSetting = (d: Diagnostic): boolean =>
    d.file === undefined &&
    d.span !== undefined &&
    settings.some((s) => d.span!.start >= s.start && d.span!.end <= s.end);
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of all) {
    if (!inSetting(d)) {
      out.push(d);
      continue;
    }
    const { level: _level, ...plan } = d;
    const k = JSON.stringify(plan);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(plan);
  }
  return out;
}

/** The memoized single-plan resolution (the historical `resolve`). */
function resolveCached(
  ast: PlanNode,
  registry: Registry,
  world: World,
  extras?: ResolveExtras,
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const key = `${idToken(ast)}:${idToken(registry)}:${idToken(world)}:${extrasKey(extras)}`;
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const out = resolveImpl(ast, registry, world, extras);
  if (resolveCache.size >= RESOLVE_CACHE_MAX) {
    const oldest = resolveCache.keys().next().value;
    if (oldest !== undefined) resolveCache.delete(oldest);
  }
  resolveCache.set(key, out);
  return out;
}

/**
 * One resolution under the evaluation-step budget. Past the budget the resolution stops
 * where it is: the diagnostics raised so far are kept, `E_STEP_LIMIT` is added at the
 * statement that crossed it, and the plan resolves to no elements (an error draws nothing,
 * and `describe()`/`lint()` stop at it), so nothing downstream works on a half-evaluated body.
 */
function resolveImpl(
  ast: PlanNode,
  registry: Registry = BUILTIN_REGISTRY,
  world: World = NULL_WORLD,
  extras: ResolveExtras = {},
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  // Until a group's datum table is frozen, a room-edge datum is read before any room is
  // placed: the expansion and the plan settings refuse it (ADR 0028 §2, `resolveGroup`).
  const run = withStepMeter(extras.stepsBefore ?? 0, () =>
    withDatumReader(
      beforeRoomsReader("expand"),
      () => resolveBody(ast, registry, world, extras, diagnostics),
      functionBodyReader,
    ),
  );
  if ("value" in run) {
    stepsSpent.set(run.value.ir, { used: run.used, exhausted: false });
    return run.value;
  }
  diagnostics.push(stepLimitDiagnostic(run.signal));
  const ir = unresolvedPlan(ast, extras);
  stepsSpent.set(ir, { used: run.used, exhausted: true });
  return { ir, diagnostics };
}

/** The one `E_STEP_LIMIT`, at the statement that crossed the budget. */
function stepLimitDiagnostic(signal: StepLimitSignal): Diagnostic {
  const at = signal.at;
  return stampProvenance(
    {
      severity: "error",
      message:
        `Evaluation stopped after ${MAX_EVAL_STEPS} steps — the plan does more work than any plan needs ` +
        "(a loop nested in a loop, recursion that branches, a string that doubles, a polygon of thousands of vertices, " +
        "or many polygon or round rooms whose boxes overlap?)",
      code: "E_STEP_LIMIT",
      ...(at.span ? { span: at.span } : {}),
    },
    at.frame as Frame | undefined,
    at.file,
  );
}

/**
 * The plan a resolution that was stopped returns: its settings and no elements. It is never
 * drawn (it comes with an error) and `describe()`/`lint()` stop at the error, so it only has
 * to be a well-formed {@link ResolvedPlan}.
 */
function unresolvedPlan(ast: PlanNode, extras: ResolveExtras): ResolvedPlan {
  return {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    scale: ast.scale,
    north: ast.north,
    autoDims: ast.autoDims,
    ...(extras.level ? { level: extras.level.level } : {}),
    ...(extras.level?.name !== undefined ? { levelName: extras.level.name } : {}),
    title: ast.title,
    accTitle: ast.accTitle,
    accDescr: ast.accDescr,
    theme: ast.theme,
    themeBase: ast.themeBase,
    themeFrom: ast.themeFrom,
    styles: ast.styles,
    storeyHeight: STOREY_HEIGHT,
    elevation: extras.elevation ?? 0,
    _heightsAuthored: extras.heightsAuthored ?? plansAuthorHeights(ast),
    elements: [],
    walls: [],
  };
}

function resolveBody(
  ast: PlanNode,
  registry: Registry,
  world: World,
  extras: ResolveExtras,
  diagnostics: Diagnostic[],
): { ir: ResolvedPlan; diagnostics: Diagnostic[] } {
  const g = ast.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  // 0. Expand body (lets, assignments, instances, control flow) into a flat
  //    element stream. Built-ins live in a scope ABOVE the plan's globals, so a
  //    user `let` of the same name shadows them without an E_REDEF.
  const builtinScope = new Scope();
  for (const name of BUILTIN_NAMES) builtinScope.vars.set(name, { t: "builtin", name });
  const globalScope = new Scope(builtinScope);
  // The zone frame is created here and filled during expansion: `zoneFrame.declared` ends
  // up holding every `zone` the plan declares — and every `place`d instance, which is
  // implicitly one — in first-declaration order.
  const zoneFrame = rootZoneFrame();
  const executedWhiles = new Set<string>();
  const budget: ElementBudget = { count: 0, capped: false };
  const keepSink: KeepSink = { list: [], count: extras.keepsBefore ?? 0, limited: extras.keepsLimited === true };
  const entries = expandScope(
    ast.body,
    globalScope,
    globalScope,
    ast.components,
    diagnostics,
    0,
    {
      snap,
      seenInstances: new Set<string>(),
      executedWhiles,
      budget,
      modules: { builtins: builtinScope, envs: new Map() },
      keeps: keepSink,
      keepPlace: extras.level !== undefined ? "storey" : "plan",
    },
    zoneFrame,
  );
  // The plan's root `stacked` keeps, on the last storey only: expanded against the plan-level
  // bindings, measured after the last storey (`resolveLevelsImpl`, R12).
  const stackedSink: KeepSink = { list: [], count: keepSink.count, limited: keepSink.limited };
  for (const k of extras.rootKeeps ?? []) {
    stepSite(k.span);
    chargeSteps(1);
    const diagRoot = (d: Diagnostic): void => {
      chargeSteps(DIAGNOSTIC_STEPS);
      diagnostics.push(d);
    };
    expandKeep(k, "root", (e) => keepValueOf(e, () => globalScope.flatten(), diagRoot), diagRoot, stackedSink);
  }

  // 1. Partition the flat stream into RESOLUTION GROUPS: one per `place`d instance, plus
  //    the root plan. A plan with no `place` has exactly one group (the root) holding
  //    every entry — including every legacy bare component call — so everything below is
  //    the historical single pass, byte for byte.
  const groups = groupEntries(entries);
  /** What each wall-deriving statement was charged at expansion (`ctx.elementBudget`). */
  const precharged = chargeDerivedElements(entries, groups, registry, budget, diagnostics);

  // 2. Assign ids PER GROUP, so an instance's auto-id counters restart at 1 and two
  //    instances of one component get order-independent ids (`west.wall_1` / `east.wall_1`
  //    rather than `wall_1` / `wall_4`). Ids inside a group stay unprefixed until the
  //    group is transformed, which is what lets an intra-instance reference (`door on
  //    perimeter`) resolve against the instance's own namespace.
  for (const grp of groups) assignIds(grp.entries, registry, diagnostics);

  // 3. Resolve each group — rooms and their relational placement first, then the frozen
  //    datum table, then walls, then the openings that host against them and the rest in
  //    registry order (ADR 0028 §1, `resolveGroup`) — then transform the instance groups
  //    into plan coordinates.
  //
  //    A `place`d instance is a CLOSED WORLD going out: it resolves entirely in its own
  //    local frame, and one rigid transform then carries the result into the plan. That is
  //    what makes every derived-geometry rule (`anchor top-left`, `against wall … side`,
  //    `swing into`, `right-of`) mean inside a rotated instance exactly what it means when
  //    the component is authored on its own — see `frame.ts`.
  //
  //    Every level reaches INTO its descendants the same way: the root plan resolves LAST
  //    and sees every instance's walls and rooms under their namespaced ids (`door on
  //    west.perimeter`, `furniture … in west.main`), and an instance resolves after all of
  //    its descendants and sees theirs, carried into its own local frame and named relative
  //    to it — exactly what its body would see compiled as the plan. So placing a plan is
  //    associative. None reaches OUT: an instance never sees its parent's or its siblings'
  //    elements, so a component cannot reference anything outside itself (ADR 0016 §3).
  const walls: RWall[] = [];
  const rooms2: RRoom[] = [];
  const instances: RInstance[] = [];
  /** Entries a `place` could not carry into plan coordinates — excluded from `elements`. */
  const dropped = new Set<Entry>();
  let activeEnv: Env = new Map();
  /** The entry being resolved — the provenance every diagnostic below inherits. */
  let activeEntry: Entry | undefined;
  /** Where resolution diagnostics go: the plan's list, or an instance group's buffer. */
  let diagSink: Diagnostic[] = diagnostics;
  /** The entry each resolve-time diagnostic is ABOUT, so the number-domain check can drop
   *  every other diagnostic of an element it drops (one report per element). Keyed by the
   *  object pushed, which is the object that reaches `diagnostics`. */
  const ownerOf = new Map<Diagnostic, Entry>();
  /** The entry a resolved element (local, or carried into plan coordinates) came from. */
  const entryOf = new Map<ResolvedElement, Entry>();
  const pushDiag = (d: Diagnostic): void => {
    chargeSteps(DIAGNOSTIC_STEPS);
    const out = activeEntry ? stampProvenance(d, activeEntry.frame, activeEntry.file) : d;
    diagSink.push(out);
    if (activeEntry) ownerOf.set(out, activeEntry);
  };
  /** Record a relational-placement diagnostic, owned by the room it is about. */
  const ownRoomDiag = (d: Diagnostic, room: RRoom | undefined): void => {
    const e = room ? entryOf.get(room) : undefined;
    if (e) ownerOf.set(d, e);
  };
  const evalNum = (e: Expr): number => asNum(evalExpr(e, activeEnv, pushDiag), pushDiag, exprSpan(e));
  const evalStr = (e: Expr): string => asStr(evalExpr(e, activeEnv, pushDiag));
  const evalPt = (p: ExprPoint): Point => ({ x: evalNum(p.x), y: evalNum(p.y) });
  // Openings call isOnWall(at, ref) then hostSegment(at, ref) with identical
  // args back-to-back; a one-entry memo fuses those into a single wall scan.
  // ctx.walls is fully populated before any opening resolves (registry order:
  // walls first), so the spatial index is built lazily on first use and reused.
  // Both are reset when the pass moves to the next group's wall set.
  let wallGrid: WallGrid | null = null;
  let hiKey = "";
  let hiVal: { host: WallSegment | null; onWall: boolean } | null = null;

  // ---- the vertical datum ------------------------------------------------
  // This storey's floor-to-floor height, resolved BEFORE any element so every wall can
  // inherit it. The expression is evaluated against the plan's GLOBAL bindings — it is a
  // plan setting, not a body statement, so it sees every plan-level `let` wherever that
  // sits in the file — exactly as the `axes` block and the lot line are.
  //
  // `levelPlanFor` has already folded a `level <n> height <h>` into `ast.height` for the
  // storey being resolved, so there is one place to read and one chain to get wrong.
  //
  // It is NOT grid-snapped. `grid` snaps plan coordinates so rooms line up with each
  // other; a height shares no axis with them, and snapping `height 2850` onto a 100 mm
  // grid would silently redraw a section nobody asked for.
  let storeyHeight = STOREY_HEIGHT;
  if (ast.height !== undefined) {
    stepSite(ast.heightSpan);
    activeEnv = globalScope.flatten();
    const h = evalNum(ast.height);
    if (isDrawableHeight(h)) storeyHeight = h;
    else diagnostics.push(heightRangeDiagnostic("The plan", "height", h, ast.heightSpan));
  }

  const ctx: ResolveCtx = {
    grid: g,
    snap,
    snapPt,
    eval: evalNum,
    evalStr,
    evalPt,
    id: "",
    storeyHeight,
    walls,
    rooms: rooms2,
    hostSegment: (at, ref) => hostInfo(at, ref).host,
    // A deriving statement's real walls, beyond its expansion pre-charge (B1, ADR 0028 §3).
    elementBudget: (n) => {
      const e = activeEntry;
      const pre = e ? (precharged.get(e) ?? 0) : 0;
      if (n <= pre) return true;
      if (e) precharged.set(e, n);
      budget.count += n - pre;
      return budget.count <= MAX_ELEMENTS;
    },
    isOnWall: (at, ref) => hostInfo(at, ref).onWall,
    ...(world.now ? { now: () => world.now!() } : {}),
    diag: pushDiag,
  };
  function hostInfo(at: Point, ref?: string): { host: WallSegment | null; onWall: boolean } {
    const key = `${at.x},${at.y},${ref ?? ""}`;
    if (key === hiKey && hiVal) return hiVal;
    if (!wallGrid) wallGrid = new WallGrid(ctx.walls);
    hiKey = key;
    hiVal = wallGrid.hostInfo(at, ref);
    return hiVal;
  }

  /**
   * Resolve one group's entries against `grpWalls`/`grpRooms`, which the group's own walls
   * and rooms are appended to as they resolve (ADR 0028 §1):
   *
   *   1. every ROOM, then relational placement over `relational.rooms()` (ADR 0004), so
   *      every room the group can see has its final position;
   *   2. the group's DATUM TABLE, built from those rooms (and the plan's `axes`, root only)
   *      and frozen, before any wall resolves;
   *   3. every other kind in registry order: walls, then the openings against the final
   *      wall set, then the rest.
   *
   * Ids were assigned before this (step 2), so the registry order of ids is unchanged.
   * Diagnostics are BUFFERED per kind and flushed in registry order, then the relational
   * placement ones: the order one pass in registry order (walls first, placement after the
   * pass) produced, so `compile().diagnostics` does not move. A resolution stopped by
   * `E_STEP_LIMIT` still flushes what was raised before the crossing.
   */
  /**
   * How a group's datums read beyond its table (ADR 0028 §2): compass words alias the frame
   * words only in the root group of a plan whose `north` is `up`, and a dotted path that is
   * also an element id inside an instance the group sees is refused. That id set is built
   * the first time a datum is read in the group, charged one step per element first.
   */
  const datumOpts = (grp: ResolveGroup): TableReaderOpts => {
    const north = ast.north;
    const compassWhy = grp.frame
      ? `inside the placed component "${grp.frame.component}" a datum names the component's own frame, not the compass`
      : typeof north === "object"
        ? `the plan's \`north\` is a bearing of ${fmt3(north.deg)} degrees`
        : `the plan's \`north\` is \`${north}\``;
    let ids: Set<string> | undefined;
    return {
      instance: grp.frame !== undefined,
      compassAliases: grp.frame === undefined && north === "up",
      compassWhy,
      instanceIds: () => {
        if (ids) return ids;
        const base = grp.frame?.prefix;
        const seen = groups.filter(
          (d) => d.frame !== undefined && d !== grp && (base === undefined || d.frame.prefix.startsWith(`${base}.`)),
        );
        let n = 0;
        for (const d of seen) n += d.entries.length;
        chargeSteps(n);
        ids = new Set<string>();
        for (const d of seen) {
          const rel = base === undefined ? d.frame!.prefix : d.frame!.prefix.slice(base.length + 1);
          for (const e of d.entries) ids.add(`${rel}.${e.id}`);
        }
        return ids;
      },
    };
  };

  const resolveGroup = (
    grp: ResolveGroup,
    grpWalls: RWall[],
    grpRooms: RRoom[],
    relational: { rooms: () => RRoom[]; stamp: (d: Diagnostic) => Diagnostic },
    axes: readonly RAxis[] | undefined,
    /** The ids of the walls this group sees that a pairwise form refused (no points), as the
     *  group names them; its own refused walls join as they resolve. */
    refusedWalls: Set<string>,
  ): DatumTable => {
    ctx.walls = grpWalls;
    ctx.unplacedWall = (ref) => refusedWalls.has(ref);
    ctx.rooms = grpRooms;
    delete ctx.datums;
    // The group's OWN elements resolved so far, in source order (never a descendant's).
    ctx.group = () => {
      chargeSteps(grp.entries.length + 1);
      const own: ResolvedElement[] = [];
      for (const e of grp.entries) if (e.resolved !== undefined) own.push(e.resolved);
      return own;
    };
    wallGrid = null;
    hiKey = "";
    hiVal = null;
    const order = registry.order;
    const byKind: Diagnostic[][] = order.map(() => []);
    const placement: Diagnostic[] = [];
    /** The entry each kind's pass ended on, so the step site is left where one pass in
     *  registry order leaves it (the statement a later crossing is reported at). */
    const lastOf: (Entry | undefined)[] = order.map(() => undefined);
    const sink = diagSink;
    const resolveKind = (i: number): void => {
      const def = order[i]!;
      diagSink = byKind[i]!;
      for (const e of grp.entries) {
        if (e.node.kind !== def.kind) continue;
        lastOf[i] = e;
        activeEnv = e.env;
        activeEntry = e;
        stepSite(e.node.span, e.file, e.frame);
        ctx.id = e.id;
        ctx.defaults = e.defaults;
        const r = def.resolve(e.node, ctx);
        e.resolved = r;
        entryOf.set(r, e);
        markPlacement(r, e.node, e.fromStrip === true);
        // Declared zone membership — a `zone` block the element was written inside, or
        // the `place`d instance that expanded it (an instance IS a zone). Set only when
        // there is one, so an unzoned plan's IR carries no new key at all.
        if (e.zone !== undefined) r._zone = e.zone;
        // Which FILE this element's span is measured in. Resolve-time diagnostics get it
        // from `stampProvenance` above; carrying it onto the element is what lets the
        // POST-resolve consumers (lint) stamp it too, instead of minting fixes that
        // `applyFixes` then splices into the wrong source. Set only when there is one, so
        // an import-free plan's IR carries no new key at all.
        if (e.file !== undefined) r._file = e.file;
        if (r.kind === "wall") {
          r._idAuthored = e.idAuthored === true;
          // A pairwise wall the rooms refused (ADR 0028 §4) has no points: no body to draw or
          // host. Its id is recorded, so a reference to it names the refusal.
          if (r.points.length > 0) grpWalls.push(r);
          else refusedWalls.add(r.id);
        } else if (r.kind === "room") {
          r._idAuthored = e.idAuthored === true;
          grpRooms.push(r);
        } else if (r.kind === "furniture") {
          // Only when authored, so a plan's IR gains no key: lint's seat hint (ADR 0029 §6)
          // names a piece by id only when the author gave it one.
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (r.kind === "door") {
          // The same, for `W_LEAF_ACROSS_DOORWAY`'s hints (plan-soundness PS2.11d).
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (r.kind === "window") {
          // The same, for `W_HOB_UNDER_WINDOW`'s hint (plan-soundness PS2.46).
          if (e.idAuthored === true) r._idAuthored = true;
        } else if (def.yieldsWalls) {
          // Derived walls join the group's wall list at once, before any opening resolves
          // (ADR 0028 §3); they carry the statement's zone and file, never an authored id.
          const kids = def.yieldsWalls(r);
          for (const w of kids) {
            if (e.zone !== undefined) w._zone = e.zone;
            if (e.file !== undefined) w._file = e.file;
            grpWalls.push(w);
          }
          if (kids.length > 0) {
            wallGrid = null;
            hiKey = "";
            hiVal = null;
          }
        }
      }
    };
    const roomKind = order.findIndex((d) => d.kind === "room");
    // The registry order of every pass after the rooms. A group that holds a wall-deriving
    // statement (`ElementDef.yieldsWalls`, `walls from rooms`) resolves the kinds it reads
    // first (`dependsOn`), then the authored walls, then the statement, then the rest; a
    // group without one keeps the plain registry order.
    const derivers = order.flatMap((d, i) =>
      d.yieldsWalls && grp.entries.some((e) => e.node.kind === d.kind) ? [i] : [],
    );
    const early: number[] = [];
    for (const i of derivers) {
      for (const k of order[i]!.dependsOn ?? []) {
        const j = order.findIndex((d) => d.kind === k);
        if (j >= 0 && j !== roomKind && !early.includes(j) && !derivers.includes(j)) early.push(j);
      }
    }
    early.sort((a, b) => a - b);
    const wallKind = order.findIndex((d) => d.kind === "wall");
    const first =
      derivers.length === 0
        ? []
        : [...early, ...(wallKind >= 0 && !early.includes(wallKind) ? [wallKind] : []), ...derivers];
    const passes = [...first, ...order.map((_, i) => i).filter((i) => i !== roomKind && !first.includes(i))];
    /** After the authored walls, in a deriving group: an authored wall may not take an id the
     *  derived walls are given there (`ElementDef.reservedIds`, `E_WALL_ID_RESERVED`), so a wall
     *  id keeps naming one wall (the host a hint names, `hostWallId`). Reported with the walls. */
    const refuseReservedIds = (): void => {
      const reserved = new Set(derivers.flatMap((i) => order[i]!.reservedIds ?? []));
      if (reserved.size === 0) return;
      for (const e of grp.entries) {
        if (e.node.kind !== "wall" || e.idAuthored !== true || !reserved.has(e.id)) continue;
        activeEntry = e;
        pushDiag({
          severity: "error",
          message: `\`${e.id}\` is the name of the ring \`walls from rooms\` derives here, so an authored wall cannot take it; rename the wall`,
          code: "E_WALL_ID_RESERVED",
          span: idSpanOf(e.node) ?? e.node.span,
        });
      }
      activeEntry = undefined;
    };
    /** After every pass: let each deriver judge the group it derived in (`auditGroup`). */
    const auditDerivers = (): void => {
      for (const i of derivers) {
        const def = order[i]!;
        if (!def.auditGroup) continue;
        diagSink = byKind[i]!;
        const own: ResolvedElement[] = [];
        for (const e of grp.entries) if (e.resolved !== undefined) own.push(e.resolved);
        chargeSteps(own.length + 1);
        for (const e of grp.entries) {
          if (e.node.kind !== def.kind || !e.resolved) continue;
          activeEntry = e;
          def.auditGroup(e.resolved, own, pushDiag);
        }
        activeEntry = undefined;
      }
    };
    /** After every pass: let each kind that reads its group settle (`ElementDef.settle`, ADR
     *  0029 §3). It charges its own steps, and only for an element that needs it, so a group
     *  with nothing to settle meters exactly what it did before. */
    const settleKinds = (): void => {
      let own: ResolvedElement[] | undefined;
      for (let i = 0; i < order.length; i++) {
        const def = order[i]!;
        if (!def.settle) continue;
        for (const e of grp.entries) {
          if (e.node.kind !== def.kind || !e.resolved) continue;
          if (own === undefined) {
            own = [];
            for (const x of grp.entries) if (x.resolved !== undefined) own.push(x.resolved);
          }
          diagSink = byKind[i]!;
          activeEntry = e;
          def.settle(e.resolved, own, pushDiag);
        }
        activeEntry = undefined;
      }
    };
    /** After the derivers: let each early kind refresh what it read off the walls. */
    const rewall = (): void => {
      for (const j of early) {
        const def = order[j]!;
        if (!def.rewall) continue;
        for (const e of grp.entries) if (e.node.kind === def.kind && e.resolved) def.rewall(e.resolved, grpWalls);
      }
    };
    let table: DatumTable;
    try {
      // The room pass reads no datum: the table it would read does not exist yet.
      const axisScope = { axes: axes ?? [], instance: grp.frame !== undefined };
      withDatumReader(beforeRoomsReader("rooms", axisScope), () => {
        if (roomKind >= 0) resolveKind(roomKind);
        activeEntry = undefined;
        placeRelational(relational.rooms(), snapPt, (d, room) => {
          const out = relational.stamp(d);
          placement.push(out);
          ownRoomDiag(out, room);
        });
      });
      const frozen = buildDatumTable(grpRooms, axes);
      table = frozen;
      const opts = datumOpts(grp);
      const reader = tableReader(frozen, opts);
      // A relational opening reads the same table through the same reader (ADR 0028 §5).
      ctx.datums = {
        table: frozen,
        compass: { aliases: opts.compassAliases, why: opts.compassWhy },
        read: (name, span, reword) => {
          let refused = false;
          const v = reader(name, span, (d) => {
            refused = true;
            pushDiag(reword ? reword(d) : d);
          });
          return v === undefined ? undefined : refused ? null : v.t === "num" ? v.v : null;
        },
      };
      // Every later statement reads the frozen table (ADR 0028 §2).
      withDatumReader(reader, () => {
        for (const i of passes) {
          resolveKind(i);
          if (i === wallKind && derivers.length > 0) refuseReservedIds();
          if (i === derivers[derivers.length - 1]) rewall();
        }
        auditDerivers();
        settleKinds();
      });
    } finally {
      diagSink = sink;
      for (const list of byKind) for (const d of list) sink.push(d);
      for (const d of placement) sink.push(d);
      activeEntry = undefined;
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const e = lastOf[i];
      if (e === undefined) continue;
      stepSite(e.node.span, e.file, e.frame);
      break;
    }
    return table;
  };

  // 3(i). The instance groups, DEEPEST FIRST, so every descendant of a group has resolved
  //      before the group does. Each group's effects are held in `placed` and committed
  //      below in the original group order, so the plan-wide wall/room arrays, `instances`
  //      and the diagnostic order are exactly what one pass in that order produces.
  const placed = new Map<ResolveGroup, PlacedGroup>();
  /** The ids of the instances' refused pairwise walls, as the root names them (`west.p`). */
  const rootRefusedWalls = new Set<string>();
  /** Each group's frozen datum table, by instance prefix (`""` is the root plan). */
  const datumTables = new Map<string, DatumTable>();
  for (const grp of deepestFirst(groups)) {
    const f = grp.frame!;
    const buffer: Diagnostic[] = [];
    diagSink = buffer;
    // What this instance can reach: its descendants' walls and rooms, carried into its
    // local frame, BEFORE its own — the order the plan-wide arrays hold instances and root
    // in. Every search by position or category (a door hosted by position or by `wall
    // exterior`, `against wall <category>`, a `dim` projection, a wall's height, a rail)
    // reads this array in this order, so it breaks a tie here exactly as it breaks it at
    // the root: the nearest-wall host is first-wins, so a coincident descendant wall wins.
    const view = descendantView(grp, groups, placed, registry);
    // The instance's own relational placement runs inside `resolveGroup`, after its rooms
    // and before its walls, in the LOCAL frame, because `right-of` means the COMPONENT's
    // right — resolving it after the transform would read the page's right instead (ADR
    // 0004 arithmetic, one frame at a time). A descendant's room is a reference only: it
    // carries no `_rel` once transformed. An instance has no `axes` of its own.
    const table = resolveGroup(
      grp,
      view.walls,
      view.rooms,
      { rooms: () => view.rooms, stamp: (d) => stampProvenance(d, grp.frame, undefined) },
      undefined,
      new Set(view.refusedWalls),
    );
    datumTables.set(f.prefix, table);
    const locals = grp.entries.map((e) => e.resolved!);
    const carried: ResolvedElement[] = [];
    // Kinds already refused in THIS instance: a component with ten plugin elements of one
    // kind is one fact, reported once per (instance, kind).
    const refusedKinds = new Set<string>();
    for (const e of grp.entries) {
      const local = e.resolved!;
      const t = tryTransformElement(f, local, registry.byKind.get(local.kind));
      if (typeof t === "string") {
        // A plugin kind whose `ElementDef` has no `transform()` (or a plugin replacing a
        // built-in kind whose inherited built-in `transform()` threw on the plugin's own
        // resolved shape): the frame cannot carry it, and drawing it at its LOCAL
        // coordinates would put it somewhere the author never wrote. So it is dropped from
        // the drawing and reported at the `place`.
        dropped.add(e);
        if (!refusedKinds.has(local.kind)) {
          refusedKinds.add(local.kind);
          const refusal = stampProvenance(
            {
              severity: "error",
              message:
                t === "none"
                  ? `Element kind "${local.kind}" in component "${f.component}" cannot be placed: its plugin ElementDef has no transform()`
                  : `Element kind "${local.kind}" in component "${f.component}" cannot be placed: its plugin ElementDef has no transform(), and the built-in "${local.kind}" transform() it inherits could not read the plugin's resolved shape — the plugin must define its own transform()`,
              code: "E_INSTANCE_NO_TRANSFORM",
              span: f.span,
            },
            f,
            f.file,
          );
          // The primary span IS the `place` statement, so the "placed here" related span
          // `stampProvenance` appends would only repeat it. Dropped for this code alone:
          // every other placed diagnostic points INTO the instance and keeps its pointer out.
          const extra = refusal.relatedSpans?.filter(
            (r) => r.span.start !== f.span?.start || r.span.end !== f.span?.end,
          );
          if (extra?.length) refusal.relatedSpans = extra;
          else delete refusal.relatedSpans;
          diagSink.push(refusal);
        }
        continue;
      }
      e.resolved = t;
      entryOf.set(t, e);
      carried.push(t);
    }
    placed.set(grp, { diagnostics: buffer, local: locals, carried });
  }
  diagSink = diagnostics;

  // 3(ii). Commit the instance groups in the original order, then resolve the root plan
  //        against the plan-wide arrays, which by then carry every instance.
  const instanceBodies = new Map<string, InstanceBody>();
  for (const grp of groups) {
    const done = placed.get(grp);
    if (!done) continue;
    for (const d of done.diagnostics) diagnostics.push(d);
    instanceBodies.set(grp.frame!.prefix, {
      local: grp.entries.flatMap((e, i) => (dropped.has(e) ? [] : [done.local[i]!])),
      imported: grp.entries.some((e) => e.file !== undefined),
    });
    instances.push({
      name: grp.frame!.prefix,
      component: grp.frame!.component,
      at: { x: grp.frame!.tx, y: grp.frame!.ty },
      rotate: grp.frame!.rotate,
      ...(grp.frame!.mirror ? { mirror: grp.frame!.mirror } : {}),
    });
    const derived: RWall[] = [];
    for (const t of done.carried) {
      if (t.kind === "wall") {
        if (t.points.length > 0) walls.push(t);
        else rootRefusedWalls.add(t.id);
      } else if (t.kind === "room") rooms2.push(t);
      else derived.push(...(registry.byKind.get(t.kind)?.yieldsWalls?.(t) ?? []));
    }
    // A group's derived walls follow its authored ones (ADR 0028 §3), as they do in its
    // own resolution, so a first-wins search over the walls prefers the authored wall.
    for (const w of derived) walls.push(w);
  }
  // The plan's positioning axes (定位轴线): plan-level datums, not elements, so they enter
  // the ROOT group's datum table and are evaluated now, before it resolves (ADR 0028 §1).
  // Their positions are expressions, evaluated against the plan's GLOBAL bindings — the
  // block is a plan setting, not a body statement, so it sees every plan-level `let`
  // regardless of where it sits in the file. Snapped like every other coordinate (an
  // off-grid datum would not line up with the rooms it dimensions), then sorted, deduped
  // and labelled by the GB/T rules. An empty block resolves to no axes at all, so
  // `ir.axes` stays absent and the drawing is byte-identical. What the block raises is
  // held in `axesDiags` and reported at step 5, where it always was.
  let axes: RAxis[] | undefined;
  const axesDiags: Diagnostic[] = [];
  if (ast.axes) {
    stepSite(ast.axes.span);
    diagSink = axesDiags;
    try {
      activeEnv = globalScope.flatten();
      // A datum beyond the modelling range is reported (at its expression, else the block)
      // and left out.
      const inRange = (list: Expr[], axis: "x" | "y"): number[] =>
        list.flatMap((e) => {
          const v = snap(evalNum(e));
          if (Math.abs(v) <= MODEL_RANGE_MM) return [v];
          axesDiags.push(outOfRange(`The \`axes\` ${axis} position`, v, exprSpan(e) ?? ast.axes?.span));
          return [];
        });
      const xs = inRange(ast.axes.x, "x");
      const ys = inRange(ast.axes.y, "y");
      const labelled = numberAxes(xs, ys);
      if (labelled.length > 0) axes = labelled;
    } catch (e) {
      // A stopped resolution keeps what was raised before the crossing.
      for (const d of axesDiags) diagnostics.push(d);
      throw e;
    } finally {
      diagSink = diagnostics;
    }
  }
  for (const grp of groups) {
    if (grp.frame) continue;
    // The root's relational placement reads every room in SOURCE order (instances' carried
    // rooms included, as references), exactly the list it always read.
    const table = resolveGroup(
      grp,
      walls,
      rooms2,
      {
        rooms: () =>
          entries.filter((e) => !dropped.has(e) && e.resolved?.kind === "room").map((e) => e.resolved as RRoom),
        stamp: (d) => d,
      },
      axes,
      rootRefusedWalls,
    );
    datumTables.set("", table);
  }

  // 3. IR element list in source order (for rendering), less any element a `place` could
  //    not carry (`E_INSTANCE_NO_TRANSFORM` above). Relational placement has already run,
  //    inside each group's resolution (3a, ADR 0004), so every room here is final. The
  //    elements a statement derives (`ElementDef.yieldsElements`) follow it.
  const resolvedElements = entries
    .filter((e) => !dropped.has(e))
    .flatMap((e) => {
      const kids = registry.byKind.get(e.resolved!.kind)?.yieldsElements?.(e.resolved!) ?? [];
      return kids.length === 0 ? [e.resolved!] : [e.resolved!, ...kids];
    });

  // 3b. The number domain, once every coordinate is final (frames carried, relational rooms
  //     placed): an element whose geometry is non-finite or beyond the modelling range is
  //     reported and DROPPED here, before it can host an opening or reach any consumer.
  //     An opening hosted on a dropped wall goes with it, silently: its host's report is the
  //     one report, and an opening cannot be drawn in a wall that is not there. Every OTHER
  //     diagnostic about a dropped element (its resolve-time errors and warnings) is removed,
  //     so an element out of range is reported exactly once.
  const outside = checkNumberDomain(resolvedElements, registry, diagnostics);
  if (outside.size > 0) {
    // A dropped wall-deriving statement takes its derived walls with it (its bounds and
    // measures are theirs), and so the openings hosted on them below.
    for (const el of [...outside]) {
      for (const w of registry.byKind.get(el.kind)?.yieldsWalls?.(el) ?? []) outside.add(w);
    }
    for (const el of resolvedElements) {
      if ((el.kind === "door" || el.kind === "window" || el.kind === "opening") && el.host) {
        const host = hostWallOf(el.host, walls);
        if (host && outside.has(host)) outside.add(el);
      }
    }
    const droppedEntries = new Set<Entry>();
    for (const e of entries) if (e.resolved && outside.has(e.resolved)) droppedEntries.add(e);
    let kept = 0;
    for (const d of diagnostics) {
      const owner = ownerOf.get(d);
      if (owner === undefined || !droppedEntries.has(owner)) diagnostics[kept++] = d;
    }
    diagnostics.length = kept;
    const keptWalls = walls.filter((w) => !outside.has(w));
    walls.length = 0;
    for (const w of keptWalls) walls.push(w);
  }
  const elements = outside.size > 0 ? resolvedElements.filter((e) => !outside.has(e)) : resolvedElements;

  // 3c. Register openings: each hosted door/window voids its wall's solid.
  registerOpenings(elements, walls);
  // 3d. A demolished wall hosts nothing (B3a). An authored door, window or opening the hosting
  //     rule gave a demolished wall is re-hosted, for the analysis only, on a STANDING wall that
  //     hosts it at its point (the same rule over the standing walls: a coincident `status new`
  //     wall takes it); with none there, or when the statement names the demolished wall by id
  //     (`on <id>`, `wall <id>`), it is refused. The drawing keeps the hosting it always had.
  //     Only a plan that marks a wall `demolish` reaches the loop.
  const rehosted = new Map<ResolvedElement, WallSegment>();
  if (walls.some((w) => w.status === "demolish")) {
    const standingWalls = walls.filter((w) => w.status !== "demolish");
    for (const el of elements) {
      if ((el.kind !== "door" && el.kind !== "window" && el.kind !== "opening") || !el.host) continue;
      if (el.kind === "opening" && el._derived) continue;
      const host = hostWallOf(el.host, walls);
      if (host?.status !== "demolish") continue;
      const entry = entryOf.get(el);
      const node = entry?.node as { attach?: { wall?: string }; wall?: string } | undefined;
      const ref = node?.attach?.wall ?? node?.wall;
      const namesIt = ref !== undefined && (ref === host.id || host.id.endsWith(`.${ref}`));
      if (!namesIt) {
        const { host: seg, onWall } = hostInfoForWalls(standingWalls, el.at, ref);
        if (seg && onWall) {
          rehosted.set(el, seg);
          continue;
        }
      }
      const d = demolishedHostDiagnostic(el, host);
      diagnostics.push(entry ? stampProvenance(d, entry.frame, entry.file) : d);
    }
  }

  // 4. Cross-element checks. Drawability and room references read the plan as authored
  //    (a dropped room is still the room a piece of furniture names, so it raises no
  //    second error); the overlap check reads only what was kept.
  checkPlanDrawable(resolvedElements, diagnostics);
  const siteBeforeOverlaps = currentStepSite();
  checkRoomOverlaps(elements, diagnostics, (extras?.storeyCount ?? 1) > 1 ? extras?.level?.level : undefined, ast.grid);
  stepSite(siteBeforeOverlaps?.span, siteBeforeOverlaps?.file, siteBeforeOverlaps?.frame);
  checkFurnitureRooms(resolvedElements, diagnostics);

  // 5. Positioning axes (定位轴线): evaluated before the root group resolved (step 3(ii)),
  //    because they are part of its datum table; what they raised is reported HERE, after
  //    every element's diagnostic, where it always was, and the step site is put back on
  //    the block as this step always left it.
  if (ast.axes) {
    stepSite(ast.axes.span);
    for (const d of axesDiags) diagnostics.push(d);
  }

  // 5b. The lot line. Same shape as the axes above and for the same reasons: a
  //     plan-level datum whose coordinates are expressions, evaluated against the plan's
  //     GLOBAL bindings and snapped like every other authored coordinate. It REFUSES
  //     rather than approximating — a degenerate or self-crossing ring encloses no single
  //     area, so there is no lot to report an area for and no outline to draw — which is
  //     the `room polygon` precedent applied one layer up.
  let siteBoundary: Point[] | undefined;
  if (ast.site?.boundary) {
    stepSite(ast.site.boundarySpan ?? ast.site.span);
    activeEnv = globalScope.flatten();
    const ring = ast.site.boundary.map((p) => snapPt({ x: evalNum(p.x), y: evalNum(p.y) }));
    const effective = effectiveVertices(ring);
    const span = ast.site.boundarySpan ?? ast.site.span;
    const far = farthest(ring.flatMap((p) => [p.x, p.y]));
    if (far !== undefined) {
      diagnostics.push(outOfRange("The site `boundary`", far, span));
    } else if (effective.length < 3) {
      diagnostics.push({
        severity: "error",
        message:
          `The site \`boundary\` is degenerate — ${effective.length} effective vertices after removing ` +
          `duplicate and collinear points (3 are needed to enclose a lot)`,
        code: "E_SITE_BOUNDARY_DEGENERATE",
        ...(span ? { span } : {}),
      });
    } else if (polygonSelfIntersects(effective)) {
      diagnostics.push({
        severity: "error",
        message: "The site `boundary` self-intersects — its edges cross, so it encloses no single lot",
        code: "E_SITE_BOUNDARY_SELF_INTERSECT",
        ...(span ? { span } : {}),
      });
    } else {
      siteBoundary = ring;
    }
  }

  // 6. The sheet: resolve `paper` (+ the authored `scale`) into an operative scale
  //    denominator, and report an overflow. Purely arithmetic over the extent already
  //    computed above — no rendering, so `describe()` and `toScene()` both just read it.
  //    A multi-storey plan hands one shared sheet in instead (`extras.sheet`), measured
  //    on the whole BUILDING, so every page is issued at the same scale and the overflow
  //    warning is raised once by the caller rather than once per storey.
  const sheet =
    extras.sheet ??
    resolveSheet(
      ast,
      elements,
      walls,
      diagnostics,
      zoneFrame.declared.size > 0 ? [...zoneFrame.declared.values()] : undefined,
      siteBoundary,
      registry,
    );

  // 7. The drawn sizes the plan's own settings scale: a wall's hatch tile and the heaviest
  //    pen, measured on THIS drawing (it needs the sheet, so it runs last).
  //    A storey of a multi-storey plan leaves the pen to `resolveLevelsImpl`, which reports a
  //    plan-level `lineWeight` once for the building rather than once per page.
  checkDrawnSizes(ast, elements, walls, siteBoundary, sheet, registry, diagnostics, extras.level === undefined);

  const ir: ResolvedPlan = {
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    // With a sheet the EFFECTIVE scale is stamped in (auto-fit's choice when the author
    // wrote none), so the title block, the scale bar and describe() all quote the scale
    // the drawing was actually made at.
    scale: sheet ? `1:${fmtDenom(sheet.denom)}` : ast.scale,
    ...(sheet ? { sheet } : {}),
    north: ast.north,
    ...(ast.hide ? { hide: ast.hide } : {}),
    // Absent unless declared, so the IR of a plan with no `site` is byte-identical.
    ...(ast.site ? { site: ast.site } : {}),
    ...(siteBoundary ? { siteBoundary } : {}),
    autoDims: ast.autoDims,
    ...(axes ? { axes } : {}),
    // Sheet-table opt-ins: presentation flags carried through untouched. Spread so an
    // opted-out plan has no key at all and the IR stays byte-identical to before.
    ...(ast.schedule ? { schedule: ast.schedule } : {}),
    ...(ast.scheduleNet ? { scheduleNet: true } : {}),
    ...(ast.openingSchedule ? { openingSchedule: true } : {}),
    ...(ast.legend ? { legend: true } : {}),
    ...(ast.notes && ast.notes.length > 0 ? { notes: ast.notes } : {}),
    ...(ast.sheetText ? { sheetText: ast.sheetText } : {}),
    // Declared wing/department grouping — metadata only, absent when the plan
    // declares no `zone`, so an existing IR is byte-identical.
    ...(zoneFrame.declared.size > 0 ? { zones: [...zoneFrame.declared.values()] } : {}),
    // Page identity for a multi-storey plan (absent otherwise → byte-identical IR).
    ...(extras.level ? { level: extras.level.level } : {}),
    ...(extras.level?.name !== undefined ? { levelName: extras.level.name } : {}),
    title: ast.title,
    accTitle: ast.accTitle,
    accDescr: ast.accDescr,
    theme: ast.theme,
    themeBase: ast.themeBase,
    themeFrom: ast.themeFrom,
    styles: ast.styles,
    // The vertical datum. All three are ALWAYS present — unlike every optional
    // key above, they are not "absent when undeclared", because a storey always has a
    // height whether or not anyone wrote one down. The byte-identity law is kept a layer
    // out instead: `describe()` reads `_heightsAuthored` and emits nothing when it is
    // false, so an IR field costs no consumer a byte.
    storeyHeight,
    elevation: extras.elevation ?? 0,
    _heightsAuthored: extras.heightsAuthored ?? plansAuthorHeights(ast),
    ...((extras.storeyCount ?? 1) > 1 ? { _storeyCount: extras.storeyCount } : {}),
    _executedWhileSpans: executedWhiles,
    // A `status demolish` wall (B3a) is drawn but stands in no analysis: `elements`/`walls` are
    // the plan after the demolition and `drawn` the plan as drawn. No such wall, no `drawn` key
    // and the very arrays, so the IR is the one it always was.
    ...afterDemolition(elements, walls, rehosted),
    ...(instances.length > 0 ? { instances } : {}),
  };
  datumTablesOfIr.set(ir, datumTables);
  if (instanceBodies.size > 0) instanceBodiesOfIr.set(ir, instanceBodies);

  // 8. The storey's keeps (ADR 0033), last: measured against the plan as it resolved, in plan
  //    coordinates, in source order — on a `paper` plan's drawn pass only (R11). A keep reads, it
  //    never writes; a broken hard keep is one `W_KEEP_VIOLATED`, after every other diagnostic of
  //    the storey. A plan with no keep does none of this and spends no step on it.
  const authoredOf = (): ((id: string) => boolean) => {
    let ids: Set<string> | undefined;
    return (id) => {
      if (!ids) {
        chargeSteps(entries.length + 1);
        ids = new Set();
        // Every id the author wrote, an element later dropped (out of range, not carried) included,
        // so a keep naming one is told it was dropped, not that it was never written.
        for (const e of entries) if (e.idAuthored === true && e.resolved) ids.add(e.resolved.id);
      }
      return ids.has(id);
    };
  };
  const keepState: KeepState = { count: stackedSink.count, limited: stackedSink.limited };
  if (extras.keepAuthored) keepState.authored = authoredOf();
  if (stackedSink.list.length > 0) keepState.stacked = stackedSink.list;
  if (keepSink.list.length > 0 && !extras.probe) {
    const north = ast.north;
    const results = evaluateKeeps(keepSink.list, {
      ir,
      snap,
      authored: keepState.authored ?? authoredOf(),
      compass: {
        aliases: north === "up",
        why:
          typeof north === "object"
            ? `the plan's \`north\` is a bearing of ${fmt3(north.deg)} degrees`
            : `the plan's \`north\` is \`${north}\``,
      },
      ...(extras.level ? { level: extras.level.level } : {}),
      ...((extras.storeyCount ?? 1) > 1 && extras.level ? { namingLevel: extras.level.level } : {}),
      diag: (d) => {
        chargeSteps(DIAGNOSTIC_STEPS);
        diagnostics.push(d);
      },
    });
    for (const r of results) {
      if (r.grade === "hard" && !r.holds) {
        chargeSteps(DIAGNOSTIC_STEPS);
        diagnostics.push(violationOf(r));
      }
    }
    keepState.results = results;
  }
  if (keepSink.count > 0 || keepState.authored || keepState.stacked) keepStateOfIr.set(ir, keepState);
  return { ir, diagnostics };
}
