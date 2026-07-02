/**
 * Saved snapshots — a lightweight, vanilla "history" for the playground.
 *
 * The current source is kept named in localStorage (FIFO-capped) so you can
 * stash a working plan, keep editing, and restore it later. Pure DOM; no
 * framework. The live-editing autosave (last source) is handled separately in
 * main.js — this module is only the explicit, named saves.
 */
import { KEYS, readJSON, writeJSON } from "./storage.js";

const MAX_SNAPSHOTS = 20;

interface Snapshot {
  name: string;
  src: string;
  ts: number;
}

interface SnapshotsOpts {
  /** the "Saved ▾" trigger in the header */
  button: HTMLButtonElement;
  /** read the current editor content */
  getSource: () => string;
  /** load content into the editor + render */
  setSource: (src: string) => void;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ENTITIES[c] ?? c);

function relTime(ts: number): string {
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function mountSnapshots({ button, getSource, setSource }: SnapshotsOpts): void {
  let snaps: Snapshot[] = readJSON<Snapshot[]>(KEYS.snapshots, []);
  if (!Array.isArray(snaps)) snaps = [];

  const pop = document.createElement("div");
  pop.className = "snap-pop";
  pop.hidden = true;
  document.body.appendChild(pop);

  const persist = () => writeJSON(KEYS.snapshots, snaps);

  function save() {
    const src = getSource();
    if (!src.trim()) return;
    const suggested = `plan ${snaps.length + 1}`;
    const name = (window.prompt("Name this snapshot:", suggested) || suggested).trim();
    snaps.unshift({ name, src, ts: Date.now() });
    if (snaps.length > MAX_SNAPSHOTS) snaps.length = MAX_SNAPSHOTS;
    persist();
    renderList();
  }

  function restore(i: number) {
    const s = snaps[i];
    if (s) setSource(s.src);
    close();
  }

  function remove(i: number) {
    snaps.splice(i, 1);
    persist();
    renderList();
  }

  function renderList() {
    const rows = snaps.length
      ? snaps
          .map(
            (s, i) =>
              `<li class="snap-row"><button class="snap-restore" data-i="${i}" type="button" title="Restore"><span class="snap-name">${esc(
                s.name,
              )}</span><span class="snap-time">${esc(relTime(s.ts))}</span></button><button class="snap-del" data-i="${i}" type="button" title="Delete" aria-label="Delete snapshot">✕</button></li>`,
          )
          .join("")
      : `<li class="snap-empty">No saved snapshots yet.</li>`;
    pop.innerHTML =
      `<div class="snap-head"><strong>Saved snapshots</strong><button class="snap-save" type="button">+ Save current</button></div>` +
      `<ul class="snap-list">${rows}</ul>`;
  }

  function position() {
    const r = button.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    // Right-align the popover to the button, clamped to the viewport.
    const right = Math.max(8, Math.round(window.innerWidth - r.right));
    pop.style.right = `${right}px`;
  }

  function open() {
    renderList();
    position();
    pop.hidden = false;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey);
  }
  function close() {
    pop.hidden = true;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey);
  }
  const onOutside = (e: PointerEvent) => {
    if (!pop.contains(e.target as Node | null) && e.target !== button) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  button.addEventListener("click", () => (pop.hidden ? open() : close()));
  window.addEventListener("resize", () => {
    if (!pop.hidden) position();
  });

  pop.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    const save = target?.closest(".snap-save");
    if (save) return void saveAndKeepOpen();
    const del = target?.closest<HTMLElement>(".snap-del");
    if (del) return void remove(Number(del.dataset.i));
    const res = target?.closest<HTMLElement>(".snap-restore");
    if (res) return void restore(Number(res.dataset.i));
  });

  function saveAndKeepOpen() {
    save();
  }
}
