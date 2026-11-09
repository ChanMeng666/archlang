/**
 * The ArchLang language server's HANDLER LOGIC, extracted from the connection
 * wiring (`server.ts`) so it can be unit-tested without an LSP transport.
 *
 * Same dependency-injection shape as `diagnostics.ts`: every core language
 * service is passed in ({@link CoreLsp}) rather than imported, so a test can
 * hand in the real (ESM-only) core through vitest's alias — or a stub, to drive
 * a branch the real core cannot reach. LSP *types and enums* are imported (they
 * are plain data from `vscode-languageserver-protocol`), but nothing here knows
 * about a `Connection`, a `TextDocuments` store, or a process: a handler takes
 * the document's TEXT (plus its uri, where an edit needs one) and returns the
 * LSP payload. `server.ts` is then pure plumbing.
 *
 * The one job of this layer is the conversion the core deliberately does not do:
 * source offsets ↔ LSP line/character positions. Everything semantic lives in
 * the core (`src/lsp.ts`).
 */
import {
  CodeActionKind,
  CodeActionTriggerKind,
  CompletionItemKind,
  MarkupKind,
  TextDocumentSyncKind,
  type CodeAction,
  type CompletionItem,
  type Definition,
  type Diagnostic,
  type Hover,
  type Position,
  type Range,
  type ServerCapabilities,
  type SignatureHelp,
  type WorkspaceEdit,
} from "vscode-languageserver-protocol";
import { lspDiagnostics, positionToOffset, spanToRange } from "./diagnostics.js";

// Type-only references into the (ESM) core from this CJS module. The adapter's view of the core
// is DERIVED from the core's own declarations, never retyped: `CoreLsp` here and `CompileFn` in
// `diagnostics.ts` (whose `Diagnostic` is the core's), so a changed core signature or a renamed
// field is a compile error here and in `server.ts`, which hands the real module in uncast. No
// cast is left on this seam in src/; the one cast is the `compileReturning` stub helper in
// `test/handlers.test.ts`, whose stubs return only `diagnostics`. Typing the icon map
// Record<CompletionKind, …> likewise makes a newly added completion kind a compile error, not a
// silent fallback-to-Text icon.
type Core = typeof import("@chanmeng666/archlang", { with: { "resolution-mode": "import" }});
type CoreCompletionKind = import("@chanmeng666/archlang", { with: { "resolution-mode": "import" }}).CompletionKind;

/** A byte span in the source (the core's `Span`). */
export type Span = import("@chanmeng666/archlang", { with: { "resolution-mode": "import" }}).Span;
/** The slice of `@chanmeng666/archlang` this adapter uses: the core's own functions, by name. */
export type CoreLsp = Pick<
  Core,
  "compile" | "hover" | "completion" | "definition" | "rename" | "signatureHelp" | "codeActions" | "refactorActions"
>;
/** A core quickfix code action (what the core `codeActions` returns). */
export type CoreCodeAction = ReturnType<CoreLsp["codeActions"]>[number];
/** A core refactor action (what the core `refactorActions` returns): a `reroll` suggestion,
 *  bound to no diagnostic. */
export type CoreRefactorAction = ReturnType<CoreLsp["refactorActions"]>[number];

/** Core completion kind → the editor's icon enum. Total by construction. */
export const COMPLETION_KIND: Record<CoreCompletionKind, CompletionItemKind> = {
  keyword: CompletionItemKind.Keyword,
  element: CompletionItemKind.Class,
  variable: CompletionItemKind.Variable,
  function: CompletionItemKind.Function,
  component: CompletionItemKind.Module,
  enum: CompletionItemKind.EnumMember,
};

/** What the server advertises in its `initialize` response. */
export const SERVER_CAPABILITIES: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  hoverProvider: true,
  definitionProvider: true,
  renameProvider: true,
  completionProvider: { resolveProvider: false, triggerCharacters: [" "] },
  signatureHelpProvider: { triggerCharacters: ["(", ","] },
  codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
};

/**
 * Identity of the diagnostic a core code action was built from. `code + span` is
 * enough: the core builds one action per fix of one diagnostic, and two
 * diagnostics sharing a code AND a span are the same finding.
 */
