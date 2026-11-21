import { compile, renderErrorSvg, THEMES } from "archlang";
import { describe, expect, it } from "vitest";
import { compile as doorCompile } from "../src/compiler.js";
import { embedCompileOptions, embedRenders, hashParam, isEditable, renderDecision } from "../src/embed-params.js";

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

  // Card 3.19: the compiler chunk's `compile` (the door's, compileWithoutErrorCard) draws no card,
  // and embed.ts draws it with renderErrorSvg (error-card.ts). What the embed shows is still what
  // compile() draws under these options, card or drawing, for every theme key.
  it("the door's compile plus renderErrorSvg on an error is compile() under these options, byte for byte", () => {
    const BROKEN = 'plan "x" {\n  units mm\n  romo at (0,0) size 4000x3000\n  door at (1,1) width -5\n}';
    const LEVELS =
      'plan "y" {\n  room at (0,0) size 3000x3000\n  level 1 { wall exterior thickness 200 { (0,0) (3000,0) close } }\n}';
    const GOOD = 'plan "ok" {\n  units mm\n  room at (0,0) size 4000x3000 label "Room"\n}';
    for (const key of [null, "blueprint", "not-a-theme"]) {
      const opts = embedCompileOptions(key);
      for (const src of [BROKEN, LEVELS, GOOD]) {
        const expected = compile(src, opts);
        const door = doorCompile(src, opts);
        const shown = door.errors.length > 0 ? renderErrorSvg(src, door.diagnostics) : door.svg;
        expect(shown, `${key} ${src.slice(0, 12)}`).toBe(expected.svg);
        expect(door.svg, "the door draws no card").toBe(door.errors.length > 0 ? "" : expected.svg);
        expect(door.diagnostics).toEqual(expected.diagnostics);
        expect(door.errors).toEqual(expected.errors);
      }
      expect(compile(BROKEN, opts).svg, "the probe compiles a broken plan").toContain("<svg");
    }
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

describe("embedRenders (card 3.19: the embed's card arrives after its render)", () => {
  it("a render is current until a newer one begins", () => {
    const r = embedRenders(async () => 0);
    const a = r.begin();
    expect(r.current(a)).toBe(true);
    const b = r.begin();
    expect(r.current(a), "a card for the older render is stale").toBe(false);
    expect(r.current(b)).toBe(true);
  });

  it("fits the first thing shown whatever the caller asked, then keeps the caller's refit", () => {
    // A broken editable embed: the first render (refit) draws nothing at once; the next one
    // (refit false, typing) may be the first to show anything, so it must still fit.
    const r = embedRenders(async () => 0);
    expect(r.shown(false)).toBe(true);
    expect(r.shown(false)).toBe(false);
    expect(r.shown(true)).toBe(true);
    expect(embedRenders(async () => 0).shown(true)).toBe(true);
  });

  it("loads the card once and shares it; a failed load is forgotten and tried again", async () => {
    let calls = 0;
    let fail = true;
    const r = embedRenders(async () => {
      calls++;
      if (fail) throw new Error("offline");
      return "card";
    });
    const first = r.card();
    expect(r.card(), "a load in flight is shared").toBe(first);
    await expect(first).rejects.toThrow("offline");
    fail = false;
    await expect(r.card()).resolves.toBe("card");
    await expect(r.card()).resolves.toBe("card");
    expect(calls).toBe(2);
  });
});
