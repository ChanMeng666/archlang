/**
 * Room-contents advisories (plan-soundness PS2.8, PS2.9): a habitable room with no window, and
 * a furnished room missing the piece that defines it; and (product roadmap RM1.2c) a room whose
 * label names a catalogued piece it does not hold. The first two read a room's use from
 * {@link roomUses} (its `uses`, else its label through `src/vocabulary.ts`); a room with no
 * classified use is skipped and declared through `ctx.skip` (the lint coverage report is where
 * an unclassified room shows, not a guess in these rules). None reads `site` or any other storey.
 */

import {
  arcWindowRoom,
  isBedroom,
  pointInRoomBox,
  pointOnRoomEdge,
  rectOf,
  roomRing,
  roomUses,
  roomsAtPoint,
} from "../../analyze.js";
import type { UseKind } from "../../ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import { CATALOG_CATEGORIES, defaultFootprint } from "../../fixtures-catalog.js";
import type { FurnishItem } from "../../furnish-table.js";
import { FURNISH_TABLE, familyOf, servedBy } from "../../furnish-table.js";
import { distPointToWallSegment } from "../../geometry.js";
import type { RFurniture, RRoom } from "../../ir.js";
import { fmt2 } from "../../num-format.js";
import { FALLBACK_USE_VOCABULARY, normalizeLabel, USE_VOCABULARY } from "../../vocabulary.js";
import { judgesAsDwelling, type LintContext, type LintRule } from "../context.js";
import { definingItems, itemWords, pasteSet, roomDefiningItems, useNoun, washItems } from "../defining.js";
import { capFirst } from "../../naming.js";
import { areaM2, lacksZoneFixture, pasteFailureWhy, roomHasWindow } from "./per-room.js";

// ---------------------------------------------------------------------------
// W_HABITABLE_NO_WINDOW
// ---------------------------------------------------------------------------

/** The uses this rule asks for daylight, in the order a message names the room by. */
const HABITABLE: readonly [UseKind, string][] = [
  ["living", "Living room"],
  ["dining", "Dining room"],
  ["kitchen", "Kitchen"],
];

/** The room's area in a bracket after its name; folded into the name's own bracket ("… (1 of 2; 20 m²)")
 *  when it ends in one, never two brackets in a row. */
function withArea(name: string, area: string): string {
  return name.endsWith(")") ? `${name.slice(0, -1)}; ${area})` : `${name} (${area})`;
}

/** A probe this far off a room edge, outward, is past any wall it could be on. */
const OUTSIDE_PROBE_MM = 400;

/**
 * Ids of the `exterior` walls along the room's own edge with no room on their far side,
 * sampled at ¼, ½ and ¾ of each ring edge and probed {@link OUTSIDE_PROBE_MM} outward (the
 * side the room's floor is not on): an exterior wall shared with an attached wing is not an
 * outside face.
 */
function outsideWallsAlong(ctx: LintContext, r: RRoom): string[] {
  const box = ctx.roomRects.get(r.id)!;
  const ring = roomRing(box);
  const out: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    for (const t of [0.25, 0.5, 0.75]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const side = pointInRoomBox({ x: p.x + n.x, y: p.y + n.y }, box) ? -1 : 1;
      const probe = { x: p.x + side * n.x * OUTSIDE_PROBE_MM, y: p.y + side * n.y * OUTSIDE_PROBE_MM };
      if ([...ctx.roomRects.values()].some((other) => pointInRoomBox(probe, other))) continue;
      for (const s of ctx.wallSegs) {
        if (s.category !== "exterior" || out.includes(s.wallId)) continue;
        if (distPointToWallSegment(p, s) <= ctx.rules.tolMm) out.push(s.wallId);
      }
    }
  }
  return out;
}

/**
 * Does a window the analysis attributes to NO room stand on an arc wall edge whose chord ends
 * both lie on this room's perimeter? A window on an arc host is on no room's straight edge, and
 * where the shape cannot attribute it either ({@link arcWindowRoom}: no floor behind either
 * face, and no bay opening into a room through the chord) `describe().windows[].room` reads
 * `null` for it even when it may light this room: whether the room has daylight is unknown,
 * and the rule says nothing (attribution unknown). A window the shape does attribute is read
 * by {@link roomHasWindow} instead.
 */
