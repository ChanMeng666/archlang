/** Abstract syntax tree for an ArchLang `plan`. All distances are in millimetres.
 *
 * The AST is the raw, immutable output of parsing: `resolve()` (see ir.ts) reads
 * it and produces a separate IR — nothing here is mutated after parse.
 */

import type { DoorHinge, DoorHingeNear, DoorKind, DoorSlideDir, DoorSwingDir } from "./grammar/tokens.js";
import type { Span } from "./diagnostics.js";
import type { Comment } from "./lexer.js";
import type { Expr } from "./expr.js";
import type { PaperSpec } from "./sheet.js";
import type { Theme } from "./theme.js";

export interface Point {
  x: number;
  y: number;
}

/** A point whose coordinates are expressions (evaluated during resolve). */
export interface ExprPoint {
  x: Expr;
  y: Expr;
}

/**
 * The four page directions `north <dir>` accepts as a word (the other form is a bare
 * bearing in degrees). Canonical order — parser, diagnostic message and `spec.llm.md`
 * all render THIS array rather than retyping it, because a set typed a second time
 * inside a generator reproduces the same wrong text forever while `check:drift` stays
 * green (the standing "a generator's TEMPLATE can go stale" law).
 */
export const NORTH_DIRS = ["up", "down", "left", "right"] as const;
/** A `north <word>` page direction — the non-numeric half of {@link NorthDir}. */
export type NorthCardinal = (typeof NORTH_DIRS)[number];

/** North orientation: a cardinal keyword or an explicit bearing in degrees. */
export type NorthDir = NorthCardinal | { deg: number };

/**
 * `dims auto [<mode>]` — which chains the automatic dimensioning pass draws. Canonical
 * order; `all` is the default when the mode word is omitted. One source for the
 * parser's accept-list and the spec's grammar line.
 */
export const AUTO_DIMS_MODES = ["overall", "rooms", "walls", "all"] as const;
/** A `dims auto <mode>` selector. */
export type AutoDimsMode = (typeof AUTO_DIMS_MODES)[number];

/** Discriminant identifying an element's type (also its registry keyword). */
export type ElementKind =
  | "wall"
  | "room"
  | "door"
  | "window"
  | "opening"
  | "furniture"
  | "dim"
  | "column"
  | "stair"
  | "elevator"
  | "escalator"
  | "roof"
  | "void";

/** Fields every element AST node carries. */
export interface NodeBase {
  id: string;
  line: number;
  /** Byte-offset span from the leading keyword to the last consumed token. */
  span?: Span;
}

export interface WallNode extends NodeBase {
  kind: "wall";
  /** Free-form category, e.g. "exterior" or "partition". Also a door/window ref. */
  category: string;
  /** Wall thickness in mm. */
  thickness: Expr;
  /** Optional hatch material (e.g. "brick"); defaults to the poché hatch. */
  material?: string;
  /** Optional hatch tile-size multiplier (`material … scale <n>`); defaults to 1. */
  materialScale?: Expr;
  /** Optional extra hatch rotation in degrees (`material … angle <n>`); defaults to 0. */
  materialAngle?: Expr;
  /** Polyline vertices in order. */
  points: ExprPoint[];
  /**
   * Curved edges (`arc (x,y) radius R [cw|ccw] [major]`, v1.24), indexed by SEGMENT
   * index: entry `k` describes the edge from `points[k]` to `points[k+1]`. Absent for
   * an all-straight polyline, which is every wall written before v1.24 — that absence
   * is what keeps their geometry and bytes unchanged.
   */
  arcs?: Array<WallArcNode | undefined>;
  /** Whether the polyline closes back to its first vertex. */
  closed: boolean;
}

/** The two rotational directions an `arc` clause may name, as the reader sees them on
 *  the sheet. Canonical order — the wall parser, `geometry/arc.ts`'s `ArcDir` and the
 *  spec's `wall` grammar line all derive from this one array. */
export const ARC_DIRS = ["cw", "ccw"] as const;
/** Which way round the plan an `arc` edge travels. */
export type ArcDirWord = (typeof ARC_DIRS)[number];

/**
 * One `arc … radius R [cw|ccw] [major]` clause, attached to the vertex it arrives at.
 * `dir` is the turn as the reader sees it on the sheet (default `ccw`), and `major`
 * takes the long way round. Together they pick which of the two circles of radius `R`
 * through the two endpoints is meant — see `src/geometry/arc.ts`.
 */
export interface WallArcNode {
  radius: Expr;
  dir?: ArcDirWord;
  major?: boolean;
  /** Byte span of the `arc …` clause, for `E_ARC_RADIUS`. */
  span?: Span;
}

/** Relational-placement direction: the side of the reference room to sit on.
 *  Canonical order — the parser's accept-set, the element's own parameter doc and the
 *  spec's `room` grammar line all read this array. */
export const REL_DIRS = ["right-of", "left-of", "below", "above"] as const;
/** Relational-placement direction: the side of the reference room to sit on. */
export type RelDir = (typeof REL_DIRS)[number];

/**
 * The three alignment edges of each cross AXIS, in **leading → centre → trailing**
 * order. This table is the owner: {@link REL_ALIGNS} is concatenated from it, so the
 * six-word set and its per-axis partition cannot drift apart.
 *
 * The positional ordering is load-bearing, not cosmetic. Index `i` of one axis is the
 * exact counterpart of index `i` of the other — `left`(h,leading) ↔ `top`(v,leading),
 * `right`(h,trailing) ↔ `bottom`(v,trailing) — which is what lets
 * {@link relAlignCounterpart} answer an axis mismatch with a TRANSLATION rather than a
 * guess. Reorder a row and that correspondence silently breaks.
 */
