import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 模拟 api/index.ts 的 __dirname 行为（api/__dirname = scripts/../api）
const apiDir = path.join(__dirname, '..', 'api');
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(apiDir, '..', 'data');  // __dirname/../data = projectRoot/data
const TMP_DATA_DIR = '/tmp/aida-data';

console.log('=== AIDA 诊断报告 ===');
console.log('scripts __dirname:', __dirname);
console.log('api dir (模拟):', apiDir);
console.log('ROOT:', ROOT);
console.log('DATA_DIR (首选):', DATA_DIR);
console.log('TMP_DATA_DIR:', TMP_DATA_DIR);

// 1. 检查 data 目录
console.log('\n--- 文件系统检查 ---');

function testDir(dir, label) {
  console.log(`\n[${label}] 路径: ${dir}`);
  console.log(`[${label}] 目录存在:`, fs.existsSync(dir));
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[${label}] mkdirSync: 成功`);
  } catch (e) {
    console.log(`[${label}] mkdirSync: 失败 - ${e.code} ${e.message}`);
  }
  const testPath = path.join(dir, '.test_write');
  try {
    fs.writeFileSync(testPath, 'test', 'utf-8');
    fs.unlinkSync(testPath);
    console.log(`[${label}] 写入测试: 成功`);
  } catch (e) {
    console.log(`[${label}] 写入测试: 失败 - ${e.code} ${e.message}`);
  }
}

testDir(DATA_DIR, '首选目录');
testDir(TMP_DATA_DIR, '/tmp fallback');

// 2. 检查现有 JSON 文件
console.log('\n--- 数据文件检查 ---');
const files = ['projects.json', 'categories.json'];
for (const f of files) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(content);
      console.log(`${f}: 存在, ${parsed.length} 条记录`);
    } catch (e) {
      console.log(`${f}: 存在但解析失败:`, e.message);
    }
  } else {
    console.log(`${f}: 不存在`);
  }
}

// 3. 检查服务器端口
console.log('\n--- 服务器端口检查 ---');
const ports = [3000, 3001, 5173, 8080, 4173];
const checks = ports.map(port =>
  fetch(`http://localhost:${port}/api/db/projects`, { signal: AbortSignal.timeout(2000) })
    .then(r => console.log(`端口 ${port}: HTTP ${r.status}`))
    .catch(e => console.log(`端口 ${port}: 连接失败 (${e.message})`))
);

await Promise.all(checks);

// 4. 找到运行中的服务端口并测试 POST
console.log('\n--- POST 测试 ---');
for (const port of ports) {
  try {
    const r = await fetch(`http://localhost:${port}/api/db/projects`, { signal: AbortSignal.timeout(2000) });
    if (r.ok || r.status < 500) {
      console.log(`在端口 ${port} 找到服务，测试 POST...`);
      const testId = 'test_' + Date.now();
      const postRes = await fetch(`http://localhost:${port}/api/db/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: testId, name: '测试项目', category: 'All projects', isStarred: false, members: [] }),
        signal: AbortSignal.timeout(3000)
      });
      const postText = await postRes.text();
      console.log(`POST /api/db/projects -> ${postRes.status}: ${postText.substring(0, 200)}`);

      const postCatRes = await fetch(`http://localhost:${port}/api/db/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: testId, name: '测试分类', order: 0 }),
        signal: AbortSignal.timeout(3000)
      });
      const postCatText = await postCatRes.text();
      console.log(`POST /api/db/categories -> ${postCatRes.status}: ${postCatText.substring(0, 200)}`);

      // 清理测试数据
      await fetch(`http://localhost:${port}/api/db/projects/${testId}`, { method: 'DELETE', signal: AbortSignal.timeout(2000) }).catch(() => {});
      await fetch(`http://localhost:${port}/api/db/categories/${testId}`, { method: 'DELETE', signal: AbortSignal.timeout(2000) }).catch(() => {});
      break;
    }
  } catch (_) {}
}

console.log('\n=== 诊断完成 ===');
