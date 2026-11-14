/**
 * Throwaway red proof for TP2 (never merged): fails only on Node 18, so exactly one Node 18 shard goes red.
 */
import { expect, it } from "vitest";

it("fails only on Node 18", () => {
  expect(process.version.startsWith("v18")).toBe(false);
});
