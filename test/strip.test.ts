import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RRoom } from "../src/ir.js";

/**
 * T1e — the `strip` block: a row/column of rooms laid end to end, expanded into
 * ordinary absolute-placed rooms. The result is byte-identical to hand-authored
 * `room at (x,y) size WxH`.
 */

const roomsOf = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

describe("T1e — room strip", () => {
  it("a right-strip lays rooms along +x with the shared height (byte-identical to manual rooms)", () => {
    const strip = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 100 height 3000 {
        room id=k size 2000 label "Kitchen"
        room id=d size 2500 label "Dining"
        room id=l size 3000 label "Living"
      }
    }`;
    const manual = `plan "P" {
      units mm
      grid 1
      room id=k at (0,0) size 2000x3000 label "Kitchen"
      room id=d at (2100,0) size 2500x3000 label "Dining"
      room id=l at (4700,0) size 3000x3000 label "Living"
    }`;
    const rooms = roomsOf(strip);
    expect(rooms.map((r) => [r.id, r.at.x, r.at.y, r.size.w, r.size.h])).toEqual([
      ["k", 0, 0, 2000, 3000],
      ["d", 2100, 0, 2500, 3000],
      ["l", 4700, 0, 3000, 3000],
    ]);
    expect(compile(strip, { noCache: true }).svg).toBe(compile(manual, { noCache: true }).svg);
  });

  it("a down-strip lays rooms along +y with the shared width", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip down at (500,500) gap 200 width 4000 {
        room size 2000
        room size 1500
      }
    }`;
    const rooms = roomsOf(src);
    expect(rooms.map((r) => [r.at.x, r.at.y, r.size.w, r.size.h])).toEqual([
      [500, 500, 4000, 2000],
      [500, 2700, 4000, 1500],
    ]);
  });

  it("a room may override the strip's cross dimension with `size <main>x<cross>`", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 0 height 3000 {
        room id=a size 2000
        room id=b size 2000x2000
      }
    }`;
    const rooms = roomsOf(src);
    expect(rooms.find((r) => r.id === "a")!.size).toEqual({ w: 2000, h: 3000 });
    expect(rooms.find((r) => r.id === "b")!.size).toEqual({ w: 2000, h: 2000 });
  });

  it("strip rooms carry uses and are referenceable relationally", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 100 height 3000 {
        room id=k size 3000 label "Kitchen" uses kitchen
      }
      room id=bath right-of k gap 100 size 2000x3000
    }`;
    const rooms = roomsOf(src);
    expect(rooms.find((r) => r.id === "k")!.uses).toEqual(["kitchen"]);
    // right-of k (at x=0,w=3000) with gap 100 → x=3100.
    expect(rooms.find((r) => r.id === "bath")!.at.x).toBe(3100);
  });

  it("raises E_STRIP_SIZE when a room has no cross dimension and the strip supplies none", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 0 {
        room id=a size 2000
      }
    }`;
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_STRIP_SIZE")).toBe(true);
  });

  it("raises E_STRIP_NEST for a strip inside a component", () => {
    const src = `plan "P" {
      units mm
      grid 1
      component c() {
        strip right at (0,0) gap 0 height 1000 { room size 1000 }
      }
      c()
    }`;
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_STRIP_NEST")).toBe(true);
  });

  it("raises E_STRIP_NEST for a strip nested inside another strip", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 0 height 1000 {
        room size 1000
        strip down at (0,0) gap 0 width 1000 { room size 1000 }
      }
    }`;
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_STRIP_NEST")).toBe(true);
  });

  it("round-trips a strip through the formatter (idempotent, semantics-preserving)", () => {
    const src = `plan "P" {
      units mm
      grid 1
      strip right at (0,0) gap 100 height 3000 {
        room id=k size 2000 label "Kitchen"
        room id=d size 2500x2800
      }
    }`;
    const out = format(src);
    expect(out).toContain("strip right at (0, 0) gap 100 height 3000");
    expect(out).toContain('room id=k size 2000 label "Kitchen"');
    expect(out).toContain("room id=d size 2500x2800");
    expect(format(out)).toBe(out); // idempotent
    expect(compile(out, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg); // semantics
  });
});
