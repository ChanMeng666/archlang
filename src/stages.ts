/**
 * The authoring stages (plan-soundness PS7.1): the order in which a plan's decisions are taken,
 * lowest frequency first, and which findings mean anything at each.
 *
 * > brief → rooms → walls → openings → fixtures → drafting
 *
 * - `brief`: the frame the brief fixes (the plan, its units, `site`, `level`s, `let`s, `keep`s on
 *   the brief's numbers). Only the language's own errors and warnings count here.
 * - `rooms`: the room graph and its zoning on a grid, which ArchLang takes in one act: a `room`
 *   is declared with its place and size (rooms-first, ADR 0028), together with stairs, voids and
 *   outdoor surfaces, which hold their place above every partition (the hold-fixed ladder).
 * - `walls`: the walls, derived (`walls from rooms`) or written.
 * - `openings`: doors, windows and cased openings, and so everything that reads the door graph.
 * - `fixtures`: fixtures and furniture.
 * - `drafting`: the sheet; at this stage everything counts, and taste is reported.
 *
 * A finding's stage is the latest stage whose elements the check needs in order to judge at all,
 * presence or absence: `W_NO_ENTRANCE` reports a door that is missing, so it is an `openings`
 * finding; `W_SWING_OBSTRUCTED` judges a door's swing, and furniture only sharpens it, so it is
 * `openings` too. A lint code's stage is declared by its rule (`LintRule.stage`, read into
 * {@link LINT_CODE_STAGES}); a compile-channel code's comes from its family, below; an intent
 * assertion's from its predicate; a `keep`'s from what it measures.
 *
 * Errors are never held back: a plan that does not resolve has no stage that is clean.
 *
 * Pure data and pure functions; nothing here reads or moves `compile()`, `describe()` or
 * `lint()`.
 */

import type { KeepNode, KeepRef } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import type { IntentCheckResult, Predicate } from "./intent.js";
import type { ResolvedElement } from "./ir.js";
import type { KeepResult } from "./keep.js";
import { LINT_CODE_STAGES } from "./lint.js";
import type { NextInput } from "./next.js";

/** The stages, in authoring order. */
export const AUTHORING_STAGES = ["brief", "rooms", "walls", "openings", "fixtures", "drafting"] as const;
export type AuthoringStage = (typeof AUTHORING_STAGES)[number];

const RANK: Readonly<Record<AuthoringStage, number>> = Object.freeze(
  Object.fromEntries(AUTHORING_STAGES.map((s, i) => [s, i] as const)) as Record<AuthoringStage, number>,
);

/** Whether `s` is a stage name. */
export const isAuthoringStage = (s: string): s is AuthoringStage => Object.hasOwn(RANK, s);

/** Whether a finding of stage `s` is shown at stage `at` (it belongs to `at` or an earlier one). */
export const stageAtMost = (s: AuthoringStage, at: AuthoringStage): boolean => RANK[s] <= RANK[at];

/** The later of two stages. */
const later = (a: AuthoringStage, b: AuthoringStage): AuthoringStage => (RANK[a] >= RANK[b] ? a : b);

/**
 * The compile-channel warnings (`compile()`'s, not `lint()`'s), each by what it is about. Every
 * catalogued `W_*` code no lint rule declares is listed (`test/stages.test.ts`).
 */
export const COMPILE_WARNING_STAGES: Readonly<Record<string, AuthoringStage>> = Object.freeze({
  // The language itself.
  W_EMPTY_PLAN: "brief",
  W_IMPORT_EMPTY_FILE: "brief",
  W_WHILE_DEPRECATED: "brief",
  W_REASSIGN_DEPRECATED: "brief",
  // Rooms laid on top of each other.
  W_ROOM_OVERLAP: "rooms",
  // An opening that did not land on its wall, or a swing naming a room it does not border.
  W_DOOR_OFF_WALL: "openings",
  W_WINDOW_OFF_WALL: "openings",
  W_OPENING_OFF_WALL: "openings",
  W_SWING_ROOM_NOT_ADJACENT: "openings",
  // The sheet: style, fonts, labels, dimensions, scale, accessibility metadata.
  W_CJK_FONT_MISSING: "drafting",
  W_GLYPH_UNSUPPORTED: "drafting",
  W_DUP_ACC_METADATA: "drafting",
  W_HATCH_SCALE: "drafting",
  W_SANITIZED_CONFIG: "drafting",
  W_UNKNOWN_MATERIAL: "drafting",
  W_UNKNOWN_STYLE_KEY: "drafting",
  W_UNKNOWN_THEME_KEY: "drafting",
  W_ROOM_LABEL_OUTSIDE: "drafting",
  W_DIM_NO_WALL: "drafting",
  W_SCALE_OVERFLOW: "drafting",
  W_DRAWING_OVERFLOW: "drafting",
  // A broken hard keep is the stage of what it measures ({@link keepStage}); this is the
  // fallback when the keep it reports cannot be found.
  W_KEEP_VIOLATED: "brief",
});

