# i18n 翻译工具 - API 请求流程文档

本文档详细记录了 i18n 项目管理系统中创建新项目和新增任务的完整 API 请求流程。

## 目录

1. [基础配置](#基础配置)
2. [创建新项目](#创建新项目)
3. [新增任务](#新增任务)
4. [完整流程图](#完整流程图)
5. [关键参数说明](#关键参数说明)

---

## 基础配置

### 认证信息

所有 API 请求都需要携带认证 Token，通过 Cookie 传递：

```
Cookie: ep_jwt_token=<JWT_TOKEN>
```

### 限流配置

```
x-ratelimit-limit: 1000      # 每小时1000次请求
x-ratelimit-remaining: 999    # 剩余次数
x-ratelimit-reset: <TIMESTAMP> # 重置时间戳
```

---

## 创建新项目

### 流程概览

```
页面加载 → 获取权限 → 获取项目列表 → 获取用户列表 → 获取产品列表 → 创建项目 → 刷新项目列表
```

### 详细请求流程

#### 1. 获取系统权限

**接口**: `GET /api/platform_module/all_permissions`

**功能**: 获取当前用户的权限配置

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "USER_MANAGE_ACCOUNT_ADD": "0,0",
    "USER_MANAGE_ACCOUNT_EDIT": "0,1",
    "USER_MANAGE_ACCOUNT_DEL": "0,2",
    "USER_MANAGE_ACCOUNT_READ": "0,3",
    "USER_MANAGE_ROLE_ADD": "0,4",
    "USER_MANAGE_ROLE_EDIT": "0,5",
    "USER_MANAGE_ROLE_DEL": "0,6",
    "USER_MANAGE_ROLE_READ": "0,7",
    "TERMBASE_ADD": "1,0",
    "TERMBASE_EDIT": "1,1",
    "TERMBASE_DEL": "1,2",
    "TERMBASE_READ": "1,3",
    "PROJECT_ADD": "2,0",
    "PROJECT_EDIT": "2,1",
    "PROJECT_DEL": "2,2",
    "PROJECT_READ": "2,3"
  }
}
```

---

#### 2. 获取初始项目列表

**接口**: `GET /api/project/list`

**功能**: 获取项目列表（分页）

**请求参数**:
```json
{
  "limit": 20,
  "page": 1,
  "sort_by": "DESC",
  "search": "",
  "sort_type": "created_time",
  "field": "all",
  "product_id": "all",
  "source_lang": "zh-CN",
  "translation_lang": "en-US"
}
```

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1756,
        "product_name": "XDR",
        "product_version": "test",
        "transfer_time": 1773718667096,
        "publish_time": 1773718667096,
        "level": "normal",
        "manager": {
          "id": 26,
          "name": "吴政琳",
          "employee_id": "63027"
        },
        "translation_docker": {
          "id": 26,
          "name": "吴政琳"
        },
        "gitlab_domain": "http://code.sangfor.org",
        "gitlab_project_id": 30536,
        "task_status": "0",
        "stage": "ready"
      }
    ]
  }
}
```

---

#### 3. 获取项目详情（可选）

**接口**: `GET /api/project/detail?id={project_id}`

**功能**: 获取指定项目的详细信息

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 1756,
    "stage": "ready",
    "product_version": "test",
    "gitlab_domain": "http://code.sangfor.org",
    "gitlab_project_id": 30536,
    "gitlab_project_new_branch": "feature-i18n-xanadu-auto-commit",
    "task_status": 0,
    "source_lang": "zh-CN",
    "translation_lang": "en-US",
    "version_type": "oversea"
  }
}
```

---

#### 4. 获取用户列表

**接口**: `GET /api/user/all_user`

**功能**: 获取系统所有用户，用于在表单中选择项目经理、翻译人员等

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 26,
        "name": "吴政琳",
        "email": "",
        "employee_id": "63027",
        "full_name": "吴政琳63027",
        "role_name": "普通用户",
        "is_enable": 1
      },
      {
        "id": 29,
        "name": "余文",
        "email": "yuwen@sangfor.com.cn",
        "employee_id": "19879",
        "role_name": "普通用户",
        "is_enable": 1
      }
    ]
  }
}
```

---

#### 5. 获取产品列表

**接口**: `GET /api/product/all-product-list`

**功能**: 获取所有产品列表，用于在创建项目时选择产品

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {"id": 1, "name": "xanadu"},
      {"id": 2, "name": "SCP"},
      {"id": 3, "name": "SASE"},
      {"id": 20, "name": "XDR"},
      {"id": 21, "name": "aTrust"}
    ],
    "total": 35
  }
}
```

---

#### 6. 创建新项目（核心接口）

**接口**: `POST /api/project/add`

**功能**: 创建新的翻译项目

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "id": 0,
  "gitlab_domain": "http://code.sangfor.org",
  "product_id": 20,
  "product_version": "test",
  "gitlab_project_id": "30536",
  "remark_info": "",
  "level": "normal",
  "version_type": "oversea",
  "start_time": 1773718667096,
  "transfer_time": 1773718667096,
  "publish_time": 1773718667096,
  "manager": 26,
  "translation_docker": 26,
  "fe_docker": 26,
  "source_lang": "zh-CN",
  "translation_lang": "en-US",
  "zh_device_address": "",
  "en_device_address": "",
  "design_draft_address": ""
}
```

