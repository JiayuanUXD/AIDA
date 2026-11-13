import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

let app: any;
let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aida-api-test-"));
  process.env.DATA_DIR_NAME = tmp;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.ACCESS_PASSWORD;
  delete process.env.ARK_API_KEY;
  delete process.env.DOUBAO_MODEL_ID;
  delete process.env.AI_API_BASE_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_MODELS;
  fs.writeFileSync(path.join(tmp, "secret.txt"), "TOPSECRET");
  app = (await import("../api/app.js")).default;
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("storage security", () => {
  it("rejects path traversal in filename", async () => {
    const res = await request(app).get("/api/storage/file/..%2Fsecret.txt");
    expect([400, 404]).toContain(res.status);
  });

  it("rejects non-image upload MIME", async () => {
    const res = await request(app).post("/api/storage/upload").send({
      path: "x.html",
      data: "data:text/html;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"),
    });
    expect(res.status).toBe(400);
  });

  it("rejects dot-only upload filename", async () => {
    const res = await request(app).post("/api/storage/upload").send({
      path: "..",
      data: "data:image/png;base64,AAAA",
    });
    expect(res.status).toBe(400);
  }, 8000);
});

describe("proxy SSRF", () => {
  it("blocks loopback targets", async () => {
    const res = await request(app).get("/api/proxy-image").query({ url: "http://127.0.0.1:1/x.png" });
    expect(res.status).toBe(403);
  });

  it("blocks cloud metadata targets", async () => {
    const res = await request(app).get("/api/proxy-image").query({ url: "http://169.254.169.254/latest/meta-data/" });
    expect(res.status).toBe(403);
  });
});

describe("db integrity", () => {
  it("surfaces corrupted collection instead of empty array", async () => {
    fs.writeFileSync(path.join(tmp, "projects.json"), "{corrupt");
    const res = await request(app).get("/api/db/projects");
    expect(res.status).toBeGreaterThanOrEqual(500);
    fs.rmSync(path.join(tmp, "projects.json"));
  });

  it("keeps all concurrent inserts", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app).post("/api/db/categories").send({ id: "c" + i, name: "c" + i })
      )
    );
    const res = await request(app).get("/api/db/categories");
    expect(res.body.length).toBe(8);
  });
});

