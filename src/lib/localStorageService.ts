// 远程存储服务，对接后端 API
import { ApiError } from './i18n';

const API_BASE = '/api/db';
const POLL_INTERVAL_MS = 5000;

export type SnapshotDoc = {
  id: string;
  data: () => any;
};

export type Snapshot = {
  docs: SnapshotDoc[];
};

type QueryDescriptor = {
  collection: string;
  queries?: Array<{ field?: string; direction?: 'asc' | 'desc' }>;
};

type SnapshotListener = {
  callback: (snapshot: Snapshot) => void;
  query?: QueryDescriptor;
  onError?: (error: Error) => void;
};

class RemoteDataService {
  private cache = new Map<string, any[]>();
  private subscribers = new Map<string, Set<SnapshotListener>>();
  private pollers = new Map<string, number>();
  private mutations = new Map<string, number>();

  // 获取所有数据（失败时抛出，禁止把错误伪装成空集合）
  private async getAll(collection: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/${collection}`);
    if (!response.ok) {
      throw await this.buildHttpError(response, '加载集合 {collection} 失败（{status}）', {
        collection,
        status: response.status,
      });
    }
    const data = await response.json();
    this.cache.set(collection, data);
    return data;
  }

  private isMutating(collection: string): boolean {
    return (this.mutations.get(collection) ?? 0) > 0;
  }

  private beginMutation(collection: string): void {
    this.mutations.set(collection, (this.mutations.get(collection) ?? 0) + 1);
  }

  private endMutation(collection: string): void {
    const remaining = (this.mutations.get(collection) ?? 1) - 1;
    if (remaining <= 0) this.mutations.delete(collection);
    else this.mutations.set(collection, remaining);
  }

  private notifyError(collection: string, error: Error): void {
    const listeners = this.subscribers.get(collection);
    if (!listeners || listeners.size === 0) {
      console.error(`Error loading collection ${collection}:`, error);
      return;
    }
    listeners.forEach((listener) => {
      if (listener.onError) listener.onError(error);
      else console.error(`Error loading collection ${collection}:`, error);
    });
  }

  private cloneDocs(data: any[]): any[] {
    return data.map((item) => ({ ...item }));
  }

  private toSnapshot(data: any[]): Snapshot {
    return {
      docs: data.map((doc: any) => ({
        id: doc.id,
        data: () => doc
      }))
    };
  }

  private applyQuery(data: any[], query?: QueryDescriptor): any[] {
    const sorted = this.cloneDocs(data);
    const orderClause = query?.queries?.find((item) => item?.field);

    if (!orderClause?.field) {
      return sorted;
    }

    const direction = orderClause.direction ?? 'asc';
    sorted.sort((a: any, b: any) => {
      const aValue = a[orderClause.field!];
      const bValue = b[orderClause.field!];
      if (aValue < bValue) return direction === 'desc' ? 1 : -1;
      if (aValue > bValue) return direction === 'desc' ? -1 : 1;
      return 0;
    });

    return sorted;
  }

  private emitCollection(collection: string): void {
    const listeners = this.subscribers.get(collection);
    if (!listeners || listeners.size === 0) return;

    const currentData = this.cache.get(collection) ?? [];
    listeners.forEach((listener) => {
      const queriedData = this.applyQuery(currentData, listener.query);
      listener.callback(this.toSnapshot(queriedData));
    });
  }

  private async refreshCollection(collection: string): Promise<any[]> {
    try {
      const data = await this.getAll(collection);
      this.emitCollection(collection);
      return data;
    } catch (error) {
      this.notifyError(collection, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private ensurePolling(collection: string): void {
    if (this.pollers.has(collection)) return;

    const intervalId = window.setInterval(() => {
      if (this.isMutating(collection)) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      this.refreshCollection(collection).catch(() => {});
    }, POLL_INTERVAL_MS);

    this.pollers.set(collection, intervalId);
  }

  private stopPollingIfIdle(collection: string): void {
    const listeners = this.subscribers.get(collection);
    if (listeners && listeners.size > 0) return;

    const intervalId = this.pollers.get(collection);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.pollers.delete(collection);
    }
  }

  private async mutateCollection(
    collection: string,
    updater: (current: any[]) => any[],
    request: () => Promise<void>
  ): Promise<void> {
    this.beginMutation(collection);
    try {
      const previous = this.cloneDocs(this.cache.get(collection) ?? await this.getAll(collection));
      const next = updater(this.cloneDocs(previous));

      this.cache.set(collection, next);
      this.emitCollection(collection);

      try {
        await request();
      } catch (error) {
        this.cache.set(collection, previous);
        this.emitCollection(collection);
        throw error;
      }

      // 写入已成功；刷新失败只提示不回滚，避免误导调用方重试造成重复写入。
      await this.refreshCollection(collection).catch(() => {});
    } finally {
      this.endMutation(collection);
    }
  }

  private async buildHttpError(
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

  // 添加文档
  async addDoc(collection: string, data: any): Promise<{ id: string }> {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const newDoc = { id, ...data };
    await this.mutateCollection(
      collection,
      (current) => [...current, newDoc],
      async () => {
        const response = await fetch(`${API_BASE}/${collection}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDoc)
        });

        if (!response.ok) {
          throw await this.buildHttpError(response, '向集合 {collection} 添加文档失败', { collection });
        }
      }
    );
    return newDoc;
  }

  // 获取文档
  async getDoc(collection: string, id: string): Promise<{ exists: () => boolean; data: () => any }> {
    try {
      const response = await fetch(`${API_BASE}/${collection}/${id}`);
      if (!response.ok) return { exists: () => false, data: () => null };
      const doc = await response.json();
      return {
        exists: () => !!doc,
        data: () => doc
      };
    } catch {
      return { exists: () => false, data: () => null };
    }
  }

  // 更新文档
  async updateDoc(collection: string, id: string, data: any): Promise<void> {
    await this.mutateCollection(
      collection,
      (current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index === -1) {
          return [...current, { id, ...data }];
        }

        const next = [...current];
        next[index] = { ...next[index], ...data, id };
        return next;
      },
      async () => {
        const response = await fetch(`${API_BASE}/${collection}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          throw await this.buildHttpError(response, '更新集合 {collection} 中的文档 {id} 失败', { collection, id });
        }
      }
    );
  }

  // 设置文档（创建或更新）
  async setDoc(collection: string, id: string, data: any, _options?: { merge: boolean }): Promise<void> {
    // 这里的后端实现 PUT 已经包含了 setDoc 的逻辑（不存在则创建）
    await this.updateDoc(collection, id, data);
  }

  // 删除文档
  async deleteDoc(collection: string, id: string): Promise<void> {
    await this.mutateCollection(
      collection,
      (current) => current.filter((item) => item.id !== id),
      async () => {
        const response = await fetch(`${API_BASE}/${collection}/${id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw await this.buildHttpError(response, '删除集合 {collection} 中的文档 {id} 失败', { collection, id });
        }
      }
    );
  }

  // 查询文档
  async query(collection: string, orderByField?: string, orderDirection?: 'asc' | 'desc'): Promise<any[]> {
    const data = await this.getAll(collection);
    
    if (orderByField) {
      data.sort((a: any, b: any) => {
        const aValue = a[orderByField];
        const bValue = b[orderByField];
        if (aValue < bValue) return orderDirection === 'desc' ? 1 : -1;
        if (aValue > bValue) return orderDirection === 'desc' ? -1 : 1;
        return 0;
      });
    }
    return data;
  }

  // 监听文档变化 (轮询实现)
  onSnapshot(
    query: QueryDescriptor | string,
    callback: (snapshot: Snapshot) => void,
    onError?: (error: Error) => void
  ): () => void {
    const normalizedQuery = typeof query === 'string'
      ? { collection: query, queries: [] }
      : query;

    const collection = normalizedQuery.collection;
    const listener: SnapshotListener = { callback, query: normalizedQuery, onError };
    const listeners = this.subscribers.get(collection) ?? new Set<SnapshotListener>();
    listeners.add(listener);
    this.subscribers.set(collection, listeners);

    if (this.cache.has(collection)) {
      callback(this.toSnapshot(this.applyQuery(this.cache.get(collection) ?? [], normalizedQuery)));
    }

    this.refreshCollection(collection).catch(() => {});
    this.ensurePolling(collection);

    return () => {
      const activeListeners = this.subscribers.get(collection);
      if (!activeListeners) return;

      activeListeners.delete(listener);
      if (activeListeners.size === 0) {
        this.subscribers.delete(collection);
      }

      this.stopPollingIfIdle(collection);
    };
  }

  // 批量操作
  async writeBatch(): Promise<{ commit: () => Promise<void>; update: (collection: string, id: string, data: any) => void }> {
    const operations: Array<{ collection: string; id: string; data: any }> = [];

    return {
      update: (collection: string, id: string, data: any) => {
        operations.push({ collection, id, data });
      },
      commit: async () => {
        for (const op of operations) {
          await this.updateDoc(op.collection, op.id, op.data);
        }
      }
    };
  }
}

