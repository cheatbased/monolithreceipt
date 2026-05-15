import http from "node:http";
import { URL } from "node:url";
import process from "node:process";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive",
];

const PORT = 42813;
const REDIRECT_PATH = "/oauth2callback";
const REDIRECT_URI = `http://127.0.0.1:${PORT}${REDIRECT_PATH}`;

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function parseCodeFromRedirect(url) {
  const u = new URL(url, REDIRECT_URI);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  return { code, err };
}

async function main() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith(REDIRECT_PATH)) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const { code, err } = parseCodeFromRedirect(req.url);
        res.setHeader("content-type", "text/plain; charset=utf-8");

        if (err) {
          res.writeHead(400);
          res.end(`OAuth error from Google: ${err}`);
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("Missing ?code=");
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        res.writeHead(200);
        res.end(
          [
            "Success (this window is safe to close).",
            "",
            tokens.refresh_token
              ? "Check your terminal for GOOGLE_REFRESH_TOKEN."
              : "No refresh_token returned. Revoke app access in your Google account and retry with prompt=consent.",
            "",
          ].join("\n"),
        );

        if (tokens.refresh_token) {
          process.stdout.write("\nGOOGLE_REFRESH_TOKEN (copy into Vercel env vars):\n\n");
          process.stdout.write(`${tokens.refresh_token}\n\n`);
        }

        server.close(resolve);
      } catch (e) {
        res.writeHead(500);
        res.end(e instanceof Error ? e.message : String(e));
        server.close(() => reject(e));
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      process.stderr.write(`Listening on ${REDIRECT_URI}\n\n`);
      process.stderr.write("Open this URL in your browser:\n\n");
      process.stderr.write(`${authorizeUrl}\n\n`);
    });
  });
}

await main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
