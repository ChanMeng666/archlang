/**
 * The agent gallery (`/gallery` on the docs site): plans written by AI agents from a brief.
 *
 * `docs/gallery/` holds the ONE copy of each entry: `gallery.json` (page order, title, the model
 * that wrote the plan), `<id>.brief.txt` (the brief, byte for byte) and `<id>.arch` (the plan as
 * the agent delivered it, after one `arch finish`; never edited by hand). `docs-site/sync-docs.mjs`
 * compiles those files into the page, and this test reads the same files, so the page cannot
 * show a plan that does not compile or list one that is not stored.
 *
 * What is deliberately NOT here: a digest, a golden or a snapshot. These plans are not part of
 * the language's pinned corpus. A compiler change may redraw them freely; it may not break them.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, finish } from "../src/index.js";

const DIR = "docs/gallery";
const PAGE = "docs-site/gallery.md";
const SYNC = "docs-site/sync-docs.mjs";

interface Entry {
  id: string;
  title: string;
  model: string;
}

const entries = JSON.parse(readFileSync(join(DIR, "gallery.json"), "utf8")) as Entry[];
const sourceOf = (id: string): string => readFileSync(join(DIR, `${id}.arch`), "utf8");

/** Tracked files under a path spec. */
const tracked = (...pathspec: string[]): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", ...pathspec], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

describe("the stored gallery", () => {
  it("lists every stored plan and brief, and stores nothing else", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.id)).size, "duplicate id in gallery.json").toBe(entries.length);
    const expected = ["gallery.json", ...entries.flatMap((e) => [`${e.id}.arch`, `${e.id}.brief.txt`])].sort();
    expect(readdirSync(DIR).sort()).toEqual(expected);
  });

  it("names a title, a model and a non-empty brief for every entry", () => {
    for (const e of entries) {
      expect(e.title.trim(), `${e.id}: title`).not.toBe("");
      expect(e.model, `${e.id}: model`).toMatch(/^Claude (Haiku|Sonnet|Opus|Fable)$/);
      expect(readFileSync(join(DIR, `${e.id}.brief.txt`), "utf8").trim(), `${e.id}: brief`).not.toBe("");
    }
  });

  it.each(entries.map((e) => e.id))("%s compiles with zero errors", (id) => {
    const { diagnostics, svg } = compile(sourceOf(id), { noCache: true });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(svg).toContain("<svg");
  });

  it.each(entries.map((e) => e.id))("%s is finish-stable: a second `finish` changes no byte", (id) => {
    const source = sourceOf(id);
    const again = finish(source);
    expect(again.changes).toEqual([]);
    expect(again.changed).toBe(false);
    expect(again.source).toBe(source);
  });
});

describe("the gallery page shows exactly the stored plans", () => {
  const page = readFileSync(PAGE, "utf8");

  it("has one <AgentPlan> per entry, in gallery.json order, under the entry's title", () => {
    const shown = [...page.matchAll(/^## (.+)\n\n<AgentPlan id="([^"]+)" \/>$/gm)].map((m) => ({
      title: m[1],
      id: m[2],
    }));
    expect(shown).toEqual(entries.map((e) => ({ title: e.title, id: e.id })));
    // No entry written outside that shape (a second widget, a hand-pasted fence).
    expect(page.match(/<AgentPlan\b/g)).toHaveLength(entries.length);
    expect(page).not.toMatch(/^```arch/m);
  });

  it("is built from docs/gallery by sync-docs, whose outputs git ignores", () => {
    const sync = readFileSync(SYNC, "utf8");
    expect(sync).toContain('join(repo, "docs", "gallery")');
    const outputs = ["docs-site/public/gallery/x.svg", "docs-site/.vitepress/theme/gallery-data.js"];
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
      encoding: "utf8",
      input: outputs.join("\0"),
    })
      .split("\0")
      .filter(Boolean);
    expect(ignored).toEqual(outputs);
  });
});

describe("the gallery stays out of the language's corpus", () => {
  it("no gallery plan is an example", () => {
    const examples = new Set(tracked("examples").map((p) => readFileSync(p, "utf8")));
    for (const e of entries) expect(examples.has(sourceOf(e.id)), `${e.id} is also in examples/`).toBe(false);
  });

  it("nothing in dataset/, eval/, bench/ or the generators reads docs/gallery", () => {
    const readers = tracked("dataset", "eval", "bench", "scripts").filter((p) => /\.(ts|mts|mjs|js|json)$/.test(p));
    expect(readers.length).toBeGreaterThan(10);
    const offenders = readers.filter((p) => /docs[\\/]+gallery|gallery\.json/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no other test reads docs/gallery (so none can pin its bytes)", () => {
    const offenders = tracked("test", "playground/test", "packages", "editors")
      .filter((p) => /\.test\.ts$/.test(p) && !p.endsWith("test/agent-gallery.test.ts"))
      .filter((p) => /docs[\\/]+gallery/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
