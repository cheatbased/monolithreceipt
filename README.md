# Billing invoices → Google Drive (Vercel)

On a schedule, this app looks for Gmail messages with the **Billing** label (configurable), uploads PDF attachments to a **Google Drive folder you choose**, renames them using the message date + subject, then adds a **processed** label so the same message is not handled twice.

## What you need

- A Google Cloud project with **Gmail API** and **Google Drive API** enabled
- An OAuth **Client ID** (type: **Web application** or **Desktop app**) with this **Authorized redirect URI** for the one-time token helper:
  - `http://127.0.0.1:42813/oauth2callback`
- A Vercel project (Cron requires a plan that includes [Vercel Cron](https://vercel.com/docs/cron-jobs); if you are on a plan without Cron, use any external scheduler to `GET` the same route with the same `Authorization` header)

## Environment variables

Copy `.env.example` to `.env.local` for local testing, and set the same values in the Vercel dashboard.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived token from `npm run oauth` |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder id from the URL (`.../folders/<id>`) |
| `CRON_SECRET` | Random string; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `BILLING_LABEL` | Default `Billing` |
| `PROCESSED_LABEL` | Default `Billing Processed` (created automatically if missing) |
| `MAX_MESSAGES_PER_RUN` | Default `10` (capped at `50`) |
| `REQUIRE_PDF_ONLY` | Default `true` (`false` uploads other attachment types too) |

## One-time OAuth (get `GOOGLE_REFRESH_TOKEN`)

From this folder, with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in your shell (PowerShell example):

```powershell
$env:GOOGLE_CLIENT_ID="..."
$env:GOOGLE_CLIENT_SECRET="..."
npm run oauth
```

Open the printed URL, approve access, then copy the refresh token into Vercel as `GOOGLE_REFRESH_TOKEN`.

## Local test run

Set all required env vars in `.env.local`, including `CRON_SECRET`, then:

```powershell
npm install
npm run dev
```

In another terminal:

```powershell
curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/process-invoices
```

## Deploy to Vercel

1. Push the repo and import it in Vercel.
2. Add the environment variables in **Project → Settings → Environment Variables**.
3. Add `CRON_SECRET` (Vercel automatically sends it to cron invocations when configured).
4. Deploy. The schedule is defined in `vercel.json` (default: every 15 minutes).

## Gmail behavior

- Search used: `label:<BILLING_LABEL> -label:<PROCESSED_LABEL>`
- After a successful upload of at least one selected attachment, the message is modified to add `PROCESSED_LABEL`.
- Filenames look like: `YYYY-MM-DD_<subject>_partN_<originalBase>.pdf`

## Security notes

- Treat `GOOGLE_REFRESH_TOKEN` like a password. Never commit it.
- The cron route returns `401` unless the `Authorization: Bearer` header matches `CRON_SECRET`.
- OAuth scopes used: `gmail.modify` and `drive` (uploading into an arbitrary folder by id is much simpler with `drive` than the narrower `drive.file` scope).
