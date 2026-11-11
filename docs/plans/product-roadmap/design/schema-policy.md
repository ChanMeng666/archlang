# 设计稿：schema 的 `$id` 与变更、弃用政策（CR11a）

**状态：** 草案，2026-11-11 写成，基线 `main@6059e52a`。对应卡 CR11a（`../cards.md` 阶段 D），它排在任何新 schema 发布之前：RM1.6a 的规则集 schema、RM1.6b 的 `rule` 字段、RM3.1 的 Plan JSON 新键。本稿只写设计，不改代码；文中的 `file:line` 都在上述基线上读过，动手前重新确认。

**一句话：** 现有两个公开 schema 的 `$id` 不动；每个 schema 的身份跟它的格式主版本走，不跟 npm 包版本走；新 schema 一律带主版本号的 `$id`；变更政策写成"同一主版本内只增不改"，并让发布兼容门禁也看 `$id`。

## 1. 今天的事实

| schema | 源 | `$id` 今天的值 | 文件里的版本字段 | 谁读这个 `$id` |
|---|---|---|---|---|
| Plan JSON | `PLAN_JSON_SCHEMA`（`src/plan-json/schema.ts:67-68`），由 `gen:plan-schema` 写成 `schemas/plan.schema.json` | `https://archlang.uk/plan.schema.json` | `version: { const: 1 }`（`src/plan-json/schema.ts:76`） | MCP 的 `compile` 工具在 `format: "json"` 时把它作为 `schema` 字段返回（`packages/mcp/src/tools.ts:462`）；docs 站把文件原样放在站点根（`docs-site/sync-docs.mjs:102`）；`llms.txt:40` 与 `skills/archlang/SKILL.md:390` 链到这个 URL；`docs-site/e2e/routes.spec.ts:149-153` 断言它含 `archlang.uk` |
| Intent | `src/intent.ts:1400`，由 `gen:intent-schema` 写成 `schemas/intent.schema.json` | `https://archlang.uk/intent.schema.json` | 没有版本字段；intent 文件可以带 `$schema`/`$id` 指给编辑器，检查不读（`src/intent.ts:1244-1248`） | `docs-site/sync-docs.mjs:103`、`llms.txt:41`、`skills/archlang/SKILL.md:118`、`docs-site/e2e/routes.spec.ts:155-159` |
| Scene3D | `packages/archlang-3d/src/scene3d/scene3d.schema.json`（手写，`test/scene3d-schema.test.ts` 让 schema、类型与 `validateScene3D` 三者一致） | `https://example.invalid/archlang-3d/scene3d.schema.json`（占位，`scene3d.schema.json:3`） | `version: { const: 0 }`（同文件第 10-12 行），包是 0.x | `archlang3d schema scene3d` 原样打印（`packages/archlang-3d/tsup.config.ts:13,35`）；不上 docs 站 |
| MCP 工具的 `inputSchema`/`outputSchema` | `packages/mcp/src/tools.ts` | 没有 `$id` | 无 | 发布兼容门禁的 `mcp-schemas` 一面（`scripts/compat-check.mjs:9,46`） |

已有的规矩（不是本稿新加的）：

- **Plan JSON `version: 1` 只增不改**：字段只加、可选，永不改名、改型、删除（`.claude/rules/plan-json.md`）。发布兼容门禁 `plan-schema` 对上一个已发布核心做只增比较（`scripts/compat-check.mjs:978`，套件里由 `test/release-compat.test.ts` 跑）；删除要在 `[Unreleased]` 写一行 `BREAKING: plan-schema: …` 并发 major。
- **公开导出**：`src/index.ts` 只增；删一个导出先走弃用（`@deprecated` 加一行 CHANGELOG），改一个承诺过的签名或语义是 major（ADR 0031 第 80-102 行）。
- **语言形式**：弃用在 1.x 里是只给提示、不破坏（`W_WHILE_DEPRECATED`、`W_REASSIGN_DEPRECATED`），移除在 2.0（ADR 0021 决定 2、3；`docs/error-codes.md` 的两行）。
- **`$id` 是对外 URL**：ADR 0019 把 schema 的 `$id` 与 sitemap、README 永久链接并列为"一换主机就要全仓库重生成"的 URL（第 20-21 行），浏览器里的校验器按 `$id` 取 schema（第 169 行），并记下迁移时"no URL moved, so the schema `$id`s … are untouched"（第 196 行）。`docs/hosting-and-domains.md` 第 418-432 行写了改 URL 时的重生成与核对步骤。

两处空缺，本稿要补：

