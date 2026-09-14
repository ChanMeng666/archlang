/**
 * The shared-plan notice — the one piece of UI that exists because a `#z=` link is
 * THIRD-PARTY CONTENT.
 *
 * Every other surface here renders a plan the visitor either chose from the presets
 * or typed themselves. A permalink does not: its whole payload arrives in the URL
 * fragment, written by whoever sent the link, and the compiler will faithfully draw
 * whatever labels it names. A room called "Your session has expired — sign in" is a
 * lint-clean plan. Nothing in the language can or should stop that — labels are
 * author text — so the honest mitigation is attribution: say, on the page, that the
 * words in the drawing came from the link and not from us.
 *
 * Two deliberate limits:
 *
 * - It is shown ONLY for a hash whose decoded source is not byte-equal to a bundled
 *   example. Every permalink the README, the docs and the Copy-link button mint for
 *   a stock plan therefore stays silent, which is what keeps the notice meaningful
 *   rather than chrome people learn to ignore.
 * - The dismissal is NOT persisted. There is no storage key here on purpose: a
 *   remembered dismissal would suppress the notice for the next, different shared
 *   link — exactly the visit it exists for.
 *
 * The predicate is pure and lives here (unit-tested in playground/test); the two
 * callers (main.ts, embed.ts) only mount what it decides.
 */

/** The sentence itself, as the playground shows it. */
export const SHARED_PLAN_NOTICE =
  "This plan was compiled from a shared link. Its text and labels were written by whoever shared it, not by ArchLang.";

/**
 * The embed's one-line variant. An embed is a stranger's `<iframe>`, typically 720
 * px wide and sometimes far less, and the full sentence does not fit one line there.
 *
 * It is SHORTENED rather than TRUNCATED, and that distinction is the whole reason
 * this constant exists: the first attempt clipped the long sentence with
 * `text-overflow: ellipsis`, which at 720 px cut it at "not by ArchLan…" and at 380
 * px left only "This plan was compiled from a shared link. Its text…" — an ellipsis
 * eating exactly the clause the notice is FOR. Both claims survive here, and the
 * strip wraps rather than clips when even this does not fit.
 */
export const SHARED_PLAN_NOTICE_SHORT =
  "Shared link — this plan's labels were written by whoever shared it, not by ArchLang.";

/**
 * True when `src` is byte-equal to one of the bundled example plans.
 *
 * Byte equality, not a fuzzy match: the presets are `?raw` imports of the very files
 * the CLI ships, so a permalink minted from one round-trips exactly. Anything that
 * differs by even a character was edited by somebody, and "somebody edited it" is
 * precisely the case the notice is about.
 *
 * `sources` is passed in rather than imported so this module stays free of the
 * `?raw` example graph and the predicate can be tested on its own.
 */
export function isBundledExample(src: string, sources: Iterable<string>): boolean {
  for (const source of sources) {
    if (source === src) return true;
  }
  return false;
}

/**
 * Whether this load should carry the notice: a shared source was decoded from the
 * hash AND it is not one of the bundled examples. `null` covers both "no hash" and
 * "a hash that failed to decode" — `srcFromHash()` returns null for each, and
 * neither is third-party content that reached the screen.
 */
export function shouldShowSharedNotice(sharedSrc: string | null, sources: Iterable<string>): boolean {
  return sharedSrc !== null && !isBundledExample(sharedSrc, sources);
}

/**
 * Build the notice element: a `role="status"` strip with the sentence and a dismiss
 * button that removes it. No persistence, no timers, no focus stealing — a status
 * region is announced without moving the caret out of the editor.
 */
export function createSharedNotice(sentence: string = SHARED_PLAN_NOTICE, doc: Document = document): HTMLElement {
  const el = doc.createElement("div");
  el.className = "shared-notice";
  el.setAttribute("role", "status");

  const text = doc.createElement("p");
  text.className = "shared-notice-text";
  text.textContent = sentence;

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "shared-notice-dismiss";
  dismiss.textContent = "Dismiss";
  dismiss.setAttribute("aria-label", "Dismiss the shared-plan notice");
  dismiss.addEventListener("click", () => el.remove());

  el.append(text, dismiss);
  return el;
}
