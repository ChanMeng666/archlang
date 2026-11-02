# 01 剖面与立面：成熟工具怎么做，ArchLang 该抄什么

> 调研原始记录（2026-11-02，基线 `main@18127701`）。结论若与 `../README.md` 冲突，以 README 为准；勘误见 README §1.3。文中“探针”指当时的一次性文件，未入库，只有 Band Envelope 探针留在 `../spike/band-envelope.mjs.txt`。

调研日期 2026-11-02。ArchLang 基线 `18127701`（main）。本文只是调研，仓库未改动一个字节。

## 0. 结论

1. **不抄任何成熟工具的算法，只抄它们的分层结构和教训。** IfcOpenShell、Bonsai、FreeCAD 的隐藏线全部依赖 OCCT 的通用 HLR，three-edge-projection 是逐边对三角形裁剪。这些都是为"任意几何"付的代价，而我们的场景不是任意几何。
2. **我们的场景有一个成熟工具都用不上的结构：全部是竖直棱柱。** 语料实测 36 个 example、4807 个 shell，**4807 个都是"平面多边形 × [z0, z1]"**（§4）。于是每个竖直面投到视图都是屏幕轴对齐矩形，水平面边缘对齐（零面积）。3D 隐藏线问题退化成：**每个高度带上解一次 1D 最近面包络，给格子贴标签，标签变化处出线。**
3. **推荐算法：Band Envelope（高度带包络）。** 探针核心 125 行 JS，零依赖，覆盖截面、投影、遮挡、共面消线、T 形接头，且天然给出可填充的格子。全语料 216 张图合计约 0.7 秒，单方案 6 张最慢约 0.1 秒。
4. **不引入新运行时依赖。** `three-edge-projection`、`three-mesh-bvh`、Clipper、OCCT 都不要。
5. **Scene3D 还不够画一张合格剖面。** 楼梯完全没有几何，这是首要缺口；另外缺室外地坪线、轴线、女儿墙，板厚只有常量默认值（§7）。
6. **必须单列的算法细节：斜面交叉细化。** 不做时，定向采样有 139/400 处错误，深度误差最大 7.8 mm；而均匀随机采样完全看不出来（§4.3）。

## 1. 方法与证据边界

约定：`repo@短SHA path:line` 是我读过的外部源码；`file:line` 是 ArchLang 仓库源码。**已验证（VERIFIED）** 指我读过该行或实测过。**推断（INFERRED）** 指我的判断、估算或未读原文的背景知识，都明确标出。

| 项目 | 完整 commit | 许可证（来源） |
|---|---|---|
| IfcOpenShell（`v0.9.0` 分支） | `28bae192780ebd34936441f1f7bc1ffb9d282be9` | serializer 和 draw.py 是 LGPL-3.0（`svg_serializer.cpp:8-10`，`ifcopenshell-python/pyproject.toml:14`） |
| Bonsai（同仓库 `src/bonsai`） | 同上 | GPL-3.0-or-later（`drawing/operator.py:6-9`） |
| svgfill（同仓库 `src/svgfill`） | 同上 | README 标 LGPL，但依赖 CGAL Arrangements（GPL）（`src/svgfill/README.md:9,21`） |
| FreeCAD | `24ea8589aa8676049f7fe53ca9d1d1c398c38d26` | LGPL-2.1-or-later（`ArchSectionPlane.py:1`） |
| three-edge-projection | `cc3904df2b583372cce767d6daa70582f99d5ed1` | MIT（`LICENSE:1`，`package.json`） |
| three-mesh-bvh | `26fc97c5f007b8bd905ec31df9deac5d9d668782` | MIT（`LICENSE:1`） |
| hlr-svg | `fa648535fa6abb2ceab8abfee85844cb4e1c3c50` | MIT（`LICENSE:1`） |

以上全部只读，未运行任何克隆代码的构建或安装脚本。**GPL/LGPL 代码在本文中一律只取思路，没有一行可以进入 ArchLang。**

**未能读到的来源（如实说明）：**

- **GB/T 50104-2010 原文未读到。** 线型表来自清华大学出版社教材文档 `063228-02.doc`，它转述了该标准（表 1-1）。这是二手来源。
- **OCCT `HLRBRep` 内部未读。** 只读了两个调用方。
- Bonsai 的 Freestyle 模式、Bonsai 自家的楼梯生成器未读。
- 上述探针运行在单台 Windows x64 的 Node 24.22.1 上，**跨机和浏览器一致性未实测。**
- 探针用的是 `packages/archlang-3d/dist`，其构建时间略早于 `src` 最新提交。我查了 `git log`，见报告末尾附注。

