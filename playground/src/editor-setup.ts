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
    parent,
  });
}
