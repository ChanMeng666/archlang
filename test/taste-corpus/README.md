# Taste corpus

Set C of the taste separation law (`test/taste-separation.test.ts`; ADR 0032; design
`archlang-lab/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md` §4). Each case is a pair of
plans that both lint clean and differ in ONE taste fact read by one criterion. The weaker plan is
`<case>.arch` and the better one `<case>.good.arch`. The law asserts both twins lint clean, and
that the better twin scores strictly higher on its criterion and on the total.

This is **not eval data**. Nothing here feeds `eval/` or `dataset/`. Every plan was written for this
folder from the design's acceptance lines and measured with the CLI (`arch lint`, `arch score
--taste generic`). No source from outside this repository is copied in.

## Header

Every file starts with a block of `# key: value` lines, which the test parses. A line `#` followed
by two or more spaces continues the previous value. The block ends at the first line that does not
start with `#`.

| Key | Case | Better twin |
|---|---|---|
| `criterion` | the criterion id the pair separates (`R3`, `R7`, `R14`, …) | the same id |
| `twin-of` | absent | the case's file name without `.arch` |
| `origin` | where the pair comes from | how the twin differs |
| `fact` | the measured fact behind the weaker score | the measured fact after the change |

A criterion added in a later card adds its pairs here; a pair whose order flips is a finding to
explain, never a header to edit.