export const AXIS_ALIGNS = Object.freeze({
  /** Vertical cross axis — used by the HORIZONTAL relations `right-of`/`left-of`. */
  v: ["top", "middle", "bottom"],
  /** Horizontal cross axis — used by the VERTICAL relations `below`/`above`. */
  h: ["left", "center", "right"],
} as const);

/** The cross axis each relational direction aligns ON. A horizontal relation
 *  (`right-of`/`left-of`) offsets its room vertically, so its alignment edge is a
 *  vertical one, and vice versa. Read by `elements/room.ts`'s `E_ROOM_ALIGN_AXIS`
 *  check; it mirrors the `"v"`/`"h"` argument `layout.ts`'s `place()` passes to
 *  `alignOffset`, and the two are pinned equal by test. */
export const REL_DIR_AXIS = Object.freeze({
  "right-of": "v",
  "left-of": "v",
  below: "h",
  above: "h",
} as const);

/**
 * The centring edge of each axis. `layout.ts`'s `alignOffset` honours **both spellings
 * on both axes** (`if (align === "middle" || align === "center")`), so a centring word
 * is never an axis mismatch — it is the one place the two rows of {@link AXIS_ALIGNS}
 * deliberately overlap, and the reason the per-direction accept-sets are 4/4 rather
 * than a clean 3/3 split.
 */
export const REL_ALIGN_CENTERS: readonly string[] = [AXIS_ALIGNS.v[1], AXIS_ALIGNS.h[1]];

/** Every {@link RelAlign}, canonical order — one source for the element's parameter
 *  doc, the spec's grammar line, and the parser's ACCEPT-SET (`E_ROOM_ALIGN`).
 *  Concatenated from {@link AXIS_ALIGNS} so the set has exactly one owner. */
export const REL_ALIGNS = [...AXIS_ALIGNS.v, ...AXIS_ALIGNS.h] as const;

/** Edge to align with the reference room. Horizontal placement
 *  (`right-of`/`left-of`) uses `top|middle|bottom`; vertical placement
 *  (`below`/`above`) uses `left|center|right` (`center`≡`middle`, honoured on both). */
export type RelAlign = (typeof REL_ALIGNS)[number];

/**
 * The edge `dir` should have been given instead of `word`, or `null` when `word` is
 * already legal for `dir`.
 *
 * This is the predicate behind `E_ROOM_ALIGN_AXIS`. An **in-set word on the wrong
 * axis** — `right-of a align left`, `below a align top` — passed the membership check
 * `1213e08` added and then matched no branch of `alignOffset`, falling through to the
 * leading edge: the same silent-wrong-position defect one level down, and a likelier
 * one, because the offending words are VALID SPELLINGS rather than typos.
 *
 * The answer is a translation, not a suggestion. A mismatched word is always the
 * leading or trailing edge of the *other* axis (the centring words are legal on both),
 * so its counterpart is the same index on this axis, and the author's evident intent —
 * leading, or trailing — is carried across exactly. That is what earns the fix
 * `machine-applicable` without the edit-distance hedging `roomAlignFix` needs.
 */
export function relAlignCounterpart(dir: RelDir, word: RelAlign): RelAlign | null {
  const axis = REL_DIR_AXIS[dir];
  const own: readonly RelAlign[] = AXIS_ALIGNS[axis];
  if (own.includes(word)) return null;
  if (REL_ALIGN_CENTERS.includes(word)) return null;
  const other: readonly RelAlign[] = AXIS_ALIGNS[axis === "v" ? "h" : "v"];
  // `word` is one of the six, is not on this axis and is not a centring word, so it is
  // the other axis's leading or trailing edge — index 0 or 2, never absent.
  return own[other.indexOf(word)] ?? null;
}

/**
 * A room's declared function(s). Explicit `uses` make the analysis layer's room
 * classification authored intent instead of a label-regex guess (see `roomUses` in
 * analyze.ts); a room may have several (a studio is `living kitchen`). Classification
 * only — it does not imply physical enclosure.
 */
export type UseKind =
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bath"
  | "wc"
  | "hall"
  | "circulation"
  | "storage"
  | "utility"
  | "office"
  | "entry"
  | "garage";

/** Every {@link UseKind}, in canonical order — the parser/formatter/grammar source. */
export const USE_KINDS: readonly UseKind[] = [
  "living",
  "kitchen",
  "dining",
  "bedroom",
  "bath",
  "wc",
  "hall",
  "circulation",
  "storage",
  "utility",
  "office",
  // Appended, not slotted in beside `storage`: this list is the parser's accept order, the
  // formatter's print order and the alternation both generators render, so inserting in the
  // middle re-orders a published grammar for nothing.
  "entry",
  "garage",
];

/** `DIR REF [align EDGE] [gap EXPR]` — a room's position relative to another room.
 *  Resolved to absolute coordinates by pure arithmetic in dependency order. */
export interface RoomRel {
  dir: RelDir;
  /** Id of the reference room this one is placed against. */
  ref: string;
  align?: RelAlign;
  /**
   * Byte span of the alignment WORD itself (not the `align` keyword, not the clause),
   * recorded whenever {@link align} is set so resolve can raise `E_ROOM_ALIGN_AXIS`
   * against the offending word and its fix can rewrite exactly those bytes.
   *
   * Separate from {@link alignBad} because an axis mismatch is a LEGAL word: `align`
   * stays a real {@link RelAlign}, so `format.ts` and `layout.ts` need no branch for it.
   */
  alignSpan?: Span;
  /**
   * An `align <word>` whose word is NOT in {@link REL_ALIGNS}, recorded verbatim with
   * its own byte span so resolve can raise `E_ROOM_ALIGN` against the OFFENDING WORD
   * (and `format.ts` can re-emit the source it was given rather than deleting it).
   *
   * Until v1.26 the parser did `ctx.eatIdent().value as RelAlign` — an unchecked cast —
   * so `align sideways` produced a `RelAlign` that matched no branch of
   * `layout.ts`'s `alignOffset` and fell through to the leading edge. The plan drew
   * itself as `align top` with **zero diagnostics**: the project's own "silent wrong
   * position" family, and the one member of it the author can see in their own source.
   * Mutually exclusive with {@link align} — a legal word sets that and leaves this
   * undefined.
   */
  alignBad?: { word: string; span: Span };
  /** Spacing (mm) between the two rooms along the placement axis; default 0. */
  gap?: Expr;
  span?: Span;
}

