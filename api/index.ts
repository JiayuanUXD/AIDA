import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { GoogleGenAI } from "@google/genai";
import { TOS } from '@volcengine/tos-sdk';

import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";

// Load base env first, then allow local overrides for developer machine secrets.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Vite dev middleware must be mounted BEFORE API routes so that it can serve
// index.html for non-API requests.
// In FaaS / read-only filesystem environments Vite cannot write its temp files,
// so we wrap the initialisation in a try/catch and fall back to serving the
// pre-built dist/ folder (production mode) when it fails.
let viteInitFailed = false;
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
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("[server] Vite dev server failed to start (read-only fs?), falling back to static dist/ serving:", (err as Error).message);
      viteInitFailed = true;
    }
  }
}
await initVite();

const DATA_DIR_NAME = process.env.DATA_DIR_NAME || "data";
// Support absolute paths (e.g., /mnt/tos) for mounted storage
const DATA_DIR = DATA_DIR_NAME.startsWith('/') 
  ? DATA_DIR_NAME 
  : path.join(process.cwd(), DATA_DIR_NAME);
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const ALLOWED_COLLECTIONS = new Set(["projects", "categories", "analysisResults", "rounds"]);
const PROJECT_ROUNDS_COLLECTION_REGEX = /^projects_[a-zA-Z0-9_-]+_rounds$/;
const SAFE_COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const ALLOWED_PROXY_HOSTS = [
  "figma.com",
  "figma-alpha-api.s3.us-west-2.amazonaws.com",
  "figma-alpha-api.s3.amazonaws.com",
  "s3.amazonaws.com",
  "cloudfront.net",
  "googleusercontent.com",
  "githubusercontent.com",
];

// 火山引擎 TOS 配置
const TOS_REGION = process.env.TOS_REGION;
const TOS_ACCESS_KEY = process.env.TOS_ACCESS_KEY;
const TOS_SECRET_KEY = process.env.TOS_SECRET_KEY;
const TOS_BUCKET = process.env.TOS_BUCKET;
const TOS_ENDPOINT = process.env.TOS_ENDPOINT;
const isTOSEnabled = Boolean(TOS_REGION && TOS_ACCESS_KEY && TOS_SECRET_KEY && TOS_BUCKET && TOS_ENDPOINT);

// 初始化 TOS 客户端
let tosClient: TOS | null = null;
if (isTOSEnabled) {
  try {
    tosClient = new TOS({
      accessKeyId: TOS_ACCESS_KEY!,
      accessKeySecret: TOS_SECRET_KEY!,
      region: TOS_REGION!,
      endpoint: TOS_ENDPOINT!,
      bucket: TOS_BUCKET!,
    });
    console.log('✅ Volcano Engine TOS client initialized');
  } catch (err) {
    console.error('❌ Failed to initialize TOS client:', err);
  }
}

// 统一的对象存储状态
const isCloudStorageEnabled = isTOSEnabled;

// 确保数据目录存在（FaaS 环境可能是只读文件系统，需要容错）
try {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('[server] Cannot create local data directories (read-only fs?). Cloud storage will be used:', (err as Error).message);
}

// JSON DB Helpers
const getDbPath = (collection: string) => path.join(DATA_DIR, `${collection}.json`);
const getTOSDBPath = (collection: string) => `db/${collection}.json`;
const getTOSFilePath = (fileName: string) => `uploads/${fileName}`;

const normalizeCollectionData = (data: unknown) => (Array.isArray(data) ? data : []);

const readCollection = async (collection: string) => {
  // 使用火山引擎 TOS
  if (isTOSEnabled && tosClient) {
    try {
      const tosPath = getTOSDBPath(collection);
      const { data } = await tosClient.getObjectV2({
        bucket: TOS_BUCKET!,
        key: tosPath,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of data.content as any) {
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks).toString('utf-8');
      if (content.trim()) {
        return normalizeCollectionData(JSON.parse(content));
      }
    } catch (err: any) {
      // TOS returns 'NoSuchKey' status code 404
      if (err?.statusCode !== 404) {
        console.error(`Error reading TOS collection ${collection}:`, err);
      }
    }
  }

  // 回退到本地文件系统
  try {
    const filePath = getDbPath(collection);
    if (!existsSync(filePath)) return [];
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    if (err instanceof SyntaxError) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const retryPath = getDbPath(collection);
        const retryContent = await fs.readFile(retryPath, "utf-8");
        return JSON.parse(retryContent);
      } catch {}
    }
    console.error(`Error reading collection ${collection}:`, err);
    return [];
  }
};

