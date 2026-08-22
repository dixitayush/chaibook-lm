import { createClient, type RedisClientType } from "redis";

type Redis = RedisClientType;

const globalForRedis = globalThis as unknown as { redis?: Redis; redisPromise?: Promise<Redis | null> };

export function redisUrl() {
  return (process.env.REDIS_URL || "").trim() || "redis://127.0.0.1:6379";
}

export async function getRedis(): Promise<Redis | null> {
  if (globalForRedis.redis?.isOpen) return globalForRedis.redis;
  if (globalForRedis.redisPromise) return globalForRedis.redisPromise;

  globalForRedis.redisPromise = (async () => {
    const client = createClient({
      url: redisUrl(),
      socket: {
        connectTimeout: 1500,
        reconnectStrategy: (retries) => Math.min(500 * retries, 4000),
      },
    });
    client.on("error", () => {
      /* fail open: STM and rate limits degrade without taking the app down */
    });
    try {
      await client.connect();
      globalForRedis.redis = client as Redis;
      return client as Redis;
    } catch {
      globalForRedis.redisPromise = undefined;
      return null;
    }
  })();

  return globalForRedis.redisPromise;
}

export async function redisReady() {
  const client = await getRedis();
  if (!client) return false;
  try {
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}
