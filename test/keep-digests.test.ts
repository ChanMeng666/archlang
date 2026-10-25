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
  ["min-clear", "7a1b1cdd05f48e78e5297b06662c7cebb358af610ae86e26fc71690e8b8d0a8c"],
  ["offset-fixed", "084509601305bc7bf6b27649efd0c3124fdbac2ab6e97daaf69e22aa05ed021e"],
  ["on-axis", "1a2d6ca631da7360538737b946c0e143b5586b5a905d10497d270f30e0c9890c"],
  ["paper", "ac7b2747b43f45c849dc97c400b810e41a43244d21ba246fbc2bb03e550cb82f"],
  ["refused-limit", "8744e79cb97e882640c5f1feda1291407d108e8e1348b5b7075df6a2df182a9f"],
  ["refused-placement", "86a9b20fea28195f2b7c6739ad0fa574cc95d0c047b569794196b5ee6abf72cb"],
  ["refused", "a55e78f449894eb0d3793b2d52d8a8dcbf6b184b11da2a0450580f5578ea389c"],
  ["single-storey-stacked", "df3b4580f7dab78c06067120477533dabf0bd64f8489c4a951ca2bc1a7a7dd78"],
  ["widen-after", "654e0d516874a610bbb733e39ab5645e7062b6b666756acadc7ad8bd7a15975e"],
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
