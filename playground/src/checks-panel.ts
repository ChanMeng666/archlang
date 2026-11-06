/**
 * Checks (public-surfaces P6): the Checks layer toggle on the drawing's toolbar (beside Paths,
 * ruling PG-D3) draws, over the drawing, the review rings `arch preview --review` draws, from the
 * same function (src/cli/review.ts, built as `dist/cli/review.js`), and this panel lists each
 * finding: its number (the one on its ring's tag), its code, its message and, when the diagnostic
 * carries one, its fix hint. Choosing a finding highlights its ring; in edit mode it also puts the
 * caret on the statement.
 *
 * Where the list sits (`dock`): in view mode it floats over the drawing, beside the rings, while
 * they are on; in edit mode it is the first section of the Checks tab, shown whether or not the
 * rings are drawn (main.ts runs the review while that tab is open).
 *
 * A chunk of its own, loaded on the first switch-on (or the Checks tab's first open in edit mode).
 * Off by default and never persisted. The findings are the review sheet's: every warning of
 * `compile()` and of `lint()` under its DEFAULT rules, one entry each, in the sheet's order; the
 * panel says so, and says when the Lint section is set to another profile. The hints come from the diagnostics the sheet was made from
 * (`reviewSheetAndWarnings`), so a check costs one review, not a review and a second compile and
 * lint. The overlay is added to the SVG on screen only (main.ts), so the exports never carry it.
 */
import { type Diagnostic, diagnosticToJson } from "archlang";
import { reviewSheetAndWarnings } from "archlang/review";
import { type Box, HIGHLIGHT_CLASS, highlightMarkup, ringsOverlay, withOverlay } from "./checks-overlay.js";
import { escapeHtml } from "./escape.js";
import { CHECKS_SAMPLE } from "./samples.js";

export interface ChecksPanel {
  /** `svg` (the drawing about to be shown) with the rings of `source`'s findings over it. */
  overlay(svg: string, source: string, level: number | null): string;
  /** After the drawing is shown: put back the highlight of the chosen finding. */
  shown(): void;
  /** The drawing is moving (a knob being dragged): the list waits for it to settle. */
  pending(): void;
  /** Show or hide the list (the toggle). */
  setVisible(on: boolean): void;
  /** Put the list in `host` (edit mode's Checks tab), or back over the drawing (`null`). */
  dock(host: HTMLElement | null): void;
}

interface ChecksOpts {
  /** Where the list sits (the drawing's viewport). */
  viewport: HTMLElement;
  /** The drawing's stage, whose `<svg>` holds the overlay. */
  stage: HTMLElement;
  /** Whether the editor is open (a finding then jumps to its statement). */
  isEditing: () => boolean;
  jumpToOffset: (offset: number) => void;
  /** The Lint section's profile, by name, or "" for its default. */
  lintProfile: () => string;
  /** Open the plan the empty list points at. */
  openSample: (label: string) => void;
}

/** What the panel's heading names as the rules it reads. */
export const CHECKS_RULES = "default checks";

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

/** The hint a finding's list entry carries: its diagnostic's first hint, else its code's fix. */
function fixOf(source: string, d: Diagnostic | undefined): string | undefined {
  if (!d) return undefined;
  const j = diagnosticToJson(source, d);
  return j.hints?.[0] ?? j.fix;
}

