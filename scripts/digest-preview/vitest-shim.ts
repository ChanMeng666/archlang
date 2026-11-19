/**
 * The `vitest` stand-in `npm run digest:preview` loads the digest test files with (`scripts/digest-preview.ts`).
 *
 * It is NOT a test runner for the suite, and nothing but the preview imports it. It implements the part of
 * vitest's surface the byte-identity laws use (`describe`, `it`/`test` with `.each` and `.skip`, `expect`
 * with the matchers below); a test file that imports anything else fails to load and the preview says so,
 * so a missing export is never a silent pass.
 *
 * One deliberate difference from vitest, and the reason the preview exists: a failed `toBe`/`toEqual`
 * whose every difference is a PIN (a 64-hex literal in the file's reach, `setPins`) against a measured
 * string is recorded as a MOVED ROW and does not throw, so a loop that pins a whole table reports every row
 * that moved, not the first. Two measured digests that differ are a failed law, and throw as such; any
 * other failure throws as in vitest. Snapshot matchers compare nothing (they are counted, and the report
 * names the snapshot laws as not covered). The digest bodies themselves are the test files' own code: this
 * module replaces the harness, never a measurement.
 */

/** A pinned digest: 64 lowercase hex characters, the shape of every byte-identity pin in `test/`. */
export const HEX64 = /^[0-9a-f]{64}$/;

/** One row a test pins that no longer measures what it pins. */
export interface MovedRow {
  /** Where in the pinned value the digest sits (`""` for a plain `toBe`, else an index/key path). */
  where: string;
  pinned: string;
  now: string;
}

type Hook = () => unknown;

/** A `describe` block's hooks; a test runs under every enclosing scope's, outermost first. */
interface Scope {
  beforeAll: Hook[];
  afterAll: Hook[];
  beforeEach: Hook[];
  afterEach: Hook[];
}

export interface ShimTest {
  name: string;
  fn: (() => unknown) | undefined;
  skip: boolean;
  /** The enclosing scopes, file scope first. */
  scopes: Scope[];
}

interface ShimState {
  tests: ShimTest[];
  prefix: string[];
  scopes: Scope[];
  /** The rows the running test recorded; `null` outside a test. */
  moved: MovedRow[] | null;
  /** The 64-hex literals in the running file's reach: a wanted value in here is a pin. */
  pins: Set<string>;
  /** `describe` blocks whose body returned a promise since the last `takeNotes` (not supported). */
  asyncDescribes: string[];
  /** Snapshot assertions seen since the last `takeNotes` (compared by nothing here). */
  snapshots: number;
}

const newScope = (): Scope => ({ beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] });

// On `globalThis`, so the runner and the test files share one state whichever URL each resolved the module by.
const KEY = Symbol.for("archlang.digest-preview.vitest-shim");
const holder = globalThis as unknown as Record<symbol, ShimState | undefined>;
const state: ShimState = holder[KEY] ?? {
  tests: [],
  prefix: [],
  scopes: [newScope()],
  moved: null,
  pins: new Set(),
  asyncDescribes: [],
  snapshots: 0,
};
holder[KEY] = state;

/** The pins of the file about to run (`pinsOf`, `scripts/digest-preview/select.ts`). */
export function setPins(pins: Set<string>): void {
  state.pins = pins;
}

/** The tests registered since the last call, in declaration order (the runner calls it after each import). */
export function takeTests(): ShimTest[] {
  const t = state.tests;
  state.tests = [];
  state.prefix = [];
  state.scopes = [newScope()];
  return t;
}

/** The async `describe` bodies and the snapshot assertions seen since the last call. */
export function takeNotes(): { asyncDescribes: string[]; snapshots: number } {
  const n = { asyncDescribes: state.asyncDescribes, snapshots: state.snapshots };
  state.asyncDescribes = [];
  state.snapshots = 0;
  return n;
}

const started = new WeakSet<Scope>();

/**
 * Run one test under its hooks: the moved rows it recorded, and what it threw, if it threw. Rows recorded
 * before a later failure in the same test are kept. A scope's `beforeAll` runs before its first test;
 * `finishFile` runs the `afterAll`s.
 */
