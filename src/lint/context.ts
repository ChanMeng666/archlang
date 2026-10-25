/**
 * The shared, precomputed context every lint rule checks against — element
 * subsets, room rectangles and the hoisted wall-segment list are built exactly
 * once per `lint()` run, so no rule re-derives them.
 */

import { type D4, D4_IDENTITY, fromSpelling } from "../algebra/d4.js";
import type { AccessGraph, MainEntranceFact, RoomBox } from "../analyze.js";
import { buildDoorAccessGraph, roomBox, roomUses } from "../analyze.js";
import { entranceInputs, mainEntranceOf, walkAccessGraph, walkWays } from "../analyze/entrance.js";
import type { Diagnostic } from "../diagnostics.js";
import { segmentsOfWall, type WallSegment } from "../geometry.js";
import type { RDoor, RFurniture, ROpening, RRoom, RVoid, RWindow, ResolvedPlan } from "../ir.js";
import { type ArrivingRun, type RVertical, verticalsOf } from "../vertical.js";
import type { DwellingReading } from "../analyze/dwelling.js";
import type { EnclosureBudgetCap, LintFamily, LintSkipReason } from "./coverage.js";
import { labelPointOf, unlabelledRoomPhrases } from "./phrases.js";
import type { LintRuleset } from "./ruleset.js";

/**
 * What one storey's rules need to know about the BUILDING around it. A
 * single-storey plan has none of this, and the defaults below are exactly "no vertical
 * circulation anywhere", so every existing plan lints identically.
 */
export interface BuildingContext {
  /** True when the plan is made of `level` blocks. */
  multiStorey: boolean;
  /** Ids of vertical runs that also appear on some OTHER storey (i.e. real shafts). */
  verticalPeerIds: ReadonlySet<string>;
  /**
   * Rooms on THIS storey you arrive in by coming up or down a shaft from a storey that
   * is itself reachable from outside — so this storey needs no exterior door of its own.
   * Empty when the storey is grounded (it has its own entrance) or is not reached at all.
   */
  arrivalRooms: readonly string[];
  /**
   * The vertical runs on THIS storey that a person arrives by — the shafts behind
   * {@link BuildingContext.arrivalRooms}, under the same rule (empty on a grounded or
   * unreached storey). A storey with no front door is walked from their landings, so the
   * circulation rules measure it rather than going silent (`circulation-facts.ts`).
   */
  arrivalShafts: readonly ArrivingRun[];
  /**
   * The re-measures `W_PATH_TOO_NARROW`'s door attribution has left for the WHOLE `lint()`
   * run, shared by every storey's context (one object per run, created with them), and how
   * many storeys have not started yet (each keeps one for its own first union). Absent on a
   * single-storey plan, whose one context counts its own. A count, never a time.
   */
  attributionMeasures?: { left: number; storeys: number };
  /** A shaft arrives on this storey from a storey below (`levelsEnteredFromBelow`): it names no
   *  main entrance, and its walk keeps every way in (PS0.10; PS0.3 owns the upper storeys). */
  enteredFromBelow?: boolean;
  /** What the whole plan's rooms read as (`dwellingReading`, PS2.18), read once over every
   *  storey. Absent means a dwelling, so a context built outside `lint()` judges as before. */
  dwelling?: DwellingReading;
  /** This is the LOWEST storey of a multi-storey plan: the one a plan-level drawing fact that
   *  every page repeats identically (a title-block row, `W_TITLE_OVERFLOW`) is reported on, so
   *  it is reported once rather than once per page. Absent on every other storey and on a
   *  single-storey plan (whose one context reports it). */
  lowestStorey?: true;
}

export const NO_BUILDING: BuildingContext = {
  multiStorey: false,
  verticalPeerIds: new Set(),
  arrivalRooms: [],
  arrivalShafts: [],
};

