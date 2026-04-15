<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally and on Volcano Engine.

View your app in AI Studio: https://ai.studio/apps/a7f9bf0b-d43c-4db5-9e97-8ef53ab8a8db

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Volcano Engine

### 1. Volcano Engine Environment Setup

#### 1.1 Create ECS Instance
- Log in to Volcano Engine console
- Create an ECS instance (recommended: CentOS 7.9 or Ubuntu 20.04+)
- Allocate public IP address
- Configure security group to open port 3000

#### 1.2 Install Dependencies
```bash
# Update system
sudo yum update -y  # For CentOS
# or
sudo apt update && sudo apt upgrade -y  # For Ubuntu

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs  # For Ubuntu
# or
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs  # For CentOS

# Install PM2 (recommended for production)
sudo npm install -g pm2

# Install Git
sudo apt install -y git  # For Ubuntu
# or
sudo yum install -y git  # For CentOS
```

### 2. Deploy Project

#### 2.1 Clone Repository
```bash
cd /opt
git clone https://github.com/JiayuanUXD/AIDA0331.git
git checkout hsyq
```

#### 2.2 Install Dependencies
```bash
cd AIDA0331
npm install
```

#### 2.3 Configure Environment Variables
```bash
cp .env.example .env
# Edit .env file with your configuration
vi .env
```

#### 2.4 Build Project
```bash
npm run build
```

#### 2.5 Start Server
```bash
# Start with PM2 (recommended)
pm2 start dist/api/index.js --name aida-app

# Set PM2 to start on boot
pm2 save
pm2 startup
```

### 3. Volcano Engine Specific Configuration

#### 3.1 Security Group Settings
- Open inbound port 3000 in Volcano Engine security group
- Allow HTTP traffic on port 3000

#### 3.2 ECS Instance Optimization
- Configure instance memory based on your needs (recommended: at least 2GB RAM)
- Set up swap space if needed
- Configure firewall rules

### 4. Monitoring and Maintenance

#### 4.1 Check Service Status
```bash
pm2 status
pm2 logs aida-app
```

#### 4.2 Auto-restart on Failure
PM2 will automatically restart the service if it crashes.

#### 4.3 Backup Strategy
- Regularly backup your TOS data
- Consider setting up automated backups for critical data

## 版本记录

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