# ChaiBook LM

A source-grounded research workspace inspired by [Gemini Notebook](https://notebooklm.google/) — off-white editorial UI with mauve type and borders, hybrid retrieval you can inspect, dual-voice podcasts, YouTube learning roadmaps, and **long-term memory** so the model does not lose the thread.

Live-style reference we improved on: [Chaibook LM (Vercel)](https://chaibook-lm-6rft.vercel.app/).

ChaiBook LM is a full RAG system: **ingest → chunk → embed → retrieve → generate → cite → remember**. Every notebook is an isolated knowledge base. Answers cite sources; pinned facts, Mem0, a knowledge graph, and episodic embeddings keep context across turns.

## Features

### Assignment coverage

| Requirement | Implementation |
| --- | --- |
| Multiple notebooks | Create, rename, delete. Isolated Postgres tables keyed by `notebook_id`. |
| Sources | PDF, plain text, website URL, YouTube, VTT/SRT, email, calendar (.ics / Google), Drive files, **MCP snapshots** (GitHub, Jira, Postgres, …) |
| Indexing pipeline | Extract → chunk → embed → store. Status: **uploading / extracting / indexing / ready / error** |
| Remove / re-index | Per-source menu |
| Grounded Q&A | Hybrid **pgvector** cosine + Postgres FTS + reciprocal rank fusion |
| Streaming answers | SSE token stream |
| Citations | Inline `[n]` chips + source chips. Click opens the viewer |
| Source viewer | PDF at page, website preview, YouTube at timestamp, text/transcript highlight |
| Bonus podcast | Two hosts (Aarav / Meera). OpenAI TTS when available, browser voices otherwise |
| Bonus roadmap | Playlist/video sources → concept timeline pinned to timestamps |

### Memory (so the LLM does not lose context)

- **Mem0** — optional cloud memory (`MEM0_API_KEY`). Local `memories` table is always the source of truth.
- **Semantic / pinned facts** — pin from chat or the Memory tab; injected into the system prompt.
- **Knowledge graph** — after each turn, entities and edges (`RELATED_TO`, `MENTIONS`, `ABOUT`) land in `graph_nodes` / `graph_edges`.
- **Episodic memory** — each Q&A is stored with a pgvector embedding and retrieved for later questions.
- **Short-term memory (Redis)** — the last 12 chat turns per notebook live in Redis with a 2-hour idle TTL and LRU eviction. Long-term pins, graph, and episodes stay in Postgres.

### Beyond NotebookLM

- **Retrieval inspector** — RRF, vector, and FTS scores for every cited chunk
- **Hybrid search** — dense pgvector + keyword FTS, fused with RRF, then source-diversified
- **YouTube playlists** — paste a playlist URL; up to 12 public videos ingest as isolated sources
- **Studio briefing, FAQ, flashcards** generated only from the notebook corpus
- **MCP tools** — connect GitHub, Jira, Postgres, Notion, Slack, a custom server, or paste Claude / VS Code / Cursor MCP JSON; chat can call them live, or you can pull a snapshot into the notebook
- **Export chat** as Markdown; pin the last answer into LTM
- **Off-white canvas** with mauve `#A376A2` type, borders, and boxes; Fraunces + Figtree

## Architecture

```
┌─────────────┐     extract      ┌─────────────┐     embed      ┌──────────────┐
│ PDF / URL / │ ───────────────► │  Chunker    │ ─────────────► │  Postgres    │
│ YT / VTT    │   unpdf,cheerio  │  900 / 160  │  OpenAI/Gemini │  + pgvector  │
└─────────────┘   captions RSS   └─────────────┘                └──────┬───────┘
Question ──► embed query ──► cosine top-24                             │
         ──► FTS top-24  ──► RRF fuse ──► diversify ──► top-8 ─────────┘
                                              │
                    Memory block ◄── Redis STM + cached LTM (pins + graph + episodes)
                                              │
                                              ▼
                                    Grounded system prompt
                                    “cite [n] or refuse”
                                              │
                                              ▼
                                    Streaming LLM + citation chips
                                              │
                                              ▼
                         persistTurn → episode embedding + graph extract
```

## Tech stack

- **Next.js 16** App Router (Node runtime)
- **Tailwind CSS 4** + customized **shadcn/ui** (Base UI / nova)
- **Fraunces** (headings) + **Figtree** (UI) + **IBM Plex Mono**
- **Drizzle ORM** + **Postgres** + **pgvector**
- **Redis** for per-notebook short-term memory (LRU) and API rate limits
- **Traefik** VPS gateway (public TLS) + **Caddy** as a private reverse proxy in production
- **Mem0** (optional) for cloud long-term memory
- **MCP** (`@modelcontextprotocol/sdk`) for live GitHub / Jira / Postgres / custom tools
- **OpenAI** or **Gemini** for embeddings + chat
- **unpdf**, **cheerio**, YouTube timedtext + playlist Atom RSS

## Setup

```bash
cd chaibook-lm
cp .env.example .env.local
# set OPENAI_API_KEY  (or GEMINI_API_KEY)
# optional: MEM0_API_KEY
docker compose up -d
npm install
npm run dev
```

`docker compose up -d` publishes Postgres on **5433** and Redis on **6379** so they do not collide with local instances.

SQLite `data/chaibook.db` is no longer used. Re-add sources after switching to Postgres.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | one of the keys | Chat, embeddings, podcast TTS |
| `GEMINI_API_KEY` | one of the keys | Chat + embeddings (podcast uses browser voices) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | alias | Same as Gemini |
| `CHAT_MODEL` | no | Default `gpt-4o-mini` or `gemini-2.0-flash` |
| `EMBEDDING_MODEL` | no | Default `text-embedding-3-small` or `text-embedding-004` |
| `DATABASE_URL` | **yes** | `postgres://chaibook:chaibook@localhost:5433/chaibook` |
| `REDIS_URL` | prod yes | `redis://127.0.0.1:6379` locally; compose sets `redis://redis:6379` |
| `MEM0_API_KEY` | no | Cloud Mem0; local Postgres memories still work |
| `AUTH_SECRET` | **prod yes** | Signs httpOnly access JWTs. `openssl rand -base64 48`. Auto-generated by `./deploy.sh` |
| `CHAIBOOK_HOST` | VPS | Hostname Traefik matches, e.g. `chaibook.ayushdixit.work` |
| `POSTGRES_PASSWORD` | VPS | Overrides the default `chaibook` Postgres password |
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | for Google | Read-only Gmail, Calendar, and Drive. Redirect URI: `{APP_URL}/api/gmail/callback` |
| `PODCAST_VOICE_MALE` / `FEMALE` | no | OpenAI TTS voices (`onyx`, `nova`, …) |

### Production (VPS behind Traefik)

The public edge is **Traefik** (`../gateway`). It is the only process that binds host ports 80/443. Chaibook’s production stack is **Postgres + Redis + the Next.js app + Caddy**, all unpublished. Traefik routes `CHAIBOOK_HOST` to Caddy on the private `proxy` network; Caddy proxies to the app (including SSE chat). Redis stores short-term memory with `allkeys-lru` and also backs rate limits (chat 25/min, studio 12/min, login 10/min IP + 8 failures / 15 min per email, register 8/min IP; the API fails open if Redis is down). Auth is a 15-minute access JWT plus a rotating 30-day refresh token, both in `httpOnly` cookies.

Full fresh-VPS steps, DNS, firewall, and how to add another app: **[DEPLOYMENT.md](../DEPLOYMENT.md)**.

```bash
# From the repository root (the folder that contains gateway/ and chaibook-lm/)

# 1. Once per VPS — Docker, firewall, Traefik
ACME_EMAIL=you@ayushdixit.work ./setup.sh

# 2. Chaibook
cd chaibook-lm
./deploy.sh
```

Google OAuth redirect stays `{APP_URL}/api/gmail/callback`. Indexing still runs in `after()` so the upload request returns while extract/embed continues.

## Folder structure

```
app/api/                 REST + SSE (notebooks, sources, chat, studio, memory)
lib/db/                  Postgres + pgvector schema, auto-DDL
lib/ingest/              PDF, web, YouTube, VTT, indexing pipeline
lib/rag/                 chunk, embed, retrieve, prompts
lib/memory/              Mem0, Redis STM, knowledge graph, episodic memory
lib/mcp/                 MCP client, presets, live chat context
lib/llm/                 provider + TTS
lib/redis.ts             Redis client (STM + rate limits)
deploy.sh                VPS deploy (Traefik must already be up via ../setup.sh)
deploy/                  Internal Caddyfile (Traefik lives in ../gateway)
components/notebook/     gallery, workspace, chat, studio, memory, tools, viewer
```

## Demo script

See [DEMO.md](./DEMO.md) for a 3–4 minute walkthrough (record with OBS / Loom).

## License

MIT
