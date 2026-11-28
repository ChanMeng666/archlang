# 核心体积、模块边界、各国标准与数据飞轮（2026-11-22 评估与卡片）

所有者 2026-11-22 问了五件事：语言包是否撑大核心、各国建筑标准要不要拆包或拆 lint、"尽量解耦"的猜测是否合理、
Cloudflare 数据为何"查不到"、要不要全面埋点建数据飞轮。另有 ArchCanvas 首页暴露的三个弧墙问题。
本页是评估和卡片；排期仍只在 `product-roadmap/`（RM-D15）。数字都是当天在 `main` a0f85ebf 上实测的，方法写在各节。

## 0. 结论

| 问题 | 结论 |
|---|---|
| 多语言撑大了核心吗 | **没有。** 西/葡房间词最多 1.5 KB gzip，约占 compiler 块（292,478 B gzip）的 0.5 %。11 MB 的 CJK 字体早已是独立包。不拆 |
| npm 包里什么最大 | **sourcemap**：解包 16.3 MB 中占 8.8 MB（54 %）；示例 SVG 1.5 MB。这才是该瘦的（MX1） |
| 各国标准拆包吗 | **拆数据，不拆规则。** 标准是参数（`LINT_PROFILES` 已是数据），规则是测量（代码，留在核心）。先让 profile 能从外部 JSON 读入（MX2）；到第 5 个司法辖区或出现外部贡献者时，再出一个纯 JSON 的 profiles 包（MX3），不是一国一包 |
| "尽量解耦"合理吗 | **方向对，度量要换。** 健康来自"能独立改、能单独测"，不来自包的数量。按 §4 的三条标准决定拆包；最值得做的解耦是内部几何接缝（ARC2 的前置） |
| Cloudflare 查询为空 | **数据一直都在。** "为空"是 2026-08 的一次 `curl` 假阴性和 2026-11-10 第三方估算工具的 0。真缺口是免费版只能查 30 天且没人归档：growth PR #99 每周归档并回填了三周 |
| 全面埋点 | **不全面记录，要闭环。** 只记封闭列表里的事件和诊断码，不记内容。飞轮的燃料是"模型在哪些诊断码上失败"（FW1–FW3） |

## 1. 多语言的实测

现有的"多语言"有三处：

1. **西/葡房间词**（NR.16，#973，`src/vocabulary.ts` 和 `src/intent-concepts.ts`）。量法：`git show fddad848 -- src` 新增的非注释行 gzip 后 1,480 B。这是上限，打包压缩后更小。它在 compiler 块里（该块 sourcemap 的 `sources` 列有 `src/vocabulary.ts`）。
2. **sheet text**（`src/sheet-text.ts`）是机制，不是语言包：图纸上的词由 plan 自己写。
3. **CJK 字体**：`@chanmeng666/archlang-font-cjk`，11,143,200 B 的 OTF，早已是可选包。核心里只剩 `src/text-metrics.ts` 的码位区间判断。

结论：不拆。拆出一个包，就多一条发布链、多一个版本矩阵、多一道跨包 byte-identity，换来的是约 1 KB。

**以后什么时候拆语言词表**：任一条件满足就拆成懒加载 chunk（必要时再做可选包），接缝留在 `vocabulary.ts` 的匹配器：
(a) 词表在 compiler 路径上超过 6 KB gzip（约预算余量的 70 %）；
(b) 加入需要分词的文字（中文、日文、泰文的房间名不能按空格切 token）。
concept 表的改动要动 `SYNONYMS_VERSION`，这个版本号只能由所有者批准（iron laws）。

## 2. npm 包真正的体积

量法：`npm pack --dry-run --json`。tarball 4,566,865 B，解包 16,284,860 B，114 个文件。

| 类别 | 字节 | 占解包 |
|---|---:|---:|
| `dist/**/*.map`（含 `sourcesContent`） | 8,775,476 | 54 % |
| `dist/` JS | 3,199,384 | 20 % |
| `examples/`（其中 SVG 1,519,182） | 1,780,573 | 11 % |
| `CHANGELOG.md` | 876,982 | 5 % |
| `dist/index.d.ts` 等 | 826,540 | 5 % |
| `dist/assets/Roboto-Regular.ttf`（PDF/PNG 后端用） | 515,100 | 3 % |

