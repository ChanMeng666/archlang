/**
 * The 3D preview on the READMEs (public-surfaces card X7): the PS-D12 line and the limits line are
 * carried verbatim, the page they point at is linked, every poster image is a shipped asset the
 * manifest lists, each 3D link opens the plan its poster shows, and the permanent wording bans
 * hold. The lines are read from the package, never retyped.
 */
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PREVIEW_LABEL, PREVIEW_LIMITS } from "../packages/archlang-3d/src/replay/payload.js";
import { b64urlToBytes } from "../playground/src/share.js";

const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const manifest = JSON.parse(read("docs-site/public/3d/manifest.json")) as {
  assets: { name: string; files: { path: string }[] }[];
};
const listed = new Set(manifest.assets.flatMap((a) => a.files.map((f) => f.path)));

const READMES = ["README.md", "packages/mcp/README.md", "editors/vscode/README.md"];

describe.each(READMES)("%s carries the 3D preview honestly", (file) => {
  const text = read(file);
  it("has the PS-D12 line and the limits line verbatim, and a link to /3d", () => {
    expect(text.includes(PREVIEW_LABEL), "PREVIEW_LABEL").toBe(true);
    expect(text.includes(PREVIEW_LIMITS), "PREVIEW_LIMITS").toBe(true);
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
    // URLs are not prose: drop them (a permalink hash is random letters).
    const lines = text
      .split("\n")
      .filter((l) => /3D|archlang-3d/.test(l))
      .map((l) => l.replace(/https?:\/\/[^\s"')]+/g, "").replace(/src="[^"]*"/g, ""))
      .join("\n");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).not.toMatch(/\b(3D CAD|walkthroughs?|photo-?real\w*|renders?|rendering)\b/i);
    expect(lines).not.toMatch(/\b(BIM-ready|BIM model|CAD model|3D model|model)\b/i);
    expect(lines).not.toMatch(/\b(first|only)\b/i);
  });
});

describe("the root README's plan and 3D pairs", () => {
  const text = read("README.md");
  it("its Limits line quotes the 3D preview's limits line verbatim (V2 round 1)", () => {
    const limits = text.split("\n").find((l) => l.startsWith("Limits: "));
    expect(limits, "the README's Limits line").toBeTruthy();
    expect(limits).toContain(`"${PREVIEW_LIMITS}"`);
  });
  it("opens each 3D poster in the playground on the 3D view", () => {
    const links = [...text.matchAll(/<a href="([^"]+)"><img src="\.\/docs-site\/public\/3d\//g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toMatch(/^https:\/\/playground\.archlang\.uk\/#z=[A-Za-z0-9_-]+&3d$/);
  });
  it("each 3D cell's permalink decodes to the example its poster is named for", () => {
    const cells = [
      ...text.matchAll(
        /<a href="https:\/\/playground\.archlang\.uk\/#z=([A-Za-z0-9_-]+)&3d"><img src="\.\/docs-site\/public\/3d\/([a-z-]+)\.poster\.png"/g,
      ),
    ];
    expect(cells.length).toBeGreaterThan(0);
    for (const [, hash, name] of cells) {
      const source = inflateRawSync(Buffer.from(b64urlToBytes(hash!)))
        .toString("utf8")
        .replace(/\r\n/g, "\n");
      expect(source, `${name}'s 3D link opens another plan`).toBe(read(`examples/${name}.arch`));
    }
  });
  it("states the limits: no pitched roofs yet, no BIM", () => {
    expect(text).toContain("no pitched roofs yet");
    expect(text).toContain("no BIM or IFC");
    expect(text).not.toContain("no 3D in the core");
  });
});
