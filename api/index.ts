import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import fs from "fs";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000) || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ------------------------------
// SQLite + uploads (local dev)
// ------------------------------
const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, "dev.db");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    thumbnail TEXT,
    updatedAt INTEGER NOT NULL,
    category TEXT NOT NULL,
    isStarred INTEGER NOT NULL DEFAULT 0,
    membersJson TEXT,
    analysisDataJson TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analysis_results (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    designImage TEXT NOT NULL,
    buildImage TEXT NOT NULL,
    differencesJson TEXT,
    url TEXT,
    figmaUrl TEXT,
    opacity REAL,
    scale REAL,
    positionJson TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS review_rounds (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    roundNumber INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    designImage TEXT,
    buildImage TEXT,
    summary TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS review_items (
    id TEXT PRIMARY KEY,
    roundId TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    rectJson TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    screenshot TEXT,
    author TEXT,
    createdAt INTEGER NOT NULL,
    resolvedAt INTEGER,
    FOREIGN KEY (roundId) REFERENCES review_rounds(id)
  );
`);

// Serve local uploads (design/build images)
app.use("/uploads", express.static(uploadsDir, { fallthrough: false }));

const jsonParseOrNull = (s: any) => {
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const jsonStringifyOrNull = (v: any) => {
  if (v === undefined) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
};

// Request logger for debugging Vercel 404s
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

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

// ------------------------------
// Uploads
// ------------------------------
app.post("/api/uploads", async (req, res) => {
  const { base64, mimeType, projectId, kind } = req.body || {};
  if (!base64 || typeof base64 !== "string") {
    return res.status(400).json({ error: "base64 is required" });
  }
  const safeMime = typeof mimeType === "string" && mimeType.includes("/") ? mimeType : "image/jpeg";
  const ext = safeMime.includes("png") ? "png" : safeMime.includes("webp") ? "webp" : "jpg";

  const kindPrefix = kind === "build" ? "build" : "design";
  const id = randomUUID();
  const fileName = `${kindPrefix}_${id}.${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  try {
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(filePath, buffer);
    return res.json({ url: `/uploads/${encodeURIComponent(fileName)}` });
  } catch (e: any) {
    console.error("upload error:", e);
    return res.status(500).json({ error: e?.message || "upload failed" });
  }
});

// ------------------------------
// Projects CRUD
// ------------------------------
app.get("/api/projects", (req, res) => {
  const rows = sqlite
    .prepare(`SELECT * FROM projects ORDER BY updatedAt DESC`)
    .all() as any[];

  const projects = rows.map((r) => ({
    id: r.id,
    name: r.name,
    thumbnail: r.thumbnail,
    updatedAt: r.updatedAt,
    category: r.category,
    isStarred: !!r.isStarred,
    members: jsonParseOrNull(r.membersJson) ?? [],
    analysisData: jsonParseOrNull(r.analysisDataJson) ?? undefined,
    // Keep Firestore-like shape for existing UI
    analysisDataJson: undefined,
  }));

  res.json({ projects });
});

app.post("/api/projects", (req, res) => {
  const { name, thumbnail, updatedAt, category, isStarred, members } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  const ts = typeof updatedAt === "number" ? updatedAt : Date.now();

  sqlite
    .prepare(
      `INSERT INTO projects (id, name, thumbnail, updatedAt, category, isStarred, membersJson, analysisDataJson)
       VALUES (@id, @name, @thumbnail, @updatedAt, @category, @isStarred, @membersJson, @analysisDataJson)`
    )
    .run({
      id,
      name,
      thumbnail: typeof thumbnail === "string" ? thumbnail : null,
      updatedAt: ts,
      category: typeof category === "string" ? category : "All projects",
      isStarred: !!isStarred ? 1 : 0,
      membersJson: jsonStringifyOrNull(members ?? []),
      analysisDataJson: jsonStringifyOrNull(undefined),
    });

  res.json({ id });
});

app.get("/api/projects/:id", (req, res) => {
  const row = sqlite.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "project not found" });

  res.json({
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail,
    updatedAt: row.updatedAt,
    category: row.category,
    isStarred: !!row.isStarred,
    members: jsonParseOrNull(row.membersJson) ?? [],
    analysisData: jsonParseOrNull(row.analysisDataJson) ?? undefined,
  });
});

