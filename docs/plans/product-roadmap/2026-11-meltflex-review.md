# 2026-11 第三方实测（MeltFlex）：结论、核对与开发方向

**来源：** MeltFlex AI 博客 "Claude Floor Plan Skill: Which One Draws a Real, Measured Plan"，作者 Matúš Koleják，页面标注更新于 2026-11-15，<https://www.meltflexai.com/blog/claude-floor-plan-skill>。协调者于 2026-11-28 用 Chrome 读全文（本文只转述，不转载）。

**边界（先读）：**

- **这是第三方的一次运行，不是我们的测量。** 文中的时间、费用、轮数都是对方的自报（来自 Claude Code 的 JSON 输出），我们没有复现，也不能当作基准引用。
- **利益关系。** 对方自己在文末声明：MeltFlex（平面转 3D 的技能、MCP、API）与 AIBIM Tool 是他们的产品；ArchLang 不是，他们与维护者没有关系。文章的结构是"ArchLang 画 2D，MeltFlex 做 3D，AIBIM 做 BIM"，读第 4 节时要记住这一点。
- **版本。** 对方用的是 npm `@chanmeng666/archlang` 1.62.0（发布当天上午）与仓库提交 `ab37b3e` 的五个技能。1.62.0 之后已发布到 1.68.2，第 3 节逐条核对今天的代码，凡是"现在已有"的都注明了出处。
- **第 5 节是卡，不是裁定。** 新卡写进 `cards.md` 第 11 轨（RM9.19–RM9.27），状态都是 `todo`；排期按 `handoff.md` §2 与 `v3.md` §3，所有者决定。

## 1. 对方做了什么

| 项 | 内容 |
| --- | --- |
| 环境 | Claude Code 2.1.325，Opus 5.5，无头，空项目；只装 ArchLang 的五个技能；npm 包以禁用安装脚本的方式安装 |
| brief | 一段两句话的英文需求：约 80 m² 的两室一卫公寓，开放式厨房与起居朝街，两间卧室和卫生间都从一条短走廊进，每间卧室有窗，主卧至少 12 m²，存成 PNG。**brief 没有提 ArchLang。** |
| 对照组 | SamurAIGPT 的 muapi `floor-plan-rendering` 技能：对方把它的固定提示词原样发给 Nano Banana 2（经 Google API，没用 muapi 本身），跑 3 次 |
| 只读未跑 | eachlabs、awesome-genmedia、3D New Era AI、markdown-viewer、4kk11 的 archilang-floorplan、listing-to-3d、ha-3d-floorplan（按各自的 SKILL.md 与 README 判断） |
| 后续 | 同一 brief 次日交给 Codex：也满足了全部要求，2 分 2 秒，约 $2.07，而且要先打开网络权限才能跑 |
| 3D | 把 ArchLang 导出的 PNG 交给他们自己的 MeltFlex 平面转 3D（约 15 秒）；他们说明渲染的布局来自平面，细节是虚构的（加了一对平面里没有的门、把一字形厨房改成 L 形） |

## 2. 对方的结论（转述）

### 2.1 做得好的

