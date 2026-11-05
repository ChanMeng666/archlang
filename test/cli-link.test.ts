/**
 * `archlang link` — a URL that opens a plan in the hosted playground, for handing to a person.
 *
 * What is pinned:
 *   - the payload round-trips byte for byte over every example, through the Node decoder AND
 *     through the playground's own decoder (the browser half of the scheme), so a minted link
 *     opens the same plan it was minted from;
 *   - there is one Node encoder: `src/cli/share-codec.mjs`. The README generator re-exports it
 *     and nothing else in the repo calls `deflateRawSync`;
 *   - the CLI contract: stdout is the URL (or `{ ok, playground, embed, bytes }` with `--json`),
 *     a plan that does not compile still links with exit 0, `ok:false` + an `errors` count and one
 *     warning line on stderr;
 *   - the URLs carry nothing but the plan: no query string, the fragment alone — on the playground
 *     link, the plan and the `&edit` flag that opens the editor (the playground opens in view mode
 *     without it), with the plan token still parsing in front of it.
 *
 * The browser end of the same claim — the studio link loads `examples/studio.arch` into the
 * editor — is `playground/e2e/cli-link.spec.ts`.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { b64urlToBytes, hasEditFlag, srcFromHash } from "../playground/src/share.js";
import { planLinks } from "../src/cli/link.js";
import { decodePlanHash, encodePlanHash, PLAYGROUND_EDIT_FLAG, PLAYGROUND_ORIGIN } from "../src/cli/share-codec.mjs";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Node 18 ships `DecompressionStream` without "deflate-raw" (added in 21.2); CI runs 18/20/22. */
const HAS_DEFLATE_RAW = (() => {
  if (typeof DecompressionStream === "undefined") return false;
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
})();

const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort();
const read = (name: string): string => readFileSync(join("examples", name), "utf8");
/** The `#z=` payload of a minted URL (the playground link carries `&edit` after it). */
const payloadOf = (url: string): string => /^#z=([A-Za-z0-9_-]+)/.exec(new URL(url).hash)?.[1] ?? "";
const STUDIO = read("studio.arch");
const BROKEN = 'plan "X" {\n  romo at (0,0)\n}\n';

describe("the #z= payload round-trips over every example", () => {
  it("covers the corpus", () => {
    expect(EXAMPLES.length).toBeGreaterThan(20);
    expect(EXAMPLES).toContain("studio.arch");
  });

  it.each(EXAMPLES)("%s: encode then decode is byte-identical (Node decoder)", (name) => {
    const source = read(name);
    expect(decodePlanHash(encodePlanHash(source))).toBe(source);
    expect(decodePlanHash(payloadOf(planLinks(source).playground))).toBe(source);
  });

  it.each(EXAMPLES)("%s: the playground's decoder reads what the CLI minted", async (name) => {
    const source = read(name);
    const { playground } = planLinks(source);
    const hash = new URL(playground).hash;
    // The playground's base64url half runs everywhere; the inflate is the Web stream where
    // Node has deflate-raw, exactly as the browser does it.
    expect(b64urlToBytes(payloadOf(playground))).toEqual(new Uint8Array(Buffer.from(payloadOf(playground), "base64")));
    if (HAS_DEFLATE_RAW) expect(await srcFromHash(hash)).toBe(source);
    // …and the same hash asks for edit mode, read by the playground's own rule.
    expect(hasEditFlag(hash)).toBe(true);
  });
});

describe("one Node encoder", () => {
  it("the README generator re-exports the shared codec instead of carrying its own", () => {
    const gen = readFileSync("scripts/gen-permalink.mjs", "utf8");
    expect(gen).toMatch(/from "\.\.\/src\/cli\/share-codec\.mjs"/);
    expect(gen).not.toMatch(/node:zlib/);
    expect(gen).not.toMatch(/https:\/\/playground\.archlang\.uk/);
  });

  it("nothing else in the source tree deflates a plan", () => {
    const roots = [
      "src",
      "scripts",
      "packages/mcp/src",
      "packages/mcp-worker/src",
      "playground/src",
      "playground/scripts",
      "docs-site",
    ];
    const skip = new Set(["node_modules", "dist", ".vitepress"]);
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const p = join(dir, e.name).replace(/\\/g, "/");
        if (e.isDirectory()) walk(p);
        else if (/\.(?:[cm]?[jt]s)$/.test(e.name) && /deflateRawSync/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    for (const r of roots) walk(r);
    expect(hits).toEqual(["src/cli/share-codec.mjs"]);
  });

  it("links point at the production playground and carry nothing but the plan", () => {
    const links = planLinks(STUDIO);
    expect(PLAYGROUND_ORIGIN).toBe("https://playground.archlang.uk");
    for (const [url, path] of [
      [links.playground, "/"],
      [links.embed, "/embed.html"],
    ] as const) {
      const u = new URL(url);
      expect(u.origin).toBe(PLAYGROUND_ORIGIN);
      expect(u.pathname).toBe(path);
      expect(u.search).toBe("");
    }
    // The playground link opens the editor (`&edit`); the embed only draws, so it carries no flag.
    expect(PLAYGROUND_EDIT_FLAG).toBe("edit");
    expect(new URL(links.playground).hash).toMatch(/^#z=[A-Za-z0-9_-]+&edit$/);
    expect(new URL(links.embed).hash).toMatch(/^#z=[A-Za-z0-9_-]+$/);
    expect(payloadOf(links.embed)).toBe(payloadOf(links.playground));
    expect(links.bytes).toBe(Buffer.from(payloadOf(links.playground), "base64").length);
  });
});

describe("archlang link", () => {
  it("prints the playground URL alone on stdout", () => {
    const r = run(["link", "examples/studio.arch"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${planLinks(STUDIO).playground}\n`);
    expect(r.stderr).toBe("");
  });

  it("--json prints { ok, playground, embed, bytes }", () => {
    const r = run(["link", "examples/studio.arch", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true, ...planLinks(STUDIO) });
    expect(Object.keys(JSON.parse(r.stdout))).toEqual(["ok", "playground", "embed", "bytes"]);
  });

  it("reads stdin with `-`", () => {
    const r = run(["link", "-", "--json"], STUDIO);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).playground).toBe(planLinks(STUDIO).playground);
  });

  it("a plan that does not compile still links: exit 0, one warning line on stderr", () => {
    const r = run(["link", "-"], BROKEN);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${planLinks(BROKEN).playground}\n`);
    expect(r.stderr).toMatch(/^warning: stdin does not compile \(1 error, first E_PARSE at 2:3\);[^\n]*\n$/);
    const json = run(["link", "-", "--json"], BROKEN);
    expect(json.status).toBe(0);
    // `ok` and `errors` lead, so an agent reading stdout alone sees the plan is broken.
    expect(JSON.parse(json.stdout)).toEqual({ ok: false, errors: 1, ...planLinks(BROKEN) });
    expect(Object.keys(JSON.parse(json.stdout))).toEqual(["ok", "errors", "playground", "embed", "bytes"]);
    expect(json.stderr).toMatch(/^warning: /);
  });

  it("--quiet drops the warning, not the link", () => {
    const r = run(["link", "-", "--quiet"], BROKEN);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${planLinks(BROKEN).playground}\n`);
    expect(r.stderr).toBe("");
  });

  it("a missing file is an IO error, and no input or an undeclared flag is bad usage", () => {
    expect(run(["link", "examples/no-such-plan.arch"]).status).toBe(1);
    expect(run(["link"]).status).toBe(3);
    expect(run(["link", "examples/studio.arch", "--level", "2"]).status).toBe(3);
  });
});
