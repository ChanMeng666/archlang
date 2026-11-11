# 恢复点

本文件是本计划的恢复点，按 RM-D15 也是全部开发排期的恢复点：其他计划的 handoff 顶部只留一行指向这里（RM0.1 已落地这些指针）。新会话从本节开始读，再按 `README.md` 的"如何使用本文"走。§1.1、§1.1b 是 2026-11-11 06:45Z → 06:50Z 用 `git`、`gh` 读出的；§1.2 的渠道表是 01:20Z 读的（本场没有发布，只重读了 npm：核心 1.58.0、`archlang-mcp` 0.2.41、`archlang-3d` 0.5.0）；动手前重新读一次，状态可能已经变了。

## 1. 位置（2026-11-11 06:50Z）

### 1.1 已合并（`main` 头 `594ba1c7`）

上一场（01:46Z 之前）合并的 #687–#695 见 `git log`；下表是 2026-11-11 第二场合并的，合并时间、合并提交都是 `gh pr view` 读出的。

| PR | 内容 | 合并时间（UTC） | 合并提交 |
|---|---|---|---|
| #697 | RM0.1 余项：VA.4 已归档，O.10、H.1 的归档块追加到 `archlang-lab`；建议关闭 CRF13（不可复现） | 2026-11-11 03:26 | `47c7bc68` |
| #699 | RM0.2b（关 #683）：studio 头注释按原字节长度重写，没有 span 移动；移动三处钉值（double-door 的源哈希、finish-furnish 的 studio 行、manifest 的 `source.sha256`） | 03:59 | `b04cbd07` |
| #700 | RM0.5：biome 2.6.4、vue-tsc 3.3.14，取代 Dependabot #604（GitHub 随后标为已合并，`d13f6509`）；只关 2.6 新增的三条规则，backlog 3.3 记采纳 | 04:21 | `b6edfd8f` |
| #698 | RM1.3a：PS0.3 与 U.1；188 个钉值带理由重钉，两轮红队修了两个种子 | 04:57 | `b385685c` |
| #702 | RM8.4b：`/examples` 与 `/gallery` 每图一个 "Rendered colours" 开关；没有 `GENERATORS` 行（`test/agent-gallery.test.ts` 禁止脚本读 `docs/gallery`，rendered 图在站点构建时生成、不提交）；RM8.4 至此 `done` | 05:20 | `1d5f46a4` |
| #703 | RM5.1：`archlang://capabilities` 资源由真源生成，`INSTRUCTIONS` 891/900，`validate` 返回 `next`；**有意不 bump `packages/mcp`**（`release:pin` 在 1.59.0 bump shim，`scripts/bump-lockstep.ts`；插件清单钉 shim 的精确版本，`scripts/gen-plugin.ts`） | 05:56 | `07ac9554` |
| #701 | RM8.3：3D 室外地面与围栏；地面平面只由查看器画、不进 GLB；室外地面抬高 0.5 mm；增加 courtyard-house 关键帧 | 06:12 | `594ba1c7` |

**`main` 红了（读于 06:50Z）：** issue #705 "main is red after a merge"（自动开）。CI 的 Node 18 job 在 `07ac9554`（run 42969029371）与 `594ba1c7`（run 42970758650）上失败：步骤 "Generated artifacts are in sync" 里 `npm run gen:mcp-capabilities`（#703 引入）报 `TypeError: E.toReversed is not a function`，Node 18 没有 `Array.prototype.toReversed`。`Main red alarm`、CodeQL、Plugin validate 在 `594ba1c7` 上 success；两次推送的 Deploy 都是 skipped。**fix-forward 先于下一个合并**（`cards.md` RM5.1 的实际交付一段）。最近一次 nightly 是 run 42801157907（2026-11-10T10:40Z，success）。

### 1.1b 开着的 PR、分支与 worktree（06:50Z 读）

