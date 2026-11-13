/**
 * Room-type mapping (uses ⇄ RPLAN-style `room_type`) — ONE source of truth for Plan JSON and
 * `describe()`'s `room_type` (moved verbatim from `src/plan-json.ts`, which re-exports every name
 * it exported).
 *
 * Invariant: every `UseKind` maps to exactly one `RoomType`, and a room with several uses takes
 * the first by `USE_PRIORITY`. Pure tables and lookups; it charges nothing to the step meter.
 */

import type { UseKind } from "../ast.js";

/** Canonical RPLAN-style room category. `Room` is the catch-all fallback. */
export type RoomType =
  | "LivingRoom"
  | "MasterRoom"
  | "Kitchen"
  | "Bathroom"
  | "DiningRoom"
  | "ChildRoom"
  | "StudyRoom"
  | "SecondRoom"
  | "GuestRoom"
  | "Balcony"
  | "Entrance"
  | "Storage"
  | "Room";

/** Every {@link RoomType} in canonical order (the enum the JSON schema advertises). */
export const ROOM_TYPES: readonly RoomType[] = [
  "LivingRoom",
  "MasterRoom",
  "Kitchen",
  "Bathroom",
  "DiningRoom",
  "ChildRoom",
  "StudyRoom",
  "SecondRoom",
  "GuestRoom",
  "Balcony",
  "Entrance",
  "Storage",
  "Room",
];

/**
 * The canonical `room_type` for each ArchLang `uses` tag. Several uses collapse to
 * one room_type (wet rooms → `Bathroom`; hall/circulation/entry → `Entrance`;
 * storage/utility → `Storage`), so the mapping is deliberately many-to-one in this
 * direction. See {@link ROOM_TYPE_TO_USE} for the (lossy) inverse.
 */
export const USE_TO_ROOM_TYPE: Readonly<Record<UseKind, RoomType>> = Object.freeze({
  living: "LivingRoom",
  kitchen: "Kitchen",
  dining: "DiningRoom",
  bedroom: "MasterRoom",
  bath: "Bathroom",
  wc: "Bathroom",
  hall: "Entrance",
  circulation: "Entrance",
  storage: "Storage",
  utility: "Storage",
  office: "StudyRoom",
  entry: "Entrance",
  // RPLAN has no garage category, and inventing one would put a value in the wire format
  // that the schema's own enum (and therefore every consumer validating against it) does
  // not know. `Storage` is where the many-to-one collapse already sends `utility`, and it
  // is the honest neighbour: a garage is the unconditioned store attached to the house.
  // The inverse is lossy in exactly the way `utility`'s already is — `ROOM_TYPE_TO_USE`
  // maps `Storage` back to `storage`, so a JSON round trip returns `uses storage`. That
  // costs no geometry (a `uses` tag is classification only, so the SVG is byte-identical)
  // and the alternative — a new `Garage` room_type — would be a breaking schema change
  // for a word the format cannot carry back to any other tool.
  garage: "Storage",
});

/**
 * Priority order used to pick a single dominant `room_type` when a room has several
 * `uses` (e.g. a studio is `living kitchen` → `LivingRoom`). The first use present
 * in this order wins.
 */
const USE_PRIORITY: readonly UseKind[] = [
  "living",
  "bedroom",
  "kitchen",
  "dining",
  "office",
  "bath",
  "wc",
  "entry",
  "hall",
  "circulation",
  "storage",
  "utility",
  // Last, beside the other unconditioned stores: a room that is a garage AND something
  // else (`uses garage utility`) reads as the something else on the wire, which is the
  // more informative of the two.
  "garage",
];

/**
 * The primary `uses` tag for each `room_type` — the inverse of {@link USE_TO_ROOM_TYPE}.
 * The RPLAN bedroom variants (`MasterRoom`/`ChildRoom`/`SecondRoom`/`GuestRoom`) all
 * map back to `bedroom`; `Balcony` has no direct ArchLang use so it maps to `utility`;
 * `Room` (the fallback) maps to `null` (no `uses` tag emitted).
 */
export const ROOM_TYPE_TO_USE: Readonly<Record<RoomType, UseKind | null>> = /* @__PURE__ */ Object.freeze({
  LivingRoom: "living",
  MasterRoom: "bedroom",
  Kitchen: "kitchen",
  Bathroom: "bath",
  DiningRoom: "dining",
  ChildRoom: "bedroom",
  StudyRoom: "office",
  SecondRoom: "bedroom",
  GuestRoom: "bedroom",
  Balcony: "utility",
  Entrance: "entry",
  Storage: "storage",
  Room: null,
});

/** The single canonical `room_type` for a set of `uses` tags (`Room` when empty). */
export function roomTypeForUses(uses: Iterable<UseKind>): RoomType {
  const set = new Set<UseKind>(uses);
  for (const u of USE_PRIORITY) if (set.has(u)) return USE_TO_ROOM_TYPE[u];
  return "Room";
}

/** The `uses` tag(s) a `room_type` implies (empty for `Room` / unknown). */
export function usesForRoomType(roomType: string): UseKind[] {
  const u = (ROOM_TYPE_TO_USE as Record<string, UseKind | null | undefined>)[roomType];
  return u ? [u] : [];
}
