/**
 * Error-card SVG backend — a pure, deterministic serializer of a list of
 * {@link Diagnostic}s into a self-describing "error card" SVG.
 *
 * ArchLang's default contract is that a plan with errors produces **no image**
 * (`compile()` returns `svg: ""`). Borrowing Mermaid's "error diagram" lesson,
 * this backend lets a caller *opt in* (`compile(src, { onError: "svg" })` /
 * `arch … --error-svg`) so a broken plan still yields a visual: a titled panel
 * that lists each diagnostic's severity, code, line:col, message, and catalogued
 * fix. Agent loops and Markdown/embeds always get feedback instead of a blank.
 *
 * Like the main SVG backend it is pure and zero-dependency: every number routes
 * through {@link fmt}, all interpolated user text is escaped via {@link xml}, and
 * the same input always yields byte-identical output. It never participates in the
 * **default** output — only the explicit opt-in reaches it (see ADR 0007's
 * precedent: additive, off by default, no golden churn for existing users).
 */

import type { Diagnostic } from "../diagnostics.js";
import { diagnosticToJson } from "../diagnostic-json.js";
import type { Theme } from "../theme.js";
import { DEFAULT_THEME } from "../theme.js";
import { fmt2 as fmt } from "../num-format.js";
import { xml } from "./svg.js";

/** Options for {@link renderErrorSvg}. All have deterministic defaults. */
export interface ErrorSvgOptions {
  /** Card width in px (default 800). Height is derived from the diagnostic count. */
  width?: number;
  /** Max diagnostic rows to draw before collapsing the rest into a "+K more" line (default 20). */
  maxRows?: number;
  /** Theme to source font/colours from (default {@link DEFAULT_THEME}). */
  theme?: Theme;
}

// --- fixed layout metrics (px), chosen so the card reads as intentional ---
const PAD_X = 28;
const PAD_Y = 24;
const TITLE_FS = 20;
const SUB_FS = 13;
const CODE_FS = 13;
const MSG_FS = 14;
const FIX_FS = 13;
const MSG_LH = 19;
const FIX_LH = 18;
const CHIP_LINE_H = 22; // the severity/code/location header line of each row
const ROW_PAD = 12; // inner top/bottom padding of a row card
const ROW_GAP = 12; // gap between row cards
const ACCENT_W = 4; // width of the left severity accent bar
const ROW_INNER_X = 16; // left inset of a row's text from the accent bar

// Severity accents (fixed, independent of the drawing theme so a broken card
// always reads "error/warning" at a glance).
const ERROR_ACCENT = "#d64545";
const WARN_ACCENT = "#c9922e";

