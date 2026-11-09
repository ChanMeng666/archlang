/**
 * The furniture-relation plans pinned by `test/furniture-relations-digests.test.ts` (ADR 0029;
 * card PS3.7): every form (`facing`, `against <room>.<edge>`, `clear front|sides`), a component
 * under all eight frames, the undeclared seat check, and one plan per refusal family.
 */

const plan = (name: string, body: string): string => `plan "${name}" {\n  units mm\n  grid 50\n${body}\n}\n`;

const ROOMS =
  '  room id=living at (0,0) size 5000x4000 label "Living" uses living\n  room id=bed right-of living size 3600x4000 label "Bedroom" uses bedroom\n  walls from rooms exterior 200 partition 100\n  door on living.bottom at 1200 from start width 900 swing into living\n  door between living and bed at 1000 from start width 800 swing into bed\n';

const component =
  `plan "frames" {\n  units mm\n  grid 50\n  component unit() {\n    room id=r at (0,0) size 5000x4000 uses living\n    walls from rooms exterior 200 partition 100\n` +
  "    furniture id=t dining_table at (2000,1500) size 900x900\n" +
  "    furniture chair at (2225,950) size 450x450 facing t\n" +
  "    furniture chair at (3000,1725) size 450x450 facing t\n" +
  "    furniture id=robe wardrobe against r.left offset 2000 clear front 600\n" +
  "  }\n" +
  [0, 90, 180, 270]
    .flatMap((r, i) => [
      `  place unit() as r${r} at (${i * 12000},0) rotate ${r}\n`,
      `  place unit() as m${r} at (${i * 12000},12000) rotate ${r} mirror x\n`,
    ])
    .join("") +
  "}\n";

export const FURNITURE_RELATION_PLANS: [string, string][] = [
  [
    "relations",
    plan(
      "relations",
      `${ROOMS}  furniture id=tv tv_unit against living.top offset 2500\n  furniture id=sofa sofa at (1400,2600) size 2200x900 facing tv\n` +
        "  furniture id=t dining_table at (3800,1200) size 900x900\n  furniture chair at (4025,2150) size 450x450 facing t\n" +
        "  furniture id=robe wardrobe against bed.right clear front 600\n  furniture id=b double_bed against bed.top offset 1600 clear sides 400",
    ),
  ],
  ["frames", component],
  [
    "seats",
    plan(
      "seats",
      `${ROOMS}  furniture id=t table at (1800,1400) size 800x800\n  furniture chair at (1975,850) size 450x450\n  furniture chair at (1975,2250) size 450x450\n  furniture chair at (1975,2250) size 450x450 rotate 180`,
    ),
  ],
  [
    "refused",
    plan(
      "refused",
      `${ROOMS}  furniture id=t table at (1800,1400) size 800x800\n` +
        "  furniture chair at (300,300) size 450x450 facing t\n" +
        "  furniture chair at (1975,1575) size 450x450 facing t\n" +
        "  furniture chair at (1975,2250) size 450x450 rotate 180 facing t\n" +
        "  furniture table at (300,2800) size 800x800 facing t\n" +
        "  furniture chair at (300,300) size 450x450 facing nowhere\n" +
        "  furniture id=bd bed at (5300,300) size 1500x2000\n  furniture tv_unit at (7000,1000) size 1500x450 facing bd\n" +
        "  furniture wardrobe against living.cx\n  furniture wardrobe at (0,0) size 1800x600 clear front 0",
    ),
  ],
];
