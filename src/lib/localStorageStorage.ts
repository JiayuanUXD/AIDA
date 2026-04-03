// 远程文件存储服务，对接后端 API (使用 Vercel Blob)
const STORAGE_API = '/api/storage';

// 缓存已上传文件的 URL
const urlCache = new Map<string, string>();

class RemoteStorageService {
  // 上传字符串（如 base64 图片）
  async uploadString(path: string, data: string, format: string = 'data_url'): Promise<string> {
    const response = await fetch(`${STORAGE_API}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, data })
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload file');
    }
    
    const result = await response.json();
    // 缓存 Blob URL
    if (result.url) {
      urlCache.set(path, result.url);
    }
    return result.url || '';
  }

  // 获取下载 URL
  async getDownloadURL(path: string): Promise<string> {
    // 先检查缓存
    const cachedUrl = urlCache.get(path);
    if (cachedUrl) {
      return cachedUrl;
    }
    
    const fileName = path.replace(/\//g, '_');
    // 返回后端的文件路径（会重定向到 Blob URL）
    return `${STORAGE_API}/file/${fileName}`;
  }

  // 删除文件
  async deleteFile(path: string): Promise<void> {
    // 从缓存中删除
    urlCache.delete(path);
    console.log('Delete file not implemented on server:', path);
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
