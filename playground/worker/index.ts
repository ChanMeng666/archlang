/**
 * The playground Worker's entry (`main` in `playground/wrangler.jsonc`, ADR 0034): the share
 * handler over the built core. wrangler bundles this file, aliasing `archlang` to `../dist/index.js`
 * exactly as the Vite build does, so the Worker reads plans with the same compiler the page runs.
 */
import { compile, diagnosticToJson, inputTooLarge, rateLimited } from "archlang";
import { makeShareWorker } from "./app.js";

export default makeShareWorker({ compile, diagnosticToJson, inputTooLarge, rateLimited });
