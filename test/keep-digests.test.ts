/**
 * K3 of the `keep` byte-identity law (ADR 0033 decision 7; PS4.3 design §7): SHA-256 over each
 * keep-corpus plan's keep rows in every surface that carries them — `describe().keeps`,
 * `compile().diagnostics` and `validate --json` with its exit code (`k3DigestOf`,
 * `./keep-harness.ts`). Pinned in its own commit, after K1 and K2 held, as ADR 0029 §7's relation
 * digests were. A moved row is a finding to explain (`docs/testing.md` §3), never a re-pin; a lint
 * rewording on a corpus plan moves its `validate --json` part, and that row is then re-measured
 * with its reason beside it.
 */

import { describe as suite, expect, it } from "vitest";
import { k3bDigestOf, k3DigestOf, keepCorpus } from "./keep-harness.js";

const K3_DIGESTS: [string, string][] = [
  ["align-equal", "55af8ab086b4e78bb06062cd549ff704d3a94728a8e06e04a3b70c63bbeb2b52"],
  ["grid50-cx", "e795fbb0dda8d8a957c8e5668a2773a84793e5ca30bb3a9daa708342e8e8a637"],
  ["instance", "90cc05d69bd661d54820ff53d76aa86ea7ec739de0bcdbd7de1f1d239186fc07"],
  ["loops", "9e6d4833ecd871d814eb1555d848f54a3ad90957a018c54795141cf061eb9dec"],
  ["min-clear-arcbbox", "0c2e5d959babb03fa8a41b522c68646e3dbe69d270d319b0d6a518f246c899eb"],
  ["min-clear-derived", "50217fb42eed03770f6adab3455b56d8f160d25a845872f6499006a3b56ef192"],
  ["min-clear-joins", "2de56a545f66f8d01350912154b95c28663f3ef8712512400e97b5d96444fc68"], // round 2: the `skipped` reasons
  ["min-clear-lining300", "6e792240271d43879ea9fe432c93a1c26390a664cc89317caa7c3b6ca6c10902"],
  ["min-clear-nib100", "4db5ed0e35604fca30f61b4adb18aed1f9e0230df3d6e63264772b9479bbe9c7"],
  ["min-clear-t45", "da04ce990baae33b4b2fd03d392030fdfbf90c9e425fefe45620ca2d7a46cc8d"],
  ["min-clear-thick2face", "a27d860cc0c4905d0a25759634c5a6eb4cf4bcbac66711f875996e7833b5ee5d"],
  ["min-clear-thick2full", "a27d860cc0c4905d0a25759634c5a6eb4cf4bcbac66711f875996e7833b5ee5d"],
  ["min-clear-thick4b", "9a2208ab93ca520ecdee3cbc11c9dec72952c82767c15401f4838e2714e2c613"],
  ["min-clear", "367f2a9efad686f70a06504e9dbc2b5665195590d8553a4df762f8dc50118c78"], // round 2: the `skipped` reasons beside skipped_walls (round 1: the nib no longer counts in the hall)
  ["offset-fixed", "084509601305bc7bf6b27649efd0c3124fdbac2ab6e97daaf69e22aa05ed021e"],
  ["on-axis", "1a2d6ca631da7360538737b946c0e143b5586b5a905d10497d270f30e0c9890c"],
  ["paper", "ac7b2747b43f45c849dc97c400b810e41a43244d21ba246fbc2bb03e550cb82f"],
  ["refused-limit", "8744e79cb97e882640c5f1feda1291407d108e8e1348b5b7075df6a2df182a9f"],
  ["refused-placement", "8f764cae04d74f29fc9e39ae9f369a9aaf8005c7f71e71cb47347e4b733e434f"], // round 1: a keep in a component is refused where it is written
  ["refused", "99ea1ef2a3b9baaac3d6a9502c4f1c5552f3f7404afe2bf98a336a889293ecf0"], // round 1: numbers through num-format
  ["single-storey-stacked", "df3b4580f7dab78c06067120477533dabf0bd64f8489c4a951ca2bc1a7a7dd78"],
  ["widen-after", "510134f7df24b91da3e61818102bdac8a8afc929d6ff88ce2762ccb28b99bbb7"], // round 2: the `skipped` reasons, and the hint lists them
  ["widen-before", "a4620b68f1174873d84676b230bb3cbc348a31b47cc73d3c05e9cf8054cbd0d9"],
];

suite("keep · K3, the keep rows: a digest table over the corpus", () => {
  it("pins every corpus plan", () => {
    expect(K3_DIGESTS.map(([n]) => n)).toEqual(keepCorpus().map(([n]) => n));
  });
  for (const [name, digest] of K3_DIGESTS) {
    it(name, () => {
      const src = keepCorpus().find(([n]) => n === name)![1];
      expect(k3DigestOf(name, src)).toBe(digest);
    });
  }
});

