# A parametric floor plan library for JavaScript

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666): you write `.arch` text and compile it to SVG, DXF or
PDF.

The compiler is the npm package
[`@chanmeng666/archlang`](https://www.npmjs.com/package/@chanmeng666/archlang): an ES module with
no runtime dependencies, written in TypeScript and shipped with its type declarations. It runs in
Node 18 or later and in the browser. To make a floor plan parametric from JavaScript, generate
`.arch` source from your own parameters and pass it to `compile()`.

```bash
npm install @chanmeng666/archlang
```

## Generate floor plans from parameters

This Node script builds one plan per width, writes each as SVG and DXF, and reads the floor area
back from `describe()`:

```js
import { writeFileSync } from "node:fs";
import { compile, describe, lint, toDxf } from "@chanmeng666/archlang";

// One function, one plan: the parameters are ordinary JavaScript numbers.
function studio({ width, depth, door = 900 }) {
  return `plan "Studio ${width}x${depth}" {
  units mm
  grid 50
  room id=main at (0,0) size ${width}x${depth} label "Studio" uses living
  walls from rooms exterior 200 partition 100
  door on main.bottom at center width ${door} swing into main
  window on main.top width 1800
}`;
}

for (const width of [4000, 5000, 6000]) {
  const source = studio({ width, depth: 4000 });
  const { svg, diagnostics, scene } = compile(source);
  if (diagnostics.some((d) => d.severity === "error")) throw new Error(diagnostics[0].message);
  writeFileSync(`studio-${width}.svg`, svg);
  writeFileSync(`studio-${width}.dxf`, toDxf(scene));
  const { totals } = describe(source);
  console.log(width, totals.floor_area_m2, "m²,", lint(source).length, "warnings");
}
```

It prints:

```text
4000 16 m², 0 warnings
5000 20 m², 0 warnings
6000 24 m², 0 warnings
```

The 5000 mm plan it generates is the source below. It compiles live on this page:

```arch
plan "Studio 5000x4000" {
  units mm
  grid 50
  room id=main at (0,0) size 5000x4000 label "Studio" uses living
  walls from rooms exterior 200 partition 100
  door on main.bottom at center width 900 swing into main
  window on main.top width 1800
}
```

The language has its own variables and loops too (see [the floor plan DSL](/floor-plan-dsl)), so
parameters can also live inside the `.arch` file. Generating source from JavaScript is the choice
when the parameters come from your application: a form, a database row, a model's output.

## The library API

| Function | Returns |
| --- | --- |
| `compile(source, options?)` | An object with `svg`, `diagnostics` and `scene`. `svg` is empty when there are errors, unless you pass `onError: "svg"`, which draws an error card instead. A multi-storey plan also returns `pages`, one drawing per storey. |
| `describe(source)` | Facts about the plan: rooms with areas and adjacency, doors and what they connect, an access graph, totals. |
| `lint(source)` | Advisory warnings as diagnostics, each with a code, a position and a fix. |
| `toDxf(scene)`, `toPdf(scene)` | DXF text, or PDF via the optional `pdfkit` package. |
| `renderPng(...)` | PNG via the optional `@resvg/resvg-js` package (Node). |

`finish`, `repair`, `applyFixes`, `validateIntent`, `diffPlans` and `renderAscii` are exported as well; the
[language reference](/reference#compilation-result) documents the result types. Every function is
synchronous and deterministic: the same source gives the same output, with no I/O and no clock.

## In the browser

The same package runs in a page with no server. Import it from jsDelivr, pinned to a version:

```html
<div id="plan"></div>
<script type="module">
  import { compile } from "https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@%ARCHLANG_VERSION%/+esm";
  const source = `plan "Studio" {
    units mm
    room id=main at (0,0) size 5000x4000 label "Studio" uses living
    walls from rooms exterior 200 partition 100
  }`;
  document.getElementById("plan").innerHTML = compile(source, { onError: "svg" }).svg;
</script>
```

Or drop in the `<arch-plan>` web component. Both are on [Embed a floor plan](/embed).

## FAQ

### Is there a JavaScript library for drawing floor plans?

`@chanmeng666/archlang` compiles floor plans written as text into SVG in Node or the browser,
and to DXF and PDF. Install it with `npm install @chanmeng666/archlang` and call `compile()`.

### How do I make a parametric floor plan in JavaScript?

Write a function that returns ArchLang source from your parameters, as in the example above, and
compile the result. Each call gives a complete, checked plan; `describe()` tells you its areas and
`lint()` tells you what is wrong with it.

### Does it work in the browser?

Yes. The core has no runtime dependencies and no Node APIs in the compile path, so `compile()`,
`describe()` and `lint()` run in a browser. Import it from jsDelivr or bundle it from npm. PNG and
PDF output are the exceptions: they use optional Node packages.

### Does it have TypeScript types?

Yes. The package is written in TypeScript and ships its `.d.ts` declarations.

## Next

- [Embed a floor plan in a web page](/embed): the jsDelivr import and the `<arch-plan>` element.
- [Floor plans as code](/floor-plans-as-code): the CLI workflow.
- [Analysis](/analysis): every field `describe()` returns.
