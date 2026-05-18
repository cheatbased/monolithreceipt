import { Readable } from "node:stream";
import type { gmail_v1 } from "googleapis";
import {
  driveMonthFolderTitle,
  messageDateFromInternalMs,
  type MonthFolderFormatting,
  type MonthFolderStyle,
} from "./drive-month-folder";
import { buildFrenchFiscalTrimesterPath, type FrTrimesterNaming, type FyLeafCounterStyle } from "./fr-fy-trimesters";
import {
  buildBillingSearchQuery,
  flattenAttachmentParts,
  type AttachmentMeta,
} from "./gmail-helpers";
import type { Gmail } from "./google-clients";
import { driveClient, gmailClient } from "./google-clients";
import { getOrCreateChildFolder, resolveFolderSegments } from "./drive-subfolders";
import {
  normalizeRoutingMime,
  readRoutingDateSource,
  resolveRoutingInstant,
  type RoutingDateSource,
  type RoutingResolution,
} from "./resolve-routing-date";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive",
] as const;

export type ProcessInvoicesResult = {
  query: string;
  examinedMessageIds: string[];
  uploaded: Array<{
    messageId: string;
    driveFileId: string;
    driveFileName: string;
    sourceAttachmentFilename?: string | null;
    routingVia?: RoutingResolution["via"];
  }>;
  skippedNoAttachments: Array<{ messageId: string }>;
  skippedNonPdf?: Array<{ messageId: string; mimeType?: string | null }>;
  failures: Array<{ messageId?: string; error: string }>;
};

export type DriveOrganizationMode = "none" | "iso_month" | "fy_trimesters_fr";

export type ProcessEnvConfig = {
  billingLabelName: string;
  processedLabelName: string;
  driveParentFolderId: string;
  maxMessagesPerRun: number;
  requirePdfOnly: boolean;
  driveOrganization: DriveOrganizationMode;
  organizeByMonth: boolean;
  monthFormatting: MonthFolderFormatting;
  fyTrimNaming: FrTrimesterNaming;
  routingDateSource: RoutingDateSource;
};

function readDriveOrganization(): DriveOrganizationMode {
  const raw = (process.env.DRIVE_ORGANIZATION ?? "").trim().toLowerCase().replace(/-/g, "_");

  if (
    raw === "fy_trimesters_fr" ||
    raw === "fy_trimestres_fr" ||
    raw === "fr_fy_trimesters" ||
    raw === "fr_trimestres"
  ) {
    return "fy_trimesters_fr";
  }

  if (raw === "iso_month" || raw === "month" || raw === "flat_iso") {
    return "iso_month";
  }

  if (raw === "none" || raw === "root") return "none";

  if (raw) {
    throw new Error(
      `Unknown DRIVE_ORGANIZATION="${process.env.DRIVE_ORGANIZATION}" (use none | iso_month | fy_trimesters_fr).`,
    );
  }

  const legacyMonth = (process.env.ORGANIZE_BY_MONTH ?? "true").toLowerCase();

  return legacyMonth === "false" || legacyMonth === "0" ? "none" : "iso_month";
}