export interface LintContext {
  ir: ResolvedPlan;
  rules: LintRuleset;
  rooms: RRoom[];
  doors: RDoor[];
  windows: RWindow[];
  openings: ROpening[];
  furniture: RFurniture[];
  /** Vertical-circulation runs on this storey, in source order. */
  verticals: RVertical[];
  /** Floor voids on this storey — circulation obstacles, in source order. No rule
   *  keys off them directly; they reach the nav grid through `circulation-facts.ts`. */
  voids: RVoid[];
  /** The multi-storey facts this storey's rules read; inert for a single-storey plan. */
  building: BuildingContext;
  /** Both doors and cased openings connect a room to its neighbours. */
  connectors: Array<RDoor | ROpening>;
  /** Per-room extent: bbox, plus the floor ring for a `room polygon`. */
  roomRects: Map<string, RoomBox>;
  /** Every wall segment, hoisted once (several rules scan them per room/fixture). */
  wallSegs: WallSegment[];
  wallOpenings: Array<{ at: { x: number; y: number }; width: number }>;
  /**
   * The modeled door/opening access graph for this storey — rooms joined to each other
   * and to the synthetic `exterior` node — built at most once per `lint()` run.
   *
   * It is a function rather than a field because most plans never ask: only the rules
   * that need reachability pay for it. Sharing ONE graph is the point, though — this is
   * the same `buildDoorAccessGraph` call `describe()` makes, so "is there a way into this
   * building?" has a single answer across the whole tool. `W_NO_ENTRANCE` used to ask its
   * own, weaker question (does any WALL carry `category exterior`?) and so stood down on
   * a plan `describe().access.hasEntrance` called shut.
   */
  access(): AccessGraph;
  /** The storey's main entrance, as `describe().access.mainEntrance` reports it (PS0.10), or
   *  `null` on a storey with one entrance or none. Memoised. */
  mainEntrance(): MainEntranceFact | null;
  /**
   * The ways in a WALK is judged from (plan-soundness PS0.10, `src/analyze/entrance.ts`): the
   * main entrance and every other entrance whose room the main entrance does not reach without
   * going outside, or `null` (every way in) when the storey names no main entrance. Memoised.
   */
  walkWays(): ReadonlySet<string> | null;
  /** {@link access} with only the {@link walkWays} entrance edges: the graph the circulation
   *  rules walk. {@link access} itself when `walkWays()` is `null`. Memoised. */
  walkAccess(): AccessGraph;
  /** A room's label, or its id when it has none. For a HINT, where an id is the handle an
   *  agent edits by; a message uses {@link nameOf}. */
  labelOf(r: RRoom): string;
  /**
   * How a MESSAGE names a room (PS2.29: a message never quotes an id): its quoted label, or,
   * for a room with no label, the phrase the plan's own facts give it ("the kitchen", "the
   * bedroom in the top left of the plan", `src/lint/phrases.ts`). With `noun` a labelled room
   * reads `bedroom "Bed 2"` and an unlabelled one just its phrase; the result starts with a
   * lower-case letter or a noun, so a sentence that opens with it capitalises it itself.
   */
  nameOf(r: RRoom, noun?: string): string;
  /** {@link nameOf} by place alone, never by use: for a message about how the room's use was
   *  read from its label or id (`W_ALIAS_MATCH`). */
  placeOf(r: RRoom): string;
  /**
   * The location half of a diagnostic raised ON an element: its byte `span` **and the
   * file that span is measured in**.
   *
   * It takes the element rather than `el.span` on purpose — it is the ONE seam where a
   * lint diagnostic learns its provenance, so a rule cannot report a span while silently
   * forgetting which source it addresses. An element written in the compiled source
   * carries no `_file`, so the returned object is exactly `{ span }` and every existing
   * plan's diagnostics are byte-identical.
   */
  at(el: DiagnosticSite): { span?: Diagnostic["span"]; file?: string };
  /**
   * The linear part of the frame that carried `el` into plan coordinates: the D4 element
   * of its `place` instance, composed through every enclosing `place`, or the identity for
   * an element written in the root plan.
   *
   * A rule that computes a fix value from plan-space geometry needs it. A fix edits the
   * element's SOURCE, and an element inside a component is written in the component's
   * local frame, so the value to write is the plan-space one pulled back through `g⁻¹`.
   * Read from `ir.instances`, which records for each instance the frame the resolver handed
   * `transformElement` (a nested instance's is already composed there), keyed by the dotted
   * path stamped on the element as `_instance`. `null` only if the element names an
   * instance the plan never recorded; the rule then offers no fix rather than a plan-space
   * guess.
   */
  frameOf(el: { _instance?: string }): D4 | null;
  /**
   * Declare that the running rule declined to judge something: the coverage seam
   * (`src/lint/coverage.ts`, PS2.13). Pass the room when the skip is about one room, nothing
   * for a plan-level skip. The family is the rule's own {@link LintRule.family}, attached by
   * the fold. It records only: what a rule returns never depends on it, and a context built
   * outside `lint()` (tests, `furnish`) drops every note. `cap` names the counted cap behind an
   * `enclosure-budget` skip, so the report's words can say which one tripped.
   */
  skip(reason: LintSkipReason, room?: RRoom, cap?: EnclosureBudgetCap): void;
}

/** What {@link LintContext.at} needs off an element: where it is, and in which file. */
export interface DiagnosticSite {
  span?: Diagnostic["span"];
  _file?: string;
}

/**
 * Whether a rule that describes a defect of a home judges this plan (PS2.18): always under
 * {@link LintRuleset.assumeDwelling} (`residential-basic`), otherwise unless the plan reads as
 * non-residential. A rule that gets `false` declines and files a `non-dwelling` skip.
 */
export function judgesAsDwelling(ctx: LintContext): boolean {
  return ctx.rules.assumeDwelling || ctx.building.dwelling !== "non-residential";
}

/** The soundness layer a lint rule judges (ADR 0032): the plan itself, or only its annotation. */
export type LintLayer = "validity" | "drafting";

