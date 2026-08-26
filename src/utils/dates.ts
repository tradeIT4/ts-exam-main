import type { Period } from "../types.js";

export function parseDateInput(value: string | undefined | null, isEndOfDay = false): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Check if standard YYYY-MM-DD
  const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (ymdRegex.test(trimmed)) {
    const timePart = isEndOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const parsed = new Date(`${trimmed}${timePart}`);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function formatDateOnly(isoString: string): string {
  return isoString.split("T")[0] ?? isoString;
}

export function getPeriodBounds(period: Period, ref: Date = new Date()): { fromDate: string; toDate: string } {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth(); // 0-11
  const date = ref.getUTCDate();

  switch (period) {
    case "today":
    case "daily": {
      const from = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      const to = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));
      return { fromDate: from.toISOString(), toDate: to.toISOString() };
    }
    case "weekly": {
      // Find Monday of the current week (ISO 8601: Mon=1 ... Sun=7)
      const day = ref.getUTCDay(); // 0 (Sun) to 6 (Sat)
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(Date.UTC(year, month, date + diffToMonday, 0, 0, 0, 0));
      const sunday = new Date(Date.UTC(year, month, date + diffToMonday + 6, 23, 59, 59, 999));
      return { fromDate: monday.toISOString(), toDate: sunday.toISOString() };
    }
    case "monthly": {
      const firstDay = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
      return { fromDate: firstDay.toISOString(), toDate: lastDay.toISOString() };
    }
    case "quarterly": {
      const quarter = Math.floor(month / 3);
      const firstDay = new Date(Date.UTC(year, quarter * 3, 1, 0, 0, 0, 0));
      const lastDay = new Date(Date.UTC(year, (quarter + 1) * 3, 0, 23, 59, 59, 999));
      return { fromDate: firstDay.toISOString(), toDate: lastDay.toISOString() };
    }
    case "yearly": {
      const firstDay = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const lastDay = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      return { fromDate: firstDay.toISOString(), toDate: lastDay.toISOString() };
    }
  }
}

export function getRegistrationComparisonWindows(ref: Date = new Date()) {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const date = ref.getUTCDate();

  // Weekly: Monday to Sunday
  const day = ref.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const currentWeekStart = new Date(Date.UTC(year, month, date + diffToMonday, 0, 0, 0, 0));
  const currentWeekEnd = new Date(Date.UTC(year, month, date + diffToMonday + 6, 23, 59, 59, 999));

  const prevWeekStart = new Date(Date.UTC(year, month, date + diffToMonday - 7, 0, 0, 0, 0));
  const prevWeekEnd = new Date(Date.UTC(year, month, date + diffToMonday - 1, 23, 59, 59, 999));

  // Monthly:
  const currentMonthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const currentMonthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const prevMonthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Yearly:
  const currentYearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const currentYearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const prevYearStart = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
  const prevYearEnd = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));

  return {
    weekly: {
      current: { from: currentWeekStart.toISOString(), to: currentWeekEnd.toISOString() },
      previous: { from: prevWeekStart.toISOString(), to: prevWeekEnd.toISOString() },
    },
    monthly: {
      current: { from: currentMonthStart.toISOString(), to: currentMonthEnd.toISOString() },
      previous: { from: prevMonthStart.toISOString(), to: prevMonthEnd.toISOString() },
    },
    yearly: {
      current: { from: currentYearStart.toISOString(), to: currentYearEnd.toISOString() },
      previous: { from: prevYearStart.toISOString(), to: prevYearEnd.toISOString() },
    },
  };
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100.0 : 0.0;
  }
  const change = ((current - previous) / previous) * 100;
  return Number(change.toFixed(2));
}
