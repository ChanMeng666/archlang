/**
 * The package's side of ADR 0031's downstream contract: the seam it reads is on the core's root,
 * and its sources read no underscore-prefixed IR field (those are outside the core's promise).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../src");

/** The core values the package calls. A rename or removal in the core turns this red first. */
const REQUIRED_VALUES = [
  "resolvePlan",
  "joinWallSet",
  "loopsToPolygons",
  "doorSwing",
  "doorLeaves",
  "hatchKey",
  "hatchOf",
  "makeVirtualWorld",
];

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

describe("the downstream contract (ADR 0031)", () => {
  it("finds every core value the package needs on the root", () => {
    const missing = REQUIRED_VALUES.filter((n) => typeof (core as Record<string, unknown>)[n] !== "function");
    expect(missing).toEqual([]);
  });

  it("reads no underscore-prefixed field", () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(5);
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (/\.\s*_[A-Za-z]/.test(line) && !/^\s*(\*|\/\/)/.test(line) ? [`${f}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });

  it("imports the core only by its package name, never a relative src/ path", () => {
    const hits = walk(SRC).filter((f) => /from\s+["'](\.\.\/)+(\.\.\/)?src\//.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
