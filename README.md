# i18n-translate-tool

i18n 翻译同步和快照工具，用于管理多语言 YAML 文件的同步和变更追踪。

## 功能特性

- 🔍 **智能扫描**：基于 glob 模式查找本地化文件
- 📸 **快照管理**：创建基础语言快照作为同步基准
- 🔄 **变更同步**：自动检测新增、修改、删除的翻译键
- 🔄 **翻译复用**：自动查找并复用相同中文内容的现有翻译
- 🚀 **GitLab 集成**：提取翻译并提交到 GitLab 分支 (`submit-gitlab`)
- 🌐 **Xanadu 集成**：将 GitLab 翻译分支同步到 Xanadu 翻译平台 (`submit-xanadu`)
- 🎯 **灵活过滤**：支持按目录路径过滤处理范围
- ✅ **类型安全**：使用 TypeScript + Zod 进行配置校验

## 安装

```bash
npm install
npm run build
npm link  # 可选：全局安装
```

## 快速开始

### 1. 创建配置文件

在项目根目录创建 `.i18n-translate-tool-config.js`：

```javascript
module.exports = {
  // 扫描模式：支持命名通配符 (* as name)
  // 必须包含 (* as locale) 来指定语言代码位置
  scanPatterns: [
    'app/(* as app)/config/locales/(* as locale)/*.yml',
  ],

  // 基础/源语言
  baseLanguage: 'zh-CN',

  // 快照配置
  snapshot: {
    dir: 'i18n-translate-snapshot',
  },

  // 默认目标语言（可选）
  defaultTargets: ['en-US', 'ja-JP'],
};
```

### 2. 准备翻译文件

```
app/
└── shop/
    └── config/
        └── locales/
            ├── zh-CN/
            │   └── locales.yml
            └── en-US/
                └── locales.yml
```

### 3. 创建快照

```bash
i18n-translate-tool snapshot --target=en-US
```

### 4. 同步翻译

```bash
i18n-translate-tool sync --target=en-US
```

### 5. 复用翻译（新功能）

```bash
# 生成翻译复用建议
i18n-translate-tool reuse --target=en-US

# 一键应用唯一匹配的翻译
i18n-translate-tool reuse --apply --target=en-US
```

## 配置说明

### 基础配置

```javascript
module.exports = {
  // 基础配置（所有功能共用）
  baseLanguage: 'zh-CN',
  defaultTargets: ['en-US', 'ja-JP'],
  scanPatterns: [
    // 必须包含 (* as locale) 指定语言代码位置
    'app/(* as app)/config/locales/(* as locale)/*/*.yml',
  ],

  // 快照功能配置
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{target}.yml',
  },

  // 翻译复用功能配置
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
    ignoreValues: ['(i18n-no-translate)', '-', 'TODO'],
  },
};
```

### scanPatterns

扫描模式，用于匹配本地化文件路径。支持命名通配符语法：

```javascript
scanPatterns: [
  // 单层结构
  'app/(* as app)/config/locales/(* as locale)/*.yml',

  // 嵌套结构
  'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',

  // 多级嵌套（语言代码后有子目录）
  'app/(* as app)/config/locales/(* as locale)/*/*.yml',
]
```

**语法说明：**
- `(* as locale)` - **必须**包含，用于指定语言代码位置
- `(* as name)` - 捕获路径段并赋值给变量 `name`
- 普通的 glob 通配符（`*`, `**`）也可以使用

**重要：** `(* as locale)` 是必需的，工具依赖它来正确识别语言代码。如果配置中不包含 `(* as locale)`，会报错：
```
Scan pattern must include "(* as locale)" to specify language code.
```

### snapshot 配置

- `dir` - 快照文件存储目录（默认: `i18n-translate-snapshot`）
- `pathPattern` - 快照文件路径模式，支持变量替换

### reuse 配置

- `outputFile` - 翻译复用建议文件路径（默认: `.i18n-translate-tool-reuse.yml`）
- `ignoreValues` - 被视为"空值"的字符串列表

### submission 配置

用于 `submit-gitlab` 和 `submit-xanadu` 命令的 GitLab 和 Xanadu 集成配置。

