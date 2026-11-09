/**
 * `<arch-plan>`: compile an ArchLang plan in the browser and show the drawing.
 *
 *     <arch-plan src="/plans/studio.arch"></arch-plan>
 *     <arch-plan level="2" theme="blueprint">plan "Hut" { … }</arch-plan>
 *
 * The source is the `src` attribute's URL (fetched with `fetch`) or, without `src`, the
 * element's own text content (a `<script type="text/plain">` child keeps `<` and `&` literal).
 * The SVG goes into an open shadow root; a plan with errors renders a `<pre>` listing each one
 * as `CODE line:col message`. Nothing here throws: a failed fetch, an unknown `theme`, a missing
 * `level` or a core that will not load are all reported in that same `<pre>`. Changing an
 * attribute or the inline text re-renders, and a slow render that a newer one overtook is
 * dropped.
 *
 * The core is imported lazily, on the first render, from the bare specifier below. Each build
 * decides what that specifier becomes (`scripts/build.ts`): left bare for a bundler, rewritten
 * to the pinned jsDelivr `+esm` URL for the file the docs site serves, or inlined. This module
 * is the only place a custom element exists; the core itself never defines one.
 */
import type * as Core from "@chanmeng666/archlang";
import { sanitizeSvg } from "./svg-sanitize.js";

type CoreModule = typeof Core;

let corePromise: Promise<CoreModule> | undefined;

/** The compiler, imported once and shared by every element on the page. */
function loadCore(): Promise<CoreModule> {
  corePromise ??= import("@chanmeng666/archlang").catch((e: unknown) => {
    corePromise = undefined; // let a later render try again
    throw e;
  });
  return corePromise;
}

/** What one render produced: a drawing, or the lines of the `<pre>` that replaces it. */
export type ArchPlanResult = { ok: true; svg: string } | { ok: false; problems: string[] };

/** The `detail` of the `render` event an element dispatches after every completed render. */
export interface ArchPlanRenderDetail {
  ok: boolean;
  /** The `<pre>` lines when `ok` is false; empty otherwise. */
  problems: string[];
}

const STYLE = `:host{display:block;color-scheme:only light}
:host([hidden]){display:none}
.plan svg{display:block;max-width:100%;height:auto}
pre{margin:0;padding:12px 14px;background:#fff5f5;color:#7a1414;border:1px solid #e6b8b8;border-radius:4px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}`;

type RenderOptions = { level?: string | null; theme?: string | null };

/** `level` / `theme` / source → a drawing or the problems. Never throws. */
export async function renderPlan(source: string, opts: RenderOptions = {}): Promise<ArchPlanResult> {
  const core = await loadCoreOrProblem();
  return "compile" in core ? compileWith(core, source, opts) : core;
}

/** The compiler, or the problem that says why it would not load. */
async function loadCoreOrProblem(): Promise<CoreModule | ArchPlanResult> {
  try {
    return await loadCore();
  } catch (e) {
    return fail(`arch-plan: could not load the ArchLang compiler (${message(e)})`);
  }
}

/** The synchronous half of {@link renderPlan}, once the compiler is in hand. */
function compileWith(core: CoreModule, source: string, opts: RenderOptions): ArchPlanResult {
  try {
    let theme: Partial<Core.Theme> | undefined;
    if (opts.theme) {
      theme = Object.hasOwn(core.THEMES, opts.theme) ? core.THEMES[opts.theme] : undefined;
      if (!theme) {
        return fail(`arch-plan: unknown theme "${opts.theme}" (known: ${Object.keys(core.THEMES).join(", ")})`);
      }
    }
    const result = core.compile(source, theme ? { accessible: true, theme } : { accessible: true });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      return fail(
        ...errors.map((d) => {
          const j = core.diagnosticToJson(source, d);
          const at = j.line !== undefined ? ` ${j.line}:${j.col}` : "";
          return `${j.code ?? "error"}${at} ${j.message}`;
        }),
      );
    }
    if (opts.level === null || opts.level === undefined) return { ok: true, svg: result.svg };
    const levels = (result.pages ?? []).map((p) => p.level);
    const page = result.pages?.find((p) => String(p.level) === opts.level!.trim());
    if (!page) {
      const has = levels.length > 0 ? `its levels are ${levels.join(", ")}` : "it declares no levels";
      return fail(`arch-plan: level="${opts.level}" is not a storey of this plan (${has})`);
    }
    return { ok: true, svg: page.svg };
  } catch (e) {
    return fail(`arch-plan: ${message(e)}`);
  }
}