function arcWindowUnattributed(ctx: LintContext, r: RRoom): boolean {
  const box = ctx.roomRects.get(r.id)!;
  const tol = ctx.rules.tolMm;
  return ctx.windows.some(
    (w) =>
      w.host?.arc !== undefined &&
      roomsAtPoint(w.at, ctx.roomRects, tol).length === 0 &&
      arcWindowRoom({ at: w.at, width: w.width, host: w.host }, ctx.roomRects, tol, ctx.wallSegs) === null &&
      ctx.wallSegs.some(
        (s) =>
          s.arc !== undefined &&
          distPointToWallSegment(w.at, s) <= tol &&
          pointOnRoomEdge(s.a, box, tol) &&
          pointOnRoomEdge(s.b, box, tol),
      ),
  );
}

/**
 * `W_HABITABLE_NO_WINDOW`: a room whose use is living, dining or kitchen with no window on any
 * of its walls. The window test is `W_BEDROOM_NO_WINDOW`'s ({@link roomHasWindow}, the fact
 * `describe().windows[].room` is built from), so lint and describe read one attribution. A
 * bedroom is that rule's report, never this one's: one code per room. A bath, WC, hall or any
 * other use is never asked, and a room with no classified use is skipped (declared to the
 * coverage report). A room bounded by an arc wall edge carrying a window the analysis gives to
 * no room is skipped too (attribution unknown; PS0.12, declared as `arc-window-unattributed`):
 * its bay may well light it. A room whose only habitable use is kitchen is judged only on a plan
 * that reads as a dwelling (PS2.18, {@link judgesAsDwelling}): on a café or an office it is
 * declared as `non-dwelling`, window or not. Living and dining rooms are judged on every plan.
 */
export const habitableNoWindow: LintRule = {
  name: "habitable-no-window",
  family: "daylight",
  layer: "validity",
  stage: "openings",
  codes: ["W_HABITABLE_NO_WINDOW"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      const uses = roomUses(r);
      if (uses.size === 0) ctx.skip("no-uses", r);
      const kind = HABITABLE.find(([u]) => uses.has(u));
      if (kind === undefined || isBedroom(r)) continue;
      // PS2.18: a kitchen's daylight is a dwelling's need; an office kitchenette has no such duty.
      if (kind[0] === "kitchen" && !judgesAsDwelling(ctx)) {
        ctx.skip("non-dwelling", r);
        continue;
      }
      if (roomHasWindow(ctx, r)) continue;
      if (arcWindowUnattributed(ctx, r)) {
        ctx.skip("arc-window-unattributed", r);
        continue;
      }
      const along = outsideWallsAlong(ctx, r);
      // Only an authored id can be named back to the author; a generated one is not in the source.
      const named = along.filter((id) => ctx.ir.walls.find((w) => w.id === id)?._idAuthored === true);
      const where =
        along.length === 0
          ? `No \`exterior\` wall runs along an outside edge of this room (\`${r.id}\`): give it an outside wall to take a \`window\`, or accept that it is an inner room.`
          : named.length === 0
            ? `Add a \`window\` on the \`exterior\` wall that runs along this room's (\`${r.id}\`) outside edge.`
            : `Add a \`window\` on ${named.length === 1 ? "wall" : "one of walls"} ${named.map((w) => `\`${w}\``).join(", ")}, which ${named.length === 1 ? "runs" : "run"} along this room's (\`${r.id}\`) outside edge.`;
      out.push({
        severity: "warning",
        code: "W_HABITABLE_NO_WINDOW",
        ...ctx.at(r),
        message: `${withArea(capFirst(ctx.nameOf(r, kind[1].toLowerCase())), `${fmt2(areaM2(r))} m²`)} has no window on any of its walls; a room people live in needs daylight.`,
        hints: [where, "Accept it if the room is lit in a way the plan cannot draw (a roof light, a light well)."],
      });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// W_ROOM_MISSING_DEFINING
// ---------------------------------------------------------------------------

const spoken = (category: string): string => category.replace(/_/g, " ");

/** The pieces whose footprint centre is on the room's floor, read off its shape. */
function heldIn(ctx: LintContext, r: RRoom): RFurniture[] {
  const rect = ctx.roomRects.get(r.id)!;
  return ctx.furniture.filter((f) => {
    const fr = rectOf(f);
    return pointInRoomBox({ x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }, rect);
  });
}

