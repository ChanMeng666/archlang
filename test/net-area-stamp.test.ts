/**
 * `schedule rooms net`: the room stamp prints the schedule's NET AREA figure, named.
 *
 * The byte law: a plan that does not write the word renders, describes, lints and reports exactly as
 * it did before it existed. The pins below were measured at `90cee401` by running
 * `allStoreysDigestWithDiagnostics` (the SAME body, `test/byte-identity-digest.ts`) against a
 * `git archive` of that commit's `src/`, over the fixtures of `net-area-stamp-fixtures.ts`.
 * The shipped examples are held by their own laws; the sweep that crossed them with the word
 * is in the design note.
 */

import { describe as suite, expect, it } from "vitest";
import { room } from "../src/elements/room.js";
import { compile, describe as describePlan, format, lint, planToJson } from "../src/index.js";
import { fmtTenthsOf2dp } from "../src/num-format.js";
import type { RRoom } from "../src/ir.js";
import { renderSizes } from "../src/sheet.js";
import { DEFAULT_THEME } from "../src/theme.js";
import { allStoreysDigestWithDiagnostics } from "./byte-identity-digest.js";
import { MACRO, NET, NO_SCHEDULE, NO_WALLS, ROUND, SHAPES_NET, SHAPES_TWIN, TWIN } from "./net-area-stamp-fixtures.js";

const api = { compile, describe: describePlan, lint };

/** Every stamp's text, in document order. */
const stamps = (svg: string): string[] => [...svg.matchAll(/>([\d.]+ m²(?: net)?)</g)].map((m) => m[1]!);

/** The drawing with every stamp reduced to one token, so only the stamps can differ. */
const unstamped = (svg: string): string => svg.replace(/[\d.]+ m²(?: net)?</g, "A<");

