# 提交翻译命令需求文档

## 功能概述

新增 `submit` 命令，用于提取待翻译词条并提交到 GitLab 仓库。

## 功能描述

### 1. 提取待翻译词条（无 --apply 参数）

**功能**：扫描目标语言的翻译文件，提取所有待翻译的词条（值为空的键值对），按照原项目结构输出到指定目录。

**规则**：
- 处理用户指定的目标语言（通过 `--target` 参数）和主语言（`baseLanguage`）
- 同时提取主语言和目标语言的文件，都只保留待翻译的词条（目标语言中值为空的键）
- 不生成空文件（如果文件中所有词条都已翻译，则不输出该文件）
- 保留原始目录结构（完整的相对路径）

**示例**：
```
主语言文件 (zh-CN.yml):
  key1: "值1"
  key2: "值2"
  key3: "值3"

目标语言文件 (en-US.yml):
  key1: "Value 1"
  key2: ""
  key3: ""

提取后:
  zh-CN.yml:
    key2: "值2"
    key3: "值3"
  en-US.yml:
    key2: ""
    key3: ""
```

**目录存在检查**：
- 如果输出目录已存在，**报错退出**并提示用户
- 提示信息包含：目录路径、使用 `--force` 强制覆盖的提示
- 使用 `--force` 参数时，清空现有目录并重新提取

**输出**：
- 提取的文件输出到配置的目录中
- YAML 格式由 `outputFormat` 配置控制（与 js-yaml 一致）：
  - `quotingType`: 引号类型（`'` 或 `"`，默认 `"`）
  - `forceQuotes`: 是否强制所有值加引号（默认 `true`）
  - `indent`: 缩进空格数（默认 `2`）
- 控制台输出提取的文件数量和词条数量统计

### 2. 提交到 GitLab（带 --apply 参数）

**功能**：将提取的待翻译词条通过 GitLab API 提交到远程仓库的新分支。

**行为模式**：

**一次性模式**（输出目录不存在）：
1. 先执行提取，生成本地文件
2. 然后将提取的文件提交到 GitLab

**应用模式**（输出目录已存在）：
1. 跳过提取步骤
2. 直接使用现有目录中的文件提交到 GitLab
3. 支持用户在提取后手动修改内容，然后再提交

**规则**：
- 分支名称：`translations-{datetime}`（datetime 格式：YYYYMMDD-HHmmss）
- 提交信息：固定为 `chore: 提交待翻译结构`
- 只推送到分支，不创建 Merge Request
- 不支持增量提交（每次都是全新分支和完整文件集）

**错误处理**：
- GitLab API 调用失败时直接报错退出
- 不做重试、回滚等容错处理
- 错误信息要清晰（认证失败、网络错误、仓库不存在等）

## 配置项

### 全局输出格式配置

`.i18n-translate-tool-config.js` 中新增 `outputFormat` 配置节（所有功能共用）：

```javascript
outputFormat: {
  // 引号类型（与 js-yaml 一致）
  quotingType: '"',  // 或 "'"（单引号）

  // 是否强制所有值加引号
  forceQuotes: true,

  // 缩进空格数
  indent: 2,
},
```

### Submit 功能配置

在 `.i18n-translate-tool-config.js` 中新增 `submission` 配置节：

```javascript
submission: {
  // 提取文件的输出目录（相对于项目根目录）
  outputDir: 'i18n-translate-submission',

  // GitLab 仓库配置
  gitlab: {
    // GitLab 实例 URL
    url: 'https://gitlab.example.com',

    // 项目 ID 或路径（如 group/project）
    project: 'group/i18n-translations',

    // 个人访问令牌（需要 api 和 write_repository 权限）
    token: process.env.GITLAB_TOKEN,

    // 目标仓库中的基础路径（可选，默认为空）
    basePath: '',
  },
}
```

## CLI 接口