export interface RoomNode extends NodeBase {
  kind: "room";
  /** Absolute top-left corner. Mutually exclusive with {@link RoomNode.rel} and
   *  {@link RoomNode.polygon}; exactly one of the three is present. The absolute path
   *  is the default and is unchanged. */
  at?: ExprPoint;
  /** Relational placement clause (when `at` is absent). */
  rel?: RoomRel;
  /**
   * `room polygon (x,y) (x,y) (x,y) …` — an explicit, implicitly-closed simple polygon
   * (v1.23). Mutually exclusive with `at`/`rel`, and it replaces `size` (the room's
   * extent IS its vertex ring), so `size` is absent exactly when this is present.
   */
  polygon?: ExprPoint[];
  /**
   * `room circle at (cx,cy) radius R` — a circular floor (v1.24). Mutually exclusive
   * with `at`/`rel`/`polygon`, and it replaces `size`. Its area is measured in CLOSED
   * FORM (πR²), never from the tessellation the grids use.
   */
  circle?: { c: ExprPoint; r: Expr };
  /** Width × height — absent only on the {@link RoomNode.polygon}/{@link RoomNode.circle} forms. */
  size?: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
  /** Explicit label/area anchor (`label "…" at (x,y)`) — for a concave polygon whose
   *  centroid falls outside the floor. Absent = the derived centre. */
  labelAt?: ExprPoint;
  /** Byte span of the `label … at (x,y)` override, for its own diagnostic. */
  labelAtSpan?: Span;
  /** Declared function(s) — explicit room classification (`uses bedroom`, …). */
  uses?: UseKind[];
}

/** Where along a named wall an opening attaches (`… on <wall> at <pos>`). The
 *  position walks the wall polyline: a percentage of its total length, an
 *  absolute millimetre distance from its start, or its midpoint. Resolved to an
 *  absolute point + host segment in `src/attach.ts` (bypasses nearest-wall
 *  search, so an attached opening can never be "off wall"). Append-only optional. */
export interface OpeningAttach {
  /** Host wall id (or category) whose polyline is walked. */
  wall: string;
  /** The position along the wall. `value` is a full {@link Expr}, not a literal, so a
   *  `for`-generated run of openings can place itself (`door on w1 at bay * i + 600`);
   *  `center` carries none. A literal evaluates to the number it always did, which is
   *  what keeps every pre-existing plan byte-identical. */
  pos: { kind: "percent" | "mm" | "center"; value?: Expr };
  span?: Span;
}

export interface DoorNode extends NodeBase {
  kind: "door";
  /**
   * The leading kind word (`door pocket on w1 …`), when one was written. `hinged`
   * is the default and the resolver drops it, so an omitted word and an explicit
   * `hinged` are indistinguishable downstream — the byte-identity law.
   */
  doorKind?: DoorKind;
  /** Absolute hinge/center position. Absent when {@link DoorNode.attach} is used. */
  at?: ExprPoint;
  /** Wall-attached placement (`on <wall> at <pos>`). Exclusive with `at`. */
  attach?: OpeningAttach;
  width: Expr;
  /** Optional wall (id or category) the door is hosted by (in `at` mode). */
  wall?: string;
  /** Hinge/swing are explicit-only here; the default (and any `set door(...)`
   *  override) is applied at resolve so user-specified values always win. */
  hinge?: DoorHinge;
  swing?: DoorSwingDir;
  /** `swing into <room>` — resolve chooses in/out so the leaf opens toward that
   *  room's side of the host wall. Exclusive with `swing`. */
  swingInto?: string;
  /** `hinge near start|end` — hinge at the door-segment end nearer the wall's
   *  start/end point, independent of traversal wording. Exclusive with `hinge`. */
  hingeNear?: DoorHingeNear;
  /** `slide left|right` — which way the panel travels to open, measured along the
   *  host wall's traversal direction exactly as `hinge` is. Sliding family only. */
  slide?: DoorSlideDir;
  /**
   * Byte span of the authored `slide` clause, or the zero-width point where one can
   * be inserted (always before the trailing `open`, which the grammar puts last) —
   * the `fixtureRotateFix` precedent, so `W_POCKET_RUN`'s reverse-slide fix can
   * rewrite exactly that clause instead of the whole statement.
   */
  slideSpan?: Span;
  /** `open <0..1>` — how far the panel is DRAWN open. A drawing fact only: nothing
   *  measured (lint, `describe()`, the intent channel) may ever read it. */
  open?: Expr;
}

export interface WindowNode extends NodeBase {
  kind: "window";
  at?: ExprPoint;
  attach?: OpeningAttach;
  width: Expr;
  wall?: string;
}

/** `opening [id=] (at (x,y) [wall ref] | on <wall> at <pos>) width N` — a leaf-less
 *  cased opening: a gap in the wall (no door, no glazing) that still connects the
 *  two spaces. */
export interface OpeningNode extends NodeBase {
  kind: "opening";
  at?: ExprPoint;
  attach?: OpeningAttach;
  width: Expr;
  wall?: string;
}

/** `against wall <id> [segment <n>] [offset <d>] [side left|right]` — anchor a fixture
 *  flush to a wall face. The renderer position + quarter-turn are computed from it
 *  at resolve (closed-form). Mutually exclusive with {@link FurnitureNode.at}. */
