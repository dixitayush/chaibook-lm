import { bigint, index, integer, jsonb, pgTable, text, uniqueIndex, vector } from "drizzle-orm/pg-core";

export const VECTOR_DIMS = 1536;

const epochMs = (name: string) => bigint(name, { mode: "number" }).notNull();

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash"),
    googleId: text("google_id"),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_google_idx").on(t.googleId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: epochMs("expires_at"),
    createdAt: epochMs("created_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const notebooks = pgTable(
  "notebooks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    emoji: text("emoji").notNull().default("🍵"),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [index("notebooks_user_idx").on(t.userId)],
);

export const notebookShares = pgTable(
  "notebook_shares",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("collaborator"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: epochMs("created_at"),
  },
  (t) => [
    uniqueIndex("notebook_shares_nb_email_idx").on(t.notebookId, t.email),
    index("notebook_shares_email_idx").on(t.email),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("uploading"),
    url: text("url"),
    content: text("content"),
    fileData: text("file_data"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    chunkCount: integer("chunk_count").notNull().default(0),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default(""),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [index("sources_notebook_idx").on(t.notebookId)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: VECTOR_DIMS }).notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    page: integer("page"),
    startTime: integer("start_time"),
    endTime: integer("end_time"),
    heading: text("heading"),
    url: text("url"),
    tokenCount: integer("token_count").notNull().default(0),
  },
  (t) => [
    index("chunks_notebook_idx").on(t.notebookId),
    index("chunks_source_idx").on(t.sourceId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<unknown>().notNull().default([]),
    retrieval: jsonb("retrieval").$type<unknown>().notNull().default([]),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default(""),
    createdAt: epochMs("created_at"),
  },
  (t) => [index("messages_notebook_idx").on(t.notebookId)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt: epochMs("created_at"),
  },
  (t) => [index("artifacts_notebook_idx").on(t.notebookId)],
);

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: VECTOR_DIMS }),
    pinned: integer("pinned").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: epochMs("created_at"),
  },
  (t) => [index("memories_notebook_idx").on(t.notebookId)],
);

export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    mentions: integer("mentions").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [index("graph_nodes_notebook_idx").on(t.notebookId)],
);

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    fromId: text("from_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    confidence: integer("confidence").notNull().default(70),
    createdAt: epochMs("created_at"),
  },
  (t) => [index("graph_edges_notebook_idx").on(t.notebookId)],
);

export const episodes = pgTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    summary: text("summary").notNull().default(""),
    embedding: vector("embedding", { dimensions: VECTOR_DIMS }),
    createdAt: epochMs("created_at"),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [index("episodes_notebook_idx").on(t.notebookId)],
);

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("custom"),
    transport: text("transport").notNull().default("stdio"),
    command: text("command"),
    args: jsonb("args").$type<string[]>().notNull().default([]),
    url: text("url"),
    env: jsonb("env").$type<Record<string, string>>().notNull().default({}),
    extra: jsonb("extra").$type<Record<string, string>>().notNull().default({}),
    enabled: integer("enabled").notNull().default(1),
    status: text("status").notNull().default("idle"),
    tools: jsonb("tools").$type<{ name: string; description: string }[]>().notNull().default([]),
    error: text("error"),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [index("mcp_servers_notebook_idx").on(t.notebookId)],
);

/** Per-user Google workspace tokens (Gmail / Calendar / Drive as sources). */
export const gmailAccounts = pgTable(
  "gmail_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiry: epochMs("expiry"),
    createdAt: epochMs("created_at"),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [uniqueIndex("gmail_accounts_user_idx").on(t.userId)],
);
