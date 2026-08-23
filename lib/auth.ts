import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import {
  ABSOLUTE_SESSION_MS,
  ACCESS_COOKIE,
  LEGACY_SESSION_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MS,
  applyAuthCookies,
  clearAuthCookies,
} from "@/lib/auth-cookies";
import { db, ensureSchema } from "@/lib/db";
import { notebookShares, notebooks, sessions, sources, users } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { signAccessToken, verifyAccessToken } from "@/lib/jwt";
import { clientIp, limitOrResponse } from "@/lib/rate-limit";

const scryptAsync = promisify(scrypt);

export type PublicUser = { id: string; email: string; name: string };
export type NotebookRole = "owner" | "collaborator";

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return { id: row.id, email: row.email, name: row.name || row.email.split("@")[0] };
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function newRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function newCsrfToken() {
  return randomBytes(32).toString("base64url");
}

async function writeAuthCookies(tokens: { access: string; refresh: string; csrf: string }) {
  try {
    applyAuthCookies(await cookies(), tokens);
    return true;
  } catch {
    return false;
  }
}

async function wipeAuthCookies() {
  try {
    clearAuthCookies(await cookies());
  } catch {
    /* RSC cannot mutate cookies */
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== buf.length) return false;
  return timingSafeEqual(expected, buf);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordIssue(password: string) {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password needs a letter and a number.";
  }
  return null;
}

async function issueForSession(sessionId: string, user: PublicUser, refreshRaw: string) {
  const access = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    sid: sessionId,
  });
  await writeAuthCookies({ access, refresh: refreshRaw, csrf: newCsrfToken() });
}

async function rotateSession(row: typeof sessions.$inferSelect, user: PublicUser) {
  const now = Date.now();
  if (row.revokedAt || row.expiresAt < now) return null;
  if (now - row.createdAt > ABSOLUTE_SESSION_MS) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, row.id));
    return null;
  }
  const refreshRaw = newRefreshToken();
  const access = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    sid: row.id,
  });
  const written = await writeAuthCookies({ access, refresh: refreshRaw, csrf: newCsrfToken() });
  if (!written) return user;
  await db
    .update(sessions)
    .set({
      prevTokenHash: row.tokenHash,
      tokenHash: hashToken(refreshRaw),
      lastUsedAt: now,
      expiresAt: now + REFRESH_MS,
    })
    .where(eq(sessions.id, row.id));
  return user;
}

async function revokeUserSessions(userId: string) {
  await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, userId));
}

async function lookupRefresh(raw: string) {
  const hash = hashToken(raw);
  const [match] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(or(eq(sessions.tokenHash, hash), eq(sessions.prevTokenHash, hash)));
  if (!match) return null;
  return { ...match, reused: match.session.prevTokenHash === hash && match.session.tokenHash !== hash };
}

export async function createSession(userId: string, req?: Request) {
  await ensureSchema();
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("Cannot create a session for an unknown user.");
  const user = toPublicUser(row);
  const sessionId = createId("ses");
  const refreshRaw = newRefreshToken();
  const now = Date.now();
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    tokenHash: hashToken(refreshRaw),
    prevTokenHash: null,
    expiresAt: now + REFRESH_MS,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
    userAgent: req?.headers.get("user-agent")?.slice(0, 300) || "",
    ip: req ? (await clientIp(req)).slice(0, 80) : "",
  });
  await issueForSession(sessionId, user, refreshRaw);
  return user;
}

export async function destroySession() {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  const access = store.get(ACCESS_COOKIE)?.value;
  if (refresh) {
    const found = await lookupRefresh(refresh);
    if (found) await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.id, found.session.id));
  } else if (access) {
    const claims = await verifyAccessToken(access);
    if (claims) await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.id, claims.sid));
  }
  const legacy = store.get(LEGACY_SESSION_COOKIE)?.value;
  if (legacy) await db.delete(sessions).where(eq(sessions.id, legacy)).catch(() => undefined);
  await wipeAuthCookies();
}

async function migrateLegacySession(token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));
  if (!row || row.session.expiresAt < Date.now() || row.session.revokedAt) {
    if (token) await db.delete(sessions).where(eq(sessions.id, token)).catch(() => undefined);
    return null;
  }
  const user = toPublicUser(row.user);
  const refreshRaw = newRefreshToken();
  const now = Date.now();
  await db
    .update(sessions)
    .set({
      tokenHash: hashToken(refreshRaw),
      prevTokenHash: null,
      lastUsedAt: now,
      expiresAt: now + REFRESH_MS,
    })
    .where(eq(sessions.id, row.session.id));
  await issueForSession(row.session.id, user, refreshRaw);
  return user;
}

export async function refreshSession(): Promise<PublicUser | null> {
  await ensureSchema();
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const found = await lookupRefresh(refresh);
  if (!found) {
    await wipeAuthCookies();
    return null;
  }
  if (found.reused) {
    await revokeUserSessions(found.session.userId);
    await wipeAuthCookies();
    return null;
  }
  const user = await rotateSession(found.session, toPublicUser(found.user));
  if (!user) await wipeAuthCookies();
  return user;
}

