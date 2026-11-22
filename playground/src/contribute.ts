/**
 * "Send this plan to improve ArchLang" (ruling RM-D87, card FW5): an offer under the diagnostics
 * drawer, shown while the plan has an error or a warning there, that sends the plan only after a
 * dialog has said what is sent and why, and the user has confirmed it. Each time, never remembered.
 *
 * Confirmed, it makes a short link as Copy short link does (`createShortLink`, the same
 * `POST /api/share` and its store, ADR 0034: no new storage), asking with `contribute: true`, and
 * shows the link. The page sends no event for it: the Worker marks the link as a contribution
 * itself, with the id it minted and the codes of the compile it runs on the stored plan, so no one
 * can mark another's link or name codes the plan does not raise. That marker is the user's own
 * request, made in the dialog, so it is written under Global Privacy Control or Do Not Track too,
 * and the dialog says so. A plan the store refuses (one that does not
 * parse, `E_PARSE`, or runs out of steps, `E_STEP_LIMIT`) is offered nothing.
 *
 * Loaded with edit mode (edit-mode.ts imports it), never on the view path or by `embed.html`.
 */
import { escapeHtml } from "./escape.js";
import { createShortLink, encodeSrc, SHORT_LINK_TIMEOUT_MS } from "./share.js";
import { NOT_A_PLAN_CODES } from "../worker/share-core.js";
import { eventCodes } from "../worker/event-core.js";

/** The privacy page's section on contributions, which says how to have one deleted. */
export const PRIVACY_URL = "https://archlang.uk/privacy#contributing-a-plan";

/** The offer's button text, also the dialog's title. */
export const CONTRIBUTE_LABEL = "Send this plan to improve ArchLang";

/**
 * Whether a plan with these codes can be sent: the short-link store refuses a plan that does not
 * parse or runs out of steps (`NOT_A_PLAN_CODES`), so such a plan is offered nothing.
 */
export const canContribute = (codes: Iterable<string | undefined>): boolean =>
  ![...codes].some((c) => c !== undefined && NOT_A_PLAN_CODES.includes(c));

/**
 * The dialog's text, as HTML (escaped): what is sent, where it goes, what it is for, that it is
 * marked whatever privacy signal the browser sends, and how to have it deleted.
 */
export function contributeTerms(codes: readonly string[]): string {
  const list = codes.length ? ` (now ${codes.map((c) => `<code>${escapeHtml(c)}</code>`).join(", ")})` : "";
  return (
    `<p class="contrib-p">This sends the full plan text in the editor to archlang.uk. Our server reads its diagnostic codes${list} from it.</p>` +
    `<p class="contrib-p">It is stored as a short link, the same as <b>Copy short link</b>: anyone with the link can open the plan. Our server marks the link as a contribution, with those codes and the day; this is your request, so it is marked even if your browser sends Global Privacy Control or Do Not Track.</p>` +
    `<p class="contrib-p">It is used only to improve ArchLang: the language spec, the error messages, the fixes, lint and a private test corpus. It is never published, and never given to anyone else to train on.</p>` +
    `<p class="contrib-p">To have it deleted, open an issue with the link, or email chanmeng.dev@gmail.com; the <a href="${PRIVACY_URL}" target="_blank" rel="noopener">privacy page</a> says more.</p>`
  );
}

/** What the offer needs from edit mode. */
export interface ContributeCtx {
  /** The editor's document as it is now. */
  getSource: () => string;
  flash: (msg: string) => void;
}

/**
 * Put the offer at the foot of the diagnostics drawer `el` (after its rows) when `rows` is not
 * empty; `renderDiagnostics` has just rewritten the drawer, so there is never an old one to remove.
 */
export function offerContribution(el: HTMLElement, codes: Iterable<string | undefined>, ctx: ContributeCtx): void {
  const all = [...codes];
  if (!el.classList.contains("show") || !canContribute(all)) return;
  const shown = eventCodes(all);
  const row = document.createElement("div");
  row.className = "diag-contribute";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "contrib-open";
  btn.textContent = CONTRIBUTE_LABEL;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDialog(shown, ctx, btn);
  });
  row.appendChild(btn);
  el.appendChild(row);
}

function openDialog(codes: string[], ctx: ContributeCtx, opener: HTMLElement): void {
  const dialog = document.createElement("dialog");
  dialog.className = "contrib-dialog";
  dialog.setAttribute("aria-labelledby", "contribTitle");
  dialog.innerHTML =
    `<div class="embed-head"><strong id="contribTitle">${escapeHtml(CONTRIBUTE_LABEL)}</strong>` +
    `<button class="embed-close" type="button" aria-label="Close">×</button></div>` +
    `<div class="contrib-body">${contributeTerms(codes)}</div>` +
    `<p class="contrib-p contrib-status" role="status"></p>` +
    `<div class="embed-actions"><button class="embed-copy contrib-send" type="button">Send the plan</button>` +
    `<button class="contrib-cancel" type="button">Cancel</button></div>`;
  document.body.appendChild(dialog);
  const status = dialog.querySelector<HTMLElement>(".contrib-status")!;
  const send = dialog.querySelector<HTMLButtonElement>(".contrib-send")!;
  const cancel = dialog.querySelector<HTMLButtonElement>(".contrib-cancel")!;
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (opener.isConnected) opener.focus();
  });
  dialog.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (target === dialog || target?.closest(".embed-close, .contrib-cancel")) dialog.close();
  });
  send.addEventListener("click", async () => {
    send.disabled = true;
    status.textContent = "Sending…";
    // The source as it is at the press: the server reads its codes from exactly what it stores.
    const hash = await encodeSrc(ctx.getSource());
    const url = await createShortLink(hash, location.origin, SHORT_LINK_TIMEOUT_MS, true);
    if (!url) {
      send.disabled = false;
      status.textContent = "The plan could not be sent (offline, or refused); nothing was stored. Try again later.";
      return;
    }
    status.innerHTML = `Sent, thank you. Its short link: <input class="embed-link contrib-link" readonly aria-label="The short link" value="${escapeHtml(url)}" />`;
    send.remove();
    cancel.textContent = "Close";
    const link = status.querySelector<HTMLInputElement>(".contrib-link");
    link?.focus();
    link?.select();
    ctx.flash("Plan sent: its short link is in the dialog");
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  send.focus();
}
