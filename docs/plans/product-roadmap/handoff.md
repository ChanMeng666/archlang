# 恢复点

本文件是本计划的恢复点，按 RM-D15 也是全部开发排期的恢复点：其他计划的 handoff 顶部只留一行指向这里（RM0.1 已落地这些指针）。新会话从本节开始读，再按 `README.md` 的"如何使用本文"走。动手前重新读一次，状态可能已经变了。

## 1. 位置（读数时间见各小节）

§1.1–§1.2c、§11、§12（已合并的 PR、发布读数、事故与过程教训）已移到 `archlang-lab/plans/product-roadmap/handoff-history.md`。

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

**v3（2026-11-18）：排期以 [`v3.md`](v3.md) §3 为准。** **ArchLang 已开工（RM-D65，所有者 2026-11-18，`README.md` §6.28）。** 按以下顺序做（阶段 0 的文档卡可以并行）：
1. v2 的尾巴，按 RM-D58 的顺序：RR.24 → EB.1 → RR.9 → EV.7 → CO.1；
2. 阶段 1：RM9.1 → RM9.2 → EV.8 → RM9.3 → RM9.4 → A 波（AF0–AF8）→ RM9.5；
3. 1.64.0（已发布，RM-D66）；
4. 阶段 2，即覆盖率冲刺，以 RM1.1b 验收。

**2026-11-28：第三方实测带出的九张卡（RM9.19–RM9.27，`todo`，未排期）。** MeltFlex 在 Claude Code 里实测了 1.62.0 的技能（文章更新于 2026-11-15），证据、对照今天代码的核对与读法在 [`2026-11-meltflex-review.md`](2026-11-meltflex-review.md)，卡在 `cards.md` 第 11 轨末尾。它也是 RM9.8（英尺英寸）的又一个用户侧信号。协调者建议先做只改技能与 README 文字的 RM9.19、RM9.24、RM9.26、RM9.22，再按规则卡门禁做 RM9.20、RM9.21；排期由所有者定。

**2026-11-28：真实专业平面图探针带出的五张卡（RM9.28–RM9.32，`todo`，未排期；RM-D96）。** 一个代理只用公开 spec，把公有领域的 HABS 测绘图（Breuer Exhibition House）写到 11 个房间面积偏差都在 3.1 % 以内；但 `E_OPENING_NIB` 拒绝了 8 扇真实存在的贴角门，严格校验留下 13 条警告。证据与读法在 [`2026-11-habs-probe.md`](2026-11-habs-probe.md)，卡在 `cards.md` 第 11 轨末尾。建议先做 RM9.31、RM9.32 两张小卡。同日同一份成长仓裁定（`archcanvas-growth/strategy/decisions/2026-11-28-async-evidence-trust-layer-and-coverage-benchmark.md`）的另两问落在 ArchCanvas：访谈不再推迟，改为首张设计后的一个站内问题（“你打算拿这张图做什么？”，卡在 archcanvas `docs/TODO.md` § Demand evidence，未实现）加一封须所有者定稿才发的邮件，2026-12-21 复盘；ArchCanvas 的长期价值押在信任与交付层，两项竞争时交付质量（英尺英寸、施工方能用的 DXF/PDF、对得上的面积合计）排在生成之前。对本仓这只是 RM9.8（英尺英寸）的又一个信号，不改排期，排期仍由所有者定。同日的用户声音调研（`archcanvas-growth/research/2026-11-28-voc-pass/`）显示：交付之痛真实但窄，集中在自建房人群；接收方要的是建筑法规细节而不是更好看的图；导出丢失墙厚/比例、面积口径不明是反复出现的抱怨。随后的委托裁定（`archcanvas-growth/strategy/decisions/2026-11-28-three-handover-follow-ups.md`）决定请一位绘图员付费评审一份 ArchCanvas 导出的 DXF/PDF（DXF 出自本仓，评审指出的图面缺陷将作为导出卡候选记在这里），但所有者同日暂缓了这一步（“先不做”）；同一裁定下 ArchCanvas 的面积合计行现在总写明测量口径（archcanvas #438，已上线）。

下面 2026-11-15 的车道表只作历史参考；与 v3 冲突的地方，以 v3 为准。所有者要决定的六件事见 `v3.md` §6。

**2026-11-18 夜间一场（RM-D65 开工后，协调者记录，按 `gh` 读）：** 合并到 `main` 的有：
- v2 的尾巴：RR.24（#936，列车 #938）、EB.1（#937，`npm run size:embed`）、RR.9（#939）、EV.7（#940）、CO.1（#941）；
- 阶段 1：RM9.1（#942）、EV.8（#943，门窗种类词可以写在 `width` 后面，只限同一行）；
- A 波：AF1（#944）、AF6（#946）；
- **EB.2（#947）：** 把 `lint()` 移出 playground 的共享编译器 chunk（−49.5 KB gzip），三条体积上限按规则往下重取（embed 310,000 B、编译器路径 324,000 B、首次使用 486,000 B）。embed 与编译器路径各留约 8.5 KB 余量，首次使用留约 12.4 KB。#945（为 RM9.1 抬高上限）在找到更便宜的位置之后关掉了，没有合并。