| PR / 分支 | 头 | 内容 | 合并前还要什么 | worktree |
|---|---|---|---|---|
| #704 `feat/rm1.4-silent-accepts` | `b74a479d` | RM1.4 与 RM1.4b（静默接受改出声，只加 W） | 评审中；`W_GRID_SNAPPED` 的几类遗漏记为 RM1.4c；playground 的编译器路径预算只剩 145 B（457,855 / 458,000） | `.claude/worktrees/agent-a6ccbcc13a1f53060`（锁定） |
| #706 `feat/rm8.1b-wall-lines-followups` | `5c22a8ab` | RM8.1b（一个 `joinedGroups` 开关、由平面建出的近共面夹具、CHANGELOG 措辞） | 修评审意见；follow-up 记为 RM8.1c、RM8.1d | `.claude/worktrees/agent-adf1bdc36223f6e75` |
| #676 Dependabot `three` 0.187 | `94438289` | 3D 依赖 | 等 #706 合并后再单独评估帧哈希与 GLB 字节、许可白名单（RM0.5 仅剩的一项） | — |
| #603 Dependabot `ext-apps` 2.0.4 | `52a44aef` | 主版本 | 按 RM-D19 保持打开，12-02 之后由 RM5.4 迁移 | — |
| 分支 `origin/feat/remove-view` | — | 2.0 才做的移除 `view` | 保留，不在任何排期 | — |

`git branch -r` 现在只剩上表的分支、`origin/feat/remove-view` 与 `origin/main`。RM0.5 删了 12 个已合并 PR 的远程分支（逐个核对是 `main` 的祖先且 PR 为 MERGED）与 `refs/remotes/pr308`；`origin/ChanMeng666-patch-1`（旧 SHA `6c86203a0044838a94150e26ff3178b7dd209d03`）的内容早已由 #568（`02851c1f`）落地，经所有者同意于 2026-11-11 删除；`origin/docs/rm0.2-studio-comment` 在 #699 后删除。

**worktree（`git worktree list`）：** 主检出 `D:/github_repository/archlang`（`main` 在 `b385685c`，落后 `origin/main`）；上表两个 PR 的 worktree；本记录的分支 `docs/roadmap-state-2026-11-11b` 在 `.claude/worktrees/agent-a11ac765b8aaaab6c`（锁定）。**移除任何 worktree 之前**，先用 `[System.IO.Directory]::Delete(<junction>)` 解开其中的 `node_modules` junction（不递归），再 `git worktree remove`；否则删除会顺着 junction 删进主检出（`docs/agents/gotchas.md` § Tooling & process）。被正在运行的会话锁定的 worktree 拒绝 `git worktree remove`（`docs/agents/orchestration.md`）。开着的 issue（读于 06:50Z）：#344、#405、#544、#680、#681、#682、#684、#705。

### 1.2 已发布（1.58.0）

`v1.58.0` 在 `e68fd576`（#689 的合并提交），由代理推出（RM-D24）；GitHub Release `v1.58.0` 发布于 2026-11-10T23:58:46Z，带 `archlang-mcp-0.2.41.mcpb`；`release.yml` run 42924321089 四个 job 全部 success。各渠道（01:20Z 读）：

| 渠道 | 版本 | 怎样读的 |
|---|---|---|
| npm `@chanmeng666/archlang` | 1.58.0 | `npm view` |
| npm `@chanmeng666/archlang-mcp` | 0.2.41 | `npm view` |
| npm `@chanmeng666/archlang-3d` | 0.5.0 | `npm view` |
| npm `@chanmeng666/arch-plan` | 0.1.2 | `npm view` |
| 官方 MCP registry | 0.2.41，`isLatest`，带 `remotes`（`https://mcp.archlang.uk/mcp`） | `registry.modelcontextprotocol.io/v0/servers/…/versions/latest` |
| VS Code Marketplace | 0.46.0 | gallery API |
| Open VSX | 0.46.0 | `open-vsx.org/api/ChanMeng/archlang` |
| ClawHub | 1.58.0 | `clawhub.ai/api/v1/skills/archlang` 的 `latestVersion` |
| OpenAI 插件目录 | 1.58.0：所有者 2026-11-11 报告她已提交并显示为已发布；公开页面靠客户端渲染，没有读到 | 所有者的报告 |
| Docker MCP Catalog | docker/mcp-registry#6704 仍开着（00:24Z 更新），`servers/archlang/server.yaml` 的 `commit` 已指向 `e68fd576`，等 Docker 合并 | `gh pr view 6704 --repo docker/mcp-registry` |

