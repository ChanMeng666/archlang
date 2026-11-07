/**
 * The knobs panel's verdicts arrive later (card MP8: a knob's compile runs in the worker). These
 * drive the panel with a stubbed `tryRender` whose verdicts the test settles in any order, the
 * way main.ts settles them: a drawing that lands is synced to the panel before its verdict.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe as suite, expect, it, vi } from "vitest";
import { compile } from "../../src/index.js";
import { type KnobsPanel, mountKnobsPanel } from "../src/knobs-panel.js";

/** Just the DOM surface the panel touches. */
class El {
  children: El[] = [];
  dataset: Record<string, string> = {};
  value = "";
  hidden = false;
  disabled = false;
  open = false;
  textContent = "";
  private listeners = new Map<string, (() => void)[]>();
  classList = { toggle: () => {} };
  append(...els: El[]) {
    this.children.push(...els);
  }
  appendChild(el: El) {
    this.children.push(el);
    return el;
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute() {}
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  dispatch(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  find(knob: string): El | undefined {
    if (this.dataset.knob === knob) return this;
    for (const c of this.children) {
      const hit = c.find(knob);
      if (hit) return hit;
    }
    return undefined;
  }
}

const flat = readFileSync(new URL("../../examples/knob-flat.arch", import.meta.url), "utf8").replace(/\r\n?/g, "\n");
const living = (v: number) => flat.replace("let LIVING = 4500", `let LIVING = ${v}`);
const planOf = (source: string) => compile(source, { noCache: true }).ast;
/** Let every settled verdict's handler run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

interface Harness {
  panel: KnobsPanel;
  slider: () => El;
  calls: { source: string; resolve: (ok: boolean | null) => void }[];
  commits: [string, boolean][];
  flashes: string[];
  /** Request `i`'s drawing lands (when `ok`) and its verdict is given. */
  land(i: number, ok: boolean): Promise<void>;
  /** Another request's drawing of `source` lands instead of request `i`'s. */
  overtaken(i: number, source: string): Promise<void>;
  move(v: number): void;
  release(v: number): void;
}

function harness(): Harness {
  const g = globalThis as Record<string, unknown>;
  g.document = { createElement: () => new El() };
  g.window = { matchMedia: () => ({ matches: false }) };
  const viewport = new El();
  // View mode: a kept source is the document at once (main.ts `keepKnob`).
  let doc = flat;
  const calls: Harness["calls"] = [];
  const commits: [string, boolean][] = [];
  const flashes: string[] = [];
  const panel = mountKnobsPanel({
    viewport: viewport as unknown as HTMLElement,
    getSource: () => doc,
    tryRender: (source) => new Promise((resolve) => calls.push({ source, resolve })),
    commit: (source, final) => {
      commits.push([source, final]);
      doc = source;
    },
    flash: (msg) => flashes.push(msg),
  });
  panel.sync(flat, planOf(flat));
  const slider = () => viewport.find("LIVING")!;
  return {
    panel,
    slider,
    calls,
    commits,
    flashes,
    async land(i, ok) {
      const c = calls[i]!;
      if (ok) panel.sync(c.source, planOf(c.source));
      c.resolve(ok);
      await flush();
    },
    async overtaken(i, source) {
      panel.sync(source, planOf(source));
      calls[i]!.resolve(null);
      await flush();
    },
    move(v) {
      slider().value = String(v);
      slider().dispatch("input");
      vi.advanceTimersByTime(200); // past the panel's drag debounce
    },
    release(v) {
      slider().value = String(v);
      slider().dispatch("change");
    },
  };
}

suite("knobs panel, with verdicts that arrive later", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    const g = globalThis as Record<string, unknown>;
    delete g.document;
    delete g.window;
  });

  it("keeps a released value whose compile another render of the same document overtook", async () => {
    const h = harness();
    h.release(6000);
    expect(h.calls.map((c) => c.source)).toEqual([living(6000)]);
    // A Checks render of the document lands first: the release is not decided by it.
    await h.overtaken(0, flat);
    expect(h.calls.map((c) => c.source)).toEqual([living(6000), living(6000)]);
    expect(h.slider().value).toBe("6000");
    await h.land(1, true);
    expect(h.commits).toEqual([[living(6000), true]]);
  });

  it("acts on the newest move's verdict only, and the release keeps the value let go on", async () => {
    const h = harness();
    h.move(5000);
    h.move(5500);
    h.release(5500);
    expect(h.calls.map((c) => c.source)).toEqual([living(5000), living(5500), living(5500)]);
    // The older verdicts arrive after the newer: no snap-back, nothing kept from them.
    await h.land(2, true);
    await h.land(0, false);
    await h.land(1, true);
    expect(h.commits).toEqual([[living(5500), true]]);
    expect(h.flashes).toEqual([]);
    expect(h.slider().value).toBe("5500");
  });

  it("snaps a value that does not compile back, and recompiles the last good source", async () => {
    const h = harness();
    h.release(6000);
    await h.land(0, false);
    expect(h.slider().value).toBe("4500");
    expect(h.calls.map((c) => c.source)).toEqual([living(6000), flat]);
    expect(h.commits).toEqual([[flat, true]]);
    expect(h.flashes).toHaveLength(1);
  });

  it("never keeps a verdict for a document that changed while it compiled", async () => {
    const h = harness();
    h.release(6000);
    const other = `${flat}\n# another plan`;
    // Another plan arrives (its own render drew it): the knob's verdict is not about it.
    await h.overtaken(0, other);
    expect(h.calls).toHaveLength(1);
    expect(h.commits).toEqual([]);
  });
});
