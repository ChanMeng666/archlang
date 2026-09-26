/**
 * The Examples-page gate — every claim on `/examples` that a machine can answer is
 * re-derived from the plan the section is about.
 *
 * `docs-site/examples.md` opens with a promise: *"Every figure quoted below comes from
 * `arch describe --json` on the file itself, so the prose and the drawing cannot
 * disagree."* Nothing enforced it, and the promise went false in eleven places.
 * This is the repo's documented drift class (a hand-typed self-description going stale
 * while every gate stays green), and the fix for that class is to EXECUTE the
 * documentation rather than proofread it.
 *
 * ## The audit's own lesson: the page's failure mode is PROVENANCE as much as arithmetic
 *
 * Of the eleven drifts found, only six were wrong numbers. The rest were **right values
 * presented as the wrong kind of fact** — `two-storey` and `gallery-l` were quoted at a
 * `scale 1:N` in inline code, as if the source wrote it, when both files declare only
 * `paper` and the denominator is AUTO-FITTED (`describe().sheet.scale_auto: true`, the flag
 * that exists precisely so a consumer can tell the two apart); the transit hall credited a
 * `for` loop with nine openings where it punches eight — and two were stale claims about
 * TOOL STATE rather than about geometry at all (`arch validate --strict` called clean on a
 * plan whose own header names a deliberate warning; two lint warnings claimed where one has
 * since been fixed away). A gate that only re-derives counts would have caught two of the
 * eleven. So this file checks three kinds of claim, not one.
 *
 * ## 1. Headline figures
 *
 * Each `### <heading>` section ends in an `<ArchLive :src="EXAMPLES['<name>']" …/>` widget,
 * which names the example the section is about — a mechanical link, not a guess. Inside a
 * section, every **bold** run that STARTS with a figure shape is re-derived from
 * `describe()`:
 *
 *     **11 rooms, 196.54 m²**                  rooms + floor area
 *     **7 rooms, 90.72 m², 6 doors, 6 windows** rooms + area + doors + windows
 *     **3 rooms and 48.75 m²**                  ("and" is the page's other joiner)
 *     **4 doors and 4 windows**                 openings quoted on their own
 *
 * Anchoring at the START of a bold run is what keeps the false-positive rate at zero: a
 * span like `**220.7 m² of ground**`, `**page 1 — the ground floor**` or `**132 m²**` does
 * not begin with a count and is simply not a claim this gate reads.
 *
 * ## 2. Provenance — a value quoted as SOURCE SYNTAX must be source syntax
 *
 * An inline-code `` `scale 1:N` `` is a quotation of what the file says, so the file must
 * literally say it: the gate greps the `.arch` for a `scale 1:N` statement. That is a
 * text-level check with no judgement in it, and it is the one that catches an auto-fitted
 * denominator being passed off as an authored one. Likewise an inline `` `paper <SIZE>
 * [<orientation>]` `` is checked against `describe().sheet`.
 *
 * NOTE THE ASYMMETRY, IT IS DELIBERATE: this direction only. The page may say less than the
 * file (a section need not quote a scale at all); it may not say something the file does
 * not. Bare prose scales ("A2 at 1:100", "halve that to 1:100") are NOT read — only inline
 * code, which is the page's own convention for quoting syntax.
 *
 * ## 3. Tool state — a claim about what `lint`/`validate` say
 *
 * "`arch lint` raises three warnings", "lint-clean", "`arch validate` is clean",
 * "`arch validate --strict` reports exactly one warning" all have a machine answer.
 * `validate` is `resolvePlan()`'s diagnostics plus `lint()`'s — `cmdValidate` in
 * `src/cli/commands-analyze.ts` says so in a comment, and that `resolvePlan()` yields
 * exactly `compile()`'s — so both are reachable in-process without spawning the CLI 27
 * times.
 *
 * ## What is still NOT gated
 *
 * Footprints ("a 10 × 8 m footprint"), zone subtotals, per-level figures, fixture-family
 * counts and every dimension quoted in running prose. They sit where a number can be a
 * counterfactual ("its box would claim 168") or a worked example ("halve that to 1:100"),
 * and a gate that fires on prose is one that gets widened until it stops firing at all.
 * They stay a review item.
 *
 * A multi-storey plan's headline figures are its LEVEL 1 figures, which is what
 * `describe()` returns and what the live widget draws — the page says so in its preamble.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";

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

const sourceOf = (example: string) => readFileSync(`examples/${example}.arch`, "utf8");

/** `describe()` on an example, by the name the page's widget uses. */
function facts(example: string) {
  const src = sourceOf(example);
  const res = compile(src);
  expect(
    res.diagnostics.filter((d) => d.severity === "error"),
    `examples/${example}.arch does not compile — the Examples page quotes figures from it.`,
  ).toEqual([]);
  return describePlan(src);
}

