# 设计稿：首次接触缺陷的分类与判定（RM9.0）

**状态：** 2026-11-20 写成，基线 `main@dad33f02`（1.65.0 之后）。对应卡 RM9.0（`../cards.md` 第 11 轨），给 RM9.6 排队。本稿只写文档，不加任何规则。

**一句话：** RM1.1a 量出的 57 个缺陷分成 27 类：7 类（9 个）今天的默认 lint 已经报出；9 类（17 个）判为"加 lint"，按 §4 的顺序交给 RM9.6，其中几类要等出处读到才能加；11 类（31 个）判为"声明不查"，给出理由和公开的说法。

## 1. 读了什么，写了什么

- **读的材料：** RM1.1a 的审计记录、证据与六份最终平面，都在所有者本机（位置见 `../handoff.md` §6 RM1.1a 那一行）。缺陷的严重度（B / N / m）沿用那份审计。
- **公开仓库只写：** 类、计数和判定，以及候选规则与公开夹具的描述。审计原文、平面源码、平面上量出的尺寸和 brief 文字都不写进来，也不写作者身份（`AGENTS.md`；RM-D3）。下文的公开夹具是另行设计的通用形状，尺寸和布置都不取自私有平面。
- **等级：** 规则数字的出处等级取 `../cards.md` §0 的五值（`V`、`S-full`、`S-secondary`、`M`、`convention`）。只有 `V` 和 `S-full` 能进新规则或公开夹具（`README.md` 原则 10）。下文"无新数字"指规则只做几何判断（贴住、为零、不存在），不引进任何设计数字。规则要用一个数字、而这个数字的出处还没读到时，判定写成有条件的："读到 `V` 或 `S-full` 的出处就加 lint，读不到就不查"。
- **重跑：** 在 `main@dad33f02` 上用本地构建的 CLI（`node dist/cli.js`，`--version` 为 1.65.0）重跑六份平面：默认 `lint --json` 各一次，`--profile accessibility-advisory` 各一次，另用 `uk-`、`us-`、`cn-residential-advisory` 与 `residential-basic` 各跑一次。没有调用任何付费服务。每类"今天报不报"一栏都按这次重跑的实际输出填写，再对照 `src/lint/rules/` 的现有规则。`W_STAIR_RISER_TOO_HIGH`、`W_LABEL_PIECE_MISSING`、`W_DIM_THICKNESS_UNPLACED` 这三个代码在 `v1.60.0` 的错误目录里还没有，`main` 上有，都已核对。
- **四个居住 profile：** 除了 CV07，它们没有多报出任何一个审计缺陷。三个 `*-residential-advisory` 用 `W_STAIR_TOO_STEEP` 报 CV07（坡度），`residential-basic` 与默认一样用 `W_STAIR_RISER_TOO_HIGH`。它们另报的 `W_ROOM_TOO_SMALL`、`W_ROOM_TOO_NARROW` 量的是 profile 自己的面积和短边下限，不在审计的 57 个里，本稿不计。

**固定句（RM-D3）：** 六份 brief 写成的平面里有 57 个缺陷，最终 lint 报出 8 个（另有 1 个部分）。这是 1.60.0 的数。在 `main@dad33f02` 上重跑同样六份平面的默认 lint，报出 9 个（另有 1 个部分）。多出的 1 个是楼梯太陡：`W_STAIR_RISER_TOO_HIGH` 是 1.60.0 之后加的，它按画出的踏步数算出的级高超过默认的 220 mm。

## 2. 分类表

"今天报不报"指 `main@dad33f02` 上的默认 lint，括号里写 profile 下另外报出的。"已有卡"指 `docs/plans/plan-soundness/cards.md` 里已经记着这一类的卡。

