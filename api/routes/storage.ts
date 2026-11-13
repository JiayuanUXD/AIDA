import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { put, list, del } from "@vercel/blob";
import { UPLOADS_DIR, isCloudStorageEnabled } from "../lib/store.js";
import { UPLOAD_FILENAME_REGEX, IMAGE_MIME_EXT, EXT_MIME, MAX_UPLOAD_BYTES } from "../lib/security.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.post("/upload", asyncHandler(async (req, res) => {
  const { path: filePath, data } = req.body;
  if (!filePath || !data) return res.status(400).json({ error: "Path and data required" });

  const fileName = String(filePath).replace(/[\\/]/g, "_");
  if (!UPLOAD_FILENAME_REGEX.test(fileName)) {
    return res.status(400).json({ error: "Invalid upload filename" });
  }

  const match = typeof data === "string" ? data.match(/^data:([^;]+);base64,(.+)$/) : null;
  if (!match) {
    return res.status(400).json({ error: "Expected a base64 image data URL" });
  }
  const mime = match[1];
  const ext = IMAGE_MIME_EXT[mime];
  if (!ext) {
    return res.status(400).json({ error: `Unsupported image type: ${mime}` });
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: "Image exceeds the 15MB upload limit" });
  }
  const finalName = fileName.replace(/\.[^.]+$/, ext);

  if (isCloudStorageEnabled) {
    try {
      await put(`uploads/${finalName}`, buffer, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: mime
      });
      return res.json({ success: true, url: `/api/storage/file/${finalName}` });
    } catch (err: any) {
      console.error("Vercel Blob upload error:", err);
      return res.status(500).json({ error: err.message || "Vercel Blob upload failed" });
    }
  }

  try {
    await fs.writeFile(path.join(UPLOADS_DIR, finalName), buffer);
  } catch (err: any) {
    console.error("Local upload write error:", err);
    return res.status(500).json({ error: err.message || "Failed to store upload" });
  }
  res.json({ success: true, url: `/api/storage/file/${finalName}` });
}));

const serveFile = asyncHandler(async (req, res) => {
  const fileName = req.params.filename;
  if (!UPLOAD_FILENAME_REGEX.test(fileName)) {
    return res.status(400).send("Invalid filename");
  }

  if (isCloudStorageEnabled) {
    try {
      const { blobs } = await list({ prefix: `uploads/${fileName}` });
      const exactMatch = blobs.find((b) => b.pathname === `uploads/${fileName}`);
      if (exactMatch) {
        return res.redirect(302, exactMatch.url);
      }
    } catch (err: any) {
      console.error("Vercel Blob read error:", err);
      return res.status(503).send("Storage unavailable");
    }
  }

  const fullPath = path.join(UPLOADS_DIR, fileName);
  if (!existsSync(fullPath)) return res.status(404).send("File not found");

  const raw = await fs.readFile(fullPath);
  let mime = EXT_MIME[path.extname(fileName).toLowerCase()];
  let body = raw;

  // Legacy uploads stored the whole data URL as text; decode them on read.
  if (raw.subarray(0, 5).toString("utf-8") === "data:") {
    const match = raw.toString("utf-8").match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !IMAGE_MIME_EXT[match[1]]) {
      return res.status(400).send("Unsupported stored content");
    }
    mime = match[1];
    body = Buffer.from(match[2], "base64");
  }
  if (!mime) return res.status(400).send("Unsupported file type");

  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(body);
});

router.get("/file/:filename", serveFile);

router.delete("/file/:filename", asyncHandler(async (req, res) => {
  const fileName = req.params.filename;
  if (!UPLOAD_FILENAME_REGEX.test(fileName)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  if (isCloudStorageEnabled) {
    try {
      await del(`uploads/${fileName}`);
    } catch (err: any) {
      console.error("Vercel Blob delete error:", err);
      return res.status(500).json({ error: "Failed to delete file" });
    }
    return res.json({ success: true });
  }
  try {
    await fs.unlink(path.join(UPLOADS_DIR, fileName));
  } catch (err: any) {
    if (err.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    throw err;
  }
  res.json({ success: true });
}));

export default router;