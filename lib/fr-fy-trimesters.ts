/**
 * Fiscal-year French quarter layout (FY starts April, ends March).
 */

export type FrTrimesterRouting = {
  trimestre: 1 | 2 | 3 | 4;
  trimestreFolder: string;
  monthFolder: string;
};

export type FyLeafCounterStyle = "fiscal_year_index" | "quarter_slot";

export type FrTrimesterNaming = {
  timeZone: string;
  trimestreFolderTemplate: string;
  monthLeafFolderTemplate: string;
  /** fiscal_year_index — 1(AVRIL)…12(MARS) ; quarter_slot — restart 1…3 each trimestre */
  leafCounterStyle: FyLeafCounterStyle;
};

export const MONTH_NAME_FR_UPPER: Record<number, string> = {
  1: "JANVIER",
  2: "FEVRIER",
  3: "MARS",
  4: "AVRIL",
  5: "MAI",
  6: "JUIN",
  7: "JUILLET",
  8: "AOUT",
  9: "SEPTEMBRE",
  10: "OCTOBRE",
  11: "NOVEMBRE",
  12: "DECEMBRE",
};

function calendarMonthNumberInTz(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    month: "numeric",
    year: "numeric",
    day: "numeric",
  }).formatToParts(date);

  let month = "";
  for (const p of parts) {
    if (p.type === "month") month = p.value;
  }

  const m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`Could not derive calendar month in "${timeZone}"`);
  }

  return m;
}

function quarterAndSlot(month1to12: number): { trimestre: 1 | 2 | 3 | 4; slot: number } {
  let trimestre: 1 | 2 | 3 | 4;
  let slot: number;

  if (month1to12 >= 4 && month1to12 <= 6) {
    trimestre = 1;
    slot = month1to12 - 3;
  } else if (month1to12 >= 7 && month1to12 <= 9) {
    trimestre = 2;
    slot = month1to12 - 6;
  } else if (month1to12 >= 10 && month1to12 <= 12) {
    trimestre = 3;
    slot = month1to12 - 9;
  } else {
    trimestre = 4;
    slot = month1to12;
  }

  return { trimestre, slot };
}

function fiscalYearMonthIndex(month1to12: number): number {
  const map: Record<number, number> = {
    4: 1,
    5: 2,
    6: 3,
    7: 4,
    8: 5,
    9: 6,
    10: 7,
    11: 8,
    12: 9,
    1: 10,
    2: 11,
    3: 12,
  };

  const idx = map[month1to12];
  if (idx === undefined) {
    throw new Error(`No FY index for calendar month ${month1to12}`);
  }

  return idx;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

export function buildFrenchFiscalTrimesterPath(date: Date, naming: FrTrimesterNaming): FrTrimesterRouting {
  const calendarMonth = calendarMonthNumberInTz(date, naming.timeZone);
  const { trimestre, slot } = quarterAndSlot(calendarMonth);
  const monthUpper = MONTH_NAME_FR_UPPER[calendarMonth];
  if (!monthUpper) {
    throw new Error(`Unhandled calendar month (${calendarMonth})`);
  }

  const leafNumber =
    naming.leafCounterStyle === "quarter_slot" ? slot : fiscalYearMonthIndex(calendarMonth);

  const trimFolder = interpolate(naming.trimestreFolderTemplate, { t: String(trimestre) });
  const monthFolder = interpolate(naming.monthLeafFolderTemplate, {
    t: String(trimestre),
    n: String(leafNumber),
    MONTH_FR: monthUpper,
  });

  return { trimestre, trimestreFolder: trimFolder, monthFolder };
}
