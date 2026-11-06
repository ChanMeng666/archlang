/**
 * The header's own behaviour: the Source toggle, the two menus, Share and More (⋯), and the
 * Make-your-own dialog. Part of the startup chunk, so it holds no compiler, no editor and no doors
 * (the sheet's body is make-own.ts, loaded on its first open): it only opens, closes and forwards.
 * The actions inside the menus are wired by actions.ts once the compiler has loaded (their buttons
 * are `disabled` until then). Neither menu opens an output tab (ruling PG-D3): the output tabs are
 * reached only through themselves, wired by main.ts and edit-mode.ts.
 *
 * Ruling PG-D5: Share holds every way the plan leaves the page (the links, Embed, Export); More holds
 * the render theme, a11y, the edit actions and the related sites; the hand-it-to-an-AI links and Copy
 * for LLM live in the Make-your-own sheet alone.
 *
 * A menu closes on Escape (listened for on the document, since Safari does not focus a clicked
 * <summary>), on a click outside it, on the focus Tabbing out of it, on opening the other one (or the
 * plan gallery, whose trigger's click is a click outside), and on choosing an item marked
 * `data-close`. A select, the a11y switch and Saved (whose popover anchors to its button) keep More
 * open. This module is the one place that closes them.
 */

export interface ShellCtx {
  isEditing(): boolean;
  /** Whether the editor is mounted (edit mode can be on while its chunk still loads). */
  editorMounted(): boolean;
  /** Open the editor (loading it on the first call); resolves to it, or undefined on failure. */
  enterEdit(): Promise<unknown>;
  leaveEdit(): void;
  /** Settles once the app is up: the plan compiled and the menus' actions mounted. */
  whenReady(): Promise<unknown>;
  /** The plan on screen (the sheet's "Start from this plan" links to it). */
  getSource(): string;
  /** Wire the sheet's chat links (`a[data-chat-host]`), drawn on its first open. */
  wireChatLinks(links: HTMLAnchorElement[]): void;
  /** The sheet opened: encode the plan for its chat links ahead of a click. */
  prepareChat(): void;
  /** The sheet's Copy for LLM (`#copyLlm`): copy the prompt and say so. */
  copyForLlm(): void;
}

export interface Shell {
  /** Reflect the mode on the Source toggle. */
  setMode(editing: boolean): void;
  /** Open the Make-your-own sheet (its chunk loads on the first call). */
  openMakeOwn(): Promise<void>;
  /** Told when the sheet opens (the nudge stands down). */
  onMakeOwnOpen(fn: () => void): void;
}