export async function runTest(t: ShimTest): Promise<{ moved: MovedRow[]; error?: unknown }> {
  const moved: MovedRow[] = [];
  state.moved = moved;
  try {
    for (const s of t.scopes) {
      if (started.has(s)) continue;
      started.add(s);
      for (const h of s.beforeAll) await h();
    }
    for (const s of t.scopes) for (const h of s.beforeEach) await h();
    try {
      await t.fn?.();
    } finally {
      for (const s of [...t.scopes].reverse()) for (const h of s.afterEach) await h();
    }
    return { moved };
  } catch (error) {
    return { moved, error };
  } finally {
    state.moved = null;
  }
}

/** The `afterAll` hooks of every scope a file's tests ran under, innermost first. */
export async function finishFile(tests: ShimTest[]): Promise<void> {
  const scopes = [...new Set(tests.flatMap((t) => t.scopes))].filter((s) => started.has(s)).reverse();
  for (const s of scopes) for (const h of s.afterAll) await h();
}

const hook = (kind: keyof Scope) => (fn: Hook) => {
  (state.scopes[state.scopes.length - 1] as Scope)[kind].push(fn);
};
export const beforeAll = hook("beforeAll");
export const afterAll = hook("afterAll");
export const beforeEach = hook("beforeEach");
export const afterEach = hook("afterEach");

type Fn = (...args: never[]) => unknown;

/** `it(name, fn)`, `it(name, fn, timeout)` and `it(name, options, fn)`: the timeout and options are ignored. */
function register(name: string, a: unknown, b: unknown, skip: boolean): void {
  const fn = (typeof a === "function" ? a : typeof b === "function" ? b : undefined) as (() => unknown) | undefined;
  state.tests.push({
    name: [...state.prefix, name].join(" > "),
    fn,
    skip: skip || fn === undefined,
    scopes: [...state.scopes],
  });
}

