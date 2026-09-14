/**
 * `scripts/indexnow.mjs` — the post-deploy IndexNow ping.
 *
 * Two things are worth testing here and nothing else is. The first is the sitemap
 * reader: it is the one piece of parsing in the script, it is a regex rather than
 * an XML parser, and a URL it gets wrong is a 422 that takes the whole batch down
 * with it. The second is the promise the script's header makes — **it always exits
 * 0** — because a search-engine ping that can fail a deploy is worse than no ping
 * at all, and the only honest way to check an exit code is to run the process.
 *
 * The pure helpers are imported directly, which is safe because the script guards
 * its `main()` behind an "am I argv[1]?" check; an import POSTs nothing. The
 * exit-code case spawns `node scripts/indexnow.mjs` with `INDEXNOW_KEY` stripped
 * from the environment — the no-key path is the one that reaches no network at all,
 * so it is the one that can run in CI.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs build script with no type declarations.
import { buildPayload, decodeXmlEntities, extractLocs, parseArgs, sameHostUrls } from "../scripts/indexnow.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "indexnow.mjs");

const sitemap = (...locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs
    .map((l) => `  <url>\n    <loc>${l}</loc>\n    <lastmod>2026-09-14</lastmod>\n  </url>`)
    .join("\n")}\n</urlset>\n`;

describe("extractLocs", () => {
  it("reads every <loc> out of a sitemap, in document order", () => {
    const xml = sitemap("https://archlang.uk/", "https://archlang.uk/guide", "https://archlang.uk/errors");
    expect(extractLocs(xml)).toEqual([
      "https://archlang.uk/",
      "https://archlang.uk/guide",
      "https://archlang.uk/errors",
    ]);
  });

  it("tolerates attributes, whitespace and CDATA around the URL", () => {
    const xml = `<urlset><url><loc >\n  https://archlang.uk/a\n</loc></url><url><loc><![CDATA[https://archlang.uk/b]]></loc></url></urlset>`;
    expect(extractLocs(xml)).toEqual(["https://archlang.uk/a", "https://archlang.uk/b"]);
  });

  it("decodes the XML entities a query string forces into a <loc>", () => {
    // A sitemap MUST escape `&`; left encoded, the POSTed URL is not the URL the
    // site serves and IndexNow 422s the batch.
    expect(extractLocs(sitemap("https://archlang.uk/x?a=1&amp;b=2"))).toEqual(["https://archlang.uk/x?a=1&b=2"]);
    expect(decodeXmlEntities("&lt;a&gt; &quot;b&quot; &apos;c&apos; &amp;")).toBe(`<a> "b" 'c' &`);
  });

  it("de-duplicates, and returns nothing for a sitemap with no entries", () => {
    expect(extractLocs(sitemap("https://archlang.uk/", "https://archlang.uk/"))).toEqual(["https://archlang.uk/"]);
    expect(extractLocs(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`)).toEqual([]);
    expect(extractLocs("not xml at all")).toEqual([]);
  });
});

describe("sameHostUrls", () => {
  it("keeps only the URLs belonging to the host being pinged", () => {
    const locs = [
      "https://archlang.uk/",
      "https://playground.archlang.uk/",
      "https://github.com/ChanMeng666/archlang",
      "not a url",
    ];
    expect(sameHostUrls(locs, "archlang.uk")).toEqual(["https://archlang.uk/"]);
    expect(sameHostUrls(locs, "playground.archlang.uk")).toEqual(["https://playground.archlang.uk/"]);
  });
});

describe("buildPayload", () => {
  it("is exactly the four keys the protocol specifies", () => {
    const payload = buildPayload({
      host: "archlang.uk",
      key: "0aecad134b55ec669a7ef97b24f9e672",
      keyLocation: "https://archlang.uk/0aecad134b55ec669a7ef97b24f9e672.txt",
      urlList: ["https://archlang.uk/"],
    });
    expect(Object.keys(payload).sort()).toEqual(["host", "key", "keyLocation", "urlList"]);
  });

  it("caps the batch at the protocol's 10,000 URLs", () => {
    const urlList = Array.from({ length: 10_050 }, (_, i) => `https://archlang.uk/p${i}`);
    const payload = buildPayload({ host: "archlang.uk", key: "k".repeat(32), keyLocation: "x", urlList });
    expect(payload.urlList).toHaveLength(10_000);
  });
});

describe("parseArgs", () => {
  it("accepts the same shape scripts/smoke.mjs does, and trims a trailing slash", () => {
    expect(parseArgs(["--site", "docs", "--base", "https://archlang.uk/"])).toEqual({
      site: "docs",
      base: "https://archlang.uk",
    });
  });

  it("rejects an unknown site, a missing base and a stray argument", () => {
    expect(parseArgs(["--site", "blog", "--base", "https://archlang.uk"]).error).toMatch(/--site must be one of/);
    expect(parseArgs(["--site", "docs"]).error).toMatch(/--base/);
    expect(parseArgs(["--site", "docs", "--base", "https://archlang.uk", "extra"]).error).toMatch(/unknown argument/);
  });
});

describe("the process itself", () => {
  it("exits 0 and says so when INDEXNOW_KEY is unset — a ping must never fail a deploy", () => {
    // Strip the key from the inherited environment rather than setting it empty:
    // this is the shape a fork, or a checkout predating the repository variable,
    // actually sees. It is also the only path that reaches no network.
    const { INDEXNOW_KEY: _stripped, ...env } = process.env;
    const stdout = execFileSync(process.execPath, [SCRIPT, "--site", "docs", "--base", "https://archlang.uk"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    // execFileSync throws on a non-zero exit, so reaching here IS the exit-0 assertion.
    expect(stdout).toContain("INDEXNOW_KEY is not set");
    expect(stdout).toContain("this is not an error");
  });

  it("exits 2 on a usage error, which is a broken workflow step and not a ping outcome", () => {
    let status: number | undefined;
    try {
      execFileSync(process.execPath, [SCRIPT, "--site", "nope"], { encoding: "utf8", stdio: "pipe", timeout: 30_000 });
    } catch (e) {
      status = (e as { status?: number }).status;
    }
    expect(status).toBe(2);
  });
});