/**
 * K3's second table (PS4.3b): the keep rows of the surfaces PS4.3b added — `depends.keeps` (top
 * level and per storey) and `impact`'s `keeps` (against itself, and with the first top-level
 * numeric `let` raised by 100) — over the same corpus (`k3bDigestOf`, `./keep-harness.ts`).
 * Pinned in its own table, after the first held unchanged, so PS4.3a's 23 rows above prove
 * PS4.3b moved none of them. The refused plans share one digest: they resolve to no keeps, so
 * every surface reads `null`.
 */
const K3B_DIGESTS: [string, string][] = [
  ["align-equal", "3af24fabb9d0d5167331571be762e14fbcdffcc74104507aa6b62ebf8d53506c"],
  ["grid50-cx", "85034ad8ae82c46c4eae587ae135f6830823b388c9fceb60d935b75c87f584cf"],
  ["instance", "22935e9be5ac4a9d4785a80f421277979bf93b521597ceb5f0e97b3806cefc0c"],
  ["loops", "58b0d7b2813ad9b72c46405c865c806f99a5c9ea98476cfb96769de16ea64439"], // round 1: constrains read the `for`/`if` conditions (N), so `equal width b1 b2` in `if N > 2` is no longer locked; impact rows carry occurrence and span
  ["min-clear-arcbbox", "1f0a9d44252157bb56a1a7f07675300b157c8e0034033b9772baa0990db2e58d"],
  ["min-clear-derived", "f9ca9ac60336002600ec88e4e3ed61dfc38286d6a9122c8b519c9ba77602997e"],
  ["min-clear-joins", "e3017205ecef37293eca7ab1b5dfe5ecd0480298291ba67d1afd5472b94f87a5"],
  ["min-clear-lining300", "58109f9749f73fec3f9de2df2145657ad646d9efef85a87fd4a853a532790c60"],
  ["min-clear-nib100", "58109f9749f73fec3f9de2df2145657ad646d9efef85a87fd4a853a532790c60"],
  ["min-clear-t45", "f100132436d2c4e3482ec3b32cedb2f7865aff54835d4f696df31d9190529355"],
  ["min-clear-thick2face", "891a16d17fd9f8bddf98dd335724298e07f57cc7b922adfb0031bcc439f9e25e"],
  ["min-clear-thick2full", "891a16d17fd9f8bddf98dd335724298e07f57cc7b922adfb0031bcc439f9e25e"],
  ["min-clear-thick4b", "066b437596134a16bdc45200d2fa559b2d17ba39dd290075080fa92376740697"],
  ["min-clear", "0dbbc038ab51b67e1dddc621440cd5135d9538b587b16c0027f0fbaadd987ebc"], // round 1: a hard keep implied by a weaker one is redundant_by_weaker
  ["offset-fixed", "d2e7edcb0b2df02d961a60d144c2f2a96b77deda5dc07b7ca3a452ed16a8d363"], // round 1: a one-lattice-unit (0.001 mm) gap is claimed neither way, so the 0.001 conflict is gone
  ["on-axis", "745d0acf5bb1fafa3094d7c751297b287ab77fd79832c4aa27f4b1ba7806ba53"], // round 1: implied through a weaker keep: by_weaker, redundant_by_weaker
  ["paper", "443c56121dd80b06026c1e2772f016664efe1ee818c58e5687587f7f5a0248e0"],
  ["refused-limit", "eb53f56c39e1cd5c4d2c64fc65520f87336421f4a1ff29dd3ae7129185ec44f5"],
  ["refused-placement", "eb53f56c39e1cd5c4d2c64fc65520f87336421f4a1ff29dd3ae7129185ec44f5"],
  ["refused", "eb53f56c39e1cd5c4d2c64fc65520f87336421f4a1ff29dd3ae7129185ec44f5"],
  ["single-storey-stacked", "eb53f56c39e1cd5c4d2c64fc65520f87336421f4a1ff29dd3ae7129185ec44f5"],
  ["widen-after", "3e59ba4f517a85c7c6565fb3827873e56ff1c506fad931301e5a8d0f83f7990a"], // round 1: impact rows carry occurrence and span
  ["widen-before", "87319d4750cd8c1bc95f3c6502150c81c5a864d2783692f1255d874dc7fec2b8"], // round 1: impact rows carry occurrence and span
];

suite("keep · K3b, the keep rows PS4.3b added: depends.keeps and impact's keeps", () => {
  it("pins every corpus plan", () => {
    expect(K3B_DIGESTS.map(([n]) => n)).toEqual(keepCorpus().map(([n]) => n));
  });
  for (const [name, digest] of K3B_DIGESTS) {
    it(name, () => {
      const src = keepCorpus().find(([n]) => n === name)![1];
      expect(k3bDigestOf(src)).toBe(digest);
    });
  }
});