/** vitest's `.each` title: printf `%s %d %i %f %j %o %#  %%`, and `$key` for an object case. */
function eachTitle(title: string, args: unknown[], index: number): string {
  let k = 0;
  const show = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  let out = title.replace(/%([sdifjo#%])/g, (m, c: string) => {
    if (c === "%") return "%";
    if (c === "#") return String(index);
    if (k >= args.length) return m;
    const v = args[k++];
    if (c === "d" || c === "i") return String(Math.trunc(Number(v)));
    if (c === "f") return String(Number(v));
    if (c === "j" || c === "o") return JSON.stringify(v);
    return show(v);
  });
  const only = args[0];
  if (args.length === 1 && only !== null && typeof only === "object" && !Array.isArray(only)) {
    out = out.replace(/\$([\w.]+)/g, (m, key: string) => {
      let v: unknown = only;
      for (const p of key.split(".")) v = v === null || v === undefined ? undefined : (v as Record<string, unknown>)[p];
      return v === undefined ? m : show(v);
    });
  }
  return out;
}

function makeIt(skip: boolean) {
  const f = (name: string, a?: unknown, b?: unknown): void => register(name, a, b, skip);
  return Object.assign(f, {
    each:
      (cases: readonly unknown[]) =>
      (title: string, fn: Fn): void =>
        cases.forEach((c, i) => {
          const args = Array.isArray(c) ? [...c] : [c];
          register(eachTitle(title, args, i), () => (fn as (...a: unknown[]) => unknown)(...args), undefined, skip);
        }),
  });
}

const itRun = makeIt(false);
const itSkip = makeIt(true);
export const it = Object.assign(itRun, {
  skip: itSkip,
  skipIf: (cond: unknown) => (cond ? itSkip : itRun),
  runIf: (cond: unknown) => (cond ? itRun : itSkip),
});
export const test = it;

function makeDescribe(skip: boolean) {
  const d = (name: string, fn?: () => unknown): void => {
    state.prefix.push(name);
    state.scopes.push(newScope());
    const before = state.tests.length;
    try {
      const body = fn?.();
      // vitest awaits an async body while it collects; the stand-in cannot, so the file is flagged instead.
      if (body instanceof Promise) {
        state.asyncDescribes.push(state.prefix.join(" > "));
        body.catch(() => {});
      }
    } finally {
      state.prefix.pop();
      state.scopes.pop();
    }
    if (skip) for (const t of state.tests.slice(before)) t.skip = true;
  };
  return Object.assign(d, {
    each:
      (cases: readonly unknown[]) =>
      (title: string, fn: Fn): void =>
        cases.forEach((c, i) => {
          const args = Array.isArray(c) ? [...c] : [c];
          d(eachTitle(title, args, i), () => (fn as (...a: unknown[]) => unknown)(...args));
        }),
  });
}

export const describe = Object.assign(makeDescribe(false), { skip: makeDescribe(true) });
export const suite = describe;

// ---- equality --------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";

/** `expect.any(…)`, `expect.arrayContaining(…)` and their kind: a wanted value that matches by a predicate. */
class Asymmetric {
  constructor(
    readonly label: string,
    readonly asymmetricMatch: (got: unknown) => boolean,
  ) {}
  toJSON(): string {
    return this.label;
  }
}

/** vitest's `toEqual`: structural, a key holding `undefined` counts as absent, Sets and Maps by content. */
export function equals(a: unknown, b: unknown, strict = false): boolean {
  if (b instanceof Asymmetric) return b.asymmetricMatch(a);
  if (a instanceof Asymmetric) return a.asymmetricMatch(b);
  // vitest 2: two Errors are equal when their messages are, two URLs when their hrefs are.
  if (a instanceof Error && b instanceof Error) return a.message === b.message;
  if (a instanceof URL && b instanceof URL) return a.href === b.href;
  if (Object.is(a, b)) return true;
  if (!isObj(a) || !isObj(b)) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && +a === +b;
  if (a instanceof RegExp || b instanceof RegExp) return String(a) === String(b);
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    return [...a].every((x) => b.has(x) || [...b].some((y) => equals(x, y, strict)));
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    return [...a].every(([k, v]) => b.has(k) && equals(v, b.get(k), strict));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    // An index loop, not `every`: a hole reads as `undefined`, as vitest's iteration sees it.
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equals(a[i], b[i], strict)) return false;
    return true;
  }
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => strict || o[k] !== undefined);
  const ka = keys(a);
  const kb = keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && equals(a[k], b[k], strict));
}

/** `toMatchObject`: every key of `want` matches in `got`, recursively; arrays element-wise. */
function matchesObject(got: unknown, want: unknown): boolean {
  if (want instanceof Asymmetric || !isObj(want) || !isObj(got)) return equals(got, want);
  if (Array.isArray(want)) {
    return Array.isArray(got) && got.length === want.length && want.every((w, i) => matchesObject(got[i], w));
  }
  return Object.keys(want).every((k) => k in got && matchesObject(got[k], want[k]));
}

interface Diff {
  where: string;
  got: unknown;
  want: unknown;
}

/** The leaves where `got` differs from `want`; a table row `[name, …]` is labelled by its name. */
function diffs(got: unknown, want: unknown, where: string, out: Diff[]): void {
  if (equals(got, want)) return;
  if (Array.isArray(got) && Array.isArray(want) && got.length === want.length) {
    want.forEach((w, i) => {
      const label = Array.isArray(w) && typeof w[0] === "string" && !HEX64.test(w[0]) ? w[0] : String(i);
      diffs(got[i], w, `${where}[${label}]`, out);
    });
    return;
  }
  if (
    isObj(got) &&
    isObj(want) &&
    !Array.isArray(got) &&
    !Array.isArray(want) &&
    Object.getPrototypeOf(want) === Object.prototype
  ) {
    const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
    for (const k of [...keys].sort()) diffs(got[k], want[k], where ? `${where}.${k}` : k, out);
    return;
  }
  out.push({ where, got, want });
}

