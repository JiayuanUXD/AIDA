# AIDA - AI Design Acceptance

一个轻量级的 AI 设计验收工具，用于比较设计稿和实现稿的差异。

## 功能特性

- 🔍 **智能差异分析**: 使用 AI 模型自动检测设计稿和实现稿的差异
- 📊 **验收历史**: 支持多次验收并记录每次验收结果
- 🎯 **精准定位**: 高亮显示具体的差异位置
- 💾 **本地存储**: 使用 SQLite 数据库，无需外部服务

## 快速开始

### 环境要求
- Node.js 18+

### 安装和运行

1. 安装依赖：
   ```bash
   npm install
   ```

2. 配置 API 密钥（可选）：
   在 `.env` 文件中设置 AI 模型的 API 密钥

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 打开浏览器访问 `http://localhost:24678`

## 项目结构

```
├── api/           # 后端 API 服务
├── src/           # 前端 React 应用
├── data/          # 本地数据库和上传文件
└── node_modules/  # 项目依赖
```

## 可用命令

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run lint` - TypeScript 类型检查