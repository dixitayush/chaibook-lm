import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function clientIp(req?: Request) {
  if (req) {
    const xf = req.headers.get("x-forwarded-for");
    if (xf) return xf.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  try {
    const h = await headers();
    const xf = h.get("x-forwarded-for");
    if (xf) return xf.split(",")[0]!.trim();
    return (h.get("x-real-ip") || "local").trim();
  } catch {
    return "local";
  }
}

/** Read a fixed-window counter without incrementing. Fails open if Redis is down. */
export async function peekLimit(bucket: string, limit: number) {
  const redis = await getRedis();
  if (!redis) return { ok: true, remaining: limit, limited: false as const };
  try {
    const raw = await redis.get(`cb:rl:${bucket}`);
    const n = raw ? Number(raw) : 0;
    const remaining = Math.max(0, limit - n);
    return { ok: n < limit, remaining, limited: n >= limit };
  } catch {
    return { ok: true, remaining: limit, limited: false as const };
  }
}

/** Fixed-window counter in Redis. Fails open if Redis is down. */
export async function hitLimit(bucket: string, limit: number, windowSec = 60) {
  const redis = await getRedis();
  if (!redis) return { ok: true, remaining: limit, limited: false as const };
  const key = `cb:rl:${bucket}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    const remaining = Math.max(0, limit - n);
    return { ok: n <= limit, remaining, limited: n > limit };
  } catch {
    return { ok: true, remaining: limit, limited: false as const };
  }
}

export function tooMany() {
  return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
}

export async function limitOrResponse(bucket: string, limit: number, windowSec = 60) {
  const result = await hitLimit(bucket, limit, windowSec);
  return result.ok ? null : tooMany();
}
