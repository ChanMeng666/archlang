import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, lintCoverage, type LintCoverage } from "../src/index.js";
import { dwellingReading } from "../src/analyze/dwelling.js";
import type { UseKind } from "../src/ast.js";
import { SKIP_WHY } from "../src/lint/coverage.js";
import { STRICTER_PROFILES, stricterProfileNames } from "../src/finish.js";

/**
 * Plan-soundness PS2.18: the rules that describe a defect of a HOME judge a plan only when it
 * reads as a dwelling (`src/analyze/dwelling.ts`), under the default ruleset and
 * `accessibility-advisory`; `residential-basic` judges every plan as one. Declining files a
 * `non-dwelling` coverage skip. `W_WET_ROOM_DOOR`'s kitchen arm (a WC onto a room where food
 * is handled) judges every plan.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIRST_CONTACT = join(ROOT, "docs", "plans", "plan-soundness", "audits", "first-contact-plans");
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const codes = (src: string, profile?: string): string[] =>
  lint(src, profile ? { profile } : {}).map((d) => d.code ?? "");
const skipsOf = (c: LintCoverage | null, family: string): string[] =>
  (c?.families.find((f) => f.family === family)?.skipped ?? []).map((s) => s.reason);

const room = (label: string, uses?: string[]) => ({ id: "r", label, ...(uses ? { uses: uses as never } : {}) });

describe("dwellingReading", () => {
  it("reads a house, a flat and a studio as a dwelling", () => {
    expect(dwellingReading([room("Living"), room("Kitchen"), room("Bedroom 1"), room("Bath")])).toBe("dwelling");
    expect(dwellingReading([room("Studio", ["living", "bedroom"]), room("Bath")])).toBe("dwelling");
    // A study is an office use, but beside a bedroom it is a home's study.
    expect(dwellingReading([room("Study"), room("Bedroom"), room("Kitchen")])).toBe("dwelling");
    // A living room, an office and a bath drawn alone are a home's fragment with a study.
    expect(dwellingReading([room("Living"), room("Office"), room("Bath")])).toBe("dwelling");
    // No evidence at all is a dwelling: there is no "unknown".
    expect(dwellingReading([room("Room A"), room("Room B")])).toBe("dwelling");
    expect(dwellingReading([])).toBe("dwelling");
  });

  it("reads an office with no bedroom, and a café or clinic label, as non-residential", () => {
    expect(dwellingReading([room("Open Office"), room("Kitchenette"), room("WC")])).toBe("non-residential");
    // A clinic whose rooms are bedroom-free offices, with no clinic word at all.
    expect(dwellingReading([room("Room 1", ["office"]), room("Room 2", ["office"]), room("WC")])).toBe(
      "non-residential",
    );
    expect(dwellingReading([room("Cafe seating", ["dining"]), room("WC")])).toBe("non-residential");
    expect(dwellingReading([room("Café"), room("WC")])).toBe("non-residential");
    expect(dwellingReading([room("Waiting / Reception", ["circulation"])])).toBe("non-residential");
    expect(dwellingReading([room("Meeting Room")])).toBe("non-residential");
  });

  it("matches whole words only", () => {
    // "Shopfront" is not "shop"; "Lobbyist" is not "lobby".
    expect(dwellingReading([room("Shopfront Bedroom"), room("Lobbyist")])).toBe("dwelling");
  });

  it("an ambiguous word is overruled by a bedroom or a living room; an unambiguous one is not", () => {
    const house = (swap: string) => [
      room("Living"),
      room("Kitchen"),
      room("Bedroom"),
      room("Dining"),
      room("WC"),
      room(swap),
    ];
    for (const w of ["Entrance Lobby", "Reception room", "Waiting area", "Shop", "Meeting nook"])
      expect(dwellingReading(house(w)), w).toBe("dwelling");
    // With only a living room, or only a bedroom, the word is still overruled.
    expect(dwellingReading([room("Reception room"), room("Living")])).toBe("dwelling");
    expect(dwellingReading([room("Entrance Lobby"), room("Bedroom")])).toBe("dwelling");
    // With neither, the same words read a building people do not live in.
    for (const w of ["Lobby", "Reception", "Waiting", "Shop", "Meeting Room"])
      expect(dwellingReading([room(w), room("WC"), room("Store")]), w).toBe("non-residential");
    // An unambiguous word reads non-residential even beside a bedroom (a café with a flat above).
    for (const w of ["Cafe", "Restaurant", "Clinic", "Consulting 1", "Servery", "Staff room", "Classroom", "Retail"])
      expect(dwellingReading([...house("Hall"), room(w)]), w).toBe("non-residential");
  });

  it("reads the first-contact plans: the café and the clinic are non-residential, the homes are not", () => {
    const rooms = (f: string) =>
      describePlan(read(FIRST_CONTACT, f)).rooms.map((r) => ({ id: r.id, label: r.label, uses: r.uses as UseKind[] }));
    for (const f of ["1-apartment.arch", "2-house.arch", "3-studio.arch", "5-townhouse.arch"])
      expect(dwellingReading(rooms(f)), f).toBe("dwelling");
    for (const f of ["4-cafe.arch", "6-clinic.arch"]) expect(dwellingReading(rooms(f)), f).toBe("non-residential");
  });

  it("is lint-only: describe() reports no reading", () => {
    const d = describePlan(read(FIRST_CONTACT, "4-cafe.arch"));
    expect(JSON.stringify(d)).not.toMatch(/non-residential|dwellingReading/);
  });
});

const PLAN = (body: string): string => `plan "t" {
  units mm
  grid 50
${body}
}`;

/** A café: seating, a servery (kitchen), a lobby and a staff WC; `wcDoor` places the WC's door. */
const cafe = (wcDoor: string, seatLabel = "Cafe seating", lobbyLabel = "Lobby"): string =>
  PLAN(`  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4500) (0,4500) close }
  wall id=w_v partition thickness 100 { (4000,0) (4000,4500) }
  wall id=w_h partition thickness 100 { (4000,2200) (8000,2200) }
  wall id=w_v2 partition thickness 100 { (6000,2200) (6000,4500) }
  room id=r_seat at (0,0) size 4000x4500 label "${seatLabel}" uses dining
  room id=r_serv at (4000,0) size 4000x2200 label "Counter / servery" uses kitchen
  room id=r_lobby at (4000,2200) size 2000x2300 label "${lobbyLabel}" uses circulation
  room id=r_wc at (6000,2200) size 2000x2300 label "Staff WC" uses wc
  door id=d_entry at (2000,4500) width 1000 wall shell
  door id=d_serv at (4000,1100) width 900 wall w_v swing into r_serv
  door id=d_lobby at (4000,3400) width 900 wall w_v swing into r_lobby
  ${wcDoor}
  window at (2000,0) width 2000 wall shell
  window at (6000,0) width 1500 wall shell`);

