/**
 * The always-visible plan-facts strip under the preview — a quick read of the
 * describe() totals (rooms / doors / windows / floor area) and whether the plan
 * has an exterior entrance. Differentiator: floor-plan facts a diagram tool
 * can't show.
 */
import type { SceneSummary } from "archlang";

export function renderFacts(el: HTMLElement, summary: SceneSummary, ok: boolean): void {
  const t = summary?.totals;
  if (!ok || !t) {
    el.innerHTML = `<span class="fact">— fix the errors to see plan facts —</span>`;
    return;
  }
  const entrance = summary.access?.hasEntrance;
  el.innerHTML =
    `<span class="fact">Rooms <b>${t.rooms}</b></span>` +
    `<span class="fact">Doors <b>${t.doors}</b></span>` +
    `<span class="fact">Windows <b>${t.windows}</b></span>` +
    `<span class="fact">Floor area <b>${t.floor_area_m2} m²</b></span>` +
    `<span class="fact ${entrance ? "fact-ok" : "fact-bad"}">Entrance <b>${entrance ? "yes" : "none"}</b></span>`;
}