export interface FurnitureAgainst {
  /** Host wall id to back onto. */
  wall: string;
  /** Which segment of a multi-segment wall (0-based); required when the wall has >1. */
  segment?: Expr;
  /** Distance (mm) along the segment from its start to the fixture's along-wall centre; default = segment midpoint. */
  offset?: Expr;
  /** Which face of the wall — left/right of the segment's start→end direction. */
  side?: "left" | "right";
  span?: Span;
}

/** Anchor position inside a room box for `furniture … in <room> anchor <a>`. */
export type FurnitureAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Every {@link FurnitureAnchor}, canonical order — parser/formatter/grammar source. */
export const FURNITURE_ANCHORS: readonly FurnitureAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/**
 * `in <room> centered` | `in <room> anchor <a> [flush] [inset N]` — closed-form
 * placement of a fixture inside a resolved room's box. The `in <room>` also owns the
 * fixture (sets {@link FurnitureNode.room}). Exclusive with `at`/`against`.
 *
 * `flush` changes what `inset` is measured **from**: the room rectangle's edges are
 * wall *centerlines*, so `inset 0` alone leaves the piece half a wall thickness inside
 * the solid. With `flush`, each anchored edge that has a wall behind it is referenced
 * from that wall's **inner face** instead (centerline + thickness/2, toward the room),
 * so `inset` starts at the plaster. It is carried on the `centered` variant too only so
 * resolve can report the meaningless combination (`E_FURN_FLUSH`) instead of a bare
 * parse error; `flushSpan` is the `flush` keyword's own byte span, for that diagnostic.
 */
export type FurniturePlace =
  | { mode: "centered"; flush?: boolean; flushSpan?: Span }
  | { mode: "anchor"; anchor: FurnitureAnchor; inset?: Expr; flush?: boolean; flushSpan?: Span };

export interface FurnitureNode extends NodeBase {
  kind: "furniture";
  /** Free-form category, e.g. "bed" or "sofa". */
  category: string;
  /** Absolute top-left corner. Mutually exclusive with {@link FurnitureNode.against}. */
  at?: ExprPoint;
  /** Wall-anchored placement (computes at/size/rotation). Exclusive with `at`. */
  against?: FurnitureAgainst;
  /** Room-relative placement (`in <room> centered|anchor …`). Exclusive with `at`/`against`. */
  place?: FurniturePlace;
  /** In `at` mode: plan-axis width×height. In `against` mode: wall-relative along×depth.
   *  Optional only with `against` + a fixture that has a catalogued default footprint. */
  size?: { w: Expr; h: Expr };
  /** Label as a string-interpolation template, evaluated at resolve. */
  label?: Expr;
  /** Quarter-turn rotation of the drawn symbol (0|90|180|270 degrees), evaluated at resolve. */
  rotate?: Expr;
  /**
   * Byte span the `rotate` clause occupies in the ORIGINAL source — the authored
   * `rotate <expr>` run, or the **zero-width** point where one can be inserted
   * (`start === end`, always *before* the optional trailing `in <room>`, which the
   * grammar requires to come last). Recorded by the parser purely so a diagnostic
   * fix can rewrite the fixture's orientation with correct offsets
   * ({@link import("../fix-producers.js").fixtureRotateFix}); it carries no
   * semantics and never affects output.
   */
  rotateSpan?: Span;
  /** Declared owning room id (`in <roomId>`) — the room this fixture belongs to. */
  room?: string;
}

/** The two endpoint-reference words a `dim` may lead with, canonical order — one source
 *  for the `dim` parser and the spec's grammar line. */
export const DIM_REFS = ["faces", "clear"] as const;

/** How a `dim`'s endpoints are referenced to the walls they touch.
 *  Absent = the written points are used verbatim (the historical behaviour). */
export type DimRef = (typeof DIM_REFS)[number];

/**
 * A `dim radius <wallId> [segment <n>]` / `dim diameter <roomId>` call-out (v1.24) — the
 * GB/T form for a round thing, which a linear chain cannot express. The measured geometry
 * is looked up from the referenced element at resolve, so the author never retypes a
 * radius the compiler already knows (and the two can never disagree).
 */
export interface DimCurve {
  what: "radius" | "diameter";
  /** Wall id (for `radius`) or room id (for `diameter`). */
  ref: string;
  /** Which arc edge of a multi-segment wall — required only when it has several. */
  segment?: Expr;
  span?: Span;
}

export interface DimNode extends NodeBase {
  kind: "dim";
  /**
   * `dim radius|diameter <ref>` — a curve call-out instead of two written endpoints.
   * When present, `from`/`to` are DERIVED at resolve (centre → arc midpoint for a radius,
   * the horizontal diameter for a circle) and the text is `R<r>` / `phi<d>`.
   */
  curve?: DimCurve;
  /** `dim faces …` / `dim clear …` — push each endpoint OUTWARD onto the hosting
   *  wall's outer face (an outside-to-outside span), or INWARD onto its inner face
   *  (a clear width), instead of measuring the written centerline points. */
  ref?: DimRef;
  /** Written start point. A placeholder on the {@link DimNode.curve} form, which derives it. */
  from: ExprPoint;
  /** Written end point. A placeholder on the {@link DimNode.curve} form, which derives it. */
  to: ExprPoint;
  /** Perpendicular offset of the dimension line from the measured segment, mm. */
  offset: Expr;
  /**
   * Byte span the `offset` clause occupies in the ORIGINAL source — the authored
   * `offset <expr>` run, or the **zero-width** point where one can be inserted
   * (`start === end`, always *before* the optional trailing `text "…"`, which the
   * grammar requires to come last). Recorded by the parser purely so a diagnostic
   * fix can re-tier the dimension with correct offsets
   * ({@link import("../fix-producers.js").dimBumpFix}); it carries no semantics and
   * never affects output.
   */
  offsetSpan?: Span;
  /** Override text (string-interpolation template); defaults to measured length. */
  text?: Expr;
}

