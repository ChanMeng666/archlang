import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const [, , inp, out, vb, w] = process.argv;
let s = readFileSync(inp, "utf8");
s = s.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`);
// drop the background rect so the crop isn't covered
s = s.replace(/<rect [^>]*fill="#ffffff"\/>/, "");
const r = new Resvg(s, { fitTo: { mode: "width", value: Number(w) }, background: "#ffffff" });
writeFileSync(out, r.render().asPng());
