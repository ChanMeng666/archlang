# 恢复点

本文件是本计划的恢复点，按 RM-D15 也是全部开发排期的恢复点：其他计划的 handoff 顶部只留一行指向这里（RM0.1 已落地这些指针）。新会话从本节开始读，再按 `README.md` 的"如何使用本文"走。§1.1、§1.1b 是 2026-11-11 12:23Z 用 `git`、`gh` 读出的（本机的 `date -u` 读数）；§1.2 的渠道表是 01:20Z 读的，12:23Z 只重读了 npm：核心 1.58.0、`archlang-mcp` 0.2.41、`archlang-3d` 0.5.0（1.59.0 尚未发布）；动手前重新读一次，状态可能已经变了。

## 1. 位置（2026-11-11 12:23Z，`main` 头 `9a3be392`）

### 1.1 已合并（第二场，`main` 头 `9a3be392`，12:23Z 用 `git`、`gh` 读）

上一场（01:46Z 之前）合并的 #687–#695 见 `git log`；下表是 2026-11-11 第二场合并的，合并时间与合并提交都是 `gh pr view` 读出的，按合并先后排。

| PR | 内容 | 合并时间（UTC） | 合并提交 |
|---|---|---|---|
| #697 | RM0.1 余项：VA.4 已归档，O.10、H.1 的归档块追加到 `archlang-lab`；CRF13 经协调者核对后以"不可复现"关闭 | 2026-11-11 03:26 | `47c7bc68` |
| #699 | RM0.2b（关 #683）：studio 头注释按原字节长度重写，没有 span 移动；移动三处钉值 | 03:59 | `b04cbd07` |
| #700 | RM0.5：biome 2.6.4、vue-tsc 3.3.14，取代 Dependabot #604；只关 2.6 新增的三条规则（backlog 3.3 记采纳） | 04:21 | `b6edfd8f` |
| #698 | RM1.3a：PS0.3 与 U.1；188 个钉值带理由重钉，两轮红队修了两个种子 | 04:57 | `b385685c` |
| #702 | RM8.4b：`/examples` 与 `/gallery` 每图一个 "Rendered colours" 开关（RM8.4 至此 `done`） | 05:20 | `1d5f46a4` |
| #703 | RM5.1：`archlang://capabilities` 资源由真源生成，`validate` 返回 `next`；有意不 bump `packages/mcp`（`release:pin` 在发布时 bump shim） | 05:56 | `07ac9554` |
| #701 | RM8.3：3D 室外地面、围栏与地面背景（背景只由查看器画、不进 GLB） | 06:12 | `594ba1c7` |
| #706 | RM8.1b：`joinedGroups` 纯函数、近共面夹具、CHANGELOG 措辞 | 06:56 | `8fdfc05c` |
| #708 | 修 `main` 的红（#705）：tsx 的 tsconfig 加载器跟随 `extends` 时用 `toReversed`（Node 20+），该配置改为自包含；有意没有新上下文评审 | 07:16 | `edaf76c2` |
| #709 | RM0.5：`three` 0.187，取代 Dependabot #676；零个钉值移动 | 07:39 | `0c12ac58` |
| #707 | 上一份记录 PR（本文与 `cards.md` 的 08:07Z 版本） | 08:25 | `7059a979` |
| #704 | RM1.4 + RM1.4b：五条新 W（`W_LENGTH_IN_METRES`、`W_GRID_SNAPPED`、`W_SET_VALUE_WORD`、`W_UNKNOWN_FURNITURE`、`W_UNKNOWN_THEME`）；编译器路径预算 458,000 → 458,980（协调者的裁定） | 08:43 | `bb912513` |
| #712 | RM2.1："Edit one room" 起手样例（playground）、`impact --lock` 提到编辑技能的第一步 | 09:36 | `6059e52a` |
| #711 | RM8.1d（核心修复）：`boxesOverlap`、网格查询与 `PointInterner` 都按 `SNAP_MM` 融合；语料字节恒等；只有绘制工作计数 `joinerySplitTests` 的表重取；互操作的 oracle 测试换成暴力参照 | 10:10 | `fcd56b27` |
| #714 | PS7.9：spec 29,856 → 28,605 单位，余量 1,394，上限不动 | 10:43 | `68e11769` |
| #715 | 设计稿 `design/visual-language.md`（第 8 轨） | 10:46 | `f122125b` |
| #716 | 所有者裁定 RM-D27 与四份设计稿 | 10:59 | `bfd63c4c` |
| #718 | playground：gallery 选样例后的过期渲染不再重置旋钮的编辑 | 11:12 | `4e4ab643` |
| #713 | RM1.6a：规则出处成数据（`src/lint/provenance.ts`）与 `lint --rules`；编译器路径 +74 B（协调者接受） | 11:22 | `9a3be392` |

