/**
 * Tool-surface coverage for the MCP shim — every tool driven over the real
 * transport with a real `.arch` fixture.
 *
 * `test/server.test.ts` is the smoke test (registration, the handshake version, the
 * multi-storey `pages[]` pin). This file covers what each tool actually *returns*:
 * the params the shim adds on top of the library call (`profile`, `plan_json`,
 * `format`, `accessible`, `overlay`, `level`, `graph`) and the branchy handlers
 * (`fix`'s bounded fixpoint) that no other suite exercises.
 *
 * Read as a contract: these assertions are what an MCP host is entitled to see.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_JSON_SCHEMA, PNG_PREVIEW_WIDTH, planToJson } from "@chanmeng666/archlang";
import { PNG_MAX_WIDTH, PNG_MIN_WIDTH } from "../src/png.js";
import { decodePlanHash, PLAYGROUND_ORIGIN, planLinks } from "@chanmeng666/archlang/link";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { loadPlanLinks } from "../src/server.js";
import {
  call,
  CLEAN,
  codes,
  connect,
  FURNITURE_IN_WALL,
  NARROW_DOOR,
  NO_DOORS,
  payload,
  TINY,
  TWO_ROOMS,
  TWO_STOREY,
} from "./helpers.js";

/**
 * `compile`'s png cases need the core's optional renderer, installed with it in this repo. When
 * it is absent the image cases skip VISIBLY, and under CI that is a failure, not a skip; the
 * absent-renderer shape is pinned unconditionally in `png.test.ts`, with the renderer mocked out.
 */
const HAS_RESVG = await import("@resvg/resvg-js").then(
  () => true,
  () => false,
);

/** A shipped plan that renders thousands of pixels wide at native size. */
const STUDIO = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples/studio.arch"), "utf8");

type PngContent = { content: Array<{ type: string; data?: string; mimeType?: string; text?: string }> };
const pngCall = async (client: Awaited<ReturnType<typeof connect>>, args: Record<string, unknown>) =>
  (await client.callTool({ name: "compile", arguments: args })) as PngContent;

