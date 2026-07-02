import { describe, expect, it } from "vitest";
import { b64urlToBytes, bytesToB64url, encodeSrc, srcFromHash } from "../src/share.js";

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

  it("encodes to the compressed #z= form when CompressionStream exists", async () => {
    const hash = await encodeSrc(SRC);
    if (typeof CompressionStream !== "undefined") expect(hash.startsWith("#z=")).toBe(true);
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