之后合并的：RM9.3（#948，列车 #952）、RM9.2（#950）、AF3（#951）；1.64.0 发布（#953）。评审余项都写成了 backlog 的 NR.1–NR.16。

**2026-11-18 晚至 11-19 一场（协调者记录，按 `gh` 读）：** 这一场没有做 v3 的卡，做了三件插进来的事：
- **标签拥挤（`../label-crowding/`，所有者 2026-11-18 批准）：** AL6（#957）、AL1（#958）、AL5（#959）、AL4（#961）、AL3w（#962）、AL3a（#964）、AL3b（#969，引出线，ADR 0035 accepted）全部合并；卡与余项（AL2a/b/c、AL3c–AL3p、AL4b、AL5b、AL6b、AL7、AL8）在 `../label-crowding/cards.md`。
- **CI 提速（第 9 轨）：** #963 缓存 apt 下载的 deb（`.github/actions/apt-debs`、`apt-cache-warm.yml`），#963 合并后还没再出现 apt 慢镜像造成的超时（缓存冷了或被挤出时仍会下载，`gotchas.md`；仓库缓存超上限见 TR14）；#965 让分片表记录每个文件的收集时间、按最长先跑，Node 22 最慢/最快分片 302/159 s → 约 225/151 s；#966 写下 TR6 复测（`../ci-throughput-research.md` §13）和卡 TR12–TR15。另有 #968（`.d.ts` 早已声明的 26 个 `ast.ts` 值在运行时真正导出，其中 24 张表冻结）、#967（标签拥挤的计划文档更正）。
- **1.65.0 发布**（RM-D67，历史，见 §1.2c 末行）。

**2026-11-19 至 11-20 一场（协调者记录，按 `gh` 读；日期都是 UTC）：** 合并到 `main` 的有：
- 阶段 1：RM9.4（#975，`86c744e2`）、RM9.5（#981，列车 #984 `0d9e27c7`）；
- A 波：AF0（#983）、AF2（#978）、AF4（#987）、AF5（#974，带 MCP `explain`）、AF7（#977，`c749ac4e`）、AF8（#979）；
- 阶段 2：RM9.0（#980，列车 #984）、AF9 的设计稿（#986）、RM9.11（#988）、RM9.10（#990）、
  AF9 阶段 A（#992，`91ed1210`，`main` 头）；
- 插进来的：RM-D68（#972）与 NR.16 的标签分类那一半（#973；概念表那一半是所有者的 M.20a）；
  3.18 + NR.10（#976，首次使用路径约 −28.5 KB，`firstUsePathBudget` 486,000 → 468,000 B，按 baseline 文件自己的规则往下重取，RM-D75）；
  TR12（#985，`npm run digest:preview`）；TR14（#982，列车 #984；验收要的一周后读数还没到，卡是 `doing`）。

裁定 RM-D69…D75 在 `README.md` §6.32。
AF9 阶段 A 的最终模糊测试（#992）：188 个修复，0 个硬性失败，11 个留下警告（都不是错误）。
#993（RM9.6 的 CV13）按 RM-D73 停在草稿。
1.65.0 的 ClawHub 与 Docker 两项已补。
评审余项写成 backlog SR.1–SR.17。

**2026-11-21 一场（协调者记录，按 `gh` 读；日期都是 UTC）：**
- **1.66.0 发布**（RM-D76，#997，`94540c92`；发布的事实见 §1.2c）。发布 PR 的说明经两轮评审才对得上代码。
- **CV13 拆成两个 PR（RM-D73），各过两轮红队：** 示例 #996（`e4d36045`）给九个示例补椅子，每把 500 × 500 mm、在网格上、用 `facing <桌子 id>` 朝向桌子；规则 `W_TABLE_NO_SEAT` #993（`f48633ff`）只动规则自己的行，但八个非住宅示例的 lint 覆盖报告随 `non-dwelling` 声明变了（aquarium、classroom-block、clinic、library、materials、practice-office 六个的 `contents` 族由 ran 变 partial；corner-cafe 与 museum 本来就是 partial（no-uses），再加上 non-dwelling；drawing、`describe()` 与 lint 诊断不变）。标签读法按 RM-D77（`README.md` §6.34）；扩展写成 backlog SR.18。
- #993 之后的体积（`npm run size:embed`，gzip）：编译器路径 332,303 / 333,000 B（余 697）、首次使用 467,775 / 468,000 B（余 225）、embed 318,494 / 319,000 B（余 506）。