## 2. 成熟工具的做法

### 2.1 IfcOpenShell / IfcConvert（`src/serializers/svg_serializer.cpp`）

**已验证：**

- **截面与投影是两条独立管线。** 截面用 `BRepAlgoAPI_Section(subshape, pln)`（`:1851`），得到的边再用 `ConnectEdgesToWires` 按 1e-5 容差拼线（`:1876`），打上 `cut` 类（`:1843-1849`）。投影走 `hlr_engine`（`svg_serializer.h:555`），即 `HLRBRep_Algo` 或 `HLRBRep_PolyAlgo`（`.h:395-399`）。
- **投影前必须先切掉平面后方的几何**，用半空间做布尔差（`:1391-1447`）。注释承认脆弱："loop over parts to have better luck with co-planar parts"（`:1438`），失败时记日志 "Failed to cut element for HLR"（`:1449`）。
- **性能靠预筛。** 只保留朝向相机的面（`.h:480-484`），把大的正对面当遮挡体，凡被它完全挡住的元素直接跳过（`.h:413-452`）。边数超过阈值时退化成线框（`:1454-1461`）。Bonsai 把阈值设为 10000（`operator.py:1421-1422`）。
- **五类边样式是有价值的思路。** `outline / boundary / sharp / crease / flush`（`:985-1121`）：相邻两面前后翻转即轮廓；凸起用 45° 阈值，凹陷用 12°（`.h:655-656`）；低于阈值为 `flush`，默认不画（`:1579`）。注释里记录了一个值得记住的教训：用边的朝向判断凹凸屡次出错，应改用"对侧顶点落在平面哪一侧"的位置判据（`:1050-1058`）。
- **排序有 tie-break 意识。** 楼层比较器在标高相等时退回实例 id（`.h:85-90`）。
- 自动剖面和四向立面都是合成一个沿包围盒的 `vertical_section`（`:2450-2494`）。楼层标高符号也在这里画（`:2535-2577`）。

### 2.2 Bonsai（`src/bonsai/bonsai/bim/module/drawing/`）

**已验证：**

- **三层 SVG 拼合：underlay / linework / annotation**（`operator.py:441-483`），`combine_svgs` 按文本行直接拼接，作者自己写了 "Hacky :)"（`:510`）。这是最值得抄的结构，但拼接方式不要抄。
- **把 IfcConvert 当引擎再做一遍后处理。** 默认 `cut_mode=BISECT`（`prop.py:525`）：丢掉 serializer 的截面线（`operator.py:1537-1540`），改用 Blender `bmesh.ops.bisect_plane` 重算（`tool/drawing.py:2766-2795`）。这本身就说明通用布尔截面不够可靠。
- **封闭截面靠补救。** 注释直说 "IfcOpenShell may not correctly create closed paths"，用 `shapely.polygonize_full` 修补（`operator.py:1597-1602`，issue #3421）。洞要靠"外环是否等于某内环"的哈希两遍识别（`:1627-1653`）。
- **poché 合并有明确的绘图规范。** 同类同材质才合并（`:1547-1555`），默认只合并 `IfcWall` 和 `IfcSlab`（`:1561-1564`）。这一条值得直接抄。代码本身则是坐标舍入后 O(n²) 两两 `shapely.union`，失败时打印 "Portions of the merge failed"（`:1705,1714-1725`）。
- **绘制顺序**：投影压在截面下面（`:1775-1784`）。
- **面填充很贵。** 把投影线重新多边形化，再逐个多边形做射线判定属于哪个元素（`:1150-1202`）。线段要延长 0.5 mm 才能相交（`:1159`），小于 0.1 mm² 或 1 mm² 的碎片丢弃（`:1167,1264`）。
- **非确定性来源（反面教材）：** `set(map(frozenset, ls))`（`:1230`）；`" ".join(list(polygon_classes))` 对 Python set 取序（`:1733`），字符串哈希每进程随机，class 顺序不稳定（此处影响是我依 Python 语义的推断，未实测）。
- **线宽**来自 CSS 类（`bim/data/assets/default.css:25-34`）：`.cut 0.35`、`.projection 0.25`、`outline 0.35` 到 `flush 0.1`。材质填充用 pattern，如 `.material-concrete`（`:99`）。
- **标高和轴线是独立注释**：`draw_section_level_annotation` 写 "RL +x.xxx" 和楼层名（`svgwriter.py:411-447`），`draw_grid_annotation` 画点划线和两端标签（`:478-514`）。

### 2.3 FreeCAD

**已验证：**

