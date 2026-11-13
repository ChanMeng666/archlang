# 第 8 轨的视觉语言设计稿（RM8.5–RM8.9）

本文是 `../cards.md` "冻结期设计稿"列表的第五份，是 RM8.5、RM8.6、RM8.7、RM8.8、RM8.9 开工前要读的设计，不是实现。2026-11-11 在 `main@bb912513` 上写成：下文的符号、行号、表项与数字逐条读过源码；词长、spec 余量、未露面的家族与候选词的冲突用一个只读脚本从源码重算（脚本放在仓库外的草稿目录，不入仓库）。同日按协调者对 #715 的核对修订一轮（在合并了 `main@fcd56b27` 的分支上：§3.2 的去处、§4.4 的律模块、§1.5 的漏列面、§3.3 的完整理由，以及 §0、§1.2、§1.3、§2.2、§3.4、§4.1 的几处）。所有者 2026-11-11 裁定路线图的日期与 Show HN 冻结不再卡工作，卡在真实依赖满足后即可开工；本文就是 RM8.5–RM8.9 的那个依赖。

标记：**【所有者裁定】** 是会动铁律或 ADR 的选择，要所有者一句话；**【协调者定】** 是其余的开放选择，本文给出推荐与理由，协调者可直接采用或改。每节末尾列出"与卡不符之处"，即卡的前提在代码里不成立或已经变了的地方。

## 0. 先读的事实

| 事实 | 出处 |
|---|---|
| 103 个家族、163 个词；67 个 canonical 家族有目录占地，`furniture` 行列出它们共 609 个 UTF-16 单位 | `src/elements/fixtures-glyphs.ts:159`（`FIXTURE_FAMILIES`）、`:321`（`CANONICAL_FIXTURES`）；`src/fixtures-catalog.ts:956`（`defaultFootprint`）；`scripts/gen-llm-spec.ts:115`（`SIZE_OPTIONAL_FIXTURES`） |
| `spec.llm.md` 当时 29,856 UTF-16 单位，上限 `< 30_000`，余量 143（PS7.9 / #714 之后是 28,605，余量 1,394） | `test/llm-spec-drift.test.ts:82`；2026-11-11 在 `bb912513` 上重算 |
| 地面词 4 个：`tile`、`paving`、`deck`、`concrete`。`tile` 与 `concrete` 是墙材料（`KNOWN_MATERIALS`），用在地面时画成无底色的裸图案；`paving` 与 `deck` 是 `outdoor` 的地面图案（`GROUND_MATERIALS`），本来就不画底色 | `src/hatches.ts:36`（`KNOWN_MATERIALS`）、`:61`（`GROUND_MATERIALS`）、`:72`（`FLOOR_MATERIALS`）、`:104`（`floorHatch`：墙材料名加 `bare`） |
| `outdoor` 9 种，各读三个主题底色之一 | `src/ast.ts:871`（`OUTDOOR_KINDS`）；`src/elements/outdoor.ts:133`（`GROUND` 的 `tint`：`lawn`、`paving`、`water`） |
| 图案线色一律是主题的 `pocheHatch` | `src/backends/svg.ts:263`（`hatchCtx`） |
| 材质名闭集含 `stone`、`soil`、`screen`、`wood`、`wool`，不是语言关键字 | `src/elements/fixtures-glyphs.ts:351`（`FIXTURE_MATERIALS`，`stone` 在 :359，`screen` 在 :363，`soil` 在 :368）；ADR 0023 2026-11-04 修订 |
| `outdoor` 种类必须也在 `KEYWORDS.enum`；地面词不在 | `src/grammar/tokens.ts:202`；`test/closed-vocabularies.test.ts` |
| `sheet text` 的可写键包含 `GROUND_MATERIALS` 与全部 `FIXTURE_CATEGORIES` | `src/sheet-text.ts:81`（`vocabularyKeys`） |
| 写错的家具词按增删字符距离提示（4 字符以下不提示，5–6 字符 1 个，更长 2 个），只对没写 `label` 的件 | `src/elements/furniture.ts:1242`（`NEAR_EDITS`）、`:1259`（`nearEdits`）、`:1353`（`W_UNKNOWN_FURNITURE`，RM1.4） |
| 未知 `floor` 词的警告把已知词逐个列出 | `src/elements/room.ts:191`–`:194` |
| V8 的字节恒等律：`FAMILIES_BEFORE = 83`，近义词 `NEAR_WORDS` 7 个；前提用例扫描 `examples/**`、`docs/`（跳过 `docs/plans/`）等目录里的 `furniture <新词>`；行只读顶层 `examples/*.arch` | `test/helpers/new-families-law.ts:36`、`:44`、`:99`–`:105`；`test/new-families-byte-identity.test.ts:122`–`:166` |
| 3D 的挂墙物：按下沿挂（`T0_MOUNT_MM`：吊柜 1400、抽油烟机 1600、镜子 1100、小便斗 350、毛巾架 200、白板 900），或按上沿挂（`T0_HUNG_FROM_TOP`：电视） | `packages/archlang-3d/src/mesh/t0.ts:126`、`:133`；`t0-utility.ts:164`、`:218`、`:299`、`:397`；`t0-living.ts:733`；`t0-office.ts:270` |
| `profile` 是"框内分数坐标的多边形截面，沿一个轴拉伸"，不是回转体；树冠与懒人沙发今天是叠起来的圆角层（`dome` 按 `CROWN`、`MOUND`、`HEMI` 表） | `packages/archlang-3d/src/mesh/t0.ts:412`–`:430`（`sectionRing`）；`t0-kit.ts:260`–`:296`；`t0-outdoor.ts:53`、`:296`；`t0-living.ts:840` |
| 查看器：三盏灯、平面着色、无阴影；阴影图实测多约 55% 帧时间，超过 V9 卡约 30% 的预算 | `packages/archlang-3d/src/replay/mount.ts:189`–`:193`；`docs/plans/visual-assets/cards.md` V9；`docs/backlog.md` VA.5 |
| GLB 只写 `POSITION` 与索引 | `packages/archlang-3d/src/glb/write.ts:179` |
| 地面平面只在查看器里，但每份 Mesh3D 的账本都写一行 `ground-plane-viewer-only` | `packages/archlang-3d/src/materials.ts:224`；`src/mesh/build.ts:978`–`:990` |
| `PREVIEW_LIMITS` 已被 RM8.3 改写，现文是 "3D preview: walls, openings, floors, stairs, furniture, outdoor surfaces and fences in flat colours; the ground is a backdrop the viewer draws, not part of the building and not in the file; no pitched roofs or balcony railings yet, and no sections, elevations or BIM." | `packages/archlang-3d/src/replay/payload.ts:88` |
| laneway-house 有门窗，没有楼梯，没有树、灌木、盆栽或懒人沙发 | `examples/laneway-house.arch`（12 个家具词，2026-11-11 grep） |

---

## 1. RM8.8 · 接触阴影与环境遮蔽

### 1.1 做法：查看器里的半透明"阴影带"，几何从 Mesh3D 节点确定性地求出

不用实时阴影图，也不用屏幕空间 AO（那是每帧的后处理，同样在 SwiftShader 上贵，而且不是"由几何烘焙"）。阴影是一组扁平的四边形带，每个顶点带一个 alpha，在挂载时由一个纯函数从回放载荷里的 Mesh3D 节点算出，建一次，之后每帧只按 `t` 调透明度。三类：

| 类 | 几何 | 尺寸（全部整数 µm，取自几何本身） |
|---|---|---|
| 墙脚带（地面上，沿墙） | 每层墙与柱的平面并集轮廓（与 RM8.1 的 `wall-lines.ts` 同一组节点；用并集而不是逐块，免得块与块、窗台块与墙块的接缝处两条带叠黑），每条边向外一条带；凸角处用 16 边形精确表（`t0.ts` 的 `C16`）的一个四分之一扇补缝；凹角处两带自然交叠（凹角本该最暗） | 带宽 `b = clamp(round(0.75·t), 80, 200)` mm，`t` 为该边所属墙的厚度；内缘 alpha `A_floor`，外缘 0 |
| 墙角竖带（墙面上） | 同一并集轮廓的每个凹角，两侧墙面各一条竖带，从楼面到两墙中较矮者的顶 | 带宽同 `b`；角上 alpha `A_corner`，外缘 0 |
| 家具接触晕（地面上） | 每件落地家具的占地矩形（Scene3D 的 `centre`、`size`，即家具的真实形状，不是包围盒推出来的）向外一圈带；挂墙的件（`isHung`）没有 | 晕宽 `clamp(round(0.12·min(W, D)), 30, 120)` mm；alpha `A_furniture` |