export const localStorageService = new RemoteDataService();

// Firestore 风格 API，底层走 /api/db REST + SSE
export const collection = (name: string) => name;
export const doc = (collection: string, id: string) => ({ collection, id });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({ field, direction });
export const query = (collection: string, ...queries: any[]) => ({ collection, queries });
export const onSnapshot = (
  queryObj: any,
  callback: (snapshot: Snapshot) => void,
  onError?: (error: Error) => void
) => {
  return localStorageService.onSnapshot(queryObj, callback, onError);
};
export const addDoc = async (collection: string, data: any) => {
  return await localStorageService.addDoc(collection, data);
};
export const updateDoc = async (docObj: { collection: string; id: string }, data: any) => {
  return await localStorageService.updateDoc(docObj.collection, docObj.id, data);
};
export const setDoc = async (docObj: { collection: string; id: string }, data: any, options?: { merge: boolean }) => {
  return await localStorageService.setDoc(docObj.collection, docObj.id, data, options);
};
export const deleteDoc = async (docObj: { collection: string; id: string }) => {
  return await localStorageService.deleteDoc(docObj.collection, docObj.id);
};
export const writeBatch = async () => {
  return await localStorageService.writeBatch();
};
export const serverTimestamp = () => Date.now();
export const getDoc = async (docObj: { collection: string; id: string }) => {
  return await localStorageService.getDoc(docObj.collection, docObj.id);
};
