// Measure the hosted Worker's per-tool handler time over examples/ (docs/adr/0026-hosted-mcp-worker.md).
//
//   npm run build && npm -w packages/mcp-worker run build
//   cd packages/mcp-worker && wrangler dev --local --port 8917 --var MEASURE_CPU:1
//   node packages/mcp-worker/scripts/measure-cpu.mjs --base http://127.0.0.1:8917 [--reps 7]
//
// With MEASURE_CPU=1 the Worker reports its own handler time in `x-archlang-handler-ms`
// (performance.now() around the handler, body included). Where the runtime freezes that clock
// during pure computation the header reads ~0, so the client-side wall time of the same request
// is recorded too and the table says which one it used. Local `wrangler dev` runs the same workerd
// as production on a different CPU: treat the numbers as a ranking and an order of magnitude,
// and confirm on workers.dev with the dashboard's CPU-time percentiles before choosing a plan.
//
// Zero dependencies; it never prints a source.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePlanHash } from "../../../src/cli/share-codec.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = (opt("--base", "http://127.0.0.1:8917") ?? "").replace(/\/+$/, "");
const REPS = Number(opt("--reps", "7"));

const examples = readdirSync(join(REPO, "examples"))
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => ({ name: f, source: readFileSync(join(REPO, "examples", f), "utf8") }));

/** A synthetic plan of about `kb` KB: a grid of rooms joined by doors, to see how cost scales. */
function synthetic(kb) {
  const rows = [];
  let i = 0;
  let text = 'plan "Synthetic" {\n  units mm\n';
  while (text.length < kb * 1024 - 200) {
    const x = (i % 20) * 4000;
    const y = Math.floor(i / 20) * 3000;
    const line = `  room id=r${i} at (${x},${y}) size 4000x3000 label "Room ${i}"\n`;
    rows.push(line);
    text += line;
    i++;
  }
  return { name: `synthetic-${kb}kb (${i} rooms)`, source: `${text}}\n` };
}
const SYNTH = [8, 16, 32, 60].map(synthetic);

/**
 * Diagnostic floods (EH1.11, S-F1): sources at (or near) the Worker's 64 KiB cap that each raise thousands
 * of diagnostics, which cost a quadratic line/column scan before the line-start table and the
 * 500-diagnostic cap. One row each in a second table.
 */
function flood(name, unit, kb = 64) {
  const head = 'plan "Flood" {\n';
  const tail = "\n}\n";
  const room = kb * 1024 - head.length - tail.length;
  return { name: `flood: ${name}`, source: head + unit.repeat(Math.ceil(room / unit.length)).slice(0, room) + tail };
}
const FLOODS = [
  flood("@ (one per byte)", "@"),
  // JSON escapes a NUL as six bytes, so 40 KiB keeps the request body under BODY_CAP_BYTES.
  flood("NUL (one per byte, 40 KiB)", "\u0000", 40),
  flood("room with a stray word", "room at (0,0) size 1x1 zzz\n"),
  flood('unclosed zone "a" {', 'zone "a" {\n'),
  flood("let a = 1 (E_REDEF)", "let a = 1\n"),
  flood("1 / 0 in a loop", "for i in 0..600 { let x = 1 / 0 }\n"),
];
const FLOOD_TOOLS = ["compile", "describe", "lint", "validate"];

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let nextId = 1;

async function timed(url, init) {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const body = await res.text();
  const wall = performance.now() - t0;
  const handler = Number(res.headers.get("x-archlang-handler-ms") ?? Number.NaN);
  return { status: res.status, body, wall, handler };
}

