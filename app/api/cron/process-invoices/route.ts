import { NextResponse, type NextRequest } from "next/server";
import { createOAuth2Client, setCredentialsFromRefreshToken } from "@/lib/google-clients";
import { processInvoices } from "@/lib/process-invoices";

export const dynamic = "force-dynamic";

// On Vercel Pro and above you can raise this (Hobby has a low default limit).
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // During local/dev without cron secret configured, deny by default unless explicitly allowed.
  if (!expected) return false;

  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return Boolean(match?.[1] && match[1] === expected);
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const oauth2 = createOAuth2Client();
    setCredentialsFromRefreshToken(oauth2);
    const summary = await processInvoices({ oauth2 });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
