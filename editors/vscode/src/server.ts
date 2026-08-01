/**
 * ArchLang language server (LSP). Publishes diagnostics and provides hover,
 * completion, go-to-definition, rename, and signature help for open .arch
 * documents. Runs as a separate Node process spawned by the extension client
 * (node-IPC), and also speaks `--stdio` — `createConnection` picks the transport
 * off argv, which is what lets an integration test drive the real bundle.
 *
 * This file is PLUMBING ONLY: it creates the connection, owns the document
 * store, and forwards each request to `handlers.ts` — where all the logic lives,
 * dependency-injected and unit-tested without a transport. The zero-dep core is
 * ESM-only, so it is pulled in via a dynamic import (CJS-safe).
 */
import { createConnection, TextDocuments, ProposedFeatures, type InitializeResult } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createHandlers, SERVER_CAPABILITIES, type CoreLsp, type Handlers } from "./handlers.js";

/**
 * The core version esbuild bundled into this file, injected by `esbuild.mjs` as
 * a `define` read from the resolved `@chanmeng666/archlang` package.json. It is
 * reported as `serverInfo.version` (so a client — or a test — can ask the running
 * server which core it carries) and is what proves a rebuilt bundle actually
 * picked up a new core, instead of shipping a stale one.
 *
 * This file only ever runs BUNDLED (it is the extension's LSP entry point), so
 * the define is always in force; there is deliberately no runtime fallback that
 * could mask a build which forgot to stamp one.
 */
declare const __CORE_VERSION__: string;
const ARCHLANG_CORE_VERSION: string = __CORE_VERSION__;

let handlers: Promise<Handlers> | null = null;
function getHandlers(): Promise<Handlers> {
  handlers ??= import("@chanmeng666/archlang").then((core) => createHandlers(core as unknown as CoreLsp));
  return handlers;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Synchronous on purpose: the capabilities are a static declaration, so the
// handshake never waits on the core's dynamic import.
connection.onInitialize(
  (): InitializeResult => ({
    capabilities: SERVER_CAPABILITIES,
    serverInfo: { name: "archlang-language-server", version: ARCHLANG_CORE_VERSION },
  }),
);

documents.onDidChangeContent((e) => {
  void (async () => {
    const h = await getHandlers();
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: h.diagnostics(e.document.getText()) });
  })();
});

/** Run `fn` against the open document's text, or return `fallback` if it is gone. */
async function withDoc<T>(uri: string, fallback: T, fn: (h: Handlers, text: string) => T): Promise<T> {
  const doc = documents.get(uri);
  if (!doc) return fallback;
  return fn(await getHandlers(), doc.getText());
}

connection.onHover((p) => withDoc(p.textDocument.uri, null, (h, t) => h.hover(t, p.position)));

connection.onCompletion((p) => withDoc(p.textDocument.uri, [], (h, t) => h.completion(t, p.position)));

connection.onDefinition((p) =>
  withDoc(p.textDocument.uri, null, (h, t) => h.definition(t, p.textDocument.uri, p.position)),
);

connection.onRenameRequest((p) =>
  withDoc(p.textDocument.uri, null, (h, t) => h.rename(t, p.textDocument.uri, p.position, p.newName)),
);

connection.onCodeAction((p) => withDoc(p.textDocument.uri, [], (h, t) => h.codeAction(t, p.textDocument.uri, p.range)));

connection.onSignatureHelp((p) => withDoc(p.textDocument.uri, null, (h, t) => h.signatureHelp(t, p.position)));

documents.listen(connection);
connection.listen();