1. **技能被自动选中。** Claude 按技能描述匹配到 `archlang-brief-to-plan`，第一步就加载它；按技能的第一步先读完 `archlang spec` 再写。
2. **写法。** 一份 45 行的平面：房间按关系摆放，墙由房间生成，门窗挂在命名墙上，家具按锚点放。
3. **验证器抓到了真问题。** 第一次编译通过，严格检查没过：`W_SWING_OBSTRUCTED`，门扇需要 800 mm 净半径，浴缸离铰链 775 mm，差 25 mm。Claude 移动了铰链。随后 `W_SCALE_OVERFLOW`：10.25 m 宽的楼在 1:50 下放不进 A3，Claude 改成 A2。
4. **有意保留的两条警告。** 两间卧室的窗都朝北；Claude 保留并说明理由（brief 把起居放在临街一侧，它把街当南）。
5. **尺寸链闭合。** 上方尺寸链各段之和等于总宽 10,250 mm，下方链也落在同一个数。报告写"Brief requirements not met: none"。
6. **两列面积。** 对方专门称赞：净面积与轴线面积分开写，Claude 两个都引用了，这是技能要求的。总计净 73.6 m²、轴线 80.0 m²。
7. **技能的一条规矩被单独点名称赞**：两个要求不能同时满足时，停下来告诉用户是哪两个，不要悄悄改数字。
8. **审阅图。** 文中放了 `preview --review` 风格的审阅图：从入口到各房间的可达图，以及 Claude 保留的两条警告的红圈。
9. **用时与费用。** 19 轮，1 分 52 秒，Claude Code 报 $0.73（API 价）。
10. **对照组全部失败。** 三次图像模型出图：多出一间没要求的房间、一个卫生间里画两个马桶、比例尺写成"1:100m"；两个卫生间、上下尺寸链各指一个楼宽（9.5 m 与 10.8 m）、房间标注面积与尺寸不符；9.8 m 的楼上标 21 m、24 m、47 m，同一卧室标了两个名字，面积之和 68.8 m² 而标题写 80。**对方的总结是：图像方案看起来比 ArchLang 的更专业（家具符号、填充、指北针），但数字不对。**

### 2.2 批评（"有效的平面不等于好平面"）

对方明确说这些不是缺陷，是"把 brief 画对"与"设计一个家"之间的差距：

1. **入户门直接开进起居室。** 没有门厅、没有挂衣柜、没有放湿鞋的地方。
2. **两间卧室一样大，都是轴线 17.6 m²。** 对主卧合适，对次卧太大（对方引用自己的指南：美国次卧通常 100–144 sq ft）。Claude 自己指出了面积相同，并提出可以缩小一间。
3. **起居室是一条带子。** 10 m 宽、3.6 m 深，一字形厨房在一端，入户门在另一端。
4. **走廊没有壁柜，没有洗衣。** brief 没要，技能就没画；对方说设计师会问。
5. 对方的修正建议是写更好的 brief，并提到第二轮可以用 `archlang-edit-plan`。

### 2.3 对方列出的局限

1. **没有规范合规。** 检查是几何的（净空、可达、采光朝向），不是当地建筑规范、疏散、结构或节能；没有哪个审批部门因为验证器通过就接受一张图。（这与我们的措辞律一致，`docs/seo.md` §4。）
2. **brief 是天花板。**
3. **公制优先。** ArchLang 用毫米；美国用户得到的平方英尺来自换算，不来自图纸本身。
4. **图片更吸引注意力。** 看图的人不核对数字时，图像方案更有说服力。
5. **注册表会过期。** 有一个被列出的技能在源仓库里已被删除，另一个只能在作者自己的电脑上跑；要看仓库，不要看列表。
6. **信任。** 对方读到 README 写明单一维护者、由 AI 编码代理编写并经 CI 检查，建议**固定版本**，并说这不是回避它的理由。
7. **BIM。** 文中所有技能都停在图纸、图片或可视化网格；要 IFC 需要另一个工具。对方提出的链条是"brief → ArchLang 平面定布局 → AIBIM 生成模型"。

## 3. 对照今天的代码核对（2026-11-28，`main` 在 `263f99f1`）

