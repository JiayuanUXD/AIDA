import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = '/vercel/share/v0-project';

console.log('=== 检查 data 目录 ===');
try {
  const dataDir = path.join(BASE, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('data 目录已创建');
  } else {
    console.log('data 目录已存在');
    console.log('data 目录内容:', fs.readdirSync(dataDir));
  }
} catch (e) {
  console.log('data 目录操作失败:', e.message);
}

console.log('\n=== 测试文件系统可写性 ===');
try {
  const testPath = path.join(BASE, 'data', '.write_test');
  fs.writeFileSync(testPath, 'ok', 'utf-8');
  fs.unlinkSync(testPath);
  console.log('文件系统可写 ✓');
} catch (e) {
  console.log('文件系统不可写:', e.message);
}

console.log('\n=== 检查服务器端口 ===');
try {
  const result = execSync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
  const lines = result.split('\n').filter(l => /3[0-9]{3}/.test(l));
  if (lines.length) console.log(lines.join('\n'));
  else console.log('没有找到监听端口');
} catch (e) {
  console.log('无法检查端口:', e.message);
}

console.log('\n=== 测试 API POST /api/db/projects ===');
const ports = [3333, 3000, 5173, 8080];
for (const port of ports) {
  try {
    const res = await fetch(`http://localhost:${port}/api/db/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'diag_test', name: 'Diag Test', category: 'All projects', isStarred: false }),
      signal: AbortSignal.timeout(2000)
    });
    const text = await res.text();
    console.log(`端口 ${port}: 状态 ${res.status}, 响应: ${text.substring(0, 200)}`);
  } catch (e) {
    console.log(`端口 ${port}: 连接失败 - ${e.message}`);
  }
}

console.log('\n=== 检查 api/index.ts 关键内容 ===');
try {
  const apiFile = fs.readFileSync(path.join(BASE, 'api/index.ts'), 'utf-8');
  const lines = apiFile.split('\n');
  
  // 找 startServer 或 listen
  const listenLines = lines.map((l, i) => ({ line: l, num: i + 1 }))
    .filter(({ line }) => /listen|startServer|port/.test(line));
  console.log('端口/监听相关代码:');
  listenLines.slice(0, 10).forEach(({ line, num }) => console.log(`  ${num}: ${line.trim()}`));

  // 找 ALLOWED_COLLECTIONS
  const allowedLine = lines.findIndex(l => l.includes('ALLOWED_COLLECTIONS'));
  if (allowedLine >= 0) {
    console.log('\nALLOWED_COLLECTIONS:');
    console.log(lines.slice(allowedLine, allowedLine + 3).map((l, i) => `  ${allowedLine + i + 1}: ${l}`).join('\n'));
  }

  // 找 isLocalFsWritable
  const fsWritableIdx = lines.findIndex(l => l.includes('isLocalFsWritable'));
  if (fsWritableIdx >= 0) {
    console.log('\nisLocalFsWritable 定义:');
    console.log(lines.slice(fsWritableIdx, fsWritableIdx + 5).map((l, i) => `  ${fsWritableIdx + i + 1}: ${l}`).join('\n'));
  }

  console.log('\n总行数:', lines.length);
} catch (e) {
  console.log('读取 api/index.ts 失败:', e.message);
}

console.log('\n=== 检查 localStorageService.ts ===');
try {
  const svcFile = fs.readFileSync(path.join(BASE, 'src/lib/localStorageService.ts'), 'utf-8');
  const lines = svcFile.split('\n');
  
  // 找 API_BASE
  const apiBaseLine = lines.findIndex(l => l.includes('API_BASE'));
  if (apiBaseLine >= 0) {
    console.log('API_BASE:');
    console.log(lines.slice(apiBaseLine, apiBaseLine + 3).map((l, i) => `  ${apiBaseLine + i + 1}: ${l}`).join('\n'));
  }

  // 找 mutateCollection
  const mutateIdx = lines.findIndex(l => l.includes('mutateCollection') && l.includes('async'));
  if (mutateIdx >= 0) {
    console.log('\nmutateCollection (前20行):');
    console.log(lines.slice(mutateIdx, mutateIdx + 20).map((l, i) => `  ${mutateIdx + i + 1}: ${l}`).join('\n'));
  }
} catch (e) {
  console.log('读取失败:', e.message);
}
