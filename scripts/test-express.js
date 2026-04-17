// 测试最小 Express 启动是否正常
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Step 1: imports OK');
console.log('  __dirname:', __dirname);
console.log('  process.cwd():', process.cwd());

// 模拟 DATA_DIR 解析
const DATA_DIR = path.join(__dirname, '..', 'data');
console.log('Step 2: DATA_DIR:', DATA_DIR);

// 模拟 tryMakeWritableDir
async function tryMakeWritableDir(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const testPath = path.join(dir, '.write_test');
    await fs.writeFile(testPath, 'ok', 'utf-8');
    await fs.unlink(testPath);
    return true;
  } catch {
    return false;
  }
}

let activeDataDir = DATA_DIR;
let isWritable = await tryMakeWritableDir(DATA_DIR);
console.log('Step 3: DATA_DIR writable:', isWritable);

if (!isWritable) {
  const tmpDir = '/tmp/aida-data';
  isWritable = await tryMakeWritableDir(tmpDir);
  if (isWritable) {
    activeDataDir = tmpDir;
    console.log('Step 3b: using /tmp/aida-data');
  } else {
    console.log('Step 3b: no writable dir, using memory');
  }
}

console.log('Step 4: activeDataDir:', activeDataDir);

// 测试 Express 启动
const app = express();

app.get('/test', (req, res) => {
  res.json({ ok: true, activeDataDir });
});

const server = app.listen(3999, () => {
  console.log('Step 5: Express listening on port 3999 - SUCCESS');
  server.close(() => {
    console.log('Step 6: server closed cleanly');
  });
});

server.on('error', (err) => {
  console.error('Step 5 ERROR:', err.message);
});