上架表的权威版本在 `docs/seo.md` § 8。`packages/archlang-3d` 在 `main` 上仍是 0.5.0：RM8.1、RM8.2、RM8.3 的改动要等 1.59.0 时一次 bump 才发到 npm。

### 1.4 裁定

- **v1 的 RM-D1…D8** 是所有者裁定（2026-11-06），保留；RM-D4 的主裁定已由 RM-D10 推翻。
- **RM-D9…D16** 所有者 2026-11-11 批准（`README.md` §6.1）。
- **RM-D17…D20** 是 2026-11-11 的受托裁定（§6.2），**RM-D24…D26** 是同日夜间的受托裁定（§6.4）：都只是那一次的委托，不是长期委托，所有者一句话可推翻任何一条。
- **RM-D21** 是所有者的方向，**RM-D22、RM-D23** 所有者 2026-11-11 批准，T 形交接保留真实阴角线的设计默认同日确认（§6.3）。
- **所有者 2026-11-11 决定发布 1.59.0（"我同意发布"）。** 代理在路线图切点（约 11-21）跑整条发布链含 tag，所有者明说提前才提前。bump：核心 minor；`packages/mcp` 的 shim 经 `release:pin`；`packages/archlang-3d`（RM8.1–RM8.3 自 0.5.0 以来）。tag 前的每一项证明在版本号 PR 的分支头上跑完再合并该 PR（§11）。1.60.0、1.61.0 仍要所有者各自的决定。
- **本场的受托裁定（§4 列出，所有者一句话可推翻）：** 见 §4。
- 发布的措辞已由 #694 写进 `docs/agents/iron-laws.md` § Owner policies："once the owner has decided that release: no decision, no tag, and neither a schedule nor an earlier release's decision is one"。每次发布都要所有者对那一次的决定。

## 2. 下一步（按车道）

排期以 `README.md` §3 为准；下面是从实际位置出发的顺序，每条车道从第 1 项做起，前一项合并后再开下一项。一次一个重命令对整台机器生效，本地只跑 `check:quick`（文档加 `docs:build`），重的门禁交给 CI。

**先于一切：** `main` 红着（§1.1，issue #705，Node 18 上 `gen:mcp-capabilities` 用了 `toReversed`）。fix-forward 合并之前不合并别的 PR。

**核心车道（阶段 B，约 11-21 切 1.59.0）：** RM1.3a、RM5.1 已合并（§1.1）。
1. RM1.4 + RM1.4b（#704，评审中）→ 合并。
2. 线下，有余量才做，按此顺序：RM2.1 → RM1.6a → PS7.9。另有 RM1.3b（含本场加的余项）、RM1.4c、RM5.1b、RM0.6、RM7.4；RM1.3c 先要设计裁定。
3. 发布 1.59.0：**所有者已决定**（§1.4）；约 11-21 由代理跑整条链含 tag，步骤按 `.claude/commands/release-check.md`，tag 前的所有证明在版本号 PR 的分支头上跑完再合并（§11）。bump 三处：核心 minor、`packages/mcp` shim 经 `release:pin`、`packages/archlang-3d`。

