/**
 * The orientation layer: the `site` block's derived direction NAMES, and the one
 * page→compass conversion every consumer of a facing reads.
 *
 * **What this is not.** There is no sun model here, no sky model, no latitude, no date,
 * no solar-hour count, no shadow, no daylight factor and no irradiance. Not one number
 * in this module is a physical quantity. Everything it derives is a NAME for one of the
 * four compass letters the plan already reports, produced by a total function of two
 * closed vocabularies ({@link import("./ast.js").COMPASS_DIRECTIONS} and
 * {@link import("./ast.js").HEMISPHERES}) — four table lookups and one negation. It is
 * exactly as much of a sun model as a north arrow is a compass: a labelling convention,
 * not a measurement.
 *
 * **The honesty clause, which every surface that emits these names repeats.**
 * `equator_side` / `sunrise_side` / `sunset_side` are a DRAFTING HEURISTIC, not a
 * measured daylight outcome. "Habitable rooms want the equator-facing aspect" is a rule
 * of thumb draughtsmen use; a south window in Reykjavík and one in Singapore are not the
 * same daylight, and this layer will never say they are. The names are spelled `_side`
 * rather than `_sun` precisely so a reader — or a model translating a brief — has to make
 * that step explicitly, in the open, where it can be disagreed with.
 *
 * Pure, synchronous, deterministic, zero-dependency; no trigonometry beyond the single
 * `Math.floor` in {@link northQuarterTurns} (which lives in `describe.ts`, its historical
 * home, and is passed in here as `turns`).
 */

import type { CompassWord, Hemisphere, SiteNode } from "./ast.js";
import type { Point } from "./ast.js";
import type { BBox, RoomBox } from "./analyze.js";
import { pointInRoomBox } from "./analyze.js";
import { normal, segmentDirAt } from "./geometry.js";
import type { RWindow } from "./ir.js";
import type { RenderSizes, SceneNode } from "./scene.js";
import { weightWidth } from "./scene.js";
import type { Theme } from "./theme.js";

/** A TRUE compass facing, the spelling every machine surface uses. */
export type CompassLetter = "N" | "S" | "E" | "W";

/** The four letters in CLOCKWISE order from the top — the index space `toCompass` turns in. */
export const FACINGS: readonly CompassLetter[] = ["N", "E", "S", "W"];

/** Source spells a WORD, every machine surface keeps the LETTER. The one mapping, applied
 *  at the IR→facts boundary so nothing downstream ever sees a word. */
export function compassLetter(word: CompassWord): CompassLetter {
  switch (word) {
    case "north":
      return "N";
    case "south":
      return "S";
    case "east":
      return "E";
    case "west":
      return "W";
  }
}

/** The opposite letter — one negation, no arithmetic on strings. */
export function oppositeLetter(l: CompassLetter): CompassLetter {
  switch (l) {
    case "N":
      return "S";
    case "S":
      return "N";
    case "E":
      return "W";
    case "W":
      return "E";
  }
}

/** The equator-facing side: `"S"` in the northern hemisphere, `"N"` in the southern. The
 *  only place `hemisphere` is read, and the only thing it decides. */
export function equatorSide(hemisphere: Hemisphere): CompassLetter {
  return hemisphere === "north" ? "S" : "N";
}

/**
 * The names a `site` block licenses, all compass letters. Present on
 * `describe().site` only when the plan declares `site`.
 *
 * `sunrise_side` is `"E"` and `sunset_side` is `"W"` in BOTH hemispheres — the sun rises
 * in the east everywhere, which is why neither reads `hemisphere`. See the module note
 * on what these names do and do not claim.
 */
export interface SiteFacts {
  /** The compass direction the street frontage faces (as declared, as a letter). */
  street: CompassLetter;
  /** The opposite of {@link street} — the garden/rear aspect. */
  back: CompassLetter;
  /** The equator-facing side (`S` northern hemisphere, `N` southern). A drafting
   *  heuristic for "the good aspect", never a measured daylight outcome. */
  equator_side: CompassLetter;
  /** `"E"`, in both hemispheres. */
  sunrise_side: CompassLetter;
  /** `"W"`, in both hemispheres. */
  sunset_side: CompassLetter;
  /** The declared (or defaulted) hemisphere, echoed so a reader can check the derivation. */
  hemisphere: Hemisphere;
  /**
   * The LOT's area in m², 2 dp — the EXACT shoelace of the declared `boundary` ring,
   * never its bounding box. Present only when the plan declares a boundary, so a `site`
   * with only `street`/`hemisphere` describes byte-identically to before (v1.31).
   */
  lot_area_m2?: number;
  /** The lot's extent, as top-left + size. A convenience for framing a viewport; every
   *  measurement above comes from the ring itself. */
  lot_bbox?: { x: number; y: number; w: number; h: number };
}

