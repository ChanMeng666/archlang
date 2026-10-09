/**
 * Proof that a built `.mcpb` actually runs: unpack it OUTSIDE the repo (so no
 * `node_modules` resolution from the checkout can help it), start the server exactly as
 * the manifest's `mcp_config` says, and drive it over stdio with raw JSON-RPC —
 * `initialize`, `tools/list`, a `tools/call` that compiles a tiny plan, and a resource read.
 *
 *   npm run prove:mcpb [-- path/to/archlang-mcp-<v>.mcpb]
 *
 * Exits non-zero on any mismatch. Heavy (npx + a child server), so it is a CI/release
 * step, not part of `npm run check`.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MCPB_CLI_VERSION } from "./build-mcpb.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(HERE, "..", "..", "..", "dist-mcpb");

function defaultBundle(): string {
  const found = readdirSync(OUT_ROOT).filter((f) => f.endsWith(".mcpb"));
  if (found.length !== 1) throw new Error(`prove-mcpb: expected one .mcpb in ${OUT_ROOT}, found ${found.length}`);
  return join(OUT_ROOT, found[0] as string);
}

interface Rpc {
  id?: number;
  result?: any;
  error?: unknown;
}

async function main(): Promise<void> {
  const bundle = resolve(process.argv[2] ?? defaultBundle());
  const dir = mkdtempSync(join(tmpdir(), "archlang-mcpb-"));
  const un = spawnSync(
    `npx --yes @anthropic-ai/mcpb@${MCPB_CLI_VERSION} unpack ${JSON.stringify(bundle)} ${JSON.stringify(dir)}`,
    { stdio: "inherit", shell: true },
  );
  if (un.status !== 0) throw new Error("prove-mcpb: mcpb unpack failed");

  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const cfg = manifest.server.mcp_config as { command: string; args: string[] };
  const args = cfg.args.map((a) => a.replace("${__dirname}", dir));
  console.log(`prove-mcpb: ${cfg.command} ${args.join(" ")}   (cwd ${dir})`);
  const child = spawn(cfg.command, args, { cwd: dir, stdio: ["pipe", "pipe", "inherit"] });

  let buf = "";
  const waiting = new Map<number, (r: Rpc) => void>();
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as Rpc;
      if (msg.id !== undefined) waiting.get(msg.id)?.(msg);
    }
  });
  let seq = 0;
  const rpc = (method: string, params: unknown): Promise<any> =>
    new Promise((res, rej) => {
      const id = ++seq;
      const timer = setTimeout(() => rej(new Error(`prove-mcpb: ${method} timed out`)), 30_000);
      waiting.set(id, (r) => {
        clearTimeout(timer);
        if (r.error) rej(new Error(`prove-mcpb: ${method} → ${JSON.stringify(r.error)}`));
        else res(r.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  const fail = (msg: string): never => {
    child.kill();
    throw new Error(`prove-mcpb: ${msg}`);
  };

  try {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "prove-mcpb", version: "0" },
    });
    console.log("initialize:", JSON.stringify(init.serverInfo));
    if (init.serverInfo.version !== manifest.version) fail("serverInfo.version != manifest.version");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    const { tools } = await rpc("tools/list", {});
    const names: string[] = tools.map((t: { name: string }) => t.name);
    console.log("tools/list:", names.join(", "));
    const declared: string[] = manifest.tools.map((t: { name: string }) => t.name);
    if (JSON.stringify(names) !== JSON.stringify(declared)) fail("manifest tools != served tools");

    const src = 'plan "T" {\n  units mm\n  room id=r1 at (0,0) size 4000x3000 label "Room"\n}\n';
    const call = await rpc("tools/call", { name: "compile", arguments: { source: src } });
    const out = JSON.parse(call.content[0].text);
    console.log(`tools/call compile: ok=${out.ok} format=${out.format} diagnostics=${out.diagnostics.length}`);
    console.log(`  output: ${String(out.output).slice(0, 70)}… (${String(out.output).length} chars)`);
    if (out.ok !== true || !String(out.output).startsWith("<svg")) fail("compile did not return an SVG");

    const spec = await rpc("resources/read", { uri: "archlang://spec" });
    console.log(`resources/read archlang://spec: ${spec.contents[0].text.length} chars`);
    if (spec.contents[0].text.includes("not found")) fail("baked resource missing from the bundle");
  } finally {
    child.kill();
  }
  console.log("prove-mcpb: OK");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
