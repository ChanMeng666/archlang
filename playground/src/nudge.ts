/**
 * The one quiet pointer at Make your own: the stage notice (main.ts `flash`) with a "Make your own"
 * action, after a visitor has shown interest (the third plan switch, or the first knob let go), never
 * a modal and never focused. It is the notice every other message uses, so it sits where they do
 * and waits while the pointer or the focus is on it. It is shown at most once: the first showing is
 * remembered in localStorage (behind storage.ts's try/catch, so a browser with no storage gets at
 * most one per page load), and a visitor who has already opened the sheet is not pointed at it.
 *
 * Part of the startup chunk: no compiler, no doors. The decision is {@link shouldNudge}, pure.
 */
import { KEYS, readStr, writeStr } from "./storage.js";

/** How many plan switches earn the nudge. */
export const NUDGE_AFTER_SWITCHES = 3;
/** How long the notice stays (while the pointer and the focus are elsewhere). */
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
  /** The sheet was opened: no nudge is needed any more. */
  sheetOpened(): void;
}

/** Shows the notice: its text, its one action, and how long it stays. */
export type NudgeNotice = (msg: string, action: { label: string; run(): void }, ms: number) => void;

export function mountNudge(open: () => void, notice: NudgeNotice): Nudge {
  const state: NudgeState = { switches: 0, knobReleased: false, spent: readStr(KEYS.nudged) !== null };

  function maybeShow() {
    if (!shouldNudge(state)) return;
    state.spent = true;
    writeStr(KEYS.nudged, "1");
    notice("Want a plan of your own?", { label: "Make your own", run: open }, NUDGE_MS);
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
    },
  };
}