function readProcessEnv(): ProcessEnvConfig {
  const driveParentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!driveParentFolderId) {
    throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");
  }

  const folderStyleRaw = (process.env.DRIVE_MONTH_FOLDER_STYLE ?? "yyyy-mm").toLowerCase();
  const folderStyle: MonthFolderStyle = folderStyleRaw === "long" ? "long" : "yyyy-mm";

  const driveOrganization = readDriveOrganization();

  const leafCounterRaw = (process.env.FY_LEAF_COUNTER ?? "fiscal").toLowerCase().trim();
  const leafCounterStyle: FyLeafCounterStyle =
    leafCounterRaw === "quarter" ? "quarter_slot" : "fiscal_year_index";

  const fyTrimNaming: FrTrimesterNaming = {
    timeZone: (process.env.FY_SUBFOLDER_TIME_ZONE ?? process.env.DRIVE_SUBFOLDER_TIME_ZONE ?? "UTC").trim(),
    trimestreFolderTemplate: (process.env.FY_TRIMESTRE_FOLDER_TEMPLATE ?? "Trimestre {{t}}").trim(),
    monthLeafFolderTemplate: (process.env.FY_MONTH_LEAF_FOLDER_TEMPLATE ?? "{{n}}. {{MONTH_FR}}").trim(),
    leafCounterStyle,
  };

  return {
    billingLabelName: (process.env.BILLING_LABEL ?? "Billing").trim(),
    processedLabelName: (process.env.PROCESSED_LABEL ?? "Billing Processed").trim(),
    driveParentFolderId,
    maxMessagesPerRun: Math.min(
      50,
      Math.max(1, Number.parseInt(process.env.MAX_MESSAGES_PER_RUN ?? "10", 10) || 10),
    ),
    requirePdfOnly: (process.env.REQUIRE_PDF_ONLY ?? "true").toLowerCase() !== "false",
    driveOrganization,
    organizeByMonth: (process.env.ORGANIZE_BY_MONTH ?? "true").toLowerCase() !== "false",
    monthFormatting: {
      style: folderStyle,
      timeZone: (process.env.DRIVE_SUBFOLDER_TIME_ZONE ?? "UTC").trim(),
      locale: (process.env.DRIVE_SUBFOLDER_LOCALE ?? "en-US").trim(),
    },
    fyTrimNaming,
    routingDateSource: readRoutingDateSource(),
  };
}

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function sanitizeBaseName(input: string): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  return safe.length > 120 ? safe.slice(0, 120) : safe;
}

function pickSubject(message: gmail_v1.Schema$Message): string {
  const headers = message.payload?.headers ?? [];
  const subject = headers.find((h) => (h.name ?? "").toLowerCase() === "subject")?.value;
  return subject?.trim() ? subject.trim() : "invoice";
}

function formatDateYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extensionForMime(mimeType: string | undefined | null, fallbackName: string | undefined | null): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  const fromName = fallbackName?.match(/(\.[a-zA-Z0-9]{2,10})$/);
  return fromName?.[1]?.toLowerCase() ?? "";
}

async function ensureUserLabel(gmailApi: Gmail, labelName: string): Promise<string> {
  const list = await gmailApi.users.labels.list({ userId: "me" });
  const labels = list.data.labels ?? [];
  const match = labels.find((l) => l.name === labelName);
  if (match?.id) return match.id;

  const created = await gmailApi.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  if (!created.data.id) {
    throw new Error(`Failed to create Gmail label: ${labelName}`);
  }
  return created.data.id;
}

function selectAttachments(
  attachments: AttachmentMeta[],
  requirePdfOnly: boolean,
): { selected: AttachmentMeta[]; skippedNonPdf: AttachmentMeta[] } {
  const pdfs = attachments.filter((a) => a.mimeType === "application/pdf");
  if (requirePdfOnly) {
    const skippedNonPdf = attachments.filter((a) => a.mimeType !== "application/pdf");
    return { selected: pdfs, skippedNonPdf };
  }

  const selected = attachments.length ? attachments : pdfs;
  return { selected, skippedNonPdf: [] };
}

type Drive = ReturnType<typeof driveClient>;

async function resolveDriveUploadParent(
  driveApi: Drive,
  config: ProcessEnvConfig,
  routingInstant: Date,
): Promise<string> {
  if (config.driveOrganization === "none") {
    return config.driveParentFolderId;
  }

  if (config.driveOrganization === "fy_trimesters_fr") {
    const frPath = buildFrenchFiscalTrimesterPath(routingInstant, config.fyTrimNaming);
    return resolveFolderSegments(driveApi, config.driveParentFolderId, [
      frPath.trimestreFolder,
      frPath.monthFolder,
    ]);
  }

  if (config.driveOrganization === "iso_month" && config.organizeByMonth) {
    const monthTitle = driveMonthFolderTitle(routingInstant, config.monthFormatting);
    return getOrCreateChildFolder(driveApi, config.driveParentFolderId, monthTitle);
  }

  return config.driveParentFolderId;
}

