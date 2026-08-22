# Demo video script (3–4 minutes)

Record the running app at 1920×1080. Talk over the UI; do not read the README.

## 0:00 — Hook

> ChaiBook LM is a notebook-scoped RAG workspace. Every answer is cited. Memory — pins, Mem0, a knowledge graph, and episodic embeddings — keeps context across turns.

Show the gallery (off-white canvas, mauve `#A376A2` type and borders). Create a notebook named “Attention is all you need”.

## 0:25 — Sources & status

Add:

1. A PDF
2. A website URL
3. A YouTube video (or playlist)
4. A `.vtt` file
5. A pasted text note
6. An email (paste, `.eml`, or Gmail if OAuth is set)
7. A calendar (`.ics` or Google Calendar)
8. Google Drive files chosen from a folder

Call out the status pipeline on each card: **Uploading → Extracting → Indexing → Ready**. Re-index one source. Delete one source. Mention notebook isolation: vectors never leak across notebooks. Mention Postgres + pgvector.

## 1:20 — Ask & stream

Ask: “What is the core idea, and where is it stated?”

Point at:

- Streaming tokens
- Inline `[1]` `[2]` chips
- Source chips with page / timestamp
- **Memory in context** strip after the first follow-up

Open the **retrieval inspector**. Explain hybrid search: pgvector cosine + Postgres FTS → RRF → diversified context.

Ask a follow-up that depends on the first answer. Show that the graph + episode memory keep the thread.

## 2:10 — Source viewer

Click a PDF citation → jumps to page.  
Click a YouTube citation → embed starts at `t=`.  
Click text/transcript → highlighted chunk.

## 2:40 — Studio + memory

Generate **Podcast** — play Aarav / Meera.  
Generate **Roadmap** from the YouTube sources — click a node to open the video at the concept timestamp.  
Generate **Flashcards**.  
Open the **Memory** tab — pin a fact, show the knowledge graph and episodic list. Pin the last chat answer.  
Open **Tools** — connect GitHub (or Jira / Postgres) via MCP; ask a question that needs live context.

## 3:20 — Close

> Practical RAG: recursive chunking, pgvector retrieval, notebook-scoped hybrid search, grounded prompts, and long-term memory so the model does not forget what you already established.

Keep the last five seconds on the three-panel workspace.