```javascript
module.exports = {
  submission: {
    // 输出目录
    outputDir: 'i18n-translate-submission',

    // 去重配置（可选）
    deduplication: {
      enabled: true,
      mappingFileName: 'translation-mapping.json',
    },

    // GitLab 配置
    gitlab: {
      url: 'https://gitlab.example.com',
      projectId: 12345,           // GitLab 项目 ID（数字）
      token: process.env.GITLAB_TOKEN,
      basePath: '',               // 文件在仓库中的基础路径
      baseBranch: 'main',         // 创建分支的基线分支
      legacyUrlFormat: false,     // 老版本 GitLab URL 格式
    },

    // Xanadu 翻译平台配置
    xanadu: {
      url: 'https://i18n.sangfor.org',
      taskType: 'Front-End',
      sourceLang: 'zh-CN',
      targetLang: 'en-US',
      personnel: {
        prDockerId: 0,
        translationDockerId: 0,
        commitDockerId: 0,
        managerId: 0,       // 创建项目时使用
        feDockerId: 0,      // 创建项目时使用
      },
      project: {
        level: 'normal',        // normal | high | low
        versionType: 'oversea', // oversea | domestic
      },
    },
  },
};
```

**GitLab 配置说明：**
- `url` - GitLab 服务器地址
- `projectId` - GitLab 项目 ID（数字类型）
- `token` - GitLab API Token（建议通过环境变量 GITLAB_TOKEN 设置）
- `basePath` - 可选，文件在仓库中的基础路径
- `baseBranch` - 可选，创建分支的基线分支，默认 'main'
- `legacyUrlFormat` - 可选，使用老版本 GitLab URL 格式

**Xanadu 配置说明：**
- `url` - Xanadu 服务器地址（默认: https://i18n.sangfor.org）
- `taskType` - 任务类型（默认: Front-End）
- `sourceLang` - 源语言（默认: zh-CN）
- `targetLang` - 目标语言（默认: en-US）
- `personnel` - 人员配置（prDockerId, translationDockerId, commitDockerId, managerId, feDockerId）
- `project` - 项目配置（level, versionType）

## 命令使用

### snapshot - 创建快照

创建基础语言的快照，用于后续同步的基准。

```bash
i18n-translate-tool snapshot [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--filter <path>` - 过滤到特定目录（如 app/shop）
- `--config <path>` - 配置文件路径（默认: .i18n-translate-tool-config.js）
- `--verbose` - 启用详细输出
- `--dry-run` - 显示更改但不写入文件

**示例：**

```bash
# 为 en-US 创建快照
i18n-translate-tool snapshot --target=en-US

# 只处理 shop 应用
i18n-translate-tool snapshot --target=en-US --filter=app/shop

# 详细输出
i18n-translate-tool snapshot --target=en-US --verbose
```

### sync - 同步翻译

将基础语言的变更同步到目标语言。

```bash
i18n-translate-tool sync [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--filter <path>` - 过滤到特定目录（如 app/shop）
- `--config <path>` - 配置文件路径（默认: .i18n-translate-tool-config.js）
- `--verbose` - 启用详细输出
- `--dry-run` - 预览变更而不实际修改文件

**示例：**

```bash
# 同步到 en-US
i18n-translate-tool sync --target=en-US

# 只同步 shop 应用
i18n-translate-tool sync --target=en-US --filter=app/shop

# 预览变更
i18n-translate-tool sync --target=en-US --dry-run
```

### reuse - 复用翻译

自动查找并复用相同中文内容的现有翻译。

```bash
i18n-translate-tool reuse [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--filter <path>` - 过滤到特定目录
- `--output <path>` - 建议文件输出路径
- `--input <path>` - 建议文件输入路径
- `--apply` - 应用模式：应用建议文件中的翻译
- `--verbose` - 启用详细输出
- `--dry-run` - 显示更改但不写入文件

**三种使用模式：**

1. **生成模式** - 创建建议文件
```bash
i18n-translate-tool reuse --target=en-US
```

2. **应用模式** - 从建议文件应用翻译
```bash
i18n-translate-tool reuse --apply
```

3. **一键模式** - 生成并立即应用唯一匹配
```bash
i18n-translate-tool reuse --apply --target=en-US
```

### submit-gitlab - 提交到 GitLab

提取待翻译词条并提交到 GitLab 仓库。

```bash
i18n-translate-tool submit-gitlab [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--output <path>` - 输出目录（默认: i18n-translate-submission）
- `--branch <name>` - 指定分支名称（默认: translations-YYYYMMDD-HHMMSS）
- `--base-branch <name>` - 基线分支（默认: main）
- `--commit-msg <message>` - 提交消息
- `--config <path>` - 配置文件路径
- `--verbose` - 启用详细输出
- `--dry-run` - 预览变更

**配置示例：**
```javascript
module.exports = {
  submission: {
    outputDir: 'i18n-translate-submission',
    gitlab: {
      url: 'https://gitlab.example.com',
      projectId: 12345,           // GitLab 项目 ID（数字）
      token: process.env.GITLAB_TOKEN,
      basePath: '',               // 可选：文件在仓库中的基础路径
      baseBranch: 'main',         // 可选：创建分支的基线分支
      legacyUrlFormat: false,     // 可选：老版本 GitLab URL 格式
    },
  },
};
```

