/**
 * Annotation-quality advisories over the plan's HAND-WRITTEN dimensions: `W_DIM_INSIDE`
 * (a dimension line landing inside the building) and `W_DIM_OVERLAP` (two dimensions
 * drawn on top of each other). Both are advisory with a machine-applicable fix — the
 * compiler never re-stages an author's `dim` on its own (ADR 0005). The third rule here,
 * `W_OPENING_NOT_DIMENSIONED`, is the one exception to "hand-written only": it reports an
 * opening the `dims auto all` chains leave out (see {@link openingNotDimensioned}).
 *
 * `W_DIM_INSIDE` — a hand-written dimension line lands inside the building.
 *
 * A `dim`'s line is drawn `offset` away along the LEFT normal of from→to, so the
 * ENDPOINT ORDER is what chooses which side it lands on — reversing a dim mirrors it
 * across the measured segment. The classic mistake is writing the two points in the
 * order they read on screen and getting the line pushed back INTO the plan, where it
 * crosses room labels, furniture and wall poché instead of reading in the page margin.
 *
 * The rule fires only when the whole dimension LINE (not its witness lines) falls
 * inside the room-extents bounding box, and only for dims that came from source — the
 * `dims auto` chains are synthesized at scene-build and never enter the IR, so a
 * wall-thickness call-out can never trip it. A hand-written zero-offset dim is skipped
 * too: it sits ON its measured segment by definition.
 *
 * Advisory, with a machine-applicable fix that swaps the endpoints **when the swap
 * actually moves the line out**. The predicate is `dimReadsInside` in `geometry.ts`,
 * and the fix producer re-asks it of the mirrored geometry rather than keeping a
 * second copy — see {@link import("../../fix-producers.js").dimSwapFix}. A dimension
 * that runs THROUGH the building reads inside either way: it keeps the warning and
 * gets no edit (offering one made `arch fix` oscillate forever), so the hint says what
 * is actually wrong instead of advising a swap that would not help.
 */

import { openingClauseOf } from "../../wall-ref.js";
import type { Diagnostic, Span } from "../../diagnostics.js";
import type { Bounds } from "../../geometry.js";
import {
  dimLineMid,
  dimReadsInside,
  dimSwapped,
  emptyBounds,
  extendBounds,
  length,
  normal,
  sub,
  unit,
} from "../../geometry.js";
import { det } from "../../algebra/d4.js";
import type { Point } from "../../ast.js";
import type { RDim, RDoor, ROpening, RWindow } from "../../ir.js";
import { unchainedOpenings } from "../../facade.js";
import { dimBumpFix, dimSwapFix, dimTextFix, fixesFrom } from "../../fix-producers.js";
import { CHAIN_STEP, SHEET_MM } from "../../sheet.js";
import { fmt2, fmt3 } from "../../num-format.js";
import { textWidth } from "../../text-metrics.js";
import type { LintContext, LintRule } from "../context.js";
import { openingName, wallPhrase } from "../element-phrases.js";
import { capFirst } from "../../naming.js";

