/**
 * The facts line under the drawing: one plain sentence of how much source drew how much plan,
 * "57 lines of ArchLang → 3 rooms · 45.05 m² (net)", computed from the source and describe()'s
 * totals of the storey on screen (room-facts.ts `factsLine`), never typed.
 */
import type { SceneSummary } from "archlang";
import { factsLine } from "./room-facts.js";

export function renderFacts(
  el: HTMLElement,
  summary: SceneSummary,
  ok: boolean,
  source: string,
  level: number | null,
): void {
  const line = document.createElement("span");
  line.className = "facts-line";
  line.textContent = ok && summary?.totals ? factsLine(source, summary, level) : "— fix the errors to see plan facts —";
  el.replaceChildren(line);
}
