#!/usr/bin/env node
/**
 * The public check set's runner (card CR10). It runs every case of `check-set.json` through
 * `archlang lint --json` and judges each one pass or fail: the plan must report the case's code
 * and compile with no error, and its twin must not report that code. Exit 0 when every case
 * passes, 1 when one fails, 3 on bad usage. Zero dependencies; Node 18 or later.
 *
 *   node test/check-set/run.mjs                              # npx -y @chanmeng666/archlang lint
 *   node test/check-set/run.mjs --arch "npx archlang"        # an installed CLI
 *   node test/check-set/run.mjs --url https://mcp.archlang.uk/check   # the hosted POST /check
 *
 * `test/check-set.test.ts` judges the cases with {@link judge} against the core's `lintReport`,
 * the document both the CLI and `POST /check` print.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The cases, each plan and twin path resolved against this folder. */
export function loadCases(dir = HERE) {
  const { cases } = JSON.parse(readFileSync(join(dir, "check-set.json"), "utf8"));
  return cases.map((c) => ({ ...c, planPath: join(dir, c.plan), twinPath: join(dir, c.twin) }));
}

/**
 * Why `row` fails on these two `lint --json` documents, one line each; `[]` when it passes. The
 * plan must report `row.expect` and no error; when a reported `row.expect` carries a `rule`, its
 * key is `row.rule` and its profile `row.profile`. The twin must report no error and no `row.expect`.
 */
export function judge(row, plan, twin) {
  const out = [];
  const errors = (doc) => doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  const hits = plan.diagnostics.filter((d) => d.code === row.expect);
  if (errors(plan).length) out.push(`the plan does not compile: ${errors(plan).join(", ")}`);
  if (hits.length === 0) out.push(`the plan does not report ${row.expect}`);
  for (const d of hits) {
    if (!d.rule || row.rule === null) continue;
    if (d.rule.key !== row.rule) out.push(`${row.expect} cites ${d.rule.key}, not ${row.rule}`);
    if (d.rule.profile !== row.profile) out.push(`${row.expect} cites profile ${d.rule.profile}, not ${row.profile}`);
  }
  if (errors(twin).length) out.push(`the twin does not compile: ${errors(twin).join(", ")}`);
  if (twin.diagnostics.some((d) => d.code === row.expect)) out.push(`the twin reports ${row.expect}`);
  return out;
}

/** `archlang lint <file> --json [--profile P]` through `arch`, a command line split on spaces. */
function viaCli(arch, file, profile) {
  const [cmd, ...pre] = arch.split(" ").filter(Boolean);
  const args = [...pre, "lint", file, "--json", ...(profile ? ["--profile", profile] : [])];
  const opts = { encoding: "utf8", maxBuffer: 64 << 20 };
  // A Windows `npx` is a .cmd script, which only a shell starts: hand it one quoted command line.
  const r =
    process.platform === "win32"
      ? spawnSync([cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { ...opts, shell: true })
      : spawnSync(cmd, args, opts);
  if (r.error) throw r.error;
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`\`${arch} lint ${file} --json\` printed no JSON (exit ${r.status}): ${r.stderr.trim()}`);
  }
}

/** The same document from the hosted `POST /check`. */
async function viaUrl(url, file, profile) {
  const source = readFileSync(file, "utf8");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile ? { source, profile } : { source }),
  });
  if (res.status !== 200) throw new Error(`POST ${url} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function main(argv) {
  let arch = "npx -y @chanmeng666/archlang";
  let url;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--arch" && argv[i + 1]) arch = argv[++i];
    else if (argv[i] === "--url" && argv[i + 1]) url = argv[++i];
    else {
      process.stderr.write(`usage: run.mjs [--arch "<command>"] [--url <POST /check URL>]\n`);
      return 3;
    }
  }
  const lintOf = (file, profile) => (url ? viaUrl(url, file, profile) : viaCli(arch, file, profile));
  const cases = loadCases();
  let failed = 0;
  for (const row of cases) {
    const why = judge(row, await lintOf(row.planPath, row.profile), await lintOf(row.twinPath, row.profile));
    if (why.length) failed++;
    process.stdout.write(why.length ? `FAIL ${row.id}: ${why.join("; ")}\n` : `ok   ${row.id}\n`);
  }
  process.stdout.write(`${cases.length - failed} of ${cases.length} cases pass\n`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
