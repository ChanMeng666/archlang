# 02 场地指标、日照与标准研究报告（ArchLang 规划文档用）

> 调研原始记录（2026-11-02，基线 `main@18127701`）。结论若与 `../README.md` 冲突，以 README 为准；勘误见 README §1.3。文中“探针”指当时的一次性文件，未入库，只有 Band Envelope 探针留在 `../spike/band-envelope.mjs.txt`。

日期 2026-11-02。仅研究，未修改 `本仓库`。克隆目录 `（本地浅克隆目录）`（只读，未运行任何安装或构建脚本）；标准原文下载与页面渲染在 本地目录。

标记约定：**[V]** = 本次亲自读到原文（页面图像或文本），**[S]** = 二手（新闻、转述、搜索摘要、第三方抽取），**[I]** = 推断。每个外部事实给 repo+commit+路径+行号 或 URL+条文号；仓库事实给 file:line。

克隆的 commit（全部 `--depth 1`）：IfcOpenShell `28bae192`、Elements `d4e7a952`、suncalc `21449f34`、ladybug `e5d5ed3d`、honeybee-radiance `06d40dc7`、lbt-recipes `5d35e4cc`、CityJSON specs `877ee49e`。全部可达，无不可达仓库。

---

## 0 一页结论（给规划者）

1. 层级用「三层」：`site`（地块+红线+指北+经纬度）→ `building`（引用一份已有 `.arch` 平面 + `storeys` + `height`）→ 平面本身（现有的单栋模型）。建筑占地**由被引用平面编译结果推导**，不手写。
2. 标准层：学 IFC 的「类型+实例」（`IfcRelDefinesByType` + `IfcMappedItem`）、CityJSON 的 `geometry-templates` + `GeometryInstance.transformationMatrix`、Elements 的 `ElementInstance(BaseDefinition, Transform)`。语义结论：**一份定义，多处引用，变换只在引用点**。语法上用区间 `storeys 2..5 = typical`，不复制平面。
3. 任意角度旋转**只允许出现在 site 层的 building 实例上**；`place ... rotate` 保持 0/90/180/270（`src/parser.ts:1358-1365`），平面内部不引入弧度或三角函数。
4. 400 m 跑道：用参数化生成器（直道长、弯道半径、道宽、道数），两个弯道是**精确半圆**，端点轴对齐，生成时**无需三角函数**。地面多边形里的弧用「两端点 + 圆心/半径 + 方向」，由作者给端点，编译器只校验，不求端点。IAAF 2008 标记平面图已读到 [V]：直道 84.390、量线半径 36.800、结构半径 36.500、道宽 1.220。
5. 指标（容积率/密度/绿地率/高度）：只有两处读到一手原文：GB 50099-2011 术语 2.0.11/2.0.12（学校可比总用地、可比容积率）和 GB 50016 附录 A（建筑高度算法）。GB 50352-2019、GB 55031 的定义**未读到**，只有一条英译摘录 [S]。指标定义必须在 profile 里自带来源标记，未读者标 [S]。
6. 日照：纯确定性 TS 可行（Meeus 低精度太阳位置，常量与 SunCalc、ladybug 同源）。可作「方案阶段估算」，但**不得**声称符合 GB/T 50947：该标准要求时间间隔不宜大于 1.0 min、软件误差 ±3.0 min、软件须经国家级检测（均 [V]，见 §4.3）。
7. 标准可进 profile 的清单与禁区见 §5。**GB 7793-2025、GB 50352-2019 全文、GB 55031、GB/T 50103、GB 50180、停车标准均未读到原文**，需要 owner 取得（§5.4）。
8. 许可证：ladybug、honeybee-radiance、lbt-recipes 全部 **AGPL-3.0 → 只学思路，不复制代码**。IfcOpenShell LGPL-3.0、Elements MIT、SunCalc BSD-2、CityJSON specs CC0。

---

## 1 空间层级与「标准层」

### 1.1 IFC（IfcOpenShell，LGPL-3.0）

- 许可：`IfcOpenShell/README.md:10`（"open source ([LGPL])"），根目录 `COPYING`/`LICENSE.md` 存在 [V]。
- 层级即「空间分解树」：`api/aggregate/assign_object.py` 的 docstring 说明所有物理元素必须挂在从 `IfcProject` 起的分解树上，大空间由小空间聚合（site→building→storey→space），一个产品在树中只有一个位置，聚合会清除先前的聚合/包含/嵌套关系；示例 `IfcProject → IfcSite → IfcBuilding`（该文件 docstring 与示例，`ifcopenshell-python/ifcopenshell/api/aggregate/assign_object.py` 约第 40–90 行）[V]。IFC 的放置**相对父级**（同文件 docstring "IFC placements follow a convention where the placement is relative to its parent"）[V]。
- 创建时 `api/root/create_entity.py:114` 给空间结构元素默认 `CompositionType = "ELEMENT"` [V]（IFC 允许 COMPLEX/ELEMENT/PARTIAL，其余枚举值本次未读 schema 文件，[I]）。
- 指标位置：IFC4X3 属性集 `Pset_SiteCommon`（`ifcopenshell-python/ifcopenshell/util/schema/ifc4x3_properties.json:11945`）含 `BuildableArea`、`BuildingHeightLimit`、`FloorAreaRatio`、`SiteCoverageRatio`（行 11960 附近）、`TotalArea`；`Pset_BuildingCommon`（同文件 1163）含 `NumberOfStoreys`（1193）、`GrossPlannedArea`、`ElevationOfRefHeight` [V]。**陷阱**：IFC 对 `SiteCoverageRatio` 的描述是 "TotalArea / BuildableArea"（同文件 11960 附近），不是中国「基底面积/用地面积」，不可照抄 [V]。
- 重复结构而不复制：**类型+映射表示**。`api/type/assign_type.py:30-103` 建立 `IfcRelDefinesByType`；`api/type/map_type_representations.py` 说明「类型有表示时，所有实例必须有同一表示」，实例的表示由 `api/geometry/map_representation.py:22-43` 生成 `IfcMappedItem(mapping_source, mapping_target)`，`mapping_target` 是 `IfcCartesianTransformationOperator3D` [V]。即：几何存一份，实例存「引用+变换」。
- IFC 的 `IfcBuildingStorey` 是**实例**，每层各一个 `Elevation`；「标准层」在 IFC 里要靠类型/属性约定，没有一等的 "typical floor"（[I]，本次未读 IFC 规范文本对 `IfcBuildingStorey` 的完整属性表，`express/DocEntity*.csv` 只有索引）。