**`main` 红过一次，已修：** #703、#701、#706 的 `main` 提交在 Node 18 job 上红（`gen:mcp-capabilities` 报 `E.toReversed is not a function`），自动开了 issue #705，#708 修复（07:16Z 关闭）。**08:07Z 之后 `main` 的状态（12:23Z 读）：** `9a3be392` 上 CI、CodeQL、Plugin validate 都 success（CI run 43011402472）；`Main red alarm` 三次 success。**没有解释的一项：** `Deploy (Cloudflare)` 在 `9a3be392` 上有三次 `workflow_run`，11:27 与 11:40 success，11:49:49Z 的 run 43015163598 failure：`Deploy mcp (scripted Worker)` 的 smoke 报 `/svg/<studio.arch payload>: the pinned copy is not immutable: public, max-age=300, stale-while-revalidate=86400`（`/` 与 `/mcp` 两项通过，playground、docs 部署 success）。本记录没有调查原因，也没有人认领，见 §2 的核心车道。issue #717 "Nightly checks need attention"（10:39Z 开，`secrets` job failure）也还没有分诊。

### 1.1b 开着的 PR、分支与 worktree（12:23Z 读）

| PR / 分支 | 头 | 内容 | 合并前还要什么 | worktree |
|---|---|---|---|---|
| #720 `release/1.59.0` | `f467dfe0` | 发布 1.59.0 的版本号 PR（非草稿，`CLEAN`） | 协调者在分支头跑完 tag 前的证明；**在 `v1.59.0` tag 之前，任何 PR 都不得合并进 `main`**；结果由协调者补记 | `.claude/worktrees/agent-aa4124c51aa4d1c6d`（锁定） |
| #719 `feat/rm8.5-vocabulary-showcase` | `915bb1f3` | RM8.5：样张工具、103 张目录图、两个展示示例（草稿）。PR 标题写着 "gate not run"，正文写本地 `check:quick`、`docs:build` exit 0（合并 `main` `9a3be392` 之后），等 CI（标题与正文不一致，以正文的 Handoff 一节为准） | 新一轮评审必须细看 `test/rectilinear-rooms-byte-identity.test.ts` 新增的 `AFTER_THE_FORM` 排除名单与 `test/finish-furnish.test.ts` 的 `CORPUS_PARTLY` 行（测试前提的改动，协调者已同意）；CI-only 套件见正文 | `.claude/worktrees/agent-acb5baa0bf7b0a2ab`（锁定） |
| #721 `feat/rm6.1-slab-and-section` | `864684d1` | RM6.1 第一半：`level` 的 `slab`、`clear` 与 `height … clear`（草稿）；剖切符号没有开始 | **playground 编译器路径超预算 848 B**（459,828 对 458,980），e2e 会红；先做 §2 的预算卡；正文 Handoff 一节有剖切符号的两个问题 | `.claude/worktrees/agent-a2e77c66e3d14d3fe` |
| #603 Dependabot `ext-apps` 2.0.4 | `ec89bbad` | 主版本 | RM-D27 取消了 12-02 的日期，但主版本升级仍等所有者（RM5.4） | — |
| 本记录 `docs/session-record-2026-11-12` | 见 `gh pr list` | 本文、`cards.md`、`gotchas.md`、`orchestration.md` | 发布 tag 之后，由协调者补发布结果再合并 | `.claude/worktrees/agent-a4233610ba116d927`（锁定） |
| 远程分支 `origin/feat/remove-view` | — | 2.0 才做的移除 `view` | 保留，不在任何排期 | — |

`git branch -r`（12:23Z）：`origin/main`、`origin/feat/remove-view`、上表四个 PR 的分支（含 `origin/dependabot/npm_and_yarn/modelcontextprotocol/ext-apps-2.0.4`）。`origin/ChanMeng666-patch-1` 已由所有者同意删除（内容早已由 #568 落地）。开着的 issue：#344、#405、#544、#680、#681、#682、#684、#717。

