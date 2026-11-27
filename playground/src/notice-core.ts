/**
 * The stage notice's two pure rules (main.ts `flash`): how long a message stays, and the "undo"
 * suffix an action that rewrites the source says, and the sentence-and-button a view that did not
 * load shows. Part of the startup chunk.
 */

/** A notice's one action: a button beside its text. */
export interface NoticeAction {
  label: string;
  run(): void;
}

/** What `flash` takes besides its message: one action, and a life other than `noticeMs`'s. */
export interface FlashOpts {
  action?: NoticeAction;
  ms?: number;
}

/** A failed copy names the next step, one sentence for each kind of thing copied. */
export const COPY_FAILED = {
  link: "Couldn't copy the link — it is in the address bar",
  drawing: "Couldn't copy — use Download instead",
  prompt: "Couldn't copy the prompt — click the page and try again",
  snippet: "Couldn't copy — select the text and copy it",
} as const;

/** A message with an action stays this long: long enough to read it and reach the button. */
export const NOTICE_ACTION_MS = 6000;

/**
 * How long a notice stays on screen: 1.5 s plus 45 ms a character, between 1.8 s and 6 s, and 6 s
 * when it carries an action. The timer pauses while the pointer or the focus is on the notice.
 */
export function noticeMs(msg: string, hasAction = false): number {
  if (hasAction) return NOTICE_ACTION_MS;
  return Math.min(6000, Math.max(1800, 1500 + 45 * msg.length));
}

/** The platform's undo chord, as the notice spells it: ⌘Z on Apple platforms, Ctrl+Z elsewhere. */
export function undoChord(platform: string): string {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘Z" : "Ctrl+Z";
}

/** A message for an action that rewrote the source: what it did, and how to take it back. */
export const withUndo = (msg: string, platform: string): string => `${msg} · ${undoChord(platform)} undoes`;

/** A view that did not load (U29): the sentence, and a button that runs the open again. */
export function failedToLoad(el: HTMLElement, sentence: string, retry: () => void): void {
  const p = document.createElement("p");
  p.className = "load-failed";
  p.textContent = `${sentence} `;
  const again = document.createElement("button");
  again.type = "button";
  again.className = "load-retry";
  again.textContent = "Try again";
  again.addEventListener("click", retry, { once: true });
  p.append(again);
  el.replaceChildren(p);
}
