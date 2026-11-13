import { Router } from "express";
import { cleanAiJson } from "../lib/aiJson.js";
import { rateLimit } from "../lib/rateLimit.js";
import { isAiModelConfigured, resolveRequestTimeoutMs, resolveMaxOutputTokens } from "../lib/aiConfig.js";
import { getAiModelState } from "../lib/aiModelStore.js";

const router = Router();

// UI Analysis API
router.post("/analyze/ui", rateLimit("analyze", 20, 60_000), async (req, res) => {
  const { prompt, designImage, buildImage, comparisonImage, modelId, temperature } = req.body;

  const hasDualImages = Boolean(designImage && buildImage);
  if (!prompt || (!comparisonImage && !hasDualImages)) {
    return res.status(400).json({ error: "Prompt and comparison image(s) are required" });
  }

  const timeoutMs = resolveRequestTimeoutMs();
  const maxTokens = resolveMaxOutputTokens();

  try {
    const state = await getAiModelState();
    const config = modelId
      ? state.models.find((model) => model.id === modelId)
      : state.models.find((model) => model.id === state.defaultModelId);

    if (modelId && !config) {
      return res.status(400).json({ error: `Unknown AI model: ${modelId}` });
    }

    if (config && !isAiModelConfigured(config)) {
      return res.status(400).json({
        error: `AI model "${modelId || config.id}" is not configured. Add an API key in Settings or set it on the server.`,
      });
    }

    if (!config) {
      throw new Error(
        "AI model is not configured. Add one in Settings, or set AI_MODELS / AI_API_KEY / AI_MODEL (ARK_API_KEY / DOUBAO_MODEL_ID also supported)."
      );
    }

    const { apiKey, model, endpoint } = config;
    const resolvedTemp =
      typeof temperature === "number" && Number.isFinite(temperature)
        ? Math.min(1, Math.max(0, temperature))
        : 0.7;

    const imageParts = (withDetail: boolean) => {
      const urls = comparisonImage ? [comparisonImage] : [designImage, buildImage];
      return urls.map((url: string) => ({
        type: "image_url",
        image_url: withDetail ? { url, detail: "high" } : { url },
      }));
    };

    const buildPayload = (withDetail: boolean) => ({
      model,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageParts(withDetail)],
        },
      ],
      temperature: resolvedTemp,
      // Reasoning models (e.g. deepseek-flash) spend completion tokens on
      // chain-of-thought before the answer; a small cap is consumed entirely by
      // reasoning, leaving content empty with finish_reason=length.
      max_tokens: maxTokens,
    });

    const postCompletion = (body: Record<string, unknown>) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });

    // Disable or minimize chain-of-thought thinking by default so high-res
    // dual-image comparisons don't exhaust max_tokens on reasoning before
    // emitting the JSON answer. Google's OpenAI-compatible Gemini endpoint uses
    // `reasoning_effort` and rejects `thinking` with HTTP 400.
    const isGeminiOpenAi = endpoint.includes("generativelanguage.googleapis.com");
    const reasoningOverride = isGeminiOpenAi
      ? { reasoning_effort: "low" }
      : { thinking: { type: "disabled" } };

    let response = await postCompletion({
      ...buildPayload(true),
      ...reasoningOverride
    });

    // Strict OpenAI-compatible endpoints may reject non-standard fields (`thinking`
    // or `detail`) with HTTP 400; retry cleanly with the minimal standard payload.
    if (!response.ok && response.status === 400) {
      response = await postCompletion(buildPayload(false));
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error response:", errorText);

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = JSON.parse(errorText);
        throw new Error(`AI API Error: ${errorData.error?.message || response.statusText}`);
      }
      throw new Error(`AI API Error (${response.status}): ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Unexpected response format from API: Expected JSON but received ${contentType || "unknown"} (${text.slice(0, 100)}).`);
    }

    const data: any = await response.json();

    if (data.data && Array.isArray(data.data) && data.data[0]?.url) {
      const imageUrl = data.data[0].url;
      const synthesizedContent = JSON.stringify([
        {
          title: "视觉对比图已生成 (Visual Comparison Generated)",
          type: "STYLE",
          description: `AI 已生成一张视觉对比图。您可以点击此链接查看对比结果：${imageUrl}`,
          rect: { x: 10, y: 10, width: 100, height: 100 },
          imageUrl: imageUrl
        }
      ]);

      return res.json({
        choices: [
          {
            message: {
              content: synthesizedContent
            }
          }
        ]
      });
    }

    const choice = data.choices?.[0];
    const rawContent = choice?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part: any) =>
                typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""
              )
              .join("")
          : "";

    if (!content) {
      if (choice?.finish_reason === "length") {
        throw new Error(
          "AI output was truncated before it produced an answer (finish_reason=length). " +
            "Reasoning models spend the output budget on chain-of-thought; try a non-reasoning vision model or smaller images."
        );
      }
      throw new Error("API returned an empty response (no content).");
    }

    let result;
    let finalContent = content;

    try {
      if (typeof content === 'string') {
        // 1. First try parsing as is (might have markdown)
        try {
          // Extract from markdown if present
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          const rawToParse = jsonMatch ? jsonMatch[1].trim() : content.trim();
          result = JSON.parse(rawToParse);
          finalContent = rawToParse;
        } catch {
          // 2. If initial parsing fails, apply string-aware cleaning
          const cleanContent = cleanAiJson(content);
          result = JSON.parse(cleanContent);
          finalContent = cleanContent;
        }
      } else {
        result = content;
      }
    } catch (e: any) {
      console.error("AI Response Parsing Failed!");
      console.error("--- RAW CONTENT ---");
      console.log(content);
      console.error("--- CLEANED ATTEMPT ---");
      console.log(finalContent);
      console.error("Error Message:", e.message);

      // Fallback response
      result = [
        {
          title: "AI 响应格式不正确",
          type: "STYLE",
          description: `AI 返回的响应格式不正确，无法解析为有效的 JSON。错误信息：${e.message}`,
          rect: { x: 10, y: 10, width: 100, height: 100 }
        }
      ];
    }

    res.json(result);
  } catch (error: any) {
    console.error("AI analyze error:", error);
    if (error?.name === "TimeoutError") {
      return res.status(500).json({
        error: `AI 分析超时（已等待 ${Math.ceil(timeoutMs / 1000)} 秒）。请重试，或换用更快的模型/更小的图片；也可通过 AI_REQUEST_TIMEOUT_MS 调大超时。`,
      });
    }
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;