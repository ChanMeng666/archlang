# Band Envelope 探针

一次性调研代码，不是产品代码，不要 import。扩展名用 `.txt`，这样 Biome 不会把它算进仓库门禁。DS13 从这里理解算法，然后重写。

```bash
npm run build
SPIKE_OUT=../spike-out node --input-type=module < docs/plans/drawing-set/spike/band-envelope.mjs.txt
```

从仓库根目录运行，读 `packages/archlang-3d/dist`，把 SVG 写到 `SPIKE_OUT`（默认 `spike-out`，不要提交）。

2026-11-02 在 `main@18127701`、Windows、Node 24 上的结果：4807 个 shell，非棱柱 0；打乱输入字节差异 0；预言机 32,400 样本 0 不符；216 张图约 0.7 s。跨机和浏览器未测。

已知缺陷：从三角形反推棱柱（产品要用收集器）、无楼梯、无地坪线、无标注、曲面墙有条纹、家具被 poché。算法说明见 `../research/2026-11-02-section-elevation.md` §3。
