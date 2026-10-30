// Plan JSON -> .arch source, through the library's `planJsonToArch` (the CLI compiles Plan JSON
// with `--from-json` but has no `.arch` output). Usage: node json_to_arch.mjs plan.json > plan.arch
import { readFileSync } from "node:fs";
import { planJsonToArch } from "@chanmeng666/archlang";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("usage: node json_to_arch.mjs <plan.json>");
  process.exit(3);
}
const { source, diagnostics } = planJsonToArch(JSON.parse(readFileSync(file, "utf8")));
for (const d of diagnostics) console.error(`${d.severity} ${d.code}: ${d.message}`);
if (source === undefined) process.exit(2);
process.stdout.write(source);
