/**
 * Render the compiler diagnostics into the `#errors` panel as clickable rows:
 * clicking a row jumps the editor caret to the diagnostic's source span, and a
 * disclosure reveals the error-catalog entry (cause / fix / example) — the same
 * self-correcting context `arch explain <CODE>` gives an agent. Errors first,
 * then warnings; the panel hides when the plan is clean. The click wiring lives
 * in main.ts (it needs the editor's jump-to-source).
 */
import { escapeHtml } from "./escape.js";
import { ERROR_CATALOG, offsetToLineCol, type Diagnostic } from "archlang";

export function renderDiagnostics(el: HTMLElement, diagnostics: Diagnostic[], source: string): void {
  const rows = diagnostics
    .filter((d) => d.severity === "error" || d.severity === "warning")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  if (rows.length === 0) {
    el.classList.remove("show");
    el.innerHTML = "";
    return;
  }
  el.classList.add("show");
  el.innerHTML = rows
    .map((d, i) => {
      const offset = d.span ? d.span.start : null;
      const loc = offset != null ? offsetToLineCol(source, offset) : null;
      const locText = loc ? `${loc.line}:${loc.col}` : "";
      const cat = d.code ? (ERROR_CATALOG[d.code] ?? null) : null;
      // Prefer the diagnostic's own fix, else the catalog's; show cause + example.
      const fix = (d as { fix?: string }).fix ?? cat?.fix ?? d.hints?.[0] ?? "";
      const detail = cat
        ? `<div class="diag-detail">` +
          (cat.cause ? `<p><b>Cause</b> ${escapeHtml(cat.cause)}</p>` : "") +
          (fix ? `<p><b>Fix</b> ${escapeHtml(fix)}</p>` : "") +
          (cat.example ? `<pre>${escapeHtml(cat.example)}</pre>` : "") +
          `</div>`
        : fix
          ? `<div class="diag-detail"><p><b>Fix</b> ${escapeHtml(fix)}</p></div>`
          : "";
      return (
        `<div class="diagrow diag-${d.severity}" data-i="${i}"${offset != null ? ` data-offset="${offset}"` : ""}>` +
        `<div class="diag-head">` +
        `<code>${escapeHtml(d.code ?? d.severity)}</code>` +
        `<span class="diag-msg">${escapeHtml(d.message)}</span>` +
        (locText ? `<span class="diag-loc">${locText}</span>` : "") +
        (detail ? `<span class="diag-toggle" aria-hidden="true">▸</span>` : "") +
        `</div>${detail}</div>`
      );
    })
    .join("");
}
