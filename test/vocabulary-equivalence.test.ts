/**
 * Equivalence pin for the room-label → `uses` / `room_type` classifier.
 *
 * Tranche 6 Track B replaces the scattered label regexes in `analyze.ts` /
 * `analyze/circulation.ts` with the shared token-bounded matcher in
 * `src/vocabulary.ts`. This test freezes, for every `examples/*.arch` and
 * `eval/goldens/*.arch`, each room's `describe()` `uses` array and derived
 * `room_type` as they were BEFORE the refactor (the regex layer, at HEAD). The
 * expected table in `test/fixtures/vocabulary-equivalence.json` was generated
 * from that HEAD behavior.
 *
 * The refactor must keep every row byte-identical — the switch to token-bounded
 * matching is a pure re-expression of the regexes, not a reclassification. A
 * mismatch means the vocabulary is wrong (fix the vocabulary), NOT that this
 * pin should be regenerated. Never `-u` this table to green a red suite; a real
 * classification change here is a behavior change and must be intended and
 * reviewed, then the fixture edited deliberately.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";
import type { World } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface RoomRow {
  id: string;
  label: string | null;
  uses: string[];
  room_type: string;
}

const EXPECTED = JSON.parse(readFileSync(join(HERE, "fixtures", "vocabulary-equivalence.json"), "utf8")) as Record<
  string,
  RoomRow[]
>;

/** A Node-fs World for import resolution, mirroring the CLI's `makeNodeWorld`. */
function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolve(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

/** Every classifiable `.arch` source, keyed by its repo-relative POSIX path. */
function corpusFiles(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(join(ROOT, "examples"))) if (f.endsWith(".arch")) out.push(`examples/${f}`);
  for (const f of readdirSync(join(ROOT, "eval", "goldens"))) if (f.endsWith(".arch")) out.push(`eval/goldens/${f}`);
  return out.sort();
}

function actualRows(relPath: string): RoomRow[] {
  const abs = join(ROOT, relPath);
  const src = readFileSync(abs, "utf8");
  const d = describePlan(src, { world: worldFor(dirname(abs)) });
  return d.rooms.map((r) => ({
    id: r.id,
    label: r.label ?? null,
    uses: r.uses,
    room_type: r.room_type,
  }));
}

suite("vocabulary equivalence — describe() uses + room_type are pinned to HEAD", () => {
  it("covers exactly the committed corpus (no file added/removed without updating the pin)", () => {
    expect(corpusFiles()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const rel of corpusFiles()) {
    it(`${rel}: room uses + room_type unchanged`, () => {
      expect(actualRows(rel)).toEqual(EXPECTED[rel]);
    });
  }
});
