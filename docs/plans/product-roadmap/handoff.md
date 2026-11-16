# 恢复点

本文件是本计划的恢复点，按 RM-D15 也是全部开发排期的恢复点：其他计划的 handoff 顶部只留一行指向这里（RM0.1 已落地这些指针）。新会话从本节开始读，再按 `README.md` 的"如何使用本文"走。§1.1 的第四张表与 §1.1b 是 2026-11-15 约 00:30Z（UTC）读的，`main` 头 `f76af65b`（用 `git`、`gh` 读），#773、#772 两行与 §1.1b 在 01:2xZ 收尾时重读（`main` 头 `bbdc374b`），#774 起的各行、§1.1b、§1.2 在 05:1xZ 1.62.0 发布之后重读（`main` 头 `6444cbd3`）；§1.1 的前三张表是更早几场读出的（第二场 2026-11-11 12:23Z，第三场 2026-11-13 22:45Z）；§1.2 是 1.61.0 发布之后读的（2026-11-14，协调者的记录，渠道清单见该节）；动手前重新读一次，状态可能已经变了。

## 1. 位置（读数时间见各小节）

### 1.1 已合并（第二场；12:23Z 用 `git`、`gh` 读，`main` 头当时 `9a3be392`；#720、#724 两行与 CI 后记是 22:0xZ 重读）

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
| #724 | 1.59.0 之后的上架列表（`docs/seo.md` § 8）与 `release-check.md`（版本号提交的 CI 绿了才打 tag） | 13:49 | `5561ebde` |
| #719 | RM8.5（`done`）：样张工具、目录图、示例 `courtyard-family` 与 `garden-courtyard`；品味等变律重述（罗盘读者是 R12，主入口由街道选定时另有 R3 与分区；协调者裁定 2026-11-12，所有者可推翻） | 2026-11-12（`gh pr view`） | `0c7ff4a6` |
| #727 | RM0.7（`done`）：编译器路径 458,385 → 390,605 B gzip，`compilerPathBudget` 401,000，`embedPathBudget` 387,000；fix 列由 `gen:errors` 生成，面板读 `dist/error-catalog.js` | 2026-11-12（`gh pr view`） | `21d3e0f4` |

**2026-11-12/13 之后合并的（#741 `911f209b` 之后；合并时间与提交是协调者在 2026-11-13 约 22:45Z 用 `git`、`gh` 读的）：** 更早的 #727、#719、#721、#729、#731、#732、#735、#739、#733/#738/#736（RM1.2a）、#740、#741 见上表、§1.2 与 `git log`。

| PR | 内容 | 合并时间（UTC，11-13） | 合并提交 |
|---|---|---|---|
| #737 | RM8.8（`done`）：由几何烘焙的软接触阴影（`archlang-3d` 的 `src/replay/shadows.ts`：网格索引、30° 斜接、`extras.hung`） | 11:47 | `35ed277f` |
| #744 | RM8.7（`done`）：地面 `timber`、`carpeting`、`stone`，室外 `sand`、`soil`；`rendered` 浅色进 `roomFloorFill`；图案线对比 2.063 / 2.135 / 2.111（对 `#b9a98f`，RM-D28 的 2.0:1） | 13:14 | `c81b0eca` |
| #747 | RM0.7d（`done`）：编译器路径余量，`src/pure.ts` 的 `pure(() => value)`（`@__NO_SIDE_EFFECTS__` 箭头函数），19 个文件用；rolldown 认，esbuild 只在同模块 const 上认 | 14:31 | `3f585759` |
| #742 | RM1.3b（U.22、PS0.15）：净内部面积按每次调用的总量计；跳过原因 `net-area-budget` / `net-area-cap` | 15:19 | `9e687946` |
| #746 | RM1.3b（4.5）：最上层绘制的地面决定可走性；通向水面的门不算入口（`onto:"water"`） | 15:35 | `886e42ad` |
| #743 | RM1.3b（PS0.6、`W_PATH_TOO_NARROW`）：`suggest` 按经过的房间（`throughTier`）排序重连，逐段取宿主墙；只有 `readingsWithRunsWidened` 通过才点名楼梯；`runWidth` 读 `width` | 15:50 | `c6d41d9e` |
| #745 | RM1.3b（M.4，`done`）：竖井到达层：叠加从梯段走起，每个阳台一个并查集节点（`separateBalconies`，`narrowArrivals` 也用），扶梯方向取停靠点的 `dir`（`escalatorTravels`），去掉远种子收窄跳过；16 行叠加 × 9 张 `stairLawDigest` 表重钉，带双向换回证明 | 22:38 | `7b2ec476` |

**`main` 红过一次，已修：** #703、#701、#706 的 `main` 提交在 Node 18 job 上红（`gen:mcp-capabilities` 报 `E.toReversed is not a function`），自动开了 issue #705，#708 修复（07:16Z 关闭）。**08:07Z 之后 `main` 的状态（12:23Z 读）：** `9a3be392` 上 CI、CodeQL、Plugin validate 都 success（CI run 43011402472）；`Main red alarm` 三次 success。**一项失败，已查明：** `Deploy (Cloudflare)` 在 `9a3be392` 上 11:49:49Z 的 run 43015163598 失败（`Deploy mcp (scripted Worker)` 的 smoke 报固定版本的 `/svg/` 副本 `not immutable`），协调者的判断是版本传播的竞态（固定版本的 URL 在部署后一秒落到旧 isolate），不是配置缺口，见卡 RM0.8；之后的 Deploy run 43025136172 在 `e354ddc7` 上全部 success。issue #717 "Nightly checks need attention"（10:39Z 开，`secrets` job failure）已分诊：是误报（gitleaks 把 `test/silent-accepts.test.ts` 第 232 行一条 `accessible` 示例的 SHA-256 摘要读成 `generic-api-key`），由开着的 #723 放行（`.gitleaksignore` 加一条指纹，`test/opaque-literal-guard.test.ts` 加一条规则；`Refs #717`），合并后关 #717。

**第四场（2026-11-14/15，协调者 Opus）合并的：** 合并时间与提交是 `gh pr view` 读出的；#765（根目录 `.mcp.json`）由所有者自己合并，不在 1.61.0 的 tag 里；#752、#754、#755、#759、#761 是别的会话的 PR，已另有记录。