/**
 * The `E_*` families by prefix, first match wins; a code no family names is a `brief` error (the
 * language: parse, types, names, imports, budgets, levels, site, keeps). Errors are never held
 * back, so this is the stage the error is about, for the reader.
 */
const ERROR_FAMILIES: ReadonlyArray<readonly [RegExp, AuthoringStage]> = [
  [/^E_(ROOMS?|DATUM|LAYOUT|STRIP|OUTDOOR|VERT|STAIR|RUN|VOID)_/, "rooms"],
  [/^E_(WALLS?|PARTITION|ARC|COLUMN|ROOF|FENCE|HEIGHT)_/, "walls"],
  [/^E_(DOOR|WINDOW|OPENING|ATTACH|SWING|SILL)_/, "openings"],
  [/^E_(FURN|FACING)_/, "fixtures"],
  [/^E_(DIM|ACC|PNG|DRAWING)_/, "drafting"],
];

/**
 * The stage of a diagnostic code: a lint code's declared stage, a compile warning's from
 * {@link COMPILE_WARNING_STAGES}, an error's from its family. A diagnostic with no code, or an
 * uncatalogued code, is `brief`: it is shown at every stage.
 */
export function codeStage(code: string | undefined): AuthoringStage {
  if (code === undefined) return "brief";
  const lint = LINT_CODE_STAGES[code];
  if (lint !== undefined) return lint;
  const compile = COMPILE_WARNING_STAGES[code];
  if (compile !== undefined) return compile;
  for (const [re, s] of ERROR_FAMILIES) if (re.test(code)) return s;
  return "brief";
}

/**
 * The stage of an intent assertion (`validate --intent`), by its predicate. The room program, the
 * areas and the centreline sizes exist once the rooms do; the gross internal area is read inside
 * the exterior walls' faces; adjacency is read through interior doors, reachability from the
 * entrance, window counts off the windows.
 */
export function predicateStage(p: Predicate): AuthoringStage {
  switch (p.kind) {
    case "room-count":
    case "room-exists":
    case "room-area":
    case "total-area":
    case "room-dimension":
    case "room-size":
      return "rooms";
    case "gross-area":
      return "walls";
    case "adjacent":
    case "reachable":
    case "room-windows":
      return "openings";
  }
}

/** A `--graph` check reads interior-door adjacency, so it is an `openings` finding. */
export const GRAPH_STAGE: AuthoringStage = "openings";

/** The stage of a resolved element's kind: the stage at which it is placed. */
export const ELEMENT_KIND_STAGES: Readonly<Record<ResolvedElement["kind"], AuthoringStage>> = Object.freeze({
  room: "rooms",
  stair: "rooms",
  elevator: "rooms",
  escalator: "rooms",
  void: "rooms",
  outdoor: "rooms",
  wall: "walls",
  walls: "walls",
  column: "walls",
  roof: "walls",
  fence: "walls",
  door: "openings",
  window: "openings",
  opening: "openings",
  furniture: "fixtures",
  dim: "drafting",
});

/** What {@link keepStage} needs: the kind of the element an id names, if any. */
export type KindOf = (id: string) => ResolvedElement["kind"] | undefined;

/**
 * The stage of a `keep` (ADR 0033): the stage of its measure. `min clear` measures between wall
 * faces and `on axis` names a wall, so both are `walls` at least; every other form is the latest
 * stage among its targets: a room's edge or an axis is `rooms`, a wall segment `walls`, a bare id
 * the stage of the element it names ({@link ELEMENT_KIND_STAGES}; `rooms` when nothing is found).
 */
export function keepStage(node: KeepNode, kindOf: KindOf): AuthoringStage {
  const refStage = (r: KeepRef): AuthoringStage => {
    if (r.t === "room" || r.t === "axis") return "rooms";
    if (r.segment !== undefined) return "walls";
    const k = kindOf(r.id);
    return k === undefined ? "rooms" : ELEMENT_KIND_STAGES[k];
  };
  const refs: KeepRef[] =
    node.form === "align" || node.form === "equal"
      ? node.refs
      : node.form === "offset"
        ? [node.x, node.from]
        : node.form === "min-clear"
          ? [node.room]
          : node.form === "on-axis"
            ? [node.axis, node.wall]
            : node.form === "stacked"
              ? [node.target]
              : [node.datum];
  const floor: AuthoringStage = node.form === "min-clear" || node.form === "on-axis" ? "walls" : "rooms";
  return refs.reduce<AuthoringStage>((s, r) => later(s, refStage(r)), floor);
}

