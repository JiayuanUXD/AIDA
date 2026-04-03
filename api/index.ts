import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { put, list, del } from "@vercel/blob";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Blob storage helpers for JSON data
const getCollectionBlobPath = (collection: string) => `data/${collection}.json`;

const readCollection = async (collection: string): Promise<any[]> => {
  try {
    const blobPath = getCollectionBlobPath(collection);
    const { blobs } = await list({ prefix: blobPath });
    
    if (blobs.length === 0) return [];
    
    // Get the latest blob
    const latestBlob = blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    
    const response = await fetch(latestBlob.url);
    if (!response.ok) return [];
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Error reading collection ${collection}:`, err);
    return [];
  }
};

const writeCollection = async (collection: string, data: any[]): Promise<void> => {
  try {
    const blobPath = getCollectionBlobPath(collection);
    
    // Delete old blobs for this collection first
    const { blobs } = await list({ prefix: blobPath });
    for (const blob of blobs) {
      try {
        await del(blob.url);
      } catch (e) {
        console.error(`Failed to delete old blob ${blob.url}:`, e);
      }
    }
    
    // Write new data
    await put(blobPath, JSON.stringify(data, null, 2), {
      access: 'public',
      contentType: 'application/json',
    });
  } catch (err) {
    console.error(`Error writing collection ${collection}:`, err);
    throw err;
  }
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

// Config endpoint to provide environment variables to the frontend
app.get("/api/config", (req, res) => {
  res.json({
    geminiApiKey: process.env.GEMINI_API_KEY || ""
  });
});

// --- DB Endpoints ---
app.get("/api/db/:collection", async (req, res) => {
  try {
    const data = await readCollection(req.params.collection);
    res.json(data);
  } catch (err) {
    console.error("Error in GET /api/db/:collection:", err);
    res.status(500).json({ error: "Failed to read collection" });
  }
});

app.get("/api/db/:collection/:id", async (req, res) => {
  try {
    const data = await readCollection(req.params.collection);
    const doc = data.find((d: any) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error("Error in GET /api/db/:collection/:id:", err);
    res.status(500).json({ error: "Failed to read document" });
  }
});

app.post("/api/db/:collection", async (req, res) => {
  try {
    const data = await readCollection(req.params.collection);
    const newDoc = {
      ...req.body,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.push(newDoc);
    await writeCollection(req.params.collection, data);
    res.json(newDoc);
  } catch (err) {
    console.error("Error in POST /api/db/:collection:", err);
    res.status(500).json({ error: "Failed to create document" });
  }
});

app.put("/api/db/:collection/:id", async (req, res) => {
  try {
    const data = await readCollection(req.params.collection);
    const index = data.findIndex((d: any) => d.id === req.params.id);
    if (index === -1) {
      const newDoc = { ...req.body, id: req.params.id, updatedAt: Date.now() };
      data.push(newDoc);
      await writeCollection(req.params.collection, data);
      return res.json(newDoc);
    }
    data[index] = { ...data[index], ...req.body, updatedAt: Date.now() };
    await writeCollection(req.params.collection, data);
    res.json(data[index]);
  } catch (err) {
    console.error("Error in PUT /api/db/:collection/:id:", err);
    res.status(500).json({ error: "Failed to update document" });
  }
});

app.delete("/api/db/:collection/:id", async (req, res) => {
  try {
    const data = await readCollection(req.params.collection);
    const filtered = data.filter((d: any) => d.id !== req.params.id);
    await writeCollection(req.params.collection, filtered);
    res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /api/db/:collection/:id:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// --- Storage Endpoints using Vercel Blob ---
app.post("/api/storage/upload", async (req, res) => {
  try {
    const { path: filePath, data } = req.body;
    if (!filePath || !data) return res.status(400).json({ error: "Path and data required" });
    
    // Safe filename
    const fileName = filePath.replace(/\//g, '_');
    const blobPath = `uploads/${fileName}`;
    
    // If data is a base64 data URL, convert to buffer
    let content: Buffer | string = data;
    let contentType = 'text/plain';
    
    if (data.startsWith('data:')) {
      const match = data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        contentType = match[1];
        content = Buffer.from(match[2], 'base64');
      }
    }
    
    const blob = await put(blobPath, content, {
      access: 'public',
      contentType,
    });
    
    res.json({ success: true, url: blob.url });
  } catch (err) {
    console.error("Error in POST /api/storage/upload:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.get("/api/storage/file/:filename", async (req, res) => {
  try {
    const fileName = req.params.filename;
    const blobPath = `uploads/${fileName}`;
    
    // Find the blob
    const { blobs } = await list({ prefix: blobPath });
    
    if (blobs.length === 0) {
      return res.status(404).send("File not found");
    }
    
    // Get the latest blob
    const latestBlob = blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    
    // Redirect to blob URL
    res.redirect(latestBlob.url);
  } catch (err) {
    console.error("Error serving file:", err);
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

  try {
    console.log(`[Proxy] Requesting: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // Increased timeout

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*, */*"
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[Proxy] Fetch failed for ${url}: ${response.status} ${response.statusText}`);
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    
    console.log(`[Proxy] Success: ${url} (${contentType}, ${contentLength} bytes)`);

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
      console.error(`[Proxy] Timeout for URL: ${url}`);
      return res.status(504).send("Proxy error: Request timed out");
    }
    console.error("[Proxy] Error for URL:", url, error);
    if (!res.headersSent) {
      res.status(500).send(`Proxy error: ${error.message || "Internal server error"}`);
    }
  }
});

// Analysis API Proxy
app.post("/api/analyze/ui", async (req, res) => {
  const { prompt, designImg, buildImg, model: requestedModel } = req.body;
  const apiKey = process.env.APIYI_API_KEY;
  
  const modelMapping: Record<string, string> = {
    'kimi': 'kimi-k2.5',
    'doubao': 'doubao-seed-1-8-251228'
  };
  
  const modelId = (requestedModel && modelMapping[requestedModel]) || 
                  requestedModel || 
                  (process.env.APIYI_MODEL_ID || "kimi-k2.5").trim();
                  
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

  if (!apiKey) {
    return res.status(400).json({ 
      error: "APIYI_API_KEY is not set. Please add it to your Secrets in AI Studio." 
    });
  }

  try {
    console.log(`Calling API at "${apiUrl}" with model "${modelId}"...`);
    
    try {
      new URL(apiUrl);
    } catch (e) {
      throw new Error(`Invalid API URL: "${apiUrl}"`);
    }

    const requestBody: any = {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Please analyze these two images and compare the UI design with the actual implementation."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${designImg.mimeType};base64,${designImg.data}`
              }
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${buildImg.mimeType};base64,${buildImg.data}`
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

// Configure static serving and catch-all for non-API routes
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

async function startServer() {
  // Vite middleware for development
  // On Vercel, we don't want to start the dev server or listen on a port
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