**worktree**（`git worktree list`，12:23Z）：主检出 `D:/github_repository/archlang`（`main` 在 `9a3be392`）与上表四个。**移除任何 worktree 之前**，先用 `[System.IO.Directory]::Delete(<junction>)` 解开其中的 `node_modules` junction（不递归），再 `git worktree remove`（`docs/agents/gotchas.md` § Tooling & process）；被正在运行的会话锁定的 worktree 拒绝 `git worktree remove`（`docs/agents/orchestration.md`）。

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
- **所有者 2026-11-11 决定发布 1.59.0**（原话"我同意发布"，所有者在会话里说的，由协调者转述，我没有核对原始消息）。代理在路线图切点（约 11-21，路线图的日期；"所有者明说才提前"是协调者的读法）跑整条发布链含 tag。bump：核心 minor；`packages/mcp` 的 shim 经 `release:pin`；`packages/archlang-3d`（RM8.1–RM8.3 自 0.5.0 以来）。tag 前的每一项证明在版本号 PR 的分支头上跑完再合并该 PR（§11）。1.60.0、1.61.0 仍要所有者各自的决定。
- **第二场的受托裁定与仍未答复的所有者裁定：** 见 §4。
- **RM-D27 是所有者裁定（2026-11-11，`README.md` §6.5，原话照录在那里）：** 阶段日期与 11-24 → 12-01 的冻结期不再挡任何卡的开工或合并；卡在真实依赖满足时开工。仍然成立：铁律；每次发布要所有者对那一次的决定（1.59.0 已决定，1.60.0 起每次另要）；动铁律或 ADR 的设计裁定与主版本的依赖升级归所有者；CI 绿是合并证据；所有者 12-01 亲自发 Show HN，那之前 `main` 保持绿。
- 发布的措辞已由 #694 写进 `docs/agents/iron-laws.md` § Owner policies："once the owner has decided that release: no decision, no tag, and neither a schedule nor an earlier release's decision is one"。每次发布都要所有者对那一次的决定。

## 2. 下一步（按车道）

排期以 `README.md` §3 为准；下面是从实际位置出发的顺序，每条车道从第 1 项做起，前一项合并后再开下一项。**按 RM-D27，顺序就是全部的门：** 一项的真实依赖满足了就开工，不等阶段日期或冻结期。**在 `v1.59.0` tag 之前不得合并任何 PR 进 `main`**（#720 在途）；tag 之后按 §5 的队列合并。一次一个重命令对整台机器生效，本地只跑 `check:quick`（文档加 `docs:build`），重的门禁交给 CI。

**核心车道（阶段 B 已完成，1.59.0 在途）：**
1. **预算卡（新，高优先）：playground 编译器路径预算已用尽。** 基线 `bfd63c4c` 为 458,294 B（余 686 B），#721 实测 459,828 B，超 `compilerPathBudget`（458,980 B）848 B；每个新语法形式或诊断都让编译器 chunk 变大。结构性做法：把诊断目录的文字与 CLI manifest 移出编译器路径（惰性或按需加载），先量（每块占多少），再一次性重取预算并留出余量；不抬上限而不先削掉可证明的重复（`.claude/rules/sites.md`）。**它挡住 RM6.1（#721 的 e2e）与词表卡 RM8.7、RM8.9。**
2. RM6.1 第一半（#721）评审并合并；第二半（剖切符号，需要一个"上下文解析"闸，不能让 `section` 成为保留字；见 #721 正文）。
3. RM1.2a → RM1.3b（含 RM1.3c 之外的余项）→ CR11a（等所有者裁定 `schema-policy.md` §3 的政策与命名空间）→ RM1.6b → CR10 → RM3.1。
4. 线下，有余量才做：RM1.4c、RM8.1e、RM5.1b、RM0.6、RM7.4，以及 #713 与 #714 留下的两处文字（见 `cards.md` 的 RM1.6c、RM6.1c）。
5. 查 `Deploy mcp (scripted Worker)` 的 smoke 失败（§1.1）与 issue #717（nightly 的 `secrets` job）。

**视觉车道：** RM8.1d 已由 #711 合并。
1. RM8.5（#719）评审并合并 → RM8.6 → RM8.8 → RM8.7 与 RM8.9（两张 `[语法：词表]` 卡等预算卡；`rendered` 主题的地面色调与绿植新增仍等所有者，见 §4；RM8.10 先要设计裁定）。
2. 小件，空档里做：RM8.1c、RM8.3b、RM8.1e。