| 类 | 缺陷类 | 个数（B / N / m） | 判定 | 今天报不报 | 已有卡 |
|---|---|---|---|---|---|
| CV01 | 家具堵住开口，或门扇打到家具 | 2（1 / 1 / 0） | 已有规则 | 报：`W_DOORWAY_BLOCKED`、`W_SWING_OBSTRUCTED` | — |
| CV02 | 两件家具重叠 | 1（0 / 1 / 0） | 已有规则 | 报：`W_FURNITURE_OVERLAP` | — |
| CV03 | WC 侧距不够 | 1（0 / 1 / 0） | 已有规则 | 报：`W_WC_SIDE_CLEARANCE` | — |
| CV04 | 高柜挡窗 | 1（0 / 0 / 1） | 已有规则 | 报：`W_FURNITURE_OVER_WINDOW` | — |
| CV05 | 车库停不下车 | 1（0 / 1 / 0） | 已有规则 | 报：`W_GARAGE_TOO_NARROW`（报的是进深；宽度一半见 §3.0） | — |
| CV06 | 房间文字压在符号或墙上 | 2（0 / 0 / 2） | 已有规则 | 报：`W_ANNOTATION_OVERLAP` | — |
| CV07 | 楼梯太陡 | 1（0 / 0 / 1） | 已有规则 | 报：`W_STAIR_RISER_TOO_HIGH`（1.60.0 不报） | — |
| CV08 | 沙发正面贴着墙 | 3（0 / 3 / 0） | **加 lint** | 不报 | PS2.32、PS2.28 |
| CV09 | 双人床只有一侧能上下（长边贴墙，或床尾顶着别的家具） | 4（0 / 2 / 2） | 有条件：读到出处就加 lint（只在 profile 下），否则不查 | 不报 | PS2.60 |
| CV10 | 柜体、洁具正面的活动区不够（WC 前方，衣柜正面） | 2（0 / 1 / 1） | WC 一半：有条件（目标 `V`）；衣柜一半：没有出处，不查 | 不报 | PS2.60 |
| CV11 | 灶台两侧的落脚台面不够 | 2（0 / 1 / 1） | **加 lint** | 不报（`W_ROOM_MISSING_DEFINING` 只看台面在不在） | PS2.59 |
| CV12 | 房间里有厨房洁具，却没标 `kitchen` | 1（0 / 1 / 0） | **加 lint** | 不报 | PS2.30 |
| CV13 | 餐桌没有座位 | 1（0 / 1 / 0） | **加 lint** | 不报 | PS2.31 |
| CV14 | 上层在楼梯上方没有洞口 | 1（0 / 0 / 1） | **加 lint** | 不报（`W_STAIR_HEAD_VOID` 只在有 `void` 时运行） | — |
| CV15 | 无障碍卫生间的转移空间、门的开向与坐便位置 | 2（0 / 1 / 1） | 有条件：读到出处就加 lint（只在 profile 下），否则不查 | 不报（profile 报出的是另一侧的侧距，不是这个缺陷） | PS2.36 |
| CV16 | 住宅外的公共走廊画进了外墙圈，入户门成了内门 | 1（0 / 0 / 1） | **加 lint** | 不报（`lint` 的 privacy 一族只标 `partial`） | PS2.42 |
| CV17 | 门扇开进走廊，挡住通道 | 1（0 / 0 / 1） | 声明不查，直到有 `V` 或 `S-full` 的出处（可以先做成 hint） | 不报 | PS2.33 |
| CV18 | `anchor … flush` 把接待台转反了 | 1（0 / 1 / 0） | 声明不查：先修推导（§5 余项 3） | 不报 | PS2.43 |
| CV19 | 床头或床的长边在窗下 | 4（0 / 0 / 4） | 声明不查 | 不报 | PS2.71（2026-10-27 判为品味） |
| CV20 | 规则默认运行，但只在 profile 提高阈值后才报（轮椅通行宽度、出口前的空地、楼梯侧面开门） | 3（0 / 2 / 1） | 声明不查（默认阈值）；profile 已查 | 默认不报（`accessibility-advisory` 报：`W_PATH_TOO_NARROW`、`W_EXIT_APPROACH_BLOCKED`、`W_STAIR_SIDE_ENTRY`） | — |
| CV21 | `dims auto all` 的墙厚数字印在房间地面上 | 6（0 / 0 / 6） | 声明不查（画法问题，不归 lint） | 不报 | PS2.39 |
| CV22 | 房间没写名字，只印面积 | 1（0 / 0 / 1） | 声明不查 | 不报 | — |
| CV23 | 非住宅的功能配置（柜台朝向、营业厨房、员工路线、诊室家具、员工休息室、候诊座位数） | 6（0 / 4 / 2） | 声明不查 | 不报 | PS2.43（柜台）、PS2.31（候诊座位） |
| CV24 | 整套住宅的配套（没有收纳、没有吃饭的地方、床头柜放远了） | 2（0 / 0 / 2） | 声明不查 | 部分：床头柜的朝向由 `W_FIXTURE_BACK_TO_ROOM` 报出 | — |
| CV25 | 空间效率（交通面积占比、过大的门厅或卫生间） | 4（0 / 0 / 4） | 声明不查 | 不报 | — |
| CV26 | 面积口径（brief 的面积按哪种口径算） | 2（0 / 0 / 2） | 声明不查 | 不报 | — |
| CV27 | 与 brief 的措辞不符 | 1（0 / 0 / 1） | 声明不查 | 不报 | — |
| **合计** | | **57（1 / 21 / 35）** | 已有 9 · 加 lint 17 · 声明不查 31 | 默认报 9（另 1 部分）；`accessibility-advisory` 另报 3 | |

