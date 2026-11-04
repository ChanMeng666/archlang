---
name: archlang-edit-plan
description: Use when the user wants to change an existing ArchLang .arch floor plan, e.g. "make the bedroom 1 m wider", "add a bathroom next to the hall", "move the front door to the south wall", "merge the kitchen into the living room". Reads the plan's facts with the archlang CLI, makes the smallest edit that does the job, and re-verifies. Not for writing a plan from a brief (archlang-brief-to-plan).
license: MIT
compatibility: Needs a shell with Node 18+ and the archlang CLI (npx -y @chanmeng666/archlang, or npm i -g @chanmeng666/archlang for a global archlang).
---

# Edit an existing plan

Change a `.arch` file without breaking what already works.
If `archlang` is not on the path, write `npx -y @chanmeng666/archlang` in its place.
Never run a bare `arch`: on Linux, macOS and Git Bash that name is the coreutils command.

This skill is a workflow, not a language reference. Run `archlang spec` for the language and
`archlang <cmd> --help` for a command's flags.

## Scope

- Run the `archlang` CLI commands below and no other program.
- Change the one `.arch` file the user asked you to edit (`plan.arch` below). If the user has not
  named it, ask. Besides it, write only the drawing the CLI renders and the `.bak` copy that
  `--backup` keeps.
- The user's explicit instructions take priority over these steps.

## Steps

1. **Record the starting state.** Run `archlang validate plan.arch --json` and
   `archlang describe plan.arch --select rooms,totals --json`. Keep both results: they are what you
   compare against at the end. If the plan already has errors, tell the user before you edit.
2. **Read only what the change touches.** `archlang describe plan.arch --room <ids> --json` returns
   those rooms with the doors, windows and furniture that touch them.
   `archlang describe plan.arch --select freedom --json` says which positions the author typed
   (`absolute`) and which the compiler derives. Change a typed number; a derived one moves by
   itself when the thing it depends on moves.
3. **Read the language for the forms you will write.** `archlang spec`.
4. **Make the smallest edit.** Change the statements the request names and leave the rest as they
   are: same ids, same order, same comments. Do not reformat the file and do not rewrite
   statements you were not asked to change. When a room changes size, check the walls, doors,
   windows and neighbouring rooms that share its edges.
5. **Compile.** `archlang compile plan.arch -o plan.svg --json`. If `ok` is false, preview the
   mechanical fixes with `archlang fix plan.arch --dry-run --json` and read the diff before you apply
   them with `archlang fix plan.arch --backup`.
6. **Move furniture out of the way if needed.** If the edit pushed a piece into a wall, a doorway
   or a door swing, `archlang repair plan.arch -o plan.arch` moves it. Read `unresolved` for the pieces
   it could not move.
7. **Verify the change and nothing else.** Run the two commands from step 1 again. The rooms you
   meant to change differ as intended. Every other room has the same area and the same
   connections. No diagnostic is new unless the request causes it; if one is, tell the user.
8. **Refresh the sheet if the drawing grew.** `archlang finish plan.arch --dry-run --json` shows what
   is missing. If it reports that the drawing no longer fits the authored `paper` or `scale`,
   `archlang finish plan.arch --reissue` may replace those two statements and nothing else.

## When another agent may edit the same file

Pass the file's current revision as `--expected-hash <hash>`, as in
`archlang fix plan.arch --expected-hash <hash> --json`. The `--json` result of each command that
rewrites the file (`fix`, `finish`, `repair -o plan.arch`, `fmt --write`) says which hash that is:
`source_hash` is the file as the command read it, and `written_hash` the file once the command has
written it. A result that hands you rewritten text instead (`repair --json`, a `--dry-run`, or the
MCP `repair`, `fix` and `finish` tools) gives `output_hash`, the file's revision once you write that
text to it unchanged. `archlang fmt plan.arch --json` reports `source_hash` without writing. If the
file changed since, the command writes nothing and exits `4` with `E_STALE_SOURCE`: read the file
again, redo your edit on what is there now, and use the new hash. This narrows the window for a
clash; it is not a lock.

## Report to the user

- The statements you changed, as a short diff.
- Before and after for the facts the request is about (for example the room's area).
- Any new warning, and whether the request causes it.

## When something goes wrong

- Exit code `2` is a fault in the source: read the diagnostic, do not retry unchanged. `3` is a
  wrong flag: run `archlang <cmd> --help`.
- `archlang explain <CODE> --json` explains a diagnostic code.
- If the request needs a new door or window and you are unsure where it can go,
  `archlang suggest plan.arch --json` returns candidates with the reason for each.
