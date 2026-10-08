/**
 * Input fuzz for every MCP tool.
 *
 * An MCP server is driven by whatever a remote host sends, and a host is driven by a
 * language model — so the argument object is *untrusted, arbitrarily-shaped JSON*,
 * not something a type system upstream can guarantee. The contract this suite pins:
 *
 *   1. every call **RESOLVES** to a structured MCP tool result — a zod rejection comes
 *      back as an error *result*, never as a thrown/rejected exception a host would
 *      see as a dead server;
 *   2. the result is always well-formed (a `content` array of text blocks), so a host
 *      can render it without special-casing;
 *   3. the **transport survives** — a known-good call still works after each batch.
 *
 * (2) and (3) are the ones that matter. A handler that throws on a shape zod let
 * through would surface as an uncaught rejection in the server's request loop; a
 * handler that hangs would poison the connection for every later call. Both are
 * failure modes only fuzzing finds, because no hand-written case guesses the shape.
 *
 * Runs are deliberately bounded (see NUM_RUNS) so the suite stays a few seconds.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { call, connect, TINY } from "./helpers.js";

/** Bounded so the whole file stays well under ~30s: 10 tools × NUM_RUNS calls. */
const NUM_RUNS = 25;

/** Every tool the server registers, with the param names its schema declares. */
const TOOLS: Array<{ name: string; params: string[] }> = [
  { name: "compile", params: ["source", "plan_json", "format", "accessible", "overlay", "level"] },
  { name: "describe", params: ["source"] },
  { name: "lint", params: ["source", "profile"] },
  { name: "validate", params: ["source", "strict", "graph", "intent"] },
  { name: "score", params: ["source", "brief"] },
  { name: "repair", params: ["source"] },
  { name: "finish", params: ["source", "reissue"] },
  { name: "fix", params: ["source", "unsafe"] },
  { name: "suggest", params: ["source"] },
  { name: "complete", params: ["source", "at"] },
];

/**
 * Garbage that is plausibly wrong rather than uniformly random: wrong primitive
 * types, nulls, nested junk, and the odd *nearly*-valid `.arch` fragment — the shapes
 * a model actually emits when it half-remembers the schema.
 */
const garbageValue = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(null, undefined, 0, -1, 1.5, NaN, true, false, "", "  ") },
    { weight: 3, arbitrary: fc.string({ maxLength: 40 }) },
    { weight: 2, arbitrary: fc.constantFrom('plan "X" {', "room at (0,0)", "}", "plan", "svg", "txt", "-1e309") },
    { weight: 2, arbitrary: fc.integer({ min: -1e9, max: 1e9 }) },
    { weight: 2, arbitrary: fc.array(fc.anything({ maxDepth: 2 }), { maxLength: 4 }) },
    { weight: 2, arbitrary: fc.dictionary(fc.string({ maxLength: 8 }), fc.anything({ maxDepth: 2 }), { maxKeys: 4 }) },
    { weight: 1, arbitrary: fc.anything({ maxDepth: 3 }) },
  );

/**
 * An argument object over a tool's real param names PLUS undeclared keys.
 *
 * `constructor` is deliberately NOT in the pool — see the "prototype-named argument
 * keys" test below: it never reaches a handler, because the SDK's own request-envelope
 * validation throws on it first. Fuzzing it here would only re-measure an upstream bug.
 */
const argsFor = (params: string[]): fc.Arbitrary<Record<string, unknown>> =>
  fc.dictionary(fc.constantFrom(...params, "bogus", "id", "0", "toString"), garbageValue(), {
    maxKeys: 4,
  });

/** A tool result is well-formed when it carries a `content` array of text blocks. */
function assertWellFormed(result: unknown, label: string): void {
  const r = result as { content?: unknown; isError?: unknown };
  expect(Array.isArray(r.content), `${label}: result has no content array`).toBe(true);
  const blocks = r.content as Array<{ type?: string; text?: string }>;
  expect(blocks.length, `${label}: result has an empty content array`).toBeGreaterThan(0);
  for (const b of blocks) {
    expect(b.type, `${label}: non-text content block`).toBe("text");
    expect(typeof b.text, `${label}: content block has no text`).toBe("string");
  }
  if (r.isError !== undefined) expect(typeof r.isError).toBe("boolean");
}

/** The known-good call every batch ends with — proof the transport still works. */
async function assertTransportAlive(client: Awaited<ReturnType<typeof connect>>, label: string): Promise<void> {
  const out = await call(client, "describe", { source: TINY });
  expect((out.rooms as unknown[]).length, `${label}: transport did not survive the batch`).toBe(1);
}

