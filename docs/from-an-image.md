# Draw a plan from an image or PDF

ArchLang does not read images. The compiler takes text and has no image decoder, so a photo, a
scan, a PDF or a screenshot of a listing is never an input. What does work today is to let your own
AI assistant do the looking: it reads the image, writes `.arch` source, and ArchLang's checks tell
the two of you what the source does not yet say. The result is a starting point to confirm, not a
copy of the image.

The mask-based route in [Import from a mask](import.md) is the other way in, for a plan that is
already a label mask; this page is for everything else.

## The workflow

1. **Give the assistant the image and the language.** Any assistant that can see images will do.
   Give it the one-page spec as well: `npx -y @chanmeng666/archlang spec`, or the
   [spec page](https://archlang.uk/spec). Without the spec it will guess the syntax.
2. **Anchor the scale on one length you know.** An image has no scale, so ask the assistant to name
   the one length it is using and why. A door leaf is a good anchor: a single interior door leaf
   is commonly about 900 mm, though yours may be 760 or 1000. If the plan prints a dimension, use
   that instead. Measure the anchor in pixels, divide, and every other length follows:

   | Measured in the image | Known length | Scale |
   |---|---|---|
   | front door leaf, 90 px | 900 mm | 10 mm per pixel |
   | building width, 540 px | 5400 mm | the same 10 mm per pixel |

   Put the arithmetic in a comment at the top of the file, as the example below does, so the next
   reader can see where every number came from.
3. **Confirm two or three lengths.** Ask the assistant to list the three lengths it is least sure
   of (the overall width, the longest room, the entry door) and check them against what you know
   or can measure on site. A scale error of a few percent moves every room, so this is the check
   that matters most, and no tool can do it for you.
4. **Write rooms first, then let the walls follow.** Ask for the rooms as `room id=… at … size …`,
   then `walls from rooms`, then doors and windows hosted by the rooms they join. Rooms with
   written ids are what the later edits can lock (see [Change one room without moving the
   others](edit-one-room.md)).
5. **Check what the source says.** The checks read the text, not the image:

   ```bash
   archlang validate plan.arch --strict --json   # parse, resolve, lint; every warning fails
   archlang lint plan.arch                       # what is unsound, with a fix for each
   archlang describe plan.arch                   # rooms, areas, which door joins which rooms
   ```

   Compare `describe` with the image: room count, labels, areas, and which rooms touch. A room that
   is the wrong size or joins the wrong neighbour shows up here, in words, with no drawing to eyeball.
6. **Then finish and export.** `archlang finish plan.arch --dry-run` shows the furniture and sheet
   statements it would add; run it without `--dry-run` to write them. `archlang compile plan.arch
   -o plan.svg` renders the drawing (`-f dxf` and `-f pdf` are other formats).

## What the checks do and do not tell you

They tell you whether the source is internally sound (doors on walls, rooms reachable, fixtures
that fit) and what it measures. They cannot tell you whether it matches the building in the image.
That part is yours: the confirmed lengths in step 3 and a side-by-side look at the result.

## A worked example

A photo of a hand-drawn sketch, 540 px wide, with a front door leaf 90 px wide. The assistant's
output is below. It compiles, and `archlang lint` reports no warning on it.

```arch
# Traced from a photo of a hand sketch. Scale anchor: the front door leaf measured 90 px
# wide in the photo and a door leaf is 900 mm, so 1 px = 10 mm. The overall width in the
# photo was 540 px = 5400 mm (confirmed by the owner).
plan "Sketch Studio" {
  units mm
  grid 100
  scale 1:50
  north up

  let w = 5400
  let d = 4500
  let hall_d = 1500
  let split = 3000

  room id=r_main at (0,0)                size w x (d - hall_d)       label "Living / Bed"
  room id=r_hall at (0,d - hall_d)       size split x hall_d         label "Entry"
  room id=r_bath at (split,d - hall_d)   size (w - split) x hall_d   label "Bath"

  walls from rooms exterior 300 partition 100

  door id=d_front on r_hall.bottom at center width 900 swing into r_hall
  door between r_hall and r_main at 1500 from start width 900 swing into r_main
  door between r_hall and r_bath at center width 800 swing into r_bath
  window id=w_main on r_main.top width 1800

  furniture shower in r_bath anchor right flush size 900x900
}
```

A draft of this plan with the bath door opening off the living room, and no fixture in the bath,
got `W_BATH_VIA_BEDROOM` (the only way into the bath was through a room that is also a bedroom)
and `W_ROOM_NO_FIXTURE` (a bath with nothing in it) from `lint`. Both are things a sketch leaves
unsaid, and both are fixed in the source, not in the image.

`archlang describe` on the final plan reports:

```text
Sketch Studio — 3 room(s), 24.3 m²
  r_main "Living / Bed": 16.2 m² — adj: r_hall, r_bath
  r_hall "Entry": 4.5 m² — adj: r_main, r_bath
  r_bath "Bath": 3.6 m² — adj: r_main, r_hall
```

These areas are on wall centrelines. The `describe --json` output also carries `net_area_m2`, the floor
that no wall stands on; say which one you quote.

## Tips for the assistant

- Make it write every length as a `let` or a written number, never an unexplained pixel count.
- Rectilinear rooms are the easy case. A curved or angled wall in the image is better drawn as the
  nearest straight wall first and refined once the rooms are right.
- Ask for what it could not read, not for a guess. A door that is not visible in the image should be
  a question to you, not an invented opening.
- When the source and the image disagree, change one number at a time and run `archlang impact` to see
  what moved; see the next page.

## Next

- [Change one room without moving the others](edit-one-room.md)
- [Common mistakes](common-mistakes.md)
- [Import from a mask](import.md), for a plan that is already a label mask
