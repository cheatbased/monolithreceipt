export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1rem", fontFamily: "system-ui" }}>
      <h1>Billing invoices → Google Drive</h1>
      <p>This project runs on a schedule via Vercel Cron.</p>
      <ul>
        <li>
          Cron endpoint:{" "}
          <code>/api/cron/process-invoices</code>
        </li>
      </ul>
      <p>See README for OAuth setup and required environment variables.</p>
    </main>
  );
}
