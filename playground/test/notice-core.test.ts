/**
 * The stage notice's pure rules (notice-core.ts): how long a message stays, and how a message for
 * an action that rewrote the source names its undo. Audit U4 (a fixed 1.2 s cut long messages off)
 * and U20 (only Finish said how to undo).
 */
import { describe, expect, it } from "vitest";
import { noticeMs, undoChord, withUndo } from "../src/notice-core.js";

describe("noticeMs: a notice's life follows its length", () => {
  it("gives a short message the floor, 1.8 s", () => {
    expect(noticeMs("Copied")).toBe(1800); // 1500 + 45 × 6 = 1770, under the floor
  });

  it("grows 45 ms a character above it", () => {
    const msg = "Short link unavailable: full link copied"; // 40 characters
    expect(noticeMs(msg)).toBe(1500 + 45 * msg.length);
    expect(noticeMs(`${msg}!`) - noticeMs(msg)).toBe(45);
  });

  it("never stays more than 6 s", () => {
    expect(noticeMs("x".repeat(500))).toBe(6000);
  });

  it("stays 6 s whenever it carries an action, however short or long", () => {
    expect(noticeMs("Undo?", true)).toBe(6000);
    expect(noticeMs("x".repeat(500), true)).toBe(6000);
    expect(noticeMs("Undo?", true)).toBeGreaterThan(noticeMs("Undo?"));
  });
});

describe("withUndo: a rewrite says how to take it back", () => {
  it("names Ctrl+Z off Apple platforms", () => {
    expect(undoChord("Win32")).toBe("Ctrl+Z");
    expect(undoChord("Linux x86_64")).toBe("Ctrl+Z");
    expect(withUndo("Formatted", "Win32")).toBe("Formatted · Ctrl+Z undoes");
  });

  it("names ⌘Z on a Mac, an iPhone and an iPad", () => {
    for (const p of ["MacIntel", "iPhone", "iPad"]) expect(undoChord(p)).toBe("⌘Z");
    expect(withUndo("Finished: 3 changes", "MacIntel")).toBe("Finished: 3 changes · ⌘Z undoes");
  });

  it("names no chord on a touch-only device, which has no keyboard to press it on", () => {
    expect(withUndo("Formatted", "iPhone", true)).toBe("Formatted");
    expect(withUndo("Formatted", "Linux armv8l", true)).toBe("Formatted");
  });
});