/** One architectural-soundness rule (or an order-preserving composite of several). */
export interface LintRule {
  /** Stable name for tests/debugging (not user-facing). */
  name: string;
  /** The family the coverage report files this rule's runs and skips under. */
  family: LintFamily;
  /**
   * Which layer of plan soundness the rule judges (ADR 0032): `"validity"` for a defect of the
   * plan itself, `"drafting"` for a defect of the drawing's annotation only (the `annotation`
   * family). Required, so the compiler refuses a rule with no layer. `taste()` caps its score on
   * validity-layer warnings only; nothing in `lint()`'s output reads it.
   */
  layer: LintLayer;
  /**
   * Every code the rule may emit. A diagnostic does not name the rule that raised it, so this is
   * what maps a code to its {@link layer} (`lintWithCoverage().layers`). Each `W_*` code belongs
   * to exactly one rule (`test/lint-layers.test.ts`).
   */
  codes: readonly string[];
  /**
   * The rule's output can move when furniture is added to a room in a way the per-piece
   * placement checks of a quoted fixture hint do not see (plan-soundness PS2.17): a hint's set
   * of pieces is re-linted against these rules alone before it is quoted. Set only on the rules
   * whose output a pasted hint was measured to move (`test/lint-hint-paste.test.ts` holds the
   * list). `"walk"` marks a rule that walks the whole storey (a nav model per pass), run only
   * when a quoted piece stands closer than the walk's minimum clear width to something;
   * `"wet-door"` a rule that reads furniture only to judge a doorway between a wet room and the
   * room the pieces stand in, run only when that room is a bath or WC or opens onto one.
   */
  readsFurniture?: true | "walk" | "wet-door";
  check(ctx: LintContext): Diagnostic[];
}

/** Where {@link LintContext.skip} sends a note; the default drops it. */
export type SkipSink = (reason: LintSkipReason, room?: RRoom, cap?: EnclosureBudgetCap) => void;
const DROP_SKIP: SkipSink = () => {};

export function buildLintContext(
  ir: ResolvedPlan,
  rules: LintRuleset,
  building: BuildingContext = NO_BUILDING,
  onSkip: SkipSink = DROP_SKIP,
): LintContext {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  let accessMemo: AccessGraph | null = null;
  let waysMemo: { fact: MainEntranceFact | null; keep: ReadonlySet<string> | null } | null = null;
  let walkMemo: AccessGraph | null = null;
  let framesMemo: Map<string, D4> | null = null;
  let phrasesMemo: Map<string, string> | null = null;
  let placesMemo: Map<string, string> | null = null;
  const phrasesOf = (byUse: boolean): Map<string, string> =>
    unlabelledRoomPhrases(
      rooms.map((x) => ({
        id: x.id,
        ...(x.label !== undefined ? { label: x.label } : {}),
        uses: [...roomUses(x)],
        point: labelPointOf(x),
      })),
      ir.level,
      byUse,
    );
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  const access = (): AccessGraph =>
    (accessMemo ??= buildDoorAccessGraph(rooms, doors, rules.tolMm, undefined, openings));
  const mainOf = (): MainEntranceFact | null => {
    if (waysMemo === null) {
      const inp = entranceInputs(ir, roomRects, building.enteredFromBelow === true);
      const fact = mainEntranceOf(access(), inp);
      waysMemo = { fact, keep: walkWays(access(), inp, fact) };
    }
    return waysMemo.fact;
  };
  const walkWaysOf = (): ReadonlySet<string> | null => {
    mainOf();
    return waysMemo!.keep;
  };
  return {
    ir,
    rules,
    rooms,
    doors,
    windows,
    openings,
    furniture,
    verticals: verticalsOf(ir),
    voids: ir.elements.filter((e): e is RVoid => e.kind === "void"),
    building,
    connectors: [...doors, ...openings],
    roomRects,
    wallSegs: ir.walls.flatMap((w) => segmentsOfWall(w).map((s) => ({ ...s }))),
    wallOpenings: ir.walls.flatMap((w) => w.openings),
    access,
    mainEntrance: mainOf,
    walkWays: walkWaysOf,
    walkAccess: () => (walkMemo ??= walkAccessGraph(access(), walkWaysOf())),
    labelOf: (r) => r.label ?? r.id,
    nameOf: (r, noun) => {
      if (r.label !== undefined) return noun === undefined ? `"${r.label}"` : `${noun} "${r.label}"`;
      phrasesMemo ??= phrasesOf(true);
      return phrasesMemo.get(r.id) ?? "an unlabelled room";
    },
    placeOf: (r) => {
      if (r.label !== undefined) return `"${r.label}"`;
      placesMemo ??= phrasesOf(false);
      return placesMemo.get(r.id) ?? "an unlabelled room";
    },
    at: (el) => ({
      ...(el.span ? { span: el.span } : {}),
      ...(el._file !== undefined ? { file: el._file } : {}),
    }),
    frameOf: (el) => {
      if (el._instance === undefined) return D4_IDENTITY;
      framesMemo ??= new Map((ir.instances ?? []).map((i) => [i.name, fromSpelling(i.rotate, i.mirror)]));
      return framesMemo.get(el._instance) ?? null;
    },
    skip: onSkip,
  };
}