const ONTO_SERVERY = "door id=d_wc at (7000,2200) width 800 wall w_h swing into r_wc";
const ONTO_LOBBY = "door id=d_wc at (6000,3350) width 800 wall w_v2 swing into r_wc";
/** The WC moved under the seating: its door opens onto the café's dining room. */
const cafeWcOffSeating = (seat = "Cafe seating", lobby = "Lobby"): string =>
  PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6500,0) (6500,4500) (0,4500) close }
  wall id=w_v partition thickness 100 { (4000,0) (4000,4500) }
  wall id=w_h partition thickness 100 { (4000,2200) (6500,2200) }
  room id=r_seat at (0,0) size 4000x4500 label "${seat}" uses dining
  room id=r_wc at (4000,0) size 2500x2200 label "WC" uses wc
  room id=r_lobby at (4000,2200) size 2500x2300 label "${lobby}" uses circulation
  door id=d_entry at (2000,4500) width 1000 wall shell
  door id=d_lobby at (4000,3400) width 900 wall w_v swing into r_lobby
  door id=d_wc at (4000,1100) width 900 wall w_v swing into r_wc
  window at (2000,0) width 2000 wall shell`);

describe("W_WET_ROOM_DOOR on a plan that reads as non-residential", () => {
  it("the kitchen arm judges every plan: a café WC onto the servery warns under the default", () => {
    expect(codes(cafe(ONTO_SERVERY))).toContain("W_WET_ROOM_DOOR");
    expect(codes(cafe(ONTO_SERVERY), "accessibility-advisory")).toContain("W_WET_ROOM_DOOR");
  });

  it("the dining arm declines: a café WC onto the seating is silent under the default, with the skip", () => {
    const src = cafeWcOffSeating();
    expect(codes(src)).not.toContain("W_WET_ROOM_DOOR");
    expect(codes(src, "accessibility-advisory")).not.toContain("W_WET_ROOM_DOOR");
    expect(skipsOf(lintCoverage(src), "privacy")).toContain("non-dwelling");
  });

  it("residential-basic judges every plan as a dwelling: the same café warns there, and files no skip", () => {
    const src = cafeWcOffSeating();
    expect(codes(src, "residential-basic")).toContain("W_WET_ROOM_DOOR");
    expect(skipsOf(lintCoverage(src, { profile: "residential-basic" }), "privacy")).not.toContain("non-dwelling");
  });

  it("the default ruleset still warns on the same plan drawn as a house", () => {
    const src = cafeWcOffSeating("Dining", "Hall");
    expect(codes(src)).toContain("W_WET_ROOM_DOOR");
    expect(skipsOf(lintCoverage(src), "privacy")).not.toContain("non-dwelling");
  });

  it("a café WC onto the lobby is silent and still declares the skip", () => {
    const src = cafe(ONTO_LOBBY);
    expect(codes(src)).not.toContain("W_WET_ROOM_DOOR");
    expect(skipsOf(lintCoverage(src), "privacy")).toContain("non-dwelling");
  });
});

/** An office kitchenette with no window. */
const officeKitchenette = (offLabel: string, kitLabel = "Kitchenette"): string =>
  PLAN(`  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (5000,0) (5000,4000) }
  room id=r_off at (0,0) size 5000x4000 label "${offLabel}"
  room id=r_kit at (5000,0) size 3000x4000 label "${kitLabel}"
  door id=d_entry at (2000,4000) width 900 wall shell
  door id=d_mid at (5000,2000) width 800 wall w_mid
  window at (2000,0) width 1500 wall shell`);

describe("W_HABITABLE_NO_WINDOW's kitchen arm", () => {
  it("declines an office kitchenette under the default, naming the room in the coverage report", () => {
    const src = officeKitchenette("Open Office");
    expect(codes(src)).not.toContain("W_HABITABLE_NO_WINDOW");
    const daylight = lintCoverage(src)?.families.find((f) => f.family === "daylight");
    expect(daylight?.skipped).toContainEqual({
      reason: "non-dwelling",
      why: SKIP_WHY["non-dwelling"],
      rooms: ["Kitchenette"],
      roomIds: ["r_kit"],
    });
  });

  it("judges it under residential-basic, and judges a home's windowless kitchen under the default", () => {
    expect(codes(officeKitchenette("Open Office"), "residential-basic")).toContain("W_HABITABLE_NO_WINDOW");
    expect(codes(officeKitchenette("Living"))).toContain("W_HABITABLE_NO_WINDOW");
  });

  it("living and dining rooms are judged on every plan", () => {
    expect(codes(officeKitchenette("Open Office", "Cafe dining"))).toContain("W_HABITABLE_NO_WINDOW");
  });
});

/** A front door straight into a WC, beside a room that is not private. */
const doorIntoWc = (otherLabel: string, use = "living"): string =>
  PLAN(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (4000,0) (4000,4000) }
  room id=r_main at (0,0) size 4000x4000 label "${otherLabel}" uses ${use}
  room id=r_wc at (4000,0) size 2000x4000 label "WC"
  door id=d_entry at (5000,4000) width 900 wall shell
  door id=d_mid at (4000,2000) width 800 wall w_mid
  window at (2000,0) width 1500 wall shell`);