**判决（IFC）**：copy idea（类型+映射=定义一次、变换在引用点；site/building/storey 三层与高程参考）；不 reuse 代码（LGPL，且 Python）；avoid 抄 `SiteCoverageRatio` 定义。

### 1.2 Hypar Elements（MIT）

- 许可：`Elements/LICENSE.md`（MIT，2022 Hypar Inc.）[V]。
- 本 commit 的 `Elements/Elements/src/` **没有** `Site`/`Building`/`Level` 类（全仓 `grep "class Level|class Site|class Building|class Storey"` 无结果）[V]。层只作为 `Floor.Level : Guid?`（`Floor.cs:40-43`）出现：一个 GUID 引用。结论：Hypar 的「层」是**引用型标识**，不是容器 [V]；其余层逻辑在别的包（`Elements.Components` 等，本次未读）[I]。
- 重复：`ElementInstance`（`Elements/src/ElementInstance.cs:15-25`）= `BaseDefinition: GeometricElement` + `Transform`。与 IFC MappedItem 同构 [V]。
- 弧：`Geometry/Arc.cs:15-38` 弧由 `BasisCurve(Circle)` + `StartAngle`/`EndAngle`（度）定义，端点靠三角函数求 [V]；`Space.cs:16-26` 与 `Mass.cs:25` 是 Profile + Height 的拉伸体，对应「footprint + height」[V]。
- 判决：copy idea（Instance=定义+变换；Space/Mass=轮廓+高）；avoid 其 Level-as-GUID（ArchLang 用名字且有 diagnostics）；不 reuse（C#）。

### 1.3 CityJSON / CityGML LoD（CityJSON specs，CC0）

- 许可：`specs/LICENSE` 为 CC0 1.0 [V]（文档/规范，可自由借鉴）。
- 树：`Building` 的子对象 `BuildingPart`、`BuildingStorey`、`BuildingRoom`、`BuildingUnit`；除 `Building` 外必须有 `parents`；`BuildingStorey` 可以挂在 `Building`/`BuildingPart`/`BuildingRoom` 下（`specs/specs/specs.bs:290-305`）[V]。Building 系列几何只能是 Solid/CompositeSolid/MultiSurface/CompositeSurface（同 301 行）[V]。属性 `measuredHeight` 见 149 行示例；`storeysAboveGround` 本次 grep 在 specs.bs 无命中（可能在 schema 而非正文，[I]）。
- LoD：每个几何必须带 `"lod"` 字符串，可为单位数字，或 TU Delft 的 "X.Y"（`specs.bs:777`），一个 CityObject 可并列多个 LoD 的几何（134 行）[V]。**对 ArchLang 的含义**：同一建筑的「体块/平面」是不同精度表示，不是不同建筑 [I]。
- 重复：`geometry-templates`（`specs.bs:71, 1048`）存模板，`GeometryInstance` 含 `template` 索引、一个参考点顶点和 4×4 `transformationMatrix`（`specs.bs:1087-1096`）[V]。再次是「定义一次+变换」。
- 判决：copy idea（`parents`+type 规则；footprint 是几何表示之一）；reuse 无（不是代码）。

### 1.4 对 ArchLang 声明式语法的建议（[I]，需与现有 `level` 语义对齐）

```
site "XX学校" { boundary ...; north 12; latitude 23.13; longitude 113.27 }
building Teaching = "teaching-block.arch"  storeys 5  height 4200  at (x, y) rotate 17.5
building Dorm     = "dorm.arch"            storeys 1..16 { 1 = "dorm-ground.arch" } height 3300 at (...) rotate -8
```

语义规则：

1. `building` 引用一个**已编译的 plan**；占地 = 该 plan 外墙/房间外轮廓的并集（来自形状，不是包围盒，符合 AGENTS.md「derived position comes from the shape, never its bounding box」）。
2. `storeys N`（标准层数）、`height H`（层高，所有高度「不绘制」，符合 `Heights draw nothing`）；底层/顶层覆盖用区间或单层键，覆盖层引用另一个 plan，而不是复制。
3. 旋转/平移**只**作用于 `building` 实例（站点尺度）；plan 内部不变。这保持 `place rotate` 的 0/90/180/270 法则与 glyph chirality 不变量（`test/glyph-chirality.test.ts`）。
4. 站点指标 `plotRatio`、`coverage`、`green`、`height` 全是**派生值**，在 `describe()`/新 lint 规则里读，不是作者输入（作者输入的只有「限值」，如 `limit plotRatio 1.2`）。
5. 角度确定性：旋转后的轮廓需要 sin/cos。backlog 6.6（`docs/backlog.md:857-880`）已实测 Chromium/Firefox/WebKit/Node 172/172 一致，但同时写明「替换 hypot/atan2/log2 未被数据驱动，owner 门控」。**[I] 建议**：新特性的角度一律量化到 0.01°，用仅含 `+ − × ÷` 的级数（定迭代次数）自实现 sin/cos，不触发 6.6 的 owner 门控，也不新增跨引擎风险（architecture 已有先例：`docs/agents/architecture.md:50` 称 view 不用 `Math.cos/sin/tan/atan`）。
6. `place … as` 名与 `level` 号不能来自 `for`（用户已测）：`building` 需要同样的限制或放开；作者若要 16 栋同型楼，需要「`for i in 0..15 { building Dorm_${i} = ... }`」，这依赖 `as` 名插值，属于独立语言改动，应单列卡片，不要塞进 building。

---

## 2 参数化场地：400 m 标准跑道与弧

