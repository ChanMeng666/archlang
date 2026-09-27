/**
 * The PINNED equivariance violations — data for `test/equivariance-*.test.ts`.
 *
 * Every violation the D4 ⋉ Z² oracle (`test/d4-oracle.ts`) finds is either a defect a later
 * change will close, or a declared convention that is not a group fact. Each is pinned
 * here, and the suites assert the computed set EQUALS this table in both directions (the
 * G.10 tripwire of `test/plan-json.test.ts`, generalised):
 *
 *  - a violation not in {@link KNOWN} fails as `NEW equivariance violation …` — a
 *    regression, or a new finding to classify and pin with a witness;
 *  - a row no longer observed fails as `FIXED: delete the pin and its witness …` — the
 *    defect closed, so the pin (and its `STILL …` witness, which fails at the same moment)
 *    must go, turning the tripwire into the law it was waiting for.
 *
 * A row stands for the cross product of its `where` and `g` lists with its one `path`
 * (`d4-oracle.ts`'s `generalize` drops element ids: `rooms[].bbox`). `g` is a group
 * element's name (`r90`, `mx`, `r90mx` = `rotate 90 mirror x`, `t` = the translation),
 * `+N` when north turned with it, and `T0` for the wrapper-faithfulness tier. Two rows may
 * pin the same triple when two classes both break it.
 *
 * The fuzz suite cannot name examples, so it excludes whole CLASSES: {@link KNOWN_CLASSES}
 * says, per class, which violation of a random plan the class accounts for — as narrowly
 * as the evidence allows (a sliding door by its source, a facing tie only under an
 * axis-swapping element), never a blanket path.
 */

import type { GroupElement, Violation } from "./d4-oracle.js";

/** Every pinned class. */
export type ClassName =
  | "fix-pullback"
  | "stair-tail"
  | "stair-break-hand"
  | "plugin-throw"
  | "facing-tie"
  | "raster-tie"
  | "float-translation"
  | "slide-track"
  | "column-corner"
  | "dim-text-side"
  | "nested-ref";

/** What the fuzz suite knows about one case when it asks a class to account for a violation. */
export interface CaseContext {
  g: GroupElement;
  /** The element's linear part has `det < 0`. */
  reflects: boolean;
  /** The element's linear part swaps the axes (a quarter-turn). */
  swaps: boolean;
  /** gP's source — so a class can name the construct it is about (`door id=o2 sliding`). */
  src: string;
  /** Every violated path of this case. */
  paths: ReadonlySet<string>;
}

export interface KnownClass {
  /** `defect`: a later change closes it. `declared`: a convention, never a defect. */
  status: "defect" | "declared";
  /** Where in `src/` the non-equivariant rule lives. */
  site: string;
  /** One line: what breaks. */
  summary: string;
  /** Does this class account for violation `v` of a random case? (fuzz exclusion) */
  covers(v: Violation, c: CaseContext): boolean;
}

/** The nav-grid facts and the lint rules that read the nav grid. */
const RASTER_PATH = /^(circulation($|\.)|lint\.(room-no-clear-path|path-too-narrow|circuitous-path)($|\.))/;

/** The element id inside a scene key: `scene.door[g.o2]` → `o2`. */
const localId = (key: string): string => (/\[g\.([^\]]+)\]/.exec(key)?.[1] ?? "").split(".").pop() ?? "";

