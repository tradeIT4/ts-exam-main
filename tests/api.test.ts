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
  const exams = await examsResponse.json() as { totals: { total: number; passed: number; failed: number }; timeline: unknown[] };
  assert.deepEqual(exams.totals, { total: 2, passed: 1, failed: 1, averageScore: 62, passRate: 50 });
  assert.equal(exams.timeline.length, 1);

  const registrationsResponse = await fetch(`${baseUrl}/api/v1/reports/registrations?courseId=${courseId}&period=yearly`);
  const registrations = await registrationsResponse.json() as { total: number; timeline: unknown[] };
  assert.equal(registrations.total, 1);
  assert.equal(registrations.timeline.length, 1);
});

test("validates filters and supports a combined dashboard", async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/reports/exams?status=unknown`)).status, 400);
  const dashboard = await fetch(`${baseUrl}/api/v1/dashboard?period=daily&status=passed`);
  const body = await dashboard.json() as { exams: { totals: { total: number } }; registrations: { total: number } };
  assert.equal(body.exams.totals.total, 1);
  assert.equal(body.registrations.total, 1);
});
