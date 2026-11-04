# Change one room without moving the others

An assistant that is asked to "make the entry a bit wider" will often rewrite the whole plan, and
the rooms you had already settled drift. ArchLang gives you a way to say what must not change and to
have the compiler check it: `archlang impact` compares the plan before and after an edit and `--lock`
turns "these must stay put" into an exit code.

## The plan

The plan is the one from [Draw a plan from an image or PDF](from-an-image.md). Save it as `old.arch`.
The edit below changes the entry's width, which is one number, `split`:

```arch static
  let split = 3000
```

The three rooms are written with ids (`r_main`, `r_hall`, `r_bath`), the front door is `d_front` and
the window is `w_main`. A lock names an element by the `id=` its author wrote.

## Ask what an edit would do, before making it

`--set` overrides a top-level `let` and compares the plan before and after, without touching the file:

```bash
archlang impact old.arch --set split=3200 --lock r_main,w_main
```

```text
split: 3000 → 3200
Lets (1):
  split: 3000 → 3200
Changed (7):
  door d_front moved 100 mm right
    why: on r_hall (resized) ← reads split (3000 → 3200)
  ...
Held (3):
  ...
Broke (0): none
Healed (0): none
Unchanged diagnostics: 0
Locked (2): none changed
```

The report lists what moved with the chain that moved it, what stayed although something it depends
on changed, and what newly warns. The locked living room and window did not change, so the exit
code is `0`.

## Make a lock fail loudly

Now suppose the assistant changes `hall_d` instead, making the entry deeper. That pushes into the
living room:

```bash
archlang impact old.arch --set hall_d=1700 --lock r_main,w_main,d_front
```

```text
Locked (3): 1 changed, 0 refused
  E_LOCKED_ELEMENT_CHANGED: Locked room "r_main" resized (16.2 m² → 15.1 m²; bottom edge -200 mm).
```

The exit code is `2`. A lock reports an element that moved, resized, was re-hosted, changed its
swing or kind, vanished or appeared; a relabel is not a change. Each report carries the element's position before
and after; with `--against`, in both files.

## Compare two files

When the edit was made by hand or by an assistant, compare the files instead of a number:

```bash
archlang impact new.arch --against old.arch --lock r_main,w_main,d_front --json
```

Read the `lock` object in the JSON: `violations[]` for what changed and `refused[]` for a lock that
could not be checked. A lock on an id that was not written as `id=` (an assigned one such as
`room_3`, which shifts when a statement is inserted above it) is refused with `E_LOCK_UNNAMED`:
write the id first. A lock checks the lowest storey only.

Note that a door centred on a room (`at center`) moves when that room is resized. If the lock on
`d_front` fails for that reason, either the lock was right and the edit is wrong, or the door should
be given a fixed position (`at 1500 from start`).

## Declare what must always hold

A lock is a check you run for one edit. A `keep` is written into the plan and holds for every
edit. The compiler measures it and never moves anything to make it true:

```arch static
  keep fixed r_main.bottom at 3000
```

With that line in the plan, `archlang impact old.arch --set hall_d=1700` lists it under "Keeps
broke": `residual 0 → -200 mm`, with the room that changed. The other forms (`align`, `equal`,
`offset`, `min clear`, `on axis`, `stacked`) are in the [language
reference](language-reference.md#keep--declared-invariants-checked-and-never-solved).

## Make the assistant do it this way

Give the assistant these rules with the edit request:

- Edit the existing file. Do not regenerate it.
- Before writing, run `archlang impact` with `--lock` on every id the request did not name.
- After writing, run `archlang validate plan.arch --strict` and report the `impact` result.
- To make sure it edits the revision you meant, pass `--expected-hash <sha256>` to `fix`, `repair` or
  `finish`; the hash is the `source_hash` of a `--json` run. A file that changed in between is
  refused with `E_STALE_SOURCE` and exit `4`.

## Storeys that must line up

For a plan with `level` blocks, a structural grid shared by all storeys is an `axes` block, and a
stair or lift with the same id on two storeys is one shaft. `keep stacked core on levels 1 2` holds a
shaft's footprint over itself. See [What is new](whats-new.md#stacked-storeys).
