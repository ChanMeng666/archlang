/**
 * The SVG sanitiser (`svg-sanitize.ts`) used wherever a compiled SVG becomes DOM: it removes what
 * could run, leaves a compiler-produced drawing exactly as it was, and its three copies (the
 * playground, the web component, the MCP viewer) stay byte-identical. This file is the pin the
 * copies' header comments point to; the per-surface tests are in `playground/test/viewer-surface.test.ts`,
 * `packages/web-component/test/arch-plan.test.ts` and `packages/mcp-worker/test/svg-element.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/index.js";
import { isPlainSvg, sanitizeSvg } from "../src/svg-sanitize.js";

const dom = new JSDOM("<!doctype html><body></body>");
const env = { parser: new dom.window.DOMParser(), doc: dom.window.document };
const serialize = (n: Node) => new dom.window.XMLSerializer().serializeToString(n);
const clean = (text: string) => sanitizeSvg(text, env);

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const H = `xmlns:h="http://www.w3.org/1999/xhtml"`;

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
/** Plans that `import` another file need a file-system World to compile; `compile(src)` alone gives no SVG. */
const imports = (file: string) => /^\s*import\s+"/m.test(readFileSync(`examples/${file}`, "utf8"));
const RUNNABLE = EXAMPLES.filter((f) => !imports(f));
const NEEDS_WORLD = EXAMPLES.filter(imports);

describe("sanitizeSvg removes what could run", () => {
  it("drops <script> and <foreignObject> with their subtrees", () => {
    const out = clean(
      `<svg ${NS}><script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><g><script/><rect/></g></svg>`,
    )!;
    expect(serialize(out)).toBe(`<svg ${NS}><g><rect/></g></svg>`);
  });

  it("drops every element outside the SVG namespace (h:iframe srcdoc, embed, object, form)", () => {
    const out = clean(
      `<svg ${NS} ${H}><h:iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"/><h:embed src="x"/><h:object data="x"/>` +
        `<h:form action="x"><h:input/></h:form><g><h:iframe/><rect/></g></svg>`,
    )!;
    expect(serialize(out)).toBe(`<svg ${NS} ${H}><g><rect/></g></svg>`);
  });

  it("drops <style>, <set>, <animate*> and <discard> (a SMIL <set> rewrites an href after parsing)", () => {
    const out = clean(
      `<svg ${NS}><style>*{}</style><a href="#x"><set attributeName="href" to="javascript:alert(1)"/><rect/></a>` +
        `<animate attributeName="href" values="javascript:alert(1)"/><animateTransform/><animateMotion/><discard/></svg>`,
    )!;
    expect(serialize(out)).toBe(`<svg ${NS}><a href="#x"><rect/></a></svg>`);
  });

  it("drops on* attributes, on the root too", () => {
    const out = clean(`<svg ${NS} onload="x()"><rect onclick="x()" width="1"/></svg>`)!;
    expect(serialize(out)).toBe(`<svg ${NS}><rect width="1"/></svg>`);
  });

  it("keeps only fragment, relative, http(s) and mailto links (href and xlink:href)", () => {
    const bad = [
      "javascript:alert(1)",
      " JAVA\tSCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "blob:https://x/1",
      "file:///etc/passwd",
    ];
    const good = ["#room-a", "https://archlang.uk/", "http://x/", "mailto:a@b.c", "plan.svg", "../a/b:c", "//cdn/x"];
    const out = clean(
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink">` +
        bad
          .map((v, i) =>
            i % 2 ? `<a xlink:href="${v.replace(/</g, "&lt;")}"/>` : `<a href="${v.replace(/</g, "&lt;")}"/>`,
          )
          .join("") +
        good.map((v) => `<a href="${v}"/>`).join("") +
        `</svg>`,
    )!;
    const links = Array.from(out.querySelectorAll("a")).map(
      (a) => a.getAttribute("href") ?? a.getAttribute("xlink:href"),
    );
    expect(links.slice(0, bad.length)).toEqual(bad.map(() => null));
    expect(links.slice(bad.length)).toEqual(good);
  });

  it("takes the full path for anything that is not plainly the compiler's vocabulary", () => {
    expect(isPlainSvg(`<svg ${NS}><rect/></svg>`)).toBe(true);
    for (const evil of [
      `<svg ${NS}><script>x</script></svg>`,
      `<svg ${NS} ${H}><h:iframe/></svg>`,
      `<svg ${NS} onload="x()"/>`,
      `<svg ${NS}><a href="#x"/></svg>`,
      `<svg ${NS}><style>*{}</style></svg>`,
      `<svg ${NS}><set attributeName="href"/></svg>`,
      `<svg ${NS}><text>&#106;avascript</text></svg>`,
      ` <svg ${NS}/>`,
    ]) {
      expect(isPlainSvg(evil), evil).toBe(false);
    }
  });

  it("refuses text that is not a well-formed <svg> document in the SVG namespace", () => {
    expect(clean("<svg><rect></svg>")).toBeUndefined();
    expect(clean("<html/>")).toBeUndefined();
    expect(clean(`<svg xmlns="http://www.w3.org/1999/xhtml"/>`)).toBeUndefined();
    expect(clean("")).toBeUndefined();
  });
});

