/**
 * The page's events (ruling RM-D86, card FW4): what the playground counts, sent to its own Worker
 * (`POST /api/event`, worker/event-core.ts) with `navigator.sendBeacon`, and nothing else. An event
 * is a name, one listed word and the catalogued codes it concerns: never the plan, a label, an id,
 * a cookie or an account. A contributed plan (ruling RM-D87) is no event of this page's: the
 * Worker marks it itself (contribute.ts).
 *
 * Nothing is sent when the browser asks not to be tracked (`navigator.globalPrivacyControl`, or
 * `doNotTrack === "1"`), by an automated browser (`navigator.webdriver`: the e2e suites and the
 * nightly run on the live site, which are no one's use), or where `sendBeacon` is missing (there is
 * no fallback). A send that throws is dropped: an event never fails or delays what the page does.
 *
 * The editor compiles on every edit, so compiles are debounced: one is sent only after
 * {@link COMPILE_IDLE_MS} with no newer compile (none during a burst of typing), and then only if
 * the same outcome and codes were not sent within {@link COMPILE_REPEAT_MS}.
 *
 * Loaded only with the header actions, edit mode or a first use (main.ts imports it lazily), never
 * on the view path and never by `embed.html`, which runs on other people's pages
 * (`playground/test/telemetry.test.ts` walks both import graphs).
 */
import { type CompileOutcome, EVENT_PATH, eventCodes, type PageEvent } from "../worker/event-core.js";

export { eventCodes } from "../worker/event-core.js";

/** How long the editor must be still before its last compile is counted. */
export const COMPILE_IDLE_MS = 2000;
/** The shortest gap between two counts of the same outcome and codes. */
export const COMPILE_REPEAT_MS = 10_000;

/** The `navigator` fields read here. */
export interface EventNavigator {
  sendBeacon?: (url: string, data?: string) => boolean;
  globalPrivacyControl?: boolean;
  doNotTrack?: string | null;
  webdriver?: boolean;
}

/** Whether this browser may be sent from at all. */
export function mayCount(nav: EventNavigator | undefined): boolean {
  if (!nav || typeof nav.sendBeacon !== "function") return false;
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return false;
  return nav.webdriver !== true;
}

/** What a sender runs on: the browser's, or a test's fakes. */
export interface EventDeps {
  nav: EventNavigator | undefined;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface PageEvents {
  /** Send one event now (if this browser may be sent from). */
  count(ev: PageEvent): void;
  /** A render landed: counted after the editor is still, once per outcome and codes per window. */
  compiled(outcome: CompileOutcome, codes: Iterable<string | undefined>): void;
}

export function createPageEvents(deps: EventDeps): PageEvents {
  const { nav, now, setTimer, clearTimer } = deps;
  /** When each `outcome|codes` was last sent; entries older than the window are pruned. */
  const sent = new Map<string, number>();
  let timer: unknown;

  function count(ev: PageEvent): void {
    if (!mayCount(nav)) return;
    try {
      nav!.sendBeacon!.call(nav, EVENT_PATH, JSON.stringify(ev));
    } catch {
      /* an event never fails what the page does */
    }
  }

  function compiled(outcome: CompileOutcome, raw: Iterable<string | undefined>): void {
    if (!mayCount(nav)) return;
    const codes = eventCodes(raw);
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => {
      timer = undefined;
      const t = now();
      for (const [k, at] of sent) if (t - at >= COMPILE_REPEAT_MS) sent.delete(k);
      const key = `${outcome}|${codes.join(";")}`;
      if (sent.has(key)) return;
      sent.set(key, t);
      count({ e: "compile", outcome, codes });
    }, COMPILE_IDLE_MS);
  }

  return { count, compiled };
}

let shared: PageEvents | undefined;
/** The page's one sender, made on first use. */
export function pageEvents(): PageEvents {
  shared ??= createPageEvents({
    nav: typeof navigator === "undefined" ? undefined : (navigator as unknown as EventNavigator),
    now: () => Date.now(),
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return shared;
}

/** Send one event from this page. */
export const countEvent = (ev: PageEvent): void => pageEvents().count(ev);
