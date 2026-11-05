/**
 * Checks (public-surfaces P6): the header's Checks toggle draws, over the drawing, the review rings
 * `arch preview --review` draws, from the same function (`buildReviewSheet`, src/cli/review.ts,
 * built as `dist/cli/review.js`), and lists each finding beside it: its number (the one on its
 * ring's tag), its code, its message and, when the diagnostic carries one, its fix hint. Choosing
 * a finding highlights its ring; in edit mode it also puts the caret on the statement.
 *
 * A chunk of its own, loaded on the first switch-on. Off by default and never persisted. The
 * findings are the review sheet's: every warning of `compile()` and of the default `lint()`, one
 * entry each, in the sheet's order. The overlay is added to the SVG on screen only (main.ts), so
 * the exports never carry it.
 */
import { compile, type Diagnostic, diagnosticToJson, lint } from "archlang";
import { buildReviewSheet, type ReviewMark } from "archlang/review";
import { type Box, HIGHLIGHT_CLASS, highlightMarkup, ringsOverlay, withOverlay } from "./checks-overlay.js";
import { escapeHtml } from "./escape.js";

export interface ChecksPanel {
  /** `svg` (the drawing about to be shown) with the rings of `source`'s findings over it. */
  overlay(svg: string, source: string, level: number | null): string;
  /** After the drawing is shown: put back the highlight of the chosen finding. */
  shown(): void;
  /** Show or hide the list (the toggle). */
  setVisible(on: boolean): void;
}

interface ChecksOpts {
  /** Where the list sits (the drawing's viewport). */
  viewport: HTMLElement;
  /** The drawing's stage, whose `<svg>` holds the overlay. */
  stage: HTMLElement;
  /** Whether the editor is open (a finding then jumps to its statement). */
  isEditing: () => boolean;
  jumpToOffset: (offset: number) => void;
}

/** One finding as the list shows it. */
interface Finding {
  n: number;
  code: string;
  message: string;
  fix?: string;
  span?: [number, number];
  /** In an imported file: no jump, the span is not this source's. */
  imported: boolean;
  boxes: Box[];
}

/** The hint a finding's list entry carries: the diagnostic's first hint, else its code's fix. */
function fixFor(source: string, mark: ReviewMark, diagnostics: readonly Diagnostic[]): string | undefined {
  const d = diagnostics.find(
    (x) =>
      (x.code ?? "") === mark.code &&
      x.message === mark.message &&
      (x.span?.start ?? -1) === (mark.span?.[0] ?? -1) &&
      x.file === mark.file,
  );
  if (!d) return undefined;
  const j = diagnosticToJson(source, d);
  return j.hints?.[0] ?? j.fix;
}

export function mountChecks({ viewport, stage, isEditing, jumpToOffset }: ChecksOpts): ChecksPanel {
  const panel = document.createElement("section");
  panel.className = "checks";
  panel.setAttribute("aria-label", "Checks");
  panel.hidden = true;
  const head = document.createElement("h2");
  head.className = "checks-head";
  const list = document.createElement("ol");
  list.className = "checks-list";
  panel.append(head, list);
  viewport.appendChild(panel);

  let findings: Finding[] = [];
  let chosen: number | null = null;
  /** The source and storey the list was built for, so an unchanged plan keeps its choice. */
  let key = "";

  function highlight() {
    const g = stage.querySelector(`svg g.${HIGHLIGHT_CLASS}`);
    const f = findings.find((x) => x.n === chosen);
    if (g) g.innerHTML = f ? highlightMarkup(f.boxes) : "";
    for (const b of list.querySelectorAll<HTMLButtonElement>("button[data-n]")) {
      if (Number(b.dataset.n) === chosen) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
  }

  function renderList(note?: string) {
    const count = findings.length;
    head.textContent = note
      ? "Checks"
      : count === 0
        ? "Checks: nothing to ring"
        : `Checks: ${count} finding${count === 1 ? "" : "s"}`;
    list.innerHTML = note
      ? `<li class="checks-note">${escapeHtml(note)}</li>`
      : count === 0
        ? `<li class="checks-note">No warnings from compile or lint.</li>`
        : findings
            .map(
              (f) =>
                `<li><button type="button" data-n="${f.n}">` +
                `<span class="checks-n" aria-hidden="true">${f.n}</span>` +
                `<span class="checks-body"><code>${escapeHtml(f.code)}</code> ${escapeHtml(f.message)}` +
                (f.fix ? `<span class="checks-fix">Fix: ${escapeHtml(f.fix)}</span>` : "") +
                (f.boxes.length === 0 ? `<span class="checks-fix">Not ringed on the drawing.</span>` : "") +
                `</span></button></li>`,
            )
            .join("");
  }

  list.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>("button[data-n]");
    if (!btn) return;
    const n = Number(btn.dataset.n);
    chosen = chosen === n ? null : n;
    highlight();
    const f = findings.find((x) => x.n === n);
    if (chosen !== null && f?.span && !f.imported && isEditing()) jumpToOffset(f.span[0]);
  });

  return {
    overlay(svg, source, level) {
      const sheet = buildReviewSheet(source, level === null ? {} : { level });
      if ("kind" in sheet) {
        findings = [];
        chosen = null;
        key = "";
        renderList(sheet.kind === "errors" ? "The plan does not compile, so it is not checked." : "No such storey.");
        return svg;
      }
      const next = `${level}\u0000${source}`;
      // The same plan and storey (a theme, the Paths overlay): the same findings, and the
      // list is left as it is, so a choice and the keyboard focus in it survive.
      if (next === key) return withOverlay(svg, ringsOverlay(sheet.svg));
      const diagnostics = [...(compile(source, { noCache: true }).diagnostics ?? []), ...lint(source)];
      findings = sheet.marks.map((m) => ({
        n: m.n,
        code: m.code,
        message: m.message,
        fix: fixFor(source, m, diagnostics),
        ...(m.span ? { span: m.span } : {}),
        imported: m.file !== undefined,
        boxes: m.ringed.map((r) => r.box),
      }));
      chosen = null;
      key = next;
      renderList();
      return withOverlay(svg, ringsOverlay(sheet.svg));
    },
    shown: highlight,
    setVisible(on) {
      panel.hidden = !on;
    },
  };
}
