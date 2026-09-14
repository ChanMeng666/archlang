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
import { createSharedNotice, SHARED_PLAN_NOTICE_SHORT, shouldShowSharedNotice } from "./shared-notice.js";
// The fallback plan for a hash-less embed: the canonical smallest complete plan,
// imported verbatim (`?raw`) so it can never drift from examples/one-room.arch.
import fallbackPlan from "../../examples/one-room.arch?raw";
import { showSvgInStage } from "./viewer.js";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles/tokens.css";
import "./styles/panels.css";
import "./styles/embed.css";

const stage = document.querySelector<HTMLElement>(".pz-stage")!;
const viewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const previewWrap = document.querySelector<HTMLElement>(".embed-preview")!;
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
  const shared = await srcFromHash();
  const source = shared ?? fallbackPlan;

  // This page IS the third-party surface: it exists to be framed by someone else's
  // site, showing a plan that arrived in the fragment. So it carries the same
  // attribution notice the playground does, as one compact line above the drawing.
  // The "bundled" set here is the single plan this entry actually bundles — the
  // one-room fallback — rather than the playground's 27 presets: importing those
  // would ship a quarter of a megabyte of example text into every iframe on the
  // internet to silence a notice that, on this page, is almost always correct.
  if (shouldShowSharedNotice(shared, [fallbackPlan])) {
    previewWrap.prepend(createSharedNotice(SHARED_PLAN_NOTICE_SHORT));
  }

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