export const dimInside: LintRule = {
  name: "dim-inside",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_DIM_INSIDE"],
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim");
    if (dims.length === 0 || ctx.roomRects.size === 0) return [];

    // Room extents (the building box a dimension should read outside of).
    const box: Bounds = emptyBounds();
    for (const r of ctx.roomRects.values()) {
      extendBounds(box, r.x, r.y);
      extendBounds(box, r.x + r.w, r.y + r.h);
    }

    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const dm of dims) {
      if (!dm.span || dm.offset === 0) continue;
      // One warning per SOURCE statement: a dim inside a `for` loop resolves many
      // times over one span, and the fix would otherwise be offered N times. The FILE is
      // part of that identity — two modules' spans are offsets into different sources, so
      // an equal `start:end` pair is not the same statement. Per PLACEMENT, though
      // ({@link reportKey}): each `place`d instance of the statement answers for itself.
      const key = reportKey(dm);
      if (seen.has(key)) continue;
      // Asked of the MIDPOINT of the offset line, not the endpoints: a dimension
      // legitimately runs corner to corner, so its endpoints sit ON the box edges —
      // where the line ended up is what the midpoint answers. (`dimReadsInside`.)
      if (!dimReadsInside(dm, box)) continue;
      seen.add(key);
      // The swap mirrors the line ACROSS the measured segment, so it only reaches the
      // outside when the segment is at the building's edge. A dimension running through
      // the plan is inside either way — the same predicate, asked of the swapped
      // geometry, is what `dimSwapFix` withholds the edit on, and it is what the hint
      // must agree with: advising a swap that cannot help would be false either way.
      const swapHelps = !dimReadsInside(dimSwapped(dm), box);
      out.push({
        severity: "warning",
        code: "W_DIM_INSIDE",
        ...ctx.at(dm),
        // The offset as WRITTEN: a reflecting frame negated it on the way into plan space.
        message: `The dimension from ${pointWords(dm.from)} to ${pointWords(dm.to)} draws its line inside the building — the \`offset ${(offsetSign(ctx, dm) ?? 1) * dm.offset}\` pushes it into the plan, not out to the margin.`,
        hints: [
          swapHelps
            ? "Swap the two endpoints (or negate the offset) so the dimension reads outside the building."
            : "This dimension runs THROUGH the building, so neither endpoint order puts its line outside — swapping or negating the offset only mirrors it to the other interior side. Measure along a facade instead, or raise the `offset` until the line clears the plan; leave the warning if the interior dimension is deliberate.",
        ],
        ...fixesFrom(dimSwapFix(dm, box)),
      });
    }
    return out;
  },
};

/* ---------------------------------------------------------------------------
 * W_DIM_OVERLAP — two hand-written dimensions drawn on top of each other.
 * ------------------------------------------------------------------------- */

/**
 * `W_DIM_OVERLAP` — advisory: two hand-written dimensions collide on the sheet.
 *
 * ArchLang never re-staggers a `dim`: the author's `offset` **is** the tier control, and a
 * layout pass that silently moved a dimension would be exactly the invisible architect
 * ADR 0005 forbids. So a collision is reported, with a machine-applicable fix that bumps
 * the offset out by whole {@link CHAIN_STEP} tiers — the author accepts it or doesn't.
 *
 * **What "overlap" means here.** A dimension's *drawn extent* is an oriented band in the
 * frame of its own measured segment: the dimension line and its two station ticks, plus
 * the length text riding above the line's midpoint. Two dims collide when those bands
 * intersect. Three deliberate restrictions keep the rule honest:
 *
 *  - **Only PARALLEL pairs.** Two chains meeting at a building corner cross by
 *    construction; that is correct drafting, and an offset bump could not separate them
 *    anyway. Non-parallel dims are never compared.
 *  - **The station ticks are excluded from the ALONG extent.** Adjacent members of a
 *    dimension chain (`0→4000`, `4000→7000`) deliberately *share* the tick where they
 *    meet — the touching case must not warn — so the along-extent is the measured run
 *    itself (unioned with the text box, which can overhang a short run) and the overlap
 *    test is strict.
 *  - **Only across DIFFERENT source statements.** Two instances of one `dim` inside a
 *    `for` share an `offset` expression, so no bump can separate them; flagging them
 *    would offer a fix that does not fix.
 *
 * A zero-offset dim is skipped for the same reason `dimInside` skips it — it sits ON its
 * measured segment by contract (the canonical wall-thickness call-out), and a bump would
 * have no side to move to. `dims auto` chains are synthesized at scene-build, never enter
 * the IR, and already tier themselves; see the note at the top of this file.
 */
