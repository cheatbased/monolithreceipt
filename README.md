# Billing invoices → Google Drive

You can automate this in **two ways**. Pick one.

---

## Recommended: Google Apps Script (easiest — no servers)

Same Google account, no server. Scheduled runs locate Gmail threads with **Billing**, skip anything already tagged **Billing Processed**, grab **PDF** attachments and save them beneath your Drive root, then stamp the Gmail thread as processed.

### Prerequisites

1. Gmail label **Billing** (`BILLING_LABEL` constant in `apps-script/Code.gs`).
2. A Drive vault + its folder ID (`DRIVE_FOLDER_ID`).
3. **Optional filter** that auto-tags invoice mail **Billing**.

### Steps (numbered)

1. Visit [Google Apps Script](https://script.google.com/) → new project named e.g. **Billing receipts**.
2. Paste the entire file **`apps-script/Code.gs`** into **Code.gs** and save.
3. **⚙️ Project Settings → Script properties**

   Required:

   | Property | Value |
   | --- | --- |
   | **`DRIVE_FOLDER_ID`** | `https://drive.google.com/drive/folders/…`**`<id>`** |

   Fiscal French layout (Root → **`Trimestre {{t}}`** → **`{{n}}. {{MONTH_FR}}`** such as **`4. JUILLET`**):

   | Property | Typical value |
   | --- | --- |
   | **`DRIVE_ORGANIZATION`** | `FY_TRIMESTRES_FR` |
   | **`FY_LEAF_COUNTER`** | `FISCAL` (counts **1 = AVRIL … 12 = MARS**) • `QUARTER` resets each trimester (**1 … 3**) |
   | **`FY_TRIMESTRE_FOLDER_TEMPLATE`** *(optional)* | `Trimestre {{t}}` |
   | **`FY_MONTH_LEAF_FOLDER_TEMPLATE`** *(optional)* | `{{n}}. {{MONTH_FR}}` |

   Simple **`yyyy-MM` buckets** (*default if you omit `DRIVE_ORGANIZATION`*):

   | Property | Notes |
   | --- | --- |
   | **`ORGANIZE_BY_MONTH`** | `false` ⇒ flat uploads (respects `DRIVE_ORGANIZATION=NONE` too) |
   | **`MONTH_FOLDER_FORMAT`** | Default `yyyy-MM` |

   Set **`DRIVE_ORGANIZATION=NONE`** only if PDFs must land directly in the root.

4. Run **`setupOnceFromEditor`** and grant Gmail/Drive scopes (Advanced → Continue is normal).
5. Check **Execution log**: preview the generated folder titles (FY logs show `counter=FISCAL` or `counter=QUARTER`).
6. Run **`syncBillingInvoices`** once and confirm uploads.
7. **Triggers → + Trigger** → `syncBillingInvoices` every 15 min (or hourly).
8. Test with labelled mail.

### Fiscal French quarters (`FY_TRIMESTRES_FR`)

Exercise **April → March** common in francophone accounting books:

```
Root
├── Trimestre 1 ▸ 1. AVRIL ,  2. MAI      ,  3. JUIN
├── Trimestre 2 ▸ 4. JUILLET ,  5. AOUT     ,  6. SEPTEMBRE
├── Trimestre 3 ▸ 7. OCTOBRE ,  8. NOVEMBRE,  9. DECEMBRE
└── Trimestre 4 ▸10. JANVIER , 11. FEVRIER , 12. MARS
```

Provide **only the root Drive ID**. The importer matches existing folders—or creates them—with the precise names above when using the defaults.

- **`FY_LEAF_COUNTER`**:

  | Value | Behaviour |
  | --- | --- |
  | **`FISCAL`** (default) | `{{n}}` matches the **global FY counter** (**Avril = 1**, **Juillet = 4**, **Janvier = 10**, …). |
  | **`QUARTER`** | `{{n}}` resets to **1** at each new trimester. |

Spellings such as **`FEVRIER`**, **`AOUT`** and **`NOVEMBRE`** intentionally mirror **`FR_MONTH_UPPER`** in `apps-script/Code.gs`; edit that array/templates if your Drive labels differ (**`FÉVRIER`**, different spacing around the dot, etc.). **Project ▸ Time zone** controls which Gmail timestamp maps onto which FY month bucket.

### Plain ISO buckets (`yyyy-MM`)

| Approach | Handles |
| --- | --- |
| **Apps Script** | Omit `DRIVE_ORGANIZATION` ⇒ ISO mode honours `ORGANIZE_BY_MONTH` + `MONTH_FOLDER_FORMAT`. |
| **Vercel** | `DRIVE_ORGANIZATION` absent or **`iso_month`**, plus `ORGANIZE_BY_MONTH`, `DRIVE_MONTH_FOLDER_STYLE`, etc. |

### Troubleshooting

| Symptom | Likely remedy |
| --- | --- |
| Billing missing | Labels must literally read **Billing** / **Billing Processed**. |
| Nothing uploads | Only **PDF attachments** run through the importer. |
| Duplicate Drive folders | A character mismatch (`1.` vs `01.`, stray spaces, accents) creates sibling folders — align Drive names with the Execution log preview. |

---

## Alternate: Vercel (Next.js cron)

Hosted HTTPS cron + typed env vars (`DRIVE_ORGANIZATION`, `FY_LEAF_COUNTER`, Gmail tokens, Drive scope). See `.env.example` for **`fy_trimesters_fr`** vs **`iso_month`**.

### Invoice date routing (PDF / JPEG / PNG + optional OCR)

By default, **`ROUTING_DATE_SOURCE=gmail`** uses Gmail’s message timestamp for the filename prefix (`yyyy-mm-dd_…`) and for folder placement. Set **`ROUTING_DATE_SOURCE=invoice`** to derive the date per attachment:

- **PDF**: embedded text first (`pdf-parse`), then **Document AI** if configured or if no usable date was found.
- **JPEG / PNG**: **Document AI only** (images have no embedded text layer). Requires **`DOCUMENT_AI_PROCESSOR_NAME`** + **`GOOGLE_APPLICATION_CREDENTIALS_JSON`** for OCR.

Supported MIME types for invoice routing: **`application/pdf`**, **`image/jpeg`** / **`image/jpg`**, **`image/png`**. Anything else uses Gmail time (`routingVia`=`fallback_gmail`).

To **upload** JPG/PNG attachments at all (not only PDFs), set **`REQUIRE_PDF_ONLY=false`**.

Heuristic date parsing lives in `lib/guess-invoice-date.ts` (ISO, `dd/mm/yyyy`, French month names).

This is the same extraction path you can extend toward **QuickBooks** later (vendor, line items, totals)—either enrich the heuristics or map **Document AI** invoice entities to QuickBooks fields via their API.

Pick **Apps Script** when you want the least infra — choose **Vercel** only if Git-hosted secrets/deploys suit you better.
