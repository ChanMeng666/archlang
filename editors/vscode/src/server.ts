/**
 * ArchLang language server (LSP). Publishes diagnostics and provides hover,
 * completion, go-to-definition, rename, and signature help for open .arch
 * documents. Runs as a separate Node process spawned by the extension client.
 * The zero-dep core is ESM-only, so it is pulled in via a dynamic import
 * (CJS-safe); all language services live in the core (`src/lsp.ts`) and this
 * file is a thin adapter that converts byte offsets ↔ LSP ranges.
 */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  CompletionItemKind,
  MarkupKind,
  type InitializeResult,
  type Diagnostic,
  type Hover,
  type CompletionItem,
  type Definition,
  type WorkspaceEdit,
  type SignatureHelp,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { lspDiagnostics, positionToOffset, spanToRange, type CompileFn } from "./diagnostics.js";

// Type-only reference into the (ESM) core from this CJS module: typing the icon
// map Record<CompletionKind, …> makes a newly added completion kind a compile
// error here, not a silent fallback-to-Text icon.
type CoreCompletionKind = import("@chanmeng666/archlang", { with: { "resolution-mode": "import" }}).CompletionKind;

// Minimal structural types for the core language-service functions (the core is
// dynamically imported, so we describe just what we call).
interface Span {
  start: number;
  end: number;
}
interface CoreLsp {
  compile: CompileFn;
  hover(src: string, off: number): { contents: string; span?: Span } | null;
  completion(src: string, off: number): { label: string; kind: CoreCompletionKind; detail?: string; doc?: string }[];
  definition(src: string, off: number): Span | null;
  rename(src: string, off: number, newName: string): { span: Span; newText: string }[] | null;
  signatureHelp(src: string, off: number): { label: string; params: string[]; activeParameter: number } | null;
}

let core: CoreLsp | null = null;
async function getCore(): Promise<CoreLsp> {
  if (!core) core = (await import("@chanmeng666/archlang")) as unknown as CoreLsp;
  return core;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(
  (): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      renameProvider: true,
      completionProvider: { resolveProvider: false, triggerCharacters: [" "] },
      signatureHelpProvider: { triggerCharacters: ["(", ","] },
    },
  }),
);

async function validate(doc: TextDocument): Promise<void> {
  const { compile } = await getCore();
  // lspDiagnostics is structurally a Diagnostic[] (range/severity/message/code/source).
  const diagnostics = lspDiagnostics(compile, doc.getText()) as unknown as Diagnostic[];
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

documents.onDidChangeContent((e) => {
  void validate(e.document);
});

const COMPLETION_KIND: Record<CoreCompletionKind, CompletionItemKind> = {
  keyword: CompletionItemKind.Keyword,
  element: CompletionItemKind.Class,
  variable: CompletionItemKind.Variable,
  function: CompletionItemKind.Function,
  component: CompletionItemKind.Module,
  enum: CompletionItemKind.EnumMember,
};

connection.onHover(async (params): Promise<Hover | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const { hover } = await getCore();
  const text = doc.getText();
  const h = hover(text, positionToOffset(text, params.position));
  if (!h) return null;
  return {
    contents: { kind: MarkupKind.Markdown, value: h.contents },
    range: h.span ? spanToRange(text, h.span) : undefined,
  };
});

connection.onCompletion(async (params): Promise<CompletionItem[]> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const { completion } = await getCore();
  const text = doc.getText();
  return completion(text, positionToOffset(text, params.position)).map((c) => ({
    label: c.label,
    kind: COMPLETION_KIND[c.kind] ?? CompletionItemKind.Text,
    detail: c.detail,
    documentation: c.doc,
  }));
});

connection.onDefinition(async (params): Promise<Definition | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const { definition } = await getCore();
  const text = doc.getText();
  const span = definition(text, positionToOffset(text, params.position));
  return span ? { uri: params.textDocument.uri, range: spanToRange(text, span) } : null;
});

connection.onRenameRequest(async (params): Promise<WorkspaceEdit | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const { rename } = await getCore();
  const text = doc.getText();
  const edits = rename(text, positionToOffset(text, params.position), params.newName);
  if (!edits) return null;
  return {
    changes: {
      [params.textDocument.uri]: edits.map((e) => ({ range: spanToRange(text, e.span), newText: e.newText })),
    },
  };
});

connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const { signatureHelp } = await getCore();
  const text = doc.getText();
  const sig = signatureHelp(text, positionToOffset(text, params.position));
  if (!sig) return null;
  return {
    signatures: [{ label: sig.label, parameters: sig.params.map((p) => ({ label: p })) }],
    activeSignature: 0,
    activeParameter: sig.activeParameter,
  };
});

documents.listen(connection);
connection.listen();
