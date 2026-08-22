export const SOURCE_TYPES = ["pdf", "text", "website", "youtube", "transcript", "email", "calendar", "drive", "mcp"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = [
  "uploading",
  "extracting",
  "indexing",
  "ready",
  "error",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export type ChunkMeta = {
  page?: number;
  startTime?: number;
  endTime?: number;
  heading?: string;
  url?: string;
  videoId?: string;
  playlistId?: string;
};

export type SourceMeta = ChunkMeta & {
  pages?: number;
  wordCount?: number;
  progress?: number;
  filename?: string;
  mimeType?: string;
  channel?: string;
  duration?: number;
  videoCount?: number;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  gmailId?: string;
  calendarId?: string;
  calendarName?: string;
  eventCount?: number;
  driveFileId?: string;
};

export type Citation = {
  n: number;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
  excerpt: string;
  score: number;
  page?: number;
  startTime?: number;
  endTime?: number;
  heading?: string;
  url?: string;
  videoId?: string;
};

export type RetrievalHit = Citation & {
  vectorScore: number;
  bm25Score: number;
  rrfScore: number;
};

export type ChatMessage = {
  id: string;
  notebookId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  retrieval?: RetrievalHit[];
  createdAt: number;
  quality?: { score: number; stored: boolean; attempts: number };
  authorName?: string;
  authorId?: string | null;
};

export type Notebook = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
  sourceCount?: number;
  readyCount?: number;
  role?: "owner" | "collaborator";
  ownerName?: string;
  mcpEnabled?: boolean;
};

export type Source = {
  id: string;
  notebookId: string;
  type: SourceType;
  title: string;
  status: SourceStatus;
  url: string | null;
  content: string | null;
  error: string | null;
  metadata: SourceMeta;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
  authorName?: string;
  authorId?: string | null;
};

export type ArtifactType = "podcast" | "roadmap" | "guide" | "faq" | "cards";

export type MemoryItem = {
  id: string;
  kind: string;
  content: string;
  pinned: boolean;
  createdAt: number;
};

export type GraphSnapshot = {
  nodes: { id: string; type: string; name: string; summary: string; mentions: number }[];
  edges: { id: string; type: string; fromId: string; toId: string; fromName?: string; toName?: string }[];
};

export type EpisodeItem = {
  id: string;
  question: string;
  answer: string;
  summary: string;
  createdAt: number;
};

export type PodcastSegment = {
  speaker: "male" | "female";
  name: string;
  text: string;
  audioBase64?: string;
  mimeType?: string;
};

export type RoadmapNode = {
  id: string;
  title: string;
  summary: string;
  level: "foundation" | "core" | "advanced";
  videoId?: string;
  sourceId?: string;
  sourceTitle?: string;
  startTime?: number;
  endTime?: number;
  why: string;
};

export type StudioArtifact = {
  id: string;
  notebookId: string;
  type: ArtifactType;
  title: string;
  payload: unknown;
  createdAt: number;
};
