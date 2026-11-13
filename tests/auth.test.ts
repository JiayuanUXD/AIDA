import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

let app: any;
let tmp: string;
const PASSWORD = "test-password-123";

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aida-auth-test-"));
  process.env.DATA_DIR_NAME = tmp;
  process.env.ACCESS_PASSWORD = PASSWORD;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  app = (await import("../api/app.js")).default;
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ACCESS_PASSWORD;
});

describe("session auth", () => {
  it("requires a session for db reads when password configured", async () => {
    const res = await request(app).get("/api/db/projects");
    expect(res.status).toBe(401);
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("issues a session cookie on correct password and accepts it", async () => {
    const login = await request(app).post("/api/auth/login").send({ password: PASSWORD });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(cookie).toBeTruthy();
    const res = await request(app).get("/api/db/projects").set("Cookie", cookie!);
    expect(res.status).toBe(200);
  });

  it("rate limits repeated login attempts", async () => {
    let last: any;
    for (let i = 0; i < 12; i++) {
      last = await request(app).post("/api/auth/login").send({ password: "wrong" });
    }
    expect(last.status).toBe(429);
  });
});

describe("access decision for remote clients", () => {
  it("denies remote access when no password is configured", async () => {
    const { decideAccess } = await import("../api/lib/auth.js");
    const prev = process.env.ACCESS_PASSWORD;
    delete process.env.ACCESS_PASSWORD;
    const decision = decideAccess({ ip: "203.0.113.5", headers: {} });
    process.env.ACCESS_PASSWORD = prev;
    expect(decision?.status).toBe(403);
  });

  it("allows loopback when no password is configured", async () => {
    const { decideAccess } = await import("../api/lib/auth.js");
    const prev = process.env.ACCESS_PASSWORD;
    delete process.env.ACCESS_PASSWORD;
    const decision = decideAccess({ ip: "127.0.0.1", headers: {} });
    process.env.ACCESS_PASSWORD = prev;
    expect(decision).toBeNull();
  });
});