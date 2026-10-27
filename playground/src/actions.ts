/**
 * The header/panel action buttons: Format, Finish, Repair furniture, Embed, Copy
 * link, Copy for LLM, Open in Claude / ChatGPT, saved snapshots, the multi-format
 * Download, and the draggable pane divider.
 * Each is wired from an explicit context so main.ts stays composition-only.
 */
import {
  compile,
  describe,
  diagnosticToJson,
  finish,
  format,
  renderAscii,
  repair,
  toDxf,
  type FinishResult,
  type Scene,
} from "archlang";
import { escapeHtml } from "./escape.js";
import { embedSnippets, exampleImageUrl } from "./embed-snippets.js";
import { exampleNameFor } from "./examples.js";
import { buildChatPrompt, buildLlmPrompt, CHAT_HOSTS, type ChatHost, chatHostUrl, isChatHost } from "./llm-prompt.js";
import { encodeSrc, updateHash } from "./share.js";
import { mountSnapshots } from "./snapshots.js";
import { KEYS, readStr, writeStr } from "./storage.js";
import { levelFileName } from "./levels.js";
import { saveBlob, svgToCanvas } from "./raster-export.js";

interface ActionsCtx {
  getSource: () => string;
  loadSource: (src: string, refit?: boolean) => void;
  flash: (msg: string) => void;
  /** The export-clean SVG (annotations stripped); empty when nothing is rendered. */
  getCleanSvg: () => string;
  getScene: () => Scene | null | undefined;
  /**
   * The storey currently previewed, or `null` for a single-storey plan. Every export
   * writes the SELECTED page — `getCleanSvg`/`getScene` already carry it — so the file
   * must be NAMED for it too, with the CLI's own `<stem>.L<n>.<ext>` scheme.
   */
  getLevel: () => number | null;
  /** Surface an export failure in the status/errors UI. */
  onExportError: (format: string, err: unknown) => void;
  /** Bring the Lint tab to the front (where Finish and Repair report). */
  showLintTab: () => void;
  /** The render-theme override picked in the View menu, or "" for the source's own. */
  getThemeOverride: () => string;
  els: {
    formatBtn: HTMLButtonElement | null;
    finishBtn: HTMLButtonElement | null;
    finishPanel: HTMLElement | null;
    /** The "Ask AI" disclosure holding the chat links. */
    chatMenu: HTMLDetailsElement | null;
    /** The "Open in Claude / ChatGPT" links, each naming its host in `data-chat-host`. */
    chatLinks: HTMLAnchorElement[];
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

/** What the page tells the actions after mounting. */
export interface ActionsHandle {
  /** The editor text changed (any edit, undo or load). */
  sourceChanged: () => void;
}

export function mountActions(ctx: ActionsCtx): ActionsHandle {
  const {
    getSource,
    loadSource,
    flash,
    getCleanSvg,
    getScene,
    getLevel,
    onExportError,
    showLintTab,
    getThemeOverride,
    els,
  } = ctx;

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

  // Finish — the core's `finish()` (the same transform as `arch finish`) adds what a
  // finished sheet needs and replaces the source as ONE undo step (Ctrl+Z reverts
  // it); what it added and what it declined are listed in the Lint tab.
  els.finishBtn?.addEventListener("click", () => runFinish(false));

  /**
   * Run `finish` (with `reissue` from the panel's "Reissue sheet" button) and report.
   * `loadSource` hides the panel — it describes the previous document — so the panel
   * is rendered AFTER it. A rerun with nothing to do leaves a showing log in place.
   */
  function runFinish(reissue: boolean) {
    const src = getSource();
    const result = finish(src, reissue ? { reissue: true } : {});
    const n = result.changes.length;
    const m = result.unresolved.length;
    if (result.changed) loadSource(result.source, false);
    if (result.changed || m > 0 || els.finishPanel?.hidden !== false) showFinish(result);
    const added = `${n} change${n === 1 ? "" : "s"}`;
    flash(
      result.changed
        ? m > 0
          ? `Finished: ${added}, ${m} unresolved (see Lint)`
          : `Finished: ${added} (Ctrl+Z undoes)`
        : m > 0
          ? `Finish added nothing: ${m} unresolved (see Lint)`
          : "Nothing to finish",
    );
    // A declined statement is the part a user must act on: put it in front of them.
    if (m > 0) showLintTab();
  }

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
    try {
      await navigator.clipboard.writeText(llmPrompt());
      flash("LLM prompt copied");
    } catch {
      flash("Copy failed");
    }
  });

