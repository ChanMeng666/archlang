/**
 * Knobs (card P4, PS-D4): a slider for each plain number a plan names at its top level.
 *
 * Pure: it reads the source text and the parse the compile already made (`compile().ast`, read and
 * never mutated) and returns text. A knob is a root-plan `let NAME = <literal>` whose expression is
 * one positive numeric literal as the language writes it (`4000`, `4.5m`, `450cm`, `4000mm`). A
 * `let` bound to anything else (an expression, a list, a value-function, a negative number, an
 * imperial length) is no knob, and neither is one inside a block, a loop, a level or a component,
 * nor a name the root declares twice or reassigns (the rule `arch impact --set` refuses on,
 * `applyLetOverride` in `src/impact.ts`). Moving a knob rewrites only that literal's characters.
 */
import type { LetNode, PlanNode } from "archlang";

/** How the literal spells its unit: bare (millimetres), or a metric suffix. */
export type KnobUnit = "" | "mm" | "cm" | "m";

export interface Knob {
  /** The `let`'s name. */
  name: string;
  /** What the slider shows: the trailing `# comment` of the `let`'s line, else the name. */
  label: string;
  /** The literal's value: millimetres for a length, the number itself for a count. */
  value: number;
  /** Where the literal stands in the source (string offsets, the AST's span convention). */
  span: { start: number; end: number };
  /** The literal's unit spelling; a rewrite keeps it. */
  unit: KnobUnit;
  /** A whole-number count (step 1, at least 1) rather than a length on the plan grid. */
  count: boolean;
  min: number;
  max: number;
  step: number;
}

/** The snap module a plan without a `grid` uses for its knobs. */
export const DEFAULT_KNOB_GRID = 50;
/** How far a knob reaches either side of the value it started from. */
export const KNOB_REACH = 0.4;

const LITERAL = /^(\d+(?:\.\d+)?|\.\d+)(mm|cm|m)?$/;
const UNIT_DIVISOR: Record<KnobUnit, number> = { "": 1, mm: 1, cm: 10, m: 1000 };

/** Whether `name` says the value counts things: a `COUNT`, `N` or `NUM` word in it. */
function countName(name: string): boolean {
  return name.split("_").some((w) => /^(count|n|num)$/i.test(w)) || /count/i.test(name);
}

/**
 * The slider range for a `let` worth `value`: ±40 % of it. A count (a count-like name, or a whole
 * number under 20) steps by 1 and never goes under 1. A length steps by the plan's grid (50 mm when
 * the plan has none) and lies on that grid around its value, so the value itself is a stop. Null
 * when the value is too small for one step either side.
 */
export function knobRange(
  name: string,
  value: number,
  unit: KnobUnit,
  grid: number,
): { min: number; max: number; step: number; count: boolean } | null {
  if (!(value > 0) || !Number.isFinite(value)) return null;
  if (unit === "" && Number.isInteger(value) && (countName(name) || value < 20)) {
    const min = Math.max(1, Math.min(value - 1, Math.round(value * (1 - KNOB_REACH))));
    const max = Math.max(value + 1, Math.round(value * (1 + KNOB_REACH)));
    return { min, max, step: 1, count: true };
  }
  const step = grid > 0 ? grid : DEFAULT_KNOB_GRID;
  const k = Math.round((value * KNOB_REACH) / step);
  if (k < 1) return null;
  const low = Math.min(k, Math.ceil(value / step) - 1);
  if (low < 1) return null;
  return { min: value - low * step, max: value + k * step, step, count: false };
}

/** The text after the literal on its line, read as a trailing `# comment`; "" when there is none. */
function trailingComment(source: string, end: number): string {
  const nl = source.indexOf("\n", end);
  const rest = source.slice(end, nl < 0 ? source.length : nl);
  const m = /^[ \t]*#[ \t]*(.*?)\s*$/.exec(rest);
  return m ? m[1]! : "";
}

/** The knobs of `plan` (the parse of `source`), in source order. */
export function extractKnobs(source: string, plan: PlanNode | undefined): Knob[] {
  if (!plan) return [];
  const lets = plan.body.filter((s): s is LetNode => s.kind === "let");
  const seen = new Map<string, number>();
  for (const s of lets) seen.set(s.name, (seen.get(s.name) ?? 0) + 1);
  const assigned = new Set(plan.body.flatMap((s) => (s.kind === "assign" ? [s.name] : [])));
  const knobs: Knob[] = [];
  for (const s of lets) {
    if (!s.span || s.value.t !== "num" || seen.get(s.name) !== 1 || assigned.has(s.name)) continue;
    const text = source.slice(s.span.start, s.span.end);
    const eq = text.indexOf("=");
    if (eq < 0) continue;
    const after = text.slice(eq + 1);
    const start = s.span.start + eq + 1 + (after.length - after.trimStart().length);
    const literal = source.slice(start, s.span.end);
    const m = LITERAL.exec(literal);
    if (!m) continue;
    const unit = (m[2] ?? "") as KnobUnit;
    const value = s.value.value;
    const range = knobRange(s.name, value, unit, plan.grid);
    if (!range) continue;
    const label = trailingComment(source, s.span.end) || s.name;
    knobs.push({ name: s.name, label, value, span: { start, end: s.span.end }, unit, ...range });
  }
  return knobs;
}

/** `n` written with at most six decimals and no trailing zeros (`4.5`, `4000`, `0.25`). */
function plain(n: number): string {
  const s = n.toFixed(6);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** The literal for `value` (millimetres, or a count) in the unit spelling `unit`. */
export function literalFor(value: number, unit: KnobUnit): string {
  return `${plain(value / UNIT_DIVISOR[unit])}${unit}`;
}

/** What the slider's readout says: `4.5 m`, `4000 mm`, or a bare count. */
export function knobReadout(knob: Pick<Knob, "count" | "unit">, value: number): string {
  if (knob.count) return plain(value);
  return `${plain(value / UNIT_DIVISOR[knob.unit])} ${knob.unit || "mm"}`;
}

/** `source` with the knob's literal set to `value`; every other character is unchanged. */
export function rewriteKnob(source: string, knob: Pick<Knob, "span" | "unit">, value: number): string {
  return `${source.slice(0, knob.span.start)}${literalFor(value, knob.unit)}${source.slice(knob.span.end)}`;
}
