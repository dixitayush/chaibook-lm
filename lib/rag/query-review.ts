import { chatJson } from "@/lib/llm/client";

export type ReviewedQuery = {
  rewritten: string;
  retrievalQuery: string;
  intent: string;
};

export async function reviewQuery(opts: {
  question: string;
  notebookTitle: string;
  feedback?: string;
}): Promise<ReviewedQuery> {
  try {
    const data = await chatJson<ReviewedQuery>(
      `You review research questions before retrieval.
Rewrite for clarity without changing meaning.
retrievalQuery should be keyword-rich for hybrid search.
intent is one short clause.
If feedback is present, fix the previous rewrite so retrieval can answer it.
Return JSON only.`,
      JSON.stringify({
        notebook: opts.notebookTitle,
        question: opts.question,
        feedback: opts.feedback || null,
        shape: { rewritten: "", retrievalQuery: "", intent: "" },
      }),
    );
    const rewritten = (data.rewritten || opts.question).trim() || opts.question;
    return {
      rewritten,
      retrievalQuery: (data.retrievalQuery || rewritten).trim() || rewritten,
      intent: (data.intent || "answer from notebook sources").trim(),
    };
  } catch {
    return { rewritten: opts.question, retrievalQuery: opts.question, intent: "answer from notebook sources" };
  }
}
