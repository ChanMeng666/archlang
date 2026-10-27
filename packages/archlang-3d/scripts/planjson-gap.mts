// For every example, compare what the resolved plan holds (the library API) with what Plan JSON
// (`compile -f json`, i.e. planToJson) carries, and fingerprint the Plan JSON so two core commits can be
// compared. Reproduces the "13 of 32 need information Plan JSON lacks" count of v0.1-v0.5 and re-measures
// it on any core checkout.
// Usage: npx tsx packages/archlang-3d/scripts/planjson-gap.mts <core-root> [out.json]
// A measuring script over a core CHECKOUT (it reads `src/` and private IR fields on purpose); never
// imported by the package.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const outFile = process.argv[3];
// A file URL, not a bare path: `import("D:\…")` reads the drive letter as a URL scheme on Windows
// (the spike's original fails there; `docs/plans/archlang-3d/spike/src/planjson_gap.mts` is kept as run).
const src = (p: string) => import(pathToFileURL(path.join(root, "src", p)).href);
const { resolvePlan } = await src("analyze.ts");
const { planToJson } = await src("plan-json.ts");
const { makeVirtualWorld } = await src("world.ts");

const exDir = path.join(root, "examples");
const files: Record<string, string> = {};
const libDir = path.join(exDir, "lib");
if (existsSync(libDir)) {
  readdirSync(libDir).forEach((f) => {
    files[`lib/${f}`] = readFileSync(path.join(libDir, f), "utf8");
  });
}
const exampleNames = readdirSync(exDir)
  .filter((f) => f.endsWith(".arch"))
  .sort();
exampleNames.forEach((f) => {
  files[f] = readFileSync(path.join(exDir, f), "utf8");
});
const world = makeVirtualWorld(files);

// Element kinds that Plan JSON has no member for (schema description: vertical circulation is not projected;
// the roof ring, void, outdoor surfaces and fences are not members either).
const vertical = ["stair", "elevator", "escalator", "void", "roof", "outdoor", "fence"];

type Row = Record<string, unknown>;
const rows: Row[] = [];
exampleNames.forEach((f) => {
  const source = files[f] as string;
  const res = resolvePlan(source, { world });
  const row: Row = { file: f };
  if (!res.ir) {
    row.status = "no-ir";
    rows.push(row);
    return;
  }
  const storeys = res.levels.length > 0 ? res.levels.map((l: { ir: unknown }) => l.ir) : [res.ir];
  const counts: Record<string, number> = {};
  let arcWalls = 0;
  let derivedWalls = 0;
  let instances = 0;
  storeys.forEach((ir: any) => {
    ir.walls.forEach((w: any) => {
      if (w.arcs?.some(Boolean)) arcWalls += 1;
      if (w._derived) derivedWalls += 1;
    });
    ir.elements.forEach((e: any) => {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    });
    instances += ir.instances?.length ?? 0;
  });
  const reasons: string[] = [];
  if (arcWalls > 0) reasons.push("arc");
  if (derivedWalls > 0) reasons.push("derived-walls");
  if (storeys.length > 1) reasons.push("levels");
  vertical.forEach((k) => {
    if (counts[k]) reasons.push(k);
  });
  const pj = planToJson(source, { world });
  const json = pj.json as any;
  const pages = pj.pages as any[] | undefined;
  const text = JSON.stringify({ json: pj.json, pages: pj.pages });
  const jsonWalls = (pages ?? [{ json }]).reduce((n: number, p: any) => n + (p.json?.walls?.length ?? 0), 0);
  Object.assign(row, {
    status: "ok",
    levels: storeys.length,
    arcWalls,
    derivedWalls,
    instances,
    needsBeyondPlanJson: reasons,
    planJson: {
      ok: Boolean(pj.json),
      refused: pj.json ? undefined : (pj.diagnostics ?? []).map((d: any) => d.code ?? d.message).slice(0, 2),
      walls: jsonWalls,
      wallsFromRoomsStatement: (pages ?? [{ json }]).some((p: any) => Boolean(p.json?.walls_from_rooms)),
      carriesComponents: (pages ?? [{ json }]).some((p: any) => Boolean(p.json?.components)),
      pages: pages?.length ?? 0,
      sha1: createHash("sha1").update(text).digest("hex").slice(0, 12),
    },
  });
  rows.push(row);
});

const needs = rows.filter((r) => r.status === "ok" && (r.needsBeyondPlanJson as string[]).length > 0);
const compilable = rows.filter((r) => r.status === "ok");
const summary = {
  commitNote: "run `git rev-parse HEAD` in the checkout",
  examples: rows.length,
  resolved: compilable.length,
  needBeyondPlanJson: needs.length,
  needFiles: needs.map((r) => r.file),
  derivedWallPlans: compilable.filter((r) => (r.derivedWalls as number) > 0).map((r) => r.file),
  instancePlans: compilable.filter((r) => (r.instances as number) > 0).map((r) => r.file),
  carriesComponents: compilable.filter((r) => (r.planJson as any).carriesComponents).map((r) => r.file),
};
if (outFile) writeFileSync(outFile, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
