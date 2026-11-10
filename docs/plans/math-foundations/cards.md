# 数学地基计划：卡片

## 0. 所有卡片共用的规则

- **门禁**：本地只跑 `npm run check:quick`；改了 `docs/*.md` 再加 `npm run docs:build`。合并以 CI 绿为证据。全量测试、drift、e2e、bench 只在 CI 上跑（`docs/agents/iron-laws.md`）。执行者简报里只列这些门禁。
- **硬规则照旧**：
  - `compile()` 保持纯函数、同步、确定。
  - 新增的计算先向步数计量记账，再分配内存。
  - 坐标在 `MODEL_RANGE_MM` 之内。
  - 高度不画任何东西。
  - 新语言形式都附一条字节恒等律，用测试钉住。
  - 派生位置从形状取，不从包围盒取。
  - 3D 只放在 `packages/archlang-3d`。
  - 铁律 D25（墙没有结构属性、不做承重检查）和 T6（不加 `area` 词、不加 `m2` 后缀）照旧。
- **改数字的卡**：会移动 `describe()`/`lint()` 数字的卡（MF1），PR 里要写明新数字为什么更正确，并附受影响示例清单。不为让测试变绿而改写金样。
- **语法卡**：标 `[语法]` 的卡依赖 PS7.9 先给 `spec.llm.md` 腾出空间。该文件已用 29,695/30,000，上限是铁律。
- **技能**：新 lint 规则用 `new-lint-rule` 技能，新家族用 `new-fixture-family` 技能。
- **状态取值**：`todo`、`blocked`（等裁定或依赖）、`folded`（已并入别的卡）、`withdrawn`（撤回）。卡合并后删除，并在 `handoff.md` 记一行。
- **卡号**：MF13 空缺，从未使用。
- **估时**：单位是 AI 日，±50%。

## 波次 A：不加语法，不需裁定

### MF1 · 精确净宽 — `todo` · 3 日 · opus
栅格（`src/analyze/nav-grid.ts`）继续负责"能否到达"。"有多宽"改为取路线上任意两个障碍物之间的精确最近距离，障碍物包括门洞、墙面和家具，比较时用平方距离。栅格的结果保留下来作对照。

- 精确性有前提：要做到零误差，坐标必须先落到 MF3 的整数格点上。MF3 之前，用双精度平方比较，误差界写进 PR。
- 这张卡吸收 backlog M.16 里"clear-width decision by squared comparison"那一条。
- 验收：在语料上列出所有宽度类结论（如 `W_PATH_TOO_NARROW`）的变化清单，每一处变化给出几何理由。

### MF5 · 可见性图步行距离 — `todo` · 3 日 · opus
新增一个 opt-in 事实：在障碍角点之间建可见性图，用 `src/algebra/paths.ts` 的 min-plus 求最短路。这张卡吸收 backlog M.12，原有的四连通结果保留作对照。

- **精确性**：边长是平方根。平局一律用整数键打破，不靠浮点数的大小顺序。
- **验收**：平移整张图、施加 D4 的 8 种对称后，结果都不变（E.11 那一类问题）。
- 这张卡不是 M.16 egress 事实（支配点、不相交路线、最大流、最小割）的前提。

### MF11 · 2D 与 3D 的弧线口径 — `todo` · 1 日 · sonnet
只做决策记录，不写代码。要回答的问题：剖面（DS13）直接读精确弧，还是让 2D 和 3D 共用一个细分函数。

- 先测改动对 laneway 固定哈希的影响。
- 结论写进 DS13 卡。

### MF2 · 外墙外表面面积 — `folded` → drawing-set DS3
DS3 已经有 `footprint_outer_m2` 和 `gross_floor_area_outer_m2`，按 D5 走 opt-in 的 `describe --facts indicators`，默认 `describe()` 的字节不动。本卡不另做。

### MF4 · 家具区间检查 — `folded` → MF12
"吊柜挡窗"和"门扇扫到挂墙物"这两条检查，需要作者写出的高度。核心目录不放默认高度：按 ADR 0030，默认高度属于 3D 账本。所以这两条检查随 MF12 一起做。

## 波次 B：剖面输入（引用已有卡，不重复）

- **RM6.1**（`../product-roadmap/`）：楼板构造 datum + DS11 剖切符号。MF-D1 已于 2026-11-10 裁定采纳，语义见 README §6.1，排期仍是批次 D 首位。PR 里必须一并解决 MF-D11（单层和顶层的天花从哪里来），以及"一层楼板都没写时 `describe()` 一字不变"这条字节恒等律。
- **DS12**（`../drawing-set/`）：Scene3D 补缺。注意墙板重叠已经由 `31739be3` 修好，DS12 里 `slab-below-floor` 那一项需要先按现状重新核对。
- **#681**：输出 `walls from rooms` 解析出的墙。

## 波次 C：语法（全部 `[语法]`，依赖 PS7.9）

### MF12 · `mount` 数据子句 + 两条区间检查 — `blocked`（MF-D3(b)、PS7.9） · 5 日 · opus
作者可以给任意靠墙家具写 `mount <mm>`。它是纯数据，**不画任何东西，也不决定虚线**。还要新增搁板、挂墙电视这类家族。

- 原 MF4 的两条检查在这里实现，只在作者写了相关高度时才触发，和 `isFloorLength` 的先例一致。
- 3D 包：作者写的 `mount` 优先于账本里的默认值。
- 附字节恒等律测试。
- backlog 5.5 的"画在剖切面以上"写法属于 MF-D3(a)，单独裁定，不在本卡。

