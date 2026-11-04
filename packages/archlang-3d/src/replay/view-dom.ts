/**
 * The free camera's buttons (card CR4), browser-only DOM shared by both hosts of the replay: the
 * single-file replay HTML (`viewer.ts`) and the playground's 3D preview tab. The presets and Reset
 * (`ViewControl`), the storeys shown, and a line saying how to move the view. Nothing here draws into
 * the canvas.
 */
import type { PresetName } from "./camera.js";
import type { ViewControl } from "./mount.js";

/** Each preset's button text and its accessible name. */
export const PRESET_LABELS: ReadonlyArray<readonly [PresetName, string, string]> = [
  ["iso", "Iso", "Iso view: the replay's end view"],
  ["top", "Top", "Top view, the plan's top edge up"],
  ["north", "N", "North elevation: from the plan's top edge"],
  ["east", "E", "East elevation: from the plan's right edge"],
  ["south", "S", "South elevation: from the plan's bottom edge"],
  ["west", "W", "West elevation: from the plan's left edge"],
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
}

/** The toolbar for `view`: preset buttons, Reset, the storeys (more than one), the hint. */
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

  for (const [name, text, label] of PRESET_LABELS) {
    const b = button(text, label, () => view.preset(name));
    b.dataset.preset = name;
    presetButtons.push([name, b]);
    bar.append(b);
  }
  bar.append(button("Reset", "Reset the view: the replay's own camera, every storey shown", () => view.reset()));

  if (view.storeys > 1) {
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