- **`getCutShapes`** 用布尔把每个实体切成三份：前方 `sub.cut(cutvolume)`、截面 `sub.common(cutface)`、后方隐藏（`ArchSectionPlane.py:233-244`）。分层材质按层保留截面面以便分别着色（`:209-255`）。这与 Bonsai 的分层截面是同一需求。
- **三类输出分层**：可见 `vshapes`、隐藏 `hshapes`、截面 `sshapes`，各自 `projectToSVG`，截面线用单独的 `SVGCUTLINEWIDTH`（`:548-622`）。
- **手性靠 hack。** 隐藏线包 `scale(-1,1)`（`:573`），填充包 `rotate(180)`（`:588`）。
- **合并靠按材质 `multiFuse` 加 `removeSplitter`**（`:178-190`），可能产出非实体（`:188` 的提示）。
- **ArchVRM 是纯 Python 画家算法，是一个直接的反面证据。** `compare` 五项测试都不通过时打印 "Houston, all tests passed, and still no results" 并返回 0（`ArchVRM.py:476-478`）。排序超限就放弃（`:622-625`），而且确实会丢面："faces lost"（`:627-634`）。
- **TechDraw** 同样基于 OCCT HLR，把可见/隐藏各分硬边、光滑边、接缝、轮廓、等参线（`TechDraw/App/GeometryObject.cpp:151-233`）。

### 2.4 three-edge-projection 与 three-mesh-bvh

**已验证：**

- **`ProjectionGenerator` 在 three-edge-projection 里**，不在 three-mesh-bvh 里。three-mesh-bvh 只提供 BVH，并在 README 中链接前者（`README.md:90`）。
- **算法**（对象空间）：提取特征边（`generateEdges.js:15-192`）；用 BVH 配对边和三角形（`bvhcastEdges.js:20-121`）；每一对先把边裁到三角形平面下方（`trimToBeneathTriPlane.js:8-87`），再求投影重叠的参数区间（`getProjectedLineOverlap.js:19-145`）；区间二分插入并合并（`getProjectedOverlaps.js:44-95`）；对区间取补得到可见段（`overlapUtils.js:6-45`）。**"每条边维护隐藏区间集合"这个思路最接近我们，值得借鉴。**
- **不能作依赖的原因（已验证）：**
  - 边按 `mesh.uuid` 排序（`ProjectionGenerator.js:355-369`），three.js 的 uuid 是随机的（three 本身未读，属背景知识）。
  - 结果写入 `Float32Array`（`overlapUtils.js:31`，`ProjectionGenerator.js:31`），在 µm 量级会丢精度。
  - 用 `performance.now()` 控制让出节奏（`ProjectionGenerator.js:171,174`）；这只影响调度，但违反"产出不读时钟"的仓库规则（`.claude/rules/archlang-3d.md:24`）。
  - 只沿 Y 轴投影（`ProjectionGenerator.js:17`）。
  - 峰值依赖要求 three ≥ 0.185 和 three-mesh-bvh ≥ 0.9.17（`package.json:50-51`）。
- `PlanarIntersectionGenerator` 只输出无序线段（`:29-96`），不封闭，也不填充。
- `getProjectedLineOverlap` 等处用 1e-16 级 epsilon（`:4-5`），说明它依赖浮点精确性。

### 2.5 其他搜索结果

- **hlr-svg（MIT，TS）。** 已验证是采样加二分：沿曲线取若干样本点，射线判可见，再二分找转折点（`src/hlr/README.md:15-18`，`visibilityCuts.ts:87-88`）。参数含 `epsVisible`、`samples`（`README.md:57-62`）。是近似算法，**不采用**。
- **plotter-vision** 仅在搜索结果中见到，未读。
- **Appel 量化不可见度（QI）。** 属背景知识（INFERRED，未读原文）：沿边走，只在穿过轮廓时更新遮挡计数。Band Envelope 在思想上是它的 2.5D 特例：可见性只在包络断点处变化。
- 我没有找到现成的纯 JS 精确 HLR 库。一次搜索的否定结论不算证明。

### 2.6 判定表