### submit-xanadu - 同步到 Xanadu 翻译平台

将 `submit-gitlab` 命令生成的 GitLab 翻译分支同步到 Xanadu 翻译平台，创建翻译任务。

**工作原理：**
1. 根据本地配置文件中的 `scanPatterns` 匹配 GitLab 分支中的文件
2. 自动提取匹配的 YML 文件所在目录路径
3. 多个路径用换行符拼接后传递给 Xanadu API

```bash
i18n-translate-tool submit-xanadu [选项]
```

**必需选项：**
- `--branch <name>` - GitLab 分支名称

**场景 A（已有项目）：**
- `--xanadu-project-id <id>` - Xanadu 项目 ID

**场景 B（创建新项目）：**
- `--create-project` - 创建新项目标志
- `--project-name <name>` - 项目名称（创建项目时使用，如: XDR-1.0.0）
- `--product-id <id>` - 产品 ID（可选，默认从配置读取）

**其他选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--config <path>` - 配置文件路径
- `--verbose` - 启用详细输出

**环境变量：**
```bash
export XANADU_TOKEN=your_jwt_token
```

**配置示例：**
```javascript
module.exports = {
  submission: {
    gitlab: {
      url: 'http://code.sangfor.org',
      projectId: 30536,
      token: process.env.GITLAB_TOKEN,
    },
    xanadu: {
      url: 'https://i18n.sangfor.org',
      taskType: 'Front-End',
      sourceLang: 'zh-CN',
      targetLang: 'en-US',
      personnel: {
        prDockerId: 26,
        translationDockerId: 26,
        commitDockerId: 26,
        managerId: 26,
        feDockerId: 26,
      },
      project: {
        productId: 20,          // 产品 ID（创建项目时使用）
        level: 'normal',        // normal | high | low
        versionType: 'oversea', // oversea | domestic
      },
    },
  },
};
```

**使用示例：**

场景 A - 使用已有项目创建任务：
```bash
i18n-translate-tool submit-xanadu \
  --branch translations-20260318-143000 \
  --yml-path "app/shop/config/locales/zh-CN/entries" \
  --xanadu-project-id 1756
```

场景 B - 创建新项目并创建任务：
```bash
i18n-translate-tool submit-xanadu \
  --branch translations-20260318-143000 \
  --yml-path "app/shop/config/locales/zh-CN/entries" \
  --create-project \
  --project-name "XDR-1.0.0"
