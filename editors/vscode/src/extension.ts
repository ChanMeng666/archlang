/** VS Code extension entry — the ArchLang language client and the Markdown-preview plugin. */
import * as path from "node:path";
import { type ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { type CoreCompile, createExtendMarkdownIt } from "./markdown.js";

let client: LanguageClient | undefined;

function startClient(context: ExtensionContext): void {
  if (client) return;
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "arch" }],
  };
  client = new LanguageClient("archlang", "ArchLang Language Server", serverOptions, clientOptions);
  void client.start();
}

/**
 * Async because the core is ESM-only and is loaded with `import()` (its exports map has
 * only an `import` condition, so `require` cannot reach it). VS Code awaits `activate()`
 * and then calls `extendMarkdownIt` synchronously, so the core is ready by then.
 *
 * The Markdown preview activates this extension too, so the language server starts only
 * once an `arch` document is open, not on a plain Markdown preview.
 */
export async function activate(context: ExtensionContext) {
  // The language client is wired first, so a core that fails to load costs the preview only.
  const isArch = (languageId: string): boolean => languageId === "arch";
  if (workspace.textDocuments.some((d) => isArch(d.languageId))) startClient(context);
  context.subscriptions.push(
    workspace.onDidOpenTextDocument((d) => {
      if (isArch(d.languageId)) startClient(context);
    }),
  );
  let compile: CoreCompile;
  try {
    // Uncast: the real `compile` must be assignable to the slice the markdown plugin reads.
    compile = (await import("@chanmeng666/archlang")).compile;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    compile = () => ({
      svg: "",
      diagnostics: [{ severity: "error", code: "E_CORE_LOAD", message: `the ArchLang core failed to load: ${reason}` }],
    });
  }
  return { extendMarkdownIt: createExtendMarkdownIt(compile) };
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
