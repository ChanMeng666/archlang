/**
 * Takeoff, the Facts tab's second section: `describe --facts quantities` in the browser. It runs the SAME core calls as
 * `arch takeoff` (`describe` with the `quantities` fact, `describeLevel` for the storey on screen,
 * `takeoffCsv` for the export), so the panel and the command line cannot disagree, and it holds no
 * calculation of its own. Its code loads on the Facts tab's first open, like the 3D preview: nothing here
 * is in a startup chunk.
 *
 * The waste percentage is an author's input, as `--waste` is: blank unless typed, never a default,
 * and not remembered across a reload.
 *
 * Everything above {@link mountTakeoff} is pure, for `playground/test/takeoff-panel.test.ts`.
 */
import { describe, describeLevel, MAX_WASTE_PCT, type DescribeOptions, type SceneSummary, takeoffCsv } from "archlang";
import { escapeHtml } from "./escape.js";

/** One storey's block, as `describe` reports it. */
type Quantities = NonNullable<SceneSummary["quantities"]>;

/** The input read: a percentage, nothing (`undefined`), or why it cannot be one. */
export type Waste = { pct?: number } | { error: string };

/** Read the waste box. Blank is no allowance; the bounds are `describe`'s own. */
export function parseWaste(text: string): Waste {
  const t = text.trim();
  if (t === "") return {};
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= MAX_WASTE_PCT
    ? { pct: n }
    : { error: `A percentage from 0 to ${MAX_WASTE_PCT}, or blank for none.` };
}

/** A figure as a cell; a figure the core omitted is a dash, never a zero. */
const num = (n: number | undefined): string => (n === undefined ? "—" : String(n));

