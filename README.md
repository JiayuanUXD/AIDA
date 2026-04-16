# AIDA
AI Design Analysis Tool

## 本地运行

```bash
npm install
npm run dev
```

在 `.env.local` 中配置 `GEMINI_API_KEY` 和云存储相关的环境变量（火山引擎 TOS 或 AWS S3）。

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

### 火山引擎部署

1. **配置环境变量**：
   - `TOS_REGION`：TOS 区域
   - `TOS_ACCESS_KEY`：TOS 访问密钥
   - `TOS_SECRET_KEY`：TOS 密钥
   - `TOS_BUCKET`：TOS 存储桶名称
   - `TOS_ENDPOINT`：TOS 端点

2. **部署步骤**：
   - 创建 ECS 实例
   - 安装 Node.js 18+
   - 克隆代码仓库
   - 安装依赖
   - 配置环境变量
   - 构建并启动服务

### AWS 部署

1. **配置环境变量**：
   - `AWS_REGION`：AWS 区域
   - `AWS_ACCESS_KEY_ID`：AWS 访问密钥 ID
   - `AWS_SECRET_ACCESS_KEY`：AWS 访问密钥
   - `AWS_S3_BUCKET`：S3 存储桶名称

2. **部署步骤**：
   - 创建 EC2 实例
   - 安装 Node.js 18+
   - 克隆代码仓库
   - 安装依赖
   - 配置环境变量
   - 构建并启动服务
   - 配置 S3 存储桶权限

3. **AWS 服务推荐**：
   - **EC2**：适合完整控制的场景
   - **ECS**：容器化部署
   - **Elastic Beanstalk**：全托管服务
   - **Lambda + API Gateway**：无服务器架构

## 版本记录

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
