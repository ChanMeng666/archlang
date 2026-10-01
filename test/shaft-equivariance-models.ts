/**
 * Multi-storey buildings for `test/shaft-equivariance.test.ts`: each storey's body is a
 * component, and every storey places it with the SAME frame (`place sN() as g at (t, t)
 * rotate … mirror …`), so the shafts keep their ids (`g.<id>`) and the building is one
 * building turned or flipped. `scale` multiplies every coordinate (not a thickness or a door
 * width), which is how the same layout is measured on a 100 mm cell (lattice-aligned) and on
 * a larger one that does not divide the plan.
 */

/** A building: one plan-body string per storey, ascending. */
export interface Building {
  name: string;
  storeys: readonly string[];
}

/** The plan placing every storey of `b` with `frame` at (t, t). */
export function placed(b: Building, frame: string, t = 20000): string {
  const comps = b.storeys.map((body, i) => `  component s${i + 1}() {${body}\n  }`).join("\n");
  const levels = b.storeys
    .map((_, i) => `  level ${i + 1} { place s${i + 1}() as g at (${t},${t})${frame} }`)
    .join("\n");
  return `plan "${b.name}" {\n  units mm\n${comps}\n${levels}\n}\n`;
}

/** The eight frames of D4, as `place` clauses. */
export const FRAMES = [
  "",
  " rotate 90",
  " rotate 180",
  " rotate 270",
  " mirror x",
  " rotate 90 mirror x",
  " rotate 180 mirror x",
  " rotate 270 mirror x",
] as const;

/**
 * townhouse's shape: three storeys, one stair id climbing on through the middle one (`dir up`
 * on the ground and middle storeys, `dir down` on top), a landing beside two rooms on each.
 */
export function townhouse(s: number): Building {
  const W = 6000 * s;
  const D = 9000 * s;
  const shell = `wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${D}) (0,${D}) close }`;
  const spine = `wall id=spine partition thickness 100 { (${2400 * s},0) (${2400 * s},${D}) }`;
  const cross = `wall id=cross partition thickness 100 { (${2400 * s},${4500 * s}) (${W},${4500 * s}) }`;
  const st = (dir: string) => `stair id=st at (${600 * s},${2600 * s}) size 900x3200 dir ${dir}`;
  const upper = (dir: string, a: string, b: string) => `
    ${shell}
    ${spine}
    ${cross}
    room id=landing at (0,0) size ${2400 * s}x${D} label "Landing" uses hall circulation
    room id=ra at (${2400 * s},0) size ${3600 * s}x${4500 * s} label "${a}" uses bedroom
    room id=rb at (${2400 * s},${4500 * s}) size ${3600 * s}x${4500 * s} label "${b}" uses bath
    door id=da on spine at ${1800 * s} width 800 swing into ra
    door id=db on spine at ${6500 * s} width 800 swing into rb
    furniture bed at (${3500 * s},${600 * s}) size 1500x2000 in ra
    ${st(dir)}`;
  return {
    name: `Townhouse x${s}`,
    storeys: [
      `
    ${shell}
    ${spine}
    room id=hall at (0,0) size ${2400 * s}x${D} label "Hall" uses hall
    room id=living at (${2400 * s},0) size ${3600 * s}x${D} label "Living" uses living
    door id=front on shell at ${2 * W + D + 1200 * s} width 1000 swing into hall
    door id=dl on spine at ${2300 * s} width 900 swing into living
    ${st("up")}`,
      upper("up", "Bedroom", "Bath"),
      upper("down", "Study", "Shower"),
    ],
  };
}

/**
 * hillside's upper floor in miniature: a landscape stair (`dir up` below, `dir down` above)
 * in a long landing, a bedroom reached through its en-suite's 700 mm door, a double-height
 * void off the landing.
 */
