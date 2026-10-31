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
 *
 * ## Three rows re-derived on 2026-10-18 (plan-soundness PS0.7): the label classifier emits living
 *
 * `classifyLabelUses` used to leave `living`/`dining` out, so a label-only "Living" room read as
 * `uses: []` while circulation and the equator-aspect rule classified the same label as living
 * through a second function. It now emits them (appended after every older kind), and exactly
 * three rows moved, each a room with no authored `uses`:
 *
 *   - `examples/relational.arch` `living` "Living": `[]`/`Room` → `["living"]`/`LivingRoom`
 *   - `examples/themed.arch` `a` "Living": `[]`/`Room` → `["living"]`/`LivingRoom`
 *   - `examples/two-bed.arch` `r_kitchen` "Kitchen / Living": `["kitchen"]`/`Kitchen` →
 *     `["kitchen", "living"]`/`LivingRoom`
 *
 * The `room_type` change is the one an authored `uses` already gets: `roomTypeForUses` ranks
 * `living` first, and every pinned room that authored `uses living kitchen` (e.g.
 * `eval/goldens/accessible-bath.arch`'s "Living / Kitchen") was `LivingRoom` before this change,
 * so a label-only room now agrees with an authored one. No other row, field or order moved. The
 * three rows were edited by hand to the values the corpus sweep measured, nothing else.
 *
 * ## One example added on 2026-11-01 (issue #362, S2): `examples/turning-stair.arch`
 *
 * A new file, not a classifier change: its four rows were taken from `describe()` when it was
 * added. No other row moved.
 *
 * ## One example added on 2026-10-28 (preview-and-remodel B3b): `examples/remodel.arch`
 *
 * A new file, not a classifier change: its six rows were taken from `describe()` when it was
 * added. No other row moved.
 *
 * ## Four examples re-derived on 2026-10-27 (fix/examples-sound): their SOURCE changed
 *
 * Not a classifier change: the design review gave `garden-house` a study for its street-side
 * bedroom, rebuilt `hillside-villa`'s upper floor (study, studio, two bedroom suites), and gave
 * `library` and `museum` an accessible WC (the library's in place of its plant room). Those four
 * examples' rows were re-taken from `describe()`; no other row moved.
 *
 * ## Five rows edited on 2026-10-18 (plan-soundness PS2.9): two examples' SOURCE changed
 *
 * Not a classifier change: two examples dropped an authored use that misdescribed a room.
 *   - `examples/corner-cafe.arch` `r_servery` "Servery": `uses kitchen` dropped (a bar servery
 *     with no sink or hob is not a kitchen, and no use describes one) → `[]`/`Room`.
 *   - `examples/terrace-row.arch` `u1`–`u4.living` "Living": `uses living dining kitchen` →
 *     `living kitchen` (its header calls the room living + kitchen; it holds no table);
 *     `room_type` stays `LivingRoom`.
 * Edited by hand to what `describe()` measures, nothing else.
 *
 * ## Two rows re-derived on 2026-10-20 (plan-soundness PS2.19): the fallback vocabulary
 *
 * `classifyLabelUses` reads a fallback table (storage, office, utility, a nursery, a water
 * closet) for a label its primary table leaves empty, so only rooms that read `[]` can move.
 * Exactly two did, each a room with no authored `uses`:
 *   - `eval/goldens/office.arch` `r_open` "Open Office": `[]`/`Room` → `["office"]`/`StudyRoom`
 *   - `examples/furnished-flat.arch` `r_util` "Utility": `[]`/`Room` → `["utility"]`/`Storage`
 * Both types are the ones an authored `uses office` / `uses utility` already gets (rows of the
 * same table: `sized-office-mix`'s "Open Office", `courtyard-house`'s "Utility"). Edited by hand
 * to the values the corpus sweep measured, nothing else.
 *
 * ## Two examples' rows rewritten on 2026-10-23 (plan-soundness PS3.6): their SOURCE changed
 *
 * Not a classifier change: `examples/two-bed.arch` was re-laid (its "Kitchen / Living" room is
 * now `r_living` with an authored `uses kitchen living`, and the rooms are listed in the new
 * source order), and `examples/relational.arch` gained a "Hall" room (`["hall"]`/`Entrance`,
 * as every other label-only "Hall" in this table). Every surviving label keeps its old
 * `uses` and `room_type`. Edited by hand to what `describe()` measures, nothing else.
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
  // A multi-storey plan's top-level `rooms` is only its LOWEST level, so pin every
  // storey's rooms in level order — otherwise the upper floors' labels would go
  // unclassified by this gate. Single-storey plans have no `levels`, so their rows are
  // exactly as before.
  const rooms = d.levels ? d.levels.flatMap((l) => l.rooms) : d.rooms;
  return rooms.map((r) => ({
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
