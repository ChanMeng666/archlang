/**
 * Node-environment test doubles for the playground's browser dependencies.
 * jsdom is intentionally not installed, so we stub only the tiny slice of the
 * localStorage / DOM APIs the pure-logic modules actually touch. `any` is used
 * freely — these doubles deliberately implement a partial surface.
 */

/** Install a plain in-memory `localStorage` on globalThis. Returns the backing map. */
export function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  return store;
}

/** A minimal DOM element double supporting only what mountSnapshots reaches for. */
export class FakeEl {
  hidden = false;
  className = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  innerHTML = "";
  private listeners = new Map<string, Array<(e: any) => void>>();

  appendChild(child: FakeEl): FakeEl {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, fn: (e: any) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: (e: any) => void): void {
    const list = this.listeners.get(type);
    if (list)
      this.listeners.set(
        type,
        list.filter((f) => f !== fn),
      );
  }
  getBoundingClientRect() {
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  }
  contains(): boolean {
    return false;
  }
  querySelector(): null {
    return null;
  }
  setAttribute(): void {}

  /** Test-only: fire the registered handlers for `type`. */
  dispatch(type: string, event: any): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

export interface DomStub {
  body: FakeEl;
  /** The most recently appended child of <body> (mountSnapshots' popover). */
  lastAppended(): FakeEl;
  /** Configure what window.prompt returns for the next save. */
  setPrompt(fn: () => string | null): void;
}

/** Install stub `document` / `window` globals plus localStorage. */
export function installDom(): DomStub {
  installLocalStorage();
  const body = new FakeEl();
  let promptFn: () => string | null = () => "Snapshot";

  (globalThis as any).document = {
    createElement: () => new FakeEl(),
    body,
    addEventListener() {},
    removeEventListener() {},
  };
  (globalThis as any).window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1000,
    prompt: () => promptFn(),
  };

  return {
    body,
    lastAppended: () => body.children[body.children.length - 1]!,
    setPrompt: (fn) => {
      promptFn = fn;
    },
  };
}

/** An event whose `target.closest(sel)` matches exactly the given selectors. */
export function clickOn(matches: Record<string, { dataset?: Record<string, string> } | Record<string, never>>): {
  target: { closest: (sel: string) => unknown };
} {
  return {
    target: {
      closest: (sel: string) => matches[sel] ?? null,
    },
  };
}
