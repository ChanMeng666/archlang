/**
 * The SVG sanitiser (`svg-sanitize.ts`) used wherever a compiled SVG becomes DOM: it removes what
 * could run, leaves a compiler-produced drawing exactly as it was, and its three copies (the
 * playground, the web component, the MCP viewer) stay byte-identical.
 */
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/index.js";
import { sanitizeSvg } from "../src/svg-sanitize.js";

const dom = new JSDOM("<!doctype html><body></body>");
const env = { parser: new dom.window.DOMParser(), doc: dom.window.document };
const serialize = (n: Node) => new dom.window.XMLSerializer().serializeToString(n);
const clean = (text: string) => sanitizeSvg(text, env);

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));

describe("sanitizeSvg removes what could run", () => {
  it("drops <script> and <foreignObject> with their subtrees", () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><g><script/><rect/></g></svg>`,
    )!;
    expect(serialize(out)).toBe(`<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></g></svg>`);
  });

  it("drops on* attributes, on the root too", () => {
    const out = clean(`<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><rect onclick="x()" width="1"/></svg>`)!;
    expect(serialize(out)).toBe(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>`);
  });

  it("drops javascript: links (href and xlink:href), keeps ordinary ones", () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
        `<a href="javascript:alert(1)"><rect/></a>` +
        `<a xlink:href=" JaVa\tscript:alert(1)"><rect/></a>` +
        `<a href="javascript:alert(2)"/><a href="#room-a"><rect/></a><a href="https://archlang.uk/"/></svg>`,
    )!;
    const s = serialize(out);
    expect(s).not.toMatch(/java\s*script/i);
    expect(s).toContain(`href="#room-a"`);
    expect(s).toContain(`href="https://archlang.uk/"`);
  });

  it("refuses text that is not a well-formed <svg> document", () => {
    expect(clean("<svg><rect></svg>")).toBeUndefined();
    expect(clean("<html/>")).toBeUndefined();
    expect(clean("")).toBeUndefined();
  });
});

describe("sanitizeSvg leaves a compiled drawing as it was", () => {
  it("has examples to check", () => expect(EXAMPLES.length).toBeGreaterThan(10));

  it.each(EXAMPLES)("%s passes through unchanged", (file) => {
    const { svg } = compile(readFileSync(`examples/${file}`, "utf8"));
    // Plans that import other files need a file system to compile; the rest are the corpus.
    if (!svg.startsWith("<svg")) return;
    const out = clean(svg);
    expect(out).toBeDefined();
    // The same parse, with nothing removed: the serialisations are equal.
    const plain = env.parser.parseFromString(svg, "image/svg+xml");
    expect(serialize(out!)).toBe(serialize(plain.documentElement));
    expect(out!.querySelectorAll("*").length).toBe(plain.documentElement.querySelectorAll("*").length);
  });
});

describe("the three copies are one file", () => {
  it("playground, web component and MCP viewer hold identical bytes", () => {
    const home = readFileSync("playground/src/svg-sanitize.ts", "utf8");
    for (const copy of [
      "packages/web-component/src/svg-sanitize.ts",
      "packages/mcp-worker/src/viewer/svg-sanitize.ts",
    ]) {
      expect(readFileSync(copy, "utf8"), `${copy} drifted from playground/src/svg-sanitize.ts`).toBe(home);
    }
  });
});