围栏、楼梯、柱：围栏按每段沿线两侧一条窄带（宽 `clamp(round(1.5·post), 40, 120)` mm，`post` 为 `FENCE_PROFILES` 的柱宽），楼梯梯段沿踏步带两侧边一条墙脚带（`t` 取 100 mm 计），柱随墙的并集轮廓。室外地面、楼板、地面平面只接收，不投射。

**接收面的高度**：带的内缘中点向外探 `b/2`，落在某个房间楼面环内（Scene3D 的 floor 多边形，`pointInPolygon`）就放在该楼面顶上 1 mm，否则放在本层楼面标高 `e` 上 1 mm（室外地面的抬高是 0.5 mm 一级，`FLOOR_LIFT_UM`）。材质：`MeshBasicMaterial`，黑色、`vertexColors` 带 alpha、`transparent`、`depthWrite: false`，`polygonOffset` 向前（与 `mount.ts:338` 的各级 `polygonOffsetUnits` 同法排序）；每层的墙脚带合成一个 BufferGeometry，竖带一个，家具晕一个，所以每层至多 3 次绘制。

**回放中的出现**：带属于它的投射者。墙脚带与竖带在本层最后一面墙升到顶时出现，家具晕在该件落定时出现；不透明度在投射者升起过程的最后 25% 里按 `smoothstep` 从 0 到 1，是 `stateAt(t)` 的纯函数。分层展开（`lift`）时带随所在楼层一起下落。俯视的平铺阶段没有带。

**常量**（与 `LIGHT` 并列放在 `mount.ts` 或 `materials.ts`，冻结的数）：亮主题 `A_floor = 0.20`、`A_corner = 0.12`、`A_furniture = 0.18`；暗主题各乘 1.5（深底上同样的黑要更浓才看得见）。数值在 PR 里看海报调一次，此后冻结；调的过程只看 CI 打印的关键帧，不在本地 bless。

### 1.2 进 Mesh3D 与 GLB，还是只在查看器里：**只在查看器里**（【协调者定】）

- ADR 0030 决定 4：Mesh3D 是"一个几何真相"，喂所有后端。阴影带不是建筑的几何；进了 GLB，Blender 等查看器会再按自己的灯光算一遍阴影，结果是双重阴影。
- GLB 今天只有 `POSITION` 与索引（`glb/write.ts:179`）。带渐变的阴影要 `COLOR_0` 或贴图；贴图要 UV（`TEXCOORD_0`，第 8 轨对地面已明确不许）；逐顶点 AO 还要把只有几个顶点的大楼板细分。三样都是新的输出面。
- RM8.3 的先例：地面平面只在查看器里画（`materials.ts:224`）。
- 好处：GLB 的字节、事件表都不动；动的是关键帧基线（按 `.claude/rules/archlang-3d.md` Traps 第 1 条的 CI 打印值流程重钉）、海报与视频（`npm run gen:3d-assets -- --videos`），以及下面账本那一行带来的 Mesh3D 钉子。

**账本：每份 Mesh3D 加一行 `contact-shadows-viewer-only`**（协调者 2026-11-11 定）。先例就是 `ground-plane-viewer-only`（`src/mesh/build.ts:978`–`:990`）：一个只由查看器画、文件里没有的东西，照样在账本里说明，让读文件的人知道预览比文件多画了什么（ADR 0030 决定 5 的"surfaced in every output"）。这一行的 `value` 记三类带的宽度规则与亮、暗两套 alpha，`provenance: "default"`。代价：账本是 Mesh3D 的一部分，所以每份 Mesh3D 都变，laneway 的 Mesh3D SHA-256 按 V-D5 带理由移动；GLB 不写账本（`glb/write.ts` 只写节点、几何与材质），laneway 的 GLB SHA-256 不动。初稿推荐"不进账本、按灯光处理"，理由是三盏灯从来不进账本；协调者按地面平面的先例改为进账本，本稿照此。

### 1.3 帧时间预算与量法

**预算：中位帧时间比关闭阴影时多 ≤ 30%；挂载耗时多 ≤ 30%。** 30% 是 V9 卡对阴影定的同一个数（`mount.ts:192`–`:193` 注释），用同一个数才能和"阴影图 +55%"直接比；设计目标在 10% 以内（每层 3 次绘制、带很窄，额外的像素覆盖小）。超过 30% 不合并。

量法（与 V9 同：SwiftShader，1600 × 900）：
1. Chromium 经 `playwright-core`，旗标 `SWIFTSHADER_ARGS`（`packages/archlang-3d/src/replay/swiftshader.ts`），画布 1600 × 900（`scripts/gen-3d-assets.ts:125` 的 `POSTER` 尺寸），`supersample` 1。
2. 三张图：`laneway-house`（钉住的那张）、`courtyard-house`（室外地面多、带最多）、`two-storey`（两层）。
3. 同一浏览器进程里开两页，载荷只差一个 `shadows: false|true` 开关；先各渲 10 帧预热，再交替 A、B 各 60 帧（每帧在 `t_end` 与 `t_end − 1 ms` 之间来回 `seek`，强制重画，以 `__frameHash` 的读回作为帧结束）。
4. 取每页的中位数，报 B/A 比值；预算对三张图中最大的比值。挂载耗时同法量 15 次中位数（与 RM8.1 报挂载耗时的口径相同）。
5. 只在 CI 量，而且要接进 `check:3d` 的入口：`check:3d` 就是 `npm -w packages/archlang-3d run e2e`（根 `package.json:118`），即 `vitest.e2e.config.ts` 只收 `e2e/**/*.e2e.ts`。所以量法写成一个 e2e 文件（例如 `e2e/frame-budget.e2e.ts`；放 `scripts/` 的脚本 CI 不会跑）。它打印每张图的 A、B 中位数与比值，不断言比值（计时断言会抖），只断言量到了数（三张图都有 60 对样本）；数字从 `3D package (check:3d)` 任务的日志抄进 PR。本地不跑（一次一个重命令，CI 是完整门禁）。
6. 另加一条确定性的结构测试（轻测试，Node 下跑同一个纯函数）：阴影三角形数 ≤ `4·轮廓边数 + 8·凸角数 + 8·落地家具数 + 4·围栏段数`，三张图各一条；这是能每次都断言的那一半。

### 1.4 确定性

几何是整数 µm，由同一纯函数从载荷算出，不读时钟或随机源；alpha 常量冻结；同一环境同一 `t` 两次出图逐字节相同（`__frameHash`）。跨环境不要求像素相同（关键帧本来就按环境分别钉）。三.js 的透明排序按相机距离，对给定 `t` 是确定的；每类带设固定 `renderOrder`。

### 1.5 公开的那句话

`PREVIEW_LIMITS` 的现文已经不是卡里引的那句（RM8.3 改过，见 §0）。推荐新句（避开旧句里的 "in flat colours"，于是卡里 `grep "in flat colours"` 的证明可以直接用）：

"3D preview: walls, openings, floors, stairs, furniture, outdoor surfaces and fences in plain colours; the ground and the soft contact shadows are the viewer's, not part of the building and not in the file; no pitched roofs or balcony railings yet, and no sections, elevations or BIM."

用词：没有 render、photoreal、walkthrough、model。同 PR 改卡里列的全部测试与面；README 两张海报的 alt 文本里的 "in flat colours" 改成 "in plain colours with soft contact shadows"。2D 的"无阴影"（ADR 0023 决定 5）不动。

卡的清单之外，还有三处手写的同义说法（2026-11-11 在 `main@fcd56b27` 上 grep "flat colour"）：

| 面 | 现文 | 处理 |
|---|---|---|
| `docs-site/.vitepress/theme/IsIsntTable.vue:8` | "the 3D preview is a separate package's flat-colour preview" | 改成 "a separate package's 3D preview in plain colours"；`site-markdown.mjs` 读这张表，站点的 Markdown 副本随 `docs:build` 重生成 |
| `docs-site/.vitepress/theme/IsIsntTable.vue:11` | "… outdoor surfaces and fences in flat colours." | 与新的 `PREVIEW_LIMITS` 同一措辞："… in plain colours, with soft contact shadows the viewer draws." |
| `docs-site/3d.md:52` | "every catalogued piece of furniture, in flat colours from the package's own palette" | 改成 "in plain colours from the package's own palette"；同一个 "Shown" 列表末尾加一条：接触阴影由查看器画，文件里没有（与下面 "The ground" 那条同一说法） |

