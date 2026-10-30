/**
 * The replay's metrics strip (card G4): a line of plain facts under the picture, each shown when
 * the replay reaches the stage that draws it. Browser-safe and free of the core: the facts come in
 * as numbers (`facts.ts` reads them from the core's `describe()` and `lint()` for the same
 * source) and the strip is a pure function of `t` (`stripAt`), like every frame.
 *
 * The strip is a DOM layer over the canvas, never part of it: the canvas's pixels (and so the
 * key-frame hashes, `__frameHash`) are the same with and without it. Text depends on installed
 * fonts, which is why the hashed frames have none (`e2e/fixtures/README.md`).
 *
 * Wording is plain counts and areas, each area saying which convention it uses. It claims nothing
 * about the plan being good, compliant or checked: a warnings count is a count of what `lint()`
 * reported, nothing more.
 */
import { type ReplayEvent, PHASE } from "./timeline.js";

/** What the strip says. Areas are m²; `areaNet` is absent where the core cannot give it. */
export interface ReplayFacts {
  /** The storeys the combined view shows; absent in a single-storey view (nothing to count). */
  storeys?: number;
  rooms: number;
  doors: number;
  windows: number;
  /** Floor area measured to the wall centre lines (the core's `floor_area_m2`). */
  areaCentre: number;
  /** Floor area net of the wall solids (the core's `net_floor_area_m2`). */
  areaNet?: number;
  /** The number of warnings `lint()` reports for the plan. */
  warnings: number;
}

export interface StripItem {
  id: "storeys" | "rooms" | "area-net" | "area-centre" | "doors" | "windows" | "warnings";
  text: string;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** At most two decimals, none when whole: 56 → "56", 45.05 → "45.05". */
const m2 = (a: number): string => `${Number(a.toFixed(2))} m²`;

/** When a stage first shows (its earliest visible node), else `fallback`. */
function reveal(events: readonly ReplayEvent[], stage: ReplayEvent["stage"], fallback: number): number {
  let t: number | undefined;
  for (const e of events) if (e.stage === stage && !e.hidden && (t === undefined || e.appear < t)) t = e.appear;
  return t ?? fallback;
}

/**
 * The items showing at replay time `t`, in a fixed order: storeys (from the start), rooms and
 * areas (when the first floor appears), doors and windows (when the first opening appears),
 * warnings (when the core's drawing is fully over the plan). A pure function of `facts`, the event
 * table and `t`.
 */
export function stripAt(facts: ReplayFacts, events: readonly ReplayEvent[], t: number): StripItem[] {
  const rooms = reveal(events, "rooms", PHASE.drawn);
  const openings = reveal(events, "openings", PHASE.drawn);
  const out: StripItem[] = [];
  const add = (at: number, item: StripItem): void => {
    if (t >= at) out.push(item);
  };
  if (facts.storeys !== undefined)
    add(reveal(events, "brief", 0), { id: "storeys", text: count(facts.storeys, "storey", "storeys") });
  add(rooms, { id: "rooms", text: count(facts.rooms, "room", "rooms") });
  if (facts.areaNet !== undefined) add(rooms, { id: "area-net", text: `floor area ${m2(facts.areaNet)} (net)` });
  add(rooms, { id: "area-centre", text: `floor area ${m2(facts.areaCentre)} (to wall centre lines)` });
  add(openings, { id: "doors", text: count(facts.doors, "door", "doors") });
  add(openings, { id: "windows", text: count(facts.windows, "window", "windows") });
  add(PHASE.svgIn, {
    id: "warnings",
    text: facts.warnings === 0 ? "no warnings" : count(facts.warnings, "warning", "warnings"),
  });
  return out;
}

/** Paint `items` into `el` (one span each); touches the DOM only when the text changed. */
export function paintStrip(el: HTMLElement, items: readonly StripItem[]): void {
  const key = items.map((i) => `${i.id}=${i.text}`).join("|");
  if (el.dataset.stripKey === key) return;
  el.dataset.stripKey = key;
  el.hidden = items.length === 0;
  // A space between the facts (flex ignores it on screen) keeps the text readable as text.
  const nodes: Node[] = [];
  for (const i of items) {
    const s = el.ownerDocument.createElement("span");
    s.dataset.fact = i.id;
    s.textContent = i.text;
    if (nodes.length > 0) nodes.push(el.ownerDocument.createTextNode(" "));
    nodes.push(s);
  }
  el.replaceChildren(...nodes);
}