核对：已有 9 + 加 lint 17 + 声明不查 31 = 57；B 1 + N 21 + m 35 = 57。

## 3. 每一类的判定

### 3.0 已有规则的类

七类今天都报。只有 CV05 要补一句：`W_GARAGE_TOO_NARROW` 除了进深，也量宽度（房间短边不到 2700 mm 一个车位时报，`src/lint/rules/per-room.ts:638-668`）。2700 而不是 3000 是有意的取舍：用 3000 会对一个正常可建的 5500 mm 双车库报警（`per-room.ts:112-117`）。这一次规则只报了进深；宽度那一半按这条有意定下的线判，不算漏报。

### 3.1 加 lint 的类

每类写出：候选规则、出处等级、误报风险、公开夹具（进 `test/defect-corpus/`，缺陷图必报，合法孪生图零报）。每条规则另有一对留出夹具，只放私有的 `archlang-lab`，规则 PR 里只报它的计数。代码名都是提议，规则卡可以改名；改名时同步 `test/defect-corpus/README.md` 的提议表。

**CV08 · 沙发正面贴着墙（3 个，全是 N）**
- *候选规则：* `W_SEAT_FACING_WALL`。`sofa`、`sofa_l`、`loveseat`、`armchair` 的正面贴着墙面（按画出的几何，中间没有地板）时报出。正面按画出的转角读（`rotate 0` 背朝北），不按包围盒读。不用 `tolMm`：它在默认规则集里是 200 mm（`arch lint --rules`），对"贴住"来说太宽。
- *出处等级：* 无新数字。正面贴墙时人坐不进去，这是几何事实。PS2.32 提的 600 mm 版本没有读过的出处，按原则 10 不能进新规则。
- *误报风险：* 中等，所以排在第 3。这个写法在已发布的示例里就有：`examples/townhouse.arch:93`（`sofa … anchor bottom flush`）会报，`examples/terrace-row.arch:125` 也贴着底边，要读它的转角再定。`garden-loft`、`relational`、`laneway-house` 的沙发离墙 250–300 mm，贴住版本不报，600 mm 版本会报。规则卡要先跑遍 `examples/**`：如果这些确实是面朝墙的沙发，就像 ST.1 那样在同一个 PR 里修好示例，逐张列出 digest 的变化。
- *与目录的关系：* `sofa` 不是 `directional`，这是有意的：沙发是摆的，不是装的，背朝房间可以是隔断式的布置，不算缺陷（`src/fixtures-catalog.ts:76-79`）。所以 `anchor bottom` 不给沙发转向，沙发停在 `rotate 0`，正面贴着它所靠的墙；这一类的 3 个缺陷都是这样写出来的。这条规则只管正面贴墙，不碰"背朝房间"的判断，与目录的那条决定不冲突。
- *公开夹具：* `clearances/seat-faces-wall`：一张 `loveseat` 的正面贴着一面隔墙；孪生图把它转 180°，背靠这面隔墙。