**测量：** RM1.1a 在 1.59.0 发布后量（`§6` 的表）；X9 的 Show HN 回答稿只写 1.59.0 里已发布的事实。**1.60.0** 提议在 12-01 Show HN 之前切，要所有者对那一次的决定（RM-D27 之后日期只是建议）。

**给执行者的简报加两行：** 状态文件按卡命名（`state-rm1.3a.md`，不叫 `state.md`）；scratchpad 里的其他文件（PR 正文等）也用唯一文件名（`pr-body.md` 在同一会话被两个代理互相覆盖过）。

**阶段 C/D/E/F：** 见 `README.md` §3，日期是参考。五份设计稿都已写（`schema-policy.md`、`walls-facts.md`、`slab-and-section.md`、`plan-json-scope.md`、`visual-language.md`）；`slab-and-section.md` 按 §8 的承诺在 #544 贴链接（RM6.1 的 PR 在 #532 留言）。

## 3. 日历

**参考日期，不是门（RM-D27，所有者 2026-11-11，`README.md` §6.5）。** 日期按人的节奏写成，现在只用来排顺序和估量；任何一张卡都不因为某个日期没到而不开工或不合并。仍是真日期的只有两类：所有者 12-01 亲自发 Show HN（那之前 `main` 保持绿）；两个读数日（agent-reach、RM-D2），量的是外部信号的时间窗。发布日期是提给所有者的建议，每次发布仍要所有者对那一次的决定。

| 日期 | 事 | 规则 |
|---|---|---|
| 2026-11-11/12 | 1.59.0：#720 在途 | 所有者已决定（"我同意发布"，协调者转述），切点由协调者定：#711 与 #713 合并之后切（现已满足）；tag 之后才合并其他 PR |
| 2026-12-01 | Show HN，所有者亲自发 | growth 的物料已由 growth PR #68 刷新；X9 只写 1.59.0 里已发布的事实 |
| 参考：12-21 | 1.60.0（建议，在 Show HN 之前切） | 要所有者对那一次的决定；避开 Product Hunt（约 12-15）那一周 |
| 参考：01-05 | 1.61.0（建议） | 要所有者对那一次的决定；RM1.1b 在其发布后量 |
| 2027-01-09 | agent-reach 读数（窗口到 01-05） | 附 RM7.3 的三项自检 |
| 2027-01-31 | RM-D2 读数（窗口到 01-28） | 附 RM7.3 的三项自检；不足两项时收缩到轨 1、4、7 |

## 4. 只有所有者能做的事，与仍等所有者的裁定

- 决定 1.60.0、1.61.0 是否、何时发布（1.59.0 已决定，见 §1.4）。决定之后 tag 与发布链由代理跑，只在 OTP/2FA、登录、账号或令牌的创建、条款与声明的确认、本机文件选择器处停下。
- 2026-12-01 亲自发 Show HN。
- 需要接受条款或声明的提交（例如 OpenAI 插件目录的每次提交），以及 Cloudflare 控制台的改动（`docs/seo.md` § 8）。
- **本场问过、尚未答复的裁定：** (1) `rendered` 主题的地面色调（ADR 0023；`design/visual-language.md` §3.3 有对比度数字）；(2) 绿植新增 `climber`、`bamboo`、`potted_tree`、`stepping_stones`（`visual-language.md` §4.3）；(3) CR11a 写进 `GOVERNANCE.md` 的政策与 `archlang.uk/schemas/<name>/v<n>` 命名空间（`design/schema-policy.md` §3，对外承诺）；(4) 关闭 PS0.18（已由 `78e0b7f9` 修掉）；(5) RM8.10（两种墙高的 T 形交接，涉及 ADR 0030）；(6) `README.md` §6 的较早一批：RM5.4 的主版本升级（`ext-apps` 2.x，#603）、MF-D3(b)、backlog D.7、M.9、M.8、M.14、3.1(b)、CI throughput 的 E 与 F、仓库根 `.mcp.json`（默认不做）、VA.3；RM1.3c（6.11，双开门）先要一次设计裁定。
- 任何一条受托裁定（RM-D17…D20、RM-D24…D26 与下一条），所有者都可以一句话推翻。
- **第二场的受托裁定（协调者的记录，我无从核对；可一句话推翻）：** 3D 地面是查看器的背景，不是建筑元素，不进 GLB；MCP 能力页保持派生的 `repair` 标题；MCP shim 的版本在发布时经 `release:pin` bump；RM1.4 带出的已发布示例改写成吸附后的值（图字节恒等）；`W_GRID_SNAPPED` 在 `next` 里排最后（新增 `info` 一档）；`W_UNKNOWN_THEME` 也由 CLI 报出；每个内置元素都声明 `setWords`；playground `compilerPathBudget` 458,000 → 458,980（RM1.4）；biome 只关 2.6 里真正新增的三条规则（backlog 3.3）；RM8.1d 的工作计数表重取；RM8.5 的 `AFTER_THE_FORM` 排除名单是测试前提的改动，已同意；RM1.6a 的 +74 B 接受；CRF13 以"不可复现"关闭。
- **所有者本场的话：** 发布 1.59.0（"我同意发布"），时机委托协调者；RM-D27（原话在 `README.md` §6.5）；删除 `origin/ChanMeng666-patch-1`（已做）。

