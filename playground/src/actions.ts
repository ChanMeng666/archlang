/**
 * The header/panel action buttons: Format, Repair furniture, Embed, Copy link,
 * saved snapshots, the multi-format Download, and the draggable pane divider.
 * Each is wired from an explicit context so main.ts stays composition-only.
 */
import { compile, describe, diagnosticToJson, format, renderAscii, repair, toDxf, type Scene } from "archlang";
import { escapeHtml } from "./escape.js";
import { buildLlmPrompt } from "./llm-prompt.js";
import { encodeSrc, updateHash } from "./share.js";
import { mountSnapshots } from "./snapshots.js";
import { KEYS, readStr, writeStr } from "./storage.js";
import { saveBlob, svgToCanvas } from "./raster-export.js";

interface ActionsCtx {
  getSource: () => string;
  loadSource: (src: string, refit?: boolean) => void;
  flash: (msg: string) => void;
  /** The export-clean SVG (annotations stripped); empty when nothing is rendered. */
  getCleanSvg: () => string;
  getScene: () => Scene | null | undefined;
  /** Surface an export failure in the status/errors UI. */
  onExportError: (format: string, err: unknown) => void;
  els: {
    formatBtn: HTMLButtonElement | null;
    repairBtn: HTMLElement | null;
    repairPanel: HTMLElement | null;
    embedBtn: HTMLElement | null;
    copyLinkBtn: HTMLElement;
    copyLlmBtn: HTMLElement | null;
    savedBtn: HTMLButtonElement;
    downloadBtn: HTMLElement;
    formatSelect: HTMLSelectElement | null;
  };
}

