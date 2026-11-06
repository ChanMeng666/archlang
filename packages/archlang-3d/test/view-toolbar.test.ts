/**
 * The free camera's toolbar (`viewToolbar`, card CR4) and its compact form (playground card PG1,
 * `compact: true`), without a browser: a small stand-in for the few DOM calls the toolbar makes.
 * The default form is the row the single-file replay HTML shows, element for element as before the
 * compact form existed (presets, Reset, the storeys, the hint, in that order, with their names and
 * `data-*`); the compact form moves the presets into a `View ▾` popover and keeps every button's
 * text, accessible name, `data-*` and `aria-pressed`. The browser half (a real click on a real
 * page) is `e2e/free-camera.e2e.ts` and `playground/e2e/preview3d.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraHolder, PresetName, ViewControl } from "../src/replay/mount.js";
import { PRESET_LABELS, VIEW_HINT, viewToolbar } from "../src/replay/view-dom.js";

type Listener = (e: { type: string; key?: string; target?: unknown; relatedTarget?: unknown }) => void;

/** Just enough of an element for the toolbar: attributes, children, listeners, focus. */
class FakeElement {
  tagName: string;
  children: Array<FakeElement | string> = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  listeners = new Map<string, Listener[]>();
  parent: FakeElement | undefined;
  type = "";
  id = "";
  hidden = false;
  textContent = "";
  private classes = new Set<string>();
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get className(): string {
    return [...this.classes].join(" ");
  }
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  classList = {
    add: (c: string) => this.classes.add(c),
    contains: (c: string) => this.classes.has(c),
  };
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  append(...nodes: Array<FakeElement | string>): void {
    for (const n of nodes) {
      if (typeof n !== "string") n.parent = this;
      this.children.push(n);
    }
  }
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  contains(other: unknown): boolean {
    for (let n = other as FakeElement | undefined; n; n = n.parent) if (n === this) return true;
    return false;
  }
  focus(): void {
    focused = this;
  }
  /** Fire `type` here and up the parents (bubbling), as a click or a key does. */
  fire(type: string, init: { key?: string; relatedTarget?: unknown } = {}): void {
    const e = { type, target: this, ...init, preventDefault() {}, stopPropagation() {} };
    for (let n: FakeElement | undefined = this; n; n = n.parent) for (const fn of n.listeners.get(type) ?? []) fn(e);
  }
  click(): void {
    this.fire("click");
  }
  /** Every element under this one, depth first. */
  all(): FakeElement[] {
    return this.children.flatMap((c) => (typeof c === "string" ? [] : [c, ...c.all()]));
  }
}

let focused: FakeElement | undefined;
const docListeners = new Map<string, Listener[]>();

