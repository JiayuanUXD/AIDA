// 模拟服务器初始化流程，找出崩溃点
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== 服务器初始化测试 ===');
console.log('test script __dirname:', __dirname);

// 模拟 api/index.ts 的 __dirname（假设在 /home/api）
// 实际 api/ 目录路径
const apiDirCandidates = [
  path.join(__dirname, '..', 'api'),   // scripts/../api
];
console.log('api dir candidates:', apiDirCandidates);

// 模拟 DATA_DIR 计算
const DATA_DIR_NAME = 'data';

// 策略1: __dirname/../data（当 __dirname = /home/api 时 = /home/data，不可写）
const preferredDataDir = path.join(__dirname, '..', DATA_DIR_NAME);
console.log('\npreferred DATA_DIR:', preferredDataDir);

// 策略2: /tmp/aida-data fallback
const tmpDataDir = '/tmp/aida-data';

async function tryMakeWritableDir(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const testPath = path.join(dir, '.write_test');
    await fs.writeFile(testPath, 'ok', 'utf-8');
    await fs.unlink(testPath);
    return true;
  } catch (e) {
    console.log(`  tryMakeWritableDir(${dir}) failed:`, e.code, e.message);
    return false;
  }
}

console.log('\n--- 测试首选目录 ---');
const preferredOk = await tryMakeWritableDir(preferredDataDir);
console.log('首选目录可写:', preferredOk);

let activeDataDir = preferredDataDir;
let isLocalFsWritable = preferredOk;

if (!preferredOk) {
  console.log('\n--- 测试 /tmp fallback ---');
  const tmpOk = await tryMakeWritableDir(tmpDataDir);
  console.log('/tmp/aida-data 可写:', tmpOk);
  if (tmpOk) {
    activeDataDir = tmpDataDir;
    isLocalFsWritable = true;
    console.log('使用 /tmp/aida-data');
  } else {
    console.log('使用内存存储');
  }
}

console.log('\n最终 activeDataDir:', activeDataDir);
console.log('isLocalFsWritable:', isLocalFsWritable);

// 测试写入和读取
if (isLocalFsWritable) {
  const testFile = path.join(activeDataDir, 'projects.json');
  try {
    await fs.writeFile(testFile, JSON.stringify([{ id: 'test', name: '测试项目' }], null, 2), 'utf-8');
    const content = await fs.readFile(testFile, 'utf-8');
    const parsed = JSON.parse(content);
    console.log('\n写入/读取测试成功:', parsed.length, '条记录');
    await fs.unlink(testFile);
  } catch (e) {
    console.error('\n写入/读取测试失败:', e.message);
  }
}

console.log('\n=== 测试完成 ===');
