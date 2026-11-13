import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { get, put } from "@vercel/blob";
import { DATA_DIR, isCloudStorageEnabled, withCollectionLock } from "./store.js";
import {
  defaultAiModel,
  isAiModelConfigured,
  resolveEnvAiModels,
  type AiModelConfig,
} from "./aiConfig.js";

// API keys must never live in the regular collections: those are written to
// public Vercel Blob URLs. This store uses a 0600 local file or a private blob.
const STORE_FILE = path.join(DATA_DIR, "ai-models.json");
const BLOB_PATH = "secure/ai-models.json";
const STORE_LOCK = "__ai_models_secure__";

export interface StoredAiModel {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredAiModelsFile {
  models: StoredAiModel[];
  defaultModelId: string | null;
}

export interface AiModelState {
  models: AiModelConfig[];
  defaultModelId: string | null;
  aiConfigured: boolean;
}

export interface AiModelDto {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  source: AiModelConfig["source"];
  configured: boolean;
  apiKeyHint: string;
  isDefault: boolean;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const emptyFile = (): StoredAiModelsFile => ({ models: [], defaultModelId: null });

const normalizeStoredModel = (value: unknown): StoredAiModel | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  const model = text(raw.model);
  if (!id || !model) return null;
  return {
    id,
    label: text(raw.label) || model,
    baseUrl: text(raw.baseUrl).replace(/\/+$/, ""),
    apiKey: text(raw.apiKey),
    model,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
};

const normalizeStoredFile = (value: unknown): StoredAiModelsFile => {
  if (!value || typeof value !== "object") return emptyFile();
  const raw = value as Record<string, unknown>;
  const models = Array.isArray(raw.models)
    ? raw.models.map(normalizeStoredModel).filter((model): model is StoredAiModel => Boolean(model))
    : [];
  const defaultModelId = text(raw.defaultModelId) || null;
  return { models, defaultModelId };
};

const readStoredFile = async (): Promise<StoredAiModelsFile> => {
  if (isCloudStorageEnabled) {
    try {
      const result = await get(BLOB_PATH, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return emptyFile();
      const content = await new Response(result.stream).text();
      if (!content.trim()) return emptyFile();
      return normalizeStoredFile(JSON.parse(content));
    } catch (err: any) {
      if (err?.name === "BlobNotFoundError") return emptyFile();
      console.error("Error reading AI model settings from blob storage:", err);
      throw httpError(503, "Failed to read AI model settings from secure storage");
    }
  }

  try {
    const content = await fs.readFile(STORE_FILE, "utf-8");
    return normalizeStoredFile(JSON.parse(content));
  } catch (err: any) {
    if (err?.code === "ENOENT") return emptyFile();
    console.error("Error reading AI model settings:", err);
    throw httpError(500, "Failed to read AI model settings");
  }
};

const writeStoredFile = async (state: StoredAiModelsFile) => {
  const json = JSON.stringify(state, null, 2);

  if (isCloudStorageEnabled) {
    try {
      await put(BLOB_PATH, json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json; charset=utf-8",
      });
    } catch (err) {
      console.error("Error writing AI model settings to blob storage:", err);
      throw httpError(503, "Failed to save AI model settings to secure storage");
    }
    return;
  }

  const tempPath = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, json, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, STORE_FILE);
    await fs.chmod(STORE_FILE, 0o600);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    console.error("Error writing AI model settings:", err);
    throw httpError(500, "Failed to save AI model settings");
  }
};

const mutateStoredFile = <T>(fn: (state: StoredAiModelsFile) => T | Promise<T>): Promise<T> =>
  withCollectionLock(STORE_LOCK, async () => {
    const state = await readStoredFile();
    const result = await fn(state);
    await writeStoredFile(state);
    return result;
  });

const toConfig = (model: StoredAiModel): AiModelConfig => ({
  id: model.id,
  label: model.label,
  baseUrl: model.baseUrl,
  apiKey: model.apiKey,
  model: model.model,
  endpoint: `${model.baseUrl}/chat/completions`,
  source: "custom",
});

const mergeModels = (stored: StoredAiModelsFile): AiModelConfig[] => {
  const custom = stored.models.map(toConfig);
  const seen = new Set(custom.map((model) => model.id));
  const env = resolveEnvAiModels().filter((model) => !seen.has(model.id));
  return [...custom, ...env];
};

const resolveDefault = (models: AiModelConfig[], storedDefaultId: string | null) => {
  const stored = storedDefaultId
    ? models.find((model) => model.id === storedDefaultId)
    : undefined;
  if (stored && isAiModelConfigured(stored)) return stored.id;
  return defaultAiModel(models)?.id ?? null;
};

export const getAiModelState = async (): Promise<AiModelState> => {
  const stored = await readStoredFile();
  const models = mergeModels(stored);
  return {
    models,
    defaultModelId: resolveDefault(models, stored.defaultModelId),
    aiConfigured: models.some(isAiModelConfigured),
  };
};

export const maskApiKey = (apiKey: string) => {
  if (!apiKey) return "";
  if (apiKey.length < 4) return "••••";
  return `••••${apiKey.slice(-4)}`;
};

export const toAiModelDto = (model: AiModelConfig, defaultModelId: string | null): AiModelDto => ({
  id: model.id,
  label: model.label,
  baseUrl: model.baseUrl,
  model: model.model,
  source: model.source,
  configured: isAiModelConfigured(model),
  apiKeyHint: maskApiKey(model.apiKey),
  isDefault: model.id === defaultModelId,
});

export const addCustomModel = (input: {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<StoredAiModel> =>
  mutateStoredFile((stored) => {
    const now = Date.now();
    const record: StoredAiModel = {
      id: crypto.randomUUID(),
      label: input.label || input.model,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    };
    stored.models.push(record);
    if (!stored.defaultModelId) stored.defaultModelId = record.id;
    return record;
  });

export const updateCustomModel = (
  id: string,
  patch: Partial<Pick<StoredAiModel, "label" | "baseUrl" | "apiKey" | "model">>
): Promise<StoredAiModel> =>
  mutateStoredFile((stored) => {
    const record = stored.models.find((model) => model.id === id);
    if (!record) throw httpError(404, "AI model not found");
    if (patch.label !== undefined) record.label = patch.label;
    if (patch.baseUrl !== undefined) record.baseUrl = patch.baseUrl;
    if (patch.apiKey !== undefined) record.apiKey = patch.apiKey;
    if (patch.model !== undefined) record.model = patch.model;
    record.label = record.label || record.model;
    record.updatedAt = Date.now();
    return record;
  });

export const deleteCustomModel = (id: string): Promise<void> =>
  mutateStoredFile((stored) => {
    const index = stored.models.findIndex((model) => model.id === id);
    if (index === -1) throw httpError(404, "AI model not found");
    stored.models.splice(index, 1);
    if (stored.defaultModelId === id) stored.defaultModelId = null;
  });

export const setDefaultModel = (modelId: string): Promise<string> =>
  mutateStoredFile((stored) => {
    const known =
      stored.models.some((model) => model.id === modelId) ||
      resolveEnvAiModels().some((model) => model.id === modelId);
    if (!known) throw httpError(400, `Unknown AI model: ${modelId}`);
    stored.defaultModelId = modelId;
    return modelId;
  });
