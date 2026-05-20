/**
 * Embedded text extraction (digital PDFs). Uses pdf-parse v1 — avoids pdfjs-dist v4 + canvas/DOM deps that break Vercel.
 */

export async function tryExtractPdfEmbeddedText(buffer: Buffer): Promise<string | null> {
  try {
    const modUnknown = await import("pdf-parse");
    const pdfParseFn =
      typeof modUnknown === "function"
        ? (modUnknown as (b: Buffer) => Promise<{ text?: string }>)
        : (modUnknown as { default: (b: Buffer) => Promise<{ text?: string }> }).default;
    const parsed = await pdfParseFn(buffer);
    const text = typeof parsed?.text === "string" ? parsed.text.trim() : "";
    return text.length > 40 ? text : null;
  } catch {
    return null;
  }
}
