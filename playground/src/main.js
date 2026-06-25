import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { compile } from "archlang";
import { archLanguage, archLinter } from "./arch-language.js";
import { EXAMPLES } from "./examples.js";
import "./style.css";

const preview = document.getElementById("preview");
const errorsEl = document.getElementById("errors");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const select = document.getElementById("examples");

for (const name of Object.keys(EXAMPLES)) {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  select.appendChild(o);
}

let lastSvg = "";

function render(source) {
  const { svg, errors, warnings } = compile(source, { noCache: true });
  if (errors.length) {
    statusEl.classList.add("err");
    statusText.textContent = `${errors.length} error${errors.length > 1 ? "s" : ""}`;
    errorsEl.classList.add("show");
    errorsEl.style.color = "";
    errorsEl.textContent = errors
      .map((e) => `line ${e.line ?? "?"}${e.col ? ":" + e.col : ""}  ${e.message}`)
      .join("\n");
    return; // keep last good preview
  }
  statusEl.classList.remove("err");
  statusText.textContent = warnings.length ? `${warnings.length} warning(s)` : "ready";
  errorsEl.classList.toggle("show", warnings.length > 0);
  errorsEl.style.color = warnings.length ? "#8a6d00" : "";
  errorsEl.textContent = warnings.map((w) => `warning${w.line ? " line " + w.line : ""}: ${w.message}`).join("\n");
  preview.innerHTML = svg;
  lastSvg = svg;
}

let debounce;
const onDocChanged = (source) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => render(source), 250);
};

const view = new EditorView({
  state: EditorState.create({
    doc: EXAMPLES["Studio (1BR)"],
    extensions: [
      lineNumbers(),
      history(),
      bracketMatching(),
      highlightActiveLine(),
      lintGutter(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      archLanguage(),
      archLinter(),
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.55" },
        ".cm-content": { padding: "10px 0" },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onDocChanged(u.state.doc.toString());
      }),
    ],
  }),
  parent: document.getElementById("editor"),
});

select.addEventListener("change", () => {
  const doc = EXAMPLES[select.value];
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
  render(doc);
});

document.getElementById("download").addEventListener("click", () => {
  if (!lastSvg) return;
  const blob = new Blob([lastSvg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "floorplan.svg";
  a.click();
  URL.revokeObjectURL(a.href);
});

// Initial render.
render(view.state.doc.toString());
