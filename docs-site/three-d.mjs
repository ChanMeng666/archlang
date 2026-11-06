// The 3D preview on the docs site (public-surfaces card X6), read rather than retyped: the PS-D12
// line and the limits line from the package's own constants (`PREVIEW_LEAD`, `PREVIEW_LABEL`,
// `PREVIEW_LIMITS` in packages/archlang-3d/src/replay/payload.ts, the strings the playground tab
// and the replay HTML carry), and the plans' posters, replays and GLBs from the manifest
// `npm run gen:3d-assets` writes beside them. sync-docs.mjs turns both into the theme's data module
// (`three-d-data.js`), and site-markdown.mjs reads them for the raw `/index.md` and `/3d.md`, so
// the components, the raw copies and the tests all read one source.
//
// Pure apart from reading the repo; the payload module is TypeScript, so its three string
// constants are read out of its text (packages/archlang-3d/test/docs-site.test.ts holds them equal
// to the real exports), as is the playground's 3D hash flag.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package module that declares the preview's lines. */
export const PAYLOAD = "packages/archlang-3d/src/replay/payload.ts";
/** The manifest gen:3d-assets writes beside the assets it lists. */
export const MANIFEST = "docs-site/public/3d/manifest.json";
/** The site route the assets are served under (`docs-site/public/3d/`). */
export const ASSET_ROUTE = "/3d";

/** The playground module that declares its hash flags. */
export const SHARE = "playground/src/share.ts";

/**
 * The hash param that opens the playground on the 3D preview, after the plan (`#z=<token>&3d`):
 * the playground's own `VIEW3D_FLAG` (card X5), read out of its source beside this file.
 */
export const VIEW3D_PARAM = stringConstant(
  readFileSync(fileURLToPath(new URL(`../${SHARE}`, import.meta.url)), "utf8"),
  "VIEW3D_FLAG",
  SHARE,
);

/** The plan the home page's band shows, its drawing beside its replay. */
export const HOME_3D_PLAN = "furnished-flat";

/**
 * The PS-D12 line's last sentence, which the plan (`docs/plans/public-surfaces/3d.md` §2) adds
 * where a surface offers the download; payload.ts says so beside `PREVIEW_LABEL`, and
 * packages/archlang-3d/test/docs-site.test.ts holds the plan's line equal to `PREVIEW_LABEL` plus
 * this.
 */
export const PREVIEW_DOWNLOAD = "You can also download it as a validated GLB.";

/** One `export const NAME = "…";` string constant out of TypeScript source, or a build error. */
function stringConstant(src, name, file = PAYLOAD) {
  const m = new RegExp(`export const ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)";`).exec(src);
  if (!m) throw new Error(`three-d: cannot find \`export const ${name} = "…";\` in ${file}`);
  return JSON.parse(`"${m[1]}"`);
}

/**
 * The preview's lines: `lead` is the PS-D12 line's first sentence (a host sets it as a heading or
 * in bold), `rest` the remainder of `PREVIEW_LABEL`, `limits` the limits line.
 * @param {string} repo the repository root
 */
export function previewLines(repo) {
  const src = readFileSync(join(repo, PAYLOAD), "utf8");
  const lead = stringConstant(src, "PREVIEW_LEAD");
  const label = stringConstant(src, "PREVIEW_LABEL");
  const limits = stringConstant(src, "PREVIEW_LIMITS");
  if (!label.startsWith(lead)) throw new Error(`three-d: PREVIEW_LABEL no longer starts with PREVIEW_LEAD`);
  return {
    lead,
    title: lead.replace(/\.$/, ""),
    rest: label.slice(lead.length).trim(),
    label,
    limits,
    download: PREVIEW_DOWNLOAD,
  };
}

/**
 * @typedef {{
 *   name: string,
 *   source: string,
 *   poster: { webp: string, png: string, width: number, height: number, storey: string | null },
 *   video: { mp4: string, width: number, height: number } | null,
 *   glb: { href: string, bytes: number, doors: string },
 * }} Asset3D
 */

/**
 * Every plan the manifest lists, in its order, with the routes of its files. Each route is one the
 * manifest's own `files` list names; a missing one is a build error, never a broken image.
 * @param {string} repo the repository root
 * @returns {Asset3D[]}
 */
export function threeDAssets(repo) {
  const manifest = JSON.parse(readFileSync(join(repo, MANIFEST), "utf8"));
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error(`three-d: ${MANIFEST} lists no assets`);
  }
  return manifest.assets.map((a) => {
    const files = new Map(a.files.map((f) => [f.path, f]));
    const only = (ext) => {
      const hits = a.files.filter((f) => f.path.endsWith(ext));
      if (hits.length !== 1) throw new Error(`three-d: ${a.name} lists ${hits.length} ${ext} files in ${MANIFEST}`);
      return hits[0];
    };
    const named = (path) => {
      if (!files.has(path)) throw new Error(`three-d: ${a.name}'s ${path} is not in ${MANIFEST}'s files`);
      return `${ASSET_ROUTE}/${path}`;
    };
    // The poster is the one named `poster` (a storeyed plan adds `poster-full`, the assembled view).
    const poster = a.posters.find((p) => p.file === "poster");
    if (!poster) throw new Error(`three-d: ${a.name} has no \`poster\` in ${MANIFEST}`);
    if (a.source.external) throw new Error(`three-d: ${a.name}'s source is outside the repository`);
    const example = /^examples\/([a-z0-9-]+)\.arch$/.exec(a.source.path)?.[1];
    if (example !== a.name)
      throw new Error(`three-d: ${a.name}'s source ${a.source.path} is not examples/${a.name}.arch`);
    // A plan generated with `video: false` (the gallery's) has a poster and a GLB but no replay.
    const mp4s = a.files.filter((f) => f.path.endsWith(".mp4"));
    if (mp4s.length > 1) throw new Error(`three-d: ${a.name} lists ${mp4s.length} .mp4 files in ${MANIFEST}`);
    if (mp4s.length === 1 && !a.video)
      throw new Error(`three-d: ${a.name} lists an .mp4 but no \`video\` in ${MANIFEST}`);
    const glb = only(".glb");
    if (a.glb?.validator?.errors !== 0 || a.glb.validator.warnings !== 0) {
      throw new Error(`three-d: ${a.name}'s GLB is not recorded with 0 validator errors and 0 warnings`);
    }
    return {
      name: a.name,
      source: a.source.path,
      poster: {
        webp: named(`${a.name}.${poster.file}.webp`),
        png: named(`${a.name}.${poster.file}.png`),
        width: poster.width,
        height: poster.height,
        // `all`, or `storey:<n>` (1 = the lowest) when the poster shows one storey alone.
        storey: /^storey:(\d+)$/.exec(poster.view)?.[1] ?? null,
      },
      video:
        mp4s.length === 1
          ? { mp4: `${ASSET_ROUTE}/${mp4s[0].path}`, width: a.video.width, height: a.video.height }
          : null,
      glb: { href: `${ASSET_ROUTE}/${glb.path}`, bytes: glb.bytes, doors: a.glb.doors },
    };
  });
}

/** `bytes` as the GLB link states it: kilobytes (1000 bytes), whole. */
export function sizeLabel(bytes) {
  return `${Math.round(bytes / 1000)} kB`;
}
