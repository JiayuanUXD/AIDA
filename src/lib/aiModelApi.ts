import type { AiModelItem, AiModelListResponse } from '../types/aiModel';
import { ApiError } from './i18n';

export type ModelInput = {
  label: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export type TestConnectionResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // 服务端返回的错误原文保持不动；客户端自己合成的兜底文案交由界面层翻译
    throw new ApiError(data?.error, '请求失败（{status}）', { status: response.status });
  }
  return data as T;
};

export const listAiModels = () => requestJson<AiModelListResponse>('/api/ai-models');

export const createAiModel = (input: ModelInput) =>
  requestJson<AiModelItem>('/api/ai-models', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateAiModel = (id: string, input: ModelInput) =>
  requestJson<AiModelItem>(`/api/ai-models/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const deleteAiModel = (id: string) =>
  requestJson<{ success: boolean }>(`/api/ai-models/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const setDefaultAiModel = (modelId: string) =>
  requestJson<{ defaultModelId: string }>('/api/ai-models/default', {
    method: 'PUT',
    body: JSON.stringify({ modelId }),
  });

export const testAiModel = (input: Partial<ModelInput> & { id?: string }) =>
  requestJson<TestConnectionResult>('/api/ai-models/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const fetchProviderModels = (input: { id?: string; baseUrl: string; apiKey?: string }) =>
  requestJson<{ models: string[] }>('/api/ai-models/fetch-models', {
    method: 'POST',
    body: JSON.stringify(input),
  });
