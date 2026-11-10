# 数学地基计划：卡片

## 0. 所有卡片共用的规则

- 门禁：本地只跑 `npm run check:quick`，改了 `docs/*.md` 再加 `npm run docs:build`；CI 绿才算合并证据。全量测试、drift、e2e、bench 只在 CI 上跑（`docs/agents/iron-laws.md`）。执行者简报只列这些门禁。
- 硬规则照旧：
  - `compile()` 保持纯函数、同步、确定。
  - 新工作先向步数计量记账，再分配。
  - 坐标在 `MODEL_RANGE_MM` 之内。
  - 高度不画任何东西。
  - 新语言形式都要附一条字节恒等律，用测试钉住。
  - 派生位置从形状本身取，不能取包围盒。
  - 3D 只放在 `packages/archlang-3d`。
- 会移动 `describe()`/`lint()` 数字的卡（MF1、MF2、MF5），在 PR 里写明"为什么新数字更正确"，并给出受影响的示例清单。不为让测试变绿而祝福金样。
- 新 lint 规则用 `new-lint-rule` 技能，新家族用 `new-fixture-family` 技能。
- 状态取值：`todo`、`blocked`（等裁定或等依赖）、`done`（合并后删卡，并在 `handoff.md` 记一行）。
- 估时单位为 AI 日，误差 ±50%。

## 波次 A：不加语法，不需裁定

### MF1 · 精确净宽 — `todo` · 3 日 · opus
栅格（`src/analyze/nav-grid.ts`）继续负责"能否到达"。"有多宽"改为按门洞、墙面之间的精确最近距离判断：平方距离加整数或 `BigInt` 比较。栅格结果作为对照预言机保留。

- 消化 backlog M.16 里的"clear-width decision by squared comparison"一条。
- 验收：在语料上列出所有 `W_PATH_TOO_NARROW` 一类结论的变化清单，每个变化给出几何理由。

### MF2 · 建筑面积（外墙外表面） — `todo` · 2 日 · opus
在 `describe().totals` 新增一个字段，取墙体拼接（`joinWallSet`）外轮廓的外环面积。拒绝条件与 GIA 相同：没有闭合外墙环、外环细分、外环嵌套（`src/analyze/gross-area.ts`）。

- `CompileResult` 只增不删。
- 字段名和口径说明里写"按外墙外表面"，不写"符合 GB/T 50353"。
- 2.20 m 半面积规则另立 MF23。

### MF4 · 家具默认高度区间 + 两条区间检查 — `todo` · 4 日 · opus
目录给 4 个 overhead 家族加默认区间 [z₀, z₁]，并新增两条 lint：吊柜挡窗、门扇扫到挂墙物。

- PR 必须论证改动了目录注释 "The catalogue holds no heights"：区间只供 lint、describe 和 3D 读取，绘图仍只看 `cutPlaneLayer`。
- 3D 包的 `mountMm` 改为读同一来源，保证 Mesh3D/GLB 的固定哈希不动。如果哈希动了，要写明原因。
- 依据：README §3.2。

### MF5 · 可见性图步行距离 — `todo` · 3 日 · opus
新增一个 opt-in 事实：障碍角点之间的可见性图，用 `src/algebra/paths.ts` 的 min-plus 求最短路。它是 M.16 egress 事实的前提。

- 消化 backlog M.12。
- 原有四连通结果保留为对照。

### MF11 · 2D 与 3D 的弧线口径 — `todo` · 1 日 · sonnet
本卡只做决策记录，不写代码：剖面（DS13）读精确弧，还是两边共用一个细分函数。

- 需要先测改动对 laneway 固定哈希的影响。
- 结论写进 DS13 卡。

## 波次 B：剖面输入（引用已有卡，不重复）

- **RM6.1**（`../product-roadmap/`）= 楼板构造 datum + DS11 剖切符号。MF-D1 已于 2026-11-10 裁定采纳，语义见 README §6.1，排期仍是批次 D 首位。RM6.1 合并后，MF14、MF19、MF23 才会解锁。
- **DS12**（`../drawing-set/`）：Scene3D 补缺，包括修复 `slab-below-floor` 的墙板重叠。
- **#681**：`walls from rooms` 的解析墙输出。

## 波次 C：语法（每张卡都要先拿到裁定）

### MF12 · `mount` 子句（backlog 5.5） — `blocked`（MF-D3） · 4 日 · opus
作者可以给任意靠墙家具写 `mount <mm>`，并新增搁板、挂墙电视这类家族。

