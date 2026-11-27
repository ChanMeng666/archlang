/**
 * Edit mode: the CodeMirror editor and the panels that read the source — diagnostics, Describe,
 * Lint (with Repair and Suggest), Intent. Loaded on the first entry into edit mode (the Source
 * button, `&edit` in the hash, or a More (⋯) item that edits), so a visit that only looks at a plan
 * never downloads CodeMirror and never runs `lint()`. main.ts keeps the drawing, the facts and
 * the storey switcher, and calls the two hooks below from its render.
 *
 * Every function body here moved from main.ts unchanged except where a comment says otherwise;
 * the state it reads (`activeLevel`, the current source) comes through the context.
 */
import {
  applyFixes,
  describe,
  LINT_PROFILE_NAMES,
  rankFixes,
  suggestTopology,
  type Diagnostic,
  type LintOptions,
  type SceneSummary,
} from "archlang";
// `lint` through its door (card 3.19b), whose chunk the compile worker imports by `LINT_URL` for
// the editor's requests: the page fetches it with edit mode, before the editor's first request.
import { lint, LINT_URL } from "./lint-core.js";
import { isolateHistory } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createEditor } from "./editor-setup.js";
import { renderDescribe } from "./describe-panel.js";
import { renderLint } from "./lint-panel.js";
import { renderDiagnostics } from "./diagnostics-panel.js";
import { offerContribution } from "./contribute.js";
import { countEvent, eventCodes } from "./telemetry.js";
import { isNarrow, type MobileViewsHandle } from "./mobile-views.js";
import { briefFromPlan, renderIntent, STARTER_INTENT } from "./intent-panel.js";
import { renderSuggest } from "./suggest-panel.js";
import { withUndo } from "./notice-core.js";
import { KEYS, readStr, writeStr } from "./storage.js";

export interface EditCtx {
  /** The document the editor opens on (the plan on screen). */
  doc: string;
  /** Told of every document change (an edit, an undo, a replacement). */
  onDocChanged: (source: string) => void;
  /** Replace the whole document (main.ts's `loadSource`). */
  loadSource: (src: string, refit?: boolean) => void;
  /** Re-render the current source. */
  rerender: () => void;
  flash: (msg: string) => void;
  mobileViews: MobileViewsHandle;
  /** The lint gutter's diagnostics of a document, once its render has compiled it (main.ts). */
  gutterFor: (text: string) => Promise<readonly Diagnostic[]>;
}

export interface EditMode {
  /** The editor's whole document. */
  getDoc(): string;
  /** Replace the document as its own undo step (one Ctrl+Z reverts exactly this). */
  replaceDoc(src: string): void;
  /** Change the document to `src` by its one changed range, as its own undo step (a knob). */
  setDoc(src: string): void;
  /** Move the caret to a byte offset and reveal it (click-to-source). */
  jumpToOffset(offset: number): void;
  /**
   * Describe (the Facts tab) and Lint (the Checks tab) for `source` (from main.ts's `updateAnalysis`).
   * `lintDiags` is `lint()` of it under the selected profile, run with the compile (in the worker,
   * card MP6); null when that compile was made before the editor was here, and this runs it.
   */
  updatePanels(
    source: string,
    ok: boolean,
    summary: SceneSummary,
    activeLevel: number | null,
    lintDiags: Diagnostic[] | null,
  ): void;
  /** The diagnostics drawer, its count and a live Intent verdict (from main.ts's `render`). */
  afterCompile(source: string, diagnostics: Diagnostic[]): void;
  /** Where the compile job loads `lint` from for the editor's requests (lint-core.ts, card 3.19b). */
  readonly lintUrl: string;
}