/** A {@link KindOf} over a resolved plan's storeys. */
export function kindsOf(plans: ReadonlyArray<{ elements: readonly ResolvedElement[] }>): KindOf {
  const m = new Map<string, ResolvedElement["kind"]>();
  for (const p of plans) for (const e of p.elements) if (!m.has(e.id)) m.set(e.id, e.kind);
  return (id) => m.get(id);
}

/**
 * The stage of a diagnostic: {@link codeStage}, except a `W_KEEP_VIOLATED`, which is the stage of
 * the keep it reports (matched by the keep's span, then storey).
 */
export function diagnosticStage(d: Diagnostic, keeps?: readonly KeepResult[], kindOf?: KindOf): AuthoringStage {
  if (d.code === "W_KEEP_VIOLATED" && keeps && kindOf) {
    const k = keeps.find(
      (r) =>
        r.node.span !== undefined &&
        d.span !== undefined &&
        r.node.span.start === d.span.start &&
        r.node.span.end === d.span.end &&
        (d.level === undefined || r.level === undefined || r.level === d.level),
    );
    if (k) return keepStage(k.node, kindOf);
  }
  return codeStage(d.code);
}

/** What {@link atStage} hands back: the input as seen at the stage, and how much it held back. */
export interface StageView {
  stage: AuthoringStage;
  /** `NextInput` with every later-stage finding taken out (taste kept only at `drafting`). */
  input: NextInput;
  /** The diagnostics shown: errors always, warnings of this stage or an earlier one. */
  diagnostics: Diagnostic[];
  /** Later-stage findings held back: warnings, intent violations, a `--graph` mismatch and broken
   *  soft keeps (a broken hard keep is counted once, as its warning). */
  held: number;
}

/**
 * The view of everything `validate` measured from one stage (`validate --stage`): what `next`, the
 * tiers and the report read when the author has reached `stage`. Errors are always kept. Pure: it
 * filters what it is handed and measures nothing.
 *
 * `diagnostics` is the report's set (compile diagnostics plus the lint run the report shows, the
 * profile's when one is named); `input` is `nextDiagnostic`'s input.
 */
export function atStage(
  stage: AuthoringStage,
  diagnostics: readonly Diagnostic[],
  input: NextInput,
  kindOf: KindOf,
): StageView {
  const keeps = input.keeps;
  const shown = (d: Diagnostic): boolean =>
    d.severity === "error" || stageAtMost(diagnosticStage(d, keeps, kindOf), stage);
  const report = diagnostics.filter(shown);
  let held = diagnostics.length - report.length;

  let intent: IntentCheckResult | undefined;
  if (input.intent) {
    const violations = input.intent.violations.filter((v) => stageAtMost(predicateStage(v.predicate), stage));
    held += input.intent.violations.length - violations.length;
    // `ok` as the shown set reads it: the plan compiled and no shown gating assertion failed.
    const compiled = !input.diagnostics.some((d) => d.severity === "error");
    intent = { ...input.intent, violations, ok: compiled && !violations.some((v) => v.gate) };
  }
  const graphShown = stageAtMost(GRAPH_STAGE, stage);
  if (input.graph && !graphShown && !input.graph.ok) held += 1;
  const keepsShown = keeps?.filter((k) => stageAtMost(keepStage(k.node, kindOf), stage));
  // A broken soft keep is a finding of its own (`next`'s intent tier); a broken hard keep is
  // already counted as its warning, and an advisory keep is never a finding.
  const softBroken = (ks: readonly KeepResult[] | undefined): number =>
    ks ? ks.filter((k) => k.grade === "soft" && !k.holds).length : 0;
  held += softBroken(keeps) - softBroken(keepsShown);

  const out: NextInput = {
    diagnostics: input.diagnostics.filter(shown),
    ...(input.lint ? { lint: input.lint.filter(shown) } : {}),
    ...(input.layers ? { layers: input.layers } : {}),
    ...(intent ? { intent } : {}),
    ...(input.graph && graphShown ? { graph: input.graph } : {}),
    ...(input.profileLint ? { profileLint: input.profileLint.filter(shown) } : {}),
    ...(input.taste && stage === "drafting" ? { taste: input.taste } : {}),
    ...(keepsShown ? { keeps: keepsShown } : {}),
  };
  return { stage, input: out, diagnostics: report, held };
}
