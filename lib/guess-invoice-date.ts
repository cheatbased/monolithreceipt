/** Heuristic invoice / document date from OCR or embedded PDF text (not legal/financial advice — tune for your vendors). */

const FR_MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  february: 1,
  février: 1,
  mars: 2,
  march: 2,
  avril: 3,
  april: 3,
  mai: 4,
  may: 4,
  juin: 5,
  june: 5,
  juillet: 6,
  july: 6,
  aout: 7,
  août: 7,
  august: 7,
  septembre: 8,
  september: 8,
  octobre: 9,
  october: 9,
  novembre: 10,
  november: 10,
  decembre: 11,
  décembre: 11,
  december: 11,
};

function utcDate(y: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(y, monthIndex0, day, 12, 0, 0, 0));
}

function withinReasonableWindow(candidate: Date, emailDate: Date): boolean {
  const min = new Date(emailDate);
  min.setUTCDate(min.getUTCDate() - 800); // ~27 months back
  const max = new Date(emailDate);
  max.setUTCDate(max.getUTCDate() + 14); // small forward tolerance
  return candidate >= min && candidate <= max;
}

function collectMatches(text: string): Date[] {
  const normalized = text.replace(/\u00a0/g, " ").slice(0, 50000);
  const lower = normalized.toLowerCase();
  const out: Date[] = [];

  // yyyy-mm-dd
  const isoRe = /\b(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(lower)) !== null) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(utcDate(y, mo - 1, d));
  }

  // dd/mm/yyyy or dd-mm-yyyy (assume day first when first token > 12)
  const dmyRe = /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|19\d{2})\b/g;
  while ((m = dmyRe.exec(lower)) !== null) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) out.push(utcDate(y, month - 1, day));
  }

  // 15 janvier 2026
  const frRe = /\b(\d{1,2})\s+([a-zéûîôùçêâè]+)\s+(20\d{2}|19\d{2})\b/gi;
  while ((m = frRe.exec(lower)) !== null) {
    const day = Number(m[1]);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const y = Number(m[3]);
    const idx = FR_MONTHS[monKey];
    if (idx !== undefined && day >= 1 && day <= 31) out.push(utcDate(y, idx, day));
  }

  return out;
}

/**
 * Picks the latest plausible document date before/on the email date window.
 */

export function guessInvoiceDate(text: string, emailReceived: Date): Date | null {
  const hits = collectMatches(text);
  const filtered = hits.filter((d) => withinReasonableWindow(d, emailReceived));
  if (!filtered.length) return null;

  const emailMs = emailReceived.getTime();
  const notAfterEmail = filtered.filter((d) => d.getTime() <= emailMs + 2 * 24 * 3600 * 1000);

  const pool = notAfterEmail.length ? notAfterEmail : filtered;
  return pool.reduce<Date | null>((acc, d) => (!acc || d.getTime() > acc.getTime() ? d : acc), null);
}
