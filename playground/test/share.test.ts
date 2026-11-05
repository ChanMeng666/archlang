import { describe, expect, it } from "vitest";
import {
  b64urlToBytes,
  bytesToB64url,
  encodeSrc,
  hasEditFlag,
  setEditFlag,
  shareableHref,
  srcFromHash,
} from "../src/share.js";
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

  it("a shared link drops the flag and nothing else", () => {
    expect(shareableHref("https://p.example/#z=abc&edit")).toBe("https://p.example/#z=abc");
    expect(shareableHref("https://p.example/#z=abc")).toBe("https://p.example/#z=abc");
    expect(shareableHref("https://p.example/")).toBe("https://p.example/");
  });
});
