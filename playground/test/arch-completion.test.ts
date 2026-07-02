import { COMPLETION_KINDS } from "archlang";
import { describe, expect, it } from "vitest";
import { KIND_TO_CM } from "../src/arch-completion.js";

describe("arch-completion KIND_TO_CM", () => {
  it("maps every completion kind the core can emit", () => {
    for (const kind of COMPLETION_KINDS) {
      expect(typeof KIND_TO_CM[kind]).toBe("string");
    }
  });

  it("has no stale keys the core no longer emits", () => {
    for (const key of Object.keys(KIND_TO_CM)) {
      expect(COMPLETION_KINDS).toContain(key);
    }
  });
});
