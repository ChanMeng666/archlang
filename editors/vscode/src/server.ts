/**
 * ArchLang language server (LSP). Publishes the compiler's diagnostics for
 * open .arch documents. Runs as a separate Node process spawned by the
 * extension client. The zero-dep core is ESM-only, so it is pulled in via a
 * dynamic import (CJS-safe).
 */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  type InitializeResult,
  type Diagnostic,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { lspDiagnostics, type CompileFn } from "./diagnostics.js";

let compileFn: CompileFn | null = null;
async function getCompile(): Promise<CompileFn> {
  if (!compileFn) {
    const mod = (await import("@chanmeng666/archlang")) as { compile: CompileFn };
    compileFn = mod.compile;
  }
  return compileFn;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(
  (): InitializeResult => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
  }),
);

async function validate(doc: TextDocument): Promise<void> {
  const compile = await getCompile();
  // lspDiagnostics is structurally a Diagnostic[] (range/severity/message/code/source).
  const diagnostics = lspDiagnostics(compile, doc.getText()) as unknown as Diagnostic[];
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

documents.onDidChangeContent((e) => {
  void validate(e.document);
});

documents.listen(connection);
connection.listen();