  /** The full paste-ready prompt (source + facts + diagnostics) for the current plan. */
  function llmPrompt(): string {
    const source = getSource();
    const facts = describe(source);
    const { diagnostics } = compile(source);
    return buildLlmPrompt({
      source,
      facts,
      diagnostics: (diagnostics ?? []).map((d) => diagnosticToJson(source, d)),
    });
  }

  // Open in Claude / ChatGPT — open the chat host with a short prompt carrying the
  // plan's share link. This DOES put the plan in the host's URL (the panel says so),
  // unlike Copy link, whose `#z=` fragment never leaves the browser. No tracking
  // parameter, and no inbound query string: the link is origin + path + hash.
  //
  // The share codec is async (CompressionStream) and a click must not await before
  // opening a tab (that spends the user activation popup blockers check). So the
  // current source is encoded AHEAD of the click — at mount, when the menu opens, on
  // hover, focus and press — into `chatEncoded`, tagged with the source it encodes.
  // The click uses it only if that source is still the editor's text; anything else
  // (a click before the encoding landed, a stale one) takes the copy path below.
  let chatEncoded: { source: string; hash: string } | undefined;
  const shareBase = () => location.origin + location.pathname;
  const chatTarget = (host: ChatHost): { url: string; fits: boolean } => {
    if (chatEncoded?.source !== getSource()) return { url: CHAT_HOSTS[host].base, fits: false };
    return chatHostUrl(host, buildChatPrompt(`${shareBase()}${chatEncoded.hash}`));
  };
  /**
   * Point every link's `href` at what it would open NOW — the prefilled URL while the
   * encoding is current, the bare host otherwise — so the paths that read the `href`
   * as it stands (middle-click, "open in new tab", drag) never carry an older plan.
   * `data-ready` marks a current encoding.
   */
  function syncChatLinks() {
    const fresh = chatEncoded?.source === getSource();
    for (const link of els.chatLinks) {
      if (!isChatHost(link.dataset.chatHost)) continue;
      link.href = chatTarget(link.dataset.chatHost).url;
      if (fresh) link.dataset.ready = "true";
      else delete link.dataset.ready;
    }
  }
  async function encodeForChat() {
    const source = getSource();
    if (chatEncoded?.source === source) return;
    const hash = await encodeSrc(source);
    if (getSource() !== source) return; // edited meanwhile; the next trigger re-encodes
    chatEncoded = { source, hash };
    syncChatLinks();
  }
  /** Copy the full prompt, THEN open the host: a tab opened first can take focus and
   *  make the clipboard write fail. If the popup is then refused, say where to paste. */
  async function copyThenOpen(host: ChatHost, why: string) {
    const { name, base } = CHAT_HOSTS[host];
    try {
      await navigator.clipboard.writeText(llmPrompt());
    } catch {
      flash("Copy failed");
      return;
    }
    const tab = window.open(base, "_blank");
    if (tab) {
      tab.opener = null;
      flash(`${why}: full prompt copied, paste it into ${name}`);
    } else {
      flash(`${why}: full prompt copied; open ${name} and paste it`);
    }
  }
  void encodeForChat();
  els.chatMenu?.addEventListener("toggle", () => {
    if (els.chatMenu?.open) void encodeForChat();
  });
  for (const link of els.chatLinks) {
    const host = link.dataset.chatHost;
    if (!isChatHost(host)) continue;
    for (const type of ["pointerenter", "focus", "pointerdown"])
      link.addEventListener(type, () => void encodeForChat());
    link.addEventListener("click", (e) => {
      const fresh = chatEncoded?.source === getSource();
      const { url, fits } = chatTarget(host);
      link.href = url;
      setTimeout(closeChatMenu, 0); // after the anchor's own activation
      if (fits) return; // the anchor itself opens the prefilled host
      e.preventDefault();
      void copyThenOpen(host, fresh ? "Plan too long for a link" : "Link not ready");
    });
    // A middle-click opens the href as it stands. Stale: open nothing, copy instead.
    // Current but too long (the href is the bare host): let it open, and copy too.
    link.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      const fresh = chatEncoded?.source === getSource();
      if (fresh && chatTarget(host).fits) return;
      if (!fresh) e.preventDefault();
      navigator.clipboard.writeText(llmPrompt()).then(
        () => flash(`Full prompt copied, paste it into ${CHAT_HOSTS[host].name}`),
        () => flash("Copy failed"),
      );
    });
  }

  // The "Ask AI" disclosure closes like the Saved popover: Escape (listened for on the
  // document, since Safari does not focus a clicked <summary>), a click outside it, or
  // choosing a link.
  const chatMenu = els.chatMenu;
  function closeChatMenu() {
    if (chatMenu) chatMenu.open = false;
  }
  if (chatMenu) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !chatMenu.open) return;
      const inside = chatMenu.contains(document.activeElement);
      closeChatMenu();
      if (inside) chatMenu.querySelector("summary")?.focus();
    });
    document.addEventListener("click", (e) => {
      if (chatMenu.open && !chatMenu.contains(e.target as Node)) closeChatMenu();
    });
  }

  // Saved snapshots (history) — named stashes in localStorage.
  mountSnapshots({ button: els.savedBtn, getSource, setSource: (src) => loadSource(src, true) });

  mountDivider();

  // Multi-format download.
  els.downloadBtn.addEventListener("click", () => {
    void downloadCurrent(els.formatSelect ? els.formatSelect.value : "svg");
  });

  /** Render what `finish` added and what it declined into the Lint tab, in the
   *  same change-log form Repair uses. */
  function showFinish(result: FinishResult) {
    const panel = els.finishPanel;
    if (!panel) return;
    panel.hidden = false;
    if (!result.changed && result.unresolved.length === 0) {
      panel.innerHTML = `<p class="repair-none">Nothing to finish — the sheet already has everything finish adds.</p>`;
      return;
    }
    const changeRows = result.changes
      .map(
        (c) =>
          `<li><code>${escapeHtml(c.text)}</code> <span class="repair-cat">${escapeHtml(c.stage)}` +
          `${c.room ? ` · ${escapeHtml(c.room)}` : ""}${c.kind === "replaced" ? " · replaced" : ""}</span>` +
          `<span class="repair-reason">${escapeHtml(c.reason)}</span></li>`,
      )
      .join("");
    const unresolvedRows = result.unresolved
      .map((u) => {
        // A whole-plan note (e.g. "the plan does not compile") names no statement or room.
        const what = u.statement ?? u.room;
        const codes = u.codes?.length ? ` (${u.codes.map(escapeHtml).join(", ")})` : "";
        return `<li class="repair-un">${what ? `<code>${escapeHtml(what)}</code> ` : ""}${escapeHtml(u.reason)}${codes}</li>`;
      })
      .join("");
    // The notes may say "rerun with --reissue", a CLI flag. Offer it here when — and only
    // when — reissuing would actually change the sheet (`paper`/`scale`, nothing else).
    const canReissue = result.unresolved.length > 0 && finish(getSource(), { reissue: true }).changed;
    const n = result.changes.length;
    panel.innerHTML =
      `<div class="repair-head"><strong>Finish — ${n} change${n === 1 ? "" : "s"}` +
      `${result.unresolved.length ? `, ${result.unresolved.length} unresolved` : ""}</strong>` +
      (canReissue
        ? `<button class="repair-apply finish-reissue" type="button" title="Run finish again, allowed to replace paper and scale so the drawing fits">Reissue sheet</button>`
        : "") +
      `</div>` +
      (result.changed ? `<p class="repair-un-h">Applied to the editor; undo with Ctrl+Z (⌘Z on a Mac).</p>` : "") +
      (changeRows ? `<ul class="repair-list">${changeRows}</ul>` : "") +
      (unresolvedRows
        ? `<p class="repair-un-h">Left for you to resolve (finish never guesses):</p><ul class="repair-list">${unresolvedRows}</ul>`
        : "") +
      // The core's note names the CLI flag; say what it is called here.
      (canReissue ? `<p class="repair-un-h">Here, Reissue sheet does what <code>--reissue</code> does.</p>` : "");
    panel.querySelector(".finish-reissue")?.addEventListener("click", () => runFinish(true));
  }

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

  /** Present a copyable iframe snippet that embeds the current plan via the
   *  chrome-less embed page, and a Markdown snippet linking the playground share URL
   *  (`embed.html` is a page, not an image), using the shared `#z=` share codec.
   *  An unedited bundled example shows its docs-site drawing (the storey on screen). */
  async function showEmbed() {
    const src = getSource();
    const hash = await encodeSrc(src);
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const example = exampleNameFor(src);
    // The gallery drawing is the source's own theme; under a View override it would
    // not be the picture on screen, so that case gets the plain link.
    const imageUrl = example && !getThemeOverride() ? exampleImageUrl(example, getLevel()) : undefined;
    const { embedUrl, iframe, markdown: md } = embedSnippets(base, hash, imageUrl);
    const dialog = document.createElement("div");
    dialog.className = "embed-dialog";
    dialog.innerHTML =
      `<div class="embed-box">` +
      `<div class="embed-head"><strong>Embed this plan</strong><button class="embed-close" type="button" aria-label="Close">×</button></div>` +
      `<label for="embedCode">iframe (HTML)</label><textarea id="embedCode" class="embed-code" readonly rows="3">${escapeHtml(iframe)}</textarea>` +
      `<label for="embedMd">${
        imageUrl
          ? "Markdown (this example's drawing, linking to the plan)"
          : example
            ? "Markdown link (the hosted drawing is in the plan's own theme, not a theme override; download an SVG for this one)"
            : "Markdown link (an edited plan has no hosted image; download an SVG for one)"
      }</label>` +
      `<input id="embedMd" class="embed-link embed-md" readonly value="${escapeHtml(md)}" />` +
      `<label for="embedLink">Live editable link</label><input id="embedLink" class="embed-link embed-live" readonly value="${escapeHtml(embedUrl)}&editable=1" />` +
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
    const level = getLevel();
    try {
      if (format === "svg") {
        saveBlob(new Blob([clean], { type: "image/svg+xml" }), "svg", level);
      } else if (format === "dxf") {
        const scene = getScene();
        if (!scene) return;
        saveBlob(new Blob([toDxf(scene)], { type: "application/dxf" }), "dxf", level);
      } else if (format === "txt") {
        // The zero-dep ASCII plan — the same bytes `arch compile -f txt` emits.
        const scene = getScene();
        if (!scene) return;
        saveBlob(new Blob([renderAscii(scene)], { type: "text/plain" }), "txt", level);
      } else if (format === "png") {
        const canvas = await svgToCanvas(clean);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
        saveBlob(blob!, "png", level);
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
        // jsPDF names its own download, so the level suffix is applied here rather than
        // through `saveBlob` — same rule, one spelling (`levelFileName`).
        pdf.save(levelFileName("floorplan.pdf", level));
      }
    } catch (err) {
      onExportError(format, err);
    }
  }

  return {
    // Called on every document change. Resync unconditionally: a change AWAY from the
    // encoded source must drop the link to the bare host, and a change BACK to it (an
    // undo) must restore the prefilled link and `data-ready`, or a middle-click would
    // open the bare host as if it were current.
    sourceChanged: () => syncChatLinks(),
  };
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
    if (window.innerWidth <= 900) return; // one-view phone layout — divider is inert
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
