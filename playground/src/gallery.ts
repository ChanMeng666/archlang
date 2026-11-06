/**
 * The plan gallery (ruling PG-D2): the header's one way to choose a plan. A disclosure
 * (`<details id="gallery">`) whose summary names the plan on screen (`▦ Furnished Flat ▾`) and
 * whose panel is a grid of thumbnail cards, grouped as `EXAMPLE_ROWS` groups them.
 *
 * The example cards are in the served page (scripts/gen-static.mjs writes them), each a real link
 * to the plan's static page, so the gallery works with no script (a `<details>` opens by itself)
 * and a crawler follows every link. This module builds none of them: it turns a plain click on a
 * card into "open this plan here" (a modified or middle click keeps the link's own meaning), marks
 * the plan on screen with `aria-current`, filters the cards by name, and moves through them with
 * the arrow keys, Home and End (a roving tabindex: the grid is one tab stop). The playground-only
 * samples' group (samples.ts, "Try Checks") has no static page, so its cards are buttons, added
 * once the samples load.
 *
 * Non-modal, like the Share and More menus beside it: Escape closes it and returns focus to the trigger; a
 * click outside or a Tab out of it closes it. Its thumbnails are `loading="lazy"` inside a closed
 * `<details>`, which renders nothing, so none is fetched before the first open.
 */
import { cardText, splitLabel } from "./plan-label.js";

export interface Gallery {
  /**
   * Mark the plan on screen by its picker label, or none: `label` null names a plan that is no
   * example (a shared link, a draft, an edit), and the trigger shows `neutral` instead.
   */
  setCurrent(label: string | null, neutral?: string): void;
  /** Add the playground-only samples' group after the examples (once; a second call does nothing). */
  addSamples(group: string, labels: readonly string[]): void;
  /** Build the example cards when the page carries none (the dev server: gen-static has not run). */
  ensureExamples(
    groups: readonly {
      group: string;
      items: readonly { label: string; name: string }[];
    }[],
  ): void;
  close(): void;
}

const CARD = ".gal-card";

