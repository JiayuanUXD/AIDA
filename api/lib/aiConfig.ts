const DEFAULT_AI_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export type AiModelSource = "custom" | "env";

export interface AiModelConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  endpoint: string;
  source: AiModelSource;
}

export interface AiModelSummary {
  id: string;
  label: string;
  source: AiModelSource;
  configured: boolean;
}

type RawModelEntry = {
  id?: unknown;
  label?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const globalDefaults = () => ({
  baseUrl: (process.env.AI_API_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, ""),
  apiKey: process.env.AI_API_KEY || process.env.ARK_API_KEY || "",
  model: process.env.AI_MODEL || process.env.DOUBAO_MODEL_ID || "",
});

const readModelEntries = (): RawModelEntry[] => {
  const raw = process.env.AI_MODELS;
  if (!raw) {
    const { model } = globalDefaults();
    return model ? [{ model }] : [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("AI_MODELS must be a JSON array");
    }
    return parsed;
  } catch (err: any) {
    console.warn(
      `[aiConfig] Invalid AI_MODELS, falling back to AI_MODEL: ${err?.message || err}`
    );
    const { model } = globalDefaults();
    return model ? [{ model }] : [];
  }
};

export const resolveEnvAiModels = (): AiModelConfig[] => {
  const defaults = globalDefaults();
  const seen = new Set<string>();
  const models: AiModelConfig[] = [];

  for (const entry of readModelEntries()) {
    if (!entry || typeof entry !== "object") continue;

    const model = text(entry.model) || defaults.model;
    if (!model) continue;

    const id = text(entry.id) || model;
    if (seen.has(id)) {
      console.warn(`[aiConfig] Duplicate AI model id "${id}" ignored`);
      continue;
    }
    seen.add(id);

    const baseUrl = (text(entry.baseUrl) || defaults.baseUrl).replace(/\/+$/, "");
    models.push({
      id,
      label: text(entry.label) || id,
      baseUrl,
      apiKey: text(entry.apiKey) || defaults.apiKey,
      model,
      endpoint: `${baseUrl}/chat/completions`,
      source: "env",
    });
  }

  return models;
};

export const isAiModelConfigured = (model: AiModelConfig) => Boolean(model.apiKey && model.model);

export const defaultAiModel = (models: AiModelConfig[]) =>
  models.find(isAiModelConfigured) ?? models[0];

export const summarizeAiModels = (models: AiModelConfig[]): AiModelSummary[] =>
  models.map(({ id, label, source, apiKey, model }) => ({
    id,
    label,
    source,
    configured: Boolean(apiKey && model),
  }));

// 推理模型（如 deepseek-flash）在复杂截图上会花较长时间做思维链，55s 常被截断。
// 默认放宽到 180s，可用 AI_REQUEST_TIMEOUT_MS 调整，并夹在 15s–600s 之间。
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 600_000;

export const resolveRequestTimeoutMs = (): number => {
  const raw = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(MIN_REQUEST_TIMEOUT_MS, Math.round(raw)));
};

// 输出上限：推理模型在复杂截图上会把预算大量用于思维链，16K 常被截断（finish_reason=length）。
// 默认 64K（deepseek 思考模式默认），可用 AI_MAX_OUTPUT_TOKENS 调整，夹在 1K–384K。
const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;
const MIN_MAX_OUTPUT_TOKENS = 1_024;
const MAX_MAX_OUTPUT_TOKENS = 384_000;

export const resolveMaxOutputTokens = (): number => {
  const raw = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, Math.round(raw)));
};