1. **门禁不看 `$id`。** `compareJsonSchemas`（`scripts/compat-check.mjs:787` 起）比较 `type`、界限、`pattern`、`enum`、`const`、`$ref`、`required` 与各层 `properties`，不比较 `$id`。今天把 `$id` 改成别的值，`plan-schema` 一面不报。
2. **`docs/hosting-and-domains.md:321` 说 `$id` "is what `src/plan-json.ts` writes into every Plan JSON document"。** 读代码不是这样：`planToJson` 的文档对象从 `version: 1` 开始（`src/plan-json/to-json.ts:354-356`），不写 `$schema` 或 `$id`；写出这个 URL 的是 MCP `compile` 的响应信封（`packages/mcp/src/tools.ts:462`）。这是记录漂移，CR11a 顺手改正那一句。

## 2. 要定的事与建议

### 2.1 `$id` 跟什么版本走

| 选项 | 说明 | 评价 |
|---|---|---|
| A. 跟 npm 包版本（`…/1.60.0/plan.schema.json`） | 每次发布一个新 `$id` | 不取。Plan JSON 在同一个 `version: 1` 里只增不改，按包版本分 `$id` 会让每个 minor 都换身份，下游缓存、`$ref` 与编辑器关联每次都失效，却没有任何不兼容 |
| B. 跟格式主版本（Plan JSON 的 `version`） | 只有破坏性变更才换 `$id` | **建议。** 与 `.claude/rules/plan-json.md` 的只增规则同构：同一个 `$id` 之下，旧文档在新 schema 下永远合法 |
| C. 不带版本 | 今天的样子 | 不取作新 schema 的做法：CR11（`../../checker-reach/README.md:136`）明说"schema 用带版本的 `$id`" |

**建议 B**（协调者的决定，不碰铁律）。

### 2.2 `$id` 的值（建议值）

- 新 schema 的格式：`https://archlang.uk/schemas/<name>/v<major>.schema.json`。保留 `.schema.json` 后缀，编辑器按这个后缀认 schema；`schemas/` 一层与仓库目录同名，站点根不再加平铺文件。**这个命名空间需要所有者裁定**（§3）：一旦发布，按 ADR 0019 它就是不能再搬的公开 URL。
- 规则集 schema（RM1.6a 的 `lint --rules --json`）：`https://archlang.uk/schemas/lint-rules/v0.schema.json`。`v0` 表示草案，形状还可以变；RM1.6b 落地后定为 `v1`。在命名空间裁定之内，取哪个名字是协调者的决定（新 URL，不动任何已有 URL）。
- Plan JSON 与 Intent：**今天的 `$id` 不改。** 建议把 `https://archlang.uk/plan.schema.json` 记为"Plan JSON 主版本 1 的 `$id`"，同一个文件另放一份在 `https://archlang.uk/schemas/plan/v1.schema.json`（字节相同，`$id` 仍是旧值），这样新旧两条路都能取到，`$id` 一个字节都不动。Intent 同理（`v1`）。**是否把这两个 `$id` 改成带版本的值：需要所有者裁定。** 理由：ADR 0019 把这两个 URL 写成浏览器校验器取用的规范地址，`$id` 又出现在 MCP 的响应里（`packages/mcp/src/tools.ts:462`，改它会动 MCP 输出并要一次 `packages/mcp` bump）；改值等于改 ADR 0019 记下的对外承诺。本稿的建议是不改，所以默认不需要这条裁定，只有想改时才提。
- Scene3D：`https://archlang.uk/schemas/scene3d/v0.schema.json` 换掉 `example.invalid` 占位。它在另一个包里、0.x 发布、没有对外承诺过 URL，换掉占位是**协调者的决定**，新值的形状随上面命名空间的所有者裁定；要不要真的把文件放上 docs 站，另由 `packages/archlang-3d` 的维护定，在放上站点之前 `$id` 也可以先改（`$id` 是标识，不要求可取）。
- MCP 工具 schema：不加 `$id`。它们由 MCP 协议在 `tools/list` 里内联传递，没有被别处 `$ref`，`mcp-schemas` 一面已经守住只增。

### 2.3 变更政策（写进 `GOVERNANCE.md`，CR11a 交付）