**请求参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 固定为 0，表示新建 |
| gitlab_domain | string | 是 | GitLab 域名 |
| product_id | number | 是 | 产品 ID（从产品列表获取） |
| product_version | string | 是 | 产品版本 |
| gitlab_project_id | string | 是 | GitLab 项目 ID |
| remark_info | string | 否 | 备注信息 |
| level | string | 是 | 优先级："normal"、"high"、"low" |
| version_type | string | 是 | 版本类型："oversea"（海外）、"domestic"（国内） |
| start_time | number | 是 | 开始时间（Unix 毫秒时间戳） |
| transfer_time | number | 是 | 移交时间（Unix 毫秒时间戳） |
| publish_time | number | 是 | 发布时间（Unix 毫秒时间戳） |
| manager | number | 是 | 项目经理用户 ID |
| translation_docker | number | 是 | 翻译人员用户 ID |
| fe_docker | number | 是 | 前端负责人用户 ID |
| source_lang | string | 是 | 源语言 |
| translation_lang | string | 是 | 目标语言 |

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": "XDR"
}
```

---

#### 7. 刷新项目列表

**接口**: `POST /api/project/list`

**功能**: 创建成功后刷新项目列表

**请求体**: 同步骤 2

**响应**: 返回包含新项目的项目列表

---

## 新增任务

### 流程概览

```
获取用户列表 → 检查 GitLab 权限 → 获取分支列表 → 选择分支 → 创建任务 → 刷新项目列表
```

### 详细请求流程

#### 1. 获取用户列表

**接口**: `GET /api/user/all_user`

**功能**: 重新获取用户列表，用于在任务表单中选择相关人员

（详情见创建项目流程中的步骤 4）

---

#### 2. 检查 GitLab 权限

**接口**: `GET /api/gitlab/check-auth`

**功能**: 验证当前用户是否有权限访问指定的 GitLab 项目

**请求参数**:
```
domain=http://code.sangfor.org&projectId=30536
```

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "hasPermission": true,
    "message": "Token 有权限访问该项目"
  }
}
```

---

#### 3. 获取 GitLab 分支列表

**接口**: `GET /api/gitlab/branches`

**功能**: 获取指定 GitLab 项目的所有分支

**请求参数**:
```
domain=http://code.sangfor.org&id=30536&keyword=
```