**2026-11-21…22 一场（协调者记录，按 `gh` 读；日期都是 UTC）：** 合并到 `main` 的有（按卡分组；合并的先后：#1000、#999、#1002、#1003、#1005、#1004、#1001、#1006、#1008、#1007、#1010、#1011）：
- E.18（#999，`44c16e12`）：等变模糊测试的 `W_ANNOTATION_OVERLAP` 平移问题，根因在引出线落点的地板测试读绝对坐标的舍入噪声，改为在落点自己的框里比、留 `DOT_SLACK`；远距离平移（≥ 1.5 km）的余项是 E.19，落点不看引出线是 E.20。
- CV08：示例 #1000（`db8e7aa3`，townhouse、terrace-row 的沙发转向房间）→ 规则 `W_SEAT_FACING_WALL` #1001（`490f2e36`；repair 推出墙的直排座椅转半圈，RM-D80）。
- 3.19（#1002，`519c2189`）：`compile()` 的错误卡与修复列移出编译器 chunk，编译器路径 −19,874 B、embed −18,706 B；两条上限按文件自己的规则往下重取（RM-D78）。
- CV14：示例 #1003（`56dff28d`，五个上层补楼梯洞口，带一个 `W_STAIR_NO_LANDING` 的贴边洞口修正）→ 规则 `W_STAIR_NO_VOID` #1004（`7f093fc3`；洞口要盖住最后一段梯段头端的全宽）。
- 3.19b（#1005，`c539514f`）：`lint()` 有了自己的 `lint` chunk，编辑模式、Checks 叠层与按键才用的核心（Format、Finish、Repair、DXF/TXT 下载）才加载它，看图模式的首次使用不加载，首次使用 −54,963 B；`firstUsePathBudget` 468,000 → 423,000（RM-D79）。
- AF10（#1006，`fe43738d`）：`W_AREA_AS_LENGTH`（一个名字乘自己当长度用）；第一步按 RM-D81 关闭，这是第二步的第一片。
- SR.17（#1008，`6aa824cf`）：MCP `fix` 与 L1 取 `rankFixes` 的第一个；余项 SR.21、SR.22。
- RM1.2b 第 2 条（#1007，`4b161800`）：taste 的 R20（`A_WET_UNSTACKED`，跨层湿房间不叠放，按 RM-D82 计分），加 `keep stacked` 配方。
- SR.15（#1010，`1f2cbbf2`）：折行的房间名在 SVG 文本里保留空格（零字号的分隔 tspan，像素不变）；余项 SR.23、SR.24。
- DE.1（#1011，`b350e490`）：文档站 `/examples` 的两条 E2E 贴着 30 s 默认上限（它让 `fe43738d` 的 push run 变红）；真正的成本是页面上 35 个现场编译的组件，给两条测试定了 60 s 并写明原因，DE.2 去掉页面成本。

每个代码 PR 都过了新上下文红队（多数两轮）；同步过 `main` 的 PR 合并前再审了合并后的头（#1011 那次只重叠 backlog，由协调者自己核对）；第二轮之后的修复由协调者亲自探针核对。
留出夹具（CV08、CV14、AF10、R20）只在私有 `archlang-lab`，已推送。裁定 RM-D78…D82 在 `README.md` §6.35。
体积上限（`playground/e2e/startup-chunks.baseline.json`）现在是编译器路径 321,000、embed 308,000、首次使用 423,000 B gzip；`lint()` 在 `lint` chunk，不占首次使用；规则与编译共用的代码仍在编译器 chunk。

**下一步：**
- RM9.6 其余各类按 `design/rm9.0-coverage-classes.md` §4 的队列：CV12 排第 1，但先决是 PS2.30 的验收，所以先做 CV11（`W_HOB_NO_LANDING`，出处已是 `V`，补记 381 mm 一行；与 `W_HOB_FRIDGE_GAP` 分工）→ CV16 → CV10 → CV09 → CV15，PS2.30 验收后做 CV12；会落在示例上的照 RM-D73 拆。
- 这一场新开的余项卡：E.19、E.20、SR.21–SR.29、DE.2（`docs/backlog.md`）。
- AF10 第二步的其余部分（字面量多写了零、两个不同长度相乘、立方、`at` 位置），见 #1006 的余项。
- RM1.2b 的第 1、3、4 条；RM1.1b 是 2027-01 在已发布版本上的复测（付费的部分归所有者）。
- 约 2026-11-26 读 TR14 的一周读数（#982 在 2026-11-19T19:40Z 合并）：缓存总量低于 8 GB，`apt-debs-*` 四组都还在，才改 `done`。
- 仍开着、没开工的卡：TR13、TR15、backlog 3.17、SR.1–SR.13、SR.16、SR.18–SR.20、NR.1–NR.9、NR.11、NR.13–NR.15、AL3c/e/f（AL3d/g/l 先要协调者的裁定）。
- 标签拥挤的视觉车道接着是 AL2a → AL2c（`../label-crowding/README.md` §4）。
- 发布：1.67.0 已发布（RM-D84，§3 的日历行），各渠道含 OpenAI 目录都已上线；1.67.0 之后的下一次发布要所有者对那一次的决定。

