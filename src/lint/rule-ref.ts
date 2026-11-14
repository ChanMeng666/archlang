/**
 * Which ruleset number a lint diagnostic was raised against (card RM1.6b), kept BESIDE the
 * diagnostic in a `WeakMap`, never on it: `lint()` returns the same objects, with the same keys,
 * and `JSON.stringify(lint(src))` is unchanged. A rule names the key at the point it pushes the
 * diagnostic ({@link cite}), because one code can come from several keys chosen there and then
 * (`W_ROOM_TOO_SMALL` from `minRoomAreaM2`, `minRoomAreaByUseM2.<use>` or
 * `minDoubleBedroomAreaM2`), so a lookup by code would name the wrong one.
 *
 * A copy of a diagnostic does not inherit the entry: `lint()` carries it across its own copies
 * ({@link carryRule}). Nor does a `structuredClone` or a `postMessage`, so the reference is read
 * where `lint()` ran, before the diagnostic leaves (`diagnosticToJson`'s `rule` option, which the
 * provenance table resolves: `diagnosticRule` in `provenance.ts`, off the compile path). Pure: an
 * entry is written once per diagnostic a run creates and read only by that run's callers.
 */

import type { UseKind } from "../ast.js";
import type { Diagnostic } from "../diagnostics.js";
import type { LintRuleset, TableKey } from "./ruleset.js";

/** A provenance key: a scalar ruleset field, or a per-use table's entry `table.use`
 *  (`minRoomAreaByUseM2.bedroom`), as the provenance table keys them. */
export type RuleKey = Exclude<keyof LintRuleset, TableKey> | `${TableKey}.${UseKind}`;

/** The ruleset number a diagnostic was raised against, and the profile the run used. */
export interface RuleRef {
  readonly key: string;
  readonly value: number | string | boolean | null;
  /** The built-in profile `lint()` ran under, `null` for none; set when the run ends. */
  profile: string | null;
}

/** What a citation keeps: the run's ruleset itself, read only when the reference is asked for. */
interface Entry {
  readonly key: string;
  readonly rules: LintRuleset;
  profile: string | null;
}

const REFS = new WeakMap<Diagnostic, Entry>();

/** A ruleset field whose value is a per-use table (an object), not a scalar. */
export const isTable = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null;

/** The value at a provenance key of a ruleset (`undefined` when it has none). */
export function valueAt(rules: Partial<LintRuleset>, key: string): unknown {
  const dot = key.indexOf(".");
  const r = rules as Readonly<Record<string, unknown>>;
  if (dot < 0) return r[key];
  const table = r[key.slice(0, dot)];
  return isTable(table) ? table[key.slice(dot + 1)] : undefined;
}

/**
 * Record that `d` was raised against `rules`' number at `key`; returns `d`, unchanged. It reads
 * nothing of `rules` here: the value is read when the reference is asked for ({@link ruleRefOf}),
 * so citing adds no ruleset read to a rule's check (`test/lint-exterior-ring.test.ts` counts the
 * reads of `wallGapMm` to prove its slit scan runs once).
 */
export function cite(rules: LintRuleset, key: RuleKey, d: Diagnostic): Diagnostic {
  REFS.set(d, { key, rules, profile: null });
  return d;
}

/** The ruleset number `d` was raised against, when a rule cited one. */
export function ruleRefOf(d: Diagnostic): RuleRef | undefined {
  const e = REFS.get(d);
  if (!e) return undefined;
  return { key: e.key, value: (valueAt(e.rules, e.key) ?? null) as RuleRef["value"], profile: e.profile };
}

/** `to`, a copy of `from`, carrying `from`'s reference. Returns `to`. */
export function carryRule<D extends Diagnostic>(from: Diagnostic, to: D): D {
  const r = REFS.get(from);
  if (r) REFS.set(to, r);
  return to;
}

/** Stamp the profile a run used on every reference its diagnostics carry. */
export function stampRuleProfile(ds: readonly Diagnostic[], profile: string | null): void {
  for (const d of ds) {
    const r = REFS.get(d);
    if (r) r.profile = profile;
  }
}
