# 翻译去重需求文档

## 背景和目标

当前在 `submit` 提交待翻译词条时，可能存在多个 key 对应相同的中文文案。这会导致：
1. 翻译人员需要重复翻译相同的内容
2. 增加翻译成本和时间
3. 可能导致同一文案在不同位置的翻译不一致

**目标**：实现翻译去重功能，确保相同的中文文案只翻译一次，然后在 `pull` 时将翻译应用到所有对应的 key。

## 当前问题

示例场景：

```yaml
# app/shop/config/products/widget/locales/zh-CN/common.yml
key1: "商品标题"
key2: "商品描述"

# app/shop/config/products/widget/locales/zh-CN/product.yml
key3: "商品标题"  # 与 common.yml 的 key1 相同
key4: "商品标题"  # 与 common.yml 的 key1 相同
key5: "价格"
key6: "商品描述"  # 与 common.yml 的 key2 相同

# app/checkout/locales/zh-CN/checkout.yml
key7: "商品标题"  # 与上面的相同
key8: "总计"
```

**同文件内重复**：

```yaml
# 同一个文件内也可能出现重复
# app/shop/config/products/widget/locales/zh-CN/common.yml
title: "商品标题"
page_title: "商品标题"  # 与 title 相同
heading: "商品标题"      # 与 title 相同
description: "商品描述"
```

当前 submit 会提交多份 "商品标题" 和 "商品描述" 给翻译人员，造成重复工作。

## 需求描述

### Submit 阶段
- 收集所有待翻译词条
- 识别具有相同中文文案的 key
- 为每个唯一文案生成唯一 ID（使用 hash）
- 只保留一个主 key 到远程仓库
- 生成映射文件，记录所有 key 之间的对应关系

### Pull 阶段
- 从远程拉取翻译文件和映射文件
- 读取本地文件进行三层校验
- 根据映射关系将翻译应用到所有对应的 key

## 技术方案

### Submit 流程

```
1. SubmissionExtractor 收集所有待翻译条目
2. DeduplicationCollector 按中文文案分组
3. 为每个唯一文案生成 hash 值作为 uniqueId
4. 确定每个 uniqueId 的主文件和主 key（保留到远程）
5. 生成去重后的翻译文件（只包含主 key）
6. 生成映射文件（记录 primaryKey 和 otherKeys）
7. GitLabClient 提交到远程
```

### Pull 流程

```
1. GitLabFetcher 拉取：
   - 远程翻译文件（en-US）
   - 远程中文文件（zh-CN）
   - 映射文件（_translation-mapping.yml）

2. MappingLoader 加载映射文件，解析出 primaryKey 和 otherKeys 的关系

3. TranslationValidator 复用现有校验逻辑：
   - 读取本地文件，校验文件和 key 是否存在
   - 比对本地 baseValue 与映射文件中的 baseValue 是否一致
   - 不匹配的 key 跳过并记录原因（与现有逻辑相同）

4. TranslationMerger 应用翻译：
   - 对于 primaryKey：直接应用远程翻译
   - 对于 otherKeys：根据映射找到 primaryKey 的翻译值并应用
```

## 映射文件格式

映射文件 `_translation-mapping.yml` 放在远程仓库根目录：

```yaml
version: "1.0"
generatedAt: "2025-01-06T12:30:45Z"
mappings:
  - uniqueId: "hash_abc123"
    baseValue: "商品标题"           # 用于第三层校验
    primaryKey:
      file: "app/shop/config/products/widget/locales/zh-CN/common.yml"
      key: "title"
    otherKeys:
      # 同文件内的其他 key
      - file: "app/shop/config/products/widget/locales/zh-CN/common.yml"
        key: "page_title"
      # 其他文件的 key
      - file: "app/shop/config/products/widget/locales/zh-CN/product.yml"
        key: "product_title"
      - file: "app/checkout/locales/zh-CN/checkout.yml"
        key: "checkout_title"

  - uniqueId: "hash_def456"
    baseValue: "商品描述"
    primaryKey:
      file: "app/shop/config/products/widget/locales/zh-CN/common.yml"
      key: "description"
    otherKeys:
      - file: "app/shop/config/products/widget/locales/zh-CN/product.yml"
        key: "product_description"
```

## 远程仓库文件结构示例

假设本地有以下需要翻译的文件：

