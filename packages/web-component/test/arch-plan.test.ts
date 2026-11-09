/**
 * `<arch-plan>` in a real DOM (jsdom): the element, not a stand-in, upgraded by
 * `customElements`, rendering into its shadow root. The core it imports is the repo's
 * SOURCE (vitest.config.ts aliases `@chanmeng666/archlang`), so this needs no build. Its
 * `compile` is wrapped to COUNT calls per source, which is how the upgrade and stale-render
 * cases tell one render from several.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArchPlanElement, ArchPlanRenderDetail } from "../src/arch-plan.js";

const compiles = vi.hoisted(() => new Map<string, number>());
vi.mock("@chanmeng666/archlang", async (importOriginal) => {
  const core = await importOriginal<typeof import("@chanmeng666/archlang")>();
  const compile: typeof core.compile = (source, opts) => {
    compiles.set(source, (compiles.get(source) ?? 0) + 1);
    return core.compile(source, opts);
  };
  return { ...core, compile };
});

const STUDIO = readFileSync(new URL("../../../examples/studio.arch", import.meta.url), "utf8");
const TWO_STOREY = readFileSync(new URL("../../../examples/two-storey.arch", import.meta.url), "utf8");
const BROKEN = 'plan "Broken" {\n  room id=r at (0,0) size\n}\n';
const UPGRADE_SRC = "https://example.test/upgrade.arch";
const UPGRADE_INLINE = `${STUDIO}# upgraded inline\n`;

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/" });
const GLOBALS = [
  "window",
  "document",
  "HTMLElement",
  "customElements",
  "MutationObserver",
  "CustomEvent",
  "Node",
  "DOMParser",
];
const saved = new Map<string, unknown>();
const fetchMock = vi.fn<(input: string) => Promise<Response>>();
/** Fetches and compiles seen while the page's pre-existing elements upgraded. */
const upgrade = { fetches: 0, compilesSrc: 0, compilesInline: 0, svgs: [] as boolean[] };

beforeAll(async () => {
  for (const name of GLOBALS) {
    saved.set(name, (globalThis as Record<string, unknown>)[name]);
    (globalThis as Record<string, unknown>)[name] = (dom.window as unknown as Record<string, unknown>)[name];
  }
  // Anything not answered by a once-value: the upgrade case's plan, else a 404.
  fetchMock.mockImplementation(async (url) =>
    url === UPGRADE_SRC ? new Response(TWO_STOREY) : new Response("", { status: 404 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  // Warm the module graph: the element imports the core lazily on its first render, and a cold
  // transform of the whole compiler would otherwise be charged to whichever case runs first.
  await import("@chanmeng666/archlang");
  compiles.clear();

  // THE DOCUMENTED USAGE: markup first, the module after it, so `define` UPGRADES elements that
  // already carry their attributes (one attributeChangedCallback each, then connectedCallback).
  const doc = dom.window.document;
  doc.body.innerHTML =
    `<arch-plan id="up-src" src="${UPGRADE_SRC}" level="2" theme="blueprint"></arch-plan>` +
    `<arch-plan id="up-inline" theme="blueprint"></arch-plan>`;
  doc.getElementById("up-inline")!.textContent = `\n${UPGRADE_INLINE}`;
  await import("../src/arch-plan.js"); // defines <arch-plan> on the jsdom window, upgrading both
  const upgraded = ["up-src", "up-inline"].map((id) => doc.getElementById(id) as ArchPlanElement);
  await Promise.all(upgraded.map((el) => el.updateComplete));
  upgrade.fetches = fetchMock.mock.calls.filter(([url]) => url === UPGRADE_SRC).length;
  upgrade.compilesSrc = compiles.get(TWO_STOREY) ?? 0;
  upgrade.compilesInline = compiles.get(UPGRADE_INLINE) ?? 0;
  upgrade.svgs = upgraded.map((el) => el.shadowRoot!.querySelector(".plan > svg") !== null);
  doc.body.replaceChildren();
}, 120_000);

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of saved) (globalThis as Record<string, unknown>)[name] = value;
  dom.window.close();
});