**MX1 · npm 载荷瘦身**（中等风险：改 `files` 和 tsup 配置）。
- sourcemap 不再带 `sourcesContent`（tsup `sourcemap` + esbuild `sourcesContent: false`），或者干脆不发 `.map`。二选一时先选前者：栈追踪还能对到行号，源码去 GitHub 看。
- 示例只发 `.arch`。先证明 CLI、skills、MCP 和文档构建都不从包里读 `examples/*.svg`：grep 读取点，再在干净目录 `npm i` 打出的包跑一次 `arch compile examples/studio.arch`。
- `CHANGELOG.md` 照旧随包（是否截断留给所有者决定，不在本卡）。
- 验收：解包体积的前后对比写进 PR；`release-check.md` 的打包检查仍然绿。

## 3. 各国建筑标准：拆包还是 lint

**现状**（`src/lint/ruleset.ts`）：`LINT_PROFILES` 有 `residential-basic`、`accessibility-advisory`，另有三个司法辖区 profile：`cn-`、`uk-`、`us-residential-advisory`。每个都是 `Partial<LintRuleset>`，即纯数字覆盖，每个数字带条款出处和 [S]/[V] 等级。规则代码各辖区共用。lint 已不在 compile 路径上（3.19b 起是 playground 自己的 `lint` 块）。三个辖区 profile 刻意不参加 `finish`/`furnish` 的"只变好"比较（ADR 0024 §6、ADR 0025 §7）。名字刻意不用标准名，不宣称合规（ADR 0005）。

**判断**：标准是参数，规则是测量。规则代码要跟几何、步数预算、诊断目录一起演进，拆出去就会跨包漂移。会因辖区而变的只有数字和出处。所以拆数据。辖区若需要核心没有的规则（如 R37 逃生窗），规则进核心并参数化，数字归 profile，`DEFERRED_PROFILE_NUMBERS` 已经是这个模式。

**MX2 · profile 作为外部数据**（新语言外形之外的 CLI/API 面）。
- 一个 profile JSON schema（`schemas/lint-profile/v0.schema.json`）。每个字段的值必须带 `source` 和 `grade`（`S-full`/`S`/`V`），否则拒收，以保持现有的出处纪律。
- `lint --profile-file <path>`（Node CLI，经 `World` 读文件）；API 已有 `opts.ruleset`，只补校验函数 `parseLintProfile()`。
- 用三个内建辖区 profile 生成它们的 JSON 形式（gen 脚本，不手抄），并以 drift 测试证明 JSON ↔ 内建一致。
- 外部 profile 与辖区 profile 一样不进 never-worse 比较。

**MX3 · profiles 包**（有条件：第 5 个司法辖区，或第一位外部贡献者提交 profile 时才做）。
`@chanmeng666/archlang-profiles`：纯 JSON 加一个索引，零代码、零依赖。核心保留 `residential-basic` 和 `accessibility-advisory`（不分文化）。不做一国一包。

## 4. "解耦 → 健康"的判断

猜测的方向是对的，但"拆成更多包"不等于健康。项目已有的解耦：
- **独立包**：`archlang-3d`（three.js，ADR 0030）、`font-cjk`（11 MB）、`mcp`、`mcp-worker`、`web-component`。
- **核心内部**：
  - 元素注册表：一个元素一个模块，不用 switch；
  - compile/first-use/lint/press 四条懒路径各有字节预算（`playground/e2e/startup-chunks.baseline.json`）；
  - 生成的 module map；
  - byte-identity 定律。

**拆包标准**（三条满足一条才拆）：
1. 带来重依赖或运行时差异：three.js、大字体、只能在 Node 跑的代码。
2. 消费者或发布节奏不同：3D viewer 和法规数据都是这种。
3. 可选，且占 compile 路径预算 5 % 以上。

不满足的，用模块边界、懒 chunk 加预算就够了。每多一个包，就多一条发布链（现在每次发版已是 core、mcp、vsix、3d、OpenAI 多渠道）和一个版本矩阵。

**最值得做的解耦不是拆包，而是一个内部接缝**：房间几何的"字面顶点"假设散在各个分析层里。有效顶点数、自交、质心、邻接、占用与导航网格、`dims auto` 链，都直接遍历 `polygon` 的点（`docs/backlog.md` § NS 的记录）。这正是 ARC2 难做的原因。先抽出一个 `Ring`/`Edge` 接缝（线段或圆弧，带精确面积、包含判断和固定步长离散），各层只经这个接缝读几何，再加弧边。见 §5 的 ARC2。

## 5. ArchCanvas 首页暴露的弧墙问题

复现：ArchCanvas `public/showcase/plans/bay-bungalow.arch`（首页图纸），用 1.67.0 编译，并渲染成 PNG 看过。