export async function processInvoices(options: {
  oauth2: ReturnType<typeof import("./google-clients").createOAuth2Client>;
}): Promise<ProcessInvoicesResult> {
  const config = readProcessEnv();
  const gmailApi = gmailClient(options.oauth2);
  const driveApi = driveClient(options.oauth2);

  const processedLabelId = await ensureUserLabel(gmailApi, config.processedLabelName);

  const query = buildBillingSearchQuery({
    billingLabelName: config.billingLabelName,
    processedLabelName: config.processedLabelName,
  });

  const listResp = await gmailApi.users.messages.list({
    userId: "me",
    q: query,
    maxResults: config.maxMessagesPerRun,
  });

  const messageRefs = listResp.data.messages ?? [];
  const examinedMessageIds = messageRefs.map((m) => m.id).filter(Boolean) as string[];

  const result: ProcessInvoicesResult = {
    query,
    examinedMessageIds,
    uploaded: [],
    skippedNoAttachments: [],
    skippedNonPdf: [],
    failures: [],
  };

  for (const ref of messageRefs) {
    const messageId = ref.id;
    if (!messageId) continue;

    try {
      const full = await gmailApi.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const msg = full.data;
      const attachments = flattenAttachmentParts(msg.payload ?? undefined);

      const { selected, skippedNonPdf } = selectAttachments(attachments, config.requirePdfOnly);

      for (const s of skippedNonPdf) {
        result.skippedNonPdf?.push({ messageId, mimeType: s.mimeType });
      }

      if (!selected.length) {
        result.skippedNoAttachments.push({ messageId });
        continue;
      }

      const subject = pickSubject(msg);
      const subjectBase = sanitizeBaseName(subject) || "invoice";
      const msgInstant = messageDateFromInternalMs(msg.internalDate);

      let sharedUploadParentId: string | undefined;
      if (config.routingDateSource === "gmail") {
        sharedUploadParentId = await resolveDriveUploadParent(driveApi, config, msgInstant);
      }

      let index = 0;
      for (const att of selected) {
        if (!att.attachmentId) continue;
        index += 1;

        const suffix = selected.length > 1 ? `_part${index}` : "";
        const ext =
          extensionForMime(att.mimeType, att.filename) ||
          (config.requirePdfOnly ? ".pdf" : "");
        const originalBase = att.filename
          ? sanitizeBaseName(att.filename.replace(/\.[^.]+$/, ""))
          : "attachment";

        const attResp = await gmailApi.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: att.attachmentId,
        });

        const b64 = attResp.data.data;
        if (!b64) throw new Error("Empty attachment payload");

        const buffer = decodeBase64Url(b64);

        let routing: RoutingResolution;
        if (config.routingDateSource === "gmail") {
          routing = { routingInstant: msgInstant, via: "gmail" };
        } else if (!normalizeRoutingMime(att.mimeType)) {
          routing = { routingInstant: msgInstant, via: "fallback_gmail" };
        } else {
          routing = await resolveRoutingInstant(msg.internalDate, buffer, "invoice", att.mimeType);
        }

        const uploadParentId =
          config.routingDateSource === "gmail"
            ? sharedUploadParentId!
            : await resolveDriveUploadParent(driveApi, config, routing.routingInstant);

        const datePrefix = formatDateYmdUtc(routing.routingInstant);
        const driveName = `${datePrefix}_${subjectBase}${suffix}_${originalBase}${ext}`;

        const mimeType =
          att.mimeType ||
          (ext === ".pdf" ? "application/pdf" : "application/octet-stream");

        const uploaded = await driveApi.files.create({
          requestBody: {
            name: driveName,
            parents: [uploadParentId],
          },
          media: { mimeType, body: bufferToReadable(buffer) },
          fields: "id,name,mimeType",
        });

        if (!uploaded.data.id) throw new Error("Drive upload succeeded without file id");

        const uploadRow: (typeof result.uploaded)[number] = {
          messageId,
          driveFileId: uploaded.data.id,
          driveFileName: uploaded.data.name ?? driveName,
          sourceAttachmentFilename: att.filename,
        };
        if (config.routingDateSource === "invoice") {
          uploadRow.routingVia = routing.via;
        }
        result.uploaded.push(uploadRow);
      }

      await gmailApi.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: { addLabelIds: [processedLabelId] },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.failures.push({ messageId, error: message });
    }
  }

  return result;
}

function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf);
}
