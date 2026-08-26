import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";

const db = createDatabase(":memory:");
const server = createServer(createApp(db));
let baseUrl = "";
let courseId = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
});

async function post(path: string, body: object) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("creates a course, registrations, and calculated exam results", async () => {
  const courseResponse = await post("/api/v1/courses", { name: "TypeScript Basics", code: "TS101", type: "programming" });
  assert.equal(courseResponse.status, 201);
  courseId = (await courseResponse.json() as { id: string }).id;

  const registration = await post("/api/v1/registrations", {
    studentId: "S-001", studentName: "Amina Yusuf", email: "amina@example.com", courseId,
    registeredAt: "2026-08-01T09:00:00Z",
  });
  assert.equal(registration.status, 201);

  const passed = await post("/api/v1/exam-results", { studentId: "S-001", courseId, score: 82, passMark: 50, takenAt: "2026-08-20T10:00:00Z" });
  const failed = await post("/api/v1/exam-results", { studentId: "S-002", courseId, score: 42, passMark: 50, takenAt: "2026-08-21T10:00:00Z" });
  assert.equal((await passed.json() as { status: string }).status, "passed");
  assert.equal((await failed.json() as { status: string }).status, "failed");
});

test("returns filtered monthly exam and registration reports", async () => {
  const examsResponse = await fetch(`${baseUrl}/api/v1/reports/exams?courseType=programming&period=monthly`);
  const exams = await examsResponse.json() as { totals: { total: number; uniqueStudents: number; passed: number; failed: number }; timeline: unknown[] };
  assert.deepEqual(exams.totals, { total: 2, uniqueStudents: 2, passed: 1, failed: 1, averageScore: 62, passRate: 50 });
  assert.equal(exams.timeline.length, 1);

  const registrationsResponse = await fetch(`${baseUrl}/api/v1/reports/registrations?courseId=${courseId}&period=yearly`);
  const registrations = await registrationsResponse.json() as { total: number; timeline: unknown[] };
  assert.equal(registrations.total, 1);
  assert.equal(registrations.timeline.length, 1);
});

test("returns quarterly timelines and unique student counts", async () => {
  const examsResponse = await fetch(`${baseUrl}/api/v1/reports/exams?period=quarterly`);
  const exams = await examsResponse.json() as {
    totals: { total: number; uniqueStudents: number };
    byCourse: Array<{ uniqueStudents: number }>;
    timeline: Array<{ period: string; total: number; uniqueStudents: number; passed: number; failed: number }>;
  };
  assert.equal(exams.totals.total, 2);
  assert.equal(exams.totals.uniqueStudents, 2);
  assert.equal(exams.byCourse[0]?.uniqueStudents, 2);
  assert.deepEqual(exams.timeline, [{ period: "2026-Q3", total: 2, uniqueStudents: 2, passed: 1, failed: 1 }]);

  const registrationsResponse = await fetch(`${baseUrl}/api/v1/reports/registrations?period=quarterly`);
  const registrations = await registrationsResponse.json() as {
    totalRegistrations: number;
    uniqueStudents: number;
    timeline: Array<{ period: string; registrations: number; uniqueStudents: number }>;
  };
  assert.equal(registrations.totalRegistrations, 1);
  assert.equal(registrations.uniqueStudents, 1);
  assert.deepEqual(registrations.timeline, [{ period: "2026-Q3", registrations: 1, uniqueStudents: 1 }]);
});

test("validates filters and supports a combined dashboard", async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/reports/exams?status=unknown`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/v1/reports/exams?from=2026-12-31&to=2026-01-01`)).status, 400);
  const dashboard = await fetch(`${baseUrl}/api/v1/dashboard?period=daily&status=passed`);
  const body = await dashboard.json() as { exams: { totals: { total: number } }; registrations: { total: number } };
  assert.equal(body.exams.totals.total, 1);
  assert.equal(body.registrations.total, 1);
});

test("serves the admin data analytics page and its assets", async () => {
  const page = await fetch(`${baseUrl}/admin/data-analytics`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /Data Analytics/);

  const stylesheet = await fetch(`${baseUrl}/admin/data-analytics.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type") ?? "", /text\/css/);

  const script = await fetch(`${baseUrl}/admin/data-analytics.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") ?? "", /javascript/);
});