### 2.1 一手数据（World Athletics / IAAF，标记平面图）[V]

文件 `https://www.atletiek.be/admin/storage/main/iaaf-track-and-field-facilities-manual-2008-edition-marking-plan-400m-standard-track.pdf`（IAAF 2008 手册，1 页，本地 `std/iaaf.pdf`；文字层抽取行 133–141）：

| 量 | 值 |
|---|---|
| 道宽（含外侧 0.05 m 线） | 1.220 m |
| 1 道外：量线距离 | 0.30 m（距抬高的内缘石） |
| 其余道 | 距内侧线外缘 0.20 m |
| 内缘石构造半径 | 36.500 m |
| 量线（跑进线）半径，1 道 | 36.800 m |
| 每条直道长 | 84.390 m |
| 每个弯道，构造线（缘石线） | 114.668 m |
| 每个弯道，跑进线 | 115.611 m |
| 全长，构造线 | 398.116 m |
| 全长，跑进线 | 400.001 m |

自检 [I]：2×84.390 + 2π×36.800 = 400.00。2026 年 World Athletics「短道」图（`yleisurheilu.fi` 2026-02）也可达，但那是室内短道，不是 400 m。

中国侧：GB 50099-2011 4.2.5「设 400m 环形跑道时，宜设 8 条直跑道」[V]（§5.2 逐字）。8 道外缘半径 ≈ 36.500 + 8×1.220 = 46.26 m [I]（构造半径+道宽，未核对手册外缘注记）。

### 2.2 生成器设计（建议）

- 参数：`straight`（84.39）、`radius`（量线 36.8 或构造 36.5，必须二选一并写明）、`lanes`（默认 8）、`laneWidth`（1.22）、`kerb`（0.30 偏移）。
- 两个弯道是**精确 180° 半圆**，圆心 `(±straight/2, 0)`，端点 `(±straight/2, ±r)`：端点不需要任何三角函数；SVG 用 `A r r 0 0 1 x y`；弧长、面积用 `π` 乘法/加法（`+ − ×`，确定）。
- 通用弧（任意扫角）：**作者给两端点+半径+方向（或圆心）**，编译器只校验 `|P−C| = r`（容差用整数毫米判定），不自己求端点。参照 IFC 的 `IfcIndexedPolyCurve` + `IfcArcIndex(三点)`（IfcOpenShell `util/shape_builder.py:471, 537, 641` 使用 [V]），三点法天生避开角度制；Elements 用角度（`Arc.cs`）则需要三角函数，不选 [V]。
- 与现有预算对齐 [I]：新元素按 AGENTS.md 须声明 `drawCost` 上界、`bounds()`、`measures()`；弧的包围盒要含极值点（半圆则含 `±r` 方向极值），**不是**端点包围盒，否则 `E_OUT_OF_RANGE` 检查会漏。
- 判决：IAAF 数值 = 数据，可直接用（事实/度量，非版权代码）；Elements `Arc` = avoid（角度制）；IFC 三点弧 = copy idea。

---

## 3 太阳模型

### 3.1 SunCalc（mourner/suncalc，BSD-2）

- 许可：`LICENSE:1-6`「Copyright (c) 2026, Volodymyr Agafonkin … Redistribution and use … permitted」（BSD-2 型）[V]；`package.json` 无 license 字段命中（grep 无输出），以 LICENSE 文件为准。版本 2.1.1，commit 日期 2026-10-05 [V]。
- 实现：`index.js:65-83` `sunCoords`：Meeus 第 25 章，平均黄经 L0=280.46646+…、平近点角 M=357.52911+…、中心差、黄赤交角 23.439291…，输出赤经、赤纬；`index.js:86-100` `getPosition` 用恒星时与 `lw=-lng` 得时角，再算方位角（北起顺时针）和高度角，并加大气折射（`55-60`）；`ΔT` 多项式（`25-36`）[V]。
- 精度：README 第 8 行称与 timeanddate.com 的精度和约定一致；基于 Meeus（README 第 10 行）[V]。具体角秒误差本次未测，[I]：低精度 Meeus 太阳位置通常 ≲0.01°。
- 依赖：`Math.sin/cos/tan/asin/atan2`（`index.js:2`）——正是 backlog 6.6 担心的引擎相关函数。
- 判决：**copy idea（公式，Meeus 公开算法），不拷代码**；若要借代码，BSD-2 允许但须保留版权声明——在「零运行时依赖+纯确定性」仓库中无必要，自行重写更干净。

### 3.2 ladybug（ladybug-tools/ladybug，AGPL-3.0）

- 许可：`ladybug/LICENSE:1-2` 为 GNU Affero GPL v3 [V]；honeybee-radiance、lbt-recipes 同为 AGPL-3.0 [V]。**avoid 复制任何代码**；AGPL 的网络条款对 Web 版 playground 尤其不兼容。
- `ladybug/sunpath.py:815-935` `_calculate_solar_geometry`：儒略日 → 平黄经 280.46646、平近点角 357.52911、轨道离心率、中心差、视黄经（-0.00569-0.00478 sin Ω）、黄赤交角、赤纬；**时差**用 `4·deg(y·sin2L0 − 2e sinM + 4e y sinM cos2L0 − ½y² sin4L0 − 1.25e² sin2M)`（`:882-892`）；`_calculate_solar_time`（`:918-923`）= `(hour·60 + EoT + 4·经度 − 60·时区) mod 1440 / 60`[V]。常量与 SunCalc 完全一致（同为 Meeus / NOAA 公式）→ 常量是公共事实，不构成抄袭，但代码结构不要照搬 [I]。
- 对 ArchLang 的价值：它把「真太阳时 = 钟表时 + 时差 + 经度修正」写成公式，正对应 GB/T 50947 5.0.5/6.0.1 的「真太阳时」要求（§4.3）[I]。

### 3.3 日照时数（sunlight hours）如何做 —— honeybee-radiance / lbt-recipes（AGPL）

