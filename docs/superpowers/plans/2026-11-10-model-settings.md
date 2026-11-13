# AIDA 模型设置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AIDA 前台提供可视化模型设置页，支持自定义模型增删改、拉取模型、测试连接、设置默认，并与环境变量模型合并生效。

**Architecture:** 服务端新增独立安全存储（本地 `0600` 文件 / Vercel 私有 Blob），避免密钥进入当前 `access: 'public'` 的集合存储；专用 `/api/ai-models` 路由负责 CRUD、测试与拉取，模型解析异步合并自定义 + 环境变量。前端新增 `/settings` 页面与入口，复用现有深浅色与 Tailwind 风格。

**Tech Stack:** React 19、Vite 6、Tailwind 4、Express 4、TypeScript、Vitest + Supertest、@vercel/blob。

**Spec:** `docs/superpowers/specs/2026-11-10-model-settings-design.md`

## Global Constraints

- API Key 永不出现在任何 GET 响应、日志或错误信息中；只返回 `••••` + 末 4 位。
- 自定义模型 Key 必填；Base URL 仅 http/https 且禁止 URL 内嵌凭证。
- 自定义模型优先于环境变量；环境变量模型只读；删光自定义后回退环境变量。
- 设置接口全部位于 `authGate` 之后；测试/拉取限流 20 次/分钟。
- 不新增运行时依赖。
- 密钥存储：本地 `data/ai-models.json` 权限 `0600`；Vercel 使用私有 Blob `secure/ai-models.json`。

---

### Task 1: 安全存储与合并解析

**Files:**
- Create: `api/lib/aiModelStore.ts`
- Modify: `api/lib/aiConfig.ts`
- Test: `tests/aiModels.test.ts`

**Interfaces:**
- Produces:
  - `type AiModelSource = "custom" | "env"`
  - `interface EffectiveAiModel { id; label; baseUrl; endpoint; apiKey; model; source }`
  - `listAiModels(): Promise<EffectiveAiModel[]>`
  - `getDefaultModelId(models): Promise<string | null>`
  - `maskApiKey(key: string): string`
  - `resolveAiModel(modelId?: string): Promise<{ models; defaultModelId; config? }>`
  - `writeCustomModels(models, defaultModelId?): Promise<void>`（供路由使用）

- [ ] **Step 1:** 写失败测试：`GET /api/ai-models` 无配置返回空列表；写入两个自定义模型后返回脱敏列表且默认指向第一个。
- [ ] **Step 2:** 运行 `npx vitest run tests/aiModels.test.ts`，确认 404/失败。
- [ ] **Step 3:** 实现 `aiConfig.ts` 的 `resolveEnvAiModels`（从现有 `resolveAiModels` 重命名）与 `aiModelStore.ts` 的本地/私有 Blob 读写、合并、默认解析。
- [ ] **Step 4:** 测试通过。

### Task 2: `/api/ai-models` 路由

**Files:**
- Create: `api/routes/aiModels.ts`
- Modify: `api/app.ts`
- Test: `tests/aiModels.test.ts`

**Endpoints:**
- `GET /api/ai-models`
- `POST /api/ai-models`
- `PUT /api/ai-models/:id`
- `DELETE /api/ai-models/:id`
- `PUT /api/ai-models/default`
- `POST /api/ai-models/test`
- `POST /api/ai-models/fetch-models`

- [ ] **Step 1:** 测试：创建/更新/删除；Key 脱敏；编辑留空保持旧 Key；无效 URL 400；环境变量 id 删除 404。
- [ ] **Step 2:** 测试：默认模型设置、删除默认后回退、环境变量合并顺序。
- [ ] **Step 3:** 测试：`test` 与 `fetch-models` 使用正确 base URL、Bearer、超时；无 Key 400；上游失败返回可读错误。
- [ ] **Step 4:** 运行测试确认失败，再实现路由与 app 挂载，直至通过。

### Task 3: 分析链路接入合并模型

**Files:**
- Modify: `api/routes/analyze.ts`
- Modify: `api/app.ts`
- Test: `tests/api.test.ts`, `tests/aiModels.test.ts`

- [ ] **Step 1:** 测试：`/api/analyze/ui` 按 `modelId` 命中自定义模型的 baseUrl/key；未知 id 400；`/api/config` 返回 `source` 与合并列表。
- [ ] **Step 2:** 改为异步 `listAiModels` + `getDefaultModelId`，缺省使用默认模型。
- [ ] **Step 3:** 全量测试通过。

### Task 4: 设置页与表单

**Files:**
- Create: `src/pages/ModelSettings.tsx`
- Create: `src/components/AiModelForm.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/ProjectManagement.tsx`

- [ ] **Step 1:** 新增 `/settings` 路由与项目列表/Checker 齿轮入口。
- [ ] **Step 2:** 页面加载 `/api/ai-models`，渲染模型卡片、默认徽标、来源徽标、密钥掩码、空态/错误态。
- [ ] **Step 3:** 表单支持新增/编辑、Key 显示切换、模型拉取（datalist 兜底手填）、测试连接、保存校验。
- [ ] **Step 4:** 删除二次确认、设为默认、操作反馈；环境变量项只读。
- [ ] **Step 5:** `npm run lint && npm run build` 通过。

### Task 5: 文档与回归

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `/Users/liujiayuan/App/AIDA/review/review.md`

- [ ] **Step 1:** README 增加设置页、API、安全存储说明；`.env.example` 注明设置页优先。
- [ ] **Step 2:** 更新评审 I7 描述。
- [ ] **Step 3:** `npm test`、`npm run lint`、`npm run build` 全绿。
- [ ] **Step 4:** 临时数据目录 + 假 OpenAI 服务浏览器验证：添加 → 拉取 → 测试 → 设默认 → Checker 使用 → 删除回退。

## Self-Review

- 覆盖 spec：存储/密钥、合并/默认、CRUD、测试/拉取、设置页交互、文档均有任务。
- 安全调整：因现有 Blob 集合为 public，改为私有 Blob + 0600 本地文件；spec 中的数据模型描述需在实现后同步。
- 无占位符；类型名与接口在 Task 1 统一定义，后续任务复用。
