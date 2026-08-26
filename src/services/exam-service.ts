import type { ExamDatabase } from "../database.js";
import type { CourseExamSummaryItem, ExamSummaryData, PaginationMeta, Period } from "../types.js";
import { formatDateOnly, getPeriodBounds } from "../utils/dates.js";

export interface ExamQueryFilters {
  period?: Period | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  courseId?: string | undefined;
  courseType?: string | undefined;
  status?: "passed" | "failed" | undefined;
}

export class ExamService {
  constructor(private db: ExamDatabase) {}

  getExamSummary(filters: ExamQueryFilters = {}, refDate: Date = new Date()): {
    period?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    data: ExamSummaryData;
  } {
    let fromDate = filters.fromDate;
    let toDate = filters.toDate;

    if (filters.period && (!fromDate || !toDate)) {
      const bounds = getPeriodBounds(filters.period, refDate);
      fromDate = fromDate ?? bounds.fromDate;
      toDate = toDate ?? bounds.toDate;
    }

    const whereClauses: string[] = [];
    const params: Record<string, string | number> = {};

    if (filters.courseId) {
      whereClauses.push("er.course_id = :courseId");
      params.courseId = filters.courseId;
    }
    if (filters.courseType) {
      whereClauses.push("c.type = :courseType");
      params.courseType = filters.courseType;
    }
    if (filters.status) {
      whereClauses.push("er.status = :status");
      params.status = filters.status;
    }
    if (fromDate) {
      whereClauses.push("er.taken_at >= :fromDate");
      params.fromDate = fromDate;
    }
    if (toDate) {
      whereClauses.push("er.taken_at <= :toDate");
      params.toDate = toDate;
    }

    const whereSql = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT
        COUNT(*) AS total_attempts,
        COUNT(DISTINCT er.course_id) AS total_exams,
        COUNT(DISTINCT er.student_id) AS unique_students,
        COALESCE(SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END), 0) AS passed,
        COALESCE(SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        ROUND(AVG(er.score), 2) AS average_score
      FROM exam_results er
      JOIN courses c ON c.id = er.course_id
      ${whereSql}
    `;

    const row = this.db.prepare(query).get(params) as {
      total_attempts: number;
      total_exams: number;
      unique_students: number;
      passed: number;
      failed: number;
      average_score: number | null;
    } | undefined;

    const totalAttempts = row?.total_attempts ?? 0;
    const passed = row?.passed ?? 0;
    const failed = row?.failed ?? 0;
    const totalExams = row?.total_exams ?? 0;

    const passRate = totalAttempts > 0 ? Number(((passed / totalAttempts) * 100).toFixed(2)) : 0;
    const failRate = totalAttempts > 0 ? Number(((failed / totalAttempts) * 100).toFixed(2)) : 0;

    return {
      period: filters.period,
      fromDate,
      toDate,
      data: {
        total_exams: totalExams,
        students_taken: totalAttempts,
        passed,
        failed,
        pass_rate: passRate,
        fail_rate: failRate,
        average_score: row?.average_score ?? null,
      },
    };
  }

  getExamsByCourse(
    filters: ExamQueryFilters = {},
    page = 1,
    perPage = 50,
    refDate: Date = new Date(),
  ): {
    data: CourseExamSummaryItem[];
    pagination: PaginationMeta;
  } {
    let fromDate = filters.fromDate;
    let toDate = filters.toDate;

    if (filters.period && (!fromDate || !toDate)) {
      const bounds = getPeriodBounds(filters.period, refDate);
      fromDate = fromDate ?? bounds.fromDate;
      toDate = toDate ?? bounds.toDate;
    }

    const whereClauses: string[] = [];
    const params: Record<string, string | number> = {};

    if (filters.courseId) {
      whereClauses.push("er.course_id = :courseId");
      params.courseId = filters.courseId;
    }
    if (filters.courseType) {
      whereClauses.push("c.type = :courseType");
      params.courseType = filters.courseType;
    }
    if (filters.status) {
      whereClauses.push("er.status = :status");
      params.status = filters.status;
    }
    if (fromDate) {
      whereClauses.push("er.taken_at >= :fromDate");
      params.fromDate = fromDate;
    }
    if (toDate) {
      whereClauses.push("er.taken_at <= :toDate");
      params.toDate = toDate;
    }

    const whereSql = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";

    // Count distinct course/date groups
    const countQuery = `
      SELECT COUNT(*) AS total_groups FROM (
        SELECT c.id, substr(er.taken_at, 1, 10) AS exam_date
        FROM exam_results er
        JOIN courses c ON c.id = er.course_id
        ${whereSql}
        GROUP BY c.id, substr(er.taken_at, 1, 10)
      )
    `;
    const countRow = this.db.prepare(countQuery).get(params) as { total_groups: number } | undefined;
    const total = countRow?.total_groups ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
    const offset = (page - 1) * perPage;

    const dataQuery = `
      SELECT
        c.id AS course_id,
        c.name AS course_name,
        c.code AS course_code,
        substr(er.taken_at, 1, 10) AS exam_date,
        COUNT(*) AS students_taken,
        COALESCE(SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END), 0) AS passed,
        COALESCE(SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        ROUND(100.0 * SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS pass_rate,
        ROUND(100.0 * SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS fail_rate
      FROM exam_results er
      JOIN courses c ON c.id = er.course_id
      ${whereSql}
      GROUP BY c.id, c.name, c.code, substr(er.taken_at, 1, 10)
      ORDER BY exam_date DESC, students_taken DESC, c.name ASC
      LIMIT :limit OFFSET :offset
    `;

    const rows = this.db.prepare(dataQuery).all({ ...params, limit: perPage, offset }) as Array<{
      course_id: string;
      course_name: string;
      course_code: string;
      exam_date: string;
      students_taken: number;
      passed: number;
      failed: number;
      pass_rate: number;
      fail_rate: number;
    }>;

    const data: CourseExamSummaryItem[] = rows.map((r) => ({
      course_id: r.course_id,
      course_name: r.course_name,
      course_code: r.course_code,
      exam_date: r.exam_date,
      students_taken: r.students_taken,
      passed: r.passed,
      failed: r.failed,
      pass_rate: r.pass_rate ?? 0,
      fail_rate: r.fail_rate ?? 0,
    }));

    return {
      data,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  }
}
