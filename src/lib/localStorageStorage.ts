// 远程文件存储服务，对接后端 API
import { ApiError } from './i18n';

const STORAGE_API = '/api/storage';

const toFileName = (path: string) => path.replace(/\//g, '_');

// The server normalizes the extension from the actual MIME type, so the stored
// filename can differ from the requested one (e.g. design.jpg -> design.png).
const canonicalUrls = new Map<string, string>();

async function buildError(
  response: Response,
  i18nKey: string,
  vars?: Record<string, string | number>,
): Promise<Error> {
  try {
    const text = await response.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json?.error) return new Error(String(json.error));
      } catch {}
      return new Error(text);
    }
  } catch {}
  // 服务端没有返回错误正文时，用客户端合成的兜底文案（可翻译）
  return new ApiError(undefined, i18nKey, vars);
}

class RemoteStorageService {
  // 上传字符串（如 base64 图片）
  async uploadString(path: string, data: string, _format: string = 'data_url'): Promise<void> {
    const response = await fetch(`${STORAGE_API}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, data })
    });
    if (!response.ok) {
      throw await buildError(response, '上传 {path} 失败', { path });
    }
    try {
      const body = await response.json();
      if (body?.url) canonicalUrls.set(path, String(body.url));
    } catch {}
  }

  // 获取下载 URL
  async getDownloadURL(path: string): Promise<string> {
    const base = canonicalUrls.get(path) || `${STORAGE_API}/file/${toFileName(path)}`;
    // 稳定文件名会被覆盖上传，版本号用于击穿浏览器缓存，避免回显旧图。
    return `${base}?v=${Date.now()}`;
  }

  // 删除文件
  async deleteFile(path: string): Promise<void> {
    const fileName = toFileName(path);
    const response = await fetch(`${STORAGE_API}/file/${fileName}`, { method: 'DELETE' });
    if (!response.ok) {
      throw await buildError(response, '删除 {path} 失败', { path });
    }
  }
}

export const localStorageStorageService = new RemoteStorageService();

// 导出模拟的 Storage 函数
export const ref = (storage: any, path: string) => path;
export const uploadString = async (path: string, data: string, format: string = 'data_url') => {
  return await localStorageStorageService.uploadString(path, data, format);
};
export const getDownloadURL = async (path: string) => {
  return await localStorageStorageService.getDownloadURL(path);
};
export const deleteObject = async (path: string) => {
  return await localStorageStorageService.deleteFile(path);
};