export interface ColumnNode extends NodeBase {
  kind: "column";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
}

/**
 * Which way a run of vertical circulation goes **from the storey it is drawn on**:
 * `up` rises toward the next level (the plan symbol reads UP), `down` descends toward
 * the previous one (DN). It is declared PER STOREY and never inferred across levels —
 * the only cross-level inference ArchLang makes is identity (same id ⇒ same shaft), see
 * ADR 0005.
 */
export const VERTICAL_DIRS = ["up", "down"] as const;
/** See {@link VERTICAL_DIRS}. */
export type VerticalDir = (typeof VERTICAL_DIRS)[number];

/**
 * `stair [id=] at (x,y) size WxH dir up|down [width <expr>]` — a straight flight of
 * stairs, drawn as the conventional plan symbol (tread lines, a mid-flight break line,
 * a direction arrow labelled UP/DN).
 *
 * `at` is the footprint's TOP-LEFT corner (as for `room`/`furniture`, not `column`'s
 * centre). `width` is the FLIGHT width across the run; it defaults to the footprint's
 * cross-axis extent and may not exceed it (`E_STAIR_WIDTH`). v1 draws a single straight
 * flight: a narrower `width` leaves the rest of the footprint as an un-drawn return/void.
 */
export interface StairNode extends NodeBase {
  kind: "stair";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
  dir: VerticalDir;
  /** Flight width across the run (mm); defaults to the footprint's cross extent. */
  width?: Expr;
}

/** `elevator [id=] at (x,y) size WxH` — a lift shaft: the car rectangle with the
 *  conventional crossed diagonals. No `dir` — a lift serves every storey it appears on. */
export interface ElevatorNode extends NodeBase {
  kind: "elevator";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
}

/** `escalator [id=] at (x,y) size WxH dir up|down` — a moving stair: parallel chevrons
 *  along the run plus a direction arrow labelled UP/DN. */
export interface EscalatorNode extends NodeBase {
  kind: "escalator";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
  dir: VerticalDir;
}

/**
 * `roof overhang <mm> [wall <id>]` — or `roof polygon (x,y) (x,y) (x,y) …` — the eaves
 * projection line: the outline of what oversails the plan, drawn dashed and measured by
 * nothing.
 *
 * Two spellings of ONE element, exactly as `room` has `at`+`size` / `polygon` / `circle`.
 * The sugar derives its ring from a CLOSED wall ring — the named `wall <id>`, or the
 * plan's single closed `exterior` wall when there is exactly one — by pushing each face
 * out `thickness/2 + overhang` along its own outward normal and re-cornering by exact
 * line–line intersection. The explicit form takes the ring verbatim, implicitly closed,
 * for the roof whose edge is not the building's (a hip cut back over a terrace, a canopy).
 * Never both: the parser takes whichever word follows `roof`.
 */
export interface RoofNode extends NodeBase {
  kind: "roof";
  /** Projection past the wall's OUTER face, in mm (`roof overhang <mm>`). */
  overhang?: Expr;
  /** The closed wall ring to derive from; absent = infer the one closed `exterior` wall. */
  wall?: string;
  /** An explicit, implicitly-closed ring (`roof polygon …`) — mutually exclusive with
   *  {@link RoofNode.overhang}. */
  polygon?: ExprPoint[];
}

/**
 * `void [id=] at (x,y) size WxH` — a hole in THIS storey's floor plate: a stair well, a
 * double-height living room, an atrium.
 *
 * Drawn as the conventional dashed rectangle with both diagonals, and it OBSTRUCTS
 * circulation (you cannot walk across a hole) while leaving the room's area alone — the
 * area a schedule reports is the floor area of the *room*, and subtracting the well would
 * make the drawing and the table disagree about a number neither of them measured. v1 is
 * rectangle-only; a polygonal void is deferred by name, not silently.
 */
export interface VoidNode extends NodeBase {
  kind: "void";
  at: ExprPoint;
  size: { w: Expr; h: Expr };
}

/** One room child of a `strip` block. It carries its main-axis extent and an
 *  optional cross-axis override; the strip supplies the shared cross dimension
 *  when the child omits it. Expanded into an ordinary absolute {@link RoomNode}
 *  during resolve. */
export interface StripRoomChild {
  id: string;
  /** Main-axis extent (width for a right/left strip, height for a down/up strip). */
  main: Expr;
  /** Optional cross-axis extent — overrides the strip's shared `height`/`width`. */
  cross?: Expr;
  label?: Expr;
  uses?: UseKind[];
  line: number;
  span?: Span;
}

/** The four fill axes a `strip` may run along, canonical order — one source for the
 *  parser's accept-list, its diagnostic and the spec's grammar line. */
export const STRIP_DIRS = ["right", "left", "down", "up"] as const;
/** A `strip <dir>` fill axis. */
export type StripDir = (typeof STRIP_DIRS)[number];

/**
 * `strip <dir> at (x,y) gap G (height|width) H { room … }` — a row/column of rooms
 * laid out end to end. `dir` is the fill axis (`right`/`left`/`down`/`up`); each
 * room's main-axis offset is the running sum of prior extents plus `gap`, and the
 * shared cross dimension is the strip's `height` (horizontal) or `width` (vertical),
 * overridable per room. Expanded to ordinary absolute-placed rooms in resolve, so
 * everything downstream is unchanged. A top-level block only (no nesting).
 */
export interface StripNode extends NodeBase {
  kind: "strip";
  dir: StripDir;
  /** Origin corner (top-left of the first room). */
  at: ExprPoint;
  /** Spacing (mm) between consecutive rooms along the fill axis. */
  gap: Expr;
  /** Shared cross-axis dimension (`height` for horizontal, `width` for vertical). */
  cross?: Expr;
  rooms: StripRoomChild[];
}

