import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { chunkWalk } from "../scripts/chunk-walk.mjs";

/** An in-memory build: relative path → text. */
const build = (files: Record<string, string>) =>
  chunkWalk(
    (rel) => Buffer.from(files[rel]!, "utf8"),
    (rel) => rel in files,
  );

const EMBED = `<!doctype html><script type="module" crossorigin src="./assets/embed-a1.js"></script>
<link rel="modulepreload" crossorigin href="./assets/one-room-b2.js">`;

describe("chunkWalk (the startup-chunks gate's walk and `npm run size:embed`)", () => {
  it("follows every static import and re-export spelling, never a dynamic import()", () => {
    const w = build({
      "embed.html": EMBED,
      "assets/embed-a1.js": `import{a as b}from"./compiler-c3.js";import"./side.js?x=1";export*from"./re.js";const l=()=>import("./lazy-d4.js");`,
      "assets/one-room-b2.js": `import*as m from "./compiler-c3.js";`,
      "assets/compiler-c3.js": `import r,{x}from"./rolldown-runtime-e5.js";`,
      "assets/rolldown-runtime-e5.js": "export const x=1;",
      "assets/side.js": "",
      "assets/re.js": "export{y}from'../assets/deep.js';",
      "assets/deep.js": "",
      "assets/lazy-d4.js": `import"./jspdf.js";`,
      "assets/jspdf.js": "",
    });
    expect(w.embedPath()).toEqual([
      "assets/compiler-c3.js",
      "assets/deep.js",
      "assets/embed-a1.js",
      "assets/one-room-b2.js",
      "assets/re.js",
      "assets/rolldown-runtime-e5.js",
      "assets/side.js",
    ]);
    expect(w.pageRoots("embed.html")).toEqual({
      scripts: ["assets/embed-a1.js"],
      preloads: ["assets/one-room-b2.js"],
    });
  });

  it("sums each file's gzip size at zlib's defaults", () => {
    const files = {
      "embed.html": EMBED,
      "assets/embed-a1.js": `import"./compiler-c3.js";${"a".repeat(500)}`,
      "assets/one-room-b2.js": "b".repeat(300),
      "assets/compiler-c3.js": "c".repeat(900),
    };
    const w = build(files);
    const path = w.embedPath();
    const expected = path.reduce((a, f) => a + gzipSync(Buffer.from(files[f as keyof typeof files], "utf8")).length, 0);
    expect(w.size(path)).toBe(expected);
    expect(path.map((f) => w.gz(f)).reduce((a, b) => a + b, 0)).toBe(expected);
  });

  it("throws on an import that names no built file, and on a page with no module script", () => {
    const w = build({
      "embed.html": EMBED,
      "assets/embed-a1.js": `import"./gone.js";`,
      "assets/one-room-b2.js": "",
      "index.html": "<!doctype html><p>no script</p>",
    });
    expect(() => w.embedPath()).toThrow(/assets\/embed-a1\.js imports "\.\/gone\.js", which is no built file/);
    expect(() => w.pageRoots("index.html")).toThrow(/index\.html loads no module script/);
  });
});
