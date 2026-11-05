/**
 * The header's own behaviour: the Source toggle, the Tools menu and the Make-your-own dialog.
 * Part of the startup chunk, so it holds no compiler and no editor: it only opens, closes and
 * forwards. The actions inside Tools are wired by actions.ts once the compiler has loaded (their
 * buttons are `disabled` until then); the panels by main.ts and edit-mode.ts.
 *
 * Tools closes like the menus it replaced: on Escape (listened for on the document, since Safari
 * does not focus a clicked <summary>), on a click outside it, and on choosing an item marked
 * `data-close`. A select, the a11y switch and Saved (whose popover anchors to its button) keep it
 * open.
 */

export interface ShellCtx {
  isEditing(): boolean;
  /** Open the editor (loading it on the first call). */
  enterEdit(): Promise<unknown>;
  leaveEdit(): void;
}

export interface Shell {
  /** Reflect the mode on the Source toggle. */
  setMode(editing: boolean): void;
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
    if (tools.open && !tools.contains(e.target as Node)) tools.open = false;
  });
  // An item that edits the source opens the editor first. Capture phase, so the mode is edit
  // before the item's own handler runs (its action works on the same document either way).
  tools.addEventListener(
    "click",
    (e) => {
      if ((e.target as Element | null)?.closest("[data-edit]") && !ctx.isEditing()) void ctx.enterEdit();
    },
    true,
  );
  tools.addEventListener("click", (e) => {
    // After the item's own handler, so the menu closes on what was chosen.
    if ((e.target as Element | null)?.closest("[data-close]")) setTimeout(() => (tools.open = false), 0);
  });
  // The output tabs, from the menu. Every tab but the 3D preview is edit mode's.
  for (const btn of tools.querySelectorAll<HTMLButtonElement>("[data-open-tab]")) {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.openTab;
      if (tab !== "preview3d" && !ctx.isEditing()) await ctx.enterEdit();
      document.getElementById(`tab-${tab}`)?.click();
    });
  }

  // ---- Make your own ----
  makeOwnBtn.addEventListener("click", () => {
    tools.open = false;
    dialog.showModal();
  });
  dialog.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    // A click on the backdrop lands on the <dialog> itself, outside its box (its padding is
    // the dialog too, so the box decides).
    const box = dialog.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if ((target === dialog && outside) || target?.closest("[data-mo-close]")) dialog.close();
    else if (target?.closest("[data-mo-edit]")) {
      dialog.close();
      void ctx.enterEdit();
    } else if (target?.closest("[data-mo-copy-llm]")) {
      dialog.close();
      document.getElementById("copyLlm")?.click();
    }
  });

  return {
    setMode(editing) {
      sourceBtn.setAttribute("aria-pressed", String(editing));
    },
  };
}
