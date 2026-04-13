<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a7f9bf0b-d43c-4db5-9e97-8ef53ab8a8db

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel (Supabase DB + Supabase Storage)

### 1. Create Supabase table and set env vars in Vercel

In your Vercel project, add these Environment Variables:

- `SUPABASE_URL` (required for persistent DB and file storage)
- `SUPABASE_SERVICE_ROLE_KEY` (required for server-side DB/file read-write)
- `SUPABASE_DB_TABLE` (optional, default: `app_collections`)
- `SUPABASE_STORAGE_BUCKET` (optional, default: `uploads`)

Also set your existing keys as needed:

- `GEMINI_API_KEY`
- `FIGMA_ACCESS_TOKEN`
- `APIYI_API_KEY`
- `APIYI_MODEL_ID`
- `APIYI_API_URL`

### 2. Data behavior

- With Supabase env configured: `/api/db/*` data is stored in Supabase table.
- Uploaded files are stored in Supabase Storage bucket.
- If Supabase is not configured, DB/file storage falls back to local filesystem.

### 3. Supabase SQL (run once)

```sql
create table if not exists public.app_collections (
  collection text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
```

Also create a Storage bucket (default bucket name: `uploads`).
If you changed `SUPABASE_DB_TABLE`, create that table with the same schema.

### 4. Deploy

1. Push to your GitHub repository.
2. Import the repo in Vercel.
3. Configure the env vars above.
4. Deploy.

## Deploy to Google Cloud

### 1. Google Cloud Environment Setup

#### 1.1 Create Google Cloud Project
- Log in to [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project or select an existing one
- Enable billing for your project

#### 1.2 Enable Required APIs
- Go to APIs & Services > Library
- Enable the following APIs:
  - Cloud Storage API
  - App Engine Admin API (if using App Engine)
  - Compute Engine API (if using GCE)

#### 1.3 Create Cloud Storage Bucket
- Go to Cloud Storage > Buckets
- Create a new bucket with the following settings:
  - Name: Choose a unique name (e.g., `aida-storage`)
  - Location: Select a region close to your users
  - Storage class: Standard
  - Access control: Fine-grained (recommended)

#### 1.4 Create Service Account
- Go to IAM & Admin > Service accounts
- Create a new service account with:
  - Name: `aida-service-account`
  - Role: Storage Object Admin (for Cloud Storage access)
  - Download the service account key as JSON

### 2. Deploy to Google Cloud App Engine

#### 2.1 Install Google Cloud SDK
```bash
# For macOS
brew install google-cloud-sdk

# For Linux
sudo apt-get install google-cloud-sdk  # Debian/Ubuntu
# or
sudo yum install google-cloud-sdk  # CentOS/RHEL

# Initialize gcloud
gcloud init
```

#### 2.2 Create App Engine Configuration
Create `app.yaml` file in the project root:
```yaml
runtime: nodejs18
env: standard

instance_class: F2

env_variables:
  GOOGLE_CLOUD_PROJECT: "your-project-id"
  GOOGLE_CLOUD_STORAGE_BUCKET: "your-storage-bucket"
  # Add other environment variables here

handlers:
- url: /api/.*
  script: auto
  secure: always

- url: /.*
  static_files: dist/index.html
  upload: dist/index.html
  secure: always

- url: /(.*)
  static_files: dist/\1
  upload: dist/(.*)
  secure: always
```

#### 2.3 Build and Deploy
```bash
# Build the project
npm run build

# Deploy to App Engine
gcloud app deploy

# Check deployment status
gcloud app browse
```

### 3. Deploy to Google Compute Engine (GCE)

#### 3.1 Create GCE Instance
- Go to Compute Engine > VM instances
- Create a new instance with:
  - Machine type: e2-medium (2 vCPUs, 4GB RAM)
  - Boot disk: Ubuntu 20.04 LTS
  - Firewall: Allow HTTP and HTTPS traffic

#### 3.2 Connect to Instance
```bash
gcloud compute ssh your-instance-name
```

#### 3.3 Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (recommended for production)
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

#### 3.4 Deploy Project
```bash
# Clone repository
cd /opt
git clone https://github.com/JiayuanUXD/AIDA0331.git
git checkout feature/optimization

# Install dependencies
cd AIDA0331
npm install

# Configure environment variables
cp .env.example .env
# Edit .env file with your configuration
nano .env

# Build project
npm run build

# Start server with PM2
pm2 start dist/api/index.js --name aida-app

# Set PM2 to start on boot
pm2 save
pm2 startup
```

### 4. Google Cloud Specific Configuration

#### 4.1 Storage Configuration
- The application will automatically use Google Cloud Storage if the following env vars are set:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_CLOUD_STORAGE_BUCKET`
- Data will be stored in:
  - `gs://your-bucket/db/` (for JSON data)
  - `gs://your-bucket/uploads/` (for uploaded files)

#### 4.2 Environment Variables
- For App Engine: Set env vars in `app.yaml`
- For GCE: Set env vars in `.env` file
- For local development: Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your service account key

### 5. Monitoring and Maintenance

#### 5.1 Check Service Status
```bash
# For App Engine
gcloud app logs tail -s default

# For GCE
pm2 status
pm2 logs aida-app
```

#### 5.2 Auto-scaling (App Engine)
- App Engine will automatically scale based on traffic
- You can adjust instance class and scaling settings in `app.yaml`

#### 5.3 Backup Strategy
- Enable Object Versioning in your Cloud Storage bucket
- Set up Cloud Storage lifecycle rules for automatic archiving
- Consider using Cloud Backup for critical data

## 版本记录

### 2026-04-13（谷歌云部署版本）

- 存储方案升级为多云存储：
  - 新增谷歌云存储支持，优先使用 Google Cloud Storage
  - 保留阿里云 OSS 作为备选存储方案
  - 本地文件系统作为最终降级方案
- 服务器启动逻辑优化：
  - 增加谷歌云环境检测和适配
  - 提供详细的启动日志，便于调试
  - 优化错误处理和端口管理
- 环境变量配置优化：
  - 添加谷歌云相关环境变量配置
  - 支持服务账号凭据配置
  - 提供完整的部署环境配置示例
- 部署文档完善：
  - 添加谷歌云 App Engine 部署指南
  - 添加谷歌云 Compute Engine 部署指南
  - 提供详细的存储配置和监控维护建议
- 类型安全优化：
  - 确保 TypeScript 编译通过
  - 优化代码结构和错误处理

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
  - 修复 `dev:opt` 脚本，避免出现 `data-opt/data` 嵌套拷贝导致的数据混乱。