export async function getSessionUser(): Promise<PublicUser | null> {
  await ensureSchema();
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    const claims = await verifyAccessToken(access);
    if (claims) {
      const [ses] = await db
        .select({
          revokedAt: sessions.revokedAt,
          expiresAt: sessions.expiresAt,
          userId: sessions.userId,
        })
        .from(sessions)
        .where(eq(sessions.id, claims.sid));
      if (ses && !ses.revokedAt && ses.expiresAt >= Date.now() && ses.userId === claims.sub) {
        return { id: claims.sub, email: claims.email, name: claims.name };
      }
    }
  }

  const refreshed = await refreshSession();
  if (refreshed) return refreshed;

  const legacy = store.get(LEGACY_SESSION_COOKIE)?.value;
  if (legacy) return migrateLegacySession(legacy);
  return null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      notebook: null,
      source: null,
      role: null,
      response: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }),
    };
  }
  const limited = await limitOrResponse(`api:${user.id}`, 180, 60);
  if (limited) {
    return {
      user: null,
      notebook: null,
      source: null,
      role: null,
      response: limited,
    };
  }
  return { user, notebook: null, source: null, role: null, response: null };
}

export async function notebookAccess(user: PublicUser, notebookId: string) {
  const [notebook] = await db.select().from(notebooks).where(eq(notebooks.id, notebookId));
  if (!notebook) return null;
  if (notebook.userId === user.id) return { notebook, role: "owner" as const };
  const [share] = await db
    .select()
    .from(notebookShares)
    .where(and(eq(notebookShares.notebookId, notebookId), eq(notebookShares.email, user.email)));
  if (share) return { notebook, role: "collaborator" as const };
  return null;
}

export async function requireNotebook(notebookId: string) {
  const gate = await requireUser();
  if (gate.response || !gate.user) return gate;
  const access = await notebookAccess(gate.user, notebookId);
  if (!access) {
    return {
      user: gate.user,
      notebook: null,
      source: null,
      role: null,
      response: NextResponse.json({ error: "Notebook not found" }, { status: 404 }),
    };
  }
  return { user: gate.user, notebook: access.notebook, source: null, role: access.role, response: null };
}

export async function requireNotebookOwner(notebookId: string) {
  const gate = await requireNotebook(notebookId);
  if (gate.response || !gate.notebook) return gate;
  if (gate.role !== "owner") {
    return {
      user: gate.user,
      notebook: gate.notebook,
      source: null,
      role: gate.role,
      response: NextResponse.json({ error: "Only the owner can do that." }, { status: 403 }),
    };
  }
  return gate;
}

export async function requireSource(sourceId: string) {
  const gate = await requireUser();
  if (gate.response || !gate.user) return gate;
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) {
    return {
      user: gate.user,
      notebook: null,
      source: null,
      role: null,
      response: NextResponse.json({ error: "Source not found" }, { status: 404 }),
    };
  }
  const owned = await requireNotebook(source.notebookId);
  if (owned.response) {
    return {
      user: gate.user,
      notebook: null,
      source: null,
      role: null,
      response: NextResponse.json({ error: "Source not found" }, { status: 404 }),
    };
  }
  return { user: gate.user, notebook: owned.notebook, source, role: owned.role, response: null };
}

export async function findUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return row ?? null;
}

export async function createPasswordUser(opts: { email: string; password: string; name: string }) {
  const now = Date.now();
  const row = {
    id: createId("usr"),
    email: normalizeEmail(opts.email),
    name: opts.name.trim().slice(0, 80) || opts.email.split("@")[0],
    passwordHash: await hashPassword(opts.password),
    googleId: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return row;
}

export async function upsertGoogleUser(opts: { googleId: string; email: string; name: string }) {
  const email = normalizeEmail(opts.email);
  const now = Date.now();
  const [byGoogle] = await db.select().from(users).where(eq(users.googleId, opts.googleId));
  if (byGoogle) {
    await db
      .update(users)
      .set({ email, name: opts.name.slice(0, 80) || byGoogle.name, updatedAt: now })
      .where(eq(users.id, byGoogle.id));
    return { ...byGoogle, email, name: opts.name.slice(0, 80) || byGoogle.name };
  }
  const [byEmail] = await db.select().from(users).where(eq(users.email, email));
  if (byEmail) {
    await db
      .update(users)
      .set({ googleId: opts.googleId, name: byEmail.name || opts.name.slice(0, 80), updatedAt: now })
      .where(eq(users.id, byEmail.id));
    return { ...byEmail, googleId: opts.googleId };
  }
  const row = {
    id: createId("usr"),
    email,
    name: opts.name.trim().slice(0, 80) || email.split("@")[0],
    passwordHash: null as string | null,
    googleId: opts.googleId,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return row;
}