export const dimOverlap: LintRule = {
  name: "dim-overlap",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_DIM_OVERLAP"],
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim");
    if (dims.length < 2) return [];
    const { dimFont, tick } = annotationSizes(ctx);
    // Cross-axis reach of one dim's band, measured from its own drawn line: BACK past the
    // line is the station tick (a unit 45° slash of length `tick`, so `tick/√2` across),
    // FORWARD is the text — `dimFont * 0.7` of standoff (elements/dim.ts) plus half a cap
    // height. Identical for every dim, so it is computed once rather than stored per band.
    const back = tick * Math.SQRT1_2;
    const fore = dimFont * 1.2;
    const step = CHAIN_STEP * dimFont;

    const bands = dims.filter(hasDrawnBand).map((dm) => band(dm, dimFont));
    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        const a = bands[i]!;
        const b = bands[j]!;
        if (a.key === b.key || !parallel(a, b) || !collide(a, b, back, fore)) continue;
        // Report on the LATER source statement and bump THAT one: the first-written
        // dimension keeps the inner tier, which is the order an author reads them in.
        const later = b.at >= a.at ? b : a;
        const other = later === b ? a : b;
        if (seen.has(later.report)) continue;
        seen.add(later.report);
        // Every offset below is quoted or written in its statement's OWN source. A frame
        // that reflects negated `offset` on the way into plan space (`dim.transform`), so
        // the source value is the plan value times det(g); a turn leaves it alone. At root
        // the sign is 1, and `1 * x` is `x` exactly.
        const sLater = offsetSign(ctx, later.dm);
        const sOther = offsetSign(ctx, other.dm);
        const newOffset = sLater === null ? null : retier(later, other, { back, fore, step }, sLater);
        out.push({
          severity: "warning",
          code: "W_DIM_OVERLAP",
          ...ctx.at(later.dm),
          message: `The dimension from ${pointWords(later.dm.from)} to ${pointWords(later.dm.to)} is drawn over the one from ${pointWords(other.dm.from)} to ${pointWords(other.dm.to)} — both land in the same chain tier (\`offset ${fmt2((sLater ?? 1) * later.dm.offset)}\` and \`offset ${fmt2((sOther ?? 1) * other.dm.offset)}\`), so their lines and texts collide.`,
          hints: [
            newOffset === null
              ? "Move one of them out a tier — a larger `offset` on one of them clears the other's line and text."
              : `Move one of them out a tier — \`offset ${fmt2(newOffset)}\` clears the other's line and text.`,
          ],
          // A related span is read in the diagnostic's OWN file, so only offer one when the
          // colliding dim was written in that same source — otherwise it would frame
          // unrelated bytes. Same rule `stampProvenance` applies to a `place` span.
          ...(later.dm._file === other.dm._file
            ? { relatedSpans: [{ span: other.span, message: "overlaps this dimension" }] }
            : {}),
          ...(newOffset === null ? {} : fixesFrom(dimBumpFix(later.dm, newOffset))),
        });
      }
    }
    return out;
  },
};

/**
 * `W_OPENING_NOT_DIMENSIONED` — `dims auto all` promises an openings chain on every
 * facade, and an opening on the outside of the building that no chain measures is a
 * silent gap in that promise. The auto-dimensioner cannot place every
 * opening. A chain measures along x or y, so an opening on a curved or angled wall has no
 * coordinate on it. An opening on a face that is not the building's outline, such as a
 * courtyard or a recess another wall stands in front of, is on no facade chain at all.
 * An author can draw their own `dim` for any of these; what they cannot do is notice the
 * gap without this warning.
 *
 * Unlike the two rules above, this one IS about the `dims auto` chains, which never enter
 * the IR. It does not re-derive them: {@link unchainedOpenings} is the SAME facade model
 * `scene-build.ts` synthesizes the chains from, so the warning fires exactly when the
 * drawing leaves an opening out. Advisory, with no machine-applicable fix: the remedy is a
 * dimension only the author can stage.
 */