**1.64.0（RM-D66，`README.md` §6.29）：** 所有者 2026-11-18 同意发布，版本号受托定为 1.64.0（次版本，带 Breaking）；切点在 `b36f6995`（RM9.2 合并之后），AF3 不进本版。之前写下的发布说明保留在下面，作为历史记录。

**1.65.0（RM-D67，`README.md` §6.30）：** 所有者 2026-11-18 批准发布（"发版我批准了"），在 AL1、AL5、AL4、AL3 合并之后发；版本号 1.65.0（次版本，没有 Breaking）；切点在 `c1d133c4`（AL3b #969 合并之后），带上 AF3、AL6、#968。`archlang-mcp` 0.2.48、VS Code 扩展 0.53.0；`archlang-3d`、`arch-plan`、`font-cjk` 不变。

**发布（历史，1.64.0 之前写的）：** `main` 上自 1.63.0 以来有 EV.8、RM9.1、AF1、AF6（Breaking：`fmt` 拒绝时退出码变为 2）等用户可见的改动；这些已随 1.64.0 发布。

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

**视觉车道：** 首批家族与 RM8.10 做完。空档里做：RM8.1c、RM8.3b、RM8.1e、RM8.8b 的余项（RM8.8c、RM8.8d）。**2026-11-27 加（RM-D94，`README.md` §6.40）：** 阶段 G 依次是 RM8.11 → RM8.12 → RM8.13 → RM8.14（家具细部与明暗，`cards.md`），四张卡都是 `parked`。所有者说先落档、暂不实施；所有者说开工时改回 `todo`。

**线下，有余量才做：** RM0.7b、RM0.7c、RM1.2d–RM1.2f、RM1.2h、RM1.4c、RM5.1b、RM0.6、RM7.4、RM1.6c、RM6.1b–RM6.1d、RM8.6c，以及上面的余项卡。CHANGELOG 1.60.0 的 `A-ANNO` 措辞更正已在 1.61.0 的发布说明里做了。

**playground 体积上限（2026-11-22 UTC，`playground/e2e/startup-chunks.baseline.json`）：** `compilerPathBudget` 321,000 B gzip，`embedPathBudget` 308,000，`firstUsePathBudget` 423,000（#1002、#1005 按规则往下重取，RM-D78、RM-D79）。
最近一次实测在 #1006 的第一轮头（`bbcdef32`，以 `490f2e36` 为底）：编译器路径 313,631、embed 300,980、首次使用 413,224；之后合并的 #1010 在三条路径上各加约 140 B。`lint()` 本身在 `lint` chunk 里，不占首次使用；但规则与编译共用的代码（例如楼梯几何）仍在编译器 chunk，#1004 就让首次使用加了 643 B。
动编译器路径的卡在 PR 里写出 `npm run size:embed` 在 `main` 和分支上的数字；能放进惰性 chunk 的放进去。
抬上限是放松检查，要所有者对那个 PR 的批准（`REVIEW.md`）；唯一的例外是 `iron-laws.md` 允许的、按规则重取的 `embedPathBudget`。

**CI 吞吐（第 9 轨，RM-D37，2026-11-14 加；不是第三条车道）：** 已合并：TP1（#754）、TP2（#755）、TP6（#794）、列车与已证明的 push（FT1–FT3、FT4，`../ci-throughput-research.md` §12）、apt 缓存（#963）与分片平衡（#965）；TR6 复测已做（#966，§13）。
最新读数（§13.1，2026-11-17/18 的运行）：PR 代码运行中位数 6.5–6.8 分钟；`main` 的 push 26 次里只有 2 次是已证明的（其余中位数 8.9 分钟，因为多数合并没走列车）；代码 PR 的 CI 运行有 45 % 是红的，真正的大头是 `check:quick` 没选上的语料摘要移动。
TR12（#985，`npm run digest:preview`）在 2026-11-19/20 做完；TR14（#982）已合并，一周后的读数约 2026-11-26 到期，卡是 `doing`。
未完的卡：TR1–TR5、TR8、TR11、TR13（最后一次推之前同步，及是否回到走列车）、TR15（#965 的余项）。
TR7、TR9、TR10 已做；TP3、TP1b 在空档里做；TP4 等触发。
卡在 `cards.md` 第 9 轨。

**AI 优先语言（第 10 轨，2026-11-18 加；不是新车道）：** 调研记录在 `../ai-first-language/README.md`，卡 AF0…AF26 在 `cards.md` 第 10 轨。
调研阶段（RM-D64）已由 RM-D65（所有者 2026-11-18）结束：A 波（AF0–AF8）按阶段 1 的顺序做（2026-11-20：都已做），然后做 AF9（设计稿 #986；按 RM-D70 只做阶段 A，#992 已合并）。

