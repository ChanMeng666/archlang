/**
 * The Examples-page figure gate — every headline count on `/examples` is re-derived from
 * the plan it is about.
 *
 * `docs-site/examples.md` opens with a promise: *"Every figure quoted below comes from
 * `arch describe --json` on the file itself, so the prose and the drawing cannot
 * disagree."* Nothing enforced it, and by 2026-09 the promise was false in six places —
 * the furniture flagship still claimed "twenty-six of the thirty-two catalogued furniture
 * kinds" against a catalogue of 83, the garden house counted twelve outdoor surfaces
 * where the file draws fifteen, and the two-bedroom flat under-reported its own doors and
 * windows by two each. This is the repo's documented drift class (a hand-typed
 * self-description going stale while every gate stays green), and the fix for that class
 * is to EXECUTE the documentation rather than proofread it.
 *
 * WHAT IS CHECKED. Each `### <heading>` section of the page ends in an
 * `<ArchLive :src="EXAMPLES['<name>']" …/>` widget, which names the example the section is
 * about — a mechanical link, not a guess. Inside a section, every **bold** run that STARTS
 * with a headline figure shape is parsed and re-derived from `describe(compile(src))`:
 *
 *     **11 rooms, 196.54 m²**                  rooms + floor area
 *     **7 rooms, 90.72 m², 6 doors, 6 windows** rooms + area + doors + windows
 *     **3 rooms and 48.75 m²**                  ("and" is the page's other joiner)
 *     **4 doors and 4 windows**                 openings quoted on their own
 *
 * Anchoring at the START of a bold run is what keeps the false-positive rate at zero: a
 * span like `**220.7 m² of ground**`, `**page 1 — the ground floor**` or `**132 m²**` does
 * not begin with a count and is simply not a claim this gate reads. Text after the figures
 * inside a matching run (`… of floor`, `… on the ground floor`) is ignored for the same
 * reason — the gate checks the numbers it can name, and stays silent about prose.
 *
 * WHAT IS DELIBERATELY NOT CHECKED. Scales, sheet sizes, footprints, zone subtotals,
 * per-level figures and fixture-family counts are all quoted on the page too, and all of
 * them appear in free-form prose where a number can be a claim, a counterfactual ("its box
 * would claim 168") or a worked example ("halve that to 1:100"). A regex cannot tell those
 * apart, and a gate that fires on prose is a gate that gets widened until it stops firing
 * at all. They stay a review item; see `docs/testing.md`.
 *
 * A multi-storey plan's headline figures are its LEVEL 1 figures, which is what
 * `describe()` returns and what the live widget draws — the page says so in its preamble.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";

const PAGE = "docs-site/examples.md";

/** One `### …` section of the page, with the example its `<ArchLive>` widget names. */
interface Section {
  heading: string;
  example: string;
  body: string;
}

/** The figures one bold run claims. `undefined` means the run did not quote that one. */
interface Claim {
  text: string;
  rooms?: number;
  areaM2?: number;
  doors?: number;
  windows?: number;
}

/**
 * Split the page into `### <heading>` sections and attach each one's example.
 *
 * A section with no `<ArchLive>` widget names no plan, so there is nothing to derive from
 * and it is dropped — but the count of sections that DO carry one is asserted below, so a
 * widget quietly disappearing cannot silently shrink this gate's coverage.
 */
function sections(): Section[] {
  const md = readFileSync(PAGE, "utf8");
  const out: Section[] = [];
  const parts = md.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = part.slice(0, nl).trim();
    const body = part.slice(nl + 1);
    const widget = /<ArchLive\s+:src="EXAMPLES\['([^']+)'\]"/.exec(body);
    if (widget) out.push({ heading, example: widget[1]!, body });
  }
  return out;
}

/**
 * Every bold run in a section, with its newlines folded to single spaces — the page wraps
 * at ~90 columns, so `**11 rooms, 163 m²,\n10 doors, 15 windows**` is one claim split
 * across two source lines.
 */
function boldRuns(body: string): string[] {
  return [...body.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
}

/** `12 rooms` / `12 rooms,` / `12 rooms and` — the count joined to whatever follows. */
const ROOMS = String.raw`^(\d+) rooms?\b`;
const JOIN = String.raw`(?:,| and)\s*`;
const AREA = String.raw`([\d.]+) m²`;
const DOORS = String.raw`(\d+) doors?`;
const WINDOWS = String.raw`(\d+) windows?`;

const ROOMS_FIRST = new RegExp(`${ROOMS}${JOIN}${AREA}(?:${JOIN}${DOORS})?(?:${JOIN}${WINDOWS})?`, "u");
const OPENINGS_ONLY = new RegExp(`^${DOORS}${JOIN}${WINDOWS}`, "u");

/** Parse one bold run into a claim, or `null` when it does not open with a figure. */
function parseClaim(text: string): Claim | null {
  const rf = ROOMS_FIRST.exec(text);
  if (rf) {
    return {
      text,
      rooms: Number(rf[1]),
      areaM2: Number(rf[2]),
      ...(rf[3] === undefined ? {} : { doors: Number(rf[3]) }),
      ...(rf[4] === undefined ? {} : { windows: Number(rf[4]) }),
    };
  }
  const oo = OPENINGS_ONLY.exec(text);
  if (oo) return { text, doors: Number(oo[1]), windows: Number(oo[2]) };
  return null;
}

/** `describe()` on an example, by the name the page's widget uses. */
function facts(example: string) {
  const src = readFileSync(`examples/${example}.arch`, "utf8");
  const res = compile(src);
  expect(
    res.diagnostics.filter((d) => d.severity === "error"),
    `examples/${example}.arch does not compile — the Examples page quotes figures from it.`,
  ).toEqual([]);
  return describePlan(src);
}

suite("docs-site/examples.md quotes figures the compiler agrees with", () => {
  const secs = sections();

  it("every section is linked to an example by its own <ArchLive> widget", () => {
    // The page is a tour of every publishable example; if this number moves, a section
    // was added or removed and the figure sweep below has to have followed it.
    expect(secs.length).toBe(27);
    expect(new Set(secs.map((s) => s.example)).size).toBe(secs.length);
  });

  it("every headline figure re-derives from describe() on the file the section is about", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const sec of secs) {
      const claims = boldRuns(sec.body)
        .map(parseClaim)
        .filter((c): c is Claim => c !== null);
      if (claims.length === 0) continue;
      const d = facts(sec.example);
      const actual = {
        rooms: d.totals.rooms,
        areaM2: d.totals.floor_area_m2,
        doors: d.totals.doors,
        windows: d.totals.windows,
      };
      for (const claim of claims) {
        for (const key of ["rooms", "areaM2", "doors", "windows"] as const) {
          const said = claim[key];
          if (said === undefined) continue;
          checked++;
          if (said !== actual[key]) {
            wrong.push(
              `${PAGE} § ${sec.heading} (examples/${sec.example}.arch): claims ${key}=${said}, ` +
                `describe() reports ${actual[key]} — in "**${claim.text}**"`,
            );
          }
        }
      }
    }
    // A gate that can pass by matching nothing is worth nothing: the page quotes rooms and
    // an area for all 27 sections, plus doors/windows for most of them.
    expect(checked, "the figure parser matched nothing — its regexes have drifted from the page").toBeGreaterThan(80);
    expect(wrong.join("\n")).toBe("");
  });
});
