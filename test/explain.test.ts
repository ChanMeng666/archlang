/**
 * T5.5 — error-code catalog + diagnostic enrichment.
 *
 * The catalog must cover every code the codebase raises, `explain` must return
 * entries, the generated docs must not drift, and a door/window off a wall must
 * carry a `relatedSpans` note pointing at the nearest wall.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, explain, ERROR_CATALOG, ERROR_CODES, formatDiagnostic } from "../src/index.js";
import { renderErrorCodes } from "../scripts/gen-error-codes.js";

/** Read every `code: "E_…"/"W_…"` literal raised under src/. */
function codesInSource(dir: string): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) for (const c of codesInSource(p)) found.add(c);
    else if (entry.name.endsWith(".ts")) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/code:\s*"((?:E|W)_[A-Z_]+)"/g)) found.add(m[1]);
    }
  }
  return found;
}

describe("T5.5 — the catalog covers every raised code", () => {
  it("every E_*/W_* raised in src/ has a catalog entry", () => {
    const raised = codesInSource("src");
    const missing = [...raised].filter((c) => !(c in ERROR_CATALOG)).sort();
    expect(missing).toEqual([]);
    expect(raised.size).toBeGreaterThan(30);
  });

  it("the catalog has no orphan entries (every documented code is raised)", () => {
    // E_IMPORT_PARSE etc. are raised with non-literal codes in a couple of spots;
    // allow a small allowlist of codes documented but raised indirectly.
    const raised = codesInSource("src");
    const orphans = ERROR_CODES.filter((c) => !raised.has(c));
    expect(orphans).toEqual([]);
  });
});

describe("T5.5 — explain", () => {
  it("returns a populated entry for a known code", () => {
    const text = explain("E_ROOM_SIZE");
    expect(text).not.toBeNull();
    expect(text).toContain("E_ROOM_SIZE");
    expect(text).toContain("Cause:");
    expect(text).toContain("Fix:");
    expect(text).toContain("Example:");
  });

  it("returns null for an unknown code", () => {
    expect(explain("E_NOPE")).toBeNull();
  });

  it("every catalog entry has non-empty cause/fix/example", () => {
    for (const c of ERROR_CODES) {
      const e = ERROR_CATALOG[c];
      expect(e.cause.length).toBeGreaterThan(0);
      expect(e.fix.length).toBeGreaterThan(0);
      expect(e.example.length).toBeGreaterThan(0);
    }
  });
});

describe("T5.5 — generated docs/error-codes.md has no drift", () => {
  it("matches the catalog", () => {
    const committed = readFileSync("docs/error-codes.md", "utf8").replace(/\r\n/g, "\n");
    expect(renderErrorCodes()).toBe(committed);
  });
});

describe("T5.5 — related spans point at the expected wall", () => {
  const src = [
    'plan "Rel" {',
    "  units mm",
    "  wall exterior thickness 200 { (0, 0) (1000, 0) }",
    "  door at (5000, 5000) width 900",
    "}",
  ].join("\n");

  it("a door off every wall carries a relatedSpan note at the nearest wall", () => {
    const { diagnostics } = compile(src, { noCache: true });
    const d = diagnostics.find((x) => x.code === "W_DOOR_OFF_WALL");
    expect(d).toBeDefined();
    expect(d!.relatedSpans?.length).toBeGreaterThanOrEqual(1);
    const rel = d!.relatedSpans![0];
    expect(src.slice(rel.span.start, rel.span.end)).toContain("wall exterior");
    // The framed diagnostic renders the related note.
    expect(formatDiagnostic(src, d!)).toContain("note:");
  });
});
