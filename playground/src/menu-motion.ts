/**
 * The header's <details> menus (Share, More, the plan gallery) close the way they open: their panel
 * fades and slides back at --dur-fast-out on --ease-in (`.is-closing`, chrome.css) and the menu is
 * shut (`open` removed, its panel `display: none`) only once that is over, by a timer equal to the
 * CSS duration, read from it, so it is 0 under reduced motion and the menu shuts at once. A press on
 * the trigger mid-close reverses it from where it is: the class goes and the CSS transition runs
 * back, rather than the menu closing and opening again from nothing.
 *
 * Part of the startup chunk (the header is the view path): no imports, a few hundred bytes.
 */

const closing = new Map<HTMLDetailsElement, ReturnType<typeof setTimeout>>();

/** The panel's exit duration, as the CSS has it (`--dur-fast-out`), in ms; 0 under reduced motion. */
export function menuCloseMs(): number {
  if (typeof getComputedStyle !== "function") return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--dur-fast-out").trim();
  const n = Number.parseFloat(v);
  if (!(n > 0)) return 0;
  return v.endsWith("ms") ? n : n * 1000;
}

/** Whether `menu` is on its way out (still `open`, already leaving). */
export const isClosing = (menu: HTMLDetailsElement): boolean => closing.has(menu);

/** Whether `menu` is open and staying open. */
export const isShown = (menu: HTMLDetailsElement): boolean => menu.open && !closing.has(menu);

/** Close `menu` the way it opened; `then` runs once it is shut. A no-op if it is shut or leaving. */
export function closeMenu(menu: HTMLDetailsElement, then?: () => void): void {
  if (!menu.open || closing.has(menu)) return;
  const ms = menuCloseMs();
  if (ms === 0) {
    menu.open = false;
    then?.();
    return;
  }
  menu.classList.add("is-closing");
  closing.set(
    menu,
    setTimeout(() => {
      closing.delete(menu);
      menu.classList.remove("is-closing");
      menu.open = false;
      then?.();
    }, ms),
  );
}

/** Stop a close under way: the panel runs back from where it is. False if it was not closing. */
export function reopenMenu(menu: HTMLDetailsElement): boolean {
  const t = closing.get(menu);
  if (t === undefined) return false;
  clearTimeout(t);
  closing.delete(menu);
  menu.classList.remove("is-closing");
  return true;
}

/** Shut `menu` at once (a dialog is opening over it), dropping any close under way with it. */
export function shutMenu(menu: HTMLDetailsElement): void {
  reopenMenu(menu);
  menu.open = false;
}

/**
 * Route the trigger's own toggle through {@link closeMenu}: a press on an open menu's <summary>
 * closes it the way it opened, and a press mid-close reverses it (`onReopen` is told, so a sibling
 * menu can be closed, as a real open would). Opening is the browser's own.
 */
export function animateMenu(menu: HTMLDetailsElement, onReopen?: () => void): void {
  menu.querySelector(":scope > summary")?.addEventListener("click", (e) => {
    if (reopenMenu(menu)) {
      e.preventDefault();
      onReopen?.();
      return;
    }
    if (menu.open) {
      e.preventDefault();
      closeMenu(menu);
    }
  });
}
