// <arch-plan>, the ArchLang web component. Built from packages/web-component/src/arch-plan.ts by `npm run gen:arch-plan`; do not edit.
// Loads the ArchLang compiler 1.58.0 from https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@1.58.0/+esm on the first render.
// Usage: https://archlang.uk/embed

// packages/web-component/src/svg-sanitize.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var BLOCKED = /* @__PURE__ */ new Set([
  "script",
  "foreignobject",
  "style",
  "set",
  "animate",
  "animatemotion",
  "animatetransform",
  "animatecolor",
  "discard"
]);
var isHref = (name) => /(^|:)href$/i.test(name);
var isSafeLink = (value) => {
  const v = Array.from(value).filter((c) => c.charCodeAt(0) > 32).join("").toLowerCase();
  return v === "" || v.startsWith("#") || /^(https?|mailto):/.test(v) || !/^[a-z][a-z0-9+.-]*:/.test(v);
};
var COMPILER_TAGS = "svg|g|defs|desc|title|text|tspan|path|rect|line|circle|pattern|polygon";
var FOREIGN_TAG = new RegExp(`<(?!/?(?:${COMPILER_TAGS})[\\s/>])`);
var SVG_XMLNS = /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"|\sxmlns:inkscape="http:\/\/www\.inkscape\.org\/namespaces\/inkscape"/g;
var SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg"`;
var SUSPECT = /\bon[a-z]+\s*=|href|xmlns|&#|javascript|data:/i;
function isPlainSvg(text) {
  return text.startsWith(SVG_OPEN) && !FOREIGN_TAG.test(text) && !SUSPECT.test(text.replace(SVG_XMLNS, ""));
}
function sanitizeSvg(text, env = { parser: new DOMParser(), doc: document }) {
  if (isPlainSvg(text)) {
    const holder = env.doc.createElement("template");
    holder.innerHTML = text;
    const first = holder.content.firstElementChild;
    return first && first.localName === "svg" && first.namespaceURI === SVG_NS ? first : void 0;
  }
  const parsed = env.parser.parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName !== "svg" || root.namespaceURI !== SVG_NS || parsed.getElementsByTagName("parsererror").length > 0)
    return void 0;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.namespaceURI !== SVG_NS || BLOCKED.has(el.localName.toLowerCase())) el.remove();
  }
  for (const el of Array.from(root.querySelectorAll("*")).concat(root)) {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || isHref(a.name) && !isSafeLink(a.value)) el.removeAttribute(a.name);
    }
  }
  plainNodes(root, parsed);
  try {
    return env.doc.importNode(root, true);
  } catch (e) {
    if (isDomRefusal(e)) return void 0;
    throw e;
  }
}
var DOM_REFUSALS = /* @__PURE__ */ new Set(["NotSupportedError", "HierarchyRequestError", "InvalidStateError", "WrongDocumentError"]);
var isDomRefusal = (e) => typeof e === "object" && e !== null && DOM_REFUSALS.has(e.name);
function plainNodes(root, parsed) {
  const stack = [root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) stack.push(child);
      else if (child.nodeType === 4) node.replaceChild(parsed.createTextNode(child.nodeValue ?? ""), child);
      else if (child.nodeType !== 3) node.removeChild(child);
    }
  }
}