- `lbt-recipes/lbt_recipes/direct_sun_hours/flow/dependencies/direct_sun_hours_calculation.py:43-44`：固定 Radiance 参数 `-aa 0.0 -I -faa -ab 0 -dc 1.0 -dt 0.0 -dj 0.0 -dr 0`；`:118` 命令 `honeybee-radiance dc scontrib scene.oct grid.pts suns.mod …`：**每个传感点对每个太阳向量投一条直射光线（ab 0 = 无反弹）**，结果是 0/1，再按 timestep 累加成小时数；输入默认 `timestep: 1`（`run.py:34`）[V]。
- 太阳向量文件由 `honeybee_radiance/cli/sunpath.py` 生成；`cli/octree.py:512-527` 在提供 sunpath 时多建一个 `direct_sun` octree [V]；`cli/postprocess.py:939, 965` 为 `direct_sun_hours` 的可视化/配置 [V]。
- 精度来源 [I]：误差=太阳位置误差（很小）+ 时间离散（默认 1 小时一个样本，最粗）+ 传感点网格（几何）+ 模型简化。**它本质是采样**，不是事件求解。
- 对中国日照的差异 [I]：GB/T 50947 要求真太阳时、时间间隔 ≤1 min、窗户采样点间距 0.30–0.60 m；lbt 默认 1 h 时间步、1 点格，不可直接对应。

### 3.4 纯确定性 TS 实现需要什么 [I]

1. 太阳位置：Meeus 低精度级数（约 20 行），输入 = 日序、经纬度、真太阳时。
2. 阴影：建筑 = 棱柱（轮廓+高），对「点→太阳」的射线与棱柱做多边形×竖直拉伸相交；在立面窗点上，射线与每个遮挡棱柱的顶面/侧面求交。可行，几何均为 `+ − × ÷`。
3. 时间：**用事件法**而不是 1 min 采样：对每个遮挡棱柱，阴影边界随时间连续，可用二分在毫秒级求「受遮/受光」转换时刻，再取分钟取整（6.0.1 要求输出精确到分钟）。采样法更简单但受步长量化，且 480 样本×点×遮挡体需按 `MAX_EVAL_STEPS` 先计费再分配（AGENTS.md「Charge new evaluator work to the step meter BEFORE allocating」）。
4. 三角函数跨引擎：太阳高度/方位的 sin/cos/atan 输出只用于比较阈值与取整到分钟；跨引擎差异 ~1 ulp 只会在「刚好在阈值」时翻转。缓解：自实现 `+ − × ÷ √` 级数（§1.4-5），并在报告里标出「距 2 h 门槛的余量」，当余量 < 3 min（呼应 GB/T 50947 6.0.2 ±3.0 min）时标「不可判定」而非二值通过。注意 backlog 6.6 的限制说明：digest 比较只覆盖舍入后的字节，1-ulp 差异不可见（`docs/backlog.md:857` 起）[V]。
5. 必须声明地理输入：经纬度（GB/T 50947 5.0.3：取当地政府公布的城市经纬度）、基准年（5.0.1：2001 年）、`north` 偏角（站点层属性）。当前仓库无太阳模型：`grep` 仅得到 `analyze.ts/describe.ts` 等对 "north" 的零散引用，无 sun 模块（[I]，未做完整审计）。

### 3.5 「方案阶段估算」是否可接受？必须声明什么

**可接受**，条件是写成「估算/advisory」而不是「日照分析报告」（ADR 0005 的 advisory 精神，`src/lint/ruleset.ts:523-529`、`:566` 注释 "ADVICE… passing is not compliance"）。必须声明：

- 非 GB/T 50947 合规软件：该标准 1.0.4 要求用于日照计算的软件必须经软件产品质量检测单位测试并通过国家级检测机构检测 [V]（zlglpt 平台文本，见 §4.3），ArchLang 不是。
- 太阳位置公式与精度（Meeus 低精度，非逐日历表）；
- 遮挡体只含本方案内建筑（周边现状/规划未入模，GB/T 50947 3.0.2-3.0.3 要求计入周边与未建地块）；
- 无窗位、无满窗定义、无玻璃/墙厚（「满窗日照」定义本次未读到，GB 50099 4.3.3 用词即「满窗日照」，GB 7793-2025 又新增同名指标，见 §5.2）；
- 采样/时间步长；结果取整规则；边界 ±3 min 判「不可判定」；
- 地理输入来源、`north` 角由作者给定。

---

## 4 标准原文（本次读到什么）

### 4.0 来源与可信度

- **GB 50099-2011《中小学校设计规范》**：`http://www.gd.gov.cn/attachment/0/389/389286/2938613.pdf`（政府网站附件，112 页，**扫描图像**，元数据显示它来自第三方标准分享站，来源不权威）。WebFetch 无法读，本次用 `pdftoppm -r 100` 渲染页面再目视读取。PDF 页码 = 印刷页码 + 9。内容为 2011 年版原文；**本次未核对其后是否有局部修订或被通用规范覆盖**（[I]：2023-03-01 起 GB 55031 等「全文强制」通用规范已实施，可能取代个别强条；2011 版标准中加粗者为强制性条文，4.1.2、8.1.5、8.1.6 在扫描件中加粗，4.3.x 未加粗 [V 外观]）。
- **GB 50016-2014（2018 年版）**：`https://ylaqjdb.dicp.ac.cn/__local/B/50/27/DE69BE1DA05C0B3C39F030E7790_97E042CF_629214.pdf`（91 页，页眉 "d.1190119.com 最新消防规范全集"，第三方转载，字体缺失，目视读取）。
- **GB/T 50947-2014**：全文文本取自 `http://zlglpt.com/book/book_view.aspx?id=2479`（华软资料管理平台的文本页，含条文与条文说明）；`yuanlin8.com` 同文镜像交叉印证关键数值。均为第三方平台，**不是 openstd/住建部原件**，故标 [V 平台副本]，需 owner 对照正式版确认。
- openstd.samr.gov.cn 可连通（HTTP 200），但列表由前端 ajax 载入，页面抓取不到结果行，且强制性国标在线阅读需要验证码 [I]；本次未能读到 GB 7793-2025 原文。

