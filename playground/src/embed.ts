/**
 * Chrome-less embed page. Renders an ArchLang plan from the URL hash — the same
 * `#z=` share codec the main playground writes — so a floor plan can be dropped
 * into any blog / Confluence / GitHub-Pages via a single <iframe>. Client-side
 * only; the zero-dep core compiles in the browser exactly as it does in Node.
 *
 * Hash params (after the `#z=…`/`#src=…` token, `&`-joined):
 *   editable=1    show a compact editor pane + live re-render on input
 *   theme=<key>   force a named render theme (blueprint | dark | mono | presentation)
 */
import { compile } from "archlang";
import { embedCompileOptions, hashParam, isEditable, renderDecision } from "./embed-params.js";
import { createPanZoom } from "./pan-zoom.js";
import { srcFromHash } from "./share.js";
import { showSvgInStage } from "./viewer.js";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles/tokens.css";
import "./styles/panels.css";
import "./styles/embed.css";

const stage = document.querySelector<HTMLElement>(".pz-stage")!;
const viewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const toolbar = document.querySelector<HTMLElement>(".pz-toolbar");
const editorWrap = document.querySelector<HTMLElement>(".embed-editor")!;
const textarea = document.getElementById("embedSrc") as HTMLTextAreaElement;
const errEl = document.getElementById("embedErr")!;

const pz = createPanZoom(viewport, stage);

// The hash reader, the options builder and the last-good-render rule are pure and
// live in embed-params.ts (unit-tested); this module only does the DOM writes.
const opts = embedCompileOptions(hashParam(location.hash, "theme"));

/** True once a good plan has rendered — after that, a transient error keeps the last
 *  good preview (nicer while typing in an `editable=1` embed) rather than swapping in
 *  the error card. */
let hasGoodRender = false;

function render(source: string, refit: boolean): void {
  const { svg, errors } = compile(source, opts);
  const decision = renderDecision(hasGoodRender, errors);
  hasGoodRender = decision.hasGoodRender;
  if (decision.error !== null) {
    errEl.hidden = false;
    errEl.textContent = decision.error;
  } else {
    errEl.hidden = true;
  }
  if (decision.showSvg) showSvgInStage(stage, pz, svg, refit);
}

toolbar?.addEventListener("click", (e) => {
  const action = (e.target as Element | null)?.closest<HTMLElement>("button")?.dataset.pz;
  if (action === "in") pz.zoomIn();
  else if (action === "out") pz.zoomOut();
  else if (action === "fit") pz.fit();
});

async function init() {
  const source = (await srcFromHash()) ?? `plan "Embed" {\n  room at (0,0) size 4000x3000 label "Room"\n}`;
  const editable = isEditable(location.hash);
  if (editable) {
    editorWrap.hidden = false;
    textarea.value = source;
    let debounce: ReturnType<typeof setTimeout>;
    textarea.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => render(textarea.value, false), 200);
    });
  }
  render(source, true);
  requestAnimationFrame(() => pz.fit());
}

void init();
