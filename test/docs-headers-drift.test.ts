/**
 * The `.md` Content-Type rules in `docs-site/public/_headers` are GENERATED from the
 * PAGES + SITE_PAGES tables (`npm run gen:docs-headers`). This regenerates them in memory
 * and fails on any difference, and pins the property the generator exists for: no glob,
 * so a missing `/x.md` (a 404 HTML page) can never be labelled `text/markdown`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markdownRoutes, renderHeaders } from "../scripts/gen-docs-headers.js";

const HEADERS = "docs-site/public/_headers";
const routes = markdownRoutes(readFileSync("docs-site/sync-docs.mjs", "utf8"));
const headers = readFileSync(HEADERS, "utf8").replace(/\r\n/g, "\n");

describe("docs-site/public/_headers", () => {
  it("equals the generator output (run `npm run gen:docs-headers`)", () => {
    expect(headers).toBe(renderHeaders(headers, routes));
  });

  it("labels /guide.md, /agents.md and every PAGES route text/markdown", () => {
    for (const r of ["guide.md", "agents.md", "spec.md", "index.md"]) expect(routes).toContain(r);
    for (const r of routes) {
      expect(headers).toContain(`/${r}\n  Content-Type: text/markdown; charset=utf-8`);
    }
  });

  it("de-indexes every raw .md copy and nothing else (GS-D7, docs/seo.md § 5)", () => {
    for (const r of routes) {
      expect(headers).toContain(`/${r}\n  Content-Type: text/markdown; charset=utf-8\n  X-Robots-Tag: noindex\n`);
    }
    // Closed-world, as below: only the generated `.md` rules carry the header, so /llms.txt,
    // /llms-full.txt and every HTML route stay indexable.
    const tagged: string[] = [];
    let path: string | null = null;
    for (const line of headers.split("\n")) {
      if (/^\s*(#|$)/.test(line)) continue;
      if (!/^\s/.test(line)) path = line.trim();
      else if (path && /^\s+X-Robots-Tag:/i.test(line)) tagged.push(path);
    }
    expect(tagged.sort()).toEqual(routes.map((r) => `/${r}`).sort());
  });

  it("serves the gallery plans' `.arch` sources as UTF-8 text (an unknown extension otherwise downloads)", () => {
    // scripts/smoke.mjs asserts the header itself after a deploy; the local preview applies no _headers.
    expect(headers).toContain("\n/examples/*.arch\n  Content-Type: text/plain; charset=utf-8\n");
  });

  it("only the generated routes carry a markdown Content-Type (no glob, no placeholder)", () => {
    // Closed-world: every path whose rule block types the response as markdown, wherever in the
    // file it sits. A glob or `:placeholder` rule would match a missing page too, and its 404
    // HTML would go out labelled markdown.
    const typed: string[] = [];
    let path: string | null = null;
    for (const line of headers.split("\n")) {
      if (/^\s*(#|$)/.test(line)) continue;
      if (!/^\s/.test(line)) path = line.trim();
      else if (path && /^\s+Content-Type:.*markdown/i.test(line)) typed.push(path);
    }
    expect(typed.sort()).toEqual(routes.map((r) => `/${r}`).sort());
  });
});
