/**
 * `lint(source)` — architectural soundness rules, as diagnostics.
 *
 * The compiler tells you a plan is *valid* (it parses and resolves). Lint tells you
 * it is *sound* — that an agent-drawn plan is actually habitable: every room can be
 * entered, bedrooms have a window, rooms aren't implausibly tiny, doors are wide
 * enough to pass, and the building has an entrance. These are exactly the mistakes a
 * model makes when it invents coordinates, and they ship as the same errors-as-data
 * the rest of ArchLang uses (a `W_*` code + byte span + a catalog `fix`), so an agent
 * self-corrects from them with no extra plumbing.
 *
 * Pure and deterministic. Each rule is its own module in `lint/rules/` checking a
 * shared, precomputed {@link import("./lint/context.js").LintContext}; this entry
 * point builds the context and folds the ordered rule list (`LINT_RULES`) — the
 * emission order is part of the output contract. Thresholds/profiles live in
 * `lint/ruleset.ts` (re-exported here, so the public surface is unchanged).
 */

import { buildingRoomReach, DEFAULT_TOL, resolvePlan, roomUses, storeyGrounded } from "./analyze.js";
import type { ResolvedLevel, ResolvedPlan, RRoom } from "./ir.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { type BuildingContext, buildLintContext, type LintLayer, NO_BUILDING } from "./lint/context.js";
import { dwellingReading } from "./analyze/dwelling.js";
import { foldCoverage, type LintCoverage, type LintUnclassifiedRoom, type SkipNote } from "./lint/coverage.js";
import { MAX_ATTRIBUTION_MEASURES } from "./lint/rules/circulation-facts.js";
import { ONCE_PER_PLACEMENT_CODES } from "./lint/rules/dims.js";
import { LINT_RULES } from "./lint/rules/index.js";
import { LINT_PROFILES, type LintOptions, type LintRuleset, resolveRuleset } from "./lint/ruleset.js";
import { storeyHasEntranceCandidate } from "./analyze/entrance.js";
import { arrivalRuns, levelsEnteredFromBelow, verticalConnections, verticalReach } from "./vertical.js";

export {
  ADVISORY_CODE_PROFILES,
  DEFAULT_RULESET,
  LINT_PROFILES,
  LINT_PROFILE_NAMES,
  type LintOptions,
  type LintRuleset,
} from "./lint/ruleset.js";
export type { BuildingContext, DiagnosticSite, LintContext, LintLayer, LintRule } from "./lint/context.js";

/**
 * Each lint code's {@link LintLayer}, read off the rule that declares it in its `codes` (ADR
 * 0032). Built once from `LINT_RULES`, in rule order; frozen. A code no rule declares is absent.
 */
export const LINT_CODE_LAYERS: Readonly<Record<string, LintLayer>> = Object.freeze(
  Object.fromEntries(LINT_RULES.flatMap((r) => r.codes.map((c) => [c, r.layer] as const))),
);
export type {
  LintCoverage,
  LintCoverageFamily,
  LintCoverageSkip,
  LintFamily,
  LintSkipReason,
  LintUnclassifiedRoom,
  EnclosureBudgetCap,
} from "./lint/coverage.js";
export { LINT_RULES } from "./lint/rules/index.js";

/**
 * Lint ArchLang `source` and return architectural-soundness warnings. Returns `[]`
 * when the plan has fatal errors (resolution failed — there is nothing sound to
 * check; compile/validate surfaces those). Never throws.
 *
 * **Multi-storey** (`level <n> { … }`): every storey is a building in its own right —
 * each needs its own reachable rooms and its own windows — so the rules run per level and
 * the results are concatenated in level order, each warning tagged with
 * {@link Diagnostic.level}. What a storey does NOT need is its own front door: a
 * `stair`/`elevator`/`escalator` with the same id on two storeys is a shaft, and a
 * storey joined by one to a storey that reaches the outside is itself reached — you arrive
 * in the room the shaft lands in. That building-level fact is computed once here (see
 * {@link buildingContexts}) and handed to each storey's rules; a single-storey plan takes
 * the one-plan path with an inert context, so it lints exactly as before.
 */