**参数说明**:
- `domain`: GitLab 域名
- `id`: GitLab 项目 ID
- `keyword`: 搜索关键词（空字符串表示获取所有分支）

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {"name": "master"},
    {"name": "translations-20260312-151450"},
    {"name": "translations-20260312-153358"},
    {"name": "translations-20260312-161406"},
    {"name": "translations-20260312-161447"},
    {"name": "translations-20260316-184956"}
  ]
}
```

**分支命名规范**:
- 主分支: `master`
- 翻译分支: `translations-{YYYYMMDD}-{HHMMSS}`

---

#### 4. 搜索特定分支（可选）

**接口**: `GET /api/gitlab/branches`

**功能**: 根据关键词搜索特定分支

**请求参数**:
```
domain=http://code.sangfor.org&id=30536&keyword=translations-20260312-151450
```

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {"name": "translations-20260312-151450"}
  ]
}
```

---

#### 5. 创建任务（核心接口）

**接口**: `POST /api/task`

**功能**: 为指定项目创建新的翻译任务

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "id": 0,
  "type": "Front-End",
  "source_lang": "zh-CN",
  "translation_lang": "en-US",
  "file_id": 0,
  "gitlab_domain": "http://code.sangfor.org",
  "gitlab_project_id": 30536,
  "gitlab_project_branch": "translations-20260312-151450",
  "gitlab_project_yml_path": "app/xxx/config/locales/zh-CN/entries",
  "gitlab_project_yml_config_file": "",
  "pr_docker_id": 26,
  "zh_label": "zh-CN",
  "en_label": "en-US",
  "translation_docker_id": 26,
  "hope_delivery_time": 1773718909820,
  "expected_delivery_time": 1773718909820,
  "really_delivery_time": 1773718909820,
  "word_count": 0,
  "remark_info": "",
  "is_drop": 0,
  "commit_docker_id": 26,
  "project_id": 1756
}
```

**请求参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 固定为 0，表示新建 |
| type | string | 是 | 任务类型："Front-End"、"Back-End" 等 |
| source_lang | string | 是 | 源语言 |
| translation_lang | string | 是 | 目标语言 |
| file_id | number | 是 | 文件 ID，固定为 0 |
| gitlab_domain | string | 是 | GitLab 域名 |
| gitlab_project_id | number | 是 | GitLab 项目 ID |
| gitlab_project_branch | string | 是 | 使用的 GitLab 分支名称 |
| gitlab_project_yml_path | string | 是 | YAML 文件路径 |
| gitlab_project_yml_config_file | string | 否 | YAML 配置文件 |
| pr_docker_id | number | 是 | PR 负责人用户 ID |
| zh_label | string | 是 | 中文标签 |
| en_label | string | 是 | 英文标签 |
| translation_docker_id | number | 是 | 翻译人员用户 ID |
| hope_delivery_time | number | 是 | 期望交付时间（Unix 毫秒时间戳） |
| expected_delivery_time | number | 是 | 预期交付时间（Unix 毫秒时间戳） |
| really_delivery_time | number | 是 | 实际交付时间（Unix 毫秒时间戳） |
| word_count | number | 是 | 字数统计，初始为 0 |
| remark_info | string | 否 | 备注信息 |
| is_drop | number | 是 | 是否废弃：0-否，1-是 |
| commit_docker_id | number | 是 | 提交人员用户 ID |
| project_id | number | 是 | 所属项目 ID |

**响应示例**:
```json
{
  "code": 0,
  "msg": "success"
}
```

---

#### 6. 刷新项目列表

**接口**: `POST /api/project/list`

**功能**: 任务创建成功后刷新项目列表

（详情见创建项目流程中的步骤 2）

---

#### 7. 获取任务列表（可选）

**接口**: `GET /api/task/list/{project_id}`

**功能**: 获取指定项目的任务列表

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": []
}
```

---

## 完整流程图

### 创建新项目流程

```
┌─────────────────┐
│   页面加载      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取权限        │
│ /api/platform_  │
│   module/all_   │
│   permissions   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取项目列表    │
│ /api/project/   │
│      list       │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取用户列表    │
│ /api/user/      │
│   all_user      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取产品列表    │
│ /api/product/   │
│ all-product-list│
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  填写项目表单   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   创建项目      │
│  /api/project/  │
│       add       │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 刷新项目列表    │
│ /api/project/   │
│      list       │
└─────────────────┘
```

### 新增任务流程