/**
 * `level <n> ["Name"] { … }` — one **storey** of a multi-storey building.
 *
 * A plan is either single-storey (no `level` block anywhere, the historical shape) or
 * entirely made of level blocks: a drawable statement sitting beside a level block is
 * `E_LEVEL_MIX`. Plan-level *settings* (`units`/`grid`/`paper`/`scale`/`north`/`site`/`dims`/
 * `title`/`axes`/`schedule`/`legend`) and the plan-global scope (`let`/`set`/`component`/
 * `import`) stay OUTSIDE the levels and apply to every one of them — one building, one
 * sheet spec, one set of components.
 *
 * `level` is an integer: `0` and negatives are legal (`level -1 "Basement"`). Numbers must
 * be unique (`E_LEVEL_DUP`) and are drawn in ASCENDING order — the lowest level is page 1
 * (`compile().svg`, `describe()`'s top-level facts). Ids are unique *within* a level, so
 * the same id on two levels is legal and means vertical identity (a stair, a riser).
 *
 * Everything stays expand-time (ADR 0003): each level's body resolves to its own
 * {@link import("./ir.js").ResolvedPlan} and its own Scene, so a storey is one drawing.
 */
export interface LevelNode extends NodeBase {
  kind: "level";
  /** The storey number as authored (integer; 0/negative legal). */
  level: number;
  /** Optional storey name (`level 1 "Ground floor"`) — a fact + a title-block row. */
  name?: string;
  body: Statement[];
}

/**
 * `zone <id> ["Label"] { … }` — a **wing / department / departmental grouping**: a purely
 * LEXICAL container that labels the statements written inside it.
 *
 * It has **zero geometric semantics**. Every statement in the body resolves *exactly* as
 * if the `zone … { }` wrapper were not written — same coordinates, same ids, same
 * auto-id numbering, same `let`/`set` visibility (a zone is deliberately **not** a scope,
 * which is what makes that law total), byte-identical Scene and SVG. The only thing it
 * adds is metadata: every element born inside it records the zone's dotted **path**, and
 * `describe().zones` reports the grouping.
 *
 * Membership is by **DECLARATION, never by geometry** (ADR 0005 — facts, no invisible
 * architect): a room is in a wing because the author wrote it in that wing's block, not
 * because the compiler noticed it sits on the west side of the building.
 *
 * Zones **nest**: a `room` inside `zone west { zone galleries { … } }` records the path
 * `west.galleries`, and the innermost zone is the one it belongs to directly. A zone may
 * be written wherever a statement may (plan level, inside a `level` block, inside a
 * `for`/`if`/`while` body, inside a `component`); re-declaring the same path (a `zone` in
 * a `for` loop, say) MERGES — the first declaration's label wins.
 */
export interface ZoneNode extends NodeBase {
  kind: "zone";
  // The zone's own identifier is {@link NodeBase.id} — the last segment of its path.
  /** Optional printed name (`zone west "West wing"`), a fact + a schedule group heading. */
  label?: string;
  body: Statement[];
}

/** Discriminated union of all element AST nodes (registry-dispatchable). */
export type AstElement =
  | WallNode
  | RoomNode
  | DoorNode
  | WindowNode
  | OpeningNode
  | FurnitureNode
  | DimNode
  | ColumnNode
  | StairNode
  | ElevatorNode
  | EscalatorNode
  | RoofNode
  | VoidNode;

/** `let NAME = <expr>` — a binding statement. */
export interface LetNode extends NodeBase {
  kind: "let";
  name: string;
  value: Expr;
}

/** `NAME(args)` — instantiate a component (expanded during resolve). */
export interface InstanceNode extends NodeBase {
  kind: "instance";
  name: string;
  args: Expr[];
}

/** A quarter-turn a `place` may apply to a component instance. */
export type PlaceRotate = 0 | 90 | 180 | 270;

/**
 * `place NAME(args) as <name> at (x,y) [rotate 0|90|180|270] [mirror x|y]` —
 * instantiate a component as an **addressable, transformed instance** (component v2).
 *
 * This is the counterpart of the bare call `NAME(args)`, which stays a **legacy macro**:
 * it splices the body into the caller's coordinate system and the caller's id space, with
 * global per-kind auto-id counters. `place` instead treats the component as a closed
 * world authored in LOCAL coordinates from `(0,0)`:
 *
 *  - `as <name>` is REQUIRED — the instance is addressable, and every id born inside it is
 *    namespaced `<name>.<id>` (auto-id counters restart per instance, so two instances are
 *    order-independent).
 *  - `at (x,y)` is REQUIRED — where the component's local origin lands. There is no
 *    implicit placement: a component that must be positioned by the caller says so.
 *  - `rotate`/`mirror` are a **rigid transform of the whole instance**, applied to the
 *    resolved sub-plan. Both are exact (quarter turns + axis reflections, integer
 *    arithmetic — never trig), so output stays byte-stable.
 *
 * `mirror x` flips the instance LEFT↔RIGHT (its x coordinates negate); `mirror y` flips it
 * TOP↔BOTTOM. A mirror is a real physical reflection: door swings come out mirror-image.
 */
export interface PlaceNode extends NodeBase {
  kind: "place";
  /** Component (or whole-file import alias) being instantiated. */
  name: string;
  args: Expr[];
  /** The `as <name>` instance name — required; also the id namespace prefix. */
  alias: string;
  /** Byte span of the alias token, for the duplicate-instance diagnostic. */
  aliasSpan?: Span;
  /** Where the component's local origin lands in the caller's coordinates. */
  at: ExprPoint;
  /** Quarter-turn applied to the instance (default 0). */
  rotate?: PlaceRotate;
  /** Axis reflection applied to the instance before the rotation. */
  mirror?: "x" | "y";
}

/** `for NAME in <expr> { body }` — expanded over the iterable during resolve. */
export interface ForNode extends NodeBase {
  kind: "for";
  varName: string;
  iter: Expr;
  body: Statement[];
}

