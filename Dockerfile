# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖（含 devDependencies，编译阶段需要 vite / tsc / tsx）
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

# 预建本地数据目录（非挂载 volume 时使用）
RUN mkdir -p data/uploads

# 暴露服务端口（与 api/index.ts 中 PORT 默认值保持一致）
EXPOSE 3000

# 启动生产服务
CMD ["npm", "run", "start"]