describe("sanitizeSvg leaves a compiled drawing as it was", () => {
  it("has examples to check", () => {
    expect(RUNNABLE.length).toBeGreaterThan(10);
    expect(NEEDS_WORLD.sort()).toEqual(["imports.arch", "museum-wings.arch"]);
  });

  it.each(RUNNABLE)("%s passes through unchanged", (file) => {
    const { svg } = compile(readFileSync(`examples/${file}`, "utf8"));
    expect(svg.startsWith("<svg")).toBe(true);
    // The compiler's own output takes the fast path (no tree walk): the cost the knob drag pays.
    expect(isPlainSvg(svg), `${file} left the fast path`).toBe(true);
    const out = clean(svg);
    expect(out).toBeDefined();
    // The same parse, with nothing removed: the serialisations are equal.
    const plain = env.parser.parseFromString(svg, "image/svg+xml");
    expect(serialize(out!)).toBe(serialize(plain.documentElement));
    expect(out!.querySelectorAll("*").length).toBe(plain.documentElement.querySelectorAll("*").length);
  });

  it.skip.each(NEEDS_WORLD)("%s: needs a file-system World to compile; not in this round trip", () => {});
});

/**
 * The fast path's negatives, built the way a real regression would arrive: a form the compiler
 * never writes, injected into a real compiled drawing (`examples/studio.arch`), not a toy string.
 * Each must leave the fast path, and after `sanitizeSvg` the serialisation must hold none of it
 * (a document the full path refuses outright, `undefined`, holds none of it either).
 *
 * Not covered, by design: CSS. `url(` in a `style` attribute or a `<style>` body is not
 * inspected by the fast path (the full path drops `<style>` elements, not `style="..."` values);
 * it is defence in depth behind the compiler's escaping, and a script cannot run from it.
 */
describe("the fast path refuses what the compiler never writes", () => {
  const { svg } = compile(readFileSync("examples/studio.arch", "utf8"));
  const open = svg.indexOf(">") + 1;
  const baseline = clean(svg)!.querySelectorAll("*").length;
  const inject = (frag: string) => svg.slice(0, open) + frag + svg.slice(open);
  const FORMS: { name: string; frag: string; gone: RegExp | null }[] = [
    // The full path removes elements and attributes only: a comment or a processing instruction
    // stays as an inert non-element node (`gone: null`, checked below as "adds no element").
    { name: "comment", frag: "<!--x-->", gone: null },
    // importNode of a CDATA section into an HTML document throws, so the full path throws
    // rather than returning a node: nothing reaches the DOM either way.
    { name: "CDATA", frag: "<![CDATA[x]]>", gone: /CDATA/ },
    { name: "processing instruction", frag: `<?xml-stylesheet href="x"?>`, gone: null },
    { name: "DOCTYPE", frag: "<!DOCTYPE svg>", gone: /DOCTYPE/i },
    { name: "upper-case SCRIPT", frag: "<SCRIPT>x</SCRIPT>", gone: /script/i },
    { name: "slash-separated handler", frag: "<rect/onload=x>", gone: /onload/i },
    { name: "SMIL set on href", frag: `<set attributeName="href" to="javascript:1"/>`, gone: /<set|javascript/ },
    { name: "XHTML iframe", frag: `<h:iframe xmlns:h="http://www.w3.org/1999/xhtml"/>`, gone: /iframe|xhtml/ },
  ];

  it("the unmodified drawing is on the fast path (the injections below are the only difference)", () => {
    expect(isPlainSvg(svg)).toBe(true);
  });

  it.each(FORMS)("$name fails isPlainSvg and does not survive sanitizeSvg", ({ frag, gone }) => {
    const evil = inject(frag);
    expect(isPlainSvg(evil), evil.slice(0, open + frag.length)).toBe(false);
    let out: SVGSVGElement | undefined;
    try {
      out = clean(evil);
    } catch {
      return; // refused by throwing: nothing was returned to insert
    }
    if (!out) return;
    if (gone) expect(serialize(out)).not.toMatch(gone);
    else expect(out.querySelectorAll("*").length).toBe(baseline);
  });

  it("a malformed document is repaired leniently on the fast path and refused on the full path", () => {
    // Same shape (the compiler's vocabulary only), so the fast path takes it and the HTML parser repairs it;
    // the full path is a strict XML parse. The fast path trusts the compiler to be well-formed.
    const broken = `<svg ${NS}><rect></svg>`;
    expect(isPlainSvg(broken)).toBe(true);
    expect(clean(broken)).toBeDefined();
    const full = `<svg ${NS} ${H}><rect></svg>`;
    expect(isPlainSvg(full)).toBe(false);
    expect(clean(full)).toBeUndefined();
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