export function mountActions(ctx: ActionsCtx): void {
  const { getSource, loadSource, flash, getCleanSvg, getScene, onExportError, els } = ctx;

  // Format (idempotent, comment-preserving) — rewrite the source in place.
  els.formatBtn?.addEventListener("click", () => {
    const src = getSource();
    const out = format(src);
    if (out === src) {
      flash("Already formatted");
      return;
    }
    loadSource(out, false);
    flash("Formatted");
  });

  // Repair furniture (ADR 0006) — run the deterministic corrector, show the change
  // log, and let the user apply the new source. Never auto-applied.
  els.repairBtn?.addEventListener("click", () => showRepair());

  // Embed — build an <iframe> snippet pointing at the chrome-less embed page.
  els.embedBtn?.addEventListener("click", () => void showEmbed());

  // Copy permalink (B5) — the hash carries the source; copy the full URL.
  els.copyLinkBtn.addEventListener("click", async () => {
    await updateHash(getSource()); // ensure the URL reflects the latest edit
    try {
      await navigator.clipboard.writeText(location.href);
      flash("Link copied");
    } catch {
      flash("Copy failed");
    }
  });

  // Copy-for-LLM — assemble one paste-ready prompt (source + describe() facts +
  // diagnostics with fixes + a spec pointer) so a user can hand the plan to any
  // AI assistant. All client-side; no API key. Same clipboard UX as Copy link.
  els.copyLlmBtn?.addEventListener("click", async () => {
    const source = getSource();
    const facts = describe(source);
    const { diagnostics } = compile(source);
    const prompt = buildLlmPrompt({
      source,
      facts,
      diagnostics: (diagnostics ?? []).map((d) => diagnosticToJson(source, d)),
    });
    try {
      await navigator.clipboard.writeText(prompt);
      flash("LLM prompt copied");
    } catch {
      flash("Copy failed");
    }
  });

  // Saved snapshots (history) — named stashes in localStorage.
  mountSnapshots({ button: els.savedBtn, getSource, setSource: (src) => loadSource(src, true) });

  mountDivider();

  // Multi-format download.
  els.downloadBtn.addEventListener("click", () => {
    void downloadCurrent(els.formatSelect ? els.formatSelect.value : "svg");
  });

  /** Run `repair` on the current source and render its change log into the Lint
   *  tab, with an "Apply fixes" action that swaps the corrected source in. */
  function showRepair() {
    const repairPanel = els.repairPanel;
    if (!repairPanel) return;
    const result = repair(getSource());
    if (!result.changed && result.unresolved.length === 0) {
      repairPanel.hidden = false;
      repairPanel.innerHTML = `<p class="repair-none">Nothing to repair — furniture placement is already sound.</p>`;
      return;
    }
    const changeRows = result.changes
      .map(
        (c) =>
          `<li><code>${escapeHtml(c.id)}</code> <span class="repair-cat">${escapeHtml(c.category)}</span>` +
          `<span class="repair-move">(${c.from.x},${c.from.y}) → (${c.to.x},${c.to.y})</span>` +
          `<span class="repair-reason">${escapeHtml(c.reason)}</span></li>`,
      )
      .join("");
    const unresolvedRows = result.unresolved
      .map((u) => `<li class="repair-un"><code>${escapeHtml(u.id)}</code> ${escapeHtml(u.reason)}</li>`)
      .join("");
    repairPanel.hidden = false;
    repairPanel.innerHTML =
      `<div class="repair-head"><strong>Repair — ${result.changes.length} fix${result.changes.length === 1 ? "" : "es"}` +
      `${result.unresolved.length ? `, ${result.unresolved.length} unresolved` : ""}</strong>` +
      (result.changed ? `<button class="repair-apply" type="button">Apply fixes</button>` : "") +
      `</div>` +
      (changeRows ? `<ul class="repair-list">${changeRows}</ul>` : "") +
      (unresolvedRows
        ? `<p class="repair-un-h">Left for you to resolve (repair never guesses):</p><ul class="repair-list">${unresolvedRows}</ul>`
        : "");
    repairPanel.querySelector(".repair-apply")?.addEventListener("click", () => {
      loadSource(result.source, false);
      repairPanel.hidden = true;
      flash("Repaired");
    });
  }

  /** Present a copyable iframe (and Markdown) snippet that embeds the current plan
   *  via the chrome-less embed page, using the shared `#z=` share codec. */
  async function showEmbed() {
    const hash = await encodeSrc(getSource());
    const origin = location.origin + location.pathname.replace(/[^/]*$/, "");
    const embedUrl = `${origin}embed.html${hash}`;
    const iframe = `<iframe src="${embedUrl}" width="720" height="480" style="border:1px solid #e3e0d8;border-radius:10px" title="ArchLang floor plan" loading="lazy"></iframe>`;
    const md = `[![ArchLang floor plan](${origin}embed.html${hash})](${embedUrl})`;
    const dialog = document.createElement("div");
    dialog.className = "embed-dialog";
    dialog.innerHTML =
      `<div class="embed-box">` +
      `<div class="embed-head"><strong>Embed this plan</strong><button class="embed-close" type="button" aria-label="Close">×</button></div>` +
      `<label>iframe (HTML)</label><textarea class="embed-code" readonly rows="3">${escapeHtml(iframe)}</textarea>` +
      `<label>Live editable link</label><input class="embed-link" readonly value="${escapeHtml(embedUrl)}&editable=1" />` +
      `<div class="embed-actions"><button class="embed-copy" data-snippet="iframe" type="button">Copy iframe</button>` +
      `<button class="embed-copy" data-snippet="md" type="button">Copy Markdown</button>` +
      `<a class="embed-open" href="${embedUrl}&editable=1" target="_blank" rel="noopener">Open embed ↗</a></div>` +
      `</div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.remove();
    dialog.addEventListener("click", (e) => {
      const target = e.target as Element | null;
      if (target === dialog || target?.closest(".embed-close")) close();
    });
    for (const btn of dialog.querySelectorAll<HTMLElement>(".embed-copy")) {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.snippet === "md" ? md : iframe);
          flash(btn.dataset.snippet === "md" ? "Markdown copied" : "Embed snippet copied");
          close();
        } catch {
          flash("Copy failed");
        }
      });
    }
  }

  // ---- multi-format download (SVG vector · DXF vector · TXT ascii · PNG/PDF raster) ----
  async function downloadCurrent(format: string) {
    const clean = getCleanSvg();
    if (!clean) return;
    try {
      if (format === "svg") {
        saveBlob(new Blob([clean], { type: "image/svg+xml" }), "svg");
      } else if (format === "dxf") {
        const scene = getScene();
        if (!scene) return;
        saveBlob(new Blob([toDxf(scene)], { type: "application/dxf" }), "dxf");
      } else if (format === "txt") {
        // The zero-dep ASCII plan — the same bytes `arch compile -f txt` emits.
        const scene = getScene();
        if (!scene) return;
        saveBlob(new Blob([renderAscii(scene)], { type: "text/plain" }), "txt");
      } else if (format === "png") {
        const canvas = await svgToCanvas(clean);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
        saveBlob(blob!, "png");
      } else if (format === "pdf") {
        // Vector PDF needs Node-only pdfkit; in-browser we embed a high-res raster
        // via jsPDF (lazy-loaded so it never bloats the initial bundle).
        const canvas = await svgToCanvas(clean);
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
          unit: "pt",
          format: [canvas.width, canvas.height],
          compress: true, // Flate-compress streams — line-art on white shrinks hugely.
        });
        // "FAST" compression on the embedded raster keeps the PDF a sane size
        // (an uncompressed full-res PNG embed runs to tens of MB).
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
        pdf.save("floorplan.pdf");
      }
    } catch (err) {
      onExportError(format, err);
    }
  }
}

/** Draggable split divider over the pane seam (desktop two-column layout). */
function mountDivider(): void {
  const main = document.querySelector<HTMLElement>("main")!;
  const divider = document.createElement("div");
  divider.className = "divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "Resize panes");
  main.appendChild(divider);

  const applyRatio = (r: number) => {
    main.style.gridTemplateColumns = `${r}fr ${1 - r}fr`;
    divider.style.left = `${r * 100}%`;
  };
  let ratio = parseFloat(readStr(KEYS.split) ?? "");
  if (!(ratio > 0.1 && ratio < 0.9)) ratio = 0.5;
  applyRatio(ratio);

  divider.addEventListener("pointerdown", (e) => {
    if (window.innerWidth <= 760) return; // stacked layout — divider is inert
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    divider.classList.add("dragging");
    const onMove = (ev: PointerEvent) => {
      const rect = main.getBoundingClientRect();
      ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      applyRatio(ratio);
    };
    const onUp = () => {
      divider.classList.remove("dragging");
      divider.removeEventListener("pointermove", onMove);
      divider.removeEventListener("pointerup", onUp);
      writeStr(KEYS.split, String(ratio));
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp);
  });

  // Keep the divider aligned to the seam on viewport resize.
  window.addEventListener("resize", () => applyRatio(ratio));
}
