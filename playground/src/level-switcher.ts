/**
 * The storey switcher — one `L<n>` button per `level` block of a multi-storey plan.
 *
 * It has ONE home (ruling PG-D3): on the stage, top-left, just under the Plan | 3D switch, in
 * both modes and over every tab. That is a decision rather than a layout accident: the selected
 * storey drives every view (the drawing, the facts strip, the 3D preview, the Facts and Checks
 * tabs) and every export, so a control that is only reachable from one view delivers half of "the
 * facts follow the storey" — you would have to leave the numbers to change which numbers you are
 * reading. It is no part of the edit-mode `role="tablist"`: these are toggle buttons in a
 * `role="group"`, and a tablist that contains a non-tab lies to a screen reader about how many
 * tabs there are. It is the page's one storey control: the 3D preview leaves out the package
 * toolbar's own "Storeys shown" cut-away (`viewToolbar(…, { storeys: false })`, card PG5b).
 *
 * The rendering is DOM-built, never an HTML string, because a storey NAME is author text
 * (`level 1 "Ground floor"`) — `textContent`/`setAttribute` are the escaping, and there
 * is no second place to get it wrong. The arithmetic behind it (which page, what the
 * labels say) lives in the DOM-free `levels.ts`, which is what the Node unit suite
 * drives.
 */
import { type LevelPage, levelButtonLabel, levelButtonTitle } from "./levels.js";

export interface LevelSwitcher {
  /**
   * Re-render for the plan now on screen. `pages` is `undefined` for a single-storey
   * plan (the core omits the key), and the control is then hidden entirely.
   */
  set(pages: readonly LevelPage[] | undefined, active: number | null): void;
}

interface LevelSwitcherOpts {
  /** The `role="group"` the buttons are rendered into. */
  el: HTMLElement | null;
  /** A storey button was pressed. */
  onChange: (level: number) => void;
}

export function mountLevelSwitcher(opts: LevelSwitcherOpts): LevelSwitcher {
  const { el, onChange } = opts;

  // One delegated listener, bound once, so the buttons can be rebuilt per plan without
  // ever re-binding anything.
  el?.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>("button[data-level]");
    if (!btn) return;
    const n = Number(btn.dataset.level);
    if (Number.isFinite(n)) onChange(n);
  });

  return {
    set(pages, active) {
      if (!el) return;
      const show = pages !== undefined && pages.length > 0;
      el.hidden = !show;
      if (!show) {
        el.replaceChildren();
        return;
      }
      el.replaceChildren(
        ...pages.map((p) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "lv-btn";
          b.dataset.level = String(p.level);
          b.textContent = levelButtonLabel(p);
          const full = levelButtonTitle(p);
          b.title = full;
          b.setAttribute("aria-label", full);
          const on = p.level === active;
          b.classList.toggle("active", on);
          // A pressed toggle, not a selected tab: `aria-pressed`, the same state the
          // preview's "Paths" toggle announces.
          b.setAttribute("aria-pressed", String(on));
          return b;
        }),
      );
    },
  };
}