/** Does one of `held` do an item's job (its own family, or the one the catalogue says it serves)? */
function holdsOf(held: readonly RFurniture[]): (i: FurnishItem) => boolean {
  const families = new Set(held.flatMap((f) => servedBy(f.category)));
  return (i) => itemWords(i).some((w) => families.has(familyOf(w)));
}

/** Is `item` held in a room joined to `r` directly by a door or opening, that is not a kitchen
 *  (Approved Document G: a basin in a space giving direct access to the WC, not one used to
 *  prepare food)? */
function basinNextDoor(ctx: LintContext, r: RRoom, item: FurnishItem): boolean {
  for (const e of ctx.access().edges) {
    if (!e.between.includes(r.id)) continue;
    const other = ctx.rooms.find((x) => x.id === (e.between[0] === r.id ? e.between[1] : e.between[0]));
    if (other === undefined || other === r || roomUses(other).has("kitchen")) continue;
    if (holdsOf(heldIn(ctx, other))(item)) return true;
  }
  return false;
}

/**
 * `W_ROOM_MISSING_DEFINING`: a room that holds at least one piece of furniture (so the author
 * furnished it) but lacks a piece its use is defined by (`DEFINING`, `src/lint/defining.ts`). A
 * piece is in the room when its footprint centre is on the room's floor, read off the shape
 * ({@link pointInRoomBox}: the polygon when there is one), as `W_ROOM_NO_FIXTURE` reads it. A
 * held piece does the job of its own family and of the one the catalogue says it `serves`
 * (`double_bed` serves `bed`), the reading `finish` uses. An empty room is never reported, and
 * neither are the wet and kitchen uses of a room `W_ROOM_NO_FIXTURE` already reports. A room
 * with no classified use is skipped (declared to the coverage report). A bath that holds a WC
 * and no basin is reported too (`WASH_WITH`, PS2.66), unless a basin stands in a room joined to it
 * directly by a door or opening that is not a kitchen (Approved Document G's reading). No machine
 * fix: where a piece goes is the author's decision; the hint quotes statements checked together.
 */
export const roomMissingDefining: LintRule = {
  name: "room-missing-defining",
  family: "contents",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_ROOM_MISSING_DEFINING"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      const uses = [...roomUses(r)];
      if (uses.length === 0) {
        ctx.skip("no-uses", r);
        continue;
      }
      const held = heldIn(ctx, r);
      if (held.length === 0) continue;
      const noFixture = lacksZoneFixture(ctx, r);
      const holds = holdsOf(held);
      const missing: { use: UseKind; items: FurnishItem[] }[] = [];
      for (const use of uses) {
        if (noFixture && (use === "bath" || use === "wc" || use === "kitchen")) continue;
        const items = definingItems(use).filter((i) => !holds(i) && !missing.some((m) => m.items.includes(i)));
        if (items.length > 0) missing.push({ use, items });
      }
      // PS2.66: a WC brings a basin with it, here or through a door (not into a kitchen). Asked only
      // of a room with every defining piece, so a room already reported keeps its message.
      let wash: FurnishItem | undefined;
      let washUse: UseKind | undefined;
      if (missing.length === 0) {
        for (const use of uses) {
          const w = washItems(use);
          if (wash || !w || (noFixture && use === "bath") || !holds(w.held) || holds(w.needs)) continue;
          if (basinNextDoor(ctx, r, w.needs)) continue;
          wash = w.needs;
          washUse = use;
        }
        if (wash === undefined) continue;
      }
      const items = wash ? [wash] : missing.flatMap((m) => m.items);
      const pieces = [...new Set(held.map((f) => spoken(f.category)))].join(", ");
      const lackList = items.map((i) => `no ${itemWords(i).map(spoken).join(" or ")}`);
      // "no A, no B and no C", as `W_WET_ROOM_DOOR` lists rooms, never "no A and no B and no C".
      const lacks =
        lackList.length <= 1
          ? (lackList[0] ?? "")
          : `${lackList.slice(0, -1).join(", ")} and ${lackList[lackList.length - 1]}`;
      const nouns = missing.map((m) => `a ${useNoun(m.use)}`).join(" and ");
      const said = wash
        ? `${lacks}: a room with a WC needs one to wash hands at, in the room or in one a door joins it to (not a kitchen)`
        : `${lacks}: ${items.length === 1 ? "the piece that makes" : "the pieces that make"} it ${nouns}`;
      const paste = pasteSet(ctx, r, items);
      const add =
        "stmts" in paste
          ? `Add ${paste.stmts.length === 1 ? "it" : "them"} (nothing to import), e.g. ${paste.stmts.map((s) => `\`${s}\``).join(" and ")}.`
          : `Add \`furniture ${paste.item.category} in ${r.id} …\`${paste.footprint ? ` (${fmt2(paste.footprint.along)} along a wall, ${fmt2(paste.footprint.depth)} deep)` : ""}; ${pasteFailureWhy(ctx, paste.failure)}.`;
      out.push({
        severity: "warning",
        code: "W_ROOM_MISSING_DEFINING",
        ...ctx.at(r),
        message: `${capFirst(ctx.nameOf(r))} is furnished (${pieces}) but has ${said}.`,
        hints: [
          add,
          `If \`${r.id}\` is not ${wash ? `a ${useNoun(washUse!)}` : nouns}, say what it is with \`uses …\`: a room's use is read from its \`uses\`, or from its label when it has none.`,
        ],
      });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// W_LABEL_PIECE_MISSING
