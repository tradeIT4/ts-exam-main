import type { ExamDatabase } from "../database.js";
import type { RegistrationsSummaryData } from "../types.js";
import { calculatePercentageChange, getRegistrationComparisonWindows } from "../utils/dates.js";

export interface RegistrationQueryFilters {
  courseId?: string | undefined;
  courseType?: string | undefined;
  refDate?: Date | undefined;
}

export class RegistrationService {
  constructor(private db: ExamDatabase) {}

  getRegistrationsSummary(filters: RegistrationQueryFilters = {}): RegistrationsSummaryData {
    const refDate = filters.refDate ?? new Date();
    const windows = getRegistrationComparisonWindows(refDate);

    const whereClauses: string[] = [];
    const params: Record<string, string> = {
      wCurrFrom: windows.weekly.current.from,
      wCurrTo: windows.weekly.current.to,
      wPrevFrom: windows.weekly.previous.from,
      wPrevTo: windows.weekly.previous.to,
      mCurrFrom: windows.monthly.current.from,
      mCurrTo: windows.monthly.current.to,
      mPrevFrom: windows.monthly.previous.from,
      mPrevTo: windows.monthly.previous.to,
      yCurrFrom: windows.yearly.current.from,
      yCurrTo: windows.yearly.current.to,
      yPrevFrom: windows.yearly.previous.from,
      yPrevTo: windows.yearly.previous.to,
    };

    if (filters.courseId) {
      whereClauses.push("r.course_id = :courseId");
      params.courseId = filters.courseId;
    }
    if (filters.courseType) {
      whereClauses.push("c.type = :courseType");
      params.courseType = filters.courseType;
    }

    const joinClause = filters.courseType ? " JOIN courses c ON c.id = r.course_id" : "";
    const whereSql = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT
        COALESCE(SUM(CASE WHEN r.registered_at >= :wCurrFrom AND r.registered_at <= :wCurrTo THEN 1 ELSE 0 END), 0) AS week_curr,
        COALESCE(SUM(CASE WHEN r.registered_at >= :wPrevFrom AND r.registered_at <= :wPrevTo THEN 1 ELSE 0 END), 0) AS week_prev,
        COALESCE(SUM(CASE WHEN r.registered_at >= :mCurrFrom AND r.registered_at <= :mCurrTo THEN 1 ELSE 0 END), 0) AS month_curr,
        COALESCE(SUM(CASE WHEN r.registered_at >= :mPrevFrom AND r.registered_at <= :mPrevTo THEN 1 ELSE 0 END), 0) AS month_prev,
        COALESCE(SUM(CASE WHEN r.registered_at >= :yCurrFrom AND r.registered_at <= :yCurrTo THEN 1 ELSE 0 END), 0) AS year_curr,
        COALESCE(SUM(CASE WHEN r.registered_at >= :yPrevFrom AND r.registered_at <= :yPrevTo THEN 1 ELSE 0 END), 0) AS year_prev
      FROM registrations r
      ${joinClause}
      ${whereSql}
    `;

    const row = this.db.prepare(query).get(params) as {
      week_curr: number;
      week_prev: number;
      month_curr: number;
      month_prev: number;
      year_curr: number;
      year_prev: number;
    } | undefined;

    const weekCurr = row?.week_curr ?? 0;
    const weekPrev = row?.week_prev ?? 0;
    const monthCurr = row?.month_curr ?? 0;
    const monthPrev = row?.month_prev ?? 0;
    const yearCurr = row?.year_curr ?? 0;
    const yearPrev = row?.year_prev ?? 0;

    return {
      weekly: {
        current: weekCurr,
        previous: weekPrev,
        change_percentage: calculatePercentageChange(weekCurr, weekPrev),
      },
      monthly: {
        current: monthCurr,
        previous: monthPrev,
        change_percentage: calculatePercentageChange(monthCurr, monthPrev),
      },
      yearly: {
        current: yearCurr,
        previous: yearPrev,
        change_percentage: calculatePercentageChange(yearCurr, yearPrev),
      },
    };
  }
}
