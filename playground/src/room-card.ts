/**
 * The room's facts card: a click on a room in the drawing opens it in the drawing's top-left
 * corner, with the room's area, size, use, neighbours and openings, all describe()'s
 * (room-facts.ts). In edit mode it also offers "Jump to source", which moves the editor's caret to
 * the statement that drew the room: the same click-to-source the drawing has (`data-span`, from
 * `compile(…, { annotate: true })`), read off the room's own floor.
 *
 * A non-modal dialog. Opened in view mode it takes the focus, so a keyboard and a screen reader
 * land on it; in edit mode the click has just put the caret in the editor, and the card leaves it
 * there. Escape (outside the editor) or its × closes it, and the focus goes back where it was. A
 * click on another room shows that room; a click off every room closes it. A new plan closes it; a
 * recompile of the same plan refreshes it, or closes it when its room is gone.
 */
import type { SceneSummary } from "archlang";
import { type FactsRoom, openingsText, roomCardFacts } from "./room-facts.js";

export interface RoomCard {
  /** Show `room`'s facts, or close the card for `null` (a click off every room). */
  show(room: FactsRoom | null): void;
  close(): void;
  /** Re-read the open room from the latest summary (a recompile); close when it is gone. */
  refresh(): void;
}

interface RoomCardOpts {
  viewport: HTMLElement;
  stage: HTMLElement;
  /** describe() of the storey on screen at the last good compile. */
  getSummary: () => SceneSummary | null;
  /** Whether the editor is open (the card then offers "Jump to source"). */
  isEditing: () => boolean;
  jumpToOffset: (offset: number) => void;
}

export function mountRoomCard({ viewport, stage, getSummary, isEditing, jumpToOffset }: RoomCardOpts): RoomCard {
  const card = document.createElement("section");
  card.className = "room-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "roomCardTitle");
  card.tabIndex = -1;
  card.hidden = true;
  viewport.appendChild(card);

  let roomId: string | null = null;
  let returnTo: Element | null = null;

  /** The source offset of the statement that drew room `id`, when the drawing carries it. */
  function spanOf(id: string): number | undefined {
    const el = stage.querySelector(`[data-arch-kind="room"][data-arch-id="${CSS.escape(id)}"][data-span]`);
    const start = Number(el?.getAttribute("data-span")?.split(":")[0]);
    return el && Number.isFinite(start) ? start : undefined;
  }

  function render(room: FactsRoom, summary: SceneSummary) {
    const f = roomCardFacts(room, summary);
    const head = document.createElement("div");
    head.className = "rc-head";
    const title = document.createElement("h3");
    title.id = "roomCardTitle";
    title.textContent = f.name;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "rc-close";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.addEventListener("click", () => close());
    head.append(title, x);

    const dl = document.createElement("dl");
    const row = (term: string, value: string) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.append(dt, dd);
    };
    row("Area", f.area);
    if (f.centreline) row("Centreline area", f.centreline);
    row("Size", f.size);
    row("Use", f.use);
    row("Next to", f.neighbours.length > 0 ? f.neighbours.join(", ") : "no other room");
    row("Openings", openingsText(f));
    card.replaceChildren(head, dl);

    const start = isEditing() ? spanOf(room.id) : undefined;
    if (start !== undefined) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "rc-jump";
      jump.textContent = "Jump to source";
      jump.addEventListener("click", () => jumpToOffset(start));
      card.append(jump);
    }
  }

  function close() {
    if (card.hidden) return;
    const hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    roomId = null;
    if (hadFocus) {
      if (returnTo instanceof HTMLElement && returnTo.isConnected && returnTo !== document.body) returnTo.focus();
      else (document.activeElement as HTMLElement | null)?.blur();
    }
    returnTo = null;
  }

  // Escape closes it, but not from inside the editor: there Escape is the editor's own (it closes
  // a completion, drops a selection), and a card the reader opened stays until they close it.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || card.hidden) return;
    if (e.target instanceof Element && e.target.closest(".cm-editor")) return;
    close();
  });

  return {
    show(room) {
      const summary = getSummary();
      if (!room || !summary) return close();
      const wasOpen = !card.hidden;
      roomId = room.id;
      render(room, summary);
      card.hidden = false;
      if (!isEditing()) {
        if (!wasOpen) returnTo = document.activeElement;
        card.focus({ preventScroll: true });
      }
    },
    close,
    refresh() {
      if (roomId === null) return;
      const summary = getSummary();
      const room = summary?.rooms.find((r) => r.id === roomId);
      if (!summary || !room) return close();
      const hadFocus = card.contains(document.activeElement);
      render(room, summary);
      if (hadFocus) card.focus({ preventScroll: true });
    },
  };
}
