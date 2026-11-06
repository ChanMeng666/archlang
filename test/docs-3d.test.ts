/**
 * The docs site's 3D preview (public-surfaces card X6): the home band, the gallery cards' 2D/3D
 * swap and the `/3d` page.
 *
 * What it holds, each derived from its source rather than retyped:
 * - the components show the package's lines through the data module, never typed (that
 *   `docs-site/three-d.mjs` reads them exactly, and that the /3d page's commands are the CLI's, is
 *   packages/archlang-3d/test/docs-site.test.ts, which can import the package);
 * - the plans, files and links come from `docs-site/public/3d/manifest.json` (gen:3d-assets), every
 *   route exists, and a GLB the manifest does not record as validator-clean fails the build;
 * - no component names a 3D file; the band sits right after the hero; `/3d` is in PAGE_META, the
 *   nav and the sidebar.
 * The wording bans live with the rest of the copy guardrails, in test/docs-home-copy.test.ts.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { has3dFlag, hasEditFlag, srcFromHash, VIEW3D_FLAG } from "../playground/src/share.js";

// Plain `.mjs` modules (no declaration file): loaded by a computed specifier, as
// test/site-markdown.test.ts loads its siblings.
const THREE_D = "../docs-site/three-d.mjs";
const hasDeflateRaw = (): boolean => {
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
};
const PERMALINK = "../scripts/gen-permalink.mjs";
const { encodePlanHash } = (await import(/* @vite-ignore */ PERMALINK)) as {
  encodePlanHash: (source: string) => string;
};
type Asset = {
  name: string;
  source: string;
  poster: { webp: string; png: string; width: number; height: number; storey: string | null };
  video: { mp4: string; width: number; height: number } | null;
  glb: { href: string; bytes: number; doors: string };
};
const T = (await import(/* @vite-ignore */ THREE_D)) as {
  PAYLOAD: string;
  MANIFEST: string;
  HOME_3D_PLAN: string;
  VIEW3D_PARAM: string;
  PREVIEW_DOWNLOAD: string;
  previewLines: (repo: string) => {
    lead: string;
    title: string;
    rest: string;
    label: string;
    limits: string;
    download: string;
  };
  threeDAssets: (repo: string) => Asset[];
};

const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const THEME = "docs-site/.vitepress/theme";
const REPO = process.cwd();
const page = read("docs-site/3d.md");

describe("the components show the package's lines, never typed", () => {
  it("the /3d page's lines come through PreviewLine.vue", () => {
    const p = T.previewLines(REPO);
    expect(page).toMatch(/^<PreviewLine which="label" \/>$/m);
    expect(page).toMatch(/^<PreviewLine which="limits" \/>$/m);
    expect(page).not.toContain(p.limits);
    expect(page).not.toContain(p.rest);
    // The limits sit above the plans (V2 round 1): a reader meets them before any 3D picture.
    expect(page.indexOf('<PreviewLine which="limits" />')).toBeLessThan(page.indexOf("<ThreeDPlans />"));
    expect(page.indexOf('<PreviewLine which="limits" />')).toBeLessThan(page.indexOf("Heights are assumed where"));
    expect(page.indexOf("Heights are assumed where")).toBeLessThan(page.indexOf("<ThreeDPlans />"));
    const line = read(`${THEME}/PreviewLine.vue`);
    expect(line).toContain("{{ PREVIEW.lead }}");
    expect(line).toContain("{{ PREVIEW.limits }}");
  });

  it("the home band shows the lead as its heading, the rest of the line and the limits line", () => {
    const band = read(`${THEME}/SameSource.vue`);
    expect(band).toContain("{{ PREVIEW.title }}");
    expect(band).toContain("{{ PREVIEW.rest }}");
    expect(band).toContain("{{ PREVIEW.limits }}");
  });

  it("the home gallery carries the limits line under its grid, from the data module", () => {
    const gallery = read(`${THEME}/HomeGallery.vue`);
    expect(gallery).toMatch(/import \{[^}]*\bPREVIEW\b[^}]*\} from "\.\/three-d-data\.js"/);
    expect(gallery).toMatch(/<\/ul>\s*<p v-if="[^"]+" class="home-gallery__limits">\{\{ PREVIEW\.limits \}\}<\/p>/);
  });
});

