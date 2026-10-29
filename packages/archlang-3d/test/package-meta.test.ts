/**
 * The package's stated core floor (card A9): `MIN_CORE`, which the adapter's refusal names, is the
 * `peerDependencies` floor, so the message and the install-time range never disagree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_CORE } from "../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  peerDependencies: Record<string, string>;
};

describe("package metadata", () => {
  it("MIN_CORE is the peer range's floor", () => {
    expect(pkg.peerDependencies["@chanmeng666/archlang"]).toBe(`^${MIN_CORE}`);
  });
});
