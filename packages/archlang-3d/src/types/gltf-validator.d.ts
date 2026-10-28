/** glTF-Validator ships no types; `check/verify.ts` states the slice it reads. */
declare module "gltf-validator" {
  export function validateBytes(data: Uint8Array, options?: object): Promise<unknown>;
  export function version(): string;
}
