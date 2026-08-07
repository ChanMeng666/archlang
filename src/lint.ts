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

import { buildDoorAccessGraph, DEFAULT_TOL, resolvePlan } from "./analyze.js";
import type { ResolvedLevel } from "./ir.js";
import type { RDoor, ROpening, RRoom } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import { type BuildingContext, buildLintContext } from "./lint/context.js";
import { LINT_RULES } from "./lint/rules/index.js";
import { DEFAULT_RULESET, LINT_PROFILES, type LintOptions, type LintRuleset } from "./lint/ruleset.js";
import { verticalConnections, verticalReach } from "./vertical.js";

export {
  DEFAULT_RULESET,
  LINT_PROFILES,
  LINT_PROFILE_NAMES,
  type LintOptions,
  type LintRuleset,
} from "./lint/ruleset.js";
export type { BuildingContext, DiagnosticSite, LintContext, LintRule } from "./lint/context.js";
export { LINT_RULES } from "./lint/rules/index.js";

/**
 * Lint ArchLang `source` and return architectural-soundness warnings. Returns `[]`
 * when the plan has fatal errors (resolution failed — there is nothing sound to
 * check; compile/validate surfaces those). Never throws.
 *
 * **Multi-storey** (`level <n> { … }`): every storey is a building in its own right —
 * each needs its own reachable rooms and its own windows — so the rules run per level and
 * the results are concatenated in level order, each warning tagged with
 * {@link Diagnostic.level}. What a storey does NOT need is its own front door: since
 * v1.21 a `stair`/`elevator`/`escalator` with the same id on two storeys is a shaft, and a
 * storey joined by one to a storey that reaches the outside is itself reached — you arrive
 * in the room the shaft lands in. That building-level fact is computed once here (see
 * {@link buildingContexts}) and handed to each storey's rules; a single-storey plan takes
 * the one-plan path with an inert context, so it lints exactly as before.
 */
export function lint(source: string, opts: LintOptions = {}): Diagnostic[] {
  // Ruleset cascade: defaults → named profile → explicit per-call overrides.
  const profileRules = opts.profile ? (LINT_PROFILES[opts.profile] ?? {}) : {};
  const rules: LintRuleset = { ...DEFAULT_RULESET, ...profileRules, ...opts.ruleset };
  const { ir, levels } = resolvePlan(source, opts);
  if (!ir) return [];

  if (levels.length > 0) {
    const byLevel = buildingContexts(levels, rules.tolMm);
    return levels.flatMap((l) => lintOne(l.ir, rules, byLevel.get(l.level)).map((d) => ({ ...d, level: l.level })));
  }
  return lintOne(ir, rules);
}

/**
 * Per-storey {@link BuildingContext} for a multi-storey plan: which vertical runs are
 * real shafts (their id appears on another storey too) and, for a storey with no exterior
 * entrance of its own, which rooms a shaft delivers you into. Computed once for the whole
 * building so no rule re-derives it, and deterministic (levels are already ascending).
 */
function buildingContexts(levels: readonly ResolvedLevel[], tolMm: number): Map<number, BuildingContext> {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  const peerIds = new Set(connections.map((c) => c.id));
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    if (!l) return false;
    const rooms = l.ir.elements.filter((e): e is RRoom => e.kind === "room");
    const doors = l.ir.elements.filter((e): e is RDoor => e.kind === "door");
    const openings = l.ir.elements.filter((e): e is ROpening => e.kind === "opening");
    return buildDoorAccessGraph(rooms, doors, tolMm ?? DEFAULT_TOL, undefined, openings).hasEntrance;
  };
  const reach = verticalReach(inputs, grounded);
  const out = new Map<number, BuildingContext>();
  for (const l of levels) {
    out.set(l.level, {
      multiStorey: true,
      verticalPeerIds: peerIds,
      arrivalRooms: reach.arrivalRooms.get(l.level) ?? [],
    });
  }
  return out;
}

/** Fold the ordered rule list over one resolved plan (one storey, or the whole plan). */
function lintOne(
  ir: Parameters<typeof buildLintContext>[0],
  rules: LintRuleset,
  building?: BuildingContext,
): Diagnostic[] {
  const ctx = buildLintContext(ir, rules, building);
  const out: Diagnostic[] = [];
  for (const rule of LINT_RULES) out.push(...rule.check(ctx).map(withFixProvenance));
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
