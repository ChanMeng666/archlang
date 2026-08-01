import { THEMES } from "archlang";
import { describe, expect, it } from "vitest";
import { embedCompileOptions, hashParam, isEditable, renderDecision } from "../src/embed-params.js";

// A representative embed hash: the share codec's token first, params after.
const Z = "#z=q1ZQKUnNzS8qUbJSUEpKLElNUXBKzUvOz1Owys3PSy3SUUjLL1KwUgAA";

describe("hashParam", () => {
  it("reads a param that follows the codec token", () => {
    expect(hashParam(`${Z}&editable=1`, "editable")).toBe("1");
    expect(hashParam(`${Z}&theme=blueprint`, "theme")).toBe("blueprint");
  });

  it("reads a param sitting directly after the # (no source token at all)", () => {
    expect(hashParam("#editable=1", "editable")).toBe("1");
    expect(hashParam("#theme=mono", "theme")).toBe("mono");
  });

  it("reads each of several &-joined params independently", () => {
    const hash = `${Z}&editable=1&theme=dark`;
    expect(hashParam(hash, "editable")).toBe("1");
    expect(hashParam(hash, "theme")).toBe("dark");
  });

  it("does not care about param order", () => {
    expect(hashParam(`#theme=mono&editable=1`, "theme")).toBe("mono");
    expect(hashParam(`#editable=1&theme=mono`, "theme")).toBe("mono");
  });

  it("returns null for an absent param and for an empty hash", () => {
    expect(hashParam(Z, "editable")).toBeNull();
    expect(hashParam("", "theme")).toBeNull();
    expect(hashParam("#", "theme")).toBeNull();
  });

  it("stops at the next & (a value never swallows the following param)", () => {
    expect(hashParam("#theme=dark&editable=1", "theme")).toBe("dark");
  });

  it("returns the empty string for a present-but-empty param", () => {
    expect(hashParam("#theme=&editable=1", "theme")).toBe("");
  });

  it("percent-decodes the value", () => {
    expect(hashParam("#theme=blue%20print", "theme")).toBe("blue print");
  });

  it("does not match a param whose name is only a SUFFIX of another", () => {
    // `[#&]` anchoring is what stops "theme" matching inside "xtheme".
    expect(hashParam("#xtheme=dark", "theme")).toBeNull();
  });
});

describe("isEditable", () => {
  it("is true only for the exact value 1", () => {
    expect(isEditable(`${Z}&editable=1`)).toBe(true);
    expect(isEditable(`${Z}&editable=0`)).toBe(false);
    expect(isEditable(`${Z}&editable=true`)).toBe(false);
    expect(isEditable(`${Z}&editable=`)).toBe(false);
    expect(isEditable(Z)).toBe(false);
  });
});

describe("embedCompileOptions", () => {
  it("always asks for the self-describing error CARD", () => {
    // An embed has no editor to fall back on: a first-load failure must draw
    // something that explains itself, not a blank box.
    expect(embedCompileOptions(null).onError).toBe("svg");
    expect(embedCompileOptions("blueprint").onError).toBe("svg");
    expect(embedCompileOptions("nope").onError).toBe("svg");
  });

  it("applies a known theme key", () => {
    const opts = embedCompileOptions("blueprint");
    expect(opts.theme).toBe(THEMES.blueprint);
  });

  it("ignores an unknown theme key rather than failing (a stale link still draws)", () => {
    expect(embedCompileOptions("not-a-theme").theme).toBeUndefined();
    expect(embedCompileOptions("").theme).toBeUndefined();
    expect(embedCompileOptions(null).theme).toBeUndefined();
  });

  it("bypasses the compile memo so a re-render always reflects the current source", () => {
    expect(embedCompileOptions(null).noCache).toBe(true);
  });
});

describe("renderDecision", () => {
  const err = (message: string) => ({ message });

  it("shows the error card on a FIRST-load failure (nothing good to keep)", () => {
    const d = renderDecision(false, [err("unexpected token")]);
    expect(d.showSvg).toBe(true);
    expect(d.error).toBe("1 error: unexpected token");
    expect(d.hasGoodRender).toBe(false);
  });

  it("keeps the last good render once one exists — a malformed edit never blanks the plan", () => {
    const d = renderDecision(true, [err("unexpected token")]);
    expect(d.showSvg).toBe(false);
    expect(d.error).toBe("1 error: unexpected token");
    expect(d.hasGoodRender).toBe(true);
  });

  it("renders and latches on success", () => {
    const d = renderDecision(false, []);
    expect(d.showSvg).toBe(true);
    expect(d.error).toBeNull();
    expect(d.hasGoodRender).toBe(true);
  });

  it("never clears the latch — a plan that once compiled is never replaced by a card", () => {
    let latch = false;
    latch = renderDecision(latch, []).hasGoodRender; // good
    latch = renderDecision(latch, [err("boom")]).hasGoodRender; // typo
    latch = renderDecision(latch, [err("boom")]).hasGoodRender; // still typing
    expect(latch).toBe(true);
    expect(renderDecision(latch, [err("boom")]).showSvg).toBe(false);
  });

  it("pluralises the count and quotes only the FIRST message", () => {
    expect(renderDecision(false, [err("a"), err("b")]).error).toBe("2 errors: a");
    expect(renderDecision(false, [err("a")]).error).toBe("1 error: a");
  });

  it("is pure — the same inputs give the same answer", () => {
    expect(renderDecision(true, [err("x")])).toEqual(renderDecision(true, [err("x")]));
  });
});