/** `if <expr> { then } [else { else }]` — control flow, expanded during resolve. */
export interface IfNode extends NodeBase {
  kind: "if";
  cond: Expr;
  then: Statement[];
  else?: Statement[];
}

/** `while <expr> { body }` — bounded loop, expanded during resolve. */
export interface WhileNode extends NodeBase {
  kind: "while";
  cond: Expr;
  body: Statement[];
}

/** `NAME = <expr>` — reassign an existing binding (expand-time, makes `while`
 *  loops terminate). Distinct from `let`, which declares. */
export interface AssignNode extends NodeBase {
  kind: "assign";
  name: string;
  value: Expr;
}

/** One `key: value` override inside a `set` rule. */
export interface SetOverride {
  key: string;
  value: Expr;
}

/** `set <kind>(key: value, …)` — override defaults for subsequent elements of
 *  that kind, scoped to the enclosing block. */
export interface SetNode extends NodeBase {
  kind: "set";
  target: ElementKind;
  over: SetOverride[];
}

/**
 * A statement the parser could not parse. Instead of silently dropping the
 * broken region, the parser emits one of these (capturing the skipped span and
 * the diagnostic message), so the tree stays lossless and tooling can see the
 * hole. It carries no geometry; `resolve` skips it.
 */
export interface ErrorNode extends NodeBase {
  kind: "error";
  message: string;
}

/** A plan-body statement in source order. */
export type Statement =
  | AstElement
  | LetNode
  | InstanceNode
  | PlaceNode
  | ForNode
  | IfNode
  | WhileNode
  | AssignNode
  | SetNode
  | StripNode
  | LevelNode
  | ZoneNode
  | ErrorNode;

/**
 * Statement kinds that may sit at plan level in a MULTI-STOREY plan (beside the `level`
 * blocks): the plan-global scope only — `let` bindings, `set` defaults, an `assign`, and
 * an already-reported parse `error`. Anything else draws, so it belongs to exactly one
 * storey and mixing it with levels is `E_LEVEL_MIX`. (Settings, `component`s and
 * `import`s are not body statements at all — they are plan fields — so they are always
 * shared.)
 */
export const LEVEL_SHARED_KINDS: readonly Statement["kind"][] = ["let", "set", "assign", "error", "level"];

/** `component NAME(params) { body }` — a reusable parameterised sub-plan. */
export interface ComponentDef {
  name: string;
  params: string[];
  body: Statement[];
  line: number;
  span?: Span;
  /**
   * The module path this definition was parsed from, when it came in through an
   * `import`. Its `body`'s spans (and therefore every fix edit derived from them) are
   * offsets into THAT file, not into the compiled source — so every diagnostic raised
   * while expanding this body carries it as {@link import("./diagnostics.js").Diagnostic.file},
   * and `applyFixes` refuses to splice a foreign-file edit into the importer. Absent for
   * a component declared in the compiled source (the historical case).
   */
  file?: string;
  /**
   * The component map this body's calls resolve against, when it is not the importing
   * plan's. Set for the synthetic whole-file component built by `import "x.arch" as N`,
   * so a module that calls its OWN private helpers still expands after being imported by
   * name alone. Absent = resolve against the instantiating plan's components.
   */
  scope?: Map<string, ComponentDef>;
  /**
   * True for the synthetic component `import "<file>" as <name>` builds out of a
   * module's top-level drawable statements — the "one file authors one room/area"
   * form. Recorded for diagnostics only.
   */
  wholeFile?: boolean;
}

/** One named item in an `import` list, optionally renamed with `as`. */
export interface ImportItem {
  name: string;
  alias?: string;
}

/**
 * `import "<spec>" : a, b as c` (named items) or `import "<spec>" : *` (all).
 * `spec` is a module reference — a relative `.arch` path or a namespaced
 * `@local/name:1.0.0` — resolved through the {@link import("./world.js").World}
 * at link time. Imports bring the module's **components** into this plan.
 */
export interface ImportNode {
  kind: "import";
  spec: string;
  items: ImportItem[];
  /** `import "x": *` — bring in every exported component. */
  star: boolean;
  /**
   * `import "wing.arch" as wing` (no `:` item list) — **whole-file instantiation**: the
   * module's own top-level DRAWABLE statements become one implicit zero-parameter
   * component bound to this name, so a file that draws a room IS a component. The
   * module's plan-level settings (`units`/`grid`/`paper`/`scale`/`north`/`site`/`title`/…) are
   * deliberately IGNORED — settings come from the root plan, because one drawing is
   * issued on one sheet at one scale.
   */
  wholeAs?: string;
  line: number;
  span?: Span;
}

export interface TitleNode {
  project?: string;
  drawnBy?: string;
  date?: string;
  line: number;
  span?: Span;
}

/**
 * `axes { x at <expr>, … y at <expr>, … }` — the plan's **positioning axes**
 * (定位轴线, GB/T 50001): author-declared structural datum lines the whole drawing
 * is measured from. Two lists of positions in mm: `x` are vertical lines (read
 * left-to-right, numbered ①②③…), `y` are horizontal ones (read bottom-to-top,
 * lettered ⒶⒷⒸ…).
 *
 * Positions are {@link Expr}s so they evaluate at expand time like every other
 * coordinate (`let W = 6000` then `x at 0, W, 2*W` is legal). They are **datums the
 * author declares, never geometry the compiler derives from walls** (ADR 0005: facts,
 * no invisible architect) — and the labels are the reverse: always derived from
 * sorted position, never authored.
 *
 * Repeated `axes` blocks merge (both lists append), like `theme`.
 */
export interface AxesNode {
  /** Vertical axis positions (x coordinates), in source order. */
  x: Expr[];
  /** Horizontal axis positions (y coordinates), in source order. */
  y: Expr[];
  line: number;
  span?: Span;
}