describe("the plans come from the 3D manifest", () => {
  const assets = T.threeDAssets(REPO);
  const manifest = JSON.parse(read(T.MANIFEST)) as { assets: Array<{ name: string }> };

  it("every manifest entry, in order, with every route on disk", () => {
    expect(assets.map((a) => a.name)).toEqual(manifest.assets.map((a) => a.name));
    expect(assets.length).toBeGreaterThanOrEqual(6);
    for (const a of assets) {
      for (const route of [a.poster.webp, a.poster.png, a.video?.mp4, a.glb.href].filter((r): r is string => !!r)) {
        expect(route, a.name).toMatch(/^\/3d\//);
        expect(existsSync(join("docs-site/public", route)), `${a.name}: ${route}`).toBe(true);
      }
      expect(a.source).toBe(`examples/${a.name}.arch`);
      expect(existsSync(a.source)).toBe(true);
      expect(a.glb.doors).toBe("closed");
    }
  });

  it("the home band's plan is one of them", () => {
    expect(assets.map((a) => a.name)).toContain(T.HOME_3D_PLAN);
  });

  it("a GLB the manifest does not record as validator-clean is a build error (so the page's claim holds)", () => {
    expect(page).toContain("Khronos glTF Validator with 0 errors and 0 warnings");
    const dir = mkdtempSync(join(tmpdir(), "docs-3d-"));
    const bad = JSON.parse(read(T.MANIFEST));
    bad.assets[0].glb.validator.warnings = 1;
    mkdirSync(join(dir, "docs-site/public/3d"), { recursive: true });
    writeFileSync(join(dir, T.MANIFEST), JSON.stringify(bad));
    expect(() => T.threeDAssets(dir)).toThrow(/0 validator errors and 0 warnings/);
  });

  it("no component names a 3D file: they read ASSETS_3D", () => {
    const files = (JSON.parse(read(T.MANIFEST)) as { assets: Array<{ files: Array<{ path: string }> }> }).assets
      .flatMap((a) => a.files)
      .map((f) => f.path);
    for (const f of ["SameSource.vue", "ThreeDPlans.vue", "HomeGallery.vue"]) {
      const src = read(`${THEME}/${f}`);
      expect(src, f).toMatch(/import \{[^}]*\bASSETS_3D\b[^}]*\} from "\.\/three-d-data\.js"/);
      expect(src, f).not.toMatch(/["'`]\/3d\//);
      for (const p of files) expect(src, `${f} names ${p}`).not.toContain(p);
    }
    expect(read("docs-site/sync-docs.mjs")).toMatch(/threeDAssets\(repo\)/);
  });

  it("the 3D flag is the playground's own (card X5), and a link built with it opens the 3D preview", async () => {
    expect(T.VIEW3D_PARAM).toBe(VIEW3D_FLAG);
    // The links the band and /3d carry: the plan's `#z=` token, then the flag. The playground's
    // own readers see the 3D flag and the same plan, and not edit mode.
    const source = read(`examples/${T.HOME_3D_PLAN}.arch`);
    const hash = `#z=${encodePlanHash(source)}&${T.VIEW3D_PARAM}`;
    expect(has3dFlag(hash)).toBe(true);
    expect(hasEditFlag(hash)).toBe(false);
    // Node 18 ships `DecompressionStream` without "deflate-raw" (added in 21.2), as test/cli-link.test.ts says.
    if (hasDeflateRaw()) expect((await srcFromHash(hash))?.replace(/\r\n/g, "\n")).toBe(source);
    // A canary: without the flag the same reader says no.
    expect(has3dFlag(`#z=${encodePlanHash(source)}`)).toBe(false);
  });
});

describe("where the 3D preview sits on the site", () => {
  it("the band comes right after the hero, before the Why cards", () => {
    const home = read("docs-site/index.md");
    const body = home.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    expect(body.startsWith("<SameSource />\n\n<WhyCards />")).toBe(true);
    expect(read(`${THEME}/home.css`)).toContain(".VPHome .vp-doc .same-source,");
  });

  it("/3d is in PAGE_META, the Docs menu and the sidebar", () => {
    const config = read("docs-site/.vitepress/config.ts");
    const row = /\[\s*"\/3d",\s*"([^"]+)",\s*"([^"]+)",?\s*\]/.exec(config);
    expect(row, "PAGE_META has no /3d row").toBeTruthy();
    expect(row![1]).toContain("3D preview");
    expect(row![1]).toContain("floor plan");
    expect(`${row![1]} ${row![2]}`, "topic wording, no keyword chase").not.toMatch(/3D floor plan generator/i);
    const nav = /nav: \[([\s\S]*?)\n {4}\],\n {4}sidebar:/.exec(config)?.[1] ?? "";
    const docs = /text: "Docs",([\s\S]*)/.exec(nav)?.[1] ?? "";
    expect(docs).toContain('link: "/3d"');
    const sidebar = /sidebar: \[([\s\S]*?)\n {4}\],/.exec(config)?.[1] ?? "";
    expect(sidebar).toContain('link: "/3d"');
  });

  it("sync-docs publishes /3d.md and its raw copy is gitignored", () => {
    expect(read("docs-site/sync-docs.mjs")).toContain('["docs-site/3d.md", "3d.md"],');
    expect(read("docs-site/.gitignore")).toMatch(/^public\/3d\.md$/m);
    expect(read("docs-site/.gitignore")).toMatch(/^\.vitepress\/theme\/three-d-data\.js$/m);
  });
});
