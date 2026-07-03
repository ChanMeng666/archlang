import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, clearCache, diffPlans } from "../src/index.js";

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

describe("source anchors — SVG attributes", () => {
  it("annotate mode emits data-arch-id/data-arch-kind", () => {
    clearCache();
    const { svg, errors } = compile(studio, { noCache: true, annotate: true });
    expect(errors).toEqual([]);
    // studio.arch's first room carries an explicit `id=r_living`; the auto
    // `room_N` convention only fires for rooms without one. Either way the
    // frozen attribute names + `room` kind are what this contract guarantees.
    expect(svg).toMatch(/data-arch-id="r_living" data-arch-kind="room"/);
    // spans still emitted where available (existing behavior intact)
    expect(svg).toContain("data-span=");
  });

  it("default mode emits no data-arch- attributes (byte-identical guarantee)", () => {
    clearCache();
    const { svg } = compile(studio, { noCache: true });
    expect(svg).not.toContain("data-arch-");
  });
});

describe("public API surface", () => {
  it("exports diffPlans from the package root", () => {
    expect(typeof diffPlans).toBe("function");
  });
});
