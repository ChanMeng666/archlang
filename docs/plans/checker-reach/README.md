# checker-reach：检查任何平面、互操作与分享（2026-11-05）

取代 drawing-set 波次 1–2 在冻结前的排期（CR-D1）。机器限制、执行方式与发布流程不变（`docs/agents/`、`AGENTS.md`）。卡片 CR0 起编，决定 CR-D1 起编；恢复入口是 `handoff.md`。

---

## 1. 为什么要重排

旧排期（2026-11-02）的主线是 drawing-set 波次 0–2：指标、`level 2..5`、学校、总图、`building polygon`。这些卡的依据是中国方案投标图纸集。2026-11-02 到 11-04 在 growth 仓库新增的调研给出了不同的方向：

| 证据 | 来源（growth 仓库） | 对排期的含义 |
|---|---|---|
| ArchLang 的检查能力已领先所有开源竞品，缺口在边缘：不能读写别家开放格式、写回没有版本守卫、没有公开检查集、语言规范没有独立版本 | `research/2026-11-04-archlang-optimization-roadmap/03`、`04` | 路线图 P0 是互操作和“专业性”，不是新语法 |
| OpenPlan3D（MIT，270 星）是威胁排名第一的开放格式，有格式、校验器和代理技能，但没有平面级检查 | `research/2026-11-04-new-competitors-…/04`、roadmap `06` | 先做 OpenPlan3D 导入，让 ArchLang 成为它的检查器 |
| “验证器/检查器”角度在八个定位角度中得分最高（19/25） | `research/2026-11-02-multi-angle-positioning-research/06` | Show HN 应以“检查任何平面”为核心 |
| 真实用户需求：从图片/PDF 出图（约 12 个线程，未满足）；尺寸漂移（约 10，已满足）；编辑稳定性（约 5，已满足但没人看得到）；代理不知道 ArchLang 能做什么（Daniel） | `research/2026-11-04-outreach-user-needs-insights/README.md` | 便宜的文档和引导工作，价值很高 |
| 外联回复没有点击数据，链接类型的效果无法比较 | 同上 §5 | 短链接顺带提供第一份点击数据 |
| 定位裁定：A1 区域规则只能叫 advisory；A2 允许说“公开检查集”；A3 “能检查其他开放格式的平面”要等导入器在 npm 发布后才能说 | `strategy/decisions/2026-11-04-positioning-proposals-and-competitor-registry.md` | 导入器要赶在 Show HN 前发布，A3 才能写进文案 |

drawing-set 的证据仍然有效，但没有一位外部用户提出过这些需求。距离冻结（11-24）只剩 19 天，而且只能串行执行，所以：

**CR-D1：drawing-set 波次 1–2（DS3–DS9）推迟到 Show HN 之后，届时按证据重新排序。DS1（spec 腾空间）和 DS2（N.1 缺陷）保留，并提前到第一批。** 被拒方案：维持原排期。这样 Show HN 时 ArchLang 只多了几个中国投标图的语法形式，缺少调研认为最有分量的互操作和检查集。

## 2. 所有者新增的三项需求

### 2.1 3D 视图自由旋转（CR4）

**现状（已核实）。** playground 的“3D preview”标签页是 `@chanmeng666/archlang-3d/browser` 的 `mountReplay`。它是一段按时间轴播放的回放，结束时停在固定的“终点机位”（`packages/archlang-3d/src/replay/camera.ts`，方位角 −32°）。用户只能播放或拖动进度条，**不能转动视角**（`mount.ts`、`preview3d.ts` 里没有指针或滚轮处理）。3D 计划 §6.1（`docs/plans/archlang-3d/development-plan.md:839`）早就规定了 OrbitControls 和预设视角，但它属于 M2/M3，原定等 N10 读数。

**CR-D2：所有者 2026-11-05 的明确要求，把查看器规格 §6.1 中的“相机”一行提前做，只限现有的 Tier A 范围**（playground 标签页 + 包自带的 HTML 回放）。Tier B 曝光（ArchCanvas、定位第 8 行）仍然等 N10。

