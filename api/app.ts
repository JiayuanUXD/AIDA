import "./lib/env.js";
import express from "express";
import { isVercelRuntime, hasBlobToken, isCloudStorageEnabled } from "./lib/store.js";
import { authGate, loginHandler } from "./lib/auth.js";
import { rateLimit } from "./lib/rateLimit.js";
import { asyncHandler } from "./lib/http.js";
import { summarizeAiModels } from "./lib/aiConfig.js";
import { getAiModelState } from "./lib/aiModelStore.js";
import dbRouter from "./routes/db.js";
import storageRouter from "./routes/storage.js";
import proxyRouter from "./routes/proxy.js";
import analyzeRouter from "./routes/analyze.js";
import aiModelsRouter from "./routes/aiModels.js";

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    env: process.env.NODE_ENV,
    runtime: isVercelRuntime ? "vercel" : "node",
    blobConfigured: hasBlobToken,
    dbProvider: isCloudStorageEnabled ? 'vercel-blob' : 'local',
    storageProvider: isCloudStorageEnabled ? 'vercel-blob' : 'local',
    authConfigured: Boolean(process.env.ACCESS_PASSWORD),
  });
});

// Error handler for body-parser errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "Payload too large. The images are too big for the analysis API." });
  }
  next(err);
});

app.post("/api/auth/login", rateLimit("login", 10, 60_000), loginHandler);

app.use(authGate);

app.get("/api/config", asyncHandler(async (_req, res) => {
  const state = await getAiModelState();
  res.json({
    models: summarizeAiModels(state.models),
    defaultModelId: state.defaultModelId,
    aiConfigured: state.aiConfigured,
  });
}));

app.use("/api/ai-models", aiModelsRouter);
app.use("/api/db", dbRouter);
app.use("/api/storage", storageRouter);
app.use("/api", proxyRouter);
app.use("/api", analyzeRouter);

// Catch-all for unmatched API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Final error handler: async route rejections land here instead of hanging.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[api] ${req.method} ${req.url}:`, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

export default app;