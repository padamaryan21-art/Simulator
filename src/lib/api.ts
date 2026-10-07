import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getUserOrNull } from "./auth";
import { captureError } from "./monitoring";
import { RateLimiter, isCrossSiteMutation } from "./security";
import { TelegramServiceError } from "@/server/telegram/errors";

type Ctx<P> = { params: Promise<P> };

type HandlerArgs<P> = {
  req: Request;
  params: P;
  userId: string;
  /** Parse + validate the JSON body (throws a 400 on failure). */
  body: <T>(schema: ZodType<T>) => Promise<T>;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RouteOptions = {
  /** Per-user limit for costly or abuse-prone endpoints (AI generation, Telegram login codes). */
  rateLimit?: { limit: number; windowSec: number };
};

const limiter = new RateLimiter();

/**
 * Auth + error-normalising wrapper for Route Handlers. All admin APIs must use this.
 * Order: authenticate, reject cross-site mutations, rate limit, validate/handle.
 */
export function route<P = Record<string, never>>(
  handler: (a: HandlerArgs<P>) => Promise<unknown>,
  options: RouteOptions = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    let user;
    try {
      user = await getUserOrNull();
    } catch (err) {
      console.error("[route] auth error:", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isCrossSiteMutation(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    if (options.rateLimit) {
      const key = `${user.id}:${req.method}:${new URL(req.url).pathname.replace(/[0-9a-f-]{36}/g, ":id")}`;
      const res = limiter.check(key, options.rateLimit.limit, options.rateLimit.windowSec);
      if (!res.ok) {
        return NextResponse.json(
          {
            error: `Too many requests. Try again in ${res.retryAfterSec}s.`,
            retryAfterSeconds: res.retryAfterSec,
          },
          { status: 429, headers: { "Retry-After": String(res.retryAfterSec) } },
        );
      }
    }
    try {
      const result = await handler({
        req,
        params: await ctx.params,
        userId: user.id,
        body: async (schema) => {
          let json: unknown;
          try {
            json = await req.json();
          } catch {
            throw new HttpError(400, "Invalid JSON body");
          }
          return schema.parse(json);
        },
      });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: err.issues[0]?.message ?? "Invalid input", issues: err.issues },
          { status: 400 },
        );
      }
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof TelegramServiceError) {
        const status = err.code === "FLOOD_WAIT" ? 429 : 400;
        return NextResponse.json(
          { error: err.message, code: err.code, retryAfterSeconds: err.retryAfterSeconds },
          { status },
        );
      }
      console.error("[route] unhandled error:", err);
      await captureError(err, "api", { path: new URL(req.url).pathname });
      const debug = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return NextResponse.json({ error: "Internal server error", debug }, { status: 500 });
    }
  };
}

export const notFound = () => new HttpError(404, "Not found");