export function mountChecks({
  viewport,
  stage,
  isEditing,
  jumpToOffset,
  lintProfile,
  openSample,
}: ChecksOpts): ChecksPanel {
  const panel = document.createElement("section");
  panel.className = "checks";
  panel.setAttribute("aria-label", "Checks");
  panel.hidden = true;
  const head = document.createElement("h2");
  head.className = "checks-head";
  const profileNote = document.createElement("p");
  profileNote.className = "checks-profile";
  profileNote.hidden = true;
  const list = document.createElement("ol");
  list.className = "checks-list";
  panel.append(head, profileNote, list);
  viewport.appendChild(panel);

  let findings: Finding[] = [];
  let chosen: number | null = null;
  /** The source and storey the list and `rings` were made for. */
  let key = "";
  /** The overlay for `key`: a re-render of the same plan (a theme, Paths) reuses it. */
  let rings: string | null = null;

  function highlight() {
    const g = stage.querySelector(`svg g.${HIGHLIGHT_CLASS}`);
    const f = findings.find((x) => x.n === chosen);
    if (g) g.innerHTML = f ? highlightMarkup(f.boxes) : "";
    for (const b of list.querySelectorAll<HTMLButtonElement>("button[data-n]")) {
      if (Number(b.dataset.n) === chosen) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
  }

  /** Say when Lint reads another profile than the default rules Checks reads. */
  function noteProfile() {
    const p = lintProfile();
    profileNote.hidden = p === "";
    profileNote.textContent = p === "" ? "" : `Lint uses the "${p}" profile; Checks reads the default checks.`;
  }

  function renderList(note?: string) {
    const count = findings.length;
    head.textContent = note
      ? `Checks (${CHECKS_RULES})`
      : count === 0
        ? `Checks (${CHECKS_RULES}): nothing to ring`
        : `Checks (${CHECKS_RULES}): ${count} finding${count === 1 ? "" : "s"}`;
    noteProfile();
    list.innerHTML = note
      ? `<li class="checks-note">${escapeHtml(note)}</li>`
      : count === 0
        ? `<li class="checks-note">No findings here. ` +
          `<button type="button" class="checks-try" data-sample="${escapeHtml(CHECKS_SAMPLE)}">Try “${escapeHtml(CHECKS_SAMPLE)}” →</button></li>`
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

  // A profile picked in the Lint section is named here at once.
  document.getElementById("lintProfile")?.addEventListener("change", noteProfile);

  list.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    const sample = target?.closest<HTMLButtonElement>("button[data-sample]");
    if (sample) {
      openSample(sample.dataset.sample!);
      return;
    }
    const btn = target?.closest<HTMLButtonElement>("button[data-n]");
    if (!btn) return;
    const n = Number(btn.dataset.n);
    chosen = chosen === n ? null : n;
    highlight();
    const f = findings.find((x) => x.n === n);
    if (chosen !== null && f?.span && !f.imported && isEditing()) jumpToOffset(f.span[0]);
  });

  return {
    overlay(svg, source, level) {
      panel.classList.remove("checks-pending");
      const next = `${level}\u0000${source}`;
      // The same plan and storey (a theme, the Paths overlay): the same findings and rings, and
      // the list is left as it is, so a choice and the keyboard focus in it survive.
      if (next === key) {
        noteProfile();
        return rings === null ? svg : withOverlay(svg, rings);
      }
      key = next;
      chosen = null;
      const r = reviewSheetAndWarnings(source, level === null ? {} : { level });
      if ("kind" in r) {
        findings = [];
        rings = null;
        renderList(r.kind === "errors" ? "The plan does not compile, so it is not checked." : "No such storey.");
        return svg;
      }
      findings = r.sheet.marks.map((m, i) => ({
        n: m.n,
        code: m.code,
        message: m.message,
        fix: fixOf(source, r.warnings[i]),
        ...(m.span ? { span: m.span } : {}),
        imported: m.file !== undefined,
        boxes: m.ringed.map((x) => x.box),
      }));
      rings = ringsOverlay(r.sheet.svg);
      renderList();
      return withOverlay(svg, rings);
    },
    shown: highlight,
    pending() {
      panel.classList.add("checks-pending");
    },
    setVisible(on) {
      panel.hidden = !on;
    },
    dock(host) {
      const to = host ?? viewport;
      panel.classList.toggle("checks-docked", host !== null);
      if (panel.parentElement !== to) to.appendChild(panel);
    },
  };
}