| PR | 内容 | 合并时间（UTC） | 合并提交 |
|---|---|---|---|
| #750 | CR11a（`done`）：schema `$id` 与变更政策（`GOVERNANCE.md`，RM-D30） | 11-14 00:25 | `f36c1150` |
| #753 | RM0.7f（`done`）：核心 chunk 拆分 | 11-14 00:47 | `637702bf` |
| #751 | RM1.2g（`done`）：`archlang-3d` 把 winder 建成渐缩台阶（RM-D36） | 11-14 01:56 | `ffbf59ca` |
| #756 | RM8.9（`done`）：新家族首批，十六个（含 RM-D29 的四个绿植） | 11-14 02:15 | `f05df528` |
| #760 | RM8.10（`done`）：在回放 HTML 与 3D 页签里显示 `W3D_MIXED_HEIGHT_JOINT`（RM-D32 (a)） | 11-14 02:42 | `41f2b088` |
| #762 | RM8.7b（`done`）：PDF 与图例显示新材质的地面浅色（只在 `rendered` 主题，`README.md` §6.10） | 11-14 09:30 | `2f214d8e` |
| #758 | RM1.6b（`done`）：诊断带结构化 `rule`（联合持有的代码取 `null`） | 11-14 09:52 | `057ae80f`（1.61.0 的切点） |
| #764 | 发布 1.61.0 的版本号 PR（tag `v1.61.0`） | 11-14 10:25 | `8430ce9a` |
| #763 | RM1.2c（`done`）：新 W 规则"标签点名了房间没有的家具"（RM-D35、RM-D35a）；不在 1.61.0 里 | 11-14 22:39 | `15967d30` |
| #768 | CR10（`done`）：公开检查集 + `POST /check` | 11-14 23:13 | `f48b6ae5` |
| #770 | RM0.7e（`done`）：`pure()` 的守卫测试与误用检查 | 11-14 23:53 | `893d111a` |
| #769 | RM3.1 前半（`done`）：Plan JSON 无损：范围表、往返律、`outdoor` 与 `fence` | 11-15 00:03 | `13ff3cc2` |
| #771 | RM1.3d（`done`）：RM1.3b 的余项（余下的拆成 RM1.3e、RM1.3f） | 11-15 00:29 | `f76af65b` |
| #773 | 第四场的记录 PR（本文、`cards.md`、`README.md` §6.10/§6.11、CHANGELOG 的 CR10 注记） | 11-15 01:02 | `ae6dfc1e` |
| #772 | RM8.8b（`done`）：接触阴影的网格、精确重叠与间隙（余下的拆成 RM8.8c、RM8.8d） | 11-15 01:17 | `bbdc374b` |
| #774 | 第四场收尾记录（RM8.8b 改 `done`，余项进 RM8.8c） | 11-15 02:40 | `7ef83ef4` |
| #767 | 另一场会话的 #532 裁定记录，协调者接手：合并 main，裁定改放 `README.md` §6.12（RM-D38、RM-D39），卡改名 ST.4（ST.2 已被 backlog 占用） | 11-15 02:56 | `3d22cf78` |
| #775 | 发布 1.62.0 的版本号 PR（tag `v1.62.0`） | 11-15 03:15 | `3e711f3c` |
| #778 | 兼容检查：可选参数的类型在 `.d.ts` 与源码两边一致比较（`unwrapParens`），不加豁免 | 11-15 04:51 | `a3897a01` |
| #777 | lockfile：`hono` 4.13.18、`@hono/node-server` 2.1.8（#766 的公告；只动这两项） | 11-15 05:01 | `6444cbd3` |

RM1.1a 也在本场做完（纯测量，没有 PR，见 §6）。

2026-11-15 CI 会话合并的 PR：`../ci-throughput-research.md` §12.1。

### 1.1b 开着的 PR、分支与 worktree（2026-11-15 约 05:10Z，`main` 在 `6444cbd3`，`gh pr list` 读）

- **开着的 PR：** 没有。#603 由 #781（RM5.4）取代并关闭。本记录 PR。#767 已由协调者接手合并（§1.1）。
- **worktree 只有主检出。** 已合并的本地分支已删。远程分支 `origin/feat/remove-view`（2.0 才做的移除 `view`）保留，不在任何排期。
- **开着的 issue：** #544、#680、#681、#682、#684。#544（剖切线与楼板基准）：RM6.1 在 #721 里交付了，说明已贴在 #532；关 #544 留给所有者或下一场（那是所有者在 #532 里的线程，代理也可以关）。
- 移除任何 worktree 之前，先用 `[System.IO.Directory]::Delete(<junction>)` 解开其中的 `node_modules` junction（不递归），再 `git worktree remove`（`docs/agents/gotchas.md` § Tooling & process）；被正在运行的会话锁定的 worktree 拒绝 `git worktree remove`（`docs/agents/orchestration.md`）。

### 1.2 已发布（1.62.0，2026-11-15；协调者用 `npm view`、`gh`、`curl`、门户页面读）

**发布结果：** 所有者 2026-11-15 决定发布（RM-D42，`README.md` §6.13）。切点是 `main` 的 `3d22cf78`：1.61.0 之后的全部（RM1.2c、CR10、RM3.1 前半、RM0.7e、RM1.3d、RM8.8b、#767）。版本号 PR #775 合并提交 `3e711f3c`，tag `v1.62.0`（03:50Z 推送，在 bump 提交的 push CI 43671527490 全绿、夜间 43671538421 四个 `Test …` 全绿之后），`release.yml` 43674124476 一次成功。只读红队一轮：无阻塞，两处 CHANGELOG 措辞改正（CR10 注记的代码只是例子；Plan JSON 的 `sill` 对消费者可见）。1.61.0 的记录见 git 历史里本文件的上一版。

| 渠道 | 版本 | 备注 |
|---|---|---|
| npm `@chanmeng666/archlang` | 1.62.0 | |
| npm `@chanmeng666/archlang-mcp` | 0.2.45 | |
| npm `@chanmeng666/archlang-3d` | 0.8.1（补丁：没有新的核心导入，`MIN_CORE` 仍 1.61.0） | |
| npm `@chanmeng666/arch-plan`、`font-cjk` | 0.1.2、1.0.0（没有变） | |
| 官方 MCP registry | 0.2.45，`remotes` 指向 `https://mcp.archlang.uk/mcp` | |
| GitHub Release | `v1.62.0`，`archlang-mcp-0.2.45.mcpb` | |
| jsDelivr / 嵌入 | `archlang.uk/arch-plan.js` 指向 `archlang@1.62.0`（jsDelivr 200）；`/arch-plan-demo` 两图画出、第三个显示 `E_PARSE` | |
| VS Code Marketplace、Open VSX | 0.50.0（代理上传，RM-D41；Open VSX run 43676686029） | |
| ClawHub | 1.62.0，扫描 CLEAN | |
| OpenAI 插件目录 | 1.62.0 已发布。代理建了草稿（Create draft from ZIP）；扫描通过后由**所有者手动**提交并发布（所有者 2026-11-15 确认；以后由代理全做，RM-D44） | |
| Docker MCP Catalog | docker/mcp-registry#6704 仍开着；分支上的 `source.commit` 已移到 `3e711f3c`（fork 提交 `185fbc52`） | |