| 现象 | 原因 | 卡 |
|---|---|---|
| 平面图里弧墙上的窗子歪斜 | `src/elements/window.ts` 在弧形宿主上，沿窗中点的切线画直线（罩、两条墙面线、两条玻璃线、窗台）。1600 宽的窗在 R1900 上，窗边偏离弧约 hw²/2R ≈ 170 mm，超过 250 墙厚的一半，于是窗"歪"出墙面；它又不在弧中点，切线是斜的。3D 里是对的 | **ARC1**，执行中（`fix/arcw1-openings-on-arc`）：弧形宿主上改画同心圆弧、径向窗边；直墙字节不变 |
| 平面图和 3D 里弧形部分的地板没铺满 | 起居室写的是 `room … size 5800x6800`，矩形。外墙的凸窗弧在矩形之外，那块（约 1.5 m²）不属于任何房间：2D 不填色，3D 的木地板只铺房间、露出灰色楼板。语言不能写带弧边的房间：`room polygon` 里的 `arc` 会被拒绝（`src/elements/room.ts`），这是 backlog § NS 的已知缺口 | **ARC2**（大）；在它之前用 ARC3 至少把缺口报出来 |
| lint 没报这块地 | `W_FLOOR_UNASSIGNED` 要求覆盖率低于 `minFaceCoverRatio` 0.95，**且**空地不少于 `minUnassignedM2` 0.5。这里覆盖率约 96 %，所以不报。规则注释说 5 % 是"人站不进去的窄条"，可凸窗正是人能站进去的地方 | **ARC3** |

**ARC2 · `room polygon` 里的 `arc` 边**（新语言外形，大卡）。
- 前置：先抽出 §4 的 `Ring`/`Edge` 接缝。这一步是纯重构：语料上 SVG、`describe()`、`lint()` 和诊断全部字节不变。
- 语法与墙一致：`room polygon (0,0) (2400,0) arc (5400,0) radius 1900 cw (5800,0) …`。
- 面积用精确闭式（ADR 0027 已为弧做过 ½∮(x dy − y dx)）。标签点、邻接、导航和占用网格按固定步长离散（核心对弧已用 7.5°）。`dims auto` 对弧边出 R 引线。3D 的地面饰面读弧，用 `packages/archlang-3d/src/curves.ts` 的弦容差。
- 交付时附 byte-identity 定律：不用弧边的 plan 字节不变。新元素外形属于 minor 版本。
- ArchCanvas 在 ARC2 发布后，把 bay-bungalow 的起居室改写成带弧的多边形，重拍首页图和 3D 静帧。在那之前首页换不换图，由 ArchCanvas 自己决定。

**ARC3 · `W_FLOOR_UNASSIGNED` 改按"人能否站进去"判断**（改 lint 规则，允许移动 lint 语料）。
- 一块连通空地，若能放下一个 600 × 600 mm 的方块（站立的大小）且面积不少于 `minUnassignedM2`，就报，不看覆盖率。
- 覆盖率阈值只用来容忍沿墙的窄条。
- PR 写清 lint 语料上新增了哪些报告，并逐条判断是真缺口还是误报。

## 6. Cloudflare "查询为空"

2026-11-22 用账户 API 实测（wrangler 的只读 OAuth，和 CI 的 "Account Analytics: Read" token 都能读）：

- **Web Analytics**（GraphQL `rumPageloadEventsAdaptiveGroups`），近 7 天：playground 1,870 次页面加载，archcanvas.uk 595，archlang.uk 485。
- **Analytics Engine**，近 30 天：`archlang_share` 创建 445、打开 447；`archlang_mcp` 的 `tools/call` 8,226。
- **Zone HTTP** 和 **Workers** 调用量都有数，但含机器人，不是人数。

"为空"的来历在 growth 仓库有记录：2026-08-19 一次永远不会返回正值的 `curl` 检查，以及 2026-11-10 Similarweb/Ahrefs 等估算工具的 0。

真缺口有两个：
1. 免费版只能查 30 天，而每周任务只记了 MCP 调用。已修：growth PR #99 每周一归档上一周（去机器人；按主机记加载与访问、来源主机、路径（id 折叠成 `:id`）、国家，外加 `archlang_share` 事件），并回填了 2026-10-26 到 2026-11-15 三周。
2. `archlang.uk` 和 `playground.archlang.uk` 共用一个 Web Analytics 站点。读数要按 host 分，不能按站点分。

## 7. 数据飞轮：怎样做才合理

**不做"尽可能全面地记录每个交互"**，理由：
- 两个站的隐私页（`docs-site/privacy.md`、ArchCanvas `/privacy`）都承诺不收内容、IP 和标识。全面记录会推翻这些公开承诺。所有者在新西兰，适用 NZ Privacy Act 2020，访客里约四分之三来自美国，还有欧盟访客（GDPR）。
- 所有者 2026-11-07 的裁定是 playground 页面代码里不加埋点（`archlang-lab/plans/playground-minimal/README.md`）。要改，需要所有者的原话。
- 全量记录是噪音，飞轮要的是能改变决定的信号。