`GOVERNANCE.md` 今天有五节（Overview、Roles、Decision Making、Becoming a Maintainer、Changes to Governance），没有任何 schema、语言形式或弃用的条文。建议加一节"Compatibility and deprecation"，内容如下（英文写进 `GOVERNANCE.md`，这里给中文要点）。**这一节是对外承诺，需要所有者裁定（§3）**：`GOVERNANCE.md` 的 "Changes to Governance" 写明治理的改动由 lead maintainer 决定；第 2 条（旧主版本的 schema 文件永不删）和 §2.2 的 `archlang.uk/schemas/<name>/v<n>` 命名空间又是 ADR 0019 意义上不能再搬的公开 URL；第 3 条给了至少一个 minor 的弃用窗口。

1. **同一主版本内只增不改。** 一个 `$id` 之下：只加可选字段、只放宽枚举与界限；不改名、不改型、不删、不收紧。已有工具守着 Plan JSON（`plan-schema`）、MCP 工具（`mcp-schemas`）、公开类型（`public-types`）与错误码（`error-codes`）四面（`scripts/compat-check.mjs:46`）。
2. **破坏性变更 = 新主版本 = 新 `$id`。** 同一 PR 在 `[Unreleased]` 写 `BREAKING:` 行，核心发 major；旧主版本的 schema 文件继续在旧 URL 上提供，不删。
3. **弃用先于移除。** 字段：在 schema 的 `description` 里写 "Deprecated: …" 并加 `deprecated: true`（JSON Schema 2020-12 的注解关键字），至少经过一个 minor，在下一个主版本才删。语言形式：1.x 里发一条 `W_*_DEPRECATED`，2.0 才删（ADR 0021 的先例）。公开导出：`@deprecated` 加一行 CHANGELOG（ADR 0031）。
4. **草案（`v0`）不受第 1 条约束**，但每次改形状都在 CHANGELOG 记一行；从 `v0` 到 `v1` 本身就是一次声明，之后按第 1 条。
5. **`$id` 进门禁。** CR11a 给 `compareJsonSchemas` 加一项：`$id` 变了而 `[Unreleased]` 没有对应的 `BREAKING:` 行就报。这是对 §1 空缺 1 的补，属于测试/工具，不改任何输出。

### 2.4 CR11a 的证明怎么写

卡里的证明是"已发布的 schema 文件都带 `$id`，一条测试从 schema 目录派生清单并断言"。建议的清单来源：`scripts/generators.ts` 的 `GENERATORS` 里产出 `*.schema.json` 的行，加上 `packages/archlang-3d/src/scene3d/scene3d.schema.json`；测试断言每个文件有 `$id`、`$id` 以 `https://archlang.uk/` 开头（Scene3D 换掉占位之后），且新 schema 的 `$id` 匹配 `/schemas/<name>/v<n>.schema.json`。不从文件名硬写清单。

## 3. 需要所有者裁定的

**已裁定（RM-D30，2026-11-12，受托，所有者可一句话推翻）：照本节建议采纳。** 旧主版本的 schema 文件留在原 URL、永不删除；字段弃用至少一个 minor；命名空间 `archlang.uk/schemas/<name>/v<n>`；现有两个 `$id` 不改；CR11a 的 PR 把政策写进 `GOVERNANCE.md`。下面是当时摆出的原文。

- 把 Plan JSON、Intent 两个现有 `$id` 改成带版本的值（§2.2）。本稿建议**不改**；只有决定要改时才需要这条裁定，因为它动 ADR 0019 记下的规范 URL 和 MCP 的输出。

- **写进 `GOVERNANCE.md` 的政策（§2.3）与新 schema 的命名空间（§2.2）。** 三项对外承诺：旧主版本的 schema 文件永不删除（§2.3 第 2 条）；字段弃用至少经过一个 minor（第 3 条）；`https://archlang.uk/schemas/<name>/v<n>.schema.json` 这个命名空间。理由：`GOVERNANCE.md` 的 "Changes to Governance" 写明治理的改动由 lead maintainer 决定；ADR 0019 把 schema 的 `$id` 列为一换就要全仓库重生成的公开 URL，所以命名空间一旦发布就搬不动。所有者裁定之前，CR11a 不写 `GOVERNANCE.md` 这一节，也不发布任何 `/schemas/` 下的 URL。

其余（`$id` 跟主版本走、规则集取 `v0`、Scene3D 的 `$id` 换掉 `example.invalid` 占位〔新值落在上面的命名空间里，随那条裁定〕、门禁加 `$id`）都是协调者的决定。

## 4. 不做

- 不在 CR11a 里发 `lang-1.0`（那是 CR11b）。
- 不改任何现有 schema 的字段（CR11a 的"不许"）。
- 不给 `describe --json`、`lint --json` 补 schema：它们今天没有 schema，补不补是另一张卡。
