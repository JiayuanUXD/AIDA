import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Step 1: __dirname =', __dirname);

// 模拟 resolveDataDir
const DATA_DIR_NAME = 'data';
const DATA_DIR = path.join(__dirname, '..', DATA_DIR_NAME);
console.log('Step 2: DATA_DIR =', DATA_DIR);

// 模拟 tryMakeWritableDir
async function tryMakeWritableDir(dir) {
  try {
    console.log('  tryMakeWritableDir:', dir);
    if (!existsSync(dir)) {
      console.log('  dir does not exist, creating...');
      mkdirSync(dir, { recursive: true });
    }
    const testPath = path.join(dir, '.write_test');
    await fs.writeFile(testPath, 'ok', 'utf-8');
    await fs.unlink(testPath);
    console.log('  writable: true');
    return true;
  } catch (e) {
    console.log('  writable: false -', e.code, e.message);
    return false;
  }
}

console.log('Step 3: testing DATA_DIR...');
const result1 = await tryMakeWritableDir(DATA_DIR);
console.log('Step 4: result =', result1);

if (!result1) {
  console.log('Step 5: trying /tmp/aida-data...');
  const result2 = await tryMakeWritableDir('/tmp/aida-data');
  console.log('Step 6: result =', result2);
}

console.log('Done.');