### 4.1 GB 50099-2011（逐字，[V]，页码为印刷页）

- **2.0.11（p.3）**「学校可比总用地 comparable floor area for school：校园中除环形跑道外的用地，与学生总人数成比例增减。」
- **2.0.12（p.3）**「学校可比容积率 comparable floor area ratio for school：校园中各类建筑地上总建筑面积与学校可比总用地面积的比值。」→ 学校的「容积率」口径**扣除环形跑道用地**，所以招标文件里的 160,897 m² 总用地与「可比总用地」不同。
- **3.0.1（p.4）**「各类中小学校建设应确定班额人数…1 完全小学应为每班 45 人，非完全小学应为每班 30 人；2 完全中学、初级中学、高级中学应为每班 50 人；3 九年制学校中 1 年级～6 年级应与完全小学相同，7 年级～9 年级应与初级中学相同。」
- **4.1.2（p.6，加粗＝强条）**「中小学校严禁建设在地震、地质塌裂、暗河、洪涝等自然灾害及人为风险的地段和污染超标的地段。…」
- **4.2.2–4.2.3（p.7）**「…应合理布局，合理确定容积率，合理利用地下空间，节约用地」；「…宜以学校可比容积率判断并提高土地利用效率」。
- **4.2.4（p.7）**建筑用地包括教学及教学辅助用房、行政办公和生活服务用房等全部建筑的用地；有住宿学校含宿舍；**「建筑用地应计算至台阶、坡道及散水外缘」**；自行车库及机动车停车库用地；设备与设施用房用地。
- **4.2.5（p.7）**「中小学校的体育用地应包括体操项目用地及武术项目用地、田径项目用地、球类用地和场地间的专用甬路等。设 400m 环形跑道时，宜设 8 条直跑道。」
- **4.2.6（p.7）**绿化用地：「1 中小学校应设置集中绿地。集中绿地的宽度不应小于 8m。2 集中绿地、零星绿地、水面、种植园、小动物饲养园的用地应按各自的外缘围合的面积计算。3 各种绿地内的步行甬路应计入绿化用地。4 铺栽植被达标的绿地停车场用地应计入绿化用地。5 未铺栽植被或铺栽植被不达标的体育场地不宜计入绿化用地。」
- **4.2.7（p.8）**「…道路及广场、停车场用地包括消防车道、机动车道、步行道、无顶盖且无植被或植被不达标的广场及地上停车场。用地面积计量范围应界定至路面或广场、停车场的外缘。校门外的缓冲场地在学校用地红线以内的面积应计量为学校的道路及广场、停车场用地。」
- **4.3.2（p.8）**「各类小学的主要教学用房不应设在四层以上，各类中学的主要教学用房不应设在五层以上。」
- **4.3.3（p.8）**「普通教室冬至日满窗日照不应少于 2h。」
- **4.3.4（p.8）**至少 1 间科学教室或生物实验室冬季获得直射阳光。
- **4.3.6（p.8–9）**体育用地：「2 室外田径场及足球、篮球、排球等各种球类场地的长轴宜南北向布置。长轴南偏东宜小于 20°，南偏西宜小于 10°。」（第 5 项以后及 6 项本次只读到片段，未全录。）
- **4.3.7（p.9）**「各类教室的外窗与相对的教学用房或室外运动场地边缘间的距离不应小于 25m。」
- **8.2.1–8.2.4（p.36）**「8.2.1 中小学校内，每股人流的宽度应按 0.60m 计算。8.2.2 …疏散通道宽度最少应为 2 股人流，并应按 0.60m 的整数倍增加疏散通道宽度。8.2.3 中小学校建筑的安全出口、疏散走道、疏散楼梯和房间疏散门等处每 100 人的净宽度应按表 8.2.3 计算。同时，教学用房的内走道净宽度不应小于 2.40m，单侧走道及外廊的净宽度不应小于 1.80m。」表 8.2.3（每 100 人净宽 m）：一、二级耐火：地上一、二层 0.70；三层 0.80；四、五层 1.05；地下一、二层 0.80。三级：一二层 0.80；三层 1.05；四五层 1.30。四级：一二层 1.05；其余「—」。「8.2.4 房间疏散门开启后，每樘门净通行宽度不应小于 0.90m。」
- **8.3.1 / 8.3.2（p.37）**校园应设 2 个出入口；出入口应与市政交通衔接，不应直接与城市主干道连接。
- **8.4.2–8.4.3（p.37）**「校园应设消防车道。消防车道的设置应符合现行国家标准《建筑设计防火规范》GB 50016 的有关规定。」「校园道路每通行 100 人道路净宽为 0.70m，每一路段的宽度应按该段道路通达的建筑物容纳人数之和计算，每一路段的宽度不宜小于 3.00m。」
- **8.5.1 / 8.5.3（p.37）**除面积 ≤200 m²、≤50 人单层建筑外每栋设 2 个出口；建筑物出入口净通行宽度不得小于 1.40m，门内外各 1.50m 范围内不宜设台阶。
- **8.6.1（p.38）**走道宽度按 8.2.3 计算。**8.7.2–8.7.3（p.38–39）**「楼梯梯段宽度应为人流股数的整数倍。梯段宽度不应小于 1.20m，并应按 0.60m 的整数倍增加梯段宽度。每个梯段可增加不超过 0.15m 的摆幅宽度。」「每个梯段的踏步级数不应少于 3 级，且不应多于 18 级…小学踏步宽 ≥0.26m、高 ≤0.15m；中学宽 ≥0.28m、高 ≤0.16m；楼梯坡度不得大于 30°。」
- **8.7.4 / 8.7.7（p.39）**疏散楼梯不得采用螺旋楼梯和扇形踏步；8.8.1 每间教学用房疏散门不少于 2 个，通行净宽不小于 0.90m；袋形走道尽端 15.00 m 内、净宽 ≥1.50m 可设 1 个门。

**未在 GB 50099 中读到**：每班/每生用地与建筑面积定额。目录（p.6–7）显示 5–7 章是房间面积指标，没有「千人指标」；此类定额属于另一份建设标准（建标），**未读**。班额只有 3.0.1。