| 项目 | 判定 | 理由 |
|---|---|---|
| IfcConvert 五类边分类 | **抄思路** | 特别是 `flush` 与凹凸位置判据 |
| Bonsai 三层结构、绘制顺序、合并规范 | **抄思路** | 这是绘图规范，不是算法 |
| Bonsai `polygonize` 补救 | **避免** | 整数棱柱上这类问题不存在 |
| FreeCAD 三类输出 + 独立截面线宽 | **抄思路** | 与 Bonsai 同构 |
| ArchVRM 画家算法 | **避免** | 有循环遮挡时不收敛，会丢面 |
| three-edge-projection 隐藏区间思路 | **抄思路** | MIT，可读可学 |
| three-edge-projection / three-mesh-bvh 作依赖 | **避免** | 随机序、Float32、three 峰值依赖 |
| Clipper2、shapely、CGAL、OCCT | **避免** | 用不到；CGAL 还是 GPL |
| hlr-svg | **避免** | 采样近似 |
| 核心 `src/view/paint.ts` 画家 | **只抄排序纪律** | 其总序和量化思路（`:5-18`）正确；但不透明填充遮挡会把隐藏几何留在文件里，且核心视图已弃用（`src/view/iso.ts:47`） |
| 核心 `src/geometry/union.ts` 坐标压缩 | **抄思路** | 与本算法同构（`:8-10`）；未从 `src/index.ts` 导出，要用须走 additive export（`.claude/rules/archlang-3d.md:14-16`） |

**深度线宽：** 用户需求里提到"按深度分线宽"。在我读过的 `default.css`、`svg_serializer.cpp`、`operator.py`、`ArchSectionPlane.py` 中，**没有找到按深度变化线宽的实现**（Freestyle 模式未读）。这里没有可抄的先例，是我们自己要决定的设计。

## 3. 推荐算法：Band Envelope

### 3.1 关键观察

设视向为世界轴。所有几何是 `polygon × [z0, z1]`，因此：

- 顶面、底面在视图里零面积，只贡献水平线。
- 每条平面边 `(x0,y0)-(x1,y1)` 对应一个竖直面，投影是矩形 `[u0,u1] × [z0,z1]`，深度沿 u 线性变化，与 z 无关。
- 把所有 `z0/z1` 排序去重得到若干高度带。**同一带内场景不随 z 变化**，所以 2.5D 问题被切成若干个 2D 问题：沿视向看平面线段，求最近者。

这正是为什么本算法不需要 3D 布尔、不需要三角形、不需要 epsilon。

### 3.2 流程

**输入：** `Solid { key, kind, level, polygon, z0, z1 }[]`，加视图 `{ dx, dy, c, section }`。

**第 0 步：取得棱柱。** Mesh3D 只保留三角形，多边形丢了。探针是从三角形反推的，产品不该这样做。做法：在 `mesh/build.ts:242` 的 `prism` 包装层加一个旁路收集器，随 `node()`（`:247`）记下 key。这样 Mesh3D 字节不变，laneway 的 Mesh3D/GLB 固定哈希不动（`.claude/rules/archlang-3d.md:27-30`）。

**第 1 步：视图坐标系。** 平面 y 向下，所以视向 `(dx,dy)` 的屏幕右方是 `(-dy, dx)`：

```ts
u = -dy * x + dx * y;
d =  dx * x + dy * y - c;
```

例如从南向北看，`(0,-1)` 的右方是 +x（东）；从北向南看，右方是 -x。这里写错就是镜像图纸，且错得很隐蔽。

**第 2 步：高度带。** `zs = sorted(unique(z0, z1))`，每个 `[zk, zk+1]` 一带。

**第 3 步：每带建标签。** 对活跃棱柱：

```ts
// 剖切：half-open 规则，等价于把剖切面符号性地前移无穷小
if ((d0 < 0) !== (d1 < 0)) crossings.push(uAtZeroDepth(seg));   // 成对得到 cut 区间
// 投影：裁到 d >= 0；u0 === u1 的边对视线是边缘，跳过
segs.push(clipFront(seg));
// 断点 = 所有端点 + cut 区间端点
// 每格取中点处最近线段；检查格子两端赢家，变了就在交叉点加断点，重算到稳定
label[i] = cover[i] > 0 ? CUT(class) : plane(nearest[i]) ?? EMPTY;
```

**第 4 步：标签变化处出线。** 同一带内相邻格标签不同，出竖线；相邻两带用归并走一遍，出水平线。

```ts
lineClass(p, q) =
  p === q                ? none        // 共面 + 同类：墙与窗下墙的缝自动消失
  : p 或 q 是 CUT         ? "cut"
  : p 或 q 是 EMPTY       ? "outline"
  : isSmooth(p, q)        ? none        // 曲面墙的相邻小面
  : depth(p, q) > 阈值    ? "far" : "near";
```

**第 5 步：合并、定序、输出。** 共线相邻段按类合并；用整数键全序排序，序列化。

### 3.3 必须补上的四点（探针暴露）

