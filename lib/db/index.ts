import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { hydrateEnv } from "@/lib/env";

hydrateEnv();

function resolveUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.startsWith("file:") || url.startsWith("libsql:")) {
    throw new Error(
      "Postgres is required. Set DATABASE_URL to a postgres:// connection (see docker-compose.yml).",
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>;
  drizzle?: ReturnType<typeof drizzle>;
  schemaReady?: Promise<void>;
  schemaVersion?: number;
};

function getSql() {
  if (!globalForDb.pg) {
    globalForDb.pg = postgres(resolveUrl(), { max: 8, idle_timeout: 20 });
  }
  return globalForDb.pg;
}

function getDb() {
  if (!globalForDb.drizzle) {
    globalForDb.drizzle = drizzle(getSql(), { schema });
  }
  return globalForDb.drizzle;
}

// Lazy: `next build` imports this module to collect page data and must not
// require DATABASE_URL (the image has no Postgres during the build).
export const sql: ReturnType<typeof postgres> = new Proxy(function sqlLazy() {} as unknown as ReturnType<typeof postgres>, {
  apply(_target, _thisArg, argArray) {
    const client = getSql();
    return Reflect.apply(client as unknown as (...args: unknown[]) => unknown, client, argArray);
  },
  get(_target, prop) {
    const client = getSql();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as ReturnType<typeof postgres>;

export const db: ReturnType<typeof drizzle> = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  google_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_idx ON users(google_id);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT,
  prev_token_hash TEXT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🍵',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  url TEXT,
  content TEXT,
  file_data TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sources_notebook_idx ON sources(notebook_id);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  notebook_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  chunk_index INTEGER NOT NULL,
  page INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  heading TEXT,
  url TEXT,
  token_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chunks_notebook_idx ON chunks(notebook_id);
CREATE INDEX IF NOT EXISTS chunks_source_idx ON chunks(source_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  retrieval JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_notebook_idx ON messages(notebook_id);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_notebook_idx ON artifacts(notebook_id);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  pinned INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_notebook_idx ON memories(notebook_id);
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  mentions INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_nodes_notebook_idx ON graph_nodes(notebook_id);
CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 70,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_edges_notebook_idx ON graph_edges(notebook_id);
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  embedding vector(1536),
  created_at BIGINT NOT NULL,
  source_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS episodes_notebook_idx ON episodes(notebook_id);
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
`;

const TIMESTAMP_BIGINT = `
ALTER TABLE notebooks ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE notebooks ALTER COLUMN updated_at TYPE BIGINT;
ALTER TABLE sources ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE sources ALTER COLUMN updated_at TYPE BIGINT;
ALTER TABLE messages ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE artifacts ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE memories ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE graph_nodes ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE graph_nodes ALTER COLUMN updated_at TYPE BIGINT;
ALTER TABLE graph_edges ALTER COLUMN created_at TYPE BIGINT;
ALTER TABLE episodes ALTER COLUMN created_at TYPE BIGINT;
`;

const SCHEMA_VERSION = 11;

export function ensureSchema() {
  if (globalForDb.schemaVersion !== SCHEMA_VERSION) {
    globalForDb.schemaReady = undefined;
    globalForDb.schemaVersion = SCHEMA_VERSION;
  }
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = (async () => {
      try {
        await sql.unsafe(DDL);
        await sql.unsafe(TIMESTAMP_BIGINT);
        try {
          await sql.unsafe(
            `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS source_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`,
          );
        } catch {
          /* already present */
        }
        const authCols = [
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;`,
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS prev_token_hash TEXT;`,
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at BIGINT;`,
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at BIGINT;`,
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';`,
          `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT '';`,
          `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);`,
          `CREATE INDEX IF NOT EXISTS sessions_prev_hash_idx ON sessions(prev_token_hash);`,
          `ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS user_id TEXT;`,
          `CREATE INDEX IF NOT EXISTS notebooks_user_idx ON notebooks(user_id);`,
          `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS user_id TEXT;`,
          `DELETE FROM gmail_accounts WHERE user_id IS NULL;`,
          `CREATE UNIQUE INDEX IF NOT EXISTS gmail_accounts_user_idx ON gmail_accounts(user_id);`,
          `CREATE TABLE IF NOT EXISTS notebook_shares (
            id TEXT PRIMARY KEY,
            notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'collaborator',
            invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at BIGINT NOT NULL
          );`,
          `CREATE UNIQUE INDEX IF NOT EXISTS notebook_shares_nb_email_idx ON notebook_shares(notebook_id, email);`,
          `CREATE INDEX IF NOT EXISTS notebook_shares_email_idx ON notebook_shares(email);`,
          `ALTER TABLE sources ADD COLUMN IF NOT EXISTS user_id TEXT;`,
          `ALTER TABLE sources ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT '';`,
          `ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id TEXT;`,
          `ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT '';`,
          `UPDATE sources s SET user_id = n.user_id, author_name = COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1), 'Someone')
            FROM notebooks n LEFT JOIN users u ON u.id = n.user_id
            WHERE s.notebook_id = n.id AND (s.user_id IS NULL OR s.author_name = '');`,
          `UPDATE messages m SET user_id = n.user_id, author_name = COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1), 'Someone')
            FROM notebooks n LEFT JOIN users u ON u.id = n.user_id
            WHERE m.notebook_id = n.id AND m.role = 'user' AND (m.user_id IS NULL OR m.author_name = '');`,
          `CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'custom',
            transport TEXT NOT NULL DEFAULT 'stdio',
            command TEXT,
            args JSONB NOT NULL DEFAULT '[]'::jsonb,
            url TEXT,
            env JSONB NOT NULL DEFAULT '{}'::jsonb,
            extra JSONB NOT NULL DEFAULT '{}'::jsonb,
            enabled INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'idle',
            tools JSONB NOT NULL DEFAULT '[]'::jsonb,
            error TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
          );`,
          `CREATE INDEX IF NOT EXISTS mcp_servers_notebook_idx ON mcp_servers(notebook_id);`,
        ];
        for (const stmt of authCols) {
          try {
            await sql.unsafe(stmt);
          } catch {
            /* already present or unique conflict on empty user_id — ignore */
          }
        }
        const extras = [
          `CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);`,
          `CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);`,
          `CREATE INDEX IF NOT EXISTS episodes_embedding_idx ON episodes USING hnsw (embedding vector_cosine_ops);`,
          `CREATE INDEX IF NOT EXISTS chunks_fts_idx ON chunks USING gin (to_tsvector('english', content));`,
        ];
        for (const stmt of extras) {
          try {
            await sql.unsafe(stmt);
          } catch {
            /* hnsw/gin optional until pgvector + enough rows exist */
          }
        }
      } catch (err) {
        globalForDb.schemaReady = undefined;
        throw err;
      }
    })();
  }
  return globalForDb.schemaReady;
}

export function vectorLiteral(values: number[]) {
  return `[${values.map((n) => Number(n).toFixed(8)).join(",")}]`;
}

export function queryRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && "rows" in raw) {
    const rows = (raw as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}
