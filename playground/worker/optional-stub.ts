// Stands in for the core's optional Node-only dependencies (`@resvg/resvg-js`, `pdfkit`,
// `clipper2-wasm`, the CJK font package) in the Worker bundle: wrangler.jsonc aliases each to this
// module. The core reaches them only through lazy `import()`s on paths this Worker never takes, and
// a native binary cannot be bundled, so reaching one here fails the way an absent package does.
throw new Error("optional dependency is not available in the playground Worker");