历史记录，不改，也不算进 grep 证明：`docs/whats-new.md:630`（某次发布时说过的话）与 `packages/archlang-3d/CHANGELOG.md:145`（0.x 某版的变更说明）照录当时的句子；`CHANGELOG.md:5683` 的 "one flat colour" 说的是源码高亮，与 3D 无关。生成的副本（`docs-site/public/`、`docs-site/.vitepress/dist/`、`docs-site/whats-new.md`）由 `docs:build` 重写，不手改。所以卡里"`grep "in flat colours"` 在公开面上不再命中旧句"的证明，范围是手写的源面，排除上面两个历史文件与生成的副本。

**与卡不符之处**：卡引的 `PREVIEW_LIMITS` 是 RM8.3 之前的旧句；要改的是 `payload.ts:88` 的现文；卡的面清单漏了 `IsIsntTable.vue` 的两处与 `docs-site/3d.md:52`。

---

## 2. RM8.6 · 门窗与楼梯的 3D 细部

所有尺寸按下表从几何取：门窗取宿主墙厚 `t`（Scene3D 墙的 `thickness`；开洞切口的深度就是它），楼梯取它自己的踏步高 `r = rise / R`（`R` 为 `stairRisers`，`stair.ts:21`）、踏步深 `g = run / treads` 与梯段宽 `W_f`（`Stair.width`）。每个都是 `round` 到整毫米再夹取，再换成整数 µm；每行一个账本条目（ADR 0030 决定 5，V-D4）。只做四分之一转；每个壳体封闭（V-GEO-02）；新部件作为门、窗、楼梯节点的 `part`（`lining`、`casing`、`sill`、`board`、`tread`、`stringer`、`rail`），不加新的节点种类。

### 2.1 门

| 部件 | 尺寸 | 账本 rule |
|---|---|---|
| 门扇 | **不变**：40 mm（`LEAF_MM`，`build.ts:71`），关着时从铰链侧门洞到对侧门洞，在墙中线上 | `door-leaf-40`（已有） |
| 门框（筒子板，贴在门洞两侧面与顶面） | 沿墙方向厚 `l = clamp(round(0.1·t), 12, 25)`；在墙厚方向分两半，`[−t/2, −20 mm]` 与 `[+20 mm, +t/2]`，中间留一道门扇厚的槽（门扇落在框的企口里）；两腿 `[e + sill, e + head]`，顶板 `[head − l, head]` | `door-lining-default` |
| 门套（贴脸，两侧墙面上） | 宽 `c = clamp(round(0.35·t), 50, 90)`，凸出墙面 `p = clamp(round(0.1·t), 10, 20)`；两腿从门洞边向外 `c`，从楼面到 `head + c`；顶条横跨 `[门洞0 − c, 门洞1 + c]`，`[head, head + c]`；顶条高过墙顶（或楼上楼板底）就截在那里，门头已在墙顶时不做顶条 | `door-casing-default` |

为什么门框分两半而不缩短门扇：门扇保持今天的长度与位置，就与核心的 `doorLeaves` 画的门扇一致（ADR 0030 决定 7 的对照不受影响），默认路径（关着的门）上门框与门扇也没有任何体积重叠。`--doors plan` 开着时，铰链处开启的门扇与开启侧那半片门框有约 20 mm 的内部交叠，看不见，且不在默认路径上（接受，PR 里写明）。

按门的种类：`barn` 的门板挂在哪一面（核心的 `swing`），那一面不做门套；`garage` 只做门框，不做门套；`opening`（无门扇的门洞）门框与门套照做，门头在墙顶时都不做顶部件；弧墙上的门（`cutSector`）门框沿 `sectorBand` 做，不做门套（`door-casing-omitted`，带原因）；门套的一条腿若会进入同层另一面墙的墙体多边形（门离墙角太近，即核心 `W_DOOR_NEAR_CORNER` 那种），就不做那条腿（`door-casing-omitted`，原因 `corner`），不缩短。

### 2.2 窗

| 部件 | 尺寸 | 账本 rule |
|---|---|---|
| 窗框、玻璃 | **不变**：40 × 60 mm 框、16 mm 玻璃，在中线上（`build.ts:72`–`:74`） | `window-frame-40x60`（已有） |
| 外窗台（无楼面的一侧） | 厚 `clamp(round(0.15·t), 20, 40)`；伸出外墙面 `0.2·t`、两端各越过门洞 `0.2·t`，与核心 2D 的窗台（`src/elements/window.ts:43`–`:44`，`SILL_PROJECTION`、`SILL_HORN`）同比例；进深从窗框外面（中线外 30 mm）到外墙面外 `0.2·t`；坐在墙的窗台块上，`[sill, sill + 厚]` | `window-sill-exterior` |
| 内窗台板（有楼面的一侧） | 厚 `clamp(round(0.1·t), 18, 30)`；伸出内墙面与两端越过门洞各 `clamp(round(0.1·t), 15, 30)`；进深从窗框内面到内墙面外伸出量；`[sill, sill + 厚]` | `window-board-interior` |
| 洞口侧面（内半边的两侧与顶） | 厚 `clamp(round(0.075·t), 10, 20)`，从窗框内面到内墙面，颜色同窗框 | `window-reveal-lining` |

越过门洞的宽度跟核心**画出来的**那一个：`window.ts:549`–`:551` 用宿主墙自己的 `t`（`SILL_HORN * t`）；`:492` 的 `max(t, corner.other.thickness)` 是 `measures()` 报给预算与范围检查的上界，不是画出的宽度，3D 不跟它。转角窗（`_corner`）在转角那一端不越过门洞，止于两墙内外角连线（核心 `:551`–`:555` 的 "past the jamb by the horn, or on the mitre"），另一端照常越过 `0.2·t`；内窗台板同理。

哪一侧是"外"：与核心画 2D 窗台同一条规则，离墙两面各一个墙厚处探点，看落不落在本层某个房间的环或 `void` 里（`window.ts:182` 的 `exteriorNormal`，`src/geometry.ts:619` 的 `wallFaceProbes`），3D 用 Scene3D 的楼面与空洞多边形照做。恰有一侧有楼面才有内外窗台；两侧都有（室内窗）只做两侧的洞口侧面，没有窗台；两侧都没有（独立墙）什么都不加。`sill 0`（落地窗）不做外窗台与内窗台板。弧墙上：洞口侧面沿 `sectorBand` 做，窗台只做切口以内的部分，不伸出、不越过门洞（`window-sill-curved-inside-cut`）。RM8.6 不碰核心，所以这条规则在 3D 里重写一份；为防两边分家，加一条测试：对语料里每扇窗，3D 认定的外侧与核心 SVG 里窗台鼻子所在的一侧一致。

### 2.3 楼梯

| 部件 | 尺寸 | 账本 rule |
|---|---|---|
| 踏步板 | 厚 `clamp(round(0.25·r), 30, 50)`，顶面在今天每级的高度上（`stair.ts` 的 `z0 + round(rise·k/R)`）；前缘外挑 `clamp(round(0.1·g), 15, 30)`，第一级不外挑；横跨整条梯段带 `W_f` | `stair-tread-default` |
| 踢面 | 开敞，不做 | `stair-open-riser` |
| 斜梁（两条，在梯段带两边） | 宽 `clamp(round(0.05·W_f), 40, 60)`；截面是平行于踏步前缘连线的一条带，上沿高出连线 `clamp(round(0.3·r), 40, 60)`，下沿低于连线 `clamp(round(1.2·r), 150, 250)`，截到 `[z0, 顶]` 与 `[0, run]`；用 `stair.ts` 已有的 `sideways` 横向拉伸 | `stair-stringer-default` |
| 平台 | 保持实心方块 | `stair-landing-solid` |
| 栏杆（每个敞开的边） | 梯段上扶手顶在踏步前缘连线上方 900 mm（竖直量），扶手 50 × 50；每级一根立杆，边长 `clamp(round(0.03·W_f), 20, 30)`；梯段两端各一根望柱，边长 `clamp(round(0.06·W_f), 60, 90)`，高出扶手 100 mm；平台敞开边扶手高 1000 mm，立杆间距取 `g` | `stair-balustrade-default`；每条边一行 `stair-balustrade-side`（`wall` 或 `open`） |

这些高度是制图默认值，不是规范校核，账本与 PR 里都不写"合规"。哪一边敞开从形状求：梯段带每条长边在梯段中点向外 100 mm 探点，落在本层任何墙体多边形（`Wall.body`）或柱里就是靠墙的一边，不做栏杆；否则做。上层楼板洞口边的护栏不做（`stair-void-guard-omitted`）。账本的 `stair-solid-default` 换成上面各行。

