# AIDA 模型设置页设计

日期：2026-11-10
状态：已确认并实现

## 目标

在 AIDA 前台提供可视化的模型配置页面：增删改自定义模型、从服务商拉取模型列表、测试连接、设置默认模型。设置页配置与环境变量（`AI_MODELS` / `AI_API_*`）合并生效，自定义模型优先，环境变量模型只读展示。

不包含：登录页、供应商预设模板、按模型配置 temperature/max_tokens 等推理参数。

## 已确认决策

- 合并展示：自定义模型在前，环境变量模型在后且不可编辑；删光自定义模型后自动回退环境变量。
- 完整 Agent 式交互：填写 → 拉取模型列表（失败可手填）→ 测试连接 → 保存 → 设为默认。
- API Key 必填；服务端保存，接口只返回掩码，不回传明文。
- 沿用现有鉴权：所有 `/api/ai-models/*` 位于 `authGate` 之后；本机免密，远程需 `ACCESS_PASSWORD`。

## 数据模型

自定义模型与默认模型保存在独立安全存储中，避免 API Key 进入现有 `access: 'public'` 的集合存储：

- 本地：`data/ai-models.json`，写入后权限为 `0600`
- Vercel：私有 Blob `secure/ai-models.json`（`access: 'private'`），读取使用 `get(..., { access: 'private' })`

文件结构：

```json
{
  "models": [
    {
      "id": "a1b2c3d4-...",
      "label": "豆包 Vision",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "apiKey": "secret",
      "model": "doubao-vision",
      "createdAt": 1794291908025,
      "updatedAt": 1794291908025
    }
  ],
  "defaultModelId": "a1b2c3d4-..."
}
```

- `id` 由服务端 `crypto.randomUUID()` 生成，客户端不可指定。
- `baseUrl` 去除末尾 `/`，仅允许 http/https，禁止 URL 内嵌用户名/密码。
- `label` 可为空，保存时回退为 `model`。
- 读改写使用 `withCollectionLock("__ai_models_secure__")`，与现有集合锁一致，避免并发写丢失。

校验规则：`baseUrl` 必须是合法 http/https URL；`apiKey` 新建时必填；`model` 必填；`label` 为空时回退 `model`。非法输入返回 400，id 不存在返回 404，环境变量模型不能通过删除接口移除（404）。

## 模型解析

新增异步函数（替换当前同步 `resolveAiModels`）：

1. 读取自定义模型并映射为 `source: "custom"`。
2. 解析环境变量 `AI_MODELS`（含单模型与旧 `ARK_*` 回退），映射为 `source: "env"`，id 为模型 ID。
3. 自定义在前、环境变量在后；去重不存在冲突（自定义 id 为 UUID）。
4. 默认模型：`aiSettings.defaultModelId` 存在且可用 > 第一个可用自定义模型 > 第一个可用环境变量模型 > 第一个模型。
5. `configured` 定义保持现状：`apiKey && model` 为真。自定义模型保存时已强制校验，恒为可用。

`/api/analyze/ui` 的 `modelId` 可选：缺省使用默认模型；给定但不存在返回 400；存在但未配置返回 400 并说明原因。请求头仅在 `apiKey` 非空时发送 `Authorization: Bearer`。

## API