beforeEach(() => {
  focused = undefined;
  docListeners.clear();
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeElement(tag),
    addEventListener: (t: string, fn: Listener) => docListeners.set(t, [...(docListeners.get(t) ?? []), fn]),
    removeEventListener: (t: string, fn: Listener) =>
      docListeners.set(
        t,
        (docListeners.get(t) ?? []).filter((f) => f !== fn),
      ),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A view that records what the buttons ask of it. */
function fakeView(storeys: number): ViewControl & { calls: string[] } {
  const calls: string[] = [];
  const fns: Array<() => void> = [];
  let camera: CameraHolder = "replay";
  let shown = storeys;
  return {
    calls,
    at: () => {},
    preset: (n: PresetName) => {
      calls.push(`preset:${n}`);
      camera = n;
      for (const f of fns) f();
    },
    reset: () => {
      calls.push("reset");
      camera = "replay";
      for (const f of fns) f();
    },
    storeys,
    showStoreys: (k: number) => {
      calls.push(`storeys:${k}`);
      shown = k;
      for (const f of fns) f();
    },
    get shown() {
      return shown;
    },
    get camera() {
      return camera;
    },
    state: () => ({ camera: "replay", storeys: "all" }),
    restore: () => {},
    onChange: (fn) => {
      fns.push(fn);
      return () => {};
    },
    spin: () => {},
  };
}

/** One line per element: tag, class, text, accessible name, `data-*`, `aria-pressed`, hidden. */
function outline(el: FakeElement): string[] {
  return [el, ...el.all()].map((e) =>
    [
      e.tagName,
      e.className && `.${e.className}`,
      e.textContent && `"${e.textContent}"`,
      e.getAttribute("aria-label") && `[${e.getAttribute("aria-label")}]`,
      Object.entries(e.dataset)
        .map(([k, v]) => `data-${k}=${v}`)
        .join(" "),
      e.getAttribute("aria-pressed") && `pressed=${e.getAttribute("aria-pressed")}`,
      e.hidden ? "hidden" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

const RESET = "Reset the view: the replay's own camera, every storey shown";

describe("viewToolbar's default form (the replay HTML's row)", () => {
  it("is the row it was: presets, Reset, the storeys, the hint, in that order", () => {
    const bar = viewToolbar(fakeView(2), { buttonClass: "b", hintId: "h" }) as unknown as FakeElement;
    // Built from the presets' table, the one source of their words.
    const presets = PRESET_LABELS.map(
      ([n, text, label]) => `BUTTON .b "${text}" [${label}] data-preset=${n} pressed=false`,
    );
    expect(outline(bar)).toEqual([
      "DIV .archlang-views [3D view]",
      ...presets,
      `BUTTON .b "Reset" [${RESET}]`,
      "SPAN .archlang-views-storeys [Storeys shown]",
      'BUTTON .b "1" [Show storeys 1 to 1, hide the ones above] data-storeys=1 pressed=false',
      'BUTTON .b "All" [Show every storey] data-storeys=2 pressed=true',
      `SPAN .archlang-views-hint "${VIEW_HINT}"`,
    ]);
    expect(bar.getAttribute("role")).toBe("toolbar");
    expect(bar.all().find((e) => e.className === "archlang-views-hint")?.id).toBe("h");
    // `compact: false` is the default, exactly.
    const off = viewToolbar(fakeView(2), { buttonClass: "b", hintId: "h", compact: false }) as unknown as FakeElement;
    expect(outline(off)).toEqual(outline(bar));
    // …and so is `storeys: true` (playground card PG5b's option, on by default).
    const on = viewToolbar(fakeView(2), { buttonClass: "b", hintId: "h", storeys: true }) as unknown as FakeElement;
    expect(outline(on)).toEqual(outline(bar));
  });

  it("`storeys: false` leaves out only the Storeys shown group, in either form", () => {
    for (const compact of [false, true]) {
      const full = outline(
        viewToolbar(fakeView(3), { buttonClass: "b", hintId: "h", compact }) as unknown as FakeElement,
      );
      const view = fakeView(3);
      const bar = viewToolbar(view, {
        buttonClass: "b",
        hintId: "h",
        compact,
        storeys: false,
      }) as unknown as FakeElement;
      // The full outline minus the group's line and its three buttons' lines, nothing else.
      expect(outline(bar)).toEqual(full.filter((l) => !l.includes("Storeys shown") && !l.includes("data-storeys=")));
      expect(bar.all().some((e) => e.dataset.storeys !== undefined)).toBe(false);
      // The view's own cut-away still works: only the buttons are gone.
      view.showStoreys(1);
      expect(view.calls).toEqual(["storeys:1"]);
    }
  });

  it("a preset and Reset do what they did", () => {
    const view = fakeView(1);
    const bar = viewToolbar(view) as unknown as FakeElement;
    bar
      .all()
      .find((e) => e.dataset.preset === "top")
      ?.click();
    expect(view.calls).toEqual(["preset:top"]);
    expect(
      bar
        .all()
        .find((e) => e.dataset.preset === "top")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    bar
      .all()
      .find((e) => e.textContent === "Reset")
      ?.click();
    expect(view.calls).toEqual(["preset:top", "reset"]);
    // One storey: nothing to hide.
    expect(bar.all().some((e) => e.className === "archlang-views-storeys")).toBe(false);
  });
});

describe("viewToolbar's compact form (playground card PG1)", () => {
  const compact = (storeys: number) => {
    const view = fakeView(storeys);
    const bar = viewToolbar(view, { buttonClass: "b", hintId: "h", compact: true }) as unknown as FakeElement;
    const find = (p: (e: FakeElement) => boolean) => bar.all().find(p) as FakeElement;
    return {
      view,
      bar,
      toggle: find((e) => e.textContent === "View ▾"),
      pop: find((e) => e.className === "archlang-views-presets"),
      preset: (n: string) => find((e) => e.dataset.preset === n),
    };
  };

  it("keeps every button, moving the presets into a closed View ▾ popover after ⟲ Reset", () => {
    const { bar, toggle, pop } = compact(2);
    const presets = PRESET_LABELS.map(
      ([n, text, label]) => `BUTTON .b "${text}" [${label}] data-preset=${n} pressed=false`,
    );
    expect(outline(bar)).toEqual([
      "DIV .archlang-views archlang-views-compact [3D view]",
      `BUTTON .b "⟲ Reset" [${RESET}]`,
      "SPAN .archlang-views-menu",
      'BUTTON .b "View ▾" [View presets: iso, top, and from north, east, south and west]',
      "SPAN .archlang-views-presets [Preset views] hidden",
      ...presets,
      "SPAN .archlang-views-storeys [Storeys shown]",
      'BUTTON .b "1" [Show storeys 1 to 1, hide the ones above] data-storeys=1 pressed=false',
      'BUTTON .b "All" [Show every storey] data-storeys=2 pressed=true',
      `SPAN .archlang-views-hint "${VIEW_HINT}"`,
    ]);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-haspopup"), "a group, not a menu").toBeNull();
    expect(toggle.getAttribute("aria-controls")).toBe(pop.id);
    expect(pop.id).toBe("h-presets");
  });

  it("View ▾ opens the presets; a preset takes the view and shuts them; Escape and a press outside shut them", () => {
    const { view, toggle, pop, preset } = compact(1);
    toggle.click();
    expect(pop.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(focused, "the focus moves into the popover").toBe(preset("iso"));
    preset("north").click();
    expect(view.calls).toEqual(["preset:north"]);
    expect(pop.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(focused, "and comes back to View ▾").toBe(toggle);
    expect(preset("north").getAttribute("aria-pressed")).toBe("true");

    toggle.click();
    expect(focused, "the pressed preset takes the focus").toBe(preset("north"));
    preset("north").fire("keydown", { key: "Escape" });
    expect(pop.hidden).toBe(true);
    expect(focused).toBe(toggle);

    toggle.click();
    expect(docListeners.get("pointerdown")?.length).toBe(1);
    for (const fn of docListeners.get("pointerdown") ?? []) fn({ type: "pointerdown", target: {} });
    expect(pop.hidden, "a press outside shuts it").toBe(true);
    expect(docListeners.get("pointerdown")?.length, "and lets go of the page").toBe(0);

    toggle.click();
    toggle.click();
    expect(pop.hidden, "View ▾ again shuts it").toBe(true);
  });
});