## 5. 怎样合并

- 串行合并：required checks 是 strict 的，一个 PR 合并后其余都会 `BEHIND`。按层级（`node scripts/risk-tier.mjs`；`docs/agents/commands.md` § Merging a PR）：low 在 CI 绿后合；medium 另要一次新上下文评审；high 还要主会话的判断（所有者 2026-11-09 的长期批准）。每个 PR 至多两轮红队。
- 队列做法：逐个"更新分支 → 等新头上的全部检查 → 用完整 40 位 SHA `--match-head-commit` 合并"，不删除任何东西。2026-11-11 用的脚本是 `mq.sh`（`D:\.claude-scratch\2026-11-11\mq\mq.sh`，从主检出运行，`state.txt` 作锁；同一脚本的副本在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\mq.sh`）。
- `main` 动过生成文件（`test/INDEX.md`、`docs/agents/module-map.md` 等）时，冲突的分支不用 `gh pr update-branch`，也不手解：在本地合并 `main`，`npm run gen:all`，提交、推送，再钉新头（`docs/agents/gotchas.md` § PRs & CI）。
- 3D 回放的改动：除了终帧与海报，还要比对升墙中途的帧（`cards.md` §0）。关键帧从 CI 打印的哈希重钉，`check-3d` 红着不合并（`.claude/rules/archlang-3d.md`）。
- 执行者可能长时间等待时，先写状态文件；机器忙时小改动先提交，报告"门禁未跑"（`cards.md` §0；`docs/agents/orchestration.md`）。本地跑不了指定的 vitest 文件（门禁钩子挡住），以 CI 为准；不用自制的替身代替 vitest。

## 6. 首次接触复测的测量表（RM1.1a、RM1.1b）

固定句（RM-D3）："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名，不叫 benchmark。`../plan-soundness/handoff.md` §4 只留一行指针指向本表；该表里 2026-10-27 及更早的行原样保留。

RM1.1a 的兜底：1.59.0 到 2026-11-23 还没打 tag，就量当时 `main` 的提交，"量的版本"一栏写完整 SHA，"说明"一栏写第一个包含它的版本（CR10 的发布说明引这两样）。

| 卡 | 量的版本（或 SHA） | N 个缺陷 | lint 报出 k 个 | 日期 | 说明 |
|---|---|---|---|---|---|
| RM1.1a | 1.59.0 | | | | |
| RM1.1b | 1.61.0（01-06 → 01-08，附在 01-09 读数里） | | | | |

## 7. 另一仓库（archcanvas-growth）

- **growth PR #68 已合并**（2026-11-11T01:06:35Z，`d0cbb2f1`）：决策记录 `strategy/decisions/2026-11-11-archlang-roadmap-v2-rulings.md`（所有者的 RM-D9…D16、RM-D21…D23 与发布措辞；受托的 RM-D17…D20、RM-D24…D26，分开记）；Show HN 物料刷新（`anticipated-comments.md` 的 winders、runbook 的 "It does 3D now" 与日期、`draft.md` 的 "Not scheduled"）；`research/cross-report-corrections.md` 的四处规则目录勘误与 RM-D5 已裁的退界一项；2026-11-09 外联日志的一条更正；`positioning.md`、`master-plan.md`、`category.md` 等按 1.58.0 改正。本文旧版 §5 列的 growth 待办因此都已完成，读数日的 RM7.3 除外。
- **还欠 growth 的：** (1) #68 写的是 #694 当时还开着；#694 已于 2026-11-11T00:59Z 合并（`c5513950`），growth 的 `strategy/decisions/2026-11-12-archlang-rm-d27-and-1.59.0.md` 已补这一句（growth PR #69，开着，未合并）。(2) 读数日（2027-01-09、2027-01-31）附 RM7.3 的三项自检。(3) RM6.1 的 PR（#721，草稿，第一半）已开：所有者在 #532 承诺的"I will post here when the section-line card has a PR"还没有兑现，等 #721 脱离草稿时贴（这是本仓库的 issue，不在 growth）。
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
  - **2026-11-11 第二场（#697–#709）的评审报告在会话 scratchpad 里，没有保留。** 可查的只有各 PR 的评论与提交、本文与 `cards.md`；若要保留，须在会话结束前移进 `claude-kept`。
  - 目录根上还有 `session-state-2026-11-11.md`（主会话的状态记录，中文）与 `mq.sh`。
- `evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径、issue/PR 号或本仓库路径（v2 在 §G，第 8 轨在 §H，2026-11-11 新增的卡在 §I），报告本体不进本仓库。