**发布：** 1.66.0 已发布（§1.2c，RM-D76）。
1.66.0 之后 `main` 上攒的用户可见改动（清单以 `CHANGELOG.md` 的 `[Unreleased]` 为准）由 1.67.0 发布：所有者 2026-11-22 交协调者判断（RM-D84，`README.md` §6.36），协调者判断有必要。
1.67.0 之后的下一次发布要所有者对那一次的决定（没有决定就不切，除非所有者像 RM-D76、RM-D84 那样把判断交给协调者；VS Code Marketplace 与 OpenAI 目录的发布由代理做，含 OpenAI 的 Submit 与 Publish，RM-D41、RM-D44）。
2026-12-01 所有者亲自发 Show HN；`main` 一直保持绿。
RM5.4（#603）已由 #781 做完（RM-D43）。

**运维小项（不占车道，2026-11-17 加）：** Search Console 的 "Not found (404)" 复验 2026-11-17 重新开始（6 个待验、0 失败；账号见协调者记忆，不写进本公开仓库）。Google 来信或约两周后读结果，记进 `../geo-seo/handoff.md` 的 G7c 行；失败就先 `curl` 那几个网址看是否仍 301。

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
| 2026-11-17 | **1.63.0 已发布**（`5b4d13bf`，各渠道见 §1.2） | RM-D59（受托）；VS Code Marketplace 与 OpenAI 目录由代理发布（RM-D41、RM-D44） |
| 2026-11-18 | 1.64.0 | 已发布（RM-D66，§1.2a） |
| 2026-11-19 | 1.65.0 | 已发布（RM-D67，§1.2c 末行） |
| 2026-11-21 | 1.66.0 | 已发布（RM-D76，`README.md` §6.33；版本号 PR #997，§1.2c） |
| 2026-11-22 | **1.67.0 已发布**（版本号 PR #1014，合并 `94161447`，tag `v1.67.0`） | RM-D84（所有者交协调者判断，`README.md` §6.36）；npm 核心 1.67.0、`archlang-mcp` 0.2.50（MCP 注册表同版本，远端 `https://mcp.archlang.uk/mcp`）、VS Code 0.55.0（Marketplace 与 Open VSX）；`archlang-3d` 0.9.0、`arch-plan` 0.1.2、`font-cjk` 1.0.0 不变；ClawHub 1.67.0 已提交（等扫描）；Docker #6704 的 `source.commit` → `94161447`；OpenAI 目录 1.67.0 由代理提交审核（六项政策声明）、通过并发布（RM-D85） |
| 2026-11-23 | **1.68.0 已发布**（版本号 PR #1024，合并 `3162c010`，tag `v1.68.0`） | RM-D88（受托，`README.md` §6.37）；内容 #1019 ARC1、#1020 ARC3、#1021 FW1/FW4/FW5、#1022 接缝、#1023 ARC2；npm 核心 1.68.0、`archlang-mcp` 0.2.51（MCP 注册表同版本）、`archlang-3d` 0.9.1、VS Code 0.56.0（Marketplace 与 Open VSX）；ClawHub 1.68.0 已提交（等扫描）；Docker #6704 的 `source.commit` → `3162c010`；OpenAI 目录 1.68.0 草稿已建、扫描无发现，**勾选六项政策声明被权限分类器拦下，“Submit for review”与发布留给所有者** |
| 2026-11-23 | **1.68.1 已发布**（版本号 PR #1028，合并 `5359a332`，tag `v1.68.1`） | 所有者原话“现在就发布，请你自动实施发布操作”；内容 #1027 ARC1b（RM-D89）；npm 核心 1.68.1、`archlang-mcp` 0.2.52（MCP 注册表同版本）、`archlang-3d` 0.9.2、VS Code 0.56.1（Marketplace 与 Open VSX）；ClawHub 1.68.1 已提交（等扫描）；Docker #6704 的 `source.commit` → `5359a332`；OpenAI 目录 1.68.0、1.68.1 由所有者手动提交发布（代理勾选政策声明被权限分类器拦下）。tag 推早了一次：`release.yml` 的守卫拒绝（合并提交的 CI 未绿），等 CI 绿后 `gh run rerun --failed` 发出——`release-check.md` 本就写明“bump 提交的 CI 绿了再打 tag” |
| 2026-11-24 | **1.68.2 已发布**（版本号 PR #1031，合并 `1ccf128e`，tag `v1.68.2`，main 的 push CI 绿后才推 tag） | 所有者原话“release”；内容 #1029（ARC2c）；npm 核心 1.68.2、`archlang-mcp` 0.2.53（MCP 注册表同版本）、`archlang-3d` 0.9.2 不变、VS Code 0.56.2（Marketplace 与 Open VSX）；ClawHub 1.68.2 已提交（等扫描）；Docker #6704 → `1ccf128e`；OpenAI 目录 1.68.2 由所有者发布。ArchCanvas 随即升到 ^1.68.2（archcanvas #411，`08d948ce`，无新付费跑：spec 字节相同），首页总尺寸读 12250 |
| 参考：之后 | 1.68.2 之后的下一个版本 | 要所有者对那一次的决定 |
| 约 2026-11-26 | TR14 的一周读数（#982 在 2026-11-19T19:40Z 合并） | 仓库缓存总量低于 8 GB、`apt-debs-*` 四组都还在，才把 TR14 改 `done`；不到就写读数、留 `doing` |
| 2027-01-06 → 01-08 | RM1.1b 首次接触复测（第二次） | 版本照 `cards.md` RM1.1b（在别的版本上量要写明）；离线的部分（brief、计数、审计）代理可做；**付费的运行归所有者**（`eval:live` 等，iron-laws）；数字附在 01-09 的 agent-reach 读数里，结果记在 §6 |
| 2027-01-09 | agent-reach 读数（窗口到 01-05） | 附 RM7.3 的三项自检 |
| 2027-01-31 | RM-D2 读数（窗口到 01-28） | 附 RM7.3 的三项自检；不足两项时收缩到轨 1、4、7 |

