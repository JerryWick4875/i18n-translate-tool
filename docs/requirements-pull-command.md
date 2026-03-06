# Pull 命令需求文档

## 背景

在 `submit` 命令提交未翻译词条到 GitLab 后，翻译人员会在远程分支上修改翻译文件，完成后推送到一个新的分支。需要一个新的命令来拉取这些翻译并填充回本地代码。

## 核心需求

### 功能目标
从 GitLab 仓库的指定分支拉取翻译完成的文件，验证后填充回本地代码中。

### 命令名称
`pull` - 拉取翻译并填充回本地

### 参数设计
```bash
i18n-translate-tool pull --branch <branch-name> [options]
```

**必需参数:**
- `--branch <branch-name>`: 指定要拉取的 GitLab 分支名称

**可选参数:**
- `--target <language>`: 目标语言代码 (默认: en-US)
- `--filter <path>`: 过滤到特定目录 (例如: app/shop)
- `--dry-run`: 预览模式，不实际修改文件
- `--force`: 强制覆盖已有的翻译值
- `--config <path>`: 配置文件路径 (默认: .i18ntoolrc.js)
- `--verbose`: 启用详细输出

## 核心逻辑

### 1. 验证机制（三重匹配）

填充翻译时必须同时满足以下三个条件：

1. **文件路径匹配**
   - 远程文件路径需要映射到本地的扫描模式
   - 例如：远程 `app/shop/config/products/widget/locales/en-US/translations.yml`
   - 对应本地 `app/shop/config/products/widget/locales/en-US/translations.yml`

2. **Key 匹配**
   - 远程文件中的 key 必须在本地目标语言文件中存在
   - Key 名称完全相同

3. **中文文案匹配**
   - 远程基础语言文件中的中文文案
   - 必须与本地当前基础语言文件中的中文文案一致
   - **目的**: 防止 key 被重新用于其他文案

### 2. 工作流程

```
1. 从 GitLab 指定分支读取文件列表
   ├─ 读取目标语言文件（如 en-US）
   └─ 读取基础语言文件（如 zh-CN）

2. 对每个文件进行处理
   ├─ 将远程路径映射到本地路径
   ├─ 读取本地对应的基础语言文件
   ├─ 读取本地对应的目标语言文件
   ├─ 验证三重匹配条件
   └─ 收集有效的翻译条目

3. 填充翻译到本地文件
   ├─ 验证通过：更新翻译值
   ├─ 验证失败：跳过并记录原因
   └─ 保持文件格式和顺序

4. 输出结果报告
   ├─ 成功填充的条目数
   ├─ 跳过的条目数及原因
   └─ 修改的文件列表
```

### 3. 路径映射逻辑

**重要**：远程文件路径与本地文件路径完全一致。

**远程文件结构**（GitLab 仓库）:
```
{relativePath}
```

**本地文件结构**:
```
{relativePath}
```

例如：
- 远程：`app/shop/config/products/widget/locales/en-US/translations.yml`
- 本地：`app/shop/config/products/widget/locales/en-US/translations.yml`

无需路径转换，直接使用相对路径即可定位本地文件。

### 4. 验证失败场景

验证失败指三重验证中任何一项不匹配，命令继续处理其他词条，不整体失败。

| 场景 | 处理方式 |
|------|---------|
| 本地文件不存在 | 创建新文件（包括目录结构） |
| Key 不存在 | 跳过，记录警告 |
| 中文文案不匹配 | 跳过，记录警告（可能 key 被重新使用） |
| 翻译值为空 | 跳过，记录信息 |
| 本地已有翻译值 | 跳过，除非使用 --force |

## 技术实现要点

### 1. GitLab API 使用
- 使用 `@gitbeaker/rest` 读取分支上的文件
- 需要处理路径编码和分页

### 2. 本地文件操作
- 复用 `LocaleScanner` 扫描本地文件
- 复用 `YamlHandler` 读写 YAML 文件
- 保持 YAML 格式一致性（引号、缩进等）

### 3. 安全性考虑
- 三重匹配确保数据一致性
- dry-run 模式预览变更
- 详细的日志记录所有操作

### 4. 性能考虑
- 批量读取文件减少 I/O
- 缓存文件内容避免重复读取
- 合理的并发控制

## 配置需求

复用现有的 GitLab 配置：

```javascript
// .i18ntoolrc.js
{
  submission: {
    gitlab: {
      url: 'https://gitlab.example.com',
      project: 'group/project',
      token: process.env.GITLAB_TOKEN,
      basePath: 'i18n-translations'  // 远程仓库中的基础路径
    }
  }
}
```

## 输出示例

```
🚀 i18n-tool pull

📡 从 GitLab 拉取分支: translations-20260306-143022
分支: translations-20260306-143022
基础语言: zh-CN
目标语言: en-US

📁 处理文件...
  ✓ app/shop/config/products/widget/locales/translations.yml
    ✓ 填充 15 个词条
    ⚠ 跳过 2 个词条（中文文案不匹配）
  ✓ app/admin/locales/en-US/messages.yml
    ✓ 填充 8 个词条

✅ 拉取完成
  填充词条: 23
  跳过词条: 2
  修改文件: 2

📋 详细日志:
  - app/shop/.../translations.yml:15
    ⚠ key 'product.new_feature' 本地中文文案已变更
    ⚠ key 'user.settings' 本地中文文案已变更
```

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| GitLab 认证失败 | 提示检查 token |
| 分支不存在 | 提示检查分支名称 |
| 网络错误 | 提示网络问题，支持重试 |
| 文件格式错误 | 跳过文件，记录错误 |
| 本地文件冲突 | 提示使用 --force 或手动解决 |

## 测试用例

### 用例 1: 正常拉取
- 基础场景，所有验证通过
- 验证翻译正确填充

### 用例 2: 中文文案不匹配
- 模拟 key 被重新使用
- 验证正确跳过

### 用例 3: 文件路径变更
- 模拟本地文件结构变化
- 验证正确处理

### 用例 4: Dry-run 模式
- 验证不实际修改文件
- 验证输出正确预览

### 用例 5: Force 模式
- 验证覆盖已有翻译
- 验证警告提示