export const openingNotDimensioned: LintRule = {
  name: "opening-not-dimensioned",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_OPENING_NOT_DIMENSIONED"],
  check(ctx: LintContext): Diagnostic[] {
    const { ir, doors, windows, openings, at } = ctx;
    if (ir.autoDims !== "all") return [];
    const missed = unchainedOpenings(ir);
    if (missed.length === 0) return [];
    const byId = new Map<string, RDoor | RWindow | ROpening>();
    for (const el of [...doors, ...windows, ...openings]) byId.set(el.id, el);
    const out: Diagnostic[] = [];
    for (const m of missed) {
      const el = byId.get(m.ownerId);
      if (!el) continue;
      const why =
        m.reason === "curve"
          ? "it sits on a curved wall, and a chain measures along x or y, so a curve has no coordinate to tick (`dims auto` gives the curve an R call-out instead)"
          : m.reason === "angled"
            ? "it sits on an angled wall, and the facade chains measure along x or y only"
            : "its wall is not the building's outer outline there (a courtyard or a recessed face), so no facade chain runs past it";
      // By the rooms it joins; a connector that joins none is already named by its wall.
      const on = el.host ? wallPhrase(el.host) : "its wall";
      const joins = openingClauseOf(el) ? `the ${el.kind} derived by an \`open between\` clause` : openingName(ctx, el);
      const named = joins.endsWith(on) ? joins : `${joins} on ${on}`;
      out.push({
        severity: "warning",
        code: "W_OPENING_NOT_DIMENSIONED",
        ...at(el),
        message: `${capFirst(named)} is on no \`dims auto all\` chain: ${why}.`,
        hints: [
          `Dimension it by hand: a \`dim\` from the nearest corner to each jamb of ${openingClauseOf(el) ? `the opening ${openingClauseOf(el)} derives` : `"${el.id}"`} states the position the auto chains cannot.`,
        ],
      });
    }
    return out;
  },
};

/* ---------------------------------------------------------------------------
 * W_DIM_TEXT_MISMATCH — a hand-written dimension whose number contradicts its span.
 * ------------------------------------------------------------------------- */

/** Micrometres per written unit: the 0.001 mm lattice every length is decided on (ADR 0022). */
const UNIT_UM: Readonly<Record<string, number>> = { "": 1000, mm: 1000, cm: 10_000, m: 1_000_000 };

/**
 * A dimension text read as a length, or `null` when it is not one.
 *
 * Accepted, as the WHOLE text (surrounding spaces allowed): digits, an optional decimal part,
 * and an optional unit `mm`, `cm` or `m` (one space before it allowed) — `4000`, `4000mm`,
 * `3.5m`, `3.5 m`, `350 cm`. A bare number is millimetres, the plan's unit. Thousands may be
 * grouped with commas in strict groups of three (`4,000`, `12,500.5`). The printer never groups
 * (`fmt2` prints `String(n)`), but authors copy numbers from schedules that do, and a strict
 * group cannot be misread as a decimal comma unless the text also carries a unit, which is why
 * a grouped number with a unit is not read at all (`1,500 m` may be a European 1.5 m). The
 * mirror case is not read either: one to three digits, a dot and exactly three decimals with NO
 * unit (`4.000`, `12.500`) may be a European thousands dot or metres without the `m`; with a
 * unit (`4.000 m`) it is read. For a leading-zero text such as `0.500` only the metres reading
 * applies (no thousands group starts with 0), but it is still not read: 0.5 m and 0.5 mm are
 * both possible.
 *
 * Everything else is exempt, because it is not a claim this rule can check: a word (`VARIES`,
 * `EQ`), a prefix or suffix (`R9000`, `φ5000`, `~4000`, `2300 clear`, `4000 min`), a sign, an
 * interpolation that evaluated to prose. A number written finer than the lattice (more than
 * three decimals in mm, four in cm, six in m) is exempt too: it states a precision the
 * language does not have, so no decision about it would be exact. So is one past 2^53 µm
 * (`Number.isSafeInteger`), a length beyond the modelling range no plan can draw.
 *
 * `um` is the written length in micrometres, `stepUm` the precision it is written to (one unit
 * in its last written digit), both integers. `fmt` re-letters a micrometre length in the same
 * unit, precision and grouping, with the author's own spacing.
 */
