/**
 * `W_FOOTPRINT_TRANSPOSED` (plan-soundness PS2.11c): a piece of a family that comes in one shape,
 * written with its two sides the wrong way round, so its symbol draws turned a quarter and
 * stretched (`sofa_l … size 900x2400` with no `rotate`: a thin L one seat deep; `bed … size
 * 1900x700`: a bed lying across its own length).
 *
 * The test reads the symbol's own frame, never the plan rectangle: a piece is drawn back-on-top
 * in a `pw × ph` frame and then turned by `rotate`, so `pw × ph` is `size` with its sides
 * swapped under a quarter-turn (`furniture.render`). That frame is what the author wrote in
 * `size` (as plan width × height under `rotate 0|180`, as along × depth for `against`), and
 * a `place` turn or mirror carries it unchanged, so the rule is D4-invariant by construction.
 *
 * Which families: only those the catalogue marks `fixedAspect` (`src/fixtures-catalog.ts`), each
 * with its reason. A family sold in both shapes (a single-door wardrobe is deeper than wide, a
 * lateral filing cabinet wider than deep) is never judged, so a standard product never warns.
 */

import type { Diagnostic } from "../../diagnostics.js";
import { actOnQuarterTurn, type D4, inverse } from "../../algebra/d4.js";
import { backsOntoWall, defaultFootprint, fixtureSpec } from "../../fixtures-catalog.js";
import { fmt2 } from "../../num-format.js";
import type { RFurniture } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";
import { mm } from "../measure.js";
import { inRoomPhrase } from "./furniture-relations.js";

/**
 * How oblong the written frame must be for its long axis to mean anything: the long side at
 * least 5/4 of the short (`4 · long ≥ 5 · short`, exact on the lattice). Every `fixedAspect`
 * footprint is itself at least that oblong (`test/lint-clearances-transposed-leaf.test.ts`
 * holds the catalogue to it), so a near-square frame is a custom size, never a turned one.
 */
const oblong = (long: number, short: number): boolean => 4 * long >= 5 * short;

/** The catalogue footprint a transposition is judged against, or `null` for a piece the rule
 *  does not judge (no footprint, or a family sold in more than one shape). */
function judgedFootprint(category: string): { along: number; depth: number } | null {
  const spec = fixtureSpec(category);
  if (spec?.fixedAspect !== true || spec.symmetric === true) return null;
  return defaultFootprint(category);
}

/** The piece's symbol frame (`furniture.render`): `size`, sides swapped under a quarter-turn. */
function symbolFrame(f: RFurniture): { w: number; h: number } {
  const deg = f.rotate ?? 0;
  return deg === 90 || deg === 270 ? { w: f.size.h, h: f.size.w } : { w: f.size.w, h: f.size.h };
}

/**
 * The side-on spelling for an `against` piece that is deeper than wide (a bed, a crib, a
 * treadmill) and was written with its long side along the wall. The resolved plan rectangle is
 * already the side-on footprint, so the recipe keeps it and turns the symbol a quarter, which
 * points its back along the wall: `at (x,y) size <w>x<h> rotate <r + 90>`. Every number is
 * written in the statement's own frame: a `place` turn swaps the sides and pulls the rotation
 * back through g⁻¹, and a placed piece's position is left to the author (a plan coordinate is
 * not its component's). No frame, or a turn off the quarter, means no numbers.
 */
function sideOnRecipe(f: RFurniture, g: D4 | null): string {
  const lead = "To stand it side-on to the wall instead, write";
  const deg = f.rotate ?? 0;
  if (g === null || deg % 90 !== 0)
    return `${lead} it with \`at (x,y)\` or \`in <room> anchor <edge> flush\`, keep its plan width x height, and add the \`rotate\` that points its back along the wall.`;
  const local = g.k % 2 === 1 ? { w: f.size.h, h: f.size.w } : f.size;
  const turn = actOnQuarterTurn(inverse(g), (deg + 90) % 360);
  const at = f._instance === undefined ? `(${fmt2(f.at.x)},${fmt2(f.at.y)})` : "(x,y)";
  return `${lead} \`at ${at} size ${fmt2(local.w)}x${fmt2(local.h)} rotate ${turn}\` (the same floor, its symbol turned a quarter so its back runs along the wall), or \`in <room> anchor <edge> flush\` with that size and turn.`;
}