### 2.4 树冠与懒人沙发的平滑截面

`profile` 是沿一个轴拉伸的截面（§0），拿它做不出回转的树冠：沿一个轴拉伸只得到一条"面包"。推荐在 `t0-kit.ts` 加一种部件"放样"（【协调者定】）：按一张 `[t, f]` 表（就是今天 `dome` 用的 `CROWN`、`MOUND`、`HEMI`、`LOBE`），在每个高度放一圈同一截面（`round` 的 16 边形，或 `box`、`radius`），按 `f` 关于框心缩放，相邻两圈对应点连成四边形，底圈与顶圈封口，得到一个封闭壳。性质：圈与圈之间是斜面，轮廓不再是台阶；点都来自同一张精确的 16 边形表，所以对四分之一转与镜像精确对称，不产生手性；三角形数比今天的叠层少（每层叠层是一个各带两个盖的独立棱柱）。"`profile`"在本文里指这张轮廓表。

用放样的：`tree`、`shrub`、`plant` 的树冠，`bean_bag` 的两部分。`conifer` 保持 16 层（层层收窄读作枝轮，是有意的样子），`palm` 的叶不动。这一项单独一个提交或 PR：laneway 里没有这些家族，所以 laneway 的 Mesh3D 与 GLB 不动（这正是 backlog VA.1 的门禁），其余有树的图（如 hillside-villa）的关键帧与资产移动。高度、材质不变，不加账本行。RM8.9 的凉亭顶（四坡）用同一种放样，截面取 `box`，最后一圈缩到一点。

### 2.5 手性

1. 门框、门套、窗台、洞口侧面关于门窗的中心沿墙方向对称，不带手性。
2. 只在一侧的东西读核心已经定好的事实，不另行推断：门的铰链与开启侧来自核心的 `leaves`；`barn` 的挂板面来自 `swing`；窗台的内外来自与核心同一条楼面探测规则。
3. 栏杆的边从形状探测求出，平面镜像后探测结果随之镜像（等变）；测试：一张夹具与它用 `place … mirror` 镜像出的副本，栏杆在镜像的那一边。
4. 家具的手性只从核心 Plan JSON 的 `mirror` 来（V-D3，`T0_HANDED`、`handedAt`，`t0.ts:139`、`:146`）；放样的树冠与懒人沙发保持镜像对称，不进 `T0_HANDED`。

### 2.6 动的钉子，建议的拆法

先合 §2.4（laneway 不动），再合 §2.1–§2.3（laneway 有门窗：Mesh3D 与 GLB 两个 SHA-256 按 V-D5 带理由移动，账本多出各行；关键帧按 CI 打印值重钉；资产重生成）。two-storey 有楼梯，它的关键帧随 §2.3 动。

**与卡不符之处**：卡说"树冠与 `bean_bag` 用 `profile` 平滑截面"，但 `profile` 是拉伸截面，做不出回转体；本文改为放样，`profile` 只作轮廓表的名字。

---

## 3. RM8.7 · 地面材质

### 3.1 名字与冲突

| 暂定名 | 冲突 | 推荐终名 | spec 成本 |
|---|---|---|---|
| `timber` | 无。3D 的地面饰面 `FLOOR_FINISHES` 已有 `timber`（`materials.ts:119`），正好一一对应；与 `deck`（室外木平台）在 2D 上用不同图案区分 | `timber` | 7 |
| `carpet` | **真冲突**：`carpet` 是 `rug` 家族的别名（`fixtures-glyphs.ts` 的 `["rug", "carpet"]`）。两者在语法上位置不同，解析不会混，但（1）`sheet text` 的键同时含地面图案名与全部家具词（`sheet-text.ts:81`），`carpet` 会成为同一个键指两样东西；（2）图例里会出现一条"carpet"图案行与一条地毯家具行；（3）读者与代理分不清"整屋铺满"与"一块地毯" | `carpeting`（满铺地毯）。写了 `floor carpet` 的人得到现有的未知地面词警告，警告逐个列出已知词，`carpeting` 在其中；但"did you mean"提示不会给出它（`closest` 只认编辑距离 ≤ max(2, 词长/3)，`src/expr.ts:1139`，`carpet` 到 `carpeting` 是 3）。若要这条提示，备选 `carpeted`（距离 2，成本 9） | 10 |
| `stone` | `stone` 在 `NEAR_WORDS`（钉的是"它不是家具词"）里，也是 `FIXTURE_MATERIALS` 的材质名。逐个看：（1）`NEAR_WORDS` 断言的是 `FIXTURE_CATEGORIES` 不含它，地面词不进那张表，断言照旧成立；`inline:near-words` 那一行用的是 `furniture stone … label "stone"`，地面词不改变它的任何字节；（2）材质名不是语言关键字，只是 `rendered` 的色表与 3D 槽位的键，地面 `stone` 若要上色正好读同名材质，同一个词同一种颜色，是好处；（3）家具词的拼写提示：`stone` 与最近的家具词 `stove` 差 2，5 字符的词只许差 1，不提示 | `stone` | 6 |
| `sand` | 与家族 `sandpit`（别名 `sandbox`）意思相近：前者是一片沙地，后者是带边框的沙坑，都留着。它要进 `KEYWORDS.enum`，于是编辑器里任何位置的 `sand` 都按枚举值着色（外观上的事）。地面种类不进家具的拼写提示，所以与 `NEAR_WORDS` 的 `stand` 差 1 无关 | `sand` | 5 |
| `soil` | **卡没提到**：`soil` 也是 `FIXTURE_MATERIALS` 的材质名（`fixtures-glyphs.ts:368`，沙坑、种植池的第二材质）。同上，材质名不是语言关键字；3D 正好用同名槽位的颜色。与已有的 `planting`（覆盖树皮屑的种植区，`MULCH_CHIPS`）区分：`soil` 是裸土 | `soil` | 5 |
| `stepping` | 一条踏步石小路是一组物体，不是一片地面：图案的模数随图纸比例变（`hatches.ts` 的 `c.gap` 由 `refDim` 或纸面毫米推出），3D 无法画出与 2D 同一组石头，只能涂一种颜色；它更该是一个家族（石头是占地的分数，2D 与 3D 同源） | **不做地面种类**；改作 §4.3 绿植与庭院提案里的家族 `stepping_stones`（无目录占地，成本 0） | 0（若坚持做种类：9） |

**RM8.7 的 spec 成本**：`room` 行 7 + 10 + 6 = 23，`outdoor` 行 5 + 5 = 10，合计 **33**（卡按六个暂定名估 39；去掉 `stepping` 少 9，`carpet` 改名多 3）。

### 3.2 图案（裸图案，线色是主题的 `pocheHatch`）

五个新图案分两处去，都与已有的图案共用一张 `META`（`hatches.ts:280`）：

- **`sand`、`soil` 进 `GROUND_MATERIALS`**，各加一行 `GROUND_SWATCH_FRAME`（图例小样的取景）。这是 `outdoor` 的本来路子：`GROUND` 表的 `material` 一栏写的就是 `GROUND_MATERIALS` 里的名字（`outdoor.ts:133`），图例与 DXF 都从那里来。它们不进 `FLOOR_MATERIALS`。
- **只有 `timber`、`carpeting`、`stone` 进 `FLOOR_MATERIALS`**。它们的图案既不是墙材料，也不是任何 `outdoor` 种类的填充，所以放在 `META` 旁边的一张"仅地面"小表里（例如 `FLOOR_PATTERNS`），各带一行图例取景（`GROUND_SWATCH_FRAME` 的键类型扩到这张表）。不放进 `KNOWN_MATERIALS`：那会让 `wall … material stone` 合法，并让 `wall` 行的 spec 变长。不放进 `GROUND_MATERIALS`：那张表的意思是"某个 `outdoor` 种类的填充"，测试按这个意思数它（`test/outdoor.test.ts:427` 断言一张写满各种类的图，图例小样恰为 `GROUND_MATERIALS.length + 1`），三个室内地面词放进去，这个计数就不再是种类的计数。`:340`、`:354` 两处扫的是图案本身的性质（不画底色、瓦片首尾相接），"仅地面"小表也该满足，RM8.7 把这两处扩到它。`sand`、`soil` 进 `GROUND_MATERIALS` 后，`:420` 那张图的种类清单要加上这两个种类，计数才仍然成立。

