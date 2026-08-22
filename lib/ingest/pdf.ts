import { extractText, getDocumentProxy } from "unpdf";
import { chunkPages, type RawChunk } from "@/lib/rag/chunk";

export async function extractPdf(bytes: Uint8Array): Promise<{
  title?: string;
  pages: number;
  chunks: RawChunk[];
  text: string;
}> {
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
  const pages = pageTexts.map((text, i) => ({ page: i + 1, text: String(text || "") }));
  const text = pages.map((p) => p.text).join("\n\n");
  return {
    pages: pages.length,
    chunks: chunkPages(pages),
    text,
  };
}
