# 恢复点

**位置（2026-11-06）：** 计划已写、经一轮红队修订，未开工，未提交。基线 `main@5593484d`（core 1.57.0）。Q1–Q7 已由所有者委托裁定为 RM-D1…D7（`README.md` §6），所有者可一句话推翻；排期与 §4 不做清单仍待所有者过目。

**下一步：**
1. 所有者过目 `README.md` §3、§4、§6；没有异议即开工。
2. 波次 0 从 RM0.1 开始，按 `README.md` §3 表的顺序（RM5.1 在 RM3.1 之前）：一张卡一个 worktree，一个执行者，一次一个重命令。
3. 约 11-21 切 minor；切点后未合并的 minor 内容等 12-02。冻结期只做 RM1.1a（复测）与 X9。
4. `evidence.md` 由 README/cards 的第二版重新对齐（RM0.2、RM1.1、RM3.2 是红队后新增的卡）。

**另一仓库的待办（growth，由另一会话执行，一个 PR）：** RM-D7 的 `strategy/category.md` §5 与 `strategy/master-plan.md` §1 刷新稿；RM-D1 的 `positioning.md` 开发室一句话 + 决策记录；RM-D2 的 2027-01-31 收缩触发决策记录（四项指标见 README §6）。本仓库：RM-D5 的 drawing-set D 记录随 RM1.2b 第 3 条的 PR 一起落。

**外部贡献（2026-11-06）：** PR #533（gerontec，`winders` 子句）与 issue #532（剖面 PoC）。#533：fork 工作流已批准，**CI 全绿**（19 项）；独立评审（`D:\.claude-scratch\2026-11-06\archlang-roadmap\E-review-pr533.md`）判"修四项后合并"，已以 request-changes 发在 PR 上（梯级记法、GBNF、字节恒等律、"no true helix"）；形式本身按 RM-D8 / preview-and-remodel D46 接受（等所有者一句话）。贡献者改完后：再跑一轮评审（只读新 diff，最多两轮），CI 绿，medium 层级即可合并；合并后加 CHANGELOG `[Unreleased]` 行与 3D 平台跟进卡。#532：已回复，剖面诉求作为触发写进 README §5 与卡 RM6.1（批次 D 首位）；向对方提了两个可选请求（列入 docs 生态行、公开 `haus_winders.arch`）。growth PR #56 承载 RM-D1/D2/D7，等所有者审。

**并行会话：** `plan/geo-seo-wave3`（geo-seo 计划）与 `feat/3d-v2-copy`（PR #529）在飞；`docs/plans/README.md` 的程序表两边都要加行。

**证据存放：** 三份只读报告 + 红队在 `D:\.claude-scratch\2026-11-06\archlang-roadmap\`（A 战略、B 用户与竞品、C 现状、D 红队）。所有者确认后移到 `D:\github_repository\claude-kept\2026-11-06-archlang-product-roadmap\`；`evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径，报告本体不进本仓库。
