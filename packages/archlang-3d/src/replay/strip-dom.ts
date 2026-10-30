/** The strip's DOM half, apart from `strip.ts` so that the types of `.` and `./node` need no DOM lib. */
import type { StripItem } from "./strip.js";

/** Paint `items` into `el` (one span each); touches the DOM only when the text changed. */
export function paintStrip(el: HTMLElement, items: readonly StripItem[]): void {
  const key = items.map((i) => `${i.id}=${i.text}`).join("|");
  if (el.dataset.stripKey === key) return;
  el.dataset.stripKey = key;
  el.hidden = items.length === 0;
  // A space between the facts (flex ignores it on screen) keeps the text readable as text.
  const nodes: Node[] = [];
  for (const i of items) {
    const s = el.ownerDocument.createElement("span");
    s.dataset.fact = i.id;
    s.textContent = i.text;
    if (nodes.length > 0) nodes.push(el.ownerDocument.createTextNode(" "));
    nodes.push(s);
  }
  el.replaceChildren(...nodes);
}
