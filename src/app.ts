import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createDatabase, type ExamDatabase } from "./database.js";
import { examReport, paginatedRows, registrationReport } from "./reports.js";
import { httpError, isoDate, numberInRange, optionalString, parseFilters, readJson, requiredString } from "./validation.js";
import type { ApiError } from "./types.js";
import { ExamService } from "./services/exam-service.js";
import { RegistrationService } from "./services/registration-service.js";
import { DashboardService } from "./services/dashboard-service.js";
import { ClientService } from "./services/client-service.js";
import { ExamController } from "./controllers/exam-controller.js";
import { RegistrationController } from "./controllers/registration-controller.js";
import { DashboardController } from "./controllers/dashboard-controller.js";
import { createAuthMiddleware, extractApiToken, type AuthenticatedRequest } from "./middlewares/auth.js";
import { RateLimiter } from "./middlewares/rate-limiter.js";
import { createAuditLogger } from "./middlewares/audit-logger.js";
import { applySecurityHeaders } from "./middlewares/security.js";
import { sendError } from "./serializers/response.js";

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

const adminAssets = new Map<string, { file: string; contentType: string }>([
  ["/admin", { file: "data-analytics.html", contentType: "text/html; charset=utf-8" }],
  ["/admin/data-analytics", { file: "data-analytics.html", contentType: "text/html; charset=utf-8" }],
  ["/admin/data-analytics.css", { file: "data-analytics.css", contentType: "text/css; charset=utf-8" }],
  ["/admin/data-analytics.js", { file: "data-analytics.js", contentType: "text/javascript; charset=utf-8" }],
]);

function sendAdminAsset(response: ServerResponse, pathname: string): boolean {
  const asset = adminAssets.get(pathname);
  if (!asset) return false;

  const contents = readFileSync(resolve(process.cwd(), "public", "admin", asset.file));
  response.writeHead(200, {
    "content-type": asset.contentType,
    "cache-control": asset.file.endsWith(".html") ? "no-cache" : "public, max-age=3600",
  });
  response.end(contents);
  return true;
}

function paging(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isInteger(page) || page < 1) throw httpError(400, "page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, "limit must be between 1 and 100");
  return { page, limit };
}

