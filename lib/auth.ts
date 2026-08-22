import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { notebookShares, notebooks, sessions, sources, users } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { limitOrResponse } from "@/lib/rate-limit";

const scryptAsync = promisify(scrypt);
const COOKIE = "chaibook_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type PublicUser = { id: string; email: string; name: string };
export type NotebookRole = "owner" | "collaborator";

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return { id: row.id, email: row.email, name: row.name || row.email.split("@")[0] };
}

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: (process.env.APP_URL || "").startsWith("https://"),
  };
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

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const now = Date.now();
  await db.insert(sessions).values({ id, userId, expiresAt: now + SESSION_MS, createdAt: now });
  const store = await cookies();
  store.set(COOKIE, id, { ...cookieBase(), maxAge: Math.floor(SESSION_MS / 1000) });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, token));
  store.set(COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export async function getSessionUser(): Promise<PublicUser | null> {
  await ensureSchema();
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));
  if (!row || row.expiresAt < Date.now()) {
    if (token) await db.delete(sessions).where(eq(sessions.id, token)).catch(() => undefined);
    return null;
  }
  return toPublicUser(row.user);
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null as const,
      notebook: null as const,
      source: null as const,
      role: null as const,
      response: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }),
    };
  }
  const limited = await limitOrResponse(`api:${user.id}`, 180, 60);
  if (limited) {
    return {
      user: null as const,
      notebook: null as const,
      source: null as const,
      role: null as const,
      response: limited,
    };
  }
  return { user, notebook: null as const, source: null as const, role: null as const, response: null };
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
      notebook: null as const,
      source: null as const,
      role: null as const,
      response: NextResponse.json({ error: "Notebook not found" }, { status: 404 }),
    };
  }
  return { user: gate.user, notebook: access.notebook, source: null as const, role: access.role, response: null };
}

export async function requireNotebookOwner(notebookId: string) {
  const gate = await requireNotebook(notebookId);
  if (gate.response || !gate.notebook) return gate;
  if (gate.role !== "owner") {
    return {
      user: gate.user,
      notebook: gate.notebook,
      source: null as const,
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
      notebook: null as const,
      source: null as const,
      role: null as const,
      response: NextResponse.json({ error: "Source not found" }, { status: 404 }),
    };
  }
  const owned = await requireNotebook(source.notebookId);
  if (owned.response) {
    return {
      user: gate.user,
      notebook: null as const,
      source: null as const,
      role: null as const,
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