/** Inline-code spans (`` `…` ``) in a section, newlines folded like the bold runs. */
function codeSpans(body: string): string[] {
  return [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
}

const WORD_NUMBERS: Record<string, number> = {
  no: 0,
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
/**
 * "three" / "3" → 3. The alternation below is built FROM {@link WORD_NUMBERS}, so a word
 * this regex can capture is always a word the map holds — but the `??` keeps the function
 * total for a caller that does not go through `NUM`, rather than returning `undefined` and
 * comparing it to a count (which would pass silently).
 */
const countOf = (w: string): number => (/^\d+$/.test(w) ? Number(w) : (WORD_NUMBERS[w.toLowerCase()] ?? Number.NaN));
const NUM = `(${Object.keys(WORD_NUMBERS).join("|")}|\\d+)`;

/**
 * What `arch validate` reports: `resolvePlan()`'s diagnostics plus `lint()`'s. Restated
 * from `cmdValidate` in `src/cli/commands-analyze.ts`, whose own comment records that
 * `resolvePlan` yields exactly `compile()`'s diagnostics — which is what makes the set
 * reachable in-process instead of by spawning the CLI once per example.
 */
const validateDiags = (src: string) => [...compile(src).diagnostics, ...lint(src)];

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

  it("a `scale`/`paper` quoted as source syntax IS that file's source syntax", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const sec of secs) {
      const src = sourceOf(sec.example);
      for (const span of codeSpans(sec.body)) {
        const scale = /^scale 1:(\d+)$/.exec(span);
        if (scale) {
          checked++;
          // The file must literally declare it. `two-storey` and `gallery-l` were both
          // quoted at a scale they do not write — they declare only `paper`, and the
          // denominator is auto-fitted (`describe().sheet.scale_auto: true`).
          const authored = new RegExp(String.raw`^\s*scale\s+1:${scale[1]}\s*(?:#.*)?$`, "m").test(src);
          if (!authored) {
            const sheet = facts(sec.example).sheet;
            wrong.push(
              `${PAGE} § ${sec.heading} quotes \`${span}\` as source syntax, but ` +
                `examples/${sec.example}.arch declares no such statement` +
                (sheet
                  ? ` — its sheet reports 1:${sheet.scale_denominator}, scale_auto: ${sheet.scale_auto}` +
                    (sheet.scale_auto ? " (AUTO-FITTED, not authored — say so instead)" : "")
                  : ""),
            );
          }
          continue;
        }
        const paper = /^paper ([A-Z]\d)(?: (landscape|portrait))?$/.exec(span);
        if (paper) {
          checked++;
          const sheet = facts(sec.example).sheet;
          if (!sheet) {
            wrong.push(
              `${PAGE} § ${sec.heading} quotes \`${span}\`, but examples/${sec.example}.arch declares no sheet at all`,
            );
          } else if (sheet.paper !== paper[1] || (paper[2] !== undefined && sheet.orientation !== paper[2])) {
            wrong.push(
              `${PAGE} § ${sec.heading} quotes \`${span}\`, but describe().sheet is ` +
                `${sheet.paper} ${sheet.orientation}`,
            );
          }
        }
      }
    }
    // 12 inline `scale 1:N` spans and 6 inline `paper …` spans at the time of writing.
    expect(checked, "the provenance parser matched nothing — the page's quoting style has changed").toBeGreaterThan(12);
    expect(wrong.join("\n")).toBe("");
  });

  it("a claim about what `lint`/`validate` say matches what they say", () => {
    const wrong: string[] = [];
    let checked = 0;
    const say = (sec: Section, claim: string, said: number, actual: number) => {
      checked++;
      if (said !== actual) {
        wrong.push(
          `${PAGE} § ${sec.heading} (examples/${sec.example}.arch) claims ${claim} = ${said}, ` +
            `but the tool reports ${actual}`,
        );
      }
    };
    for (const sec of secs) {
      const body = sec.body.replace(/\s+/g, " ");
      const src = sourceOf(sec.example);
      const lintDiags = lint(src);

      for (const m of body.matchAll(
        new RegExp(String.raw`\`arch lint\`(?: still)? raises (?:exactly )?${NUM} warnings?`, "g"),
      )) {
        say(sec, `\`arch lint\` raises ${m[1]} warnings`, countOf(m[1]!), lintDiags.length);
      }
      // "It is **lint-clean** under the default profile" — the studio's standing claim.
      for (const _ of body.matchAll(/\blint-clean\b/g)) say(sec, "lint-clean", 0, lintDiags.length);

      const vd = validateDiags(src);
      for (const _ of body.matchAll(/`arch validate` is clean/g)) {
        say(sec, "`arch validate` is clean (errors)", 0, vd.filter((d) => d.severity === "error").length);
      }
      for (const m of body.matchAll(
        new RegExp(String.raw`\`arch validate --strict\` reports (?:exactly )?${NUM} warnings?`, "g"),
      )) {
        say(
          sec,
          `\`arch validate --strict\` reports ${m[1]} warnings`,
          countOf(m[1]!),
          vd.filter((d) => d.severity === "warning").length,
        );
      }
    }
    // Five such claims on the page today; a drop to zero means the phrasings moved.
    expect(checked, "the tool-state parser matched nothing — the page's phrasings have changed").toBeGreaterThan(4);
    expect(wrong.join("\n")).toBe("");
  });
});