export function createApp(db: ExamDatabase = createDatabase()) {
  const clientService = new ClientService(db);
  const examService = new ExamService(db);
  const registrationService = new RegistrationService(db);
  const dashboardService = new DashboardService(db);

  const examController = new ExamController(examService);
  const registrationController = new RegistrationController(registrationService);
  const dashboardController = new DashboardController(dashboardService);

  const authMiddleware = createAuthMiddleware(db, clientService);
  const rateLimiter = new RateLimiter();
  const auditLogger = createAuditLogger(db);

  return async function app(request: IncomingMessage, response: ServerResponse) {
    const startTime = performance.now();
    const req = request as AuthenticatedRequest;

    // Attach response finish listener for audit logging
    response.on("finish", () => {
      auditLogger(req, response, startTime);
    });

    // Apply security headers and handle OPTIONS preflight
    if (!applySecurityHeaders(request, response)) {
      return;
    }

    // Rate Limiting check
    if (!rateLimiter.check(req, response)) {
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";
      const pathname = url.pathname.replace(/\/$/, ""); // Normalize trailing slashes

      if (method === "GET" && (pathname === "/health" || pathname === "")) {
        send(response, 200, { status: "ok", timestamp: new Date().toISOString() });
        return;
      }

      if (method === "GET" && sendAdminAsset(response, pathname)) {
        return;
      }

      // Check authentication requirements
      const token = extractApiToken(request);
      const isThirdPartySummaryRoute =
        pathname === "/api/v1/exams/summary" ||
        pathname === "/api/v1/exams/by-course" ||
        pathname === "/api/v1/registrations/summary" ||
        pathname === "/api/v1/dashboard/summary";

      const requireAuth = Boolean(process.env.API_KEY || token || isThirdPartySummaryRoute);

      // --- New Third-Party Read-Only Summary Endpoints ---

      // 1. GET /api/v1/exams/summary
      if (method === "GET" && pathname === "/api/v1/exams/summary") {
        if (!authMiddleware(req, response, "read:exams")) return;
        examController.getExamSummary(req, response, url);
        return;
      }

      // 2. GET /api/v1/exams/by-course
      if (method === "GET" && pathname === "/api/v1/exams/by-course") {
        if (!authMiddleware(req, response, "read:exams")) return;
        examController.getExamsByCourse(req, response, url);
        return;
      }

      // 3. GET /api/v1/registrations/summary
      if (method === "GET" && pathname === "/api/v1/registrations/summary") {
        if (!authMiddleware(req, response, "read:registrations")) return;
        registrationController.getRegistrationsSummary(req, response, url);
        return;
      }

      // 4. GET /api/v1/dashboard/summary
      if (method === "GET" && pathname === "/api/v1/dashboard/summary") {
        if (!authMiddleware(req, response, "read:reports")) return;
        dashboardController.getDashboardSummary(req, response, url);
        return;
      }

      // --- Existing / Legacy Endpoints ---

      // If API_KEY is set or token passed to existing endpoints, verify auth
      if (process.env.API_KEY || token) {
        if (!authMiddleware(req, response)) return;
      }

      if (method === "POST" && pathname === "/api/v1/courses") {
        const body = await readJson(request);
        const course = {
          id: randomUUID(),
          name: requiredString(body, "name"),
          type: requiredString(body, "type"),
          code: requiredString(body, "code").toUpperCase(),
          createdAt: new Date().toISOString(),
        };
        db.prepare("INSERT INTO courses (id,name,type,code,created_at) VALUES (:id,:name,:type,:code,:createdAt)").run(course);
        send(response, 201, course);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/courses") {
        const type = url.searchParams.get("type");
        const courses = type
          ? db.prepare("SELECT id,name,type,code,created_at AS createdAt FROM courses WHERE type = ? ORDER BY name").all(type)
          : db.prepare("SELECT id,name,type,code,created_at AS createdAt FROM courses ORDER BY name").all();
        send(response, 200, { data: courses });
        return;
      }

      if (method === "POST" && pathname === "/api/v1/registrations") {
        const body = await readJson(request);
        const registration = {
          id: randomUUID(),
          studentId: requiredString(body, "studentId"),
          studentName: requiredString(body, "studentName"),
          email: requiredString(body, "email").toLowerCase(),
          phone: optionalString(body, "phone"),
          courseId: requiredString(body, "courseId"),
          registeredAt: isoDate(body.registeredAt, "registeredAt"),
        };
        db.prepare("INSERT INTO registrations (id,student_id,student_name,email,phone,course_id,registered_at) VALUES (:id,:studentId,:studentName,:email,:phone,:courseId,:registeredAt)").run(registration);
        send(response, 201, registration);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/registrations") {
        const filters = parseFilters(url);
        const { page, limit } = paging(url);
        send(response, 200, paginatedRows(db, "registrations", filters, page, limit));
        return;
      }

      if (method === "POST" && pathname === "/api/v1/exam-results") {
        const body = await readJson(request);
        const score = numberInRange(body, "score");
        const passMark = numberInRange(body, "passMark", 50);
        const result = {
          id: randomUUID(),
          studentId: requiredString(body, "studentId"),
          courseId: requiredString(body, "courseId"),
          score,
          passMark,
          status: score >= passMark ? "passed" : "failed",
          takenAt: isoDate(body.takenAt, "takenAt"),
        };
        db.prepare("INSERT INTO exam_results (id,student_id,course_id,score,pass_mark,status,taken_at) VALUES (:id,:studentId,:courseId,:score,:passMark,:status,:takenAt)").run(result);
        send(response, 201, result);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/exam-results") {
        const filters = parseFilters(url);
        const { page, limit } = paging(url);
        send(response, 200, paginatedRows(db, "exam_results", filters, page, limit));
        return;
      }

      if (method === "GET" && pathname === "/api/v1/reports/exams") {
        send(response, 200, { filters: parseFilters(url), ...examReport(db, parseFilters(url)) });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/reports/registrations") {
        send(response, 200, { filters: parseFilters(url), ...registrationReport(db, parseFilters(url)) });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/dashboard") {
        const filters = parseFilters(url);
        send(response, 200, { filters, exams: examReport(db, filters), registrations: registrationReport(db, filters) });
        return;
      }

      sendError(response, 404, "Route not found");
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      const conflict = apiError.code?.startsWith("SQLITE_CONSTRAINT");
      const status = conflict ? 409 : apiError.statusCode ?? 500;
      const message = conflict
        ? "The record conflicts with existing data or references a missing course"
        : status === 500
        ? "Internal server error"
        : apiError.message;

      // Maintain backward compatible error response for legacy tests while supporting structured errors
      if (apiError.errors) {
        sendError(response, status, message, apiError.errors);
      } else {
        send(response, status, {
          error: {
            message,
            ...(apiError.details === undefined ? {} : { details: apiError.details }),
          },
        });
      }

      if (status === 500) {
        console.error(error);
      }
    }
  };
}
