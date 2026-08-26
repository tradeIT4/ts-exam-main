import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { ClientService } from "../src/services/client-service.js";

const db = createDatabase(":memory:");
const server = createServer(createApp(db));
const clientService = new ClientService(db);

let baseUrl = "";
let validToken = "";
let restrictedToken = "";
let revokedToken = "";
let ipRestrictedToken = "";
let expiredToken = "";
let courseId1 = "";
let courseId2 = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;

  // 1. Create API Clients for testing
  const client1 = clientService.createClient({
    name: "Full Access Partner",
    permissions: "read:all",
  });
  validToken = client1.apiKey;

  const client2 = clientService.createClient({
    name: "Exams Only Partner",
    permissions: "read:exams",
  });
  restrictedToken = client2.apiKey;

  const client3 = clientService.createClient({
    name: "Revoked Partner",
    permissions: "read:all",
  });
  revokedToken = client3.apiKey;
  clientService.revokeClient(client3.client.id);

  const client4 = clientService.createClient({
    name: "IP Restricted Partner",
    permissions: "read:all",
    allowedIps: "10.0.0.99", // not 127.0.0.1
  });
  ipRestrictedToken = client4.apiKey;

  const client5 = clientService.createClient({
    name: "Expired Partner",
    permissions: "read:all",
    expiresAt: "2020-01-01T00:00:00Z",
  });
  expiredToken = client5.apiKey;

  // 2. Populate test courses, registrations, and exam results
  const createCourse = (id: string, name: string, code: string, type: string) => {
    db.prepare("INSERT INTO courses (id, name, code, type, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id, name, code, type, "2026-01-01T00:00:00Z"
    );
  };
  courseId1 = "c-math-101";
  courseId2 = "c-comp-102";
  createCourse(courseId1, "Mathematics", "MATH101", "stem");
  createCourse(courseId2, "Computer Science", "CS102", "tech");

  // Populate registrations across different weeks/months/years relative to 2026-08-26
  // (2026-08-26 is a Wednesday: Current week is 2026-08-24 to 2026-08-30. Prev week is 2026-08-17 to 2026-08-23)
  const insertReg = (id: string, studentId: string, courseId: string, registeredAt: string) => {
    db.prepare("INSERT INTO registrations (id, student_id, student_name, email, course_id, registered_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, studentId, `Student ${studentId}`, `${studentId}@test.com`, courseId, registeredAt
    );
  };

  // 2 current week registrations
  insertReg("r-1", "s-1", courseId1, "2026-08-25T10:00:00Z");
  insertReg("r-2", "s-2", courseId1, "2026-08-26T11:00:00Z");

  // 1 previous week registration
  insertReg("r-3", "s-3", courseId2, "2026-08-18T10:00:00Z");

  // 1 previous month (July 2026) registration
  insertReg("r-4", "s-4", courseId1, "2026-07-15T10:00:00Z");

  // 1 previous year (2025) registration
  insertReg("r-5", "s-5", courseId2, "2025-06-10T10:00:00Z");

  // Populate exam results
  const insertExam = (id: string, studentId: string, courseId: string, score: number, passMark: number, takenAt: string) => {
    const status = score >= passMark ? "passed" : "failed";
    db.prepare("INSERT INTO exam_results (id, student_id, course_id, score, pass_mark, status, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, studentId, courseId, score, passMark, status, takenAt
    );
  };

  // Math course: 3 passed, 1 failed (taken 2026-08-24)
  insertExam("e-1", "s-1", courseId1, 85, 50, "2026-08-24T09:00:00Z");
  insertExam("e-2", "s-2", courseId1, 90, 50, "2026-08-24T09:00:00Z");
  insertExam("e-3", "s-3", courseId1, 75, 50, "2026-08-24T09:00:00Z");
  insertExam("e-4", "s-4", courseId1, 40, 50, "2026-08-24T09:00:00Z");

  // CS course: 1 passed, 1 failed (taken 2026-08-25)
  insertExam("e-5", "s-5", courseId2, 60, 50, "2026-08-25T14:00:00Z");
  insertExam("e-6", "s-6", courseId2, 35, 50, "2026-08-25T14:00:00Z");
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
});

