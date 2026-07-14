/**
 * `arch context --section` — bounded agent context.
 *
 * The whole bundle is ~50KB; an agent that only needs the diagnostic catalog should
 * not have to read the spec, the workflow, and the CLI reference to get it. The CLI
 * hands back one section by splitting the shipped `llms-full.txt` on the exact rule
 * `renderLlmsFull()` joins its chunks with — so the important test here is the
 * COUPLING one: it runs the generator in memory and asserts the splitter still finds
 * the four sections in its output. If the bundle's shape ever changes, that test
 * fails loudly instead of the CLI silently slicing garbage.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLlmsFull } from "../scripts/gen-llms-full.js";
import { splitContext } from "../src/cli/commands-meta.js";
import { ERROR_CATALOG, ERROR_CODES } from "../src/error-catalog.js";
import { buildManifest } from "../src/manifest.js";

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

/** The bundle as the generator renders it right now (not the possibly-stale file). */
function regenerate(): string {
  const version = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version ?? "0.0.0";
  return renderLlmsFull({
    spec: readFileSync(resolve("spec.llm.md"), "utf8"),
    skill: readFileSync(resolve("SKILL.md"), "utf8"),
    manifest: buildManifest(version),
    errorCatalog: ERROR_CATALOG,
    errorCodes: ERROR_CODES,
  });
}

describe("splitContext is welded to the generator", () => {
  it("finds all four sections in freshly rendered llms-full.txt", () => {
    const sections = splitContext(regenerate());
    expect(sections, "the generator's format changed — splitContext no longer recognizes it").not.toBeNull();
    expect(Object.keys(sections!)).toEqual(["spec", "workflow", "cli", "errors"]);
    expect(sections!.spec).toMatch(/^## 1\. Language spec\n/);
    expect(sections!.workflow).toMatch(/^## 2\. Agent workflow\n/);
    expect(sections!.cli).toMatch(/^## 3\. CLI reference\n/);
    expect(sections!.errors).toMatch(/^## 4\. Diagnostic catalog\n/);
  });

  it("puts each section's real content in it, and nothing else's", () => {
    const s = splitContext(regenerate())!;
    for (const code of ERROR_CODES) expect(s.errors).toContain(`\`${code}\``);
    expect(s.cli).toContain("**Exit codes:**");
    expect(s.errors).not.toContain("## 3. CLI reference");
    expect(s.spec).not.toContain("## 2. Agent workflow");
  });

  it("every section is a strict, much smaller slice of the whole", () => {
    const full = regenerate();
    const s = splitContext(full)!;
    for (const [name, text] of Object.entries(s)) {
      expect(full, `${name} must be verbatim inside the bundle`).toContain(text);
      expect(text.length, `${name} must be far smaller than the whole bundle`).toBeLessThan(full.length / 2);
    }
  });

  it("rejects a bundle whose shape it does not recognize (rather than slicing garbage)", () => {
    expect(splitContext("just some text")).toBeNull();
    // Right chunk count, wrong headings.
    expect(splitContext(["a", "b", "c", "d", "e"].join("\n\n---\n\n"))).toBeNull();
  });
});

describe("CLI — `arch context --section`", () => {
  it("prints only the diagnostic catalog for --section errors", () => {
    const r = run(["context", "--section", "errors"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## 4. Diagnostic catalog");
    expect(r.stdout).toContain("E_ROOM_SIZE");
    // Not the spec, not the workflow, not the CLI reference.
    expect(r.stdout).not.toContain("# ArchLang in one prompt");
    expect(r.stdout).not.toContain("## 3. CLI reference");
  }, 30000);

  it("is a fraction of the whole bundle", () => {
    const whole = run(["context"]);
    const errors = run(["context", "--section", "errors"]);
    expect(whole.status).toBe(0);
    expect(whole.stdout.length).toBeGreaterThan(40000);
    expect(errors.stdout.length).toBeLessThan(whole.stdout.length / 2);
  }, 30000);

  it("without --section, prints the whole bundle exactly as before", () => {
    const r = run(["context"]);
    const file = readFileSync("llms-full.txt", "utf8").replace(/\r\n/g, "\n");
    expect(r.status).toBe(0);
    expect(r.stdout.replace(/\r\n/g, "\n")).toBe(file);
  }, 30000);

  it("--json carries the section name alongside the text (append-only shape)", () => {
    const r = run(["context", "--section", "cli", "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.section).toBe("cli");
    expect(out.context).toContain("## 3. CLI reference");
    expect(out.context).not.toContain("## 4. Diagnostic catalog");
  }, 30000);

  it("--json without --section keeps the old { ok, context } shape", () => {
    const r = run(["context", "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.section).toBeUndefined();
    expect(out.context).toContain("## 1. Language spec");
    expect(out.context).toContain("## 4. Diagnostic catalog");
  }, 30000);

  it("an unknown section is a usage error (exit 3) with a did-you-mean", () => {
    const r = run(["context", "--section", "error"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('unknown section "error"');
    expect(r.stderr).toContain("spec, workflow, cli, errors");
    expect(r.stderr).toContain('did you mean "errors"?');
    expect(r.stdout).toBe("");
  }, 30000);
});
