/**
 * The header's own behaviour: the Source toggle, the Tools menu and the Make-your-own dialog.
 * Part of the startup chunk, so it holds no compiler, no editor and no doors (the sheet's body is
 * make-own.ts, loaded on its first open): it only opens, closes and forwards. The actions inside Tools are wired by actions.ts once the compiler has loaded (their
 * buttons are `disabled` until then). Tools opens no output tab (ruling PG-D3): the output tabs
 * are reached only through themselves, wired by main.ts and edit-mode.ts.
 *
 * Tools closes like the menus it replaced: on Escape (listened for on the document, since Safari
 * does not focus a clicked <summary>), on a click outside it, and on choosing an item marked
 * `data-close`. A select, the a11y switch and Saved (whose popover anchors to its button) keep it
 * open. This module is the one place that closes it.
 */

export interface ShellCtx {
  isEditing(): boolean;
  /** Whether the editor is mounted (edit mode can be on while its chunk still loads). */
  editorMounted(): boolean;
  /** Open the editor (loading it on the first call); resolves to it, or undefined on failure. */
  enterEdit(): Promise<unknown>;
  leaveEdit(): void;
  /** Settles once the app is up: the plan compiled and the Tools actions mounted. */
  whenReady(): Promise<unknown>;
  /** The plan on screen (the sheet's "Start from this plan" links to it). */
  getSource(): string;
  /** Wire chat links (`a[data-chat-host]`) the way the Tools menu's Ask AI links are. */
  wireChatLinks(links: HTMLAnchorElement[]): void;
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
  const tools = document.getElementById("tools") as HTMLDetailsElement;
  const toolsSummary = tools.querySelector("summary")!;
  const sourceBtn = document.getElementById("sourceToggle") as HTMLButtonElement;
  const makeOwnBtn = document.getElementById("makeOwn") as HTMLButtonElement;
  const dialog = document.getElementById("makeOwnDialog") as HTMLDialogElement;

  sourceBtn.addEventListener("click", () => {
    if (ctx.isEditing()) ctx.leaveEdit();
    else void ctx.enterEdit();
  });

  // ---- Tools ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !tools.open) return;
    const inside = tools.contains(document.activeElement);
    tools.open = false;
    if (inside) toolsSummary.focus();
  });
  document.addEventListener("click", (e) => {
    // The Saved popover (snapshots.ts) floats outside the menu but belongs to it: a click in it
    // is a click in Tools. Closing Tools closes the popover too (actions.ts). Read from the
    // event's path, fixed when it was dispatched: the popover re-renders its own rows on a click
    // (Save, Delete), which has detached the clicked button by the time the click gets here.
    if (!tools.open) return;
    const inside = e
      .composedPath()
      .some((n) => n === tools || (n instanceof Element && n.classList.contains("snap-pop")));
    if (!inside) tools.open = false;
  });
  // An item that edits the source (Format, Finish, Saved) runs through the editor, so its edit is
  // one undo step and the autosave and the hash follow the editor. Until the editor is mounted the
  // click is held (capture phase: before the item's own handler), the editor is opened, and the
  // same click is replayed on the item once it is.
  tools.addEventListener(
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
  tools.addEventListener("click", (e) => {
    // After the item's own handler, so the menu closes on what was chosen.
    if ((e.target as Element | null)?.closest("[data-close]")) setTimeout(() => (tools.open = false), 0);
  });

  // ---- Make your own ----
  // The sheet's body (make-own.ts, from doors.json) is its own chunk, rendered on the first open.
  const body = document.getElementById("makeOwnBody")!;
  let sheet: Promise<import("./make-own.js").Sheet | undefined> | undefined;
  const opened: (() => void)[] = [];
  async function openMakeOwn() {
    tools.open = false;
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
    } else if (target?.closest("[data-mo-copy-llm]")) {
      dialog.close();
      // Copy for LLM is wired (and enabled) once the app is up; its handler copies and says so
      // in the status line ("LLM prompt copied").
      void ctx.whenReady().then(() => document.getElementById("copyLlm")?.click());
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