export function readDimText(
  text: string,
): { um: number; stepUm: number; unit: string; fmt: (um: number) => string } | null {
  const m = /^(\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:( ?)(mm|cm|m))?(\s*)$/.exec(text);
  if (!m) return null;
  const [, lead, intPart, frac = "", gap = "", unit = "", trail] = m;
  const grouped = intPart!.includes(",");
  if (grouped && unit !== "") return null;
  // `4.000`, `1.500`, `12.500` with no unit: a European thousands dot (4000 mm) or metres
  // written without the `m` (4 m)? Neither reading is safe, so it is not read; with a unit
  // (`4.000 m`) it is unambiguous and checked.
  if (unit === "" && !grouped && intPart!.length <= 3 && frac.length === 3) return null;
  const perUnit = UNIT_UM[unit]!;
  const scale = 10 ** frac.length;
  if (perUnit % scale !== 0) return null; // finer than the 0.001 mm lattice
  const stepUm = perUnit / scale;
  const digits = Number(intPart!.replaceAll(",", "") + frac);
  const um = digits * stepUm;
  if (!Number.isSafeInteger(um)) return null;
  const fmt = (len: number): string => {
    const raw = String(Math.round(len / stepUm)).padStart(frac.length + 1, "0");
    let whole = raw.slice(0, raw.length - frac.length);
    if (grouped) {
      // Comma every three digits from the right, by a plain loop (no regex over the digits).
      const groups: string[] = [];
      for (let end = whole.length; end > 0; end -= 3) groups.unshift(whole.slice(Math.max(0, end - 3), end));
      whole = groups.join(",");
    }
    const dec = frac.length > 0 ? `.${raw.slice(raw.length - frac.length)}` : "";
    return `${lead}${whole}${dec}${gap}${unit}${trail}`;
  };
  return { um, stepUm, unit, fmt };
}

/**
 * `W_DIM_TEXT_MISMATCH` — a hand-written `dim … text "<number>"` whose number is not the span
 * its line measures (plan-soundness PS2.10; the annotation rung of the hold-fixed ladder: a
 * dimension follows what it measures and never holds anything).
 *
 * **The rounding rule.** The text is read at its OWN written precision: it agrees with the
 * span when the span, rounded to the last digit the author wrote, is that number — i.e. when
 * `2 · |span − written| ≤ one unit of the last written digit`, decided in integers on the
 * 0.001 mm lattice (the span is snapped to whole micrometres first; ADR 0022: no floating
 * tolerance). So `4000` stands for any span in [3999.5, 4000.5] mm, `4 m` for [3500, 4500] mm
 * and `3.5 m` for [3450, 3550] mm; a tie is accepted either way. This contains the printer's
 * own rounding: a dim with no `text` letters `fmt2(span)` (two decimals, trailing zeros
 * dropped), which is within half a unit of its own last digit by construction, so a text that
 * copies what the drawing would have printed never fires — nor does any coarser rounding of
 * it. A text that does not read as a length ({@link readDimText}) is exempt.
 *
 * The measured span is `|to − from|` of the RESOLVED dim — after `faces`/`clear` pushed its
 * endpoints onto the walls, and for a `dim radius|diameter` the radius or diameter the call-out
 * draws — the same length the renderer letters when there is no text. `dims auto` chains never
 * enter the IR and letter their own measured spans, so only source dims are judged.
 *
 * Reported once per resolved element: a `for` that draws one literal text at several spans can
 * be right at some and wrong at others. The fix ({@link dimTextFix}) is offered only when the
 * text is a single literal and the statement draws this one element, since one rewrite of a
 * statement drawn at several spans cannot be right for all of them (`reconcileSharedFixes`
 * applies the same reasoning to `place`d instances).
 */
