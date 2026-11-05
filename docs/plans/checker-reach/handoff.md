# checker-reach：交接

新会话的恢复点，每张卡合并后更新。计划与决定见 `README.md`。

## 1. 当前位置

- 第 A、B 批全部合并（CR0–CR8，含 SECURITY.md 去重），已发布。版本以 npm 和 tag 为准。
- 线上已核实：短链接 `/s/<id>`、预览图 `/s/<id>.png`（真实户型，不是兜底图）、3D 自由旋转。
- 定位裁定 A3（2026-11-06 授权裁定，见 `docs/plans/public-surfaces/README.md` §6）：泛称“能检查其他开放格式的方案”须等 OAS 也发布后才可用；现在只可在功能说明中写“导入 OpenPlan3D JSON（`archlang import --from openplan3d`）并像任何方案一样检查”，不作标题或主打宣传。
- 后续卡见 `README.md` § 3 末尾的“后续卡”，按序号做，做完删行。

## 2. 接下来，按序

1. 冻结期 2026-11-24 → 2026-12-01（Show HN）：只修缺陷，可发补丁版；核对 Show HN 文案，演示链接用短链接和它的预览图；看短链接计数和错误日志。
2. 冻结前若有余量，先做后续卡 CRF1（洞口切分让墙面碎片化）。
3. 第 C 批 CR9–CR12，然后第 D 批。

## 3. 开工前

`git fetch --all --prune`；从 `origin/main` 开分支；`npm ci`；先看当前日期与开放 issue。