```

### pull - 从 GitLab 拉取翻译

从 GitLab 仓库拉取翻译并填充到本地文件。

```bash
i18n-translate-tool pull [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--branch <name>` - GitLab 分支名称（必需）
- `--filter <path>` - 过滤到特定目录
- `--config <path>` - 配置文件路径
- `--verbose` - 启用详细输出
- `--dry-run` - 预览变更

**使用示例：**
```bash
i18n-translate-tool pull \
  --branch translations-20260318-143000 \
  --target=en-US \
  --filter=app/shop
```

## 工作流程

### 典型使用流程

1. **开发阶段**：在基础语言（如 `zh-CN`）文件中添加/修改翻译键

2. **创建快照**：
   ```bash
   i18n-translate-tool snapshot --target=en-US
   ```

3. **同步到目标语言**：
   ```bash
   i18n-translate-tool sync --target=en-US
   ```

4. **复用翻译**（可选）：
   ```bash
   # 自动填充相同中文内容的现有翻译
   i18n-translate-tool reuse --apply --target=en-US
   ```

5. **翻译**：翻译人员填充剩余的空字符串

6. **重复**：继续开发，重复步骤 1-5

### GitLab + Xanadu 集成工作流

适用于需要将翻译提交到 GitLab 并通过 Xanadu 平台进行翻译管理的场景：

1. **开发阶段**：在基础语言文件中添加/修改翻译键

2. **提取并提交到 GitLab**：
   ```bash
   # 提取待翻译词条并创建 GitLab 分支
   i18n-translate-tool submit-gitlab --target=en-US
   ```

3. **同步到 Xanadu 创建翻译任务**：
   ```bash
   # 场景 A: 使用已有 Xanadu 项目
   i18n-translate-tool submit-xanadu \
     --branch translations-20260318-143000 \
     --yml-path "app/shop/config/locales/zh-CN/entries" \
     --xanadu-project-id 1756

   # 场景 B: 创建新项目
   i18n-translate-tool submit-xanadu \
     --branch translations-20260318-143000 \
     --yml-path "app/shop/config/locales/zh-CN/entries" \
     --create-project
   ```

4. **翻译完成**：在 Xanadu 平台完成翻译后，翻译会自动提交回 GitLab

5. **拉取翻译到本地**：
   ```bash
   i18n-translate-tool pull \
     --branch translations-20260318-143000 \
     --target=en-US
   ```

6. **重复**：继续开发，重复步骤 1-5

### 同步行为说明

**新增键** - 在目标语言文件中添加空字符串
```yaml
# zh-CN
key1: "新功能"

# en-US (同步后)
key1: ""
```

**修改键** - 清空目标语言的现有翻译
```yaml
# zh-CN (变更前)
key1: "旧描述"
# en-US
key1: "Old description"

# zh-CN (变更后)
key1: "新描述"
# en-US (同步后)
key1: ""
```

**删除键** - 从目标语言文件中删除
```yaml
# zh-CN
# key1 已删除

# en-US (同步后)
# key1 也被删除
```

### 翻译复用行为

**唯一匹配** - 自动填充
```yaml
# zh-CN
common.yml: title: "产品标题"
widget.yml: title: ""  # 自动填充为 "Product Title"

# en-US
common.yml: title: "Product Title"
```

**多个匹配** - 生成建议供用户选择
```yaml
# zh-CN
ui.yml: button: "提交订单"
form.yml: submit: "提交订单"

# en-US
ui.yml: button: "Submit Order"
form.yml: submit: "Place Order"

# 建议：选择 "Submit Order" 或 "Place Order"
```

## 测试

运行测试套件：

```bash
npm test
```

测试覆盖：
- ✅ 配置加载和验证
- ✅ 快照创建
- ✅ 新增键同步
- ✅ 修改键同步
- ✅ 删除键同步
- ✅ 混合变更同步
- ✅ 多文件同步
- ✅ 产品结构同步
- ✅ 目录过滤
- ✅ 翻译复用（唯一匹配）
- ✅ 翻译复用（多个匹配）
- ✅ 翻译复用（应用翻译）
- ✅ 翻译复用（忽略值）
- ✅ 翻译复用（一键模式）
- ✅ GitLab 集成（URL 格式）
- ✅ 配置错误处理

## 常见问题

### Q: 如何只同步特定应用？

使用 `--filter` 选项：
```bash
i18n-translate-tool sync --target=en-US --filter=app/shop
```

### Q: 如何预览将要做的变更？

使用 `--dry-run` 选项：
```bash
i18n-translate-tool sync --target=en-US --dry-run
```

### Q: 快照文件存储在哪里？

默认存储在 `i18n-translate-snapshot` 目录中，可通过配置修改。

### Q: 如何处理多个产品模块？

在 scanPatterns 中使用多个命名通配符：
```javascript
scanPatterns: [
  'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
]
```

### Q: 配置校验失败怎么办？

检查配置文件是否满足以下要求：
- `scanPatterns` 必须是非空数组
- `baseLanguage` 必须是非空字符串
- 配置文件名必须为 `.i18n-translate-tool-config.js`

错误消息会指出具体的问题字段。

### Q: 翻译复用功能如何工作？

工具会扫描所有目标语言文件，查找相同中文内容的现有翻译：
- 如果只有一个翻译，自动填充
- 如果有多个翻译，生成建议供你选择
- 支持自定义忽略值列表（如 TODO、- 等）

### Q: 如何配置 Xanadu 集成？

1. 在配置文件中添加 `submission.xanadu` 配置（见配置说明）
2. 设置环境变量 `XANADU_TOKEN`：
   ```bash
   export XANADU_TOKEN=your_jwt_token
   ```
3. 确保 `submission.gitlab.projectId` 已配置（数字类型）

### Q: Xanadu 项目和 GitLab 项目的关系？

- `submission.gitlab.projectId` - GitLab 项目 ID（数字）
- `submission.xanadu` 中不包含项目 ID，需要通过 `--xanadu-project-id` 传入或 `--create-project` 创建
- 一个 GitLab 项目可以对应多个 Xanadu 项目（不同产品/版本）

### Q: submit-xanadu 命令的两种场景如何选择？

**场景 A**（`--xanadu-project-id`）：
- 已有 Xanadu 项目，只需创建新的翻译任务
- 适用于常规迭代，在现有项目中添加新任务

**场景 B**（`--create-project`）：
- 没有 Xanadu 项目，需要新建
- 适用于新项目首次接入 Xanadu

## 许可证

MIT
