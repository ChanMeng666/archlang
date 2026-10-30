/**
 * Proves the tarball a consumer gets, from outside the repository: `npm pack`, install it into an
 * empty project next to a core from npm, and use it only through what it publishes. Run by
 * `release.yml` before the package's publish and by `/release-check`.
 *
 *   npm -w packages/archlang-3d run prove:pack -- --dir <empty dir> [--core <version>]
 *
 * It checks: the file list; `.`, `./browser` and `./node` import under plain Node; `.` and
 * `./browser` bundle for a browser with no Node module; the types resolve under `NodeNext` with no
 * `skipLibCheck`, and `.` and `./node` also without the DOM lib; laneway-house's GLB hashes to the
 * repository's pin; the CLI builds a GLB that passes its checks and names this version; the replay
 * HTML loads nothing from a network and carries the pinned three.js with its notice. Exit 1 on the
 * first failure; the last line of stdout is the JSON summary.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { LANEWAY_GLB_SHA256, PIN_GENERATOR } from "../test/pins.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(PKG, "..", "..");
const NAME = "@chanmeng666/archlang-3d";
const CORE = "@chanmeng666/archlang";
const manifest = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};

const fail = (why: string): never => {
  process.stderr.write(`prove-pack: ${why}\n`);
  process.exit(1);
};
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const dir = resolve(flag("--dir") ?? fail("--dir <empty dir> is required"));
const core = flag("--core") ?? "latest";
mkdirSync(dir, { recursive: true });
if (readdirSync(dir).length > 0) fail(`${dir} is not empty`);

/** The npm running this script (`npm run prove:pack`), by its own entry, so no shell is involved. */
function npm(args: string[], cwd: string): string {
  const cli = process.env.npm_execpath ?? fail("run this through `npm run prove:pack`");
  return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

// The tarball: what a publish would send. Built here, not by `prepack`, whose output would land in
// the JSON on stdout.
npm(["run", "build"], PKG);
const [pack] = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", dir], PKG)) as Array<{
  filename: string;
  size: number;
  unpackedSize: number;
  files: Array<{ path: string }>;
}>;
if (!pack) fail("npm pack returned nothing");
const { filename, size, unpackedSize, files } = pack as NonNullable<typeof pack>;
const paths = files.map((f) => f.path);
const stray = paths.filter((p) => /^(src|test|e2e|scripts)\//.test(p) || /\.ts$/.test(p.replace(/\.d\.ts$/, "")));
if (stray.length > 0) fail(`the tarball carries ${stray.join(", ")}`);
for (const need of ["dist/viewer.iife.js", "dist/scene3d.schema.json", "LICENSE", "README.md", "THIRD_PARTY_NOTICES"])
  if (!paths.includes(need)) fail(`the tarball lacks ${need}`);

// An empty project, with the core from npm: the tarball must not lean on this repository.
writeFileSync(
  join(dir, "package.json"),
  `${JSON.stringify({ name: "prove-pack", private: true, type: "module", version: "0.0.0" }, null, 2)}\n`,
);
npm(["install", "--no-audit", "--no-fund", `./${filename}`, `${CORE}@${core}`], dir);
const installed = join(dir, "node_modules", NAME);
const version = (p: string): string =>
  (JSON.parse(readFileSync(join(dir, "node_modules", p, "package.json"), "utf8")) as { version: string }).version;
const coreVersion = version(CORE);
if (version(NAME) !== manifest.version) fail(`installed ${version(NAME)}, the manifest says ${manifest.version}`);
if (version("three") !== manifest.dependencies.three) fail(`three ${version("three")} is not the pin`);

// Every entry, under plain Node, by its package name.
writeFileSync(
  join(dir, "smoke.mjs"),
  `import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { adaptPlan, ARCHLANG_3D_VERSION, buildMesh, validateScene3D } from "${NAME}";
import { makeNodeWorld, replayFacts, writeGlb } from "${NAME}/node";
import { mountReplay, PREVIEW_LABEL } from "${NAME}/browser";
const base = ${JSON.stringify(join(REPO, "examples"))};
const r = adaptPlan(readFileSync(base + "/laneway-house.arch", "utf8"), { world: makeNodeWorld(base) });
if (!r.ok) throw new Error(r.refusal.code);
if (validateScene3D(r.scene).length > 0) throw new Error("the scene does not validate");
console.log(JSON.stringify({
  version: ARCHLANG_3D_VERSION,
  shells: buildMesh(r.scene).nodes.length,
  pinned: createHash("sha256").update(await writeGlb(buildMesh(r.scene), { generator: ${JSON.stringify(PIN_GENERATOR)} })).digest("hex"),
  mount: typeof mountReplay,
  facts: typeof replayFacts,
  label: PREVIEW_LABEL.length > 0,
}));
`,
);
const smoke = JSON.parse(execFileSync(process.execPath, ["smoke.mjs"], { cwd: dir, encoding: "utf8" })) as {
  version: string;
  shells: number;
  pinned: string;
};
if (smoke.version !== manifest.version) fail(`ARCHLANG_3D_VERSION is ${smoke.version}`);
if (smoke.pinned !== LANEWAY_GLB_SHA256)
  fail(`laneway-house's GLB hashes to ${smoke.pinned}, the pin is ${LANEWAY_GLB_SHA256}`);

// The browser entries: a `node:` module anywhere in their graph fails this bundle.
for (const entry of ["index.js", "browser.js"]) {
  await build({
    entryPoints: [join(installed, "dist", entry)],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    logLevel: "silent",
    external: [CORE],
  }).catch((e: Error) => fail(`dist/${entry} does not bundle for a browser: ${e.message}`));
}

// The published types, as a strict consumer reads them.
writeFileSync(
  join(dir, "types.ts"),
  `import { adaptPlan, type Scene3D } from "${NAME}";
import { makeNodeWorld } from "${NAME}/node";
import { mountReplay, type ReplayHandle } from "${NAME}/browser";
export const used: [typeof adaptPlan, typeof makeNodeWorld, typeof mountReplay] = [adaptPlan, makeNodeWorld, mountReplay];
export type Used = [Scene3D, ReplayHandle];
`,
);
writeFileSync(
  join(dir, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      noEmit: true,
      strict: true,
      target: "es2022",
      module: "nodenext",
      moduleResolution: "nodenext",
      lib: ["es2022", "dom"],
      types: [],
    },
    files: ["types.ts"],
  }),
);
// `.` and `./node` are for Node too: they must check for a project with no DOM lib.
writeFileSync(
  join(dir, "types-node.ts"),
  `import { adaptPlan } from "${NAME}";
import { makeNodeWorld } from "${NAME}/node";
export const used: [typeof adaptPlan, typeof makeNodeWorld] = [adaptPlan, makeNodeWorld];
`,
);
const options = JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"));
options.compilerOptions.lib = ["es2022"];
options.files = ["types-node.ts"];
writeFileSync(join(dir, "tsconfig.node.json"), JSON.stringify(options));
for (const config of ["tsconfig.json", "tsconfig.node.json"]) {
  const tsc = spawnSync(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", config], {
    cwd: dir,
    encoding: "utf8",
  });
  if (tsc.status !== 0) fail(`the published types do not check under ${config}:\n${tsc.stdout}${tsc.stderr}`);
}

