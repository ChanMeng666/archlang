/**
 * The playground puts a compiled SVG on the page in one place, `showSvgInStage` (`viewer.ts`):
 * the embed page (`embed.ts`) and the main page's preview (`preview.ts`) both call it. This proves
 * that path sanitises, and that neither caller has a second way in.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PanZoom } from "../src/pan-zoom.js";
import { showSvgInStage } from "../src/viewer.js";

const dom = new JSDOM("<!doctype html><body><div id='stage'></div></body>");

beforeAll(() => {
  vi.stubGlobal("DOMParser", dom.window.DOMParser);
  vi.stubGlobal("document", dom.window.document);
});
afterAll(() => vi.unstubAllGlobals());

const EVIL =
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml" viewBox="0 0 100 50">` +
  `<script>alert(1)</script><h:iframe srcdoc="x"/><rect width="10" height="10" onclick="x()"/></svg>`;

describe("showSvgInStage", () => {
  it("shows the drawing without a <script> or an h:iframe, and sizes it from its viewBox", () => {
    const stage = dom.window.document.getElementById("stage")!;
    const pz = { setContent: vi.fn() } as unknown as PanZoom;
    showSvgInStage(stage, pz, EVIL, true);
    expect(stage.querySelector("rect")).not.toBeNull();
    expect(stage.querySelector("script")).toBeNull();
    expect(stage.querySelector("iframe")).toBeNull();
    expect(stage.innerHTML).not.toMatch(/script|iframe|onclick/i);
    expect(stage.firstElementChild?.getAttribute("width")).toBe("100");
    expect(pz.setContent).toHaveBeenCalledWith(100, 50, true);
  });

  it("shows nothing for text that is not an SVG", () => {
    const stage = dom.window.document.getElementById("stage")!;
    showSvgInStage(stage, { setContent: vi.fn() } as unknown as PanZoom, "<svg><rect></svg>", true);
    expect(stage.childElementCount).toBe(0);
  });
});

describe("the callers have no other way in", () => {
  it.each(["embed.ts", "preview.ts"])("%s draws through showSvgInStage and never assigns innerHTML", (file) => {
    const src = readFileSync(`playground/src/${file}`, "utf8");
    expect(src).toMatch(/showSvgInStage\(/);
    expect(src).not.toMatch(/\.innerHTML\s*=/);
  });
});