const writeCollection = async (collection: string, data: any[]) => {
  // 使用火山引擎 TOS
  if (isTOSEnabled && tosClient) {
    const tosPath = getTOSDBPath(collection);
    const content = JSON.stringify(data, null, 2);
    await tosClient.putObject({
      bucket: TOS_BUCKET!,
      key: tosPath,
      body: Buffer.from(content, 'utf-8'),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    return;
  }

  // 回退到本地文件系统
  const filePath = getDbPath(collection);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
};

const isPrivateOrLocalHostname = (hostname: string) => {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "::1") return true;
  if (lower.startsWith("127.")) return true;
  if (lower.startsWith("10.")) return true;
  if (lower.startsWith("192.168.")) return true;
  if (lower.startsWith("169.254.")) return true;
  const octets = lower.split(".");
  if (octets.length === 4) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (!Number.isNaN(first) && !Number.isNaN(second)) {
      if (first === 172 && second >= 16 && second <= 31) return true;
    }
  }
  return false;
};

const isAllowedProxyHost = (hostname: string) => {
  const lower = hostname.toLowerCase();
  return ALLOWED_PROXY_HOSTS.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
};

const isAllowedCollection = (collection: string) => {
  if (!SAFE_COLLECTION_NAME_REGEX.test(collection)) return false;
  if (ALLOWED_COLLECTIONS.has(collection)) return true;
  if (PROJECT_ROUNDS_COLLECTION_REGEX.test(collection)) return true;
  return false;
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Health check
app.get("/api/health", (req, res) => {
  const dbProvider = isTOSEnabled ? "volc-tos" : "local";
  const storageProvider = isTOSEnabled ? "volc-tos" : "local";
  res.json({ status: "ok", env: process.env.NODE_ENV, dbProvider, storageProvider, dataDir: DATA_DIR });
});

// Error handler for body-parser errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "Payload too large. The images are too big for the analysis API." });
  }
  next(err);
});

// Config endpoint (intentionally not exposing secrets)
app.get("/api/config", (req, res) => {
  res.json({});
});

// --- DB Endpoints ---
app.get("/api/db/:collection", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  const data = await readCollection(collection);
  res.json(data);
});

app.get("/api/db/:collection/:id", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  const data = await readCollection(collection);
  const doc = data.find((d: any) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

app.post("/api/db/:collection", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    const data = await readCollection(collection);
    const newDoc = {
      ...req.body,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.push(newDoc);
    await writeCollection(collection, data);
    res.json(newDoc);
  } catch (err: any) {
    console.error(`[POST /api/db/${collection}] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to save data' });
  }
});

app.put("/api/db/:collection/:id", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    const data = await readCollection(collection);
    const index = data.findIndex((d: any) => d.id === req.params.id);
    if (index === -1) {
      const newDoc = { ...req.body, id: req.params.id, updatedAt: Date.now() };
      data.push(newDoc);
      await writeCollection(collection, data);
      return res.json(newDoc);
    }
    data[index] = { ...data[index], ...req.body, updatedAt: Date.now() };
    await writeCollection(collection, data);
    res.json(data[index]);
  } catch (err: any) {
    console.error(`[PUT /api/db/${collection}/${req.params.id}] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to save data' });
  }
});

app.delete("/api/db/:collection/:id", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    const data = await readCollection(collection);
    const filtered = data.filter((d: any) => d.id !== req.params.id);
    await writeCollection(collection, filtered);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[DELETE /api/db/${collection}/${req.params.id}] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to delete data' });
  }
});