```bash
# 提取待翻译词条
i18n-tool submit --target en-US

# 过滤到特定目录
i18n-tool submit --target en-US --filter app/shop

# 强制覆盖已存在的输出目录
i18n-tool submit --target en-US --force

# 提取并提交到 GitLab（一次性模式）
i18n-tool submit --target en-US --apply

# 使用已有目录提交到 GitLab（应用模式）
i18n-tool submit --target en-US --apply

# 指定配置文件
i18n-tool submit --target en-US --config .i18n-translate-tool-config.js

# 详细输出
i18n-tool submit --target en-US --verbose
```

## 参数说明

- `--target <language>`（必需）：目标语言代码（如 `en-US`、`ja-JP`），默认值 `en-US`
- `--filter <path>`（可选）：过滤到特定目录（如 `app/shop`），只处理该目录下的文件
- `--force`（可选）：强制覆盖已存在的输出目录
- `--apply`（可选）：提取后提交到 GitLab，或使用已有目录提交
- `--config <path>`（可选）：配置文件路径（默认 `.i18n-translate-tool-config.js`）
- `--verbose`（可选）：启用详细输出

## 核心类设计

### SubmissionExtractor

负责提取待翻译词条并生成输出文件。

**方法**：
- `extract(scanPatterns, baseLanguage, targetLanguage, outputDir)`：提取并生成文件

**输出文件规则**：
- 使用原始文件的相对路径
- 主语言和目标语言文件都只包含待翻译的词条
- 跳过空文件

### GitLabClient

负责与 GitLab API 交互（使用第三方库）。

**推荐库**：`@gitbeaker/node`（官方推荐的 GitLab API SDK）

**方法**：
- `createBranch(branchName, ref)`：创建新分支
- `commitFiles(branchName, files, commitMessage)`：提交文件到分支

**使用示例**：
```typescript
import { Gitlab } from '@gitbeaker/node';

const gitlab = new Gitlab({
  url: config.gitlab.url,
  token: config.gitlab.token,
});

// 创建分支
await gitlab.Branches.create(projectId, branchName, 'main');

// 提交文件
await gitlab.RepositoryFiles.commit(
  projectId,
  filePath,
  branchName,
  content,
  commitMessage
);
```

## 实现注意事项

1. **文件路径处理**：
   - 保持原始文件的相对路径结构
   - GitLab API 中文件路径需要进行 URL 编码
   - 路径分隔符统一使用 `/`

2. **YAML 格式一致性**：
   - 使用 js-yaml 的 dump 方法，应用 outputFormat 配置
   - quotingType、forceQuotes、indent 参数直接传递给 js-yaml

3. **日期时间格式**：
   - 使用本地时区
   - 格式：`YYYYMMDD-HHmmss`（如 `20250305-143022`）

4. **GitLab 认证**：
   - 使用 Personal Access Token
   - Token 需要 `api` 和 `write_repository` 权限

5. **依赖安装**：
   ```bash
   npm install @gitbeaker/node
   ```

6. **错误处理**：
   - GitLab API 调用失败时直接抛出错误
   - 不做重试、回滚等容错处理
   - 错误信息要清晰（认证失败、网络错误、仓库不存在等）

7. **性能考虑**：
   - 批量提交文件时可以考虑并行请求
   - 但需要注意 GitLab API 的速率限制

## 测试用例

### Case 1: 基础提取功能
- 输入：包含待翻译词条的多语言文件
- 期望：正确提取主语言和目标语言的待翻译词条，保持目录结构

### Case 2: 空文件过滤
- 输入：所有词条都已翻译的文件
- 期望：不生成输出文件

### Case 3: GitLab 提交（mock）
- 输入：提取的文件
- 期望：正确调用 GitLab API 创建分支和提交文件

### Case 4: 多语言支持
- 输入：同时处理多个目标语言
- 期望：每种语言独立提取和提交

## 后续扩展（暂不实现）

- 从 GitLab 拉取翻译内容并合并回项目
- 生成翻译进度报告
- 支持增量提交（只提交变更的文件）
- 支持创建 Merge Request
