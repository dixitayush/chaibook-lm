import type { ArtifactType, Notebook, Source, SourceMeta, SourceStatus, SourceType, StudioArtifact } from "@/lib/types";
import type { artifacts, messages, notebooks, sources } from "@/lib/db/schema";

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function asArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

export function mapNotebook(
  row: typeof notebooks.$inferSelect,
  extra?: {
    sourceCount?: number;
    readyCount?: number;
    role?: "owner" | "collaborator";
    ownerName?: string;
    mcpEnabled?: boolean;
  },
): Notebook {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    emoji: row.emoji,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceCount: extra?.sourceCount,
    readyCount: extra?.readyCount,
    role: extra?.role ?? "owner",
    ownerName: extra?.ownerName,
    mcpEnabled: extra?.mcpEnabled,
  };
}

export function mapSource(
  row: typeof sources.$inferSelect,
  extra?: { authorName?: string },
): Source {
  return {
    id: row.id,
    notebookId: row.notebookId,
    type: row.type as SourceType,
    title: row.title,
    status: row.status as SourceStatus,
    url: row.url,
    content: row.content,
    error: row.error,
    metadata: asObject(row.metadata) as SourceMeta,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authorId: row.userId,
    authorName: extra?.authorName || row.authorName || "",
  };
}

export function mapMessage(
  row: typeof messages.$inferSelect,
  extra?: { authorName?: string },
) {
  return {
    id: row.id,
    notebookId: row.notebookId,
    role: row.role as "user" | "assistant",
    content: row.content,
    citations: asArray(row.citations),
    retrieval: asArray(row.retrieval),
    createdAt: row.createdAt,
    authorId: row.userId,
    authorName:
      extra?.authorName ||
      row.authorName ||
      (row.role === "assistant" ? "ChaiBook" : ""),
  };
}

export function mapArtifact(row: typeof artifacts.$inferSelect): StudioArtifact {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload || "{}") : row.payload;
  return {
    id: row.id,
    notebookId: row.notebookId,
    type: row.type as ArtifactType,
    title: row.title,
    payload,
    createdAt: row.createdAt,
  };
}
