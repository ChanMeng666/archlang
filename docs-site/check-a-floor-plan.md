# Check a floor plan's reachability and room areas

To check a floor plan for reachability and room areas, write it in ArchLang and run two commands:
`npx -y @chanmeng666/archlang describe plan.arch --json` reports every room's area and whether it
can be reached from an entrance, and `npx -y @chanmeng666/archlang lint plan.arch --json` lists
advisory warnings, such as a room with no door, each with a fix. Both read the plan's text, not a
picture of it, so a person, a script or an AI agent gets the same answer every time.

ArchLang is an open-source (MIT) language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666).

## The three things the compiler measures

1. **Room reachability from an entrance.** `describe` builds an access graph from the doors and
   openings: which doors lead outside, and for every room whether it is reachable and how many
   doors deep it sits.
2. **Exact floor areas.** Each room's area is computed from its shape, in m², both on the wall
   centrelines (`area_m2`) and net of the walls (`net_area_m2`), with totals for the plan.
3. **Byte-identical output.** The compiler has no clock and no randomness, so the same source gives
   the same SVG, the same `describe` JSON and the same `lint` JSON, byte for byte.

Everything else `lint` says is advisory: a windowless bedroom, a narrow door, a bathroom reached
through a bedroom. It flags what to look at; it does not certify the plan.

## A plan with one warning

A flat with a living room, a bedroom and a bath, where the bedroom has been left without a door:

```arch static
plan "Flat with a bath" {
  units mm
  grid 50
  north up
  room id=living at (0,0)        size 4500x3600 label "Living" uses living
  room id=bed    right-of living size 3200x3600 label "Bedroom" uses bedroom
  room id=bath   below living    size 2400x1800 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door on living.left at center width 900 swing into living
  door between living and bath at 1200 from start width 800 swing into bath
  window on living.top width 1800
  window on bed.top width 1200
  furniture bathtub in bath anchor bottom flush size 1700x700
}
```

It compiles, and `lint` returns one warning (output trimmed):

```text
warning[W_ROOM_DISCONNECTED]: Room "Bedroom" has no door or opening — it can't be entered.
  --> 6:3
  = help: Add a `door` or a cased `opening` on one of its walls.
```

`describe` agrees: in its `access.rooms` list the bedroom has `"reachable": false`, while the
living room and the bath are reachable. The areas are there already: 32.04 m² in all on the wall
centrelines, the bedroom 11.52 m².

`npx -y @chanmeng666/archlang suggest plan.arch --json` turns the warning into candidate
statements. Its candidates start with a door on the partition between the living room and the bedroom.

## The fixed plan

One line added, a door between the living room and the bedroom. Edit it below and it recompiles in
your browser:

```arch
plan "Flat with a bath" {
  units mm
  grid 50
  north up
  room id=living at (0,0)        size 4500x3600 label "Living" uses living
  room id=bed    right-of living size 3200x3600 label "Bedroom" uses bedroom
  room id=bath   below living    size 2400x1800 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door on living.left at center width 900 swing into living
  door between living and bed at 1800 from start width 800 swing into bed
  door between living and bath at 1200 from start width 800 swing into bath
  window on living.top width 1800
  window on bed.top width 1200
  furniture bathtub in bath anchor bottom flush size 1700x700
}
```

Now `describe` reports 3 rooms, 3 doors and 2 windows; 32.04 m² on the wall centrelines (living
16.2 m², bedroom 11.52 m², bath 4.32 m²) and 28.9 m² net; and every room reachable from the
entrance, the bedroom and the bath each one door in from the living room. `lint` reports no
warnings. The bundled [accessible example](https://playground.archlang.uk/examples/accessible.html)
is a plan checked against the stricter `accessibility-advisory` profile.

## Using the checks as a gate

- `lint --strict` makes any warning exit with code `2`, for CI or an agent's stop condition.
- `lint --profile accessibility-advisory` tightens the bar; the other advisory profiles are listed
  by `npx -y @chanmeng666/archlang lint --help`.
- `describe --select rooms,totals` keeps the JSON to the parts you are checking.
- `validate --intent brief.json` fails when the plan misses an expectation written down in a brief
  (see [the intent contract](/intent)).

## FAQ

### How do I check that every room in a floor plan can be reached?

Run `npx -y @chanmeng666/archlang describe plan.arch --json` and read `access.rooms`: each room has
`reachable` and `depthFromEntrance`. `lint` also warns when a room has no door, or cannot be reached
from the entrance.

### How are the room areas calculated?

From each room's shape, in square metres: `area_m2` on the wall centrelines and `net_area_m2` inside
the walls. The plan's totals add them up.

### Does lint mean the plan meets building regulations?

No. The warnings are advisory checks on a concept or scheme-stage drawing. A plan that lints clean
still needs a professional's review for anything that needs approval.

### Can I check a plan drawn in another program?

Yes, once it is written as ArchLang text. An agent can redraw a plan from an image or PDF as
`.arch` (see [draw a plan from an image or PDF](/from-an-image)) and then check that.

## Next

- [Analysis: describe and lint](/analysis): every fact and every warning in full.
- [Generate a floor plan with a coding agent](/floor-plan-with-a-coding-agent): the write, compile, lint loop.
- [From text to a DXF floor plan](/text-to-dxf-floor-plan): export the checked plan for CAD.