export function mountShell(ctx: ShellCtx): Shell {
  const share = document.getElementById("share") as HTMLDetailsElement;
  const more = document.getElementById("more") as HTMLDetailsElement;
  const menus = [share, more];
  const sourceBtn = document.getElementById("sourceToggle") as HTMLButtonElement;
  const makeOwnBtn = document.getElementById("makeOwn") as HTMLButtonElement;
  const dialog = document.getElementById("makeOwnDialog") as HTMLDialogElement;

  sourceBtn.addEventListener("click", () => {
    if (ctx.isEditing()) ctx.leaveEdit();
    else void ctx.enterEdit();
  });

  // ---- Share and More ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const menu of menus) {
      if (!menu.open) continue;
      const inside = menu.contains(document.activeElement);
      menu.open = false;
      if (inside) menu.querySelector("summary")?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    // The Saved popover (snapshots.ts) floats outside More but belongs to it: a click in it is a
    // click in More. Closing More closes the popover too (actions.ts). Read from the event's path,
    // fixed when it was dispatched: the popover re-renders its own rows on a click (Save, Delete),
    // which has detached the clicked button by the time the click gets here.
    const path = e.composedPath();
    for (const menu of menus) {
      if (!menu.open) continue;
      const inside = path.some(
        (n) => n === menu || (menu === more && n instanceof Element && n.classList.contains("snap-pop")),
      );
      if (!inside) menu.open = false;
    }
  });
  // One menu open at a time: opening one closes the other.
  for (const menu of menus) {
    menu.addEventListener("toggle", () => {
      if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
    });
    // Tab out of a menu and it closes, as the gallery does (card PG5b ⑧). The focus going into
    // More's Saved popover (outside More, but More's) keeps it open; focus going nowhere (a click
    // on the page's ground) is the click listener's to judge.
    menu.addEventListener("focusout", (e) => {
      const to = e.relatedTarget as Element | null;
      if (!menu.open || !to || menu.contains(to)) return;
      if (menu === more && to.closest(".snap-pop")) return;
      menu.open = false;
    });
  }
  // An item that edits the source (Format, Finish, Saved) runs through the editor, so its edit is
  // one undo step and the autosave and the hash follow the editor. Until the editor is mounted the
  // click is held (capture phase: before the item's own handler), the editor is opened, and the
  // same click is replayed on the item once it is.
  more.addEventListener(
    "click",
    (e) => {
      const item = (e.target as Element | null)?.closest<HTMLElement>("[data-edit]");
      if (!item || ctx.editorMounted()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void ctx.enterEdit().then((mounted) => {
        if (mounted) item.click();
      });
    },
    true,
  );
  for (const menu of menus) {
    menu.addEventListener("click", (e) => {
      // After the item's own handler, so the menu closes on what was chosen.
      if ((e.target as Element | null)?.closest("[data-close]")) setTimeout(() => (menu.open = false), 0);
    });
  }

  // ---- Make your own ----
  // The sheet's body (make-own.ts, from doors.json) is its own chunk, rendered on the first open.
  const body = document.getElementById("makeOwnBody")!;
  let sheet: Promise<import("./make-own.js").Sheet | undefined> | undefined;
  const opened: (() => void)[] = [];
  async function openMakeOwn() {
    for (const menu of menus) menu.open = false;
    sheet ??= import("./make-own.js").then(
      (m) => {
        const s = m.mountSheet(body, { getSource: ctx.getSource });
        ctx.wireChatLinks([...body.querySelectorAll<HTMLAnchorElement>("a[data-chat-host]")]);
        return s;
      },
      (err: unknown) => {
        sheet = undefined; // a failed chunk load is retried on the next open
        body.textContent = `This did not load: ${(err as { message?: string })?.message ?? err}`;
        return undefined;
      },
    );
    (await sheet)?.reset();
    ctx.prepareChat();
    if (!dialog.open) dialog.showModal();
    for (const fn of opened) fn();
  }
  makeOwnBtn.addEventListener("click", () => void openMakeOwn());
  // A modal <dialog> makes the page behind it inert, but Tab past its last control still leaves
  // for the browser's own UI; the sheet keeps it, wrapping round its controls both ways.
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const stops = [
      ...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey ? at === first || !dialog.contains(at) : at === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  });
  // Focus goes back to the button that opened the sheet, unless the sheet sent it on (the editor).
  let handedOn = false;
  dialog.addEventListener("close", () => {
    if (!handedOn) makeOwnBtn.focus();
    handedOn = false;
  });
  dialog.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    // A click on the backdrop lands on the <dialog> itself, outside its box (its padding is
    // the dialog too, so the box decides).
    const box = dialog.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if ((target === dialog && outside) || target?.closest("[data-mo-close]")) dialog.close();
    else if (target?.closest("[data-mo-edit]")) {
      handedOn = true;
      dialog.close();
      void ctx.enterEdit();
    } else if (target?.closest("#copyLlm")) {
      dialog.close();
      // Copy for LLM runs once the app is up (the prompt reads the compiler); it copies and says so
      // in the status line ("LLM prompt copied"), which the closed sheet no longer covers.
      void ctx.whenReady().then(() => ctx.copyForLlm());
    }
  });

  return {
    setMode(editing) {
      sourceBtn.setAttribute("aria-pressed", String(editing));
    },
    openMakeOwn,
    onMakeOwnOpen(fn) {
      opened.push(fn);
    },
  };
}
