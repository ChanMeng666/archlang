/**
 * "Send this plan to improve ArchLang" (ruling RM-D87, card FW5): an offer under the diagnostics
 * drawer, shown while the plan has an error or a warning there, that sends the plan only after a
 * dialog has said what is sent and why, and the user has confirmed it. Each time, never remembered.
 *
 * Confirmed, it makes a short link exactly as Copy short link does (`createShortLink`, the same
 * `POST /api/share` and its store, ADR 0034: no new storage), then counts one `contribute` event
 * carrying that link's id and the plan's codes, the only event with an id (telemetry.ts), and shows
 * the link. The event follows the browser's Global Privacy Control or Do Not Track like every other
 * event; the short link does not, because the user asked for it here, as with Copy short link,
 * and the dialog says so when the browser sends either signal. A plan the store refuses (one that
 * does not parse, `E_PARSE`, or runs out of steps, `E_STEP_LIMIT`) is offered nothing.
 *
 * Loaded with edit mode (edit-mode.ts imports it), never on the view path or by `embed.html`.
 */
import { escapeHtml } from "./escape.js";
import { createShortLink, encodeSrc } from "./share.js";
import { NOT_A_PLAN_CODES } from "../worker/share-core.js";
import { asksNotToTrack, countEvent, eventCodes } from "./telemetry.js";

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

/** The short-link id at the end of a `/s/<id>` URL. */
export const shortLinkId = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

/**
 * The dialog's text, as HTML (escaped): what is sent, where it goes, what it is for and how to have
 * it deleted. `dnt`: the browser asks not to be tracked, so no count goes with the plan.
 */
export function contributeTerms(codes: readonly string[], dnt: boolean): string {
  const list = codes.length ? ` (${codes.map((c) => `<code>${escapeHtml(c)}</code>`).join(", ")})` : "";
  return (
    `<p class="contrib-p">This sends the full plan text in the editor and its diagnostic codes${list} to archlang.uk.</p>` +
    `<p class="contrib-p">It is stored as a short link, the same as <b>Copy short link</b>: anyone with the link can open the plan.</p>` +
    `<p class="contrib-p">It is used only to improve ArchLang: the language spec, the error messages, the fixes, lint and a private test corpus. It is never published, and never given to anyone else to train on.</p>` +
    `<p class="contrib-p">To have it deleted, open an issue with the link, or email chanmeng.dev@gmail.com; the <a href="${PRIVACY_URL}" target="_blank" rel="noopener">privacy page</a> says more.</p>` +
    (dnt
      ? `<p class="contrib-p">Your browser asks sites not to track it, so no count is sent with the plan; the short link is still made, because you ask for it here.</p>`
      : "")
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
  const kept = eventCodes(all);
  const row = document.createElement("div");
  row.className = "diag-contribute";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "contrib-open";
  btn.textContent = CONTRIBUTE_LABEL;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDialog(kept, ctx, btn);
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
    `<div class="contrib-body">${contributeTerms(codes, asksNotToTrack(navigator))}</div>` +
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
    // The source as it is at the press: what the dialog described is what goes.
    const url = await createShortLink(await encodeSrc(ctx.getSource()));
    if (!url) {
      send.disabled = false;
      status.textContent = "The plan could not be sent (offline, or refused); nothing was stored. Try again later.";
      return;
    }
    countEvent({ e: "contribute", id: shortLinkId(url), codes });
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
