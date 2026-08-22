import { redirect } from "next/navigation";
import { getSessionUser, notebookAccess } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { Workspace } from "@/components/notebook/workspace";

export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSchema();
  const user = await getSessionUser();
  if (!user) redirect("/?auth=1");
  const access = await notebookAccess(user, id);
  if (!access) redirect("/");
  return <Workspace notebookId={id} />;
}
