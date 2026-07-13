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
        // Name the editable content region for assistive tech (the CodeMirror
        // content div is otherwise an unlabelled textbox).
        EditorView.contentAttributes.of({ "aria-label": "ArchLang source editor" }),
        archLanguage(),
        archCompletion(),
        archLinter(),
        // Source-world LIGHT theme (cool ground, plum selection/brackets — ADR 0014).
        // Values are CSS var() references into tokens.css; the two lint-underline
        // squiggles must inline their colour into a data URI (var() can't cross into
        // an SVG), so they carry the literal --redline (#c2362b) / --warn-ink (#7a6000)
        // hexes — keep them in step with the tokens.
        EditorView.theme(
          {
            "&": {
              height: "100%",
              fontSize: "13px",
              backgroundColor: "var(--src-surface)",
              color: "var(--src-fg)",
            },
            ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
            ".cm-content": { padding: "10px 0", caretColor: "var(--src-fg)" },
            ".cm-gutters": {
              backgroundColor: "var(--src-bg)",
              color: "var(--src-muted)",
              border: "none",
              borderRight: "1px solid var(--src-border)",
            },
            ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--plum) 6%, transparent)" },
            ".cm-activeLineGutter": {
              backgroundColor: "color-mix(in srgb, var(--plum) 10%, transparent)",
              color: "var(--src-fg)",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--src-fg)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
              backgroundColor: "rgba(128, 82, 255, 0.28)",
            },
            ".cm-selectionMatch": { backgroundColor: "rgba(128, 82, 255, 0.16)" },
            "&.cm-focused .cm-matchingBracket": {
              outline: "1px solid var(--plum-deep)",
              backgroundColor: "transparent",
            },
            // autocomplete + lint tooltips: a raised card on the source ground. On a
            // light ground a floating panel needs elevation, not just a border.
            ".cm-tooltip": {
              backgroundColor: "var(--src-surface)",
              border: "1px solid var(--src-rule)",
              color: "var(--src-fg)",
              boxShadow: "0 8px 24px rgb(28 36 48 / 18%)",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { color: "var(--src-fg)" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
              backgroundColor: "rgba(128, 82, 255, 0.20)",
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
                'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%237a6000" fill="none" stroke-width=".7"/></svg>\')',
            },
            // search / go-to panels
            ".cm-panels": { backgroundColor: "var(--src-bg)", color: "var(--src-fg)" },
            ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--src-border)" },
            ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--src-border)" },
            ".cm-panel input, .cm-panel button": {
              backgroundColor: "var(--src-surface)",
              color: "var(--src-fg)",
              border: "1px solid var(--src-rule)",
              borderRadius: "3px",
            },
          },
          // Light: this is what keeps CodeMirror's own scrollbars/native chrome light.
          { dark: false },
        ),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDocChanged(u.state.doc.toString());
        }),
      ],
    }),
    parent,
  });
}
