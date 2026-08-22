const INJECTION =
  /\b(ignore (all |previous |above )?instructions|you are now dan|jailbreak|system prompt|developer mode)\b/i;
const EXFIL =
  /\b(repeat your (system|hidden) prompt|print your instructions|reveal (the )?system)\b/i;

export type GuardResult =
  | { ok: true; question: string }
  | { ok: false; reason: string };

export function screenInput(raw: string): GuardResult {
  const question = raw.replace(/\u0000/g, "").trim();
  if (question.length < 2) return { ok: false, reason: "Ask a real question." };
  if (question.length > 4000) return { ok: false, reason: "Question is too long (max 4000 characters)." };
  if (INJECTION.test(question) || EXFIL.test(question)) {
    return {
      ok: false,
      reason: "That request tries to override the assistant. Ask about your notebook sources instead.",
    };
  }
  return { ok: true, question };
}
