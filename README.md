# AIDA
AI Design Analysis Tool

## 本地运行

```bash
npm install
npm run dev
```

在 `.env.local` 中配置 `GEMINI_API_KEY` 和云存储相关的环境变量（火山引擎 TOS 或 AWS S3）。

最小本地环境变量示例：

```env
GEMINI_API_KEY=your-gemini-api-key
```

## 同时启动 3000 / 3001

```bash
npm run dev:dual
```

该命令会同时启动两个本地实例，方便对比：
- `3000`：默认服务 (使用 `data/` 目录)
- `3001`：优化副本 (使用 `data-opt/` 目录)

## 生产构建

```bash
npm run build:all
npm run start
```

## 云部署

### Vercel 部署（当前唯一支持）

1. 在 Vercel 导入本仓库。
2. 在 Project Settings -> Environment Variables 配置：
   - `BLOB_READ_WRITE_TOKEN`（必须，数据持久化）
   - `ARK_API_KEY`（如果使用 UI 分析）
   - `DOUBAO_MODEL_ID`（如果使用 UI 分析）
   - `FIGMA_ACCESS_TOKEN`（如果使用 Figma 拉取）
3. 触发部署。

#### 健康检查

部署后访问：

```text
https://<your-domain>/api/health
```

预期返回字段：
- `status: "ok"`
- `runtime: "vercel"`
- `blobConfigured: true`
- `dbProvider: "vercel-blob"`

如果 `blobConfigured` 为 `false`，`/api/db/*` 写入会失败。

#### 常见问题

- `/api/health` 返回 404：
  - 确认 API 入口文件为 `api/[...path].ts`（不是 `[[...path]].ts`）。
- 可以读不能写：
  - 基本是 `BLOB_READ_WRITE_TOKEN` 未配置或配置到错误的环境（只配了 Preview 没配 Production）。

## 版本记录

### 2026-04-17（Vercel 稳定性修复）

- 路由修复：
  - API catch-all 入口改为 `api/[...path].ts`，修复 `*/api/health` 在 Vercel 上 404。
- 存储策略收敛到 Vercel：
  - Vercel 运行时强制要求 `BLOB_READ_WRITE_TOKEN`，缺失时启动即报错（fail fast）。
  - 禁止在 Vercel 上静默回退本地文件系统写入，避免“看似成功但无法持久化”。
- 健康检查增强：
  - `/api/health` 新增 `runtime`、`blobConfigured` 字段，快速定位配置问题。
- 可观测性优化：
  - 前端创建项目/分类等失败场景增加 toast 错误提示，直接显示后端错误原因。

### 2026-04-16（AWS 支持版本）

- 存储方案升级：
  - 添加 AWS S3 存储支持，与火山引擎 TOS 二选一
  - 统一存储接口，支持多种云存储
  - 保持本地文件系统作为回退方案
- AWS 相关配置：
  - 添加 AWS SDK 依赖
  - 添加 AWS S3 客户端初始化
  - 添加 AWS 环境变量配置
- 健康检查优化：
  - 显示当前使用的存储提供商（volc-tos、aws-s3 或 local）
  - 服务器启动日志显示存储类型
- 部署文档完善：
  - 添加 AWS 部署指南
  - 提供 AWS 环境变量配置说明

### 2026-04-15（火山引擎部署版本）

- 存储方案升级为火山引擎 TOS：
  - `/api/db/*` 数据改为 TOS `db/` 目录存储。
  - `/api/storage/*` 图片/文件改为 TOS `uploads/` 目录存储。
  - 移除 AWS 和阿里云 OSS 依赖与配置说明，统一为火山引擎 TOS 配置。
- 移除 AWS 相关代码：
  - 删除 AWS Amplify 配置文件和依赖。
  - 删除 AWS Lambda 下载脚本。
  - 移除 AWS SDK 依赖。
- 移除阿里云 OSS 相关代码：
  - 删除阿里云 OSS 客户端和配置。
  - 移除所有 OSS 相关的存储操作逻辑。
  - 更新健康检查和启动日志。
- 环境变量配置优化：
  - 移除阿里云 OSS 相关的环境变量配置。
  - 保留火山引擎 TOS 相关的配置。
- 部署文档完善：
  - 移除阿里云部署相关文档。
  - 完善火山引擎部署指南。
- 类型安全优化：
  - 修复 TypeScript 编译错误。
  - 确保代码类型安全。
