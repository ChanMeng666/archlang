import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, clearCache } from "../src/index.js";

const studio = readFileSync(join(__dirname, "..", "examples", "studio.arch"), "utf8");

describe("source anchors — scene metadata", () => {
  it("annotate mode stamps elementId/elementKind on element scene nodes", () => {
    clearCache();
    const { scene, errors } = compile(studio, { noCache: true, annotate: true });
    expect(errors).toEqual([]);
    const anchored = scene!.nodes.filter((n) => n.elementId !== undefined);
    expect(anchored.length).toBeGreaterThan(0);
    const kinds = new Set(anchored.map((n) => n.elementKind));
    expect(kinds.has("room")).toBe(true);
    // ids follow the deterministic assignIds convention
    expect(anchored.some((n) => /^room_\d+$/.test(n.elementId!) || n.elementKind !== "room")).toBe(true);
  });

  it("default mode carries no element identity", () => {
    clearCache();
    const { scene } = compile(studio, { noCache: true });
    expect(scene!.nodes.every((n) => n.elementId === undefined && n.elementKind === undefined)).toBe(true);
  });
});
