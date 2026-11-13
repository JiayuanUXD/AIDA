export const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const normalizeBaseUrl = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return raw.replace(/\/+$/, "");
};

export const truncateMessage = (value: string, max = 200) =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * 上游（Ark / OpenAI 兼容）用 JSON 信封返回错误：
 *   {"error":{"message":"Insufficient Balance","type":"...","code":"..."}}
 * 直接把原文塞给用户会是一整段 JSON。这里取出可读的原因，
 * 非 JSON 或取不到 message 时退回原始文本。
 * 只取 message —— 里面的 request_id 对提工单有用，而 type/code 是上游内部枚举。
 */
export const upstreamErrorDetail = (body: string): string => {
  const raw = body.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const envelope = parsed?.error;
    if (typeof envelope === "string") return truncateMessage(envelope);
    if (envelope && typeof envelope === "object") {
      const message = text(envelope.message);
      if (message) return truncateMessage(message);
    }
    if (typeof parsed?.message === "string") return truncateMessage(parsed.message);
  } catch {
    // 不是 JSON，按纯文本处理
  }
  return truncateMessage(raw);
};
