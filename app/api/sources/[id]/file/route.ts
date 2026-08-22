import { NextResponse } from "next/server";
import { requireSource } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireSource(id);
  if (gate.response) return gate.response;
  const row = gate.source;
  if (!row?.fileData) return NextResponse.json({ error: "No file" }, { status: 404 });
  const buf = Buffer.from(row.fileData, "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.title.replace(/[^\w.-]+/g, "_")}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
