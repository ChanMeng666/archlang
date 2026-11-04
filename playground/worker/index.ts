/**
 * The playground Worker's entry (`main` in `playground/wrangler.jsonc`, ADR 0034): the share
 * handler over the built core. wrangler bundles this file, aliasing `archlang` to `../dist/index.js`
 * exactly as the Vite build does, so the Worker reads plans with the same compiler the page runs.
 *
 * The card renderer is resvg-wasm over its own `.wasm` (a compiled module, as wrangler imports a
 * `.wasm` file) and the core's bundled face, `assets/fonts/Roboto-Regular.ttf` (a `Data` module,
 * the `rules` entry in wrangler.jsonc): the font the core's PNG and PDF backends embed.
 */
import * as resvg from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { compile, diagnosticToJson, inputTooLarge, rateLimited } from "archlang";
import roboto from "../../assets/fonts/Roboto-Regular.ttf";
import { makeShareWorker } from "./app.js";
import { resvgRasterizer } from "./preview.js";

export default makeShareWorker(
  { compile, diagnosticToJson, inputTooLarge, rateLimited },
  {
    rasterize: resvgRasterizer(resvg, resvgWasm, new Uint8Array(roboto)),
    cache: (globalThis as { caches?: { default?: Cache } }).caches?.default,
  },
);
