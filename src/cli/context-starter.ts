/**
 * `archlang context --level starter` — the one-screen starter for a weak model: the same truth as
 * the full context (`llms-full.txt`), less of it (PS7.2).
 *
 * Nothing here retypes the language. The example is the spec's lead example, read out of the
 * shipped `spec.llm.md` (its first ```arch fence, pinned equal to `LEAD_EXAMPLE` by
 * `test/context-starter.test.ts`); every statement it teaches is a LINE of that example, picked by
 * its first words; the relational directions are `REL_DIRS`. The only authored text is the prose,
 * one furniture line and the table of the errors cold authors hit most, and each row of that table
 * is executable: `bad` raises the row's code and `good` compiles without an error
 * (`test/context-starter.test.ts` runs every row, so the table cannot drift from the compiler).
 *
 * Pure: the caller reads the spec; this module renders text and never touches the file system.
 */

import { REL_DIRS } from "../ast.js";
import { CLI_NAME } from "../command-name.js";
import { CONTEXT_BUNDLE_KB } from "../context-size.js";

/** The most UTF-16 code units the starter may occupy: one screen. Pinned by test. */
export const STARTER_MAX_UNITS = 4000;

/** The `--level` words `context` accepts; `full` is today's output, byte for byte. */
export const CONTEXT_LEVELS = ["starter", "full"] as const;

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
  /** A statement that raises `code` inside {@link STARTER_PROBE}. */
  bad: string;
  /** The same statement repaired: no error inside {@link STARTER_PROBE}. */
  good: string;
}

/**
 * The five errors the first-contact audits show cold authors hit most (clause order, a relational
 * opening's nib, `in <room> anchor` without a size, a bare `at <mm>` on an edge, an offset past the
 * end of an edge), each with the one-line fix that cleared it.
 */
export const STARTER_ERRORS: readonly StarterError[] = [
  {
    code: "E_PARSE",
    fix: "clause order is part of the grammar: `label` goes BEFORE `uses`.",
    bad: 'room id=den below bath size 2000x1500 uses office label "Den"',
    good: 'room id=den below bath size 2000x1500 label "Den" uses office',
  },
  {
    code: "E_FURN_SIZE",
    fix: "`in <room> anchor|centered` needs `size WxH`; only `against` may omit it.",
    bad: "furniture wc in bath anchor top",
    good: "furniture wc in bath anchor top size 400x700",
  },
  {
    code: "E_OPENING_DATUM",
    fix: "a position on an edge says where it counts from: `at <mm> from start|end` or `at center`.",
    bad: "door on hall.bottom at 750 width 900",
    good: "door on hall.bottom at 750 from start width 900",
  },
  {
    code: "E_OPENING_NIB",
    fix: "the jamb needs wall to the next wall: use the position the `hints` entry names, or a narrower opening.",
    bad: "door between hall and bath at 100 from start width 800 swing into bath",
    good: "door between hall and bath at 1000 from start width 800 swing into bath",
  },
  {
    code: "E_FURN_AGAINST",
    fix: "`offset` is mm along the edge to the piece's centre, and stays on the edge.",
    bad: "furniture wc against bath.right offset 9000",
    good: "furniture wc against bath.right offset 1200",
  },
];

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

/** The one furniture line the lead example does not carry (a catalogued piece may omit `size`). */
export const STARTER_AGAINST = "furniture tv_unit against living.top";

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

/** A room line with `label "…"` set where the grammar wants it: before `uses`. */
export function withLabel(roomLine: string, label: string): string {
  return roomLine.replace(" uses ", ` label "${label}" uses `);
}

/**
 * Render the starter from the lead example. Throws (an internal error, never user input) if the
 * example no longer holds a line the starter quotes; the test turns that into a red build.
 */
export function renderStarter(lead: string): string {
  const pick = (k: keyof typeof STARTER_PICKS): string => line(lead, STARTER_PICKS[k]);
  const errors = STARTER_ERRORS.map((e) => `- \`${e.code}\`: ${e.fix}\n  \`${e.bad}\` -> \`${e.good}\``).join("\n");
  const cli = CLI_NAME;
  return `# ArchLang starter

Write the rooms, let \`walls from rooms\` derive every wall, and host each door and window by the rooms
it joins. Units are millimetres; the origin is top-left and +y points down. This plan compiles and
lints clean:

\`\`\`arch
${lead}
\`\`\`

## The six statements a plan needs

Edit the numbers and ids; keep the clause order.

- plan: \`${pick("plan")}\` opens the block and \`units mm\` comes first.
- room: \`${withLabel(pick("room"), "Living")}\` places one. \`label\` goes BEFORE \`uses\`.
  \`${pick("relRoom")}\` places the next beside it (\`${REL_DIRS.join("|")}\`).
- walls: \`${pick("walls")}\` derives every wall from the rooms; \`open between\` leaves one edge open.
- door: \`${pick("doorBetween")}\`. \`at <mm> from start|end\` or \`at center\`; \`swing into <room>\`.
  On an outside edge: \`${pick("doorOn")}\`.
- window: \`${pick("window")}\`.
- furniture: \`${pick("furniture")}\`. \`in\` needs \`size\`.
  Against a wall: \`${STARTER_AGAINST}\` (a catalogued piece may omit \`size\`).

For a drawing sheet add \`paper\`, \`dims auto all\` and \`title { … }\`; \`${cli} finish plan.arch\` adds what is missing.

## The loop

1. \`${cli} compile plan.arch -o plan.svg --json\`
2. \`${cli} validate plan.arch --json\`: fix its \`next\` first.
3. \`${cli} lint plan.arch --json\`: read \`summary\` (the first key) before anything else, then each
   \`diagnostics[].fix\`.
4. Edit and repeat until \`ok\` is true and nothing is left to fix. Exit 2 is your source: fix it,
   do not retry. \`score --taste\` is the reviewer's tool, not part of this loop.

## The errors you will meet first

${errors}

## More

\`${cli} explain <CODE>\` · \`${cli} spec\` (the whole language, one page) · \`${cli} context\` (everything,
about ${CONTEXT_BUNDLE_KB.total} KB; \`--section spec|workflow|cli|errors\` for one part).
`;
}
