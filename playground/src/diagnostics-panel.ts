/**
 * Render the compiler diagnostics into the `#errors` panel as clickable rows:
 * the catalogued remedy (`fix`) shows inline under each row so the fix is visible
 * without a click; clicking a row jumps the editor caret to the diagnostic's
 * source span and a disclosure reveals the fuller error-catalog context (cause /
 * example) — the same self-correcting context `arch explain <CODE>` gives an
 * agent. Errors first, then warnings; the panel hides when the plan is clean. The
 * click wiring lives in main.ts (it needs the editor's jump-to-source).
 */
import { escapeHtml } from "./escape.js";
import { ERROR_CATALOG, offsetToLineCol, rankFixes, type Diagnostic } from "archlang";

/**
 * Render the panel and return the rows in display order — `data-i` on each row indexes
 * into the returned array, so the caller can resolve a click back to its diagnostic
 * (and its `fixes`) without re-deriving the sort.
 */
export function renderDiagnostics(el: HTMLElement, diagnostics: Diagnostic[], source: string): Diagnostic[] {
  const rows = diagnostics
    .filter((d) => d.severity === "error" || d.severity === "warning")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  if (rows.length === 0) {
    el.classList.remove("show");
    el.innerHTML = "";
    return rows;
  }
  el.classList.add("show");
  el.innerHTML = rows
    .map((d, i) => {
      const offset = d.span ? d.span.start : null;
      const loc = offset != null ? offsetToLineCol(source, offset) : null;
      const locText = loc ? `${loc.line}:${loc.col}` : "";
      const cat = d.code ? (ERROR_CATALOG[d.code] ?? null) : null;
      // Prefer the diagnostic's own fix, else the catalog's; shown inline (always
      // visible) so the remedy needs no click.
      const fix = (d as { fix?: string }).fix ?? cat?.fix ?? d.hints?.[0] ?? "";
      // A machine-applicable fix (ADR 0011) can be applied for real, not just read.
      // `rankFixes` picks the same best candidate `arch fix` would take, so the button
      // and the CLI agree. Multiple fixes on one diagnostic are ALTERNATIVES — offer one.
      const best = d.fixes?.length ? rankFixes(d.fixes)[0] : undefined;
      const applyBtn = best
        ? `<button class="diag-apply" type="button" data-i="${i}" title="${escapeHtml(best.title)}">Apply fix</button>`
        : "";
      const fixRow = fix
        ? `<div class="diag-fix"><b>Fix</b> ${escapeHtml(fix)}${applyBtn}</div>`
        : applyBtn
          ? `<div class="diag-fix">${applyBtn}</div>`
          : "";
      // The disclosure carries the fuller catalog context (cause + example); the
      // fix already sits inline above, so it isn't repeated here.
      const hasDetail = cat && (cat.cause || cat.example);
      const detail = hasDetail
        ? `<div class="diag-detail">` +
          (cat.cause ? `<p><b>Cause</b> ${escapeHtml(cat.cause)}</p>` : "") +
          (cat.example ? `<pre>${escapeHtml(cat.example)}</pre>` : "") +
          `</div>`
        : "";
      return (
        `<div class="diagrow diag-${d.severity}" data-i="${i}"${offset != null ? ` data-offset="${offset}"` : ""}>` +
        `<div class="diag-head">` +
        `<code>${escapeHtml(d.code ?? d.severity)}</code>` +
        `<span class="diag-msg">${escapeHtml(d.message)}</span>` +
        (locText ? `<span class="diag-loc">${locText}</span>` : "") +
        (detail ? `<span class="diag-toggle" aria-hidden="true">▸</span>` : "") +
        `</div>${fixRow}${detail}</div>`
      );
    })
    .join("");
  return rows;
}