/**
 * A `fixedAspect` piece whose symbol frame has its long side where the catalogue has its short
 * one, by at least 5:4. The catalogue footprint is `along × depth` (along the back edge × out
 * from it), the symbol frame's `w × h`. So a `sofa_l` (2600 × 1600) written `size 900x2400` fires,
 * and so does `900x1300` (an undersized one); `2000x1000` (a smaller L) and `1300x1250` (near
 * square) do not. A comparison of aspect classes, not a tolerance on the ratio: an author who
 * turned the piece rarely also reproduces its proportions (the audits' instances are 12 % and
 * 39 % off them).
 *
 * The one fix: swap the two sides, offered only when `size` is one literal token and the swapped
 * size, as drawn (snapped), IS the catalogue footprint. `maybe-incorrect`: the swap changes which
 * floor the piece covers (an `at (x,y)` piece keeps its top-left corner), so it can land on a
 * wall or another piece; `archlang fix --unsafe` applies it.
 *
 * The hint quotes the piece's id only when the author wrote one (ADR 0029 §6): an assigned id
 * renumbers the moment an earlier piece is named.
 *
 * An `against` piece written with its long side along the wall (a crib or a treadmill meant
 * side-on) still warns: `against` derives the turn that backs the piece onto the wall, so the
 * symbol IS drawn head-to-wall and stretched. Side-on is spelled `at (x,y)` or
 * `in <room> anchor <edge> flush` with a `rotate`, which this rule reads as the right frame and
 * `W_FIXTURE_BACK_TO_ROOM` declines (PS2.50). The hint gives that spelling with numbers for a
 * piece deeper than wide whose back need not reach the wall (a bed, a crib, a treadmill), and
 * never for a wide one (a TV, a bar counter: its end on the wall is not side-on) or one that
 * backs onto any wall it touches (`backsOntoWall`).
 */
export const footprintTransposed: LintRule = {
  name: "footprint-transposed",
  family: "furniture",
  layer: "validity",
  codes: ["W_FOOTPRINT_TRANSPOSED"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of ctx.furniture) {
      const fp = judgedFootprint(f.category);
      if (fp === null) continue;
      const s = symbolFrame(f);
      const wide = fp.along > fp.depth; // the catalogue's long side runs along the back
      const transposed = wide ? oblong(s.h, s.w) : oblong(s.w, s.h);
      if (!transposed) continue;
      const name = f.label ?? f.category;
      const where = inRoomPhrase(f, ctx);
      const exact = s.w === fp.depth && s.h === fp.along;
      const swap = exact ? f._sizeSwap : undefined;
      // `against wall` and `against <room>.<edge>` derive the turn from the wall, and refuse a
      // `rotate` (`E_FURN_AGAINST`). Read off the fields a `place` frame carries across.
      const turnable = f._againstWall === undefined && f._relation === undefined;
      const ref = f._idAuthored === true ? `"${f.id}"` : `the ${name}${inRoomPhrase(f, ctx, true)}`;
      const shape = wide
        ? `a ${f.category} is wider than it is deep (${mm(fp.along)} × ${mm(fp.depth)} mm), so its long side is drawn as its depth`
        : `a ${f.category} is deeper than it is wide (${mm(fp.along)} × ${mm(fp.depth)} mm), so its long side is drawn along its back`;
      out.push({
        severity: "warning",
        code: "W_FOOTPRINT_TRANSPOSED",
        ...ctx.at(f),
        message: `The ${name}${where} is drawn turned a quarter: its symbol is ${mm(s.w)} mm along its back and ${mm(s.h)} mm deep, but ${shape}.`,
        hints: [
          `Swap the two sides of \`size\` on ${ref}${swap ? ` (\`size ${swap.text}\`)` : ""}` +
            (turnable
              ? ", or keep the size and turn the symbol a quarter: add 90 to its `rotate` or take 90 from it, whichever puts its back where it belongs."
              : wide || backsOntoWall(f.category)
                ? "; the wall it backs onto states its turn."
                : `; \`against\` always backs a piece onto the wall. ${sideOnRecipe(f, ctx.frameOf(f))}`),
        ],
        ...(swap
          ? {
              fixes: [
                {
                  title: `swap the size to \`${swap.text}\`, the ${f.category}'s catalogue footprint the right way round`,
                  applicability: "maybe-incorrect" as const,
                  fixId: "footprint-transposed",
                  edits: [{ span: swap.span, newText: swap.text }],
                },
              ],
            }
          : {}),
      });
    }
    return out;
  },
};
