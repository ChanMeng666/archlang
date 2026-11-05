/**
 * The plan strip under the drawing (view mode): one thumbnail link per example, in the picker's
 * order. Its links and thumbnails are in the served page (scripts/gen-static.mjs writes them), so
 * this module builds nothing and reads no example source: it turns a click on a link into "open
 * this plan here" (the link itself goes to the plan's static page, which is what a click with no
 * script, a modified click or a middle click still does), marks the plan on screen, and makes the
 * list ONE tab stop that the arrow keys, Home and End move through (a roving tabindex).
 */

export interface Strip {
  /** Mark the plan on screen by its picker label, or none (a plan that is not an example). */
  setCurrent(label: string | null): void;
}

export function mountStrip(list: HTMLElement, onPick: (label: string) => void): Strip {
  const items = () => [...list.querySelectorAll<HTMLAnchorElement>("a.strip-item")];

  /** The one tab stop: the current plan's link, else the first. */
  function rove(to?: HTMLAnchorElement) {
    const all = items();
    const stop = to ?? all.find((a) => a.getAttribute("aria-current") === "true") ?? all[0];
    for (const a of all) a.tabIndex = a === stop ? 0 : -1;
  }

  list.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a.strip-item");
    const label = a?.dataset.label;
    // A modified or non-primary click keeps the link's own meaning (a new tab, a download).
    if (!a || !label || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    rove(a);
    onPick(label);
  });

  list.addEventListener("keydown", (e) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? all[Math.min(i + 1, all.length - 1)]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? all[Math.max(i - 1, 0)]
          : e.key === "Home"
            ? all[0]
            : e.key === "End"
              ? all[all.length - 1]
              : undefined;
    if (!next) return;
    e.preventDefault();
    rove(next);
    next.focus({ preventScroll: true });
    list.scrollLeft += scrollDelta(list, next);
  });

  rove();

  return {
    setCurrent(label) {
      let current: HTMLAnchorElement | undefined;
      for (const a of items()) {
        const on = label !== null && a.dataset.label === label;
        if (on) {
          a.setAttribute("aria-current", "true");
          current = a;
        } else a.removeAttribute("aria-current");
      }
      rove();
      // Bring it into the strip's own view, never scrolling the page.
      if (current) list.scrollLeft += scrollDelta(list, current);
    },
  };
}

/**
 * How far `list` must scroll sideways to show `item`: 0 when it is wholly inside, else to its start.
 * Its start, not the nearest edge: the list snaps each item's start (`scroll-snap-align: start`),
 * so a scroll to an edge between snap points is pulled back to one, leaving the item cut off.
 */
function scrollDelta(list: HTMLElement, item: HTMLElement): number {
  const l = list.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  return r.left < l.left || r.right > l.right ? r.left - l.left : 0;
}