const show = (v: unknown): string => {
  let s: string;
  try {
    s =
      typeof v === "string"
        ? JSON.stringify(v)
        : v instanceof Set || v instanceof Map
          ? `${v.constructor.name}(${JSON.stringify([...v])})`
          : typeof v === "function"
            ? "[function]"
            : (JSON.stringify(v) ?? String(v));
  } catch {
    s = String(v);
  }
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
};

class AssertionError extends Error {
  override name = "AssertionError";
}

// ---- expect ----------------------------------------------------------------------------------

/**
 * A failed equality on pinned digests: when every differing leaf wants a PIN (a 64-hex literal in the file's
 * reach) and measured a string, record each as a moved row and return true (the caller does not throw).
 * `label` (the `expect(x, label)` message) names the row when the value has no path of its own.
 */
function recordMoved(got: unknown, want: unknown, label: string | undefined): boolean {
  if (state.moved === null) return false;
  const d: Diff[] = [];
  diffs(got, want, "", d);
  const isPin = (x: Diff) => typeof x.want === "string" && state.pins.has(x.want) && typeof x.got === "string";
  if (d.length === 0 || !d.every(isPin)) return false;
  for (const x of d) {
    const where = x.where || (label ? `(${label})` : "");
    state.moved.push({ where, pinned: x.want as string, now: x.got as string });
  }
  return true;
}

/** Two measured digests that differ: a failed law between them, not a moved pin. */
const lawFailed = (got: unknown, want: unknown): boolean =>
  typeof got === "string" && typeof want === "string" && HEX64.test(got) && HEX64.test(want) && !state.pins.has(want);