describe("W_ENTRANCE_INTO_PRIVATE", () => {
  it("judges a home, declines a café under the default and judges it under residential-basic", () => {
    expect(codes(doorIntoWc("Living"))).toContain("W_ENTRANCE_INTO_PRIVATE");
    expect(codes(doorIntoWc("Cafe", "dining"))).not.toContain("W_ENTRANCE_INTO_PRIVATE");
    expect(skipsOf(lintCoverage(doorIntoWc("Cafe", "dining")), "privacy")).toContain("non-dwelling");
    expect(codes(doorIntoWc("Cafe", "dining"), "residential-basic")).toContain("W_ENTRANCE_INTO_PRIVATE");
  });
});

describe("the non-dwelling reason", () => {
  it("is appended after every reason before it, so the reason list stays append-only", () => {
    const reasons = Object.keys(SKIP_WHY);
    // PS2.12 appended `annotation-budget` after it, and PS5.2 `no-bed`.
    expect(reasons.slice(-3)).toEqual(["non-dwelling", "annotation-budget", "no-bed"]);
    expect(reasons).toContain("no-dwelling"); // PS2.14's reserved reason, still distinct
    expect(SKIP_WHY["non-dwelling"]).toBe("the plan reads as non-residential");
  });

  it("appears in `arch lint --json` coverage for the first-contact café and clinic", () => {
    const cli = (f: string) =>
      spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "lint", f, "--json"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    for (const f of ["4-cafe.arch", "6-clinic.arch"]) {
      const r = cli(`docs/plans/plan-soundness/audits/first-contact-plans/${f}`);
      const out = JSON.parse(r.stdout) as { coverage: LintCoverage };
      expect(skipsOf(out.coverage, "privacy"), f).toContain("non-dwelling");
      // The diagnostics never carry it: lint messages name no reason id.
      expect(r.stdout.split('"coverage"')[0], f).not.toContain("non-dwelling");
    }
    const house = JSON.parse(cli("docs/plans/plan-soundness/audits/first-contact-plans/2-house.arch").stdout) as {
      coverage: LintCoverage;
    };
    expect(JSON.stringify(house.coverage)).not.toContain("non-dwelling");
  });
});