// --- Storage Endpoints ---
app.post("/api/storage/upload", async (req, res) => {
  const { path: filePath, data } = req.body;
  if (!filePath || !data) return res.status(400).json({ error: "Path and data required" });
  
  // Safe filename
  const fileName = String(filePath).replace(/[\\/]/g, '_');

  // 解析 data URL
  let body: string | Buffer = data;
  let contentType = "text/plain; charset=utf-8";
  const match = typeof data === "string" ? data.match(/^data:([^;]+);base64,(.+)$/) : null;
  if (match) {
    contentType = match[1];
    body = Buffer.from(match[2], "base64");
  }

  // Store uploads in Volcano Engine TOS
  if (isTOSEnabled && tosClient) {
    try {
      const tosPath = getTOSFilePath(fileName);
      await tosClient.putObject({
        bucket: TOS_BUCKET!,
        key: tosPath,
        body: typeof body === 'string' ? Buffer.from(body, 'utf-8') : body,
        headers: {
          'Content-Type': contentType,
        },
      });
      return res.json({ success: true, url: `/api/storage/file/${fileName}` });
    } catch (err: any) {
      console.error("TOS storage upload error:", err);
      return res.status(500).json({ error: err.message || "TOS storage upload failed" });
    }
  }

  // 回退到本地文件系统
  const fullPath = path.join(UPLOADS_DIR, fileName);
  await fs.writeFile(fullPath, typeof body === 'string' ? body : data, "utf-8");
  res.json({ success: true, url: `/api/storage/file/${fileName}` });
});

app.get("/api/storage/file/:filename", async (req, res) => {
  // 从火山引擎 TOS 读取
  if (isTOSEnabled && tosClient) {
    try {
      const tosPath = getTOSFilePath(req.params.filename);
      const { data } = await tosClient.getObjectV2({
        bucket: TOS_BUCKET!,
        key: tosPath,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of data.content as any) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const contentType = (data as any).metadata?.['content-type'] || 'application/octet-stream';
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    } catch (err: any) {
      if (err?.statusCode === 404) {
        return res.status(404).send("File not found");
      }
      console.error("TOS storage read error:", err);
      return res.status(500).send("Read error");
    }
  }

  // 回退到本地文件系统
  try {
    const fileName = req.params.filename;
    const fullPath = path.join(UPLOADS_DIR, fileName);
    if (!existsSync(fullPath)) return res.status(404).send("File not found");
    
    // Read the stored content (which is a Data URL string)
    const content = await fs.readFile(fullPath, "utf-8");
    
    // If it's a Data URL, parse and send as binary
    if (content.startsWith('data:')) {
      const match = content.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      }
    }
    
    // Fallback for non-data URL content
    res.setHeader("Content-Type", "text/plain");
    res.send(content);
  } catch (err) {
    console.error("Local storage read error:", err);
    res.status(500).send("Read error");
  }
});

