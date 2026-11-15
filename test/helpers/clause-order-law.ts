/**
 * The digest bodies of the clause-order law (`test/clause-order-byte-identity.test.ts`),
 * importable WITHOUT vitest, so the baseline was taken by this very code against the tree
 * before the change (`test/helpers/byte-identity-digest.ts` says why a lookalike will not do).
 *
 * Two digests per plan:
 *  - the whole agent-facing surface, every storey's SVG + `describe()` + `lint()` +
 *    `compile().diagnostics` ({@link allStoreysDigestWithDiagnostics});
 *  - the PARSE: the `PlanNode` as JSON, its key order included (`arch ast --json` prints it),
 *    plus the parse diagnostics. The clause-order change lives in the parser, so this is the
 *    digest that would move first.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { allStoreysDigestWithDiagnostics, type CompilerApi, sha256 } from "./byte-identity-digest.js";
import type { World } from "../../src/world.js";

export interface ClauseLawApi extends CompilerApi {
  parse(src: string): { plan?: unknown; diagnostics: unknown[] };
  /** A file-system World rooted at a plan's folder, for its `import`s. */
  worldAt(dir: string): World;
}

/** A `Map` (the plan's `components`) as its entries, so it reaches the digest at all. */
const mapsAsEntries = (_k: string, v: unknown): unknown => (v instanceof Map ? { map: [...v.entries()] } : v);

/** The parse of `src`: the AST, key order included, and its diagnostics. */
export function astPayload(api: ClauseLawApi, src: string): string {
  const { plan, diagnostics } = api.parse(src);
  return JSON.stringify([plan, diagnostics], mapsAsEntries);
}

export function astDigest(api: ClauseLawApi, src: string): string {
  return sha256(astPayload(api, src));
}

export function surfaceDigest(api: ClauseLawApi, src: string, file: string): string {
  return allStoreysDigestWithDiagnostics(api, src, { world: api.worldAt(dirname(file)) });
}

/** Every `.arch` under `dir`, recursively, as root-relative POSIX paths, sorted by code unit. */
export function archFilesUnder(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".arch")) out.push(relative(root, p).split("\\").join("/"));
    }
  };
  walk(join(root, dir));
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