// packages/web-component/src/arch-plan.ts
var corePromise;
function loadCore() {
  corePromise ??= import("https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@1.58.0/+esm").catch((e) => {
    corePromise = void 0;
    throw e;
  });
  return corePromise;
}
var STYLE = `:host{display:block;color-scheme:only light}
:host([hidden]){display:none}
.plan svg{display:block;max-width:100%;height:auto}
pre{margin:0;padding:12px 14px;background:#fff5f5;color:#7a1414;border:1px solid #e6b8b8;border-radius:4px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}`;
async function renderPlan(source, opts = {}) {
  const core = await loadCoreOrProblem();
  return "compile" in core ? compileWith(core, source, opts) : core;
}
async function loadCoreOrProblem() {
  try {
    return await loadCore();
  } catch (e) {
    return fail(`arch-plan: could not load the ArchLang compiler (${message(e)})`);
  }
}
function compileWith(core, source, opts) {
  try {
    let theme;
    if (opts.theme) {
      theme = Object.hasOwn(core.THEMES, opts.theme) ? core.THEMES[opts.theme] : void 0;
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
          const at = j.line !== void 0 ? ` ${j.line}:${j.col}` : "";
          return `${j.code ?? "error"}${at} ${j.message}`;
        })
      );
    }
    if (opts.level === null || opts.level === void 0) return { ok: true, svg: result.svg };
    const levels = (result.pages ?? []).map((p) => p.level);
    const page = result.pages?.find((p) => String(p.level) === opts.level.trim());
    if (!page) {
      const has = levels.length > 0 ? `its levels are ${levels.join(", ")}` : "it declares no levels";
      return fail(`arch-plan: level="${opts.level}" is not a storey of this plan (${has})`);
    }
    return { ok: true, svg: page.svg };
  } catch (e) {
    return fail(`arch-plan: ${message(e)}`);
  }
}
function fail(...problems) {
  return { ok: false, problems };
}
function message(e) {
  return e instanceof Error ? e.message : String(e);
}
var Base = typeof HTMLElement === "undefined" ? class {
} : HTMLElement;
var ArchPlanElement = class extends Base {
  static get observedAttributes() {
    return ["src", "level", "theme"];
  }
  #root;
  #observer;
  #run = 0;
  #queued = false;
  #done = Promise.resolve();
  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }
  /** Settles when the most recently requested render has been written to the shadow root. */
  get updateComplete() {
    return this.#done;
  }
  connectedCallback() {
    if (!this.#observer && typeof MutationObserver !== "undefined") {
      this.#observer = new MutationObserver(() => {
        if (!this.hasAttribute("src")) this.#schedule();
      });
    }
    this.#observer?.observe(this, { childList: true, characterData: true, subtree: true });
    this.#schedule();
  }
  disconnectedCallback() {
    this.#observer?.disconnect();
    ++this.#run;
  }
  attributeChangedCallback(_name, previous, next) {
    if (previous !== next && this.isConnected) this.#schedule();
  }
  /**
   * Ask for a render; every request made in the same task becomes ONE render. On upgrade (the
   * module runs after the page is parsed) the browser calls `attributeChangedCallback` once per
   * attribute already present and then `connectedCallback`, back to back: without this, an
   * element with `src`, `level` and `theme` would fetch and compile its plan four times.
   */
  #schedule() {
    if (this.#queued) return;
    this.#queued = true;
    this.#done = Promise.resolve().then(() => {
      this.#queued = false;
      if (!this.isConnected) return;
      return this.#render(++this.#run);
    });
  }
  async #render(run) {
    let result;
    try {
      result = await this.#produce(run);
    } catch (e) {
      result = fail(`arch-plan: ${message(e)}`);
    }
    if (run !== this.#run) return;
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
      const svg = sanitizeSvg(result.svg);
      if (svg) plan.append(svg);
      this.#root.replaceChildren(style, plan);
    } else {
      const pre = document.createElement("pre");
      pre.setAttribute("part", "diagnostics");
      pre.setAttribute("role", "alert");
      pre.textContent = result.problems.join("\n");
      this.#root.replaceChildren(style, pre);
    }
    const detail = { ok: result.ok, problems: result.ok ? [] : result.problems };
    this.dispatchEvent(new CustomEvent("render", { detail }));
  }
  /** The source to compile and its result; `null` when there is nothing to draw (yet, or any more). */
  async #produce(run) {
    const src = this.getAttribute("src");
    let source;
    if (src !== null) {
      let response;
      try {
        response = await fetch(src);
      } catch (e) {
        return fail(`arch-plan: could not fetch ${src} (${message(e)})`);
      }
      if (!response.ok) return fail(`arch-plan: could not fetch ${src} (HTTP ${response.status})`);
      source = await response.text();
    } else {
      source = (this.textContent ?? "").replace(/^\s*\n/, "");
      if (source.trim() === "") return null;
    }
    const core = await loadCoreOrProblem();
    if (run !== this.#run) return null;
    if (!("compile" in core)) return core;
    return compileWith(core, source, { level: this.getAttribute("level"), theme: this.getAttribute("theme") });
  }
};
if (typeof customElements !== "undefined" && !customElements.get("arch-plan")) {
  customElements.define("arch-plan", ArchPlanElement);
}
export {
  ArchPlanElement,
  renderPlan
};
