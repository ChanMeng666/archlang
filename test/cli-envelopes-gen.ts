/**
 * Take the CLI envelope table (`./tables/cli-envelopes.json`) in one command:
 *
 *     npx tsx test/cli-envelopes-gen.ts "<why, and on which commit>" [--allow-removal]
 *
 * It runs the inputs of `./cli-contract-cases.ts` (the same ones `cli-contract.test.ts` runs) and
 * records the top-level `--json` key set of each, with the reason in `_reason`. The table is
 * additive-only: a key that disappeared from an envelope is a breaking change for every agent that
 * reads it, so the generator refuses to write it unless `--allow-removal` says the removal is meant
 * (and then the reason should name it).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CliIo, RESIDENT } from "../src/cli/io.js";
import { runCli } from "../src/cli/run.js";
import { buildManifest } from "../src/index.js";
import { type Run, SCENARIOS, observe, setup } from "./cli-contract-cases.js";

const TABLE = "test/tables/cli-envelopes.json";
const why = process.argv[2];
if (!why || why.startsWith("--")) {
  process.stderr.write('usage: npx tsx test/cli-envelopes-gen.ts "<why, and on which commit>" [--allow-removal]\n');
  process.exit(3);
}
const allowRemoval = process.argv.includes("--allow-removal");

const run: Run = async (args) => {
  let out = "";
  let err = "";
  const io: CliIo = {
    stdout: {
      write: (c) => {
        out += typeof c === "string" ? c : Buffer.from(c).toString("utf8");
      },
    },
    stderr: {
      write: (c) => {
        err += typeof c === "string" ? c : Buffer.from(c).toString("utf8");
      },
    },
    readStdin: () => Buffer.alloc(0),
    cwd: () => process.cwd(),
    env: process.env,
  };
  const r = await runCli(args, io);
  if (r === RESIDENT) throw new Error(`\`${args.join(" ")}\` stayed resident`);
  return { status: r, stdout: out, stderr: err };
};

const dir = mkdtempSync(join(tmpdir(), "arch-envelopes-"));
setup(dir);
const rows: Record<string, string[]> = {};
try {
  for (const c of buildManifest("0.0.0").commands)
    for (const s of SCENARIOS) {
      const o = await observe(run, dir, c.name, s);
      if (o?.keys) rows[o.key] = o.keys;
    }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

let old: Record<string, string[]> = {};
try {
  old = (JSON.parse(readFileSync(TABLE, "utf8")) as { rows: Record<string, string[]> }).rows;
} catch {
  // first take
}
const lost = Object.entries(old).flatMap(([k, keys]) =>
  keys.filter((x) => !(rows[k] ?? []).includes(x)).map((x) => `${k}: ${x}`),
);
if (lost.length > 0 && !allowRemoval) {
  process.stderr.write(
    `refusing to write the table; these keys are gone (pass --allow-removal if meant):\n  ${lost.join("\n  ")}\n`,
  );
  process.exit(1);
}
/** A row as Biome prints it, so the table passes `biome check`: an array on one line when it fits in 120 columns (biome.jsonc lineWidth). */
const rowText = (key: string, keys: string[]): string => {
  const head = `    ${JSON.stringify(key)}: `;
  const inline = `${head}[${keys.map((k) => JSON.stringify(k)).join(", ")}]`;
  if (inline.length + 1 <= 120) return inline;
  return `${head}[\n${keys.map((k) => `      ${JSON.stringify(k)}`).join(",\n")}\n    ]`;
};
const text = `{\n  "_reason": ${JSON.stringify(why)},\n  "rows": {\n${Object.entries(rows)
  .map(([k, v]) => rowText(k, v))
  .join(",\n")}\n  }\n}\n`;
writeFileSync(TABLE, text);
process.stderr.write(`wrote ${Object.keys(rows).length} rows to ${TABLE}\n`);
