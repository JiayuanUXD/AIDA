# 火山引擎部署指南

本文档详细说明如何将应用部署到火山引擎云服务器。

## 目录
1. [前置要求](#前置要求)
2. [环境准备](#环境准备)
3. [本地构建验证](#本地构建验证)
4. [Docker 部署](#docker-部署)
5. [火山引擎配置](#火山引擎配置)
6. [部署步骤](#部署步骤)
7. [故障排查](#故障排查)
8. [监控和维护](#监控和维护)

---

## 前置要求

### 系统要求
- Node.js >= 18.0.0
- Docker >= 20.10
- npm >= 9.0.0

### 火山引擎账户
- 已激活的火山引擎账户
- TOS（对象存储）服务已开通
- ECS（云服务器）实例已创建
- 已配置安全组规则（允许 3000 端口入站）

### 本地工具
```bash
# 安装 Docker
# macOS: brew install docker
# Linux: 参考官方文档

# 验证安装
docker --version
node --version
npm --version
```

---

## 环境准备

### 1. 获取火山引擎凭证

登录火山引擎控制台，获取以下信息：

#### TOS 配置
```
TOS_REGION=cn-beijing              # 地域代码（如 cn-beijing, cn-shanghai）
TOS_ENDPOINT=https://tos-cn-beijing.volces.com  # TOS 服务端点
TOS_BUCKET=your-bucket-name        # 存储桶名称
TOS_ACCESS_KEY=your-access-key     # 访问密钥 ID
TOS_SECRET_KEY=your-secret-key     # 访问密钥密码
```

**获取步骤：**
1. 登录 [火山引擎控制台](https://console.volcengine.com)
2. 进入 **对象存储 TOS** → **存储桶管理**
3. 创建或选择存储桶，记录地域和端点
4. 进入 **访问控制** → **访问密钥** 创建新密钥
5. 保存 Access Key ID 和 Secret Access Key

#### AI 模型配置
```
GEMINI_API_KEY=your-gemini-api-key  # Google Gemini API 密钥
```

#### Figma 配置（可选）
```
FIGMA_ACCESS_TOKEN=your-figma-token  # Figma 个人访问令牌
```

### 2. 创建环境变量文件

在项目根目录创建 `.env.production`：

```bash
# 火山引擎 TOS 配置
TOS_REGION=cn-beijing
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_BUCKET=your-bucket-name
TOS_ACCESS_KEY=your-access-key
TOS_SECRET_KEY=your-secret-key

# 应用配置
PORT=3000
NODE_ENV=production
DATA_DIR_NAME=/mnt/data  # 云服务器挂载点

# AI 模型配置
GEMINI_API_KEY=your-gemini-api-key

# Figma 配置（可选）
FIGMA_ACCESS_TOKEN=your-figma-token
```

**安全提示：**
- ⚠️ 不要将 `.env.production` 提交到 Git
- 使用强密码和定期轮换密钥
- 在生产环境中通过容器环境变量注入，不要打入镜像

---

## 本地构建验证

### 1. 类型检查
```bash
npm run lint
```

预期输出：无错误信息

### 2.完整构建
```bash
npm run build:all
```

验证输出：
- `dist/` 目录包含前端构建产物
- `dist-server/` 目录包含后端编译产物

### 3. 本地测试（可选）
```bash
# 使用生产环境变量
cp .env.production .env.local

# 启动服务
npm run start

# 验证服务
curl http://localhost:3000/api/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "storage": "Volcano Engine TOS"
}
```

---

## Docker 部署

### 1. 构建 Docker 镜像

```bash
# 构建镜像
docker build -t your-app:latest .

# 验证镜像
docker images | grep your-app
```

### 2. 本地测试镜像

```bash
# 运行容器
docker run -d \
  --name test-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e TOS_REGION=cn-beijing \
  -e TOS_ENDPOINT=https://tos-cn-beijing.volces.com \
  -e TOS_BUCKET=your-bucket \
  -e TOS_ACCESS_KEY=your-key \
  -e TOS_SECRET_KEY=your-secret \
  -e GEMINI_API_KEY=your-gemini-key \
  your-app:latest

# 查看日志
docker logs -f test-app

# 测试服务
curl http://localhost:3000/api/health

# 停止容器
docker stop test-app
docker rm test-app
```

### 3. 推送到镜像仓库（可选）

如果使用火山引擎容器镜像服务：

```bash
# 登录火山引擎镜像仓库
docker login -u your-username registry.cn-beijing.volces.com

# 标记镜像
docker tag your-app:latest registry.cn-beijing.volces.com/your-namespace/your-app:latest

# 推送镜像
docker push registry.cn-beijing.volces.com/your-namespace/your-app:latest
```

---

## 火山引擎配置

### 1. ECS 实例配置

**推荐配置：**
- CPU: 2 核
- 内存: 4 GB
- 系统盘: 50 GB SSD
- 操作系统: Ubuntu 20.04 LTS 或 CentOS 7

### 2. 安全组规则

在火山引擎控制台配置入站规则：

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 3000 | 0.0.0.0/0 | 应用服务 |
| TCP | 22 | 0.0.0.0/0 | SSH 访问 |

### 3. 存储配置

#### TOS 存储桶设置
```
存储桶名称: your-bucket-name
地域: cn-beijing
访问权限: 私有
版本控制: 启用（可选）
```

#### 生命周期规则（可选）
```
规则名称: cleanup-old-uploads
对象前缀: uploads/
过期天数: 90
```

### 4. 数据持久化

**选项 A：使用 TOS（推荐）**
- 优点：自动备份、高可用、无需管理存储
- 配置：设置 `TOS_*` 环境变量

**选项 B：使用本地存储 + 定期备份**
- 创建数据卷：`/mnt/data`
- 定期备份到 TOS

---

## 部署步骤

### 1. 连接到 ECS 实例

```bash
# SSH 连接
ssh -i your-key.pem ubuntu@your-instance-ip

# 或使用密码
ssh ubuntu@your-instance-ip
```

### 2. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker

# 验证 Docker
docker --version
```

### 3. 上传应用

**方式 A：从 Git 克隆**
```bash
cd /home/ubuntu
git clone https://github.com/your-repo/your-app.git
cd your-app
git checkout hsyq  # 切换到部署分支
```

**方式 B：上传 Docker 镜像**
```bash
# 本地构建并保存
docker save your-app:latest -o your-app.tar

# 上传到服务器
scp -i your-key.pem your-app.tar ubuntu@your-instance-ip:/home/ubuntu/

# 在服务器上加载
docker load -i your-app.tar
```

### 4. 创建环境变量文件

```bash
# 在服务器上创建 .env 文件
cat > /home/ubuntu/your-app/.env << 'EOF'
NODE_ENV=production
PORT=3000
TOS_REGION=cn-beijing
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_BUCKET=your-bucket-name
TOS_ACCESS_KEY=your-access-key
TOS_SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
DATA_DIR_NAME=/mnt/data
EOF

# 设置权限
chmod 600 /home/ubuntu/your-app/.env
```

### 5. 创建数据目录（如果使用本地存储）

```bash
# 创建数据目录
sudo mkdir -p /mnt/data/uploads
sudo chown -R ubuntu:ubuntu /mnt/data
```

### 6. 启动应用

**方式 A：使用 Docker Compose**

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  app:
    image: your-app:latest
    container_name: your-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - TOS_REGION=cn-beijing
      - TOS_ENDPOINT=https://tos-cn-beijing.volces.com
      - TOS_BUCKET=your-bucket-name
      - TOS_ACCESS_KEY=${TOS_ACCESS_KEY}
      - TOS_SECRET_KEY=${TOS_SECRET_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - DATA_DIR_NAME=/mnt/data
    volumes:
      - /mnt/data:/mnt/data
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

启动服务：
```bash
cd /home/ubuntu/your-app
docker-compose up -d
```

**方式 B：直接运行 Docker**

```bash
docker run -d \
  --name your-app \
  --restart always \
  -p 3000:3000 \
  -v /mnt/data:/mnt/data \
  --env-file /home/ubuntu/your-app/.env \
  your-app:latest
```

### 7. 验证部署

```bash
# 查看容器状态
docker ps | grep your-app

# 查看日志
docker logs -f your-app

# 测试 API
curl http://localhost:3000/api/health

# 测试前端
curl http://localhost:3000/
```

### 8. 配置反向代理（可选但推荐）

使用 Nginx 作为反向代理：

```bash
# 安装 Nginx
sudo apt install nginx -y

# 创建配置文件
sudo tee /etc/nginx/sites-available/your-app > /dev/null << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 故障排查

### 问题 1：容器无法启动

```bash
# 查看详细日志
docker logs your-app

# 常见原因：
# - 环境变量缺失
# - 端口被占用
# - 权限问题
```

**解决方案：**
```bash
# 检查环境变量
docker exec your-app env | grep TOS

# 检查端口占用
sudo lsof -i :3000

# 重启容器
docker restart your-app
```

### 问题 2：TOS 连接失败

```bash
# 验证凭证
docker exec your-app curl -v https://tos-cn-beijing.volces.com

# 检查安全组规则
# 确保 ECS 实例可以访问 TOS 端点
```

**解决方案：**
```bash
# 验证环境变量
echo $TOS_ACCESS_KEY
echo $TOS_SECRET_KEY

# 测试 TOS 连接
aws s3 ls s3://your-bucket --endpoint-url https://tos-cn-beijing.volces.com
```

### 问题 3：磁盘空间不足

```bash
# 检查磁盘使用
df -h

# 清理 Docker 镜像和容器
docker system prune -a

# 清理日志
docker logs --tail 0 -f your-app
```

### 问题 4：内存不足

```bash
# 查看容器内存使用
docker stats your-app

# 限制容器内存
docker update --memory 2g your-app
```

---

## 监控和维护

### 1. 日志管理

```bash
# 查看实时日志
docker logs -f your-app

# 查看最后 100 行日志
docker logs --tail 100 your-app

# 导出日志到文件
docker logs your-app > app.log 2>&1
```

### 2. 性能监控

```bash
# 实时监控容器资源
docker stats your-app

# 查看容器详细信息
docker inspect your-app
```

### 3. 定期备份

```bash
# 备份数据到 TOS
aws s3 sync /mnt/data s3://your-bucket/backups/ \
  --endpoint-url https://tos-cn-beijing.volces.com

# 创建定时任务（crontab）
# 每天凌晨 2 点执行备份
0 2 * * * aws s3 sync /mnt/data s3://your-bucket/backups/ \
  --endpoint-url https://tos-cn-beijing.volces.com
```

### 4. 更新应用

```bash
# 拉取最新代码
cd /home/ubuntu/your-app
git pull origin hsyq

# 重新构建镜像
docker build -t your-app:latest .

# 停止旧容器
docker stop your-app
docker rm your-app

# 启动新容器
docker-compose up -d
```

### 5. 健康检查

```bash
# 定期检查应用健康状态
curl -s http://localhost:3000/api/health | jq .

# 创建监控脚本
cat > /home/ubuntu/health-check.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -s http://localhost:3000/api/health | jq -r '.status')
if [ "$STATUS" != "ok" ]; then
  echo "Application unhealthy, restarting..."
  docker restart your-app
fi
EOF

chmod +x /home/ubuntu/health-check.sh

# 添加到 crontab（每 5 分钟检查一次）
# */5 * * * * /home/ubuntu/health-check.sh
```

---

## 常用命令速查表

```bash
# 容器管理
docker ps                          # 查看运行中的容器
docker logs -f your-app            # 查看实时日志
docker exec -it your-app bash      # 进入容器
docker restart your-app            # 重启容器
docker stop your-app               # 停止容器
docker rm your-app                 # 删除容器

# 镜像管理
docker build -t your-app:latest .  # 构建镜像
docker images                      # 查看镜像列表
docker rmi your-app:latest         # 删除镜像

# 系统管理
docker system prune -a             # 清理未使用资源
docker stats                       # 查看资源使用
docker inspect your-app            # 查看容器详情

# 数据管理
docker volume ls                   # 查看数据卷
docker volume inspect vol-name     # 查看数据卷详情
```

---

## 支持和反馈

如遇到问题，请：
1. 查看本文档的故障排查部分
2. 检查应用日志：`docker logs your-app`
3. 验证环境变量配置
4. 联系技术支持或提交 Issue

---

**最后更新：2024 年**
**版本：1.0**