function matchers(got: unknown, msg: string | undefined, negated: boolean) {
  const check = (pass: boolean, what: string, soft?: () => boolean): void => {
    if (pass !== negated) return;
    if (!negated && soft?.()) return;
    throw new AssertionError(`${msg ? `${msg}: ` : ""}expected ${show(got)} ${negated ? "not " : ""}${what}`);
  };
  /** An equality: a moved pin is recorded; two measured digests that differ fail as a law. */
  const equality = (pass: boolean, want: unknown, what: string): void => {
    if (!negated && !pass && lawFailed(got, want)) {
      throw new AssertionError(
        `${msg ? `${msg}: ` : ""}law failed: two measured digests differ, ${show(got)} and ${show(want)}`,
      );
    }
    check(pass, what, () => recordMoved(got, want, msg));
  };
  const snapshot = (): void => {
    state.snapshots++;
  };
  const num = (v: unknown) => v as number;
  const m = {
    toBe: (want: unknown) => equality(Object.is(got, want), want, `to be ${show(want)}`),
    toEqual: (want: unknown) => equality(equals(got, want), want, `to equal ${show(want)}`),
    toStrictEqual: (want: unknown) => equality(equals(got, want, true), want, `to strictly equal ${show(want)}`),
    toMatchObject: (want: unknown) => check(matchesObject(got, want), `to match object ${show(want)}`),
    toMatch: (want: RegExp | string) =>
      check(
        typeof got === "string" && (typeof want === "string" ? got.includes(want) : want.test(got)),
        `to match ${String(want)}`,
      ),
    // vitest: a string searches a string; anything else non-null is read with `Array.from` (an iterator too).
    toContain: (want: unknown) =>
      check(
        typeof got === "string"
          ? got.includes(String(want))
          : got !== null && got !== undefined && Array.from(got as Iterable<unknown>).includes(want),
        `to contain ${show(want)}`,
      ),
    toContainEqual: (want: unknown) =>
      check(Array.isArray(got) && got.some((g) => equals(g, want)), `to contain equal ${show(want)}`),
    toHaveLength: (n: number) =>
      check(
        isObj(got) || typeof got === "string" ? (got as { length: number }).length === n : false,
        `to have length ${n}`,
      ),
    toHaveProperty: (path: string | string[], ...value: unknown[]) => {
      let v: unknown = got;
      let found = true;
      for (const p of Array.isArray(path) ? path : path.split(".")) {
        if (isObj(v) && p in v) v = v[p];
        else {
          found = false;
          break;
        }
      }
      check(found && (value.length === 0 || equals(v, value[0])), `to have property ${String(path)}`);
    },
    toBeUndefined: () => check(got === undefined, "to be undefined"),
    toBeDefined: () => check(got !== undefined, "to be defined"),
    toBeNull: () => check(got === null, "to be null"),
    toBeTruthy: () => check(Boolean(got), "to be truthy"),
    toBeFalsy: () => check(!got, "to be falsy"),
    toBeNaN: () => check(Number.isNaN(got), "to be NaN"),
    toBeInstanceOf: (c: new (...a: never[]) => unknown) => check(got instanceof c, `to be an instance of ${c.name}`),
    toBeGreaterThan: (n: number) => check(num(got) > n, `to be greater than ${n}`),
    toBeGreaterThanOrEqual: (n: number) => check(num(got) >= n, `to be greater than or equal to ${n}`),
    toBeLessThan: (n: number) => check(num(got) < n, `to be less than ${n}`),
    toBeLessThanOrEqual: (n: number) => check(num(got) <= n, `to be less than or equal to ${n}`),
    toBeCloseTo: (n: number, digits = 2) =>
      check(Math.abs(num(got) - n) < 10 ** -digits / 2, `to be close to ${n} (${digits} digits)`),
    toThrow: (want?: RegExp | string | (new (...a: never[]) => unknown)) => {
      let thrown: unknown;
      let threw = false;
      try {
        (got as () => unknown)();
      } catch (e) {
        threw = true;
        thrown = e;
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      const ok =
        threw &&
        (want === undefined ||
          (typeof want === "string"
            ? message.includes(want)
            : want instanceof RegExp
              ? want.test(message)
              : thrown instanceof want));
      check(ok, `to throw ${want === undefined ? "" : String(want)}`);
    },
    toMatchSnapshot: snapshot,
    toMatchInlineSnapshot: snapshot,
    toMatchFileSnapshot: snapshot,
    toThrowErrorMatchingSnapshot: snapshot,
    toThrowErrorMatchingInlineSnapshot: snapshot,
  };
  return m;
}

/** The matchers on `expect(x)`, and on `expect(x).not`. */
export type Matchers = ReturnType<typeof matchers> & { not: ReturnType<typeof matchers> };

function expectFn(got: unknown, msg?: string): Matchers {
  return Object.assign(matchers(got, msg, false), { not: matchers(got, msg, true) });
}

/** The type test `expect.any` makes: a primitive's wrapper by `typeof`, any other class by `instanceof`. */
function isA(got: unknown, c: unknown): boolean {
  const prim = new Map<unknown, string>([
    [String, "string"],
    [Number, "number"],
    [Boolean, "boolean"],
    [BigInt, "bigint"],
    [Symbol, "symbol"],
    [Function, "function"],
  ]);
  const t = prim.get(c);
  if (t !== undefined) return typeof got === t || got instanceof (c as new () => unknown);
  return got instanceof (c as new () => unknown);
}

export const expect = Object.assign(expectFn, {
  any: (c: unknown) => new Asymmetric(`Any<${(c as { name?: string }).name ?? "?"}>`, (g) => isA(g, c)),
  anything: () => new Asymmetric("Anything", (g) => g !== null && g !== undefined),
  arrayContaining: (want: unknown[]) =>
    new Asymmetric(
      `ArrayContaining ${show(want)}`,
      (g) => Array.isArray(g) && want.every((w) => g.some((x) => equals(x, w))),
    ),
  objectContaining: (want: Record<string, unknown>) =>
    new Asymmetric(
      `ObjectContaining ${show(want)}`,
      (g) => isObj(g) && Object.keys(want).every((k) => k in g && equals(g[k], want[k])),
    ),
  stringContaining: (want: string) =>
    new Asymmetric(`StringContaining ${show(want)}`, (g) => typeof g === "string" && g.includes(want)),
  stringMatching: (want: RegExp | string) =>
    new Asymmetric(
      `StringMatching ${String(want)}`,
      (g) => typeof g === "string" && (typeof want === "string" ? g.includes(want) : want.test(g)),
    ),
});