/**
 * What a `schedule <subject>` statement tabulates. **Only `rooms` exists in v1.20** —
 * the keyword takes an explicit subject purely so a later release can add `doors`,
 * `windows` or `finishes` without a second keyword or a breaking respelling. An
 * unrecognised subject is a parse error with a did-you-mean over this list, never a
 * silently ignored word.
 */
export const SCHEDULE_SUBJECTS = ["rooms"] as const;
export type ScheduleSubject = (typeof SCHEDULE_SUBJECTS)[number];

/**
 * The four compass words a `site { street … }` may name. Source spells WORDS; every
 * machine surface keeps the LETTERS the tree already uses (`describe().windows[].facing`
 * is `"N"|"S"|"E"|"W"`), so one concept never gets two JSON spellings — the single
 * word→letter mapping is `compassLetter` in `src/site.ts`.
 *
 * Pinned against `KEYWORDS` by `test/site.test.ts`, which also pins that `north` is
 * deliberately NOT in `KEYWORDS.enum` (it already lives in `KEYWORDS.attribute`, because
 * `north up` is a statement — see that test for why the asymmetry is on purpose).
 */
export const COMPASS_DIRECTIONS = ["north", "south", "east", "west"] as const;
export type CompassWord = (typeof COMPASS_DIRECTIONS)[number];

/** Which hemisphere the building sits in — the ONE input that decides which way the
 *  equator lies (`south` in the north, `north` in the south). Not a latitude: no number
 *  here, and nothing downstream computes a sun path from it (see `src/site.ts`). */
export const HEMISPHERES = ["north", "south"] as const;
export type Hemisphere = (typeof HEMISPHERES)[number];

/**
 * `site { street north|south|east|west [hemisphere north|south] }` — where the building
 * sits relative to its street, so a brief can name a direction instead of a letter.
 *
 * A plan-level setting, like `north`, which it composes with: `street` is a TRUE compass
 * direction, and every name derived from it (`back`, `equator_side`, `sunrise_side`,
 * `sunset_side` — see `src/site.ts`) is a compass letter too. Declaring it draws NOTHING
 * and changes no geometry; a plan with no `site` is byte-identical everywhere.
 *
 * `hemisphere` defaults to `north` and is stored resolved, so nothing downstream carries
 * the default a second time.
 */
export interface SiteNode {
  /** The compass direction the building's street frontage faces. Required. */
  street: CompassWord;
  /** Which hemisphere the building sits in; `north` unless the source says otherwise. */
  hemisphere: Hemisphere;
  line: number;
  /** Byte span of the whole `site { … }` block, for the site diagnostics. */
  span?: Span;
}

export interface PlanNode {
  name: string;
  /** Only "mm" is supported. */
  units: "mm";
  /** Snap module in mm; 0 disables snapping. */
  grid: number;
  /**
   * `paper A1 [landscape|portrait]` — the sheet the drawing is issued on. Declaring it
   * makes {@link scale} **operative**: every annotation size becomes a fixed number of
   * millimetres on that sheet instead of a fraction of the drawing's own size. Absent
   * (the default) → the historical reference-dimension sizing, byte-for-byte.
   */
  paper?: PaperSpec;
  /** Byte span of the `paper` statement, for the sheet diagnostics. */
  paperSpan?: Span;
  /**
   * e.g. "1:50". Annotation-only (a title-block row) on its own; with {@link paper} it
   * is the operative drawing scale every size is derived from.
   */
  scale?: string;
  /** Byte span of the `scale` statement, for the sheet diagnostics. */
  scaleSpan?: Span;
  north: NorthDir;
  /**
   * `site { street … [hemisphere …] }` — the building's relation to its street, and the
   * hemisphere the derived direction names are read in. Absent unless the plan declares
   * it, so an existing plan is byte-identical (nothing here draws or moves anything).
   */
  site?: SiteNode;
  /** `dims auto [overall|rooms|walls|all]` — synthesize dimension strings at render. */
  autoDims?: AutoDimsMode;
  /** `axes { x at … y at … }` — author-declared positioning axes (定位轴线). */
  axes?: AxesNode;
  /**
   * `schedule rooms` — draw the ROOM SCHEDULE table in the sheet's bottom band.
   * Absent unless the plan opts in, so an existing drawing is byte-identical.
   */
  schedule?: ScheduleSubject;
  /**
   * `legend` — draw the LEGEND table (wall materials + fixture symbols actually used),
   * derived closed-form from the plan. Absent unless the plan opts in.
   */
  legend?: boolean;
  title?: TitleNode;
  /** Explicit accessible title (`accTitle "…"`) — overrides the plan name in the
   *  accessible-SVG `<title>` (`compile(src, { accessible: true })`). Metadata only. */
  accTitle?: string;
  /** Explicit accessible description (`accDescr "…"`) — overrides the derived
   *  caption in the accessible-SVG `<desc>`. Metadata only. */
  accDescr?: string;
  /** Theme overrides from the `theme { … }` directive. */
  theme?: Partial<Theme>;
  /** Named theme base from `theme <name> { … }` (resolved at lowering). */
  themeBase?: string;
  /** Wall colour for `theme from "#color"` — opt-in poché derivation. */
  themeFrom?: string;
  /** Per-element style overrides (`style <kind> { … }`), by kind → Theme partial. */
  styles?: Record<string, Partial<Theme>>;
  /** Component definitions, by name. */
  components: Map<string, ComponentDef>;
  /** Module imports (header-level), resolved at link time before resolve. */
  imports: ImportNode[];
  /** All statements (elements, `let`s, instances), in source order. */
  body: Statement[];
  /** Line comments captured as trivia (for the formatter / LSP); not semantic. */
  comments?: Comment[];
  /** Byte offset just past the body's opening `{` — lets the formatter tell
   *  file-header comments (before it) from in-body comments. */
  bodyStart?: number;
}
