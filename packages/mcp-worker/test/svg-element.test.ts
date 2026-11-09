/**
 * The MCP App viewer's `svgElement` (`src/viewer/svg-element.ts`): the compile result's SVG as a
 * sanitised element, sized by its viewBox. The viewer page itself needs the host's App handshake,
 * so the function lives in its own module to be tested.
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { svgElement } from "../src/viewer/svg-element.js";

const dom = new JSDOM("<!doctype html><body></body>");
const env = { parser: new dom.window.DOMParser(), doc: dom.window.document };

describe("svgElement", () => {
  it("drops <script> and an h:iframe, keeps the drawing, and sizes it from the viewBox", () => {
    const el = svgElement(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml" viewBox="0 0 100 50">` +
        `<script>alert(1)</script><h:iframe srcdoc="x"/><rect width="10" height="10"/></svg>`,
      env,
    )!;
    expect(el.querySelector("rect")).not.toBeNull();
    expect(el.querySelector("script")).toBeNull();
    expect(el.getElementsByTagNameNS("*", "iframe").length).toBe(0);
    expect(el.getAttribute("width")).toBe("100");
    expect(el.getAttribute("height")).toBe("50");
  });

  it("is undefined for text that is not an SVG", () => {
    expect(svgElement("not svg", env)).toBeUndefined();
  });
});