范围：
- 回放结束后（或用户在任何时刻拖动时，回放暂停），可以拖动旋转、滚轮或双指缩放、右键或双指平移。
- 预设视角：等轴测（即当前终点机位）、俯视、四个立面方向，另加“复位”按钮。复位后的画面必须与终点机位**逐像素一致**。
- 能看清每个角落：提供“隐藏屋顶/上层”开关（楼层分组 `level:L<n>` 已经存在）。水平剖切滑块放到第二步，列为可选。
- 无障碍：方向键和 +/- 可以代替拖动；`prefers-reduced-motion` 时关闭阻尼。
- 仰角限制在地面以上，不允许钻到地下。缩放有上下限，范围由 `cameraStops` 的包围盒推出，不写魔数。

不变的规则：回放仍是 `t` 的纯函数，`__seek`/`__frameHash` 保留；默认路径不动，所以 laneway 的 Mesh3D/GLB SHA-256 和关键帧像素基线都不动。OrbitControls 取自已精确钉死的 three 0.186.1 的 `examples/jsm`，内联，不引入动画库，不走 CDN。3D 代码只在标签页懒加载，启动 chunk 不变（`playground/e2e/preview3d.spec.ts` 的预算）。D5 的预览标注保留原文。

验收：e2e 测试拖动后画面变化，复位后 `__frameHash` 等于终点帧；键盘操作也能转动；启动 chunk 字节不变。archlang-3d 发一个 0.x 次版本，playground 随 `main` 部署。

### 2.2 用上 Cloudflare Workers Paid（CR3、CR10，以及后续项）

**现状（已核实）。** 三个 Worker 中，两个网站（`archlang-docs`、`archlang-playground`）是无脚本的纯静态资源。ADR 0019 不加脚本的理由是“免费计划每天 10 万请求的上限”。只有 `archlang-mcp` 有脚本，它用了 Analytics Engine 和两个 rate-limit 绑定，`observability` 是关闭的。KV、D1、R2、Cron、Workers AI 都没用。

付费计划每月含 1,000 万次请求和 3,000 万 CPU 毫秒；D1 含 250 亿行读、5,000 万行写、5 GB 存储；KV 的计费页写的是每月 1,000 万次读，限额页写的是不限，以计费页为准。`assets.run_worker_first` 可以写成路由数组（例如 `["/s/*", "/api/*"]`）：只有匹配的路径会调用脚本，其余仍按静态资源免费服务。所以 ADR 0019 当初担心的问题，现在可以在不牺牲静态免费服务的前提下解决。

**CR-D3：新增 ADR 0034 修订 ADR 0019。** playground Worker 可以有 `main`，但只能通过 `run_worker_first` 数组接管明确列出的路径。所有静态路径（含 `/embed.html`）行为逐字节不变，由 `scripts/smoke.mjs` 守住。docs 站点保持无脚本。

“充分利用”的意思是每一项资源都对应一个已被调研证实的需求，不是为了用而用。按价值排序：

| # | 用途 | 资源 | 对应需求 | 时间 |
|---|---|---|---|---|
| 1 | **短链接 + 社交卡片预览图**（见 2.3） | Worker 脚本、KV、Cache API、Analytics Engine、rate limit | 分享与传播；第一份点击数据 | 冻结前（CR3） |
| 2 | **托管的“检查任何平面” HTTP 接口**：`POST /check` 接收 `.arch`、Plan JSON，以及之后的 OpenPlan3D/OAS JSON，返回 lint JSON。公开检查集可以不安装就运行 | mcp Worker 现有的 compile 基础设施 | 检查器定位、P0-4 | Show HN 后（CR10） |
| 3 | 打开两个脚本 Worker 的 Workers Logs（`observability`），并设置用量告警 | 付费计划自带 | 运维；防止费用意外 | CR3 内顺带做 |
| 4 | Cron Trigger 生产巡检：npm 版本、CDN、embed、MCP 清单和已发布版本是否一致，替代一部分手动发布后核对 | Cron | 发布纪律 | 2027 Q1 |
| 5 | Workers AI 视觉模型：图片 → `.arch` 草稿的**探针**（只出草稿，必须人工确认 2–3 个尺寸后再 lint） | Workers AI（每天 1 万 neurons 免费额度） | 主题 A，最大的未满足需求 | 2027 Q1 先写设计；ADR 0005 和定位风险由设计裁定 |
| 6 | 托管 playground 团队层（保存、协作） | D1、Durable Objects | 路线图 P2-3（Mermaid 模式） | 先写决策备忘，不建 |