const rpc = (method, params) =>
  timed(`${BASE}/mcp`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
const call = (name, a) => rpc("tools/call", { name, arguments: a });

const TOOLS = {
  compile: (s) => call("compile", { source: s }),
  describe: (s) => call("describe", { source: s }),
  lint: (s) => call("lint", { source: s }),
  validate: (s) => call("validate", { source: s, strict: true }),
  score: (s) => call("score", { source: s, brief: {} }),
  repair: (s) => call("repair", { source: s }),
  fix: (s) => call("fix", { source: s }),
  finish: (s) => call("finish", { source: s }),
  suggest: (s) => call("suggest", { source: s }),
  complete: (s) => call("complete", { source: s, at: Math.floor(s.length / 2) }),
  link: (s) => call("link", { source: s }),
};

const samples = {}; // key -> [{ms, source}]
let clock = "handler";
const record = (key, r, label) => {
  // 422 is /svg/'s answer for a plan that does not compile (imports.arch needs a World): measured too.
  if (r.status !== 200 && r.status !== 422) throw new Error(`${key} on ${label}: HTTP ${r.status}`);
  const ms = Number.isFinite(r.handler) && r.handler > 0 ? r.handler : r.wall;
  if (!(Number.isFinite(r.handler) && r.handler > 0)) clock = "wall";
  samples[key] = [...(samples[key] ?? []), { ms, label }];
};

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? Number.NaN;
};

async function main() {
  // Warm the isolate once so the first sample is not module start-up.
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "measure", version: "0" },
  });
  for (let r = 0; r < REPS; r++) {
    record(
      "initialize",
      await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "m", version: "0" },
      }),
      "-",
    );
    record("tools/list", await rpc("tools/list", {}), "-");
  }
  for (const ex of [...examples, ...SYNTH]) {
    const reps = ex.name.startsWith("synthetic") ? Math.min(3, REPS) : REPS;
    for (const [tool, run] of Object.entries(TOOLS)) {
      for (let r = 0; r < reps; r++) record(tool, await run(ex.source), ex.name);
    }
    // /svg/: each repetition a distinct payload (a trailing comment), so every one is a cache miss.
    for (let r = 0; r < reps; r++) {
      const src = `${ex.source}\n# measure ${r} ${Date.now()}\n`;
      record("GET /svg/ (miss)", await timed(`${BASE}/svg/${encodePlanHash(src)}`), ex.name);
    }
  }

  for (const fl of FLOODS) {
    for (const tool of FLOOD_TOOLS) {
      for (let r = 0; r < Math.min(3, REPS); r++) record(tool, await TOOLS[tool](fl.source), fl.name);
    }
  }

  const corpusOnly = (key) =>
    samples[key].filter((s) => !s.label.startsWith("synthetic") && !s.label.startsWith("flood"));
  const rows = Object.keys(samples).map((key) => {
    const all = corpusOnly(key).map((s) => s.ms);
    const worst = corpusOnly(key).reduce((a, b) => (b.ms > a.ms ? b : a), { ms: -1, label: "" });
    const synth = SYNTH.map((sy) => {
      const xs = samples[key].filter((s) => s.label === sy.name).map((s) => s.ms);
      return xs.length ? pct(xs, 50).toFixed(1) : "-";
    });
    return { key, p50: pct(all, 50), p95: pct(all, 95), max: worst.ms, worst: worst.label, synth };
  });
  const f = (n) => n.toFixed(2);
  console.log(
    `clock: ${clock === "handler" ? "x-archlang-handler-ms (inside the Worker)" : "client wall time (handler clock read 0)"}`,
  );
  console.log(
    `corpus: ${examples.length} examples × ${REPS} reps; synthetic p50 at ${SYNTH.map((s) => s.name).join(", ")}`,
  );
  console.log("");
  console.log(
    `| tool | p50 ms | p95 ms | max ms | slowest example | ${SYNTH.map((s) => s.name.split(" ")[0]).join(" | ")} |`,
  );
  console.log(`|---|---:|---:|---:|---|${SYNTH.map(() => "---:").join("|")}|`);
  for (const r of rows)
    console.log(`| ${r.key} | ${f(r.p50)} | ${f(r.p95)} | ${f(r.max)} | ${r.worst} | ${r.synth.join(" | ")} |`);

  console.log("");
  console.log(`| flood | ${FLOOD_TOOLS.map((t) => `${t} p50 ms`).join(" | ")} |`);
  console.log(`|---|${FLOOD_TOOLS.map(() => "---:").join("|")}|`);
  for (const fl of FLOODS) {
    const cells = FLOOD_TOOLS.map((t) => {
      const xs = samples[t].filter((s) => s.label === fl.name).map((s) => s.ms);
      return xs.length ? pct(xs, 50).toFixed(1) : "-";
    });
    console.log(`| ${fl.name} | ${cells.join(" | ")} |`);
  }
}

await main();