## 11. 事故：1.58.0 的版本号 PR 与 tag 之间隔了 9 小时 38 分（2026-11-10）

版本号 PR #689 在 2026-11-10 13:55Z 合并，`v1.58.0` 在 23:33Z 才推出。这 9 小时 38 分里，`https://archlang.uk/arch-plan.js` 指向 npm 上还没有的核心版本，`<arch-plan>` 嵌入加载失败。停滞的原因没有查清，这里不写。

教训：tag 之前的每一项证明（例如 `prove:pack`、各检查）都在发布分支的头上跑完，再合并版本号 PR；这样合并之后只剩 pull、tag、push。停顿的原因没有查明；作为一般做法，无人值守的关键路径上不放任何可能弹出权限确认的命令（`rm` 在内）。同一条记在 `docs/agents/gotchas.md` § PRs & CI。

## 12. 过程教训（2026-11-11 两场；协调者转述的记录，我没有独立核对）

- **(a) PR 的 CI 只跑 Node 22，只在 Node 18 上才红的失败要到 `main` 上才第一次出现**（#703 → #705）。改生成器或 tsx 配置这类工具链的 PR，合并前先在 Node 18 下跑一遍那个生成器；不要把带 `extends` 的 tsconfig 交给 Node 18 上的 tsx（它的加载器用 `toReversed`，见 #708）。
- **(b) 依赖 PR 合并之后，在主检出里跑 `npm install`。** 新 worktree 的 `node_modules` 是指向主检出的 junction，不装的话每个 worktree 的门禁都还用着旧工具（biome：worktree 里还是 2.5，`main` 已是 2.6）。
- **(c) 重门禁锁：只有锁里仍是自己写的那一行时才写 `free`。** 一个代理曾无条件写 `free` 抹掉别人的持锁行。陈旧的锁由协调者在确认没有重进程之后清掉（协议见 `docs/agents/orchestration.md`）。
- **(d) 同一会话的代理共用一个 scratchpad，文件名必须唯一**（`pr-body.md` 被覆盖过；状态文件按卡命名）。
- **(e) 评审者绝不在主检出里 `git checkout`**：它会把别人的工作树切走。用单独的 worktree 或 `git -C`。
- **(f) 执行者在长等待里会丢上下文：** 要求写状态文件；接手时从 WIP 提交与原始 `git` 出发，派新的代理，不听旧代理的判断（#704 第一位执行者丢了任务卡，WIP 提交 `bb97de35`）。
- **(g) 测试的 oracle 可能编码了旧缺陷。** #711 之后，互操作 oracle `test/interner-oracle.test.ts` 的反例 `[{x:0,y:0.0949},{x:0,y:0.105}]` 恰好是被修的行为（旧的 3 × 3 查找没融合两点）；oracle 红时先问它是不是在守旧缺陷，再改成暴力参照，不要重钉。
- **(h) 新的 e2e 可能因竞态而不稳定**（#718：gallery 选样例排的 250 ms 去抖渲染在旋钮编辑之后触发，把样例写回草稿）。先把竞态确定性地钉住（等过那个窗口再断言），不要靠重试。
- **(i) playground 编译器路径预算是最稀缺的资源。** 每个新语法形式或诊断都让编译器 chunk 变大；#704 把余量吃到 145 B，#713 +74 B，#721 超出 848 B。见 §2 的预算卡：诊断目录文字与 CLI manifest 移出编译器路径，先量再重取一次。
- **(上一场的) 版本号 PR 到 tag 之间不留空档：** tag 之前的每一项证明在发布分支头上跑完，见 §11。