**视觉车道：** RM0.2b、RM8.3、RM8.4、RM8.4b 已合并。
1. RM8.1b（#706，修评审意见）→ 合并。
2. #676（`three` 0.187，RM0.5 仅剩的一项）：#706 合并之后单独评估帧哈希与 GLB 字节。
3. 小件，空档里做：RM8.1c（`linesOf` 的耗时）、RM8.1d（共线对接墙的窗位拓扑，先调查）、RM8.3b（庭院地面的深度精度）。
4. 之后按 `README.md` §3：阶段 D 的 RM8.5 → RM8.6（冻结之后；RM8.10 先要设计裁定）；阶段 E 的 RM8.7 → RM8.8 → RM8.9（两张 `[语法：词表]` 卡等 PS7.9）。

**卡与卡之间的杂项：** RM0.5 只剩 #676；O.10、H.1 的归档与 CRF13 已由 #697 处理；RM0.6 修归档脚本。

**给执行者的简报加一行：** 执行者写的状态文件按卡命名（例如 `state-rm1.3a.md`），不叫 `state.md`：同一会话的代理共用一个 scratchpad，2026-11-11 有两个代理互相覆盖了对方的 `state.md`。

**冻结期（11-24 → 12-01）：** RM1.1a（量 1.59.0；到 11-23 没打 tag 就量冻结时 `main` 的提交并记下完整 SHA）、X9、RM5.3（冻结期合不了就顺延到阶段 D）、五份设计稿（`design/` 冻结期才建，含第 8 轨的 `visual-language.md`；`slab-and-section.md` 按 RM-D17 定净高子句的拼写）、RM1.8。

**阶段 D、E、F：** 见 `README.md` §3。阶段 D 的 RM5.4（#603 的迁移）12-02 之后才开工；阶段 E 的 1.61.0 约 01-05 切，RM1.1b 在 01-06 → 01-08 量；阶段 F 的首位是 RM6.1（2027-01-10 起）。

## 3. 日历

| 日期 | 事 | 规则 |
|---|---|---|
| 约 2026-11-21 | 切 1.59.0 | **所有者已决定（2026-11-11，"我同意发布"）**；代理在切点跑整条链含 tag，所有者明说提前才提前。切点后合并的 minor 内容等 12-02 |
| 2026-11-24 → 12-01 | Show HN 冻结 | 只合 bug 修复、测量与文档，只发 patch，不加语言形式，不发 minor（`cards.md` §0；`README.md` §1.3）。RM8.1 这类查看器缺陷修复可以合；RM8.2、RM8.3 这类不是缺陷修复的不合 |
| 2026-12-01 | Show HN，所有者亲自发 | growth 的 Show HN 物料已由 growth PR #68 刷新；X9 的回答稿只写 1.59.0 里已发布的事实。geo-seo 的面板同日，路线图建议挪到 12-02 |
| 2026-12-02 → 12-16 | 批次 C′（阶段 D） | 1.60.0 约 12-21 切，避开 Product Hunt（约 12-15）那一周；所有者对那一次发布的决定 |
| 12-17 → 2027-01-09 | 波次 2′（阶段 E） | 1.61.0 约 01-05 切；RM1.1b 01-06 → 01-08 |
| 2027-01-09 | agent-reach 读数（窗口到 01-05） | 附 RM7.3 的三项自检 |
| 2027-01-10 起 | 批次 D（阶段 F），RM6.1 首位 | 前提：PS7.9 已合并，`slab-and-section.md` 已写 |
| 2027-01-31 | RM-D2 读数（窗口到 01-28） | 附 RM7.3 的三项自检；不足两项时收缩到轨 1、4、7（RM-D2） |

## 4. 只有所有者能做的事，与仍等所有者的裁定