| 对方的观察 | 今天的状态 | 出处 |
| --- | --- | --- |
| 起居室是 10 m × 3.6 m 的带子 | **已有检测，但这条流程没跑它。** `score --taste` 的 R9 `A_ROOM_ELONGATED` 要求房间按最小外接矩形不超过 2:1（卫生间与 WC 2.5:1）；10 ÷ 3.6 ≈ 2.78，按算术会报。我们没有对方的 `.arch`，所以这是推算，不是运行结果 | `src/taste/advice.ts`（R9） |
| 卧室朝北、单一朝向 | `A_SINGLE_ASPECT`（R12）、`A_DAYLIGHT_LOW`（R7）已有 | 同上 |
| brief-to-plan 流程的评审 | `skills/archlang/SKILL.md` 第 115 行写明"循环干净后跑一次 `archlang score plan.arch --taste generic --json` 与 `archlang preview plan.arch --review`，报告分数与 `A_*` 建议，不据此迭代"；**`skills/archlang-brief-to-plan/SKILL.md` 没有这一步**（只有 `preview -o plan.png`）。对方的报告里没有 taste 分数，与此一致 | 两个 SKILL.md |
| 入户门直通起居、无门厅 | **没有对应的检查。** `A_INTIMACY_INVERSION`（R3）查的是"起居/餐/厨比卧室更深"，方向不同；`W_ENTRANCE_INTO_PRIVATE` 查的是开进私密房间。`src/analyze/rooms.ts` 能把房间读成 entry/foyer，`foyer`、`vestibule` 在 `src/intent-concepts.ts` 的同义词里 | `src/taste/advice.ts`、`src/lint/rules/`、`src/analyze/rooms.ts` |
| 两间卧室一样大 | 没有对应的检查或建议 | — |
| 无壁柜、无洗衣 | 没有"缺项"提示；目录里有 `wardrobe`（高柜）等家具，`laundry` 在家具目录与 `furnish-table.ts` 里；v3 的 N3 把"洗衣"列为基本连贯的一部分 | `src/fixtures-catalog.ts`、`v3.md` N3 |
| 公制优先 | 英制只能输入、不能显示，且按字面量舍入；已有卡 **RM9.8**（`units ft-in`，内部 1/16 in 整数，面积 sq ft），`todo` | `cards.md` RM9.8、`v3.md` N9 |
| 图像方案"更专业"：家具符号、填充、指北针 | 指北针与家具符号都有；`finish` 补平面缺的东西（不删除）。brief-to-plan 的"finishes it as a sheet"是否默认跑 `finish`、默认图纸有哪些表现元素，需要逐项审计（RM9.23） | `skills/archlang-brief-to-plan/SKILL.md` 描述行 |
| 3D 交给了 MeltFlex | **ArchLang 自己有 3D 预览**：`packages/archlang-3d`（GLB、Scene3D JSON、离线 HTML），playground 有 Plan | 3D 切换与 Download GLB。对方没有发现，说明技能的结尾没有指向它。MCP 的工具文字按测试不得承诺 3D（`.claude/rules/archlang-3d.md` 与 MCP 测试），所以入口只能写在技能与分享链接里 | `packages/archlang-3d/`、`skills/archlang-export/SKILL.md` 第 62 行（`link` 工具） |
| Codex 贵近 3 倍、要开网络 | 技能经 `npx` 调 CLI，Codex 的沙箱默认断网；核心零运行时依赖 | `skills/*/SKILL.md` 的 `compatibility` 行 |
| 单一维护者，建议固定版本 | npm 已发布 SLSA provenance（`npm view @chanmeng666/archlang@1.68.2 dist.attestations` 有 `https://slsa.dev/provenance/v1`），但 README 只写了单一维护者那一句，没有提 provenance 与固定版本的做法 | `README.md` 第 104 行 |
| 统计数字 | 对方写 47 星；2026-11-27 是 92 星（growth 仓库的 SERP 研究）。今后引用这篇文章时不要转述它的星数 | `archcanvas-growth/research/2026-11-27-serp-study/` |

## 4. 读法：这篇文章告诉我们什么