两处都进 `sheet-text.ts` 的 `vocabularyKeys`（`GROUND_MATERIALS` 已在，"仅地面"小表新加），图例行可以改名。所有新图案：不画底色，不读随机数（位置都是冻结的分数表），每个尺寸是 `c.gap · k · c.scale`，`test/model-range.test.ts` 的瓦片上限照样覆盖。墙材料（`poche`、`concrete`、`brick`、`insulation`、`tile`）的图案一个字节都不动（`.claude/rules/glyphs.md`）。

| 词 | 图案 | 与相近图案的区别 | DXF 名（提议，执行者对照 `acad.pat` 核） |
|---|---|---|---|
| `timber` | 人字拼：块 0.5 × 2 模数，相邻块互相垂直，自然角度 45° | `deck` 是 1.25 模数宽的直铺长板 | `AR-HBONE` |
| `carpeting` | 规则方格上的细点，间距 0.8 模数（簇绒） | `tarmac` 的点稀而不规则；`planting` 是碎屑与点混合 | `CROSS` |
| `stone` | 毛石层砌：三皮高度不等（冻结的分数），每皮竖缝错开 | `paving` 是 5 模数的等方格，`tile` 是细网格，墙的 `brick` 是等高皮 | `AR-RSHKE` |
| `sand` | 密而细的两种大小的点（冻结表，每 2 模数瓦片 14 点） | `tarmac` 每 2.6 模数瓦片 5 点、一种大小 | `AR-SAND`（与 `tarmac` 同名；DXF 名只是给 CAD 的提示，可以共用） |
| `soil` | 三条短平行线成一组，横组与竖组棋盘交替 | `deck` 的线贯通，`paving` 是网格 | `EARTH` |

`outdoor` 新种类在 `GROUND` 表各加一行：`sand` 底色 `paving`、图层 `SITE_LAYER`；`soil` 底色 `paving`（裸土是暖灰，不是 `lawn` 的绿）、图层 `PLANTING_LAYER`。只用现有三个主题键，主题值不改。

### 3.3 `rendered` 主题下的浅色块 —— **【所有者裁定】**

**状态：已裁定（RM-D28，2026-11-12，受托，所有者可一句话推翻）：采用读法甲，附硬条件——图案线 `pocheHatch` 对地面浅色的对比不低于 2.0:1**（今天 `roomFill` 上是 2.28:1；下面草案里的三个色值只有 1.66–1.87:1，所以要另调一组更浅的地面色，一条测试按 WCAG 相对亮度守住下限）；只在 `rendered`，其余主题逐字节不变；ADR 0023 已加 2026-11-12 修订。下面保留当时摆出的两种读法与数字。

**要裁的做法**：只在 `rendered` 主题下、只对作者写了新地面词的房间，把房间楼面多边形自己的填色从 `theme.roomFill` 换成 `materialTints` 里同名材质的颜色：`timber` → `wood`，`carpeting` → `wool`，`stone` → `stone`（对照表放核心，与 `FIXTURE_FAMILY_MATERIALS` 同理，3D 也读它）。不加新的主题键（ADR 0023 修订写明 "no new theme directive key"），不加图元（换的是已有楼面多边形的填色，房间的 `drawCost` 不变）；旧的四个词不上色，所以任何主题下已有的图都逐字节不变。

**ADR 0023 反对它的完整理由**（"Alternatives rejected" 一栏）是两条："Floor-material tints under furniture or rooms: a fill implies a material the source never named, **and it competes with the ground textures that do name one**." 2026-11-04 的修订（所有者的 V-D1）在 "Why only one theme" 里重复了第二条："The ground textures that name a material compete with any fill, and a construction or line print reads best untinted"。这里要裁的浅色正好铺在一个地面图案的下面，就是第二条说的那种互相争抢。

两种读法，并列给所有者：

- **读法甲：可以做。** 第一条不成立：材料是作者用 `floor` 写出来的。第二条在 `rendered` 里本来就已接受：`rendered` 是唯一允许填色的主题，修订放开它，正是因为"给客户的展示板是颜色有帮助的地方"；`outdoor` 的地面今天在每个主题下都是"底色加图案"（`GROUND` 的 `tint`），室内地面在 `rendered` 里同样做，是同一种画法。图案线色与底色的对比用下面的检查守住。
- **读法乙：不做。** 第二条是针对任何主题的：图案已经说出了材料，再铺一层颜色，图案的线就被底色吃掉一部分，图纸更难读；修订放开的只是家具符号，没有放开地面；`outdoor` 的底色是地面元素自己的颜色，不是"材料的色"。按这个读法，三个词在 `rendered` 下也只画图案。

**若采用读法甲，同 PR 加一条对比检查**（与 `test/rendered-theme.test.ts` 量家具符号描边对填色"至少 3:1"同法，按 WCAG 相对亮度算）：`rendered` 的图案线色 `pocheHatch` 在每个地面浅色上的对比，不低于它在 `roomFill` 上的对比的某个比例。2026-11-11 用 `src/theme.ts` 的 `rendered` 值算的现状：`pocheHatch` `#b9a98f` 在 `roomFill` `#fffefb` 上是 2.28:1；在 `wood` `#ead9c0` 上 1.66:1，`wool` `#efe7da` 上 1.87:1，`stone` `#e6e3dd` 上 1.79:1。也就是说，按今天的色值，图案线的对比下降 18–27%。检查的门槛（例如"不低于 `roomFill` 上的 80%"，今天 `wood` 不过；或"不低于 1.5:1"，今天三个都过）连同是否为地面另调一组更浅的色值，也是所有者裁定的一部分。这里的对比是地面纹理（ADR 0023 决定 1 的第五级，最淡的一层），不是文字，WCAG 的 4.5:1 不适用。

### 3.4 3D 的颜色来源

3D 读作者写的 `floor` 的取数路径由 `plan-json-scope.md` 与 RM3.1 一起定（`floor` 今天在 `PlanJsonDroppedClause` 里），本文只定颜色。对照表以核心的 `NonNullable<RRoom["floor"]>` 为键（`RRoom` 已从 `src/index.ts:490` 导出），核心再加一个词，3D 这边类型检查就红，与 `GROUND_TINT` 按 `ROutdoor["surface"]` 取键同法：

| 地面词 | 3D 颜色 | 出处 |
|---|---|---|
| `timber` | `FINISH_PALETTE.timber` | `materials.ts:124`（与按 `uses` 默认的木地板同色） |
| `tile` | `FINISH_PALETTE.tile` | `materials.ts:125` |
| `carpeting` | `PALETTE.wool` | 与 `rendered` 的 `wool` 同一材质名（V-D2） |
| `stone` | `PALETTE.stone` | `materials.ts:69` |
| `deck` | `PALETTE.wood` | 与室外 `deck` 的 `GROUND_SPLITS` 同 |
| `paving` | 与室外 `paving` 同色：默认主题的 `paving` 底色按 `GROUND_WASH` 叠六次（`#ab9f87`），在模块加载时算一次，写成 `FINISH_PALETTE` 的一个静态项 | `materials.ts:176`、`mesh/outdoor.ts`；见下面 GLB 一段 |
| `concrete` | 新的饰面色一项，PR 里定值 | 进账本 |

**GLB 里的地面颜色只能是静态的饰面表。** 室外地面在 GLB 里读节点自带的 `extras.colour`（`glb/write.ts:70`–`:80`），楼面不读：楼面的材质名是 `floor:<finish>`（`:57`），颜色直接取 `FINISH_PALETTE[finish]`（`:81`）。所以每个地面词都要映射到 `FLOOR_FINISHES` 里的一项，`FINISH_PALETTE` 有它的静态颜色；`paving` 不能像室外那样把主题算出的颜色挂在节点上，只能把那个算出的值在加载时冻结进 `FINISH_PALETTE.paving`，查看器与 GLB 于是读同一个数。`carpeting`、`stone`、`deck` 同理：`FINISH_PALETTE` 新增的项直接引用 `PALETTE.wool`、`PALETTE.stone`、`PALETTE.wood` 的值。暗主题下查看器照旧经 `finishColour` 变暗（`materials.ts:276`），GLB 只有亮色一套。

新 `outdoor` 种类：`GROUND_TINT` 各加一行（都是 `paving`），`GROUND_SPLITS` 加 `sand` → `SITE_PALETTE` 新增的 `sand` 色，`soil` → `PALETTE.soil`（已有槽位，与沙坑、种植池的土同色）。每项按 `outdoor-colour-3d` 进账本。没写 `floor` 的房间照旧按 `FLOOR_FINISH_RULES`；规则本身不改（会动每张有房间的图的 Mesh3D 与 GLB）。GLB 的 `floor:<finish>` 材质随 `FLOOR_FINISHES` 增加（`glb/write.ts:57`）。

