/**
 * The plans of the RM6.1 tests (`slab`, `clear`: MF-D1, RM-D17; the `section` mark), importable
 * without vitest, so the baseline of the byte law was measured against an older `src/` by this very
 * list.
 *
 * {@link SLAB_CLEAR_INLINE_ROWS} write no `slab`, `clear` or `section` clause, on the edges the forms
 * fork from: the words `slab`, `clear`, `section` and `look` as the names they have always been (a binding, a
 * reassignment and a macro call on the line after a plan's `height`, room ids, a `level` header whose
 * `height` reads a binding named `slab`), and storeys that author heights without either clause, so
 * the `heights` block they already report is the one the law holds.
 */

import type { LawRow } from "../helpers/rectilinear-rooms-law.js";

const SHELL = `    wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=a at (0,0) size 6000x4000 label "Hall" uses hall
    door id=d at (3000,4000) width 900 wall s`;

export const SLAB_CLEAR_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:slab-clear-words-as-names",
    src: `plan "W" {
  units mm
  let slab = 200
  let clear = 3
  let look = 1
  component section() {
    room id=look at (0,0) size 1000x1000
  }
  height 2600
  clear = 4
${SHELL}
  room id=slab at (6000,0) size 2000x2000 label "Store" uses storage
  room id=section at (6000,2000) size 2000x2000 label "Bed" uses bedroom
  section()
}
`,
  },
  {
    // `section` and `look` as the names they have always been, where the mark's gate could misread
    // them: a binding, a reassignment, an expression continued onto a line that begins with
    // `section` (a statement start would end it there), a component with a parameter and its call, a
    // call whose argument is a name, and a storey plan whose plan level binds them beside the levels.
    name: "inline:section-words-as-names",
    src: `plan "N" {
  units mm
  let section = 2
  let look = 1
  section = section + look
  let wide = 1000 +
    section
  component section(n) {
    room id=look at (7000 + n * 0,0) size 1000x1000
  }
  level 1 "Ground" {
${SHELL}
    section(look)
    room id=section at (6000,0) size 2000x2000 label "Store" uses storage
  }
  level 2 "Upper" {
${SHELL}
    section(section)
  }
}
`,
  },
  {
    name: "inline:slab-clear-macro-after-height",
    src: `plan "M" {
  units mm
  component clear() {
    room id=c at (6000,0) size 2000x2000 label "Store" uses storage
  }
  height 2800
  clear()
${SHELL}
}
`,
  },
  {
    name: "inline:slab-clear-storeys-without",
    src: `plan "L" {
  units mm
  let slab = 2900
  height 2750
  level 0 "Basement" height 2510 {
${SHELL}
  }
  level 1 "Ground" height slab {
${SHELL}
  }
  level 2 "Upper" {
${SHELL}
  }
}
`,
  },
];

/** A plan on two storeys under `head` (written into every storey's header), for the premise tests. */
export const storeys = (head: string): string => `plan "P" {
  units mm
  level 1 "Ground" height 3000${head} {
${SHELL}
  }
  level 2 "Upper" height 2750${head} {
${SHELL}
  }
}
`;
