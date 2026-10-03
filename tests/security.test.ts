import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RateLimiter, isCrossSiteMutation } from "@/lib/security";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const req = (method: string, h: Record<string, string> = {}) => ({ method, headers: headers(h) });

describe("isCrossSiteMutation", () => {
  it("never blocks reads", () => {
    expect(
      isCrossSiteMutation(req("GET", { origin: "https://evil.example", host: "app.local" })),
    ).toBe(false);
  });
  it("allows same-origin writes", () => {
    expect(
      isCrossSiteMutation(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" })),
    ).toBe(false);
    expect(isCrossSiteMutation(req("DELETE", { "sec-fetch-site": "same-origin", host: "x" }))).toBe(
      false,
    );
  });
  it("blocks writes whose Origin is another site", () => {
    expect(
      isCrossSiteMutation(req("POST", { origin: "https://evil.example", host: "localhost:3000" })),
    ).toBe(true);
    expect(isCrossSiteMutation(req("PATCH", { origin: "null", host: "localhost:3000" }))).toBe(
      true,
    );
  });
  it("blocks writes the browser labels cross-site even without Origin", () => {
    expect(isCrossSiteMutation(req("POST", { "sec-fetch-site": "cross-site", host: "x" }))).toBe(
      true,
    );
    expect(isCrossSiteMutation(req("POST", { "sec-fetch-site": "same-site", host: "x" }))).toBe(
      true,
    );
  });
  it("trusts the forwarded host behind a proxy", () => {
    expect(
      isCrossSiteMutation(
        req("POST", {
          origin: "https://my.app",
          "x-forwarded-host": "my.app",
          host: "internal:3000",
        }),
      ),
    ).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit, then reports when to retry", () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rl.check("u", 3, 60, t0 + i).ok).toBe(true);
    const blocked = rl.check("u", 3, 60, t0 + 10);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(55);
  });
  it("frees slots as the window slides and keeps keys independent", () => {
    const rl = new RateLimiter();
    rl.check("a", 1, 10, 0);
    expect(rl.check("a", 1, 10, 5_000).ok).toBe(false);
    expect(rl.check("b", 1, 10, 5_000).ok).toBe(true);
    expect(rl.check("a", 1, 10, 10_001).ok).toBe(true);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("static security checks", () => {
  it("every API handler goes through the authenticating route() wrapper", () => {
    const files = walk("src/app/api").filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBeGreaterThan(30);
    const bad = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return (
        /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/.test(src) && !/=\s*route[<(]/.test(src)
      );
    });
    expect(bad).toEqual([]);
  });

  it("every state-changing handler validates its input (checked per handler, not per file)", () => {
    const files = walk("src/app/api").filter((f) => f.endsWith("route.ts"));
    const unvalidated: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Split the file into one chunk per exported HTTP handler.
      const starts = [...src.matchAll(/export\s+const\s+(GET|POST|PATCH|PUT|DELETE)/g)];
      starts.forEach((m, i) => {
        const method = m[1];
        if (method === "GET") return;
        const chunk = src.slice(m.index!, starts[i + 1]?.index ?? src.length);
        // `route(async () => ...)` reads no input at all, so there is none to validate.
        const readsNoInput = /=\s*route(?:<[^>]*>)?\(\s*async\s*\(\s*\)\s*=>/.test(chunk);
        const validates = /(body\(|\.parse\(|safeParse\()/.test(chunk);
        if (!readsNoInput && !validates) unvalidated.push(`${f} ${method}`);
      });
    }
    expect(unvalidated).toEqual([]);
  });

  it("client components never read secret env vars or import server modules as values", () => {
    const clients = walk("src")
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 200)));
    expect(clients.length).toBeGreaterThan(20);
    const leaks = clients.filter((f) =>
      /process\.env\.(?!NEXT_PUBLIC_)/.test(readFileSync(f, "utf8")),
    );
    const serverValueImports = clients.filter((f) =>
      /from\s+["']@\/server\//.test(readFileSync(f, "utf8").replace(/import type[^;]+;/g, "")),
    );
    expect(leaks).toEqual([]);
    expect(serverValueImports).toEqual([]);
  });

  it("the pure scheduling helpers stay free of server-only imports", () => {
    for (const f of walk("src/lib/scheduling")) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from\s+["'](@\/db|@\/server|drizzle-orm|postgres|ioredis|bullmq)/);
    }
  });

  it("logger redacts credentials and session material", () => {
    const src = readFileSync("src/lib/logger.ts", "utf8");
    for (const key of [
      "password",
      "encryptedSession",
      "sessionString",
      "apiKey",
      "authorization",
    ]) {
      expect(src).toContain(`"${key}"`);
    }
  });
});
