import { describe, expect, it } from "vitest";
import { compile, sanitizeConfig, isDisallowedConfigValue } from "../src/index.js";

const wallPlan = (directive: string) => `plan "P" {
  units mm
  grid 50
  ${directive}
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Room"
}`;

describe("T4.5 — sanitizeConfig utility", () => {
  it("blocks prototype pollution via a __proto__ key (no pollution, diagnostic emitted)", () => {
    const raw = JSON.parse('{"__proto__": {"polluted": 1}, "ok": "fine"}');
    const { value, diagnostics } = sanitizeConfig<Record<string, unknown>>(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(value.ok).toBe("fine");
    // biome-ignore lint/suspicious/noProto: the test deliberately probes the __proto__ accessor
    expect(value.__proto__).toEqual(Object.prototype); // not an own key
    expect(diagnostics.some((d) => d.code === "W_SANITIZED_CONFIG")).toBe(true);
  });

  it("blocks constructor / prototype keys too", () => {
    const raw = JSON.parse('{"constructor": "x", "prototype": "y", "keep": "z"}');
    const { value } = sanitizeConfig<Record<string, unknown>>(raw);
    expect(Object.keys(value)).toEqual(["keep"]);
  });

  it("strips string values carrying markup or a data: URL", () => {
    const { value, diagnostics } = sanitizeConfig<{ a: string; b: string; c: string }>({
      a: "<script>",
      b: "url(data:image/svg+xml,...)",
      c: "#ff0000",
    });
    expect(value.a).toBe("");
    expect(value.b).toBe("");
    expect(value.c).toBe("#ff0000"); // clean value untouched
    expect(diagnostics.filter((d) => d.code === "W_SANITIZED_CONFIG").length).toBe(2);
  });

  it("isDisallowedConfigValue flags the denied tokens", () => {
    expect(isDisallowedConfigValue("a<b")).toBe(true);
    expect(isDisallowedConfigValue("a>b")).toBe(true);
    expect(isDisallowedConfigValue("URL( DATA:x)")).toBe(true);
    expect(isDisallowedConfigValue("#1b3a5c")).toBe(false);
    expect(isDisallowedConfigValue("Georgia, serif")).toBe(false);
  });
});

describe("T4.5 — sanitization routed through the compiler", () => {
  it("a __proto__ theme key does not pollute Object.prototype (and warns)", () => {
    const { diagnostics } = compile(wallPlan('theme { __proto__: "x" }'), { noCache: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it("a disallowed theme VALUE from source is stripped (W_SANITIZED_CONFIG)", () => {
    const { svg, diagnostics } = compile(wallPlan('theme { wall: "url(data:text/html,evil)" }'), { noCache: true });
    expect(svg).not.toContain("url(data:");
    expect(diagnostics.some((d) => d.code === "W_SANITIZED_CONFIG")).toBe(true);
  });

  it("a disallowed STYLE value from source is stripped too", () => {
    const { diagnostics } = compile(wallPlan('style room { fill: "u<x>l" }'), { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_SANITIZED_CONFIG")).toBe(true);
  });

  it("TRUSTED CompileOptions.theme skips the denylist (author-controlled)", () => {
    // url(data:) in opts.theme is NOT stripped — only escaped for XSS at output.
    const { svg } = compile(wallPlan(""), { noCache: true, theme: { wallStroke: "url(data:foo)" } });
    expect(svg).toContain("url(data:foo)");
  });

  it("well-formed theme config stays byte-identical (sanitization is identity)", () => {
    const plain = compile(wallPlan(""), { noCache: true });
    const themed = compile(wallPlan('theme { wall: "#123456" }'), { noCache: true });
    expect(themed.svg).toContain("#123456");
    expect(plain.errors).toEqual([]);
  });
});