**CV09 · 双人床只有一侧能上下（4 个，2 N / 2 m）**
- *判定：* 有条件。读到 `V` 或 `S-full` 的出处就加 lint，只在 `uk-residential-advisory` 与 `accessibility-advisory` 下运行；读不到就不查。
- *候选规则：* `W_BED_SIDE_ACCESS`。双人床（`double_bed`，或宽度达到双人床尺寸的 `bed`）的某条长边，或者床尾，到墙面或另一件家具的净距小于读到的通道宽度时报出。
- *出处等级：* 目标 `V`。Approved Document M 第 1 卷（2015，住宅）M4(2) 的床边通道区，就是 PS2.60 记下的那个数。`src/lint/provenance.ts` 已经把同一份文件的 Diagram 2.5 记为 `V`，但床边那一条至今只按 `M` 记（PS2.60："once read"）。
- *误报风险：* 默认规则集下中等：小卧室里一侧靠墙的双人床很常见，也有人这样用。所以只放 profile。
- *公开夹具：* `clearances/double-bed-one-side`：一张双人床的一条长边贴着隔墙；孪生图把床挪开，两侧都留出读到的宽度。床尾那一半另做一对：床尾前面立着一件五斗柜（`dresser`），孪生图把它挪开。

**CV10 · 柜体、洁具正面的活动区不够（2 个，1 N / 1 m）**
- *判定：* WC 那一半有条件，目标 `V`：读到正前方活动区的数字就加 lint。衣柜那一半没有读过的出处（PS2.60："a wardrobe front needs its own source"），只能靠作者自己写的 `clear front`，不查。
- *候选规则：* `W_WC_FRONT_CLEARANCE`：WC 正前方的活动区里有别的洁具或家具时报出。衣柜那一半沿用已有的提议名 `W_WARDROBE_FRONT_CLEARANCE`（`test/defect-corpus/README.md` 的提议表），它的两个 `todo` 夹具 `wardrobe-front-550`、`wardrobe-faces-bed` 继续等出处。
- *出处等级：* 目标 `V`。出处表已把 Approved Document M 第 1 卷 M4(2) Diagram 2.5 记为 `V`（`wcSideClearanceMm`），正前方活动区的数字要从同一张图读出，另记一行。
- *误报风险：* 低到中等。小卫生间里洁具挨得近很常见，所以活动区要按图上的尺寸量，不能用整面的净距。
- *公开夹具：* `clearances/wc-front-zone`：一个靠东墙放的 WC，正前方立着一个洗衣机；孪生图把洗衣机挪到墙角。

**CV11 · 灶台两侧的落脚台面不够（2 个，1 N / 1 m）**
- *候选规则：* `W_HOB_NO_LANDING`。按 NKBA 第 17 条，灶台一侧至少 12 in（305 mm），另一侧至少 15 in（381 mm）的落脚台面（`src/lint/ruleset.ts:384-385` 引的原文）。两侧相接的连续台面，较短一侧不到 305 mm，或者较长一侧不到 381 mm 时报出。只有与灶台相接、中间没有空隙的台面才算；水槽、冰箱不算。
- *出处等级：* `V`。`hobLandingMm`（305 mm）已经从 NKBA 自己的 PDF 读过，381 mm 出自同一句原文，规则卡把它记成出处表的新一行。
- *误报风险：* 中等。灶台放在台面尽头、旁边是侧墙的情况归 PS2.59（"先量语料：小厨房里灶台在尽头很常见"），本规则不处理，等 PS2.59 量完再说。已有的 `W_HOB_FRIDGE_GAP` 量的是同一个落脚区里的高柜，规则卡要写出两条怎样分工：一条报冰箱，一条报台面，同一事实不重复报。
- *公开夹具：* `clearances/hob-no-landing`：岛台上的灶台，两侧都是空地板，没有台面相接；孪生图在两侧各接一段达标的台面。

**CV12 · 房间里有厨房洁具，却没标 `kitchen`（1 个，N；PS2.30 的证据栏记着此前三次复测里都出现过）**
- *候选规则：* PS2.30 的读法：一个房间放着厨房水槽、灶台或冰箱，`uses` 里却没有 `kitchen`（或根本没标用途）时，按推断的用途运行 `W_ROOM_MISSING_DEFINING` 的厨房那一条，或者报一条新的 `W_ROOM_USE_MISSING`。二选一由规则卡决定。
- *出处等级：* 无新数字。要什么家具直接读 `FURNISH_TABLE`，与 `finish` 用同一张表。
- *误报风险：* 低到中等。起居室里的吧台水槽、杂物间的水槽会被读成厨房，所以推断要求至少两件厨房家具，或者一个灶台。这一类同时是一条洗白路线：删掉 `uses kitchen` 就能让 `W_ROOM_MISSING_DEFINING` 闭嘴（PS2.30 的验收）。
- *公开夹具：* `missing-defining-contents/kitchen-untyped`：一个不标用途的房间，放着灶台和水槽，没有台面；孪生图补上台面（不是改标签：改标签不算修复）。