所有路由挂载在 `authGate` 之后。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/ai-models` | 脱敏列表 + 默认模型 + 是否可用 |
| `POST` | `/api/ai-models` | 新建自定义模型 |
| `PUT` | `/api/ai-models/:id` | 更新；`apiKey` 缺省或空字符串表示保持原值 |
| `DELETE` | `/api/ai-models/:id` | 删除；若为默认则清除默认设置 |
| `PUT` | `/api/ai-models/default` | `{ modelId }`，允许自定义或环境变量模型 |
| `POST` | `/api/ai-models/test` | 测试连接，返回 `{ ok, latencyMs, error? }` |
| `POST` | `/api/ai-models/fetch-models` | 代理 `GET {baseUrl}/models`，返回模型 ID 列表 |

### `GET /api/ai-models` 响应

```json
{
  "models": [
    {
      "id": "a1b2c3d4-...",
      "label": "豆包 Vision",
      "model": "doubao-vision",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "source": "custom",
      "configured": true,
      "apiKeyHint": "••••cret",
      "isDefault": true
    }
  ],
  "defaultModelId": "a1b2c3d4-...",
  "aiConfigured": true
}
```

- 环境变量项 `source: "env"`，同样返回 `apiKeyHint`，不返回明文。
- `/api/config` 保持轻量：`{ models: [{ id, label, configured, source }], defaultModelId, aiConfigured }`。

### 测试连接

请求字段：`{ id?, baseUrl?, apiKey?, model? }`。

- 带 `id` 时读取已保存配置，请求中非空字段覆盖（用于编辑时测试未保存的改动）。
- 无 `id` 时 `baseUrl`、`apiKey`、`model` 必填。
- 调用 `POST {baseUrl}/chat/completions`，`messages: [{ role: "user", content: "ping" }]`，`max_tokens: 8`，`temperature: 0`，超时 15 秒。
- 成功返回 200 `{ ok: true, latencyMs }`；连通失败返回 200 `{ ok: false, latencyMs, error }`；参数非法返回 400。
- 限流 20 次/分钟，不记录密钥。

### 拉取模型

请求字段：`{ id?, baseUrl?, apiKey? }`，带 `id` 时缺省字段取已保存值。

- 调用 `GET {baseUrl}/models`，Bearer 鉴权，超时 15 秒。
- 成功返回 `{ models: string[] }`；失败返回 502 `{ error }`，前端保留手填入口。
- 限流 20 次/分钟。

## 安全

- API Key 只存在于服务端数据文件/Blob；任何 GET 响应、日志、错误信息中都不得出现明文。
- 密钥在磁盘/Blob 中为明文，信任边界与现有 `.env` 相同；请限制数据目录访问权限并定期备份。
- 掩码规则：`••••` + 最后 4 位；长度不足 4 时全部掩码。
- Base URL 只允许 http/https，禁止 URL 凭据；允许私有地址（本地 Ollama / LM Studio），因为配置入口仅对已鉴权用户开放。
- 设置接口为单用户管理语义，与现有项目数据相同信任边界。
- 超时与错误信息截断，避免把上游响应中的敏感信息整段透传。

## 前端

### 路由与入口

- 新路由 `/settings`，页面组件 `src/pages/ModelSettings.tsx`。
- 项目列表头部增加齿轮按钮；Checker 顶部工具栏增加齿轮入口，跳转同一页面。
- 设置页使用现有深浅色变量，桌面优先，窄屏单列；提供返回项目列表按钮。

### 页面结构

- 标题区：设置 / 模型，说明「用于 AI 差异分析的视觉模型」。
- 模型列表（卡片）：
  - 名称、来源徽标（自定义 / 环境变量）、默认徽标。
  - 模型 ID、Base URL 域名、密钥掩码。
  - 操作：设为默认、测试连接、编辑、删除；环境变量项只读并提示「请修改服务端环境变量」。
- 添加按钮打开弹窗：
  - 字段：名称、Base URL、API Key（密码输入 + 显示切换）、模型 ID。
  - 「拉取模型」：调用 fetch-models，成功后以可搜索下拉展示；失败提示并保留手填。
  - 「测试连接」：显示测试中、成功（耗时）、失败（原因）。
  - 保存时前端校验必填项；编辑时 Key 留空表示不修改。
- 删除使用二次确认；删除默认模型后列表自动显示新的默认。
- 加载、空态、错误、成功提示均使用页面内联状态，不引入新依赖。

### 组件拆分

- `ModelSettings.tsx`：数据加载、增删改、默认设置、页面布局。
- `AiModelForm.tsx`：新增/编辑弹窗与测试、拉取交互。
- 表单状态只保留在组件内部，保存成功后由页面重新拉取列表。

## 错误与边界

- 无任何模型：列表空态说明「添加自定义模型，或配置服务端 AI_MODELS」；Checker 仍显示 `AI`。
- 测试/拉取失败不阻断手动保存。
- 删除模型后，Checker localStorage 中失效的选择回退到默认模型。
- 设置页请求失败显示可重试错误条；401 沿用现有行为（应用暂未提供登录页）。
- 并发写由集合锁串行化。

## 测试

后端集成测试（Vitest + Supertest，临时数据目录）：

- 新建、更新、删除自定义模型；响应与列表不含明文 Key。
- 更新时 Key 留空保持原值。
- 自定义 + 环境变量合并顺序、默认模型选择与删除后的回退。
- `/api/config` 返回合并列表与来源。
- 分析请求按 `modelId` 命中自定义模型的 baseUrl/key；未知模型 400。
- 测试连接与拉取模型：mock fetch 验证 URL、鉴权、超时参数与错误透传；无 Key 时 400。
- 设置接口未授权时由现有 authGate 拦截。

前端验证：

- `npm run lint`、`npm run build`。
- 临时数据目录 + 假 OpenAI 服务，浏览器走通：添加 → 测试成功 → 设默认 → Checker 下拉出现 → 分析请求命中新模型 → 删除 → 回退环境变量/默认。
- 无模型、拉取失败、Key 脱敏、窄屏布局人工检查。

## 文档

- README：新增设置页说明、模型管理 API、`aiModels` / `aiSettings` 集合、安全说明（Key 服务端存储与掩码）。
- `.env.example`：注明环境变量模型仍受支持，设置页自定义模型优先。
- 评审报告：更新 I7 状态描述。

## 备注

- 当前仓库 `.git` 指向不存在的 worktree，无法提交 spec；文档直接落盘。
