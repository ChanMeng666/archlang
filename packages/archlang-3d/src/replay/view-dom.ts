/**
 * The free camera's buttons (card CR4), browser-only DOM shared by both hosts of the replay: the
 * single-file replay HTML (`viewer.ts`) and the playground's 3D preview tab. The presets and Reset
 * (`ViewControl`), the storeys shown, and a line saying how to move the view. Nothing here draws into
 * the canvas.
 */
import type { PresetName } from "./camera.js";
import type { ViewControl } from "./mount.js";

/**
 * Each preset's button text and its accessible name. The side views are "View from north" and so
 * on, never "elevation": the 3D preview draws no elevations (the PS-D12 limits line).
 */
export const PRESET_LABELS: ReadonlyArray<readonly [PresetName, string, string]> = [
  ["iso", "Iso", "Iso view: the replay's end view"],
  ["top", "Top", "Top view, the plan's top edge up"],
  ["north", "N", "View from north: level, from the plan's top edge"],
  ["east", "E", "View from east: level, from the plan's right edge"],
  ["south", "S", "View from south: level, from the plan's bottom edge"],
  ["west", "W", "View from west: level, from the plan's left edge"],
];

export const VIEW_HINT =
  "Drag to turn, right-drag to pan, scroll to zoom; on the focused view, arrow keys turn and + / − zoom.";

/**
 * What an interactive replay canvas says it is, after its title (it is `role="application"`: it
 * takes keys, so it is not an image).
 */
export const VIEW_CONTROLS_LABEL =
  "an interactive 3D view: drag or use the arrow keys to turn it, scroll or + and − to zoom";

export interface ToolbarOptions {
  /** A class for every button (the host's own button style). */
  buttonClass?: string;
  /** An id for the hint line, so the canvas can point at it (`aria-describedby`). */
  hintId?: string;
  /**
   * The compact form, for a host that lays the toolbar over its canvas (playground card PG1): Reset
   * first ("⟲ Reset"), then a "View ▾" button whose popover holds the preset buttons, then the
   * storeys and the hint. Every button keeps its text, accessible name, `data-*` and `aria-pressed`;
   * only where the presets sit changes. Off by default: the row the replay HTML shows.
   */
  compact?: boolean;
  /**
   * The "Storeys shown" cut-away buttons (a plan of more than one storey). On by default: the row
   * the replay HTML shows. `false` leaves them out, for a host with its own storey control that
   * already chooses which storeys the view shows (the playground's storey switcher, card PG5b), so
   * the page has one storey control, not two. `view.showStoreys` is unchanged either way.
   */
  storeys?: boolean;
}

/** The toolbar for `view`: preset buttons, Reset, the storeys (more than one, unless `storeys: false`), the hint. */
export function viewToolbar(view: ViewControl, opts: ToolbarOptions = {}): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "archlang-views";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "3D view");
  const button = (text: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    if (opts.buttonClass) b.className = opts.buttonClass;
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  };
  const presetButtons: Array<[PresetName, HTMLButtonElement]> = [];
  const storeyButtons: HTMLButtonElement[] = [];
  /** `aria-pressed` follows the view: the preset holding the camera (none for the replay's or a drag's), the storeys shown. */
  const press = (): void => {
    for (const [name, b] of presetButtons) b.setAttribute("aria-pressed", String(view.camera === name));
    for (const [i, b] of storeyButtons.entries()) b.setAttribute("aria-pressed", String(i + 1 === view.shown));
  };

  /** In the compact form: shut the presets' popover (and give the focus back to its button). */
  let shut = (_refocus: boolean): void => {};
  for (const [name, text, label] of PRESET_LABELS) {
    const b = button(text, label, () => {
      view.preset(name);
      shut(true);
    });
    b.dataset.preset = name;
    presetButtons.push([name, b]);
  }
  const resetLabel = "Reset the view: the replay's own camera, every storey shown";
  if (opts.compact) {
    bar.classList.add("archlang-views-compact");
    bar.append(button("⟲ Reset", resetLabel, () => view.reset()));
    const wrap = document.createElement("span");
    wrap.className = "archlang-views-menu";
    const pop = document.createElement("span");
    pop.className = "archlang-views-presets";
    pop.id = `${opts.hintId ?? "archlang-views"}-presets`;
    pop.setAttribute("role", "group");
    pop.setAttribute("aria-label", "Preset views");
    pop.hidden = true;
    pop.append(...presetButtons.map(([, b]) => b));
    const toggle = button("View ▾", "View presets: iso, top, and from north, east, south and west", () =>
      pop.hidden ? open() : shut(false),
    );
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", pop.id);
    // A press anywhere outside, or the focus leaving, shuts it; Escape shuts it and refocuses.
    const away = (e: Event): void => {
      if (!wrap.contains(e.target as Node)) shut(false);
    };
    const open = (): void => {
      pop.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", away, true);
      (presetButtons.find(([n]) => view.camera === n)?.[1] ?? presetButtons[0]?.[1])?.focus();
    };
    shut = (refocus) => {
      if (pop.hidden) return;
      pop.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", away, true);
      if (refocus) toggle.focus();
    };
    wrap.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || pop.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      shut(true);
    });
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget as Node | null)) shut(false);
    });
    wrap.append(toggle, pop);
    bar.append(wrap);
  } else {
    bar.append(...presetButtons.map(([, b]) => b));
    bar.append(button("Reset", resetLabel, () => view.reset()));
  }

  if (view.storeys > 1 && opts.storeys !== false) {
    const group = document.createElement("span");
    group.className = "archlang-views-storeys";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Storeys shown");
    group.append("Storeys ");
    for (let k = 1; k <= view.storeys; k++) {
      const all = k === view.storeys;
      const b = button(
        all ? "All" : k === 1 ? "1" : `1–${k}`,
        all ? "Show every storey" : `Show storeys 1 to ${k}, hide the ones above`,
        () => view.showStoreys(k),
      );
      b.dataset.storeys = String(k);
      storeyButtons.push(b);
      group.append(b);
    }
    bar.append(group);
  }
  // The view tells the toolbar (a drag, a seek, a restore after an edit); the mount drops its
  // listeners when it is disposed.
  view.onChange(press);
  press();

  const hint = document.createElement("span");
  hint.className = "archlang-views-hint";
  if (opts.hintId) hint.id = opts.hintId;
  hint.textContent = VIEW_HINT;
  bar.append(hint);
  return bar;
}