1. **交叉细化必须做**（§4.3）。
2. **曲面墙要做平滑边抑制。** 探针的 aquarium 立面每个小面都画一条竖线。修法抄 `flush`：相邻两段属于同一 prism 且法线夹角小于 12° 时不出线。阈值是 IfcOpenShell 的默认值，语义相同但需在语料上再确认。
3. **cut 必须分级。** 探针里家具被切成黑色实心，明显不对（villa 的车）。类别优先级：`structure`（wall、column、slab、roof）填 poché 用 b；`secondary`（door、window）不填用 0.7b；`furniture` **默认不进剖面**。
4. **`floor` 5 mm 面层不进视图。** 在 1:50 上只有 0.1 mm。探针已跳过，但要在账本里记。

### 3.4 确定性规则

- 输入是整数 µm。断点全部 `Math.round` 到整数 µm。
- 计算只用 `+ - × ÷` 和 `Math.round`。不用 `Math.hypot/sin/cos`。ECMAScript 对这些函数是"实现近似"，IEEE 四则则是确定的（背景知识）。注意 `mesh/build.ts:94` 已用 `Math.hypot`，但结果四舍五入到 µm；探针未验证其跨引擎性。
- **不对浮点排序。** 深度只用于比较，不进输出序。排序键全部为整数，字符串比较用 `byText`（`mesh/build.ts:90`），不用 `localeCompare`。
- 同深度平局由类别优先级解决，再退回 `key`。探针里同平面归到同一标签，所以打乱输入不改字节。
- 数字走固定格式，不用裸 `toString`。
- 不用 `Map`/`Set` 的迭代序决定输出。

### 3.5 SVG 结构

```xml
<svg viewBox=… data-view="section-1-1" data-scale="100">
  <g id="projection">     <!-- 先画：投影在下，同 Bonsai -->
    <g class="far"/> <g class="near"/> <g class="outline"/>
  </g>
  <g id="cut">            <!-- 再画：poché + 截面线 -->
    <path class="poche" fill-rule="evenodd"/> <g class="cut"/> <g class="cut-secondary"/>
  </g>
  <g id="ground"/>        <!-- 地坪线 -->
  <g id="annotation">     <!-- 最后：轴线、标高、尺寸、图名 -->
    <g class="axes"/> <g class="levels"/> <g class="dims"/> <g class="title"/>
  </g>
</svg>
```

一次生成，不做 Bonsai 式的文本拼接。每个 `<path>` 可带 `data-source` 指向 `key`，用于回溯到 `.arch` 的 span（`scene3d/types.ts:24-28`）。

### 3.6 线宽（GB/T 50104，经教材转述）

**已验证（来自教材 `063228-02.doc` 表 1-1，二手）：**

| 线 | 宽 | 用途 | 我们的类 |
|---|---|---|---|
| 粗实线 | b | 平、剖面图中被剖切的主要构造轮廓；立面外轮廓；剖切符号 | `cut`、立面 `outline`、剖切符号 |
| 中粗实线 | 0.7b | 被剖切的次要构造；平立剖中构配件轮廓 | `cut-secondary`、`near` |
| 中实线 | 0.5b | 小于 0.7b 的图形线、尺寸线、标高符号、高差分界线 | `far`、尺寸、标高 |
| 细实线 | 0.25b | 图例填充线、家具线、纹样线 | 填充、家具 |
| 细单点长划线 | 0.25b | 中心线、定位轴线 | 轴线 |
| 细折断线 | 0.25b | 部分省略的断开界线 | 楼梯剖面 |

简单图样可用两种线宽，比值宜为 b : 0.25b。

**有分歧或未验证，需主会话注意：**

- **1.4b 地坪线未验证。** 上述表里没有 1.4b，文档全文也搜不到。行业常用"室外地坪线加粗"是我的背景知识。决定：实现为 `ground` 类，取 1.4b，但在图注和账本中标为本项目约定，**动手前核对标准原文**。
- **标高符号的线宽有矛盾。** 表里列为中线 0.5b，同一教材的正文又说"以细实线绘制"。决定：取 0.5b（遵循表），待原文核实。
- **剖面中的 `outline` 用什么线宽，表里未直接规定。** 决定：用 0.7b（构配件轮廓）。
- 教材引用 GB/T 50001-2010，而 GB/T 50001 已有 2017 版（工标库页面目录可见第 4 章图线、11.8 标高）。线宽组要按 2017 版核对。
- **深度阈值无标准依据。** `near/far` 的 3 m 分界是探针随手取的，属项目设计。建议按"相邻跨度"重新定，并由屋主看图裁定。

标高写法（已验证，同一教材）：以米为单位，注到小数点后三位；底层室内主要地坪为 ±0.000；总平面可到两位。