**CV13 · 餐桌没有座位（1 个，N；PS2.31 记了多次）**
- *候选规则：* `W_TABLE_NO_SEAT`。同一个房间里有餐桌，却一把椅子都没有时报出。先做不带距离阈值的版本；按 `seatTableReachMm` 判断够不够得着的版本，要等这个数字有了出处（今天它是 `convention`）。
- *出处等级：* 无新数字（房间里有没有座位）。
- *误报风险：* 低，前提是只认餐桌：`dining_table`，以及目录里 `serves: "dining_table"` 的 `table`。`table` 与 `chair` 自 2026-08-26 起就在目录里（`9f4a9566`），`table` 的 `serves: "dining_table"` 是 2026-10-13 加的（`729732b3`），都早于 1.60.0，所以审计把 `table` 记成"未入目录"在 1.60.0 上就不成立。今天不报的原因在别处：`W_ROOM_MISSING_DEFINING` 的 dining 一行只在 `uses dining` 的房间运行，而且只要一张桌子，不要椅子（`src/furnish-table.ts`）。茶几、边桌（`coffee_table`、`side_table`）不算餐桌。
- *公开夹具：* `missing-defining-contents/table-no-chairs`：起居室里放一张 `dining_table`，没有椅子；孪生图在桌边加两把椅子。

**CV14 · 上层在楼梯上方没有洞口（1 个，m）**
- *候选规则：* `W_STAIR_NO_VOID`。一段楼梯从下层爬到上层，上层在梯段上方没有 `void` 时报出，报在上层的楼梯上。
- *出处等级：* 无新数字。上层的楼板盖在梯段上，人就上不去，这是几何事实。
- *误报风险：* 规则本身的误报低，但它会落在已发布的示例上：`examples/` 里有三张多层、有楼梯而不写 `void` 的图（`garden-house`、`townhouse`、`turning-stair`）。规则卡要先用 `arch lint --json` 跑遍 `examples/**`，如果这三张确实缺洞口，就在同一个 PR 里修好示例，逐张列出 digest 的变化。
- *公开夹具：* `stair-safety/no-void-at-head`：一段 `winders` 转角楼梯从 0 层到 1 层，1 层不写 `void`；孪生图在梯段上方写 `void`。

**CV15 · 无障碍卫生间的转移空间、门的开向与坐便位置（2 个，1 N / 1 m）**
- *判定：* 有条件。读到 `V` 或 `S-full` 的出处就加 lint，只在 `accessibility-advisory` 下运行；读不到就不查。这一类与 PS2.36 合并做（无障碍卫生间的门向内开，并入 PS2.16，连同坐便偏移和洗手台的可及距离）。
- *候选规则：*（a）`W_ACCESSIBLE_WC_TRANSFER`：房间标签写明无障碍的卫生间，坐便转移一侧的空地里有洗手台或别的洁具，或者门扇扫过这块空地。（b）坐便离后墙太远：`W_FIXTURE_FLOATING` 的容差是 300 mm（`FIXTURE_WALL_TOL_MM`），无障碍卫生间要单独读后墙的距离。
- *出处等级：* 要另找。出处表里的 Approved Document M 第 1 卷（M4(3) Diagrams 3.11、3.16，`V`）只管住宅。这一类的无障碍卫生间都在非住宅建筑里，归第 2 卷（住宅以外的建筑），第 2 卷还没有读过。
- *误报风险：* 低。规则只看标签写明无障碍的房间（与 `W_ACCESSIBLE_WC_SIDE_WALL` 同一个判断）。
- *公开夹具：* 照已有的 `clearances/accessible-wc-pan-far` 做：`clearances/accessible-wc-no-transfer`，标签写明无障碍的卫生间，洗手台占住了坐便转移的一侧；孪生图把洗手台挪到坐便的另一侧。