### 3.5 字节恒等律要写明的几处

"不用新词的图诊断逐字节不变"有两处例外要写进律的说明（RM8.7 的评审补上第二处）。第一处：未知地面词的警告把已知词逐个列出（`room.ts:194`），提示也按最近的词给；`outdoor` 不认识的种类同理（`src/elements/outdoor.ts:268` 的 "available: …"）。所以一张写了**错**的 `floor` 或 `outdoor` 词的图，即使没写任何新词，它的诊断文字也会变。律的语料里没有这样的图（`examples/**` 没有 `floor` 子句）；PR 用 grep 证明语料里没有，再加一个单测把新的警告文字钉住。第二处：五个新词同时成为 `sheet text` 的键（`src/sheet-text.ts` 的 `vocabularyKeys` 含 `GROUND_MATERIALS` 与仅地面图案表），所以写错的键（`sandd`）的"did you mean"可能给出新词，而 `sheet text { timber "Holz" }` 以前是 `E_PARSE`、现在能编译；后者算写了新词（律的第三种形式），前者与写错的地面词同样处理：律的语料里没有，单测钉住新文字。`KEYWORDS.enum` 多两个词（`sand`、`soil`），它们进 `UNRESERVED_KEYWORDS`，OpenPlan3D 导入器照旧保留拼成这两个词的 id；`arch manifest` 的输出与三套编辑器语法随 `gen:*` 变，这是加性的。

**与卡不符之处**：卡没提 `soil` 也是材质名；`stepping` 做不成与 2D 一致的 3D；卡的 39 单位按 `carpet` 原名算。

---

## 4. RM8.9 · 新家族首批

### 4.1 十二个家族的终名

| 卡里的词 | canonical | 别名 | 目录占地（along × depth，mm） | spec 成本 | 3D 默认（高度；挂法） | 材质（主、次） |
|---|---|---|---|---|---|---|
| 空调内机 | `wall_ac` | `split_ac`、`air_conditioner`、`ac_indoor` | 900 × 250；`requiresWall`、`overhead`（虚线，同 `mirror`，`fixtures-catalog.ts:594`）、`fixedAspect`、`directional` | 8 | 下沿挂 2100（= `DOOR_HEAD`/`WINDOW_HEAD`，`src/datum.ts:61`、`:67`，在门窗顶之上），高到 2400，`STOREY_HEIGHT` 3000 之下 | appliance |
| 空调外机 | `condenser` | `ac_outdoor`、`outdoor_unit`、`heat_pump` | 850 × 350；`directional` | 10 | 落地，700 | appliance、metal |
| 冷柜 | `chest_freezer` | 无（裸词 `freezer` 留空：立式冷柜的样子是冰箱，同 `rack` 不作 `server_rack` 别名的理由） | 1100 × 650；`directional` | 14 | 850 | appliance |
| 酒柜 | `wine_fridge` | `wine_cooler` | 600 × 600；`directional`；台下式，不 `tall` | 12 | 850 | appliance、glass |
| 展示柜 | `display_cabinet` | `vitrine`、`curio_cabinet` | 1000 × 400；`directional`、`tall` | 16 | 1900 | wood、glass |
| 屏风 | `folding_screen` | `room_divider`、`privacy_screen`（裸词 `screen` 是材质名，不用） | 无（自由摆放，不靠墙；成本 0） | 0 | 1700 | wood、fabric |
| 贵妃榻或日床 | `daybed` | `day_bed` | 2000 × 900 | 7 | 750（靠背） | fabric、cushion |
| 泳池 | `pool` | `swimming_pool`、`plunge_pool` | 无；`symmetric` | 0 | 池沿 `[e, e + 50]`，水面在池沿内 `e + 20`，不下挖（地面平面在楼面标高，下挖的池体会被它挡住）；账本 `pool-water-at-grade` | stone、water |
| 院门 | `garden_gate` | `yard_gate`（裸词 `gate` 不用，见 §4.2） | 无 | 0 | 1200，两扇 | wood |
| 凉亭 | `gazebo` | `pavilion`、`garden_pavilion` | 无；`symmetric` | 0 | 3000（柱 2400，四坡顶用 §2.4 的放样） | wood |
| 温室 | `greenhouse` | `glasshouse` | 无 | 0 | 2400（檐 1800，双坡顶用 `profile` 横向拉伸的五边形截面，正是 `profile` 的本义） | metal、glass |
| 墙上挂画 | `wall_art` | `artwork`、`painting`、`picture` | 900 × 50；`requiresWall`、`overhead`、`fixedAspect`、`directional` | 9 | 按上沿挂（与电视同一机制 `T0_HUNG_FROM_TOP`），上沿 1900，画高 `clamp(0.75·宽, 300, 1000)`：900 宽的画在 1225–1900，中心约 1560，接近 1.5 m 的视线高；逐件进账本 `furniture-mount-from-top` | wood、paint |

**挂墙物的默认挂高**（RM8.9 只有两种）：按下沿挂的空调内机 2100；按上沿挂的挂画 1900。两者都高过平面的剖切高度，所以 2D 画虚线（ADR 0023 决定 4），与 `mirror`、吊柜一致；`overhead` 也让它们不与下面的家具判碰撞。

关于"贵妃榻"：`chaise` **已经是一个家族**（`fixtures-glyphs.ts` 的 `["chaise"]`，占地 1600 × 800，`fixtures-catalog.ts:694`，3D 有手性，`T0_HANDED`）。所以本批只加 `daybed`（三面有靠的床式坐榻，关于宽度对称，手性 `"none"`），不再加贵妃榻。

所有新材质都在现有的 `FIXTURE_MATERIALS` 里，不需要核心先加材质（`test/material-vocabulary.test.ts` 不动）。手性：除屏风（偶数扇的折线，左右对称，前后不对称，手性仍是 `"none"`）外都按对称或仅前后有向来画；空调外机的风扇画在正中（实物多偏一侧，偏了就有手性，按规则画成对称）。

**不进 `src/furnish-table.ts`**：`finish` 按房间与用途配家具，新家族进了那张表，`finish` 对语料的输出就会变。

### 4.2 院门与 `fence` 推迟的门

`fence` 的头注释写"A gate is a real thing and it is deferred BY NAME rather than approximated by letting a `door` host onto a fence"（`src/elements/fence.ts:10`），spec 的 `fence` 行也写着 "(a gate is deferred by name)"。日后的围栏门会是 `fence` 语句里的一个子句（在围栏线上开口），那里最自然的词就是 `gate`。所以：

- 家族的 canonical 取 `garden_gate`，别名不含裸词 `gate`，把 `gate` 留给日后的围栏子句；`gate` 进本批律的近义词名单（§4.4）。
- 院门是放在围栏缺口里的物体：作者把围栏写成两段，在缺口处放 `garden_gate`（`at` + `rotate`）。它不进访问图（家具本来就不进），正合 `fence` 头注释不让门宿主到围栏上的理由。`docs/furniture.md` 用文字说明这个写法。
- 2D 画两扇关着的门扇加各自的开启弧，左右对称；占地的 depth 是半扇门宽（开启弧的半径）。3D：两根门柱、两扇门板。
- `fence.ts` 的头注释加一句指向 `garden_gate`（代码注释，不花 spec）；spec 那句不改。

### 4.3 绿植与庭院的补充 —— **提案，交所有者选**

**状态：已裁定（RM-D29，2026-11-12，受托）：四个全批准，别名 `climbing_plant`、`indoor_tree`，spec 15 单位，并入 RM8.9 的清单（十二个变十六个）。**

所有者 2026-11-11 问到更多绿植。现有的植物家族（`CANONICAL_FIXTURES`）：`plant`（别名 `planter`，3D 是 1.1 m 高的盆栽，`t0-outdoor.ts:281`）、`tree`、`conifer`、`shrub`、`hedge`、`palm`、`flower_bed`、`raised_bed`，加上地面的 `lawn` 与 `planting`。缺的是：

| 提案 | canonical（别名） | 缺什么 | 目录占地 | spec 成本 | 3D 默认 | 材质 |
|---|---|---|---|---|---|---|
| 攀援植物与花架 | `climber`（`climbing_plant`） | 靠墙或靠栏的垂直绿化，今天没有 | 1200 × 300（靠墙放，`wallMounted`） | 8 | 木格架加贴着它的叶团，2400 | foliage、wood |
| 竹丛 | `bamboo` | 中式庭院最常见的一种，沿院墙成排 | 2000 × 600（与 `hedge` 同，`fixtures-catalog.ts:488`） | 7 | 4000，细竿加高处的叶团 | foliage |
| 大型室内盆栽树 | `potted_tree`（`indoor_tree`） | `plant` 的高度固定 1.1 m，不随占地变，客厅里 2 m 的琴叶榕一类今天画不出 | 无 | 0 | 2000：盆、可见的树干、树冠（§2.4 的放样） | foliage、ceramic |
| 踏步石小路 | `stepping_stones`（无） | 从 RM8.7 移来（§3.1）：石块是占地的分数，个数是长度的夹取函数，2D 与 3D 同源 | 无 | 0 | 30 mm 厚的石板 | stone |