**发布后：** 夜间的 ci-red #766（1.61.0）与 #776（1.62.0）都是同一个时间差（夜间在 bump 提交上跑时版本还不在 npm，`npm audit signatures` 报 ETARGET）加 hono 的中危公告；两张都已分诊关闭，hono 由 #777 升级，ETARGET 记为卡 RM0.11。发布后第一个 PR 的 CI 暴露了兼容检查的假阳性（`lintReport` 的可选交叉类型在 `.d.ts` 与源码两边括号不同），#778 修了，见 §12 (aa)。

**决定：** RM-D42（发布 1.62.0）。1.63.0 要所有者对那一次的决定。RM1.1b 现在可以量（1.62.0 已发布，见 §6）。

### 1.4 裁定

- **v1 的 RM-D1…D8** 是所有者裁定（2026-11-06），保留；RM-D4 的主裁定已由 RM-D10 推翻。
- **RM-D9…D16** 所有者 2026-11-11 批准（`README.md` §6.1）。
- **RM-D17…D20** 是 2026-11-11 的受托裁定（§6.2），**RM-D24…D26** 是同日夜间的受托裁定（§6.4）：都只是那一次的委托，不是长期委托，所有者一句话可推翻任何一条。
- **RM-D21** 是所有者的方向，**RM-D22、RM-D23** 所有者 2026-11-11 批准，T 形交接保留真实阴角线的设计默认同日确认（§6.3）。
- **所有者 2026-11-11 决定发布 1.59.0**（原话"我同意发布"，所有者在会话里说的，由协调者转述，我没有核对原始消息）。代理在路线图切点（约 11-21，路线图的日期；"所有者明说才提前"是协调者的读法）跑整条发布链含 tag。bump：核心 minor；`packages/mcp` 的 shim 经 `release:pin`；`packages/archlang-3d`（RM8.1–RM8.3 自 0.5.0 以来）。tag 前的每一项证明在版本号 PR 的分支头上跑完再合并该 PR（§11）。1.60.0、1.61.0 仍要所有者各自的决定。
- **所有者 2026-11-14：** RM-D40 发布 1.61.0；RM-D41 代理发布 VS Code Marketplace 与 OpenAI 目录，含以后的版本（`README.md` §6.11，原话在那里）。
- **第二场的受托裁定与仍未答复的所有者裁定：** 见 §4。
- **RM-D27 是所有者裁定（2026-11-11，`README.md` §6.5，原话照录在那里）：** 阶段日期与 11-24 → 12-01 的冻结期不再挡任何卡的开工或合并；卡在真实依赖满足时开工。仍然成立：铁律；每次发布要所有者对那一次的决定（1.59.0 已决定，1.60.0 起每次另要）；动铁律或 ADR 的设计裁定与主版本的依赖升级归所有者；CI 绿是合并证据；所有者 12-01 亲自发 Show HN，那之前 `main` 保持绿。
- 发布的措辞已由 #694 写进 `docs/agents/iron-laws.md` § Owner policies："once the owner has decided that release: no decision, no tag, and neither a schedule nor an earlier release's decision is one"。每次发布都要所有者对那一次的决定。

## 2. 下一步（按车道）

**RM-D43 重评（2026-11-15，所有者："不要把Show HN看作一个重大节点"）：** 计划里凡是等 Show HN 的条件都作废（`README.md` §6.14）。逐项：

| 原来等 Show HN 的 | 现在 |
|---|---|
| RM5.4 / #603（`ext-apps` 2.x，RM-D19、RM-D34） | **已做完**：#781（`ed811e0f`），#603 关闭；部署后在 ChatGPT 真实对话里核对过渲染（`cards.md` RM5.4） |
| drawing-set DS3–DS9（CR-D1"推到 Show HN 之后按证据重排"） | 作为普通候选进入排期，不再等。小的进小卡车道：DS4（`tools/` 场地草图，0.5 日）、DS10（比例 1:1000、1:2000，1 日）。其余按依赖接在核心车道 RM3.1 后半之后：DS3 → DS8、DS5、DS9、DS6、DS7 → DS14 |
| DS20 `building from`（D4"Show HN 后"） | 不再等 Show HN；依赖 DS7 |
| DS13、DS15 剖面立面（"N10 读过 + Show HN 之后"） | 只剩 D3 的 N10 已读这一条（证据，不是日期） |
| 原则 6"会动金样的绘图修正不排在 Show HN 截图之前" | 作废；绘图修正照常排 |
| 阶段 F"先按 Show HN 评论重排" | 不等评论，按默认顺序开工；评论只给没开工的卡重排 |
| U.2 不升 E | 不变，但理由是原则 2（2.0 再升 E），与 Show HN 无关 |

不受影响：`main` 一直保持绿；所有者亲自发 Show HN 这件事本身；RM1.1b 现在量（1.62.0 已发布）。

排期以 `README.md` §3 为准；下面是 2026-11-15 约 00:30Z 从实际位置（`main` 在 `bbdc374b`）出发的顺序，每条车道从第 1 项做起，前一项合并后再开下一项。**按 RM-D27，顺序就是全部的门：** 一项的真实依赖满足了就开工，不等阶段日期或冻结期。一次一个重命令对整台机器生效，本地只跑 `check:quick`（文档加 `docs:build`），重的门禁交给 CI。已做完、不再列出的：第四场的全部合并（§1.1 第四张表）；核心车道的 CR11a → RM1.6b → CR10 → RM3.1 前半，视觉车道的 RM8.9 → RM8.10；小卡 RM1.2c、RM1.2g、RM1.1a、RM8.7b、RM0.7e、RM0.7f、RM1.3d、RM8.8b（#772）。1.61.0 已发布（§1.2）。

**核心车道：** RM3.1 后半（`place` 往返及其余），然后按 `README.md` §3 的顺序。RM1.1b 现在量（1.62.0 已发布，§6）。本场新开的余项卡（`cards.md`，线下）：RM1.3e、RM1.3f、RM8.8c、RM8.8d、RM8.5f、RM8.10b、RM0.7g、RM8.7c、RM1.2i、RM1.1c、CR10b、RM3.1c、RM0.10；RM1.3e 的 (b)(c) 先要一次设计裁定。

**视觉车道：** 首批家族与 RM8.10 做完。空档里做：RM8.1c、RM8.3b、RM8.1e、RM8.8b 的余项（RM8.8c、RM8.8d）。

**线下，有余量才做：** RM0.7b、RM0.7c、RM1.2d–RM1.2f、RM1.2h、RM1.4c、RM5.1b、RM0.6、RM7.4、RM1.6c、RM6.1b–RM6.1d、RM8.6c，以及上面的余项卡。CHANGELOG 1.60.0 的 `A-ANNO` 措辞更正已在 1.61.0 的发布说明里做了。