export const KNOWN_CLASSES: Readonly<Record<ClassName, KnownClass>> = {
  "fix-pullback": {
    status: "defect",
    site: "src/lint/rules/furniture.ts:196,207; src/lint/rules/dims.ts:180",
    summary:
      "a lint fix is computed from PLAN-space geometry (a fixture's global quarter-turn, a dim's reflected offset) but edits the SHARED component source, so the rewrite is wrong for every placed instance but the unturned one",
    // Same diagnostics, different fix text — never a fix difference that merely follows a
    // diagnostic difference.
    covers: (v, c) => v.path.endsWith(".fixes") && !c.paths.has(v.path.replace(/\.fixes$/, "")),
  },
  "stair-tail": {
    status: "defect",
    site: "src/vertical.ts:72,98 (footEdge/tailEdge)",
    summary:
      "a stair/escalator arrow's tail (and the entry edge the nav grid opens) is a fixed page rule — larger-coordinate end of the long axis — so a turned run points the wrong way",
    covers: (v) => /^scene\.(stair|escalator|elevator)\[\]$/.test(v.path),
  },
  "stair-break-hand": {
    status: "defect",
    site: "src/elements/vertical-glyphs.ts:144 (the break-line diagonals)",
    summary: "a stair's break line is drawn with a fixed handedness and a reflected stair never reads its mirror",
    covers: (v, c) => c.reflects && v.path === "scene.stair[]",
  },
  "plugin-throw": {
    status: "defect",
    site: "src/frame.ts:296-303 (transformGeometry has no arm for a plugin kind)",
    summary: "a plugin element inside a placed component makes compile() THROW instead of returning a diagnostic",
    covers: () => false,
  },
  "facing-tie": {
    status: "declared",
    site: "src/site.ts:191,206 (ties resolve horizontal-first, then N/W)",
    summary:
      "a window equidistant from two room edges (a corner) or on a 45° wall is a TIE, and ties resolve N/S before E/W by stated convention — a page-order rule, so an axis swap changes the answer",
    covers: (v, c) => c.swaps && v.path === "windows[].facing",
  },
  "raster-tie": {
    status: "defect",
    site: "src/analyze/circulation.ts:285 (cellOf floors a boundary point to the +x/+y cell), :962-986 (the room anchor is the lowest-index of equidistant cells)",
    summary:
      "the nav grid breaks ties in PAGE order, so even on a lattice the group maps onto itself a turn or flip moves a threshold or a room anchor by a cell: walk distances, bottlenecks, the sealed set and the raster lint rules all shift",
    covers: (v, c) => !c.g.translate && RASTER_PATH.test(v.path),
  },
  "float-translation": {
    status: "defect",
    site: "src/analyze/circulation.ts (nav grid sampled in absolute float coordinates)",
    summary:
      "circulation is measured in ABSOLUTE float coordinates, so a translation moves a curved or tessellated boundary across a cell centre by an ulp: walks and detour ratios change under a pure translation",
    covers: (v, c) => c.g.translate === true && RASTER_PATH.test(v.path),
  },
  "slide-track": {
    status: "defect",
    site: "src/elements/door-panels.ts:135-136 (the fixed panel's track is `n * off * sd`)",
    summary:
      "a sliding door's fixed/moving panels pick their track from the wall's LEFT normal times `slide`, a handed product the reflection never flips, so a mirrored door swaps its panels' faces",
    covers: (v, c) =>
      c.reflects && /^scene\.door\[/.test(v.key) && new RegExp(`door id=${localId(v.key)} sliding\\b`).test(c.src),
  },
  "column-corner": {
    status: "defect",
    site: "src/frame.ts:393-398 (treats `column.at` as the CENTRE) vs src/elements/column.ts:20-24 (it is the TOP-LEFT)",
    summary:
      "the frame carries a column's `at` as a centre point, but a column's `at` is its top-left corner, so a turned or flipped column lands one size away (the transposition alone happens to be right)",
    // A misplaced column that is the drawing's outermost element also moves the extent the
    // sheet fit is measured on — so the sheet verdicts follow, but only alongside the
    // column's own violation.
    covers: (v, c) =>
      v.path === "scene.column[]" ||
      ((v.path === "sheet" || v.path === "diagnostics.sheet") && c.paths.has("scene.column[]")),
  },
  "dim-text-side": {
    status: "defect",
    site: "src/elements/dim.ts:320 (text on the +normal side) with src/frame.ts:392 (reflection negates `offset`)",
    summary:
      "a reflection negates a dim's `offset` but the number is always drawn on the from→to LEFT normal, so a mirrored dimension's number moves between its line and what it measures",
    covers: (v, c) => c.reflects && v.path === "scene.dim[]",
  },
  "nested-ref": {
    status: "defect",
    site: "src/ir.ts:1773 (an instance group resolves against its OWN walls/rooms only)",
    summary:
      "inside a component, a reference INTO a nested instance (`in c2.main anchor …`, `on west.shell at …`, `wall west.shell`) does not resolve, because the nested instance's elements go straight to plan space and never enter the enclosing instance's group — so a plan that composes instances works at the root and breaks the moment it is itself placed",
    covers: () => false,
  },
};

/** One pinned violation (or a cross product of them). */
export interface KnownViolation {
  where: string | readonly string[];
  g: string | readonly string[];
  path: string;
  cls: ClassName;
  /** One line: why this row is observed. */
  why: string;
  /** What closes it. */
  closesWith: string;
}

const ROT_REFL_ALL = ["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r270mx"] as const;

export const KNOWN: readonly KnownViolation[] = [
  // ---- T0: the wrapper is not faithful -------------------------------------------------
  {
    where: "clinic.arch",
    g: "T0",
    path: "ok",
    cls: "nested-ref",
    why: "clinic's root `furniture f_ecg … in c2.main anchor bottom-right` is E_PLACE_REF once the file is itself a placed component",
    closesWith: "resolve a component's references against its nested instances' (transformed) walls and rooms",
  },
  {
    where: "museum-wings.arch",
    g: "T0",
    path: "access",
    cls: "nested-ref",
    why: "`door d_west/d_east … wall west.shell|east.shell` no longer host, so their access edges lose their host wall",
    closesWith: "resolve a component's references against its nested instances' (transformed) walls and rooms",
  },
  {
    where: "museum-wings.arch",
    g: "T0",
    path: "diagnostics",
    cls: "nested-ref",
    why: "the same two doors raise W_DOOR_OFF_WALL + W_SWING_ROOM_NOT_ADJACENT inside the wrapper",
    closesWith: "resolve a component's references against its nested instances' (transformed) walls and rooms",
  },

  // ---- T1: describe() -------------------------------------------------------------------
  {
    where: "aquarium.arch",
    g: ["r90", "r90mx"],
    path: "windows[].facing",
    cls: "facing-tie",
    why: "w_arc2 sits at the drum's 45° point, a probe tie read N/S-first",
    closesWith: "never — declared convention (src/site.ts); pin moves only if the tie rule changes",
  },

  // ---- T2: the raster -------------------------------------------------------------------
  {
    where: ["aquarium.arch", "library.arch"],
    g: "t",
    path: "circulation",
    cls: "float-translation",
    why: "aquarium's detour ratio (1.01 → 1) and library's reading-room walk (25500 → 25300) move with a 20 m translation",
    closesWith: "sample the nav grid in coordinates relative to its own origin",
  },
  {
    where: [
      "accessible.arch",
      "aquarium.arch",
      "attached.arch",
      "garden-loft.arch",
      "library.arch",
      "materials.arch",
      "museum-wings.arch",
      "one-room.arch",
      "relational.arch",
      "terrace-row.arch",
      "tiny-house.arch",
      "two-bed.arch",
    ],
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: ["bungalow.arch", "laneway-house.arch"],
    g: ["r90", "r180", "mx", "r90mx", "r90+N", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: "courtyard-house.arch",
    g: [...ROT_REFL_ALL, "r90+N", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: ["furnished-flat.arch", "museum-wing.arch", "studio.arch"],
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: "hexagon-pavilion.arch",
    g: [...ROT_REFL_ALL, "r90+N"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: "imports.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },
  {
    where: "parametric.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    cls: "raster-tie",
    why: "a door centred on a lattice line or a room seed on a lattice corner is a nav-grid tie, broken in page order",
    closesWith: "break nav-grid ties by a D4-symmetric rule (or measure ties both ways)",
  },

  // ---- T3: the scene ------------------------------------------------------------------
  {
    where: "museum.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "scene.column[]",
    cls: "column-corner",
    why: "every gallery column is carried as a centre and lands one column-size off",
    closesWith: "carry a column through `transformRect`, like every other top-left rectangle",
  },
  {
    where: "transit-hall.arch",
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx"],
    path: "scene.column[]",
    cls: "column-corner",
    why: "every platform column is carried as a centre and lands one column-size off (r270mx, the transposition, happens to be right)",
    closesWith: "carry a column through `transformRect`, like every other top-left rectangle",
  },
  {
    where: [
      "aquarium.arch",
      "gallery-l.arch",
      "imports.arch",
      "library.arch",
      "parametric.arch",
      "relational.arch",
      "themed.arch",
      "tiny-house.arch",
      "two-bed.arch",
    ],
    g: ["mx", "r90mx"],
    path: "scene.dim[]",
    cls: "dim-text-side",
    why: "each hand-written dim's number lands on the building side of its line under a reflection",
    closesWith: "draw the number on the side the offset points (sign(offset)·n), or reflect by swapping endpoints",
  },
  {
    where: ["hexagon-pavilion.arch", "studio.arch"],
    g: ["mx", "r90mx", "r180mx", "r270mx"],
    path: "scene.dim[]",
    cls: "dim-text-side",
    why: "each hand-written dim's number lands on the building side of its line under a reflection",
    closesWith: "draw the number on the side the offset points (sign(offset)·n), or reflect by swapping endpoints",
  },
  {
    where: ["bungalow.arch", "laneway-house.arch", "materials.arch", "terrace-row.arch"],
    g: ["mx", "r90mx"],
    path: "scene.door[]",
    cls: "slide-track",
    why: "every `sliding` door swaps which track its fixed panel runs on",
    closesWith: "flip the track choice with the frame's determinant (as `swing` is), or derive it from `slide` alone",
  },
  {
    where: ["courtyard-house.arch", "hexagon-pavilion.arch"],
    g: ["mx", "r90mx", "r180mx", "r270mx"],
    path: "scene.door[]",
    cls: "slide-track",
    why: "every `sliding` door swaps which track its fixed panel runs on",
    closesWith: "flip the track choice with the frame's determinant (as `swing` is), or derive it from `slide` alone",
  },
  {
    where: "transit-hall.arch",
    g: ["r90", "r180", "r90mx", "r180mx"],
    path: "scene.escalator[]",
    cls: "stair-tail",
    why: "both escalators' arrows keep the fixed page tail; the entry-edge SET happens to be symmetric",
    closesWith: "carry the tail edge through the frame (or an authored `entry <edge>`)",
  },
  {
    where: "library.arch",
    g: ["r90", "r180", "r90mx"],
    path: "scene.stair[]",
    cls: "stair-tail",
    why: "st_main's arrow keeps the fixed page tail",
    closesWith: "carry the tail edge through the frame (or an authored `entry <edge>`)",
  },
  {
    where: "library.arch",
    g: ["mx", "r90mx"],
    path: "scene.stair[]",
    cls: "stair-break-hand",
    why: "st_main's break-line diagonals keep their handedness",
    closesWith: "mirror the break line when the frame reflects (a `_mirror` flag, as fixtures carry)",
  },
];
