import { PDFParse } from "pdf-parse";

/** Embedded text when the PDF stores it digitally (no OCR). */

export async function tryExtractPdfEmbeddedText(buffer: Buffer): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const text = typeof textResult.text === "string" ? textResult.text.trim() : "";
      return text.length > 40 ? text : null;
    } finally {
      await parser.destroy();
    }
  } catch {
    return null;
  }
}
