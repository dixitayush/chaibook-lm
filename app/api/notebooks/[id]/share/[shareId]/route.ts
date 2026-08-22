import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { notebookShares } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; shareId: string }> },
) {
  await ensureSchema();
  const { id, shareId } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.user) return gate.response;
  const [share] = await db
    .select()
    .from(notebookShares)
    .where(and(eq(notebookShares.id, shareId), eq(notebookShares.notebookId, id)));
  if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  const canRevoke = gate.role === "owner" || share.email === gate.user.email;
  if (!canRevoke) return NextResponse.json({ error: "Only the owner can do that." }, { status: 403 });
  await db.delete(notebookShares).where(eq(notebookShares.id, shareId));
  return NextResponse.json({ ok: true });
}