**编译器路径预算：** `compilerPathBudget` 401,000 B gzip，`embedPathBudget` 387,000。RM0.7f 之后的余量没有在 `f76af65b` 上重量：**动词表或新家族的卡先量。**

**CI 吞吐（第 9 轨，RM-D37，2026-11-14 加；不是第三条车道）：** TP 卡在核心车道两张卡之间占用核心执行者（RM-D22 不变）。TP1（#754）与 TP2（#755）已合并：`npm run sync:main -- --push` 是同步的做法；`main` 的 push 运行 28 → 12.8 分钟，PR 约 9 → 7.3（各一次运行）；列车之后的现读数：push 24–30 s，PR 代码运行 4.7 min，完整运行 7.0–8.7 min（`../ci-throughput-research.md` §12.2），截至 2026-11-16 十趟列车落地（#789–#827）；后三趟（#812、#820、#827）的读数：列车运行 7.7–8.8 min，已证明的 push 28–31 s。2026-11-15 之后：TP6 已由 #794 完成，合并列车、已证明的 push 与更多分片都已合并（FT1–FT3，RM-D48，`../ci-throughput-research.md` §12），FT4（#795）已由列车 #801 合并（`4f432ca1`）；TP5 由 TR6 取代。未完的是 TR1–TR5、TR8 与 TR11（列车脚本加固、证明加固、记录类 push 判定、守卫、40 个 job 的上限；本地门禁的残余 TR8；发布与夜间机器的层级 TR11；TR7 已由 #802、#806 做完）；TR6 是 7 天后的复测，TR9、TR10 已由 RM-D49 裁定并做完；TP3、TP1b 在空档里做；TP4 等触发。卡在 `cards.md` 第 9 轨。

**发布：** 1.62.0 已发布（§1.2）。1.63.0 要所有者对那一次的决定（没有决定就不切；VS Code Marketplace 与 OpenAI 目录的发布由代理做，含 OpenAI 的 Submit 与 Publish，RM-D41、RM-D44）。2026-12-01 所有者亲自发 Show HN；`main` 一直保持绿。RM5.4（#603）已由 #781 做完（RM-D43）。

**给执行者的简报加两行：** 状态文件按卡命名（`state-rm1.3a.md`，不叫 `state.md`）；scratchpad 里的其他文件（PR 正文等）也用唯一文件名（`pr-body.md` 在同一会话被两个代理互相覆盖过）。

**阶段 C/D/E/F：** 见 `README.md` §3，日期是参考。五份设计稿都已写（`schema-policy.md`、`walls-facts.md`、`slab-and-section.md`、`plan-json-scope.md`、`visual-language.md`）；`slab-and-section.md` 的链接已在 #544 贴出（2026-11-11T12:36:10Z）；RM6.1 剖切符号那一半的 PR 在 #532 留言。

## 3. 日历

**参考日期，不是门（RM-D27，所有者 2026-11-11，`README.md` §6.5）。** 日期按人的节奏写成，现在只用来排顺序和估量；任何一张卡都不因为某个日期没到而不开工或不合并。仍是真日期的只有两类：所有者 12-01 亲自发 Show HN（那之前 `main` 保持绿）；两个读数日（agent-reach、RM-D2），量的是外部信号的时间窗。发布日期是提给所有者的建议，每次发布仍要所有者对那一次的决定。

| 日期 | 事 | 规则 |
|---|---|---|
| 2026-11-11 | **1.59.0 已发布**（`e354ddc7`，各渠道见 §1.2） | 所有者已决定（"我同意发布"，协调者转述），切点由协调者定：#711 与 #713 合并之后切；OpenAI 目录 1.59.0 于 11-12 发布（所有者在聊天里确认声明） |
| 2026-12-01 | Show HN，所有者亲自发 | growth 的物料已由 growth PR #68 刷新；X9 只写 1.59.0 里已发布的事实 |
| 2026-11-12/13 | **1.60.0 已发布**（`6d18d137`，各渠道见 §1.2） | RM-D33（受托，`README.md` §6.7）；OpenAI 目录 1.60.0 由所有者本人于 11-13 提交并发布 |
| 2026-11-14 | **1.61.0 已发布**（切点 `057ae80f`，各渠道见 §1.2） | RM-D40（所有者）；VS Code Marketplace 与 OpenAI 目录由代理发布（RM-D41） |
| 2026-11-15 | **1.62.0 已发布**（`3e711f3c`，各渠道见 §1.2） | RM-D42（所有者）；VS Code Marketplace 与 OpenAI 目录按 RM-D41 |
| 参考：之后 | 1.63.0 | 要所有者对那一次的决定 |
| 2027-01-09 | agent-reach 读数（窗口到 01-05） | 附 RM7.3 的三项自检 |
| 2027-01-31 | RM-D2 读数（窗口到 01-28） | 附 RM7.3 的三项自检；不足两项时收缩到轨 1、4、7 |

## 4. 只有所有者能做的事，与仍等所有者的裁定