/** WC | Cafe seating | Servery, with the only door from outside opening into the WC. */
const cafeEnteredThroughWc = PLAN(`  wall id=shell exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall id=p1 partition thickness 100 { (2000,0) (2000,4000) }
  wall id=p2 partition thickness 100 { (6000,0) (6000,4000) }
  room id=r_wc at (0,0) size 2000x4000 label "WC" uses wc
  room id=r_seat at (2000,0) size 4000x4000 label "Cafe seating" uses dining
  room id=r_serv at (6000,0) size 3000x4000 label "Servery" uses kitchen
  door id=d_entry at (1000,4000) width 1000 wall shell
  door id=d_wc at (2000,2000) width 900 wall p1
  door id=d_serv at (6000,2000) width 900 wall p2
  window at (4000,0) width 2000 wall shell
  window at (7500,0) width 1500 wall shell`);

describe("a non-residential front door into a private room is still one warning (red team round 1)", () => {
  const count = (src: string, code: string, profile?: string): number =>
    lint(src, profile ? { profile } : {}).filter((d) => d.code === code).length;

  it("the default reports the rooms behind the WC, since the entrance rule declines", () => {
    expect(count(cafeEnteredThroughWc, "W_ENTRANCE_INTO_PRIVATE")).toBe(0);
    expect(count(cafeEnteredThroughWc, "W_ROOM_VIA_PRIVATE")).toBe(2);
  });

  it("residential-basic reports the door itself, and not the rooms behind it", () => {
    expect(count(cafeEnteredThroughWc, "W_ENTRANCE_INTO_PRIVATE", "residential-basic")).toBe(1);
    expect(count(cafeEnteredThroughWc, "W_ROOM_VIA_PRIVATE", "residential-basic")).toBe(0);
  });
});

describe("finish's stricter profiles", () => {
  it("leave out a profile whose only key is assumeDwelling", () => {
    expect(STRICTER_PROFILES).not.toContain("residential-basic");
    expect(STRICTER_PROFILES).toContain("accessibility-advisory");
  });

  it("keep a profile with a threshold override, alone or beside assumeDwelling", () => {
    expect(
      stricterProfileNames({
        a: { assumeDwelling: true },
        b: { minDoorWidthMm: 800 },
        c: { assumeDwelling: true, minRoomAreaM2: 5 },
        d: {},
      }),
    ).toEqual(["b", "c"]);
  });
});
