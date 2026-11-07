// @ts-check
/**
 * The facts line's words (room-facts.ts re-exports them): "57 lines of ArchLang → 3 rooms ·
 * 45.05 m² (net)", from describe()'s totals of the summary on screen. Pure, no DOM, every figure
 * describe()'s.
 *
 * Plain JavaScript so that `scripts/gen-static.mjs`, which writes the default plan's facts line
 * into the served page from Node with no TypeScript loader (card MP5), and the app (facts-strip.ts)
 * say it with this one rule.
 */

/**
 * An area with its convention: net when describe() has it, else centreline.
 *
 * @param {number | undefined} net
 * @param {number} centreline
 * @returns {string}
 */
export function areaText(net, centreline) {
  return net !== undefined ? `${net} m² (net)` : `${centreline} m² (centreline)`;
}

/**
 * The source's line count: its newline-terminated lines, plus a last one with no newline.
 *
 * @param {string} source
 * @returns {number}
 */
export function sourceLines(source) {
  if (source === "") return 0;
  const n = source.split(/\r\n|\r|\n/).length;
  return /[\r\n]$/.test(source) ? n - 1 : n;
}

/**
 * The facts line: "57 lines of ArchLang → 3 rooms · 45.05 m² (net)", from describe()'s totals of
 * the summary on screen. On a plan with storeys that summary is one storey's (`describeLevel`),
 * and the line names it.
 *
 * @param {string} source
 * @param {Pick<import("archlang").SceneSummary, "totals">} summary
 * @param {number | null} level
 * @returns {string}
 */
export function factsLine(source, summary, level) {
  const t = summary.totals;
  const lines = sourceLines(source);
  const where = level === null ? "" : ` · level ${level}`;
  return (
    `${lines} line${lines === 1 ? "" : "s"} of ArchLang → ${t.rooms} room${t.rooms === 1 ? "" : "s"} · ` +
    `${areaText(t.net_floor_area_m2, t.floor_area_m2)}${where}`
  );
}
