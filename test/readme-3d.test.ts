/**
 * The 3D preview on the READMEs (public-surfaces card X7): the PS-D12 line is carried verbatim,
 * the page it points at is linked, every poster image is a shipped asset the manifest lists, and
 * the permanent wording bans hold. The label is read from the package, never retyped.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREVIEW_LABEL } from "../packages/archlang-3d/src/replay/payload.js";

const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const manifest = JSON.parse(read("docs-site/public/3d/manifest.json")) as {
  assets: { name: string; files: { path: string }[] }[];
};
const listed = new Set(manifest.assets.flatMap((a) => a.files.map((f) => f.path)));

const READMES = ["README.md", "packages/mcp/README.md", "editors/vscode/README.md"];

describe.each(READMES)("%s carries the 3D preview honestly", (file) => {
  const text = read(file);
  it("has the PS-D12 line verbatim and a link to /3d", () => {
    expect(text.includes(PREVIEW_LABEL), "PREVIEW_LABEL").toBe(true);
    expect(text).toContain("](https://archlang.uk/3d)");
  });
  it("shows only posters that ship and are listed in the manifest", () => {
    const posters = [...text.matchAll(/docs-site\/public\/3d\/([A-Za-z0-9_.-]+\.png)/g)].map((m) => m[1]!);
    expect(posters.length).toBeGreaterThan(0);
    for (const p of posters) {
      expect(existsSync(`docs-site/public/3d/${p}`), `${p} exists`).toBe(true);
      expect(listed.has(p), `${p} is in manifest.json`).toBe(true);
    }
  });
  it("uses no banned 3D wording on the lines that mention 3D", () => {
    // The READMEs say "render" of the 2D compile elsewhere; the ban is on the 3D claim.
    const lines = text
      .split("\n")
      .filter((l) => /3D|archlang-3d/.test(l))
      .join("\n");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).not.toMatch(/\b(3D CAD|walkthroughs?|photo-?real\w*|renders?|rendering)\b/i);
    expect(lines).not.toMatch(/\b(BIM-ready|BIM model|CAD model)\b/i);
  });
});

describe("the root README's plan and 3D pairs", () => {
  const text = read("README.md");
  it("opens each 3D poster in the playground on the 3D view", () => {
    const links = [...text.matchAll(/<a href="([^"]+)"><img src="\.\/docs-site\/public\/3d\//g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toMatch(/^https:\/\/playground\.archlang\.uk\/#z=[A-Za-z0-9_-]+&3d$/);
  });
  it("states the limits: no pitched roofs yet, no BIM", () => {
    expect(text).toContain("no pitched roofs yet");
    expect(text).toContain("no BIM or IFC");
    expect(text).not.toContain("no 3D in the core");
  });
});
