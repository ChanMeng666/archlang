import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  b64urlToBytes,
  bytesToB64url,
  encodeSrc,
  has3dFlag,
  hasEditFlag,
  set3dFlag,
  setEditFlag,
  shareableHref,
  srcFromHash,
  updateHash,
} from "../src/share.js";
import { KEYS } from "../src/storage.js";
import { supportsDeflateRaw } from "./helpers.js";

const SRC = `plan "X" {\n  units mm\n  room at (0,0) size 4000x3000 label "Room ünïcode ✓"\n}`;

describe("share codec", () => {
  it("bytes <-> base64url round-trips (UTF-8 safe)", () => {
    const bytes = new TextEncoder().encode(SRC);
    expect(Array.from(b64urlToBytes(bytesToB64url(bytes)))).toEqual(Array.from(bytes));
  });

  it("base64url output is URL-safe (no +, /, or = padding)", () => {
    const b64 = bytesToB64url(new TextEncoder().encode(SRC));
    expect(b64).not.toMatch(/[+/=]/);
  });

  it("encode -> decode round-trips the source", async () => {
    const hash = await encodeSrc(SRC);
    expect(await srcFromHash(hash)).toBe(SRC);
  });

  it("encodes to the compressed #z= form when deflate-raw compression is available", async () => {
    // Probe the ACTUAL capability encodeSrc uses (`supportsDeflateRaw`, helpers.ts):
    // without it encodeSrc correctly falls back to the raw #src= form.
    const hash = await encodeSrc(SRC);
    if (supportsDeflateRaw) expect(hash.startsWith("#z=")).toBe(true);
    else expect(hash.startsWith("#src=")).toBe(true);
  });

  it("still reads the legacy raw #src= form", async () => {
    const legacy = `#src=${bytesToB64url(new TextEncoder().encode(SRC))}`;
    expect(await srcFromHash(legacy)).toBe(SRC);
  });

  it("reads a token that appears after other &-joined params", async () => {
    const hash = `#theme=dark&src=${bytesToB64url(new TextEncoder().encode(SRC))}`;
    expect(await srcFromHash(hash)).toBe(SRC);
  });

  it("returns null when the hash carries no known token", async () => {
    expect(await srcFromHash("#theme=dark")).toBeNull();
    expect(await srcFromHash("")).toBeNull();
  });

  it("returns null on undecodable payloads rather than throwing", async () => {
    expect(await srcFromHash("#src=!!!not-base64!!!")).toBeNull();
  });
});

describe("the edit-mode flag", () => {
  it("the token still parses with the flag after it, before it, or among other params", async () => {
    const hash = await encodeSrc(SRC);
    const token = hash.slice(1);
    for (const h of [`${hash}&edit`, `#edit&${token}`, `#theme=dark&${token}&edit`]) {
      expect(await srcFromHash(h), h).toBe(SRC);
    }
  });

  it("is read as a whole param, never as part of a token", () => {
    expect(hasEditFlag("#edit")).toBe(true);
    expect(hasEditFlag("#z=abc&edit")).toBe(true);
    expect(hasEditFlag("#edit&z=abc")).toBe(true);
    expect(hasEditFlag("")).toBe(false);
    expect(hasEditFlag("#z=abc")).toBe(false);
    // base64url can spell "edit" inside a token; only a `&`-separated param counts.
    expect(hasEditFlag("#z=xxedit")).toBe(false);
    expect(hasEditFlag("#z=abc&editable=1")).toBe(false);
  });

  it("sets and clears the flag, keeping every other param in order", () => {
    expect(setEditFlag("#z=abc", true)).toBe("#z=abc&edit");
    expect(setEditFlag("#z=abc&edit", true)).toBe("#z=abc&edit");
    expect(setEditFlag("#edit&z=abc", true)).toBe("#z=abc&edit");
    expect(setEditFlag("#z=abc&edit", false)).toBe("#z=abc");
    expect(setEditFlag("", true)).toBe("#edit");
    expect(setEditFlag("#edit", false)).toBe("");
    expect(setEditFlag("", false)).toBe("");
  });

  it("index.html's head script reads the flag, and the saved draft, by the same rules", () => {
    // The head script sets the mode before the first paint, so it cannot import share.ts: it
    // carries its own regex and storage key, held here to the module's.
    const html = readFileSync("playground/index.html", "utf8");
    const mode = /root\.dataset\.mode = \/(.+?)\/\.test\(hash\)/.exec(html);
    expect(mode, "the head script's mode test").toBeTruthy();
    const re = new RegExp(mode![1]!);
    for (const h of [
      "",
      "#edit",
      "#z=abc&edit",
      "#edit&z=abc",
      "#z=abc",
      "#z=xxedit",
      "#z=abc&editable=1",
      "#src=a&edit",
    ]) {
      expect(re.test(h), h).toBe(hasEditFlag(h));
    }
    expect(html).toContain(`localStorage.getItem("${KEYS.source}")`);
    // A saved render theme draws the plan differently from the built-in drawing.
    expect(html).toContain(`localStorage.getItem("${KEYS.theme}")`);
  });

  it("a shared link drops the flag and nothing else", () => {
    expect(shareableHref("https://p.example/#z=abc&edit")).toBe("https://p.example/#z=abc");
    expect(shareableHref("https://p.example/#z=abc")).toBe("https://p.example/#z=abc");
    expect(shareableHref("https://p.example/")).toBe("https://p.example/");
  });
});

