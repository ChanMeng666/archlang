/**
 * The phone-width view switcher of edit mode (Code · Plan · 3D · Facts · Checks). Below the 900px
 * breakpoint the workspace shows one view at a time, and this switcher is its ONE control: the
 * output tab row is hidden there, so each function has one button (ruling PG-D1; card PG5b ①).
 * Plan, 3D, Facts and Checks are the output tabs under it (main.ts opens the tab as the view comes
 * up); Code is the editor; Checks also shows the compile diagnostics, counted on its button. The
 * CSS keys off `main[data-mview]`, so above the breakpoint this state is inert and the desktop
 * two-pane layout, with its tab row, is untouched.
 */

export type MobileView = "code" | "plan" | "3d" | "facts" | "checks";

/** The output tab each non-Code view shows (main.ts's tab names). */
export const VIEW_TAB: Readonly<Record<Exclude<MobileView, "code">, string>> = {
  plan: "preview",
  "3d": "preview3d",
  facts: "facts",
  checks: "checks",
};

/** The view that shows the output tab `tab`, if any. */
export const viewOfTab = (tab: string | undefined): MobileView | undefined =>
  (Object.entries(VIEW_TAB) as [MobileView, string][]).find(([, t]) => t === tab)?.[0];

export interface MobileViewsHandle {
  /** Switch the visible view (a no-op for layout above the breakpoint). */
  show(view: MobileView): void;
  /**
   * The output tab on screen changed by another way (a `&3d` link, leaving edit mode): press the
   * view that shows it, without opening anything. Code stays Code: the tab is under the editor.
   */
  follow(tab: string | undefined): void;
  /** Paint the diagnostic count onto the Checks button ("" hides it). */
  setProblemCount(n: number): void;
}

/** `onShow` is told of every switch, so main.ts opens the view's tab as it comes up. */
export function mountMobileViews(
  main: HTMLElement,
  nav: HTMLElement,
  countEl: HTMLElement,
  onShow?: (view: MobileView) => void,
): MobileViewsHandle {
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>("button[data-mview]")];
  const press = (view: MobileView) => {
    main.dataset.mview = view;
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mview === view));
  };
  const show = (view: MobileView) => {
    press(view);
    onShow?.(view);
  };
  for (const b of buttons) b.addEventListener("click", () => show(b.dataset.mview as MobileView));
  return {
    show,
    follow: (tab) => {
      const view = viewOfTab(tab);
      if (view && main.dataset.mview !== "code" && main.dataset.mview !== view) press(view);
    },
    setProblemCount: (n) => {
      countEl.textContent = n > 0 ? String(n) : "";
    },
  };
}

/** Whether the stacked phone layout is active — the same breakpoint as chrome.css. */
export const isNarrow = (): boolean => window.matchMedia("(max-width: 900px)").matches;