// Figma API Proxy
app.post("/api/figma/fetch", async (req, res) => {
  const { url } = req.body;
  const token = process.env.FIGMA_ACCESS_TOKEN;

  if (!token || token.trim() === "") {
    return res.status(400).json({ 
      error: "FIGMA_ACCESS_TOKEN is not set. Please go to the 'Secrets' panel in AI Studio, add 'FIGMA_ACCESS_TOKEN', and paste your Figma Personal Access Token." 
  });
  }

  try {
    // Parse Figma URL
    const fileKeyMatch = url.match(/\/(?:file|design)\/([a-zA-Z0-9_-]+)/);
    const nodeIdMatch = url.match(/node-id=([a-zA-Z0-9%:-]+)/);

    if (!fileKeyMatch) {
      return res.status(400).json({ error: "Invalid Figma URL. Could not find file key. Make sure you are pasting a valid Figma design or file link." });
    }

    const fileKey = fileKeyMatch[1];
    let nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":") : null;

    // Fetch from Figma API
    const apiUrl = nodeId 
      ? `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`
      : `https://api.figma.com/v1/files/${fileKey}`;

    const headers = { "X-Figma-Token": token };
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: `Figma API error: ${response.statusText}`, 
        details: errorData 
      });
    }

    const data = await response.json();
    
    if (nodeId) {
      const imageUrl = data.images[nodeId];
      if (!imageUrl) {
        return res.status(404).json({ error: "Could not find image for the specified node." });
      }
      res.json({ imageUrl });
    } else {
      res.json(data);
    }
  } catch (error: any) {
    console.error("Figma fetch error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Proxy image endpoint to bypass CORS
app.get("/api/proxy-image", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") return res.status(400).send("URL required");

  try {
    const targetUrl = new URL(url);
    if (!isAllowedProxyHost(targetUrl.hostname) && !isPrivateOrLocalHostname(targetUrl.hostname)) {
      return res.status(403).send("Domain not allowed for proxying");
    }

    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send(response.statusText);

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(500).send("Proxy error");
  }
});

// UI Analysis API
app.post("/api/analyze/ui", async (req, res) => {
  const { prompt, designImage, buildImage, model = "doubao" } = req.body;

  if (!prompt || !designImage || !buildImage) {
    return res.status(400).json({ error: "Prompt and both images are required" });
  }

  try {
    const API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    const API_KEY = process.env.ARK_API_KEY;
    const MODEL_ID = process.env.DOUBAO_MODEL_ID;

    if (!API_KEY || !MODEL_ID) {
      throw new Error("ARK_API_KEY or DOUBAO_MODEL_ID is not configured.");
    }

    // Doubao (ARK) integration
    const payload = {
      model: MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: designImage } },
            { type: "image_url", image_url: { url: buildImage } }
          ]
        }
      ],
      temperature: 0.7,
      max_tokens: 4096
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ark API error response:", errorText);
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = JSON.parse(errorText);
        throw new Error(`Ark API Error: ${errorData.error?.message || response.statusText}`);
      }
      throw new Error(`Ark API Error (${response.status}): ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Unexpected response format from API: Expected JSON but received ${contentType || "unknown"}.`);
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
    const content = choice?.message?.content;
    
    if (!content) {
      throw new Error(`API returned an empty response or error: ${JSON.stringify(data)}`);
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
        } catch (initialError) {
          // 2. If initial parsing fails, apply safe cleaning
          let cleanContent = content;
          
          // Try to extract JSON structure if surrounded by other text
          const firstBracket = content.indexOf('[');
          const firstBrace = content.indexOf('{');
          const lastBracket = content.lastIndexOf(']');
          const lastBrace = content.lastIndexOf('}');
          
          let start = -1;
          let end = -1;
          
          if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            start = firstBracket;
            end = lastBracket;
          } else if (firstBrace !== -1) {
            start = firstBrace;
            end = lastBrace;
          }
          
          if (start !== -1 && end !== -1 && end > start) {
            cleanContent = content.substring(start, end + 1);
          }

          // More careful cleaning
          cleanContent = cleanContent
            // Remove single line comments
            .replace(/\/\/.*$/gm, '')
            // Remove multi-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Fix single quotes for property names
            .replace(/([{,]\s*)'(\w+)'(\s*:)/g, '$1"$2"$3')
            // Fix missing quotes for property names
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
            // Remove trailing commas
            .replace(/,\s*([}\]])/g, '$1')
            .trim();

          result = JSON.parse(cleanContent);
          finalContent = cleanContent;
        }
      } else {
        result = content;
      }
    } catch (e) {
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Catch-all for unmatched API routes
app.all("/api/*", (req, res) => {
  console.log(`[API 404] Unmatched route: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: `API route not found: ${req.method} ${req.url}`,
    availableRoutes: ["/api/config", "/api/figma/fetch", "/api/proxy-image", "/api/analyze/ui", "/api/health"]
  });
});

// Configure static serving and catch-all for non-API routes.
// Also activated when Vite dev server failed to start (e.g. read-only FaaS fs).
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

async function startServer(port: number = PORT, retries: number = 10) {
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => {
      const serverUrl = process.env.NODE_ENV === "production"
        ? `http://0.0.0.0:${port}`
        : `http://localhost:${port}`;
      console.log(`🚀 Server running on ${serverUrl}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Storage: ${isTOSEnabled ? 'Volcano Engine TOS' : 'Local File System'}`);
      console.log(`📂 Data Dir: ${DATA_DIR}`);
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

// Global error handlers for better Cloud Run logging
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  // Give it a moment to flush logs before exiting
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

export default app;
