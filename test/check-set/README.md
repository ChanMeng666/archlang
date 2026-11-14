# ArchLang public check set

A fixed list of cases, each judged pass or fail, that anyone can run against `arch lint` or the
hosted `POST /check`, with no setup beyond Node. A case is two plans: a plan that must report one
lint code, and its twin, which differs only in the fix and must not report that code. Both must
compile with no error. The cases are listed in [`check-set.json`](check-set.json), and
[`run.mjs`](run.mjs) runs and judges them.

These are fixtures the rules were written against. A case that passes says a rule reports the
defect it was written for and stays quiet on the fixed plan. It does not say how many of the
defects in a plan someone else wrote lint will find. On 1.60.0, six briefs produced plans with
57 defects; the final lint reported 8 of them (and 1 in part).

## The three columns

Every number a rule reads has a grade in the provenance table: `V` (the official text was read),
`S-full` (the full text was read in a third-party copy), `S-secondary` (a paraphrase, summary or
handout), `M` (a magazine) or `convention` (ArchLang's own threshold, citing no document).
`arch lint --rules --json` prints each number with its source and grade. A case is decided by the
number its finding cites (the `rule` field of `lint --json`), or by none.

| Column | Decided by | Run |
|---|---|---|
| default | a `V` or `S-full` number, or no number | always |
| cross-jurisdiction | a `V` or `S-full` number a built-in profile sets | always |
| opt-in | a `convention`, `S-secondary` or `M` number | only with `--opt-in` |

- **default** and **opt-in**: the default ruleset, no profile. One case per lint code that the
  [defect corpus](../defect-corpus/README.md) reports, taken from the corpus, not copied: the
  first case of that code, in path order, that still reports it when every number of the default
  ruleset graded `S-secondary` or `M` is turned off. A code whose every case rests on such a
  number is left out, for now `W_BED_UNDERSIZED`, `W_EXIT_APPROACH_BLOCKED` and `W_LEAF_TOO_WIDE`.
  A case whose finding cites a number graded `convention`, `S-secondary` or `M` is in the opt-in
  column and names that number's key; every other case is in the default column.
- **cross-jurisdiction**: plans in [`cross-jurisdiction/`](cross-jurisdiction/), each run under one
  built-in profile (`uk-residential-advisory`, `cn-residential-advisory` or
  `accessibility-advisory`), each naming the ruleset key that decides it. Every such key is graded
  `V` (the official text was read) or `S-full` (the full text was read in a third-party copy). On
  these plans the default ruleset does not report the case's code, and these numbers stay out of it: they apply only
  under the profile. `us-residential-advisory` has no case, because each of its numbers was read
  second-hand (`S-secondary`). A finding must cite its case's key in `rule`, except in a row
  marked `"joint": true`: there the key holds the code together with another number (a stair's
  pitch limit with its riser limit), so lint cites neither, and the test proves both that the key
  decides the case and that the finding cites nothing.

A case's column is only as good as the citations: a finding that cites no number is in the default
column, even if its rule reads a `convention` number it does not cite.

The profiles are advisory. A plan that passes them has not been shown to comply with any code or
standard.

`test/check-set.test.ts` judges every case, and holds each column to its sources: the default and
opt-in columns to the defect corpus and the grade of the number each finding cites, the
cross-jurisdiction column to the provenance table's (`src/lint/provenance.ts`) grades.

## Run it

From a checkout of this repository, with Node 18 or later:

```sh
npm ci && npm run build
node test/check-set/run.mjs --arch "node dist/cli.js"    # the CLI built from this checkout
node test/check-set/run.mjs --arch "node dist/cli.js" --opt-in   # every column
node test/check-set/run.mjs                              # npx -y @chanmeng666/archlang lint ...
node test/check-set/run.mjs --url https://mcp.archlang.uk/check
```

Each case prints `ok` or `FAIL` with the reason, and the exit code is 1 when any case fails. The
runner reads each plan's `archlang lint <file> --json [--profile <name>]` document. The cases
follow the rules of the checkout they come from, so the CLI built from that same checkout is the
one they judge. A released CLI (the default, or `--url`) can fail a case whose rule changed after
that release, and a CLI whose findings carry no `rule` fails every case that names its deciding key.

`POST /check` answers the same document the CLI prints for the same plan. Send the plan as
`{ "source": "...", "profile": "...", "strict": false }` with `content-type: application/json`, or as
the plain body with `?profile=` and `?strict=1` in the query:

```sh
curl --data-binary @plan.arch "https://mcp.archlang.uk/check?profile=uk-residential-advisory"
```

It reads no `import` (each is `E_IMPORT_NOT_FOUND`), takes at most 64 KB of source,
and answers a limited number of requests per address each minute.

## In a GitHub workflow

A job that runs the check set and goes red when a case fails. It builds the CLI from the same
checkout the cases come from, so the two never disagree on a rule:

```yaml
name: ArchLang public check set
on: [push, pull_request]
jobs:
  check-set:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          repository: ChanMeng666/archlang
          path: archlang
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          check-latest: true
      - run: npm ci && npm run build
        working-directory: archlang
      - run: node test/check-set/run.mjs --arch "node dist/cli.js"
        working-directory: archlang
```

For a plan of your own, the CLI is the gate:
`npx -y @chanmeng666/archlang lint plan.arch --json --strict` exits 2 when the plan has an error
or a warning.

## What lint does not check

Lint judges only what a plan states. Where the plan leaves something out, the rules that need it
are skipped, and the `coverage` block of `lint --json` names each skip with its reason.

- **A plan that does not parse or resolve.** Lint judges nothing: the report holds the plan's `E_*`
  errors and no `coverage` block. Every case here compiles, so this never shows in the check set.
- **No `site`.** No window has a compass facing, so the orientation rule
  (`W_ROOM_NOT_EQUATOR_FACING`) does not judge any room (`no-site`).
- **No `level`.** A plan with one storey has no other storey for a stair or a shaft to arrive on,
  so the rules that match a vertical run between storeys (`W_STAIR_UNMATCHED`,
  `W_SHAFT_FOOTPRINT_MISMATCH`) do not judge it (`single-storey`).
- **No `height`.** A flight is not judged against a storey height the plan never states, so
  `W_STAIR_TOO_STEEP` and `W_STAIR_RISER_TOO_HIGH` stay quiet (`no-storey-height`).

## Adding a case

A default or opt-in case comes from the defect corpus: add the pair there (its README says how),
and `test/check-set.test.ts` names the row `check-set.json` needs, its column included. A cross-jurisdiction case is a new
pair in `cross-jurisdiction/` and a row naming its profile, its code and the key that decides it.
The key must be graded `V` or `S-full` for that profile and set by the profile itself, and the test
checks that the default ruleset does not report the code on the plan, that the profile's `V` and `S-full`
numbers alone do, and that without that key they do not.