- 决定 1.60.0、1.61.0 是否、何时发布（1.59.0 已于 2026-11-11 决定，见 §1.4）（建议节奏见 `README.md` 原则 11）。决定之后 tag 与发布链由代理跑，只在 OTP/2FA、登录、账号或令牌或 secret 的创建、条款与声明的确认、本机文件选择器处停下。
- 2026-12-01 亲自发 Show HN。
- 需要接受条款或声明的提交（例如 OpenAI 插件目录的每次提交），以及 Cloudflare 控制台的改动（`docs/seo.md` § 8 的提交政策）。
- 仍等所有者的裁定（`README.md` §6 与 §6.2 末尾）：PS0.18（Hall 往返成 `uses entry`，RM3.1 的范围表用到，未裁则标 `dropped`）；MF-D3(b)；backlog D.7（RM4.1 用到）、M.9（RM1.5b）、M.8、M.14、3.1(b)、CI throughput 的 E 与 F；仓库根的 `.mcp.json` 做不做（默认不做）；VA.3。
- 新卡里要先有设计裁定的两张：RM1.3c（6.11，双开门）与 RM8.10（两种墙高的 T 形缺口，涉及 ADR 0030 决定 3、5）。由主会话起草设计，裁定的归属按 `README.md` §6 的惯例：动铁律或 ADR 的要所有者。
- 任何一条受托裁定（RM-D17…D20、RM-D24…D26），所有者都可以一句话推翻。
- **2026-11-11 第二场的受托裁定（同样可一句话推翻）：** 3D 的地面是查看器的背景，不是元素，不进 GLB（`../public-surfaces/3d.md` §2 的固定句不改）；MCP 能力页保持派生的 `repair` 标题 "Repair furniture placement"（是标题，不是承诺）；MCP 的版本在发布时 bump，不在 #703；RM1.4：触发 `W_GRID_SNAPPED` 的已发布示例改写成吸附后的值（图字节恒等），`W_UNKNOWN_THEME` 也由 CLI 的 `validate`、`lint` 报出；biome：只关 2.6 里真正新增的规则；CRF13 以"不可复现"关闭。

## 5. 怎样合并