export const dimTextMismatch: LintRule = {
  name: "dim-text-mismatch",
  family: "annotation",
  layer: "drafting",
  stage: "drafting",
  codes: ["W_DIM_TEXT_MISMATCH"],
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim" && !!e.span && e.text !== undefined);
    if (dims.length === 0) return [];
    // How many resolved elements each source statement draws in this storey (per placement:
    // `reconcileSharedFixes` arbitrates between placements).
    const drawn = new Map<string, number>();
    for (const dm of dims) drawn.set(reportKey(dm), (drawn.get(reportKey(dm)) ?? 0) + 1);
    const out: Diagnostic[] = [];
    for (const dm of dims) {
      const read = readDimText(dm.text!);
      if (!read) continue;
      const span = length(sub(dm.to, dm.from));
      const spanUm = Math.round(span * 1000);
      if (2 * Math.abs(spanUm - read.um) <= read.stepUm) continue;
      const lettered = read.fmt(spanUm);
      const writtenMm = fmt3(read.um / 1000);
      const shown = dm.text!.trim();
      // A text in millimetres is quoted as written; one in cm or m also gives its millimetres.
      const reads = read.unit === "cm" || read.unit === "m" ? `${shown}, ${writtenMm} mm` : shown;
      // The quoted numbers must subtract: the span is printed to two decimals (the printer's own
      // `fmt2`), or to the micrometre when the text is written finer than that, and the
      // difference is taken from the two PRINTED values, in whole micrometres. Since the rule
      // fired, the printed span is still on the same side of the written number (it lies within
      // 5 µm of the span, and the span is more than 5 µm off), so the difference is never 0.
      const spanShown = read.stepUm < 10 ? fmt3(spanUm / 1000) : fmt2(span);
      const shownUm = Math.round(Number(spanShown) * 1000);
      const diff = fmt3(Math.abs(read.um - shownUm) / 1000);
      const single = (drawn.get(reportKey(dm)) ?? 0) === 1;
      const fix = single ? dimTextFix(dm, lettered) : null;
      const remedy = !single
        ? "This statement draws more than one dimension, so no fix is offered: one rewrite of its text cannot be right for every span it draws."
        : dm._textSpan
          ? `Letter dim "${dm.id}" with what it measures, \`text "${lettered}"\` (or drop the \`text\` clause and the drawing prints ${fmt2(span)}); if the number is right, the endpoints are wrong: move them so they span ${writtenMm} mm.`
          : `Make dim "${dm.id}"'s text evaluate to what it measures, ${lettered.trim()} (or drop the \`text\` clause and the drawing prints ${fmt2(span)}); if the number is right, the endpoints are wrong: move them so they span ${writtenMm} mm.`;
      out.push({
        severity: "warning",
        code: "W_DIM_TEXT_MISMATCH",
        ...ctx.at(dm),
        message: `The dimension from ${pointWords(dm.from)} to ${pointWords(dm.to)} is lettered ${reads}, but its line spans ${spanShown} mm: the text is ${diff} mm ${read.um > shownUm ? "longer" : "shorter"} than what it measures.`,
        hints: [remedy],
        ...fixesFrom(fix),
      });
    }
    return out;
  },
};

/** A plan point as the message quotes it: `(x,y)` in whole-hundredth millimetres. */
const pointWords = (p: Point): string => `(${fmt2(p.x)}, ${fmt2(p.y)})`;

/** A hand-written dim with a drawn band worth testing: it came from source, it is offset
 *  off its measured segment, and that segment has a direction (a failed `dim radius` ref
 *  collapses to a zero-length placeholder). */
function hasDrawnBand(dm: RDim): boolean {
  return !!dm.span && dm.offset !== 0 && length(sub(dm.to, dm.from)) > 0;
}

/** One dim's drawn band: the frame of its measured segment, the midpoint of the drawn
 *  line, and how far the band runs along that line either side of the midpoint. */
interface Band {
  dm: RDim;
  /** The dim's own span (non-null by {@link hasDrawnBand}). */
  span: Span;
  /** Start offset of that span — the source ORDER key. */
  at: number;
  /** Identity of the SOURCE STATEMENT — file plus span, since a `for` resolves one
   *  statement many times and two modules' offsets are not comparable. */
  key: string;
  /** What the rule reports ONCE per — {@link reportKey}. */
  report: string;
  /** Unit direction of from→to. */
  u: Point;
  /** Left normal of `u` — the axis `offset` runs along. */
  n: Point;
  /** The normal the NUMBER rides off the line along: `n`, reversed for a negative offset —
   *  the side `dim.render` draws it on (`sign(offset) · n`). */
  m: Point;
  /** Midpoint of the DRAWN line (the measured midpoint pushed out by `offset`). */
  mid: Point;
  /** Half the along-axis extent about `mid`. */
  half: number;
}