### 4.2 GB 50016-2014（2018 年版）（逐字，[V]，印刷页码为页脚 61/62/33/34/84）

- **7.1.8（p.61）**「消防车道应符合下列要求：1 车道的净宽度和净空高度均不应小于 4.0m；2 转弯半径应满足消防车转弯的要求；3 消防车道与建筑之间不应设置妨碍消防车操作的树木、架空管线等障碍物；4 消防车道靠建筑外墙一侧的边缘距离建筑外墙不宜小于 5m；5 消防车道的坡度不宜大于 8%。」
- **7.1.9（p.61）**「环形消防车道至少应有两处与其他车道连通。尽头式消防车道应设置回车道或回车场，回车场的面积不应小于 12m×12m；对于高层建筑，不宜小于 15m×15m；供重型消防车使用时，不宜小于 18m×18m。」
- **7.2.1（p.61）**高层建筑应至少沿一个长边或周边长度的 1/4 且不小于一个长边长度的底边连续布置消防车登高操作场地，该范围内的裙房进深不应大于 4m。建筑高度不大于 50m 时，可间隔布置，间隔距离不宜大于 30m，且总长度仍符合上述规定。
- **7.2.2（p.62）**「1 场地与厂房、仓库、民用建筑之间不应设置妨碍消防车操作的树木、架空管线等障碍物和车库出入口。2 场地的长度和宽度分别不应小于 15m 和 10m。对于建筑高度大于 50m 的建筑，场地的长度和宽度分别不应小于 20m 和 10m。3 场地及其下面的建筑结构、管道和暗沟等，应能承受重型消防车的压力。4 场地应与消防车道连通，场地靠建筑外墙一侧的边缘距离建筑外墙不宜小于 5m，且不应大于 10m，场地的坡度不宜大于 3%。」
- **表 5.1.1（p.34）**一类高层公共建筑：建筑高度 >50m；二类：其余高层公共建筑；住宅 >54m 为一类、>27m 且 ≤54m 为二类。**注 2「除本规范另有规定外，宿舍、公寓等非住宅类居住建筑的防火要求，应符合本规范有关公共建筑的规定。」**
- **附录 A 建筑高度和建筑层数的计算方法（p.84）**「A.0.1 建筑高度的计算应符合下列规定：1 建筑屋面为坡屋面时，建筑高度应为建筑室外设计地面至其檐口与屋脊的平均高度。2 建筑屋面为平屋面（包括有女儿墙的平屋面）时，建筑高度应为建筑室外设计地面至其屋面面层的高度。3 同一座建筑有多种形式的屋面时，建筑高度应按上述方法分别计算后，取其中最大值。…5 局部突出屋顶的瞭望塔、冷却塔、水箱间、微波天线间或设施、电梯机房、排风和排烟机房以及楼梯出口小间等辅助用房占屋面面积不大于 1/4 者，可不计入建筑高度。」「A.0.2 建筑层数应按建筑的自然层数计算，下列空间可不计入建筑层数：1 室内顶板面高出室外设计地面的高度不大于 1.5m 的地下或半地下室；2 设置在建筑底部且室内高度不大于 2.2m 的自行车库、储藏室、敞开空间；3 建筑屋顶上突出的局部设备用房、出屋面的楼梯间等。」
- **[I] 对 16–18 层宿舍的含义**：层高 3.3 m 时 16 层≈52.8 m、18 层≈59.4 m，跨过 50 m（宿舍按公共建筑，表 5.1.1 注 2）→ 一类高层公共建筑、消防登高场地加深到 20 m×10 m（7.2.2-2）。**层高与高度是 `building` 必须带的属性，且高度算法应以 A.0.1 的屋面规则为准，不是 `storeys × height`**。

### 4.3 GB/T 50947-2014（逐字，[V 平台副本]，经 zlglpt.com 文本页，条文编号以其为准）

- **1.0.4**用于建筑日照计算的软件必须经过软件产品质量检测单位的测试，并应通过国家级检测机构的检测。
- **2.0.1 真太阳时**：「太阳连续两次经过当地观测点的上中天(正午12时，即当地当日太阳高度角最高之时)的时间间隔为1真太阳日，1真太阳日分为24真太阳时，也称当地正午时间。」
- **2.0.3–2.0.8**日照标准日、有效日照时间带（真太阳时表示）、日照时间计算起点、日照时数、日照基准年等术语。
- **4.0.2**建模：统一平面和高程基准；墙按外墙轮廓线；阳台、檐口、女儿墙、屋顶等遮挡部分均应建模；进行窗户分析时，对被遮挡建筑外墙面上的窗定位。
- **5.0.1**「1 日照基准年应选取公元2001年；2 采样点间距应根据计算方法和计算区域的大小合理确定，窗户宜取0.30m～0.60m；建筑宜取0.60m～1.00m，场地宜取1.00m～5.00m；3 当需设置时间间隔时，不宜大于1.0min。」
- **5.0.2**日照标准日和有效日照时间带按 GB 50180 选取（**GB 50180 本次未读**）。
- **5.0.3**宜选当地政府公布的城市经纬度；纬度差 >15′ 或南北距离 >25 km、经度差 >15′ 或东西距离 >20 km 时宜另定。
- **5.0.5**「日照计算应采用真太阳时，时间段可累积计算，可计入的最小连续日照时间不应小于5.0min。」
- **5.0.6**起点按 GB 50180；落地窗/凸窗以虚拟窗台面为起点；「宽度小于等于1.80m的窗户，应按实际宽度计算；宽度大于1.80m的窗户，可选取日照有利的1.80m宽度计算。」（窗台高度数值本标准条文未给；条文说明提及 0.9 m 的说法来自 yuanlin8 转述，[S]，未核对）
- **6.0.1**「日照计算的时间表达应为真太阳时，也可换算为北京时间，时间的输出结果应精确到分钟。」**6.0.2**「日照计算软件的计算误差允许偏差为±3.0min。…」
- **未读到/本标准没有**：「满窗日照」的定义（该词不在本标准中）；GB 50180 的日照标准日（大寒日/冬至日）和有效时间带（搜索摘要称「冬至日 9–15 时，大寒日 8–16 时」，[S]，来自 yuanlin8 条文说明转述，需读 GB 50180 原文）。
- 采样/步长数值总结：窗点 0.30–0.60 m、建筑 0.60–1.00 m、场地 1.00–5.00 m、时间 ≤1.0 min、最小可计连续 5.0 min、误差 ±3.0 min、基准年 2001。

