/**
 * Prints which Google account your refresh token uses and whether Drive can access GOOGLE_DRIVE_FOLDER_ID.
 * Usage: npm run google-diag
 */

import process from "node:process";
import { google } from "googleapis";

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "http://127.0.0.1:42813/oauth2callback";
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const gmailApi = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmailApi.users.getProfile({ userId: "me" });

  console.log("\nOAuth is using this Gmail / Google account:");
  console.log("  ", profile.data.emailAddress);
  console.log("\nAnything you upload MUST be in a Drive folder this account can open (same account,");
  console.log("or folder shared with this email). Chrome /u/0 /u/1 /u/2 does not affect the API.\n");

  if (!folderId) {
    console.log("GOOGLE_DRIVE_FOLDER_ID is empty — set it in .env");
    process.exitCode = 1;
    return;
  }

  const driveApi = google.drive({ version: "v3", auth: oauth2 });

  try {
    const meta = await driveApi.files.get({
      fileId: folderId,
      fields: "id,name,mimeType,driveId,shortcutDetails",
      supportsAllDrives: true,
    });
    console.log("Drive folder is reachable with this OAuth token:");
    console.log("  ", meta.data.name ?? "(no name)");
    console.log("  ", meta.data.id);
    if (meta.data.mimeType === "application/vnd.google-apps.shortcut" && meta.data.shortcutDetails?.targetId) {
      console.log("\n  Note: That ID points to a Drive shortcut.");
      console.log("  Shortcut target id:", meta.data.shortcutDetails.targetId);
      console.log("  Try GOOGLE_DRIVE_FOLDER_ID=", meta.data.shortcutDetails.targetId, "instead.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Drive CANNOT access GOOGLE_DRIVE_FOLDER_ID:", folderId);
    console.error("  ", msg.replace(/\s+/g, " ").slice(0, 500));
    console.error("\nFix:");
    console.error("  • Log into Gmail as ONLY:", profile.data.emailAddress);
    console.error('  • Use Drive → New → Folder there, copy THAT folder\'s URL id; or share your folder with THAT email.');
    process.exitCode = 1;
  }
}

await main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