test("Authentication & Authorization: rejects missing, invalid, expired, revoked and IP-restricted tokens", async () => {
  // 1. Missing token
  const noTokenRes = await fetch(`${baseUrl}/api/v1/exams/summary`);
  assert.equal(noTokenRes.status, 401);
  const noTokenBody = await noTokenRes.json() as { success: boolean; message: string };
  assert.equal(noTokenBody.success, false);

  // 2. Invalid token
  const invalidRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: "Bearer bad_token_123" },
  });
  assert.equal(invalidRes.status, 401);

  // 3. Expired token
  const expiredRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expiredRes.status, 401);

  // 4. Revoked token
  const revokedRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${revokedToken}` },
  });
  assert.equal(revokedRes.status, 403);

  // 5. IP restricted token
  const ipRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${ipRestrictedToken}` },
  });
  assert.equal(ipRes.status, 403);

  // 6. Permission denied (Exams Only partner trying to access registrations summary)
  const permRes = await fetch(`${baseUrl}/api/v1/registrations/summary`, {
    headers: { Authorization: `Bearer ${restrictedToken}` },
  });
  assert.equal(permRes.status, 403);

  // 7. Successful auth via Bearer header
  const validBearerRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(validBearerRes.status, 200);

  // 8. Successful auth via X-API-Key header
  const validKeyRes = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { "X-API-Key": validToken },
  });
  assert.equal(validKeyRes.status, 200);
});