### 4.4 GB 7793-2025（新，2026-11-01 实施）——**原文未读**

仅有二手 [S]：法治日报 2026-10-13 报道（`https://www.chinanews.com.cn/edu/2026/10-13/10713571.shtml`，WebFetch 复述）：强制性标准，市场监管总局（国家标准委）批准，国家疾控局组织修订，替代 GB 7793-2010，**新增「冬至日满窗日照时间」**、采光均匀度、玻璃颜色透射指数和可见光透射比、蓝光危害、频闪指标；适用对象扩至中等职业学校；报道**未给任何限值数值**。因此：**不能**假定 GB 50099 4.3.3 的「≥2 h」仍是现行唯一值；日照 profile 必须等 owner 读到 GB 7793-2025 原文（采光系数、窗地面积比、满窗日照限值与「满窗」定义）。

### 4.5 指标定义（容积率、建筑密度、绿地率、建筑高度）

- GB 50352-2019：二手 [S]。`chinesestandard.net/PDF.aspx/GB50352-2019` 免费摘录（英译）给出 **2.0.10 容积率 plot ratio**:「the ratio of the total area of the building to the area of the land within a certain land use and floor use range」；建筑密度、绿地率、建筑高度的定义**未取得**；绿地率在 4.1.1 作控制指标出现。目录显示建筑高度在 4.5 节（`gongbiaoku.com/book/ue116739ngg`，仅目录）。我下载的 `gb50352.pdf` 实为 GB/T 50353 的征求意见稿（《建筑工程建筑面积计算规范》），与本题无关，未用。
- 建筑高度：一手可读的是 **GB 50016 附录 A.0.1**（§4.2，[V]）。GB 50352 的定义与它不完全相同（二手图解称平屋面按到屋面面层、坡屋面按檐口与屋脊平均高度，与 GB 50016 同，但台阶式地坪处理、女儿墙等细节未核）；**规划/日照用高度与防火用高度可能不同**，不能默认统一 [I]。
- GB 55031-2022《民用建筑通用规范》：**未读**。
- 学校口径：GB 50099 2.0.11/2.0.12（[V]）已给「可比容积率」；因此对学校类建筑 profile 应同时给「容积率（含/不含跑道用地）」。

### 4.6 GB/T 50103-2010《总图制图标准》——**未读**

搜索三次只得到园区总图说明的二手引用和无关标准（GB/T 50104、DB11/T 335）。红线线型、坐标（测量/建筑坐标）、指北针、标高符号的条文都未取得。不得据此写出线型/符号规则。

### 4.7 停车指标——**未读**

没有找到国家层面的配建指标；通常为地方规划技术规定（城市 + 用地性质）。GB 50099 8.5.6 只规定停车场出入口不得直接通向师生人流集中的道路（p.37，[V]）。需要 owner 指定城市后再取。

---

## 5 对 jurisdiction profile 的规则落地（AGENTS.md「rules read from the source」）

### 5.1 现状（repo 事实）

- `LINT_PROFILES` 在 `src/lint/ruleset.ts:530`，已有 `residential-basic`、`accessibility-advisory`、`cn-residential-advisory`（`:566`）、`uk-…`（`:597`）、`us-…`（`:627`）；`ADVISORY_CODE_PROFILES` 在 `:689-693`；`DEFERRED_PROFILE_NUMBERS` 在 `:656`（收纳「有来源但规则尚未存在」的数）。
- 来源标注规范：每个数字行内注释 `GB 50096-2011 5.2.1: … [V]` 或 `[S, 来源]`；`:560-565` 的块注释写明「ADVICE，名称不是标准的，通过不等于合规（ADR 0005）」、全文已读（`archlang-lab/plans/plan-soundness/research/prior-art.md` §3.1）、净面积度量 `roomAreaMeasure`。IRC 因只有二手而全部标 `[S]`（`:619-626`）。`docs/backlog.md:78-79`：「A German profile stays out until its rules are read from the source」。
- `src/vocabulary.ts`（416 行）含 `UseKind` 与「Deliberately absent: balcony and terrace」（`:216-217`）；除 `classroom`（`:403`）外**没有 dormitory/gym 等用途词**（`grep -i school|dorm|classroom|gym` 仅命中 `:381` 注释与 `:403`）。新增 `cn-school-advisory` 前需先扩 `UseKind`。

### 5.2 可进 `cn-school-advisory`（若 owner 愿意；全部为「advisory，非合规」）

用一手 [V] 的条文，附 §4.1/4.2 的行内来源：

| 数值 | 条文 | 状态 |
|---|---|---|
| 主要教学用房楼层上限（小学不应设在四层以上即 ≤4 层，中学不应设在五层以上即 ≤5 层） | GB 50099 4.3.2 | [V] 但扫描件，需 owner 核对修订 |
| 教室外窗到对面教学用房/运动场边缘 ≥25 m | 4.3.7 | [V] |
| 田径场长轴 N–S，南偏东 <20°/南偏西 <10° | 4.3.6-2 | [V]（「宜」） |
| 集中绿地宽度 ≥8 m | 4.2.6-1 | [V] |
| 教学用房内走道净宽 ≥2.40 m，单侧/外廊 ≥1.80 m | 8.2.3 | [V] |
| 每 100 人疏散净宽表（0.70/0.80/1.05/1.30 等） | 表 8.2.3 | [V] |
| 房间疏散门净宽 ≥0.90 m；每间 ≥2 个门（袋形尽端 15 m 内且净宽 ≥1.50 m 可 1 个） | 8.2.4, 8.8.1 | [V] |
| 校园道路 0.70 m/100 人，段宽 ≥3.00 m | 8.4.3 | [V] |
| 楼梯梯段 ≥1.20 m，0.60 m 倍增；踏步 3–18 级；小学 0.26/0.15 m，中学 0.28/0.16 m；坡度 ≤30°；无螺旋/扇形 | 8.7.2–8.7.4 | [V] |
| 出入口净宽 ≥1.40 m；校园出入口 ≥2 个 | 8.5.3, 8.3.1 | [V] |
| 班额 45/30/50 | 3.0.1 | [V] |
| 400 m 跑道设 8 条直道 | 4.2.5 | [V] |
| 冬至日满窗日照 ≥2 h | 4.3.3 | **[V] 但可能被 GB 7793-2025 重定义 → 暂缓入 profile** |

