/**
 * The Knobs panel: one slider per knob of the plan on screen (knobs.ts), in the drawing's
 * lower-left corner (a bottom sheet on a phone). A native `<details>`, so it folds with a click or
 * the keyboard; each slider is a native `<input type=range>` with its own `<label>`.
 *
 * Moving a slider rewrites that one literal in the source and asks main.ts to compile the result
 * (`tryRender`, debounced while the slider moves, at once when it is let go). A plan that compiles
 * is kept (`commit`; the draft, the hash and, in edit mode, the editor take it on release). One that
 * does not keeps the last good drawing: the slider snaps back to the last value that compiled, and
 * that source is compiled again so the status and the facts are about the drawing on screen.
 *
 * A knob only ever rewrites the document it was read from. While the document is something else
 * (an edit that does not compile yet, or one the compile has not caught up with), the sliders are
 * disabled and say why, and a move that gets through anyway is refused, so a knob can never put
 * back a source the reader has since changed.
 *
 * The range of each slider is fixed when the plan arrives from anywhere but this panel (a new
 * plan, an edit, an undo), so dragging one end never stretches it; a plan the panel itself wrote
 * keeps the ranges it had.
 */
import type { PlanNode } from "archlang";
import { extractKnobs, type Knob, knobReadout, rewriteKnob } from "./knobs.js";

export interface KnobsPanel {
  /** The plan just compiled cleanly: show its knobs. */
  sync(source: string, plan: PlanNode | undefined): void;
  /** After any compile: enable the sliders only while the document is the one they were read from. */
  refresh(): void;
  /**
   * The panel itself, which the page moves between the drawing and the 3D preview (card X5): it
   * sits over whichever is on screen.
   */
  el: HTMLElement;
}

interface KnobsPanelOpts {
  /** Where the panel sits (the drawing's viewport). */
  viewport: HTMLElement;
  /** The document: the editor's text in edit mode, else the plan on screen. */
  getSource: () => string;
  /** Compile and show `source`; whether it compiled without errors. */
  tryRender: (source: string) => boolean;
  /** Keep `source`, which compiled; `final` when the slider was let go (or stepped by a key). */
  commit: (source: string, final: boolean) => void;
  /** A short status message. */
  flash: (msg: string) => void;
}

/** How long a moving slider waits before the plan is compiled again. */
const DRAG_DEBOUNCE_MS = 120;
/** What a disabled panel says. */
export const KNOBS_STALE_NOTE = "Fix the source to use knobs";

