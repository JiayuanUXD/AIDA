// 模拟 api/index.ts 启动流程，逐步找出崩溃点
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== 崩溃点诊断 ===');
console.log('scripts __dirname:', __dirname);

// 模拟 api/index.ts 里的 __dirname
const apiDirname = path.join(__dirname, '..', 'api');
console.log('api __dirname (模拟):', apiDirname);

// Step 1: DATA_DIR 计算
const DATA_DIR_NAME = 'data';
const DATA_DIR = path.join(apiDirname, '..', DATA_DIR_NAME);
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
console.log('\nDATA_DIR:', DATA_DIR);
console.log('UPLOADS_DIR:', UPLOADS_DIR);

// Step 2: 测试 DATA_DIR 写入
async function tryMakeWritableDir(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const testPath = path.join(dir, '.write_test');
    await fs.writeFile(testPath, 'ok', 'utf-8');
    await fs.unlink(testPath);
    return true;
  } catch (e) {
    return false;
  }
}

let activeDataDir = DATA_DIR;
let isLocalFsWritable = await tryMakeWritableDir(DATA_DIR);
console.log('\nDATA_DIR writable:', isLocalFsWritable);

if (!isLocalFsWritable) {
  const tmpDataDir = '/tmp/aida-data';
  isLocalFsWritable = await tryMakeWritableDir(tmpDataDir);
  if (isLocalFsWritable) {
    activeDataDir = tmpDataDir;
    console.log('Fallback to /tmp/aida-data: SUCCESS');
  } else {
    console.log('All FS paths failed, using in-memory');
  }
}

console.log('\nactiveDataDir:', activeDataDir);
console.log('isLocalFsWritable:', isLocalFsWritable);

// Step 3: 测试 vite import
console.log('\n--- 测试 Vite import ---');
try {
  const { createServer } = await import('vite');
  console.log('vite import: SUCCESS, createServer type:', typeof createServer);
  
  // 测试创建 vite server
  try {
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    console.log('vite createServer: SUCCESS');
    await vite.close();
  } catch (e) {
    console.log('vite createServer FAILED:', e.message);
    console.log('  code:', e.code);
    if (e.stack) console.log('  stack (first line):', e.stack.split('\n')[1]);
  }
} catch (e) {
  console.log('vite import FAILED:', e.message);
}

// Step 4: 测试 express
console.log('\n--- 测试 express ---');
try {
  const express = (await import('express')).default;
  const app = express();
  console.log('express app created: SUCCESS');
  
  // 尝试 listen
  await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      console.log('express listen: SUCCESS on port', port);
      server.close(resolve);
    });
    server.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 3000);
  });
} catch (e) {
  console.log('express FAILED:', e.message);
}

console.log('\n=== 诊断完成 ===');