```yaml
# app/shop/config/products/widget/locales/zh-CN/common.yml
title: "商品标题"
page_title: "商品标题"  # 同文件内重复
description: "商品描述"

# app/shop/config/products/widget/locales/zh-CN/product.yml
product_title: "商品标题"  # 跨文件重复
price: "价格"
product_description: "商品描述"  # 跨文件重复

# app/checkout/locales/zh-CN/checkout.yml
checkout_title: "商品标题"  # 跨文件重复
total: "总计"
```

去重后的远程仓库结构：

```
app/shop/config/products/widget/locales/zh-CN/common.yml
  title: "商品标题"         # 保留（主 key）
  description: "商品描述"   # 保留（主 key）

app/shop/config/products/widget/locales/zh-CN/product.yml
  price: "价格"            # 保留（不重复）

app/checkout/locales/zh-CN/checkout.yml
  total: "总计"             # 保留（不重复）

app/shop/config/products/widget/locales/en-US/common.yml
  title: ""                # 翻译人员填写
  description: ""

app/shop/config/products/widget/locales/en-US/product.yml
  price: ""

app/checkout/locales/en-US/checkout.yml
  total: ""

_translation-mapping.yml  # 映射文件
```

**主 key 选择规则**：
- 按文件路径和 key 名称排序，选择第一个作为主 key
- 其他共享相同文案的 key 作为 otherKeys
- 确保结果可预测和一致

## 数据结构设计

### 新增类型定义

```typescript
/**
 * 翻译映射文件结构
 */
interface TranslationMapping {
  version: string;
  generatedAt: string;
  mappings: MappingEntry[];
}

/**
 * 映射条目
 */
interface MappingEntry {
  uniqueId: string;        // 唯一 ID（hash 值）
  baseValue: string;       // 中文文案，用于校验
  primaryKey: KeyLocation; // 主 key（保留到远程）
  otherKeys: KeyLocation[] // 其他共享此翻译的 key
}

/**
 * key 位置信息
 */
interface KeyLocation {
  file: string;  // 文件相对路径
  key: string;   // key 名称
}

/**
 * 去重条目（提交时使用）
 */
interface DedupedEntry {
  uniqueId: string;
  baseValue: string;
  primaryKey: KeyLocation;
  otherKeys: KeyLocation[];
}

/**
 * 扩展的跳过条目（pull 时使用）
 * 复用现有的 SkippedEntry，无需修改
 */
interface SkippedEntry {
  filePath: string;
  key: string;
  reason: string;
}
```

## 需要新增和修改的组件

### Submit 阶段

**新增组件**：
- `DeduplicationCollector` - 收集并去重待翻译词条
- `MappingFileGenerator` - 生成映射文件
- `HashGenerator` - 生成文案的唯一 ID

**修改组件**：
- `SubmissionExtractor` - 新增 `extractWithDeduplication()` 方法
- `GitLabClient` - 支持提交映射文件到根目录

### Pull 阶段

**新增组件**：
- `MappingLoader` - 加载和解析映射文件

**修改组件**：
- `GitLabFetcher` - 拉取映射文件
- `TranslationValidator` - 实现三层校验逻辑
- `TranslationMerger` - 根据映射关系应用翻译

## 配置选项

需要在 `I18nConfig` 中新增配置：

```typescript
interface I18nConfig {
  // ... 现有配置

  // 提交功能配置
  submission?: {
    outputDir?: string;
    deduplication?: {
      enabled?: boolean;          // 是否启用去重，默认 true
      mappingFileName?: string;   // 映射文件名，默认 "_translation-mapping.yml"
    };
    gitlab?: {
      url: string;
      project: string;
      token: string;
      basePath?: string;
    };
  };
}
```

## 实现注意事项

1. **唯一 ID 生成**：使用稳定的 hash 算法（如 SHA-256），确保相同文案生成相同 ID
2. **主 key 选择**：选择第一个遇到的文件和 key 作为主 key，保持一致性
3. **空文件处理**：如果文件所有 key 都是共享的，远程文件可以为空或只包含注释
4. **映射文件版本**：添加 version 字段，便于未来格式升级
5. **增量更新**：支持后续只提交新增或修改的词条
6. **并发安全**：映射文件使用 YAML 格式，注意 Git 合并冲突
