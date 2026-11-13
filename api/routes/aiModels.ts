import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { rateLimit } from "../lib/rateLimit.js";
import { normalizeBaseUrl, text, truncateMessage, upstreamErrorDetail } from "../lib/aiModelInput.js";
import {
  addCustomModel,
  deleteCustomModel,
  getAiModelState,
  setDefaultModel,
  toAiModelDto,
  updateCustomModel,
  type AiModelDto,
} from "../lib/aiModelStore.js";
import type { AiModelConfig } from "../lib/aiConfig.js";

const router = Router();

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const dtoById = async (id: string): Promise<AiModelDto> => {
  const state = await getAiModelState();
  const model = state.models.find((item) => item.id === id);
  if (!model) throw httpError(404, "AI model not found");
  return toAiModelDto(model, state.defaultModelId);
};

const resolveConnectionTarget = async (body: any) => {
  const id = text(body?.id);
  let saved: AiModelConfig | undefined;

  if (id) {
    const state = await getAiModelState();
    saved = state.models.find((model) => model.id === id);
    if (!saved) throw httpError(404, "AI model not found");
  }

  const rawBaseUrl = text(body?.baseUrl);
  let baseUrl = saved?.baseUrl ?? "";
  if (rawBaseUrl) {
    const normalized = normalizeBaseUrl(rawBaseUrl);
    if (!normalized) throw httpError(400, "baseUrl must be a valid http(s) URL");
    baseUrl = normalized;
  }
  if (!baseUrl) throw httpError(400, "baseUrl is required");

  return {
    baseUrl,
    apiKey: text(body?.apiKey) || saved?.apiKey || "",
    model: text(body?.model) || saved?.model || "",
  };
};

router.get("/", asyncHandler(async (_req, res) => {
  const state = await getAiModelState();
  res.json({
    models: state.models.map((model) => toAiModelDto(model, state.defaultModelId)),
    defaultModelId: state.defaultModelId,
    aiConfigured: state.aiConfigured,
  });
}));

router.post("/", asyncHandler(async (req, res) => {
  const label = text(req.body?.label);
  const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
  const apiKey = text(req.body?.apiKey);
  const model = text(req.body?.model);

  if (!baseUrl) return res.status(400).json({ error: "baseUrl must be a valid http(s) URL" });
  if (!apiKey) return res.status(400).json({ error: "apiKey is required" });
  if (!model) return res.status(400).json({ error: "model is required" });

  const created = await addCustomModel({ label: label || model, baseUrl, apiKey, model });
  res.status(201).json(await dtoById(created.id));
}));

router.put("/default", asyncHandler(async (req, res) => {
  const modelId = text(req.body?.modelId);
  if (!modelId) return res.status(400).json({ error: "modelId is required" });
  const defaultModelId = await setDefaultModel(modelId);
  res.json({ defaultModelId });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id;
  const patch: { label?: string; baseUrl?: string; apiKey?: string; model?: string } = {};

  if (req.body?.label !== undefined) patch.label = text(req.body.label);
  if (req.body?.model !== undefined) {
    const model = text(req.body.model);
    if (!model) return res.status(400).json({ error: "model is required" });
    patch.model = model;
  }
  if (req.body?.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(req.body.baseUrl);
    if (!baseUrl) return res.status(400).json({ error: "baseUrl must be a valid http(s) URL" });
    patch.baseUrl = baseUrl;
  }
  const apiKey = text(req.body?.apiKey);
  if (apiKey) patch.apiKey = apiKey;

  await updateCustomModel(id, patch);
  res.json(await dtoById(id));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  await deleteCustomModel(req.params.id);
  res.json({ success: true });
}));

router.post("/test", rateLimit("ai-model-test", 20, 60_000), asyncHandler(async (req, res) => {
  const { baseUrl, apiKey, model } = await resolveConnectionTarget(req.body);
  if (!apiKey) return res.status(400).json({ error: "apiKey is required" });
  if (!model) return res.status(400).json({ error: "model is required" });

  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const detail = upstreamErrorDetail(await response.text());
      return res.json({
        ok: false,
        latencyMs,
        error: `Upstream returned ${response.status}${detail ? `: ${detail}` : ""}`,
      });
    }

    res.json({ ok: true, latencyMs });
  } catch (err: any) {
    res.json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: truncateMessage(err?.message || "Connection failed"),
    });
  }
}));

const NON_CHAT_MODEL_RE =
  /(?:^|-)(?:embedding|tts|lyria|aqa|transcribe|native-audio|live|robotics|computer-use|deep-research|realtime)(?:-|$)/i;

const normalizeFetchedModels = (entries: unknown): string[] => {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const primary: string[] = [];
  const secondary: string[] = [];

  for (const entry of entries) {
    const rawId = text((entry as any)?.id);
    if (!rawId) continue;
    // Google's OpenAI-compatible /models endpoint returns resource names like
    // "models/gemini-2.5-pro", whereas chat/completions expects "gemini-2.5-pro".
    const id = rawId.replace(/^models\//, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (NON_CHAT_MODEL_RE.test(id)) secondary.push(id);
    else primary.push(id);
  }

  return [...primary, ...secondary];
};

router.post("/fetch-models", rateLimit("ai-model-fetch", 20, 60_000), asyncHandler(async (req, res) => {
  const { baseUrl, apiKey } = await resolveConnectionTarget(req.body);
  if (!apiKey) return res.status(400).json({ error: "apiKey is required" });

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = upstreamErrorDetail(await response.text());
      return res.status(502).json({
        error: `Upstream returned ${response.status}${detail ? `: ${detail}` : ""}`,
      });
    }

    const data: any = await response.json();
    const models = normalizeFetchedModels(data?.data);
    res.json({ models });
  } catch (err: any) {
    res.status(502).json({ error: truncateMessage(err?.message || "Failed to fetch models") });
  }
}));

export default router;
