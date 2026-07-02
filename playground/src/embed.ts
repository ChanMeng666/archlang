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
import { compile, THEMES, type CompileOptions } from "archlang";
import { createPanZoom } from "./pan-zoom.js";
import { srcFromHash } from "./share.js";
import { showSvgInStage } from "./viewer.js";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/geist-mono/400.css";
import "./style.css";

const stage = document.querySelector<HTMLElement>(".pz-stage")!;
const viewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const toolbar = document.querySelector<HTMLElement>(".pz-toolbar");
const editorWrap = document.querySelector<HTMLElement>(".embed-editor")!;
const textarea = document.getElementById("embedSrc") as HTMLTextAreaElement;
const errEl = document.getElementById("embedErr")!;

const pz = createPanZoom(viewport, stage);

/** Read a boolean/string param from the current hash (params live after the codec token). */
function hashParam(name: string): string | null {
  const m = location.hash.match(new RegExp(`[#&]${name}=([^&]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const themeKey = hashParam("theme");
const opts: CompileOptions =
  themeKey && THEMES[themeKey] ? { noCache: true, theme: THEMES[themeKey] } : { noCache: true };

function render(source: string, refit: boolean): void {
  const { svg, errors } = compile(source, opts);
  if (errors.length) {
    errEl.hidden = false;
    errEl.textContent = `${errors.length} error${errors.length > 1 ? "s" : ""}: ${errors[0].message}`;
    return; // keep the last good preview
  }
  errEl.hidden = true;
  showSvgInStage(stage, pz, svg, refit);
}

toolbar?.addEventListener("click", (e) => {
  const action = (e.target as Element | null)?.closest<HTMLElement>("button")?.dataset.pz;
  if (action === "in") pz.zoomIn();
  else if (action === "out") pz.zoomOut();
  else if (action === "fit") pz.fit();
});

async function init() {
  const source = (await srcFromHash()) ?? `plan "Embed" {\n  room at (0,0) size 4000x3000 label "Room"\n}`;
  const editable = hashParam("editable") === "1";
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
