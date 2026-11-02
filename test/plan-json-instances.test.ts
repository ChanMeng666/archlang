/**
 * PS3.9 — Plan JSON for a component that derives its walls.
 *
 * A storey on which a `place`d instance derives its walls (`walls from rooms`) carries
 * `components` (each body as one instance resolved it, in LOCAL names and coordinates) and
 * `instances` (the `place` frames), and marks every flattened instance row with `instance`.
 * `planJsonToArch` prints a `component` per body and a `place` per instance, and skips the
 * marked rows. Every other payload is unchanged (the gate), so a placed plan without the
 * statement still projects flattened and still does not round-trip (`E_DOTTED_DECL`, pinned in
 * test/plan-json.test.ts).
 *
 * The law: for a plan whose `place`s follow its root statements, JSON → arch compiles to the
 * same SVG and `describe()`, the same `lint()` but for the spans the printed source moved, and
 * JSON → arch → JSON is stable. A plan that places first round-trips to the grouped order: the
 * limit is pinned below, not hidden.
 */
import { describe as suite, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { compile, describe, lint, makeVirtualWorld } from "../src/index.js";
import {
  PLAN_JSON_SCHEMA,
  planFromJson,
  planJsonToArch,
  planToJson,
  resolvedToJson,
  type PlanJson,
} from "../src/plan-json.js";
import { resolvePlan } from "../src/analyze.js";
import { NULL_WORLD } from "../src/world.js";
import { planJsonArtifact } from "../src/cli/serialize.js";

const UNIT = `  component unit() {
    room id=liv at (0,0) size 5000x4000 label "Living" uses living
    room id=kit at (5000,0) size 3000x4000 label "Kitchen" uses kitchen
    room id=bed at (0,4000) size 5000x3000 label "Bed" uses bedroom
    walls from rooms exterior 200 partition 100 { open between liv and kit }
    door id=d between liv and bed at 800 from start width 900 swing in
    door id=f on bed.bottom at 1000 from start width 900 swing inward
    furniture id=tv tv_unit against liv.top offset 2000
    furniture id=sofa sofa at (1400,2600) size 2200x900 facing tv
  }
`;
const ROOT = `  room id=lobby at (0,8000) size 6000x2000 label "Lobby" uses hall
  wall id=lw exterior thickness 200 { (0,8000) (6000,8000) (6000,10000) (0,10000) close }
`;
const PLACES = `  place unit() as west at (0,0)
  place unit() as east at (20000,0) rotate 90 mirror x
`;
const plan = (body: string): string => `plan "Twin units" {\n  units mm\n${body}}\n`;
/** The law's form: root statements, then the component, then the `place`s. */
const TWINS = plan(ROOT + UNIT + PLACES);

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const noSpans = (src: string): unknown => lint(src).map(({ span: _s, fixes: _f, relatedSpans: _r, ...d }) => d);
const facts = (src: string) => ({
  svg: sha(compile(src).svg ?? ""),
  describe: sha(JSON.stringify(describe(src))),
  lint: noSpans(src),
});
const json = (src: string): PlanJson => {
  const r = planToJson(src);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return r.json!;
};
const arch = (j: unknown): string => {
  const r = planJsonToArch(j);
  expect(r.diagnostics).toEqual([]);
  return r.source!;
};

suite("PS3.9 — a placed component that derives its walls round-trips through Plan JSON", () => {
  it("compiles back to the same SVG, describe() and lint(), and JSON → arch → JSON is stable", () => {
    expect(compile(TWINS).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const payload = json(TWINS);
    const source = arch(payload);
    expect(facts(source)).toEqual(facts(TWINS));
    expect(json(source)).toEqual(payload);
    // what it printed: the root rows, one parameterless component, two places
    expect(source).toContain(
      "  component unit() {\n    walls from rooms exterior 200 partition 100 { open between liv and kit }\n",
    );
    expect(source).toContain(
      "  place unit() as west at (0,0)\n  place unit() as east at (20000,0) rotate 90 mirror x\n",
    );
    expect(source).not.toContain("west.");
    // planFromJson takes the same road
    expect(planFromJson(payload).diagnostics).toEqual([]);
  });

  it("carries the body's statements as written, in local names, and never its derived walls", () => {
    const { components, instances } = json(TWINS);
    expect(instances).toEqual([
      { name: "west", component: "unit", at: { x: 0, y: 0 } },
      {
        name: "east",
        component: "unit",
        at: { x: 20000, y: 0 },
        rotate: 90,
        mirror: "x",
      },
    ]);
    expect(components?.map((c) => c.name)).toEqual(["unit"]);
    const body = components![0]!.body;
    expect(body.rooms.map((r) => r.id)).toEqual(["liv", "kit", "bed"]);
    expect(body.walls).toEqual([]);
    expect(body.walls_from_rooms).toEqual({
      exterior: 200,
      partition: 100,
      open: [{ between: ["liv", "kit"] }],
    });
    // the derived opening is the clause, never a row
    expect(body.openings.map((o) => o.id)).toEqual(["d", "f"]);
    expect(body.openings[0]!.relation).toEqual({
      between: ["liv", "bed"],
      at: "800 from start",
    });
    expect(body.openings[1]!.relation).toEqual({
      edge: "bed.bottom",
      at: "1000 from start",
    });
    expect(body.openings[1]!.swing_building).toBe("inward");
    expect(body.furniture.map((f) => [f.id, f.against_edge, f.facing])).toEqual([
      ["tv", "liv.top", undefined],
      ["sofa", undefined, "tv"],
    ]);
    // a body is local: no row of it names an instance or carries a frame's reflection
    for (const rows of [body.rooms, body.openings, body.furniture])
      for (const r of rows as unknown as Array<Record<string, unknown>>) {
        expect(r.instance).toBeUndefined();
        expect(r.mirror).toBeUndefined();
      }
  });

  it("keeps the flattened rows for a geometry reader: the ungated projection's rows, plus `instance`", () => {
    const payload = json(TWINS);
    const ungated = resolvedToJson(resolvePlan(TWINS).ir!);
    const unmark = (rows: unknown[] | undefined) =>
      (rows ?? []).map((r) => {
        const { instance: _i, ...rest } = r as Record<string, unknown>;
        return rest;
      });
    for (const key of ["rooms", "walls", "openings", "furniture"] as const)
      expect(unmark(payload[key])).toEqual(ungated[key]);
    expect(payload.edges).toEqual(ungated.edges);
    expect(payload.input_graph).toEqual(ungated.input_graph);
    // only the instance rows are marked, each by its own instance
    expect(payload.rooms.map((r) => [r.id, r.instance])).toEqual([
      ["lobby", undefined],
      ["west.liv", "west"],
      ["west.kit", "west"],
      ["west.bed", "west"],
      ["east.liv", "east"],
      ["east.kit", "east"],
      ["east.bed", "east"],
    ]);
    expect(payload.walls.map((w) => [w.id, w.instance])).toEqual([["lw", undefined]]);
    // a reflected instance's flattened rows keep `mirror: true`; skipped on input, never refused
    expect(payload.furniture.filter((f) => f.instance === "east").every((f) => f.mirror === true)).toBe(true);
  });

  it("prints an arg-taking component parameterless: the body is the resolved instance", () => {
    const src = plan(
      ROOT +
        '  component box(w) {\n    room id=a at (0,0) size w x 3000 label "A" uses living\n    room id=b at (w,0) size 3000x3000 label "B" uses kitchen\n    walls from rooms exterior 200 partition 100\n  }\n' +
        "  place box(4000) as p at (10000,0)\n  place box(4000) as q at (20000,0) mirror y\n",
    );
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const source = arch(json(src));
    expect(source).toContain(
      "  component box() {\n    walls from rooms exterior 200 partition 100\n    room id=a at (0,0) size 4000x3000",
    );
    expect(facts(source)).toEqual(facts(src));
  });

  it("LIMIT: a plan that places before its root statements comes back in the grouped order", () => {
    const early = plan(UNIT + PLACES + ROOT);
    const source = arch(json(early));
    // the round trip is the grouped form, byte for byte …
    expect(source).toBe(arch(json(TWINS)));
    expect(facts(source)).toEqual(facts(TWINS));
    // … which draws the rooms in another within-layer order than the plan that placed first
    expect(facts(early).svg).not.toBe(facts(TWINS).svg);
    expect(json(early).rooms.map((r) => r.id)[0]).toBe("west.liv");
    expect(json(source).rooms.map((r) => r.id)[0]).toBe("lobby");
  });
});

suite("PS3.9 — the schema declares every key the payload writes", () => {
  type S = { properties?: Record<string, S>; items?: S; $ref?: string };
  const root = PLAN_JSON_SCHEMA as unknown as S;
  const deref = (s: S): S => (s.$ref ? root.properties![s.$ref.replace("#/properties/", "")]! : s);
  const within = (value: unknown, schema: S, path: string): void => {
    const s = deref(schema);
    if (Array.isArray(value)) for (const [i, v] of value.entries()) within(v, s.items ?? {}, `${path}/${i}`);
    else if (value !== null && typeof value === "object" && s.properties)
      for (const [k, v] of Object.entries(value)) {
        expect(Object.keys(s.properties), `${path}/${k}`).toContain(k);
        within(v, s.properties[k]!, `${path}/${k}`);
      }
  };
  it("components, instances, bodies and the `instance` markers", () => {
    within(json(TWINS), root, "");
  });
});

suite("PS3.9 — the gate: every other payload is unchanged", () => {
  it("a placed plan whose components draw their walls carries no components, instances or markers", () => {
    const src = plan(
      '  component c() {\n    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n    room id=r at (0,0) size 4000x3000 label "Room"\n  }\n  place c() as a at (4000,0)\n',
    );
    const j = json(src);
    expect(j).toEqual(resolvedToJson(resolvePlan(src).ir!));
    expect("components" in j || "instances" in j).toBe(false);
    expect(j.rooms.every((r) => !("instance" in r))).toBe(true);
  });

  it("a root `walls from rooms` carries no components either", () => {
    const j = json(plan("  room id=a at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100\n"));
    expect("components" in j).toBe(false);
    expect(j.walls_from_rooms).toEqual({ exterior: 200, partition: 100 });
  });
});

suite("PS3.9 — E_JSON_DERIVED_IN_INSTANCE, narrowed to what the record cannot carry", () => {
  const refused = (src: string, world = NULL_WORLD) => {
    expect(compile(src, { world }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const r = planToJson(src, { world });
    expect(r.json).toBeUndefined();
    const d = r.diagnostics.filter((x) => x.code === "E_JSON_DERIVED_IN_INSTANCE");
    expect(d).toHaveLength(1);
    return d[0]!;
  };
  const DERIVES = "    room id=a at (0,0) size 4000x3000\n    walls from rooms exterior 200 partition 100\n";

  it("(a) a nested place: one level of instances", () => {
    const src = plan(
      `  component inner() {\n${DERIVES}  }\n  component outer() {\n    place inner() as i at (0,0)\n  }\n  place outer() as o at (0,0)\n`,
    );
    const d = refused(src);
    expect(d.message).toContain('"o.i"');
    expect(d.message).toContain('nests a `place` ("o.i")');
    expect(src.slice(d.span!.start, d.span!.end)).toBe("walls from rooms exterior 200 partition 100");
    // `compile -f json` reports it as a user-source error, not an internal failure
    const art = planJsonArtifact(src, NULL_WORLD, "all", [], []);
    expect(art.error).toBeUndefined();
    expect(art.diagnostics.map((x) => x.code)).toEqual(["E_JSON_DERIVED_IN_INSTANCE"]);
  });

  it("(b) two instances of one component that resolve to different bodies", () => {
    const src = plan(
      "  component box(w) {\n    room id=a at (0,0) size w x 3000\n    walls from rooms exterior 200 partition 100\n  }\n  place box(4000) as p at (0,0)\n  place box(5000) as q at (10000,0)\n",
    );
    expect(refused(src).message).toContain(
      'instances "p" and "q" of component "box" resolve to different bodies (different arguments), and Plan JSON carries one body per component',
    );
  });

  it("(c) a component that comes in through an import", () => {
    const world = makeVirtualWorld({
      "lib.arch": `plan "lib" {\n  units mm\n  component unit() {\n${DERIVES}  }\n}\n`,
    });
    const src = `plan "p" {\n  units mm\n  import "lib.arch": unit\n  place unit() as west at (0,0)\n}\n`;
    const d = refused(src, world);
    expect(d.message).toContain('component "unit" comes in through an `import`');
    expect(d.file).toBe("lib.arch");
  });
});

suite("PS3.9 — validating `components` and `instances` on input", () => {
  const payload = (): Record<string, unknown> => JSON.parse(JSON.stringify(json(TWINS))) as Record<string, unknown>;
  const codesAt = (j: unknown): string[] =>
    planJsonToArch(j).diagnostics.map((d) => `${d.code} ${d.message.replace(/^plan JSON (\S*):.*$/, "$1")}`);

  it("refuses each malformed record by its JSON path", () => {
    const p1 = payload();
    delete p1.instances;
    expect(codesAt(p1)).toContain("E_JSON_SCHEMA /components");
    const p2 = payload();
    (p2.instances as Array<Record<string, unknown>>)[0]!.component = "nope";
    expect(codesAt(p2)).toContain("E_JSON_SCHEMA /instances/0/component");
    const p3 = payload();
    (p3.instances as Array<Record<string, unknown>>)[1]!.name = "west";
    expect(codesAt(p3)).toContain("E_JSON_SCHEMA /instances/1/name");
    const p4 = payload();
    (p4.instances as Array<Record<string, unknown>>)[0]!.name = "o.i";
    expect(codesAt(p4)).toContain("E_JSON_SCHEMA /instances/0/name");
    const p5 = payload();
    (p5.instances as Array<Record<string, unknown>>)[0]!.rotate = 45;
    expect(codesAt(p5)).toContain("E_JSON_SCHEMA /instances/0/rotate");
    const p6 = payload();
    (p6.rooms as Array<Record<string, unknown>>)[1]!.instance = "north";
    expect(codesAt(p6)).toContain("E_JSON_SCHEMA /rooms/1/instance");
    const p7 = payload();
    const body = (
      p7.components as Array<{
        body: { rooms: Array<Record<string, unknown>> };
      }>
    )[0]!.body;
    body.rooms[0]!.instance = "west";
    expect(codesAt(p7)).toContain("E_JSON_SCHEMA /components/0/body/rooms/0/instance");
    const p8 = payload();
    (p8.components as Array<{ body: Record<string, unknown> }>)[0]!.body.walls_from_rooms = {
      exterior: 0,
      partition: 100,
    };
    expect(codesAt(p8)).toContain("E_JSON_SCHEMA /components/0/body/walls_from_rooms/exterior");
    // a marked row without any `instances` names nothing
    const p9 = payload();
    delete p9.components;
    delete p9.instances;
    expect(codesAt(p9)).toContain("E_JSON_SCHEMA /rooms/1/instance");
    // a body missing an array the schema requires
    const p10 = payload();
    delete (p10.components as Array<{ body: Record<string, unknown> }>)[0]!.body.furniture;
    expect(codesAt(p10)).toContain("E_JSON_SCHEMA /components/0/body/furniture");
    // names the lexer cannot read are refused with a path, never by the parser
    const p11 = payload();
    (p11.instances as Array<Record<string, unknown>>)[0]!.name = "west-wing";
    expect(codesAt(p11)).toContain("E_JSON_SCHEMA /instances/0/name");
    const p12 = payload();
    (p12.components as Array<Record<string, unknown>>)[0]!.name = "my-unit";
    expect(codesAt(p12)).toContain("E_JSON_SCHEMA /components/0/name");
  });

  it("refuses a root row marked by mistake: its id is not in the instance (S1)", () => {
    const p = payload();
    const rooms = p.rooms as Array<Record<string, unknown>>;
    expect(rooms[0]!.id).toBe("lobby");
    rooms[0]!.instance = "west";
    const r = planJsonToArch(p);
    expect(r.source).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_JSON_SCHEMA"]);
    expect(r.diagnostics[0]!.message).toContain("/rooms/0/instance");
    // every marked kind with an id is checked, not only rooms
    for (const key of ["walls", "openings", "furniture"] as const) {
      const q = payload();
      const row = (q[key] as Array<Record<string, unknown>>).find((x) => x.instance === undefined) ?? {
        ...(q[key] as Array<Record<string, unknown>>)[0],
        id: "root_one",
      };
      const list = q[key] as Array<Record<string, unknown>>;
      if (!list.includes(row)) list.push(row);
      row.instance = "east";
      expect(codesAt(q).some((c) => c.startsWith(`E_JSON_SCHEMA /${key}/`) && c.endsWith("/instance"))).toBe(true);
    }
  });

  it("ignores an edit to a flattened row: it is regenerated from its component", () => {
    const p = payload();
    const row = (p.rooms as Array<Record<string, unknown>>).find((r) => r.id === "west.liv")!;
    row.x = 99999;
    row.label = "Moved";
    expect(planJsonToArch(p).diagnostics).toEqual([]);
    expect(arch(p)).toBe(arch(json(TWINS)));
  });

  it("a body row's `mirror: true` prints as the piece's own clause", () => {
    const p = payload();
    const body = (
      p.components as Array<{
        body: { furniture: Array<Record<string, unknown>> };
      }>
    )[0]!.body;
    body.furniture[0]!.mirror = true;
    const back = planJsonToArch(p);
    expect(back.diagnostics.map((d) => d.code)).not.toContain("E_JSON_MIRROR");
    expect(back.source).toContain(" mirror");
  });

  it("still refuses the scripting keys it cannot carry", () => {
    for (const k of ["imports", "let", "for", "if", "component"])
      expect(codesAt({ ...payload(), [k]: [] })).toContain(`E_JSON_SCHEMA /${k}`);
  });
});