/** One table: a caption, its column heads, and rows of cells already formatted. */
function table(title: string, heads: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const th = heads.map((h, i) => `<th scope="col"${i === 0 ? "" : ` class="to-n"`}>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? "" : ` class="to-n"`}>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="to-table"><caption>${escapeHtml(title)}</caption><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * One storey's figures as HTML. Each column names its convention, as the field it reads does, so a
 * figure copied out of the panel says what it measures. A column the plan has no figure for (the
 * wall areas of a plan with no height) is left out, as `takeoff --format md` leaves it out.
 */
export function quantitiesHtml(q: Quantities, labelOf: ReadonlyMap<string, string>): string {
  const areas = q.walls.some((w) => w.face_area_before_openings_m2 !== undefined);
  const walls = table(
    "Walls by category",
    [
      "Category",
      "Count",
      "Centreline length (mm)",
      "Face length (mm)",
      ...(areas ? ["Face area before openings (m²)"] : []),
    ],
    q.walls.map((w) => [
      w.category,
      num(w.count),
      num(w.length_centreline_mm),
      num(w.length_face_mm),
      ...(areas ? [num(w.face_area_before_openings_m2)] : []),
    ]),
  );
  const facesNote = q.faces_omitted
    ? `<p class="to-note">Face lengths are omitted on this storey: ${escapeHtml(q.faces_omitted)}.</p>`
    : "";
  const rooms = table(
    "Rooms",
    ["Room", "Perimeter, centreline (mm)", "Perimeter, net (mm)", "Net area (m²)"],
    q.rooms.map((r) => [
      labelOf.get(r.id) ?? r.id,
      num(r.perimeter_centreline_mm),
      num(r.perimeter_net_mm),
      num(r.area_net_m2),
    ]),
  );
  const floor = table(
    "Floor",
    ["Figure", "Value"],
    [
      ["Net floor area (m²)", num(q.floor_area_net_m2)],
      ...(q.waste_pct !== undefined
        ? [
            ["Waste you entered (%)", num(q.waste_pct)],
            ["Floor area with waste (m²)", num(q.floor_area_with_waste_m2)],
          ]
        : []),
    ],
  );
  const doors = table(
    "Doors",
    ["Kind", "Width (mm)", "Count"],
    q.doors.map((d) => [d.kind, num(d.width_mm), num(d.count)]),
  );
  const windows = table(
    "Windows",
    ["Width (mm)", "Count"],
    q.windows.map((w) => [num(w.width_mm), num(w.count)]),
  );
  return walls + facesNote + rooms + floor + doors + windows;
}

/** The CSV's file name: the plan's name in the shape a download of it takes. */
export function csvFileName(plan: string): string {
  const stem = plan
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${stem || "plan"}-takeoff.csv`;
}

/** What the panel asks the page for. */
export interface TakeoffDeps {
  flash(message: string): void;
}

/** The mounted panel: one update for each recompile or storey change while its tab is open. */
export interface TakeoffPanel {
  update(source: string, level: number | null): void;
}

/** The core's read of `source`, with the box's percentage when it holds one. */
function readPlan(source: string, waste: Waste): SceneSummary {
  const pct = "pct" in waste ? waste.pct : undefined;
  return describe(source, {
    facts: ["quantities"],
    noCache: true,
    ...(pct !== undefined ? { wastePct: pct } : {}),
  } as DescribeOptions & { noCache?: boolean });
}

/** Build the tab's controls in `el` and return its update. */
export function mountTakeoff(el: HTMLElement, deps: TakeoffDeps): TakeoffPanel {
  el.innerHTML =
    `<div class="to-controls">` +
    `<label for="takeoffWaste">Waste %</label>` +
    `<input id="takeoffWaste" class="to-waste" type="text" inputmode="decimal" autocomplete="off" placeholder="none" aria-describedby="takeoffWasteNote" />` +
    `<button id="takeoffCopy" class="repair-btn" type="button">Copy CSV</button>` +
    `<button id="takeoffDownload" class="repair-btn" type="button">Download CSV</button>` +
    `<p id="takeoffWasteNote" class="lint-caption">Your own allowance, added to the net floor area. Blank adds none.</p>` +
    `</div>` +
    `<p class="to-note" id="takeoffStorey"></p>` +
    `<div id="takeoffOutput"></div>` +
    `<p class="to-note">Lengths, areas and counts measured from the plan as drawn, each named for its convention. Check them against the drawings before using them for cost or construction.</p>`;
  const box = el.querySelector<HTMLInputElement>("#takeoffWaste")!;
  const note = el.querySelector<HTMLElement>("#takeoffWasteNote")!;
  const storey = el.querySelector<HTMLElement>("#takeoffStorey")!;
  const output = el.querySelector<HTMLElement>("#takeoffOutput")!;
  const noteText = note.textContent;
  let last = { source: "", level: null as number | null };
  let csv: { text: string; name: string } | null = null;

  const update = (source: string, level: number | null): void => {
    last = { source, level };
    const waste = parseWaste(box.value);
    note.textContent = "error" in waste ? waste.error : noteText;
    note.classList.toggle("to-bad", "error" in waste);
    const whole = readPlan(source, waste);
    if (!whole.ok || !whole.quantities) {
      csv = null;
      storey.textContent = "";
      output.innerHTML = `<p class="empty">Fix the errors to see the plan's quantities.</p>`;
      return;
    }
    const s = level === null ? whole : describeLevel(whole, level);
    // Whole-plan, as `arch takeoff --format csv` writes it, whichever storey is on screen.
    csv = { text: takeoffCsv(whole), name: csvFileName(whole.plan) };
    const shown = whole.levels?.find((l) => l.level === level);
    storey.textContent = shown
      ? `Level ${shown.level}${shown.name ? ` (${shown.name})` : ""}. The CSV holds every storey.`
      : "";
    const labelOf = new Map((s.rooms ?? []).map((r) => [r.id, String(r.label ?? r.id)]));
    output.innerHTML = quantitiesHtml(s.quantities!, labelOf);
  };

  box.addEventListener("input", () => update(last.source, last.level));
  el.querySelector("#takeoffCopy")?.addEventListener("click", async () => {
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv.text);
      deps.flash("CSV copied");
    } catch {
      deps.flash("Clipboard unavailable");
    }
  });
  el.querySelector("#takeoffDownload")?.addEventListener("click", () => {
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv.text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csv.name;
    a.click();
    URL.revokeObjectURL(url);
  });
  return { update };
}
