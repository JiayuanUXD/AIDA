# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# 安装全部依赖（含 devDependencies，编译阶段需要 vite / tsc / tsx）
COPY package*.json ./
RUN npm ci

# 复制全部源码
COPY . .

# 构建前端（Vite -> dist/）和后端（tsc -> dist-server/）
RUN npm run build:all


# ---- Stage 2: Production ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 仅安装生产依赖，不含 vite / typescript / tsx 等开发工具
COPY package*.json ./
RUN npm ci --omit=dev

# 从 builder 阶段复制编译产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# 预建本地数据目录（使用 OSS 时此目录不会被写入，但保留以兼容本地部署）
RUN mkdir -p data/uploads

# 使用非 root 用户运行，提升容器安全性
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

# 暴露服务端口（与 api/index.ts 中 PORT 默认值保持一致）
EXPOSE 3000

# 容器健康检查（火山引擎容器服务 / Kubernetes 探活使用）
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# 启动生产服务（直接用 node 避免 npm 进程包装，信号传递更可靠）
CMD ["node", "dist-server/index.js"]
