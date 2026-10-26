/**
 * `archlang context --level starter` — the one-screen starter for a weak model: the same truth as
 * the full context (`llms-full.txt`), less of it (PS7.2).
 *
 * Nothing here retypes the language. The example is the spec's lead example, read out of the
 * shipped `spec.llm.md` (its first ```arch fence, pinned equal to `LEAD_EXAMPLE` by
 * `test/context-starter.test.ts`); every statement it teaches is a LINE of that example, picked by
 * its first words; the relational directions are `REL_DIRS`; the `--section` names are the
 * caller's `SECTION_NAMES`. The only authored text is the prose, a few extra statements and the
 * table of the errors cold authors hit most. Every authored statement is executable: each error
 * row's `bad` raises its code and its `good` compiles without an error, each sized/unsized piece
 * is run, and the sheet lines compile inside the lead plan (`test/context-starter.test.ts`), so a
 * sentence here cannot drift from the compiler. The test also pins the size (4,000 units, 60 lines,
 * 100 columns) and checks every command, flag and JSON key the text names.
 *
 * Pure: the caller reads the spec; this module renders text and never touches the file system.
 */

import { REL_DIRS } from "../ast.js";
import { CLI_NAME } from "../command-name.js";
import { CONTEXT_BUNDLE_KB } from "../context-size.js";
import { CONTEXT_LEVELS, STARTER_MAX_UNITS } from "../context-levels.js";

export { CONTEXT_LEVELS, STARTER_MAX_UNITS };

/** One screen: at most this many lines, each at most {@link STARTER_MAX_COLUMNS} columns. */
export const STARTER_MAX_LINES = 60;
export const STARTER_MAX_COLUMNS = 100;

/**
 * The plan every error row is probed in: two rooms, their walls, one place for the row's statement.
 * `{ROW}` is replaced by the row's `bad` or `good` statement.
 */
export const STARTER_PROBE = `plan "Probe" {
  units mm
  room id=hall at (0,0) size 1500x4000 uses hall
  room id=bath right-of hall size 2000x2500 uses bath
  walls from rooms exterior 200 partition 100
  {ROW}
}`;

export interface StarterError {
  code: string;
  /** What to do, in one line. */
  fix: string;
  /** A statement that raises `code` inside {@link STARTER_PROBE} (warnings may accompany it). */
  bad: string;
  /** The same statement repaired: no error inside {@link STARTER_PROBE}. */
  good: string;
}

/**
 * The five errors the first-contact audits show cold authors hit most (clause order, `in … anchor`
 * without a size, a bare `at <mm>` on an edge, a relational opening's nib, an offset past the end of
 * an edge), each with the one-line fix that cleared it.
 */
export const STARTER_ERRORS: readonly StarterError[] = [
  {
    code: "E_PARSE",
    fix: "`label` goes after `size`, before `uses`:",
    bad: 'room id=den below bath size 2000x1500 uses office label "Den"',
    good: 'room id=den below bath size 2000x1500 label "Den" uses office',
  },
  {
    code: "E_FURN_SIZE",
    fix: "`in` always needs a `size`:",
    bad: "furniture wc in bath anchor top",
    good: "furniture wc in bath anchor top size 400x700",
  },
  {
    code: "E_OPENING_DATUM",
    fix: "say where `at` counts from (`from start|end`, or `at center`):",
    bad: "door on hall.bottom at 750 width 900",
    good: "door on hall.bottom at 750 from start width 900",
  },
  {
    code: "E_OPENING_NIB",
    fix: "too near a wall; `next.hint` names a legal position:",
    bad: "door between hall and bath at 100 from start width 800",
    good: "door between hall and bath at 1000 from start width 800",
  },
  {
    code: "E_FURN_AGAINST",
    fix: "`offset` stays on the edge:",
    bad: "furniture wc against bath.right offset 9000",
    good: "furniture wc against bath.right offset 1200",
  },
];

/** Pieces `furniture … against` may leave without a `size` (a catalogued footprint); each is run. */
export const STARTER_SIZED = ["wc", "bed", "tv_unit"] as const;
/** Pieces that always need a `size`, `against` or not (`E_FURN_SIZE`); each is run. */
export const STARTER_UNSIZED = ["sofa", "desk", "table", "chair", "armchair"] as const;

/** The one furniture line the lead example does not carry. */
export const STARTER_AGAINST = `furniture ${STARTER_SIZED[2]} against living.top`;

/** The sheet statements the starter names; compiled and linted inside the lead plan by test. */
export const STARTER_SHEET = ["paper A3", "dims auto all", 'title { project "House" }'] as const;

