/**
 * Resource-wiring pins for the MCP shim.
 *
 * The five `archlang://…` resources are the shim's most silently-rotting surface:
 * they are static text baked in at PACK time, so a wrong repo path or a resource
 * wired to the wrong file cannot be caught by compiling anything. 0.2.2 shipped a
 * v1.19 spec AND a v1.19 GBNF grammar that could not decode half the language while
 * its dep range resolved to a current core.
 *
 * These tests pin the WIRING, not the content: running from source, each resource's
 * body must be BYTE-EQUAL to the generated repo artifact it names. A generated
 * artifact drifting from ITS source is a different gate (`npm run check:drift`), and
 * a built `dist/` copy drifting from the repo file is a third
 * (`scripts/check-dist-resources.mjs`). Together the three cover every hop from
 * source of truth to what a host actually reads.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { connect } from "./helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/mcp/test → repo root. */
const REPO = resolve(HERE, "..", "..", "..");

const read = (rel: string): string => readFileSync(resolve(REPO, rel), "utf8");

/** [resource uri, repo-relative source of truth, declared mimeType]. */
const RESOURCES: Array<[string, string, string]> = [
  ["archlang://spec", "spec.llm.md", "text/markdown"],
  ["archlang://context", "llms-full.txt", "text/markdown"],
  ["archlang://schema", "schemas/plan.schema.json", "application/schema+json"],
  ["archlang://grammar", "grammars/archlang.gbnf", "text/plain"],
  ["archlang://intent-schema", "schemas/intent.schema.json", "application/schema+json"],
];

describe("resources", () => {
  it.each(RESOURCES)("%s is byte-equal to %s", async (uri, rel, mimeType) => {
    const client = await connect();
    const res = await client.readResource({ uri });
    expect(res.contents).toHaveLength(1);
    const content = res.contents[0] as { uri: string; mimeType?: string; text?: string };
    expect(content.text).toBe(read(rel));
    expect(content.mimeType).toBe(mimeType);
    expect(content.uri).toBe(uri);
  });

  it("every registered resource is one of the five pinned above — no unpinned wiring", async () => {
    const client = await connect();
    const listed = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(listed).toEqual(RESOURCES.map(([uri]) => uri).sort());
  });

  it("no resource fell back to the not-found placeholder", async () => {
    // `readResource()` in src/server.ts returns a "(… not found — run `npm run
    // mcp:build`)" string rather than throwing, so a broken path would otherwise
    // serve a plausible-looking body forever.
    const client = await connect();
    for (const [uri] of RESOURCES) {
      const res = await client.readResource({ uri });
      const text = (res.contents[0] as { text?: string }).text ?? "";
      expect(text).not.toMatch(/not found — run/);
      expect(text.length).toBeGreaterThan(100);
    }
  });

  it("the two schema resources and the grammar are actually parseable in their format", async () => {
    const client = await connect();
    for (const uri of ["archlang://schema", "archlang://intent-schema"]) {
      const res = await client.readResource({ uri });
      const parsed = JSON.parse((res.contents[0] as { text?: string }).text ?? "");
      expect(parsed.$schema).toContain("json-schema.org");
    }
    const gbnf = await client.readResource({ uri: "archlang://grammar" });
    // A GBNF grammar's entry point is the `root` rule; without it a decoder cannot start.
    expect((gbnf.contents[0] as { text?: string }).text ?? "").toMatch(/^root\s*::=/m);
  });

  it("the grammar can decode the CURRENT language, not a frozen older tier", async () => {
    // The exact 0.2.2 failure: the baked grammar had no production for keywords the
    // shipped core already parsed, so constrained decoding could not emit them. Pin the
    // newest keyword tiers by name — a stale grammar goes red here, not in a user's host.
    const gbnf = (
      (await (await connect()).readResource({ uri: "archlang://grammar" })).contents[0] as { text?: string }
    ).text!;
    for (const kw of ["paper", "level", "place", "zone", "polygon", "arc"]) {
      expect(gbnf, `grammar has no production mentioning \`${kw}\``).toContain(kw);
    }
  });
});
