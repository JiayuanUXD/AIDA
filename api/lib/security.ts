export const ALLOWED_COLLECTIONS = new Set(["projects", "categories", "analysisResults", "rounds"]);
export const PROJECT_ROUNDS_COLLECTION_REGEX = /^projects_[a-zA-Z0-9_-]+_rounds$/;
export const SAFE_COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export const UPLOAD_FILENAME_REGEX = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/;
export const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
export const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const ALLOWED_PROXY_HOSTS = [
  "figma.com",
  "figma-alpha-api.s3.us-west-2.amazonaws.com",
  "figma-alpha-api.s3.amazonaws.com",
  "s3.amazonaws.com",
  "cloudfront.net",
  "googleusercontent.com",
  "githubusercontent.com",
];

export const isPrivateOrLocalHostname = (hostname: string) => {
  let lower = hostname.toLowerCase();
  if (lower.startsWith("::ffff:")) lower = lower.slice(7);
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "::1") return true;
  if (lower === "0.0.0.0") return true;
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

export const isAllowedProxyHost = (hostname: string) => {
  const lower = hostname.toLowerCase();
  return ALLOWED_PROXY_HOSTS.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
};

export const isAllowedCollection = (collection: string) => {
  if (!SAFE_COLLECTION_NAME_REGEX.test(collection)) return false;
  if (ALLOWED_COLLECTIONS.has(collection)) return true;
  if (PROJECT_ROUNDS_COLLECTION_REGEX.test(collection)) return true;
  return false;
};