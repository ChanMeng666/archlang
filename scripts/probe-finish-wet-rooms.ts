/**
 * The wet-room sweep of plan-soundness card PS2.45 — MEASURES `finish`'s furnish stage, changes
 * nothing.
 *
 * The probe set the PS2.11a red team swept (`docs/plans/plan-soundness/research/
 * 2026-10-25-ps211ab-as-built.md` § `finish` sweep: 918 rooms; bath, wc, ensuite; 1.2–3.6 m; door
 * in or out) was never checked in, so it is reconstructed here from those parameters: one room
 * on its own, inside a 200 mm exterior wall, `w` × `h` on the wall centrelines with `w` 1200 to
 * 3600 by 150 and `h` 1200 to 3600 by 300 (17 × 9 sizes), one 800 mm door in the middle of the
 * first (top) wall swinging in or out, and three classes: `uses bath`, `uses wc`, and a room
 * labelled "Ensuite" with no `uses` (the vocabulary reads it as a bath). 17 × 9 × 2 × 3 = 918.
 * The ensuite class repeats the bath class exactly, so it runs only with `--ensuite` (or
 * `{ ensuite: true }`); without it the sweep is the 612 bath and WC rooms.
 *
 * For each room it runs `finish --only furnish` and records whether the room was furnished, the
 * statements written, and the gated codes the result raises under the default ruleset and under
 * `accessibility-advisory` (the universal profile the never-worse law also holds under). A
 * furnished room raising one is a violation.
 *
 * Run: `npx tsx scripts/probe-finish-wet-rooms.ts [--ensuite] [--against <checkout>] [--json]`. `--against`
 * runs the same rooms through another checkout's `finish` (a worktree of `origin/main`, say),
 * judges what it wrote with THIS checkout's lint, and reports the rooms lost and gained per class
 * and the rooms furnished by both whose statements differ.
 */

import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { finish as finishHere, lint as lintHere } from "../src/index.js";

/** The codes no furnished room may raise (card PS2.45, Goal). */
export const GATED = [
  "W_WC_SIDE_CLEARANCE",
  "W_FURNITURE_OVERLAP",
  "W_DOORWAY_BLOCKED",
  "W_SWING_OBSTRUCTED",
  "W_FURN_CLEARANCE",
] as const;

export const CLASSES = [
  ["bath", `label "Bathroom" uses bath`],
  ["wc", `label "WC" uses wc`],
  ["ensuite", `label "Ensuite"`],
] as const;
export type RoomClass = (typeof CLASSES)[number][0];

export interface ProbeRoom {
  cls: RoomClass;
  w: number;
  h: number;
  swing: "in" | "out";
  /** `cls w×h swing`, e.g. `wc 1200x2400 out`. */
  key: string;
  source: string;
}

/** The rooms, in a fixed order: 612, or the 918 with `ensuite`. */
export function probeRooms(opts: { ensuite?: boolean } = {}): ProbeRoom[] {
  const out: ProbeRoom[] = [];
  for (const [cls, tag] of CLASSES.filter(([c]) => c !== "ensuite" || opts.ensuite === true))
    for (let w = 1200; w <= 3600; w += 150)
      for (let h = 1200; h <= 3600; h += 300)
        for (const swing of ["in", "out"] as const)
          out.push({
            cls,
            w,
            h,
            swing,
            key: `${cls} ${w}x${h} ${swing}`,
            source: `plan "Probe" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }
  room id=r at (0,0) size ${w}x${h} ${tag}
  door id=d on w at ${w / 2} width 800 swing ${swing}
}
`,
          });
  return out;
}

type Finish = (src: string, opts: { only: "furnish" }) => { changes: ReadonlyArray<{ text: string }>; source: string };
type Lint = (src: string, opts?: { profile?: string }) => ReadonlyArray<{ code?: string }>;

export interface ProbeResult {
  key: string;
  cls: RoomClass;
  furnished: boolean;
  texts: string[];
  /** Gated codes the result raises, `profile:code`. */
  violations: string[];
}

export function sweep(
  finish: Finish = finishHere,
  lint: Lint = lintHere,
  opts: { ensuite?: boolean } = {},
): ProbeResult[] {
  return probeRooms(opts).map((r) => {
    const f = finish(r.source, { only: "furnish" });
    const texts = f.changes.map((c) => c.text);
    const violations: string[] = [];
    if (texts.length > 0)
      for (const profile of [undefined, "accessibility-advisory"])
        for (const d of lint(f.source, profile ? { profile } : {}))
          if ((GATED as readonly string[]).includes(d.code ?? "")) violations.push(`${profile ?? "default"}:${d.code}`);
    return { key: r.key, cls: r.cls, furnished: texts.length > 0, texts, violations };
  });
}

export function countsByClass(results: readonly ProbeResult[]): Record<RoomClass, number> {
  const out = { bath: 0, wc: 0, ensuite: 0 } as Record<RoomClass, number>;
  for (const r of results) if (r.furnished) out[r.cls]++;
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const at = process.argv.indexOf("--against");
  const opts = { ensuite: process.argv.includes("--ensuite") };
  const here = sweep(finishHere, lintHere, opts);
  const report: Record<string, unknown> = {
    rooms: here.length,
    furnished: countsByClass(here),
    violations: here.filter((r) => r.violations.length > 0).map((r) => `${r.key}: ${r.violations.join(", ")}`),
  };
  if (at >= 0 && process.argv[at + 1]) {
    const other = (await import(pathToFileURL(resolve(process.argv[at + 1]!, "src/index.ts")).href)) as {
      finish: Finish;
    };
    const there = sweep(other.finish, lintHere, opts);
    const per = (pick: (a: ProbeResult, b: ProbeResult) => boolean): Record<RoomClass, number> => {
      const out = { bath: 0, wc: 0, ensuite: 0 } as Record<RoomClass, number>;
      here.forEach((a, i) => {
        if (pick(a, there[i]!)) out[a.cls]++;
      });
      return out;
    };
    report.against = {
      furnished: countsByClass(there),
      violations: countsByClass(there.filter((r) => r.violations.length > 0).map((r) => ({ ...r, furnished: true }))),
      lost: per((a, b) => b.furnished && !a.furnished),
      gained: per((a, b) => a.furnished && !b.furnished),
      changed: per((a, b) => a.furnished && b.furnished && a.texts.join("\n") !== b.texts.join("\n")),
    };
  }
  console.log(json ? JSON.stringify(report, null, 2) : report);
}
