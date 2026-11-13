import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface AccessRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface AccessDecision {
  status: number;
  body: { error: string; code?: string };
}

const COOKIE_NAME = "aida_session";

const sessionToken = (password: string) =>
  crypto.createHash("sha256").update(`aida-session:${password}`).digest("hex");

const isLoopback = (ip?: string) =>
  !!ip && (ip.startsWith("127.") || ip === "::1" || ip === "::ffff:127.0.0.1");

const headerValue = (headers: AccessRequest["headers"], name: string) => {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
};

const parseCookies = (header?: string) => {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
};

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export const decideAccess = (req: AccessRequest): AccessDecision | null => {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    return isLoopback(req.ip)
      ? null
      : { status: 403, body: { error: "Remote access is disabled. Set ACCESS_PASSWORD on the server to enable it.", code: "AUTH_REQUIRED" } };
  }
  const token = sessionToken(password);
  const cookie = parseCookies(headerValue(req.headers, "cookie"))[COOKIE_NAME];
  const auth = headerValue(req.headers, "authorization");
  const bearer = auth && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  const provided = cookie || bearer;
  if (provided && safeEqual(provided, token)) return null;
  return { status: 401, body: { error: "Authentication required.", code: "AUTH_REQUIRED" } };
};

export const authGate = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/health" || req.path === "/api/auth/login") return next();
  const decision = decideAccess({ ip: req.ip, headers: req.headers });
  if (decision) return res.status(decision.status).json(decision.body);
  next();
};

export const loginHandler = (req: Request, res: Response) => {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    return res.status(400).json({ error: "ACCESS_PASSWORD is not configured on this server." });
  }
  const provided = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(provided, password)) {
    return res.status(401).json({ error: "Wrong password." });
  }
  const token = sessionToken(password);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });
  res.json({ success: true, token });
};