function fail(...problems: string[]): ArchPlanResult {
  return { ok: false, problems };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Importing this module outside a browser (SSR, a Node test before it installs a DOM) must not
// throw: there is no `HTMLElement` to extend there, so the class extends an empty stand-in and
// is simply never defined as an element.
const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export class ArchPlanElement extends Base {
  static get observedAttributes(): string[] {
    return ["src", "level", "theme"];
  }

  #root: ShadowRoot;
  #observer: MutationObserver | undefined;
  #run = 0;
  #queued = false;
  #done: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  /** Settles when the most recently requested render has been written to the shadow root. */
  get updateComplete(): Promise<void> {
    return this.#done;
  }

  connectedCallback(): void {
    if (!this.#observer && typeof MutationObserver !== "undefined") {
      // Inline source can arrive after the element is upgraded (the parser is still
      // streaming it in) or be edited later; either way, render what is there now.
      this.#observer = new MutationObserver(() => {
        if (!this.hasAttribute("src")) this.#schedule();
      });
    }
    this.#observer?.observe(this, { childList: true, characterData: true, subtree: true });
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    // Retire any render in flight: a fetch that lands after removal writes nothing and fires no
    // `render` event. Reconnecting schedules a fresh render.
    ++this.#run;
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null): void {
    if (previous !== next && this.isConnected) this.#schedule();
  }

  /**
   * Ask for a render; every request made in the same task becomes ONE render. On upgrade (the
   * module runs after the page is parsed) the browser calls `attributeChangedCallback` once per
   * attribute already present and then `connectedCallback`, back to back: without this, an
   * element with `src`, `level` and `theme` would fetch and compile its plan four times.
   */
  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    this.#done = Promise.resolve().then(() => {
      this.#queued = false;
      if (!this.isConnected) return; // removed before the render began
      return this.#render(++this.#run);
    });
  }

  async #render(run: number): Promise<void> {
    let result: ArchPlanResult | null;
    try {
      result = await this.#produce(run);
    } catch (e) {
      result = fail(`arch-plan: ${message(e)}`);
    }
    if (run !== this.#run) return; // a newer render owns the shadow root
    const style = document.createElement("style");
    style.textContent = STYLE;
    if (result === null) {
      this.#root.replaceChildren(style);
      return;
    }
    if (result.ok) {
      const plan = document.createElement("div");
      plan.className = "plan";
      plan.setAttribute("part", "plan");
      const svg = sanitizeSvg(result.svg); // the compiler's own SVG, parsed again with nothing executable kept
      if (svg) plan.append(svg);
      this.#root.replaceChildren(style, plan);
    } else {
      const pre = document.createElement("pre");
      pre.setAttribute("part", "diagnostics");
      pre.setAttribute("role", "alert");
      pre.textContent = result.problems.join("\n");
      this.#root.replaceChildren(style, pre);
    }
    const detail: ArchPlanRenderDetail = { ok: result.ok, problems: result.ok ? [] : result.problems };
    this.dispatchEvent(new CustomEvent("render", { detail }));
  }

  /** The source to compile and its result; `null` when there is nothing to draw (yet, or any more). */
  async #produce(run: number): Promise<ArchPlanResult | null> {
    const src = this.getAttribute("src");
    let source: string;
    if (src !== null) {
      let response: Response;
      try {
        response = await fetch(src);
      } catch (e) {
        return fail(`arch-plan: could not fetch ${src} (${message(e)})`);
      }
      if (!response.ok) return fail(`arch-plan: could not fetch ${src} (HTTP ${response.status})`);
      source = await response.text();
    } else {
      // The text starts right after the opening tag, so markup that puts the plan on the next line
      // (or inside a `<script type="text/plain">` there) would count a line or two that are not
      // the plan's in every diagnostic's `line`. Leading blank lines go; the first line's indent stays.
      source = (this.textContent ?? "").replace(/^\s*\n/, "");
      if (source.trim() === "") return null;
    }
    const core = await loadCoreOrProblem();
    // Overtaken (or removed) during the fetch or the first import of the compiler: the result
    // would be dropped anyway, so skip the compile. Nothing awaits between here and it.
    if (run !== this.#run) return null;
    if (!("compile" in core)) return core;
    return compileWith(core, source, { level: this.getAttribute("level"), theme: this.getAttribute("theme") });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "arch-plan": ArchPlanElement;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("arch-plan")) {
  customElements.define("arch-plan", ArchPlanElement);
}
