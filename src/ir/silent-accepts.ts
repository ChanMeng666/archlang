/**
 * Warnings for what the resolver used to accept without a word (product-roadmap RM1.4): a
 * length that reads as metres (`W_LENGTH_IN_METRES`) and a written size or door position that
 * `grid` moved (`W_GRID_SNAPPED`); and a length that is a binding times itself (`W_AREA_AS_LENGTH`,
 * AF10 step 2, first slice). All are warnings only: the plan compiles and draws exactly as before, and a plan that
 * triggers none gets no new byte anywhere.
 *
 * Each helper compares numbers the element has already computed and, only when it reports,
 * pushes one diagnostic through `ctx.diag`, which charges the step meter before the push
 * (`DIAGNOSTIC_STEPS`, `src/ir.ts`). A value that is not finite, or lies outside
 * {@link MODEL_RANGE_MM}, is never quoted: other checks own it, and a message never prints
 * `NaN`, `Infinity` or an exponent.
 */

import type { Span } from "../diagnostics.js";
import { type Expr, exprSpan } from "../expr.js";
import type { ResolveCtx } from "../registry.js";
import { fmt3, fmtWritten, MODEL_RANGE_MM } from "../num-format.js";

/** A value a message may quote: finite and inside the modelling range. */
const quotable = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= MODEL_RANGE_MM;

/**
 * A room side below this (mm) reads as metres when BOTH sides are below it: no room is under
 * 100 mm across, while a room written in metres (`size 4x3`) has both sides under 100.
 */
export const METRE_ROOM_SIDE_MM = 100;
/** A wall thinner than this (mm) reads as metres: a wall in metres (`thickness 0.2`) is under 10. */
export const METRE_WALL_THICKNESS_MM = 10;

/**
 * `W_LENGTH_IN_METRES`: `values`, as written, read as millimetres although they look like metres.
 * `what` is the clause (`size`, `thickness`), `subject` the element; the hint quotes the clause
 * written in millimetres. Returns whether it reported.
 */
export function noteMetres(
  ctx: Pick<ResolveCtx, "diag">,
  subject: string,
  what: string,
  values: readonly number[],
  span: Span | undefined,
): boolean {
  if (!values.every((v) => quotable(v) && quotable(v * 1000) && v > 0)) return false;
  const written = values.map(fmt3).join(" x ");
  const asMm = values.map((v) => `${fmt3(v)} mm`).join(" x ");
  const meant = values.map((v) => fmt3(v * 1000)).join("x");
  ctx.diag({
    severity: "warning",
    code: "W_LENGTH_IN_METRES",
    message: `${subject} ${what} ${written} is read as ${asMm}: lengths are millimetres`,
    hints: [`If you meant metres, write \`${what} ${meant}\`.`],
    ...(span ? { span } : {}),
  });
  return true;
}

/**
 * `W_AREA_AS_LENGTH` (AF10 step 2, first slice; ruling RM-D81): the length `e`, drawn as
 * `value`, is a binding times itself (`W*W`, or a name bound to `W*W`), which is an area when the
 * binding is a length. Reads no threshold: the square is the whole signal, whatever its size, but
 * a square of 0 is not reported (it has no size to mislead, and a zero size is its element's own
 * error). `what` names the clause without an id (`a room's size`); `subject` names the element in
 * the hint (`Room "r"`, as the sibling helpers do). `room`: the length is a room side, so the hint
 * also offers the square room of that area. Reports only.
 */
export function noteSquare(
  ctx: Pick<ResolveCtx, "diag" | "squaredName">,
  subject: string,
  what: string,
  e: Expr,
  value: number,
  span: Span | undefined,
  room = false,
): void {
  if (value === 0) return;
  const n = ctx.squaredName?.(e);
  if (n === undefined) return;
  const shown = e.t === "ref" ? e.name : `${n}*${n}`;
  const drawn = quotable(value) ? ` of ${fmt3(value)} mm` : "";
  const at = exprSpan(e) ?? span;
  const square = room ? `, or, for a room of that area, \`size ${n} x ${n}\`` : "";
  ctx.diag({
    severity: "warning",
    code: "W_AREA_AS_LENGTH",
    message: `\`${shown}\` is \`${n}\` times itself, an area if \`${n}\` is a length, but ${what} reads it as a length${drawn}`,
    hints: [
      `${subject}: write the length itself (\`${n}\`)${square}. Lengths are millimetres and are never converted.`,
    ],
    ...(at ? { span: at } : {}),
  });
}

/** The written room `size` reads as metres: both sides positive and under {@link METRE_ROOM_SIDE_MM}. */
export const roomSizeLooksMetric = (w: number, h: number): boolean =>
  w > 0 && h > 0 && w < METRE_ROOM_SIDE_MM && h < METRE_ROOM_SIDE_MM;

/** The written wall thickness reads as metres: positive and under {@link METRE_WALL_THICKNESS_MM}. */
export const thicknessLooksMetric = (t: number): boolean => t > 0 && t < METRE_WALL_THICKNESS_MM;

/**
 * A written wall thickness `written` that the element draws as `drawn`, said out loud (RM1.4):
 * metres (`thickness 0.2`, `W_LENGTH_IN_METRES`), else a thickness `grid` moved (`W_GRID_SNAPPED`).
 * `clause` is the word written before the value (`thickness`; `exterior` or `partition` on
 * `walls from rooms`).
 */
export function noteThickness(
  ctx: Pick<ResolveCtx, "diag" | "grid">,
  subject: string,
  written: number,
  drawn: number,
  span: Span | undefined,
  clause = "thickness",
): void {
  if (thicknessLooksMetric(written) && noteMetres(ctx, subject, clause, [written], span)) return;
  noteSnap(ctx, subject, clause, [written], [drawn], span);
}

/**
 * `W_GRID_SNAPPED`: `grid` moved the written values `written` to `drawn`. Reports only when a
 * value prints differently once snapped (a value already on the grid is never reported), and
 * names both. `point` prints the pair as a coordinate `(x, y)`, otherwise as `w x h`.
 */
export function noteSnap(
  ctx: Pick<ResolveCtx, "diag" | "grid">,
  subject: string,
  what: string,
  written: readonly number[],
  drawn: readonly number[],
  span: Span | undefined,
  point = false,
): void {
  // The common case, a value already on the grid, returns here having allocated nothing.
  if (!(ctx.grid > 0) || written.every((v, i) => v === drawn[i])) return;
  if (!written.every(quotable) || !drawn.every(quotable)) return;
  const b = drawn.map(fmt3);
  // Reported when the value prints differently once snapped, and then quoted as written: a
  // value `fmt3` would round (`2749.9999`) is printed in full, never as the `2750` it is not.
  if (written.every((v, i) => fmt3(v) === b[i])) return;
  // Quoted without float noise only where the shorter form snaps where the value does (RM9.4).
  const a = written.map((v) => fmtWritten(v, (x) => Math.round(x / ctx.grid) * ctx.grid));
  const show = (xs: string[]): string => (point ? `(${xs.join(", ")})` : xs.join(" x "));
  const g = fmt3(ctx.grid);
  ctx.diag({
    severity: "warning",
    code: "W_GRID_SNAPPED",
    message: `${subject} ${what} ${show(a)} was snapped to ${show(b)} by \`grid ${g}\``,
    hints: [
      `The drawing, \`describe()\` and \`lint()\` all use ${show(b)}. Write a multiple of ${g} mm, or set a finer \`grid\`, to keep the value as written.`,
    ],
    ...(span ? { span } : {}),
  });
}