### 3.7 规模估算（INFERRED，由探针外推）

| 模块 | 行数 |
|---|---|
| 棱柱收集器（改 `build.ts` 约 15 行） | 60 |
| `envelope.ts`：高度带、包络、交叉细化 | 180 |
| `lines.ts`：标签、分类、平滑抑制、合并 | 140 |
| `style.ts`：线宽类 | 40 |
| `annotate.ts`：地坪、标高、轴线、尺寸、图名 | 250 |
| `svg.ts`：写出、poché 填充 | 120 |
| CLI 和 manifest | 60 |
| **小计（src）** | **约 850** |
| 测试 | 约 700 |
| 楼梯（Scene3D + Mesh，另算，属 M4） | 250–350 |

核心算法只占约 300 行，大头在注释和图面规范。**工作量的风险在"看起来像中国建筑师的图"，不在几何。**

## 4. 实测（探针，非产品代码）

探针：``../spike/``，`render` 函数 125 行。语料：`examples/*.arch` 全部 36 个，无一被拒。每个方案 6 张图（2 剖面 + 4 立面），共 216 张。

### 4.1 结果

| 指标 | 结果 |
|---|---|
| shell 总数 / 非棱柱 | 4807 / **0** |
| 打乱输入后 SVG 字节不同 | **0 / 216** |
| 216 张图总耗时 | 约 0.65–0.72 秒（单机多次运行） |
| 单方案 6 张图最慢 | 约 74–116 毫秒 |
| 最大方案 | library：2034 段，29 带 |
| 输出线段 | 8956 |
| 随机射线预言机 | 32400 样本，0 不符 |

"棱柱"检查是从原始三角形判定：每个三角形要么在 z0/z1 上水平，要么平面投影共线，且顶面和底面的边界集合相同。

### 4.2 独立预言机

对原始 Mesh3D **三角形**做射线相交（与算法不共享任何几何代码），采样点抖动到网格线之外，用奇偶规则判断是否在实体内。

首轮有 48/8640 不符，后续运行中 85 处。这些全部是"类别相同、深度不同"，且只出现在斜墙方案。原因是我的比较方式错了：拿格子中点深度比较斜面上的任意点。改成在样本点精确求值并用 2 µm 容差后，变成 0。这是预言机的 bug，不是算法的。

### 4.3 预言机有没有检测力

0 不符本身说明不了什么，所以做了故障注入：

| 注入故障 | 不符 / 5400 |
|---|---|
| 每 50 个实体丢一个 | 119 |
| 最远面获胜（符号错） | 4869 |
| cut 配对错一位 | 333 |
| **镜像（手性错）** | 5139 |

以上四种故障，均匀采样都能抓到。但交叉缺陷抓不到，这才是关键：

| | 均匀采样 | 定向到交叉点附近（400 样本） |
|---|---|---|
| 不做交叉细化 | 0 / 32400 | **139 / 400，最大误差 7.82 mm** |
| 做交叉细化 | 0 / 32400 | 0 / 400 |

也就是说**均匀随机预言机对这个缺陷是盲的**。首轮交叉 64 处，细化后线段从 8941 增加到 8956。

交叉发生在：`window+window` 42、`wall+wall` 14、`door+wall` 8、`wall+window` 6、`furniture+furniture` 2。已验证的事实：这些只出现在含斜边的方案里，`oblique=0` 的方案全部 `crossings=0`。推断（INFERRED）：两个面的深度在同一带内交叉，意味着两段平面边相交，即实体在平面上有重叠或接合误差；具体成因我没有逐例追查。

### 4.4 墙板重叠（已验证，影响设计）

计划里的 `slab-below-floor` 规则（`docs/plans/archlang-3d/development-plan.md:654`）**没有实现**：`packages/archlang-3d/src` 和 `test` 中查无此名。`build.ts:345` 的墙顶是 `e + w.height`，而上一层楼板占 `[e_next − 200, e_next]`（`:301`）。

two-storey 实测：一层墙到 2700，板在 2500–2700，二者重叠。语料中 7 个方案的剖切线上出现重叠：townhouse 0.66 m²、hillside-villa 0.30、garden-house 0.29、two-storey 0.20、turning-stair 0.19、corner-cafe 和 courtyard-house 各 0.02。

本算法用 `cover[i] > 0` 天然免疫，**不需要 2D 布尔**。但这意味着 `V-GEO-08` 所描述的状态并不成立，且 Bonsai 式的"先合并多边形再填色"若照搬，这里会出问题。

### 4.5 看图（肉眼）

