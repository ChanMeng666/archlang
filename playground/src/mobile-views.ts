/**
 * The phone-width view switcher (Code · Plan · Problems). Below the 900px breakpoint
 * the workspace shows one view at a time; the CSS keys off `main[data-mview]`, so above
 * the breakpoint this state is inert and the desktop two-pane layout is untouched.
 */

export type MobileView = "code" | "plan" | "problems";

export interface MobileViewsHandle {
  /** Switch the visible view (a no-op for layout above the breakpoint). */
  show(view: MobileView): void;
  /** Paint the diagnostic count onto the Problems button ("" hides it). */
  setProblemCount(n: number): void;
}

export function mountMobileViews(main: HTMLElement, nav: HTMLElement, countEl: HTMLElement): MobileViewsHandle {
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>("button[data-mview]")];
  const show = (view: MobileView) => {
    main.dataset.mview = view;
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mview === view));
  };
  for (const b of buttons) b.addEventListener("click", () => show(b.dataset.mview as MobileView));
  return {
    show,
    setProblemCount: (n) => {
      countEl.textContent = n > 0 ? String(n) : "";
    },
  };
}

/** Whether the stacked phone layout is active — the same breakpoint as chrome.css. */
export const isNarrow = (): boolean => window.matchMedia("(max-width: 900px)").matches;
