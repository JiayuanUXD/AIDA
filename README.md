<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally and on Aliyun.

View your app in AI Studio: https://ai.studio/apps/a7f9bf0b-d43c-4db5-9e97-8ef53ab8a8db

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Aliyun (Aliyun OSS)

### 1. Create Aliyun OSS bucket and set env vars

In your Aliyun project, add these Environment Variables:

- `OSS_REGION` (required for OSS storage, e.g., `oss-cn-hangzhou`)
- `OSS_ACCESS_KEY_ID` (required for OSS access)
- `OSS_ACCESS_KEY_SECRET` (required for OSS access)
- `OSS_BUCKET` (required for OSS storage)

Also set your existing keys as needed:

- `GEMINI_API_KEY`
- `FIGMA_ACCESS_TOKEN`
- `APIYI_API_KEY`
- `APIYI_MODEL_ID`
- `APIYI_API_URL`

### 2. Data behavior

- With Aliyun OSS configured: `/api/db/*` data is stored in OSS `db/` directory.
- Uploaded files are stored in OSS `uploads/` directory.
- If OSS is not configured, DB/file storage falls back to local filesystem.

### 3. Deploy

1. Push to your GitHub repository.
2. Deploy to Aliyun ECS or Container Service.
3. Configure the env vars above.
4. Run `npm run build` to build the frontend.
5. Start the server: `node dist/api/index.js` or use PM2 for process management.

## 版本记录

### 2026-04-13（阿里云部署版本）

- 存储方案升级为阿里云 OSS：
  - `/api/db/*` 数据改为 OSS `db/` 目录存储。
  - `/api/storage/*` 图片/文件改为 OSS `uploads/` 目录存储。
  - 移除 Vercel Blob 依赖与配置说明，统一为阿里云 OSS 配置。
- 移除 Vercel 部署相关代码：
  - 删除 `vercel.json` 配置文件。
  - 删除 `api/[[...path]].ts` Vercel serverless 函数。
  - 移除 `dev:vercel:opt` 脚本。
- 服务器启动逻辑优化：
  - 移除 Vercel 环境检测，确保在所有环境中正常启动。
  - 简化启动流程，使其更加通用。
- 类型安全优化：
  - 修复 TypeScript 编译错误。
  - 确保代码类型安全。

### 2026-04-08（精简版）

- 存储方案升级为 Supabase：
  - `/api/db/*` 数据改为 Supabase 表存储（默认表：`app_collections`）。
  - `/api/storage/*` 图片/文件改为 Supabase Storage（默认 bucket：`uploads`）。
  - 移除 Blob 依赖与配置说明，统一为 Supabase 配置。
- 本地环境与 Vercel 对齐：
  - 新增 `api/[[...path]].ts` 作为 API catch-all 入口。
  - `vercel.json` API rewrite 指向 `api/[[...path]].ts`。
  - 新增 `dev:vercel:opt` 脚本，便于本地模拟 Vercel 运行。
- 环境变量加载优化：
  - 后端改为先加载 `.env`，再用 `.env.local` 覆盖，避免本地密钥不生效。
- 新建项目体验修复：
  - 修复“新建项目后上传组件消失”问题（创建流程竞态 + owner 判定兜底）。

### 2026-04-03（精简版）

- Checker 页右下角分析按钮改为常驻：首次为 `差异分析`，分析后为 `重新分析`。
- 差异卡片交互优化：
  - 新增可编辑严重等级（小圆点交互）。
  - 去除删除图标与冗余小圆点。
  - 优化差异类型/详情文字颜色与悬浮可读性。
  - 图片标注颜色与严重等级颜色联动。
- 标注对齐优化（适配两图高度不一致）：
  - 引入双坐标模型 `rectDesign` / `rectBuild`，并增加双向映射与归一化。
  - 新增/编辑/加载差异时同步维护双侧标注区域，降低错位。
- Gemini 调用链路修复：
  - `gemini` 模型改为直连 Google API。
  - 增加模型路由归一化，避免误走 APIYI 分支。
  - 增强 Gemini 返回内容 JSON 解析容错与兜底处理。
  - 默认 Gemini 模型更新为 `gemini-3.1-flash-lite-preview`。
- Round 数据与体验修复：
  - 修复集合白名单，支持 `projects_<projectId>_rounds`。
  - 移除浏览器 `beforeunload` 重载拦截弹窗。
  - 修复切换 Round 时页面意外刷新（Vite watch 忽略 + 文件读写稳态化）。
  - 修复仅浏览 Round 也触发自动保存的问题（指纹口径统一）。
  - 修复 Round 卡片排序异常与 `Invalid Date` 展示问题。
- 开发运行改进：
  - 修复 `dev:opt` 脚本，避免出现 `data-opt/data` 嵌套拷贝导致的数据混乱