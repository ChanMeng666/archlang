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
import { describe, expect, it } from "vitest";
import {
  call,
  CLEAN,
  codes,
  connect,
  FURNITURE_IN_WALL,
  NARROW_DOOR,
  NO_DOORS,
  TINY,
  TWO_ROOMS,
  TWO_STOREY,
} from "./helpers.js";

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
