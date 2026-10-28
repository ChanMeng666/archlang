/**
 * The checks `archlang3d build` and `check` run (archlang-3d plan §8.1), each a named verdict:
 *
 * - V-SCH-01  the Scene3D passes its validator (the schema's verdicts, `scene3d/validate.ts`);
 * - V-GEO-02  every Mesh3D shell is closed, consistently wound and of positive volume;
 * - V-GLTF-01 Khronos glTF-Validator: 0 errors and 0 warnings (infos and hints are reported, not failed);
 * - V-GLTF-02 the GLB's nodes are the Mesh3D's nodes, one for one, named `<kind>:<id>[:<part>]`
 *   under `level:L<n>`, each `extras.archlang` naming its own key, kind and id; and nothing in the
 *   file carries an absolute path or a time (plan §8.5 L7).
 *
 * Node-only (it loads glTF-Validator, a Dart program compiled to JavaScript, on first use).
 */
import type { Mesh3D, Shell } from "../mesh/types.js";
import { validateScene3D } from "../scene3d/validate.js";
import type { Scene3D } from "../scene3d/types.js";
import { type GlbNode, readGlbNodes } from "../glb/write.js";

export type CheckId = "V-SCH-01" | "V-GEO-02" | "V-GLTF-01" | "V-GLTF-02";

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  /** What failed, one line each (at most 20, then a count). */
  failures: string[];
  /** Counts the check measured (shells, nodes, issues by severity). */
  facts?: Record<string, number | string>;
}

const capped = (xs: string[]): string[] => (xs.length > 20 ? [...xs.slice(0, 20), `… and ${xs.length - 20} more`] : xs);

/** Directed edges not matched by exactly one reverse edge: 0 = closed and consistently wound. */
export function openEdges(s: Shell): number {
  const m = new Map<string, number>();
  for (let t = 0; t < s.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${s.indices[t + k]}>${s.indices[t + ((k + 1) % 3)]}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [e, n] of m) {
    const [a, b] = e.split(">");
    if (n !== 1 || m.get(`${b}>${a}`) !== 1) bad++;
  }
  return bad;
}

/** Signed volume (µm³) of a shell: positive when every face points out. */
export function signedVolume(s: Shell): number {
  const p = s.positions;
  let v = 0;
  for (let t = 0; t < s.indices.length; t += 3) {
    const [i, j, k] = [
      3 * (s.indices[t] as number),
      3 * (s.indices[t + 1] as number),
      3 * (s.indices[t + 2] as number),
    ];
    const [ax, ay, az] = [p[i] as number, p[i + 1] as number, p[i + 2] as number];
    const [bx, by, bz] = [p[j] as number, p[j + 1] as number, p[j + 2] as number];
    const [cx, cy, cz] = [p[k] as number, p[k + 1] as number, p[k + 2] as number];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

export function checkScene(scene: Scene3D): CheckResult {
  const issues = validateScene3D(scene);
  return { id: "V-SCH-01", ok: issues.length === 0, failures: capped(issues.map((i) => `${i.path}: ${i.message}`)) };
}

export function checkShells(mesh: Mesh3D): CheckResult {
  const bad: string[] = [];
  let shells = 0;
  for (const n of mesh.nodes) {
    n.shells.forEach((s, i) => {
      shells++;
      const open = openEdges(s);
      if (open !== 0) bad.push(`${n.key} shell ${i}: ${open} open edges`);
      else if (!(signedVolume(s) > 0)) bad.push(`${n.key} shell ${i}: volume not positive`);
    });
  }
  return { id: "V-GEO-02", ok: bad.length === 0, failures: capped(bad), facts: { shells } };
}

const NAME = /^[a-z]+:[^:/\s]+(:[^:/\s]+)?$/;
/** An absolute path (POSIX home or root dirs, a Windows drive, a file URL) or an ISO time: never in an output (L7). */
const LEAK = /(?:^|["\s(])(?:\/(?:home|Users|tmp|var|root)\/|[A-Za-z]:[\\/]|file:\/\/)|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** V-GLTF-02 over nodes read back from a GLB; given `mesh`, its node set must equal the Mesh3D's. */
export function checkNaming(nodes: readonly GlbNode[], levels: readonly string[], mesh?: Mesh3D): CheckResult {
  const bad: string[] = [];
  for (const lv of levels) if (!/^level:L\d+$/.test(lv)) bad.push(`group "${lv}" is not level:L<n>`);
  const seen = new Set<string>();
  for (const n of nodes) {
    if (!NAME.test(n.name)) bad.push(`node "${n.name}" is not <kind>:<id>[:<part>]`);
    if (seen.has(n.key)) bad.push(`node "${n.key}" twice`);
    seen.add(n.key);
    const [kind, id, part] = n.name.split(":");
    const x = n.extras;
    if (x.key !== n.key || x.kind !== kind || x.id !== id || (x.part ?? undefined) !== part) {
      bad.push(`node "${n.key}": extras.archlang does not name it (key ${String(x.key)})`);
    }
  }
  if (mesh) {
    const want = new Set(mesh.nodes.map((n) => n.key));
    for (const k of want) if (!seen.has(k)) bad.push(`Mesh3D node "${k}" missing from the GLB`);
    for (const k of seen) if (!want.has(k)) bad.push(`GLB node "${k}" is not a Mesh3D node`);
  }
  return { id: "V-GLTF-02", ok: bad.length === 0, failures: capped(bad), facts: { nodes: nodes.length } };
}

/** The JSON chunk of a GLB, as text. */
export function glbJson(glb: Uint8Array): string {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (glb.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB (no glTF magic)");
  const len = view.getUint32(12, true);
  return new TextDecoder().decode(glb.subarray(20, 20 + len));
}

interface ValidatorReport {
  validatorVersion?: string;
  issues: {
    numErrors: number;
    numWarnings: number;
    numInfos: number;
    numHints: number;
    messages: Array<{ code: string; message: string; severity: number; pointer?: string }>;
  };
}

/** V-GLTF-01: Khronos glTF-Validator over the bytes; fails on any error or warning. */
export async function checkValidator(glb: Uint8Array): Promise<CheckResult> {
  const v = (await import("gltf-validator")) as unknown as {
    validateBytes: (d: Uint8Array, o?: object) => Promise<ValidatorReport>;
    version: () => string;
  };
  const r = await v.validateBytes(glb, { maxIssues: 100 });
  const i = r.issues;
  const bad = i.messages
    .filter((m) => m.severity <= 1)
    .map(
      (m) => `${m.severity === 0 ? "error" : "warning"} ${m.code}${m.pointer ? ` at ${m.pointer}` : ""}: ${m.message}`,
    );
  return {
    id: "V-GLTF-01",
    ok: i.numErrors === 0 && i.numWarnings === 0,
    failures: capped(bad),
    facts: {
      validator: v.version(),
      errors: i.numErrors,
      warnings: i.numWarnings,
      infos: i.numInfos,
      hints: i.numHints,
    },
  };
}

/** Every check a GLB alone allows (`archlang3d check model.glb`); given its Mesh3D, the node sets are compared. */
export async function checkGlb(glb: Uint8Array, mesh?: Mesh3D): Promise<CheckResult[]> {
  const out = [await checkValidator(glb)];
  const { levels, nodes } = await readGlbNodes(glb);
  const naming = checkNaming(nodes, levels, mesh);
  const json = glbJson(glb);
  if (LEAK.test(json)) {
    naming.ok = false;
    naming.failures.push("the GLB's JSON carries an absolute path or a time (plan §8.5 L7)");
  }
  out.push(naming);
  return out;
}