/** The first ```arch fence of `spec.llm.md`: the lead example, or null if the spec has none. */
export function leadExampleFromSpec(spec: string): string | null {
  const m = /```arch\r?\n([\s\S]*?)\r?\n```/.exec(spec);
  return m ? m[1]!.replace(/\r\n/g, "\n") : null;
}

/** The trimmed line of `example` that starts with `prefix`. Throws unless exactly one does. */
function line(example: string, prefix: string): string {
  const hits = example
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`the lead example has ${hits.length} lines starting "${prefix}", expected 1`);
  return hits[0]!;
}

/**
 * The lines the starter quotes from the lead example, by their first words, in the order the
 * statements are taught. Exported so the test pins each one to the example.
 */
export const STARTER_PICKS = {
  plan: 'plan "',
  room: "room id=living",
  relRoom: "room id=hall",
  walls: "walls from rooms",
  doorOn: "door on ",
  doorBetween: "door between ",
  window: "window on living",
  furniture: "furniture bed in ",
} as const;

/** A room line with `label "…"` set where the grammar wants it: after `size`, before `uses`. */
export function withLabel(roomLine: string, label: string): string {
  return roomLine.replace(" uses ", ` label "${label}" uses `);
}

/**
 * The part of a statement that changed, with two words of context before and one after:
 * `(bad, good)` -> the two fragments an error row shows. Word-wise common prefix and suffix.
 */
export function changedFragments(bad: string, good: string): [string, string] {
  const a = bad.split(" ");
  const b = good.split(" ");
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const from = Math.max(0, p - 2);
  const after = Math.min(s, 1);
  return [a.slice(from, a.length - s + after).join(" "), b.slice(from, b.length - s + after).join(" ")];
}

/**
 * Render the starter from the lead example and the `--section` names. Throws (an internal error,
 * never user input) if the example no longer holds a line the starter quotes; the test turns that
 * into a red build.
 */
export function renderStarter(lead: string, sectionNames: readonly string[]): string {
  const pick = (k: keyof typeof STARTER_PICKS): string => line(lead, STARTER_PICKS[k]);
  const errors = STARTER_ERRORS.map((e) => {
    const [bad, good] = changedFragments(e.bad, e.good);
    return `- \`${e.code}\`: ${e.fix}\n  \`${bad}\` -> \`${good}\``;
  }).join("\n");
  const cli = CLI_NAME;
  return `# ArchLang starter
Write the rooms, let \`walls from rooms\` derive every wall, host each door and window by the rooms it
joins. Units are mm; the origin is top-left and +y points down. This plan lints clean:

\`\`\`arch
${lead}
\`\`\`

## The statements a plan needs (edit numbers and ids; keep the clause order)
- plan: \`${pick("plan")}\` opens the block; \`units mm\` comes first.
- room: \`${withLabel(pick("room"), "Living")}\`
  \`label\` goes after \`size\`, before \`uses\`. Beside it (\`${REL_DIRS.join("|")}\`):
  \`${pick("relRoom")}\`
- walls: \`${pick("walls")}\`
  derives every wall; \`open between\` leaves one shared edge open.
- door: \`${pick("doorBetween")}\`
  \`at <mm> from start|end\` counts to the door's CENTRE (or \`at center\`). On an outside edge:
  \`${pick("doorOn")}\`
- window: \`${pick("window")}\`
- furniture: \`${pick("furniture")}\`
  \`in\` always needs a \`size\`. \`against\` may omit it only for a catalogued piece, as in
  \`${STARTER_AGAINST}\` (${STARTER_SIZED.join(", ")}, ...), never for
  ${STARTER_UNSIZED.join(", ")}.
- sheet: ${STARTER_SHEET.map((s) => `\`${s}\``).join(", ")}; \`${cli} finish\` adds the rest.

## The loop
1. \`${cli} compile plan.arch -o plan.svg --json\`
2. \`${cli} validate plan.arch --json\`: fix \`next\` first; \`next.hint\` says how, when it can.
3. \`${cli} lint plan.arch --json\`: read \`summary\` (first key), then each \`diagnostics[].fix\`.
4. Repeat until \`ok\` is true. Exit 2 is your source: fix it, do not retry.
   \`score --taste\` is a reviewer's tool, not part of this loop.

## The errors you will meet first
${errors}

## More
\`${cli} explain <CODE>\` · \`${cli} spec\` (the whole language) · \`${cli} context\` (all, about
${CONTEXT_BUNDLE_KB.total} KB; \`--section ${sectionNames.join("|")}\` for one part).
`;
}
