/** Resolve Drive month subfolders from Gmail internalDate (epoch ms string). */

export type MonthFolderStyle = "yyyy-mm" | "long";

export type MonthFolderFormatting = {
  style: MonthFolderStyle;
  timeZone: string;
  locale: string;
};

export function messageDateFromInternalMs(internalMs?: string | null): Date {
  const n = internalMs ? Number(internalMs) : NaN;
  const ms = Number.isFinite(n) ? n : Date.now();
  return new Date(ms);
}

export function driveMonthFolderTitle(date: Date, opts: MonthFolderFormatting): string {
  if (opts.style === "long") {
    return new Intl.DateTimeFormat(opts.locale, {
      timeZone: opts.timeZone,
      month: "long",
      year: "numeric",
    }).format(date);
  }

  return yyyyMmInTimeZone(date, opts.timeZone);
}

/** yyyy-MM label in `timeZone` (sort-friendly in Drive lists). */

function yyyyMmInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  let year = "";
  let month = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    if (p.type === "month") month = p.value;
  }

  const monthDigits = /^[0-9]{1,2}$/.test(month ?? "") ? String(Number(month)).padStart(2, "0") : month;
  if (!year || !monthDigits) {
    throw new Error(`Could not build yyyy-MM folder title for "${timeZone}"`);
  }

  return `${year}-${monthDigits}`;
}