describe("the 3D flag (card X5)", () => {
  it("the token still parses with the flag after it, before it, or beside the edit flag", async () => {
    const hash = await encodeSrc(SRC);
    const token = hash.slice(1);
    for (const h of [`${hash}&3d`, `#3d&${token}`, `${hash}&3d&edit`, `#edit&3d&${token}`]) {
      expect(await srcFromHash(h), h).toBe(SRC);
    }
  });

  it("is read as a whole param, never as part of a token", () => {
    expect(has3dFlag("#3d")).toBe(true);
    expect(has3dFlag("#z=abc&3d")).toBe(true);
    expect(has3dFlag("#3d&z=abc")).toBe(true);
    expect(has3dFlag("#z=abc&3d&edit")).toBe(true);
    expect(has3dFlag("")).toBe(false);
    expect(has3dFlag("#z=abc")).toBe(false);
    expect(has3dFlag("#z=abc&edit")).toBe(false);
    // base64url can spell "3d" inside a token; only a `&`-separated param counts.
    expect(has3dFlag("#z=xx3d")).toBe(false);
    expect(has3dFlag("#z=3d")).toBe(false);
    expect(has3dFlag("#z=abc&3dx")).toBe(false);
    // The two flags are read apart.
    expect(hasEditFlag("#z=abc&3d")).toBe(false);
    expect(hasEditFlag("#z=abc&3d&edit")).toBe(true);
  });

  it("sets and clears the flag after every other param and before edit, whichever is set last", () => {
    expect(set3dFlag("#z=abc", true)).toBe("#z=abc&3d");
    expect(set3dFlag("#z=abc&3d", true)).toBe("#z=abc&3d");
    expect(set3dFlag("#3d&z=abc", true)).toBe("#z=abc&3d");
    expect(set3dFlag("#z=abc&3d", false)).toBe("#z=abc");
    expect(set3dFlag("", true)).toBe("#3d");
    expect(set3dFlag("#3d", false)).toBe("");
    expect(set3dFlag("", false)).toBe("");
    // Beside the edit flag: one order, whichever was set last.
    expect(set3dFlag("#z=abc&edit", true)).toBe("#z=abc&3d&edit");
    expect(setEditFlag("#z=abc&3d", true)).toBe("#z=abc&3d&edit");
    expect(set3dFlag("#z=abc&3d&edit", false)).toBe("#z=abc&edit");
    expect(setEditFlag("#z=abc&3d&edit", false)).toBe("#z=abc&3d");
    expect(set3dFlag("#edit", true)).toBe("#3d&edit");
  });

  it("updateHash reads flags given as functions at the write, after the compression", async () => {
    const writes: string[] = [];
    vi.stubGlobal("window", { history: { replaceState: (_s: unknown, _t: string, h: string) => writes.push(h) } });
    try {
      // The view switches while the token is being compressed: the write carries the new flag.
      let view3d = false;
      let edit = true;
      const pending = updateHash(
        SRC,
        () => edit,
        () => view3d,
      );
      view3d = true;
      edit = false;
      await pending;
      expect(writes).toHaveLength(1);
      expect(hasEditFlag(writes[0]!)).toBe(false);
      expect(has3dFlag(writes[0]!)).toBe(true);
      expect(await srcFromHash(writes[0]!)).toBe(SRC);
      // Plain booleans, as before.
      await updateHash(SRC, true, false);
      expect(hasEditFlag(writes[1]!)).toBe(true);
      expect(has3dFlag(writes[1]!)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a shared link keeps the 3D flag and drops the edit flag", () => {
    expect(shareableHref("https://p.example/#z=abc&3d")).toBe("https://p.example/#z=abc&3d");
    expect(shareableHref("https://p.example/#z=abc&3d&edit")).toBe("https://p.example/#z=abc&3d");
    expect(shareableHref("https://p.example/#3d")).toBe("https://p.example/#3d");
  });

  it("the head script's mode test reads `&3d&edit` as edit mode and `&3d` as view mode", () => {
    const html = readFileSync("playground/index.html", "utf8");
    const mode = /root\.dataset\.mode = \/(.+?)\/\.test\(hash\)/.exec(html);
    const re = new RegExp(mode![1]!);
    for (const h of ["#3d", "#z=abc&3d", "#z=abc&3d&edit", "#3d&edit", "#edit&3d"]) {
      expect(re.test(h), h).toBe(hasEditFlag(h));
    }
  });
});
