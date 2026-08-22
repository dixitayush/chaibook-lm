const STOP = new Set(
  "a an the and or of to in on for with is are was were be been it this that from as at by not no if but into over after before than then so such their its his her you your we our they them".split(
    " ",
  ),
);

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export type Bm25Doc = { id: string; tokens: string[] };

export function bm25Scores(query: string, docs: Bm25Doc[], k1 = 1.4, b = 0.75) {
  const qTokens = tokenize(query);
  if (!qTokens.length || !docs.length) return new Map<string, number>();
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.tokens.length, 0) / N;
  const df = new Map<string, number>();
  const tfs = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });
  const scores = new Map<string, number>();
  docs.forEach((doc, i) => {
    const tf = tfs[i];
    const dl = doc.tokens.length || 1;
    let score = 0;
    for (const term of qTokens) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    scores.set(doc.id, score);
  });
  return scores;
}
