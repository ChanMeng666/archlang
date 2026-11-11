/**
 * Supersampling for the generated posters and videos (product-roadmap card RM8.2): off unless asked
 * for. `withSupersample(html, 1)` is the page itself, so the default path (the key-frame baseline,
 * every live 3D preview) is untouched; asked for, only the payload's `supersample` changes. The
 * frames themselves are the browser's (`e2e/assets.e2e.ts` under `check:3d`).
 */
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { replayHtml, replayPayload } from "../src/node.js";
import { withSupersample } from "../src/replay/video.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const OPEN = '<script type="application/json" id="archlang-replay-payload">';
const payloadOf = (html: string): Record<string, unknown> => {
  const at = html.indexOf(OPEN) + OPEN.length;
  return JSON.parse(html.slice(at, html.indexOf("</script>", at))) as Record<string, unknown>;
};
/** The page with its payload taken out. */
const withoutPayload = (html: string): string => {
  const at = html.indexOf(OPEN);
  return html.slice(0, at) + html.slice(html.indexOf("</script>", at));
};

describe("supersampling (RM8.2)", () => {
  const src = EXAMPLES_LIST.find(([n]) => n === "studio.arch")?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  const mesh = buildMesh(r.scene);
  const svg = compile(src, { world: WORLD }).svg;
  const page = replayHtml(mesh, { title: "studio", svg, width: 480, height: 270 });

  it("is off unless asked for: the page as it is, and no payload carries it", async () => {
    const html = await page;
    expect(withSupersample(html)).toBe(html);
    expect(withSupersample(html, 1)).toBe(html);
    expect("supersample" in replayPayload(mesh, { title: "studio", svg })).toBe(false);
    expect("supersample" in payloadOf(html)).toBe(false);
  });

  it("asked for, changes the payload's supersample and nothing else", async () => {
    const html = await page;
    const three = withSupersample(html, 3);
    const p = payloadOf(three);
    expect(p.supersample).toBe(3);
    expect(Object.fromEntries(Object.entries(p).filter(([k]) => k !== "supersample"))).toEqual(payloadOf(html));
    expect(withoutPayload(three)).toBe(withoutPayload(html));
  });

  it("writes the payload back as the replay page writes it (`html.ts`): only the field is added", async () => {
    // A re-serialised payload is the page's own bytes, `<` escaped the same way, so the page
    // `withSupersample` writes differs from what `replayHtml` would write only by `supersample`.
    const html = await page;
    const at = html.indexOf(OPEN) + OPEN.length;
    const raw = html.slice(at, html.indexOf("</script>", at));
    // The payload carries the core's SVG, so it has a `<` to escape, and none is left.
    expect(raw.includes("\\u003c")).toBe(true);
    expect(raw.includes("<")).toBe(false);
    expect(JSON.stringify(payloadOf(html)).replace(/</g, "\\u003c")).toBe(raw);
  });

  it("takes a whole number from 1 to 4", async () => {
    const html = await page;
    for (const k of [0, 5, 1.5, -1]) expect(() => withSupersample(html, k), String(k)).toThrow(/whole number/);
  });
});