- 串行合并：required checks 是 strict 的，一个 PR 合并后其余都会 `BEHIND`。按层级（`node scripts/risk-tier.mjs`；`docs/agents/commands.md` § Merging a PR）：low 在 CI 绿后合；medium 另要一次新上下文评审；high 还要主会话的判断（所有者 2026-11-09 的长期批准）。每个 PR 至多两轮红队。
- 队列做法：逐个"更新分支 → 等新头上的全部检查 → 用完整 40 位 SHA `--match-head-commit` 合并"，不删除任何东西。2026-11-11 用的脚本是 `mq.sh`（`D:\.claude-scratch\2026-11-11\mq\mq.sh`，从主检出运行，`state.txt` 作锁；同一脚本的副本在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\mq.sh`）。
- `main` 动过生成文件（`test/INDEX.md`、`docs/agents/module-map.md` 等）时，冲突的分支不用 `gh pr update-branch`，也不手解：在本地合并 `main`，`npm run gen:all`，提交、推送，再钉新头（`docs/agents/gotchas.md` § PRs & CI）。
- 3D 回放的改动：除了终帧与海报，还要比对升墙中途的帧（`cards.md` §0）。关键帧从 CI 打印的哈希重钉，`check-3d` 红着不合并（`.claude/rules/archlang-3d.md`）。
- 执行者可能长时间等待时，先写状态文件；机器忙时小改动先提交，报告"门禁未跑"（`cards.md` §0；`docs/agents/orchestration.md`）。本地跑不了指定的 vitest 文件（门禁钩子挡住），以 CI 为准；不用自制的替身代替 vitest。

## 6. 首次接触复测的测量表（RM1.1a、RM1.1b）

固定句（RM-D3）："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名，不叫 benchmark。`../plan-soundness/handoff.md` §4 只留一行指针指向本表；该表里 2026-10-27 及更早的行原样保留。

RM1.1a 的兜底：1.59.0 到 2026-11-23 还没打 tag，就量冻结时 `main` 的提交，"量的版本"一栏写完整 SHA，"说明"一栏写第一个包含它的版本（CR10 的发布说明引这两样）。

| 卡 | 量的版本（或 SHA） | N 个缺陷 | lint 报出 k 个 | 日期 | 说明 |
|---|---|---|---|---|---|
| RM1.1a | 1.59.0 | | | | |
| RM1.1b | 1.61.0（01-06 → 01-08，附在 01-09 读数里） | | | | |

## 7. 另一仓库（archcanvas-growth）

- **growth PR #68 已合并**（2026-11-11T01:06:35Z，`d0cbb2f1`）：决策记录 `strategy/decisions/2026-11-11-archlang-roadmap-v2-rulings.md`（所有者的 RM-D9…D16、RM-D21…D23 与发布措辞；受托的 RM-D17…D20、RM-D24…D26，分开记）；Show HN 物料刷新（`anticipated-comments.md` 的 winders、runbook 的 "It does 3D now" 与日期、`draft.md` 的 "Not scheduled"）；`research/cross-report-corrections.md` 的四处规则目录勘误与 RM-D5 已裁的退界一项；2026-11-09 外联日志的一条更正；`positioning.md`、`master-plan.md`、`category.md` 等按 1.58.0 改正。本文旧版 §5 列的 growth 待办因此都已完成，读数日的 RM7.3 除外。
- **还欠 growth 的：** (1) #68 写的是 #694 当时还开着；#694 已于 2026-11-11T00:59Z 合并（`c5513950`），决策记录下次动时补一句。(2) 读数日（2027-01-09、2027-01-31）附 RM7.3 的三项自检。(3) RM6.1 开 PR 时，所有者在 #532 承诺的"I will post here when the section-line card has a PR"要兑现（这是本仓库的 issue，不在 growth）。
- 本仓库欠的：RM-D5 的 drawing-set D 记录随 RM1.2b 第 3 条的 PR 一起落。

## 8. 外部贡献者

- **gerontec**（#532、#533、#544）：PR #533（`winders`）已合并（`0617d272`）并随 1.58.0 发布。#544 的回复已发出（<https://github.com/ChanMeng666/archlang/issues/544#issuecomment-6782842533>，2026-11-11T00:06:55Z）：`winders` 已发布；两个事实排在 2027-01-10 起的批次首位，设计稿在 11 月最后一周，会在 #544 贴链接请他看；欢迎 ST.2 的 PR；`archlang-section` 列进 docs（随 #693 合并）。**承诺了要做的：** 设计稿 `slab-and-section.md` 写成后在 #544 贴链接；RM6.1 开 PR 时在 #532 留言。他以 MIT 给的 `haus_winders.arch` 还没有当夹具用。跟进项 backlog ST.2（行走线画成弧）、ST.3（3D 把 winder 平台建成平的）。fork PR 的每次推送都要 `gh api -X POST .../actions/runs/<id>/approve` 才跑 CI。
- **bobsch-io（Daniel）**：#362 的事实说明已发出（<https://github.com/ChanMeng666/archlang/issues/362#issuecomment-6782843000>，00:06:56Z），没有提问。按 Daniel 规则不再发第二条，不向他提问，不按他的答复排期；RM4.4 的触发只有他的下一批 issue 或所有者一句话。
- **#405**：补记已发出（<https://github.com/ChanMeng666/archlang/issues/405#issuecomment-6784462072>，2026-11-11T01:40:06Z，01:45Z 读）：L 形洞口栏杆已在 1.55.0 交付；清单其余各项是卡 RM4.4。RM0.4 至此做完。
- **#344**：在等提问者给样本 mask 和类别名，不是欠。
- 开着的 issue（01:24Z）：#344、#405、#544、#680–#684。#683 由 RM0.2b 关闭；#684 由 RM1.8 回答；#680、#681、#682 分别是 RM1.6a/b、RM7.2、RM4.3。

## 9. 与 math-foundations 的交集（2026-11-10）

- RM6.1 = MF-D1 + DS11；
- RM1.4 覆盖 F11；
- RM1.5b 覆盖 MF3（E.11、M.9 两条）；
- RM1.2b 覆盖 MF6 的湿区部分；
- MF1 在阶段 E 线下，排在 RM1.1a 之后，随后是 RM1.7（转身空间）；
- MF-D1 已于 2026-11-10 委托裁定：采纳 RM6.1 的楼板 datum，设计和排期都不变（批次 D 首位），只增补 MF-D11；语义见 `../math-foundations/` §6.1。v2 不改这一条（RM-D13 的建议是维持）。RM6.1 的 PR 还要处理两件事：一是顶层和单层的天花从哪里来（MF-D11，已由 RM-D17 受托裁定）；二是字节恒等律要写成"一层楼板都没写的图，`describe()` 一字不变"。
- MF-D2 已于同日委托裁定：挂顶物和窗帘作为物体做，照明不做。`README.md` §4 那一行已改写；MF-D7（RCP）仍待裁定。

## 10. 证据存放

- v1（2026-11-06）：研究报告与评审在 `D:\github_repository\claude-kept\2026-11-06-archlang-product-roadmap\`（A 战略、B 用户与竞品、C 现状、D 红队、E/F #533 两轮评审、G #545 评审）。
- v2 与之后（2026-11-10 → 11-11）：`D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\`，三个子目录加一个：
  - `plan-refresh\`：v2 的五份报告 A–E、红队 F 与第二轮 G、初稿与修订规格；
  - `visual-track\`：第 8 轨的三份调查 V1–V3、规格、#691 的两轮评审 R1、R2，修复前的图 `img\` 与修复前后（含升墙中途）的对照图 `after\`；
  - `release-1.58.0\`：#689、#692、#693、#694、#695 的评审 H、I、J、K、L；
  - `rm1.3a\`：RM1.3a 执行者的字段级差异、两次全语料对比与门禁日志；
  - **2026-11-11 第二场（#697–#703）的评审报告在会话 scratchpad 里，没有保留。** 可查的只有各 PR 的评论与提交、本文与 `cards.md`；若要保留，须在会话结束前移进 `claude-kept`。
  - 目录根上还有 `session-state-2026-11-11.md`（主会话的状态记录，中文）与 `mq.sh`。
- `evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径、issue/PR 号或本仓库路径（v2 在 §G，第 8 轨在 §H，2026-11-11 新增的卡在 §I），报告本体不进本仓库。

