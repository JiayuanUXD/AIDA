import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

let app: any;
let tmp: string;

const modelPayload = {
  label: "豆包 Vision",
  baseUrl: "https://ark.example/v3/",
  apiKey: "secret-1234",
  model: "doubao-vision",
};

const createModel = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/ai-models")
    .send({ ...modelPayload, ...overrides });

const analyze = (modelId?: string) =>
  request(app)
    .post("/api/analyze/ui")
    .send({
      prompt: "p",
      designImage: "data:image/png;base64,AAAA",
      buildImage: "data:image/png;base64,AAAA",
      ...(modelId ? { modelId } : {}),
    });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aida-ai-models-test-"));
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
  app = (await import("../api/app.js")).default;
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(path.join(tmp, "ai-models.json"), { force: true });
  delete process.env.ARK_API_KEY;
  delete process.env.DOUBAO_MODEL_ID;
  delete process.env.AI_API_BASE_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_MODELS;
});

describe("AI model settings API", () => {
  it("creates a custom model and only returns a masked key", async () => {
    const created = await createModel();

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      label: "豆包 Vision",
      model: "doubao-vision",
      baseUrl: "https://ark.example/v3",
      source: "custom",
      configured: true,
      apiKeyHint: "••••1234",
      isDefault: true,
    });
    expect(created.body.id).toEqual(expect.any(String));
    expect(JSON.stringify(created.body)).not.toContain("secret-1234");

    const list = await request(app).get("/api/ai-models");
    expect(list.status).toBe(200);
    expect(list.body.defaultModelId).toBe(created.body.id);
    expect(list.body.aiConfigured).toBe(true);
    expect(list.body.models).toHaveLength(1);
    expect(list.body.models[0]).toMatchObject({
      id: created.body.id,
      source: "custom",
      apiKeyHint: "••••1234",
      isDefault: true,
    });
    expect(JSON.stringify(list.body)).not.toContain("secret-1234");
  });

  it("validates the base URL and requires an API key", async () => {
    const badUrl = await createModel({ baseUrl: "ftp://example.com" });
    expect(badUrl.status).toBe(400);

    const fileUrl = await createModel({ baseUrl: "file:///tmp/model" });
    expect(fileUrl.status).toBe(400);

    const noKey = await createModel({ apiKey: "" });
    expect(noKey.status).toBe(400);

    const noModel = await createModel({ model: "" });
    expect(noModel.status).toBe(400);
  });

  it("keeps the stored key when an update omits it", async () => {
    const created = await createModel();
    const updated = await request(app)
      .put(`/api/ai-models/${created.body.id}`)
      .send({ label: "新名称", apiKey: "" });

    expect(updated.status).toBe(200);
    expect(updated.body.label).toBe("新名称");
    expect(updated.body.apiKeyHint).toBe("••••1234");

    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "[]" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const tested = await request(app)
      .post("/api/ai-models/test")
      .send({ id: created.body.id });

    expect(tested.status).toBe(200);
    expect(tested.body.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-1234" });
  });

  it("routes analysis to the selected custom model", async () => {
    const created = await createModel();
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "[]" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await analyze(created.body.id);

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ark.example/v3/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-1234" });
    expect(JSON.parse(String(init.body)).model).toBe("doubao-vision");
  });

  it("merges custom models before env models and falls back on delete", async () => {
    process.env.AI_MODELS = JSON.stringify([
      {
        id: "env-model",
        label: "环境模型",
        baseUrl: "https://env.example/v1",
        apiKey: "env-key",
        model: "env-vision",
      },
    ]);
    const custom = await createModel();

    let list = await request(app).get("/api/ai-models");
    expect(list.body.models.map((model: any) => model.id)).toEqual([custom.body.id, "env-model"]);
    expect(list.body.models[1]).toMatchObject({ source: "env", label: "环境模型" });
    expect(list.body.defaultModelId).toBe(custom.body.id);

    const setDefault = await request(app)
      .put("/api/ai-models/default")
      .send({ modelId: "env-model" });
    expect(setDefault.status).toBe(200);
    expect(setDefault.body.defaultModelId).toBe("env-model");

    const deleted = await request(app).delete(`/api/ai-models/${custom.body.id}`);
    expect(deleted.status).toBe(200);

    list = await request(app).get("/api/ai-models");
    expect(list.body.models.map((model: any) => model.id)).toEqual(["env-model"]);
    expect(list.body.defaultModelId).toBe("env-model");
    expect(list.body.aiConfigured).toBe(true);
  });

  it("falls back to the next custom model when the default is deleted", async () => {
    const first = await createModel({ label: "A", model: "a" });
    const second = await createModel({ label: "B", model: "b" });

    expect((await request(app).get("/api/ai-models")).body.defaultModelId).toBe(first.body.id);

    await request(app).delete(`/api/ai-models/${first.body.id}`);

    const list = await request(app).get("/api/ai-models");
    expect(list.body.models).toHaveLength(1);
    expect(list.body.defaultModelId).toBe(second.body.id);
  });

  it("rejects unknown models and does not delete env models", async () => {
    const created = await createModel();

    const unknownAnalyze = await analyze("missing-model");
    expect(unknownAnalyze.status).toBe(400);
    expect(unknownAnalyze.body.error).toContain("Unknown AI model");

    const unknownUpdate = await request(app)
      .put("/api/ai-models/missing-model")
      .send({ label: "x" });
    expect(unknownUpdate.status).toBe(404);

    process.env.AI_MODELS = JSON.stringify([
      { id: "env-model", baseUrl: "https://env.example/v1", apiKey: "k", model: "m" },
    ]);
    const envDelete = await request(app).delete("/api/ai-models/env-model");
    expect(envDelete.status).toBe(404);

    const badDefault = await request(app)
      .put("/api/ai-models/default")
      .send({ modelId: "missing-model" });
    expect(badDefault.status).toBe(400);

    await request(app).delete(`/api/ai-models/${created.body.id}`);
  });

  it("tests a connection with the expected request and reports failures", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "pong" } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await request(app).post("/api/ai-models/test").send({
      baseUrl: "https://vision.example/v1/",
      apiKey: "test-key",
      model: "vision-model",
    });

    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true });
    expect(ok.body.latencyMs).toEqual(expect.any(Number));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vision.example/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "vision-model",
      max_tokens: 8,
      temperature: 0,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid key", { status: 401 }))
    );
    const failed = await request(app).post("/api/ai-models/test").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "bad-key",
      model: "vision-model",
    });
    expect(failed.status).toBe(200);
    expect(failed.body.ok).toBe(false);
    expect(failed.body.error).toContain("401");

    const missingKey = await request(app).post("/api/ai-models/test").send({
      baseUrl: "https://vision.example/v1",
      model: "vision-model",
    });
    expect(missingKey.status).toBe(400);
  });

  it("surfaces the upstream JSON error message instead of the raw payload", async () => {
    // 上游（Ark 等）用 JSON 信封返回错误：{"error":{"message":"...","type":"..."}}
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              message: "Insufficient Balance (request_id: abc-123)",
              type: "insufficient_balance_error",
              param: null,
              code: "invalid_request_error",
            },
          },
          402
        )
      )
    );

    const res = await request(app).post("/api/ai-models/test").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "test-key",
      model: "vision-model",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    // 用户应看到可读的上游原因
    expect(res.body.error).toContain("Insufficient Balance");
    expect(res.body.error).toContain("402");
    // 而不是把整段原始 JSON 信封甩给用户
    expect(res.body.error).not.toContain("insufficient_balance_error");
    expect(res.body.error).not.toContain("invalid_request_error");
    expect(res.body.error).not.toContain('"error"');
    expect(res.body.error).not.toContain("{");
  });

  it("keeps a non-JSON upstream failure readable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 }))
    );

    const res = await request(app).post("/api/ai-models/test").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "bad-key",
      model: "vision-model",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("401");
    expect(res.body.error).toContain("invalid api key");
  });

  it("fetches the provider model list", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: "model-a" }, { id: "model-b" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app).post("/api/ai-models/fetch-models").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "test-key",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ models: ["model-a", "model-b"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vision.example/v1/models");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );
    const failed = await request(app).post("/api/ai-models/fetch-models").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "test-key",
    });
    expect(failed.status).toBe(502);
    expect(failed.body.error).toContain("500");

    // 上游用 JSON 信封报错时也要给出可读原因
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { message: "Invalid api key", type: "auth_error" } }, 401)
      )
    );
    const jsonFailed = await request(app).post("/api/ai-models/fetch-models").send({
      baseUrl: "https://vision.example/v1",
      apiKey: "test-key",
    });
    expect(jsonFailed.status).toBe(502);
    expect(jsonFailed.body.error).toContain("Invalid api key");
    expect(jsonFailed.body.error).not.toContain("auth_error");
    expect(jsonFailed.body.error).not.toContain("{");

    // Strips Google-style "models/" resource prefix and prioritizes chat/vision models
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [
            { id: "models/gemini-2.5-flash" },
            { id: "models/gemini-2.5-flash-preview-tts" },
            { id: "models/gemini-2.5-pro" },
            { id: "models/gemini-embedding-001" },
            { id: "models/gemini-3.5-flash" },
          ],
        })
      )
    );
    const normalized = await request(app).post("/api/ai-models/fetch-models").send({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "test-key",
    });
    expect(normalized.status).toBe(200);
    expect(normalized.body.models).toEqual([
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3.5-flash",
      "gemini-2.5-flash-preview-tts",
      "gemini-embedding-001",
    ]);
  });

  it("reports the merged model list through /api/config", async () => {
    process.env.AI_MODELS = JSON.stringify([
      { id: "env-model", label: "Env", baseUrl: "https://env.example/v1", apiKey: "k", model: "m" },
    ]);
    const custom = await createModel();

    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.defaultModelId).toBe(custom.body.id);
    expect(res.body.aiConfigured).toBe(true);
    expect(res.body.models).toEqual([
      { id: custom.body.id, label: "豆包 Vision", source: "custom", configured: true },
      { id: "env-model", label: "Env", source: "env", configured: true },
    ]);
  });
});
