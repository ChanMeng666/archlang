/**
 * WS-F2/F3 — the BUILT extension bundle, exercised as a real process.
 *
 * `handlers.test.ts` proves the logic; this file proves the artifact. Everything
 * here runs against `dist/server.js` — the exact file the .vsix ships — so it
 * catches what a unit test structurally cannot: a bundle that does not start, a
 * transport that is not wired, a capability the server forgets to advertise, and
 * (F3) a bundle that inlined a STALE core.
 *
 * Transport: the extension itself launches the server over node-IPC, but
 * `createConnection(ProposedFeatures.all)` picks its transport off `argv`, so the
 * same bundle answers `--stdio` with no source change. That is what makes it
 * drivable from a test — spawn it, and speak LSP over its stdin/stdout with
 * `vscode-languageserver-protocol`'s stream reader/writer.
 *
 * GATE: these need `npm run vscode:build:only` to have run. A missing bundle is a
 * VISIBLE skip locally and a HARD FAILURE once CI has built the repo, so the
 * suite can never go green having asserted nothing — the same rule
 * `test/visual.test.ts` applies to its optional raster dep. See BUNDLE_REQUIRED.
 *
 * For these to actually RUN in CI, the `builds` job (which is what builds the
 * extension) must invoke them — `npx vitest run editors/vscode` after its
 * "Build VS Code extension" step. The plain test matrix builds nothing and will
 * skip this file by design.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DidOpenTextDocumentNotification,
  ExitNotification,
  HoverRequest,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  ShutdownRequest,
  type PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
// `/node.js`, not `/node`: the package publishes no `exports` map, and ESM does
// no extension guessing for a bare subpath.
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver-protocol/node.js";

const EXT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EXT_ROOT, "..", "..");
const SERVER_BUNDLE = join(EXT_ROOT, "dist", "server.js");
const HAS_BUNDLE = existsSync(SERVER_BUNDLE);

/**
 * When is a missing bundle a FAILURE rather than a skip?
 *
 * Not simply "in CI": the test matrix runs `npm test` on a fresh checkout with
 * nothing built at all, so there is legitimately no bundle to find there and
 * demanding one would fail every leg. The distinguishing fact is whether the repo
 * has been BUILT — the `builds` job builds the core first and then every
 * workspace, so a present core `dist/` with an absent extension `dist/` means the
 * extension build is broken, which must fail loudly instead of skipping.
 */
const BUNDLE_REQUIRED = !!process.env.CI && existsSync(join(REPO_ROOT, "dist", "index.js"));

/**
 * The version of `@chanmeng666/archlang` that npm resolved FOR THIS WORKSPACE —
 * the one esbuild inlines. Deliberately not the repo root's `package.json`: the
 * bundle contains whatever `node_modules` resolution found, and in a monorepo
 * those two only coincide because the workspace link points at the root. Resolved
 * by walking the `node_modules` chain, because the core's `exports` map publishes
 * neither `./package.json` nor a `require` condition.
 */
function resolvedCoreVersion(): string {
  let dir = EXT_ROOT;
  for (;;) {
    const candidate = join(dir, "node_modules", "@chanmeng666", "archlang", "package.json");
    if (existsSync(candidate)) return (JSON.parse(readFileSync(candidate, "utf8")) as { version: string }).version;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("cannot resolve @chanmeng666/archlang — run `npm install` at the repo root");
    dir = parent;
  }
}

/**
 * Declare the missing-bundle outcome for one suite: a hard failure under CI, a
 * visible (named) skip locally. Returns true when the suite must not continue.
 */
function gated(): boolean {
  if (HAS_BUNDLE) return false;
  const gate = "editors/vscode/dist/server.js is built";
  if (BUNDLE_REQUIRED) {
    it(gate, () => {
      throw new Error(
        "dist/server.js missing although the core is built — `npm run vscode:build:only` did not " +
          "run, or failed. Nothing about the shipped bundle was verified.",
      );
    });
  } else {
    it.skip(`${gate} (absent locally — run \`npm run vscode:build:only\`)`, () => {});
  }
  return true;
}

const BROKEN = ['plan "E" {', "  units mm", "  room id=r at (0,0) size 0x1000", "}"].join("\n");
const DOC_URI = "file:///archlang-stdio-smoke.arch";

