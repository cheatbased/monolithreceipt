import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

export type Gmail = gmail_v1.Gmail;

/** Create OAuth2 client for user credentials (production + local scripts). */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  const redirectUriOrDefault = redirectUri ?? "http://127.0.0.1:42813/oauth2callback";

  return new google.auth.OAuth2(clientId, clientSecret, redirectUriOrDefault);
}

export function setCredentialsFromRefreshToken(oauth2: ReturnType<typeof createOAuth2Client>) {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Missing GOOGLE_REFRESH_TOKEN");
  }
  oauth2.setCredentials({ refresh_token: refreshToken });
}

export function gmailClient(oauth2: ReturnType<typeof createOAuth2Client>): Gmail {
  return google.gmail({ version: "v1", auth: oauth2 });
}

export function driveClient(oauth2: ReturnType<typeof createOAuth2Client>) {
  return google.drive({ version: "v3", auth: oauth2 });
}