function band(dm: RDim, dimFont: number): Band {
  const span = dm.span!;
  const u = unit(sub(dm.to, dm.from));
  const n = normal(u);
  const m = dm.offset < 0 ? { x: -n.x, y: -n.y } : n;
  const len = length(sub(dm.to, dm.from));
  // The same drawn-line midpoint `dimInside` tests — one formula, both rules.
  const mid = dimLineMid(dm);
  // The width estimate goes through the ONE shared `textWidth` (there are no text metrics
  // anywhere in `src/`), over the exact string `dim.render` draws: the authored `text` when
  // there is one, else the measured length through the same `fmt2` the render context
  // passes as its `fmt`. The `dims auto` stagger decision reads the same helper, so this
  // rule and the renderer never disagree about what collides.
  const label = dm.text ?? fmt2(len);
  return {
    dm,
    span,
    at: span.start,
    key: `${dm._file ?? ""}:${span.start}:${span.end}`,
    report: reportKey(dm),
    u,
    n,
    m,
    mid,
    half: Math.max(len, textWidth(label, dimFont)) / 2,
  };
}

/**
 * The codes these rules raise at most ONCE per statement per placement, not once per
 * resolved element: the unit `reconcileSharedFixes` (`src/lint.ts`) counts a shared
 * statement's raisers in.
 */
export const ONCE_PER_PLACEMENT_CODES: ReadonlySet<string> = new Set(["W_DIM_INSIDE", "W_DIM_OVERLAP"]);

/**
 * What a dim rule reports once per: its SOURCE statement (file plus span — a `for` resolves
 * one statement many times, and two modules' offsets are not comparable) and, for a dim a
 * `place` carried in, its instance. Each placement then answers for itself, with its own
 * frame's value, so a statement shared by several placements raises once per placement and
 * `reconcileSharedFixes` can see whether they all need the same edit. A root dim has no
 * `_instance`, so its key is exactly the statement key it always was.
 */
function reportKey(dm: RDim): string {
  const stmt = `${dm._file ?? ""}:${dm.span!.start}:${dm.span!.end}`;
  return dm._instance === undefined ? stmt : `${stmt}@${dm._instance}`;
}

/** Are the two measured segments parallel (either direction)? Both vectors are unit, so
 *  the cross product is the sine of the angle between them. */
function parallel(a: Band, b: Band): boolean {
  return Math.abs(a.u.x * b.u.y - a.u.y * b.u.x) <= 1e-9;
}

const dot = (p: Point, q: Point): number => p.x * q.x + p.y * q.y;

/** Strict interval overlap — touching is not colliding (adjacent chain members share a
 *  station tick, and two tiers that just graze read fine on paper). */
const overlaps = (lo1: number, hi1: number, lo2: number, hi2: number): boolean =>
  Math.min(hi1, hi2) - Math.max(lo1, lo2) > 1e-6;

/** Do two PARALLEL bands intersect? Tested in `a`'s frame, where `b` projects to a single
 *  along-interval and (being parallel) a single cross-coordinate. */
function collide(a: Band, b: Band, back: number, fore: number): boolean {
  const d = sub(b.mid, a.mid);
  const s = dot(d, a.u);
  if (!overlaps(-a.half, a.half, s - b.half, s + b.half)) return false;
  const [lo, hi] = crossBand(dot(d, a.m), dot(b.m, a.m) > 0, back, fore);
  return overlaps(-back, fore, lo, hi);
}

/** A band's cross-axis interval about its line at `t`, expressed on a reference normal. A
 *  dim whose own text normal (`Band.m`) points the other way carries its text on the other side. */
function crossBand(t: number, sameSide: boolean, back: number, fore: number): [number, number] {
  return sameSide ? [t - back, t + fore] : [t - fore, t + back];
}

