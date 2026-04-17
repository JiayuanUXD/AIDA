#!/bin/bash
echo "=== 检查服务器进程 ==="
ps aux | grep -E "tsx|node|express" | grep -v grep || echo "没有找到服务器进程"

echo ""
echo "=== 检查端口监听 ==="
ss -tlnp 2>/dev/null | grep -E "3000|5173|8080|4000" || netstat -tlnp 2>/dev/null | grep -E "3000|5173|8080|4000" || echo "无法检查端口"

echo ""
echo "=== 检查 data 目录 ==="
ls -la /vercel/share/v0-project/data/ 2>/dev/null || echo "data 目录不存在"

echo ""
echo "=== 检查 node_modules 是否安装 ==="
ls /vercel/share/v0-project/node_modules/.bin/tsx 2>/dev/null && echo "tsx 已安装" || echo "tsx 未找到"

echo ""
echo "=== 测试文件系统可写性 ==="
mkdir -p /vercel/share/v0-project/data && echo "data 目录创建成功" || echo "data 目录创建失败"
touch /vercel/share/v0-project/data/.test 2>/dev/null && echo "文件系统可写" && rm /vercel/share/v0-project/data/.test || echo "文件系统不可写"

echo ""
echo "=== 测试 API 端点 ==="
curl -s -o /dev/null -w "GET /api/db/projects 状态码: %{http_code}\n" http://localhost:3333/api/db/projects 2>/dev/null || echo "无法连接到服务器（localhost:3333）"
curl -s -o /dev/null -w "GET /api/db/projects 状态码: %{http_code}\n" http://localhost:3000/api/db/projects 2>/dev/null || echo "无法连接到服务器（localhost:3000）"

echo ""
echo "=== 检查 package.json dev 命令 ==="
cat /vercel/share/v0-project/package.json | grep -A2 '"scripts"'

echo ""
echo "=== 尝试 POST /api/db/projects ==="
curl -s -X POST http://localhost:3333/api/db/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","name":"Test Project","category":"All projects","isStarred":false}' \
  -w "\n状态码: %{http_code}" 2>/dev/null || echo "POST 请求失败"

echo ""
echo "=== 检查 api/index.ts 前100行 ==="
head -60 /vercel/share/v0-project/api/index.ts