suite("schedule rooms net: the byte law", () => {
  it("a plan without the word is unchanged (pins taken at 90cee401)", () => {
    expect(allStoreysDigestWithDiagnostics(api, TWIN)).toBe(
      "2659dfbcfb98f15817612dd0e9412a246a6000177e6707e6b4a236e067d60303",
    );
    expect(allStoreysDigestWithDiagnostics(api, NO_SCHEDULE)).toBe(
      "06f1784142de860335f614f7fd42aa26a02166346f96bbaa8fec745d769d4070",
    );
    expect(allStoreysDigestWithDiagnostics(api, SHAPES_TWIN)).toBe(
      "ccd9f3ad5eef76bd6f726ab9f5e8f102ebb7df250b0fe79e4c792f614ff08600",
    );
  });

  it("a macro call named net on the line after the schedule still parses (pin taken at e338eeac)", () => {
    expect(compile(MACRO, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(allStoreysDigestWithDiagnostics(api, MACRO)).toBe(
      "d5666dc1a73feab167da3505a729144bcce9e23a13cfd5fa9417f50af3c91fc6",
    );
  });

  it("the pin can fail: the word moves the digest", () => {
    expect(allStoreysDigestWithDiagnostics(api, NET)).not.toBe(allStoreysDigestWithDiagnostics(api, TWIN));
  });

  it("with the word only the stamps move: describe(), diagnostics and lint hold", () => {
    for (const [twin, net] of [
      [TWIN, NET],
      [SHAPES_TWIN, SHAPES_NET],
    ] as const) {
      const a = compile(twin, { noCache: true });
      const b = compile(net, { noCache: true });
      expect(unstamped(b.svg)).toBe(unstamped(a.svg));
      expect(JSON.stringify(b.diagnostics.map(({ span: _s, ...d }) => d))).toBe(
        JSON.stringify(a.diagnostics.map(({ span: _s, ...d }) => d)),
      );
      expect(JSON.stringify(describePlan(net))).toBe(JSON.stringify(describePlan(twin)));
      expect(lint(net).map((d) => d.code)).toEqual(lint(twin).map((d) => d.code));
    }
  });
});

suite("schedule rooms net: the stamp", () => {
  it("the default stamp is the centreline area; the word swaps in the schedule's own figure", () => {
    expect(stamps(compile(TWIN).svg).slice(0, 2)).toEqual(["12.0 m²", "12.0 m²"]);
    const rooms = describePlan(NET).rooms;
    expect(rooms.map((r) => r.net_area_m2)).toEqual([10.36, 10.36]);
    expect(stamps(compile(NET).svg).slice(0, 2)).toEqual(["10.4 m² net", "10.4 m² net"]);
  });

  it("polygon and circle rooms print the figure describe() gives them", () => {
    const rooms = describePlan(SHAPES_NET).rooms;
    const printed = stamps(compile(SHAPES_NET).svg);
    for (const r of rooms) {
      expect(r.net_area_m2).toBeDefined();
      expect(printed).toContain(
        r.net_area_m2 === r.area_m2 ? `${r.area_m2.toFixed(1)} m²` : `${fmtTenthsOf2dp(r.net_area_m2!)} m² net`,
      );
    }
  });

  it("a room with no net figure keeps the centreline stamp, unsuffixed", () => {
    // `netAreaOf` answers undefined for a room the schedule could not measure (too many edges,
    // too much probe work, or an integral out of range): the element must then draw its own figure.
    const el = { kind: "room", id: "a", at: { x: 0, y: 0 }, size: { w: 3000, h: 4000 }, label: "Living" } as RRoom;
    const sizes = renderSizes(undefined, 6000, 4000, 1);
    const bounds = { minX: 0, minY: 0, maxX: 6000, maxY: 4000 };
    const texts = (netAreaOf?: (id: string) => number | undefined): string[] =>
      room
        .render(el, { theme: DEFAULT_THEME, sizes, bounds, fmt: String, netAreaOf })
        .flatMap((n) => (n.prim.t === "text" ? [n.prim.value] : []));
    expect(texts()).toEqual(["Living", "12.0 m²"]);
    expect(texts(() => undefined)).toEqual(["Living", "12.0 m²"]);
    expect(texts(() => 10.36)).toEqual(["Living", "10.4 m² net"]);
  });

  it("a narrow room's wider stamp goes through the fit passes, which read the printed string", () => {
    const hall = (schedule: string): string =>
      [
        'plan "narrow" {',
        "  units mm",
        "  paper A3 landscape",
        "  scale 1:50",
        `  ${schedule}`,
        "  wall id=w exterior thickness 100 { (0,0) (600,0) (600,4000) (0,4000) close }",
        '  room id=a at (0,0) size 600x4000 label "Hall"',
        "}",
        "",
      ].join("\n");
    const size = (svg: string, text: string): number =>
      Number(new RegExp(`font-size="([\\d.]+)"[^>]*>${text}</text>`).exec(svg)![1]);
    const plain = compile(hall("schedule rooms"), { noCache: true });
    const net = compile(hall("schedule rooms net"), { noCache: true });
    expect(size(net.svg, "2.0 m² net")).toBeLessThan(size(plain.svg, "2.4 m²"));
    expect(lint(hall("schedule rooms net")).filter((d) => d.code === "W_ANNOTATION_OVERLAP")).toEqual([]);
  });
});

suite("schedule rooms net: what the stamp claims", () => {
  it("rounds the table's two decimals half up: 9.45 stamps 9.5, and the centreline stamp keeps toFixed", () => {
    expect(describePlan(ROUND).rooms[0]!.net_area_m2).toBe(9.45);
    expect(stamps(compile(ROUND).svg)[0]).toBe("9.5 m² net");
    expect([9.45, 9.95, 0.04, 10.36, 12].map(fmtTenthsOf2dp)).toEqual(["9.5", "10.0", "0.0", "10.4", "12.0"]);
    expect(stamps(compile(ROUND.replace("schedule rooms net", "schedule rooms")).svg)[0]).toBe("11.4 m²");
  });

  it("a room nothing was deducted from keeps the bare stamp", () => {
    expect(stamps(compile(NO_WALLS).svg).slice(0, 2)).toEqual(["12.0 m²", "12.0 m²"]);
  });

  it("Plan JSON says it left the word out", () => {
    expect(planToJson(NET).dropped).toContainEqual({ clause: "schedule rooms", count: 1, text: "schedule rooms net" });
    expect(planToJson(TWIN).dropped).toContainEqual({ clause: "schedule rooms", count: 1 });
  });
});

suite("schedule rooms net: the statement", () => {
  it("formats and re-parses", () => {
    const once = format(NET);
    expect(once).toContain("schedule rooms net");
    expect(format(once)).toBe(once);
    expect(format(TWIN)).not.toContain(" net");
  });

  it("applies to rooms only, and `net` stays a legal id", () => {
    const bad = compile(NET.replace("schedule rooms net", "schedule openings net"));
    expect(bad.diagnostics.some((d) => d.severity === "error")).toBe(true);
    const id = compile(TWIN.replace("room id=a ", "room id=net "));
    expect(id.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
