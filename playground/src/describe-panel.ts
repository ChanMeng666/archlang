/**
 * The Describe tab: a compact access-graph diagram from `describe().access` with
 * the raw describe JSON tucked into a <details>. Zero-dep — pure DOM/CSS strings,
 * no graph library.
 */
import { escapeHtml } from "./escape.js";
import type { SceneSummary } from "archlang";

/** A room node in describe()'s access graph (the type is not exported directly). */
type AccessRoomNode = SceneSummary["access"]["rooms"][number];

/** describe() facts with the diagnostics list stripped (as rendered in the tab). */
type Facts = Omit<SceneSummary, "diagnostics">;

/**
 * Access-graph visual: rooms laid out in flex columns by `depthFromEntrance`
 * (exterior/entrance on the left), unreachable rooms flagged at the end.
 */
function renderAccessGraph(facts: Facts): string {
  const access = facts.access;
  if (!access) return `<p class="ag-note">No access graph available for this plan.</p>`;
  if (!access.hasEntrance) {
    return `<p class="ag-note">No exterior entrance — add a <code>door</code> on an exterior wall to model reachability.</p>`;
  }
  const labelOf = new Map((facts.rooms ?? []).map((r) => [r.id, r.label ?? r.id]));
  const card = (r: AccessRoomNode) => {
    const label = String(labelOf.get(r.id) ?? r.id);
    const un = r.reachable === false;
    const bn = r.bottleneckClearWidth != null ? `↔ ${r.bottleneckClearWidth} mm` : "↔ —";
    const meta = un ? "unreachable" : `depth ${r.depthFromEntrance} · ${bn}`;
    return `<div class="ag-card${un ? " ag-unreachable" : ""}"><div class="ag-card-label">${escapeHtml(label)}</div><div class="ag-card-meta">${escapeHtml(meta)}</div></div>`;
  };

  // Entrance column lists the modeled entrance doors.
  const doors = access.entrances.length
    ? access.entrances.map((id) => `<div class="ag-door">⮕ ${escapeHtml(id)}</div>`).join("")
    : `<div class="ag-door">entrance</div>`;
  const cols = [`<div class="ag-col"><div class="ag-col-h">Exterior / entrance</div>${doors}</div>`];

  // One column per reachable depth, in order.
  const depths = [
    ...new Set(access.rooms.filter((r) => r.reachable && r.depthFromEntrance != null).map((r) => r.depthFromEntrance!)),
  ].sort((a, b) => a - b);
  for (const d of depths) {
    const rooms = access.rooms.filter((r) => r.reachable && r.depthFromEntrance === d);
    cols.push(`<div class="ag-col"><div class="ag-col-h">Depth ${d}</div>${rooms.map(card).join("")}</div>`);
  }

  // Trailing column for anything the entrance can't reach.
  const unreachable = access.rooms.filter((r) => r.reachable === false);
  if (unreachable.length) {
    cols.push(
      `<div class="ag-col"><div class="ag-col-h ag-col-h-bad">Unreachable</div>${unreachable.map(card).join("")}</div>`,
    );
  }
  return `<div class="ag">${cols.join(`<div class="ag-arrow">→</div>`)}</div>`;
}

/** Render the whole Describe tab into `el` (or an empty-state hint on errors). */
export function renderDescribe(el: HTMLElement, facts: Facts, ok: boolean): void {
  if (ok) {
    el.innerHTML =
      `<div class="ag-wrap">${renderAccessGraph(facts)}</div>` +
      `<details class="describe-json"><summary>Raw describe JSON</summary>` +
      `<pre>${escapeHtml(JSON.stringify(facts, null, 2))}</pre></details>`;
  } else {
    el.innerHTML = `<p class="empty">Fix the errors to see the plan's semantic summary.</p>`;
  }
}