/** The five names, derived in closed form from `street` + `hemisphere`. Total: every
 *  legal input produces every field, so no consumer has to handle a missing name. */
export function deriveSite(site: Pick<SiteNode, "street" | "hemisphere">): SiteFacts {
  const street = compassLetter(site.street);
  return {
    street,
    back: oppositeLetter(street),
    equator_side: equatorSide(site.hemisphere),
    sunrise_side: "E",
    sunset_side: "W",
    hemisphere: site.hemisphere,
  };
}

/** The derived names an intent may assert INSTEAD of a bare letter, in schema order.
 *  Every one of them resolves through {@link SiteFacts}, so this list is exactly the
 *  {@link SiteFacts} keys that hold a letter. */
export const SYMBOLIC_FACINGS = ["street", "back", "equator_side", "sunrise_side", "sunset_side"] as const;
export type SymbolicFacing = (typeof SYMBOLIC_FACINGS)[number];

/** Resolve a symbolic facing to the letter this plan's site gives it. */
export function resolveSymbolicFacing(name: SymbolicFacing, facts: SiteFacts): CompassLetter {
  return facts[name];
}

// ---------------------------------------------------------------------------
// page → compass. ONE implementation, shared by describe() and the lint rules.
// ---------------------------------------------------------------------------

/**
 * Turn a PAGE-relative facing into a true COMPASS facing, given the plan's north as
 * clockwise quarter-turns from the page top (`northQuarterTurns`, `src/describe.ts`).
 *
 * Compass north sits `turns` quarter-turns clockwise of the page's top, so a page
 * direction that is `i` quarter-turns clockwise of the top is `i - turns` quarter-turns
 * clockwise of NORTH. Hence `north right` (turns = 1) makes a page-EAST window face
 * compass `"N"`, and a page-NORTH one face `"W"`.
 */
export function toCompass(pageFacing: CompassLetter, turns: 0 | 1 | 2 | 3): CompassLetter {
  const i = FACINGS.indexOf(pageFacing);
  return FACINGS[(i - turns + 4) % 4] as CompassLetter;
}

/**
 * The **page-relative** direction a window's wall faces (its outward normal) — `"N"`
 * means "toward the top of the drawing", not (yet) compass north; the caller turns it by
 * the plan's `north` via {@link toCompass}. Pure and deterministic; +y is DOWN.
 *
 * - **With a host room** (the common case): facing is which of the room's four edges the
 *   window point `at` lies closest to — top → `"N"`, bottom → `"S"`, left → `"W"`, right →
 *   `"E"`. Ties (a corner window equidistant from two edges) resolve to the horizontal
 *   edge first (`N`/`S`), then to `N`/`W` — a fixed, documented order so output is stable.
 * - **Without a rectangular host room** — either none was found, or the host is a POLYGON
 *   or CIRCLE room, whose bounding box would answer for an edge the window is not on —
 *   the outward side is found by **probing the window's own wall**: sample one wall
 *   thickness off each face of the host segment and take the side no room occupies. That
 *   is exact at any wall angle (the probe walks the segment's own tangent, so an `arc`
 *   wall is probed along its true normal, not its chord's) and it is the only rule that
 *   is correct for a COURTYARD, where the plan's centre lies outside the building.
 * - **Tie-break, when the probe cannot decide** — rooms on BOTH sides (an interior window,
 *   whose compass facing is not a meaningful fact anyway) or on NEITHER (a free-standing
 *   wall): fall back to the historical rule — the host segment's orientation for the axis,
 *   and the half of the plan the window sits in relative to `planCenter`. `facing` is a
 *   required field, so it cannot be dropped. This is the ONLY thing `planCenter` is for.
 */
