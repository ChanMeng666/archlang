/**
 * CodeMirror 6 editor construction for the playground: the ArchLang language
 * support, compiler-backed autocompletion and linting, history, and the doc-change
 * listener that drives the live recompile. Pure builder — no app state.
 */
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { archLanguage, archLinter } from "./arch-language.js";
import { archCompletion } from "./arch-completion.js";

interface EditorOpts {
  parent: HTMLElement;
  doc: string;
  onDocChanged: (source: string) => void;
}

export function createEditor({ parent, doc, onDocChanged }: EditorOpts): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        archLanguage(),
        archCompletion(),
        archLinter(),
        // Source-world dark theme (carbon ground, plum selection/brackets). Values
        // are CSS var() references into tokens.css; the two lint-underline squiggles
        // must inline their colour into a data URI (var() can't cross into an SVG),
        // so they carry the literal --redline (#c2362b) / --warn-ink (#8a6d00) hexes.
        EditorView.theme(
          {
            "&": {
              height: "100%",
              fontSize: "13px",
              backgroundColor: "var(--carbon)",
              color: "var(--src-fg)",
            },
            ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
            ".cm-content": { padding: "10px 0", caretColor: "var(--src-fg)" },
            ".cm-gutters": {
              backgroundColor: "var(--carbon-2)",
              color: "var(--src-muted)",
              border: "none",
              borderRight: "1px solid var(--src-border)",
            },
            ".cm-activeLine": { backgroundColor: "var(--carbon-2)" },
            ".cm-activeLineGutter": { backgroundColor: "var(--carbon-2)", color: "var(--src-fg)" },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--src-fg)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
              backgroundColor: "rgba(128, 82, 255, 0.28)",
            },
            ".cm-selectionMatch": { backgroundColor: "rgba(128, 82, 255, 0.16)" },
            "&.cm-focused .cm-matchingBracket": {
              outline: "1px solid var(--plum-bright)",
              backgroundColor: "transparent",
            },
            // autocomplete + lint tooltips on carbon-2 with a hairline; selected item plum-tinted
            ".cm-tooltip": {
              backgroundColor: "var(--carbon-2)",
              border: "1px solid var(--src-border)",
              color: "var(--src-fg)",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { color: "var(--src-fg)" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
              backgroundColor: "rgba(128, 82, 255, 0.28)",
              color: "var(--src-fg)",
            },
            ".cm-completionDetail": { color: "var(--src-muted)" },
            ".cm-diagnostic": { color: "var(--src-fg)" },
            ".cm-diagnostic-error": { borderLeftColor: "var(--redline)" },
            ".cm-diagnostic-warning": { borderLeftColor: "var(--warn-ink)" },
            ".cm-lintRange-error": {
              backgroundImage:
                'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%23c2362b" fill="none" stroke-width=".7"/></svg>\')',
            },
            ".cm-lintRange-warning": {
              backgroundImage:
                'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%238a6d00" fill="none" stroke-width=".7"/></svg>\')',
            },
            // search / go-to panels
            ".cm-panels": { backgroundColor: "var(--carbon-2)", color: "var(--src-fg)" },
            ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--src-border)" },
            ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--src-border)" },
            ".cm-panel input, .cm-panel button": {
              backgroundColor: "var(--carbon)",
              color: "var(--src-fg)",
              border: "1px solid var(--src-border)",
              borderRadius: "3px",
            },
          },
          { dark: true },
        ),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDocChanged(u.state.doc.toString());
        }),
      ],
    }),
    parent,
  });
}