export function lint(source: string, opts: LintOptions = {}): Diagnostic[] {
  return lintWithCoverage(source, opts).diagnostics;
}

/**
 * `lint()`'s diagnostics, plus the coverage report (plan-soundness PS2.13): which rule
 * families ran, which skipped and why, and the rooms with no classified use. One run of the
 * rules produces both. `diagnostics` is exactly what `lint()` returns, element for element;
 * the report sits beside it and never inside it, so nothing that reads diagnostics can see a
 * difference. `coverage` is `null` when the plan does not resolve (nothing ran). `layers` is
 * {@link LINT_CODE_LAYERS}, each code's soundness layer (ADR 0032), beside the diagnostics and
 * never inside them: `taste()` reads it to cap on validity warnings only. Pure.
 */
export function lintWithCoverage(
  source: string,
  opts: LintOptions = {},
): { diagnostics: Diagnostic[]; coverage: LintCoverage | null; layers: Readonly<Record<string, LintLayer>> } {
  // Ruleset cascade: defaults → named profile → explicit per-call overrides.
  const profileRules = opts.profile ? (LINT_PROFILES[opts.profile] ?? {}) : {};
  const rules: LintRuleset = resolveRuleset(profileRules, opts.ruleset);
  const { ir, levels } = resolvePlan(source, opts);
  if (!ir) return { diagnostics: [], coverage: null, layers: LINT_CODE_LAYERS };

  const notes: SkipNote[] = [];
  const unclassified: LintUnclassifiedRoom[] = [];
  // PS2.18: read once over every storey's rooms; recorded only when it is not a dwelling, so a
  // dwelling's contexts are exactly the ones they were.
  const storeyIrs = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const nonResidential =
    dwellingReading(storeyIrs.flatMap((p) => p.elements.filter((e): e is RRoom => e.kind === "room"))) ===
    "non-residential";
  if (levels.length > 0) {
    const byLevel = buildingContexts(levels, rules.tolMm);
    if (nonResidential) for (const b of byLevel.values()) b.dwelling = "non-residential";
    const out = levels.flatMap((l) => {
      unclassified.push(...unclassifiedRooms(l.ir, l.level));
      return lintOne(l.ir, rules, byLevel.get(l.level), notes, l.level).map((d) => ({ ...d, level: l.level }));
    });
    return {
      diagnostics: reconcileSharedFixes(out, levels),
      coverage: foldCoverage(LINT_RULES, notes, unclassified, levels.length),
      layers: LINT_CODE_LAYERS,
    };
  }
  unclassified.push(...unclassifiedRooms(ir));
  return {
    diagnostics: reconcileSharedFixes(
      lintOne(ir, rules, nonResidential ? { ...NO_BUILDING, dwelling: "non-residential" } : undefined, notes),
      [{ ir }],
    ),
    coverage: foldCoverage(LINT_RULES, notes, unclassified, 1),
    layers: LINT_CODE_LAYERS,
  };
}

/** {@link lintWithCoverage}'s report alone; `null` when the plan does not resolve. */
export function lintCoverage(source: string, opts: LintOptions = {}): LintCoverage | null {
  return lintWithCoverage(source, opts).coverage;
}

/** The rooms of one storey whose {@link roomUses} is empty, in source order. */
function unclassifiedRooms(ir: ResolvedPlan, level?: number): LintUnclassifiedRoom[] {
  return ir.elements
    .filter((e): e is RRoom => e.kind === "room" && roomUses(e).size === 0)
    .map((r) => ({ name: r.label ?? r.id, id: r.id, ...(level !== undefined ? { level } : {}) }));
}

/** One resolved storey a {@link reconcileSharedFixes} census reads (`level` absent for a
 *  single-storey plan). */
export interface LintedStorey {
  ir: ResolvedPlan;
  level?: number;
}

/** The identity of a SOURCE statement: file plus byte span (two modules' offsets are not
 *  comparable, so the file is part of it — the key `dimInside`/`dimOverlap` dedupe on). */
const statementKey = (file: string | undefined, span: Span): string => `${file ?? ""}:${span.start}:${span.end}`;