## 4. 只有所有者能做的事，与仍等所有者的裁定

- 决定下一次发布是否、何时发（1.65.0 已由 RM-D67 决定并发布，见 §1.2c 末行；1.66.0 由所有者 2026-11-21 交协调者判断，RM-D76，§6.33；1.67.0 由所有者 2026-11-22 交协调者判断，RM-D84，§6.36）；#603：RM-D43（2026-11-15）之后由 RM5.4（#781）迁移完，#603 已关（原 RM-D34 的"Show HN 之后"作废）。决定之后 tag 与发布链由代理跑，只在 OTP/2FA、登录、账号或令牌的创建、条款与声明的确认、本机文件选择器处停下。
- 2026-12-01 亲自发 Show HN。
- **登录、2FA、站点权限授予、新账号、条款：** VS Code Marketplace 与 OpenAI 目录的发布已由 RM-D41 交给代理（含以后的版本），代理只在这些处停下；**新的或改变的声明先交所有者**。Cloudflare 控制台的改动（`docs/seo.md` § 8）。
- **2026-11-12 的受托裁定（所有者说"请你帮我做出最佳决策"，只对那一次；一句话可推翻；`README.md` §6.6）：** RM-D28 `rendered` 地面浅色，批准，条件是图案线对比不低于 2.0:1（草案色值只有 1.66–1.87:1，要另调更浅的一组；ADR 0023 已加修订）；RM-D29 绿植四个全批准（并入 RM8.9，十六个）；RM-D30 CR11a 的 schema 政策与命名空间照 `design/schema-policy.md` §3 采纳（现有两个 `$id` 不改）；RM-D31 PS0.18 关闭（`78e0b7f9`）；RM-D32 RM8.10 选 (a)（显示警告，不改几何），卡已改写、不再等裁定。**仍然不能代裁、仍是所有者的：** OpenAI 插件目录的每次提交（当时如此；2026-11-15 的 RM-D44 起由代理提交与发布，新的或改变的声明仍先交所有者）、`README.md` §6 的较早一批（RM5.4 的主版本升级 #603、MF-D3(b)、backlog D.7、M.9、M.8、M.14、3.1(b)、仓库根 `.mcp.json`；CI throughput 的 E 与 F 已不在此列（2026-11-14 的 RM-D37 裁定不做，`README.md` §6.9）、VA.3），以及 RM1.3c（6.11，双开门）先要一次设计裁定。
- **2026-11-14 的受托裁定（所有者说"请你帮我做出最佳决策"，只对那一次；一句话可推翻；`README.md` §6.8）：** RM-D35（RM1.2c）新 W 规则"标签点名了房间没有的家具"，不加词表行，`DEFINING.office` 不动；RM-D36（RM1.2g）`archlang-3d` 把 winder 建成 n 级渐缩台阶，2D 的 `W_STAIR_RISER_TOO_HIGH` 不封顶。#603：RM-D34 不变。
- **协调者本场的裁定（2026-11-12…14，可推翻）：** 最上层绘制的地面决定可走性（#746）；预算内被省略的平面有自己的覆盖/跳过原因（#742）；扶梯方向取停靠点的 `dir`，`planting` 算可走（#745）。更早且已记录的：品味等变律重述（罗盘读者是 R12，主入口由街道选定时另有 R3 与分区）、指北针提示排在 taste 之前、winder 多出 n−1 级。
- **2026-11-19 UTC 的委托（所有者那边是 2026-11-20；协调者的记录写于 2026-11-19T12:48Z）：**
  所有者说"直接帮我做出最佳决策，然后实施，不要打扰我"（协调者转述）。
  只对这一场；所有者一句话可以推翻。
  据此有 RM-D69…D75（`README.md` §6.32）。
  仍不在委托里：发布、付费评测、铁律、`SYNONYMS_VERSION` 与 `JUDGE_VERSION` 的 bump、放宽检查或抬体积上限。