/** The pixel size a png declares in its IHDR chunk (width at bytes 16–19, height 20–23, big-endian). */
const ihdr = (res: PngContent): { width: number; height: number } => {
  const png = Buffer.from(res.content.find((c) => c.type === "image")!.data!, "base64");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

/** A plan eight times taller than wide, with no sheet. */
const TALL = 'plan "Tall" {\n  room at (0,0) size 1000x8000 label "Gallery"\n}\n';

// ---------------------------------------------------------------------------
// lint
// ---------------------------------------------------------------------------

describe("lint tool", () => {
  it("returns no diagnostics for a sound plan", async () => {
    const out = await call(await connect(), "lint", { source: CLEAN });
    expect(out.ok).toBe(true);
    expect(out.diagnostics).toEqual([]);
  });

  it("surfaces a known W_* warning with its span projected to line/col", async () => {
    const out = await call(await connect(), "lint", { source: TINY });
    expect(codes(out)).toContain("W_ROOM_DISCONNECTED");
    const first = (out.diagnostics as Array<Record<string, unknown>>)[0]!;
    expect(first.severity).toBe("warning");
    // diagnosticToJson's projection is the whole point of the shim's `toJson` —
    // a host gets line/col, not a raw byte span it would have to resolve itself.
    expect(typeof first.line).toBe("number");
    expect(typeof first.col).toBe("number");
  });

  it("`profile` selects a stricter ruleset — the same source, more warnings", async () => {
    const client = await connect();
    // 800 mm clears the default 700 mm floor but not the accessibility profile's 850.
    expect(await call(client, "lint", { source: NARROW_DOOR }).then(codes)).toEqual([]);
    const strict = codes(await call(client, "lint", { source: NARROW_DOOR, profile: "accessibility-advisory" }));
    expect(strict).toContain("W_DOOR_CLEARANCE");
    expect(strict.length).toBeGreaterThan(0);
  });

  it("an unknown profile falls back to the default ruleset rather than failing", async () => {
    const out = await call(await connect(), "lint", { source: NARROW_DOOR, profile: "no-such-profile" });
    expect(out.ok).toBe(true);
    expect(codes(out)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// suggest
// ---------------------------------------------------------------------------

describe("suggest tool", () => {
  it("returns ready-to-paste statements as DATA for a plan with no openings", async () => {
    const out = await call(await connect(), "suggest", { source: NO_DOORS });
    expect(out.ok).toBe(true);
    const suggestions = out.suggestions as Array<{
      problem: string;
      code: string;
      roomId?: string;
      candidates: Array<{ insertText: string; rationale: string }>;
    }>;
    expect(suggestions.map((s) => s.code)).toEqual(expect.arrayContaining(["W_NO_ENTRANCE", "W_BEDROOM_NO_WINDOW"]));
    for (const s of suggestions) {
      expect(s.candidates.length).toBeGreaterThan(0);
      for (const c of s.candidates) {
        // Advisory, never applied (ADR 0005): each candidate is source text plus a reason.
        expect(c.insertText).toMatch(/^(door|window|opening) on /);
        expect(c.rationale.length).toBeGreaterThan(0);
      }
    }
    // The suggestions are advisory only — the source is not rewritten for us.
    expect(out.source).toBeUndefined();
  });

  it("returns an empty list for a plan with nothing to suggest", async () => {
    const out = await call(await connect(), "suggest", { source: CLEAN });
    expect(out.suggestions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------

describe("complete tool", () => {
  it("returns scoped items at an offset inside a plan body", async () => {
    const out = await call(await connect(), "complete", { source: CLEAN, at: CLEAN.indexOf("room id=r1") });
    expect(out.ok).toBe(true);
    const items = out.items as Array<{ label: string; kind: string }>;
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(typeof i.label).toBe("string");
    expect(items.map((i) => i.label)).toContain("room");
  });

  it("a degenerate offset past the end of the source still answers structurally", async () => {
    const client = await connect();
    for (const at of [0, CLEAN.length, CLEAN.length + 100_000]) {
      const out = await call(client, "complete", { source: CLEAN, at });
      expect(out.ok).toBe(true);
      expect(Array.isArray(out.items)).toBe(true);
    }
  });

  it("completes against an unparseable source without throwing", async () => {
    const out = await call(await connect(), "complete", { source: 'plan "X" { room at (', at: 20 });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// repair
// ---------------------------------------------------------------------------

describe("repair tool", () => {
  it("pushes furniture out of a wall and reports the change log + new source", async () => {
    const out = await call(await connect(), "repair", { source: FURNITURE_IN_WALL });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    const changes = out.changes as Array<{ id: string; kind: string; from: unknown; to: unknown; reason: string }>;
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]!.kind).toBe("moved");
    expect(changes[0]!.reason).toMatch(/wall/);
    // The corrected source is returned, never applied for us — and it clears the fault.
    const repaired = out.source as string;
    expect(repaired).not.toBe(FURNITURE_IN_WALL);
    const after = await call(await connect(), "lint", { source: repaired });
    expect(codes(after)).not.toContain("W_FURNITURE_WALL_COLLISION");
    expect(out.unresolved).toEqual([]);
  });

  it("leaves a sound plan untouched (`changed:false`, byte-identical source)", async () => {
    const out = await call(await connect(), "repair", { source: CLEAN });
    expect(out.changed).toBe(false);
    expect(out.source).toBe(CLEAN);
    expect(out.changes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// finish
// ---------------------------------------------------------------------------

describe("finish tool", () => {
  it("adds the sheet statements the plan lacks and returns the change log + new source", async () => {
    const out = await call(await connect(), "finish", { source: CLEAN });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    const changes = out.changes as Array<{ stage: string; kind: string; statement: string; text: string }>;
    expect(changes.every((c) => c.kind === "added")).toBe(true);
    expect(changes.map((c) => c.statement)).toContain("paper");
    const finished = out.source as string;
    expect(finished).toContain("paper A");
    // The result is returned, never applied for us — and it is a clean, fitted sheet.
    const after = await call(await connect(), "validate", { source: finished });
    expect(after.ok).toBe(true);
    expect(codes(after)).not.toContain("W_SCALE_OVERFLOW");
    expect(codes(after)).not.toContain("W_DRAWING_OVERFLOW");
  });

  it("is a fixpoint: finishing the result changes nothing (`changed:false`, byte-identical)", async () => {
    const client = await connect();
    const once = (await call(client, "finish", { source: CLEAN })).source as string;
    const twice = await call(client, "finish", { source: once });
    expect(twice.changed).toBe(false);
    expect(twice.source).toBe(once);
    expect(twice.changes).toEqual([]);
  });

  it("`reissue` replaces a paper the drawing does not fit; without it the sheet is kept", async () => {
    const client = await connect();
    const tight = CLEAN.replace("{\n", "{\n  paper A4\n  scale 1:5\n");
    expect(tight).not.toBe(CLEAN);
    const kept = await call(client, "finish", { source: tight, only: "sheet" });
    expect(kept.changed).toBe(false);
    expect(kept.source).toBe(tight);
    expect((kept.unresolved as Array<{ reason: string }>).length).toBeGreaterThan(0);
    const reissued = await call(client, "finish", { source: tight, reissue: true });
    expect(reissued.changed).toBe(true);
    expect((reissued.changes as Array<{ kind: string }>).some((c) => c.kind === "replaced")).toBe(true);
  });

  it("`only` runs one stage: `furnish` writes furniture and no sheet statement, `sheet` the reverse", async () => {
    const client = await connect();
    const empty = `plan "Empty" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (4200,0) (4200,3600) (0,3600) close }
  room id=r at (0,0) size 4200x3600 label "Bedroom" uses bedroom
  door id=d on w at 85% width 900 swing in
}
`;
    const furnished = await call(client, "finish", { source: empty, only: "furnish" });
    const fc = furnished.changes as Array<{ stage: string; statement: string; room?: string }>;
    expect(furnished.changed).toBe(true);
    expect(fc.every((c) => c.stage === "furnish" && c.statement === "furniture" && c.room === "r")).toBe(true);
    expect(furnished.source as string).toContain("furniture bed in r anchor");
    expect(furnished.source as string).not.toContain("paper");
    const sheeted = await call(client, "finish", { source: empty, only: "sheet" });
    expect((sheeted.changes as Array<{ stage: string }>).every((c) => c.stage === "sheet")).toBe(true);
    expect(sheeted.source as string).not.toContain("furniture");
    const both = await call(client, "finish", { source: empty });
    const stages = (both.changes as Array<{ stage: string }>).map((c) => c.stage);
    expect(stages.lastIndexOf("furnish")).toBeLessThan(stages.indexOf("sheet"));
    expect(stages).toContain("furnish");
    const bad = await client.callTool({ name: "finish", arguments: { source: empty, only: "roof" } });
    expect(bad.isError).toBe(true);
  });

  it("names a room left empty for its use, with `ok:true` and `changed:false`", async () => {
    const hall = `plan "Hall" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (4200,0) (4200,3600) (0,3600) close }
  room id=r at (0,0) size 4200x3600 label "Hall" uses hall
  door id=d on w at 85% width 900 swing in
}
`;
    const out = await call(await connect(), "finish", { source: hall, only: "furnish" });
    expect(out).toMatchObject({ ok: true, changed: false, changes: [], source: hall });
    const notes = out.unresolved as Array<{ room?: string; reason: string; scope?: string }>;
    expect(notes.map((u) => u.room)).toEqual(["r"]);
    expect(notes[0]!.scope).toBe("outside-table");
    expect(notes[0]!.reason).toContain("its use `hall` has no row");
  });

  it("a plan that does not compile comes back untouched with `ok:false`", async () => {
    const broken = 'plan "X" {\n  room at (0,0) size\n}\n';
    const out = await call(await connect(), "finish", { source: broken });
    expect(out.ok).toBe(false);
    expect(out.changed).toBe(false);
    expect(out.source).toBe(broken);
  });
});

// ---------------------------------------------------------------------------
// fix — all four branches of the bounded fixpoint
// ---------------------------------------------------------------------------

/** A door declared 1200 mm clear of the shell: one unambiguous nearest wall, so the
 *  off-wall fix is `machine-applicable` and the fixpoint converges on it. */
const OFF_WALL = `plan "Off" {
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (2000,5200) width 900 hinge left swing in
}
`;

/** A door equidistant from two parallel partitions: `nearestWall` ties, so the fix
 *  downgrades to `maybe-incorrect` — applied only on the `unsafe` path. */
const AMBIGUOUS = `plan "Tie" {
  wall id=wa partition thickness 100 { (0,0) (4000,0) }
  wall id=wb partition thickness 100 { (0,2000) (4000,2000) }
  room id=r1 at (0,0) size 4000x2000 label "Living" uses living
  door id=d1 at (2000,1000) width 900 hinge left swing in
}
`;

/** A zero-width door: its only fix is `has-placeholders` (`width <positive-number>`),
 *  a tier `applyFixes` NEVER applies — so the fixpoint has nothing to do. */
const PLACEHOLDER_ONLY = `plan "Ph" {
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (2000,4000) width 0 wall exterior hinge left swing in
}
`;

/**
 * The ROLLBACK fixture. The wall nearest the off-wall door is explicitly `id=exterior`,
 * which collides with the `exterior` *category* of the second wall — so the off-wall
 * fix's `on exterior at …` rewrite resolves to TWO walls and raises `E_ATTACH_WALL_REF`.
 * Applying a machine-applicable fix therefore takes the plan from 0 errors to 1, which
 * is exactly the `errAfter > errBefore` guard the handler exists to enforce.
 */
const ROLLBACK = `plan "Roll" {
  wall id=exterior exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  wall exterior thickness 200 { (8000,0) (12000,0) }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (2000,5200) width 900 hinge left swing in
}
`;

describe("fix tool (bounded fixpoint)", () => {
  it("(i) converges on machine-applicable fixes and re-validates clean", async () => {
    const client = await connect();
    expect(codes(await call(client, "compile", { source: OFF_WALL }))).toContain("W_DOOR_OFF_WALL");

    const out = await call(client, "fix", { source: OFF_WALL });
    expect(out.ok).toBe(true);
    expect(out.passes).toBe(1);
    const applied = out.applied as Array<{ code?: string; title: string; applicability: string }>;
    expect(applied).toHaveLength(1);
    expect(applied[0]!.code).toBe("W_DOOR_OFF_WALL");
    expect(applied[0]!.applicability).toBe("machine-applicable");
    // The rewrite is the attachment form, and the warning it fixed is gone.
    const fixed = out.source as string;
    expect(fixed).toContain("on exterior_1 at ");
    expect(codes(await call(client, "compile", { source: fixed }))).not.toContain("W_DOOR_OFF_WALL");
    // Idempotent: a second pass over the output finds nothing left to do.
    const again = await call(client, "fix", { source: fixed });
    expect(again.passes).toBe(0);
    expect(again.source).toBe(fixed);
  });

  it("(ii) reports a structured no-op when nothing is machine-applicable", async () => {
    const client = await connect();
    // A sound plan: no fix-bearing diagnostics at all.
    const clean = await call(client, "fix", { source: CLEAN });
    expect(clean).toMatchObject({ ok: true, passes: 0, applied: [], skipped: [], source: CLEAN });

    // A plan whose ONLY fix is `has-placeholders` — offered, never applied.
    const placeholder = await call(client, "fix", { source: PLACEHOLDER_ONLY });
    expect(placeholder.ok).toBe(false); // E_DOOR_WIDTH survives, honestly reported
    expect(placeholder.passes).toBe(0);
    expect(placeholder.applied).toEqual([]);
    expect(placeholder.source).toBe(PLACEHOLDER_ONLY);
  });

  it("(iii) `unsafe` widens the gate to the maybe-incorrect tier", async () => {
    const client = await connect();
    const safe = await call(client, "fix", { source: AMBIGUOUS });
    expect(safe.passes).toBe(0);
    expect(safe.applied).toEqual([]);
    expect(safe.source).toBe(AMBIGUOUS);

    const unsafe = await call(client, "fix", { source: AMBIGUOUS, unsafe: true });
    expect(unsafe.passes).toBe(1);
    const applied = unsafe.applied as Array<{ applicability: string }>;
    expect(applied).toHaveLength(1);
    expect(applied[0]!.applicability).toBe("maybe-incorrect");
    expect(unsafe.source).not.toBe(AMBIGUOUS);
    expect(unsafe.source as string).toContain("on wa at 50%");
  });

  it("(iv) rolls back a pass that would RAISE the error count", async () => {
    const client = await connect();
    // Precondition: the plan has a machine-applicable fix and zero errors…
    const before = await call(client, "compile", { source: ROLLBACK });
    expect(before.ok).toBe(true);
    const diags = before.diagnostics as Array<{ code?: string; severity: string; fix?: unknown }>;
    expect(diags.some((d) => d.code === "W_DOOR_OFF_WALL")).toBe(true);
    expect(diags.every((d) => d.severity !== "error")).toBe(true);

    // …and applying it would introduce one, so the guard reverts the whole pass.
    const out = await call(client, "fix", { source: ROLLBACK });
    expect(out.passes).toBe(0);
    expect(out.applied).toEqual([]);
    expect(out.source).toBe(ROLLBACK); // byte-identical: nothing was written
    expect(out.ok).toBe(true); // the UNCHANGED source is still error-free

    // Proof the guard is what saved us: applying that same fix by hand errors.
    const wouldBe = ROLLBACK.replace(
      "door id=d1 at (2000,5200) width 900 hinge left swing in",
      "door id=d1 on exterior at 66.667% width 900 hinge left swing in",
    );
    const broken = await call(client, "compile", { source: wouldBe });
    expect(broken.ok).toBe(false);
    expect(codes(broken)).toContain("E_ATTACH_WALL_REF");
  });
});

// ---------------------------------------------------------------------------
// compile — the shim's own input/output shaping
// ---------------------------------------------------------------------------

describe("compile tool", () => {
  it("accepts `plan_json` instead of `source`", async () => {
    const out = await call(await connect(), "compile", {
      plan_json: {
        plan: "FromJson",
        rooms: [{ id: "r1", x: 0, y: 0, width: 4000, height: 3000, label: "Living" }],
        walls: [],
        openings: [],
        furniture: [],
      },
    });
    expect(out.ok).toBe(true);
    expect(out.output as string).toContain("<svg");
    expect(out.output as string).toContain("Living");
  });

  it("returns Plan-JSON schema errors as diagnostics, never a throw", async () => {
    const out = await call(await connect(), "compile", {
      plan_json: { plan: "Bad", rooms: [{ x: 0, y: 0 }], walls: [], openings: [], furniture: [] },
    });
    expect(out.ok).toBe(false);
    expect(codes(out)).toContain("E_JSON_SCHEMA");
    expect(out.output).toBeUndefined();
  });

  it('format:"txt" renders the zero-dependency ASCII plan, not SVG', async () => {
    const out = await call(await connect(), "compile", { source: TWO_ROOMS, format: "txt" });
    expect(out.ok).toBe(true);
    expect(out.format).toBe("txt");
    const text = out.output as string;
    expect(text).not.toContain("<svg");
    expect(text).toContain("\n");
    // The box-drawing characters are the ASCII backend's signature.
    expect(text).toMatch(/[┼─│]/);
  });

  it("accessible:true adds <title>/role=img and leaves the default byte-identical", async () => {
    const client = await connect();
    const plain = await call(client, "compile", { source: TWO_ROOMS });
    const acc = await call(client, "compile", { source: TWO_ROOMS, accessible: true });
    expect(acc.output as string).toContain("<title");
    expect(acc.output as string).toContain('role="img"');
    // ADR 0009's derived-accessibility law: the DEFAULT output must not shift.
    expect(plain.output as string).not.toContain('role="img"');
    const again = await call(client, "compile", { source: TWO_ROOMS });
    expect(again.output).toBe(plain.output);
  });

  it("overlay:'circulation' draws an opt-in overlay and leaves the default alone", async () => {
    const client = await connect();
    const plain = (await call(client, "compile", { source: TWO_ROOMS })).output as string;
    const overlaid = (await call(client, "compile", { source: TWO_ROOMS, overlay: "circulation" })).output as string;
    expect(overlaid).not.toBe(plain);
    expect(overlaid.length).toBeGreaterThan(plain.length);
    expect(overlaid).toContain("<svg");
  });

  it("a multi-storey plan renders every storey in `pages[]` in the chosen format", async () => {
    // The `pages[]`/`level` contract is pinned in server.test.ts for SVG; this covers
    // the interaction the shim adds — `format` applies to every page, not just `output`.
    const out = await call(await connect(), "compile", { source: TWO_STOREY, format: "txt" });
    const pages = out.pages as Array<{ level: number; name?: string; output: string }>;
    expect(pages).toHaveLength(2);
    for (const p of pages) expect(p.output).not.toContain("<svg");
    expect(out.output).toBe(pages[0]!.output);
  });

  it("`level` selects one storey in the chosen format and reports the real level set", async () => {
    const out = await call(await connect(), "compile", { source: TWO_STOREY, format: "txt", level: 2 });
    expect(out.ok).toBe(true);
    expect(out.level).toBe(2);
    expect(out.levels).toEqual([1, 2]);
    expect(out.output as string).not.toContain("<svg");
  });

  it('format:"json" returns the Plan JSON as an object, named by the schema id and version', async () => {
    const client = await connect();
    const out = await call(client, "compile", { source: TWO_ROOMS, format: "json" });
    expect(out.ok).toBe(true);
    expect(out.format).toBe("json");
    expect(out.schema).toBe(PLAN_JSON_SCHEMA.$id);
    const plan = out.output as Record<string, unknown>;
    expect(typeof plan).toBe("object");
    expect(plan.version).toBe(PLAN_JSON_SCHEMA.properties.version.const);
    expect(plan).toEqual(planToJson(TWO_ROOMS).json);
    // It is the object `plan_json` takes: passed back, it compiles to the same drawing.
    const back = await call(client, "compile", { plan_json: plan });
    const direct = await call(client, "compile", { source: TWO_ROOMS });
    expect(back.ok).toBe(true);
    expect(back.output).toBe(direct.output);
  });

  it('format:"json" reports what Plan JSON leaves out as `dropped`, absent when nothing was (#366)', async () => {
    const client = await connect();
    const ARC = `plan "arc round trip" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) arc (0,4000) radius 4000 cw (0,0) close }
}`;
    const want = planToJson(ARC).dropped;
    expect(want?.length).toBeGreaterThan(0);
    const out = await call(client, "compile", { source: ARC, format: "json" });
    expect(out.ok).toBe(true);
    expect(out.dropped).toEqual(want);
    expect(out.output).toEqual(planToJson(ARC).json);
    const control = await call(client, "compile", { source: TWO_ROOMS, format: "json" });
    expect("dropped" in control).toBe(false);
    const svg = await call(client, "compile", { source: ARC });
    expect("dropped" in svg).toBe(false);
  });

  it('format:"json" projects every storey into `pages[]`, and `level` picks one', async () => {
    const client = await connect();
    const { pages: want } = planToJson(TWO_STOREY);
    const all = await call(client, "compile", { source: TWO_STOREY, format: "json" });
    const pages = all.pages as Array<{ level: number; output: unknown }>;
    expect(pages.map((p) => p.level)).toEqual([1, 2]);
    expect(pages.map((p) => p.output)).toEqual(want?.map((p) => p.json));
    expect(all.output).toEqual(pages[0]!.output);
    const two = await call(client, "compile", { source: TWO_STOREY, format: "json", level: 2 });
    expect(two.level).toBe(2);
    expect(two.output).toEqual(want?.[1]?.json);
  });

  it.runIf(HAS_RESVG)('format:"png" returns the usual result as text first, then MCP image content', async () => {
    const res = await pngCall(await connect(), { source: TWO_ROOMS, format: "png" });
    expect(res.content.map((c) => c.type)).toEqual(["text", "image"]);
    const image = res.content[1]!;
    expect(image.mimeType).toBe("image/png");
    const bytes = Buffer.from(image.data!, "base64");
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // A client that reads `content[0].text` (as the bundle prover does) gets the JSON result.
    expect(JSON.parse(res.content[0]!.text!)).toMatchObject({ ok: true, format: "png", bytes: bytes.length });
  });
  it.runIf(HAS_RESVG)('format:"png" draws one storey: the lowest, or `level`, and names the set', async () => {
    const client = await connect();
    const low = await pngCall(client, { source: TWO_STOREY, format: "png" });
    const two = await pngCall(client, { source: TWO_STOREY, format: "png", level: 2 });
    expect(payload(low).levels).toEqual([1, 2]);
    expect(payload(two)).toMatchObject({ ok: true, level: 2, levels: [1, 2] });
    expect(low.content[1]!.data).not.toBe(two.content[1]!.data);
  });
  it.runIf(HAS_RESVG)("studio renders at exactly the preview width, not its native thousands of pixels", async () => {
    // examples/studio.arch renders 9648 px wide natively: over a vision model's per-side
    // limit and, at ~4.5 MB of base64, over typical host result caps.
    const res = await pngCall(await connect(), { source: STUDIO, format: "png" });
    expect(ihdr(res).width).toBe(PNG_PREVIEW_WIDTH);
    // The reported size is the image's own.
    expect({ width: payload(res).width, height: payload(res).height }).toEqual(ihdr(res));
  });
  it.runIf(HAS_RESVG)("`width` sets the png width exactly, clamped to the allowed range", async () => {
    const client = await connect();
    const small = await pngCall(client, { source: STUDIO, format: "png", width: 10 });
    expect(ihdr(small).width).toBe(PNG_MIN_WIDTH);
    expect(payload(small).width).toBe(PNG_MIN_WIDTH);
    const mid = await pngCall(client, { source: STUDIO, format: "png", width: 1000 });
    expect(ihdr(mid).width).toBe(1000);
    // Studio is a little taller than wide, so at the top of the range its HEIGHT is the side the
    // bound holds: at it to the pixel, with the width narrowed to match.
    const big = await pngCall(client, { source: STUDIO, format: "png", width: 100_000 });
    const { width, height } = ihdr(big);
    expect(height).toBeGreaterThan(width);
    expect(height).toBeLessThanOrEqual(PNG_MAX_WIDTH);
    expect(height).toBeGreaterThanOrEqual(PNG_MAX_WIDTH - 1);
    expect({ width: payload(big).width, height: payload(big).height }).toEqual({ width, height });
  });
  it.runIf(HAS_RESVG)("a tall plan is bounded on its LONG side, at the default and at the maximum", async () => {
    const client = await connect();
    for (const args of [{}, { width: PNG_MAX_WIDTH }]) {
      const { width, height } = ihdr(await pngCall(client, { source: TALL, format: "png", ...args }));
      const at = JSON.stringify(args);
      expect(height, at).toBeGreaterThan(2 * width);
      expect(height, at).toBeLessThanOrEqual(PNG_MAX_WIDTH);
      expect(height, at).toBeGreaterThanOrEqual(PNG_MAX_WIDTH - 1);
    }
  });
  it("`width` with any format but png is refused as data, not ignored", async () => {
    const client = await connect();
    for (const format of ["svg", "txt", "json"]) {
      const out = await call(client, "compile", { source: TWO_ROOMS, format, width: 800 });
      expect(out, format).toMatchObject({ ok: false, format });
      expect(out.error as string).toContain('width applies only to format "png"');
      expect(out.output).toBeUndefined();
    }
  });
  it.runIf(!HAS_RESVG)("[renderer absent] png is refused as data: the CI install must have it", async () => {
    expect(process.env.CI, "@resvg/resvg-js is missing under CI").toBeFalsy();
    const out = await call(await connect(), "compile", { source: TWO_ROOMS, format: "png" });
    expect(out).toMatchObject({ ok: false, format: "png", code: "E_PNG_DEPENDENCY" });
  });
});

// ---------------------------------------------------------------------------
// validate — the `graph` projection
// ---------------------------------------------------------------------------

describe("validate tool", () => {
  it("`graph` passes when the intended adjacency matches the interior doors", async () => {
    const out = await call(await connect(), "validate", { source: TWO_ROOMS, graph: { a: ["b"], b: ["a"] } });
    expect(out.ok).toBe(true);
    expect(out.graph).toEqual({
      ok: true,
      missing_rooms: [],
      missing_connections: [],
      extra_connections: [],
    });
  });

  it("`graph` names rooms the plan does not have and fails the gate", async () => {
    const out = await call(await connect(), "validate", { source: TWO_ROOMS, graph: { a: ["b", "c"], z: [] } });
    expect(out.ok).toBe(false);
    const graph = out.graph as { ok: boolean; missing_rooms: string[] };
    expect(graph.ok).toBe(false);
    expect(graph.missing_rooms.sort()).toEqual(["c", "z"]);
  });

  it("`graph` reports a door the intended graph does not ask for", async () => {
    const out = await call(await connect(), "validate", { source: TWO_ROOMS, graph: { a: [], b: [] } });
    expect(out.ok).toBe(false);
    const graph = out.graph as { ok: boolean; extra_connections: unknown[] };
    expect(graph.ok).toBe(false);
    expect(graph.extra_connections.length).toBeGreaterThan(0);
  });

  it("a graph failure fails validate even though no diagnostic did", async () => {
    const client = await connect();
    const plain = await call(client, "validate", { source: TWO_ROOMS });
    expect(plain.ok).toBe(true);
    expect(plain.graph).toBeUndefined(); // absent unless asked for

    const gated = await call(client, "validate", { source: TWO_ROOMS, graph: { a: [], b: [] } });
    // Same diagnostics, different verdict: `ok` folds in the graph check.
    expect(gated.diagnostics).toEqual(plain.diagnostics);
    expect(gated.ok).toBe(false);
  });

  it("strict:true makes an advisory warning fail the gate", async () => {
    const client = await connect();
    expect((await call(client, "validate", { source: TINY })).ok).toBe(true);
    const strict = await call(client, "validate", { source: TINY, strict: true });
    expect(strict.ok).toBe(false);
    expect(strict.strict).toBe(true);
    expect(codes(strict)).toContain("W_ROOM_DISCONNECTED");
  });
});

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

/** The `#z=` payload of a minted URL. */
const payloadOf = (url: unknown): string => new URL(url as string).hash.slice("#z=".length);

describe("link tool", () => {
  it("returns the playground and embed URLs, both carrying the plan in the fragment", async () => {
    const client = await connect();
    const out = await call(client, "link", { source: CLEAN });
    expect(Object.keys(out)).toEqual(["ok", "playground", "embed", "bytes"]);
    expect(out.ok).toBe(true);
    const playground = new URL(out.playground as string);
    const embed = new URL(out.embed as string);
    expect(playground.origin).toBe(PLAYGROUND_ORIGIN);
    expect(playground.pathname).toBe("/");
    expect(embed.origin).toBe(PLAYGROUND_ORIGIN);
    expect(embed.pathname).toBe("/embed.html");
    // Nothing but the plan: no query string, one `#z=` fragment, the same payload in both.
    expect(playground.search).toBe("");
    expect(embed.search).toBe("");
    expect(playground.hash).toMatch(/^#z=[A-Za-z0-9_-]+$/);
    expect(embed.hash).toBe(playground.hash);
    expect(decodePlanHash(payloadOf(out.playground))).toBe(CLEAN);
    expect(out.bytes).toBe(Buffer.from(payloadOf(out.playground), "base64url").length);
  });

  it("mints the same bytes as `archlang link` (one encoder)", async () => {
    const client = await connect();
    expect(await call(client, "link", { source: TWO_STOREY })).toEqual({ ok: true, ...planLinks(TWO_STOREY) });
  });

  it("still links a plan that does not compile, and says so: ok:false with the error count", async () => {
    const client = await connect();
    const broken = 'plan "X" {\n  romo at (0,0)\n}\n';
    const out = await call(client, "link", { source: broken });
    expect(out).toEqual({ ok: false, errors: 1, ...planLinks(broken) });
    expect(decodePlanHash(payloadOf(out.embed))).toBe(broken);
  });

  it("an installed core without the ./link export is reported as data, not a dead server", async () => {
    // What Node throws for `import("@chanmeng666/archlang/link")` against core 1.42.1.
    const missing = Object.assign(new Error("Package subpath './link' is not defined by \"exports\""), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    const out = await loadPlanLinks(() => Promise.reject(missing));
    expect(out).toEqual({
      ok: false,
      error: `link needs @chanmeng666/archlang >= ${pkg.dependencies["@chanmeng666/archlang"].replace(/^\^/, "")}; the installed core has no ./link export`,
    });
    // A core that exports `./link` but lost the file is a broken install, not an old core.
    const lost = Object.assign(
      new Error("Cannot find module '/x/node_modules/@chanmeng666/archlang/dist/cli/link.js'"),
      {
        code: "ERR_MODULE_NOT_FOUND",
      },
    );
    const broken = await loadPlanLinks(() => Promise.reject(lost));
    expect(broken).toEqual({
      ok: false,
      error:
        "link could not load @chanmeng666/archlang/link; the core install looks incomplete, reinstall it (Cannot find module '/x/node_modules/@chanmeng666/archlang/dist/cli/link.js')",
    });
    // Any other failure is a bug, and is not dressed up as a version problem.
    await expect(loadPlanLinks(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // The real import resolves (here: the source tree, through the test alias).
    expect("planLinks" in (await loadPlanLinks())).toBe(true);
  });
});
