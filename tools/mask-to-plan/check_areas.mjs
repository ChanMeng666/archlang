// Compare each region's mask floor area (areas.json, from mask_to_plan.py --areas) with the net
// floor area `describe` reports for the rooms it became. Exit 1 if any differs by more than the
// tolerance (default 2 %). Usage: node check_areas.mjs plan.json areas.json [--tol 0.02]
import { readFileSync } from "node:fs";
import { compile, describe, planJsonToArch } from "@chanmeng666/archlang";

const args = process.argv.slice(2);
const [planFile, areasFile] = args;
const tol = args.includes("--tol") ? Number(args[args.indexOf("--tol") + 1]) : 0.02;
if (!planFile || !areasFile || !(tol >= 0)) {
  console.error("usage: node check_areas.mjs <plan.json> <areas.json> [--tol 0.02]");
  process.exit(3);
}
const { source, diagnostics } = planJsonToArch(JSON.parse(readFileSync(planFile, "utf8")));
if (source === undefined) {
  for (const d of diagnostics) console.error(`${d.code}: ${d.message}`);
  process.exit(2);
}
const errors = compile(source).diagnostics.filter((d) => d.severity === "error");
for (const d of errors) console.error(`${d.code}: ${d.message}`);
if (errors.length > 0) process.exit(2);
const facts = describe(source);
const net = new Map(facts.rooms.map((r) => [r.id, r.net_area_m2 ?? r.area_m2]));
let worst = 0;
for (const reg of JSON.parse(readFileSync(areasFile, "utf8")).regions) {
  const got = reg.rooms.reduce((t, id) => t + (net.get(id) ?? Number.NaN), 0);
  const rel = Math.abs(got - reg.mask_area_m2) / reg.mask_area_m2;
  worst = Math.max(worst, Number.isNaN(rel) ? Infinity : rel);
  console.log(
    `${reg.label.padEnd(12)} mask ${reg.mask_area_m2.toFixed(2).padStart(7)} m2  net ${got.toFixed(2).padStart(7)} m2  ${(rel * 100).toFixed(2)} %  (${reg.rooms.join(", ")})`,
  );
}
console.log(`worst ${(worst * 100).toFixed(2)} % (tolerance ${(tol * 100).toFixed(1)} %)`);
process.exit(worst <= tol ? 0 : 1);
