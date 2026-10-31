// Throwaway: logs every fs touch of a path ending CHANGELOG.md, from any node process.
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const LOG = process.env.CI_TRACE_LOG;
const raw = {
  append: fs.appendFileSync,
};
function note(op, p) {
  try {
    const s = typeof p === "string" ? p : p instanceof URL ? p.pathname : Buffer.isBuffer(p) ? p.toString() : "";
    if (!s.endsWith("CHANGELOG.md")) return;
    const frames = (new Error().stack || "")
      .split("\n")
      .slice(2)
      .filter((l) => !l.includes("node:") && !l.includes("ci-trace.cjs"))
      .slice(0, 3)
      .map((l) => l.trim());
    raw.append(LOG, `TRACE ${op} ${path.relative(process.cwd(), s)} argv=${process.argv.slice(1, 4).join(" ")} :: ${frames.join(" | ")}\n`);
  } catch {}
}
for (const name of ["readFileSync", "openSync", "statSync", "lstatSync", "existsSync", "readFile", "open", "stat", "lstat", "createReadStream"]) {
  const orig = fs[name];
  fs[name] = function (p, ...rest) {
    note(name, p);
    return orig.call(this, p, ...rest);
  };
  Object.assign(fs[name], orig);
}
for (const name of ["readFile", "open", "stat", "lstat"]) {
  const orig = fs.promises[name];
  fs.promises[name] = function (p, ...rest) {
    note(`promises.${name}`, p);
    return orig.call(this, p, ...rest);
  };
}
syncBuiltinESMExports();