export function mountKnobsPanel({ viewport, getSource, tryRender, commit, flash }: KnobsPanelOpts): KnobsPanel {
  const panel = document.createElement("details");
  panel.className = "knobs";
  panel.hidden = true;
  // Open on a wide screen; folded to its heading on a phone, where it is a sheet over the plan.
  panel.open = !window.matchMedia("(max-width: 900px)").matches;
  const summary = document.createElement("summary");
  summary.className = "knobs-head";
  const note = document.createElement("p");
  note.className = "knobs-note";
  note.textContent = KNOBS_STALE_NOTE;
  note.hidden = true;
  const list = document.createElement("div");
  list.className = "knobs-list";
  panel.append(summary, note, list);
  viewport.appendChild(panel);

  /** The source the knobs below were read from (the last one that compiled). */
  let base = "";
  /**
   * The document as it stands under the knobs: `base`, except in edit mode while a slider is
   * moving, when the drawing runs ahead of the editor (which takes the result on release).
   */
  let docAtBase = "";
  /** The source this panel last wrote, so compiling it again does not reset the ranges. */
  let own: string | null = null;
  let knobs: Knob[] = [];
  const rows = new Map<string, { input: HTMLInputElement; out: HTMLOutputElement }>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Whether the document is the one the knobs were read from. */
  const current = (): boolean => {
    const doc = getSource();
    return doc === base || doc === docAtBase;
  };

  function build() {
    list.replaceChildren();
    rows.clear();
    summary.textContent = `Knobs (${knobs.length})`;
    for (const k of knobs) {
      const id = `knob-${k.name}`;
      const row = document.createElement("div");
      row.className = "knob";
      const label = document.createElement("label");
      label.htmlFor = id;
      label.className = "knob-label";
      label.title = k.label === k.name ? k.name : `${k.name}: ${k.label}`;
      const text = document.createElement("span");
      text.className = "knob-text";
      text.textContent = k.label;
      label.append(text);
      if (k.label !== k.name) {
        const name = document.createElement("code");
        name.className = "knob-name";
        name.textContent = k.name;
        label.append(name);
      }
      const input = document.createElement("input");
      input.type = "range";
      input.className = "knob-range";
      input.id = id;
      input.min = String(k.min);
      input.max = String(k.max);
      input.step = String(k.step);
      input.value = String(k.value);
      input.dataset.knob = k.name;
      const out = document.createElement("output");
      out.className = "knob-value";
      out.htmlFor = id;
      out.textContent = knobReadout(k, k.value);
      input.setAttribute("aria-valuetext", out.textContent);
      input.addEventListener("input", () => {
        show(k.name, Number(input.value));
        clearTimeout(timer);
        timer = setTimeout(() => apply(k.name, Number(input.value), false), DRAG_DEBOUNCE_MS);
      });
      input.addEventListener("change", () => {
        clearTimeout(timer);
        apply(k.name, Number(input.value), true);
      });
      row.append(label, input, out);
      list.append(row);
      rows.set(k.name, { input, out });
    }
    refresh();
  }

  /** Put `value` on knob `name`'s slider and readout. */
  function show(name: string, value: number) {
    const k = knobs.find((x) => x.name === name);
    const row = rows.get(name);
    if (!k || !row) return;
    row.input.value = String(value);
    row.out.textContent = knobReadout(k, value);
    row.input.setAttribute("aria-valuetext", row.out.textContent);
  }

  function refresh() {
    const usable = current();
    note.hidden = usable;
    panel.classList.toggle("knobs-stale", !usable);
    for (const { input } of rows.values()) input.disabled = !usable;
  }

  function apply(name: string, value: number, final: boolean) {
    const k = knobs.find((x) => x.name === name);
    if (!k) return;
    if (!current()) {
      // The document moved on since these knobs were read: never write over it.
      show(name, k.value);
      refresh();
      return;
    }
    if (value === k.value) {
      // Already compiled while it moved: letting go only has to keep it.
      if (final) keep(base, true);
      return;
    }
    const before = base;
    const candidate = rewriteKnob(before, k, value);
    own = candidate;
    if (tryRender(candidate)) {
      keep(candidate, final);
      return;
    }
    // It does not compile: back to the last value that did, and to the drawing it made, which a
    // release keeps (the slider may have passed good values on its way here).
    own = before;
    show(name, k.value);
    tryRender(before);
    if (final) keep(before, true);
    flash(`${name} = ${knobReadout(k, value)} does not compile; back to ${knobReadout(k, k.value)}`);
  }

  function keep(source: string, final: boolean) {
    commit(source, final);
    // Once kept, the document is that source (in view mode at once, in edit mode on release).
    if (final || getSource() === source) docAtBase = source;
  }

  return {
    el: panel,
    sync(source, plan) {
      const next = extractKnobs(source, plan);
      // A source the panel wrote comes back more than once (its own compile, then the editor's
      // or a theme switch's), and is the panel's every time; any other source is not.
      const mine = own !== null && source === own;
      base = source;
      if (!mine) {
        own = null;
        docAtBase = source;
      }
      const same = mine && next.length === knobs.length && next.every((k, i) => k.name === knobs[i]!.name);
      if (same) {
        // The panel's own rewrite: new spans and values, the ranges it started with.
        knobs = next.map((k, i) => ({ ...k, min: knobs[i]!.min, max: knobs[i]!.max, step: knobs[i]!.step }));
        refresh();
        return;
      }
      knobs = next;
      panel.hidden = knobs.length === 0;
      build();
    },
    refresh,
  };
}