/**
 * The offset that carries `later`'s band clear of `other`'s: the smallest whole number of
 * {@link CHAIN_STEP} tiers, travelled along the direction `later`'s own offset already
 * points (so the fix never flips a dimension to the far side of what it measures). `k` is
 * 1 in the ordinary case — two dims stacked in one tier — and more only when the
 * neighbour already sits further out. Rounded to whole millimetres, which keeps the
 * rewritten source readable and is orders of magnitude below the clearance it just bought.
 *
 * `sign` is {@link offsetSign}: the value is pulled back into the statement's own frame
 * BEFORE it is rounded, because `Math.round` is not odd (`Math.round(-2.5)` is `-2`), so
 * negating a rounded plan-space value could miss the source value by 1 mm on a tie.
 */
function retier(later: Band, other: Band, size: { back: number; fore: number; step: number }, sign: 1 | -1): number {
  const { back, fore, step } = size;
  const off = later.dm.offset;
  const dir = off > 0 ? 1 : -1;
  // `other`'s band in LATER's offset coordinate: distance along `later.n` from the segment
  // `later` measures, which is where its own `offset` is measured from.
  const t = dot(sub(other.mid, later.dm.from), later.n);
  const [lo, hi] = crossBand(t, dot(other.m, later.n) > 0, back, fore);
  // How far past its current offset the line must travel for the near edge of its band to
  // clear the far edge of the other's, in the direction it is already offset. `floor + 1`
  // (never `ceil`) so an exact multiple still lands strictly beyond, never touching. The
  // near edge is the tick reach `back` either way: the number rides the side it travels to.
  const need = dir > 0 ? hi + back - off : off - (lo - back);
  const k = Math.max(1, Math.floor(need / step) + 1);
  return Math.round(sign * (off + dir * k * step));
}

/**
 * The factor that takes a dim's plan-space `offset` back to the one written in its source:
 * `det(g)` of its instance frame (`-1` under a reflection, which `dim.transform` negates the
 * offset for; `1` for a turn and at root), or `null` when the frame is unknown.
 */
function offsetSign(ctx: LintContext, dm: RDim): 1 | -1 | null {
  const g = ctx.frameOf(dm);
  return g === null ? null : det(g);
}

/**
 * The two annotation sizes this rule measures against, in plan millimetres.
 *
 * `lint()` never builds a Scene, so there is no {@link import("../../scene.js").RenderSizes}
 * to read — the rule reconstructs the same two formulas `scene-build.ts` uses. With `paper`
 * the reconstruction is EXACT (every size is a fixed sheet millimetre × the scale
 * denominator). Without it, `refDim` is the drawing's own reference dimension, estimated
 * here from the plan's rooms, wall polylines and dimension endpoints rather than from every
 * element's registry `bounds()` — a few percent out at worst, on an advisory threshold.
 */
function annotationSizes(ctx: LintContext): { dimFont: number; tick: number } {
  const denom = ctx.ir.sheet?.denom;
  const refDim = denom !== undefined ? SHEET_MM.ref * denom : drawingRef(ctx);
  return {
    dimFont: denom !== undefined ? SHEET_MM.dimText * denom : refDim * 0.02,
    // The dimension tick is `refDim * 0.012` in elements/dim.ts — one formula, both modes.
    tick: refDim * 0.012,
  };
}

/** `max(width, height, 1)` of the plan's structural extent — the `refDim` a paperless
 *  drawing scales its annotation from. */
function drawingRef(ctx: LintContext): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const put = (p: Point): void => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const r of ctx.roomRects.values()) {
    put({ x: r.x, y: r.y });
    put({ x: r.x + r.w, y: r.y + r.h });
  }
  for (const w of ctx.ir.walls) for (const p of w.points) put(p);
  for (const e of ctx.ir.elements) {
    if (e.kind !== "dim") continue;
    put(e.from);
    put(e.to);
  }
  if (!Number.isFinite(minX)) return 1;
  return Math.max(maxX - minX, maxY - minY, 1);
}
