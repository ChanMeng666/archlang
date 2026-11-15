/**
 * The rooms from the keyboard (card PG.1): a "Rooms" control in the drawing's bottom-right corner
 * that lists the storey's rooms, each a button that opens the room's facts card (room-card.ts), the
 * same card a click on the room opens. The drawing itself takes no focus, so without this a
 * keyboard or screen-reader user could not open a card at all.
 *
 * A disclosure: the control is out of sight until it has the focus (a skip link's pattern; a
 * pointer has the drawing), Enter or Space opens the list, read from describe() as it is then, and
 * Escape closes it. Picking a room closes the list and opens the card with the focus on it, which
 * goes back to the control when the card closes.
 */
import { type FactsRoom, roomName } from "./room-facts.js";

interface RoomIndexOpts {
  viewport: HTMLElement;
  /** describe() rooms of the storey on screen (read when the list opens). */
  getRooms: () => readonly FactsRoom[];
  /** Open `room`'s card and give it the focus. */
  openCard: (room: FactsRoom) => void;
}

export function mountRoomIndex({ viewport, getRooms, openCard }: RoomIndexOpts): void {
  const box = document.createElement("div");
  box.className = "room-index";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ri-toggle";
  toggle.textContent = "Rooms";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "roomIndexList");
  const list = document.createElement("ul");
  list.id = "roomIndexList";
  list.className = "ri-list";
  list.setAttribute("aria-label", "Rooms in the drawing");
  list.hidden = true;
  box.append(toggle, list);
  viewport.appendChild(box);

  function collapse() {
    list.hidden = true;
    list.replaceChildren();
    toggle.setAttribute("aria-expanded", "false");
    box.classList.remove("open");
  }

  function expand() {
    const rooms = getRooms();
    const items = rooms.map((room) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = roomName(room);
      b.addEventListener("click", () => {
        collapse();
        toggle.focus({ preventScroll: true });
        openCard(room);
      });
      li.append(b);
      return li;
    });
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "ri-none";
      li.textContent = "No rooms on this storey";
      items.push(li);
    }
    list.replaceChildren(...items);
    list.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    box.classList.add("open");
  }

  toggle.addEventListener("click", () => (list.hidden ? expand() : collapse()));
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || list.hidden) return;
    e.stopPropagation();
    collapse();
    toggle.focus({ preventScroll: true });
  });
  // The list closes when the focus leaves it (a Tab past its last room, a click elsewhere).
  box.addEventListener("focusout", (e) => {
    if (!list.hidden && !box.contains(e.relatedTarget as Node | null)) collapse();
  });
}
