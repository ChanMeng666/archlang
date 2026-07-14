/**
 * Generate `spec.llm.md` — the learn-the-whole-language-in-one-prompt spec.
 *
 * This is the single artifact an AI agent ingests (via `arch spec`, or by reading
 * the file) to write valid ArchLang first-try. It is deliberately tiny: the full
 * grammar, the handful of gotchas models trip on, the CLI loop, two complete
 * worked examples, and a common-mistakes table — sized to drop into a system
 * prompt, not the 500-line human reference.
 *
 * Like `scripts/gen-grammars.ts`, the dynamic parts are pulled from the single
 * sources of truth so the spec can never drift: keyword lists come from
 * `src/grammar/tokens.ts`, and the worked examples are the real files under
 * `examples/`. {@link renderLlmSpec} is pure (examples passed in) so the drift
 * test (`test/llm-spec-drift.test.ts`) can regenerate it in-memory. Run
 * `npm run gen:spec` after editing; CI asserts no drift.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { buildManifest } from "../src/manifest.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** The example files embedded verbatim, in order (attachment-first flagship leads). */
export const SPEC_EXAMPLES = ["attached.arch", "parametric.arch"] as const;

/**
 * One-line grammar for each built-in element, keyed by element keyword. Keys MUST
 * match `KEYWORDS.element` exactly — {@link renderLlmSpec} throws otherwise, so a
 * new element can't ship without a spec line (the drift guard).
 */
const ELEMENT_GRAMMAR: Record<string, string> = {
  wall: "wall <category> thickness <mm> [material <name>] { (x,y) (x,y) … [close] }   # category e.g. exterior/partition; `close` makes a loop",
  room: 'room [id=<name>] at (x,y) size <W>x<H> [label "…"] [uses living|kitchen|dining|bedroom|bath|wc|hall|circulation|storage|utility|office|entry …]   # OR relational: room [id=…] (right-of|left-of|below|above) <roomId> [align top|middle|bottom|left|right] [gap <mm>] size <W>x<H> [label "…"]',
  door: "door [id=<name>] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>] [hinge left|right|near start|near end] [swing in|out|into <roomId>]   # `at (x,y)` must sit on a wall; `on <wall> at <pos>` pins it BY CONSTRUCTION (<pos> = `40%` | mm from the wall's start | `center`) and can never be reported off-wall — prefer it",
  window:
    "window [id=<name>] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>]   # same two placement forms as door",
  opening:
    "opening [id=<name>] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>]   # a leaf-less cased opening (gap in a wall) that still connects the two spaces in the access graph",
  furniture:
    'furniture <category> [id=<name>] (at (x,y) | against wall <id> [segment <n>] [offset <mm>] [side left|right] | in <roomId> centered | in <roomId> anchor <a> [inset <mm>]) [size <W>x<H>] [label "…"] [rotate 0|90|180|270] [in <roomId>]   # `at` size is plan W×H; `against` size is wall-relative along×depth and derives position+rotation, with `side` inferred from `in <roomId>` when omitted; a known fixture (wc/basin/shower/bathtub/kitchen_sink/counter/stove/fridge…) `against wall` may omit `size` to use its catalogued footprint. `anchor <a>` is top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right; `inset` (default 0) pulls it in from that edge',
  dim: 'dim (x,y)->(x,y) offset <mm> [text "…"]   # a dimension line',
  column: "column [id=<name>] at (x,y) size <W>x<H>",
};

/**
 * Statement keywords from `KEYWORDS.control` that introduce drawable content and so
 * need their own grammar line next to the elements (as opposed to the scripting /
 * structural keywords, which the Structure + Scripting sections cover).
 */
const STATEMENT_GRAMMAR: Record<string, string> = {
  strip:
    "strip <right|left|down|up> at (x,y) gap <mm> [height|width <mm>] { room [id=<id>] size <main>[x<cross>] [label \"…\"] [uses …] … }   # a row/column of rooms laid end to end: each room's offset is the running sum of the previous extents + gap, and the shared cross dimension is the strip's height (right/left) or width (down/up). Pure sugar — expands to absolute rooms. Plan-level block only",
};