const diagnosticKey = (code: string | undefined, start: number, end: number): string =>
  `${code ?? ""}\u0000${start}\u0000${end}`;

/**
 * The set of diagnostics whose spans are measured in ANOTHER file.
 *
 * A component's body statements carry spans into the module they were WRITTEN
 * in, so a diagnostic raised inside an `import`ed component — and every
 * `fixes[].edits[].span` on it — addresses bytes of that module, not of the
 * document the editor has open. The core's `applyFixes` refuses such a fix for
 * exactly this reason (before v1.22 it did not, and an imported component's
 * off-wall-door fix rewrote the middle of the importer's `wall` statement); the
 * core's `codeActions`/`DiagnosticJson` projection, however, does NOT carry
 * `file`, so this adapter recovers it from `compile()`, which does.
 *
 * Today this can never fire: the core's `codeActions(source, range)` takes no
 * `World`, so an `import` never links and no `file`-bearing diagnostic reaches
 * it. It is a guard on the seam, not a workaround — the day the language server
 * learns to resolve imports, a quickfix must not splice another file's offsets
 * into the open one.
 */
function foreignDiagnostics(core: CoreLsp, text: string): Set<string> {
  const foreign = new Set<string>();
  for (const d of core.compile(text).diagnostics) {
    if (d.file !== undefined && d.span) foreign.add(diagnosticKey(d.code, d.span.start, d.span.end));
  }
  return foreign;
}

/** Does every edit of `action` address bytes of THIS document? */
const editsAddressThisDocument = (action: CoreCodeAction | CoreRefactorAction, text: string): boolean =>
  action.edits.every((e) => e.span.start >= 0 && e.span.start <= e.span.end && e.span.end <= text.length);

/** Is `kind` requested by an LSP `CodeActionContext.only` list? Absent `only`
 *  wants everything. An entry matches `kind` exactly, or as an ANCESTOR in the
 *  dotted hierarchy (`"refactor"` wants `"refactor.rewrite"`), as LSP defines it. */
const kindWanted = (kind: string, only: readonly string[] | undefined): boolean =>
  only === undefined || only.some((o) => o === kind || kind.startsWith(`${o}.`));

/** Does `only` explicitly ask for a refactor kind (`"refactor"` or a
 *  `"refactor."`-prefixed one, e.g. `"refactor.rewrite"`)? */
const asksForRefactor = (only: readonly string[] | undefined): boolean =>
  !!only && only.some((o) => o === "refactor" || o.startsWith("refactor."));

/**
 * Does this request earn a call to the core's `refactorActions`?
 *
 * `reroll` (behind the `refactor.rewrite` kind) is the expensive call: it
 * compiles/describes/lints a twin for every candidate touching the range, so
 * an AUTOMATIC request — VS Code's lightbulb re-asking on every cursor/
 * selection move, with no user action — must never trigger it, or the
 * single-threaded server stalls on a large plan for exactly the case that
 * happens on every keystroke. Only two things earn a reroll call, and only
 * when `only` admits `refactor.rewrite` at all: the user explicitly INVOKED
 * code actions (Ctrl+. / the refactor menu — `triggerKind === Invoked`), or
 * the request's own `only` already names a refactor kind (an explicit ask,
 * honoured regardless of trigger). Anything else — an Automatic trigger, or
 * no trigger kind at all (a client that doesn't send one, which this treats as
 * the safe default) — never calls `refactorActions`, rather than running it
 * and filtering the result away afterward.
 */
function wantsRefactor(only: readonly string[] | undefined, triggerKind: number | undefined): boolean {
  if (!kindWanted(CodeActionKind.RefactorRewrite, only)) return false;
  return triggerKind === CodeActionTriggerKind.Invoked || asksForRefactor(only);
}

/** The LSP request handlers, closed over the core language services. */
export interface Handlers {
  /** Advertised in the `initialize` response. */
  capabilities: ServerCapabilities;
  diagnostics(text: string): Diagnostic[];
  hover(text: string, position: Position): Hover | null;
  completion(text: string, position: Position): CompletionItem[];
  definition(text: string, uri: string, position: Position): Definition | null;
  rename(text: string, uri: string, position: Position, newName: string): WorkspaceEdit | null;
  signatureHelp(text: string, position: Position): SignatureHelp | null;
  codeAction(text: string, uri: string, range: Range, only?: readonly string[], triggerKind?: number): CodeAction[];
}