/**
 * Reconcile the fixes on diagnostics whose statement is SHARED by several `place`d
 * instances — one component placed twice is one source span behind two resolved elements,
 * and a fix edits that one span for all of them.
 *
 * Each rule mints its fix per element, pulled back into the element's own frame
 * ({@link import("./lint/context.js").LintContext.frameOf}). For a statement drawn by
 * elements of two or more placements (a `place`d instance on a given storey), a fix
 * survives only when EVERY raiser the statement has raised the same code and every one of
 * them carries the same edits. A raiser is an element for a rule that reports per element,
 * and a placement for one that reports once per statement per placement
 * ({@link ONCE_PER_PLACEMENT_CODES}). When they agree ONE copy is kept, on the first diagnostic, so
 * `arch fix` applies and reports it once. Otherwise the fixes are stripped from the whole
 * group — the diagnostics stay, each with a hint naming how many instances share the
 * statement — because no single rewrite of the shared source is right for all of them,
 * and a wrong one would silently move a placement nobody asked to move (ADR 0005: decline,
 * never guess; `repair.ts` refuses a multi-resolved statement for the same reason).
 *
 * Deliberately NOT reconciled: a statement no `place`d instance draws (a root `for`, a
 * root statement shared into every storey) or drawn by one placement only — those keep
 * the behaviour they had. So a plan with no shared placed statement comes out of here
 * unchanged, element for element, in the same order.
 */