- 虚线由"挂墙"分类决定，不由数值决定。
- 附字节恒等律测试。

### MF14 · 挂顶家族（吊灯、吊扇） — `blocked`（MF-D3，以及 RM6.1 合并；MF-D1、MF-D2 已裁定） · 5 日 · opus
范围按 README §6.2：只做物体，不发光，不出灯具表。没写楼板时，碰头检查跳过并给出 coverage 原因（§6.1 第 4 点）。
新增 `above <id> drop <mm>`，位置取目标形状的对称中心，没有唯一对称中心时拒绝。

- `test/overhead-furniture.test.ts` 应该故意变红：补上 `W_FURN_CLEARANCE` 的 overhead 分支，不要删除钉子。
- 新增碰头检查。
- 3D 造型：吸顶盘 + 吊杆 + 16 边形叠层灯罩。
- 只做几何，不发光。

### MF15 · 窗帘 — `blocked`（MF-D3；MF-D2 已裁定） · 5 日 · opus
新增 `curtain on <window>`，参数为 `track`、`stack`、`state`。

- 2D 在窗内侧画波浪线，画法在 PR 里写明来源，或者标为项目约定。
- 3D 用正弦截面加偏移，做成封闭薄壳；褶皱倍数到 A/λ 的换算查预计算的整数表，不在运行时迭代。
- 新增窗帘堆叠被挡的检查。

### MF16 · 墙定位线与分层构造 — `blocked`（MF-D4） · 6 日 · opus
`wall … align inner\|center\|outer`，后续再做分层。

- 净面积、GIA 和 MF2 都要随定位线变化，并附字节恒等律测试。

## 波次 D：剖面（并入 drawing-set 的时序，D3）

### MF17 · 任意轴棱柱 — `todo`（随 DS13/DS15） · 3 日 · opus
把"竖直棱柱"推广为"沿任意轴拉伸的棱柱"，楼梯和单坡屋面都用这个模型。写成 DS15 的设计输入。

### MF18 · 剖面的 D4 等变定律 — `todo`（随 DS13） · 2 日 · opus
扩展 `test/helpers/d4-oracle.ts`，验证"镜像后再剖切"等于"剖切后再镜像"。

### MF19 · 竖向尺寸链与标高 — `blocked`（RM6.1、DS13） · 4 日 · opus
复用 `dims auto` 的排布思路和 `num-format.ts`；高度的计算方法按 DS14 读 GB 55037-2022 后确定。

### MF20 · 有理数旋转斜剖 — `blocked`（MF-D6） · 3 日 · opus
只允许 cos 和 sin 都是有理数的方向，坐标乘以分母后仍为整数，全程不舍入。只在 3D 包内部使用。

### MF22 · 剖面分层填充 — `blocked`（MF16、DS13） · 2 日 · opus

## 波次 E：其余，按证据排序

### MF3 · 统一整数格点与对称吸附 — `blocked`（MF-D5） · 5 日 · opus
覆盖 E.11、M.9，与 RM1.5b 一起做。

### MF6 · 上下层对位 — `todo` · 3 日 · opus
检查承重墙和柱、管井、楼梯间的上下对位，以及卫生间是否压在卧室上（与 RM1.2b 合并）。只做 advisory。

### MF7 · 结构常识事实 — `todo` · 2 日 · opus
输出跨度、开洞比例、悬挑长度，阈值注明来源。只做 advisory。

### MF8 · 面积标准 `--area-standard` — `todo` · 3 日 · opus
每个标准对应一个命名函数，并引用条文。条文引用走 #680 的出处结构；引用 GB 50096 前先查 #684（GB 55038-2025 是否取代它）。

### MF9 · `assert` 断言 — `blocked`（MF-D9） · 3 日 · opus

### MF10 · 有效性评测入口 — `todo` · 2 日 · sonnet
把 `eval/` 和 `dataset/` 包装成可验证奖励的入口，并写说明。

- 不跑 `eval:live`。
- 不重生成 dataset canary。
- 措辞上不出现"首个"或"唯一"。

### MF21 · 顶面布置图（RCP） — `blocked`（MF-D7） · 5 日 · opus
RCP 与平面图同向，直接复用平面坐标。

### MF23 · 2.20 m 半面积规则 — `blocked`（RM6.1、MF2） · 2 日 · opus
先读 GB/T 50353-2013 原文，再动手实现。