export function hillside(s: number): Building {
  const W = 13800 * s;
  const D = 10200 * s;
  const shell = `wall id=shell exterior thickness 250 { (0,0) (${W},0) (${W},${D}) (0,${D}) close }`;
  const band = `wall id=band partition thickness 200 { (0,${4200 * s}) (${W},${4200 * s}) }`;
  const stair = (dir: string) => `stair id=stair at (${4900 * s},${2700 * s}) size 2200x1000 dir ${dir}`;
  return {
    name: `Hillside x${s}`,
    storeys: [
      `
    ${shell}
    ${band}
    room id=entry at (0,0) size ${W}x${4200 * s} label "Entry" uses entry hall
    room id=living at (0,${4200 * s}) size ${W}x${6000 * s} label "Living" uses living
    door id=front on shell at ${6000 * s} width 1200 swing into entry
    opening id=o1 on band at ${2000 * s} width 1800
    ${stair("up")}`,
      `
    ${shell}
    ${band}
    wall id=bed_s partition thickness 100 { (0,${2600 * s}) (${W},${2600 * s}) }
    wall id=en_w partition thickness 100 { (${4000 * s},0) (${4000 * s},${2600 * s}) }
    room id=bed at (0,0) size ${4000 * s}x${2600 * s} label "Bedroom" uses bedroom
    room id=en at (${4000 * s},0) size ${W - 4000 * s}x${2600 * s} label "Ensuite" uses bath
    room id=landing at (0,${2600 * s}) size ${W}x${1600 * s} label "Landing" uses hall circulation
    room id=master at (0,${4200 * s}) size ${W}x${6000 * s} label "Master" uses bedroom
    door id=d_en on bed_s at ${5300 * s} width 700 swing out
    door id=d_bed_en on en_w at ${1300 * s} width 700 swing into bed
    door id=d_master on band at ${10500 * s} width 1000 swing into master
    void id=gal at (${900 * s},${5100 * s}) size 3000x2000
    ${stair("down")}`,
    ],
  };
}

/** rt-final's dbg3 shell: two storeys, a stair `gap` from the shell corner, no front door
 *  upstairs. */
export function shell(W: number, D: number, gap: number, portrait: boolean, upstairs = "", name = ""): Building {
  const [sw, sh] = portrait ? [900, 2600] : [2600, 900];
  const body = (dir: string, front: boolean, extra: string) => `
    wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${D}) (0,${D}) close }
    wall id=vx1 partition thickness 100 { (${W / 2},0) (${W / 2},${D}) }
    room id=a at (0,0) size ${W / 2}x${D} label "A" uses hall
    room id=b at (${W / 2},0) size ${W / 2}x${D} label "B" uses living
    door id=dab on vx1 at ${D / 2} width 900 swing into b
    ${front ? `door id=front on shell at ${W + D + W / 4} width 1000 swing into a` : ""}
    stair id=stair at (${gap},${gap}) size ${sw}x${sh} dir ${dir}
    ${extra}`;
  return {
    name: `Shell ${W}x${D} gap ${gap}${name ? ` ${name}` : ""}`,
    storeys: [body("up", true, ""), body("down", false, upstairs)],
  };
}

/**
 * rt-final's p3-attack cases: the 120 m × 100 m shell (220 mm cells), the stair's head
 * (top edge, y = 2000) with something at it upstairs. Each decision about the landing used to
 * be read off cell centres, so these were measured in some frames and sealed in others.
 */
export const P3 = {
  /** A 450 mm side table beside the landing, covering half the landing row. */
  halfTable: shell(120000, 100000, 2000, true, "furniture bed at (2000,1200) size 450x700", "side table"),
  /** A partition whose band covers the head itself: sealed in every frame. */
  partitionAtHead: shell(
    120000,
    100000,
    2000,
    true,
    "wall id=scr partition thickness 100 { (-1000,2000) (3900,2000) }",
    "partition at head",
  ),
  /**
   * The head butting the TOP shell wall (sealed), with a 900 mm door on a PERPENDICULAR
   * interior partition beside the flight (x = 1200, 200 mm from the nearest probe point). A
   * door cuts only its own wall's band, so the landing stays sealed: an earlier probe cut a
   * disc of the door's half-width round it out of EVERY wall band and read this as open.
   */
  perpendicularDoor: shell(
    120000,
    100000,
    100,
    true,
    `wall id=px partition thickness 100 { (1200,0) (1200,3000) }
    door id=dp on px at 300 width 900 swing into a`,
    "perpendicular door",
  ),
  /** A room behind a wall at the head, the wall pierced by a 900 mm opening at the flight. */
  openingAtHead: shell(
    120000,
    100000,
    2000,
    true,
    `wall id=scr partition thickness 100 { (0,2000) (20000,2000) }
    room id=c at (0,0) size 20000x2000 label "C" uses storage
    opening id=op on scr at 2450 width 900`,
    "opening at head",
  ),
};
