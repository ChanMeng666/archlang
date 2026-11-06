# 恢复点

**位置（2026-11-06）：** 计划已写、经一轮红队修订，未开工，未提交。基线 `main@5593484d`（core 1.57.0）。Q1–Q7 已由所有者委托裁定为 RM-D1…D7（`README.md` §6），所有者可一句话推翻；排期与 §4 不做清单仍待所有者过目。

**下一步：**
1. 所有者过目 `README.md` §3、§4、§6；没有异议即开工。
2. 波次 0 从 RM0.1 开始，按 `README.md` §3 表的顺序（RM5.1 在 RM3.1 之前）：一张卡一个 worktree，一个执行者，一次一个重命令。
3. 约 11-21 切 minor；切点后未合并的 minor 内容等 12-02。冻结期只做 RM1.1a（复测）与 X9。
4. `evidence.md` 由 README/cards 的第二版重新对齐（RM0.2、RM1.1、RM3.2 是红队后新增的卡）。

**另一仓库的待办（growth，由另一会话执行，一个 PR）：** RM-D7 的 `strategy/category.md` §5 与 `strategy/master-plan.md` §1 刷新稿；RM-D1 的 `positioning.md` 开发室一句话 + 决策记录；RM-D2 的 2027-01-31 收缩触发决策记录（四项指标见 README §6）。本仓库：RM-D5 的 drawing-set D 记录随 RM1.2b 第 3 条的 PR 一起落。

**外部贡献（2026-11-06 → 11-07，已完结）：** PR #533（gerontec，`winders` 子句）两轮评审后**已合并**（merge `0617d272`；两份评审在 claude-kept `2026-11-06-archlang-product-roadmap/E-*.md`、`F-*.md`）。第二轮独立复算了新法则的 23 行 digest（取自 main）和 K1 重取（324 行里 6 行动，只因目录文案），CHANGELOG 的 `[Unreleased]` 冲突由主会话合入 main 解决（fork 允许维护者编辑）。跟进：backlog ST.2（折线行走线应画成弧，只动有 winders 的图）、ST.3（3D 包把 winder 平台建成平的）。#532 随 #533 自动关闭，剖面那一半在 **issue #544** 继续（卡 RM6.1）。growth PR #56（RM-D1/D2/D7）已合并。fork PR 的每次推送都要 `gh api -X POST .../actions/runs/<id>/approve` 才跑 CI。

**并行会话：** `plan/geo-seo-wave3`（geo-seo 计划）与 `feat/3d-v2-copy`（PR #529）在飞；`docs/plans/README.md` 的程序表两边都要加行。

**证据存放：** 研究报告与评审在 `D:\github_repository\claude-kept\2026-11-06-archlang-product-roadmap\`（A 战略、B 用户与竞品、C 现状、D 红队、E/F #533 两轮评审、G #545 评审）。`evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径，报告本体不进本仓库。