/** Greedy character-budget word wrap — deterministic, no font metrics. Long words hard-break. */
function wrapText(text: string, maxChars: number): string[] {
  if (maxChars <= 0 || text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    let word = w;
    // Hard-break a single word longer than the budget.
    while (word.length > maxChars) {
      if (cur !== "") {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (cur === "") cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += " " + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines.length > 0 ? lines : [""];
}

/** Approximate monospace-ish chars that fit in `pxWidth` at `fontSize` (avg glyph ≈ 0.55em). */
function charBudget(pxWidth: number, fontSize: number): number {
  return Math.max(1, Math.floor(pxWidth / (fontSize * 0.55)));
}

interface Row {
  accent: string;
  severity: string;
  code: string;
  location: string;
  msgLines: string[];
  fixLines: string[];
  height: number;
}

/**
 * Render a deterministic "error card" SVG describing `diagnostics`.
 *
 * The card is a fixed-width panel (default 800px) with a title summarising the
 * error/warning counts and one bordered row per diagnostic (severity accent, a
 * monospace code chip, `line:col`, the message, and the catalogued fix). When
 * there are more than `maxRows` diagnostics the overflow collapses into a
 * "+K more" line. Height is computed from the content, so output is stable.
 *
 * @param source       The source that produced `diagnostics` (used only to
 *                      resolve byte spans to `line:col`; never rendered verbatim).
 * @param diagnostics  The problems to display (errors and/or warnings).
 * @param opts         Width / max rows / theme overrides.
 */
export function renderErrorSvg(source: string, diagnostics: Diagnostic[], opts: ErrorSvgOptions = {}): string {
  const theme = opts.theme ?? DEFAULT_THEME;
  const W = opts.width ?? 800;
  const maxRows = opts.maxRows ?? 20;

  const nErrors = diagnostics.filter((d) => d.severity === "error").length;
  const nWarnings = diagnostics.length - nErrors;

  const contentW = W - PAD_X * 2;
  const textW = contentW - ACCENT_W - ROW_INNER_X * 2;
  const msgBudget = charBudget(textW, MSG_FS);
  const fixBudget = charBudget(textW - 34 /* "Fix: " lead-in room */, FIX_FS);

  // Colours: sourced from the theme so the card matches the family, with fixed
  // severity accents layered on top.
  const cardBg = theme.roomFill; // near-white paper
  const border = theme.annotationMuted;
  const titleColor = theme.roomLabel;
  const muted = theme.annotationMuted;
  const bodyColor = theme.roomLabel;
  const chipBg = theme.pocheBase;
  const chipText = theme.wallStroke;
  const rowBg = theme.bg;

  const shown = diagnostics.slice(0, maxRows);
  const overflow = diagnostics.length - shown.length;

  const rows: Row[] = shown.map((d) => {
    const j = diagnosticToJson(source, d);
    const accent = d.severity === "error" ? ERROR_ACCENT : WARN_ACCENT;
    const location = j.line !== undefined ? `line ${j.line}:${j.col}` : "";
    const msgLines = wrapText(j.message, msgBudget);
    const fixLines = j.fix ? wrapText(`Fix: ${j.fix}`, fixBudget) : [];
    const bodyH = msgLines.length * MSG_LH + (fixLines.length > 0 ? 6 + fixLines.length * FIX_LH : 0);
    const height = ROW_PAD + CHIP_LINE_H + 4 + bodyH + ROW_PAD;
    return { accent, severity: d.severity, code: j.code ?? "", location, msgLines, fixLines, height };
  });

  const headerH = PAD_Y + TITLE_FS + 8 + SUB_FS + 16; // title + subtitle + divider gap
  const rowsH = rows.reduce((s, r) => s + r.height, 0) + Math.max(0, rows.length - 1) * ROW_GAP;
  const overflowH = overflow > 0 ? ROW_GAP + SUB_FS + 4 : 0;
  const H = headerH + (rows.length > 0 ? ROW_GAP : 0) + rowsH + overflowH + PAD_Y;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}" height="${fmt(H)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}" font-family="${theme.font}">`,
  );
  // Card background + border.
  out.push(`<rect x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" fill="${cardBg}"/>`);
  out.push(
    `<rect x="0.5" y="0.5" width="${fmt(W - 1)}" height="${fmt(H - 1)}" fill="none" stroke="${border}" stroke-width="1"/>`,
  );

  // Header: an accent tick, the title, and the counts subtitle.
  const titleY = PAD_Y + TITLE_FS;
  out.push(
    `<rect x="${fmt(PAD_X)}" y="${fmt(PAD_Y + 2)}" width="4" height="${fmt(TITLE_FS)}" fill="${ERROR_ACCENT}"/>`,
  );
  out.push(
    `<text x="${fmt(PAD_X + 14)}" y="${fmt(titleY)}" font-size="${fmt(TITLE_FS)}" font-weight="700" fill="${titleColor}">ArchLang — could not render</text>`,
  );
  const counts =
    `${nErrors} error${nErrors === 1 ? "" : "s"}` +
    (nWarnings > 0 ? ` · ${nWarnings} warning${nWarnings === 1 ? "" : "s"}` : "");
  out.push(
    `<text x="${fmt(PAD_X + 14)}" y="${fmt(titleY + 8 + SUB_FS)}" font-size="${fmt(SUB_FS)}" fill="${muted}">${xml(counts)}</text>`,
  );

  // Diagnostic rows.
  let y = headerH + (rows.length > 0 ? ROW_GAP : 0);
  for (const r of rows) {
    const x = PAD_X;
    // Row card + left severity accent bar.
    out.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(contentW)}" height="${fmt(r.height)}" fill="${rowBg}" stroke="${border}" stroke-width="1"/>`,
    );
    out.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(ACCENT_W)}" height="${fmt(r.height)}" fill="${r.accent}"/>`,
    );

    const tx = x + ACCENT_W + ROW_INNER_X;
    // Header line: SEVERITY  [code chip]  location.
    const chipLineY = y + ROW_PAD + CODE_FS;
    let cx = tx;
    const sevLabel = r.severity.toUpperCase();
    out.push(
      `<text x="${fmt(cx)}" y="${fmt(chipLineY)}" font-size="${fmt(CODE_FS)}" font-weight="700" fill="${r.accent}">${xml(sevLabel)}</text>`,
    );
    cx += sevLabel.length * (CODE_FS * 0.62) + 12;
    if (r.code) {
      const chipW = r.code.length * (CODE_FS * 0.62) + 14;
      out.push(
        `<rect x="${fmt(cx)}" y="${fmt(chipLineY - CODE_FS)}" width="${fmt(chipW)}" height="${fmt(CODE_FS + 8)}" rx="3" fill="${chipBg}"/>`,
      );
      out.push(
        `<text x="${fmt(cx + 7)}" y="${fmt(chipLineY - 1)}" font-size="${fmt(CODE_FS)}" font-family="ui-monospace, Menlo, Consolas, monospace" fill="${chipText}">${xml(r.code)}</text>`,
      );
      cx += chipW + 12;
    }
    if (r.location) {
      out.push(
        `<text x="${fmt(cx)}" y="${fmt(chipLineY)}" font-size="${fmt(SUB_FS)}" fill="${muted}">${xml(r.location)}</text>`,
      );
    }

    // Message lines.
    let ly = y + ROW_PAD + CHIP_LINE_H + 4 + MSG_FS;
    for (const line of r.msgLines) {
      out.push(
        `<text x="${fmt(tx)}" y="${fmt(ly)}" font-size="${fmt(MSG_FS)}" fill="${bodyColor}">${xml(line)}</text>`,
      );
      ly += MSG_LH;
    }
    // Fix lines (muted).
    if (r.fixLines.length > 0) {
      ly += 6 - MSG_LH + FIX_FS;
      for (const line of r.fixLines) {
        out.push(`<text x="${fmt(tx)}" y="${fmt(ly)}" font-size="${fmt(FIX_FS)}" fill="${muted}">${xml(line)}</text>`);
        ly += FIX_LH;
      }
    }

    y += r.height + ROW_GAP;
  }

  if (overflow > 0) {
    out.push(
      `<text x="${fmt(PAD_X)}" y="${fmt(y + SUB_FS)}" font-size="${fmt(SUB_FS)}" fill="${muted}">+${overflow} more diagnostic${overflow === 1 ? "" : "s"}</text>`,
    );
  }

  out.push("</svg>");
  return out.join("\n");
}