/** Build the handler set over an injected core. Pure — no I/O, no connection. */
export function createHandlers(core: CoreLsp): Handlers {
  return {
    capabilities: SERVER_CAPABILITIES,

    diagnostics(text) {
      // lspDiagnostics returns LSP-shaped diagnostics (range/severity/message/code/source).
      return lspDiagnostics(core.compile, text);
    },

    hover(text, position) {
      const h = core.hover(text, positionToOffset(text, position));
      if (!h) return null;
      return {
        contents: { kind: MarkupKind.Markdown, value: h.contents },
        range: h.span ? spanToRange(text, h.span) : undefined,
      };
    },

    completion(text, position) {
      return core.completion(text, positionToOffset(text, position)).map((c) => ({
        label: c.label,
        kind: COMPLETION_KIND[c.kind] ?? CompletionItemKind.Text,
        detail: c.detail,
        documentation: c.doc,
      }));
    },

    definition(text, uri, position) {
      const span = core.definition(text, positionToOffset(text, position));
      return span ? { uri, range: spanToRange(text, span) } : null;
    },

    rename(text, uri, position, newName) {
      const edits = core.rename(text, positionToOffset(text, position), newName);
      if (!edits) return null;
      return {
        changes: { [uri]: edits.map((e) => ({ range: spanToRange(text, e.span), newText: e.newText })) },
      };
    },

    signatureHelp(text, position) {
      const sig = core.signatureHelp(text, positionToOffset(text, position));
      if (!sig) return null;
      return {
        signatures: [{ label: sig.label, parameters: sig.params.map((p) => ({ label: p })) }],
        activeSignature: 0,
        activeParameter: sig.activeParameter,
      };
    },

    codeAction(text, uri, range, only, triggerKind) {
      // The request range → source offsets (the conversion shared with rename).
      const span: Span = {
        start: positionToOffset(text, range.start),
        end: positionToOffset(text, range.end),
      };
      const editOf = (edits: { span: Span; newText: string }[]): WorkspaceEdit => ({
        changes: { [uri]: edits.map((e) => ({ range: spanToRange(text, e.span), newText: e.newText })) },
      });
      const quickfixes: CodeAction[] = [];
      if (kindWanted(CodeActionKind.QuickFix, only)) {
        const foreign = foreignDiagnostics(core, text);
        for (const a of core.codeActions(text, span)) {
          // NEVER offer an edit measured in another file (see foreignDiagnostics).
          const s = a.diagnostic.span;
          if (s && foreign.has(diagnosticKey(a.diagnostic.code, s[0], s[1]))) continue;
          // Second net: an out-of-range span is proof the edit was measured somewhere
          // else, whatever its provenance says.
          if (!editsAddressThisDocument(a, text)) continue;
          quickfixes.push({
            title: a.title,
            kind: CodeActionKind.QuickFix,
            isPreferred: a.isPreferred,
            diagnostics: a.diagnostic.span
              ? [
                  {
                    range: spanToRange(text, { start: a.diagnostic.span[0], end: a.diagnostic.span[1] }),
                    message: a.diagnostic.message,
                    code: a.diagnostic.code,
                    severity: a.diagnostic.severity === "error" ? 1 : 2,
                  },
                ]
              : undefined,
            edit: editOf(a.edits),
          });
        }
      }
      // `wantsRefactor` decides whether the core's expensive `refactorActions` runs at
      // all, so an AUTOMATIC trigger (the lightbulb re-asking on every cursor move)
      // never calls `reroll`; see its own doc comment. A refactor carries no diagnostic
      // (it cannot be a foreign-module quickfix), so only the in-document guard applies,
      // and it is never preferred — nothing is WRONG with the source it rewrites.
      const refactors: CodeAction[] = [];
      if (wantsRefactor(only, triggerKind)) {
        for (const a of core.refactorActions(text, span)) {
          if (!editsAddressThisDocument(a, text)) continue;
          refactors.push({
            title: a.title,
            kind: CodeActionKind.RefactorRewrite,
            isPreferred: false,
            edit: editOf(a.edits),
          });
        }
      }
      return [...quickfixes, ...refactors];
    },
  };
}
