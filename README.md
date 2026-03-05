# i18n-tool

i18n 翻译同步和快照工具，用于管理多语言 YAML 文件的同步和变更追踪。

## 功能特性

- 🔍 **智能扫描**：基于 glob 模式查找本地化文件
- 📸 **快照管理**：创建基础语言快照作为同步基准
- 🔄 **变更同步**：自动检测新增、修改、删除的翻译键
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

在项目根目录创建 `.i18ntoolrc.js`：

```javascript
module.exports = {
  // 扫描模式：支持命名通配符 (* as name)
  scanPatterns: [
    'app/(* as app)/config/locales/(* as locale)/*.yml',
  ],

  // 快照存储目录
  snapshotDir: '.i18n-snapshot',

  // 基础/源语言
  baseLanguage: 'zh-CN',

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
i18n-tool snapshot --target=en-US
```

### 4. 同步翻译

```bash
i18n-tool sync --target=en-US
```

## 配置说明

### scanPatterns

扫描模式，用于匹配本地化文件路径。支持命名通配符语法：

```javascript
scanPatterns: [
  // 单层结构
  'app/(* as app)/config/locales/(* as locale)/*.yml',

  // 嵌套结构
  'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',

  // 多级嵌套
  'app/(* as app)/config/locales/(* as locale)/*/*.yml',
]
```

**语法说明：**
- `(* as name)` - 捕获路径段并赋值给变量 `name`
- 普通的 glob 通配符（`*`, `**`）也可以使用

### snapshotDir

快照文件存储目录（相对于项目根路径）。

### snapshotPathPattern（可选）

快照文件路径模式，支持变量替换：

```javascript
snapshotPathPattern: '{app}/{product}/{target}.yml'
```

**可用变量：**
- 从 scanPatterns 提取的变量（如 `{app}`, `{product}`）
- `{target}` - 目标语言
- `{language}` - 目标语言（同 `{target}`）

### baseLanguage

基础/源语言代码，开发者使用的语言。

### defaultTargets（可选）

默认目标语言列表，便于快速同步。

## 命令使用

### snapshot - 创建快照

创建基础语言的快照，用于后续同步的基准。

```bash
i18n-tool snapshot [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--filter <path>` - 过滤到特定目录（如 app/shop）
- `--config <path>` - 配置文件路径（默认: .i18ntoolrc.js）
- `--verbose` - 启用详细输出
- `--dry-run` - 显示更改但不写入文件

**示例：**

```bash
# 为 en-US 创建快照
i18n-tool snapshot --target=en-US

# 只处理 shop 应用
i18n-tool snapshot --target=en-US --filter=app/shop

# 详细输出
i18n-tool snapshot --target=en-US --verbose
```

### sync - 同步翻译

将基础语言的变更同步到目标语言。

```bash
i18n-tool sync [选项]
```

**选项：**
- `--target <language>` - 目标语言代码（默认: en-US）
- `--filter <path>` - 过滤到特定目录（如 app/shop）
- `--config <path>` - 配置文件路径（默认: .i18ntoolrc.js）
- `--verbose` - 启用详细输出
- `--dry-run` - 预览变更而不实际修改文件

**示例：**

```bash
# 同步到 en-US
i18n-tool sync --target=en-US

# 只同步 shop 应用
i18n-tool sync --target=en-US --filter=app/shop

# 预览变更
i18n-tool sync --target=en-US --dry-run

# 详细输出
i18n-tool sync --target=en-US --verbose
```

## 工作流程

### 典型使用流程

1. **开发阶段**：在基础语言（如 `zh-CN`）文件中添加/修改翻译键

2. **创建快照**：
   ```bash
   i18n-tool snapshot --target=en-US
   ```

3. **同步到目标语言**：
   ```bash
   i18n-tool sync --target=en-US
   ```

4. **翻译**：翻译人员根据同步结果填充空字符串

5. **重复**：继续开发，重复步骤 1-4

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

## 配置示例

### 单层结构

**目录结构：**
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

**配置：**
```javascript
module.exports = {
  scanPatterns: [
    'app/(* as app)/config/locales/(* as locale)/*.yml',
  ],
  snapshotDir: '.i18n-snapshot',
  baseLanguage: 'zh-CN',
};
```

### 产品模块结构

**目录结构：**
```
app/
└── shop/
    └── config/
        └── products/
            ├── user/
            │   └── locales/
            │       ├── zh-CN/
            │       │   └── common.yml
            │       └── en-US/
            │           └── common.yml
            └── order/
                └── locales/
                    ├── zh-CN/
                    │   └── common.yml
                    └── en-US/
                        └── common.yml
```

**配置：**
```javascript
module.exports = {
  scanPatterns: [
    'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],
  snapshotDir: '.i18n-snapshot',
  snapshotPathPattern: '{app}/{product}/{target}.yml',
  baseLanguage: 'zh-CN',
};
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
- ✅ 配置错误处理

## 常见问题

### Q: 如何只同步特定应用？

使用 `--filter` 选项：
```bash
i18n-tool sync --target=en-US --filter=app/shop
```

### Q: 如何预览将要做的变更？

使用 `--dry-run` 选项：
```bash
i18n-tool sync --target=en-US --dry-run
```

### Q: 快照文件存储在哪里？

默认存储在 `.i18n-snapshot` 目录中，可通过配置的 `snapshotDir` 修改。

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
- `snapshotDir` 必须是非空字符串
- `baseLanguage` 必须是非空字符串

错误消息会指出具体的问题字段。

## 许可证

MIT
