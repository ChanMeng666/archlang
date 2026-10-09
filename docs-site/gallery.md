# Floor plans written by AI agents

Eleven floor plans. Each was written by an AI agent from the one-paragraph brief shown above it.

Read this before you read the drawings:

- **These are selected examples, not a benchmark.** Each brief was given to four Claude models
  (Haiku, Sonnet, Opus and Fable, as available on 2026-10-09), and one resulting plan per brief
  was picked for this page. The model is named under each brief so you know where the plan came
  from. The page does not rank the models or compare them.
- **How each plan was made.** The agent received the brief and nothing else about the task. It
  had the `arch` command line (`arch spec` prints the whole language, and each command has
  `--help`), the repository's `examples/` folder, and a budget of 25 command-line calls. It
  delivered one `.arch` file.
- **What happened after that.** Each delivered file was run once through
  [`arch finish`](/cli), which furnishes rooms the author left empty and adds the sheet
  statements a plan lacks (paper size, scale, dimensions, title block, room schedule, legend).
  So some of the furniture and all of the sheet furniture you see may come from `finish`, not
  from the agent. `finish` deletes nothing, and it furnishes single-storey plans, so the
  two-storey house keeps exactly the furniture its author placed.
- **Nothing was edited by hand.** No room, wall, door, window or piece of furniture was moved,
  added or removed by a person. The source under each drawing is the file that produced it.
- **The briefs were written for the run that produced these plans.** They are not an evaluation
  set. One brief from that run is not shown: it asks for more floor area than its own limit
  allows.
- **A drawing here is not a checked design.** Every plan on this page compiles without errors.
  That says the source is valid ArchLang. It does not say the plan meets every line of its
  brief, and it says nothing about building regulations. Compare each brief with its drawing
  and judge for yourself.

To try this with your own agent, see [Use ArchLang from an AI agent](/agents).

## Studio flat

<AgentPlan id="studio" />

## One-bedroom flat

<AgentPlan id="one-bed" />

## Two-bedroom flat

<AgentPlan id="two-bed" />

## Three-bedroom bungalow

<AgentPlan id="bungalow" />

## L-shaped house

<AgentPlan id="l-shape" />

## House on a narrow plot

<AgentPlan id="narrow-plot" />

## Two-storey house

<AgentPlan id="two-storey" />

## Four-bedroom family house

<AgentPlan id="family-house" />

## A home for a family of four

<AgentPlan id="family-of-four" />

## U-shaped courtyard house

<AgentPlan id="courtyard" />

## A flat, then a change request

<AgentPlan id="revision" />