### MF14 · 挂顶家族（吊灯、吊扇） — `blocked`（MF-D3(b)、RM6.1、MF-D11、PS7.9；MF-D1、MF-D2 已裁定） · 5 日 · opus
范围按 README §6.2：只做物体，不发光，不出灯具表。

新增写法 `above <id> drop <mm>`。位置取目标形状的对称中心，没有唯一对称中心时拒绝。

- 得不到天花高度时（没写楼板，或单层、顶层），碰头检查跳过并给出 coverage 原因；在通行栅格上仍按障碍物处理。
- `test/overhead-furniture.test.ts` 会故意变红。正确做法是补上 `W_FURN_CLEARANCE` 的 overhead 分支，不要删除这个测试。
- 3D 造型：吸顶盘 + 吊杆 + 16 边形叠层灯罩。
- 回放时的显隐规则（一直隐藏，还是相机抬起后出现）在本卡决定。

### MF15 · 窗帘 — `blocked`（MF-D3(b)、PS7.9；MF-D2 已裁定） · 5 日 · opus
`curtain on <window>` 是一个**元素模块**（`src/elements/`，在 `defs.ts` 注册），参数有 `track`、`stack`、`state`。

- 2D：在窗内侧画波浪线，形状关于轨道中心偶对称。画法要么在 PR 里写明来源，要么标为项目约定。
- 3D：偶对称截面（如 cos）加偏移，构成封闭薄壳。褶皱倍数到 A/λ 的换算查预计算的整数表，运行时不迭代。纱帘用的材质槽先加进核心的 `FIXTURE_MATERIALS`。
- 新增一条检查：窗帘堆叠的位置是否被家具挡住。

### MF16 · 墙定位线与分层构造 — `blocked`（MF-D4、PS7.9） · 6 日 · opus
新增 `wall … align inner|center|outer`，分层构造放到以后。

- 净面积、GIA 和 DS3 的外表面面积都要随定位线变化。
- 附字节恒等律测试。

## 波次 D：剖面（并入 drawing-set 的时序，D3）

### MF17 · 任意轴棱柱 — `todo`（随 DS13/DS15） · 3 日 · opus
把"竖直棱柱"推广为"沿任意轴拉伸的棱柱"，楼梯和单坡屋面都用这个模型。写成 DS15 的设计输入。

### MF18 · 剖面的 D4 等变定律 — `todo`（随 DS13） · 2 日 · opus
扩展 `test/helpers/d4-oracle.ts`，验证"先镜像再剖切"等于"先剖切再镜像"。

### MF19 · 竖向尺寸链与标高 — `blocked`（RM6.1、DS13） · 4 日 · opus
复用 `dims auto` 的排布思路和 `num-format.ts`。高度的算法按 DS14 的要求，读 GB 55037-2022 后再定。

### MF20 · 有理数旋转斜剖 — `blocked`（MF-D6） · 3 日 · opus
只允许 cos 和 sin 都是有理数的方向，坐标乘以分母后仍是整数。只在 3D 包内部使用。

已知冲突：微米坐标乘上分母后会超过 2⁵³，必须用 `BigInt`，而 DS13 要求只用 number 四则运算。本卡必须给出取舍，比如限制分母的大小，或在剖面阶段先舍入一次。

### MF22 · 剖面分层填充 — `blocked`（MF16、DS13） · 2 日 · opus

## 波次 E：其余，按证据排序

### MF3 · 统一整数格点与对称吸附 — `blocked`（MF-D5） · 5 日 · opus
与 roadmap RM1.5b 完全重叠（E.11、M.9），本卡只给 RM1.5b 补数学说明，跟着它一起做。

### MF6 · 上下层对位说明 — `todo` · 0.5 日 · sonnet
只写文档：在 `skills/archlang/SKILL.md` 或 `docs/` 里说明怎样用 `keep stacked` 锁住管井、楼梯间、电梯和空洞的上下贯通。

- 湿区叠放归 RM1.2b（taste `A_*` + `keep stacked` 写法）。
- 承重墙对齐不做（D25）。

### MF7 · 结构常识事实 — `withdrawn`
与铁律 D25 冲突。要重提，只能走 MF-D10，并由所有者亲口批准。

### MF8 · 面积标准 — `todo` · 3 日 · opus
每个标准对应一个命名函数，并引用条文。

- **开工门槛：先读原文。** GB/T 50353-2013 的原文目前还没读过。
- 参数名不能读成"符合某标准"。
- 条文引用走 #680 的出处结构。
- 引用 GB 50096 之前先看 #684（GB 55038-2025 是否已取代它）。
- 走 opt-in，默认 `describe()` 字节不动。

### MF9 · 更多 `keep` 度量 — `folded` → plan-soundness PS4.9
原来的 `assert` 想法作废：`keep` 已经实现"只检查、不求解"，而 `area`/`m2` 写法违反 T6。

### MF10 · 有效性评测入口 — `todo` · 2 日 · sonnet
把 `eval/` 和 `dataset/` 包装成可验证奖励的入口，并写说明。

- 不跑 `eval:live`。
- 不重生成 dataset canary。
- 措辞上不出现"首个""唯一"。

### MF21 · 顶面布置图（RCP） — `blocked`（MF-D7、MF14） · 5 日 · opus
RCP 与平面图同向，直接复用平面坐标。

### MF23 · 2.20 m 半面积规则 — `blocked`（RM6.1、DS3、MF8） · 2 日 · opus
先读 GB/T 50353-2013 原文，再动手。