**CV16 · 住宅外的公共走廊画进了外墙圈，入户门成了内门（1 个，m）**
- *候选规则：* PS2.42 的读法：一张平面唯一的外门是阳台或露台门，而一个交通房间装着平开的入户门、自己却没有外门时，报出"住宅的外部语境画进了图里"，或者把这个走廊读成入口一侧（PS2.14 的住宅语境）。二选一由规则卡决定。
- *出处等级：* 无新数字（门开在哪、有没有外门，都是拓扑事实）。
- *误报风险：* 低。条件很窄：唯一的外门是阳台门，入户门又开在一个没有外门的交通房间上。重跑时，这份平面的 lint 覆盖里 privacy 一族已经标着 `partial`，说明工具看出了入口读不对，只是不报。
- *公开夹具：* `circulation-privacy/corridor-drawn-inside`：一套住宅唯一的外门是阳台推拉门，入户门开在画进外墙圈的走廊房间上；孪生图把走廊移出外墙圈，入户门开在外墙上。

### 3.2 声明不查的类

每类写出：为什么不查，以及公开的说法。RM9.6 把这些说法写进一份公开的"不检查清单"（`docs/says-no.md` 的新一节，或参考文档）。下面的说法是草稿，RM9.6 可以改字，不能改意思。

| 类 | 理由 | 公开的说法（草稿） |
|---|---|---|
| CV17 门扇开进走廊（1） | PS2.33 要的阈值是走廊剩下的宽度。现成的数是 `minPathClearWidthMm`，它的出处等级是 `convention`，按原则 10 不能进新规则。读到 `V` 或 `S-full` 的出处之前，最多做成 `W_PATH_TOO_NARROW` 的一条 hint，不加新代码。 | "lint 不检查开着的门扇占掉多少走廊宽度。" |
| CV18 `anchor … flush` 把接待台转反了（1） | 这不是作者写错：`reception_desk` 是 `directional`，`anchor … flush` 推导出让它"背靠墙"的转角，可是接待台的图形把访客一侧的台沿画在背面、把员工的椅子画在正面（`src/elements/glyphs-misc.ts:503-515`），结果访客一侧贴墙，员工面朝墙。先修推导（§5 余项 3），同样的写法就不再出错。手写 `rotate` 转反的情况归 PS2.43，它要的 600 mm 没有出处。注意 `bar_counter` 的约定相反：`examples/corner-cafe.arch:84`（`bar_counter against wall`）会让一条不分家具的"服务一侧贴墙"规则报出，PS2.43 要按家具分别读服务一侧。 | "lint 不检查接待台、吧台的服务一侧朝哪边。" |
| CV19 床头或床的长边在窗下（4） | PS2.71 已于 2026-10-27 判为品味：床靠窗是常见做法，不是能拿几何证明的错误。床是矮家具，挡不住光。 | "lint 报挡住窗户的高柜（`W_FURNITURE_OVER_WINDOW`）和窗下的灶台（`W_HOB_UNDER_WINDOW`）。床、沙发这类矮家具放在窗下不报：这是布置上的取舍，不是错误。" |
| CV20 默认阈值下合格、profile 提高阈值后才报的项（3） | 这三条规则默认就运行，只是默认阈值量的是走不走得过去（通行宽度 700 mm）；轮椅通行（900 mm）、出口前的空地、楼梯侧面开门的距离，是 `accessibility-advisory` 提高后的阈值，这一次也确实都报了出来。 | "默认的 lint 量的是能不能走过去，不按轮椅通行检查。要检查无障碍，运行 `archlang lint --profile accessibility-advisory`：它用更严的数检查通行宽度、出口门前的空地，以及开在楼梯侧面的门。" |
| CV21 墙厚数字印在房间地面上（6） | 这是工具自己的画法，不是作者写错了。`dims auto walls` 和 `dims auto all` 每种墙厚只标一次，标在这种厚度最长的一段直墙旁边，避开交叉的墙、开口、家具和楼梯；压到房间名时换地方，换不开就不画，并报 `W_DIM_THICKNESS_UNPLACED`（`src/error-catalog/drafting.ts:150`）。PS2.12 没有为它加 lint，因为作者除了不要尺寸链，没有别的办法消掉它。画在哪里由 PS2.39 决定。 | "`dims auto walls` 与 `dims auto all` 在墙旁边标出墙厚，每种厚度标一次，可能落在房间里。这是画法，lint 不报。" |
| CV22 房间没写名字（1） | 房间名是作者的选择：没有 `label` 时，图上只印面积，`describe` 用 id 指这个房间。lint 不要求每个房间都有名字。 | "lint 不要求房间写名字。没有 `label` 的房间只印面积；要出图，就给每个房间写上 `label`。" |
| CV23 非住宅的功能配置（6） | 用途词（`uses`）和 `FURNISH_TABLE` 描述的是住宅的房间。柜台朝哪边（PS2.43 的阈值没有出处）、营业厨房要几个水池、员工走哪条路、诊室要什么家具、候诊要几个座位（PS2.31 提的 profile 值），都来自餐饮卫生、医疗之类各自的规范和运营要求，这些出处一份都没有读过，也没有对应的用途词。 | "lint 按住宅的房间检查家具配置。餐厅、诊所、商店这类非住宅的功能配置（柜台、营业厨房、员工路线、候诊座位）不在检查之内。" |
| CV24 整套住宅的配套（2） | 整套住宅有没有收纳、有没有吃饭的地方、床头柜离床多远，都是布置上的约定，没有能进规则的出处。lint 只按房间的用途查有没有缺少定义它的家具（`W_ROOM_MISSING_DEFINING`）。床头柜的朝向今天已由 `W_FIXTURE_BACK_TO_ROOM` 报出。 | "lint 按每个房间的用途检查它的必需家具。整套住宅缺不缺收纳、餐位，lint 不判断。" |
| CV25 空间效率（4） | 交通面积占多大比例、门厅或卫生间算不算太大，是 brief 和品味的问题，没有几何上的对错。`describe` 已经给出每个房间的面积与总面积。 | "lint 不判断面积分配得好不好。每个房间的面积和总面积都在 `archlang describe` 里。" |
| CV26 面积口径（2） | `describe` 写明它的面积用哪种口径；brief 给的面积指哪一种，只有写 brief 的人知道。RM9.1、RM9.2 已经把总数算准，也写清了口径。 | "`describe` 的面积按它写明的口径计算。brief 里的面积按哪种口径算，由作者确认；`validate --intent` 检查的是作者自己写下的面积带。" |
| CV27 与 brief 的措辞不符（1） | lint 从不读 brief。作者写成 `intent` 的部分由 `validate --intent` 检查，其余由作者自己核对。 | "lint 不读 brief。写进 `intent` 的要求由 `validate --intent` 检查。" |