// The command, as `npx` finds it.
const cli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [join(installed, "dist/cli.js"), ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) fail(`archlang3d ${args.join(" ")} exited ${r.status}:\n${r.stdout}${r.stderr}`);
  return r.stdout;
};
const example = `node_modules/${CORE}/examples/laneway-house.arch`;
const report = JSON.parse(cli("build", example, "-o", "plan.glb", "--json")) as {
  ok: boolean;
  tool: { version: string };
  outputs: Array<{ bytes: number; sha256: string }>;
};
if (!report.ok || report.tool.version !== manifest.version) fail(`build reported ${JSON.stringify(report.tool)}`);
const checked = JSON.parse(cli("check", "plan.glb", "--json")) as { ok: boolean };
if (!checked.ok) fail("archlang3d check refused the GLB it built");
const glb = readFileSync(join(dir, "plan.glb")).toString("latin1");
if (!glb.includes(`"generator":"archlang-3d ${manifest.version}"`)) fail("the GLB does not name this version");
const schema = cli("schema", "scene3d");
if (schema !== readFileSync(join(PKG, "src/scene3d/scene3d.schema.json"), "utf8"))
  fail("schema differs from the source");

// The replay: one file, three.js inline, nothing fetched.
cli("view", example, "--replay", "-o", "plan.html");
const html = readFileSync(join(dir, "plan.html"), "utf8");
if (/<script[^>]+\bsrc=|<link\b|\bimportScripts\(|<iframe\b/i.test(html))
  fail("the replay HTML loads an external resource");
const host = /\b(cdn\.|unpkg\.com|jsdelivr|cdnjs|esm\.sh|skypack)/i.exec(html);
if (host) fail(`the replay HTML names ${host[0]}`);
if (!html.includes(`three.js ${manifest.dependencies.three}`)) fail("the replay HTML lacks three.js's notice");
if (!html.includes(readFileSync(join(installed, "dist/viewer.iife.js"), "utf8").slice(0, 2000)))
  fail("the replay HTML does not inline the shipped viewer");

const distBytes = (d: string): number =>
  readdirSync(d).reduce((n, f) => {
    const p = join(d, f);
    return n + (statSync(p).isDirectory() ? distBytes(p) : statSync(p).size);
  }, 0);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    tarball: relative(REPO, join(dir, filename)),
    tarballBytes: size,
    unpackedBytes: unpackedSize,
    distBytes: distBytes(join(installed, "dist")),
    files: paths.length,
    core: coreVersion,
    three: version("three"),
    meshNodes: smoke.shells,
    glb: report.outputs[0],
    pinnedDigest: smoke.pinned,
    htmlBytes: html.length,
  })}\n`,
);
