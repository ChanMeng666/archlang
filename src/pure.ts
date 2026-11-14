/**
 * `pure(() => value)` returns `value`, built once at module load exactly as written. It marks a
 * top-level constant whose initializer has no effect outside the value it builds, but whose shape
 * a bundler cannot prove that of: a spread (`[...xs]`, `{ ...o }`, which may call an iterator or
 * a getter), a template literal or a `+` over a non-literal (which may call `toString`), or a call
 * chain (`xs.filter(…).flatMap(…)`). A bundler that cannot tell keeps such an initializer, and
 * everything it reads, in a bundle that never reads the constant. A call to a function marked
 * `@__NO_SIDE_EFFECTS__` whose argument is an arrow can be dropped whole when its result is unused;
 * the playground's bundler (rolldown) drops it.
 *
 * Write every call as `/* @__PURE__ *\/ pure(() => value)`. Since card RM0.7f the built core is
 * split in chunks (`src/compile-path.ts`), so a call can sit in a different built file from this
 * declaration, and rolldown (1.2.15, measured) honours `@__NO_SIDE_EFFECTS__` on an imported
 * function only while the call lands in the same output chunk as the declaration: a call in a lazy
 * chunk was kept, with everything it reads. The mark on the call itself holds in every chunk and
 * every bundler; the arrow argument has no effect of its own, so the whole call goes.
 *
 * Use it only where the initializer reads and allocates, never where it writes to anything that
 * outlives it (a registry, a cache, a global). Where one call with side-effect-free arguments is
 * the whole initializer (`Object.freeze({ … })`, `new Set(xs)`, `Object.keys(o)`), a
 * `@__PURE__` mark on that call says the same thing.
 *
 * An arrow, because esbuild re-emits the mark on a function declaration as a line comment, which
 * rolldown does not read. `T` is a `const` type
 * parameter, so an object or array literal the arrow returns is typed as if written `as const`
 * (the JSON schemas rely on it); a site annotated with its own type is checked against that.
 */
export const pure = /* @__NO_SIDE_EFFECTS__ */ <const T>(make: () => T): T => make();
