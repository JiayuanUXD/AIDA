import { Router } from "express";
import dns from "node:dns";
import { isAllowedProxyHost, isPrivateOrLocalHostname } from "../lib/security.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

// Figma API Proxy
router.post("/figma/fetch", async (req, res) => {
  const { url } = req.body;
  const token = process.env.FIGMA_ACCESS_TOKEN;

  if (!token || token.trim() === "") {
    return res.status(400).json({
      error: "FIGMA_ACCESS_TOKEN is not set. Add 'FIGMA_ACCESS_TOKEN' to the server environment and paste your Figma Personal Access Token."
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
    const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":") : null;

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

const validateProxyTarget = async (target: URL): Promise<string | null> => {
  if (isPrivateOrLocalHostname(target.hostname)) return "Private or local addresses are not allowed";
  if (!isAllowedProxyHost(target.hostname)) return "Domain not allowed for proxying";
  if (target.protocol !== "https:") return "Only https targets are allowed";
  const addresses = await dns.promises.lookup(target.hostname, { all: true });
  if (addresses.some((a) => isPrivateOrLocalHostname(a.address))) return "Domain resolves to a private address";
  return null;
};

// Proxy image endpoint to bypass CORS
router.get("/proxy-image", asyncHandler(async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") return res.status(400).send("URL required");

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).send("Invalid URL");
  }

  const invalid = await validateProxyTarget(target);
  if (invalid) return res.status(403).send(invalid);

  let response: Response | undefined;
  for (let hop = 0; hop < 4; hop++) {
    response = await fetch(target, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return res.status(502).send("Redirect without location");
      target = new URL(location, target);
      const redirectInvalid = await validateProxyTarget(target);
      if (redirectInvalid) return res.status(403).send(redirectInvalid);
      continue;
    }
    break;
  }
  if (!response) return res.status(502).send("Too many redirects");
  if (!response.ok) return res.status(response.status).send(response.statusText);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return res.status(415).send("Only image responses are proxied");
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");

  const arrayBuffer = await response.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
}));

export default router;