若采纳 `climber`：它是第七个 `wallMounted` 家族，`src/fixtures-catalog.ts:187`–`:195` 那段注释（"a radiator, a fireplace, a TV, an EV charger, a towel rail or a whiteboard … Set on exactly those six families"）要同 PR 改成七个并列出它，否则注释与表不符。§4.1 的十二个都不设 `wallMounted`（`wall_ac`、`wall_art` 照 `mirror` 设 `requiresWall` 与 `overhead`），所以那段注释只在 `climber` 进来时才动。

不提议：挂顶的吊篮（挂顶物不在本批，MF14）；`planter_box`（在 `NEAR_WORDS` 里，钉的就是"它不是家具词"）；`vine`（与 `pine` 只差 2 个字符，又可指葡萄藤）。提案的四个都只用现有材质，都按对称画。

**提案的 spec 成本：15**（只有前两个带占地）。

### 4.4 本批的字节恒等律怎样与 V8 的律共存（【协调者定】）

**V8 律的测试文件只改一处。** `test/new-families-byte-identity.test.ts:123`–`:125` 断言 `CANONICAL_FIXTURES.length` 等于 103、最后一个新词是 `desk_pod`，第 104 个家族一加就红。改法比原断言更强而不是更松：把计数换成"第 84–103 个家族逐个等于一张冻结的 20 个名字的表"，`NEW_WORDS` 截到这 20 个家族的词为止。行、基线、扫描一字不改。

**V8 的取行代码一个字节都不动。** `test/helpers/new-families-law.ts` 的 `inlineRows` 与 `familiesLawRows` 读的是模块常量（`FAMILIES_BEFORE = 83`，`:36`；`NEAR_WORDS`，`:44`；`inlineRows` 在 `:66` 用前者截表，在 `:79` 用后者），不能直接拿来量 103 个家族；而 V8 测试的头注释写明基线是"by THIS law's body (`test/helpers/new-families-law.ts`)"在 `8233acc4` 上量出来的，改这段代码就等于换了量具。所以本批的律放在一个**新模块**（例如 `test/helpers/families-law-rm89.ts`），它：

1. 照旧 import V8 模块里与家族数无关的部分：`perThemeDigests`、`familiesLawDigest`（摘要算法，两条律用同一个摘要体，不另写一个长得像的）与 `FamiliesLawApi`、`FamiliesLawRow` 类型。
2. 示例行复用 V8 的 `familiesLawRows(root, CANONICAL_FIXTURES)`，只取其中 `examples/` 开头的行（V8 的两条内联行丢掉），这样两条律的示例行是同一段代码列出的同一组文件。
3. 自己定义参数化的内联行：`inlineRowsFor(families, before, nearWords, tag)`，用 `before = 103`、本批的近义词（`gate`、`freezer`、`screen`、`divider`、`art`，各是带 `label` 的矩形），生成 `inline:families-before-rm89-legend`（103 个家族在一张带图例的图上：每行 12 个，`paper A1`、`scale 1:50`，与 V8 同一排法）与 `inline:rm89-near-words`。参数化只在新模块里；V8 模块不改成调用它，免得它的函数体变了。
4. 自己的测试文件（例如 `test/rm89-families-byte-identity.test.ts`）照 V8 测试的结构：一条前提用例（扫描同一组目录，找本批新词，读 §5.2 的同一张展示图名单），一条"表钉住每一行"，每行一条用例。

**103 个家族的基线怎样量**，照 V8 头注释的做法：在 RM8.9 合并之前，用 `git archive` 取出 `main` 的 `src/`、`examples/` 与 `test/helpers/`（那一刻的 `main` 就是"本批之前"），把那棵树的 `compile`、`describe`、`lint`、`THEMES.rendered`、`CANONICAL_FIXTURES` 与 `makeNodeWorld` 交给**新模块的这段代码**（不是一段看起来一样的代码，`test/helpers/byte-identity-digest.ts` 说了为什么），逐行量；分支上再量一次，两表逐行相同。先证明它能红：在一个没有示例画到的旧家族上种一个改动（V8 用的是把 `treadmill` 的圆角 0.05 改成 0.051），只有 `inline:families-before-rm89-legend` 一行动，其余不动；把这次试验写进新测试的头注释，与 V8 一样。基线所在的提交 SHA 也写进头注释。

近义词都带 `label`，所以 RM1.4 的拼写提示不会在那一行出现；PR 另用脚本证明语料里没有一个没写 `label` 的未知家具词离新词在提示距离以内（2026-11-11 的扫描：没有）。另一个要写进律的说明：`sheet text` 的可写键含全部家具词（`sheet-text.ts:81`），一张在 `sheet text` 里写了新词作键的图，诊断会变；语料里没有。

### 4.5 spec 成本合计与 PS7.9

| 项 | 单位 |
|---|---|
| RM8.7（`timber`、`carpeting`、`stone`；`sand`、`soil`） | 33 |
| RM8.9 的十二个家族（只有七个带占地：`wall_ac` 8、`condenser` 10、`chest_freezer` 14、`wine_fridge` 12、`display_cabinet` 16、`daybed` 7、`wall_art` 9） | 76 |
| **已定的合计**（RM8.7 + RM8.9） | **109** |
| 绿植（`climber` 8、`bamboo` 7；RM-D29 已批准，计入 RM8.9） | 15 |
| **含绿植的合计（已批准）** | **124** |
| 余量（#714 之后，spec 28,605 单位对上限 30,000） | 1,394 |

卡按"十二个都带占地、平均词长 9–10"估约 120，实际按占地只有 76；两张词表卡已定的部分合起来 109，算上绿植 124，在 PS7.9 之前的余量（143）里单看放得进，**现在 PS7.9 已合并（#714，28,605 单位，余量 1,394）**，124 之外还剩 1,270，五个 `[语法]` 形式（约 1,030，估计值，见 #714 的目标算术）和约 150 的余量都放得下。词表卡不再被 PS7.9 挡住；谁先合谁先占余量这一条仍然成立，但 RM6.1 的第一半（#721）已经花掉 319 单位。若要再省：`display_cabinet` 换成 `vitrine` 作 canonical（原名作别名）省 8。

**与卡不符之处**：`chaise` 已存在；卡对 RM8.9 成本的估算按"都带占地"，偏高。

---

## 5. RM8.5 · 展示示例怎样进入语料

### 5.1 现状

V8 律有两样东西，要分开看：**律本身**是"一张不写那 20 个家族任何一个词的图，在默认主题与 `rendered` 下，SVG、`describe()`、`lint()`、诊断与它们出现之前逐字节相同"，它的行是顶层 `examples/*.arch` 加两张内联图，基线在 `8233acc4` 量；**前提用例**扫描 `examples/**`、`docs/`（`docs/plans/` 除外）、`test/fixtures`、`eval`、`dataset`、`skills`、`playground/src`、`docs-site`（`public/` 除外）、`packages`（各包 `test/` 除外）、`editors/vscode/src` 与三个根文件，要求没有任何地方写 `furniture <V8 新词>`（`test/new-families-byte-identity.test.ts:133`–`:166`）。103 个家族里 42 个从没以 `furniture <词>` 出现在 `examples/**`：22 个是 V8 之前的（`oven`、`outdoor_chair`、`motorcycle`、`hot_tub`、`swing`、`pergola`、`sandpit`、`fire_pit`、`urinal`、`bunk_bed`、`crib`、`fireplace`、`sideboard`、`loveseat`、`chaise`、`tv`、`coat_rack`、`shoe_cabinet`、`filing_cabinet`、`locker`、`pool_table`、`treadmill`），20 个是 V8 那一批全部。

### 5.2 带理由的名单（律不放宽）

