# AIDA0331

## 本地运行

```bash
npm install
```

在 `.env.local` 中配置 `GEMINI_API_KEY` 后，启动开发服务：

```bash
npm run dev
```

## 同时启动 3000 / 3001

```bash
npm run dev:dual
```

该命令会同时启动两个本地实例：
- `3000`：默认服务
- `3001`：优化副本
