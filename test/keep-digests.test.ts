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
import { k3DigestOf, keepCorpus } from "./keep-harness.js";

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
