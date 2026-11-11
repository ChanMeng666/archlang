/**
 * Playground-only sample plans: plans the gallery offers that are NOT shipped examples.
 *
 * Every file in `examples/` stays warning-free (fix/examples-sound, 2026-10-27: a warned plan is a
 * test fixture, never a shipped example), so the plan that demonstrates Checks, which has to raise
 * a finding, lives here instead. It is offered in the gallery under its own group ("Try Checks"),
 * as a button, never as a link: not in the static example pages or the sitemap (those are
 * `EXAMPLE_ROWS`'), and the Checks panel points at it when the plan on screen has nothing to ring.
 *
 * A lazy module, loaded with the example sources. `playground/test/samples.test.ts` holds each
 * sample to its promise: it compiles, and raises exactly the finding it is for.
 */

/** The gallery group the samples are listed under. */
export const SAMPLE_GROUP = "Try Checks";

/** The label of the plan with one thing to fix (the Checks panel's pointer names it). */
export const CHECKS_SAMPLE = "Flat with one thing to fix";

/**
 * A one-bed flat, sound but for one thing: its bedroom has no window (`W_BEDROOM_NO_WINDOW`, an
 * advisory with a fix hint). Adding `window on r_bed.top width 1200` clears it.
 */
const FLAT_ONE_FIX = `# A one-bed flat with one thing to fix. Turn on Checks: the bedroom is ringed, and the
# list says why and how to fix it. Add the window it asks for and the ring clears.
plan "Flat with one thing to fix" {
  units mm
  grid 50
  north up
  dims auto all

  room id=r_live at (0,0) size 4500x5400 label "Living / Kitchen" uses living kitchen
  room id=r_bed  right-of r_live align top gap 0 size 3300x5400 label "Bedroom" uses bedroom
  room id=r_hall below r_live align left gap 0 size 4500x2100 label "Entry" uses hall
  room id=r_bath right-of r_hall align top gap 0 size 3300x2100 label "Bath" uses bath

  walls from rooms exterior 200 partition 100 { open between r_hall and r_live }

  door id=d_front on r_hall.bottom at center width 900 hinge near start swing into r_hall
  door between r_live and r_bed  at 900 from end width 800 hinge near end swing into r_bed
  door between r_hall and r_bath at 900 from start width 800 hinge near start swing into r_bath

  window on r_live.top width 1800
  window on r_bath.bottom width 600

  furniture counter      against r_live.left offset 400  size 600x600
  furniture stove        against r_live.left offset 1000 size 600x600
  furniture kitchen_sink against r_live.left offset 1800 size 800x600
  furniture sofa         in r_live anchor top-right flush size 800x1600 label "Sofa"
  furniture bed          in r_bed  anchor top-right flush size 1400x2000 label "Bed"
  furniture shower       in r_bath anchor top-right flush size 900x900
  furniture wc           against r_bath.bottom offset 1500 size 400x700
  furniture basin        against r_bath.bottom offset 600 size 600x450
}
`;

/** The label of the plan that shows editing one room without moving the others. */
export const EDIT_ONE_ROOM_SAMPLE = "Edit one room";

/**
 * The sketch-studio plan of docs/edit-one-room.md, clean under the default rules. `split` is the
 * one knob: moving it resizes the entry and the bath, and `archlang impact --lock` proves the
 * living room and its window did not move. Elements carry `id=` because a lock names them.
 */
const EDIT_ONE_ROOM = `# Edit one room, keep the rest. Move the split knob (or change let split): the entry and the
# bath resize, the living room does not. Outside the playground, ask the compiler to prove it:
#   archlang impact plan.arch --set split=3200 --lock r_main,w_main
# exits 0 while r_main and w_main are unchanged, and 2 with E_LOCKED_ELEMENT_CHANGED if they move.
# A lock names elements by the id= written here, so give every room you care about one.
plan "Edit one room" {
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
`;

/** One sample: its gallery label and its source. */
export interface Sample {
  label: string;
  source: string;
}

/** The samples, in gallery order. */
export const SAMPLES: readonly Sample[] = [
  { label: CHECKS_SAMPLE, source: FLAT_ONE_FIX },
  { label: EDIT_ONE_ROOM_SAMPLE, source: EDIT_ONE_ROOM },
];

/** The source of the sample labelled `label`, if there is one. */
export const sampleSource = (label: string): string | undefined => SAMPLES.find((s) => s.label === label)?.source;

/** The label of the sample whose source is exactly `src` (line ends aside), if `src` is an unedited sample. */
export function sampleLabelFor(src: string): string | undefined {
  const lf = (s: string) => s.replace(/\r\n?/g, "\n");
  return SAMPLES.find((s) => lf(s.source) === lf(src))?.label;
}
