/**
 * The docs site's words for a plan's facts, by the playground's rule (playground/src/facts-line.js,
 * whose `areaText` this repeats: the two build systems share no module): an area is net when
 * describe() has it, and says so, else centreline, and says so; a count agrees with its noun.
 * `test/docs-facts-text.test.ts` holds the two copies to the same output.
 */

/** An area with its convention: net when describe() has it, else centreline. */
export function areaText(net: number | undefined, centreline: number): string {
  return net !== undefined ? `${net} m² (net)` : `${centreline} m² (centreline)`;
}

/** `1 room`, `3 rooms`. */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The live example's facts line: `1 room · 1 door · 1 window · 18.24 m² (net)`. */
export function factsText(t: {
  rooms: number;
  doors: number;
  windows: number;
  floor_area_m2: number;
  net_floor_area_m2?: number;
}): string {
  return [
    count(t.rooms, "room"),
    count(t.doors, "door"),
    count(t.windows, "window"),
    areaText(t.net_floor_area_m2, t.floor_area_m2),
  ].join(" · ");
}