app.patch("/api/projects/:id", (req, res) => {
  const id = req.params.id;
  const body = req.body || {};

  const patchFields: string[] = [];
  const params: any = { id };

  if (body.name !== undefined) {
    patchFields.push("name = @name");
    params.name = body.name;
  }
  if (body.thumbnail !== undefined) {
    patchFields.push("thumbnail = @thumbnail");
    params.thumbnail = body.thumbnail;
  }
  if (body.category !== undefined) {
    patchFields.push("category = @category");
    params.category = body.category;
  }
  if (body.isStarred !== undefined) {
    patchFields.push("isStarred = @isStarred");
    params.isStarred = body.isStarred ? 1 : 0;
  }
  if (body.members !== undefined) {
    patchFields.push("membersJson = @membersJson");
    params.membersJson = jsonStringifyOrNull(body.members);
  }

  if (body.analysisData !== undefined) {
    patchFields.push("analysisDataJson = @analysisDataJson");
    params.analysisDataJson = jsonStringifyOrNull(body.analysisData);
  }

  if (patchFields.length === 0) return res.json({ ok: true });

  // Any patch should update the modification time for sorting/history in the UI.
  patchFields.push("updatedAt = @updatedAt");
  params.updatedAt = Date.now();

  const sql = `UPDATE projects SET ${patchFields.join(", ")} WHERE id = @id`;
  sqlite.prepare(sql).run(params);
  res.json({ ok: true });
});

// ------------------------------
// Categories CRUD
// ------------------------------
app.get("/api/categories", (req, res) => {
  const rows = sqlite.prepare(`SELECT * FROM categories ORDER BY createdAt ASC`).all() as any[];
  const categories = rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }));
  res.json({ categories });
});

app.post("/api/categories", (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  const ts = Date.now();
  sqlite.prepare(`INSERT INTO categories (id, name, createdAt) VALUES (?, ?, ?)`).run(id, name, ts);
  res.json({ id });
});

app.patch("/api/categories/:id", (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  if (body.name === undefined) return res.json({ ok: true });
  sqlite.prepare(`UPDATE categories SET name = ? WHERE id = ?`).run(body.name, id);
  res.json({ ok: true });
});

