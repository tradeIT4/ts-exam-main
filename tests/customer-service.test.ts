import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { ClientService } from "../src/services/client-service.js";

test("customer service can create and edit saved students but cannot remove them or change other resources", async () => {
  const db = createDatabase(":memory:");
  const service = new ClientService(db);
  const { apiKey } = service.createClient({ name: "Customer Service", role: "customer-service", permissions: "write:all" });
  const readOnly = service.createClient({ name: "Viewer", permissions: "read:registrations" }).apiKey;
  db.prepare("INSERT INTO courses (id,name,type,code,created_at) VALUES ('course','Test','test','TEST',?)").run(new Date().toISOString());
  const server = createServer(createApp(db));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not start");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "GET", body?: object, key = apiKey) => fetch(`${base}${path}`, {
    method, headers: { "X-API-Key": key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const body = { studentId: "S1", studentName: "Amina", email: "amina@example.com", courseId: "course" };
    const created = await request("/api/v1/registrations", "POST", body);
    assert.equal(created.status, 201);
    const student = await created.json() as { id: string; registeredAt: string };
    const path = `/api/v1/registrations/${student.id}`;
    const edited = await request(path, "PATCH", { studentName: "Amina Yusuf" });
    assert.equal(edited.status, 200);
    const updated = await edited.json() as { studentName: string; registeredAt: string };
    assert.equal(updated.studentName, "Amina Yusuf");
    assert.equal(updated.registeredAt, student.registeredAt);
    assert.equal((await request("/api/v1/registrations/missing", "PATCH", { studentName: "Missing" })).status, 404);
    assert.equal((await request(path, "DELETE")).status, 403);
    assert.equal((await request(path, "PATCH", { studentName: "Denied" }, readOnly)).status, 403);
    assert.equal((await request("/api/v1/registrations", "POST", body, readOnly)).status, 403);
    assert.equal((await request("/api/v1/courses", "POST", { name: "Denied", type: "test", code: "NO" })).status, 403);
    assert.equal((await request("/api/v1/exam-results", "POST", {})).status, 403);
    assert.equal((await request(`/api/v1/certifications/${student.id}`, "PUT", { status: "active" })).status, 403);
    assert.equal((await request("/api/v1/courses")).status, 200);
    assert.equal((await request("/api/v1/registrations")).status, 200);
    assert.equal((db.prepare("SELECT student_name FROM registrations WHERE id = ?").get(student.id))?.student_name, "Amina Yusuf");
    assert.equal((await fetch(`${base}/admin/students`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});
