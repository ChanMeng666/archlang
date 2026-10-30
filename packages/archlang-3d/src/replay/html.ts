/**
 * The single-file replay HTML (card A3): the viewer and three.js 0.186.1 bundled into one inline
 * script (esbuild, browser target, nothing loaded from a network), the mesh, the event table and the
 * core's own SVG as an inline JSON payload, and three.js's MIT notice. It opens offline.
 *
 * Node-only (it bundles at build time); the browser bundle never imports this module.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Mesh3D } from "../mesh/types.js";
import { PREVIEW_LABEL, type ReplayOptions, replayPayload } from "./payload.js";

export { PREVIEW_LABEL, replayPayload, viewBoxOf } from "./payload.js";
export type { ReplayOptions } from "./payload.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let bundled: Promise<string> | undefined;

/** The viewer and the parts of three.js it uses, as one minified browser script (built once). */
export function viewerScript(): Promise<string> {
  bundled ??= build({
    entryPoints: [join(HERE, "viewer.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    minify: true,
    legalComments: "none",
    write: false,
    logLevel: "silent",
  }).then(
    (r) => r.outputFiles[0]?.text ?? "",
    (e: unknown) => {
      bundled = undefined; // a failed build is not cached: the next call tries again
      throw e;
    },
  );
  return bundled;
}

/** three.js's licence text, from the installed package, for the file's notice. */
function threeLicence(): string {
  // three.js exports no `./package.json`: resolve its entry and walk up to the package root.
  let dir = dirname(require.resolve("three"));
  while (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "LICENSE"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("three.js's LICENSE was not found beside its package.json");
    dir = up;
  }
  const version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version;
  return `three.js ${version}\n${readFileSync(join(dir, "LICENSE"), "utf8")}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** A replay of `mesh` as one self-contained HTML document. */
export async function replayHtml(mesh: Mesh3D, opts: ReplayOptions): Promise<string> {
  const payload = replayPayload(mesh, opts);
  // `</` never appears inside the inline JSON or script (it would close the element).
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const script = (await viewerScript()).replace(/<\/script/gi, "<\\/script");
  const bg = payload.theme === "dark" ? "#0f2235" : "#f7f5f0";
  const fg = payload.theme === "dark" ? "#cfe3f5" : "#3d3a36";
  const stripBg = payload.theme === "dark" ? "rgba(15,34,53,.82)" : "rgba(247,245,240,.88)";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} — replay</title>
<!--
${threeLicence().replace(/--/g, "- -")}
-->
<style>
html,body{margin:0;background:${bg};color:${fg};font:14px/1.4 system-ui,sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px}
#archlang-replay-stage{position:relative;container-type:inline-size;max-width:100%}
canvas{max-width:100%;height:auto;display:block}
#archlang-replay-strip{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:0 1.4em;padding:.5em 1em;font-size:clamp(9px,1.7cqw,26px);line-height:1.5;background:${stripBg};color:${fg};pointer-events:none}
#archlang-replay-strip[hidden]{display:none}
input[type=range]{width:min(720px,90vw)}
p{margin:0;font-size:12px;opacity:.8}
</style>
</head>
<body>
<main>
<div id="archlang-replay-stage" style="width:${payload.width}px">
<canvas id="archlang-replay" role="img" aria-label="${escapeHtml(`${opts.title}: the plan drawing itself in its authoring order, then rising`)}"></canvas>${
    payload.facts ? `\n<div id="archlang-replay-strip" role="group" aria-label="Plan facts" hidden></div>` : ""
  }
</div>
<input id="archlang-replay-t" type="range" min="0" max="1" step="0.001" value="0" aria-label="Replay position">
<p>${escapeHtml(PREVIEW_LABEL)}</p>
</main>
<script type="application/json" id="archlang-replay-payload">${json}</script>
<script>${script}</script>
</body>
</html>
`;
}