describe("analyze contract", () => {
  it("accepts data-URL contract and reaches provider config check", async () => {
    const res = await request(app).post("/api/analyze/ui").send({
      prompt: "p",
      designImage: "data:image/png;base64,AAAA",
      buildImage: "data:image/png;base64,AAAA",
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/not configured/);
  });

  it("rejects legacy mismatched payload", async () => {
    const res = await request(app).post("/api/analyze/ui").send({
      prompt: "p",
      designImg: { data: "AAAA", mimeType: "image/png" },
      buildImg: { data: "AAAA", mimeType: "image/png" },
    });
    expect(res.status).toBe(400);
  });
});

describe("CORS", () => {
  it("does not allow arbitrary origins", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("AI provider configuration", () => {
  const analyze = (extra: Record<string, unknown> = {}) =>
    request(app)
      .post("/api/analyze/ui")
      .send({
        prompt: "p",
        designImage: "data:image/png;base64,AAAA",
        buildImage: "data:image/png;base64,AAAA",
        ...extra,
      });

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const okFetch = () =>
    vi.fn(async () => jsonResponse({ choices: [{ message: { content: "[]" } }] }));

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_API_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_MODELS;
    delete process.env.ARK_API_KEY;
    delete process.env.DOUBAO_MODEL_ID;
    delete process.env.AI_REQUEST_TIMEOUT_MS;
    delete process.env.AI_MAX_OUTPUT_TOKENS;
  });

  it("calls the configured OpenAI-compatible endpoint with the configured model", async () => {
    process.env.AI_API_BASE_URL = "https://vision.example/v1/";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "vision-model";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vision.example/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe("vision-model");
    expect(payload.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("falls back to ARK_API_KEY and DOUBAO_MODEL_ID", async () => {
    process.env.ARK_API_KEY = "ark-key";
    process.env.DOUBAO_MODEL_ID = "doubao-vision";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe("doubao-vision");
    expect(init.headers).toMatchObject({ Authorization: "Bearer ark-key" });
  });

  it("normalizes array content returned by some providers", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    const diffs = [
      { title: "t", type: "STYLE", description: "d", rect: { x: 1, y: 2, width: 3, height: 4 } },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: [{ type: "text", text: JSON.stringify(diffs) }] } }],
        })
      )
    );

    const res = await analyze();

    expect(res.status).toBe(200);
    expect(res.body).toEqual(diffs);
  });

  it("lists configured models without leaking credentials", async () => {
    process.env.AI_MODELS = JSON.stringify([
      {
        id: "doubao",
        label: "豆包 Vision",
        baseUrl: "https://ark.example/v3",
        apiKey: "ark-secret",
        model: "doubao-vision",
      },
      {
        id: "gpt",
        label: "GPT-4o",
        baseUrl: "https://openai.example/v1",
        apiKey: "sk-secret",
        model: "gpt-4o",
      },
    ]);

    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      models: [
        { id: "doubao", label: "豆包 Vision", source: "env", configured: true },
        { id: "gpt", label: "GPT-4o", source: "env", configured: true },
      ],
      defaultModelId: "doubao",
      aiConfigured: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("ark-secret");
    expect(JSON.stringify(res.body)).not.toContain("sk-secret");
  });

  it("routes each request to the selected model's provider", async () => {
    process.env.AI_MODELS = JSON.stringify([
      {
        id: "doubao",
        baseUrl: "https://ark.example/v3",
        apiKey: "ark-key",
        model: "doubao-vision",
      },
      {
        id: "gpt",
        baseUrl: "https://openai.example/v1",
        apiKey: "sk-key",
        model: "gpt-4o",
      },
    ]);
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze({ modelId: "gpt" });

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openai.example/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-key" });
    expect(JSON.parse(String(init.body)).model).toBe("gpt-4o");
  });

  it("inherits global credentials for models that omit them", async () => {
    process.env.AI_API_BASE_URL = "https://gateway.example/v1";
    process.env.AI_API_KEY = "shared-key";
    process.env.AI_MODELS = JSON.stringify([{ id: "plain", label: "Plain", model: "plain-model" }]);
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze({ modelId: "plain" });

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer shared-key" });
    expect(JSON.parse(String(init.body)).model).toBe("plain-model");
  });

  it("rejects an unknown modelId", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "vision-model";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze({ modelId: "does-not-exist" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unknown AI model");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unconfigured models without leaking the key", async () => {
    process.env.AI_MODELS = JSON.stringify([{ id: "m", model: "vision-model" }]);

    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      models: [{ id: "m", label: "m", source: "env", configured: false }],
      defaultModelId: "m",
      aiConfigured: false,
    });
    expect(res.body).not.toHaveProperty("apiKey");
  });

  it("honors AI_REQUEST_TIMEOUT_MS and reports a clear timeout message", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "vision-model";
    process.env.AI_REQUEST_TIMEOUT_MS = "1000";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            const onAbort = () => reject(signal.reason);
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort, { once: true });
          })
      )
    );

    const res = await analyze();

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/超时|timed?\s?out|timeout/i);
  });

  it("defaults the upstream timeout to a generous value and clamps overrides", async () => {
    const { resolveRequestTimeoutMs } = await import("../api/lib/aiConfig.js");

    delete process.env.AI_REQUEST_TIMEOUT_MS;
    expect(resolveRequestTimeoutMs()).toBeGreaterThanOrEqual(120_000);

    process.env.AI_REQUEST_TIMEOUT_MS = "90000";
    expect(resolveRequestTimeoutMs()).toBe(90_000);

    process.env.AI_REQUEST_TIMEOUT_MS = "10";
    expect(resolveRequestTimeoutMs()).toBeGreaterThanOrEqual(1_000);

    process.env.AI_REQUEST_TIMEOUT_MS = "abc";
    expect(resolveRequestTimeoutMs()).toBeGreaterThanOrEqual(120_000);
  });

  it("honors AI_MAX_OUTPUT_TOKENS for the output budget", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "vision-model";
    process.env.AI_MAX_OUTPUT_TOKENS = "30000";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).max_tokens).toBe(30000);
  });

  it("defaults the output budget generously and clamps overrides", async () => {
    const { resolveMaxOutputTokens } = await import("../api/lib/aiConfig.js");

    delete process.env.AI_MAX_OUTPUT_TOKENS;
    expect(resolveMaxOutputTokens()).toBeGreaterThanOrEqual(32768);

    process.env.AI_MAX_OUTPUT_TOKENS = "30000";
    expect(resolveMaxOutputTokens()).toBe(30000);

    process.env.AI_MAX_OUTPUT_TOKENS = "1";
    expect(resolveMaxOutputTokens()).toBeGreaterThanOrEqual(1024);

    process.env.AI_MAX_OUTPUT_TOKENS = "abc";
    expect(resolveMaxOutputTokens()).toBeGreaterThanOrEqual(32768);
  });

  it("requests an output budget large enough for reasoning models", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "deepseek-flash";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    // Reasoning models spend completion tokens on chain-of-thought before the
    // answer; a 4096 cap is consumed entirely by reasoning (finish_reason=length).
    expect(payload.max_tokens).toBeGreaterThanOrEqual(16384);
    expect(payload.thinking).toEqual({ type: "disabled" });
  });

  it("retries without `thinking` when a strict OpenAI-compatible provider returns 400", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "gpt-4o";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.thinking) {
        return new Response(
          JSON.stringify({ error: { message: "Unrecognized request argument supplied: thinking" } }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      return jsonResponse({ choices: [{ message: { content: "[]" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondPayload = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(secondPayload.thinking).toBeUndefined();
  });

  it("uses reasoning_effort instead of thinking for Gemini OpenAI-compatible endpoints", async () => {
    process.env.AI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
    process.env.AI_API_KEY = "gemini-key";
    process.env.AI_MODEL = "gemini-2.5-flash";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.reasoning_effort).toBe("low");
    expect(payload.thinking).toBeUndefined();
  });

  it("supports single comparisonImage slices with high detail and strips unsupported fields on 400", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "vision-model";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const hasDetail = body.messages[0].content.some((part: any) => part.image_url?.detail);
      if (body.thinking || hasDetail) {
        return new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: detail" } }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      return jsonResponse({ choices: [{ message: { content: "[]" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/api/analyze/ui")
      .send({
        prompt: "p",
        comparisonImage: "data:image/jpeg;base64,AAAA",
        temperature: 0.3,
      });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstPayload = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(firstPayload.messages[0].content).toHaveLength(2);
    expect(firstPayload.messages[0].content[1].image_url.detail).toBe("high");
    expect(firstPayload.temperature).toBe(0.3);

    const secondPayload = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(secondPayload.messages[0].content[1].image_url.detail).toBeUndefined();
  });

  it("reports a clear, non-leaking error when a reasoning model truncates before answering", async () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "deepseek-flash";
    const secretReasoning = "REASONING_MARKER_比较设计稿与开发稿的思维链";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: "", reasoning_content: secretReasoning },
            },
          ],
          usage: {
            completion_tokens: 16384,
            completion_tokens_details: { reasoning_tokens: 16384 },
          },
        })
      )
    );

    const res = await analyze();

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/truncat/i);
    expect(res.body.error).not.toContain(secretReasoning);
    expect(res.body.error.length).toBeLessThan(400);
  });
});