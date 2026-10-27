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
import { timeline } from "./timeline.js";
import type { ReplayPayload } from "./viewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** The label every surface that shows the preview carries (decision D5's wording). */
export const PREVIEW_LABEL = "Preview — from the separate archlang-3d package. ArchLang itself draws plans.";

export interface ReplayOptions {
  title: string;
  /** The core's drawing of the plan (`compile(source).svg`), light theme. */
  svg: string;
  width?: number;
  height?: number;
  seconds?: number;
  /** Exports only: the sites stay light (D11, ADR 0014). */
  theme?: "light" | "dark";
}

/** The `viewBox` of an SVG document, in its user units (plan millimetres for the core's drawing). */
export function viewBoxOf(svg: string): [number, number, number, number] {
  const m = /viewBox="([-\d.\s]+)"/.exec(svg);
  const v = (m?.[1] ?? "").trim().split(/\s+/).map(Number);
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) throw new Error("the drawing has no numeric viewBox");
  return v as [number, number, number, number];
}

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
  }).then((r) => r.outputFiles[0]?.text ?? "");
  return bundled;
}

/** three.js's licence text, from the installed package, for the file's notice. */
function threeLicence(): string {
  // three.js exports no `./package.json`: resolve its entry and walk up to the package root.
  let dir = dirname(require.resolve("three"));
  while (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "LICENSE"))) dir = dirname(dir);
  const version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version;
  return `three.js ${version}\n${readFileSync(join(dir, "LICENSE"), "utf8")}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** A replay of `mesh` as one self-contained HTML document. */
export async function replayHtml(mesh: Mesh3D, opts: ReplayOptions): Promise<string> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const payload: ReplayPayload = {
    title: opts.title,
    theme: opts.theme ?? "light",
    width,
    height,
    seconds: opts.seconds ?? 15,
    svg: opts.svg,
    viewBox: viewBoxOf(opts.svg),
    nodes: mesh.nodes
      .filter((n) => !n.hidden)
      .map((n) => {
        const positions: number[] = [];
        const indices: number[] = [];
        for (const s of n.shells) {
          const base = positions.length / 3;
          positions.push(...s.positions);
          for (const i of s.indices) indices.push(base + i);
        }
        return { key: n.key, kind: n.kind, ...(n.part ? { part: n.part } : {}), positions, indices };
      }),
    events: timeline(mesh),
  };
  // `</` never appears inside the inline JSON or script (it would close the element).
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const script = (await viewerScript()).replace(/<\/script/gi, "<\\/script");
  const bg = payload.theme === "dark" ? "#0f2235" : "#f7f5f0";
  const fg = payload.theme === "dark" ? "#cfe3f5" : "#3d3a36";
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
canvas{max-width:100%;height:auto;display:block}
input[type=range]{width:min(720px,90vw)}
p{margin:0;font-size:12px;opacity:.8}
</style>
</head>
<body>
<main>
<canvas id="archlang-replay" role="img" aria-label="${escapeHtml(`${opts.title}: the plan drawing itself in its authoring order, then rising`)}"></canvas>
<input id="archlang-replay-t" type="range" min="0" max="1" step="0.001" value="0" aria-label="Replay position">
<p>${escapeHtml(PREVIEW_LABEL)}</p>
</main>
<script type="application/json" id="archlang-replay-payload">${json}</script>
<script>${script}</script>
</body>
</html>
`;
}
