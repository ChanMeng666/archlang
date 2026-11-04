// The two non-JavaScript modules the Worker entry imports, as wrangler bundles them
// (playground/wrangler.jsonc): a `.wasm` file is a compiled WebAssembly.Module, and a `.ttf` is a
// `Data` module, its bytes as an ArrayBuffer.

declare module "@resvg/resvg-wasm/index_bg.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.ttf" {
  const bytes: ArrayBuffer;
  export default bytes;
}