test("GET /api/v1/exams/summary: calculates exam totals, pass rate, and fail rate with date filters", async () => {
  // All exams summary
  const res = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    data: {
      total_exams: number;
      students_taken: number;
      passed: number;
      failed: number;
      pass_rate: number;
      fail_rate: number;
    };
  };

  assert.equal(body.success, true);
  assert.equal(body.data.total_exams, 2); // 2 courses
  assert.equal(body.data.students_taken, 6); // 6 attempts total
  assert.equal(body.data.passed, 4); // 3 math + 1 cs
  assert.equal(body.data.failed, 2); // 1 math + 1 cs
  assert.equal(body.data.pass_rate, 66.67); // 4 / 6 * 100
  assert.equal(body.data.fail_rate, 33.33); // 2 / 6 * 100

  // Filter by course
  const courseFilterRes = await fetch(`${baseUrl}/api/v1/exams/summary?course_id=${courseId1}`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  const courseFilterBody = await courseFilterRes.json() as {
    data: { students_taken: number; passed: number; failed: number; pass_rate: number; fail_rate: number };
  };
  assert.equal(courseFilterBody.data.students_taken, 4);
  assert.equal(courseFilterBody.data.passed, 3);
  assert.equal(courseFilterBody.data.failed, 1);
  assert.equal(courseFilterBody.data.pass_rate, 75.0);
  assert.equal(courseFilterBody.data.fail_rate, 25.0);

  // Filter by custom date range
  const dateRangeRes = await fetch(`${baseUrl}/api/v1/exams/summary?from_date=2026-08-25&to_date=2026-08-25`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  const dateRangeBody = await dateRangeRes.json() as {
    from_date: string;
    to_date: string;
    data: { students_taken: number; passed: number; failed: number };
  };
  assert.equal(dateRangeBody.from_date, "2026-08-25");
  assert.equal(dateRangeBody.data.students_taken, 2);
  assert.equal(dateRangeBody.data.passed, 1);
  assert.equal(dateRangeBody.data.failed, 1);
});

test("GET /api/v1/exams/by-course: returns course-level breakdown and pagination", async () => {
  const res = await fetch(`${baseUrl}/api/v1/exams/by-course?per_page=1&page=1`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    data: Array<{
      course_id: string;
      course_name: string;
      exam_date: string;
      students_taken: number;
      passed: number;
      failed: number;
      pass_rate: number;
    }>;
    pagination: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };

  assert.equal(body.success, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.pagination.page, 1);
  assert.equal(body.pagination.per_page, 1);
  assert.equal(body.pagination.total, 2);
  assert.equal(body.pagination.total_pages, 2);
  assert.equal(body.pagination.has_next, true);
  assert.equal(body.pagination.has_prev, false);

  // Check page 2
  const page2Res = await fetch(`${baseUrl}/api/v1/exams/by-course?per_page=1&page=2`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  const page2Body = await page2Res.json() as { pagination: { page: number; has_next: boolean; has_prev: boolean } };
  assert.equal(page2Body.pagination.page, 2);
  assert.equal(page2Body.pagination.has_next, false);
  assert.equal(page2Body.pagination.has_prev, true);
});

test("GET /api/v1/registrations/summary: returns weekly, monthly, and yearly registrations and delta percentages", async () => {
  const res = await fetch(`${baseUrl}/api/v1/registrations/summary`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    data: {
      weekly: { current: number; previous: number; change_percentage: number };
      monthly: { current: number; previous: number; change_percentage: number };
      yearly: { current: number; previous: number; change_percentage: number };
    };
  };

  assert.equal(body.success, true);
  // Weekly: 2 in current week (Aug 25, 26), 1 in prev week (Aug 18) -> change = ((2-1)/1)*100 = 100%
  assert.equal(body.data.weekly.current, 2);
  assert.equal(body.data.weekly.previous, 1);
  assert.equal(body.data.weekly.change_percentage, 100.0);

  // Monthly: 3 in August (Aug 18, 25, 26), 1 in July (July 15) -> change = ((3-1)/1)*100 = 200%
  assert.equal(body.data.monthly.current, 3);
  assert.equal(body.data.monthly.previous, 1);
  assert.equal(body.data.monthly.change_percentage, 200.0);

  // Yearly: 4 in 2026 (July 15, Aug 18, 25, 26), 1 in 2025 (June 10) -> change = ((4-1)/1)*100 = 300%
  assert.equal(body.data.yearly.current, 4);
  assert.equal(body.data.yearly.previous, 1);
  assert.equal(body.data.yearly.change_percentage, 300.0);
});

test("GET /api/v1/dashboard/summary: returns combined dashboard metrics in one request", async () => {
  const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    data: {
      exams: { total_exams: number; students_taken: number; passed: number; failed: number };
      registrations: { weekly: object; monthly: object; yearly: object };
      top_courses: Array<{ course_id: string; course_name: string }>;
    };
  };

  assert.equal(body.success, true);
  assert.equal(body.data.exams.total_exams, 2);
  assert.equal(body.data.exams.students_taken, 6);
  assert.ok(body.data.registrations.weekly);
  assert.ok(body.data.registrations.monthly);
  assert.ok(body.data.registrations.yearly);
  assert.equal(body.data.top_courses.length, 2);
});

test("Validation & Error formatting: validates date ranges and query parameters", async () => {
  // Invalid date range (from_date > to_date)
  const invalidRangeRes = await fetch(`${baseUrl}/api/v1/exams/summary?from_date=2026-12-31&to_date=2026-01-01`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(invalidRangeRes.status, 400);
  const invalidRangeBody = await invalidRangeRes.json() as {
    success: boolean;
    message: string;
    errors: { from_date: string[] };
  };
  assert.equal(invalidRangeBody.success, false);
  assert.ok(invalidRangeBody.errors.from_date);

  // Invalid period value
  const invalidPeriodRes = await fetch(`${baseUrl}/api/v1/exams/summary?period=invalid_period`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(invalidPeriodRes.status, 400);

  // 404 Route Not Found
  const notFoundRes = await fetch(`${baseUrl}/api/v1/unknown-endpoint`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(notFoundRes.status, 404);
});

test("Audit Logging & Rate Limiting: records requests in api_logs and returns headers", async () => {
  const res = await fetch(`${baseUrl}/api/v1/exams/summary`, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(res.status, 200);

  // Check rate limit headers
  assert.ok(res.headers.get("x-ratelimit-limit"));
  assert.ok(res.headers.get("x-ratelimit-remaining"));
  assert.ok(res.headers.get("x-ratelimit-reset"));

  // Check security headers
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");

  // Give audit logger event loop tick to finish
  await new Promise((r) => setTimeout(r, 100));

  const log = db.prepare("SELECT * FROM api_logs WHERE endpoint = '/api/v1/exams/summary' ORDER BY requested_at DESC LIMIT 1").get() as {
    endpoint: string;
    method: string;
    status_code: number;
  };
  assert.ok(log);
  assert.equal(log.endpoint, "/api/v1/exams/summary");
  assert.equal(log.method, "GET");
  assert.equal(log.status_code, 200);
});