describe("LSP server bundle — stdio round trip", () => {
  if (gated()) return;

  it("initializes, publishes an E_ diagnostic for a broken plan, answers hover, and exits", async () => {
    const child = spawn(process.execPath, [SERVER_BUNDLE, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    const stderr: string[] = [];
    child.stderr.on("data", (b: Buffer) => stderr.push(b.toString()));
    const connection = createProtocolConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    // A server crash must surface as this rejection, not as a silent test timeout.
    const died = new Promise<never>((_, reject) =>
      child.once("exit", (code) => reject(new Error(`server exited early (${code}): ${stderr.join("")}`))),
    );

    try {
      connection.listen();

      // 1. initialize — capabilities, plus the bundled-core stamp (F3, over the wire).
      const init = await Promise.race([
        connection.sendRequest(InitializeRequest.type, {
          processId: process.pid,
          rootUri: null,
          capabilities: {},
        }),
        died,
      ]);
      expect(init.capabilities.hoverProvider).toBe(true);
      expect(init.capabilities.codeActionProvider).toEqual({ codeActionKinds: ["quickfix"] });
      expect(init.serverInfo).toEqual({ name: "archlang-language-server", version: resolvedCoreVersion() });

      // 2. initialized + didOpen a broken plan → the server must push diagnostics.
      const published = new Promise<PublishDiagnosticsParams>((resolve) => {
        connection.onNotification(PublishDiagnosticsNotification.type, resolve);
      });
      connection.sendNotification(InitializedNotification.type, {});
      connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri: DOC_URI, languageId: "arch", version: 1, text: BROKEN },
      });

      // 3. the diagnostic arrives, catalogued, on the offending line.
      const diags = await Promise.race([published, died]);
      expect(diags.uri).toBe(DOC_URI);
      const err = diags.diagnostics.find((d) => d.code === "E_ROOM_SIZE");
      expect(err, `no E_ROOM_SIZE in ${JSON.stringify(diags.diagnostics)}`).toBeDefined();
      expect(err!.severity).toBe(1); // DiagnosticSeverity.Error
      expect(err!.source).toBe("archlang");
      expect(err!.range.start.line).toBe(2);

      // 4. a request/response round trip on the same document.
      const hover = await Promise.race([
        connection.sendRequest(HoverRequest.type, {
          textDocument: { uri: DOC_URI },
          position: { line: 2, character: 3 }, // inside `room`
        }),
        died,
      ]);
      expect(hover).not.toBeNull();
      expect(JSON.stringify(hover)).toContain("room");

      // 5. an orderly shutdown — the process must end on its own.
      await Promise.race([connection.sendRequest(ShutdownRequest.type, undefined), died]);
      connection.sendNotification(ExitNotification.type);
      const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
      expect(code).toBe(0);
    } finally {
      connection.dispose();
      if (child.exitCode === null) child.kill();
    }
  }, 30_000);
});

describe("LSP server bundle — freshness (F3)", () => {
  if (gated()) return;

  it("embeds the core version npm resolved for this workspace", () => {
    // The bundle inlines the core at BUILD time, so "which core does the .vsix
    // carry?" has to be read off the artifact — this replaces counting per-release
    // symbols in the bundle text and hoping the sample was representative.
    const bundle = readFileSync(SERVER_BUNDLE, "utf8");
    const stamped = /ARCHLANG_CORE_VERSION\s*=\s*"([^"]+)"/.exec(bundle);
    expect(
      stamped,
      "no __CORE_VERSION__ stamp in dist/server.js — is the esbuild `define` still there?",
    ).not.toBeNull();
    expect(stamped![1]).toBe(resolvedCoreVersion());
  });

  it("stamps a real semver, not a placeholder", () => {
    const stamped = /ARCHLANG_CORE_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(SERVER_BUNDLE, "utf8"));
    expect(stamped![1]).toMatch(/^\d+\.\d+\.\d+/);
    // The define must have been substituted — the identifier itself must be gone.
    expect(readFileSync(SERVER_BUNDLE, "utf8")).not.toContain("__CORE_VERSION__");
  });
});