不做的：R2（短链接和预览图用 KV 加 Cache API 就够）；Browser Rendering（预览图用 resvg-wasm 即可）。

### 2.3 短链接（CR3）

**现状（已核实）。** `playground/src/share.ts` 把整段源码 deflate-raw 压缩后再 base64url，放进 `#z=`。这样不需要后端，但链接随平面变长。所有者 2026-11-05 贴出的一个链接超过 1,000 个字符。

**设计（CR-D4）。**
- 分享按钮默认生成短链 `https://playground.archlang.uk/s/<id>`，并保留“复制完整链接”选项。完整的 `#z=` 链接永久有效，也是服务不可用时的退路。
- `POST /api/share`：请求体就是现有的 `z` 载荷。服务端检查：长度上限 64 KB；能解压成 UTF-8；用核心 `parse` 能解析（有步数预算，作用是防止把它当成任意文本存储）；按 IP 限流（rate limit 绑定）。
- **内容寻址 id**：对载荷做 SHA-256，取 base62 的前 8 位（约 47 位熵；如果遇到前缀相同但内容不同，就加长）。同一个平面永远得到同一个链接，天然去重；链接不可修改，也没有可枚举的递增编号。
- 存储：KV `SHARE`，键 `s:<id>`，值为载荷。不存 IP、不存账号、不设过期。
- `GET /s/<id>`：返回一个很小的 HTML。页面里有 Open Graph/Twitter 卡片元数据，标题来自平面的 `title`/图签，没有就用 “ArchLang plan”；然后用 `location.replace` 跳到 `/#z=<payload>`。爬虫读取卡片，用户直接进入编辑器。embed 支持 `embed.html#s=<id>`。
- **`GET /s/<id>.png`**：1200×630 的预览图。Worker 里运行 `compile()` 得到 SVG，再用 resvg-wasm 转成 PNG，字体沿用核心 `font.ts` 的字体。结果是确定的，因此用 Cache API 永久缓存。X 和 LinkedIn 不显示 SVG 的 og:image，所以必须是 PNG。这对传播很重要：贴在 X 上的链接会直接显示户型图。
- 计数：Analytics Engine 记录创建次数和打开次数（只记 id 和日期，不记 IP），回答调研里“没有点击数据”的问题。
- 隐私：分享对话框写一句“短链接会把这份平面存到 archlang.uk 的服务器上；完整链接不会”。`SECURITY.md` 加上删除请求的渠道，所有者可以用 `wrangler kv key delete` 删除。
- MCP：`compile` 工具结果中的 playground 链接也改成短链（创建失败时退回长链），`MAX_CHAT_URL` 的问题随之消失。

被拒方案：(a) 第三方短链服务：外部依赖，统计和品牌都不在自己手里，还可能被拦截。(b) 自增 id 存 D1：可以被枚举，也无法去重。(c) 放在 `archlang.uk/p/`：会让 docs 站点也必须加脚本，而且需要跨域 POST。
验收：e2e 走完“生成 → 打开 → 源码逐字节相同”；同一份源码生成的 id 相同；静态路径的 smoke 结果不变；`curl -A Twitterbot` 能拿到卡片元数据；PNG 是合法图片，并带上 `Cache-Control`。

---

## 3. 排期（串行，一次只跑一个执行者）

### 第 A 批 · 11-05 → 11-13 → core 次版本 + archlang-3d 次版本 — 全部 `done`

| 卡 | 内容 | 估时 | 执行者 |
|---|---|---|---|
| CR0 | 本计划落库；drawing-set handoff 记下 CR-D1；清理已合并的旧 worktree | 0.3 日 | 主会话 |
| CR1 | = DS1：给 `spec.llm.md` 腾出 ≥650 单位（每处删除在 PR 里写明同一事实留在哪一行；合并后复查） | 1 日 | architect |
| CR2 | 沉默缺陷四组，每组一个 PR，先复现，已不存在就如实记录：`batch -o` 重名覆盖和 `ENOENT`；JSON 往返时 `uses` 被改；`axis.N + d` 偏离轴线；`finish` 把家具放到 `void` 上 | 2.5 日 | architect |
| CR2b | = DS2：N.1 选图幅时漏算表行 | 1 日 | builder |
| CR3 | 短链接 + 预览图 + ADR 0034 + observability（2.2、2.3） | 3 日 | architect |
| CR4 | 3D 自由旋转 + 预设视角 + 隐藏上层（2.1） | 2 日 | architect |
| CR5 | 写回版本守卫：`fix`/`finish`/`repair`/`fmt --write` 支持 `--expected-hash <sha256>`，不匹配时报 `E_STALE_SOURCE`；MCP 工具每个结果都带 `source_hash`（路线图 P0-3） | 1.5 日 | architect |