app.delete("/api/categories/:id", (req, res) => {
  const id = req.params.id;
  sqlite.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ------------------------------
// Analysis results
// ------------------------------
app.get("/api/analysis-results", (req, res) => {
  const rows = sqlite
    .prepare(`SELECT * FROM analysis_results ORDER BY timestamp DESC`)
    .all() as any[];

  const results = rows.map((r) => ({
    id: r.id,
    name: r.name,
    designImage: r.designImage,
    buildImage: r.buildImage,
    differences: jsonParseOrNull(r.differencesJson) ?? [],
    url: r.url,
    figmaUrl: r.figmaUrl,
    opacity: r.opacity,
    scale: r.scale,
    position: jsonParseOrNull(r.positionJson) ?? { x: 0, y: 0 },
    timestamp: r.timestamp,
  }));

  res.json({ results });
});

app.post("/api/analysis-results", (req, res) => {
  const body = req.body || {};
  const required = ["name", "designImage", "buildImage", "timestamp"];
  for (const k of required) {
    if (body[k] === undefined) return res.status(400).json({ error: `${k} is required` });
  }

  const id = randomUUID();
  const ts = typeof body.timestamp === "number" ? body.timestamp : Date.now();

  sqlite
    .prepare(
      `INSERT INTO analysis_results
       (id, name, designImage, buildImage, differencesJson, url, figmaUrl, opacity, scale, positionJson, timestamp)
       VALUES (@id, @name, @designImage, @buildImage, @differencesJson, @url, @figmaUrl, @opacity, @scale, @positionJson, @timestamp)`
    )
    .run({
      id,
      name: body.name,
      designImage: body.designImage,
      buildImage: body.buildImage,
      differencesJson: jsonStringifyOrNull(body.differences ?? []),
      url: body.url ?? "",
      figmaUrl: body.figmaUrl ?? "",
      opacity: typeof body.opacity === "number" ? body.opacity : null,
      scale: typeof body.scale === "number" ? body.scale : null,
      positionJson: jsonStringifyOrNull(body.position ?? { x: 0, y: 0 }),
      timestamp: ts,
    });

  res.json({ id });
});

app.delete("/api/analysis-results/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM analysis_results WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------
// Review Rounds CRUD
// ------------------------------
app.get("/api/projects/:projectId/review-rounds", (req, res) => {
  const { projectId } = req.params;
  const rows = sqlite
    .prepare(`SELECT * FROM review_rounds WHERE projectId = ? ORDER BY roundNumber ASC`)
    .all(projectId) as any[];

  const rounds = rows.map((r) => {
    const itemCounts = sqlite
      .prepare(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'fixed' THEN 1 ELSE 0 END) as fixed
        FROM review_items WHERE roundId = ?`)
      .get(r.id) as any;

    return {
      id: r.id,
      projectId: r.projectId,
      roundNumber: r.roundNumber,
      status: r.status,
      designImage: r.designImage,
      buildImage: r.buildImage,
      summary: r.summary,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      itemCount: itemCounts?.total || 0,
      pendingCount: itemCounts?.pending || 0,
      fixedCount: itemCounts?.fixed || 0,
    };
  });

  res.json({ rounds });
});

app.post("/api/projects/:projectId/review-rounds", (req, res) => {
  const { projectId } = req.params;
  const { designImage, buildImage, summary } = req.body || {};

  const maxRound = sqlite
    .prepare(`SELECT MAX(roundNumber) as max FROM review_rounds WHERE projectId = ?`)
    .get(projectId) as any;
  const roundNumber = (maxRound?.max || 0) + 1;

  const id = randomUUID();
  const ts = Date.now();

  sqlite
    .prepare(
      `INSERT INTO review_rounds (id, projectId, roundNumber, status, designImage, buildImage, summary, createdAt, updatedAt)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .run(id, projectId, roundNumber, designImage || null, buildImage || null, summary || null, ts, ts);

  res.json({ id, roundNumber });
});

app.get("/api/review-rounds/:roundId", (req, res) => {
  const { roundId } = req.params;
  const row = sqlite.prepare(`SELECT * FROM review_rounds WHERE id = ?`).get(roundId) as any;
  if (!row) return res.status(404).json({ error: "Review round not found" });

  const items = sqlite
    .prepare(`SELECT * FROM review_items WHERE roundId = ? ORDER BY createdAt ASC`)
    .all(roundId) as any[];

  const round = {
    id: row.id,
    projectId: row.projectId,
    roundNumber: row.roundNumber,
    status: row.status,
    designImage: row.designImage,
    buildImage: row.buildImage,
    summary: row.summary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map((i) => ({
      id: i.id,
      roundId: i.roundId,
      type: i.type,
      description: i.description,
      rect: jsonParseOrNull(i.rectJson),
      severity: i.severity,
      status: i.status,
      screenshot: i.screenshot,
      author: i.author,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
    })),
  };

  res.json({ round });
});

app.patch("/api/review-rounds/:roundId", (req, res) => {
  const { roundId } = req.params;
  const { status, designImage, buildImage, summary } = req.body || {};

  const patchFields: string[] = [];
  const params: any = { id: roundId };

  if (status !== undefined) {
    patchFields.push("status = @status");
    params.status = status;
  }
  if (designImage !== undefined) {
    patchFields.push("designImage = @designImage");
    params.designImage = designImage;
  }
  if (buildImage !== undefined) {
    patchFields.push("buildImage = @buildImage");
    params.buildImage = buildImage;
  }
  if (summary !== undefined) {
    patchFields.push("summary = @summary");
    params.summary = summary;
  }

  if (patchFields.length === 0) return res.json({ ok: true });

  patchFields.push("updatedAt = @updatedAt");
  params.updatedAt = Date.now();

  const sql = `UPDATE review_rounds SET ${patchFields.join(", ")} WHERE id = @id`;
  sqlite.prepare(sql).run(params);
  res.json({ ok: true });
});

app.delete("/api/review-rounds/:roundId", (req, res) => {
  const { roundId } = req.params;
  sqlite.prepare(`DELETE FROM review_items WHERE roundId = ?`).run(roundId);
  sqlite.prepare(`DELETE FROM review_rounds WHERE id = ?`).run(roundId);
  res.json({ ok: true });
});

// ------------------------------
// Review Items CRUD
// ------------------------------
app.get("/api/review-rounds/:roundId/items", (req, res) => {
  const { roundId } = req.params;
  const items = sqlite
    .prepare(`SELECT * FROM review_items WHERE roundId = ? ORDER BY createdAt ASC`)
    .all(roundId) as any[];

  res.json({
    items: items.map((i) => ({
      id: i.id,
      roundId: i.roundId,
      type: i.type,
      description: i.description,
      rect: jsonParseOrNull(i.rectJson),
      severity: i.severity,
      status: i.status,
      screenshot: i.screenshot,
      author: i.author,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
    })),
  });
});

app.post("/api/review-rounds/:roundId/items", (req, res) => {
  const { roundId } = req.params;
  const { type, description, rect, severity, screenshot, author } = req.body || {};

  if (!type || !description) {
    return res.status(400).json({ error: "type and description are required" });
  }

  const id = randomUUID();
  const ts = Date.now();

  sqlite
    .prepare(
      `INSERT INTO review_items (id, roundId, type, description, rectJson, severity, status, screenshot, author, createdAt, resolvedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, null)`
    )
    .run(id, roundId, type, description, jsonStringifyOrNull(rect), severity || 'medium', screenshot || null, author || null, ts);

  sqlite.prepare(`UPDATE review_rounds SET updatedAt = ? WHERE id = ?`).run(ts, roundId);

  res.json({ id });
});

app.patch("/api/review-items/:itemId", (req, res) => {
  const { itemId } = req.params;
  const { type, description, rect, severity, status, screenshot, author } = req.body || {};

  const patchFields: string[] = [];
  const params: any = { id: itemId };

  if (type !== undefined) {
    patchFields.push("type = @type");
    params.type = type;
  }
  if (description !== undefined) {
    patchFields.push("description = @description");
    params.description = description;
  }
  if (rect !== undefined) {
    patchFields.push("rectJson = @rectJson");
    params.rectJson = jsonStringifyOrNull(rect);
  }
  if (severity !== undefined) {
    patchFields.push("severity = @severity");
    params.severity = severity;
  }
  if (status !== undefined) {
    patchFields.push("status = @status");
    params.status = status;
    if (status === 'fixed') {
      patchFields.push("resolvedAt = @resolvedAt");
      params.resolvedAt = Date.now();
    }
  }
  if (screenshot !== undefined) {
    patchFields.push("screenshot = @screenshot");
    params.screenshot = screenshot;
  }
  if (author !== undefined) {
    patchFields.push("author = @author");
    params.author = author;
  }

  if (patchFields.length === 0) return res.json({ ok: true });

  const sql = `UPDATE review_items SET ${patchFields.join(", ")} WHERE id = @id`;
  sqlite.prepare(sql).run(params);

  const item = sqlite.prepare(`SELECT roundId FROM review_items WHERE id = ?`).get(itemId) as any;
  if (item?.roundId) {
    sqlite.prepare(`UPDATE review_rounds SET updatedAt = ? WHERE id = ?`).run(Date.now(), item.roundId);
  }

  res.json({ ok: true });
});

app.delete("/api/review-items/:itemId", (req, res) => {
  const { itemId } = req.params;
  const item = sqlite.prepare(`SELECT roundId FROM review_items WHERE id = ?`).get(itemId) as any;
  sqlite.prepare(`DELETE FROM review_items WHERE id = ?`).run(itemId);
  if (item?.roundId) {
    sqlite.prepare(`UPDATE review_rounds SET updatedAt = ? WHERE id = ?`).run(Date.now(), item.roundId);
  }
  res.json({ ok: true });
});

app.post("/api/review-rounds/:roundId/items/batch", (req, res) => {
  const { roundId } = req.params;
  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }

  const ts = Date.now();
  const insertStmt = sqlite.prepare(
    `INSERT INTO review_items (id, roundId, type, description, rectJson, severity, status, screenshot, author, createdAt, resolvedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, null)`
  );

  const ids: string[] = [];
  for (const item of items) {
    const id = randomUUID();
    insertStmt.run(
      id,
      roundId,
      item.type || 'style',
      item.description || '',
      jsonStringifyOrNull(item.rect),
      item.severity || 'medium',
      item.screenshot || null,
      item.author || null,
      ts
    );
    ids.push(id);
  }

  sqlite.prepare(`UPDATE review_rounds SET updatedAt = ? WHERE id = ?`).run(ts, roundId);

  res.json({ ids, count: ids.length });
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
  
  const modelMapping: Record<string, string> = {
    'gemini': 'gemini-2.0-flash',
    'kimi': 'moonshot-v1-8k-vision-preview',
    'doubao': 'doubao-seed-1-8-251228',
    'qwen': 'qwen-vl-max',
    'claude': 'claude-sonnet-4-20250514',
    'gpt': 'gpt-4o'
  };
  
  const modelId = (requestedModel && modelMapping[requestedModel]) || 
                  requestedModel || 
                  (process.env.APIYI_MODEL_ID || "kimi-k2.5").trim();

  // Qwen uses Alibaba Cloud DashScope API; Doubao uses Volcengine API; Kimi uses Moonshot; Gemini uses Google AI; others use APIYI
  let apiKey: string | undefined;
  let apiUrl: string;
  let isGeminiNative = false;

  if (requestedModel === 'gemini') {
    // Use Google AI Studio API for Gemini
    apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "GEMINI_API_KEY is not set." });
    }
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    isGeminiNative = true;
  } else if (requestedModel === 'qwen') {
    apiKey = process.env.DASHSCOPE_API_KEY;
    apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    if (!apiKey) {
      return res.status(400).json({ error: "DASHSCOPE_API_KEY is not set." });
    }
  } else if (requestedModel === 'doubao') {
    // Use Volcengine API for Doubao
    apiKey = "e015ba1e-4dd0-479c-b5fb-045b7efce585";
    apiUrl = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  } else if (requestedModel === 'kimi') {
    // Use Moonshot API for Kimi
    apiKey = "sk-mkvcmsC75xCoA2hiw5ZKPGG5P121l4rAQQcuizLgpn9o5IRL";
    apiUrl = "https://api.moonshot.cn/v1/chat/completions";
  } else {
    apiKey = process.env.APIYI_API_KEY;
    apiUrl = (process.env.APIYI_API_URL || "https://api.apiyi.com/v1").trim();
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
      return res.status(400).json({ error: "APIYI_API_KEY is not set." });
    }
  }

  try {
    console.log(`Calling API at "${apiUrl}" with model "${modelId}"...`);
    
    try {
      new URL(apiUrl);
    } catch (e) {
      throw new Error(`Invalid API URL: "${apiUrl}"`);
    }

    let requestBody: any;
    let headers: any = {
      "Content-Type": "application/json",
    };

    if (isGeminiNative) {
      // Gemini native API format
      requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt || "Please analyze these two images and compare the UI design with the actual implementation."
              },
              {
                inlineData: {
                  mimeType: designImg.mimeType,
                  data: designImg.data
                }
              },
              {
                inlineData: {
                  mimeType: buildImg.mimeType,
                  data: buildImg.data
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.1
        }
      };
    } else if (requestedModel === 'doubao') {
      headers["Authorization"] = `Bearer ${apiKey}`;
      // Volcengine Doubao API format (OpenAI-compatible)
      requestBody = {
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
        max_tokens: 8192,
        temperature: 0.1
      };
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
      // Standard OpenAI-compatible format
      requestBody = {
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
        max_tokens: 8192,
        temperature: 0.1
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

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
    
    // Handle Gemini native API response format
    if (isGeminiNative) {
      const geminiContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!geminiContent) {
        throw new Error(`Gemini API returned an empty response: ${JSON.stringify(data)}`);
      }
      
      let result;
      try {
        let cleanContent = geminiContent;
        if (typeof geminiContent === 'string') {
          const jsonMatch = geminiContent.match(/```json\s*([\s\S]*?)```/) || geminiContent.match(/```\s*([\s\S]*?)```/);
          if (jsonMatch) {
            cleanContent = jsonMatch[1].trim();
          } else {
            const openMatch = geminiContent.match(/```json\s*([\s\S]*)/) || geminiContent.match(/```\s*([\s\S]*)/);
            if (openMatch) {
              cleanContent = openMatch[1].trim();
            }
          }
          if (!cleanContent.startsWith('[') && !cleanContent.startsWith('{')) {
            const arrayStart = cleanContent.indexOf('[');
            const objStart = cleanContent.indexOf('{');
            const start = arrayStart >= 0 && objStart >= 0 ? Math.min(arrayStart, objStart) : Math.max(arrayStart, objStart);
            if (start >= 0) {
              cleanContent = cleanContent.substring(start);
            }
          }
          try {
            result = JSON.parse(cleanContent);
          } catch (parseErr) {
            const lastCompleteObj = cleanContent.lastIndexOf('}');
            if (lastCompleteObj > 0) {
              let repaired = cleanContent.substring(0, lastCompleteObj + 1);
              repaired = repaired.replace(/,\s*$/, '');
              if (repaired.trimStart().startsWith('[') && !repaired.trimEnd().endsWith(']')) {
                repaired = repaired + ']';
              }
              result = JSON.parse(repaired);
              console.log(`[Analysis] Repaired truncated JSON (kept ${result.length || 0} items)`);
            } else {
              throw parseErr;
            }
          }
        } else {
          result = geminiContent;
        }
      } catch (e) {
        throw new Error(`Gemini response is not valid JSON: ${geminiContent.substring(0, 200)}...`);
      }

      if (Array.isArray(result)) {
        result = result.map((item: any) => {
          if (item.rect && Array.isArray(item.rect)) {
            item.rect = {
              x: item.rect[0] || 0,
              y: item.rect[1] || 0,
              width: item.rect[2] || 0,
              height: item.rect[3] || 0
            };
          }
          return item;
        });
      }
      
      return res.json(result);
    }
    
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
    try {
      let cleanContent = content;
      if (typeof content === 'string') {
        // Try to extract JSON from markdown code blocks (with or without closing ```)
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/```\s*([\s\S]*?)```/);
        if (jsonMatch) {
          cleanContent = jsonMatch[1].trim();
        } else {
          // Handle case where closing ``` is missing (truncated response)
          const openMatch = content.match(/```json\s*([\s\S]*)/) || content.match(/```\s*([\s\S]*)/);
          if (openMatch) {
            cleanContent = openMatch[1].trim();
          }
        }
        // If still not starting with [ or {, try to find the JSON array/object directly
        if (!cleanContent.startsWith('[') && !cleanContent.startsWith('{')) {
          const arrayStart = cleanContent.indexOf('[');
          const objStart = cleanContent.indexOf('{');
          const start = arrayStart >= 0 && objStart >= 0 ? Math.min(arrayStart, objStart) : Math.max(arrayStart, objStart);
          if (start >= 0) {
            cleanContent = cleanContent.substring(start);
          }
        }

        // Try to parse; if truncated, attempt to repair the JSON
        try {
          result = JSON.parse(cleanContent);
        } catch (parseErr) {
          // Attempt to repair truncated JSON array: find the last complete object and close the array
          const lastCompleteObj = cleanContent.lastIndexOf('}');
          if (lastCompleteObj > 0) {
            let repaired = cleanContent.substring(0, lastCompleteObj + 1);
            // Remove any trailing comma
            repaired = repaired.replace(/,\s*$/, '');
            // Close the array if it starts with [
            if (repaired.trimStart().startsWith('[') && !repaired.trimEnd().endsWith(']')) {
              repaired = repaired + ']';
            }
            result = JSON.parse(repaired);
            console.log(`[Analysis] Repaired truncated JSON (kept ${result.length || 0} items)`);
          } else {
            throw parseErr;
          }
        }
      } else {
        result = content;
      }
    } catch (e) {
      throw new Error(`${modelId} response is not valid JSON: ${content.substring(0, 200)}...`);
    }

    // Normalize result: ensure rect is always an object {x, y, width, height}
    if (Array.isArray(result)) {
      result = result.map((item: any) => {
        if (item.rect && Array.isArray(item.rect)) {
          // Convert [x, y, width, height] array to object
          item.rect = {
            x: item.rect[0] || 0,
            y: item.rect[1] || 0,
            width: item.rect[2] || 0,
            height: item.rect[3] || 0
          };
        }
        return item;
      });
    }
    
    res.json(result);
  } catch (error: any) {
    console.error("Analysis error:", error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: `请求超时：模型 ${modelId} 未在 120 秒内响应，请稍后重试。` });
    }
    const msg = error.message || "Internal server error";
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return res.status(502).json({ error: `无法连接到 API 服务（${modelId}），可能是服务暂时不可用，请稍后重试。` });
    }
    res.status(500).json({ error: msg });
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
