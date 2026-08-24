import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createDatabase, type ExamDatabase } from "./database.js";
import { examReport, paginatedRows, registrationReport } from "./reports.js";
import { httpError, isoDate, numberInRange, optionalString, parseFilters, readJson, requiredString } from "./validation.js";
import type { ApiError } from "./types.js";

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function paging(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isInteger(page) || page < 1) throw httpError(400, "page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, "limit must be between 1 and 100");
  return { page, limit };
}

function row(db: ExamDatabase, sql: string, id: string) {
  return db.prepare(sql).get({ id });
}

export function createApp(db: ExamDatabase = createDatabase()) {
  return async function app(request: IncomingMessage, response: ServerResponse) {
    const origin = request.headers.origin;
    const allowed = (process.env.ALLOWED_ORIGINS ?? "*").split(",").map((item) => item.trim());
    const corsOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : "";
    if (corsOrigin) response.setHeader("access-control-allow-origin", corsOrigin);
    response.setHeader("access-control-allow-headers", "content-type,x-api-key");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("vary", "Origin");

    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    if (process.env.API_KEY && request.headers["x-api-key"] !== process.env.API_KEY) {
      send(response, 401, { error: { message: "A valid X-API-Key header is required" } }); return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        send(response, 200, { status: "ok", timestamp: new Date().toISOString() }); return;
      }

      if (method === "POST" && url.pathname === "/api/v1/courses") {
        const body = await readJson(request);
        const course = { id: randomUUID(), name: requiredString(body, "name"), type: requiredString(body, "type"), code: requiredString(body, "code").toUpperCase(), createdAt: new Date().toISOString() };
        db.prepare("INSERT INTO courses (id,name,type,code,created_at) VALUES (:id,:name,:type,:code,:createdAt)").run(course);
        send(response, 201, course); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/courses") {
        const type = url.searchParams.get("type");
        const courses = type
          ? db.prepare("SELECT id,name,type,code,created_at AS createdAt FROM courses WHERE type = ? ORDER BY name").all(type)
          : db.prepare("SELECT id,name,type,code,created_at AS createdAt FROM courses ORDER BY name").all();
        send(response, 200, { data: courses }); return;
      }

      if (method === "POST" && url.pathname === "/api/v1/registrations") {
        const body = await readJson(request);
        const registration = {
          id: randomUUID(), studentId: requiredString(body, "studentId"), studentName: requiredString(body, "studentName"),
          email: requiredString(body, "email").toLowerCase(), phone: optionalString(body, "phone"), courseId: requiredString(body, "courseId"),
          registeredAt: isoDate(body.registeredAt, "registeredAt"),
        };
        db.prepare("INSERT INTO registrations (id,student_id,student_name,email,phone,course_id,registered_at) VALUES (:id,:studentId,:studentName,:email,:phone,:courseId,:registeredAt)").run(registration);
        send(response, 201, registration); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/registrations") {
        const filters = parseFilters(url); const { page, limit } = paging(url);
        send(response, 200, paginatedRows(db, "registrations", filters, page, limit)); return;
      }

      if (method === "POST" && url.pathname === "/api/v1/exam-results") {
        const body = await readJson(request);
        const score = numberInRange(body, "score"); const passMark = numberInRange(body, "passMark", 50);
        const result = {
          id: randomUUID(), studentId: requiredString(body, "studentId"), courseId: requiredString(body, "courseId"), score,
          passMark, status: score >= passMark ? "passed" : "failed", takenAt: isoDate(body.takenAt, "takenAt"),
        };
        db.prepare("INSERT INTO exam_results (id,student_id,course_id,score,pass_mark,status,taken_at) VALUES (:id,:studentId,:courseId,:score,:passMark,:status,:takenAt)").run(result);
        send(response, 201, result); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/exam-results") {
        const filters = parseFilters(url); const { page, limit } = paging(url);
        send(response, 200, paginatedRows(db, "exam_results", filters, page, limit)); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/reports/exams") {
        send(response, 200, { filters: parseFilters(url), ...examReport(db, parseFilters(url)) }); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/reports/registrations") {
        send(response, 200, { filters: parseFilters(url), ...registrationReport(db, parseFilters(url)) }); return;
      }

      if (method === "GET" && url.pathname === "/api/v1/dashboard") {
        const filters = parseFilters(url);
        send(response, 200, { filters, exams: examReport(db, filters), registrations: registrationReport(db, filters) }); return;
      }

      send(response, 404, { error: { message: "Route not found" } });
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      const conflict = apiError.code?.startsWith("SQLITE_CONSTRAINT");
      const status = conflict ? 409 : apiError.statusCode ?? 500;
      send(response, status, { error: { message: conflict ? "The record conflicts with existing data or references a missing course" : status === 500 ? "Internal server error" : apiError.message, ...(apiError.details === undefined ? {} : { details: apiError.details }) } });
      if (status === 500) console.error(error);
    }
  };
}
