/**
 * Saved snapshots — a lightweight, vanilla "history" for the playground.
 *
 * The current source is kept named in localStorage (FIFO-capped) so you can
 * stash a working plan, keep editing, and restore it later. Pure DOM; no
 * framework. The live-editing autosave (last source) is handled separately in
 * main.js — this module is only the explicit, named saves.
 *
 * Nothing here asks a question: a save is named for the plan and the time (`snapshotName`), and a
 * delete or a restore says so in the stage notice with an Undo (`notify`), rather than a prompt
 * before it.
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
  /** The plan's name as the gallery trigger shows it ("" when it has none). */
  getName?: () => string;
  /** Say what was done, with a way back (the stage notice). */
  notify?: (msg: string, undo: () => void) => void;
}

/** A snapshot's name: the plan's (or "Plan") and the local time it was saved, `Laneway House · 14:32`. */
export function snapshotName(plan: string, at: Date): string {
  const hm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${plan.trim() || "Plan"} · ${hm}`;
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

/** What the page can ask of the mounted popover. */
export interface SnapshotsHandle {
  /** Hide the popover (a no-op when it is hidden). */
  close(): void;
}

export function mountSnapshots({ button, getSource, setSource, getName, notify }: SnapshotsOpts): SnapshotsHandle {
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
    const ts = Date.now();
    snaps.unshift({ name: snapshotName(getName?.() ?? "", new Date(ts)), src, ts });
    if (snaps.length > MAX_SNAPSHOTS) snaps.length = MAX_SNAPSHOTS;
    persist();
    renderList();
  }

  function restore(i: number) {
    const s = snaps[i];
    close();
    if (!s) return;
    const before = getSource();
    setSource(s.src);
    if (before !== s.src) notify?.(`Restored “${s.name}”`, () => setSource(before));
  }

  function remove(i: number) {
    const [gone] = snaps.splice(i, 1);
    persist();
    renderList();
    if (!gone) return;
    notify?.(`Deleted “${gone.name}”`, () => {
      // Back where it was (the list may have changed meanwhile: at most at its end).
      snaps.splice(Math.min(i, snaps.length), 0, gone);
      if (snaps.length > MAX_SNAPSHOTS) snaps.length = MAX_SNAPSHOTS;
      persist();
      if (!pop.hidden) renderList();
    });
  }

  function renderList() {
    const rows = snaps.length
      ? snaps
          .map(
            (s, i) =>
              `<li class="snap-row"><button class="snap-restore" data-i="${i}" type="button" title="Restore"><span class="snap-name">${esc(
                s.name,
              )}</span><span class="snap-time">${esc(relTime(s.ts))}</span></button><button class="snap-del" data-i="${i}" type="button" aria-label="Delete “${esc(s.name)}”">Delete</button></li>`,
          )
          .join("")
      : `<li class="snap-empty">No saved plans yet. Save current keeps this plan in this browser only.</li>`;
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

  return {
    close: () => {
      if (!pop.hidden) close();
    },
  };
}
