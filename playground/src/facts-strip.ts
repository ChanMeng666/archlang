/**
 * The facts line under the drawing: one plain sentence of how much source drew how much plan,
 * "57 lines of ArchLang → 3 rooms · 45.05 m² (net)", computed from the source and describe()'s
 * totals of the storey on screen (room-facts.ts `factsLine`), never typed. Under the 3D preview's
 * combined view ("All", card PG5b) it is every storey's, added up (`factsLineAll`).
 */
import type { SceneSummary } from "archlang";
import { factsLine, factsLineAll } from "./room-facts.js";

export function renderFacts(
  el: HTMLElement,
  summary: SceneSummary,
  ok: boolean,
  source: string,
  level: number | null,
  allStoreys?: readonly Pick<SceneSummary, "totals">[],
): void {
  const line = document.createElement("span");
  line.className = "facts-line";
  line.textContent =
    ok && summary?.totals
      ? allStoreys && allStoreys.length > 1
        ? factsLineAll(source, allStoreys)
        : factsLine(source, summary, level)
      : "— fix the errors to see plan facts —";
  el.replaceChildren(line);
}