**飞轮的定义**：模型写 `.arch` → 编译器回诊断 → 按诊断码聚合 → 改 spec、错误目录、自动修复和 lint → 首遍通过率上升 → 更多人和 agent 用。ArchCanvas 的 `generation_attempts` 已按模型记首遍有效率和 token，但只记诊断的**个数**，不记**是哪些码**。缺的就是这一环。

| 卡 | 做什么 | 只记什么 | 谁决定 |
|---|---|---|---|
| **FW1** MCP Worker | `compile`/`validate`/`lint` 调用额外写一个点：结果（ok、error、refused）和诊断码列表 | 目录里的 `E_*`/`W_*` 码（封闭列表，最多 20 个，按码排序）；不记源码、不记 id | 本页（与现有 `archlang_mcp` 同一隐私口径，隐私页加一句） |
| **FW2** ArchCanvas | `generation_attempts` 增加 `first_pass_codes` 和 `final_codes`（text[]） | 同上 | ArchCanvas 仓库（只加列） |
| **FW3** 周报 | growth 每周任务把 FW1/FW2 的前 10 个码与周环比写进 CSV；连续两周排前 3 的码自动成为 archlang backlog 候选 | 计数 | 本页 |
| **FW4** playground 事件 | 编译、导出格式、3D 打开、分享的计数（封闭列表），经 playground Worker 的 `/api/*` 写 Analytics Engine | 事件名和诊断码 | **所有者**（推翻 2026-11-07 的裁定，并改隐私页） |
| **FW5** 自愿提供失败样例 | "把这个失败的 plan 发给我们改进 ArchLang"，逐次勾选，存进私有仓库作评测语料 | 用户明确同意给出的源码 | **所有者**（新的数据收集和用途） |

顺序：FW1 → FW2 → FW3。FW4、FW5 等所有者决定。

## 8. 顺序与所有者待定

**已裁定（2026-11-22，所有者交代理决定，`product-roadmap/README.md` §6.37）**：FW4 做（RM-D86），FW5 做、建在短链接上（RM-D87），ARC2 进 1.68.0、限期 2026-11-29（RM-D88）。三张卡的规格以 §6.37 为准。

执行顺序（一次一个执行者）：

1. ARC1（执行中）→ ARC3 → FW1 + FW4 + FW5（遥测，一个 PR）→ ARC2 的接缝重构 → ARC2 → 1.68.0。
2. FW2 交给 ArchCanvas 仓库；FW3 在 FW1 上线一周后接进 growth 的周任务。
3. MX1、MX2 排在 1.68.0 之后；MX3 在条件触发时做。

仍由所有者定的：`CHANGELOG.md` 是否截断。

**状态（2026-11-23）**：

| 卡 | 状态 |
|---|---|
| ARC1 弧墙上的门窗按曲线画 | 1.68.0（#1019） |
| ARC3 站得下人的空地报 `W_FLOOR_UNASSIGNED` | 1.68.0（#1020） |
| ARC2 接缝 / `room polygon` 里的 `arc` 边 | 1.68.0（#1022、#1023） |
| FW1 / FW4 / FW5 遥测 | 1.68.0（#1021），线上已验证 |
| FW2 ArchCanvas `generation_attempts` 的 `first_pass_codes` / `final_codes` | ArchCanvas #405，生产库已按 OPERATIONS.md 加列（RM-D90），已上线 |
| FW3 每周码表 | archcanvas-growth #100（`data/web-traffic.csv` 的 `mcp_codes`、`playground_events`），已回填 2026-11-16 那周 |
| ARC1b 模型里的门扇挂在弧上 | 1.68.1（#1027，RM-D89；ADR 0023 修正案“模型更正不是重画”） |
| ArchCanvas 用上 1.68.1（首页 bay-bungalow 起居室改成弧边、重拍图） | ArchCanvas #406 合并（`7cf12c75`），已上线；付费定价跑 $3.638，结论 BUMP（RM-D92） |
| ARC2c 弧边房间不再让 `dims auto overall` 出现小数总尺寸；楼层词不再重复 | 1.68.2（#1029）；ArchCanvas #411 采用，首页总尺寸读 12250 |
| MX1、MX2 | 未开始；MX3 等条件 |
| 残留 | `docs/backlog.md`：ARC1c、ARC1d、ARC2b、ARC3b、FW5b |
