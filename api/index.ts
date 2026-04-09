import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { GoogleGenAI } from "@google/genai";
import { list, put } from "@vercel/blob";

import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL);

const DATA_DIR_NAME = process.env.DATA_DIR_NAME || "data";
const DATA_DIR = IS_VERCEL_RUNTIME
  ? path.join("/tmp", DATA_DIR_NAME)
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
const BLOB_DB_PREFIX = (process.env.BLOB_DB_PREFIX || "db").replace(/^\/+|\/+$/g, "");
const BLOB_UPLOADS_PREFIX = (process.env.BLOB_UPLOADS_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");
const isBlobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// Ensure data directories exist
if (!isBlobEnabled || !IS_VERCEL_RUNTIME) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

// JSON DB Helpers
const getDbPath = (collection: string) => path.join(DATA_DIR, `${collection}.json`);
const getBlobDbPathname = (collection: string) => `${BLOB_DB_PREFIX}/${collection}.json`;
const getBlobUploadPathname = (fileName: string) => `${BLOB_UPLOADS_PREFIX}/${fileName}`;

const getBlobByPathname = async (pathname: string) => {
  const { blobs } = await list({ prefix: pathname, limit: 1000 });
  return blobs.find((blob: any) => blob.pathname === pathname) || null;
};

const readCollection = async (collection: string) => {
  if (isBlobEnabled) {
    try {
      const pathname = getBlobDbPathname(collection);
      const blob = await getBlobByPathname(pathname);
      if (!blob) return [];
      const response = await fetch(blob.url, { cache: "no-store" as RequestCache });
      if (!response.ok) return [];
      const content = await response.text();
      if (!content.trim()) return [];
      return JSON.parse(content);
    } catch (err) {
      console.error(`Error reading blob collection ${collection}:`, err);
      return [];
    }
  }

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
  if (isBlobEnabled) {
    const pathname = getBlobDbPathname(collection);
    await put(pathname, JSON.stringify(data, null, 2), {
      access: "public",
      contentType: "application/json; charset=utf-8",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return;
  }

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
  res.json({ status: "ok", env: process.env.NODE_ENV, vercel: !!process.env.VERCEL });
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
  const data = await readCollection(collection);
  const newDoc = {
    ...req.body,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  data.push(newDoc);
  await writeCollection(collection, data);
  res.json(newDoc);
});

app.put("/api/db/:collection/:id", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
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
});

app.delete("/api/db/:collection/:id", async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  const data = await readCollection(collection);
  const filtered = data.filter((d: any) => d.id !== req.params.id);
  await writeCollection(collection, filtered);
  res.json({ success: true });
});

// --- Storage Endpoints ---
app.post("/api/storage/upload", async (req, res) => {
  const { path: filePath, data } = req.body;
  if (!filePath || !data) return res.status(400).json({ error: "Path and data required" });
  
  // Safe filename
  const fileName = filePath.replace(/\//g, '_');
  if (isBlobEnabled) {
    try {
      let body: string | Buffer = data;
      let contentType = "text/plain; charset=utf-8";

      const match = typeof data === "string" ? data.match(/^data:([^;]+);base64,(.+)$/) : null;
      if (match) {
        contentType = match[1];
        body = Buffer.from(match[2], "base64");
      }

      const pathname = getBlobUploadPathname(fileName);
      await put(pathname, body, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
      return res.json({ success: true, url: `/api/storage/file/${fileName}` });
    } catch (err: any) {
      console.error("Blob upload error:", err);
      return res.status(500).json({ error: err.message || "Blob upload failed" });
    }
  }

  const fullPath = path.join(UPLOADS_DIR, fileName);
  await fs.writeFile(fullPath, data, "utf-8");
  res.json({ success: true, url: `/api/storage/file/${fileName}` });
});

app.get("/api/storage/file/:filename", async (req, res) => {
  if (isBlobEnabled) {
    try {
      const pathname = getBlobUploadPathname(req.params.filename);
      const blob = await getBlobByPathname(pathname);
      if (!blob) return res.status(404).send("File not found");
      return res.redirect(blob.url);
    } catch (err) {
      console.error("Blob file read error:", err);
      return res.status(500).send("Read error");
    }
  }

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
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', contentType);
        // Set cache control for better performance
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        return res.send(buffer);
      }
    }
    
    // Fallback to sending as is (text/plain)
    res.send(content);
  } catch (err) {
    console.error("Error serving local file:", err);
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

    if (!nodeId) {
      return res.status(400).json({ error: "Please select a specific Frame or Component in Figma and copy that URL. The URL must contain a 'node-id'." });
    }

    console.log(`Fetching Figma image for file: ${fileKey}, node: ${nodeId}`);

    const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`;

    const response = await fetch(apiUrl, {
      headers: {
        "X-Figma-Token": token,
      },
    });

    if (!response.ok) {
      let errorMsg = "Figma API error";
      try {
        const errorData: any = await response.json();
        errorMsg = errorData.message || errorMsg;
      } catch (e) {
        errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      }
      return res.status(response.status).json({ 
        error: `Figma API Error: ${errorMsg}. Please check if your FIGMA_ACCESS_TOKEN is correct and has access to this file.` 
      });
    }

    const data: any = await response.json();
    const imageUrl = nodeId ? data.images[nodeId] : Object.values(data.images)[0];

    if (!imageUrl) {
      return res.status(404).json({ error: "Could not find image for the specified node." });
    }

    res.json({ imageUrl });
  } catch (error: any) {
    console.error("Figma fetch error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Generic Image Proxy to bypass CORS
app.get("/api/proxy-image", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send("URL is required");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).send("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).send("Only http/https URLs are allowed");
  }
  if (isPrivateOrLocalHostname(parsedUrl.hostname)) {
    return res.status(403).send("Proxy error: private/local network addresses are blocked");
  }
  if (!isAllowedProxyHost(parsedUrl.hostname)) {
    return res.status(403).send("Proxy error: host is not in allowlist");
  }

  try {
    console.log(`[Proxy] Requesting: ${parsedUrl.toString()}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // Increased timeout

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*, */*"
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[Proxy] Fetch failed for ${parsedUrl.toString()}: ${response.status} ${response.statusText}`);
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    
    console.log(`[Proxy] Success: ${parsedUrl.toString()} (${contentType}, ${contentLength} bytes)`);

    // Vercel has a 10MB response limit for serverless functions.
    // If the image is larger than this, the function will crash with FUNCTION_INVOCATION_FAILED.
    if (contentLength && parseInt(contentLength) > 9.5 * 1024 * 1024) {
      console.error(`[Proxy] Image too large: ${contentLength} bytes`);
      return res.status(413).send("Proxy error: Image is too large (> 9.5MB). Vercel limits responses to 10MB. Please use a smaller frame or lower resolution in Figma.");
    }

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    
    // Set cache headers to avoid repeated proxying
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (response.body) {
      // Use streaming for better memory efficiency on Vercel
      // Native fetch returns a Web ReadableStream, so we convert it to a Node Readable stream
      try {
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.on('error', (err) => {
          console.error('[Proxy] Stream error:', err);
          if (!res.headersSent) {
            res.status(500).send("Proxy error: Stream failed");
          }
        });
        nodeStream.pipe(res);
      } catch (streamError: any) {
        console.error('[Proxy] Failed to create stream:', streamError);
        // Fallback to arrayBuffer if streaming fails
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[Proxy] Timeout for URL: ${parsedUrl.toString()}`);
      return res.status(504).send("Proxy error: Request timed out");
    }
    console.error("[Proxy] Error for URL:", parsedUrl.toString(), error);
    if (!res.headersSent) {
      res.status(500).send(`Proxy error: ${error.message || "Internal server error"}`);
    }
  }
});

// Analysis API Proxy
app.post("/api/analyze/ui", async (req, res) => {
  const { prompt, designImg, buildImg, model: requestedModel } = req.body;
  const normalizedRequestedModel = typeof requestedModel === "string"
    ? requestedModel.trim().toLowerCase()
    : "";

  const parseJsonArrayFromModelText = (rawText: string): any[] => {
    const text = String(rawText || "").trim();
    if (!text) return [];

    const normalizeParsed = (parsed: any): any[] => {
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.items)) return parsed.items;
        if (Array.isArray(parsed.data)) return parsed.data;
        if (Array.isArray(parsed.differences)) return parsed.differences;
        if (typeof parsed.title === "string" || typeof parsed.description === "string") {
          return [parsed];
        }
      }
      return [];
    };

    try {
      return normalizeParsed(JSON.parse(text));
    } catch {}

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
      const block = codeBlockMatch[1].trim();
      try {
        return normalizeParsed(JSON.parse(block));
      } catch {}
    }

    const firstArrayStart = text.indexOf("[");
    const lastArrayEnd = text.lastIndexOf("]");
    if (firstArrayStart !== -1 && lastArrayEnd > firstArrayStart) {
      const arraySlice = text.slice(firstArrayStart, lastArrayEnd + 1).trim();
      try {
        return normalizeParsed(JSON.parse(arraySlice));
      } catch {}
    }

    const firstObjStart = text.indexOf("{");
    const lastObjEnd = text.lastIndexOf("}");
    if (firstObjStart !== -1 && lastObjEnd > firstObjStart) {
      let objectSlice = text.slice(firstObjStart, lastObjEnd + 1).trim();
      objectSlice = objectSlice
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/([{,]\s*)'(\w+)'(\s*:)/g, '$1"$2"$3')
        .replace(/,\s*([}\]])/g, "$1");
      try {
        return normalizeParsed(JSON.parse(objectSlice));
      } catch {}
    }

    throw new Error("Gemini response was not valid JSON.");
  };
  
  const modelMapping: Record<string, string> = {
    'gemini': process.env.GEMINI_MODEL_ID || process.env.APIYI_GEMINI_MODEL_ID || 'gemini-3.1-flash-lite-preview',
    'kimi': 'kimi-k2.5',
    'doubao': 'doubao-seed-1-8-251228'
  };
  
  const modelId = (normalizedRequestedModel && modelMapping[normalizedRequestedModel]) ||
                  (typeof requestedModel === "string" ? requestedModel.trim() : "") ||
                  (process.env.APIYI_MODEL_ID || "kimi-k2.5").trim();
                  
  try {
    if (!designImg?.mimeType || !designImg?.data || !buildImg?.mimeType || !buildImg?.data) {
      return res.status(400).json({ error: "designImg/buildImg is required" });
    }
    
    const userPrompt = prompt || "Analyze the Implementation against the Design and list all UI/UX bugs.";

    const shouldUseGeminiDirect = normalizedRequestedModel === "gemini" || modelId.toLowerCase().includes("gemini");
    console.log(`[Analyze] requestedModel="${requestedModel}" normalized="${normalizedRequestedModel}" modelId="${modelId}" branch="${shouldUseGeminiDirect ? "gemini-direct" : "apiyi"}"`);

    if (shouldUseGeminiDirect) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY is not set." });
      }

      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const buildGeminiRequest = (targetModelId: string) => ({
          model: targetModelId,
          contents: [
            {
              parts: [
                { text: userPrompt },
                { inlineData: designImg },
                { inlineData: buildImg }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192
          }
        });

        let geminiResponse: any;
        let effectiveModelId = modelId;
        try {
          geminiResponse = await ai.models.generateContent(buildGeminiRequest(modelId));
        } catch (firstErr: any) {
          const firstMsg = String(firstErr?.message || "");
          const shouldFallbackModel =
            modelId === "gemini-3.1-flash-lite-preview" &&
            (firstMsg.includes("not found") || firstMsg.includes("not supported"));
          if (!shouldFallbackModel) throw firstErr;
          effectiveModelId = "gemini-2.5-flash";
          geminiResponse = await ai.models.generateContent(buildGeminiRequest(effectiveModelId));
        }

        const raw = String(
          geminiResponse?.text ||
          geminiResponse?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("\n") ||
          ""
        ).trim();
        try {
          const result = parseJsonArrayFromModelText(raw);
          return res.json(result);
        } catch (parseErr: any) {
          console.error("Gemini parse error:", parseErr?.message || parseErr);
          console.error("Gemini parse model:", effectiveModelId);
          console.error("Gemini raw preview:", String(raw).slice(0, 1000));
          return res.json([]);
        }
      } catch (geminiErr: any) {
        const msg = geminiErr?.message || "Gemini request failed";
        if (msg.includes("fetch failed")) {
          return res.status(502).json({ error: "Gemini API connection failed. Please check network access or API key permissions." });
        }
        return res.status(500).json({ error: `Gemini error: ${msg}` });
      }
    }

    const apiKey = process.env.APIYI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "APIYI_API_KEY is not set. Please add it to your Secrets in AI Studio."
      });
    }

    let apiUrl = (process.env.APIYI_API_URL || "https://api.apiyi.com/v1").trim();
    apiUrl = apiUrl.replace(/\/$/, '');

    if (!apiUrl.endsWith('/chat/completions')) {
      if (!apiUrl.endsWith('/v1') && !apiUrl.endsWith('/v3')) {
        apiUrl += '/v1';
      }
      apiUrl += '/chat/completions';
    }

    if (!apiUrl.startsWith('http')) {
      apiUrl = "https://api.apiyi.com/v1/chat/completions";
    }

    console.log(`Calling API at "${apiUrl}" with model "${modelId}"...`);
    
    try {
      new URL(apiUrl);
    } catch (e) {
      throw new Error(`Invalid API URL: "${apiUrl}"`);
    }

    const systemPrompt = `You are a Senior UI/UX Engineer and Pixel-Perfect specialist. 
Analyze the provided images: "Design" (the Figma design) and "Implementation" (the actual build).

Your goal is to identify ALL discrepancies between the two. 
Be highly critical and specific about:
1. **Layout & Spacing**: Precise offsets in pixels, alignment issues, padding/margin inconsistencies.
2. **Typography**: Font size, weight, line-height, and color mismatches.
3. **Colors & Visuals**: Hex code differences, shadow depth, border radius, and icon consistency.
4. **Components**: Missing elements or incorrect states.

OUTPUT FORMAT: You MUST return a VALID JSON ARRAY of objects. Each object represents one discrepancy found:
[
  {
    "title": "Short title of the issue",
    "type": "LAYOUT" | "COLOR" | "TYPOGRAPHY" | "CONTENT" | "STYLE",
    "description": "Detailed explanation of what is wrong and how to fix it (e.g., CSS suggestion).",
    "rect": { "x": 0, "y": 0, "width": 100, "height": 100 } // Approximate location on the Implementation image (0-100 scale)
  }
]

Provide only the JSON. Do not add any conversational text.`;

    const requestBody: any = {
      model: modelId,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${designImg.mimeType};base64,${designImg.data}`,
                detail: "high"
              }
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${buildImg.mimeType};base64,${buildImg.data}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error Response (${response.status}):`, errorText);
      
      let errorMessage = `API error: ${response.status} ${errorText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        const apiMessage = errorJson.error?.message || "";
        
        if (apiMessage.includes("无可用渠道") || apiMessage.includes("no available channels")) {
          errorMessage = `API Error (503): Your API provider has no available channels for the requested model "${modelId}".`;
        } else if (errorJson.error?.code === "InvalidParameter") {
          errorMessage = `API Error (InvalidParameter): The API provider rejected the request parameters.`;
        }
      } catch (e) {}
      
      return res.status(response.status).json({ error: errorMessage });
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
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

async function startServer() {
  // Vite middleware for development - MUST be added before catch-all routes
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === "true" ? false : undefined // Let Vite choose its own HMR port dynamically
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }
  }

  // Configure static serving and catch-all for non-API routes
  // IMPORTANT: This must be AFTER Vite middleware in development
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      // Only serve index.html if it's not an API route (already handled above)
      if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(process.cwd(), "dist/index.html"));
      } else {
        res.status(404).json({ error: "API route not found" });
      }
    });
  }

  // Start the server only in non-Vercel environments
  if (!process.env.VERCEL) {
    try {
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${PORT} is already in use - server may already be running`);
          // Don't exit - let the process continue so hot reload can work
        } else {
          console.error('Server error:', err);
        }
      });

      // Graceful shutdown handlers
      const shutdown = () => {
        console.log('Shutting down gracefully...');
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch (err) {
      console.warn('Server start error:', err);
      // Don't exit - allow the process to continue
    }
  }
}

// Only start server in development (not in Vercel serverless)
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.warn('Server startup issue (may already be running):', err.message);
    // Don't exit - allow process to continue for hot reload
  });
}

export default app;
