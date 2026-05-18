import { documentAiInvoiceText } from "./document-ai";
import { guessInvoiceDate } from "./guess-invoice-date";
import { messageDateFromInternalMs } from "./drive-month-folder";
import { tryExtractPdfEmbeddedText } from "./pdf-text";

export type RoutingDateSource = "gmail" | "invoice";

export type RoutingResolution = {
  routingInstant: Date;
  via: "gmail" | "embedded_pdf" | "document_ai" | "fallback_gmail";
};

/** MIME types we parse for invoice-date routing (embedded PDF text + optional Document AI). */
export type RoutingInvoiceMime = "application/pdf" | "image/jpeg" | "image/png";

export function normalizeRoutingMime(
  mime: string | undefined | null,
): RoutingInvoiceMime | null {
  if (!mime) return null;
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (m === "application/pdf") return "application/pdf";
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  return null;
}

export function readRoutingDateSource(): RoutingDateSource {
  const raw = (process.env.ROUTING_DATE_SOURCE ?? "gmail").trim().toLowerCase();
  if (raw === "invoice" || raw === "pdf" || raw === "document" || raw === "ocr") {
    return "invoice";
  }
  return "gmail";
}

/**
 * For QuickBooks-style workflows: derive folder/filename date from invoice body when possible.
 * PDF: embedded text first, then Document AI. JPEG/PNG: Document AI only (no embedded layer).
 * Unknown MIME → Gmail receive time (`fallback_gmail`).
 *
 * `attachmentMime` Gmail attachment MIME (e.g. `image/jpeg`). Ignored when `source === "gmail"`.
 */
export async function resolveRoutingInstant(
  internalMs: string | undefined | null,
  buffer: Buffer,
  source: RoutingDateSource,
  attachmentMime?: string | null,
): Promise<RoutingResolution> {
  const emailInstant = messageDateFromInternalMs(internalMs);

  if (source === "gmail") {
    return { routingInstant: emailInstant, via: "gmail" };
  }

  const routingMime = normalizeRoutingMime(attachmentMime);
  if (!routingMime) {
    return { routingInstant: emailInstant, via: "fallback_gmail" };
  }

  if (routingMime === "application/pdf") {
    const embedded = await tryExtractPdfEmbeddedText(buffer);
    if (embedded) {
      const guessed = guessInvoiceDate(embedded, emailInstant);
      if (guessed) return { routingInstant: guessed, via: "embedded_pdf" };
    }

    const ocrText = await documentAiInvoiceText(buffer, "application/pdf");
    if (ocrText) {
      const guessed = guessInvoiceDate(ocrText, emailInstant);
      if (guessed) return { routingInstant: guessed, via: "document_ai" };
    }
  } else {
    const ocrText = await documentAiInvoiceText(buffer, routingMime);
    if (ocrText) {
      const guessed = guessInvoiceDate(ocrText, emailInstant);
      if (guessed) return { routingInstant: guessed, via: "document_ai" };
    }
  }

  return { routingInstant: emailInstant, via: "fallback_gmail" };
}
