# Xanadu API 查询指南

用于在配置 i18n-tool 前查询 Xanadu 平台的数据，如用户 ID、产品 ID、项目列表等。

## 前置要求

需要设置环境变量：

```bash
export XANADU_COOKIE="ep_jwt_token=<你的JWT_TOKEN>"
```

## 查询命令

### 1. 查询用户列表

获取所有用户及其 ID，用于配置 `manager`、`translation_docker`、`fe_docker` 等字段。

```bash
curl -s "http://i18n.sangfor.com/api/user/all_user" \
  -H "Cookie: $XANADU_COOKIE" | \
  node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log('用户列表：'); r.data?.list?.forEach(u=>console.log(\`  \${u.id.toString().padStart(4)} | \${u.name.padEnd(10)} | \${u.employee_id||''}\`))})"
```

**示例输出**：
```
用户列表：
    26 | 吴政琳      | 63027
    29 | 余文        | 19879
    30 | 张三        | 12345
```

---

### 2. 查询产品列表

获取所有产品及其 ID，用于配置 `product_id`。

```bash
curl -s "http://i18n.sangfor.com/api/product/all-product-list" \
  -H "Cookie: $XANADU_COOKIE" | \
  node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log('产品列表：'); r.data?.list?.forEach(p=>console.log(\`  \${p.id.toString().padStart(3)} | \${p.name}\`))})"
```

**示例输出**：
```
产品列表：
    1 | xanadu
    2 | SCP
    3 | SASE
   20 | XDR
   21 | aTrust
   26 | 组件中台
```

**常用产品 ID**：

| ID | 产品 |
|----|------|
| 20 | XDR |
| 21 | aTrust |
| 2  | SCP |
| 3  | SASE |

---

### 3. 查询项目列表

获取已有项目列表，用于查找可复用的 `xanadu-project-id`。

```bash
curl -s -X POST "http://i18n.sangfor.com/api/project/list" \
  -H "Cookie: $XANADU_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"limit":20,"page":1,"sort_by":"DESC","sort_type":"created_time","field":"all","product_id":"all","source_lang":"zh-CN","translation_lang":"en-US"}' | \
  node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log('项目列表：'); r.data?.list?.forEach(p=>console.log(\`  \${p.id.toString().padStart(5)} | \${(p.product_name||'').padEnd(10)} | \${(p.product_version||'').padEnd(10)} | \${p.stage||''}\`))})"
```

**示例输出**：
```
项目列表：
  1756 | XDR        | test       | ready
  1757 | XDR        | v1.2.0     | ready
```

---

### 4. 搜索特定用户

根据姓名搜索用户 ID：

```bash
# 将 "张三" 替换为要搜索的姓名
curl -s "http://i18n.sangfor.com/api/user/all_user" \
  -H "Cookie: $XANADU_COOKIE" | \
  node -e "let d=''; const name='张三'; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log(\`搜索 \"\${name}\" 的结果：\`); const users=r.data?.list?.filter(u=>u.name.includes(name)); users?.length?users.forEach(u=>console.log(\`  ID: \${u.id}, 姓名: \${u.name}, 工号: \${u.employee_id||''}\`)):console.log('  未找到')})"
```

---

### 5. 查询特定产品 ID

根据产品名称查找 ID：

```bash
# 将 "XDR" 替换为要搜索的产品名
curl -s "http://i18n.sangfor.com/api/product/all-product-list" \
  -H "Cookie: $XANADU_COOKIE" | \
  node -e "let d=''; const keyword='XDR'; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log(\`搜索 \"\${keyword}\" 的结果：\`); const products=r.data?.list?.filter(p=>p.name.toLowerCase().includes(keyword.toLowerCase())); products?.length?products.forEach(p=>console.log(\`  ID: \${p.id}, 名称: \${p.name}\`)):console.log('  未找到')})"
```

---

## 在 SKILL 中使用

直接告诉我你的需求：

| 需求 | 你说 |
|------|------|
| 查所有用户 | "帮我查一下 Xanadu 用户列表" |
| 查所有产品 | "查询产品 ID" |
| 查特定用户 | "找一下张三的用户 ID" |
| 查特定产品 | "XDR 对应的产品 ID 是多少" |
| 查已有项目 | "查询 Xanadu 项目列表" |

我会执行对应的 curl 命令并格式化输出结果。

---

## API 响应格式

### 用户列表响应

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
      }
    ]
  }
}
```

### 产品列表响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {"id": 20, "name": "XDR"},
      {"id": 21, "name": "aTrust"}
    ],
    "total": 35
  }
}
```

### 项目列表响应

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
        "level": "normal",
        "manager": {"id": 26, "name": "吴政琳"},
        "gitlab_project_id": 30536
      }
    ]
  }
}
```

---

## 配置参考

查询到数据后，填入 `.i18n-translate-tool-config.js`：

```javascript
submission: {
  xanadu: {
    // ...
    personnel: {
      prDockerId: 26,              // 从用户列表获取
      translationDockerId: 26,     // 从用户列表获取
      commitDockerId: 26,          // 从用户列表获取
      managerId: 26,               // 从用户列表获取
      feDockerId: 26,              // 从用户列表获取
    },
    project: {
      productId: 20,               // 从产品列表获取
      level: 'normal',
      versionType: 'oversea',
    },
  },
}
```