describe("malformed tool arguments", () => {
  for (const { name, params } of TOOLS) {
    it(`${name} answers structurally for any argument object`, async () => {
      // ONE server for the whole property: a per-run reconnect would hide exactly the
      // bug we care about — a bad call that poisons the connection for later ones.
      const client = await connect();
      await fc.assert(
        fc.asyncProperty(argsFor(params), async (args) => {
          const label = `${name}(${JSON.stringify(args)?.slice(0, 120)})`;
          // MUST RESOLVE. A rejection here is the failure: the SDK turns a zod
          // rejection into an error RESULT, so anything that rejects escaped the
          // handler (or the transport died).
          const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
          assertWellFormed(result, label);
        }),
        { numRuns: NUM_RUNS },
      );
      await assertTransportAlive(client, name);
    }, 30_000);
  }

  it("every tool answers with PARSEABLE JSON for arbitrary source text", async () => {
    // The property above mostly measures zod: two thirds of its `source` values are the
    // wrong type and never reach a handler. This one always sends a string, so the
    // handler always runs — on text that is unparseable, half-parsed, or nearly valid —
    // and its `json()` projection must always come back as parseable JSON.
    const client = await connect();
    const source = fc.oneof(
      fc.string({ maxLength: 200 }),
      fc.constantFrom(
        "",
        "plan",
        'plan "X"',
        'plan "X" {',
        'plan "X" { room }',
        'plan "X" { room at (0,0) size 0x0 }',
        'plan "X" { wall exterior { } }',
        'plan "X" { level 1 { } level 1 { } }',
        "\u0000�",
      ),
      // Multi-line junk: the lexer/parser recovery path sees line breaks, not one blob.
      fc.array(fc.string({ maxLength: 30 }), { maxLength: 8 }).map((lines) => lines.join("\n")),
    );
    await fc.assert(
      fc.asyncProperty(source, fc.constantFrom(...TOOLS.map((t) => t.name)), async (src, name) => {
        const result = await client.callTool({ name, arguments: { source: src, at: 0, brief: {} } });
        assertWellFormed(result, `${name}(source=${JSON.stringify(src).slice(0, 60)})`);
        const text = (result as { content: Array<{ text: string }> }).content[0]!.text;
        expect(() => JSON.parse(text)).not.toThrow();
      }),
      { numRuns: 120 },
    );
    await assertTransportAlive(client, "arbitrary-source");
  }, 30_000);

  it("survives a ~100KB source on every tool, and stays usable after", async () => {
    const client = await connect();
    // Not random: a specific adversarial size. 100KB of unbalanced braces is both a
    // parser stress case and the shape a runaway model emits.
    const huge = 'plan "Huge" {\n'.padEnd(100_000, '  room at (0,0) size 1x1 label "x"\n');
    const hugeGarbage = "{".repeat(100_000);
    for (const { name } of TOOLS) {
      for (const source of [huge, hugeGarbage]) {
        const result = await client.callTool({
          name,
          // `at`/`brief` are required by their schemas — supply them so the call reaches
          // the handler rather than stopping at zod (both shapes are still exercised).
          arguments: { source, at: 0, brief: {} },
        });
        assertWellFormed(result, `${name}(~100KB)`);
      }
    }
    await assertTransportAlive(client, "huge-source");
  }, 60_000);

  it("an unknown tool name is an error result, not a dead connection", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "no_such_tool", arguments: {} });
    assertWellFormed(result, "no_such_tool");
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect((result as { content: Array<{ text: string }> }).content[0]!.text).toMatch(/no_such_tool/);
    // The point: the connection is still good afterwards.
    await assertTransportAlive(client, "unknown-tool");
  });

  it("prototype-named argument keys get the ordinary invalid-params contract — and the session survives", async () => {
    // An argument object with an own `constructor` key (which `JSON.parse('{"constructor":null}')`
    // really does produce, so a hostile or confused host can send one).
    //
    // Under zod 3 this was a DISCOVERED UPSTREAM BUG, pinned here: the SDK validated
    // `params.arguments` as a zod record and died in its protocol layer with an INTERNAL
    // error (-32603, "Cannot read properties of null (reading 'prototype')") before the
    // shim ever ran. The pin said that when a bump turned it into a normal error result,
    // this test would go red and should be rewritten to the better contract. zod 4 (#114)
    // did exactly that, measured rather than assumed:
    //
    //  - without `source`, the key is just a missing required argument: the same -32602
    //    invalid-params error RESULT every other malformed shape gets;
    //  - with `source`, the stray key is dropped and the tool runs. `describe` of "x" is
    //    a parse failure reported as DATA (`ok: false`), never an exception.
    const client = await connect();
    for (const args of [{ constructor: null }, { constructor: 1 }]) {
      const r = await client.callTool({ name: "describe", arguments: args as Record<string, unknown> });
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(JSON.stringify(r.content), JSON.stringify(args)).toContain("-32602");
    }
    const ran = await client.callTool({
      name: "describe",
      arguments: { source: "x", constructor: [] } as Record<string, unknown>,
    });
    const [first] = ran.content as { type: string; text: string }[];
    expect(JSON.parse(first!.text)).toMatchObject({ ok: false });
    await assertTransportAlive(client, "prototype-keys");
  });

  it("a valid call after a batch of invalid ones returns the SAME bytes as a fresh server", async () => {
    // Determinism across a poisoned-looking session: no handler may accumulate state.
    const dirty = await connect();
    for (const args of [{}, { source: null }, { source: 42 }, { source: [], at: {} }])
      await dirty.callTool({ name: "compile", arguments: args as Record<string, unknown> });
    const after = await call(dirty, "compile", { source: TINY });
    const fresh = await call(await connect(), "compile", { source: TINY });
    expect(after.output).toBe(fresh.output);
  });
});