/**
 * `KEYWORDS.control` entries the Structure / Scripting sections document in prose, so
 * they need no grammar line. Every control keyword must appear either here or in
 * {@link STATEMENT_GRAMMAR} — {@link renderLlmSpec} throws otherwise. This is the guard
 * that `strip` slipped past when it only checked `KEYWORDS.element`: a new statement
 * keyword now cannot ship unspecced.
 */
const SCRIPTING_KEYWORDS = [
  "plan",
  "component",
  "let",
  "theme",
  "title",
  "style",
  "import",
  "for",
  "if",
  "while",
  "else",
  "set",
];

const bullet = (items: readonly string[]): string => items.map((k) => `\`${k}\``).join(", ");

/**
 * Render `spec.llm.md` from the token source + the given example file contents
 * (a map of filename → source). Pure: no fs, no clock — safe for the drift test.
 */
export function renderLlmSpec(examples: Record<string, string>): string {
  // Drift guard: every element keyword must have a grammar line, and vice-versa.
  const elementKeys = [...KEYWORDS.element].sort();
  const grammarKeys = Object.keys(ELEMENT_GRAMMAR).sort();
  if (JSON.stringify(elementKeys) !== JSON.stringify(grammarKeys)) {
    throw new Error(
      `ELEMENT_GRAMMAR is out of sync with KEYWORDS.element.\n` +
        `  elements: ${elementKeys.join(", ")}\n  grammar:  ${grammarKeys.join(", ")}`,
    );
  }

  // Drift guard #2: every CONTROL keyword must be accounted for — either it introduces
  // drawable content (STATEMENT_GRAMMAR) or the prose sections cover it
  // (SCRIPTING_KEYWORDS). Without this, `strip` shipped for a whole release with no
  // syntax line anywhere in the spec (it is control, not element, so guard #1 missed it).
  const controlKeys = [...KEYWORDS.control].sort();
  const coveredControl = [...Object.keys(STATEMENT_GRAMMAR), ...SCRIPTING_KEYWORDS].sort();
  if (JSON.stringify(controlKeys) !== JSON.stringify(coveredControl)) {
    throw new Error(
      `KEYWORDS.control is not fully covered by the spec.\n` +
        `  control: ${controlKeys.join(", ")}\n  covered: ${coveredControl.join(", ")}\n` +
        `  Add each new keyword to STATEMENT_GRAMMAR (it draws something) or SCRIPTING_KEYWORDS (prose covers it).`,
    );
  }

  // A fenced block (not a bullet list) so the `<placeholder>` angle brackets are
  // safe everywhere they render (GitHub, npm, and the Vue-compiled docs site).
  const statementLines = KEYWORDS.control.filter((k) => k in STATEMENT_GRAMMAR).map((k) => STATEMENT_GRAMMAR[k]);
  const elementLines =
    "```text\n" + [...KEYWORDS.element.map((k) => ELEMENT_GRAMMAR[k]), ...statementLines].join("\n") + "\n```";

  // The CLI verb list is rendered from the manifest — the same source `arch manifest
  // --json` serves — so a new command cannot be missing from the spec.
  // Only `commands` + `exitCodes` are read, and the spec never emits a version — pass a
  // constant so this stays pure (no package.json read) for the in-memory drift test.
  const manifest = buildManifest("0.0.0");
  const width = Math.max(...manifest.commands.map((c) => c.name.length));
  // First sentence only: the spec has a hard size budget (it goes in a system prompt),
  // so a long manifest summary must not silently eat into it.
  const brief = (s: string): string => s.split(". ")[0]!.replace(/\.$/, "");
  const cliLines =
    "```text\n" +
    manifest.commands.map((c) => `arch ${c.name.padEnd(width)}  # ${brief(c.summary)}`).join("\n") +
    "\n```";
  const exitLines = Object.entries(manifest.exitCodes)
    .map(([code, meaning]) => `\`${code}\` ${meaning}`)
    .join(" · ");

  const exampleBlocks = SPEC_EXAMPLES.map((name) => {
    const src = examples[name];
    if (src === undefined) throw new Error(`missing example "${name}" for spec generation`);
    return `### \`examples/${name}\`\n\n\`\`\`arch\n${src.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n\`\`\``;
  }).join("\n\n");

  return `<!-- GENERATED by scripts/gen-llm-spec.ts — do not edit by hand. Run \`npm run gen:spec\`. -->

# ArchLang in one prompt

ArchLang is a tiny declarative language that compiles a \`.arch\` source file into a professional
floor-plan drawing (SVG/PNG/PDF/DXF). It is built for AI agents: deterministic (same source →
identical output), pure (no runtime/IO), and self-correcting (every error carries a machine code and
a \`fix\`). This page is everything you need to author it. Print it any time with \`arch spec\`.

## The 7 rules that matter

1. **Units are millimetres.** A 4-metre wall is \`4000\`, not \`4\`. Optional metric suffixes fold to mm: \`4m\`=4000, \`3.5m\`=3500, \`40cm\`=400, \`20mm\`=20.
2. **Origin is top-left; +x goes right, +y goes DOWN** (screen/SVG convention — *not* math y-up).
3. **Coordinates are \`(x, y)\` tuples; sizes are \`WxH\`** (e.g. \`4000x3000\`) or \`<expr> x <expr>\` with spaces.
4. **Doors and windows must lie ON a wall segment** (on its centerline), or you get a
   \`W_DOOR_OFF_WALL\` / \`W_WINDOW_OFF_WALL\` warning.
5. **String interpolation is \`"{expr}"\`** inside double quotes (e.g. \`label "Unit {i}"\`).
6. **Ids must be unique.** Omit \`id=\` to auto-generate one; give an \`id\` only when you reference it.
7. **Everything is expand-time and pure** — \`let\`/\`for\`/\`if\`/functions all evaluate during compile.

## Structure

\`\`\`arch
plan "Title" {
  units mm            # required-ish settings come first
  grid 50             # snap grid in mm
  scale 1:50          # drawing scale (annotation only)
  north up            # up | down | left | right
  # … elements and scripting …
  title { project "…" drawn_by "…" date "…" }
}
\`\`\`

## Elements

${elementLines}

## Scripting (all expand-time, deterministic)

- \`let NAME = expr\` — bind a constant. \`NAME = expr\` — reassign an existing binding.
- \`let f(a, b) = expr\` — a pure value-function. Built-ins: \`min max abs sqrt floor ceil round len str\`.
- \`for i in lo..hi { … }\` — loop over a half-open integer range (\`0..3\` → 0,1,2).
- \`if cond { … } else { … }\` · \`while cond { … }\`.
- \`set <element>(attr: value)\` — scoped default for following elements (e.g. \`set door(swing: out)\`).
- Arrays: \`[a, b, c]\`, indexed \`arr[i]\`. Operators: \`+ - * / %\`, \`== != < > <= >=\`, \`&& ||\`. Comments: \`# …\`.
- \`import "lib/x.arch": name\` and \`component name(args) { … }\` for reuse.

## Keyword reference

(Elements are fully specced above; these are the rest.)

- **Settings / control:** ${bullet(KEYWORDS.control)}
- **Attributes:** ${bullet(KEYWORDS.attribute)}
- **Enums / values:** ${bullet(KEYWORDS.enum)}

## CLI loop (how an agent drives it)

Every command takes \`--json\` (structured result on **stdout**, human messages on **stderr**) and
reads source from a file or stdin (\`-\`). Exit codes: ${exitLines}.

${cliLines}

The flags that matter (the verb list above covers the rest):

\`\`\`bash
arch compile plan.arch -o out.svg --json    # JSON: { ok, diagnostics, summary }.  -f txt = zero-dep ASCII plan
echo '<source>' | arch compile - --json     # stdin, no temp file
arch validate plan.arch --strict --json     # ship-gate: --strict fails on warnings too
arch fix plan.arch --dry-run --json         # preview/apply the machine-applicable diagnostics[].fixes
arch validate plan.arch --intent brief.json --feedback --json   # gate on a brief's intent contract (miss → exit 2)
arch score plan.arch --brief brief.json --json                  # satisfied/total — measures, never gates
\`\`\`

**Self-correction loop:** compile/validate → if \`ok\` is false, read each \`diagnostics[].fix\` (and
\`line\`/\`col\`/\`span\`), edit the source, recompile. Exit code \`2\` means a deterministic
user-source error (fix it; don't blindly retry). Then \`describe --json\` to confirm the plan matches
intent (right room count, areas, adjacency) without rendering an image. **Before shipping, gate with
\`arch validate --strict --json\`** — it fails on advisory warnings too, so a plan that lint flags
(furniture through a wall, a fixture blocking a doorway, a room you can't step into, an unreachable
room, a walk that squeezes too narrow — \`W_PATH_TOO_NARROW\` — or wanders the long way round —
\`W_CIRCUITOUS_PATH\`) cannot pass silently.

**Place furniture so it's physically sound:** keep every piece inside its room and off the walls
(don't cross a wall centerline); back plumbing/kitchen fixtures onto a wall with \`against wall <id>\`
(+ \`in <roomId>\`) rather than guessing an \`at\`; give every room a \`door\`/\`opening\`; and leave
the doorway approach and the door's swing clear.

**Fix topology from facts, not guesses.** \`arch repair\` corrects furniture but never adds a door or
window (that is a design choice). When lint reports \`W_ROOM_UNREACHABLE\`, \`W_NO_ENTRANCE\`,
\`W_BEDROOM_NO_WINDOW\`, or \`W_BATH_VIA_BEDROOM\`, run \`arch suggest --json\` — it returns
ready-to-paste \`door\`/\`window\` statements (furniture-aware: a door candidate never opens onto a
wardrobe) that reference a wall only by a stable ref (an authored id or a unique category) or absolute
coordinates — never a re-bindable positional auto-id — with a rationale; pick one and insert it. If nothing fits, read
\`describe --json\` (\`access.rooms[].reachable\`, room \`bbox\`/\`adjacent\`, building extent =
min/max of room boxes) and attach the opening yourself — an exterior entrance into a cut-off living
space beats routing a bath through a bedroom — then re-\`repair\` and \`validate --strict\`. See
SKILL.md for the full recipe.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Using metres (\`size 4x3\`) | Use millimetres (\`size 4000x3000\`). |
| Expecting +y to go up | +y goes **down**; a room below another has a larger y. |
| Door/window floating off its wall | Attach it: \`door on <wall> at <pos>\` — hosted by construction, it can never be off-wall. |
| Hand-summing room offsets | Lay the row with \`strip\` — each room's \`at\` is computed for you. |
| Furniture floated at a guessed (or copy-pasted) \`at\` | Place it \`in <room> anchor <9-point> [inset]\` or \`against wall <id>\` — closed-form, never floats or penetrates. |
| \`size 4000\` (no height) | Sizes are \`WxH\`: \`size 4000x3000\` (or \`W x H\` with spaces). |
| Reusing an \`id\` | Ids are unique; omit \`id=\` to auto-generate. |
| String math without interpolation | Use \`"{expr}"\`, e.g. \`label "{aream2(W,H)} m²"\`. |

## Worked examples

${exampleBlocks}
`;
}

/** Read the embedded example files from disk (CLI/main path only). */
function readExamples(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SPEC_EXAMPLES) {
    out[name] = readFileSync(resolve(ROOT, "examples", name), "utf8");
  }
  return out;
}

function main(): void {
  writeFileSync(resolve(ROOT, "spec.llm.md"), renderLlmSpec(readExamples()));
  process.stdout.write("✓ generated spec.llm.md from src/grammar/tokens.ts + examples/\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