```
┌─────────────────┐
│ 选择项目        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取用户列表    │
│ /api/user/      │
│   all_user      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 检查GitLab权限 │
│ /api/gitlab/    │
│   check-auth    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 获取分支列表    │
│ /api/gitlab/    │
│     branches    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 选择分支        │
│ (可选：搜索)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  填写任务表单   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    创建任务     │
│    /api/task    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 刷新项目列表    │
│ /api/project/   │
│      list       │
└─────────────────┘
```

---

## 关键参数说明

### 时间戳格式

所有时间参数均使用 **Unix 毫秒时间戳** 格式：

```javascript
// 示例：生成当前时间戳
const timestamp = Date.now(); // 1773718667096

// 示例：转换时间戳为日期
const date = new Date(1773718667096);
```

### 任务状态码

| 状态码 | 说明 |
|--------|------|
| 0 | 未开始 |
| 1 | 进行中 |
| 2 | 已完成 |
| 3 | 已废弃 |

### 项目级别

| 级别 | 说明 |
|------|------|
| normal | 普通 |
| high | 高 |
| low | 低 |

### 版本类型

| 类型 | 说明 |
|------|------|
| oversea | 海外版 |
| domestic | 国内版 |

### 任务类型

| 类型 | 说明 |
|------|------|
| Front-End | 前端 |
| Back-End | 后端 |

### GitLab 分支命名规范

- **主分支**: `master`
- **翻译分支**: `translations-{YYYYMMDD}-{HHMMSS}`
  - 示例: `translations-20260312-151450`

### 产品列表

常用产品 ID 参考：

| ID | 产品名称 |
|----|----------|
| 1 | xanadu |
| 2 | SCP |
| 3 | SASE |
| 4 | MSSP |
| 5 | IDaaS |
| 6 | SCC |
| 7 | HCI |
| 8 | AF |
| 20 | XDR |
| 21 | aTrust |
| 26 | 组件中台 |

---

## 错误处理

### 通用错误响应格式

```json
{
  "code": <错误码>,
  "msg": "错误信息",
  "data": null
}
```

### 常见错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| -1 | 参数错误 |
| -2 | 未授权 |
| -3 | 权限不足 |
| -4 | 资源不存在 |
| -5 | 服务器错误 |

---

## 注意事项

1. **认证**: 所有请求必须在 Cookie 中携带有效的 JWT Token
2. **限流**: API 有每小时 1000 次请求的限流限制
3. **时间戳**: 所有时间参数必须使用毫秒级时间戳
4. **ID 规则**: 创建新资源时，`id` 字段必须设置为 0
5. **GitLab 权限**: 创建任务前必须验证 GitLab 访问权限
6. **分支选择**: 建议使用已存在的翻译分支，格式为 `translations-{YYYYMMDD}-{HHMMSS}`
7. **人员配置**: 项目经理、翻译人员、前端负责人等字段必须提供有效的用户 ID

---

## 附录：完整 API 列表

### 项目管理

- `GET /api/project/list` - 获取项目列表
- `POST /api/project/list` - 获取项目列表（支持复杂筛选）
- `GET /api/project/detail?id={id}` - 获取项目详情
- `POST /api/project/add` - 创建新项目
- `POST /api/project/edit` - 编辑项目
- `POST /api/project/delete` - 删除项目

### 任务管理

- `GET /api/task/list/{project_id}` - 获取任务列表
- `POST /api/task` - 创建新任务
- `POST /api/task/edit` - 编辑任务
- `POST /api/task/delete` - 删除任务

### 用户管理

- `GET /api/user/all_user` - 获取所有用户

### 产品管理

- `GET /api/product/all-product-list` - 获取所有产品

### 权限管理

- `GET /api/platform_module/all_permissions` - 获取权限列表

### GitLab 集成

- `GET /api/gitlab/check-auth` - 检查 GitLab 权限
- `GET /api/gitlab/branches` - 获取 GitLab 分支列表

---

## 更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-03-17 | 初始版本，记录创建项目和新增任务的完整流程 |

---

## 联系方式

如有问题或建议，请联系开发团队。
