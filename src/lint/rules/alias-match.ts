/**
 * `W_ALIAS_MATCH` — advisory: a room's use was inferred from a non-canonical alias.
 *
 * When a room carries no authored `uses`, its function is guessed from its label via
 * the shared use vocabulary ({@link classifyLabelUses}). Most labels match a canonical
 * (direct) term — "Bathroom", "Kitchen" — and read unambiguously. Some match only an
 * ALIAS (indirect) term: a "Powder" room is a WC, a "Foyer" is an entry. The guess is
 * reasonable but the intent is implicit, so this rule flags it and offers a
 * machine-applicable fix that pins the inferred classification with an explicit `uses`
 * — making the plan self-describing and silencing the advisory, with no change to the
 * room's `describe()` type (the authored `uses` reproduces the same set).
 *
 * Advisory only: it never fires for a room that authored its `uses`, and it never
 * fires when a canonical term also matched (canonical wins, no advisory).
 */

import { classifyLabelUses } from "../../vocabulary.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { UseKind } from "../../ast.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst } from "../phrases.js";

/** Human phrasing for a use kind in the advisory message. */
const USE_PHRASE: Record<UseKind, string> = {
  living: "a living space",
  kitchen: "a kitchen",
  dining: "a dining space",
  bedroom: "a bedroom",
  bath: "a bathroom",
  wc: "a WC",
  hall: "a hall",
  circulation: "circulation",
  storage: "storage",
  utility: "a utility room",
  office: "an office",
  entry: "an entry",
  garage: "a garage",
};

export const aliasMatch: LintRule = {
  name: "alias-match",
  family: "classification",
  layer: "validity",
  codes: ["W_ALIAS_MATCH"],
  check(ctx: LintContext): Diagnostic[] {
    const { rooms, labelOf, placeOf, at } = ctx;
    const out: Diagnostic[] = [];

    for (const r of rooms) {
      // Authored `uses` is explicit intent — nothing to advise.
      if (r.uses && r.uses.length > 0) continue;

      const text = r.label ?? r.id;
      const { uses, aliases } = classifyLabelUses(text);
      if (aliases.length === 0) continue;

      const label = labelOf(r);
      const aliasWords = aliases.map((a) => `"${a.word}"`).join(", ");
      const inferred = aliases.map((a) => USE_PHRASE[a.kind]).join(", ");
      const usesText = uses.join(" ");

      out.push({
        severity: "warning",
        code: "W_ALIAS_MATCH",
        ...at(r),
        // A room with no label is classified from its id, so its message names the room by where it
        // stands and leaves the id (and the word taken from it) to the hint (PS2.22).
        message:
          r.label !== undefined
            ? `Room "${label}" reads as ${inferred} only from the indirect term ${aliasWords} — its classification is a guess.`
            : `${capFirst(placeOf(r))} reads as ${inferred} only from an indirect term in its id — its classification is a guess.`,
        hints: [
          `Add \`uses ${usesText}\` to state the room's function explicitly.`,
          ...(r.label !== undefined ? [] : [`The term is ${aliasWords}, taken from the room's id \`${r.id}\`.`]),
        ],
        ...(r.span
          ? {
              fixes: [
                {
                  title: `add \`uses ${usesText}\` to room "${label}"`,
                  applicability: "machine-applicable",
                  fixId: "alias-uses",
                  edits: [{ span: { start: r.span.end, end: r.span.end }, newText: ` uses ${usesText}` }],
                },
              ],
            }
          : {}),
      });
    }
    return out;
  },
};