## 4. RM9.6 的队列

排序先看 N 级缺陷的个数，以及这一类是否在此前的复测里反复出现（已有卡的证据栏）；再看误报风险、会不会落在已发布的示例上，以及出处是否已经到手。有条件的类排在最后，先读出处。每条规则一张小卡，各带 §0 规则卡的门禁：一对公开夹具，一对留出夹具（只放私有 `archlang-lab`，PR 只报计数），以及跑遍 `examples/**` 的报出数。

| 序 | 类 | 本次个数（N） | 候选规则 | 出处 | 误报 | 先决 |
|---|---|---|---|---|---|---|
| 1 | CV12 | 1（1） | 推断用途后跑 `W_ROOM_MISSING_DEFINING`，或 `W_ROOM_USE_MISSING` | 无新数字 | 低到中 | PS2.30 的验收（洗白路线） |
| 2 | CV13 | 1（1） | `W_TABLE_NO_SEAT` | 无新数字 | 低 | 只认餐桌词（`dining_table`、`table`） |
| 3 | CV08 | 3（3） | `W_SEAT_FACING_WALL` | 无新数字 | 中（落在示例上） | 跑遍 `examples/**`，同一个 PR 修示例 |
| 4 | CV11 | 2（1） | `W_HOB_NO_LANDING` | `V`（NKBA 第 17 条，381 mm 补记一行） | 中 | 与 `W_HOB_FRIDGE_GAP` 分工；侧墙的情况留给 PS2.59 |
| 5 | CV16 | 1（0） | PS2.42 的入口语境 | 无新数字 | 低 | 在警告与改读入口之间二选一 |
| 6 | CV14 | 1（0） | `W_STAIR_NO_VOID` | 无新数字 | 低（但会落在三个示例上） | 同一个 PR 修示例，逐张列 digest |
| 7 | CV10 | 1（1；衣柜一半不算） | `W_WC_FRONT_CLEARANCE` | 目标 `V`（Diagram 2.5） | 低到中 | 先读出正前方的数字 |
| 8 | CV09 | 4（2） | `W_BED_SIDE_ACCESS`（只在 profile 下） | 目标 `V`，今天是 `M` | 默认下中等，所以只放 profile | 先读 M4(2) 原文 |
| 9 | CV15 | 2（1） | `W_ACCESSIBLE_WC_TRANSFER`，加坐便后墙距离（只在 profile 下） | 要另找：第 2 卷没读过 | 低 | 先读 Approved Document M 第 2 卷；与 PS2.36 合并 |