CR3 和 CR4 不发核心版本，随 `main` 部署（CR4 另发 archlang-3d）。如果时间紧，先砍 CR4 的“隐藏上层”，旋转本身不砍。

### 第 B 批 · 11-13 → 11-23 → core 次版本 — 全部 `done`，与第 A 批同一次发布

| 卡 | 内容 | 估时 |
|---|---|---|
| CR6 | **OpenPlan3D 导入**：`arch import --from openplan3d`，支持 web JSON（cm）和 handoff JSON（m），是 `src/import/` 下的纯函数，零依赖。装不进的字段要么进 `dropped`，要么报诊断，绝不静默丢弃（`swingDirection`、`flipSide`、`riserCount` 等）。样例取自 OpenPlan3D 仓库（MIT，注明来源）；10 个样例导入后都能 lint（路线图 P0-1，只做导入；导出放到 C 批） | 4–5 日 |
| CR7 | 新手引导（纯文档）：①“从一张图片出平面”的工作流：用户自己的 LLM 读图，用一个已知长度（如 900 mm 门）定比例，请用户确认 2–3 个尺寸，然后 lint；②“只改一个房间，其他不动”（`impact --lock`）的例子放进 README、playground 起始模板和 ChatGPT 起始提示；③MCP 和技能开头加一段能力摘要和“常见错误”页（回应 Daniel 说的“代理不知道 ArchLang 能做什么”） | 1.5 日 |
| CR8 | #405 的 L 形洞口栏杆，是真实用户的需求，排得下就做 | 1–2 日 |

第 B 批发布后，定位裁定 A3 的条件就满足了，Show HN 文案可以写“也能检查 OpenPlan3D 的平面”。如果 CR6 赶不上 11-23，Show HN 文案就不写 A3，导入器放到 C 批。**绝不在发布之前写进文案。**

### 后续卡（第 A、B 批的红队余项，做完删行）

| 卡 | 内容 |
|---|---|
| CRF1 | CR8 的网格单元切分让洞口旁的墙面碎成多段（最重要）：合并共线相邻段，且保持转动不变 |
| CRF2 | 房间投票的求和顺序依赖输入顺序，改成与顺序无关 |
| CRF3 | `W_FURNITURE_ON_VOID` 的消息里引用的坐标随帧变化，改成相对房间的说法 |
| CRF4 | 3D 里多段洞口的 `<id>#<k>` 编号，与 2D 对齐并写进包文档 |
| CRF5 | 楼梯井同时报 `W_FURNITURE_ON_VOID` 和楼梯规则时去重 |
| CRF6 | 与 `r.left + 500` 同类的偏移写法，确认要么拒绝要么有明确语义 |
| CRF7 | `schedule openings` 的直接测试 |
| CRF8 | MCP 可选工具 `short_link`（CR-D6） |
| CRF9 | 预览图的 CJK 字体（现在中文标签画成方块） |
| CRF10 | MCP `INSTRUCTIONS` 已用 879/900 字符，能力摘要没放进去：腾空间或改放资源 |
| CRF11 | playground 起始模板加“只改一个房间”的例子（CR7 ② 的剩余部分） |
| CRF12 | `impact --lock --json` 的顶层 `ok` 与 `lock.ok` 不一致 |
| CRF13 | `src/ir.ts` 里一条过时注释 |

### 冻结期 · 11-24 → 12-01（Show HN）

只修缺陷，可发补丁版。另加：核对 Show HN 文案时，用短链接和它的预览图做演示链接；观察短链接的计数和错误日志。

### 第 C 批 · 12-02 → 12-16（路线图 P0 窗口的后半）