## 11. 事故：1.58.0 的版本号 PR 与 tag 之间隔了 9 小时 38 分（2026-11-10）

版本号 PR #689 在 2026-11-10 13:55Z 合并，`v1.58.0` 在 23:33Z 才推出。这 9 小时 38 分里，`https://archlang.uk/arch-plan.js` 指向 npm 上还没有的核心版本，`<arch-plan>` 嵌入加载失败。停滞的原因没有查清，这里不写。

教训：tag 之前的每一项证明（例如 `prove:pack`、各检查）都在发布分支的头上跑完，再合并版本号 PR；这样合并之后只剩 pull、tag、push。停顿的原因没有查明；作为一般做法，无人值守的关键路径上不放任何可能弹出权限确认的命令（`rm` 在内）。同一条记在 `docs/agents/gotchas.md` § PRs & CI。

## 12. 过程教训（2026-11-11 第二场）

- **重门禁锁被覆盖过一次：** 一个代理无条件地写了 `free`，把别人的持锁行抹掉。释放锁只在锁里仍是自己写的那一行时才写 `free`。
- **新 worktree 的 `node_modules` 是指向主检出的 junction。** 依赖 PR 合并之后，要在主检出里跑 `npm install`，否则每个 worktree 的门禁都用着旧工具（2026-11-11 的 biome：worktree 里还是 2.5，`main` 已是 2.6）。
- **Node 18 是 CI 的一档：** 用了 Node 20+ 才有的数组方法（如 `toReversed`）的生成器，本机（新 Node）绿，CI 的 Node 18 红（#703，§1.1）。
