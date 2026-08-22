import { and, eq, ilike, notInArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebookOwner } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { notebookShares, users } from "@/lib/db/schema";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response || !gate.user) return gate.response;
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (q.length < 1) return NextResponse.json({ users: [] });
  const taken = await db.select({ email: notebookShares.email }).from(notebookShares).where(eq(notebookShares.notebookId, id));
  const exclude = [gate.user.email, ...taken.map((t) => t.email)];
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(
      and(
        or(ilike(users.email, pattern), ilike(users.name, pattern)),
        notInArray(users.email, exclude),
      ),
    )
    .limit(8);
  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name || u.email.split("@")[0],
    })),
  });
}