**上限。** 九条都落地，并且每条都报中它那一类的每一个，这六份平面上的默认 lint 最多再报出 10 个：CV08 3、CV11 2、CV12 1、CV13 1、CV14 1、CV16 1、CV10 的 WC 一半 1（要先读到数字）。只在 profile 下运行的另有最多 6 个（CV09 4、CV15 2，都要先读到出处）。CV10 的衣柜一半（1 个）、CV17（1 个）、CV18（1 个）不在上限里。这只是这一组平面的上限，不是承诺。RM9.6 的验收是 RM1.1b 的报出数（`../cards.md`），RM1.1b 用的是新的 brief，量出来的才算数。

## 5. 余项（交给协调者立卡）

1. **多层平面的消息把层号写两遍。** 一张公开的最小复现（下面这张），`W_STAIR_TOO_STEEP` 的消息是 "The stair in the hall on level 0 on level 0 is too steep: …"，`W_STAIR_NO_LANDING` 的是 "The stair in the hall on level 1 on level 1 has no landing at its head: …"。没写名字的房间已经带上了层号，楼梯的消息又加了一次。审计平面上的 `W_STAIR_RISER_TOO_HIGH` 与 `W_STAIR_SIDE_ENTRY` 也是同样的写法。

   ```arch static
   plan "Two storeys, unnamed rooms" {
     units mm
     level 0 height 2800 {
       wall exterior thickness 200 { (0,0) (4000,0) (4000,6000) (0,6000) close }
       room id=hall at (0,0) size 4000x6000 uses hall
       door on hall.bottom at center width 900 swing in
       stair id=st at (500,1000) size 1000x2500 dir up
     }
     level 1 height 2800 {
       wall exterior thickness 200 { (0,0) (4000,0) (4000,6000) (0,6000) close }
       room id=landing at (0,0) size 4000x6000 uses hall
       stair id=st at (500,1000) size 1000x2500 dir down
     }
   }
   ```

2. **`anchor` 不给沙发转向，规格说明没有写这一点。** 不转是有意的（`src/fixtures-catalog.ts:76-79`），但 `spec.llm.md` 的两张清单（可以沿边放的、从不沿边放的）都没有列 `sofa`，作者从规格说明里看不出 `anchor bottom` 会让沙发面朝墙。这是 PS2.32 的后半句："或者在 `spec.llm.md` 里说明它不转"。
3. **`anchor … flush` 给 `reception_desk` 推导出反的朝向**（CV18）。目录把它标成 `directional`，推导让它的背靠墙，可它的图形是访客台沿在背面、员工椅子在正面（`src/elements/glyphs-misc.ts:503-515`）。要么推导对接待台取反，要么改图形的朝向；两种都会移动 SVG 字节，要单独计账。与 PS2.43 一起看。
4. **被 `open between` 整段拿掉的墙仍然标墙厚。** 公开复现：两个房间上下相邻，`walls from rooms exterior 200 partition 100 { open between a and b }`，加 `dims auto all`。图上没有任何 100 mm 的墙，SVG 却在打开的那条边旁边印出一个 "100"。这是 CV21 里一个更窄的特例：一个错误，不是画法上的取舍。
5. **角点 `anchor` 的 `inset` 作用在两条边上。** `spec.llm.md` 写的是 `inset` "pulls it in from that edge"；对 `top-left` 这样的角点，它同时从两条边往里收，作者只想离开一面墙时，构件也离开了另一面墙（CV15 坐便位置的成因）。要么把说法讲清楚，要么提供按边的 inset，由语言卡决定。
6. **审计的一条工具事实在 1.60.0 上就不成立。** 审计把 `table` 记成未入目录，但它自 2026-08-26 起就在目录里（见 CV13）。RM1.1b 的审计员不要再按"未入目录"记。
