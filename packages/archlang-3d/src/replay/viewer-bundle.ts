/**
 * The viewer and the parts of three.js it uses as one minified browser script. Run by `tsup.config.ts`
 * for `dist/viewer.iife.js`, and from the source tree by `html.ts` (this repository's tests and
 * `npm run archlang3d`); never by an installed package, so `esbuild` stays a devDependency.
 */
import { build } from "esbuild";

export async function bundleViewer(entry: string): Promise<string> {
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    minify: true,
    legalComments: "none",
    write: false,
    logLevel: "silent",
  });
  return r.outputFiles[0]?.text ?? "";
}
