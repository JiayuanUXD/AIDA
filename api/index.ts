import "./lib/env.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// In FaaS / read-only filesystem environments Vite cannot write its temp files,
// so we wrap the initialisation in a try/catch and fall back to serving the
// pre-built dist/ folder (production mode) when it fails.
let viteInitFailed = false;
let viteMiddlewares: any = null;
async function initVite() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === "true" ? false : { port: 24679 },
        },
        appType: "spa",
      });
      viteMiddlewares = vite.middlewares;
    } catch (err) {
      console.warn("[server] Vite dev server failed to start (read-only fs?), falling back to static dist/ serving:", (err as Error).message);
      viteInitFailed = true;
    }
  }
}
await initVite();

// Mount Vite after API routes so its SPA fallback cannot shadow /api requests.
if (viteMiddlewares) {
  app.use(viteMiddlewares);
}

// Configure static serving and catch-all for non-API routes.
// Vercel handles static assets automatically via CDN.
if (!process.env.VERCEL) {
  if (process.env.NODE_ENV === "production" || viteInitFailed) {
    const distDir = path.join(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(distDir, "index.html"));
      } else {
        res.status(404).json({ error: "API route not found" });
      }
    });
  }
}

async function startServer(port: number = PORT, retries: number = 10) {
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => {
      const serverUrl = process.env.NODE_ENV === "production"
        ? `http://0.0.0.0:${port}`
        : `http://localhost:${port}`;
      console.log(`🚀 Server running on ${serverUrl}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Storage: Local File System`);
      console.log(`📂 Data Dir: ${process.env.DATA_DIR_NAME || "data"}`);
      resolve();
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
        server.close();
        startServer(port + 1, retries - 1).then(resolve).catch(reject);
      } else {
        console.error('❌ Server startup error:', err);
        reject(err);
      }
    });
  });
}

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Do not map to a port if hosted on Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;
