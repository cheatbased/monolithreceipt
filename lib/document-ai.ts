import { GoogleAuth } from "google-auth-library";

/**
 * OCR text via Document AI Invoice Parser — PDF or raster images (`image/jpeg`, `image/png`, …).
 *
 * DOCUMENT_AI_PROCESSOR_NAME — full resource path, e.g.
 * projects/PROJECT/locations/eu/processors/UUID
 *
 * GOOGLE_APPLICATION_CREDENTIALS_JSON — service account JSON (Document AI API enabled).
 * Optional DOCUMENT_AI_LOCATION — only if the processor path omits /locations/.../ (unlikely).
 */

async function bearerForDocumentAi(): Promise<string | null> {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!raw) return null;

  const credentials = JSON.parse(raw) as Record<string, unknown>;
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tok = await client.getAccessToken();
  return tok.token ?? null;
}

function hostnameLocation(processorPath: string): string {
  const m = processorPath.match(/\/locations\/([^/]+)\//i);
  const fromPath = m?.[1]?.toLowerCase().trim();
  if (fromPath) return fromPath;
  const fallback = process.env.DOCUMENT_AI_LOCATION?.trim().toLowerCase();
  return fallback ?? "eu";
}

/** Returns OCR text when Document AI succeeds, else null. */
export async function documentAiInvoiceText(
  buffer: Buffer,
  mimeType: string = "application/pdf",
): Promise<string | null> {
  const processorPath = process.env.DOCUMENT_AI_PROCESSOR_NAME?.trim();
  if (!processorPath?.startsWith("projects/")) return null;

  const token = await bearerForDocumentAi();
  if (!token) return null;

  const loc = hostnameLocation(processorPath);
  const url = `https://${loc}-documentai.googleapis.com/v1/${processorPath}:processDocument`;

  const body = {
    rawDocument: {
      content: buffer.toString("base64"),
      mimeType,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Document AI error", res.status, errText.slice(0, 500));
    return null;
  }

  const json = (await res.json()) as { document?: { text?: string } };
  const full = json.document?.text?.trim();
  if (full && full.length > 20) return full;
  return null;
}
