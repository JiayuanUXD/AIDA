// 远程文件存储服务，对接后端 API
const STORAGE_API = '/api/storage';

class RemoteStorageService {
  // 上传字符串（如 base64 图片）
  async uploadString(path: string, data: string, format: string = 'data_url'): Promise<void> {
    await fetch(`${STORAGE_API}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, data })
    });
  }

  // 获取下载 URL
  async getDownloadURL(path: string): Promise<string> {
    const fileName = path.replace(/\//g, '_');
    // 直接返回后端的静态文件路径
    return `${STORAGE_API}/file/${fileName}`;
  }

  // 删除文件
  async deleteFile(path: string): Promise<void> {
    // 后端暂未实现删除文件接口，留空
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