two-storey 剖面、villa 剖面已能看出双层高空间、悬挑屋面、楼板洞口、远处家具和门窗。立面 S 只有一扇门，我核对了源码：南墙确实只有 `front` 门（`x=1100, y=7000`），窗在北墙和东墙，且左右位置正确。

**探针的已知缺陷：** 无楼梯、无地坪线、无标注、无材料填充、曲面墙小面条纹、家具被 poché、斜向视图未做。

## 5. 成熟工具难在哪里，我们是否躲得开

| 难点 | 他们 | 我们 |
|---|---|---|
| 共面面 | 分部件切"碰运气"（`svg_serializer.cpp:1438`） | 同平面同标签，免疫 |
| 截面洞、封闭 | polygonize 补救（`operator.py:1597-1653`） | 格子标签，免疫 |
| 碎片、小缝 | 延长 0.5 mm，丢弃 <1 mm²（`:1159,1264`） | 整数断点；舍入可能产生 1 µm 窄格，需在合并时规定处理 |
| 剖切面压在面上 | 偏移 5 mm（`tool/drawing.py:2733`）；"很小但不为零"（`ArchSectionPlane.py:1246`） | half-open 规则，无容差 |
| 性能 | 预筛、线框退化（`:1454-1461`） | 每带线性扫描，语料毫秒级 |
| 布尔失败 | 记日志跳过（`:1449`） | 没有布尔 |
| 手性 | 镜像、`scale(-1,1)`、`rotate(180)` | 一个公式；须用测试钉死 |
| 楼梯 | 我读过的路径里没有专门处理 | **我们同样难**，见下 |

**我们躲不掉的难点：**

- **楼梯。** 斜向梯段底板不是竖直棱柱，会打破核心假设。决定：**梯段建成"横向棱柱"**：沿宽度方向拉伸的侧面轮廓。当视向平行于梯宽时（标准的楼梯剖面），它在屏幕上就是一个多边形，直接作为 cut 或投影标签覆盖。当视向平行于梯段时，每级踏步退化成矩形。V1 只支持这两种情形，这已覆盖轴对齐视图的全部情形。
- **坡屋面。** 目前 `Roof.form` 只有 `"flat"`（`scene3d/types.ts:159`），暂不存在。将来处理方式同楼梯。
- **任意方向剖切。** V1 只支持世界轴。斜向建筑（如 hexagon）可以画，但无法对斜墙做正视立面。V2：先把平面坐标旋转并舍入到整数 µm，之后算法不变；因为同一输入点舍入结果相同，拓扑不会裂开。阶梯剖（转折剖切）属 V2 之后。
- **任意 z 上的斜面**（坡道、老虎窗）在当前 Scene3D 不存在。

## 6. 他们怎么测，我们该怎么测

**已验证：**

- Bonsai：`drawing.feature:62-79` 的断言是 SVG "包含 cut"、"包含 IfcWall"。`test_segment_clipping.py` 测的是线段裁剪工具函数。
- IfcOpenShell：`test/tests.py`、`test/run.py` 中 grep 不到 `svg`。
- FreeCAD：`TestArchSectionPlane.py:157` 的 TechDraw 生成测试结尾是 `assert True`，其余测包围盒。
- three-edge-projection：3 个工具函数单测，共 205 行。

**没有一个项目钉输出字节，也没有独立预言机。** 这一点上 ArchLang 的标准高得多，不要向它们看齐。

建议的测试（T1–T4 已在探针中跑通；T5 的镜像故障已被 T3 抓到，但专用测试未写；T6–T8 未做）：

- **T1 棱柱不变量**：每个 shell 是竖直棱柱。楼梯落地时这条要明确放宽。
- **T2 输入顺序无关**：打乱实体和线段，SHA-256 不变。
- **T3 三角形射线预言机**：固定种子，**均匀采样加定向到交叉点**，两者都要。
- **T4 预言机自检**：四种注入故障必须变红。这条防止 T3 悄悄失效。
- **T5 手性**：不对称平面四向立面，钉死左右。
- **T6 字节钉**：laneway 等代表方案的 SVG 哈希。遵守"改钉要写原因"的规则。
- **T7 跨平台**：CI 在 Linux 和 Windows 上比对同一 SHA。**这是目前唯一完全没有证据的确定性主张。**
- **T8 Mesh3D 不动**：收集器加入后，既有 Mesh/GLB 固定哈希不变。

## 7. Scene3D 缺什么（已验证）

