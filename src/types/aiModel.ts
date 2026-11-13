export type AiModelSource = 'custom' | 'env';

export interface AiModelItem {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  source: AiModelSource;
  configured: boolean;
  apiKeyHint: string;
  isDefault: boolean;
}

export interface AiModelListResponse {
  models: AiModelItem[];
  defaultModelId: string | null;
  aiConfigured: boolean;
}
