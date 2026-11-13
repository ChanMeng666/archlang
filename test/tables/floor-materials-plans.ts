/**
 * The plans of the RM8.7 byte-identity law (the floor words `timber`, `carpeting`, `stone`; the
 * `outdoor` kinds `sand`, `soil`), importable without vitest, so the law's baseline was measured
 * against an older `src/` by this very list.
 *
 * {@link FLOOR_MATERIALS_INLINE_ROWS} write none of the five words as a floor or a ground, on the
 * edges the words fork from: the five as the names they have always been (bindings, ids, labels, a
 * `rug` written `carpet`), the four older floor words and the nine older kinds under `rendered` (the
 * one theme whose floor fill the words can change) with a legend, and furniture pieces that take a
 * material tint there (a wooden table among them), so the tints those pieces already take are held too.
 */

import type { LawRow } from "../helpers/rectilinear-rooms-law.js";

export const FLOOR_MATERIALS_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:floor-words-as-names",
    src: `plan "Names" {
  units mm
  let sand = 3000
  let soil = 2000
  let timber = 1000
  let carpeting = 500
  let stone = 4000
  room id=sand at (0,0) size sand x soil label "sand" uses living
  room id=soil right-of sand size timber x soil label "soil stone" uses bedroom
  furniture id=stone bed at (200,200) size 1400x1900
  furniture id=timber carpet at (2000,200) size 600x600 label "carpeting"
  outdoor id=carpeting deck at (0,stone) size 2000x2000 label "timber"
  walls from rooms exterior 200 partition 100
}
`,
  },
  {
    name: "inline:floor-old-words-rendered",
    src: `plan "Old floors" {
  units mm
  theme rendered
  paper A3 landscape
  scale 1:50
  legend
  room id=a at (0,0) size 3000x3000 label "Bath" uses bath floor tile
  room id=b right-of a size 3000x3000 label "Terrace" uses living floor paving
  room id=c right-of b size 3000x3000 label "Deck" uses dining floor deck
  room id=d below a size 3000x3000 label "Store" uses storage floor concrete
  room id=e polygon (3000,3000) (6000,3000) (6000,6000) label "Nook" floor deck
  room id=f circle at (8000,5000) radius 1200 label "Round" floor tile
  furniture sofa at (3400,400) size 2000x900
  furniture dining_table at (6400,800) size 1600x900
  furniture bathtub at (200,200) size 1700x750
  wall id=w exterior thickness 200 { (0,0) (9000,0) (9000,3000) (0,3000) close }
}
`,
  },
  {
    name: "inline:outdoor-old-kinds-rendered",
    src: `plan "Old ground" {
  units mm
  theme rendered
  paper A2 landscape
  scale 1:100
  legend
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,4000) width 900 wall w
  outdoor lawn at (0,5000) size 3000x3000 label "Lawn"
  outdoor planting at (3500,5000) size 3000x3000
  outdoor paving at (7000,5000) size 3000x3000
  outdoor deck at (10500,5000) size 3000x3000
  outdoor gravel at (0,8500) size 3000x3000
  outdoor water at (3500,8500) size 3000x3000
  outdoor driveway at (7000,8500) size 3000x3000
  outdoor patio at (10500,8500) size 3000x3000
  outdoor balcony at (6000,0) size 1500x4000
}
`,
  },
];