export function mountEditMode(ctx: EditCtx): EditMode {
  const { loadSource, flash, mobileViews } = ctx;
  const describeEl = document.getElementById("describe")!;
  const errorsEl = document.getElementById("errors")!;
  const lintProfileSelect = document.getElementById("lintProfile") as HTMLSelectElement;
  const lintCaptionEl = document.getElementById("lintCaption")!;
  const lintOutput = document.getElementById("lintOutput")!;
  const repairBtn = document.getElementById("repair");
  const repairPanel = document.getElementById("repairPanel");
  const suggestBtn = document.getElementById("suggest");
  const suggestPanel = document.getElementById("suggestPanel");
  const intentSrc = document.getElementById("intentSrc") as HTMLTextAreaElement;
  const intentRunBtn = document.getElementById("intentRun")!;
  const intentOutput = document.getElementById("intentOutput")!;

  // ---- lint-profile selector (advisory rule sets) ----
  // One-line description of what each profile tightens, shown under the selector. The first
  // option, value "", is the default ruleset (no profile), as `lint()` and the CLI run it.
  const LINT_PROFILE_CAPTIONS: Record<string, string> = {
    "": "Default — doors ≥ 700 mm, habitable rooms ≥ 4 m²; home-only checks skip a café, shop or office.",
    "residential-basic": "The default's thresholds, asserting a dwelling: every plan is judged as a home.",
    "accessibility-advisory": "Stricter — doors ≥ 850 mm, rooms ≥ 5 m², 150 mm door-swing clearance.",
  };
  {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "default";
    lintProfileSelect.appendChild(o);
  }
  for (const name of LINT_PROFILE_NAMES) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    lintProfileSelect.appendChild(o);
  }
  function syncLintCaption() {
    lintCaptionEl.textContent = LINT_PROFILE_CAPTIONS[lintProfileSelect.value] ?? "";
  }
  syncLintCaption();

  /** A problem must outlive this, with no change to the document, before the drawer opens for it. */
  const DRAWER_AFTER_MS = 700;
  let drawerTimer: ReturnType<typeof setTimeout> | undefined;
  /** Draw the drawer for `source`; if it opened, closed or changed height under a focused editor,
   *  keep the caret's line in view (the editor's visible bottom just moved). */
  function paintDrawer(source: string, diagnostics: Diagnostic[]) {
    const before = errorsEl.offsetHeight;
    lastDiagRows = renderDiagnostics(errorsEl, diagnostics, source);
    // A plan with an error or a warning here may be sent to improve ArchLang, if the user says so
    // in the dialog the offer opens (contribute.ts, ruling RM-D87).
    if (lastDiagRows.length > 0)
      offerContribution(
        errorsEl,
        lastDiagRows.map((d) => d.code),
        { getSource: currentSource, flash },
      );
    if (errorsEl.offsetHeight !== before && view.hasFocus)
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 24 }),
      });
  }

  /** Diagnostics in panel display order — `data-i` on a row indexes into this. */
  let lastDiagRows: Diagnostic[] = [];
  /** Same, for the Lint section's rows (some lint rules carry their own applicable fix). */
  let lastLintRows: Diagnostic[] = [];

  // Restore the persisted lint profile (advisory — never block on storage).
  const savedProfile = readStr(KEYS.lintProfile);
  if (savedProfile && [...lintProfileSelect.options].some((o) => o.value === savedProfile)) {
    lintProfileSelect.value = savedProfile;
    syncLintCaption();
  }

  /** When the document last changed (the drawer waits for the typing to stop, `afterCompile`). */
  let changedAt = 0;
  const view: EditorView = createEditor({
    parent: document.getElementById("editor")!,
    doc: ctx.doc,
    onDocChanged: (text) => {
      changedAt = performance.now();
      ctx.onDocChanged(text);
    },
    diagnosticsOf: ctx.gutterFor,
  });
  const currentSource = () => view.state.doc.toString();

  /** Move the editor caret to a byte offset and reveal it (click-to-source). */
  function jumpToOffset(offset: number) {
    const pos = Math.max(0, Math.min(offset, view.state.doc.length));
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }

  /**
   * Apply the best-ranked machine-applicable fix on `rows[index]` — the same
   * `rankFixes` → `applyFixes` path `arch fix` takes, so the button and the CLI make the
   * identical edit. Shared by the diagnostics panel and the Lint section.
   */
  function applyFixAt(rows: Diagnostic[], index: number): void {
    const fixes = rows[index]?.fixes;
    const best = fixes?.length ? rankFixes(fixes)[0] : undefined;
    if (!best) return;
    const report = applyFixes(currentSource(), [best]);
    if (report.applied.length === 0) {
      flash(report.skipped[0]?.reason ?? "Fix no longer applies");
      return;
    }
    loadSource(report.output, false);
    flash(withUndo(best.title, navigator.platform));
    countEvent({ e: "fix_applied", codes: eventCodes([rows[index]?.code]) });
  }

  // Lint-profile switch (B3) — update the caption and re-run the soundness check.
  lintProfileSelect.addEventListener("change", () => {
    writeStr(KEYS.lintProfile, lintProfileSelect.value);
    syncLintCaption();
    ctx.rerender();
  });

  // A lint rule can carry its own machine-applicable fix (W_ALIAS_MATCH → add the `uses`
  // the label only implied). Make it actionable here too, not just readable.
  lintOutput.addEventListener("click", (e) => {
    const apply = (e.target as Element | null)?.closest<HTMLElement>(".diag-apply");
    if (apply) applyFixAt(lastLintRows, Number(apply.dataset.i));
  });

  // ---- Suggest (advisory topology) ----
  // Never edits the plan: it lists candidate `door`/`window` statements and lets you
  // insert one (ADR 0005 — facts and options, not an invisible architect).
  suggestBtn?.addEventListener("click", () => {
    if (!suggestPanel) return;
    renderSuggest(suggestPanel, suggestTopology(currentSource()));
  });
  suggestPanel?.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>(".sug-insert");
    const stmt = btn?.dataset.stmt;
    if (!stmt) return;
    // Insert just inside the plan's closing brace — the statement is plan-level — or, on a plan
    // of `level` blocks, inside the brace of the storey the suggestion is about (`insertAt`). The
    // source may have been edited since the panel was drawn, so the suggestion is looked up again on
    // it: the same statement on the same storey of a plan of the same shape (levelled or not), or
    // the insert is refused.
    const src = currentSource();
    const level = btn?.dataset.level === undefined ? undefined : Number(btn.dataset.level);
    const now = suggestTopology(src).find((s) => s.level === level && s.candidates.some((c) => c.insertText === stmt));
    const close = now?.insertAt ?? (level === undefined && now ? src.lastIndexOf("}") : -1);
    if (!now || close < 0 || src[close] !== "}") {
      // The suggestions on screen are of an older plan: draw this plan's, then say so.
      if (suggestPanel) renderSuggest(suggestPanel, suggestTopology(src));
      flash("The plan changed — suggestions updated");
      return;
    }
    const next = `${src.slice(0, close)}  ${stmt}\n${src.slice(close)}`;
    loadSource(next, false);
    // The suggestions are the plan's, so they are drawn again for the plan the insert made.
    if (suggestPanel) renderSuggest(suggestPanel, suggestTopology(next));
    flash(withUndo("Statement inserted", navigator.platform));
  });

  // ---- Intent (the brief as a contract) ----
  // The starter brief is the plan on screen's own facts (U9) until the visitor types in it; a plan
  // replaced (the gallery, a snapshot) brings its own. "Use this plan's facts" does the same on demand.
  let intentTouched = false;
  const briefFor = (src: string): string => {
    try {
      return briefFromPlan(describe(src));
    } catch {
      return STARTER_INTENT;
    }
  };
  intentSrc.value = briefFor(ctx.doc);
  intentSrc.addEventListener("input", () => {
    intentTouched = true;
  });
  const runIntent = () => renderIntent(intentOutput, currentSource(), intentSrc.value);
  intentRunBtn.addEventListener("click", runIntent);
  document.getElementById("intentFromPlan")?.addEventListener("click", () => {
    intentSrc.value = briefFor(currentSource());
    intentTouched = false;
    runIntent();
  });
  /** A plan replaced: an untouched brief follows it. */
  const followPlan = (src: string) => {
    if (intentTouched) return;
    intentSrc.value = briefFor(src);
    if (intentOutput.innerHTML) renderIntent(intentOutput, src, intentSrc.value);
  };
  // Check once when the Checks tab is first opened, so the Intent section is never empty.
  document.getElementById("tab-checks")?.addEventListener("click", () => {
    if (!intentOutput.innerHTML) runIntent();
  });

  // Diagnostics drill-down — click a row to jump to its source span and reveal the
  // catalogued cause/fix/example. "Apply fix" runs the diagnostic's machine-applicable
  // fix through the same `applyFixes` the `arch fix` CLI uses, so the playground and the
  // command line make the identical edit.
  errorsEl.addEventListener("click", (e) => {
    const target = e.target as Element | null;

    const apply = target?.closest<HTMLElement>(".diag-apply");
    if (apply) {
      e.stopPropagation(); // don't also toggle/jump the row underneath
      applyFixAt(lastDiagRows, Number(apply.dataset.i));
      return;
    }

    const row = target?.closest<HTMLElement>(".diagrow");
    if (!row) return;
    row.classList.toggle("open");
    const off = row.dataset.offset;
    // On a phone the Checks view hides the editor: the line:col is the one place that
    // means "take me there", so it switches to Code; the rest of the row only expands.
    if (isNarrow() && target?.closest(".diag-loc")) mobileViews.show("code");
    if (off != null) jumpToOffset(Number(off));
  });

  return {
    lintUrl: LINT_URL,
    getDoc: currentSource,
    replaceDoc(src) {
      // Its own undo step: one Ctrl+Z reverts exactly this replacement (Format, Repair,
      // Finish, an applied fix), never merged with the typing just before or after it.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: src },
        annotations: isolateHistory.of("full"),
      });
      followPlan(src);
    },
    setDoc(src) {
      // Only the characters that differ change, so the caret, the scroll and the folds keep
      // their places: a knob rewrites one number.
      const old = view.state.doc.toString();
      if (old === src) return;
      let from = 0;
      while (from < old.length && from < src.length && old[from] === src[from]) from++;
      let tail = 0;
      while (
        tail < old.length - from &&
        tail < src.length - from &&
        old[old.length - 1 - tail] === src[src.length - 1 - tail]
      )
        tail++;
      view.dispatch({
        changes: { from, to: old.length - tail, insert: src.slice(from, src.length - tail) },
        annotations: isolateHistory.of("full"),
      });
    },
    jumpToOffset,
    updatePanels(source, ok, summary, activeLevel, given) {
      const { diagnostics: _d, ...facts } = summary;
      renderDescribe(describeEl, facts, ok);

      // Lint — architectural soundness warnings (habitability rules), under the chosen
      // advisory profile. Run over the WHOLE plan, always: `ok`, the status text and the
      // repair/suggest offers below are verdicts, and a display filter must never move a
      // verdict (the law `arch describe --level` obeys).
      const lintDiags = !ok
        ? []
        : (given ??
          lint(source, { profile: lintProfileSelect.value, noCache: true } as LintOptions & { noCache?: boolean }));
      // `repair` only corrects furniture-placement faults — offer it exactly when one
      // is present (ADR 0006: an explicit, reviewable transform, never auto-applied).
      const repairable = lintDiags.some((d) => /FURNITURE|FIXTURE|DOORWAY|SWING/.test(d.code ?? ""));
      if (repairBtn) repairBtn.hidden = !repairable;
      if (!repairable && repairPanel) repairPanel.hidden = true;

      // `suggest` covers the two faults repair deliberately won't touch — adding a door or a
      // window is a design choice, so it proposes statements instead of applying them.
      const suggestable = lintDiags.some((d) => d.code === "W_ROOM_UNREACHABLE" || d.code === "W_BEDROOM_NO_WINDOW");
      if (suggestBtn) suggestBtn.hidden = !suggestable;
      if (!suggestable && suggestPanel) suggestPanel.hidden = true;

      // …but the ROWS follow the storey on screen, so the panel is about the drawing beside
      // it. A diagnostic carries the level that raised it; one with no level is a whole-plan
      // problem and shows on every storey. `renderLint` says out loud that it is narrowed,
      // so a quiet panel can never be misread as a clean building.
      const shown =
        activeLevel === null ? lintDiags : lintDiags.filter((d) => d.level === undefined || d.level === activeLevel);
      lastLintRows = renderLint(lintOutput, shown, ok, activeLevel, lintDiags.length);
    },
    afterCompile(source, diagnostics) {
      // The drawer (U1): a half-typed statement must not open it under the caret. It opens once
      // the problems have outlived DRAWER_AFTER_MS with no change to the document; it closes at
      // once, and an open drawer follows each compile at once. The gutter's squiggles, the Source
      // dot and the phone's Checks count say so at once either way.
      clearTimeout(drawerTimer);
      const count = diagnostics.filter((d) => d.severity === "error" || d.severity === "warning").length;
      mobileViews.setProblemCount(count);
      const wait = DRAWER_AFTER_MS - (performance.now() - changedAt);
      if (count === 0 || errorsEl.classList.contains("show") || wait <= 0) paintDrawer(source, diagnostics);
      else
        drawerTimer = setTimeout(() => {
          if (currentSource() === source) paintDrawer(source, diagnostics);
        }, wait);
      // Keep an already-run intent verdict live as the source changes (but don't run it
      // unprompted — an untouched Intent tab stays empty until you ask).
      if (intentOutput.innerHTML) renderIntent(intentOutput, source, intentSrc.value);
    },
  };
}