| 项 | 现状 | 证据 | 剖面影响 | 决定 |
|---|---|---|---|---|
| 板厚 | 常量 200，非 Scene3D 字段，核心也没有 | `build.ts:39,301`；`build.ts:570` 账本 `slab-default-200` | 可画，但不是作者的值 | V1 接受，图注标"默认" |
| **楼梯踏步** | 只有 `box/dir/width`，无踏步数 | `types.ts:132-138`；`build.ts:30,582-587` 未建 | **硬缺口** | V1 前必须解决 |
| 转折楼梯 | 核心有 `flights/landings`，但 `stairOf` 丢弃 | `src/ir.ts:739-741`；`scene3d/build.ts:130-136` | **硬缺口** | Scene3D additive 字段 |
| 梯段踏步高 | 核心无 riser 字段 | `src/ir.ts:724-747` | 需按层高推导 | 推导并入账本 |
| 屋面 | 只有 `flat`，厚 150，无女儿墙 | `types.ts:156-162`；`build.ts:41,526-527`；grep `parapet` 无 | 缺女儿墙 | 账本默认 |
| 窗框 | 固定 40×60 | `build.ts:44-45,430-477` | 够立面用 | 接受 |
| 门扇 | 40 mm，默认关闭 | `build.ts:18,42` | 够用 | 接受 |
| 梁 | 无 | grep `beam` 在 Scene3D/mesh 无 | 剖面无梁 | 账本说明，不造 |
| 基础 | 无 | grep `foundation/footing` 无 | 首层底只有 200 板 | 画到板底加折断线 |
| **地坪线** | 无室外标高概念；`Outdoor` 无 z | `types.ts:140-146` | **硬缺口**：无 ±0.000 外的室外地坪 | 加 `meta.groundZ` 默认 0，入账本 |
| 轴线 | 核心 `ResolvedPlan.axes` 有，Scene3D 无 | `src/ir.ts:956`；`packages/archlang-3d/src` 精确 grep `RAxis\|.axes` 无 | 无 bubble | Scene3D additive，`RAxis` 已有 `label` |
| 楼层名 | **有** `Level.name` | `types.ts:164-169` | 够 | — |
| 楼层标高 | **有** `elevation`、`storeyHeight` | `types.ts:168-169` | 够 | — |
| 室外与栏杆 | 有数据但 Mesh 未建 | `build.ts:30` | 立面缺阳台栏杆 | 属 M4 |
| 电梯、扶梯 | 省略 | `scene3d/build.ts:309-320` | 缺 | 账本已记 |
| 材料 | `Wall.material` 是填充名 | `types.ts:69` | 可映射 | 用核心 `hatchOf`（`src/index.ts:464`） |

注意：`axes` 块只在 5 个 example 中出现（aquarium、hillside-villa、library、museum-wings、transit-hall）。**没声明轴线的方案不能猜**（ADR 0005），剖面就不画 bubble。这是铁律，不是缺陷。

## 8. 落地决定

1. **位置：`packages/archlang-3d`。** 核心永不获得 3D 选项、命令或绘图（`.claude/rules/archlang-3d.md:14-16`，AGENTS.md）。命令建议：`archlang3d section <plan.arch> --at y=3500 --look north`、`archlang3d elevation <plan.arch> --from south`。
2. **曝光按分级规则**（同上 `:17-20`）。D5 的预览标签是否适用于施工图式 SVG，要由主会话裁定。"看起来可出图"与核心 ISO 视图拒绝可签发外观（`src/view/iso.ts:15-17`）的立场有张力。我的建议：图框内固定写"示意，非施工图"。
3. **V1 范围：** 世界轴、四向立面、任意位置剖切、poché、四级线宽、地坪线、标高、轴线、楼层名；不含家具。
4. **顺序：** (a) 收集器与 envelope，附 T1–T5；(b) 线型与注释；(c) Scene3D 加 `axes`、`groundZ`、`flights/landings`；(d) 楼梯几何。(d) 在 (c) 之后，但**没有 (d) 的剖面穿不过楼梯间，不应宣称完成**。
5. **不新增运行时依赖**，因此许可门禁（`licences.json`）无需改动。
6. **开工前核实：** GB/T 50104-2010 原文（1.4b、标高符号线宽）；GB/T 50001-2017 线宽组。

## 附注：探针的 `dist` 是否过期

`packages/archlang-3d/dist/index.js` 时间戳为 2026-10-31 15:04。在这之后 `packages/archlang-3d/src` 的提交只有 `aa945f01` 和 `7eba04d8`，只改了 `cli/manifest.ts` 和 `cli/run.ts`。`mesh/`、`scene3d/`、`adapter/`、`walls/` 的最新提交是 `ad22554e`（06:18），早于这次构建。探针只读 `adaptPlan` 与 `buildMesh`，因此结果适用于基线 `18127701`。