- CR9：OAS 导入（mm JSON，路线图 P0-2）；OpenPlan3D 导出。
- CR10：**公开检查集**：50 个夹具，每个都写明必须产生的诊断，按通过/失败判定。种子来自 Opus 5.5 测试里的失误（门关着却画了开启弧、标签写着书桌却没有书桌、楼梯总高差不足层高）和 AECBench 的五项核心检查。加一个托管的 `POST /check` 接口。用词遵守裁定 A2：只能叫“公开检查集”，不能叫 benchmark 或 leaderboard。
- CR11：语言规范独立版本 `lang-1.0`，schema 用带版本的 `$id`，`GOVERNANCE.md` 写清变更和弃用政策（P0-5）。
- CR12：一致性语料 `conformance/`：100 例输入加期望结果，任何实现都能运行（P0-6）。

### 第 D 批 · 2027 Q1（按证据重新排序后再定）

NZ/AU advisory 画像（裁定 A1，只能叫 advisory）；`lint --brief` 检查需求书里的数字是否达到；MCP 工具分组；FLOORA 导入；drawing-set DS3–DS9 重新排序（其中 DS5 `level 2..5` 对多层用户价值最高）；3D M2 起的工作和 IFC 按 N10 读数与用户需求再定；Cron 巡检；Workers AI 读图探针的设计；#344 mask 导入器。

## 4. 决定记录

| # | 决定 | 状态 |
|---|---|---|
| CR-D1 | drawing-set DS3–DS9 推到 Show HN 之后，按证据重排；DS1、DS2 提前进第 A 批 | 所有者 2026-11-05 文字批准 |
| CR-D2 | 3D 查看器规格 §6.1 的“相机”一行提前，仅限 Tier A（playground 标签页 + 包内 HTML 回放）；Tier B 仍等 N10 | 所有者 2026-11-05 的明确要求 |
| CR-D3 | ADR 0034 修订 ADR 0019：playground Worker 可有 `main`，只经 `run_worker_first` 数组接管列出的路径；静态路径逐字节不变；docs 站点仍无脚本 | 随 CR3 的 ADR 落地；`iron-laws.md` 的托管条目由所有者 2026-11-05 文字批准（“批准托管铁律”） |
| CR-D4 | 短链接：内容寻址 id、KV 存储、仅在用户点“短链接”时存平面，对话框写明 | 所有者 2026-11-05 文字批准 |
| CR-D5 | `axis.N + d` 这类在开口位置上对轴线做算术的写法报 `E_OPENING_DATUM` 拒绝，而不是悄悄偏离轴线（轴线是平面坐标，墙上位置是沿墙距离）；改写 `at axis <label>` 或提示给出的沿墙距离 | 主会话 2026-11-05 裁定（CR2 第 3 组，`axis.N + d`） |
| CR-D6 | MCP 工具不默认返回短链：那会在用户没选择时上传平面（违背 CR-D4），也违背 `link` 工具“不发往服务器”、`openWorldHint: false` 的已发布契约。另开可选工具 `short_link`（自带 annotations、约 3 s 超时、失败退回长链）列为后续卡；`MAX_CHAT_URL` 不变 | 主会话 2026-11-05 裁定（CR3 执行者提出） |
| CR-D7 | CR6（OpenPlan3D 导入）在发版前最后一个合并，让文档站和 npm 同时上线（裁定 A3：发布前不写进文案） | 主会话 2026-11-05 裁定 |
| CR-D8 | #405 的 L 形洞口：`void … polygon` 给出任意直角多边形洞口，`rail` 沿洞口边画栏杆；新码 `E_VOID_POLY`、`E_VOID_RAIL`；墙面按网格单元切分以保持转动不变 | 主会话 2026-11-05 裁定（CR8 设计稿） |

所有者专属步骤（CR3 时暂停给出确切操作）：CI 的 Cloudflare API token 若无 KV 权限需加 “Workers KV Storage: Edit”；Billing → Notifications 设用量告警。

## 5. 证明本计划错了的信号

- 短链接上线两周，打开次数中位数为 0：分享不是瓶颈，CR3 只算方便功能。
- OpenPlan3D 导入发布八周内没人用（npm、issue、playground 计数）：互操作的传播价值不成立，C 批的 OAS 降级。
- Show HN 的评论集中在图纸集、剖面或 IFC，而不是检查器：D 批把 drawing-set 和 IFC 提前。

来源：Cloudflare [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)、[KV Limits](https://developers.cloudflare.com/kv/platform/limits/)、[D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)、[Static Assets 路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)、[run_worker_first 更新日志](https://developers.cloudflare.com/changelog/post/2025-06-17-advanced-routing/)（2026-11-05 读取）。