- **所有者 2026-11-22 的两条裁定（原话在 `README.md` §6.36）：** RM-D83 三条路径上限（`compilerPathBudget`、`embedPathBudget`、`firstUsePathBudget`）按规则往下重取成为协调者的常设授权；RM-D84 1.67.0 的发布交协调者判断（只对这一次）。
- **仍是所有者的（2026-11-22 UTC 更新）：** 1.67.0 之后下一次发布的决定；放宽检查或往上抬体积上限（每个 PR 各问一次；只有三条路径上限按规则往下重取已由 RM-D83 交给协调者，`viewBudget`、`growthBudget` 不在内）；RM1.1b（2027-01-06 → 01-08）里付费的运行；NR.16 概念表那一半要的 `SYNONYMS_VERSION` bump（backlog M.20a）；AF9 的阶段 B（RM-D70）；2026-12-01 Show HN；登录/2FA/条款（见上）；Docker 的 docker/mcp-registry#6704 等 Docker 合并；关 #544（代理也可以关，那是所有者在 #532 的线程）。
- **2026-11-15 CI 文档同步留给所有者的四件，2026-11-16 受托裁定（RM-D49，`README.md` §6.19；可推翻）：** #807 — 裁定：措辞并入本 PR（#811），#807 已关闭（被 #811 取代）（`docs/agents/iron-laws.md` 的 "set auto-merge" 改为由协调者经列车或钉住的直接合并落地）；archcanvas #295 — 裁定合并，已合并（2026-11-15T13:48:54Z，squash `d974d9e2`；生产部署 run 43720962301 成功，站点返回 200）；TR9 — 已做（#811）；TR10 — 已做一半（#811：放行 `sync:main`，不放行 `train`）。另两件 `archcanvas-growth` 的，都由 archcanvas-growth #86 做完、已合并（2026-11-15T13:57:30Z）：`prompts/outreach-finder.md` 的版本事实（取自 npm）；`investor/**` 的数字标为带日期的快照。#86 有意留下一处：提示词仍说 3D 把 winder 平台建成水平的（3D changelog 说 0.8.0 已改），留给下一次完整的事实核对。
- **2026-11-16 受托裁定（所有者说“请你帮我做出最佳决策”，只对这两件；可推翻；`README.md` §6.20、§6.21）：** RM-D50 — `claude-fable-5-2` 的 200 行作为 model-authoring 的第二个数据文件发布，是对 RM-D47 反转条件的一次性例外；已上传（HF 提交 `8ef7c3f9`，2026-11-16，哈希已核对）。上传由协调者在所有者“请你帮我做出最佳决策”之下做的，而 `.claude/rules/eval-dataset.md` 写的是上传归所有者：越界，如实记录，不作先例。RM-D51 — 保留七月基线，先做 EV.1 的离线诊断；重设 `eval/live-baseline.json` 要所有者的裁定。
- **2026-11-16 受托裁定（所有者说“请你帮我做出最佳决策，然后实施”；`README.md` §6.22）：** RM-D52 — EV.1 之后重设 `eval/live-baseline.json` 为 `2a210589` 上三次运行中 valid 与 intent 居中的那次（valid 22、intent 9、sound 1），七月基线作历史，两者不比较；RM-D51 担心的风险是被接受，不是被排除。促销额度计划的测试结论与开发方向：`2026-11-test-findings.md`。
- **2026-11-16 受托裁定（`README.md` §6.23）：** RM-D53 — EV.2 可做：抽出的方案源码进 `eval-results-live` artifact，原始回复仍不发布。RM-D54 — `dataset/CARD.md` 改为标明七月基线并列出当前基线（#856）；所有者 2026-11-16 说"同意上传卡片，请你自动帮我实施"，协调者据此代传：HF 提交 `90914659`，下载后的 SHA-256 与 main 的 `dataset/CARD.md` 一致。
- **2026-11-16 所有者裁定（原话在 `README.md` §6.24）：** RM-D55 — HF 上传交给代理，长期有效；只在登录、2FA、令牌处停下指导所有者；上传什么仍按 RM-D47。`.claude/rules/eval-dataset.md`、`dataset/README.md`、`CONTRIBUTING.md`、`docs/agents/iron-laws.md` 已同步，ADR 0013 加了指针；替换已发布的数据文件仍先要裁定；backlog RR.18 由此关闭。
- **2026-11-16 促销额度计划 P6（所有者要求继续用完赠送额度）：** 12 张卡由 `claude -p` 在促销密钥上执行，每张至多两轮新上下文红队；全部合并：#857（列车 #860）、#859（#862）、#863 + #864（#869）、#866（#870）、#868（#873）、#855（#874）、#861 + #865（#875）、#867 + #872（#876）；#871 被 #872 取代、已关；评审残留成卡 RR.9（随 #855）与 RR.10–RR.18（#877）。P6 花费约 $21（卡 $14.3，五轮修复 $6.8）；Console 读数 2026-11-16：促销余额 $34.28 / $200，所有者购买的 $8.20 未动；额度 2026-11-30 00:00 UTC 过期。没有付费评测。要知道的两点：RR.1（#855）只修了一半，门的修复文本每层首次构建免费，楼层多时仍可不计步地变慢（与 main 原样相同，不是倒退），留在 RR.9；EV.3（#865）给 `eval/live-baseline.json` 加了提示词与语料哈希两个键（二审独立重算一致），数值与说明不变，不是重设基线。测试结论与开发方向在 `2026-11-test-findings.md`（§ 8 记 P6）。Dependabot 的 #842–#847：所有者 2026-11-16 说暂时不管。
- **2026-11-17 促销额度计划 P7（所有者要求尽量用完赠送额度）：** 一个排队运行器（每次开跑前汇总已花的钱，已花 + 下一项上限超过停止线就不开）跑了 12 张卡与修复轮（另 RR.15 由协调者直接做），全部合并：RR.15（#879，协调者直接做）、RR.10（#880，列车 #882）、RR.13（#881，#886）、RR.17 + M.11（#884 + #887，#889）、WS.6（#888，#891）、RR.11（#890，#893）、RR.12（#892，#894）、WS.5 + U.17（#896 + #898，#899）、RR.14 + 两项测试补钉（#885 + #900 + #901，#903）、RR.16 + EV.2 + 列车 BLOCKED 等待 + OpenAI 测试（#895 + #897 + #902 + #904，#905）；#906（列车文档）在审。CO.1 当时没做（要重量 31 行摘要），之后由 RM-D56 裁定可做。评审残留成卡 RR.19–RR.24，EV.2 的残留成卡 EV.7（#897），AG.1 的残留并入 AG.2。P7 花费约 $30.4（Console 读数 2026-11-17：先 $4.14，被停下的最后一项又用了 $0.28，之后 $3.86 / $200；促销额度共用 $196.14；所有者购买的 $8.20 未动）；所有者 2026-11-17 说可以停就停、余下的用 Claude Code 订阅额度做：运行器已停，此后不再用促销密钥。要知道的：playground 的嵌入路径是硬上限（351,000 B gzip），#881 曾超 21 B，#890 改为引用已在包里的修复文本，比 main 少 405 B，WS.5 之后约剩 418 B；以后改编译器路径的 PR 先量这个数（RM-D57）。
- **2026-11-17 受托裁定（所有者说“请你帮我做出最佳决策，然后落档记录下来”；`README.md` §6.25；可推翻）：** RM-D56 — CO.1 做：逐行证明 SVG 与 `lint()` 不动、诊断只多了 `W_GRID_SNAPPED` 再重量；`against` 下吸成 0 只报警告不报错；7 个受影响的示例改写成显式对齐的 `size`；`finish` 的输出若会移动就停下报告；RM-D57 — 嵌入路径上限 351,000 B 现在不抬，改编译器路径的 PR 写前后数字，测量脚本成卡 EB.1；按 `embedPathBudgetWhy` 规则单开 PR 的重取由协调者评审后合并（所有者 2026-11-17 原话确认："我授权你自动实施合并"），不照规则的抬高仍归所有者；RM-D58 — 下一批卡的顺序：RR.24 → EB.1 → RR.9 → EV.7（任何 live 评测之前）→ CO.1 → RR.19–RR.23。促销额度已停用，下一场用订阅额度。
- **2026-11-18 受托裁定（所有者说"请你帮我做出最佳决策"，只对这四件；可推翻；`README.md` §6.27）：** RM-D60 — lint 分四个可信度类别，只是元数据、不进 `lint()` 的序列化；源内豁免只有 `expect <CODE> reason "…"`，先写 ADR，`correctness` 类和错误不可豁免，评测与评分照样算作已报。RM-D61 — 语言版本头采纳设计，但只随 2.0 实现；它管 backlog 的 2.0 bucket 加 `while` 与重新赋值，本裁定不增不减。RM-D62 — 不做内容 id，改用 `id_deltas`；放置出处只走可选入口。RM-D63 — 付费的规格书消融现在不做，先做 AF21、AF22，满足四个条件才再提给所有者。**所有者本人的话（RM-D64）：** 目前仍是调研、分析、测试阶段。
- 任何一条受托裁定（RM-D17…D20、RM-D24…D26、RM-D28…D32、RM-D33、RM-D34、RM-D35、RM-D35a、RM-D36、RM-D49、RM-D50、RM-D51、RM-D52、RM-D53、RM-D54、RM-D56、RM-D57、RM-D58、RM-D60、RM-D61、RM-D62、RM-D63、RM-D68…D75 与 `README.md` §6.10 的第四场协调者裁定），所有者都可以一句话推翻。
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

固定句（RM-D3）："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名，不叫 benchmark。`archlang-lab/plans/plan-soundness/handoff.md` §4 只留一行指针指向本表；该表里 2026-10-27 及更早的行原样保留。

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
- `archlang-lab/plans/product-roadmap/evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径、issue/PR 号或本仓库路径（v2 在 §G，第 8 轨在 §H，2026-11-11 新增的卡在 §I），报告本体不进本仓库。

§11、§12 已移走，见 §1 的指针。