// ---------------------------------------------------------------------------

/** A text's lower-case words: its `normalizeLabel` form, split at anything not a letter or a digit
 *  ("Piano, Desk and TV" is four words and an "and"). */
const wordsOf = (s: string): string[] =>
  normalizeLabel(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Does the word run `a` stand, word for word and in order, inside the run `b`? */
function runIn(a: readonly string[], b: readonly string[]): boolean {
  for (let i = 0; i + a.length <= b.length; i++) if (a.every((w, k) => b[i + k] === w)) return true;
  return false;
}

/**
 * The catalogue words a label uses to name the ROOM, not a piece in it: each whose words stand
 * inside a word of the use vocabularies (`USE_VOCABULARY`, `FALLBACK_USE_VOCABULARY`,
 * `src/vocabulary.ts`), which read a room's use from its label. "Bed 2" is a bedroom and "Shower"
 * a shower room, "Pantry" and "Wardrobe" are stores, "Plant" and "Boiler" a utility room and "Car
 * port" a garage. Derived from those tables, never listed here: a word added to them is excluded
 * with it. `W_LABEL_PIECE_MISSING` never reads them.
 */
export const ROOM_NAMING_PIECES: readonly string[] = /* @__PURE__ */ (() => {
  const room = [...Object.values(USE_VOCABULARY), ...Object.values(FALLBACK_USE_VOCABULARY)].flatMap(
    (v: { canonical: readonly string[]; aliases: readonly string[] }) => [...v.canonical, ...v.aliases].map(wordsOf),
  );
  return CATALOG_CATEGORIES.filter((c) => room.some((w) => runIn(wordsOf(c), w)));
})();

/** Every other catalogue word as its run of words, the longest runs first (a stable sort, so
 *  catalogue order among runs of one length). */
const PIECE_WORDS: readonly (readonly [string, string[]])[] = /* @__PURE__ */ CATALOG_CATEGORIES.filter(
  (c) => !ROOM_NAMING_PIECES.includes(c),
)
  .map((c) => [c, wordsOf(c)] as [string, string[]])
  .sort((a, b) => b[1].length - a[1].length);

/** One label word against one catalogue word: the same, or, for the run's last word, its regular
 *  plural ("Lockers", "Benches"). */
const sameWord = (said: string | undefined, w: string, last: boolean): boolean =>
  said === w || (last && (said === `${w}s` || (/(s|x|z|ch|sh)$/.test(w) && said === `${w}es`)));

/**
 * The catalogue words a room label names as pieces the room holds, in the label's order, one per
 * family: whole words only, never a part of one ("Bedroom" names no bed, "Bathroom" no bath), in
 * any case. A word run of several words ("coffee table") matches only as consecutive words, and at
 * each place the longest run wins ("Dining Table" is a dining table, not a table).
 *
 * Two readings give a word to the ROOM, not to a piece in it, and are never read:
 * {@link ROOM_NAMING_PIECES}, and the label's head noun. An English head noun comes last (as
 * `namesOpenAir` reads a label, `src/vocabulary.ts`): "Desk Nook" is a nook, so its desk is a piece it
 * holds, but "Pavilion", "Garden Shed" and a café's "Serving Counter" name the room itself, as the
 * thing it is or the place round it. A label of names written `a / b` ("Counter / servery") has a
 * head in each name. A number after the head ("Nook 2") is not one.
 */
export function labelPieces(label: string): string[] {
  const out: string[] = [];
  for (const name of label.split("/")) {
    const said = wordsOf(name);
    let head = said.length;
    while (head > 0 && /^\p{N}+$/u.test(said[head - 1]!)) head--;
    for (let i = 0; i < head; ) {
      const hit = PIECE_WORDS.find(([, run]) => run.every((w, k) => sameWord(said[i + k], w, k === run.length - 1)));
      const n = hit?.[1].length ?? 1;
      if (hit && i + n < head && !out.some((w) => familyOf(w) === familyOf(hit[0]))) out.push(hit[0]);
      i += n;
    }
  }
  return out;
}

/**
 * `W_LABEL_PIECE_MISSING` (product roadmap RM1.2c, ruling RM-D35): a room whose label names a
 * catalogued piece ({@link labelPieces}) that no piece in the room is, or does the job of (its own
 * family, or the one the catalogue says it `serves`, as `W_ROOM_MISSING_DEFINING` reads a held
 * piece). A piece is in the room when its footprint centre is on the room's floor, read off the
 * room's shape ({@link heldIn}), on the room's own storey. A room with no label is not read: an id
 * is a handle, not a claim. A piece that defines the room's use, in a room that holds furniture, is
 * left to `W_ROOM_MISSING_DEFINING` and `W_ROOM_NO_FIXTURE` (one warning for one missing piece).
 * The hint quotes checked statements that place the pieces, as `W_ROOM_MISSING_DEFINING`'s does.
 */
export const labelPieceMissing: LintRule = {
  name: "label-piece-missing",
  family: "contents",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_LABEL_PIECE_MISSING"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      if (!r.label) continue;
      const named = labelPieces(r.label);
      if (named.length === 0) continue;
      const held = heldIn(ctx, r);
      const has = new Set(held.flatMap((f) => servedBy(f.category)));
      const defines = held.length > 0 ? roomDefiningItems(r).flatMap(itemWords).map(familyOf) : [];
      const lack = named.filter((w) => !has.has(familyOf(w)) && !defines.includes(familyOf(w)));
      if (lack.length === 0) continue;
      const nos = lack.map((w) => `no ${spoken(w)}`);
      const one = lack.length === 1;
      // Each piece as the furnish table writes it (its sizes), else as the catalogue does; the ones
      // with no footprint to try are named, not placed: their size is the author's to give.
      const items = lack.map(
        (w): FurnishItem =>
          Object.values(FURNISH_TABLE)
            .flat()
            .find((i) => i?.category === familyOf(w)) ?? { category: w, required: true, place: "wall" },
      );
      const sized = items.filter((i) => (i.sizes?.length ?? 0) > 0 || defaultFootprint(i.category) !== null);
      const unsized = items
        .filter((i) => !sized.includes(i))
        .map((i) => `\`furniture ${i.category} at (x,y) size … in ${r.id}\``);
      const paste = sized.length > 0 ? pasteSet(ctx, r, sized) : null;
      const hints =
        paste === null
          ? []
          : "stmts" in paste
            ? [
                `Add ${sized.length === 1 ? "it" : "them"} (nothing to import), e.g. ${paste.stmts.map((s) => `\`${s}\``).join(" and ")}.`,
              ]
            : [`Add \`furniture ${paste.item.category} in ${r.id} …\`; ${pasteFailureWhy(ctx, paste.failure)}.`];
      if (unsized.length > 0)
        hints.push(
          `Add ${unsized.join(" and ")}: the catalogue gives ${unsized.length === 1 ? "it" : "them"} no default size.`,
        );
      out.push({
        severity: "warning",
        code: "W_LABEL_PIECE_MISSING",
        ...ctx.at(r),
        message: `${capFirst(ctx.nameOf(r, "room"))} holds ${one ? nos[0] : `${nos.slice(0, -1).join(", ")} and ${nos[nos.length - 1]}`}, though its label names ${one ? "one" : "them"}.`,
        hints: [
          ...hints,
          `If \`${r.id}\` is not meant to hold ${one ? "one" : "them"}, change its label, which says it does.`,
        ],
      });
    }
    return out;
  },
};