export function mountGallery(root: HTMLDetailsElement, onPick: (label: string) => void): Gallery {
  const trigger = root.querySelector("summary")!;
  const nameEl = root.querySelector<HTMLElement>("#planName")!;
  const groupsEl = root.querySelector<HTMLElement>("#galleryGroups")!;
  const filter = root.querySelector<HTMLInputElement>("#galleryFilter")!;
  const empty = root.querySelector<HTMLElement>("#galleryEmpty")!;
  trigger.setAttribute("aria-expanded", String(root.open));

  const cards = () => [...groupsEl.querySelectorAll<HTMLElement>(CARD)];
  const shown = () => cards().filter((c) => !c.closest("li")!.hidden);
  const currentCard = () => cards().find((c) => c.getAttribute("aria-current") === "true");

  /** The one tab stop in the grid: `to`, else the current plan's card, else the first shown. */
  function rove(to?: HTMLElement) {
    const vis = shown();
    const cur = currentCard();
    const stop = to ?? (cur && vis.includes(cur) ? cur : vis[0]);
    for (const c of cards()) c.tabIndex = c === stop ? 0 : -1;
    return stop;
  }

  function applyFilter() {
    const q = filter.value.trim().toLowerCase();
    let any = false;
    for (const g of groupsEl.querySelectorAll<HTMLElement>(".gal-group")) {
      let inGroup = false;
      for (const li of g.querySelectorAll<HTMLLIElement>("li")) {
        const label = li.querySelector<HTMLElement>(CARD)?.dataset.label ?? "";
        li.hidden = q !== "" && !label.toLowerCase().includes(q);
        inGroup ||= !li.hidden;
      }
      g.hidden = !inGroup;
      any ||= inGroup;
    }
    // Always in the tree (a live region must exist before it speaks): empty while cards match.
    empty.textContent = any ? "" : `No plans match “${filter.value.trim()}”.`;
    rove();
  }

  function focusCard(c: HTMLElement | undefined) {
    if (!c) return;
    rove(c);
    c.focus({ preventScroll: true });
    c.scrollIntoView({ block: "nearest" });
  }

  function close(refocus = false) {
    if (!root.open) return;
    root.open = false;
    if (refocus) trigger.focus();
  }

  root.addEventListener("toggle", () => {
    trigger.setAttribute("aria-expanded", String(root.open));
    if (root.open) {
      filter.value = "";
      applyFilter();
      focusCard(rove());
    }
  });

  // A plain click on a card opens the plan here; any other click is the link's.
  groupsEl.addEventListener("click", (e) => {
    const c = (e.target as Element | null)?.closest<HTMLElement>(CARD);
    const label = c?.dataset.label;
    if (!c || !label || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onPick(label);
    close(true);
  });

  /** The card in the next row up or down whose centre is nearest `from`'s, by layout. */
  function vertical(from: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
    const r = from.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const rows = shown()
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter(({ r: o }) => (dir === 1 ? o.top > r.top + 1 : o.top < r.top - 1));
    if (rows.length === 0) return undefined;
    const edge = dir === 1 ? Math.min(...rows.map((x) => x.r.top)) : Math.max(...rows.map((x) => x.r.top));
    const row = rows.filter((x) => Math.abs(x.r.top - edge) < 2);
    row.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - cx) - Math.abs(b.r.left + b.r.width / 2 - cx));
    return row[0]?.c;
  }

  root.addEventListener("keydown", (e) => {
    if (!root.open) return;
    const t = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (t === filter) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusCard(shown()[0]);
      }
      return;
    }
    if (!t.matches(CARD)) return;
    const vis = shown();
    const i = vis.indexOf(t);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowRight") next = vis[Math.min(i + 1, vis.length - 1)];
    else if (e.key === "ArrowLeft") next = vis[Math.max(i - 1, 0)];
    else if (e.key === "ArrowDown") next = vertical(t, 1);
    else if (e.key === "ArrowUp") {
      next = vertical(t, -1);
      if (!next) {
        e.preventDefault();
        filter.focus();
        return;
      }
    } else if (e.key === "Home") next = vis[0];
    else if (e.key === "End") next = vis.at(-1);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
      // Typing filters: the character goes to the filter box, which takes the focus.
      e.preventDefault();
      filter.focus();
      filter.value += e.key;
      applyFilter();
      return;
    } else if (e.key === "Backspace" && filter.value) {
      e.preventDefault();
      filter.focus();
      filter.value = filter.value.slice(0, -1);
      applyFilter();
      return;
    } else return;
    e.preventDefault();
    focusCard(next);
  });
  filter.addEventListener("input", applyFilter);

  // Escape anywhere (focus may sit on the page while it is open), a click outside, a Tab out.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.open && !root.contains(document.activeElement)) close();
  });
  document.addEventListener("click", (e) => {
    if (root.open && !e.composedPath().includes(root)) close();
  });
  root.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !root.contains(to)) close();
  });

  function makeGroup(group: string, sample: boolean): HTMLElement {
    const sec = document.createElement("section");
    sec.className = "gal-group";
    sec.dataset.group = group;
    if (sample) sec.dataset.sample = "";
    const h = document.createElement("h2");
    h.className = "gal-h";
    h.id = `gal-h-${groupsEl.children.length}`;
    h.textContent = group;
    const ul = document.createElement("ul");
    ul.className = "gal-grid";
    ul.setAttribute("aria-labelledby", h.id);
    sec.append(h, ul);
    groupsEl.append(sec);
    return ul;
  }

  function makeCard(el: HTMLElement, label: string) {
    const { name, tag } = cardText(label);
    el.className = "gal-card";
    el.dataset.label = label;
    // The name is the label exactly; from the text, the flex-item spans would read "Studio ( 1BR )".
    el.setAttribute("aria-label", label);
    el.tabIndex = -1;
    const thumb = document.createElement("span");
    thumb.className = "gal-thumb gal-thumb-none";
    thumb.setAttribute("aria-hidden", "true");
    const n = document.createElement("span");
    n.className = "gal-name";
    n.textContent = name;
    el.append(thumb, n);
    if (tag) {
      // The tag reads as part of the label, "Clinic (place ×6)": hidden " (" and ")" around it.
      const t = document.createElement("span");
      t.className = "gal-tag";
      const open = document.createElement("span");
      open.className = "vh";
      open.textContent = tag.open;
      const close = document.createElement("span");
      close.className = "vh";
      close.textContent = tag.close;
      t.append(open, tag.text, close);
      el.append(t);
    }
    return el;
  }

  let lastLabel: string | null = null;
  let lastNeutral = "Edited plan";

  const gallery: Gallery = {
    setCurrent(label, neutral = "Edited plan") {
      lastLabel = label;
      lastNeutral = neutral;
      let found: HTMLElement | undefined;
      for (const c of cards()) {
        if (label !== null && c.dataset.label === label) {
          c.setAttribute("aria-current", "true");
          found = c;
        } else c.removeAttribute("aria-current");
      }
      const text =
        label === null ? neutral : (found?.querySelector(".gal-name")?.textContent ?? splitLabel(label).name);
      nameEl.textContent = text;
      trigger.title = label === null ? "Choose a plan" : `${label}: choose another plan`;
      rove();
    },
    addSamples(group, labels) {
      if (groupsEl.querySelector(".gal-group[data-sample]")) return;
      const ul = makeGroup(group, true);
      for (const label of labels) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        li.append(makeCard(b, label));
        ul.append(li);
      }
      gallery.setCurrent(lastLabel, lastNeutral);
    },
    ensureExamples(groups) {
      if (groupsEl.querySelector(`a${CARD}`)) return;
      for (const { group, items } of groups) {
        const ul = makeGroup(group, false);
        for (const { label, name } of items) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `/examples/${name}.html`;
          li.append(makeCard(a, label));
          ul.append(li);
        }
      }
      gallery.setCurrent(lastLabel, lastNeutral);
    },
    close: () => close(),
  };
  rove();
  return gallery;
}
