# Common mistakes

The diagnostics an assistant meets most often when it writes ArchLang, with what each means and the
fix. Every code here was reproduced with the CLI; `archlang explain <CODE>` prints the full entry
and the [error catalog](error-codes.md) lists all of them. Most diagnostics carry a `fix` field
in `--json` output, and `archlang fix plan.arch --dry-run` previews the machine-applicable ones.

## Writing the plan

| Mistake | What you see | Fix |
|---|---|---|
| Positioning a door by absolute coordinates | `W_DOOR_OFF_WALL`: the door does not lie on any wall | Host it by relation: `door between a and b …` or `door on <room>.<edge> …`. When the nearest wall is an authored wall with an id, `archlang fix` rewrites it to `door on <wall> at N%`; check where it lands. A wall made by `walls from rooms` gets no machine fix: host the door by rooms. |
| Hosting an opening on a room edge with no wall there | `E_OPENING_NO_SHARED_WALL` | Add `walls from rooms`, or draw the wall. Rooms alone draw no walls. |
| An opening too close to a wall junction | `E_OPENING_NIB`: refused, not moved | Narrow it, move it along the shared edge, or move the wall that meets the run. |
| Furniture `against wall … offset N` past the end of the wall | `E_FURN_AGAINST`: offset is outside the segment run | Keep the offset inside the run the message quotes, or place by room: `in <room> anchor … flush`. |
| Forgetting the bathroom's contents | `W_ROOM_NO_FIXTURE` | Place a `shower`, `bathtub`, `wc` or `basin`; the hint quotes a line to start from. |
| A bathroom reached only through a bedroom | `W_BATH_VIA_BEDROOM` | Join it to a hall or living space. |
| A door that swings into furniture | `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED` | `hinge right`, `swing in`, move the piece (`archlang repair`), or use a sliding or pocket door. |

## Checking and editing

| Mistake | What you see | Fix |
|---|---|---|
| Running `arch` instead of `archlang` | The wrong program runs on Linux, macOS and Git Bash | Call `archlang`, or `npx -y @chanmeng666/archlang`. |
| Stopping at "it compiles" | Nothing; a plan can compile and still be unsound | Run `archlang validate plan.arch --strict`, and read `describe` against the brief. |
| Regenerating the whole file for a small edit | Rooms you had settled drift | Edit in place and check with `archlang impact --against old.arch --lock <ids>`; see [Change one room](edit-one-room.md). |
| Locking an element that has no written id | `E_LOCK_UNNAMED` | Write `id=` on the element in both versions. |
| `--set` with a name that is not a top-level `let` | `E_SET_OVERRIDE` | Name a top-level `let` the message lists, or compare two files with `--against`. |
| Editing a file that changed since you read it | `E_STALE_SOURCE`, exit `4` | Re-read the file and redo the edit; pass `--expected-hash` (the `source_hash` of a `--json` run) to `fix`, `repair` and `finish` to get this guard. |
| Breaking a declared invariant | `W_KEEP_VIOLATED` with a signed residual in mm | The edit moved something a `keep` holds; undo it, or change the keep deliberately. |

## Exit codes

`0` ok, `1` internal or I/O error, `2` an error in the source (deterministic: fix it, do not retry
blindly), `3` bad usage, `4` stale source.

## Where to look next

- [Use it from an agent](https://archlang.uk/agents) and the [one-page spec](https://archlang.uk/spec)
- [Draw a plan from an image or PDF](from-an-image.md)
