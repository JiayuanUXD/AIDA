# AIDA
AI Design Analysis Tool

## 本地运行

```bash
npm install
npm run dev
```

在 `.env.local` 中配置 `GEMINI_API_KEY` 和火山引擎相关的环境变量。

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