1. **只用 V8 之前的家族的示例，不需要任何豁免。** 推荐示例 A：一张带庭院的家宅，放顶层（建议名 `examples/courtyard-family.arch`），用上上面 22 个里适合住宅的 19 个（`urinal`、`filing_cabinet`、`locker` 不适合住宅）。它进 V8 律的语料完全合法：它不写任何 V8 新词，正落在律的陈述之内。它新增的那一行在分支上量、带注释，先例是 `examples/knob-flat.arch` 那一行（"new example (P4, the knobs example)"）；它在 `8233acc4` 不存在，没法在那里量，这一行从此钉住它不被 V8 的表改动。
2. **用 V8 新词的示例，不能是 V8 律的一行。** 它违反律的前提（"不写新词"），也没法在 `8233acc4` 上量。推荐示例 B（建议名 `examples/showcase/garden-courtyard.arch`）放在子目录：`familiesLawRows` 只读顶层 `examples/*.arch`（`new-families-law.ts:101`–`:104`），所以律的行与基线一个字节都不动。
3. **前提用例加一张封闭的豁免名单**（建议放 `test/helpers/` 一个常量，例如 `SHOWCASE_PLANS`，两条律共用），并同时断言四件事，免得名单成为漏洞：名单逐项精确、已排序；每项都在 `examples/showcase/` 下；每项都不在律的行里；其余每个文件照旧扫描。律的陈述不变，变的只是前提用例的覆盖面：从"所有已发布的平面"变成"所有已发布的平面，除了名单里按设计就写新词的展示图"。名单每加一项要在 PR 写理由。
4. **RM8.9 的词**：在 RM8.9 的律落地之前，展示图不写它们；落地之后，RM8.9 的前提用例读同一张名单。
5. **文档不出现展示图的源码。** `docs/` 与 `docs-site/` 都在扫描范围内：展示用生成的图（SVG、PNG、3D 小图放 `docs-site/public/`，不在扫描内）加一个指向 GitHub 上 `.arch` 文件的链接，不放 `arch` 围栏。`.claude/rules/docs-prose.md` 的那条规则因此照旧成立。
6. **playground 与 3D 资产按路径引用，不内联源码。** `playground/src/` 与 `packages/` 在扫描内；`packages/archlang-3d/scripts/gen-3d-assets.ts` 的清单（`:105` 起）只写路径，`docs-site/public/3d/manifest.json` 在 `public/` 下。
7. **规则文字同 PR 改。** `.claude/rules/glyphs.md` § Traps 第一条写着 "Show new families in prose, and examples with existing families"；名单落地时把它改成"…，除了 `SHOWCASE_PLANS` 里的展示图"，并引这张名单。

【协调者定】：子目录与豁免名单这条路改的是一个测试的前提用例和一条 `.claude/rules/` 文字，没有碰铁律或 ADR；但若协调者认为前提用例是律的一部分，就把第 2、3 条交所有者。另一条路是把示例 B 也放顶层、在 `familiesLawRows` 里按名单过滤，它要改律的取行代码（基线就是用这段代码在 `8233acc4` 上量的），不推荐。最保守的路是只做示例 A：V8 的 20 个家族只在 RM8.5 的样张目录图里露面，不进任何 `.arch`。

### 5.3 对其他字节恒等律语料的影响

- **示例 A（顶层）**：按顶层取样的测试大约 50 个文件（`exampleNames()`/`examples()` 的调用方，2026-11-11 grep），其中按示例取 digest 的表各多一行，在分支上量、带注释（不是重钉已有行）；`.claude/rules/examples.md` 列的那些会反应：`cursor-exhaustive`、`iso-snapshot`、`snapshot`、`visual`（新示例的新 golden 是新建，不是重新 bless）、`opening-tags-corpus`、`rooms-tiling-probe`、`taste-digests`、`intent-all-storeys`、各 `*-digests` 与 `*-byte-identity`（`test/` 下 21 个 `*-byte-identity.test.ts`，8 个 `*-digests.test.ts`）；3D 包的语料计数 37 → 38（`packages/archlang-3d/test/adapter-corpus.test.ts:7`，`mesh.test.ts`，`e2e/glb.e2e.ts`、`e2e/replay.e2e.ts`）。只有进了 README 或 docs 的才动 `example-svgs-drift`、`readme-permalink`、`docs-examples-figures`。
- **示例 B（子目录）**：顶层取样的测试都看不见它；递归取样的看得见：`test/helpers/corpus.ts` 的 `corpusFiles`/`walkFiles` 的约 11 个调用方（`drawing-budget`、`step-budget`、`label-placement-oracle`、`room-overlap-oracle`、`reachability-blind-spots`、`lint-index-superset`、`rooms-tiling-probe`、`vocabulary-equivalence`、`import-module-lets` 等）、`test/helpers/d4-oracle.ts`、`test/public-surface.test.ts`，以及 3D 包的 `test/corpus.ts`（它只进 `WORLD` 供 `import` 解析，`EXAMPLES_LIST` 只取顶层）。这些多是性质扫描，加一张图不需要新行；个别钉了计数的，PR 列出。代价：日后新形式的字节恒等律多按顶层取样，不会钉住示例 B；它由递归的预算与性质扫描、零 E 与 PR 里贴的 `arch lint --json` 守。
- `scripts/engine-digests.ts` 有自己的目录表（不递归，加 `examples/lib`），两张示例都不进，浏览器 digest 不动。
- 两张都要零 E；`hillside-villa` 那种预填链接预算与它们无关。

---

## 6. 汇总

### 6.1 需所有者裁定的事

两项都已由 2026-11-12 的受托裁定决定（`../README.md` §6.6：RM-D28、RM-D29；所有者可一句话推翻）。右栏是当时的默认，现在作废。

| # | 事 | 摆给所有者的 | 裁定之前（默认） |
|---|---|---|---|
| 1（已裁定：RM-D28，读法甲，对比 ≥ 2.0:1） | §3.3：`rendered` 主题下，作者写了 `timber`、`carpeting`、`stone` 的房间楼面用同名材质的浅色（扩大 ADR 0023 2026-11-04 修订的范围；ADR 的"不采纳"一栏两条理由都要面对，第二条"与说出材料的地面图案争抢"正是这里的情形） | 读法甲（做，加图案线对比检查）与读法乙（不做）并列；对比的现状数字与门槛选项在 §3.3 | 不上色：三个词在所有主题下只画图案 |
| 2（已裁定：RM-D29，四个全批准） | §4.3：绿植与庭院的补充（`climber`、`bamboo`、`potted_tree`、`stepping_stones`）要不要进 RM8.9 | 四个的缺口、成本（spec 15）与默认值 | 不进：RM8.9 只做 §4.1 的十二个 |

（§5.2 的豁免名单在协调者的读法下不需要所有者；若读作改律，就是第 3 项。）

### 6.2 交协调者的选择（本文的推荐）

阴影只在查看器里，账本加一行 `contact-shadows-viewer-only`（协调者已定，§1.2）；预算 +30% 帧时间与挂载耗时，量法是接进 `check:3d` 的 e2e 文件（§1.3）；门框分两半、门扇不变（§2.1）；窗台的内外按核心同一条探测规则在 3D 重写并加对照测试，越过门洞的宽度跟画出的 `SILL_HORN * t`（§2.2）；开敞踢面、按探测定栏杆边（§2.3）；放样代替 `profile` 做回转体，`conifer` 不改（§2.4）；`carpet` 改名 `carpeting`、`stepping` 不做种类（§3.1）；`sand`、`soil` 进 `GROUND_MATERIALS`，三个室内地面词进 `FLOOR_MATERIALS` 与一张"仅地面"图案表（§3.2）；地面颜色在 GLB 里走静态的 `FINISH_PALETTE`（§3.4）；十二个家族的终名与占地（§4.1）；`garden_gate` 不占裸词 `gate`（§4.2）；V8 律的计数断言换成名字表，本批的律放新模块、V8 的取行代码不动（§4.4）；展示示例 A 在顶层、B 在子目录加豁免名单（§5.2）。

### 6.3 与卡不符之处（集中）

- `PREVIEW_LIMITS` 已被 RM8.3 改写；卡的面清单漏了 `IsIsntTable.vue` 两处与 `docs-site/3d.md:52`（§1.5）。
- `profile` 是拉伸截面，做不出树冠（§2.4）。
- `soil` 也是 `FIXTURE_MATERIALS` 的材质名（§3.1）。
- `stepping` 作为地面种类，3D 画不出与 2D 一致的石头（§3.1）。
- 未知 `floor`、`outdoor` 词的警告列出已知词，词表一加，写错词的图诊断就变（§3.5）；`sheet text` 的键含全部家具词与地面图案名（§4.4）。
- `chaise` 已是家族（§4.1）。
- RM8.9 的 spec 成本按"只有带占地的家族花钱"算是 76，不是约 120（§4.5）。