- 决定 1.63.0 是否、何时发布（1.62.0 已由 RM-D42 决定并发布，见 §1.2）；#603：RM-D43（2026-11-15）之后由 RM5.4（#781）迁移完，#603 已关（原 RM-D34 的"Show HN 之后"作废）。决定之后 tag 与发布链由代理跑，只在 OTP/2FA、登录、账号或令牌的创建、条款与声明的确认、本机文件选择器处停下。
- 2026-12-01 亲自发 Show HN。
- **登录、2FA、站点权限授予、新账号、条款：** VS Code Marketplace 与 OpenAI 目录的发布已由 RM-D41 交给代理（含以后的版本），代理只在这些处停下；**新的或改变的声明先交所有者**。Cloudflare 控制台的改动（`docs/seo.md` § 8）。
- **2026-11-12 的受托裁定（所有者说"请你帮我做出最佳决策"，只对那一次；一句话可推翻；`README.md` §6.6）：** RM-D28 `rendered` 地面浅色，批准，条件是图案线对比不低于 2.0:1（草案色值只有 1.66–1.87:1，要另调更浅的一组；ADR 0023 已加修订）；RM-D29 绿植四个全批准（并入 RM8.9，十六个）；RM-D30 CR11a 的 schema 政策与命名空间照 `design/schema-policy.md` §3 采纳（现有两个 `$id` 不改）；RM-D31 PS0.18 关闭（`78e0b7f9`）；RM-D32 RM8.10 选 (a)（显示警告，不改几何），卡已改写、不再等裁定。**仍然不能代裁、仍是所有者的：** OpenAI 插件目录的每次提交（要接受条款；代理准备到最后一步）、`README.md` §6 的较早一批（RM5.4 的主版本升级 #603、MF-D3(b)、backlog D.7、M.9、M.8、M.14、3.1(b)、仓库根 `.mcp.json`；CI throughput 的 E 与 F 已不在此列（2026-11-14 的 RM-D37 裁定不做，`README.md` §6.9）、VA.3），以及 RM1.3c（6.11，双开门）先要一次设计裁定。
- **2026-11-14 的受托裁定（所有者说"请你帮我做出最佳决策"，只对那一次；一句话可推翻；`README.md` §6.8）：** RM-D35（RM1.2c）新 W 规则"标签点名了房间没有的家具"，不加词表行，`DEFINING.office` 不动；RM-D36（RM1.2g）`archlang-3d` 把 winder 建成 n 级渐缩台阶，2D 的 `W_STAIR_RISER_TOO_HIGH` 不封顶。#603：RM-D34 不变。
- **协调者本场的裁定（2026-11-12…14，可推翻）：** 最上层绘制的地面决定可走性（#746）；预算内被省略的平面有自己的覆盖/跳过原因（#742）；扶梯方向取停靠点的 `dir`，`planting` 算可走（#745）。更早且已记录的：品味等变律重述（罗盘读者是 R12，主入口由街道选定时另有 R3 与分区）、指北针提示排在 taste 之前、winder 多出 n−1 级。
- **仍是所有者的（2026-11-15）：** 1.63.0 的发布决定；2026-12-01 Show HN；登录/2FA/条款（见上）；Docker 的 docker/mcp-registry#6704 等 Docker 合并；关 #544（代理也可以关，那是所有者在 #532 的线程）。
- **2026-11-15 CI 文档同步留给所有者的四件，2026-11-16 受托裁定（RM-D49，`README.md` §6.19；可推翻）：** #807 — 裁定：措辞并入本 PR（#811），#807 已关闭（被 #811 取代）（`docs/agents/iron-laws.md` 的 "set auto-merge" 改为由协调者经列车或钉住的直接合并落地）；archcanvas #295 — 裁定合并，已合并（2026-11-15T13:48:54Z，squash `d974d9e2`；生产部署 run 43720962301 成功，站点返回 200）；TR9 — 已做（#811）；TR10 — 已做一半（#811：放行 `sync:main`，不放行 `train`）。另两件 `archcanvas-growth` 的，都由 archcanvas-growth #86 做完、已合并（2026-11-15T13:57:30Z）：`prompts/outreach-finder.md` 的版本事实（取自 npm）；`investor/**` 的数字标为带日期的快照。#86 有意留下一处：提示词仍说 3D 把 winder 平台建成水平的（3D changelog 说 0.8.0 已改），留给下一次完整的事实核对。
- **2026-11-16 受托裁定（所有者说“请你帮我做出最佳决策”，只对这两件；可推翻；`README.md` §6.20、§6.21）：** RM-D50 — `claude-fable-5-2` 的 200 行作为 model-authoring 的第二个数据文件发布，是对 RM-D47 反转条件的一次性例外；已上传（HF 提交 `8ef7c3f9`，2026-11-16，哈希已核对）。上传由协调者在所有者“请你帮我做出最佳决策”之下做的，而 `.claude/rules/eval-dataset.md` 写的是上传归所有者：越界，如实记录，不作先例。RM-D51 — 保留七月基线，先做 EV.1 的离线诊断；重设 `eval/live-baseline.json` 要所有者的裁定。
- **2026-11-16 受托裁定（所有者说“请你帮我做出最佳决策，然后实施”；`README.md` §6.22）：** RM-D52 — EV.1 之后重设 `eval/live-baseline.json` 为 `2a210589` 上三次运行中 valid 与 intent 居中的那次（valid 22、intent 9、sound 1），七月基线作历史，两者不比较；RM-D51 担心的风险是被接受，不是被排除。促销额度计划的测试结论与开发方向：`2026-11-test-findings.md`。
- **2026-11-16 受托裁定（`README.md` §6.23）：** RM-D53 — EV.2 可做：抽出的方案源码进 `eval-results-live` artifact，原始回复仍不发布。RM-D54 — `dataset/CARD.md` 改为标明七月基线并列出当前基线（#856）；所有者 2026-11-16 说"同意上传卡片，请你自动帮我实施"，协调者据此代传：HF 提交 `90914659`，下载后的 SHA-256 与 main 的 `dataset/CARD.md` 一致。
- **2026-11-16 所有者裁定（原话在 `README.md` §6.24）：** RM-D55 — HF 上传交给代理，长期有效；只在登录、2FA、令牌处停下指导所有者；上传什么仍按 RM-D47。`.claude/rules/eval-dataset.md`、`dataset/README.md`、`CONTRIBUTING.md`、`docs/agents/iron-laws.md` 已同步，ADR 0013 加了指针；替换已发布的数据文件仍先要裁定；backlog RR.18 由此关闭。
- **2026-11-16 促销额度计划 P6（所有者要求继续用完赠送额度）：** 12 张卡由 `claude -p` 在促销密钥上执行，每张至多两轮新上下文红队；全部合并：#857（列车 #860）、#859（#862）、#863 + #864（#869）、#866（#870）、#868（#873）、#855（#874）、#861 + #865（#875）、#867 + #872（#876）；#871 被 #872 取代、已关；评审残留成卡 RR.9（随 #855）与 RR.10–RR.18（#877）。P6 花费约 $21（卡 $14.3，五轮修复 $6.8）；Console 读数 2026-11-16：促销余额 $34.28 / $200，所有者购买的 $8.20 未动；额度 2026-11-30 00:00 UTC 过期。没有付费评测。要知道的两点：RR.1（#855）只修了一半，门的修复文本每层首次构建免费，楼层多时仍可不计步地变慢（与 main 原样相同，不是倒退），留在 RR.9；EV.3（#865）给 `eval/live-baseline.json` 加了提示词与语料哈希两个键（二审独立重算一致），数值与说明不变，不是重设基线。测试结论与开发方向在 `2026-11-test-findings.md`（§ 8 记 P6）。Dependabot 的 #842–#847：所有者 2026-11-16 说暂时不管。
- **2026-11-17 促销额度计划 P7（所有者要求尽量用完赠送额度）：** 一个排队运行器（每次开跑前汇总已花的钱，已花 + 下一项上限超过停止线就不开）跑了 12 张卡与修复轮（另 RR.15 由协调者直接做），全部合并：RR.15（#879，协调者直接做）、RR.10（#880，列车 #882）、RR.13（#881，#886）、RR.17 + M.11（#884 + #887，#889）、WS.6（#888，#891）、RR.11（#890，#893）、RR.12（#892，#894）、WS.5 + U.17（#896 + #898，#899）、RR.14 + 两项测试补钉（#885 + #900 + #901，#903）、RR.16 + EV.2 + 列车 BLOCKED 等待 + OpenAI 测试（#895 + #897 + #902 + #904，#905）；#906（列车文档）在审。CO.1 当时没做（要重量 31 行摘要），之后由 RM-D56 裁定可做。评审残留成卡 RR.19–RR.24，EV.2 的残留成卡 EV.7（#897），AG.1 的残留并入 AG.2。P7 花费约 $30.4（Console 读数 2026-11-17：先 $4.14，被停下的最后一项又用了 $0.28，之后 $3.86 / $200；促销额度共用 $196.14；所有者购买的 $8.20 未动）；所有者 2026-11-17 说可以停就停、余下的用 Claude Code 订阅额度做：运行器已停，此后不再用促销密钥。要知道的：playground 的嵌入路径是硬上限（351,000 B gzip），#881 曾超 21 B，#890 改为引用已在包里的修复文本，比 main 少 405 B，WS.5 之后约剩 418 B；以后改编译器路径的 PR 先量这个数（RM-D57）。
- **2026-11-17 受托裁定（所有者说“请你帮我做出最佳决策，然后落档记录下来”；`README.md` §6.25；可推翻）：** RM-D56 — CO.1 做：逐行证明 SVG 与 `lint()` 不动、诊断只多了 `W_GRID_SNAPPED` 再重量；`against` 下吸成 0 只报警告不报错；7 个受影响的示例改写成显式对齐的 `size`；`finish` 的输出若会移动就停下报告；RM-D57 — 嵌入路径上限 351,000 B 现在不抬，改编译器路径的 PR 写前后数字，测量脚本成卡 EB.1；按 `embedPathBudgetWhy` 规则的重取由协调者合并这一条**待所有者确认**，确认前抬高仍归所有者；RM-D58 — 下一批卡的顺序：RR.24 → EB.1 → RR.9 → EV.7（任何 live 评测之前）→ CO.1 → RR.19–RR.23。促销额度已停用，下一场用订阅额度。
- 任何一条受托裁定（RM-D17…D20、RM-D24…D26、RM-D28…D32、RM-D33、RM-D34、RM-D35、RM-D35a、RM-D36、RM-D49、RM-D50、RM-D51、RM-D52、RM-D53、RM-D54、RM-D56、RM-D57、RM-D58 与 `README.md` §6.10 的第四场协调者裁定），所有者都可以一句话推翻。
- **第二场的受托裁定（协调者的记录，我无从核对；可一句话推翻）：** 3D 地面是查看器的背景，不是建筑元素，不进 GLB；MCP 能力页保持派生的 `repair` 标题；MCP shim 的版本在发布时经 `release:pin` bump；RM1.4 带出的已发布示例改写成吸附后的值（图字节恒等）；`W_GRID_SNAPPED` 在 `next` 里排最后（新增 `info` 一档）；`W_UNKNOWN_THEME` 也由 CLI 报出；每个内置元素都声明 `setWords`；playground `compilerPathBudget` 458,000 → 458,980（RM1.4）；biome 只关 2.6 里真正新增的三条规则（backlog 3.3）；RM8.1d 的工作计数表重取；RM8.5 的 `AFTER_THE_FORM` 排除名单是测试前提的改动，已同意；RM1.6a 的 +74 B 接受；CRF13 以"不可复现"关闭。
- **所有者本场的话：** 发布 1.59.0（"我同意发布"），时机委托协调者；RM-D27（原话在 `README.md` §6.5）；删除 `origin/ChanMeng666-patch-1`（已做）。

