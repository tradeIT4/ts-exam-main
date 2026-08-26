import type { ExamDatabase } from "./database.js";
import type { Filters, Period } from "./types.js";

type SqlParams = Record<string, string | number>;

const periodExpression: Record<Period, string> = {
  daily: "strftime('%Y-%m-%d', {date})",
  weekly: "strftime('%Y-W%W', {date})",
  monthly: "strftime('%Y-%m', {date})",
  quarterly: "printf('%s-Q%d', strftime('%Y', {date}), ((CAST(strftime('%m', {date}) AS INTEGER) - 1) / 3) + 1)",
  yearly: "strftime('%Y', {date})",
};

function clauses(filters: Filters, dateColumn: string, includeStatus: boolean) {
  const where: string[] = [];
  const params: SqlParams = {};
  if (filters.courseId) { where.push("c.id = :courseId"); params.courseId = filters.courseId; }
  if (filters.courseType) { where.push("c.type = :courseType"); params.courseType = filters.courseType; }
  if (includeStatus && filters.status) { where.push("er.status = :status"); params.status = filters.status; }
  if (filters.from) { where.push(`${dateColumn} >= :from`); params.from = filters.from; }
  if (filters.to) { where.push(`${dateColumn} <= :to`); params.to = filters.to; }
  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params };
}

export function examReport(db: ExamDatabase, filters: Filters) {
  const filter = clauses(filters, "er.taken_at", true);
  const totals = db.prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT er.student_id) AS uniqueStudents,
      SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END) AS failed,
      ROUND(AVG(er.score), 2) AS averageScore
    FROM exam_results er JOIN courses c ON c.id = er.course_id${filter.sql}
  `).get(filter.params) as Record<string, number | null>;
  const byCourse = db.prepare(`
    SELECT c.id AS courseId, c.code AS courseCode, c.name AS courseName, c.type AS courseType,
      COUNT(*) AS total, COUNT(DISTINCT er.student_id) AS uniqueStudents,
      SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END) AS failed,
      ROUND(100.0 * SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS passRate
    FROM exam_results er JOIN courses c ON c.id = er.course_id${filter.sql}
    GROUP BY c.id ORDER BY total DESC, c.name
  `).all(filter.params);
  const result: Record<string, unknown> = {
    totals: {
      total: totals.total ?? 0,
      uniqueStudents: totals.uniqueStudents ?? 0,
      passed: totals.passed ?? 0,
      failed: totals.failed ?? 0,
      averageScore: totals.averageScore,
      passRate: totals.total ? Number((((totals.passed ?? 0) / totals.total) * 100).toFixed(2)) : 0,
    },
    byCourse,
  };
  if (filters.period) {
    const bucket = periodExpression[filters.period].replaceAll("{date}", "er.taken_at");
    result.timeline = db.prepare(`
      SELECT ${bucket} AS period, COUNT(*) AS total, COUNT(DISTINCT er.student_id) AS uniqueStudents,
        SUM(CASE WHEN er.status = 'passed' THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN er.status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM exam_results er JOIN courses c ON c.id = er.course_id${filter.sql}
      GROUP BY period ORDER BY period
    `).all(filter.params);
  }
  return result;
}

export function registrationReport(db: ExamDatabase, filters: Filters) {
  const filter = clauses(filters, "r.registered_at", false);
  const totals = db.prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT r.student_id) AS uniqueStudents
    FROM registrations r JOIN courses c ON c.id = r.course_id${filter.sql}
  `).get(filter.params) as { total: number; uniqueStudents: number };
  const byCourse = db.prepare(`
    SELECT c.id AS courseId, c.code AS courseCode, c.name AS courseName, c.type AS courseType,
      COUNT(*) AS registrations, COUNT(DISTINCT r.student_id) AS uniqueStudents
    FROM registrations r JOIN courses c ON c.id = r.course_id${filter.sql}
    GROUP BY c.id ORDER BY registrations DESC, c.name
  `).all(filter.params);
  const result: Record<string, unknown> = {
    total: totals.total,
    totalRegistrations: totals.total,
    uniqueStudents: totals.uniqueStudents,
    byCourse,
  };
  if (filters.period) {
    const bucket = periodExpression[filters.period].replaceAll("{date}", "r.registered_at");
    result.timeline = db.prepare(`
      SELECT ${bucket} AS period, COUNT(*) AS registrations, COUNT(DISTINCT r.student_id) AS uniqueStudents
      FROM registrations r JOIN courses c ON c.id = r.course_id${filter.sql}
      GROUP BY period ORDER BY period
    `).all(filter.params);
  }
  return result;
}

export function paginatedRows(
  db: ExamDatabase,
  table: "registrations" | "exam_results",
  filters: Filters,
  page: number,
  limit: number,
) {
  const registration = table === "registrations";
  const alias = registration ? "r" : "er";
  const date = registration ? "r.registered_at" : "er.taken_at";
  const filter = clauses(filters, date, !registration);
  const select = registration
    ? `r.id, r.student_id AS studentId, r.student_name AS studentName, r.email, r.phone,
       r.course_id AS courseId, r.registered_at AS registeredAt,
       c.name AS courseName, c.code AS courseCode, c.type AS courseType`
    : `er.id, er.student_id AS studentId, er.course_id AS courseId, er.score,
       er.pass_mark AS passMark, er.status, er.taken_at AS takenAt,
       c.name AS courseName, c.code AS courseCode, c.type AS courseType`;
  const count = db.prepare(`SELECT COUNT(*) AS total FROM ${table} ${alias} JOIN courses c ON c.id = ${alias}.course_id${filter.sql}`).get(filter.params) as { total: number };
  const rows = db.prepare(`SELECT ${select} FROM ${table} ${alias} JOIN courses c ON c.id = ${alias}.course_id${filter.sql} ORDER BY ${date} DESC LIMIT :limit OFFSET :offset`).all({ ...filter.params, limit, offset: (page - 1) * limit });
  return { data: rows, pagination: { page, limit, total: count.total, pages: Math.ceil(count.total / limit) } };
}
