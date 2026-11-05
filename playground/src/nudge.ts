/**
 * The one quiet pointer at Make your own: a small toast, after a visitor has shown interest (the
 * third plan switch, or the first knob let go), never a modal and never focused. It is shown at
 * most once: the first showing is remembered in localStorage (behind storage.ts's try/catch, so
 * a browser with no storage gets at most one per page load), and a visitor who has already
 * opened the sheet is not pointed at it. It hides itself after a while, or on its ×.
 *
 * Part of the startup chunk: no compiler, no doors. The decision is {@link shouldNudge}, pure.
 */
import { KEYS, readStr, writeStr } from "./storage.js";

/** How many plan switches earn the nudge. */
export const NUDGE_AFTER_SWITCHES = 3;
/** How long the toast stays before it hides itself. */
export const NUDGE_MS = 10_000;

export interface NudgeState {
  switches: number;
  knobReleased: boolean;
  /** Shown before (this load or, through storage, an earlier one), or the sheet already opened. */
  spent: boolean;
}

/** Whether the nudge is due now. */
export const shouldNudge = (s: NudgeState): boolean =>
  !s.spent && (s.switches >= NUDGE_AFTER_SWITCHES || s.knobReleased);

export interface Nudge {
  planSwitched(): void;
  knobReleased(): void;
  /** The sheet was opened: no nudge is needed any more, and a showing one goes. */
  sheetOpened(): void;
}

export function mountNudge(open: () => void): Nudge {
  const state: NudgeState = { switches: 0, knobReleased: false, spent: readStr(KEYS.nudged) !== null };
  let toast: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hide = () => {
    clearTimeout(timer);
    toast?.remove();
    toast = undefined;
  };

  function maybeShow() {
    if (!shouldNudge(state)) return;
    state.spent = true;
    writeStr(KEYS.nudged, "1");
    toast = document.createElement("div");
    toast.className = "nudge";
    toast.setAttribute("role", "status");
    toast.innerHTML =
      `<span>Want a plan of your own?</span>` +
      `<button type="button" class="nudge-go">Make your own</button>` +
      `<button type="button" class="nudge-x" aria-label="Dismiss">×</button>`;
    toast.querySelector(".nudge-go")!.addEventListener("click", () => {
      hide();
      open();
    });
    toast.querySelector(".nudge-x")!.addEventListener("click", hide);
    document.body.append(toast);
    timer = setTimeout(hide, NUDGE_MS);
  }

  return {
    planSwitched() {
      state.switches++;
      maybeShow();
    },
    knobReleased() {
      state.knobReleased = true;
      maybeShow();
    },
    sheetOpened() {
      state.spent = true;
      hide();
    },
  };
}