消防（GB 50016）数值可入「消防场地」检查：车道净宽/净高 ≥4.0 m、坡度 ≤8%、回车场 12/15/18 m 见方、登高场地 15×10 m（>50 m 为 20×10 m）、与外墙距离 5–10 m、坡度 ≤3%——全部 [V]（第三方转载，2018 年版页眉，须对照现行通用规范）。

### 5.3 禁区

- 不得写：容积率/建筑密度/绿地率的**限值**（地方规划条件，不是国标）；不得写日照 2 h 以外的数；不得写 GB/T 50103 符号；不得写停车配建数；不得写 GB 50352/GB 55031 的定义为 [V]。
- 不要用 `profile` 名暗示合规（沿用 `-advisory` 后缀）。
- 不要把二手摘录写进 `DEFERRED_PROFILE_NUMBERS` 而不标 `[S]`。

### 5.4 需要 owner 购买或取得（按优先级）

1. **GB 7793-2025** 原文（强制性国标，openstd 在线阅读/国家标准全文公开系统；本环境无法抓取，需人工）。
2. **GB 50180（城市居住区规划设计标准，2018）**：日照标准日、有效日照时间带、计算起点（GB/T 50947 5.0.2、5.0.6 都转引它）。
3. **GB 50352-2019 全文**（容积率、建筑密度、绿地率、建筑高度 4.5）与 **GB 55031-2022** 术语（正版 PDF）。
4. **GB/T 50103-2010** 全文（正版）。
5. 一份**官方版** GB 50099-2011（及是否有局部修订），以及对应的**建设标准**（学校用地/建筑面积定额，如适用）。
6. 目标城市的**规划技术管理规定**（容积率/密度/绿地率/停车，必须按城市）。
7. 官方 **GB/T 50947-2014**，以确认平台副本逐字一致。

---

## 6 各项目判决汇总

| 项目 | 许可 | 本次读到什么 | 判决 |
|---|---|---|---|
| IfcOpenShell | LGPL-3.0（README:10） | aggregate、type/map_type_representations、MappedItem、Pset_SiteCommon | **copy idea**；不 reuse；avoid 其 SiteCoverageRatio 口径 |
| Hypar Elements | MIT | ElementInstance、Space/Mass、Arc；无 Site/Building/Level 类 | **copy idea**（Instance=定义+变换）；avoid Level-as-GUID、角度制弧 |
| CityJSON specs | CC0 | Building/BuildingStorey/BuildingPart 树、lod、geometry-templates+transformationMatrix | **copy idea**（可直接借规范文字结构） |
| SunCalc | BSD-2 型（LICENSE） | Meeus 太阳位置、折射、ΔT | **copy idea**；公式自行重写，无需引入代码 |
| ladybug / honeybee-radiance / lbt-recipes | **AGPL-3.0** | 太阳位置、时差、Radiance `-ab 0` 直射日照小时 | **avoid 代码**；只学「真太阳时公式」「0/1 直射采样累加」两个思路 |
| IAAF/World Athletics 标记平面图 | 事实数据 | 400 m 跑道全套几何 | **reuse 数据**（引用页码，保留出处） |

---

## 7 建议（落到规划文档的决定）

1. 先做 **site/building/footprint 派生与 `storeys`+`height`**（不依赖日照、不依赖三角函数），指标（`coverage`、`plotRatio`、`green`、`height`）全部作为派生值进 `describe()`；限值由作者输入，不由 profile 内置。
2. **旋转**：站点层 `rotate <度>`，量化到 0.01°，自实现 sin/cos（仅 `+ − × ÷`）；在 `docs/backlog.md` 6.6 旁新增一条说明「站点旋转不触发 6.6 的 owner 门控」，并加 byte-identity law（SHA-256 over SVG + describe + lint，AGENTS.md 要求）。
3. **弧**：地面多边形段加「圆弧段（两端点+半径+方向）」；跑道用生成器；包围盒含极值。
4. **日照**：单独一个 `sun` 分析模块，不进 `compile()` 的默认路径（预算与确定性）；输出分钟、带余量与「不可判定」带；文案固定声明 §3.5 六条；GB 4.3.3 的 2 h **不入 profile**，直到 GB 7793-2025 原文读到。
5. **profile**：先做 `cn-school-advisory` 的「疏散/楼梯/走道/出入口/消防场地/楼层上限」子集（均 [V]）；日照、面积、停车、指标限值全部延后。
6. 把「16–18 层宿舍高度跨 50 m 分界」写进规划作为首个 acceptance fixture（`height` 派生需用 A.0.1，而非 `storeys×height`）。

## 8 未解与风险

- GB 50099 的扫描件来源不权威，且可能受后来的通用规范影响：profile 落地前必须换成官方文本。
- GB/T 50947 平台副本逐字未对官方版核对；窗台高度（条文说明 0.9 m）只是转述。
- 「满窗日照」定义、GB 7793-2025 数值、GB 50352/55031 定义、GB/T 50103、停车：**均未读**。
- 8 道外缘半径 46.26 m 是推算，未在手册中核实。
- 本报告没有测量 SunCalc 的角度误差；「≲0.01°」是 [I]。
- 没有运行任何第三方代码；没有修改 ArchLang 仓库。
