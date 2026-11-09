import fc from "fast-check";

/**
 * Seeded JSON mutators shared by the malformed-input laws (`plan-json-malformed`,
 * `openplan3d-malformed`). A mutation is DATA (kind + two naturals), so fast-check shrinks it and a
 * counterexample prints as a replayable list; `applyMutations` walks the document afresh for each
 * one, so a later mutation sees the earlier one's result.
 */

export const MUTATION_KINDS = [
  "drop-key",
  "wrong-type",
  "special-number",
  "empty-array",
  "extra-key",
  "proto-key",
  "swap-siblings",
  "duplicate-element",
  "empty-string",
] as const;
export type MutationKind = (typeof MUTATION_KINDS)[number];
export interface Mutation {
  kind: MutationKind;
  pick: number;
  aux: number;
}

export const mutationArb: fc.Arbitrary<Mutation> = fc.record({
  kind: fc.constantFrom(...MUTATION_KINDS),
  pick: fc.nat(100000),
  aux: fc.nat(1000),
});
export const mutationsArb = (min = 1, max = 3) => fc.array(mutationArb, { minLength: min, maxLength: max });

type Path = (string | number)[];
type Node = { path: Path; value: unknown };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every node of `root` (including the root) with its path. */
function nodes(root: unknown): Node[] {
  const out: Node[] = [];
  const walk = (value: unknown, path: Path) => {
    out.push({ path, value });
    if (Array.isArray(value)) for (let i = 0; i < value.length; i++) walk(value[i], [...path, i]);
    else if (isObj(value)) for (const k of Object.keys(value)) walk(value[k], [...path, k]);
  };
  walk(root, []);
  return out;
}
const getAt = (root: unknown, path: Path): any => {
  let cur: any = root;
  for (const k of path) cur = cur[k];
  return cur;
};
const setOwn = (o: any, k: string | number, v: unknown) =>
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

const SPECIAL = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e12, -1e12, -0, 1e-9, 2 ** 53, -1];
const WRONG: unknown[] = ["x", 0, 7.5, true, false, null, {}, [], [1, 2], { a: 1 }];
const PROTO = ["__proto__", "constructor", "prototype"];

export const pathStr = (p: Path): string => `/${p.join("/")}`;

/** Deep clone through JSON (keeps an own `__proto__` key, as JSON.parse creates it). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Apply `ms` to a clone of `doc`. Returns the mutated value and a description per mutation actually
 * applied (a mutation with nothing to act on is a no-op and is not described).
 */
export function applyMutations(
  doc: unknown,
  ms: Mutation[],
): { value: unknown; applied: string[]; kinds: MutationKind[] } {
  const root = clone(doc);
  const applied: string[] = [];
  const kinds: MutationKind[] = [];
  for (const m of ms) {
    const all = nodes(root);
    const pickFrom = (pred: (n: Node) => boolean): Node | undefined => {
      const c = all.filter(pred);
      return c.length === 0 ? undefined : c[m.pick % c.length];
    };
    const note = (what: string, p: Path) => {
      applied.push(`${m.kind} ${what} @ ${pathStr(p)}`);
      kinds.push(m.kind);
    };
    switch (m.kind) {
      case "drop-key": {
        const n = pickFrom((x) => x.path.length > 0);
        if (!n) break;
        const parent = getAt(root, n.path.slice(0, -1));
        const k = n.path[n.path.length - 1]!;
        if (Array.isArray(parent)) parent.splice(k as number, 1);
        else delete parent[k];
        note("", n.path);
        break;
      }
      case "wrong-type": {
        const n = pickFrom((x) => x.path.length > 0);
        if (!n) break;
        let v = WRONG[m.aux % WRONG.length]!;
        if (JSON.stringify(v) === JSON.stringify(n.value)) v = WRONG[(m.aux + 1) % WRONG.length]!;
        setOwn(getAt(root, n.path.slice(0, -1)), n.path[n.path.length - 1]!, v);
        note(JSON.stringify(v), n.path);
        break;
      }
      case "special-number": {
        const n = pickFrom((x) => typeof x.value === "number" && x.path.length > 0);
        if (!n) break;
        const v = SPECIAL[m.aux % SPECIAL.length]!;
        setOwn(getAt(root, n.path.slice(0, -1)), n.path[n.path.length - 1]!, v);
        note(Object.is(v, -0) ? "-0" : String(v), n.path);
        break;
      }
      case "empty-array": {
        const n = pickFrom((x) => Array.isArray(x.value) && x.path.length > 0);
        if (!n) break;
        (n.value as unknown[]).length = 0;
        note("", n.path);
        break;
      }
      case "extra-key": {
        const n = pickFrom((x) => isObj(x.value));
        if (!n) break;
        setOwn(n.value, `extra_${m.aux}`, WRONG[m.aux % WRONG.length]);
        note(`extra_${m.aux}`, n.path);
        break;
      }
      case "proto-key": {
        const n = pickFrom((x) => isObj(x.value));
        if (!n) break;
        const k = PROTO[m.aux % PROTO.length]!;
        setOwn(n.value, k, { polluted: true, width: 1, kind: "wall" });
        note(k, n.path);
        break;
      }
      case "swap-siblings": {
        const n = pickFrom(
          (x) => (Array.isArray(x.value) && x.value.length > 1) || (isObj(x.value) && Object.keys(x.value).length > 1),
        );
        if (!n) break;
        const c: any = n.value;
        const keys: (string | number)[] = Array.isArray(c) ? c.map((_: unknown, i: number) => i) : Object.keys(c);
        const a = keys[m.aux % keys.length]!;
        const b = keys[(m.aux + 1 + (m.pick % (keys.length - 1))) % keys.length]!;
        const t = c[a];
        setOwn(c, a, c[b]);
        setOwn(c, b, t);
        note(`${a}<->${b}`, n.path);
        break;
      }
      case "duplicate-element": {
        const n = pickFrom((x) => Array.isArray(x.value) && x.value.length > 0);
        if (!n) break;
        const a = n.value as unknown[];
        const i = m.aux % a.length;
        a.splice(i, 0, clone(a[i]));
        note(String(i), n.path);
        break;
      }
      case "empty-string": {
        const n = pickFrom((x) => typeof x.value === "string" && x.path.length > 0);
        if (!n) break;
        setOwn(getAt(root, n.path.slice(0, -1)), n.path[n.path.length - 1]!, "");
        note("", n.path);
        break;
      }
    }
  }
  return { value: root, applied, kinds };
}

/** The own property names of Object.prototype (and Array/Function prototypes), for the pollution law. */
export const protoSnapshot = (): string => {
  const names = (o: object) => Object.getOwnPropertyNames(o).sort().join(",");
  return [Object.prototype, Array.prototype, Function.prototype].map(names).join("|");
};