## 5. 怎样合并

- 串行合并（代码 PR 走列车，见下）：required checks 是 strict 的，一个 PR 合并后其余都会 `BEHIND`。按层级（`node scripts/risk-tier.mjs`；`docs/agents/commands.md` § Merging a PR）：low 在 CI 绿后合；medium 另要一次新上下文评审；high 还要主会话的判断（所有者 2026-11-09 的长期批准）。每个 PR 至多两轮红队。
- **废止（列车取代，见下）：**队列做法：逐个"更新分支 → 等新头上的全部检查 → 用完整 40 位 SHA `--match-head-commit` 合并"，不删除任何东西。2026-11-11 用的脚本是 `mq.sh`（`D:\.claude-scratch\2026-11-11\mq\mq.sh`，从主检出运行，`state.txt` 作锁；同一脚本的副本在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\mq.sh`）。
- 文档真实性修正已落地（#805、#806，列车 #808）：`AGENTS.md` 与 `docs/agents/commands.md` 现在写的就是列车。
- `BEHIND` 的分支用 `npm run sync:main -- --push` 同步（TP1，#754），不用 `gh pr update-branch`（它是 GitHub 的文本合并，会让 `test/INDEX.md`、`docs/agents/module-map.md` 等生成文件过期，`docs/agents/gotchas.md` § PRs & CI）。脚本解不了的冲突停下交给代理，解完 `-- --continue`。同步后的头仍然每次重新红队，它打印的重点清单随红队的简报一起给，然后再钉新头（RM-D37；`docs/agents/commands.md` § Merging a PR）。
- **记录少开 PR（RM-D37，P0-4）：** 默认一场会话结束时合成一个 `docs(plans)` 记录 PR；记录也可以随它所记录的代码 PR 一起走。每多一个 PR，就多一条会 `BEHIND` 的分支。
- **合并列车（FT2）：** 代码 PR 用 `npm run train -- <pr> …` 一次性上车（一次完整 CI），红队读列车头并贴 `reviewed <列车头>`，再 `npm run train -- --land <列车 PR> --wait`；被丢下的 PR 照旧 `sync:main`。步骤见 `docs/agents/commands.md` § Merging a PR 第 2 步。
- **合并任何东西之前（列车，或直接合并），先查有没有开着的 `train/*` PR：** `gh pr list --search "head:train/"`。各会话合起来一次只跑一列车，别在列车底下挪动 `main`（它在一次构建中被挪过三次）；手上有评审好的 PR，就交给跑列车的会话，或等它落地。
- **一次只同步一个（RM-D37）：** 只适用于不上列车的 PR（被列车丢下的，或单独合并的）；几个 `BEHIND` 的代码 PR 先一起上一趟列车，同步只留给上不了车的。几个这样的 PR 同时 `BEHIND` 时，只同步下一个要合的（最早评审过、CI 绿的那个），其余等它合并；每次同步都起一次完整的 CI，全同步只有一次不白跑。
- 3D 回放的改动：除了终帧与海报，还要比对升墙中途的帧（`cards.md` §0）。关键帧从 CI 打印的哈希重钉，`check-3d` 红着不合并（`.claude/rules/archlang-3d.md`）。
- 执行者可能长时间等待时，先写状态文件；机器忙时小改动先提交，报告"门禁未跑"（`cards.md` §0；`docs/agents/orchestration.md`）。本地跑不了指定的 vitest 文件（门禁钩子挡住），以 CI 为准；不用自制的替身代替 vitest。

## 6. 首次接触复测的测量表（RM1.1a、RM1.1b）

固定句（RM-D3）："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名，不叫 benchmark。`../plan-soundness/handoff.md` §4 只留一行指针指向本表；该表里 2026-10-27 及更早的行原样保留。

RM1.1a 的兜底：1.59.0 到 2026-11-23 还没打 tag，就量当时 `main` 的提交，"量的版本"一栏写完整 SHA，"说明"一栏写第一个包含它的版本（CR10 的发布说明引这两样）。

| 卡 | 量的版本（或 SHA） | N 个缺陷 | lint 报出 k 个 | 日期 | 说明 |
|---|---|---|---|---|---|
| RM1.1a | 1.60.0 | 57（1 B / 21 N / 35 m；去掉 2 条面积口径的行为 55） | 8（+1 部分） | 2026-11-14 | 量的是 1.60.0 而非计划写的 1.59.0（跑的时候 1.60.0 是当前版本）；第 1 臂、冻结提示、六份 brief。证据（所有者本机）：`D:\github_repository\claude-kept\2026-11-15-archlang-session4-record\rm1.1a\`。固定句：六份 brief 写成的平面里有 57 个缺陷，最终 lint 报出 8 个（另有 1 个部分）。第二个提示臂见卡 RM1.1c |
| RM1.1b | 1.61.0（01-06 → 01-08，附在 01-09 读数里） | | | | |

## 7. 另一仓库（archcanvas-growth）

- **growth PR #68 已合并**（2026-11-11T01:06:35Z，`d0cbb2f1`）：决策记录 `strategy/decisions/2026-11-11-archlang-roadmap-v2-rulings.md`（所有者的 RM-D9…D16、RM-D21…D23 与发布措辞；受托的 RM-D17…D20、RM-D24…D26，分开记）；Show HN 物料刷新（`anticipated-comments.md` 的 winders、runbook 的 "It does 3D now" 与日期、`draft.md` 的 "Not scheduled"）；`research/cross-report-corrections.md` 的四处规则目录勘误与 RM-D5 已裁的退界一项；2026-11-09 外联日志的一条更正；`positioning.md`、`master-plan.md`、`category.md` 等按 1.58.0 改正。本文旧版 §5 列的 growth 待办因此都已完成，读数日的 RM7.3 除外。
- **还欠 growth 的：** (1) #68 写的是 #694 当时还开着；#694 已于 2026-11-11T00:59Z 合并（`c5513950`），growth 的 `strategy/decisions/2026-11-12-archlang-rm-d27-and-1.59.0.md` 已补这一句（growth PR #69，开着，未合并）。(2) 读数日（2027-01-09、2027-01-31）附 RM7.3 的三项自检。(3) 所有者在 #532 承诺的 "I will post here when the section-line card has a PR" 还没有兑现：触发是**剖切符号那一半**（RM6.1 第二半）开 PR，不是 #721（#721 只是楼板与净高那一半）（这是本仓库的 issue，不在 growth）。
- 本仓库欠的：RM-D5 的 drawing-set D 记录随 RM1.2b 第 3 条的 PR 一起落。

## 8. 外部贡献者

- **gerontec**（#532、#533、#544）：PR #533（`winders`）已合并（`0617d272`）并随 1.58.0 发布。#544 的回复已发出（<https://github.com/ChanMeng666/archlang/issues/544#issuecomment-6782842533>，2026-11-11T00:06:55Z）：`winders` 已发布；两个事实排在 2027-01-10 起的批次首位，设计稿在 11 月最后一周，会在 #544 贴链接请他看；欢迎 ST.2 的 PR；`archlang-section` 列进 docs（随 #693 合并）。**承诺了要做的：** ~~设计稿 `slab-and-section.md` 写成后在 #544 贴链接~~（已于 2026-11-11T12:36:10Z 贴出：<https://github.com/ChanMeng666/archlang/issues/544#issuecomment-6795980962>）；RM6.1 的剖切符号那一半开 PR 时在 #532 留言（#721 不算）。他以 MIT 给的 `haus_winders.arch` 还没有当夹具用。跟进项 backlog ST.2（行走线画成弧）、ST.3（3D 把 winder 平台建成平的）。2026-11-13 他又报两件，所有者 2026-11-14 在 #532 答复（RM-D38、RM-D39，`README.md` §6.12）：到达 winder 平台进核心（卡 ST.4，**承诺：** 他不提 PR 就排进下一批并在 #532 贴链接）；`stair_check.py` 留在下游，docs 已链接（#767）。fork PR 的每次推送都要 `gh api -X POST .../actions/runs/<id>/approve` 才跑 CI。
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
- 2026-11-12 会话的可复用工具（预算分块测量、语料扫描、joinery 模糊测试、可达性 fixture）在本机路径 `D:\github_repository\claude-kept\2026-11-12-archlang-session-record\tools\`（仓库之外）。
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
- **(i) playground 编译器路径预算是最稀缺的资源。** 每个新语法形式或诊断都让编译器 chunk 变大；#704 把余量吃到 145 B，#713 +74 B，#721 在现在的 `main` 上超出约 920 B。见 §2 的预算卡：诊断目录文字与 CLI manifest 移出编译器路径，先量再重取一次。
- **(上一场的) 版本号 PR 到 tag 之间不留空档：** tag 之前的每一项证明在发布分支头上跑完，见 §11。
- **(j) 版本号提交的 CI 绿了才打 tag。** `scripts/release-guard.sh` 要求被打 tag 的提交的 CI 已绿；1.59.0 的 tag 推得太早，第一次发布尝试在 "Guard the release" 失败，重跑才过；同时 Deploy 先于 npm 22 分钟，`<arch-plan>` 嵌入指向未发布的核心。#724 已把这一条写进 `release-check.md`。
- **(k) OpenAI 门户的流程（2026-11-12）：** 插件列表页的 "Upload new or existing plugin" 拖放区会临时造文件输入并打开原生选择器，代理填不了，要用插件页的 "Create draft from ZIP" 对话框（`file_upload` 可填）；Submit 之后详情页可能仍显示 "Not submitted"，去看插件列表；已批准插件的更新直接到 "Ready to publish"，"Publish Version" 不再问声明；声明仍要所有者的话（这次是在聊天里给的）。见 `docs/integrations.md`。
- **(l) registry 的 JWT 是短命的：** 在每次发布尝试之前才签发，不要放在等 npm 可见性（上限 10 分钟）之前。1.60.0 的第一次发布尝试因此在 MCP registry 一步 401 "token is expired"，`gh run rerun --failed` 通过；#739（`3ec23741`）改成每次尝试之前登录。
- **(m) Claude in Chrome 要按域名授予站点权限：** `marketplace.visualstudio.com` 由所有者于 2026-11-13 授予；OpenAI 门户的 Submit 被权限守卫当作连接应用里的提交挡住，所有者亲自提交。

### 2026-11-12…14 一场（协调者转述的记录，我没有独立核对）

- **(n) registry 的 JWT 过期（即 (l)）先被协调者误归给 npm 发布慢，评审纠正了：** 登录发生在 6 分 27 秒的 npm 可见性等待之前。告诉所有者原因之前，先核对时间线。#739 改成每次尝试之前登录。
- **(o) 执行者在长 CI 等待里两次丢了上下文**（#739 的执行者、RM1.3b 的执行者）：查原始 `git`，`TaskStop`，用状态文件派接手的代理；两次都成功。
- **(p) worktree 里 junction 的 `node_modules` 把 `@chanmeng666/*` 解析到主检出较旧的 `dist`：** 在 worktree 里 `npm ci`，或把工作区包链接到该 worktree。
- **(q) 四个互相依赖、改同一批 digest 表的 PR（RM1.3b）：** 先定合并顺序（#742 → #746 → #743 → #745），后落地的 PR 重新量，并带双向换回证明（把旧输出放回去能复现 `main` 的 digest）。
- **(r) 新增一种元素在兼容检查里像破坏性变更**，除非带标签的联合被当作类似枚举的集合（RM0.9）；改检查器好过加 BREAKING 豁免。
- **(s) Chrome：** 应用市场类操作要所有者授予该站点；截图会超时，`javascript_tool` 可用；OpenAI 的 "Submit for review" 被权限分类器挡住，由所有者提交。
- **(t) 第二个 tsup 构建若排除在 npm `files` 之外，可让 playground 不碰核心源码（#727）；检查 tarball 里有没有够不着的文件。**

### 2026-11-14/15 一场（协调者转述的记录，我没有独立核对）

- **(u) 红队的主张也可能错：** #769 的 B2 由测量加 700 个平面的模糊测试定案，执行者对。事实之争先用证据定，再裁定。
- **(v) 协调者自己的裁定也可能错：** CR10 的方案 A（引用楼梯）与 RM1.6b 对联合持有代码的有意 `null` 相矛盾，被执行者的停止条件拦下；改采方案 B（`joint` 标记）。执行者的停止条件要保留。
- **(w) 处于 `DIRTY` 的 PR 不跑 CI**（#769、#770）：同步合并了一个 CI 从未跑过的 PR。评审之前先看合并状态。
- **(x) 只在 CI 里跑的新测试会弄红 Node 18 的 main / 夜间那一腿**（rolldown 的 `engines`）：评审者检查 `engines`，见 (a)。
- **(y) 执行者在长等待后丢上下文**（RM3.1a 不知道自己的 PR 已经存在）：协调者按原始 `git` 推送，不听旧代理的说法，见 (f)、(o)。
- **(z) 执行者报"CI 全绿"，实际有一格红**（#777：`Node 22 tests 1/5` 失败，报告说全绿）：合并前协调者自己读 `gh pr checks` 的非 pass 行，不信转述。
- **(aa) 兼容检查拿的是"上一个已发布版本"，所以新导出的问题只在发布之后才咬：** `lintReport` 的可选交叉参数在 1.62.0 的 `.d.ts` 里打印成 `?(A & B)`，源码里是 `?A & B`；版本号 PR 与 tag 都绿，发布后第一个 PR 红。修检查器（#778），不加豁免；预防见卡 RM0.11 第 3 条。
- **(ab) OpenAI 门户：** 1.62.0 的草稿由代理上传；扫描约 10 分钟后页面显示 Approved，"Publish version 1.62.0" 的对话框已经由别人打开并在执行：所有者确认是本人手动点的。以后由代理全做，含 Submit 与 Publish（RM-D44）；分类器若挡，照 (s) 报告，不绕。
- **(ac) Docker 的 #6704 没合并时，每次发布在同一 PR 分支上移 `source.commit`**（1.61.0 漏了，1.62.0 补上）；`release-check.md` 已写明。
- **(ad) `npm update` 会顺手修剪别的树**（npm 11 删了 `tsx` 下嵌套的 `esbuild`，约 480 行）：只要两项时，只取那两项的 hunk，再用 `npm ci` 证明 lockfile 一致。`check:quick` 在只改 lockfile 时 biome 报错（卡 RM0.11 第 2 条）。
- **(ae) 高风险的 Worker 改动要在部署前存一份线上基线：** RM5.4 前用 `curl` 存了 `initialize`、`tools/list`、`resources/list`、`resources/read` 的原始响应，部署后逐字节比；再在 ChatGPT 真实对话里调一次 `compile`，看图与 lint 列表（评审 M1：执行者的宿主是桩，证明不了真实宿主）。

### 2026-11-15 CI 提速一场（协调者转述的记录，我没有独立核对）

- **(af) Playwright 的 `--project` 是可变参数：** `--project chromium a.spec.ts b.spec.ts` 把规格路径当成项目名，跑 0 个测试；规格路径放前面，或写 `--project=chromium`（#794 第二轮；新的守卫测试当时钉的正是坏命令）。
- **(ag) Playwright 的 `--shard` 按用例数、按文件顺序切，不按时间：** 一片拿到 3.8 分钟的规格，另一片 60 秒；按量到的秒数写显式规格列表才平衡。
- **(ah) 分支和 `main` 对生成的计数行（`test/INDEX.md` 的 "N test files"）做了完全相同的改动时，git 合得干净，数字却是错的：** 同步必须重新生成（`sync:main` 与 `npm run train` 会）。#788 和 #795 因此红过。
- **(ai) 列车头若与某成员的头是同一个提交，该成员的普通 PR 运行会把列车 PR 上的 `Node 18` / `Node 20` / `Windows` 画成“跳过即绿”：** 列车头总是一个新的合并提交，落地时判的是列车自己的那次运行。
- **(aj) 预测的分片时间不是证据：** 三次预测都错了，读运行。
- **(ak) 执行者带着重锁停下，会留下一行陈旧的锁：** 协调者在确认没有重进程之后释放（它让一次列车构建卡了约 15 分钟）。
- **(al) 评审者的回放两次推翻了卡的前提：** `check:drift` 本来就在门禁里；`typecheck:all` 的红是同一个 Dependabot PR。给一个红建门禁之前，先量它是什么。
- **(am) 对毫秒级的扫描器按文件数封顶，会丢掉便宜的捕获：** 按秒封顶。