1. **核心论点被一个与我们无关的第三方独立验证了**：在同一个 brief 上，编译出来并经验证的平面数字闭合，图像模型画的平面数字不闭合。这是 ArchLang 定位（`docs/seo.md` §4 的措辞律所说的"可测量、可检查"）的外部证据，也是至今最具体的一份。
2. **最大的缺口不在正确性，在设计质量的"最后一公里"。** 对方的四条批评里，一条（带状起居）我们已经能查但流程没跑，一条（朝向）已经报了，两条（门厅、卧室层级）没有任何检查，一条（壁柜、洗衣）属于 brief 的缺项。这与 v3 的 N3（基本连贯）和 RM1.2b（行家规则）是同一方向，证据可以直接并入。
3. **呈现方式输给了正确性更差的方案。** 读者先看图后看数。这条不改变"不画没有依据的东西"的原则，但说明图纸的默认表现值得一次审计。
4. **发现性问题：3D 与评审步骤都"存在但没被走到"。** 用户（这里是一个认真测评的人）只看到技能流程走到的地方。修技能文字的性价比最高。
5. **对 Codex 的成本与网络要求是一个具体的代理可用性问题**（N8），与 RM9.17 的 spec 上下文审计同一处。
6. **不该做的**：不要为了回应"没有规范合规"而写任何"符合某规范"的文字；不要把 IFC 写进任何承诺（IFC 是禁用的声明，v3 N5"IFC 只按触发"）；不要引用对方的时间与费用作为我们的基准；不要因为对方是竞品方的公司就在公开文字里贬低 MeltFlex。

## 5. 开发方向（卡见 `cards.md` 第 11 轨）

| 卡 | 内容 | 对应 | 估 |
| --- | --- | --- | --- |
| RM9.19 | brief-to-plan（与 edit-plan）技能在循环干净后跑一次 taste 评审与 `preview --review`，报告 `A_*` 建议，不迭代 | §2.2 第 3 条、§3 第 3 行；N3、N8 | 0.5 日，sonnet |
| RM9.20 | 新 taste 准则：入户直通公共房间、没有入口过渡（advisory，`A_*`） | §2.2 第 1 条；N3；RM1.2b | 1.5 日，opus |
| RM9.21 | 新 taste 准则：卧室大小没有层级（advisory，intent 写了等大时不报） | §2.2 第 2 条；N3 | 1 日，opus |
| RM9.22 | brief-to-plan 的"缺项清单"：住宅常规项（门厅、挂衣、卧室衣柜、洗衣、储藏）brief 没提时，先列出并写明假设或询问 | §2.2 第 4 条；N3 | 1 日，sonnet |
| RM9.23 | 图纸表现审计：`finish` 与默认图纸对照图像方案的元素，只出设计稿 | §2.1 第 10 条、§2.3 第 4 条 | 1 日，opus |
| RM9.24 | 3D 预览的入口写进技能结尾（playground 分享链接的 3D 切换；CLI 用户的 `archlang-3d`） | §3 第 8 行；N4 | 0.5 日，sonnet |
| RM9.25 | Codex 路径：断网可用与上下文成本的调查（只出设计稿，不跑付费评测） | §1 后续、§3 第 9 行；N8；RM9.17 | 1 日，opus |
| RM9.26 | 信任信号：README 与技能前言写明 provenance 与固定版本的做法 | §2.3 第 6 条 | 0.5 日，sonnet |
| RM9.27 | 公开页面引用这篇第三方实测（措辞律之内） | §4 第 1 条 | 0.5 日，sonnet；公开文字，所有者看过措辞 |
| RM9.8（已有） | 英尺英寸。**证据更新**：这篇文章是 N9 的又一个具体用户侧信号（美国读者看到的是换算面积），排期时考虑 | §2.3 第 3 条 | 不变 |

**建议的先后（协调者的建议，排期由所有者定）：** RM9.19、RM9.24、RM9.26 是只改文字的小卡，可以一起做；RM9.22 也是技能文字；RM9.20、RM9.21 是 taste 准则，按 RM1.2b 的规则卡门禁做；RM9.23、RM9.25 先出设计稿。RM9.27 是公开文字，最后做。

## 6. 复核方法

- 不复跑对方的付费会话（`eval:live` 等付费运行只由所有者授权）。
- RM9.19–RM9.22 合并后，用一份**我们自己写**的、与 §1 的 brief 同类的夹具（两室一卫约 80 m²、临街起居、短走廊）离线验证：`archlang validate --strict`、`archlang score --taste generic --json` 应报出相应的 `A_*`；夹具的 brief 文字用我们自己的话写，不照抄对方的文字。
- 文章页面以后可能更新；引用前重读一次，记录读取日期。
