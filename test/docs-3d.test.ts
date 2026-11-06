/**
 * The docs site's 3D preview (public-surfaces card X6): the home band, the gallery cards' 2D/3D
 * swap and the `/3d` page.
 *
 * What it holds, each derived from its source rather than retyped:
 * - the words are the package's own: `docs-site/three-d.mjs` reads `PREVIEW_LEAD`, `PREVIEW_LABEL`
 *   and `PREVIEW_LIMITS` out of payload.ts's text, so this compares that reading with the real
 *   exports, and the plan's PS-D12 line (`docs/plans/public-surfaces/3d.md` §2) with them plus the
 *   download sentence;
 * - the plans, files and links come from `docs-site/public/3d/manifest.json` (gen:3d-assets), every
 *   route exists, and a GLB the manifest does not record as validator-clean fails the build;
 * - no component names a 3D file; the band sits right after the hero; `/3d` is in PAGE_META, the
 *   nav and the sidebar;
 * - every `npx -y @chanmeng666/archlang-3d <cmd> --flag` on the page is a flag that command
 *   declares in the package's manifest table.
 * The wording bans live with the rest of the copy guardrails, in test/docs-home-copy.test.ts.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../packages/archlang-3d/src/cli/manifest.js";
import { PREVIEW_LABEL, PREVIEW_LEAD, PREVIEW_LIMITS } from "../packages/archlang-3d/src/replay/payload.js";

// A plain `.mjs` module (no declaration file): loaded by a computed specifier, as
// test/site-markdown.test.ts loads its siblings.
const THREE_D = "../docs-site/three-d.mjs";
type Asset = {
  name: string;
  source: string;
  poster: { webp: string; png: string; width: number; height: number; storey: string | null };
  video: { mp4: string; width: number; height: number };
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

describe("the words are the package's own", () => {
  it("three-d.mjs reads the three constants exactly as payload.ts exports them", () => {
    const p = T.previewLines(REPO);
    expect(p.lead).toBe(PREVIEW_LEAD);
    expect(p.label).toBe(PREVIEW_LABEL);
    expect(p.limits).toBe(PREVIEW_LIMITS);
    expect(`${p.lead} ${p.rest}`).toBe(PREVIEW_LABEL);
    expect(p.title).toBe(PREVIEW_LEAD.replace(/\.$/, ""));
  });

  it("the plan's PS-D12 line is PREVIEW_LABEL plus the download sentence, and its limits line PREVIEW_LIMITS", () => {
    const plan = read("docs/plans/public-surfaces/3d.md");
    /** The blockquote after `intro`, as plain text (no `>`, bold or code marks). */
    const quote = (intro: string): string => {
      const at = plan.indexOf(intro);
      expect(at, `3d.md no longer says "${intro}"`).toBeGreaterThan(0);
      const lines = plan.slice(at + intro.length).split("\n");
      const start = lines.findIndex((l) => l.startsWith("> "));
      const body: string[] = [];
      for (const l of lines.slice(start)) {
        if (!l.startsWith(">")) break;
        body.push(l.replace(/^>\s?/, ""));
      }
      return body
        .join(" ")
        .replace(/\*\*|`/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    expect(quote("The line every surface uses:")).toBe(`${PREVIEW_LABEL} ${T.PREVIEW_DOWNLOAD}`);
    expect(quote("The limits line, always near a 3D view:")).toBe(PREVIEW_LIMITS);
  });

  it("the /3d page carries both lines through the component, never typed", () => {
    expect(page).toMatch(/^<PreviewLine which="label" \/>$/m);
    expect(page).toMatch(/^<PreviewLine which="limits" \/>$/m);
    expect(page).not.toContain(PREVIEW_LIMITS);
    expect(page).not.toContain(PREVIEW_LABEL.slice(PREVIEW_LEAD.length).trim());
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
});

describe("the plans come from the 3D manifest", () => {
  const assets = T.threeDAssets(REPO);
  const manifest = JSON.parse(read(T.MANIFEST)) as { assets: Array<{ name: string }> };

  it("every manifest entry, in order, with every route on disk", () => {
    expect(assets.map((a) => a.name)).toEqual(manifest.assets.map((a) => a.name));
    expect(assets.length).toBeGreaterThanOrEqual(6);
    for (const a of assets) {
      for (const route of [a.poster.webp, a.poster.png, a.video.mp4, a.glb.href]) {
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

  it("the playground's 3D flag is the playground's own, once it declares one (card X5)", () => {
    const declared = /export const VIEW3D_FLAG = "([^"]+)"/.exec(read("playground/src/share.ts"))?.[1];
    if (declared !== undefined) expect(T.VIEW3D_PARAM).toBe(declared);
    expect(T.VIEW3D_PARAM).toBe("3d");
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

describe("the /3d page's commands are the package's", () => {
  const flags = new Map(
    COMMANDS.map((c) => [c.name, new Set(["--help", "-h", ...c.flags.flatMap((f) => [f.flag, f.alias ?? f.flag])])]),
  );
  const invocation = /npx -y @chanmeng666\/archlang-3d\s+([a-z][a-z-]*)((?:\s+[^\n`|]*)?)/g;
  const usages = [...page.matchAll(invocation)];

  it("names the replay and the GLB commands", () => {
    expect(usages.map((u) => u[1])).toEqual(["view", "build"]);
  });

  it("every flag is one that command declares", () => {
    for (const [, cmd, rest] of usages) {
      const declared = flags.get(cmd!);
      expect(declared, `\`${cmd}\` is not an archlang3d command`).toBeTruthy();
      for (const f of (rest ?? "").match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? []) {
        expect(declared!.has(f), `\`archlang3d ${cmd} … ${f}\` is not a flag of \`${cmd}\``).toBe(true);
      }
    }
    // The flags the prose names, too (`build --doors plan`, `build --json`).
    for (const [, cmd, f] of page.matchAll(/`(view|build) (--[a-z-]+)/g)) {
      expect(flags.get(cmd!)?.has(f!), `\`${cmd} ${f}\``).toBe(true);
    }
  });

  it("never a prompting npx, an unscoped bin or a bare `arch`", () => {
    expect(page).not.toMatch(/npx (?!-y )\S*archlang/);
    expect(page).not.toMatch(/npx -y archlang3d/);
    expect(page).not.toMatch(/(?<![\w./@-])arch\s+[a-z]/);
  });
});