/** Mount an element, wait for its render, and return its shadow root. */
async function mount(setup: (el: ArchPlanElement) => void): Promise<{ el: ArchPlanElement; root: ShadowRoot }> {
  const el = dom.window.document.createElement("arch-plan") as ArchPlanElement;
  setup(el);
  dom.window.document.body.append(el);
  await el.updateComplete;
  return { el, root: el.shadowRoot! };
}

describe("<arch-plan>", () => {
  it("is a defined custom element with an open shadow root", () => {
    expect(dom.window.customElements.get("arch-plan")).toBeTypeOf("function");
    expect(dom.window.document.createElement("arch-plan").shadowRoot).not.toBeNull();
  });

  it("renders ONCE on upgrade: one fetch and one compile, however many attributes it carries", () => {
    expect(upgrade.svgs).toEqual([true, true]);
    expect(upgrade.fetches, "fetches of src while upgrading").toBe(1);
    expect(upgrade.compilesSrc, "compiles of the fetched plan").toBe(1);
    expect(upgrade.compilesInline, "compiles of the inline plan").toBe(1);
  });

  it("renders examples/studio.arch, given inline, as an <svg> in its shadow root", async () => {
    const { root } = await mount((el) => {
      el.textContent = STUDIO;
    });
    expect(root.querySelector("pre")).toBeNull();
    const svg = root.querySelector(".plan > svg");
    expect(svg).not.toBeNull();
    expect(root.innerHTML).toContain("<svg");
    // Accessible output: the plan's own name as the drawing's <title>.
    expect(svg!.querySelector("title")?.textContent).toBe("Studio 1BR");
  });

  it("fetches `src` and renders it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(STUDIO, { status: 200 }));
    const { root } = await mount((el) => el.setAttribute("src", "https://example.test/studio.arch"));
    expect(fetchMock).toHaveBeenLastCalledWith("https://example.test/studio.arch");
    expect(root.querySelector(".plan > svg")).not.toBeNull();
  });

  it("renders a broken plan as a <pre> with E_PARSE and line:col, and never throws", async () => {
    const events: ArchPlanRenderDetail[] = [];
    const { root } = await mount((el) => {
      el.addEventListener("render", (e) => events.push((e as CustomEvent<ArchPlanRenderDetail>).detail));
      el.textContent = BROKEN;
    });
    expect(root.querySelector("svg")).toBeNull();
    expect(root.querySelector("pre")?.textContent).toBe('E_PARSE 3:1 Expected a value but found "}"');
    expect(events.at(-1)?.ok).toBe(false);
  });

  it("counts lines from the plan, not from the opening tag (blank lines and a script wrapper)", async () => {
    for (const markup of [`\n\n${BROKEN}`, `\n  <script type="text/plain">\n${BROKEN}  </script>\n`]) {
      const { root } = await mount((el) => {
        el.innerHTML = markup;
      });
      expect(root.querySelector("pre")?.textContent, JSON.stringify(markup)).toBe(
        'E_PARSE 3:1 Expected a value but found "}"',
      );
    }
  });

  it("reports a failed fetch in the <pre>", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const { root } = await mount((el) => el.setAttribute("src", "https://example.test/missing.arch"));
    expect(root.querySelector("pre")?.textContent).toBe(
      "arch-plan: could not fetch https://example.test/missing.arch (HTTP 404)",
    );
  });

  it("draws the lowest storey when `level` is absent", async () => {
    const { el, root } = await mount((e) => {
      e.textContent = TWO_STOREY;
    });
    const unset = root.querySelector(".plan")!.innerHTML;
    el.setAttribute("level", "1");
    await el.updateComplete;
    expect(root.querySelector(".plan")!.innerHTML).toBe(unset);
  });

  it("re-renders when an attribute changes: `level` picks a storey, an absent one is reported", async () => {
    const { el, root } = await mount((e) => {
      e.textContent = TWO_STOREY;
    });
    const first = root.querySelector(".plan")!.innerHTML;
    el.setAttribute("level", "2");
    await el.updateComplete;
    const second = root.querySelector(".plan")!.innerHTML;
    expect(second).toContain("<svg");
    expect(second).not.toBe(first);
    el.setAttribute("level", "9");
    await el.updateComplete;
    expect(root.querySelector("pre")?.textContent).toBe(
      'arch-plan: level="9" is not a storey of this plan (its levels are 1, 2)',
    );
  });

  it("`theme` selects a built-in theme; an unknown name is reported", async () => {
    const { el, root } = await mount((e) => {
      e.textContent = STUDIO;
    });
    const plain = root.querySelector(".plan")!.innerHTML;
    el.setAttribute("theme", "blueprint");
    await el.updateComplete;
    expect(root.querySelector(".plan")!.innerHTML).toContain("#0b3d6b");
    expect(root.querySelector(".plan")!.innerHTML).not.toBe(plain);
    el.setAttribute("theme", "nope");
    await el.updateComplete;
    expect(root.querySelector("pre")?.textContent).toMatch(/^arch-plan: unknown theme "nope" \(known: .*blueprint/);
  });

  it("re-renders when its inline text changes", async () => {
    const { el, root } = await mount((e) => {
      e.textContent = BROKEN;
    });
    expect(root.querySelector("pre")).not.toBeNull();
    el.textContent = STUDIO;
    await vi.waitFor(() => expect(root.querySelector(".plan > svg")).not.toBeNull());
  });

  it("an inline render overtaken while the compiler import settles is not compiled", async () => {
    const PLAN = `${TWO_STOREY}# overtaken at the core import\n`;
    const el = dom.window.document.createElement("arch-plan") as ArchPlanElement;
    el.textContent = PLAN;
    dom.window.document.body.append(el);
    await Promise.resolve(); // the first render has begun and is awaiting the (cached) core
    el.setAttribute("level", "2"); // a newer render, requested before the first one compiles
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".plan > svg")).not.toBeNull();
    expect(compiles.get(PLAN), "the overtaken render compiled too").toBe(1);
  });

  it("removed before its render starts: nothing is fetched", async () => {
    fetchMock.mockClear();
    const el = dom.window.document.createElement("arch-plan") as ArchPlanElement;
    el.setAttribute("src", "https://example.test/never.arch");
    dom.window.document.body.append(el);
    el.remove(); // same task: the queued render finds the element gone
    await el.updateComplete;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removed while fetching: the late response writes nothing and fires no render", async () => {
    const LATE = `${STUDIO}# landed after removal\n`;
    let release: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const events: ArchPlanRenderDetail[] = [];
    const el = dom.window.document.createElement("arch-plan") as ArchPlanElement;
    el.addEventListener("render", (e) => events.push((e as CustomEvent<ArchPlanRenderDetail>).detail));
    el.setAttribute("src", "https://example.test/late.arch");
    dom.window.document.body.append(el);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    el.remove();
    release!(new Response(LATE));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".plan, pre")).toBeNull();
    expect(events).toEqual([]);
    expect(compiles.get(LATE) ?? 0).toBe(0);
  });

  it("drops a render a newer one overtook, without compiling the stale source", async () => {
    const SLOW = `${BROKEN}# slow\n`;
    let release: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce(new Response(STUDIO));
    const events: ArchPlanRenderDetail[] = [];
    const el = dom.window.document.createElement("arch-plan") as ArchPlanElement;
    el.addEventListener("render", (e) => events.push((e as CustomEvent<ArchPlanRenderDetail>).detail));
    el.setAttribute("src", "https://example.test/slow.arch");
    dom.window.document.body.append(el);
    await vi.waitFor(() => expect(release).toBeTypeOf("function")); // the slow fetch is in flight
    el.setAttribute("src", "https://example.test/fast.arch");
    await el.updateComplete;
    const root = el.shadowRoot!;
    expect(root.querySelector(".plan > svg title")?.textContent).toBe("Studio 1BR");
    release!(new Response(SLOW)); // the overtaken fetch lands last
    await new Promise((r) => setTimeout(r, 20));
    expect(root.querySelector("pre"), "the stale result was written over the newer one").toBeNull();
    expect(root.querySelector(".plan > svg title")?.textContent).toBe("Studio 1BR");
    expect(compiles.get(SLOW) ?? 0, "the stale source was compiled").toBe(0);
    expect(events.map((d) => d.ok)).toEqual([true]);
  });
});
