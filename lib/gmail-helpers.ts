/**
 * Matches Gmail UI search semantics for labels with optional spaces.
 * Example: Billing and "Billing Processed"
 */
export function gmailLabelQueryTerm(labelName: string, negate = false): string {
  const safe = labelName.replaceAll('"', "").trim();
  const labelValue = safe.includes(" ") ? `"${safe}"` : safe;
  return `${negate ? "-" : ""}label:${labelValue}`;
}

export function buildBillingSearchQuery(params: {
  billingLabelName: string;
  processedLabelName: string;
}): string {
  return `${gmailLabelQueryTerm(params.billingLabelName)} ${gmailLabelQueryTerm(
    params.processedLabelName,
    true,
  )}`.trim();
}

export type AttachmentMeta = {
  attachmentId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
};

type MessagePartRecursive = {
  filename?: string | null;
  mimeType?: string | null;
  body?: { attachmentId?: string | null };
  parts?: MessagePartRecursive[] | undefined;
};

export function flattenAttachmentParts(
  part: MessagePartRecursive | null | undefined,
  out: AttachmentMeta[] = [],
): AttachmentMeta[] {
  if (!part) return out;
  if (part.parts?.length) {
    for (const child of part.parts) flattenAttachmentParts(child, out);
  }
  if (part.body?.attachmentId) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
    });
  }
  return out;
}