export function windowFacingPage(
  at: Point,
  room: RoomBox | null,
  host: RWindow["host"],
  planCenter: Point,
  rooms: ReadonlyMap<string, RoomBox>,
): CompassLetter {
  // A polygon room has no four sides to pick the nearest of, so it falls through to the
  // wall probe, which is exact at any wall angle.
  const roomRect: BBox | null = room && !room.poly ? room : null;
  if (roomRect) {
    const dTop = Math.abs(at.y - roomRect.y);
    const dBottom = Math.abs(at.y - (roomRect.y + roomRect.h));
    const dLeft = Math.abs(at.x - roomRect.x);
    const dRight = Math.abs(at.x - (roomRect.x + roomRect.w));
    if (Math.min(dTop, dBottom) <= Math.min(dLeft, dRight)) return dTop <= dBottom ? "N" : "S";
    return dLeft <= dRight ? "W" : "E";
  }
  if (host) {
    const n = normal(segmentDirAt(host, at));
    const d = Math.max(host.thickness, 1);
    const onPlus = anyRoomAt({ x: at.x + n.x * d, y: at.y + n.y * d }, rooms);
    const onMinus = anyRoomAt({ x: at.x - n.x * d, y: at.y - n.y * d }, rooms);
    if (onPlus !== onMinus) {
      // Outward is the side with no floor on it.
      const s = onPlus ? -1 : 1;
      const ox = s * n.x;
      const oy = s * n.y;
      // A stated tie (|oy| == |ox|, i.e. a 45° wall) reads as N/S, matching the
      // horizontal-first convention the host-room and fallback rules already use.
      return Math.abs(oy) >= Math.abs(ox) ? (oy < 0 ? "N" : "S") : ox < 0 ? "W" : "E";
    }
  }
  const horizontal = host
    ? Math.abs(host.a.y - host.b.y) <= Math.abs(host.a.x - host.b.x)
    : Math.abs(at.y - planCenter.y) >= Math.abs(at.x - planCenter.x);
  if (horizontal) return at.y <= planCenter.y ? "N" : "S";
  return at.x <= planCenter.x ? "W" : "E";
}

/** Does any room's floor contain `p`? Poly-aware via `pointInRoomBox`. */
function anyRoomAt(p: Point, rooms: ReadonlyMap<string, RoomBox>): boolean {
  for (const b of rooms.values()) if (pointInRoomBox(p, b)) return true;
  return false;
}

/**
 * The centre of the union of a plan's room rectangles — the only thing the room-less
 * window fallback in {@link windowFacingPage} needs, computed the same way for
 * `describe()` and for lint so the two can never disagree about which way a window looks.
 */
export function planCenterOfRooms(roomRects: Map<string, RoomBox>): Point {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of roomRects.values()) {
    if (rect.x < minX) minX = rect.x;
    if (rect.y < minY) minY = rect.y;
    if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
    if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
  }
  return minX === Number.POSITIVE_INFINITY ? { x: 0, y: 0 } : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// ---- the lot line (v1.31) ----------------------------------------------------

/**
 * The CAD layer a `site { boundary … }` property line lands on — the AIA/NCS civil layer
 * for a property boundary.
 *
 * Exported because `src/label-placement.ts` must skip it, for exactly the reason it skips
 * `A-ROOF`: a lot line ENCLOSES the whole site, so its bounding box buries every label in
 * the plan and the relocation pass would shove all of them at once. It is also nothing a
 * name can collide with — a property line is a legal datum, not drawn fabric.
 */
export const PROPERTY_LAYER = "C-PROP";

/**
 * The lot line as Scene nodes: one closed dash-dot polygon on {@link PROPERTY_LAYER}.
 *
 * `center` is the drafting line type for a datum — the same convention the positioning
 * axes use — and it is the reason a property line reads as a property line rather than
 * as an oddly-placed wall. The `paint.dash` pair beside it is not redundant: the SVG
 * backend follows `lineType` and resolves the full four-number dash-dot pattern, while
 * the PDF backend follows `paint.dash`, whose primitive is a single on/off PAIR. So the
 * PDF gets the closest two-number rendering of the same intent, and the two exports agree
 * about what kind of line this is even though one of them cannot draw a dot.
 *
 * Lives here, beside the rest of the site layer, for the same reason `axesNodes` lives in
 * `axes.ts`: a plan-level datum is not an element, so it has no `ElementDef` to render it,
 * and `scene-build.ts` should not be where a second drawing convention is written down.
 */
export function siteBoundaryNodes(ring: readonly Point[], theme: Theme, sizes: RenderSizes): SceneNode[] {
  if (ring.length < 3) return [];
  const u = sizes.thin;
  return [
    {
      layer: "annotations",
      layerName: PROPERTY_LAYER,
      prim: { t: "polygon", pts: ring.map((p) => ({ ...p })) },
      lineType: "center",
      lineWeight: "thin",
      paint: {
        fill: "none",
        stroke: theme.annotationMuted,
        width: weightWidth("thin", sizes),
        dash: [u * 12, u * 3],
      },
    },
  ];
}
