import { beforeEach, describe, expect, it } from "vitest";
import { KEYS, readJSON, readStr, writeJSON, writeStr } from "../src/storage.js";
import { installLocalStorage } from "./helpers.js";

describe("storage", () => {
  beforeEach(() => installLocalStorage());

  it("readStr returns null for a missing key", () => {
    expect(readStr("missing")).toBeNull();
  });

  it("writeStr / readStr round-trips a value", () => {
    writeStr("k", "hello");
    expect(readStr("k")).toBe("hello");
  });

  it("readJSON returns the fallback when the key is absent", () => {
    expect(readJSON("nope", 42)).toBe(42);
  });

  it("readJSON returns the fallback on malformed JSON", () => {
    writeStr("bad", "{ not json");
    expect(readJSON<null>("bad", null)).toBeNull();
  });

  it("writeJSON / readJSON round-trips an object", () => {
    writeJSON("obj", { a: 1, b: ["x"] });
    expect(readJSON("obj", null)).toEqual({ a: 1, b: ["x"] });
  });

  it("namespaces every key under archlang.pg.", () => {
    for (const key of Object.values(KEYS)) expect(key).toMatch(/^archlang\.pg\./);
  });

  it("degrades to null / no-op when localStorage throws", () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readStr("k")).toBeNull();
    expect(() => writeStr("k", "v")).not.toThrow();
    expect(readJSON("k", "fallback")).toBe("fallback");
  });
});