export function reconcileSharedFixes(diags: Diagnostic[], storeys: readonly LintedStorey[]): Diagnostic[] {
  interface Drawn {
    ids: string[];
    placements: Set<string>;
    placed: boolean;
  }
  const drawn = new Map<string, Drawn>();
  for (const { ir, level } of storeys) {
    for (const e of ir.elements) {
      if (!e.span) continue;
      const k = statementKey(e._file, e.span);
      const s = drawn.get(k) ?? { ids: [], placements: new Set<string>(), placed: false };
      drawn.set(k, s);
      s.ids.push(e.id);
      s.placements.add(`${level ?? ""}:${e._instance ?? ""}`);
      if (e._instance !== undefined) s.placed = true;
    }
  }

  // Diagnostics of one code on one shared statement, in output order.
  const groups = new Map<string, number[]>();
  diags.forEach((d, i) => {
    if (!d.span || d.code === undefined) return;
    const s = drawn.get(statementKey(d.file, d.span));
    if (!s?.placed || s.placements.size < 2) return;
    const k = `${d.code}|${statementKey(d.file, d.span)}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });

  const out = diags.slice();
  for (const idx of groups.values()) {
    const first = diags[idx[0]!]!;
    if (!idx.some((i) => diags[i]!.fixes?.length)) continue; // no fix to reconcile
    const s = drawn.get(statementKey(first.file, first.span!))!;
    const editsOf = (d: Diagnostic): string =>
      JSON.stringify((d.fixes ?? []).map((f) => [f.applicability, f.fixId ?? null, f.file ?? null, f.edits]));
    // Each raiser raises a code at most once, so equal counts mean every raiser raised it.
    const perPlacement = ONCE_PER_PLACEMENT_CODES.has(first.code!);
    const raisers = perPlacement ? s.placements.size : s.ids.length;
    const allRaise = idx.length === raisers;
    const withFix = idx.filter((i) => diags[i]!.fixes?.length).length;
    const agree = withFix === idx.length && idx.every((i) => editsOf(diags[i]!) === editsOf(first));
    if (allRaise && agree) {
      for (const i of idx.slice(1)) out[i] = withoutFixes(diags[i]!);
      continue;
    }
    const why = !allRaise
      ? `only ${idx.length} of the ${raisers} ${perPlacement ? "placed instances" : "elements it draws"} raise ${first.code}`
      : withFix < idx.length
        ? `a fix could be derived for only ${withFix} of them`
        : "they need different edits";
    const hint = `This statement is shared by ${s.placements.size} placed instances (${s.ids.join(", ")}), and ${why}, so no fix is offered: one edit to the shared source cannot be right for all of them. Edit it by hand, or give the instances their own statements.`;
    for (const i of idx) {
      const d = withoutFixes(diags[i]!);
      out[i] = { ...d, hints: [...(d.hints ?? []), hint] };
    }
  }
  return out;
}

/** A copy of `d` without its `fixes` key (the key is left out, never set `undefined`). */
function withoutFixes(d: Diagnostic): Diagnostic {
  const { fixes: _dropped, ...rest } = d;
  return rest;
}

/**
 * Per-storey {@link BuildingContext} for a multi-storey plan: which vertical runs are
 * real shafts (their id appears on another storey too) and, for a storey with no exterior
 * entrance of its own, which rooms a shaft delivers you into. Computed once for the whole
 * building so no rule re-derives it, and deterministic (levels are already ascending).
 */
export function buildingContexts(levels: readonly ResolvedLevel[], tolMm: number): Map<number, BuildingContext> {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  const peerIds = new Set(connections.map((c) => c.id));
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyGrounded(l.ir, tolMm ?? DEFAULT_TOL) : false;
  };
  // Room-aware: a shaft relays only from a stop whose room is walkable on its storey, on
  // the same tolerance `grounded` uses, so lint and `describe().vertical` agree.
  const roomReach = buildingRoomReach(inputs, tolMm ?? DEFAULT_TOL);
  const reach = verticalReach(inputs, grounded, roomReach);
  const runs = arrivalRuns(inputs, grounded, roomReach);
  const fromBelow = levelsEnteredFromBelow(connections, (n) => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyHasEntranceCandidate(l.ir, tolMm ?? DEFAULT_TOL) : false;
  });
  const out = new Map<number, BuildingContext>();
  // One re-measure budget for the whole building, not one per storey.
  const attributionMeasures = { left: MAX_ATTRIBUTION_MEASURES, storeys: levels.length };
  for (const l of levels) {
    out.set(l.level, {
      multiStorey: true,
      verticalPeerIds: peerIds,
      arrivalRooms: reach.arrivalRooms.get(l.level) ?? [],
      arrivalShafts: runs.get(l.level) ?? [],
      attributionMeasures,
      ...(fromBelow.has(l.level) ? { enteredFromBelow: true } : {}),
      // Levels arrive ascending, so the first is the lowest.
      ...(l === levels[0] ? { lowestStorey: true as const } : {}),
    });
  }
  return out;
}

/** Fold the ordered rule list over one resolved plan (one storey, or the whole plan). */
function lintOne(
  ir: Parameters<typeof buildLintContext>[0],
  rules: LintRuleset,
  building: BuildingContext | undefined,
  notes: SkipNote[],
  level?: number,
): Diagnostic[] {
  // The coverage seam: a rule's `ctx.skip(...)` is filed under the family of the rule
  // running, which the fold — not the rule — supplies.
  let current = LINT_RULES[0]!;
  const ctx = buildLintContext(ir, rules, building, (reason, room, cap) =>
    notes.push({
      rule: current.name,
      family: current.family,
      reason,
      ...(room ? { room } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(cap ? { cap } : {}),
    }),
  );
  const out: Diagnostic[] = [];
  for (const rule of LINT_RULES) {
    current = rule;
    for (const d of rule.check(ctx)) out.push(withFixProvenance(d));
  }
  return out;
}

/**
 * Carry a lint diagnostic's `file` down onto every one of its fixes — the same weld
 * `stampProvenance` performs for the resolve stage, applied once at the rule-fold boundary
 * so no individual rule can forget it.
 *
 * This is what makes `applyFixes`'s imported-module guard reachable at all from lint: that
 * guard keys on the SUGGESTION's `file`, and until this existed every lint fix was minted
 * without one — so a fix whose edit spans are offsets into an `import`ed module was applied
 * straight into the importer, corrupting it (reproduced on an unmodified `W_DIM_INSIDE`).
 * A diagnostic on an element written in the compiled source has no `file`, so it and its
 * fixes come out of here untouched.
 */
function withFixProvenance(d: Diagnostic): Diagnostic {
  if (d.file === undefined || !d.fixes) return d;
  return { ...d, fixes: d.fixes.map((f) => ({ ...f, file: d.file })) };
}
